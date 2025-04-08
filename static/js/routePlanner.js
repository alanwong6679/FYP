

const statusButton = document.getElementById('statusButton');
const statusModal = document.getElementById('statusModal');
const closeModal = document.getElementById('closeModal');
const loadingDiv = document.getElementById('loading');
const currentStationInput = document.getElementById('currentStationInput');
const destinationStationInput = document.getElementById('destinationStationInput');
const routeForm = document.getElementById('routeForm');
const routeDiv = document.getElementById('route');
const swapButton = document.getElementById('swapStations');
const gpsToggleButton = document.getElementById('gpsToggleBtn');
const modeSelectionBar = document.getElementById('modeSelectionBar');
const currentStationOptionsContainer = document.getElementById('currentStationOptions');
const destinationStationOptionsContainer = document.getElementById('destinationStationOptions');


if(statusButton && statusModal) {
    statusButton.addEventListener('click', () => {
        statusModal.style.display = 'flex';
        displayTrainStatus();
    });
}

if(closeModal && statusModal) {
    closeModal.addEventListener('click', () => {
        statusModal.style.display = 'none';
    });
}

window.addEventListener('click', (event) => {
    if (statusModal && event.target === statusModal) {
        statusModal.style.display = 'none';
    }
});

function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            const age = (Date.now() - timestamp) / (1000 * 60 * 60);
            if (age < 24) return data;
        } catch (e) { console.error("Failed parsing cache for", key, e); return null;}
    }
    return null;
}

function setCachedData(key, data) {
     try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
     } catch (e) { console.error("Failed setting cache for", key, e); }
}

async function initializeData() {
    // ... (fetching logic) ...
    try {
         // ... (inside the try block, after fetching) ...
         mtrStations = getUniqueMTRStations();
         citybusOptions = citybusStops.map(/*...*/);
         kmbOptions = kmbStops.map(/*...*/);

         console.log("Data Fetch Complete:"); // <<< ADD LOG
         console.log("MTR Stations:", mtrStations.length, mtrStations[0] || 'None'); // Log count and first item
         console.log("Citybus Stops:", citybusStops.length, citybusStops[0] || 'None');
         console.log("KMB Stops:", kmbStops.length, kmbStops[0] || 'None');
         console.log("Citybus Options:", citybusOptions.length, citybusOptions[0] || 'None');
         console.log("KMB Options:", kmbOptions.length, kmbOptions[0] || 'None');


        if (citybusOptions.length === 0 && kmbOptions.length === 0 && mtrStations.length === 0) { // Use options count here now
            // ...
        } else {
            // ...
            updateSearchableOptions(); // Called here
        }
    } catch (error) { /* ... */ }
}

let citybusRoutes = [], citybusStops = [], citybusRouteStopsMap = {};
let kmbRoutes = [], kmbStops = [], kmbRouteStopsMap = {};
let mtrStations = [];
let citybusOptions = [];
let kmbOptions = [];
let currentMode = 'all';
let isGpsModeActive = false;
let userLocation = null;
const NEARBY_RADIUS_METERS = 6000;


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
                } catch (error) { }
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
    } catch (error) { console.error('Error fetching Citybus data:', error); }
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
                } catch (error) { }
            }
        });
        await Promise.all(routePromises);


        const rawStops = Object.values(tempStopsMap);
        kmbStops = await Promise.all(rawStops.map(async stop => {
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
    } catch (error) { console.error('Error fetching KMB data:', error); }
}

 const mtrCoordsData = { /* ADD YOUR MTR COORDINATE DATA HERE e.g. "CEN": { lat: 22.2820, long: 114.1580 } */ };
 function getMTRCoords(stationCode) {
     return mtrCoordsData[stationCode] || { lat: null, long: null };
 }

function getUniqueMTRStations() {
     const stationSet = new Set();
     const stationsFormatted = [];
     if (typeof lines === 'undefined') { return []; }
     for (let line in lines) {
         lines[line].forEach(station => {
             if (!stationSet.has(station.value)) {
                 stationSet.add(station.value);
                 const coords = getMTRCoords(station.value);
                 stationsFormatted.push({
                     value: station.value, text: station.text, type: 'MTR',
                     lat: coords.lat, long: coords.long
                 });
             }
         });
     }
     stationsFormatted.sort((a, b) => a.text.localeCompare(b.text));
     return stationsFormatted;
 }


function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
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
            return reject(new Error("Geolocation is not supported by this browser."));
        }
        console.log("Requesting user location..."); // Add log
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Success!
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy // Good to know accuracy
                };
                 console.log("Location obtained:", userLocation);
                resolve(userLocation);
            },
            (error) => {
                // Failure
                userLocation = null; // Ensure location is null on error
                let message = "Could not get location: ";
                switch (error.code) {
                    case error.PERMISSION_DENIED: message += "Permission denied."; break;
                    case error.POSITION_UNAVAILABLE: message += "Location unavailable."; break;
                    case error.TIMEOUT: message += "Request timed out."; break; // More concise
                    default: message += `Unknown error (Code: ${error.code}).`; break;
                }
                console.error("Geolocation Error:", message, error);
                reject(new Error(message)); // Reject with a clear message
            },
            {
                enableHighAccuracy: false, // <<< TRY SETTING TO FALSE FIRST - May be faster, less accurate
                timeout: 10000,           // <<< INCREASE TIMEOUT SLIGHTLY (10 seconds)
                maximumAge: 60000          // Allow cached location up to 1 minute old
            }
        );
    });
}

