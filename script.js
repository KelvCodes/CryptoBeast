const apiURL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false';

// Fetch and Display Crypto Prices
async function fetchCryptoData() {
    try {
        const response = await fetch(apiURL);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Crypto Data:", data); // Debugging: Check if data is received

        const cryptoTable = document.getElementById('crypto-data');
        if (!cryptoTable) {
            console.error("Element with ID 'crypto-data' not found!");
            return;
        }

        cryptoTable.innerHTML = '';  // Clear previous entries

        data.forEach((coin, index) => {
            let row = `
                <tr onclick="viewCoin('${coin.id}')">
                    <td>${index + 1}</td>
                    <td><img src="${coin.image}" width="25"> ${coin.name}</td>
                    <td>$${coin.current_price.toLocaleString()}</td>
                    <td style="color: ${coin.price_change_percentage_24h > 0 ? 'green' : 'red'};">
                        ${coin.price_change_percentage_24h.toFixed(2)}%
                    </td>
                    <td>$${coin.market_cap.toLocaleString()}</td>
                </tr>`;
            cryptoTable.innerHTML += row;
        });
    } catch (error) {
        console.error('Error fetching crypto data:', error);
    }
}

// View Coin Details
function viewCoin(coinId) {
    localStorage.setItem('coinId', coinId);
    window.location.href = 'coin.html';
}

// Fetch Coin Details
async function fetchCoinDetails() {
    const coinId = localStorage.getItem('coinId');
    if (!coinId) {
        console.error("No coin ID found in localStorage!");
        return;
    }

    try {
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const coin = await response.json();
        console.log("Coin Data:", coin); // Debugging: Check coin data

        document.getElementById('coin-img').src = coin.image.large;
        document.getElementById('coin-name').textContent = coin.name;
        document.getElementById('coin-symbol').textContent = coin.symbol.toUpperCase();
        document.getElementById('coin-price').textContent = coin.market_data.current_price.usd.toLocaleString();
        document.getElementById('coin-marketcap').textContent = coin.market_data.market_cap.usd.toLocaleString();
        document.getElementById('coin-change').textContent = coin.market_data.price_change_percentage_24h.toFixed(2);
    } catch (error) {
        console.error('Error fetching coin details:', error);
    }
}

// Dark Mode Toggle
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}

// Run functions on page load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('crypto-data')) {
        fetchCryptoData();
    }
    if (document.getElementById('coin-name')) {
        fetchCoinDetails();
    }
});