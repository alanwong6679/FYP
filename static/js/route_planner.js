// Memoization cache for Haversine distance calculations
const distanceCache = new Map();

// Haversine formula to calculate distance between two points (optimized with memoization)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const key = `${lat1},${lon1},${lat2},${lon2}`;
    if (distanceCache.has(key)) return distanceCache.get(key);

    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const result = R * c;
    distanceCache.set(key, result);
    return result;
}

// Train line definitions
const trainLines = [
    { fullName: "Airport Express Line (AEL)", lineId: "AEL", stationId: "HOK", colorClass: "color-ael" },
    { fullName: "Tung Chung Line (TCL)", lineId: "TCL", stationId: "HOK", colorClass: "color-tcl" },
    { fullName: "Tuen Ma Line (TML)", lineId: "TML", stationId: "WKS", colorClass: "color-tml" },
    { fullName: "Tseung Kwan O Line (TKL)", lineId: "TKL", stationId: "NOP", colorClass: "color-tkl" },
    { fullName: "East Rail Line (EAL)", lineId: "EAL", stationId: "LOW", colorClass: "color-eal" },
    { fullName: "South Island Line (SIL)", lineId: "SIL", stationId: "ADM", colorClass: "color-sil" },
    { fullName: "Tsuen Wan Line (TWL)", lineId: "TWL", stationId: "CEN", colorClass: "color-twl" },
    { fullName: "Island Line (ISL)", lineId: "ISL", stationId: "KET", colorClass: "color-isl" },
    { fullName: "Kwun Tong Line (KTL)", lineId: "KTL", stationId: "WHA", colorClass: "color-ktl" }
];

// Global variables for bus data
let citybusRoutes = [], citybusStops = [], citybusRouteStopsMap = {};
let kmbRoutes = [], kmbStops = [], kmbRouteStopsMap = {};