function setupSearchable(inputId, optionsId, isStartingInput = false) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);
    if (!input || !optionsContainer) return;

    // Keep track of the last successfully displayed options to avoid flicker
    let lastDisplayedJson = '';

    const filterAndDisplayOptions = () => {
        const filter = input.value.toLowerCase();
         // Source data potentially includes distances if isStartingInput & isGpsModeActive
        const currentSourceJson = input.dataset.optionsSource || '[]';
         const currentSource = JSON.parse(currentSourceJson);


        const filteredOptions = currentSource.filter(option =>
            option.text && option.text.toLowerCase().includes(filter)
        );

        // Avoid unnecessary redraw if the filtered list hasn't changed content significantly
         // (This check might be too simple if sorting changes but content is same)
        const currentFilteredJson = JSON.stringify(filteredOptions.map(o => o.value + (o.distance ?? ''))); // Basic check string
         if(currentFilteredJson === lastDisplayedJson && optionsContainer.style.display === 'block') {
              // If content seems same and dropdown is open, don't redraw (prevents flicker)
              // However, this might prevent updates if only the filter text changes slightly. Consider removing if causing issues.
               // console.log("Skipping redraw for", inputId);
              // return;
         }


        optionsContainer.innerHTML = ''; // Clear only when redraw is needed

        if (filteredOptions.length === 0) {
            const noResultDiv = document.createElement('div');
            noResultDiv.textContent = isGpsModeActive && isStartingInput ? 'No nearby locations found.' : 'No matches found.';
            noResultDiv.style.padding = '10px';
            noResultDiv.style.fontStyle = 'italic';
            noResultDiv.style.color = '#888';
             optionsContainer.appendChild(noResultDiv);
         } else {
             filteredOptions.forEach(option => {
                 const div = document.createElement('div');
                 let displayText = `${option.text} (${option.type}${option.type === 'Bus' ? ' - ' + option.company : ''})`;

                // Add distance *only* if starting input, GPS active, and distance is valid
                 if (isStartingInput && isGpsModeActive && typeof option.distance === 'number' && option.distance !== Infinity) {
                      displayText += ` (${Math.round(option.distance)}m)`;
                  }

                 div.textContent = displayText;
                 div.setAttribute('role', 'option');
                 div.dataset.value = option.value;
                 div.dataset.text = option.text;
                 div.dataset.type = option.type;
                 div.dataset.company = option.company || '';
                 if (typeof option.distance === 'number') { div.dataset.distance = option.distance; } // Store distance if present

                 div.addEventListener('click', function() {
                    input.value = option.text; // Display original name on selection
                    input.dataset.value = option.value;
                    input.dataset.type = option.type;
                    input.dataset.company = option.company || '';
                     // Maybe store selected distance? input.dataset.selectedDistance = option.distance;
                    optionsContainer.style.display = 'none';
                    optionsContainer.setAttribute('aria-hidden', 'true');
                     input.setAttribute('aria-expanded', 'false');
                 });
                 optionsContainer.appendChild(div);
             });
         }


         optionsContainer.style.display = 'block'; // Always show container when filtering (might contain 'No results')
         optionsContainer.setAttribute('aria-hidden', 'false');
         input.setAttribute('aria-expanded', 'true');

        lastDisplayedJson = currentFilteredJson; // Update cache of displayed content
    };


     let inputTimeout;
     input.removeEventListener('input', input.inputHandler); // Remove previous if any
     input.inputHandler = () => { clearTimeout(inputTimeout); inputTimeout = setTimeout(filterAndDisplayOptions, 150); }; // Store handler ref
     input.addEventListener('input', input.inputHandler);

    input.removeEventListener('focus', input.focusHandler);
     input.focusHandler = filterAndDisplayOptions;
     input.addEventListener('focus', input.focusHandler);


    // Re-run filter/display now to populate based on current source dataset
     filterAndDisplayOptions();
     // Hide initially unless input has focus
     if (document.activeElement !== input) {
         optionsContainer.style.display = 'none';
          optionsContainer.setAttribute('aria-hidden', 'true');
          input.setAttribute('aria-expanded', 'false');
     }

 }

 function updateSearchableOptions() {
    let baseOptions = [];
    // Ensure source arrays are arrays before spreading
    const validMTR = Array.isArray(mtrStations) ? mtrStations : [];
    const validCitybus = Array.isArray(citybusOptions) ? citybusOptions : [];
    const validKMB = Array.isArray(kmbOptions) ? kmbOptions : [];

    switch (currentMode) {
        case 'MTR':
            baseOptions = [...validMTR];
            break;
        case 'Bus':
            // Combine and sort, handling potential missing 'text'
            baseOptions = [...validCitybus, ...validKMB].sort((a, b) => (a.text || '').localeCompare(b.text || ''));
            break;
        case 'all':
        default:
             // Combine and sort all, handling potential missing 'text'
            baseOptions = [...validMTR, ...validCitybus, ...validKMB].sort((a, b) => (a.text || '').localeCompare(b.text || ''));
            break;
    }

    // --- Declare destOptions immediately after baseOptions is set ---
    // Ensure distance property is removed for destination list
     let destOptions = baseOptions.map(({ distance, ...rest }) => rest);
     // -------------------------------------------------------------

    let startOptions = []; // Declare startOptions here

    // Apply GPS filter *only* to starting station options if active
    if (isGpsModeActive && userLocation) {
        // console.log("Filtering by GPS. User location:", userLocation); // Optional log
        startOptions = baseOptions.map(opt => {
            const dist = haversineDistance(
                userLocation.latitude, userLocation.longitude,
                opt.lat != null ? parseFloat(opt.lat) : null,
                opt.long != null ? parseFloat(opt.long) : null
            );
            return { ...opt, distance: dist };
        })
        .filter(opt => opt.distance <= NEARBY_RADIUS_METERS)
        .sort((a, b) => a.distance - b.distance);

    } else {

        startOptions = baseOptions.map(({ distance, ...rest }) => rest);
    }


    if (currentStationInput && currentStationOptionsContainer) {
        console.log(`Setting START dataset with ${startOptions.length} options. Content Sample:`, JSON.stringify(startOptions.slice(0, 2))); // <<< ADD LOG + SAMPLE
       currentStationInput.dataset.optionsSource = JSON.stringify(startOptions);
       setupSearchable('currentStationInput', 'currentStationOptions', true);
       // ... (trigger display if focused) ...
   }
   if (destinationStationInput && destinationStationOptionsContainer) {
         console.log(`Setting DEST dataset with ${destOptions.length} options. Content Sample:`, JSON.stringify(destOptions.slice(0, 2))); // <<< ADD LOG + SAMPLE
       destinationStationInput.dataset.optionsSource = JSON.stringify(destOptions);
       setupSearchable('destinationStationInput', 'destinationStationOptions', false);
       // ... (trigger display if focused) ...
   }
}



