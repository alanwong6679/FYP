const express = require('express');
const app = express();
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();
const path = require('path');
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
var cors = require('cors');


app.use(cors());
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


const lines = {
    "AEL": { order: ["HOK", "KOW", "TSY", "AIR", "AWE"], first: "HOK", last: "AWE" },
    "TCL": { order: ["HOK", "KOW", "OLY", "NAC", "LAK", "TSY", "SUN", "TUC"], first: "HOK", last: "TUC" },
    "TML": { order: ["WKS", "MOS", "HEO", "TSH", "SHM", "CIO", "STW", "CKT", "TAW", "HIK", "DIH", "KAT", "SUW", "TKW", "HOM", "HUH", "ETS", "AUS", "NAC", "MEF", "TWW", "KSR", "YUL", "LOP", "TIS", "SIH", "TUM"], first: "WKS", last: "TUM" },
    "TKL": { order: ["NOP", "QUB", "YAT", "TIK", "TKO", "LHP", "HAH", "POA"], first: "NOP", last: ["POA", "LOP"] },
    "EAL": { order: ["LOW", "SHS", "FAN", "TAP", "TWO", "UNI", "FOT", "SHT", "KOT", "HUH"], first: "LOW", last: "HUH"},
    "SIL": { order: ["ADM", "OCP", "WCH", "LET", "SOH"], first: "ADM", last: "SOH" },
    "TWL": { order: ["CEN", "ADM", "TST", "JOR", "YMT", "MOK", "PRE", "SSP", "CSW", "LCK", "MEF", "LAK", "KWF", "KWH", "TWH", "TSW"], first: "CEN", last: "TSW" },
    "ISL": { order: ["KET", "HKU", "SYP", "SHW", "CEN", "ADM", "WAC", "CAB", "TIH", "FOH", "NOP", "QUB", "TAK", "SWH", "SKW", "HFC", "CHW"], first: "KET", last: "CHW" },
    "KTL": { order: ["WHA", "HOM", "YMT", "MOK", "PRE", "SKM", "KOT", "LOF", "WTS", "DIH", "CHH", "KOB", "NTK", "KWT", "LAT", "YAT", "TIK"], first: "WHA", last: "TIK" }
};

const interchangeStations = {
    "ADM": ["ISL", "TWL", "SIL"],
    "NOP": ["TKL", "ISL"],
    "QUB": ["TKL", "ISL"],
    "HUH": ["TML", "EAL"],
    "MEF": ["TML", "TWL"],
    "YAT": ["KTL", "TKL"],
    "TIK": ["KTL", "TKL"],
    "KOT": ["EAL", "KTL"],
    "PRE": ["KTL", "TWL"],
    "LAK": ["TWL", "TCL"],
    "NAC": ["TCL", "TML"],
    "DIH": ["KTL", "TML"],
    "HOK": ["AEL", "TCL", "ISL", "TWL"],
    "CEN": ["ISL", "TWL", "AEL", "TCL"],
    "TSY": ["AEL", "TCL"],
    "KOW": ["AEL", "TCL"]
};

const validInterchangeStations = Object.keys(interchangeStations).filter(station => interchangeStations[station].length > 1);

