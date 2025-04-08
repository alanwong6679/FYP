const statusButton = document.getElementById('statusButton');
const statusModal = document.getElementById('statusModal');
const closeModal = document.getElementById('closeModal');
const loadingDiv = document.getElementById('loading');
const currentStationInput = document.getElementById('currentStationInput');
const destinationStationInput = document.getElementById('destinationStationInput');
const routeForm = document.getElementById('routeForm');
const routeDiv = document.getElementById('route');
const swapButton = document.getElementById('swapStations');
const gpsToggle = document.getElementById('gpsToggle'); // Corrected ID
const modeSelectionBar = document.getElementById('modeSelectionBar');
const currentStationOptionsContainer = document.getElementById('currentStationOptions');
const destinationStationOptionsContainer = document.getElementById('destinationStationOptions');

let citybusRoutes = [], citybusStops = [], citybusRouteStopsMap = {};
let kmbRoutes = [], kmbStops = [], kmbRouteStopsMap = {};
let mtrStations = [];
let citybusOptions = [];
let kmbOptions = [];
let currentMode = 'all';
let isGpsModeActive = false;
let userLocation = null;
const NEARBY_RADIUS_METERS = 600; // Fixed to 600m as per your requirement

// Train status data (assumed from your HTML)
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

// Modal event listeners
if (statusButton && statusModal) {
    statusButton.addEventListener('click', () => {
        statusModal.style.display = 'flex';
        displayTrainStatus();
    });
}

if (closeModal && statusModal) {
    closeModal.addEventListener('click', () => {
        statusModal.style.display = 'none';
    });
}

window.addEventListener('click', (event) => {
    if (statusModal && event.target === statusModal) {
        statusModal.style.display = 'none';
    }
});

// Cache helpers
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            const age = (Date.now() - timestamp) / (1000 * 60 * 60);
            if (age < 24) return data;
        } catch (e) {
            console.error("Failed parsing cache for", key, e);
            return null;
        }
    }
    return null;
}

function setCachedData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        console.error("Failed setting cache for", key, e);
    }
}

// Data fetching
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
        return;
    }

    try {
        const routeResponse = await fetch('https://rt.data.gov.hk/v2/transport/citybus/route/CTB');
        if (!routeResponse.ok) throw new Error(`Citybus route fetch failed: ${routeResponse.status}`);
        citybusRoutes = (await routeResponse.json()).data || [];

        const tempStopsMap = {};
        const tempRouteStopsMap = {};

        const routePromises = citybusRoutes.map(async route => {
            for (const direction of ['outbound', 'inbound']) {
                try {
                    const response = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route.route}/${direction}`);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (data.data && data.data.length > 0) {
                        const key = `${route.route}-${direction}`;
                        tempRouteStopsMap[key] = data.data.map(s => s.stop);
                        data.data.forEach(stop => { tempStopsMap[stop.stop] = stop; });
                    }
                } catch (error) {}
            }
        });
        await Promise.all(routePromises);

        const rawStops = Object.values(tempStopsMap);
        citybusStops = await Promise.all(rawStops.map(async stop => {
            try {
                const detailsResponse = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/stop/${stop.stop}`);
                if (!detailsResponse.ok) return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
                const details = await detailsResponse.json();
                return { stop: stop.stop, name_en: details.data?.name_en, lat: details.data?.lat, long: details.data?.long };
            } catch (error) { return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null }; }
        }));

        citybusRouteStopsMap = tempRouteStopsMap;

        setCachedData(routesKey, citybusRoutes);
        setCachedData(stopsKey, citybusStops);
        setCachedData(routeStopsMapKey, citybusRouteStopsMap);
    } catch (error) {
        console.error('Error fetching Citybus data:', error);
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
        return;
    }

    try {
        const routeResponse = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/route/');
        if (!routeResponse.ok) throw new Error(`KMB route fetch failed: ${routeResponse.status}`);
        kmbRoutes = (await routeResponse.json()).data || [];

        const tempStopsMap = {};
        const tempRouteStopsMap = {};

        const routePromises = kmbRoutes.map(async route => {
            for (const direction of ['outbound', 'inbound']) {
                try {
                    const response = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route.route}/${direction}/1`);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (data.data && data.data.length > 0) {
                        const key = `${route.route}-${direction}`;
                        tempRouteStopsMap[key] = data.data.map(s => s.stop);
                        data.data.forEach(stop => { tempStopsMap[stop.stop] = stop; });
                    }
                } catch (error) {}
            }
        });
        await Promise.all(routePromises);

        kmbStops = await Promise.all(Object.values(tempStopsMap).map(async stop => {
            try {
                const detailsResponse = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${stop.stop}`);
                if (!detailsResponse.ok) return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null };
                const details = await detailsResponse.json();
                return { stop: stop.stop, name_en: details.data?.name_en, lat: details.data?.lat, long: details.data?.long };
            } catch (error) { return { stop: stop.stop, name_en: `Stop ${stop.stop}`, lat: null, long: null }; }
        }));

        kmbRouteStopsMap = tempRouteStopsMap;

        setCachedData(routesKey, kmbRoutes);
        setCachedData(stopsKey, kmbStops);
        setCachedData(routeStopsMapKey, kmbRouteStopsMap);
    } catch (error) {
        console.error('Error fetching KMB data:', error);
    }
}

