// Configuration
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const BLOCKCHAIN_API = 'https://blockchain.info';
const ETH_GAS_API = 'https://api.etherscan.io/api';
const OPENSEA_API = 'https://api.opensea.io/api/v1';
const INFURA_URL = 'https://mainnet.infura.io/v3/0adaf070d7994db7b9dc95307cb7cb7e';
const SOLANA_API = 'https://api.mainnet-beta.solana.com';

// API Keys
const ETHERSCAN_API_KEY = 'RX3HCIK18A7XUVUSJKP7SMIAK379MDF1WZ';
const OPENSEA_API_KEY = 'YOUR_OPENSEA_API_KEY'; // Replace after approval

// ERC-20 Token Contracts
const TOKEN_CONTRACTS = {
    'usdt': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Tether
    'dai': '0x6B175474E89094C44Da98b954EedeAC495271d0F'  // DAI
};

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// Global State
let provider, signer, walletAddress;
let currentCoinData = [];
let walletConnected = false;
let predictionChart, priceChart;
let allCoins = [];

// Cache for blockchain data
const cache = {
    blockchainData: null,
    lastFetch: 0,
    cacheDuration: 5 * 60 * 1000 // 5 minutes
};

// Immediate Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const predictionStatus = document.getElementById('prediction-status');
    if (predictionStatus) {
        predictionStatus.textContent = 'Enter a crypto to predict its price!';
    }

    const path = window.location.pathname.split('/').pop();
    if (path === 'index.html' || path === '') {
        initLandingPage();
    } else if (path === 'crypto.html') {
        initCryptoPage();
    } else if (path === 'coin.html') {
        initCoinPage();
    }
});

async function initLandingPage() {
    await setupProvider();
    if (window.ethereum) await checkWalletConnection();
    // Apply dark mode state on page load
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        const toggleButton = document.querySelector('.dark-mode-toggle');
        if (toggleButton) toggleButton.textContent = '☀️';
    }
}

async function initCryptoPage() {
    await setupProvider();
    fetchCryptoData();
    fetchBlockchainData();
    fetchNFTData();
    fetchAllCoinsForSearch();
    if (window.ethereum) await checkWalletConnection();
    // Apply dark mode state on page load
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        const toggleButton = document.querySelector('.dark-mode-toggle');
        if (toggleButton) toggleButton.textContent = '☀️';
    }
}

async function initCoinPage() {
    await setupProvider();
    const coinId = new URLSearchParams(window.location.search).get('id');
    if (!coinId) {
        showError('No coin selected. Please select a coin from the dashboard.');
        return;
    }
    window.coinId = coinId;
    fetchCoinDetails(coinId);
    if (window.ethereum) await checkWalletConnection();
    // Apply dark mode state on page load
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        const toggleButton = document.querySelector('.dark-mode-toggle');
        if (toggleButton) toggleButton.textContent = '☀️';
    }
}

// Setup Provider
async function setupProvider() {
    try {
        if (typeof window.ethereum !== 'undefined') {
            provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('accountsChanged', () => checkWalletConnection());
            console.log('MetaMask provider initialized');
        } else {
            console.warn('MetaMask not detected, using Infura');
            provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
            const walletStatus = document.getElementById('wallet-status');
            if (walletStatus) walletStatus.textContent = 'Not Connected';
        }
    } catch (error) {
        console.error('Error setting up provider:', error.message);
        provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
        const walletStatus = document.getElementById('wallet-status');
        if (walletStatus) walletStatus.textContent = 'Not Connected';
        showError('Failed to initialize provider. Using Infura fallback. Install MetaMask for full functionality.');
    }
}

// Web3 Wallet Connection
async function connectWallet() {
    try {
        if (!window.ethereum) {
            showError('MetaMask is not installed. Please install MetaMask to connect your wallet.');
            const walletStatus = document.getElementById('wallet-status');
            if (walletStatus) walletStatus.textContent = 'Not Connected';
            fetchPortfolioData();
            return;
        }
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        walletConnected = true;
        const walletStatus = document.getElementById('wallet-status');
        if (walletStatus) walletStatus.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        console.log('Wallet connected:', walletAddress);
        if (window.location.pathname.includes('crypto.html')) fetchPortfolioData();
    } catch (error) {
        console.error('Wallet connection error:', error.message);
        showError(`Failed to connect wallet: ${error.code === 4001 ? 'User denied access' : error.message}`);
    }
}

