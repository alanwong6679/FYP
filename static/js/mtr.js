// mtr.js
// Station and interchange data
const lines = {
    "AEL": { order: ["HOK", "KOW", "TSY", "AIR", "AWE"], first: "HOK", last: "AWE" },
    "TCL": { order: ["HOK", "KOW", "OLY", "NAC", "LAK", "TSY", "SUN", "TUC"], first: "HOK", last: "TUC" },
    "TML": { order: ["WKS", "MOS", "HEO", "TSH", "SHM", "CIO", "STW", "CKT", "TAW", "HIK", "DIH", "KAT", "SUW", "TKW", "HOM", "HUH", "ETS", "AUS", "NAC", "MEF", "TWW", "KSR", "YUL", "LOP", "TIS", "SIH", "TUM"], first: "WKS", last: "TUM" },
    "TKL": { order: ["NOP", "QUB", "YAT", "TIK", "TKO", "LHP", "HAH", "POA"], first: "NOP", last: ["POA", "LOP"] },
    "EAL": { order: ["LOW", "SHS", "FAN", "TAP", "TWO", "UNI", "FOT", "SHT", "KOT", "HUH"], first: "LOW", last: "HUH" },
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

const lineNames = {
    "AEL": "Airport Express Line <span style='display:inline-block;width:20px;height:10px;background:#00888A;border-radius:5px'></span>",
    "TCL": "Tung Chung Line <span style='display:inline-block;width:20px;height:10px;background:#F7943E;border-radius:5px'></span>",
    "TML": "Tuen Ma Line <span style='display:inline-block;width:20px;height:10px;background:#923011;border-radius:5px'></span>",
    "TKL": "Tseung Kwan O Line <span style='display:inline-block;width:20px;height:10px;background:#7D499D;border-radius:5px'></span>",
    "EAL": "East Rail Line <span style='display:inline-block;width:20px;height:10px;background:#53B7E8;border-radius:5px'></span>",
    "SIL": "South Island Line <span style='display:inline-block;width:20px;height:10px;background:#BAC429;border-radius:5px'></span>",
    "TWL": "Tsuen Wan Line <span style='display:inline-block;width:20px;height:10px;background:#ED1D24;border-radius:5px'></span>",
    "ISL": "Island Line <span style='display:inline-block;width:20px;height:10px;background:#007DC5;border-radius:5px'></span>",
    "KTL": "Kwun Tong Line <span style='display:inline-block;width:20px;height:10px;background:#00AB4E;border-radius:5px'></span>"
};

// Route-finding logic
function findRoutesDFS(
    currentLine, currentStation, destinationStation, 
    currentRoute, visited, interchangeCount, routes, 
    pathStations, interchanges = [], stationsPassed = 0, 
    boardingStations = []
) {
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
}

function calculateStationsBetween(line, startStation, endStation) {
    const stations = lines[line].order;
    const startIndex = stations.indexOf(startStation);
    const endIndex = stations.indexOf(endStation);

    if (startIndex === -1 || endIndex === -1) return Infinity;
    return Math.abs(endIndex - startIndex);
}

function calculateTravelTime(route) {
    const interchangePenalty = route.interchangeCount * 5;
    return route.stationsPassed + interchangePenalty;
}

function calculateRoutesDFS(currentStation, destinationStation) {
    let validRoutes = [];
    for (const line in lines) {
        if (lines[line].order.includes(currentStation)) {
            findRoutesDFS(line, currentStation, destinationStation, [], new Set(), 0, validRoutes, [], [], 0, [currentStation]);
        }
    }
    validRoutes.sort((a, b) => calculateTravelTime(a) - calculateTravelTime(b));
    return validRoutes.slice(0, 3);
}

// Schedule fetching logic
async function fetchScheduleData(line, station) {
    try {
        const response = await fetch(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${station}&lang=en`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return { line, station, data };
    } catch (error) {
        console.error(`Error fetching schedule for ${line}-${station}:`, error.message);
        return { line, station, error: error.message };
    }
}

async function processScheduleResponses(responses, schedules) {
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
}

async function fetchAndProcessSchedules(currentStation, destinationStation) {
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
}

// UI and event handling
document.addEventListener('DOMContentLoaded', () => {
    const isSchedulePage = window.location.pathname.includes('mtr_schedule.html');
    const params = new URLSearchParams(window.location.search);
    const currentStation = params.get('currentStation');
    const destinationStation = params.get('destinationStation');

    if (isSchedulePage && currentStation && destinationStation) {
        // Schedule page logic
        fetchSchedule(currentStation, destinationStation);
    } else {
        // Route planner page logic
        setupRoutePlanner();
    }

    function setupRoutePlanner() {
        document.getElementById('swapStations')?.addEventListener('click', function() {
            const currentInput = document.getElementById('currentStationInput');
            const destinationInput = document.getElementById('destinationStationInput');
            
            const tempValue = currentInput.value;
            currentInput.value = destinationInput.value;
            destinationInput.value = tempValue;
            
            const tempDataValue = currentInput.dataset.value;
            currentInput.dataset.value = destinationInput.dataset.value || '';
            destinationInput.dataset.value = tempDataValue || '';
        });

        document.getElementById('routeForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const currentStation = document.getElementById('currentStationInput').dataset.value;
            const destinationStation = document.getElementById('destinationStationInput').dataset.value;
            
            document.getElementById('route').innerHTML = '';
            
            if (currentStation && destinationStation) {
                window.location.href = `/mtr_schedule.html?currentStation=${currentStation}&destinationStation=${destinationStation}`;
            } else {
                alert("Please select both a current station and a destination station.");
            }
        });

        setupAutocomplete();
        getTemperature();
    }

    async function fetchSchedule(cs, ds) {
        try {
            const { error, schedules, bestRoute, alternativeRoutes } = await fetchAndProcessSchedules(cs, ds);
            document.getElementById('schedule').innerHTML = error ? `<div class="error">${error}</div>` : '';
            if (!error) displayRouteOptions(bestRoute, alternativeRoutes, schedules, cs, ds);
        } catch (e) {
            document.getElementById('schedule').innerHTML = '<div class="error">Fetch failed.</div>';
            console.error('Schedule error:', e);
        }
    }

    function displayRouteOptions(best, alts, schedules, cs, ds) {
        const opts = document.getElementById('route-options');
        opts.innerHTML = '';
        [[best, 'Best Route'], ...alts.map((r, i) => [r, `Alternative Route ${i + 1}`])].forEach(([r, n]) => {
            const div = document.createElement('div');
            div.className = 'route-option';
            div.innerHTML = `<strong>${n}:</strong> ${r.route.map(l => lineNames[l]).concat(r.interchanges.slice(-1).map(getStationFullName)).join(' → ')} (${r.interchangeCount} interchange${r.interchangeCount !== 1 ? 's' : ''})`;
            div.onclick = () => displaySchedule(schedules, r.route, cs, ds);
            opts.appendChild(div);
        });
    }

    function displaySchedule(data, route, cs, ds) {
        const s = document.getElementById('schedule');
        s.innerHTML = data ? `<h2>From ${getStationFullName(cs)} to ${getStationFullName(ds)}</h2>` + route.map(line => `
            <h2>${lineNames[line]}</h2>
            <div><strong>Current Time:</strong> ${data[line]?.curr_time || '-'}<br><strong>System Time:</strong> ${data[line]?.sys_time || '-'}</div>
            <h3>UP Trains</h3><table class="schedule-table"><tr><th>Time</th><th>Platform</th><th>Destination</th><th>Sequence</th><th>Valid</th></tr>${data[line]?.up?.length ? data[line].up.map(t => `<tr><td>${t.time}</td><td>${t.plat}</td><td class="dest-cell" data-dest="${t.dest}">${t.dest}</td><td>${t.seq}</td><td>${t.valid}</td></tr>`).join('') : '<tr><td colspan="5">No UP trains</td></tr>'}</table>
            <h3>DOWN Trains</h3><table class="schedule-table"><tr><th>Time</th><th>Platform</th><th>Destination</th><th>Sequence</th><th>Valid</th></tr>${data[line]?.down?.length ? data[line].down.map(t => `<tr><td>${t.time}</td><td>${t.plat}</td><td class="dest-cell" data-dest="${t.dest}">${t.dest}</td><td>${t.seq}</td><td>${t.valid}</td></tr>`).join('') : '<tr><td colspan="5">No DOWN trains</td></tr>'}</table>
        `).join('') : '<div class="error">No schedule data.</div>';
        document.querySelectorAll('.dest-cell').forEach(c => c.innerText = getStationFullName(c.dataset.dest));
    }

    function getStationFullName(code) {
        return Object.values(lines).flatMap(line => line.order).includes(code) ? code : code; // Simplified; add station names if available
    }

    async function setupAutocomplete() {
        const allStations = Object.values(lines).flatMap(line => line.order);
        const uniqueStations = [...new Set(allStations)];
        
        const inputs = [
            { input: document.getElementById('currentStationInput'), options: document.getElementById('currentStationOptions') },
            { input: document.getElementById('destinationStationInput'), options: document.getElementById('destinationStationOptions') }
        ];

        inputs.forEach(({ input, options }) => {
            if (input && options) {
                input.addEventListener('input', () => {
                    const value = input.value.toLowerCase();
                    options.innerHTML = '';
                    if (value) {
                        const filtered = uniqueStations.filter(station => station.toLowerCase().includes(value));
                        filtered.forEach(station => {
                            const div = document.createElement('div');
                            div.textContent = station;
                            div.addEventListener('click', () => {
                                input.value = station;
                                input.dataset.value = station;
                                options.style.display = 'none';
                            });
                            options.appendChild(div);
                        });
                        options.style.display = filtered.length ? 'block' : 'none';
                    } else {
                        options.style.display = 'none';
                    }
                });
                input.addEventListener('blur', () => setTimeout(() => options.style.display = 'none', 200));
                input.addEventListener('focus', () => {
                    if (input.value) options.style.display = 'block';
                });
            }
        });
    }

    function getTemperature() {
        if (!navigator.geolocation) {
            document.getElementById("temperature") && (document.getElementById("temperature").innerHTML = "Geolocation not supported by your browser.");
            return;
        }

        document.getElementById("temperature") && (document.getElementById("temperature").innerHTML = "Fetching your location...");

        navigator.geolocation.getCurrentPosition(
            showLocationAndFetchTemperature,
            showError,
            { timeout: 10000, enableHighAccuracy: true }
        );
    }

    async function showLocationAndFetchTemperature(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.log(`GPS Coordinates: Lat ${latitude}, Lon ${longitude}`);

        const tempDiv = document.getElementById("temperature");
        if (tempDiv) {
            tempDiv.innerHTML = `Your location: Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`;

            try {
                const response = await fetch('/get-temperature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude })
                });

                if (!response.ok) throw new Error("Server error");

                const data = await response.json();
                if (data.error) {
                    tempDiv.innerHTML += ` - ${data.error}`;
                } else {
                    tempDiv.innerHTML = `Location: ${data.location}, Temperature: ${data.temperature}°${data.unit}`;
                }
            } catch (error) {
                tempDiv.innerHTML += " - Error fetching temperature.";
            }
        }
    }

    function showError(error) {
        const tempDiv = document.getElementById("temperature");
        if (!tempDiv) return;

        let message;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "Location access denied.";
                break;
            case error.POSITION_UNAVAILABLE:
                message = "Location unavailable.";
                break;
            case error.TIMEOUT:
                message = "Location request timed out.";
                break;
            default:
                message = "Unknown geolocation error.";
        }
        tempDiv.innerHTML = message;
    }
});