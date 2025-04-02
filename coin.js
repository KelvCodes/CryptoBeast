const urlParams = new URLSearchParams(window.location.search);
const coinId = urlParams.get("id");
const apiURL = `https://api.coingecko.com/api/v3/coins/${coinId}`;

async function fetchCoinData() {
    const response = await fetch(apiURL);
    const coin = await response.json();
    document.getElementById("coin-name").textContent = coin.name;
    document.getElementById("coin-info").textContent = `Current Price: $${coin.market_data.current_price.usd}`;
    
    // Fetch and display price trend
    fetchChartData(coinId);
}

fetchCoinData();
