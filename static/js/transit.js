// transit.js
const API_KEY = 'AIzaSyBBY8WRPKMG0sPNFkHAYNcCwkwTn4T5jGw';
let map;
let routeMarkers = [];
let routePolyline;
let kmbRouteList = null;
let ctbRouteList = null;
let minibusRouteList = null;
let selectedRoute = null;
let selectedBound = null;
let selectedProvider = null;
let selectedRouteId = null;
let currentInput = '';
let currentInfoWindow = null;
let debounceTimeout;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), { zoom: 12 });
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => map.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => {
                console.warn("Geolocation failed, using default center");
                map.setCenter({ lat: 22.3193, lng: 114.1694 });
            }
        );
    } else {
        console.warn("Geolocation not supported, using default center");
        map.setCenter({ lat: 22.3193, lng: 114.1694 });
    }
    loadRouteData();
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.container').prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function fetchWithRetry(url, retries = 5, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching ${url} (Attempt ${i + 1}/${retries})`);
            const response = await fetch(url);
            if (response.status === 429) {
                console.warn(`Rate limit exceeded for ${url}, retrying after ${backoff * Math.pow(2, i)}ms`);
                showError("Rate limit exceeded. Retrying...");
                await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
                continue;
            }
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
            const data = await response.json();
            console.log(`Successfully fetched ${url}:`, data);
            return data;
        } catch (err) {
            console.error(`Error fetching ${url}:`, err);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
        }
    }
}