if (modeSelectionBar) {
    modeSelectionBar.addEventListener('click', (event) => {
        const targetButton = event.target.closest('.mode-button:not(.gps-toggle)');
        if (!targetButton) return;
        const selectedMode = targetButton.dataset.mode;
        if (selectedMode === currentMode) return;

        modeSelectionBar.querySelectorAll('.mode-button:not(.gps-toggle)').forEach(button => button.classList.remove('active'));
        targetButton.classList.add('active');
        currentMode = selectedMode;
        updateSearchableOptions();

        if(currentStationInput) { currentStationInput.value = ''; currentStationInput.dataset.value = ''; currentStationInput.dataset.type = ''; currentStationInput.dataset.company = '';}
        if(destinationStationInput) { destinationStationInput.value = ''; destinationStationInput.dataset.value = ''; destinationStationInput.dataset.type = ''; destinationStationInput.dataset.company = '';}
        if(currentStationOptionsContainer) currentStationOptionsContainer.style.display = 'none';
        if(destinationStationOptionsContainer) destinationStationOptionsContainer.style.display = 'none';
    });
}

if (gpsToggleButton) {
    gpsToggleButton.addEventListener('click', async () => {
        isGpsModeActive = !isGpsModeActive;
        gpsToggleButton.classList.toggle('active', isGpsModeActive);
        gpsToggleButton.title = isGpsModeActive ? "Turn off nearby location filter" : "Filter starting station by nearby locations";

        if (isGpsModeActive) {
             if(loadingDiv){ loadingDiv.textContent = "Getting your location..."; loadingDiv.style.display = 'block'; }
            try {
                await getUserLocation();
                updateSearchableOptions();
            } catch (error) {
                alert("Could not get location: " + error.message);
                isGpsModeActive = false;
                gpsToggleButton.classList.remove('active');
                userLocation = null;
                updateSearchableOptions();
            } finally { if(loadingDiv) loadingDiv.style.display = 'none'; }
        } else {
            userLocation = null;
            updateSearchableOptions();
        }
         if(currentStationInput) { currentStationInput.value = ''; currentStationInput.dataset.value = ''; currentStationInput.dataset.type = ''; currentStationInput.dataset.company = ''; }
        if(currentStationOptionsContainer) currentStationOptionsContainer.style.display = 'none';
    });
}

