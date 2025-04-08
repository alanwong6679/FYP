let citybusRoutes = [], citybusStops = [], citybusRouteStopsMap = {};
let kmbRoutes = [], kmbStops = [], kmbRouteStopsMap = {};
let mtrStations = [];
let citybusOptions = [];
let kmbOptions = [];
let currentMode = 'all';
let isGpsModeActive = false;
let userLocation = null;
const NEARBY_RADIUS_METERS = 600;
const SEARCH_HISTORY_KEY = 'routeSearchHistory';
let searchHistory = [];

const loadingDiv = document.getElementById('loading');
const currentStationInput = document.getElementById('currentStationInput');
const currentStationOptionsContainer = document.getElementById('currentStationOptions');
const destinationStationInput = document.getElementById('destinationStationInput');
const destinationStationOptionsContainer = document.getElementById('destinationStationOptions');
const modeSelectionBar = document.getElementById('modeSelectionBar');
const routeForm = document.getElementById('routeForm');

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

async function initializeData() {
    if (loadingDiv) loadingDiv.style.display = 'block';
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
        kmbStops = Object.entries(stopData.kmb_stops || {}).map(([stop, details]) => ({ stop, ...details }));
        citybusStops = Object.entries(stopData.ctb_stops || {}).map(([stop, details]) => ({ stop, ...details }));

        kmbOptions = kmbStops.map(stop => ({
            value: stop.stop, text: stop.name_en, type: 'Bus', company: 'KMB', lat: stop.lat, long: stop.long
        }));
        citybusOptions = citybusStops.map(stop => ({
            value: stop.stop, text: stop.name_en, type: 'Bus', company: 'Citybus', lat: stop.lat, long: stop.long
        }));

        mtrStations = getUniqueMTRStations();
        console.log('Initialized MTR stations:', mtrStations.length, mtrStations);

        const routeStopData = await routeStopResponse.json();
        kmbRouteStopsMap = Object.fromEntries(Object.entries(routeStopData.kmb_route_stops || {}).map(([key, stops]) => [key, stops.map(stop => stop.stop_id)]));
        citybusRouteStopsMap = Object.fromEntries(Object.entries(routeStopData.ctb_route_stops || {}).map(([key, stops]) => [key, stops.map(stop => stop.stop_id)]));

        localStorage.setItem('kmb_allRoutes', JSON.stringify(kmbRoutes));
        localStorage.setItem('kmb_allStops', JSON.stringify(kmbStops));
        localStorage.setItem('kmb_routeStopsMap', JSON.stringify(kmbRouteStopsMap));
        localStorage.setItem('citybus_allRoutes', JSON.stringify(citybusRoutes));
        localStorage.setItem('citybus_allStops', JSON.stringify(citybusStops));
        localStorage.setItem('citybus_routeStopsMap', JSON.stringify(citybusRouteStopsMap));
    } catch (error) {
        console.error('Initialization failed:', error);
        if (loadingDiv) loadingDiv.textContent = 'Error loading data. Please refresh.';
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

function getUniqueMTRStations() {
    const fallbackStations = [
        { value: 'ADM', text: 'Admiralty', type: 'MTR', lat: 22.2790, long: 114.1646 },
        { value: 'CEN', text: 'Central', type: 'MTR', lat: 22.2819, long: 114.1585 },
        { value: 'KOW', text: 'Kowloon', type: 'MTR', lat: 22.3167, long: 114.1667 },
        { value: 'TSY', text: 'Tsim Sha Tsui', type: 'MTR', lat: 22.2973, long: 114.1726 },
        { value: 'NOP', text: 'North Point', type: 'MTR', lat: 22.2880, long: 114.1917 },
        { value: 'WHA', text: 'Whampoa', type: 'MTR', lat: 22.3050, long: 114.1898 }
    ];

    if (typeof lines === 'undefined') {
        console.warn("'lines' variable not found. Using fallback MTR stations.");
        return fallbackStations.sort((a, b) => a.text.localeCompare(b.text));
    }

    const stationSet = new Set();
    const stationsFormatted = [];
    for (let line in lines) {
        lines[line].forEach(station => {
            if (!stationSet.has(station.value)) {
                stationSet.add(station.value);
                stationsFormatted.push({ value: station.value, text: station.text, type: 'MTR', lat: station.lat, long: station.long });
            }
        });
    }
    console.log('MTR stations from lines:', stationsFormatted);
    return stationsFormatted.length > 0 ? stationsFormatted.sort((a, b) => a.text.localeCompare(b.text)) : fallbackStations.sort((a, b) => a.text.localeCompare(b.text));
}

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
            reject(new Error("Geolocation not supported."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                console.log("Location obtained:", userLocation);
                resolve(userLocation);
            },
            error => {
                userLocation = null;
                console.error("Geolocation error:", error);
                reject(new Error("Could not get location: " + error.message));
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    });
}