async function loadRouteData() {
    const loadingMessage = document.getElementById('loadingMessage');

    function processKMBData(data) {
        const uniqueRoutes = [];
        const seen = new Set();
        data.forEach(route => {
            if (!route.route || !route.bound || !route.orig_en || !route.dest_en) {
                console.warn("Invalid KMB route entry:", route);
                return;
            }
            const key = `${route.route}-${route.bound}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueRoutes.push({ 
                    route: route.route, 
                    bound: route.bound, 
                    orig_en: route.orig_en, 
                    dest_en: route.dest_en, 
                    provider: 'kmb' 
                });
            }
        });
        return uniqueRoutes;
    }

    function processCTBData(data) {
        const uniqueRoutes = [];
        const seen = new Set();
        data.forEach(route => {
            if (!route.route || !route.orig_en) {
                console.warn("Invalid CTB route entry:", route);
                return;
            }
            const direction = route.direction || 'outbound';
            const dest_en = route.dest_en || route.dest_tc || 'Unknown Destination';
            const key = `${route.route}-${direction}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueRoutes.push({ 
                    route: route.route, 
                    bound: direction === 'outbound' ? 'O' : 'I', 
                    orig_en: route.orig_en, 
                    dest_en: dest_en, 
                    provider: 'ctb' 
                });
            }
        });
        return uniqueRoutes;
    }

    async function processMinibusData() {
        const minibusRouteResponse = await fetchWithRetry("https://data.etagmb.gov.hk/route");
        if (!minibusRouteResponse.data) throw new Error("Minibus route data is missing 'data' property");
        const routesData = minibusRouteResponse.data.routes;
        let minibusRoutes = [];
        for (const region in routesData) {
            if (Array.isArray(routesData[region])) {
                minibusRoutes.push(...routesData[region].map(route => ({ route, region })));
            }
        }
        const uniqueRoutes = [];
        const seen = new Set();
        for (const { route, region } of minibusRoutes) {
            const routeUrl = `https://data.etagmb.gov.hk/route/${region}/${route}`;
            try {
                const routeResponse = await fetchWithRetry(routeUrl);
                if (!routeResponse.data || !routeResponse.data[0]) continue;
                const service = routeResponse.data[0];
                service.directions.forEach(direction => {
                    const key = `${route}-${direction.route_seq}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueRoutes.push({
                            route: route,
                            bound: direction.route_seq,
                            route_id: service.route_id,
                            region: region,
                            orig_en: direction.orig_en || 'Loading...',
                            dest_en: direction.dest_en || 'Loading...',
                            provider: 'minibus'
                        });
                    }
                });
            } catch (err) {
                console.warn(`Failed to load details for minibus route ${route} in ${region}:`, err);
            }
        }
        return uniqueRoutes;
    }

    const cachedKMB = JSON.parse(localStorage.getItem('kmbRouteList'));
    if (cachedKMB && (Date.now() - cachedKMB.timestamp < CACHE_EXPIRY)) {
        kmbRouteList = cachedKMB.data;
        console.log("KMB routes loaded from cache:", kmbRouteList.length);
    } else {
        try {
            console.log("Fetching KMB routes...");
            const kmbRouteResponse = await fetchWithRetry("https://data.etabus.gov.hk/v1/transport/kmb/route/");
            if (!kmbRouteResponse.data) throw new Error("KMB route data is missing 'data' property");
            kmbRouteList = processKMBData(kmbRouteResponse.data);
            localStorage.setItem('kmbRouteList', JSON.stringify({ data: kmbRouteList, timestamp: Date.now() }));
            console.log("KMB routes fetched and cached:", kmbRouteList.length);
        } catch (err) {
            console.error("Failed to load KMB routes:", err);
            showError("Failed to load KMB routes. Using cached data if available.");
            if (cachedKMB) kmbRouteList = cachedKMB.data;
        }
    }

    const cachedCTB = JSON.parse(localStorage.getItem('ctbRouteList'));
    if (cachedCTB && (Date.now() - cachedCTB.timestamp < CACHE_EXPIRY)) {
        ctbRouteList = cachedCTB.data;
        console.log("CTB routes loaded from cache:", ctbRouteList.length);
    } else {
        try {
            console.log("Fetching CTB routes...");
            const ctbRouteResponse = await fetchWithRetry("https://rt.data.gov.hk/v2/transport/citybus/route/CTB");
            if (!ctbRouteResponse.data) throw new Error("CTB route data is missing 'data' property");
            ctbRouteList = processCTBData(ctbRouteResponse.data);
            localStorage.setItem('ctbRouteList', JSON.stringify({ data: ctbRouteList, timestamp: Date.now() }));
            console.log("CTB routes fetched and cached:", ctbRouteList.length);
        } catch (err) {
            console.error("Failed to load CTB routes:", err);
            showError("Failed to load CTB routes. Using cached data if available.");
            if (cachedCTB) ctbRouteList = cachedCTB.data;
        }
    }

    const cachedMinibus = JSON.parse(localStorage.getItem('minibusRouteList'));
    if (cachedMinibus && (Date.now() - cachedMinibus.timestamp < CACHE_EXPIRY)) {
        minibusRouteList = cachedMinibus.data;
        console.log("Minibus routes loaded from cache:", minibusRouteList.length);
    } else {
        try {
            console.log("Fetching Minibus routes...");
            minibusRouteList = await processMinibusData();
            localStorage.setItem('minibusRouteList', JSON.stringify({ data: minibusRouteList, timestamp: Date.now() }));
            console.log("Minibus routes fetched and cached:", minibusRouteList.length);
        } catch (err) {
            console.error("Failed to load Minibus routes:", err);
            showError("Failed to load Minibus routes. Using cached data if available.");
            if (cachedMinibus) minibusRouteList = cachedMinibus.data;
        }
    }

    if (kmbRouteList || ctbRouteList || minibusRouteList) {
        loadingMessage.textContent = "Route data loaded successfully!";
        setTimeout(() => loadingMessage.style.display = 'none', 2000);
    } else {
        loadingMessage.textContent = "No route data loaded. Please try again.";
    }
}

async function fetchRouteStops(provider, route, bound) {
    try {
        if (provider === 'kmb') {
            const data = await fetchWithRetry(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop`);
            return data.data.filter(item => item.route === route && item.bound === bound)
                .sort((a, b) => a.seq - b.seq);
        } else if (provider === 'ctb') {
            const direction = bound === 'O' ? 'outbound' : 'inbound';
            const data = await fetchWithRetry(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route}/${direction}`);
            return data.data ? data.data.sort((a, b) => a.seq - b.seq) : [];
        } else if (provider === 'minibus') {
            const routeEntry = minibusRouteList.find(r => r.route === route && r.bound === bound);
            if (!routeEntry || !routeEntry.route_id) {
                throw new Error(`No route_id found for minibus route ${route} bound ${bound}`);
            }
            const routeStopUrl = `https://data.etagmb.gov.hk/route-stop/${routeEntry.route_id}/${bound}`;
            const data = await fetchWithRetry(routeStopUrl);
            if (data.data && data.data.route_stops && data.data.route_stops.length > 0) {
                return data.data.route_stops.sort((a, b) => a.stop_seq - b.stop_seq);
            }
            return [];
        }
    } catch (err) {
        console.error(`Failed to fetch stops for ${provider} route ${route} bound ${bound}:`, err);
        return [];
    }
}

async function fetchStopDetails(provider, stopId, routeStopData = null) {
    try {
        if (provider === 'kmb') {
            const data = await fetchWithRetry(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopId}`);
            return data.data;
        } else if (provider === 'ctb') {
            const data = await fetchWithRetry(`https://rt.data.gov.hk/v2/transport/citybus/stop/${stopId}`);
            return data.data;
        } else if (provider === 'minibus') {
            const data = await fetchWithRetry(`https://data.etagmb.gov.hk/stop/${stopId}`);
            if (data.data && data.data.coordinates && data.data.coordinates.wgs84) {
                const stopName = routeStopData && (routeStopData.name_en || routeStopData.name_tc) 
                    ? (routeStopData.name_en || routeStopData.name_tc)
                    : (data.data.name_en || data.data.name_tc || 'Unknown Stop');
                return {
                    name_en: stopName,
                    lat: parseFloat(data.data.coordinates.wgs84.latitude),
                    long: parseFloat(data.data.coordinates.wgs84.longitude)
                };
            }
            return null;
        }
    } catch (err) {
        console.error(`Failed to fetch stop details for ${provider} stop ${stopId}:`, err);
        return null;
    }
}

async function fetchETA(stopId, provider) {
    try {
        if (provider === 'kmb') {
            const data = await fetchWithRetry(`https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`, 3);
            return data;
        } else if (provider === 'ctb') {
            const data = await fetchWithRetry(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${selectedRoute}`, 3);
            return data;
        } else if (provider === 'minibus') {
            const data = await fetchWithRetry(`https://data.etagmb.gov.hk/eta/stop/${stopId}`, 3);
            if (!data.data || data.data.length === 0) {
                return { data: [] };
            }
            const routeEntry = data.data.find(entry => 
                entry.enabled && 
                entry.route_id === selectedRouteId && 
                entry.route_seq === parseInt(selectedBound)
            );
            if (!routeEntry || !routeEntry.eta || routeEntry.eta.length === 0) {
                return { data: [] };
            }
            const formattedData = {
                data: routeEntry.eta.map(eta => ({
                    route: selectedRoute,
                    eta: eta.timestamp,
                    diff: eta.diff,
                    remark_en: eta.remarks_en || ''
                }))
            };
            return formattedData;
        }
    } catch (err) {
        console.error(`Error fetching ETA for ${provider} stop ${stopId}:`, err);
        return { data: [] };
    }
}

const routeListUl = document.getElementById("routeList");
const selectedRouteDisplay = document.getElementById("selectedRouteDisplay");
const keypad = document.getElementById("keypad");
const inputDisplay = document.getElementById("input-display");

if (inputDisplay.value === "undefined") {
    inputDisplay.value = "Enter Route Number";
}

keypad.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", function() {
        if (button.id === "clear-btn") {
            currentInput = '';
            inputDisplay.value = "Enter Route Number";
            filterRoutes();
        } else {
            if (currentInput === '' && inputDisplay.value === "Enter Route Number") {
                inputDisplay.value = '';
            }
            currentInput += button.dataset.value;
            inputDisplay.value = currentInput;
            filterRoutes();
        }
    });
});