// Helper function to fetch schedule data
const fetchScheduleData = async (line, station) => {
    try {
        const response = await axios.get(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php`, {
            params: {
                line: line,
                sta: station,
                lang: 'en'
            }
        });
        return { line, station, data: response.data };
    } catch (error) {
        console.error(`Error fetching schedule for ${line}-${station}:`, error.message);
        return { line, station, error: error.message };
    }
};

const processScheduleResponses = async (responses, schedules) => {
    const processedStations = new Set();

    responses.forEach(response => {
        const { line, station, data, error } = response;
        const stationKey = `${line}-${station}`;

        if (data && data.data && data.data[stationKey] && !processedStations.has(stationKey)) {
            processedStations.add(stationKey);
            schedules[line] = schedules[line] || { curr_time: '-', sys_time: '-', up: [], down: [] };
            schedules[line].curr_time = data.sys_time || '-';
            schedules[line].sys_time = data.curr_time || '-';

            const stationIndex = lines[line].order.indexOf(station);
            if (stationIndex > 0 && data.data[stationKey].UP) {
                schedules[line].up = [...new Map((data.data[stationKey].UP || []).map(item => [item.time, item])).values()].slice(0, 5);
            }
            if (stationIndex < lines[line].order.length - 1 && data.data[stationKey].DOWN) {
                schedules[line].down = [...new Map((data.data[stationKey].DOWN || []).map(item => [item.time, item])).values()].slice(0, 5);
            }
        } else {
            console.error(`No schedule data for ${station} on ${line}. Error: ${error || 'API returned no data'}`);
            schedules[line] = schedules[line] || { curr_time: '-', sys_time: '-', up: [], down: [] };
            schedules[line].message = `No schedule available for ${station} on ${line}`;
        }
    });
    return schedules;
};

const findRoutesDFS = (
    currentLine, currentStation, destinationStation, 
    currentRoute, visited, interchangeCount, routes, 
    pathStations, interchanges = [], stationsPassed = 0, 
    boardingStations = []
) => {
    if (pathStations.includes(currentStation)) return;
    const newPathStations = [...pathStations, currentStation];

    if (visited.has(`${currentLine}-${currentStation}`)) return;
    visited.add(`${currentLine}-${currentStation}`);

    const currentLineStations = lines[currentLine].order;

    if (currentLineStations.includes(destinationStation)) {
        const stationsOnCurrentLine = calculateStationsBetween(currentLine, currentStation, destinationStation);
        routes.push({
            route: [...currentRoute, currentLine],
            boardingStations: boardingStations,
            interchanges: [...interchanges, destinationStation],
            interchangeCount,
            stationsPassed: stationsPassed + stationsOnCurrentLine
        });
        return;
    }

    if (interchangeCount >= 5) return;

    for (const interchange of validInterchangeStations) {
        if (!lines[currentLine].order.includes(interchange)) continue;

        for (const nextLine of interchangeStations[interchange]) {
            if (
                nextLine !== currentLine && 
                lines[nextLine].order.includes(interchange) && 
                !currentRoute.includes(nextLine)
            ) {
                const stationsOnCurrentLine = calculateStationsBetween(currentLine, currentStation, interchange);
                findRoutesDFS(
                    nextLine, interchange, destinationStation, 
                    [...currentRoute, currentLine], new Set([...visited]), 
                    interchangeCount + 1, routes, newPathStations, 
                    [...interchanges, interchange], 
                    stationsPassed + stationsOnCurrentLine,
                    [...boardingStations, interchange]
                );
            }
        }
    }
};

const calculateRoutesDFS = (currentStation, destinationStation) => {
    let validRoutes = [];
    for (const line in lines) {
        if (lines[line].order.includes(currentStation)) {
            findRoutesDFS(line, currentStation, destinationStation, [], new Set(), 0, validRoutes, [], [], 0, [currentStation]);
        }
    }
    validRoutes.sort((a, b) => calculateTravelTime(a) - calculateTravelTime(b));
    return validRoutes.slice(0, 3);
};

app.post('/fetch_schedule', async (req, res) => {
    const { currentStation, destinationStation } = req.body;

    if (!currentStation || !destinationStation) {
        console.error("Invalid station selection: Missing currentStation or destinationStation");
        return res.json({ error: "Please select both a current station and a destination station.", schedules: null });
    }

    try {
        console.log(`Fetching schedule for ${currentStation} to ${destinationStation}`);
        const validRoutes = calculateRoutesDFS(currentStation, destinationStation);

        if (!validRoutes.length) {
            console.error("No valid routes found");
            return res.json({ error: "No valid route found.", schedules: null });
        }

        const { schedules, bestRoute, alternativeRoutes } = await fetchAndProcessSchedules(currentStation, destinationStation);
        console.log("Best Route:", bestRoute);
        console.log("Alternative Routes:", alternativeRoutes);
        console.log("Schedules:", schedules);

        return res.json({
            error: null,
            schedules,
            bestRoute,
            alternativeRoutes,
            currentStation,
            destinationStation
        });
    } catch (error) {
        console.error("Error in /fetch_schedule:", error);
        return res.json({ error: "An error occurred while fetching the schedule.", schedules: null });
    }
});

function calculateStationsBetween(line, startStation, endStation) {
    const stations = lines[line].order;
    const startIndex = stations.indexOf(startStation);
    const endIndex = stations.indexOf(endStation);

    if (startIndex === -1 || endIndex === -1) return Infinity;
    return Math.abs(endIndex - startIndex);
}

const calculateTravelTime = route => {
    const interchangePenalty = route.interchangeCount * 5;
    return route.stationsPassed + interchangePenalty;
};

const fetchAndProcessSchedules = async (currentStation, destinationStation) => {
    const validRoutes = calculateRoutesDFS(currentStation, destinationStation);

    let bestRoute = null;
    let alternativeRoutes = [];

    validRoutes.forEach(route => {
        const travelTime = calculateTravelTime(route);
        if (!bestRoute || travelTime < bestRoute.travelTime) {
            if (bestRoute) alternativeRoutes.push(bestRoute);
            bestRoute = { ...route, travelTime };
        } else {
            alternativeRoutes.push({ ...route, travelTime });
        }
    });

    if (bestRoute && bestRoute.interchangeCount === 0) {
        alternativeRoutes = [];
    } else {
        alternativeRoutes = alternativeRoutes.slice(0, 2);
    }

    const scheduleRequests = [];
    [bestRoute, ...alternativeRoutes].forEach(route => {
        route.route.forEach((line, index) => {
            scheduleRequests.push(fetchScheduleData(line, route.boardingStations[index]));
        });
    });

    const initialResponses = await Promise.all(scheduleRequests);
    const schedules = await processScheduleResponses(initialResponses, {});

    return { schedules, bestRoute, alternativeRoutes };
};
// Import
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