function setupSearchable(inputId, optionsId, isStartingInput = false) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);
    if (!input || !optionsContainer) return;

    const filterAndDisplayOptions = () => {
        const filter = input.value.toLowerCase();
        const currentSource = JSON.parse(input.dataset.optionsSource || '[]');
        const filteredOptions = currentSource.filter(option => option.text.toLowerCase().includes(filter));

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
                });
                optionsContainer.appendChild(div);
            });
        }
        optionsContainer.style.display = filteredOptions.length > 0 ? 'block' : 'none';
    };

    input.addEventListener('input', filterAndDisplayOptions);
    input.addEventListener('focus', filterAndDisplayOptions);
    document.addEventListener('click', event => {
        if (!input.contains(event.target) && !optionsContainer.contains(event.target)) {
            optionsContainer.style.display = 'none';
        }
    });
}

function updateSearchableOptions() {
    let baseOptions = [];
    console.log('Current mode:', currentMode);
    switch (currentMode) {
        case 'MTR': 
            baseOptions = [...mtrStations];
            console.log('MTR options:', baseOptions.length, baseOptions);
            break;
        case 'Bus': 
            baseOptions = [...citybusOptions, ...kmbOptions].sort((a, b) => a.text.localeCompare(b.text));
            console.log('Bus options:', baseOptions.length, baseOptions);
            break;
        case 'all': 
        default: 
            baseOptions = [...mtrStations, ...citybusOptions, ...kmbOptions].sort((a, b) => a.text.localeCompare(b.text));
            console.log('All options - MTR:', mtrStations.length, 'Citybus:', citybusOptions.length, 'KMB:', kmbOptions.length, 'Total:', baseOptions.length, baseOptions);
            break;
    }

    let startOptions = baseOptions;
    if (isGpsModeActive && userLocation) {
        startOptions = baseOptions
            .map(option => ({
                ...option,
                distance: haversineDistance(userLocation.latitude, userLocation.longitude, option.lat, option.long)
            }))
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

function loadSearchHistory() {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (saved) searchHistory = JSON.parse(saved).slice(0, 3);
    displaySearchHistory();
}

function saveSearch(currentId, currentType, currentCompany, destinationId, destinationType, destinationCompany) {
    const currentText = currentStationInput.value || 'Unknown Start';
    const destText = destinationStationInput.value || 'Unknown Dest';
    const searchEntry = {
        currentId, currentType, currentCompany: currentCompany || '', currentText,
        destinationId, destinationType, destinationCompany: destinationCompany || '', destinationText: destText,
        timestamp: Date.now()
    };
    searchHistory = searchHistory.filter(entry => 
        !(entry.currentId === currentId && entry.destinationId === destinationId && 
          entry.currentType === currentType && entry.destinationType === destinationType &&
          entry.currentCompany === currentCompany && entry.destinationCompany === destinationCompany)
    );
    searchHistory.unshift(searchEntry);
    searchHistory = searchHistory.slice(0, 3);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    displaySearchHistory();
}

function displaySearchHistory() {
    const historyContainer = document.getElementById('searchHistory');
    if (!historyContainer) return;
    historyContainer.innerHTML = '<h3>Search History</h3>';
    if (searchHistory.length === 0) {
        historyContainer.innerHTML += '<p>No Search History.</p>';
        return;
    }
    searchHistory.forEach((entry, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.index = index;
        historyItem.innerHTML = `
            <span>${entry.currentText} → ${entry.destinationText}</span>
            <small>(${entry.currentType}${entry.currentCompany ? '-' + entry.currentCompany : ''} to ${entry.destinationType}${entry.destinationCompany ? '-' + entry.destinationCompany : ''})</small>
        `;
        historyItem.addEventListener('click', () => repeatSearch(entry));
        historyContainer.appendChild(historyItem);
    });
}

function repeatSearch(entry) {
    let url = '/general_schedule.html?';
    if (entry.currentType === 'MTR' && entry.destinationType === 'MTR') {
        url += `currentStation=${entry.currentId}&destinationStation=${entry.destinationId}`;
    } else if (entry.currentType === 'Bus' && entry.destinationType === 'MTR') {
        url += `startBusStop=${entry.currentId}&startCompany=${entry.currentCompany}&destinationStation=${entry.destinationId}`;
    } else if (entry.currentType === 'MTR' && entry.destinationType === 'Bus') {
        url += `currentStation=${entry.currentId}&endBusStop=${entry.destinationId}&endCompany=${entry.destinationCompany}`;
    } else if (entry.currentType === 'Bus' && entry.destinationType === 'Bus') {
        url += `startBusStop=${entry.currentId}&startCompany=${entry.currentCompany}&endBusStop=${entry.destinationId}&endCompany=${entry.destinationCompany}`;
    }
    window.location.href = url;
}

initializeData().then(() => {
    loadSearchHistory();
    updateSearchableOptions();

    if (modeSelectionBar) {
        modeSelectionBar.addEventListener('click', event => {
            const targetButton = event.target.closest('.mode-button');
            if (!targetButton) return;
            const selectedMode = targetButton.dataset.mode;
            console.log('Switching to mode:', selectedMode);
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

    const swapButton = document.getElementById('swapStations');
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

    if (routeForm) {
        routeForm.addEventListener('submit', e => {
            e.preventDefault();
            const currentType = currentStationInput.dataset.type;
            const destinationType = destinationStationInput.dataset.type;
            const currentId = currentStationInput.dataset.value;
            const destinationId = destinationStationInput.dataset.value;
            const currentCompany = currentStationInput.dataset.company;
            const destinationCompany = destinationStationInput.dataset.company;
            if (!currentId || !destinationId) {
                alert("Please select both a starting and destination station.");
                return;
            }
            saveSearch(currentId, currentType, currentCompany, destinationId, destinationType, destinationCompany);
            let url = '/general_schedule.html?';
            if (currentType === 'MTR' && destinationType === 'MTR') {
                url += `currentStation=${currentId}&destinationStation=${destinationId}`;
            } else if (currentType === 'Bus' && destinationType === 'MTR') {
                url += `startBusStop=${currentId}&startCompany=${currentCompany}&destinationStation=${destinationId}`;
            } else if (currentType === 'MTR' && destinationType === 'Bus') {
                url += `currentStation=${currentId}&endBusStop=${destinationId}&endCompany=${destinationCompany}`;
            } else if (currentType === 'Bus' && destinationType === 'Bus') {
                url += `startBusStop=${currentId}&startCompany=${currentCompany}&endBusStop=${destinationId}&endCompany=${destinationCompany}`;
            }
            window.location.href = url;
        });
    }

    const statusButton = document.getElementById('statusButton');
    const statusModal = document.getElementById('statusModal');
    const closeModal = document.getElementById('closeModal');
    if (statusButton) statusButton.addEventListener('click', () => { statusModal.style.display = 'flex'; displayTrainStatus(); });
    if (closeModal) closeModal.addEventListener('click', () => { statusModal.style.display = 'none'; });
    window.addEventListener('click', event => { if (event.target === statusModal) statusModal.style.display = 'none'; });

    if (typeof getTemperature === 'function') getTemperature();
});