function filterRoutes() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        routeListUl.innerHTML = '';
        if (!kmbRouteList && !ctbRouteList && !minibusRouteList) {
            routeListUl.innerHTML = '<li>Please wait for data to load...</li>';
            return;
        }
        const input = currentInput.toLowerCase();
        const kmbFilteredRoutes = kmbRouteList ? kmbRouteList.filter(route => route.route.toLowerCase().startsWith(input)) : [];
        const ctbFilteredRoutes = ctbRouteList ? ctbRouteList.filter(route => route.route.toLowerCase().startsWith(input)) : [];
        const minibusFilteredRoutes = minibusRouteList ? minibusRouteList.filter(route => route.route.toLowerCase().startsWith(input)) : [];
        const allFilteredRoutes = [...kmbFilteredRoutes, ...ctbFilteredRoutes, ...minibusFilteredRoutes];
        
        allFilteredRoutes.forEach((route) => {
            const li = document.createElement('li');
            li.textContent = `${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
            li.setAttribute('role', 'option');
            li.addEventListener('click', () => {
                selectedRoute = route.route;
                selectedBound = route.bound;
                selectedProvider = route.provider;
                selectedRouteId = route.route_id;
                selectedRouteDisplay.textContent = `Selected Route: ${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
                routeListUl.innerHTML = '';
            });
            routeListUl.appendChild(li);
        });
    }, 300);
}