async function checkWalletConnection() {
    if (window.ethereum && window.ethereum.selectedAddress) await connectWallet();
}

// Fetch Portfolio Data
async function fetchPortfolioData() {
    const portfolioData = document.getElementById('portfolio-data');
    const portfolioMessage = document.getElementById('portfolio-message');
    if (!portfolioData || !portfolioMessage) {
        console.error('Portfolio section not found');
        return;
    }

    portfolioData.innerHTML = '';
    portfolioMessage.style.display = 'block';

    try {
        if (!provider) throw new Error('Provider not initialized');
        if (walletConnected) {
            portfolioMessage.style.display = 'none';
            portfolioData.innerHTML = '<p>Loading portfolio...</p>';

            const balance = await provider.getBalance(walletAddress);
            const ethBalance = ethers.utils.formatEther(balance);
            const ethPriceResponse = await fetch(`${COINGECKO_API}/simple/price?ids=ethereum&vs_currencies=usd`);
            if (!ethPriceResponse.ok) throw new Error('Failed to fetch ETH price');
            const ethPrice = (await ethPriceResponse.json()).ethereum.usd;

            let portfolioHTML = `
                <div class="portfolio-card">
                    <span>ETH</span>
                    <strong>${parseFloat(ethBalance).toFixed(4)} ETH ($${ (ethBalance * ethPrice).toLocaleString() })</strong>
                </div>
            `;

            for (const [token, address] of Object.entries(TOKEN_CONTRACTS)) {
                const contract = new ethers.Contract(address, ERC20_ABI, provider);
                const balance = await contract.balanceOf(walletAddress);
                const decimals = await contract.decimals();
                const formattedBalance = ethers.utils.formatUnits(balance, decimals);
                if (parseFloat(formattedBalance) > 0) {
                    const tokenPriceResponse = await fetch(`${COINGECKO_API}/simple/price?ids=${token === 'usdt' ? 'tether' : token}&vs_currencies=usd`);
                    if (!tokenPriceResponse.ok) throw new Error(`Failed to fetch ${token.toUpperCase()} price`);
                    const tokenPrice = (await tokenPriceResponse.json())[token === 'usdt' ? 'tether' : token].usd;
                    portfolioHTML += `
                        <div class="portfolio-card">
                            <span>${token.toUpperCase()}</span>
                            <strong>${parseFloat(formattedBalance).toFixed(2)} ${token.toUpperCase()} ($${ (formattedBalance * tokenPrice).toLocaleString() })</strong>
                        </div>
                    `;
                }
            }
            portfolioData.innerHTML = portfolioHTML;
        }
    } catch (error) {
        console.error('Error fetching portfolio:', error.message);
        portfolioMessage.style.display = 'none';
        portfolioData.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

// Fetch Crypto Data (50 Coins)
async function fetchCryptoData() {
    const cryptoTable = document.getElementById('crypto-data');
    if (!cryptoTable) {
        console.error('Crypto table not found');
        return;
    }
    cryptoTable.innerHTML = '<tr><td colspan="7">Loading crypto data...</td></tr>';
    try {
        const response = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true`);
        if (!response.ok) throw new Error(`Failed to fetch crypto data: ${response.statusText}`);
        currentCoinData = await response.json();
        if (!currentCoinData || currentCoinData.length === 0) throw new Error('No coin data received');
        renderCryptoTable(currentCoinData);
    } catch (error) {
        console.error('Error fetching crypto data:', error.message);
        cryptoTable.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
    }
}

function renderCryptoTable(data) {
    const cryptoTable = document.getElementById('crypto-data');
    const searchInput = document.getElementById('search-crypto');
    if (!cryptoTable || !searchInput) {
        console.error('Crypto table or search input missing');
        return;
    }

    cryptoTable.innerHTML = data.map((coin, index) => `
        <tr onclick="location.href='coin.html?id=${coin.id}'">
            <td>${index + 1}</td>
            <td class="coin-name">
                <img src="${coin.image}" alt="${coin.name}" width="24">
                <span>${coin.name}</span>
                <span class="coin-symbol">${coin.symbol.toUpperCase()}</span>
            </td>
            <td class="price">$${coin.current_price.toLocaleString()}</td>
            <td class="${coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}">
                ${coin.price_change_percentage_24h.toFixed(2)}%
            </td>
            <td>$${coin.total_volume.toLocaleString()}</td>
            <td>$${coin.market_cap.toLocaleString()}</td>
            <td><canvas id="sparkline-${coin.id}" width="100" height="40"></canvas></td>
        </tr>
    `).join('');

    data.forEach(coin => {
        const ctx = document.getElementById(`sparkline-${coin.id}`);
        if (ctx) {
            new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: coin.sparkline_in_7d.price.map((_, i) => i),
                    datasets: [{
                        data: coin.sparkline_in_7d.price,
                        borderColor: coin.price_change_percentage_24h >= 0 ? '#4CAF50' : '#F44336',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } },
                    elements: { point: { radius: 0 } }
                }
            });
        }
    });

    searchInput.removeEventListener('input', handleSearch);
    searchInput.addEventListener('input', handleSearch);

    function handleSearch(e) {
        const filteredData = currentCoinData.filter(coin =>
            coin.name.toLowerCase().includes(e.target.value.toLowerCase()) ||
            coin.symbol.toLowerCase().includes(e.target.value.toLowerCase())
        );
        renderCryptoTable(filteredData);
    }
}

// Fetch Blockchain Data
async function fetchBlockchainData() {
    const blockchainStats = document.getElementById('blockchain-stats');
    if (!blockchainStats) {
        console.error('Blockchain stats not found');
        return;
    }

    const now = Date.now();
    if (cache.blockchainData && (now - cache.lastFetch) < cache.cacheDuration) {
        blockchainStats.innerHTML = cache.blockchainData;
        blockchainStats.querySelectorAll('.blockchain-stat').forEach(stat => stat.classList.remove('loading'));
        return;
    }

    let latestBlock = 'N/A';
    let gasPrice = 'N/A';
    let activeAddresses = 'N/A';

    try {
        try {
            const btcResponse = await fetch(`${BLOCKCHAIN_API}/latestblock`);
            if (btcResponse.ok) {
                const btcData = await btcResponse.json();
                latestBlock = btcData.height || 'N/A';
            } else {
                latestBlock = '850123';
            }
        } catch (error) {
            console.error('Error fetching BTC block:', error.message);
            latestBlock = '850123';
        }

        try {
            const ethGasResponse = await fetch(`${ETH_GAS_API}?module=gastracker&action=gasoracle&apikey=${ETHERSCAN_API_KEY}`);
            if (ethGasResponse.ok) {
                const ethGasData = await ethGasResponse.json();
                gasPrice = ethGasData.result.ProposeGasPrice || 'N/A';
            } else {
                gasPrice = '20';
            }
        } catch (error) {
            console.error('Error fetching ETH gas:', error.message);
            gasPrice = '20';
        }

        try {
            const activeAddressesResponse = await fetch(`${ETH_GAS_API}?module=stats&action=dailyactiveaddresses&apikey=${ETHERSCAN_API_KEY}`);
            if (activeAddressesResponse.ok) {
                const activeAddressesData = await activeAddressesResponse.json();
                activeAddresses = activeAddressesData.result[0]?.value || 'N/A';
            } else {
                activeAddresses = '500,000';
            }
        } catch (error) {
            console.error('Error fetching active addresses:', error.message);
            activeAddresses = '500,000';
        }

        const html = `
            <div class="blockchain-stat">
                <h3><i class="fas fa-cube"></i> Latest BTC Block</h3>
                <p>${latestBlock}</p>
            </div>
            <div class="blockchain-stat">
                <h3><i class="fas fa-gas-pump"></i> ETH Gas Price</h3>
                <p>${gasPrice} Gwei</p>
            </div>
            <div class="blockchain-stat">
                <h3><i class="fas fa-users"></i> Active Addresses (ETH)</h3>
                <p>${activeAddresses}</p>
            </div>
        `;
        blockchainStats.innerHTML = html;
        blockchainStats.querySelectorAll('.blockchain-stat').forEach(stat => stat.classList.remove('loading'));

        cache.blockchainData = html;
        cache.lastFetch = now;
    } catch (error) {
        console.error('Error fetching blockchain data:', error.message);
        blockchainStats.innerHTML = `
            <div class="blockchain-stat">
                <h3><i class="fas fa-cube"></i> Latest BTC Block</h3>
                <p>850123</p>
            </div>
            <div class="blockchain-stat">
                <h3><i class="fas fa-gas-pump"></i> ETH Gas Price</h3>
                <p>20 Gwei</p>
            </div>
            <div class="blockchain-stat">
                <h3><i class="fas fa-users"></i> Active Addresses (ETH)</h3>
                <p>500,000</p>
            </div>
        `;
        blockchainStats.querySelectorAll('.blockchain-stat').forEach(stat => stat.classList.remove('loading'));
        showError('Failed to fetch blockchain insights. Using fallback data.');
    }
}

// Fetch NFT Data
async function fetchNFTData() {
    const nftData = document.getElementById('nft-data');
    if (!nftData) {
        console.error('NFT data section not found');
        return;
    }
    try {
        const response = await fetch(`${OPENSEA_API}/collections?limit=3`, {
            headers: { 'X-API-KEY': OPENSEA_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to fetch NFT data');
        const nfts = await response.json();
        nftData.innerHTML = nfts.collections.map(nft => `
            <div class="nft-card">
                <img src="${nft.image_url || 'https://via.placeholder.com/100'}" alt="${nft.name}" style="width: 100px;">
                <h3>${nft.name}</h3>
                <p>Floor: ${nft.stats.floor_price || 'N/A'} ETH</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error fetching NFT data:', error.message);
        nftData.innerHTML = `<p>Error: ${error.message} (Awaiting OpenSea API key?)</p>`;
    }
}

// Fetch All Coins for Search
async function fetchAllCoinsForSearch() {
    try {
        const response = await fetch(`${COINGECKO_API}/coins/list`);
        if (!response.ok) throw new Error('Failed to fetch coin list');
        allCoins = await response.json();
        console.log('Fetched coin list for search:', allCoins.length, 'coins');
    } catch (error) {
        console.error('Error fetching coin list for search:', error.message);
        showError('Failed to load coin list for search. AI prediction may not work.');
    }
}

// Search for a Coin by Name
function searchCoin(query) {
    if (!query || query.trim() === '') return null;
    const searchTerm = query.trim().toLowerCase();
    const coin = allCoins.find(c => 
        c.name.toLowerCase() === searchTerm || 
        c.symbol.toLowerCase() === searchTerm
    );
    return coin ? coin.id : null;
}

// TensorFlow.js Prediction Model
async function fetchAndPredict() {
    const predictCoinSearch = document.getElementById('predict-coin-search');
    const predictionStatus = document.getElementById('prediction-status');
    const predictionChartCanvas = document.getElementById('prediction-chart');
    const predictionSection = document.querySelector('.prediction-section');
    if (!predictCoinSearch || !predictionStatus || !predictionChartCanvas || !predictionSection) {
        console.error('Prediction elements missing');
        if (predictionStatus) predictionStatus.textContent = 'Prediction elements missing';
        return;
    }

    const searchQuery = predictCoinSearch.value;
    const coinId = searchCoin(searchQuery);
    if (!coinId) {
        predictionStatus.textContent = 'Coin not found. Please enter a valid cryptocurrency (e.g., Bitcoin, Ethereum).';
        return;
    }

    predictionStatus.textContent = `Fetching data for ${searchQuery} and training model...`;
    predictionSection.classList.add('predicting');

    try {
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=90`);
        if (!response.ok) throw new Error('Failed to fetch market chart data');
        const data = await response.json();
        const prices = data.prices.map(price => price[1]);

        if (prices.length < 8) throw new Error('Insufficient data for prediction');

        const trainSize = prices.length - 7;
        const tensorData = tf.tensor2d(prices.slice(0, trainSize), [trainSize, 1]);
        const tensorTarget = tf.tensor2d(prices.slice(7, trainSize + 7), [trainSize, 1]);

        const min = tensorData.min();
        const max = tensorData.max();
        const normalizedData = tensorData.sub(min).div(max.sub(min));
        const normalizedTarget = tensorTarget.sub(min).div(max.sub(min));

        const model = tf.sequential();
        model.add(tf.layers.lstm({
            units: 50,
            inputShape: [1, 1],
            returnSequences: false
        }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

        const xs = normalizedData.reshape([trainSize, 1, 1]);
        const ys = normalizedTarget;

        await model.fit(xs, ys, {
            epochs: 10,
            batchSize: 32,
            callbacks: {
                onEpochEnd: (epoch, log) => {
                    predictionStatus.textContent = `Training... Epoch ${epoch + 1}/10 (Loss: ${log.loss.toFixed(4)})`;
                }
            }
        });

        const lastIndex = trainSize - 1;
        let lastValue = normalizedData.slice([lastIndex, 0], [1, 1]).reshape([1, 1, 1]);
        const predictions = [];
        for (let i = 0; i < 7; i++) {
            const pred = model.predict(lastValue);
            predictions.push(pred.dataSync()[0]);
            lastValue = pred.reshape([1, 1, 1]);
        }

        const denormalizedPreds = predictions.map(p => p * (max.dataSync()[0] - min.dataSync()[0]) + min.dataSync()[0]);

        if (predictionChart) predictionChart.destroy();
        const ctx = predictionChartCanvas.getContext('2d');
        predictionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
                datasets: [{
                    label: `${searchQuery.charAt(0).toUpperCase() + searchQuery.slice(1)} Predicted Price`,
                    data: denormalizedPreds,
                    borderColor: '#FF2E63',
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                scales: {
                    y: { title: { display: true, text: 'Price (USD)' } },
                    x: { title: { display: true, text: 'Days' } }
                }
            }
        });

        predictionStatus.textContent = `Prediction complete for ${searchQuery}!`;
    } catch (error) {
        console.error('Prediction error:', error.message);
        predictionStatus.textContent = `Prediction failed: ${error.message}`;
    } finally {
        predictionSection.classList.remove('predicting');
        tf.dispose();
    }
}

// Fetch Coin Details (coin.html) - Updated with Better Error Handling
async function fetchCoinDetails(coinId) {
    const elements = {
        coinHeader: document.getElementById('coin-header'),
        coinImg: document.getElementById('coin-img'),
        coinName: document.getElementById('coin-name'),
        coinSymbol: document.getElementById('coin-symbol'),
        coinPrice: document.getElementById('coin-price'),
        priceChange: document.getElementById('price-change'),
        coinMarketcap: document.getElementById('coin-marketcap'),
        coinVolume: document.getElementById('coin-volume'),
        coinSupply: document.getElementById('coin-supply'),
        coinAth: document.getElementById('coin-ath')
    };

    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Element with ID '${key}' not found in coin.html`);
            showError(`Page error: Missing element '${key}'. Please check the page structure.`);
            return;
        }
    }

    try {
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
        if (!response.ok) {
            throw new Error(`Failed to fetch coin data: ${response.statusText} (Status: ${response.status})`);
        }
        const coin = await response.json();

        elements.coinHeader.textContent = `${coin.name || 'Unknown Coin'} Details`;
        elements.coinImg.src = coin.image?.large || 'https://via.placeholder.com/50';
        elements.coinImg.alt = `${coin.name || 'Coin'} Logo`;
        elements.coinName.textContent = coin.name || 'N/A';
        elements.coinSymbol.textContent = coin.symbol ? coin.symbol.toUpperCase() : 'N/A';

        const price = coin.market_data?.current_price?.usd || 0;
        const priceChange24h = coin.market_data?.price_change_percentage_24h || 0;
        elements.coinPrice.textContent = `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        elements.priceChange.textContent = `${priceChange24h.toFixed(2)}%`;
        elements.priceChange.className = `change-display ${priceChange24h >= 0 ? 'positive' : 'negative'}`;

        elements.coinMarketcap.textContent = coin.market_data?.market_cap?.usd ? `$${coin.market_data.market_cap.usd.toLocaleString()}` : 'N/A';
        elements.coinVolume.textContent = coin.market_data?.total_volume?.usd ? `$${coin.market_data.total_volume.usd.toLocaleString()}` : 'N/A';
        elements.coinSupply.textContent = coin.market_data?.circulating_supply ? `${coin.market_data.circulating_supply.toLocaleString()} ${coin.symbol?.toUpperCase() || ''}` : 'N/A';
        elements.coinAth.textContent = coin.market_data?.ath?.usd ? `$${coin.market_data.ath.usd.toLocaleString()}` : 'N/A';

        fetchChartData(coinId, 30);
    } catch (error) {
        console.error('Error fetching coin details:', error.message);
        showError(`Failed to load coin details: ${error.message}. Using fallback data.`);

        // Fallback data
        elements.coinHeader.textContent = 'Coin Details Unavailable';
        elements.coinImg.src = 'https://via.placeholder.com/50';
        elements.coinImg.alt = 'Coin Logo';
        elements.coinName.textContent = coinId.charAt(0).toUpperCase() + coinId.slice(1);
        elements.coinSymbol.textContent = 'N/A';
        elements.coinPrice.textContent = '$0.00';
        elements.priceChange.textContent = '0.00%';
        elements.priceChange.className = 'change-display';
        elements.coinMarketcap.textContent = 'N/A';
        elements.coinVolume.textContent = 'N/A';
        elements.coinSupply.textContent = 'N/A';
        elements.coinAth.textContent = 'N/A';
    }
}

// Fetch Chart Data (coin.html)
async function fetchChartData(coinId, days) {
    const chartCanvas = document.getElementById('price-chart');
    if (!chartCanvas) {
        console.error('Price chart canvas not found in coin.html');
        showError('Failed to load price chart: Chart element missing.');
        return;
    }

    try {
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
        if (!response.ok) throw new Error(`Failed to fetch chart data: ${response.statusText}`);
        const data = await response.json();

        if (!data.prices || data.prices.length === 0) throw new Error('No price data available');

        if (priceChart) priceChart.destroy();
        const ctx = chartCanvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context for chart canvas');

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.prices.map(price => new Date(price[0]).toLocaleDateString()),
                datasets: [{
                    label: 'Price (USD)',
                    data: data.prices.map(price => price[1]),
                    borderColor: '#FF2E63',
                    backgroundColor: 'rgba(255, 46, 99, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        title: { display: true, text: 'Price (USD)' },
                        ticks: { maxTicksLimit: 8 }
                    },
                    x: { 
                        ticks: { 
                            maxTicksLimit: 10,
                            autoSkip: true,
                            maxRotation: 0,
                            minRotation: 0
                        }
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching chart data:', error.message);
        showError(`Failed to load price chart: ${error.message}`);
        chartCanvas.parentElement.innerHTML += '<p class="error-text">Unable to load chart data.</p>';
    }
}

// Dark Mode Toggle - Updated to Switch Icons
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    // Update the toggle button icon
    const toggleButton = document.querySelector('.dark-mode-toggle');
    if (toggleButton) {
        toggleButton.textContent = isDarkMode ? '☀️' : '🌙';
    }
}

// Error Handling
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    document.body.appendChild(errorElement);
    setTimeout(() => errorElement.remove(), 5000);
}
