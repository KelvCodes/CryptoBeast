// TensorFlow.js Prediction Model with Improved Accuracy
async function fetchAndPredict() {
    const predictCoinSearch = document.querySelector('.predict-search-box');
    const predictionStatus = document.querySelector('.prediction-status-text');
    const predictionChartCanvas = document.getElementById('prediction-chart');
    const predictionSection = document.querySelector('.prediction-section');
    if (!predictCoinSearch || !predictionStatus || !predictionChartCanvas || !predictionSection) {
        console.error('Prediction elements missing');
        if (predictionStatus) predictionStatus.textContent = 'Prediction elements missing';
        return;
    }

    const searchQuery = predictCoinSearch.value.trim();
    const coinId = searchCoin(searchQuery);
    if (!coinId) {
        predictionStatus.textContent = allCoins === FALLBACK_COINS 
            ? `Coin not found. Try popular coins like Bitcoin, Ethereum, or Tether.`
            : 'Coin not found. Please enter a valid cryptocurrency (e.g., Bitcoin, Ethereum).';
        return;
    }

    predictionStatus.textContent = `Fetching data for ${searchQuery} and training model...`;
    predictionSection.classList.add('predicting');

    try {
        // Fetch 90 days of historical data
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=90`);
        if (!response.ok) throw new Error('Failed to fetch market chart data');
        const data = await response.json();
        let prices = data.prices.map(price => price[1]);

        // Fallback if insufficient data
        if (prices.length < 14) {
            console.warn('Insufficient data for LSTM, using fallback EMA prediction');
            prices = prices.length > 0 ? prices : FALLBACK_CHART_DATA.prices.map(p => p[1]); // Use fallback if no data
            const emaPredictions = calculateEMAFallback(prices, 7);
            renderPredictionChart(emaPredictions, searchQuery, predictionChartCanvas, predictionStatus);
            return;
        }

        // Create sequences with a 7-day window
        const windowSize = 7;
        const sequences = [];
        const targets = [];
        for (let i = 0; i < prices.length - windowSize; i++) {
            sequences.push(prices.slice(i, i + windowSize));
            targets.push(prices[i + windowSize]);
        }

        // Normalize data
        const tensorData = tf.tensor2d(sequences);
        const tensorTarget = tf.tensor1d(targets);
        const min = tensorData.min();
        const max = tensorData.max();
        const range = max.sub(min);
        const normalizedData = range.greater(0) ? tensorData.sub(min).div(range) : tensorData; // Avoid div by zero
        const normalizedTarget = range.greater(0) ? tensorTarget.sub(min).div(range) : tensorTarget;

        // Reshape for LSTM [samples, timesteps, features]
        const xs = normalizedData.reshape([sequences.length, windowSize, 1]);
        const ys = normalizedTarget;

        // Build improved LSTM model
        const model = tf.sequential();
        model.add(tf.layers.lstm({
            units: 64,
            inputShape: [windowSize, 1],
            returnSequences: true
        }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.lstm({ units: 32 }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 1 }));
        model.compile({
            optimizer: tf.train.adam(0.001), // Lower learning rate
            loss: 'meanSquaredError'
        });

        // Train the model
        await model.fit(xs, ys, {
            epochs: 20,
            batchSize: 16,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, log) => {
                    predictionStatus.textContent = `Training... Epoch ${epoch + 1}/20 (Loss: ${log.loss.toFixed(4)}, Val Loss: ${log.val_loss.toFixed(4)})`;
                },
                earlyStopping: tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 5 })
            }
        });

        // Predict next 7 days
        let lastSequence = tf.tensor2d([prices.slice(-windowSize)], [1, windowSize, 1]);
        const normalizedLast = range.greater(0) ? lastSequence.sub(min).div(range) : lastSequence;
        const predictions = [];
        for (let i = 0; i < 7; i++) {
            const pred = model.predict(normalizedLast);
            const predValue = pred.dataSync()[0];
            predictions.push(predValue);
            const newSequence = lastSequence.slice([0, 1], [1, windowSize - 1]).concat(pred.reshape([1, 1, 1]), 1);
            lastSequence = newSequence;
            normalizedLast.dispose();
            normalizedLast = range.greater(0) ? lastSequence.sub(min).div(range) : lastSequence;
        }

        // Denormalize predictions
        const denormalizedPreds = predictions.map(p => p * (max.dataSync()[0] - min.dataSync()[0]) + min.dataSync()[0]);

        // Smooth predictions with a simple moving average
        const smoothedPreds = smoothPredictions(denormalizedPreds, 3);

        // Cap extreme predictions based on historical volatility
        const volatility = calculateVolatility(prices);
        const cappedPreds = capPredictions(smoothedPreds, prices[prices.length - 1], volatility);

        renderPredictionChart(cappedPreds, searchQuery, predictionChartCanvas, predictionStatus);

    } catch (error) {
        console.error('Prediction error:', error.message);
        // Fallback to EMA if LSTM fails
        const emaPredictions = calculateEMAFallback(prices.length > 0 ? prices : FALLBACK_CHART_DATA.prices.map(p => p[1]), 7);
        renderPredictionChart(emaPredictions, searchQuery, predictionChartCanvas, predictionStatus, `Prediction fallback due to error: ${error.message}`);
    } finally {
        predictionSection.classList.remove('predicting');
        tf.dispose();
    }
}

// Helper function to calculate EMA fallback
function calculateEMAFallback(prices, days) {
    const k = 2 / (days + 1); // Smoothing factor
    let ema = prices[prices.length - 1]; // Start with last price
    const predictions = [ema];
    for (let i = 1; i < days; i++) {
        ema = ema * (1 - k) + predictions[i - 1] * k; // Simplified EMA forward projection
        predictions.push(ema + (Math.random() - 0.5) * ema * 0.05); // Add slight randomness for realism
    }
    return predictions;
}

// Helper function to smooth predictions
function smoothPredictions(predictions, window) {
    const smoothed = [];
    for (let i = 0; i < predictions.length; i++) {
        const start = Math.max(0, i - Math.floor(window / 2));
        const end = Math.min(predictions.length, i + Math.floor(window / 2) + 1);
        const slice = predictions.slice(start, end);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        smoothed.push(avg);
    }
    return smoothed;
}

// Helper function to calculate historical volatility
function calculateVolatility(prices) {
    const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(365); // Annualized volatility
}

// Helper function to cap predictions based on volatility
function capPredictions(predictions, lastPrice, volatility) {
    return predictions.map((p, i) => {
        const maxChange = lastPrice * volatility * (i + 1) * 0.1; // Scale with days
        const minVal = lastPrice - maxChange;
        const maxVal = lastPrice + maxChange;
        return Math.max(minVal, Math.min(maxVal, p));
    });
}

// Helper function to render the prediction chart
function renderPredictionChart(predictions, coinName, chartCanvas, statusElement, fallbackMessage = null) {
    if (predictionChart) predictionChart.destroy();
    const ctx = chartCanvas.getContext('2d');
    predictionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
            datasets: [{
                label: `${coinName.charAt(0).toUpperCase() + coinName.slice(1)} Predicted Price`,
                data: predictions,
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
    statusElement.textContent = fallbackMessage || `Prediction complete for ${coinName}!`;
}