async function initializeData() {
    if (loadingDiv) loadingDiv.style.display = 'block';
    try {
        await Promise.all([fetchCitybusData(), fetchKMBData()]);
        mtrStations = getUniqueMTRStations();
        citybusOptions = citybusStops.map(stop => ({
            value: stop.stop, text: stop.name_en, type: 'Bus', company: 'Citybus', lat: stop.lat, long: stop.long
        }));
        kmbOptions = kmbStops.map(stop => ({
            value: stop.stop, text: stop.name_en, type: 'Bus', company: 'KMB', lat: stop.lat, long: stop.long
        }));

        console.log("Data Fetch Complete:");
        console.log("MTR Stations:", mtrStations.length, mtrStations[0] || 'None');
        console.log("Citybus Stops:", citybusStops.length, citybusStops[0] || 'None');
        console.log("KMB Stops:", kmbStops.length, kmbStops[0] || 'None');
        console.log("Citybus Options:", citybusOptions.length, citybusOptions[0] || 'None');
        console.log("KMB Options:", kmbOptions.length, kmbOptions[0] || 'None');

        if (citybusOptions.length === 0 && kmbOptions.length === 0 && mtrStations.length === 0) {
            if (loadingDiv) loadingDiv.textContent = 'No transit data available.';
        } else {
            updateSearchableOptions();
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        if (loadingDiv) loadingDiv.textContent = 'Error loading data. Please refresh.';
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}


function getMTRCoords(stationCode) {
    return mtrCoordsData[stationCode] || { lat: null, long: null };
}

function getUniqueMTRStations() {
    if (typeof lines === 'undefined') {
        console.error("'lines' variable not found.");
        return [];
    }
    const stationSet = new Set();
    const stationsFormatted = [];
    for (let line in lines) {
        lines[line].forEach(station => {
            if (!stationSet.has(station.value)) {
                stationSet.add(station.value);
                stationsFormatted.push({ value: station.value, text: station.text, type: 'MTR' });
            }
        });
    }
    return stationsFormatted.sort((a, b) => a.text.localeCompare(b.text));
}
// GPS-related functions
function haversineDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser."));
            return;
        }
        console.log("Requesting user location...");
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                console.log("Location obtained:", userLocation);
                resolve(userLocation);
            },
            error => {
                userLocation = null;
                console.error("Geolocation Error:", error.message);
                reject(new Error("Could not get location: " + error.message));
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    });
}