// Fetch train line status
async function fetchLineStatus(lineId, stationId) {
    try {
        const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${lineId}&sta=${stationId}&lang=en`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 1 && data.data && data.data[`${lineId}-${stationId}`]) {
            const schedule = data.data[`${lineId}-${stationId}`];
            const hasValidSchedule =
                (schedule.UP && schedule.UP.length > 0 && schedule.UP[0].valid === "Y") ||
                (schedule.DOWN && schedule.DOWN.length > 0 && schedule.DOWN[0].valid === "Y");
            return hasValidSchedule ? "1" : "0";
        }
        return "0";
    } catch (error) {
        console.error('Fetch Error:', error);
        return "0";
    }
}

// Display train service status in modal
async function displayTrainStatus() {
    const statusList = document.getElementById('statusList');
    statusList.innerHTML = '<div class="loading">Loading status...</div>';

    for (const line of trainLines) {
        const status = await fetchLineStatus(line.lineId, line.stationId);
        const isNormal = status === "1";
        const now = new Date();
        const updateTime = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

        const statusRow = document.createElement('div');
        statusRow.className = 'status-row';

        const colorBar = document.createElement('div');
        colorBar.className = `color-bar ${line.colorClass}`;

        const lineInfo = document.createElement('div');
        lineInfo.className = 'line-info';

        const lineName = document.createElement('div');
        lineName.className = 'line-name';
        lineName.textContent = line.fullName;

        const lineStatus = document.createElement('div');
        lineStatus.className = 'line-status';
        lineStatus.textContent = isNormal ? 'Normal Service' : 'Service Disruption';

        const updateTimeDiv = document.createElement('div');
        updateTimeDiv.className = 'update-time';
        updateTimeDiv.textContent = updateTime;

        lineInfo.appendChild(lineName);
        lineInfo.appendChild(lineStatus);
        statusRow.appendChild(colorBar);
        statusRow.appendChild(lineInfo);
        statusRow.appendChild(updateTimeDiv);
        statusList.appendChild(statusRow);
    }
    statusList.querySelector('.loading')?.remove();
}

// Initialize bus data from JSON files
async function initializeData() {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    try {
        const [routeResponse, stopResponse, routeStopResponse] = await Promise.all([
            fetch('/static/data/route_data.json'),
            fetch('/static/data/stop_data.json'),
            fetch('/static/data/route-stop_data.json')
        ]);

        const routeData = await routeResponse.json();
        kmbRoutes = routeData.kmb_routes || [];
        citybusRoutes = routeData.ctb_routes || [];

        const stopData = await stopResponse.json();
        kmbStops = Object.entries(stopData.kmb_stops || {}).map(([stop, details]) => ({
            stop,
            name_en: details.name_en,
            lat: details.lat,
            long: details.long
        }));
        citybusStops = Object.entries(stopData.ctb_stops || {}).map(([stop, details]) => ({
            stop,
            name_en: details.name_en,
            lat: details.lat,
            long: details.long
        }));

        const routeStopData = await routeStopResponse.json();
        kmbRouteStopsMap = Object.fromEntries(
            Object.entries(routeStopData.kmb_route_stops || {}).map(([key, stops]) => [
                key,
                stops.map(stop => stop.stop_id)
            ])
        );
        citybusRouteStopsMap = Object.fromEntries(
            Object.entries(routeStopData.ctb_route_stops || {}).map(([key, stops]) => [
                key,
                stops.map(stop => stop.stop_id)
            ])
        );

        localStorage.setItem('kmb_allRoutes', JSON.stringify(kmbRoutes));
        localStorage.setItem('kmb_allStops', JSON.stringify(kmbStops));
        localStorage.setItem('kmb_routeStopsMap', JSON.stringify(kmbRouteStopsMap));
        localStorage.setItem('citybus_allRoutes', JSON.stringify(citybusRoutes));
        localStorage.setItem('citybus_allStops', JSON.stringify(citybusStops));
        localStorage.setItem('citybus_routeStopsMap', JSON.stringify(citybusRouteStopsMap));

        loadingDiv.style.display = (citybusStops.length === 0 && kmbStops.length === 0) ? 
            'block' : 'none';
        if (citybusStops.length === 0 && kmbStops.length === 0) {
            loadingDiv.textContent = 'No bus data available. Some features may not work.';
        }
    } catch (error) {
        loadingDiv.textContent = 'Error loading data. Check console for details.';
        console.error('Initialization failed:', error);
    }
}

// Find nearby bus stops
function findNearbyStops(targetStop, stops) {
    return stops.filter(stop => 
        stop.lat && stop.long && 
        haversineDistance(targetStop.lat, targetStop.long, stop.lat, stop.long) <= 1000
    );
}

// Find direct bus routes
function findBusRoutes(startStopId, endStopId, company) {
    const stops = company === 'KMB' ? kmbStops : citybusStops;
    const routes = company === 'KMB' ? kmbRoutes : citybusRoutes;
    const routeStopsMap = company === 'KMB' ? kmbRouteStopsMap : citybusRouteStopsMap;

    const startStop = stops.find(s => s.stop === startStopId);
    const endStop = stops.find(s => s.stop === endStopId);
    const routeDiv = document.getElementById('route');
    if (!startStop || !endStop) {
        routeDiv.innerHTML = '<p>Invalid bus stops selected.</p>';
        return;
    }

    const startStops = findNearbyStops(startStop, stops);
    const endStops = findNearbyStops(endStop, stops);
    const startStopIds = startStops.map(s => s.stop);
    const endStopIds = endStops.map(s => s.stop);

    const directRoutes = [];

    for (const route of routes) {
        const direction = route.bound === 'O' ? 'outbound' : 'inbound';
        const key = `${route.route}-${route.bound}`;
        const stopsList = routeStopsMap[key] || [];
        const startMatches = stopsList.filter(id => startStopIds.includes(id));
        const endMatches = stopsList.filter(id => endStopIds.includes(id));
        if (startMatches.length > 0 && endMatches.length > 0) {
            let closestStartStop = null, minStartDistance = Infinity;
            for (const stopId of startMatches) {
                const stop = stops.find(s => s.stop === stopId);
                const distance = haversineDistance(startStop.lat, startStop.long, stop.lat, stop.long);
                if (distance < minStartDistance) {
                    minStartDistance = distance;
                    closestStartStop = stopId;
                }
            }
            const startIndex = stopsList.indexOf(closestStartStop);
            const possibleEndStops = endMatches.filter(id => stopsList.indexOf(id) > startIndex);
            if (possibleEndStops.length > 0) {
                let closestEndStop = null, minEndDistance = Infinity;
                for (const stopId of possibleEndStops) {
                    const stop = stops.find(s => s.stop === stopId);
                    const distance = haversineDistance(endStop.lat, endStop.long, stop.lat, stop.long);
                    if (distance < minEndDistance) {
                        minEndDistance = distance;
                        closestEndStop = stopId;
                    }
                }
                const stopDetails = stopsList.map(id => ({
                    id,
                    name: stops.find(s => s.stop === id)?.name_en || `Stop ${id}`
                }));
                directRoutes.push({
                    route: route.route,
                    direction,
                    stops: stopDetails,
                    boardingStop: closestStartStop,
                    alightingStop: closestEndStop,
                    boardingDistance: minStartDistance,
                    alightingDistance: minEndDistance,
                    company
                });
            }
        }
    }

    routeDiv.innerHTML = directRoutes.length > 0 ? 
        `<h3>Direct ${company} Bus Routes</h3>` + renderDirectBusRoutes(directRoutes) : 
        '<p>No direct bus routes found between the selected stops.</p>';
}

// Render direct bus routes
function renderDirectBusRoutes(routes) {
    return routes.map((route, index) => {
        const stops = route.company === 'KMB' ? kmbStops : citybusStops;
        const boardingStop = stops.find(s => s.stop === route.boardingStop);
        const alightingStop = stops.find(s => s.stop === route.alightingStop);
        const boardingName = boardingStop ? boardingStop.name_en : `Stop ${route.boardingStop}`;
        const alightingName = alightingStop ? alightingStop.name_en : `Stop ${route.alightingStop}`;
        const numStops = route.stops.findIndex(s => s.id === route.alightingStop) - 
                        route.stops.findIndex(s => s.id === route.boardingStop);

        const summary = `
            <div 
                class="route-option" 
                id="route-summary-${index}" 
                data-route="${route.route}" 
                data-direction="${route.direction}" 
                data-boarding-stop="${route.boardingStop}" 
                data-company="${route.company}" 
                onclick="toggleRouteDetails('route-details-${index}', this)"
            >
                <strong>Route ${route.route} (${route.direction})</strong> - ${numStops} stops<br>
                Walk ${Math.round(route.boardingDistance)}m to ${boardingName}, alight at ${alightingName} (${Math.round(route.alightingDistance)}m)
            </div>
        `;
        let details = `<div class="route-details" id="route-details-${index}" style="display:none;">`;
        details += '<ul class="stop-list">';
        route.stops.forEach(stop => {
            const stopInfo = stops.find(s => s.stop === stop.id);
            const stopName = stopInfo ? stopInfo.name_en : `Stop ${stop.id}`;
            const className = stop.id === route.boardingStop ? 'boarding-stop' : 
                            stop.id === route.alightingStop ? 'alighting-stop' : '';
            const etaSpan = stop.id === route.boardingStop ? `<span id="eta-${index}"></span>` : '';
            details += `<li class="${className}">${stopName}${etaSpan}</li>`;
        });
        details += '</ul></div>';
        return summary + details;
    }).join('');
}

// Fetch ETA for bus stops
async function fetchETA(route, direction, stopId, detailsId, company) {
    const etaSpan = document.querySelector(`#${detailsId} .boarding-stop span`);
    if (!etaSpan) return;

    try {
        const url = company === 'KMB'
            ? `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/1`
            : `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        let eta = null;
        if (company === 'KMB') {
            eta = data.data.find(e => e.seq === 1);
            if (eta && eta.eta) {
                const minutesLeft = Math.round((new Date(eta.eta) - new Date(data.generated_timestamp)) / 60000);
                etaSpan.textContent = minutesLeft >= 0 ? ` (ETA: ${minutesLeft} min)` : ` (Due now)`;
            } else {
                etaSpan.textContent = ` (No ETA data)`;
            }
        } else {
            const dirMapping = { "outbound": "O", "inbound": "I" };
            eta = data.data.find(e => e.eta_seq === 1 && e.dir === dirMapping[direction]) || 
                  data.data.find(e => e.eta_seq === 1);
            if (eta && eta.eta) {
                const minutesLeft = Math.round((new Date(eta.eta) - new Date(eta.data_timestamp)) / 60000);
                etaSpan.textContent = minutesLeft >= 0 ? ` (ETA: ${minutesLeft} min)` : ` (Due now)`;
            } else {
                etaSpan.textContent = ` (No ETA data)`;
            }
        }
    } catch (error) {
        etaSpan.textContent = ` (ETA unavailable)`;
        console.error(`${company} ETA fetch failed for ${route} at ${stopId}:`, error);
    }
}

// Toggle route details and fetch ETA
function toggleRouteDetails(detailsId, summaryElement) {
    const detailsDiv = document.getElementById(detailsId);
    if (detailsDiv.style.display === 'none' || !detailsDiv.style.display) {
        detailsDiv.style.display = 'block';
        const route = summaryElement.getAttribute('data-route');
        const direction = summaryElement.getAttribute('data-direction');
        const boardingStop = summaryElement.getAttribute('data-boarding-stop');
        const company = summaryElement.getAttribute('data-company');
        fetchETA(route, direction, boardingStop, detailsId, company);
    } else {
        detailsDiv.style.display = 'none';
    }
}

// Get unique MTR stations
function getUniqueMTRStations() {
    const stationSet = new Set();
    const stations = [];
    for (let line in lines) {
        lines[line].forEach(station => {
            if (!stationSet.has(station.value)) {
                stationSet.add(station.value);
                stations.push({
                    value: station.value,
                    text: station.text,
                    type: 'MTR'
                });
            }
        });
    }
    return stations;
}

// Make searchable dropdown
function makeSearchable(inputId, optionsId, options) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);

    input.addEventListener('input', function() {
        const filter = input.value.toLowerCase();
        optionsContainer.innerHTML = '';
        const filteredOptions = options.filter(option => 
            option.text.toLowerCase().includes(filter)
        );
        filteredOptions.forEach(option => {
            const div = document.createElement('div');
            div.textContent = `${option.text} (${option.type}${option.type === 'Bus' ? ' - ' + option.company : ''})`;
            div.addEventListener('click', function() {
                input.value = option.text;
                input.dataset.value = option.value;
                input.dataset.type = option.type;
                input.dataset.company = option.company || '';
                optionsContainer.style.display = 'none';
            });
            optionsContainer.appendChild(div);
        });
        optionsContainer.style.display = filteredOptions.length > 0 ? 'block' : 'none';
    });

    input.addEventListener('focus', function() {
        optionsContainer.style.display = 'block';
    });

    document.addEventListener('click', function(event) {
        if (!input.contains(event.target) && !optionsContainer.contains(event.target)) {
            optionsContainer.style.display = 'none';
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    const statusButton = document.getElementById('statusButton');
    const statusModal = document.getElementById('statusModal');
    const closeModal = document.getElementById('closeModal');

    statusButton.addEventListener('click', () => {
        statusModal.style.display = 'flex';
        displayTrainStatus();
    });

    closeModal.addEventListener('click', () => {
        statusModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === statusModal) {
            statusModal.style.display = 'none';
        }
    });

    document.getElementById('swapStations').addEventListener('click', function() {
        const currentInput = document.getElementById('currentStationInput');
        const destinationInput = document.getElementById('destinationStationInput');

        const tempValue = currentInput.value;
        const tempDataValue = currentInput.dataset.value;
        const tempDataType = currentInput.dataset.type;
        const tempDataCompany = currentInput.dataset.company;

        currentInput.value = destinationInput.value;
        currentInput.dataset.value = destinationInput.dataset.value || '';
        currentInput.dataset.type = destinationInput.dataset.type || '';
        currentInput.dataset.company = destinationInput.dataset.company || '';

        destinationInput.value = tempValue;
        destinationInput.dataset.value = tempDataValue || '';
        destinationInput.dataset.type = tempDataType || '';
        destinationInput.dataset.company = tempDataCompany || '';
    });

    document.getElementById('routeForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const currentInput = document.getElementById('currentStationInput');
        const destinationInput = document.getElementById('destinationStationInput');
        const currentType = currentInput.dataset.type;
        const destinationType = destinationInput.dataset.type;
        const currentId = currentInput.dataset.value;
        const destinationId = destinationInput.dataset.value;
        const currentCompany = currentInput.dataset.company;
        const destinationCompany = destinationInput.dataset.company;

        const routeDiv = document.getElementById('route');
        routeDiv.innerHTML = '';

        if (!currentId || !destinationId) {
            alert("Please select both a starting and destination station.");
            return;
        }

        if (currentType === 'MTR' && destinationType === 'MTR') {
            window.location.href = `/general_schedule.html?currentStation=${currentId}&destinationStation=${destinationId}`;
        } else if (currentType === 'Bus' && destinationType === 'MTR') {
            window.location.href = `/general_schedule.html?startBusStop=${currentId}&destinationStation=${destinationId}&company=${currentCompany}`;
        } else if (currentType === 'MTR' && destinationType === 'Bus') {
            window.location.href = `/general_schedule.html?currentStation=${currentId}&endBusStop=${destinationId}&company=${destinationCompany}`;
        } else if (currentType === 'Bus' && destinationType === 'Bus') {
            if (currentCompany === destinationCompany) {
                findBusRoutes(currentId, destinationId, currentCompany);
            } else {
                window.location.href = `/general_schedule.html?startBusStop=${currentId}&endBusStop=${destinationId}`;
            }
        }
    });
}

// Initialize on window load
window.onload = async function() {
    await initializeData();
    const mtrStations = getUniqueMTRStations();
    const citybusOptions = citybusStops.map(stop => ({
        value: stop.stop,
        text: stop.name_en,
        type: 'Bus',
        company: 'Citybus'
    }));
    const kmbOptions = kmbStops.map(stop => ({
        value: stop.stop,
        text: stop.name_en,
        type: 'Bus',
        company: 'KMB'
    }));
    const allOptions = [...mtrStations, ...citybusOptions, ...kmbOptions];
    makeSearchable('currentStationInput', 'currentStationOptions', allOptions);
    makeSearchable('destinationStationInput', 'destinationStationOptions', allOptions);
    setupEventListeners();
    getTemperature(); // Assumes this is defined in temperature.js
};