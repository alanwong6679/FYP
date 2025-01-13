const express = require('express');
const app = express();
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
app.set('view engine', 'ejs');
require('dotenv').config();
app.use(express.urlencoded({ extended: true }));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
const PORT = process.env.PORT || 5000;

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

// Set up the view engine to use EJS
app.set('view engine', 'ejs');



app.use(express.json());

app.post('/fetch_schedule', async (req, res) => {
    const { currentStation, destinationStation } = req.body;

    console.log("Received request at /fetch_schedule");
    console.log("Current Station:", currentStation);
    console.log("Destination Station:", destinationStation);

    if (!currentStation || !destinationStation) {
        console.log("Missing station information");
        return res.json({ error: "Please select both a current station and a destination station.", schedules: null });
    }

    const lines = {
        "AEL": ["HOK", "KOW", "TSY", "AIR", "AWE"],
        "TCL": ["HOK", "KOW", "OLY", "NAC", "LAK", "TSY", "SUN", "TUC"],
        "TML": ["WKS", "MOS", "HEO", "TSH", "SHM", "CIO", "STW", "CKT", "TAW", "HIK", "DIH", "KAT", "SUW", "TKW", "HOM", "HUH", "ETS", "AUS", "NAC", "MEF", "TWW", "KSR", "YUL", "LOP", "TIS", "SIH", "TUM"],
        "TKL": ["NOP", "QUB", "YAT", "TIK", "TKO", "LHP", "HAH", "POA"],
        "EAL": ["ADM", "EXC", "HUH", "MKK", "KOT", "TAW", "SHT", "FOT", "RAC", "UNI", "TAP", "TWO", "FAN", "SHS", "LOW", "LMC"],
        "SIL": ["ADM", "OCP", "WCH", "LET", "SOH"],
        "TWL": ["CEN", "ADM", "TST", "JOR", "YMT", "MOK", "PRE", "SSP", "CSW", "LCK", "MEF", "LAK", "KWF", "KWH", "TWH", "TSW"],
        "ISL": ["KET", "HKU", "SYP", "SHW", "CEN", "ADM", "WAC", "CAB", "TIH", "FOH", "NOP", "QUB", "TAK", "SWH", "SKW", "HFC", "CHW"],
        "KTL": ["WHA", "HOM", "YMT", "MOK", "PRE", "SKM", "KOT", "LOF", "WTS", "DIH", "CHH", "KOB", "NTK", "KWT", "LAT", "YAT", "TIK"]
    };

    const currentLines = [];
    const destinationLines = [];

    for (const line in lines) {
        if (lines[line].includes(currentStation)) {
            currentLines.push(line);
        }
        if (lines[line].includes(destinationStation)) {
            destinationLines.push(line);
        }
    }

    const allLines = [...new Set([...currentLines, ...destinationLines])];

    if (allLines.length === 0) {
        console.log("No direct lines available");
        return res.json({ error: "No direct lines available. Please check alternative routes or transfers.", schedules: null });
    }

    try {
        const scheduleRequests = allLines.map(line =>
            axios.get(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php`, {
                params: {
                    line: line,
                    sta: currentStation,
                    lang: 'en'
                }
            })
        );

        const scheduleResponses = await Promise.all(scheduleRequests);
        const scheduleData = scheduleResponses.map(response => response.data);

        console.log("API Response Schedule Data:", JSON.stringify(scheduleData, null, 2));

        const schedules = {};
        scheduleData.forEach((data, index) => {
            const line = allLines[index];
            const stationKey = `${line}-${currentStation}`;

            if (data.data && data.data[stationKey]) {
                schedules[line] = {
                    curr_time: data.sys_time || '-',
                    sys_time: data.curr_time || '-',
                    up: data.data[stationKey].UP || [],
                    down: data.data[stationKey].DOWN || []
                };
            } else {
                schedules[line] = {
                    curr_time: '-',
                    sys_time: '-',
                    up: [],
                    down: []
                };
            }
        });

        console.log("Schedules:", schedules);

        return res.json({ error: null, schedules, currentStation, destinationStation });
    } catch (error) {
        console.error("API Request Error:", error);
        return res.json({ error: "An error occurred while fetching the schedule.", schedules: null });
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