// Searchable select setup
function setupSearchable(inputId, optionsId, isStartingInput = false) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);
    if (!input || !optionsContainer) return;

    const filterAndDisplayOptions = () => {
        const filter = input.value.toLowerCase();
        const currentSource = JSON.parse(input.dataset.optionsSource || '[]');
        const filteredOptions = currentSource.filter(option => option.text && option.text.toLowerCase().includes(filter));

        optionsContainer.innerHTML = '';
        if (filteredOptions.length === 0) {
            optionsContainer.innerHTML = '<div style="padding: 10px; font-style: italic; color: #888;">No matches found.</div>';
        } else {
            filteredOptions.forEach(option => {
                const div = document.createElement('div');
                let displayText = `${option.text} (${option.type}${option.type === 'Bus' ? ' - ' + option.company : ''})`;
                if (isStartingInput && isGpsModeActive && option.distance !== undefined && option.distance !== Infinity) {
                    displayText += ` (${Math.round(option.distance)}m)`;
                }
                div.textContent = displayText;
                div.setAttribute('role', 'option');
                div.dataset.value = option.value;
                div.dataset.text = option.text;
                div.dataset.type = option.type;
                div.dataset.company = option.company || '';
                div.addEventListener('click', () => {
                    input.value = option.text;
                    input.dataset.value = option.value;
                    input.dataset.type = option.type;
                    input.dataset.company = option.company || '';
                    optionsContainer.style.display = 'none';
                    optionsContainer.setAttribute('aria-hidden', 'true');
                    input.setAttribute('aria-expanded', 'false');
                });
                optionsContainer.appendChild(div);
            });
        }
        optionsContainer.style.display = filteredOptions.length > 0 ? 'block' : 'none';
        optionsContainer.setAttribute('aria-hidden', String(filteredOptions.length === 0));
        input.setAttribute('aria-expanded', String(filteredOptions.length > 0));
    };

    input.addEventListener('input', filterAndDisplayOptions);
    input.addEventListener('focus', filterAndDisplayOptions);

    document.addEventListener('click', event => {
        if (!input.contains(event.target) && !optionsContainer.contains(event.target)) {
            optionsContainer.style.display = 'none';
            optionsContainer.setAttribute('aria-hidden', 'true');
            if (document.activeElement !== input) {
                input.setAttribute('aria-expanded', 'false');
            }
        }
    });
}

function updateSearchableOptions() {
    let baseOptions = [];
    switch (currentMode) {
        case 'MTR': baseOptions = [...mtrStations]; break;
        case 'Bus': baseOptions = [...citybusOptions, ...kmbOptions].sort((a, b) => a.text.localeCompare(b.text)); break;
        case 'all': default: baseOptions = [...mtrStations, ...citybusOptions, ...kmbOptions].sort((a, b) => a.text.localeCompare(b.text)); break;
    }

    let startOptions = baseOptions;
    if (isGpsModeActive && userLocation) {
        startOptions = baseOptions
            .map(option => {
                const dist = haversineDistance(userLocation.latitude, userLocation.longitude, option.lat, option.long);
                return { ...option, distance: dist };
            })
            .filter(option => option.distance <= NEARBY_RADIUS_METERS)
            .sort((a, b) => a.distance - b.distance);
    }

    if (currentStationInput) {
        currentStationInput.dataset.optionsSource = JSON.stringify(startOptions);
        setupSearchable('currentStationInput', 'currentStationOptions', true);
    }
    if (destinationStationInput) {
        destinationStationInput.dataset.optionsSource = JSON.stringify(baseOptions);
        setupSearchable('destinationStationInput', 'destinationStationOptions', false);
    }
}

// Train status display (assumed function)
async function displayTrainStatus() {
    const statusList = document.getElementById('statusList');
    statusList.innerHTML = '';
    for (const line of trainLines) {
        const status = await fetchLineStatus(line.lineId, line.stationId);
        const isNormal = status === "1";
        const now = new Date();
        const updateTime = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const statusRow = document.createElement('div');
        statusRow.className = 'status-row';
        statusRow.innerHTML = `
            <div class="color-bar ${line.colorClass}"></div>
            <div class="line-info">
                <div class="line-name">${line.fullName}</div>
                <div class="line-status">${isNormal ? 'Normal Service' : 'Service Disruption'}</div>
            </div>
            <div class="update-time">${updateTime}</div>
        `;
        statusList.appendChild(statusRow);
    }
}

