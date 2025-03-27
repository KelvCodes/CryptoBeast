eString()}`;
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
