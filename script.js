// Configuration
const API_BASE = 'https://api.coingecko.com/api/v3';
const BLOCKCHAIN_API = 'https://blockchain.info';
const ETH_GAS_API = 'https://api.etherscan.io/api';

// Global State
let currentCoinData = [];
let walletConnected = false;

// DOM Elements
const cryptoTable = document.getElementById('crypto-data');
const searchInput = document.getElementById('search-crypto');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check which page we're on
    if (document.getElementById('crypto-data')) {
        fetchCryptoData();
        fetchBlockchainData();
        setupWebSocket();
    }
    
    if (document.getElementById('coin-name')) {
        fetchCoinDetails();
    }
    
    // Initialize dark mode
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
    }
    
    // Check if wallet is already connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }
});

// Fetch Top Cryptocurrencies
async function fetchCryptoData() {
    try {
        const response = await fetch(`${API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`);
        const data = await response.json();
        currentCoinData = data;
        renderCryptoTable(data);
    } catch (error) {
        console.error('Error fetching crypto data:', error);
        showError('Failed to load cryptocurrency data. Please try again later.');
    }
}

// Render Crypto Table
function renderCryptoTable(data) {
    if (!cryptoTable) return;
    
    cryptoTable.innerHTML = data.map((coin, index) => `
        <tr onclick="viewCoin('${coin.id}')" data-coin="${coin.id}">
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
            <td>
                <canvas id="sparkline-${coin.id}" width="100" height="40"></canvas>
            </td>
        </tr>
    `).join('');
    
    // Render sparklines
    data.forEach(coin => {
        const ctx = document.getElementById(`sparkline-${coin.id}`).getContext('2d');
        new Chart(ctx, {
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
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { display: false } },
                elements: { point: { radius: 0 } }
            }
        });
    });
    
    // Add search functionality
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentCoinData.filter(coin => 
                coin.name.toLowerCase().includes(searchTerm) || 
                coin.symbol.toLowerCase().includes(searchTerm)
            );
            renderCryptoTable(filteredData);
        });
    }
}

// View Coin Details
function viewCoin(coinId) {
    window.location.href = `coin.html?id=${coinId}`;
}

// Fetch Coin Details
async function fetchCoinDetails() {
    const coinId = new URLSearchParams(window.location.search).get('id');
    if (!coinId) return;
    
    try {
        // Basic coin data
        const coinResponse = await fetch(`${API_BASE}/coins/${coinId}`);
        const coin = await coinResponse.json();
        
        // Market data
        const marketResponse = await fetch(`${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=30`);
        const marketData = await marketResponse.json();
        
        // Render coin details
        renderCoinDetails(coin, marketData);
        
        // Fetch blockchain data for this coin
        fetchCoinBlockchainData(coinId);
    } catch (error) {
        console.error('Error fetching coin details:', error);
        showError('Failed to load coin details. Please try again later.');
    }
}

// Render Coin Details
function renderCoinDetails(coin, marketData) {
    document.title = `${coin.name} (${coin.symbol.toUpperCase()}) | Crypto Tracker Pro`;
    document.getElementById('coin-header').textContent = `${coin.name} Analytics`;
    
    const priceChange24h = coin.market_data.price_change_percentage_24h;
    const priceChangeClass = priceChange24h >= 0 ? 'positive' : 'negative';
    
    // Basic info
    document.getElementById('coin-img').src = coin.image.large;
    document.getElementById('coin-name').textContent = coin.name;
    document.getElementById('coin-symbol').textContent = coin.symbol.toUpperCase();
    
    // Price info
    document.getElementById('coin-price').textContent = 
        `$${coin.market_data.current_price.usd.toLocaleString()}`;
    
    const priceChangeElement = document.getElementById('price-change');
    priceChangeElement.textContent = `${priceChange24h.toFixed(2)}%`;
    priceChangeElement.className = `change-display ${priceChangeClass}`;
    
    // Stats
    document.getElementById('coin-marketcap').textContent = 
        `$${coin.market_data.market_cap.usd.toLocaleString()}`;
    document.getElementById('coin-volume').textContent = 
        `$${coin.market_data.total_volume.usd.toLocaleString()}`;
    document.getElementById('coin-supply').textContent = 
        `${coin.market_data.circulating_supply.toLocaleString()} ${coin.symbol.toUpperCase()}`;
    document.getElementById('coin-ath').textContent = 
        `$${coin.market_data.ath.usd.toLocaleString()}`;
    
    // Chart
    fetchChartData(coin.id, 30);
}

// Fetch Blockchain Data
async function fetchBlockchainData() {
    try {
        // Bitcoin latest block
        const btcResponse = await fetch(`${BLOCKCHAIN_API}/q/latesthash`);
        const latestHash = await btcResponse.text();
        
        // Ethereum gas prices
        const ethGasResponse = await fetch(`${ETH_GAS_API}?module=gastracker&action=gasoracle`);
        const ethGasData = await ethGasResponse.json();
        
        // Update UI
        if (document.getElementById('latest-block')) {
            document.getElementById('latest-block').textContent = `${latestHash.slice(0, 6)}...${latestHash.slice(-4)}`;
        }
        
        if (document.getElementById('eth-gas')) {
            document.getElementById('eth-gas').textContent = `${ethGasData.result.ProposeGasPrice} Gwei`;
        }
    } catch (error) {
        console.error('Error fetching blockchain data:', error);
    }
}

