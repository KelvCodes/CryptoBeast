const ctx = document.getElementById("priceChart").getContext("2d");
let chart;

async function fetchChartData() {
    const response = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7");
    const data = await response.json();
    const labels = data.prices.map(entry => new Date(entry[0]).toLocaleDateString());
    const prices = data.prices.map(entry => entry[1]);

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Bitcoin Price (USD)",
                data: prices,
                borderColor: "yellow",
                fill: false
            }]
        }
    });
}

fetchChartData();