function samplePath(path, maxPoints = 100) {
    if (path.length <= maxPoints) return path;
    const step = Math.floor(path.length / (maxPoints - 1));
    const sampled = [];
    for (let i = 0; i < path.length; i += step) {
        sampled.push(path[i]);
        if (sampled.length === maxPoints - 1) break;
    }
    sampled.push(path[path.length - 1]);
    return sampled;
}

document.getElementById("displayRoute").addEventListener("click", async function() {
    if (!selectedRoute || !selectedBound || !selectedProvider) {
        showError("Please select a route from the list.");
        return;
    }

    routeMarkers.forEach(marker => marker.setMap(null));
    routeMarkers = [];
    if (routePolyline) routePolyline.setMap(null);
    if (currentInfoWindow) currentInfoWindow.close();
    currentInfoWindow = null;
    document.getElementById("etaContainer").innerHTML = "";

    try {
        const stopsForRoute = await fetchRouteStops(selectedProvider, selectedRoute, selectedBound);
        if (!stopsForRoute || stopsForRoute.length === 0) {
            showError(`No stops found for route ${selectedRoute} (${selectedProvider.toUpperCase()}).`);
            return;
        }

        const stops = await Promise.all(
            stopsForRoute.map(async (item, index) => {
                const stop = await fetchStopDetails(selectedProvider, item.stop || item.stop_id, item);
                if (!stop) return null;

                const coords = { 
                    lat: parseFloat(stop.lat || stop.latitude || (stop.coordinates && stop.coordinates.wgs84 ? stop.coordinates.wgs84.latitude : null)), 
                    lng: parseFloat(stop.long || stop.longitude || (stop.coordinates && stop.coordinates.wgs84 ? stop.coordinates.wgs84.longitude : null)) 
                };
                if (isNaN(coords.lat) || isNaN(coords.lng)) {
                    console.warn(`Invalid coordinates for stop ${stop.name_en || stop.stop_name_en || stop.name_tc}:`, coords);
                    return null;
                }
                return {
                    name: stop.name_en || stop.stop_name_en || stop.name_tc,
                    lat: coords.lat,
                    lng: coords.lng,
                    stopId: item.stop || item.stop_id,
                    index: index + 1
                };
            })
        ).then(results => results.filter(s => s !== null));

        if (stops.length < 2) {
            showError("Not enough valid stops to draw a route.");
            return;
        }

        map = new google.maps.Map(document.getElementById('map'), {
            zoom: 12,
            center: { lat: stops[0].lat, lng: stops[0].lng }
        });

        routeMarkers = stops.map(stop => {
            const marker = new google.maps.Marker({
                position: { lat: stop.lat, lng: stop.lng },
                map: map,
                title: stop.name,
                label: `${stop.index}`
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<strong>${stop.name}</strong><br/>Loading ETA...`
            });

            marker.addListener('click', async () => {
                if (currentInfoWindow) currentInfoWindow.close();
                infoWindow.open(map, marker);
                currentInfoWindow = infoWindow;

                const etaData = await fetchETA(stop.stopId, selectedProvider);
                if (!etaData || !etaData.data || etaData.data.length === 0) {
                    infoWindow.setContent(`<strong>${stop.name}</strong><br/>No ETA available.`);
                    return;
                }

                const now = new Date();
                const etaInfo = etaData.data
                    .map(bus => {
                        const etaField = bus.eta;
                        const arriveTime = etaField ? new Date(etaField) : null;
                        let displayTime;

                        if (!arriveTime || isNaN(arriveTime.getTime())) {
                            displayTime = `${bus.diff} mins`;
                        } else {
                            const timeDiff = Math.round((arriveTime - now) / 60000);
                            if (timeDiff >= -2 && timeDiff <= 0) {
                                displayTime = "Arrived";
                            } else if (timeDiff < -2) {
                                displayTime = "Not Available";
                            } else {
                                displayTime = `${timeDiff} mins`;
                            }
                        }
                        return `${bus.route} (${displayTime})${bus.remark_en ? ' - ' + bus.remark_en : ''}`;
                    })
                    .join('<br/>');

                infoWindow.setContent(`<strong>${stop.name}</strong><br/>${etaInfo || "No ETA available."}`);
            });

            return marker;
        });

        const pathCoordinates = stops.map(stop => ({ lat: stop.lat, lng: stop.lng }));
        const sampledPath = samplePath(pathCoordinates, 100);
        const pathString = sampledPath.map(coord => `${coord.lat},${coord.lng}`).join('|');

        try {
            const response = await fetch(`https://roads.googleapis.com/v1/snapToRoads?path=${pathString}&interpolate=true&key=${API_KEY}`);
            if (!response.ok) throw new Error(`Roads API request failed: ${response.statusText}`);
            const data = await response.json();

            let snappedCoords = pathCoordinates;
            if (data.snappedPoints) {
                snappedCoords = data.snappedPoints.map(point => ({
                    lat: point.location.latitude,
                    lng: point.location.longitude
                }));
            }

            routePolyline = new google.maps.Polyline({
                path: snappedCoords,
                geodesic: true,
                strokeColor: '#007bff',
                strokeOpacity: 1.0,
                strokeWeight: 4
            });
            routePolyline.setMap(map);

            const bounds = new google.maps.LatLngBounds();
            stops.forEach(stop => bounds.extend({ lat: stop.lat, lng: stop.lng }));
            map.fitBounds(bounds);
        } catch (err) {
            console.error("Roads API error:", err);
            showError("Roads API failed. Drawing unsnapped stop path.");

            routePolyline = new google.maps.Polyline({
                path: pathCoordinates,
                geodesic: true,
                strokeColor: '#007bff',
                strokeOpacity: 1.0,
                strokeWeight: 4
            });
            routePolyline.setMap(map);

            const bounds = new google.maps.LatLngBounds();
            stops.forEach(stop => bounds.extend({ lat: stop.lat, lng: stop.lng }));
            map.fitBounds(bounds);
        }
    } catch (err) {
        console.error("Error displaying route:", err);
        showError("Failed to load route details. Please try again.");
    }
});

window.addEventListener('load', initMap);