// Coin-specific Blockchain Data
async function fetchCoinBlockchainData(coinId) {
    try {
        let data;
        
        if (coinId === 'bitcoin') {
            const response = await fetch(`${BLOCKCHAIN_API}/stats`);
            data = await response.json();
            
            document.getElementById('on-chain-metrics').innerHTML = `
                <div class="metric">
                    <span>Network Hashrate</span>
                    <strong>${(data.hash_rate / 1e9).toFixed(2)} EH/s</strong>
                </div>
                <div class="metric">
                    <span>Mempool Size</span>
                    <strong>${data.btc_mempool_size.toLocaleString()} TX</strong>
                </div>
                <div class="metric">
                    <span>Nodes</span>
                    <strong>${data.btc_nodes.toLocaleString()}</strong>
                </div>
            `;
        } else if (coinId === 'ethereum') {
            const response = await fetch('https://api.etherscan.io/api?module=stats&action=ethsupply');
            const ethData = await response.json();
            
            document.getElementById('on-chain-metrics').innerHTML = `
                <div class="metric">
                    <span>Total Supply</span>
                    <strong>${(parseInt(ethData.result) / 1e18).toFixed(2)} ETH</strong>
                </div>
                <div class="metric">
                    <span>Daily Transactions</span>
                    <strong>Loading...</strong>
                </div>
                <div class="metric">
                    <span>Active Addresses</span>
                    <strong>Loading...</strong>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching coin blockchain data:', error);
    }
}

// WebSocket for Real-time Updates
function setupWebSocket() {
    const socket = new WebSocket('wss://ws.coincap.io/prices?assets=ALL');
    
    socket.onmessage = function (msg) {
        const data = JSON.parse(msg.data);
        
        Object.entries(data).forEach(([coinId, price]) => {
            const priceElement = document.querySelector(`[data-coin="${coinId}"] .price`);
            if (priceElement) {
                const currentPrice = parseFloat(priceElement.textContent.replace('$', '').replace(',', ''));
                const newPrice = parseFloat(price);
                
                // Skip if price hasn't changed
                if (currentPrice === newPrice) return;
                
                // Add animation class
                priceElement.classList.remove('price-up', 'price-down');
                priceElement.classList.add(newPrice > currentPrice ? 'price-up' : 'price-down');
                
                // Update price
                priceElement.textContent = `$${newPrice.toLocaleString()}`;
            }
        });
    };
    
    socket.onclose = function () {
        // Reconnect after 5 seconds if connection drops
        setTimeout(setupWebSocket, 5000);
    };
}

// Wallet Connection
async function connectWallet() {
    if (!window.ethereum) {
        showError('Please install MetaMask or another Ethereum wallet');
        return;
    }
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletConnected = true;
        
        // Display wallet info
        displayWalletInfo(accounts[0]);
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', (newAccounts) => {
            if (newAccounts.length === 0) {
                // Wallet disconnected
                walletConnected = false;
                document.getElementById('wallet-info').remove();
            } else {
                // Account changed
                displayWalletInfo(newAccounts[0]);
            }
        });
    } catch (error) {
        console.error('Error connecting wallet:', error);
        showError('Failed to connect wallet');
    }
}

// Display Wallet Info
function displayWalletInfo(address) {
    // Remove existing wallet info if any
    const existingInfo = document.getElementById('wallet-info');
    if (existingInfo) existingInfo.remove();
    
    // Create wallet info element
    const walletInfo = document.createElement('div');
    walletInfo.id = 'wallet-info';
    walletInfo.className = 'wallet-info';
    walletInfo.innerHTML = `
        <span>🦊 ${address.slice(0, 6)}...${address.slice(-4)}</span>
        <button onclick="disconnectWallet()">Disconnect</button>
    `;
    
    // Add to header
    const header = document.querySelector('header');
    if (header) {
        header.appendChild(walletInfo);
    }
}

// Disconnect Wallet
function disconnectWallet() {
    walletConnected = false;
    const walletInfo = document.getElementById('wallet-info');
    if (walletInfo) walletInfo.remove();
}

// Dark Mode Toggle
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    
    // Save preference
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('darkMode', 'enabled');
    } else {
        localStorage.setItem('darkMode', 'disabled');
    }
}

// Error Handling
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    document.body.appendChild(errorElement);
    
    // Remove after 5 seconds
    setTimeout(() => {
        errorElement.remove();
    }, 5000);
}

// Export functions to window
window.viewCoin = viewCoin;
window.connectWallet = connectWallet;
window.toggleDarkMode = toggleDarkMode;
