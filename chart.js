let coinChart;

async function fetchChartData(coinId = 'bitcoin', days = 30) {
    try {
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
        const data = await response.json();
        
        renderChart(data.prices, coinId, days);
    } catch (error) {
        console.error('Error fetching chart data:', error);
    }
}

function renderChart(prices, coinId, days) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    // Format data
    const labels = prices.map(price => {
        const date = new Date(price[0]);
        return days <= 1 ? date.toLocaleTimeString() : date.toLocaleDateString();
    });
    
    const data = prices.map(price => price[1]);
    
    // Calculate gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 46, 99, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 46, 99, 0)');
    
    // Destroy previous chart if exists
    if (coinChart) {
        coinChart.destroy();
    }
    
    // Create new chart
    coinChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: data,
                borderColor: '#ff2e63',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `$${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        maxTicksLimit: 8,
                        autoSkip: true
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return `$${value.toLocaleString()}`;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Initialize chart if on coin page
if (document.getElementById('priceChart')) {
    const coinId = new URLSearchParams(window.location.search).get('id');
    fetchChartData(coinId, 30);
}