if (swapButton) {
    swapButton.addEventListener('click', function() {
        if (!currentStationInput || !destinationStationInput) return;
        const tempValue = currentStationInput.value; const tempDataValue = currentStationInput.dataset.value; const tempDataType = currentStationInput.dataset.type; const tempDataCompany = currentStationInput.dataset.company;
        currentStationInput.value = destinationStationInput.value; currentStationInput.dataset.value = destinationStationInput.dataset.value || ''; currentStationInput.dataset.type = destinationStationInput.dataset.type || ''; currentStationInput.dataset.company = destinationStationInput.dataset.company || '';
        destinationStationInput.value = tempValue; destinationStationInput.dataset.value = tempDataValue || ''; destinationStationInput.dataset.type = tempDataType || ''; destinationStationInput.dataset.company = tempDataCompany || '';
    });
}

function findNearbyStops(targetStop, stops) {
     if (!targetStop || !targetStop.lat || !targetStop.long) return [];
     return stops.filter(stop =>
         stop.lat && stop.long &&
         haversineDistance(targetStop.lat, targetStop.long, stop.lat, stop.long) <= 1000 // 1km radius for transfers maybe
     );
}


function findBusRoutes(startStopId, endStopId, startCompany, endCompany) {
    const allStops = [...kmbStops.map(s => ({ ...s, company: 'KMB' })), ...citybusStops.map(s => ({ ...s, company: 'Citybus' }))];
    const startStopData = allStops.find(s => s.stop === startStopId && s.company === startCompany);
    const endStopData = allStops.find(s => s.stop === endStopId && s.company === endCompany);
     if (!routeDiv) return;

    if (!startStopData || !endStopData) { routeDiv.innerHTML = '<p>Invalid bus stop selection.</p>'; return; }
    if (!startStopData.lat || !endStopData.lat) { routeDiv.innerHTML = '<p>Missing coordinates for selected stops.</p>'; return; }

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
                     for(const nearbyId of startMatchesOnRoute) {
                         const nearbyStopOnRoute = allStops.find(s => s.stop === nearbyId);
                         if(!nearbyStopOnRoute || !nearbyStopOnRoute.lat) continue;
                         const distance = haversineDistance(startStopData.lat, startStopData.long, nearbyStopOnRoute.lat, nearbyStopOnRoute.long);
                         if(distance < minBoardingDistance){ minBoardingDistance = distance; closestBoardingStopId = nearbyId; }
                     }
                    if(!closestBoardingStopId) continue;
                    const boardingIndex = stopsOnRouteList.indexOf(closestBoardingStopId);

                    let closestAlightingStopId = null, minAlightingDistance = Infinity;
                    for (const nearbyId of endMatchesOnRoute) {
                        const nearbyStopOnRoute = allStops.find(s => s.stop === nearbyId);
                        if (!nearbyStopOnRoute || !nearbyStopOnRoute.lat) continue;
                        const alightIndex = stopsOnRouteList.indexOf(nearbyId);
                        if (alightIndex > boardingIndex) {
                             const distance = haversineDistance(endStopData.lat, endStopData.long, nearbyStopOnRoute.lat, nearbyStopOnRoute.long);
                            if (distance < minAlightingDistance) { minAlightingDistance = distance; closestAlightingStopId = nearbyId; }
                        }
                    }

                    if (closestAlightingStopId) {
                        const stopDetails = stopsOnRouteList.map(id => { const stopInfo = allStops.find(s => s.stop === id); return { id, name: stopInfo ? (stopInfo.name_en || `Stop ${id}`) : `Stop ${id}` }; });
                        directRoutes.push({ route: route.route, direction, stops: stopDetails, boardingStop: closestBoardingStopId, alightingStop: closestAlightingStopId, boardingDistance: minBoardingDistance, alightingDistance: minAlightingDistance, company: company });
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
    if(!routes || routes.length === 0) return '';
    return routes.sort((a,b)=> a.boardingDistance - b.boardingDistance)
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
         if(startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
            for(let i=startIndex; i <= endIndex; i++) {
                 const stop = route.stops[i];
                 if(!stop) continue;
                 const className = stop.id === route.boardingStop ? 'boarding-stop' : stop.id === route.alightingStop ? 'alighting-stop' : '';
                const etaSpan = stop.id === route.boardingStop ? `<span id="eta-${index}" class="eta-placeholder"></span>` : '';
                details += `<li class="${className}">${stop.name || 'Unknown Stop'}${etaSpan}</li>`;
             }
         } else { details += '<li>Route segment unavailable.</li>'; }
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
            const route = summaryElement.getAttribute('data-route'); const direction = summaryElement.getAttribute('data-direction'); const boardingStop = summaryElement.getAttribute('data-boarding-stop'); const company = summaryElement.getAttribute('data-company');
             fetchETA(route, direction, boardingStop, detailsId, company, etaSpan);
         }
     } else { detailsDiv.style.display = 'none'; }
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
         if (company === 'KMB') { relevantEtas = data.data.filter(e => e.route === route && e.dir === (direction === 'outbound' ? 'O' : 'I') && e.stop === stopId ); }
         else { const dirMap = { "outbound": "O", "inbound": "I" }; relevantEtas = data.data.filter(e => e.route === route && e.dir === dirMap[direction] && e.stop === stopId); }

         relevantEtas.sort((a, b) => (a.eta_seq || a.seq || 0) - (b.eta_seq || b.seq || 0) || new Date(a.eta) - new Date(b.eta));

         if (relevantEtas.length > 0) {
             const eta = relevantEtas[0];
             const etaTime = eta.eta ? new Date(eta.eta) : null;
             const generatedTime = new Date(eta.data_timestamp || data.generated_timestamp || Date.now());
             if(etaTime){
                 const minutesLeft = Math.round((etaTime - generatedTime) / 60000);
                 etaSpanElement.textContent = minutesLeft >= 0 ? ` (~${minutesLeft} min)` : ` (Arriving)`;
             } else { etaSpanElement.textContent = eta.rmk_en ? ` (${eta.rmk_en})` : ` (Scheduled)`; }
         } else { etaSpanElement.textContent = ` (No specific ETA)`; }
         etaSpanElement.classList.remove('eta-placeholder');
     } catch (error) { etaSpanElement.textContent = ` (ETA unavailable)`; etaSpanElement.classList.remove('eta-placeholder'); }
 }


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

        if (!currentId || !destinationId) { alert("Please select both starting and destination points."); return; }
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
        } else { alert("Unsupported planning combination."); }
    });
}

      // --- Initial Page Load ---
      document.addEventListener('click', function(event) {
        const inputs = [currentStationInput, destinationStationInput];
        const containers = [currentStationOptionsContainer, destinationStationOptionsContainer];

       for(let i=0; i< inputs.length; i++){
            const input = inputs[i];
            const optionsContainer = containers[i];
            if(input && optionsContainer && !input.contains(event.target) && !optionsContainer.contains(event.target)){
                optionsContainer.style.display = 'none';
                optionsContainer.setAttribute('aria-hidden', 'true');
                 if(document.activeElement !== input){ // Avoid hiding if user just clicked back into input
                    input.setAttribute('aria-expanded', 'false');
                }
            }
        }
    });