async function fetchLineStatus(lineId, stationId) {
    try {
        const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${lineId}&sta=${stationId}&lang=en`;
        const response = await fetch(url);
        if (!response.ok) return "0";
        const data = await response.json();
        if (data.status === 1 && data.data && data.data[`${lineId}-${stationId}`]) {
            const schedule = data.data[`${lineId}-${stationId}`];
            return (schedule.UP?.[0]?.valid === "Y" || schedule.DOWN?.[0]?.valid === "Y") ? "1" : "0";
        }
        return "0";
    } catch (error) {
        console.error(`Fetch Error for line ${lineId}:`, error);
        return "0";
    }
}

// Mode selection
if (modeSelectionBar) {
    modeSelectionBar.addEventListener('click', event => {
        const targetButton = event.target.closest('.mode-button');
        if (!targetButton) return;
        const selectedMode = targetButton.dataset.mode;
        if (selectedMode === currentMode) return;
        modeSelectionBar.querySelectorAll('.mode-button').forEach(button => button.classList.remove('active'));
        targetButton.classList.add('active');
        currentMode = selectedMode;
        updateSearchableOptions();
        [currentStationInput, destinationStationInput].forEach(input => {
            if (input) {
                input.value = '';
                input.dataset.value = input.dataset.type = input.dataset.company = '';
                const options = input === currentStationInput ? currentStationOptionsContainer : destinationStationOptionsContainer;
                if (options) options.style.display = 'none';
            }
        });
    });
}

// Swap stations
if (swapButton) {
    swapButton.addEventListener('click', () => {
        if (!currentStationInput || !destinationStationInput) return;
        const temp = {
            value: currentStationInput.value,
            dataValue: currentStationInput.dataset.value,
            dataType: currentStationInput.dataset.type,
            dataCompany: currentStationInput.dataset.company
        };
        currentStationInput.value = destinationStationInput.value;
        currentStationInput.dataset.value = destinationStationInput.dataset.value || '';
        currentStationInput.dataset.type = destinationStationInput.dataset.type || '';
        currentStationInput.dataset.company = destinationStationInput.dataset.company || '';
        destinationStationInput.value = temp.value;
        destinationStationInput.dataset.value = temp.dataValue || '';
        destinationStationInput.dataset.type = temp.dataType || '';
        destinationStationInput.dataset.company = temp.dataCompany || '';
    });
}

// GPS toggle
if (gpsToggle) {
    console.log("GPS toggle found, attaching event listener.");
    gpsToggle.addEventListener('click', async () => {
        console.log("GPS button clicked, toggling state to:", !isGpsModeActive);
        isGpsModeActive = !isGpsModeActive;
        gpsToggle.classList.toggle('active', isGpsModeActive);
        gpsToggle.title = isGpsModeActive ? "Turn off nearby stations filter" : "Show nearby stations within 600m";
        if (isGpsModeActive) {
            if (loadingDiv) loadingDiv.style.display = 'block';
            try {
                await getUserLocation();
                updateSearchableOptions();
                console.log("GPS mode activated, filtered stations:", currentStationInput.dataset.optionsSource);
            } catch (error) {
                alert("Could not get location: " + error.message);
                isGpsModeActive = false;
                gpsToggle.classList.remove('active');
                userLocation = null;
                updateSearchableOptions();
            } finally {
                if (loadingDiv) loadingDiv.style.display = 'none';
            }
        } else {
            userLocation = null;
            updateSearchableOptions();
            console.log("GPS mode deactivated, reset stations:", currentStationInput.dataset.optionsSource);
        }
        if (currentStationInput) {
            currentStationInput.value = '';
            currentStationInput.dataset.value = '';
            currentStationInput.dataset.type = '';
            currentStationInput.dataset.company = '';
            currentStationOptionsContainer.style.display = 'none';
        }
    });
} else {
    console.error("GPS toggle button not found in DOM.");
}

// Form submission
if (routeForm) {
    routeForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (!currentStationInput || !destinationStationInput) return;

        const currentType = currentStationInput.dataset.type;
        const destinationType = destinationStationInput.dataset.type;
        const currentId = currentStationInput.dataset.value;
        const destinationId = destinationStationInput.dataset.value;
        const currentCompany = currentStationInput.dataset.company;
        const destinationCompany = destinationStationInput.dataset.company;

        if (!currentId || !destinationId) {
            alert("Please select both starting and destination points.");
            return;
        }
        if (routeDiv) routeDiv.innerHTML = '';

        if (currentType === 'MTR' && destinationType === 'MTR') {
            window.location.href = `/general_schedule.html?currentStation=${currentId}&destinationStation=${destinationId}`;
        } else if (currentType === 'Bus' && destinationType === 'MTR') {
            localStorage.setItem(`${currentCompany.toLowerCase()}_allRoutes`, JSON.stringify(currentCompany === 'KMB' ? kmbRoutes : citybusRoutes));
            localStorage.setItem(`${currentCompany.toLowerCase()}_allStops`, JSON.stringify(currentCompany === 'KMB' ? kmbStops : citybusStops));
            localStorage.setItem(`${currentCompany.toLowerCase()}_routeStopsMap`, JSON.stringify(currentCompany === 'KMB' ? kmbRouteStopsMap : citybusRouteStopsMap));
            window.location.href = `/general_schedule.html?startBusStop=${currentId}&destinationStation=${destinationId}&company=${currentCompany}`;
        } else if (currentType === 'MTR' && destinationType === 'Bus') {
            localStorage.setItem(`${destinationCompany.toLowerCase()}_allRoutes`, JSON.stringify(destinationCompany === 'KMB' ? kmbRoutes : citybusRoutes));
            localStorage.setItem(`${destinationCompany.toLowerCase()}_allStops`, JSON.stringify(destinationCompany === 'KMB' ? kmbStops : citybusStops));
            localStorage.setItem(`${destinationCompany.toLowerCase()}_routeStopsMap`, JSON.stringify(destinationCompany === 'KMB' ? kmbRouteStopsMap : citybusRouteStopsMap));
            window.location.href = `/general_schedule.html?currentStation=${currentId}&endBusStop=${destinationId}&company=${destinationCompany}`;
        } else if (currentType === 'Bus' && destinationType === 'Bus') {
            findBusRoutes(currentId, destinationId, currentCompany, destinationCompany);
        } else {
            alert("Unsupported planning combination.");
        }
    });
}

// Bus route finding (unchanged from your code)
function findNearbyStops(targetStop, stops) {
    if (!targetStop || !targetStop.lat || !targetStop.long) return [];
    return stops.filter(stop =>
        stop.lat && stop.long &&
        haversineDistance(targetStop.lat, targetStop.long, stop.lat, stop.long) <= 1000
    );
}

function findBusRoutes(startStopId, endStopId, startCompany, endCompany) {
    const allStops = [...kmbStops.map(s => ({ ...s, company: 'KMB' })), ...citybusStops.map(s => ({ ...s, company: 'Citybus' }))];
    const startStopData = allStops.find(s => s.stop === startStopId && s.company === startCompany);
    const endStopData = allStops.find(s => s.stop === endStopId && s.company === endCompany);
    if (!routeDiv) return;

    if (!startStopData || !endStopData) {
        routeDiv.innerHTML = '<p>Invalid bus stop selection.</p>';
        return;
    }
    if (!startStopData.lat || !endStopData.lat) {
        routeDiv.innerHTML = '<p>Missing coordinates for selected stops.</p>';
        return;
    }

    const startStopsNearby = findNearbyStops(startStopData, allStops);
    const endStopsNearby = findNearbyStops(endStopData, allStops);
    const startStopIdsNearby = startStopsNearby.map(s => s.stop);
    const endStopIdsNearby = endStopsNearby.map(s => s.stop);

    const directRoutes = [];
    const companiesToSearch = ['KMB', 'Citybus'];

    companiesToSearch.forEach(company => {
        const stops = company === 'KMB' ? kmbStops : citybusStops;
        const routes = company === 'KMB' ? kmbRoutes : citybusRoutes;
        const routeStopsMap = company === 'KMB' ? kmbRouteStopsMap : citybusRouteStopsMap;

        for (const route of routes) {
            for (const direction of ['outbound', 'inbound']) {
                const key = `${route.route}-${direction}`;
                const stopsOnRouteList = routeStopsMap[key] || [];
                if (stopsOnRouteList.length === 0) continue;

                const startMatchesOnRoute = stopsOnRouteList.filter(id => startStopIdsNearby.includes(id));
                const endMatchesOnRoute = stopsOnRouteList.filter(id => endStopIdsNearby.includes(id));

                if (startMatchesOnRoute.length > 0 && endMatchesOnRoute.length > 0) {
                    let closestBoardingStopId = null, minBoardingDistance = Infinity;
                    for (const nearbyId of startMatchesOnRoute) {
                        const nearbyStopOnRoute = allStops.find(s => s.stop === nearbyId);
                        if (!nearbyStopOnRoute || !nearbyStopOnRoute.lat) continue;
                        const distance = haversineDistance(startStopData.lat, startStopData.long, nearbyStopOnRoute.lat, nearbyStopOnRoute.long);
                        if (distance < minBoardingDistance) {
                            minBoardingDistance = distance;
                            closestBoardingStopId = nearbyId;
                        }
                    }
                    if (!closestBoardingStopId) continue;
                    const boardingIndex = stopsOnRouteList.indexOf(closestBoardingStopId);

                    let closestAlightingStopId = null, minAlightingDistance = Infinity;
                    for (const nearbyId of endMatchesOnRoute) {
                        const nearbyStopOnRoute = allStops.find(s => s.stop === nearbyId);
                        if (!nearbyStopOnRoute || !nearbyStopOnRoute.lat) continue;
                        const alightIndex = stopsOnRouteList.indexOf(nearbyId);
                        if (alightIndex > boardingIndex) {
                            const distance = haversineDistance(endStopData.lat, endStopData.long, nearbyStopOnRoute.lat, nearbyStopOnRoute.long);
                            if (distance < minAlightingDistance) {
                                minAlightingDistance = distance;
                                closestAlightingStopId = nearbyId;
                            }
                        }
                    }

                    if (closestAlightingStopId) {
                        const stopDetails = stopsOnRouteList.map(id => {
                            const stopInfo = allStops.find(s => s.stop === id);
                            return { id, name: stopInfo ? (stopInfo.name_en || `Stop ${id}`) : `Stop ${id}` };
                        });
                        directRoutes.push({
                            route: route.route, direction, stops: stopDetails,
                            boardingStop: closestBoardingStopId, alightingStop: closestAlightingStopId,
                            boardingDistance: minBoardingDistance, alightingDistance: minAlightingDistance,
                            company: company
                        });
                    }
                }
            }
        }
    });

    if (directRoutes.length > 0) {
        routeDiv.innerHTML = `<h3>Direct Bus Routes</h3>` + renderDirectBusRoutes(directRoutes, allStops);
    } else {
        routeDiv.innerHTML = '<p>No direct bus routes found within reasonable walking distance of the selected stops.</p>';
    }
}

function renderDirectBusRoutes(routes, stopsLookup) {
    if (!routes || routes.length === 0) return '';
    return routes.sort((a, b) => a.boardingDistance - b.boardingDistance)
        .map((route, index) => {
            const boardingStop = stopsLookup.find(s => s.stop === route.boardingStop);
            const alightingStop = stopsLookup.find(s => s.stop === route.alightingStop);
            const boardingName = boardingStop ? boardingStop.name_en || `Stop ${route.boardingStop}` : `Stop ${route.boardingStop}`;
            const alightingName = alightingStop ? alightingStop.name_en || `Stop ${route.alightingStop}` : `Stop ${route.alightingStop}`;
            const startIndex = route.stops.findIndex(s => s.id === route.boardingStop);
            const endIndex = route.stops.findIndex(s => s.id === route.alightingStop);
            const numStops = (endIndex > startIndex && startIndex !== -1) ? endIndex - startIndex : 'N/A';

            const summary = `
                <div class="route-option" id="route-summary-${index}" data-route="${route.route}" data-direction="${route.direction}" data-boarding-stop="${route.boardingStop}" data-company="${route.company}" onclick="toggleRouteDetails('route-details-${index}', this)">
                    <strong>${route.company} Route ${route.route} (${route.direction === 'outbound' ? 'Outbound' : 'Inbound'})</strong> - ${numStops} stops<br>
                    <small>Walk ${Math.round(route.boardingDistance)}m to board at ${boardingName}. Alight at ${alightingName} (Walk ${Math.round(route.alightingDistance)}m).</small>
                </div>`;
            let details = `<div class="route-details" style="display: none;" id="route-details-${index}"><ul class="stop-list">`;
            if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
                for (let i = startIndex; i <= endIndex; i++) {
                    const stop = route.stops[i];
                    if (!stop) continue;
                    const className = stop.id === route.boardingStop ? 'boarding-stop' : stop.id === route.alightingStop ? 'alighting-stop' : '';
                    const etaSpan = stop.id === route.boardingStop ? `<span id="eta-${index}" class="eta-placeholder"></span>` : '';
                    details += `<li class="${className}">${stop.name || 'Unknown Stop'}${etaSpan}</li>`;
                }
            } else {
                details += '<li>Route segment unavailable.</li>';
            }
            details += '</ul></div>';
            return summary + details;
        }).join('');
}

function toggleRouteDetails(detailsId, summaryElement) {
    const detailsDiv = document.getElementById(detailsId);
    if (!detailsDiv || !summaryElement) return;
    const etaSpan = detailsDiv.querySelector('.eta-placeholder');

    if (detailsDiv.style.display === 'none' || !detailsDiv.style.display) {
        document.querySelectorAll('.route-details').forEach(div => { if (div.id !== detailsId) div.style.display = 'none'; });
        detailsDiv.style.display = 'block';
        if (etaSpan) {
            const route = summaryElement.getAttribute('data-route');
            const direction = summaryElement.getAttribute('data-direction');
            const boardingStop = summaryElement.getAttribute('data-boarding-stop');
            const company = summaryElement.getAttribute('data-company');
            fetchETA(route, direction, boardingStop, detailsId, company, etaSpan);
        }
    } else {
        detailsDiv.style.display = 'none';
    }
}

async function fetchETA(route, direction, stopId, detailsId, company, etaSpanElement) {
    if (!etaSpanElement) return;
    etaSpanElement.textContent = ` (Fetching ETA...)`;
    try {
        const url = company === 'KMB' ? `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/1` : `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let relevantEtas = [];
        if (company === 'KMB') {
            relevantEtas = data.data.filter(e => e.route === route && e.dir === (direction === 'outbound' ? 'O' : 'I') && e.stop === stopId);
        } else {
            const dirMap = { "outbound": "O", "inbound": "I" };
            relevantEtas = data.data.filter(e => e.route === route && e.dir === dirMap[direction] && e.stop === stopId);
        }

        relevantEtas.sort((a, b) => (a.eta_seq || a.seq || 0) - (b.eta_seq || b.seq || 0) || new Date(a.eta) - new Date(b.eta));

        if (relevantEtas.length > 0) {
            const eta = relevantEtas[0];
            const etaTime = eta.eta ? new Date(eta.eta) : null;
            const generatedTime = new Date(eta.data_timestamp || data.generated_timestamp || Date.now());
            if (etaTime) {
                const minutesLeft = Math.round((etaTime - generatedTime) / 60000);
                etaSpanElement.textContent = minutesLeft >= 0 ? ` (~${minutesLeft} min)` : ` (Arriving)`;
            } else {
                etaSpanElement.textContent = eta.rmk_en ? ` (${eta.rmk_en})` : ` (Scheduled)`;
            }
        } else {
            etaSpanElement.textContent = ` (No specific ETA)`;
        }
        etaSpanElement.classList.remove('eta-placeholder');
    } catch (error) {
        etaSpanElement.textContent = ` (ETA unavailable)`;
        etaSpanElement.classList.remove('eta-placeholder');
    }
}

// Initialization
initializeData().then(() => {
    // Assuming loadSearchHistory is defined elsewhere; if not, remove or define it
    // loadSearchHistory();
    updateSearchableOptions();
});