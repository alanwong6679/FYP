const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());  // Add this to parse JSON data
app.use(express.static('views'));

// Load API configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'api_config.json')));

// Extract API URLs
const apiUrls = Object.fromEntries(config.apis.map(api => [api.name, api.url]));

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// MTR Schedule route
app.post('/mtr_schedule', async (req, res) => {
    const { line, station } = req.body;

    console.log("Line:", line);
    console.log("Station:", station);

    if (!line || !station) {
        return res.render('mtr_schedule', { error: "Please select both a line and a station.", stations: null, line: null, station: null });
    }

    const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${station}&lang=en`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        console.log("API Response:", data);

        if (!data.status) {
            return res.render('mtr_schedule', { error: "Unexpected response format from the API.", stations: null, line: null, station: null });
        }

        if (data.status === 0) {
            return res.render('mtr_schedule', { error: data.message || 'An error occurred.', stations: null, line: null, station: null });
        }

        if (data.status === 1) {
            const scheduleData = data.data[`${line}-${station}`];
            if (!scheduleData) {
                return res.render('mtr_schedule', { error: "No schedule data available for the selected line and station.", stations: null, line: null, station: null });
            }

            const stations = {
                curr_time: scheduleData.curr_time || '-',
                sys_time: scheduleData.sys_time || '-',
                up: [],
                down: []
            };

            console.log("Schedule Data:", scheduleData);

            // Process UP trains
            for (const train of (scheduleData.UP || [])) {
                stations.up.push({
                    time: train.time,
                    plat: train.plat,
                    dest: train.dest,
                    seq: train.seq,
                    valid: train.valid
                });
            }

            // Process DOWN trains
            for (const train of (scheduleData.DOWN || [])) {
                stations.down.push({
                    time: train.time,
                    plat: train.plat,
                    dest: train.dest,
                    seq: train.seq,
                    valid: train.valid
                });
            }

            console.log("Stations Data:", stations);

            return res.render('mtr_schedule', { error: null, stations, line, station });
        }
    } catch (error) {
        console.error("API Request Error:", error);
        return res.render('mtr_schedule', { error: "An error occurred while fetching the schedule.", stations: null, line: null, station: null });
    }
});


// Bus Schedule route
app.post('/bus_schedule', async (req, res) => {
    const { start_stop, end_stop } = req.body;

/*     if (!start_stop || !end_stop) {
        return res.send({ error: "Please enter both bus stops." });
    }
 */
    const startCoords = await getCoordinates(start_stop);
    const endCoords = await getCoordinates(end_stop);

    if (!startCoords || !endCoords) {
        return res.send({ error: "One or both bus stops not found." });
    }

    const route = await getRoute(startCoords, endCoords);
    return res.send({ route, start_stop, end_stop });
});

// Function to get coordinates for a given bus stop
async function getCoordinates(busStopName) {
    try {
        const response = await axios.get(apiUrls['KMB Stop List']);
        const busStops = response.data.data;

        for (const stop of busStops) {
            if (stop.name_en.toLowerCase() === busStopName.toLowerCase()) {
                return [parseFloat(stop.long), parseFloat(stop.lat)];
            }
        }
    } catch (error) {
        console.error("Error fetching bus stops:", error);
    }
    return null;
}

// Function to get route data from OpenRouteService
async function getRoute(startCoords, endCoords) {
    const url = "https://api.openrouteservice.org/v2/directions/driving-car";
    const headers = {
        'Authorization': process.env.ORS_API_KEY,
        'Content-Type': 'application/json'
    };
    const body = {
        "start": startCoords,
        "end": endCoords
    };

    try {
        const response = await axios.post(url, body, { headers });
        return response.data;
    } catch (error) {
        console.error("Error fetching route:", error);
    }
    return null;
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});