// routePlanner.js
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

async function fetchLineStatus(lineId, stationId) {
    try {
        const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${lineId}&sta=${stationId}&lang=en`;
        const response = await fetch(url);
        const data = await response.json();
        console.log('API Response:', data);

        if (data.status === 1 && data.data && data.data[`${lineId}-${stationId}`]) {
            const schedule = data.data[`${lineId}-${stationId}`];
            console.log('Schedule:', schedule);
            const hasValidSchedule =
                (schedule.UP && schedule.UP.length > 0 && schedule.UP[0].valid === "Y") ||
                (schedule.DOWN && schedule.DOWN.length > 0 && schedule.DOWN[0].valid === "Y");
            console.log('Has Valid Schedule:', hasValidSchedule);
            return hasValidSchedule ? "1" : "0";
        } else {
            console.log('Invalid API response or no data');
            return "0";
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        return "0";
    }
}

async function displayTrainStatus() {
    const statusList = document.getElementById('statusList');
    statusList.innerHTML = ''; // Clear previous content

    for (const line of trainLines) {
        const status = await fetchLineStatus(line.lineId, line.stationId);
        console.log('Status for', line.fullName, ':', status);
        const isNormal = status === "1";
        console.log('Is Normal for', line.fullName, ':', isNormal);

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
}

// Modal event listeners
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

// Caching utility functions
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = (Date.now() - timestamp) / (1000 * 60 * 60); // Age in hours
        if (age < 24) return data; // Cache valid for 24 hours
    }
    return null;
}

function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
}

async function initializeData() {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    try {
        await Promise.all([fetchCitybusData(), fetchKMBData()]);
        if (citybusStops.length === 0 && kmbStops.length === 0) {
            loadingDiv.textContent = 'No bus data available. Some features may not work.';
        } else {
            loadingDiv.style.display = 'none';
        }
    } catch (error) {
        loadingDiv.textContent = 'Error loading bus data. Check console for details.';
        console.error('Initialization failed:', error);
    }
}

let citybusRoutes = [], citybusStops = [], citybusRouteStopsMap = {};
let kmbRoutes = [], kmbStops = [], kmbRouteStopsMap = {};

async function fetchCitybusData() {
    const routesKey = 'citybus_routes';
    const stopsKey = 'citybus_stops';
    const routeStopsMapKey = 'citybus_routeStopsMap';

    const cachedRoutes = getCachedData(routesKey);
    const cachedStops = getCachedData(stopsKey);
    const cachedRouteStopsMap = getCachedData(routeStopsMapKey);

    if (cachedRoutes && cachedStops && cachedRouteStopsMap) {
        citybusRoutes = cachedRoutes;
        citybusStops = cachedStops;
        citybusRouteStopsMap = cachedRouteStopsMap;
        console.log('Citybus data loaded from cache');
        return;
    }

    try {
        const routeResponse = await fetch('https://rt.data.gov.hk/v2/transport/citybus/route/CTB');
        if (!routeResponse.ok) throw new Error(`Citybus route fetch failed: ${routeResponse.status}`);
        citybusRoutes = (await routeResponse.json()).data || [];
        console.log('Citybus routes fetched:', citybusRoutes.length);

        const stopsMap = {};
        const routePromises = citybusRoutes.map(async route => {
            for (const direction of ['outbound', 'inbound']) {
                try {
                    const response = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route.route}/${direction}`);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (data.data) {
                        data.data.forEach(stop => {
                            const key = `${route.route}-${direction}`;
                            if (!citybusRouteStopsMap[key]) citybusRouteStopsMap[key] = [];
                            citybusRouteStopsMap[key].push(stop.stop);
                            stopsMap[stop.stop] = stop;
                        });
                    }
                } catch (error) {
                    console.warn(`Error fetching Citybus stops for ${route.route} (${direction}):`, error);
                }
            }
        });
        await Promise.all(routePromises);
        console.log('Citybus route stops fetched, unique stops:', Object.keys(stopsMap).length);

        const rawStops = Object.values(stopsMap);
        citybusStops = await Promise.all(rawStops.map(async stop => {
            try {
                const detailsResponse = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/stop/${stop.stop}`);
                if (!detailsResponse.ok) {
                    return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
                }
                const details = await detailsResponse.json();
                return {
                    stop: stop.stop,
                    name_en: details.data?.name_en || `Stop ${stop.stop}`,
                    lat: details.data?.lat,
                    long: details.data?.long
                };
            } catch (error) {
                console.warn(`Error fetching Citybus stop details for ${stop.stop}:`, error);
                return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
            }
        }));
        console.log('Citybus stops with details fetched:', citybusStops.length);

        setCachedData(routesKey, citybusRoutes);
        setCachedData(stopsKey, citybusStops);
        setCachedData(routeStopsMapKey, citybusRouteStopsMap);
    } catch (error) {
        console.error('Error fetching Citybus data:', error);
        citybusRoutes = [];
        citybusStops = [];
    }
}

async function fetchKMBData() {
    const routesKey = 'kmb_routes';
    const stopsKey = 'kmb_stops';
    const routeStopsMapKey = 'kmb_routeStopsMap';

    const cachedRoutes = getCachedData(routesKey);
    const cachedStops = getCachedData(stopsKey);
    const cachedRouteStopsMap = getCachedData(routeStopsMapKey);

    if (cachedRoutes && cachedStops && cachedRouteStopsMap) {
        kmbRoutes = cachedRoutes;
        kmbStops = cachedStops;
        kmbRouteStopsMap = cachedRouteStopsMap;
        console.log('KMB data loaded from cache');
        return;
    }

    try {
        const routeResponse = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/route/');
        if (!routeResponse.ok) throw new Error(`KMB route fetch failed: ${routeResponse.status}`);
        kmbRoutes = (await routeResponse.json()).data || [];
        console.log('KMB routes fetched:', kmbRoutes.length);

        const stopsMap = {};
        const routePromises = kmbRoutes.slice(0, 50).map(async route => {
            for (const direction of ['outbound', 'inbound']) {
                try {
                    const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route.route}/${direction}/1`);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (data.data) {
                        data.data.forEach(stop => {
                            const key = `${route.route}-${direction}`;
                            if (!kmbRouteStopsMap[key]) kmbRouteStopsMap[key] = [];
                            kmbRouteStopsMap[key].push(stop.stop);
                            stopsMap[stop.stop] = stop;
                        });
                    }
                } catch (error) {
                    console.warn(`Error fetching KMB stops for ${route.route} (${direction}):`, error);
                }
            }
        });
        await Promise.all(routePromises);
        console.log('KMB route stops fetched, unique stops:', Object.keys(stopsMap).length);

        const rawStops = Object.values(stopsMap);
        kmbStops = await Promise.all(rawStops.map(async stop => {
            try {
                const detailsResponse = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${stop.stop}`);
                if (!detailsResponse.ok) {
                    return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
                }
                const details = await detailsResponse.json();
                return {
                    stop: stop.stop,
                    name_en: details.data?.name_en || `Stop ${stop.stop}`,
                    lat: details.data?.lat,
                    long: details.data?.long
                };
            } catch (error) {
                console.warn(`Error fetching KMB stop details for ${stop.stop}:`, error);
                return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
            }
        }));
        console.log('KMB stops with details fetched:', kmbStops.length);

        setCachedData(routesKey, kmbRoutes);
        setCachedData(stopsKey, kmbStops);
        setCachedData(routeStopsMapKey, kmbRouteStopsMap);
    } catch (error) {
        console.error('Error fetching KMB data:', error);
        kmbRoutes = [];
        kmbStops = [];
    }
}

function findNearestMTRStation(busStop, mtrStations) {
    let nearestStation = null;
    let minDistance = Infinity;
    mtrStations.forEach(mtr => {
        const distance = haversineDistance(
            parseFloat(busStop.lat), parseFloat(busStop.long),
            mtr.lat, mtr.long
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearestStation = mtr;
        }
    });
    return { station: nearestStation, distance: minDistance };
}

function getUniqueMTRStations() {
    // Placeholder: Define or import 'lines' from stations.js or server
    console.warn('getUniqueMTRStations: "lines" not defined. Please define or import it.');
    return []; // Temporary empty array until 'lines' is provided
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function findNearbyStops(targetStop, stops) {
    return stops.filter(stop => 
        stop.lat && stop.long && 
        haversineDistance(targetStop.lat, targetStop.long, stop.lat, stop.long) <= 1000
    );
}

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
        for (const direction of ['outbound', 'inbound']) {
            const key = `${route.route}-${direction}`;
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
                    const stopDetails = stopsList.map(id => {
                        const stop = stops.find(s => s.stop === id);
                        return { id, name: stop ? stop.name_en : `Stop ${id}` };
                    });
                    directRoutes.push({
                        route: route.route,
                        direction,
                        stops: stopDetails,
                        boardingStop: closestStartStop,
                        alightingStop: closestEndStop,
                        boardingDistance: minStartDistance,
                        alightingDistance: minEndDistance,
                        company: company
                    });
                }
            }
        }
    }

    if (directRoutes.length > 0) {
        routeDiv.innerHTML = `<h3>Direct ${company} Bus Routes</h3>` + renderDirectBusRoutes(directRoutes, stops);
    } else {
        routeDiv.innerHTML = '<p>No direct bus routes found between the selected stops.</p>';
    }
}

function renderDirectBusRoutes(routes, stops) {
    return routes.map((route, index) => {
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
        let details = `<div class="route-details" id="route-details-${index}">`;
        details += '<ul class="stop-list">';
        route.stops.forEach(stop => {
            const className = stop.id === route.boardingStop ? 'boarding-stop' : 
                            stop.id === route.alightingStop ? 'alighting-stop' : '';
            const etaSpan = stop.id === route.boardingStop ? `<span id="eta-${index}"></span>` : '';
            details += `<li class="${className}">${stop.name}${etaSpan}</li>`;
        });
        details += '</ul></div>';
        return summary + details;
    }).join('');
}

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
        console.log(`${company} ETA Response for ${route} at ${stopId}:`, data);

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

document.getElementById('swapStations').addEventListener('click', function() {
    const currentInput = document.getElementById('currentStationInput');
    const destinationInput = document.getElementById('destinationStationInput');

    const tempValue = currentInput.value;
    const tempDataValue = currentInput.dataset.value;
    const tempDataType = currentInput.dataset.type;

    currentInput.value = destinationInput.value;
    currentInput.dataset.value = destinationInput.dataset.value || '';
    currentInput.dataset.type = destinationInput.dataset.type || '';

    destinationInput.value = tempValue;
    destinationInput.dataset.value = tempDataValue || '';
    destinationInput.dataset.type = tempDataType || '';
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
        const busData = currentCompany === 'KMB' ? 
            { routes: kmbRoutes, stops: kmbStops, routeStopsMap: kmbRouteStopsMap } : 
            { routes: citybusRoutes, stops: citybusStops, routeStopsMap: citybusRouteStopsMap };
        localStorage.setItem(`${currentCompany.toLowerCase()}_allRoutes`, JSON.stringify(busData.routes));
        localStorage.setItem(`${currentCompany.toLowerCase()}_allStops`, JSON.stringify(busData.stops));
        localStorage.setItem(`${currentCompany.toLowerCase()}_routeStopsMap`, JSON.stringify(busData.routeStopsMap));
        window.location.href = `/general_schedule.html?startBusStop=${currentId}&destinationStation=${destinationId}&company=${currentCompany}`;
    } else if (currentType === 'MTR' && destinationType === 'Bus') {
        const busData = destinationCompany === 'KMB' ? 
            { routes: kmbRoutes, stops: kmbStops, routeStopsMap: kmbRouteStopsMap } : 
            { routes: citybusRoutes, stops: citybusStops, routeStopsMap: citybusRouteStopsMap };
        localStorage.setItem(`${destinationCompany.toLowerCase()}_allRoutes`, JSON.stringify(busData.routes));
        localStorage.setItem(`${destinationCompany.toLowerCase()}_allStops`, JSON.stringify(busData.stops));
        localStorage.setItem(`${destinationCompany.toLowerCase()}_routeStopsMap`, JSON.stringify(busData.routeStopsMap));
        window.location.href = `/general_schedule.html?currentStation=${currentId}&endBusStop=${destinationId}&company=${destinationCompany}`;
    } else if (currentType === 'Bus' && destinationType === 'Bus') {
        const startBusData = currentCompany === 'KMB' ? 
            { routes: kmbRoutes, stops: kmbStops, routeStopsMap: kmbRouteStopsMap } : 
            { routes: citybusRoutes, stops: citybusStops, routeStopsMap: citybusRouteStopsMap };
        localStorage.setItem(`${currentCompany.toLowerCase()}_allRoutes`, JSON.stringify(startBusData.routes));
        localStorage.setItem(`${currentCompany.toLowerCase()}_allStops`, JSON.stringify(startBusData.stops));
        localStorage.setItem(`${currentCompany.toLowerCase()}_routeStopsMap`, JSON.stringify(startBusData.routeStopsMap));
        findBusRoutes(currentId, destinationId, currentCompany);
    }
});

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
    getTemperature(); // Ensure this is defined in temperature.js
};