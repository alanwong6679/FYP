const express = require('express');
const app = express();
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();
const path = require('path');

app.set('view engine', 'html');
app.use(express.urlencoded({ extended: true }));
app.engine('html', require('ejs').renderFile);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
const PORT = process.env.PORT || 4000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('views'));

// Import coordinates
const { regionCoordinates } = require('./views/hkostation.js');
const { placeCoordinates } = require('./views/directloca.js');

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Temperature endpoint: Find nearest station and location
app.post('/get-temperature', async (req, res) => {
    const { latitude, longitude } = req.body;
    console.log(`Received request with lat: ${latitude}, lon: ${longitude}`);

    try {
        // Fetch temperature data from HKO API
        const response = await axios.get('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        console.log('Weather API response:', response.data);

        const temperatureData = response.data.temperature.data;
        if (!temperatureData || temperatureData.length === 0) {
            throw new Error('No temperature data available from API');
        }

        // Find nearest weather station (from regionCoordinates)
        let nearestStation = temperatureData[0]; // Default to first station
        let minStationDistance = Infinity;

        for (const region of temperatureData) {
            const coords = regionCoordinates[region.place];
            if (coords) {
                const distance = getDistance(latitude, longitude, coords.lat, coords.lon);
                if (distance < minStationDistance) {
                    minStationDistance = distance;
                    nearestStation = region;
                }
            }
        }

        // Find nearest direct location (from placeCoordinates)
        let nearestLocation = null;
        let minLocationDistance = Infinity;

        for (const place in placeCoordinates) {
            const coords = placeCoordinates[place];
            const distance = getDistance(latitude, longitude, coords.lat, coords.lon);
            if (distance < minLocationDistance) {
                minLocationDistance = distance;
                nearestLocation = place;
            }
        }

        // Prepare response
        const result = {
            location: nearestLocation, // Nearest direct location
            temperature: nearestStation.value, // Temperature from nearest station
            unit: nearestStation.unit
        };
        console.log('Sending response:', result);
        res.json(result);
    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        if (error.response) {
            console.error('API response error:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to fetch weather data from API' });
    }
});

// Endpoint to get list of locations for user selection
app.get('/get-locations', (req, res) => {
    const locations = Object.keys(placeCoordinates);
    res.json({ locations });
});

// Endpoint to get coordinates for a specific location
app.post('/get-coordinates', (req, res) => {
    const { location } = req.body;
    const coords = placeCoordinates[location];
    if (coords) {
        res.json({ latitude: coords.lat, longitude: coords.lon });
    } else {
        res.status(404).json({ error: 'Location not found' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});