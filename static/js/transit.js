/* transit.js */
const API_KEY = 'AIzaSyAibBUUt2uhc8v_82GS3Gxx2TRGyuUjsuc';
let map;
let routeMarkers = [];
let routePolyline;
let userLocationMarker = null;
let userLocationCircle = null;
let kmbRouteList = null;
let ctbRouteList = null;
let minibusRouteList = null;
let stopData = null;
let routeStopData = null;
let selectedRoute = null;
let selectedBound = null;
let selectedProvider = null;
let selectedRouteId = null;
let currentInput = '';
let currentInfoWindow = null;
let debounceTimeout;
let nearbyStops = [];
let radiusOptionsVisible = false;
let favoriteRoutes = [];

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), { zoom: 12 });
    geoFindMe(); // Call the adapted geoFindMe function to locate the user

    // Load route data after initializing map
    loadRouteData().then(async () => {
        await loadFavorites();
        if (document.getElementById("routeList")) displayAllRoutes();
        if (document.getElementById("favoriteRouteList")) displayFavoriteRoutes();
    });
}

function geoFindMe() {
    if (!navigator.geolocation) {
        console.warn("Geolocation is not supported by your browser");
        showError("Geolocation is not supported. Using default center (Hong Kong).");
        setDefaultLocation();
        return;
    }

    console.log("Locating user…");

    function success(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const userLocation = { lat: latitude, lng: longitude };

        console.log("User Location: Latitude:", latitude, "Longitude:", longitude, "Accuracy (meters):", accuracy);

        // Center the map on the user's location
        map.setCenter(userLocation);

        // Place a marker and circle at the user's location
        userLocationMarker = new google.maps.Marker({
            position: userLocation,
            map: map,
            icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
            title: "Your Location"
        });
        userLocationCircle = new google.maps.Circle({
            strokeColor: '#007bff',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#007bff',
            fillOpacity: 0.2,
            map: map,
            center: userLocation,
            radius: Math.max(accuracy, 200) // Use accuracy or 200m, whichever is larger
        });
    }

    function error() {
        console.warn("Unable to retrieve your location");
        showError("Unable to retrieve your location. Using default center (Hong Kong).");
        setDefaultLocation();
    }

    navigator.geolocation.getCurrentPosition(success, error, {
        enableHighAccuracy: true, // Use GPS for best accuracy
        timeout: 10000,           // Wait up to 10 seconds
        maximumAge: 0             // Ensure fresh location
    });
}

function setDefaultLocation() {
    const defaultLocation = { lat: 22.3193, lng: 114.1694 };
    map.setCenter(defaultLocation);
    userLocationMarker = new google.maps.Marker({
        position: defaultLocation,
        map: map,
        icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
        title: "Default Location"
    });
    userLocationCircle = new google.maps.Circle({
        strokeColor: '#007bff',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#007bff',
        fillOpacity: 0.2,
        map: map,
        center: defaultLocation,
        radius: 200
    });
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.container').prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching ${url} (Attempt ${i + 1}/${retries})`);
            const response = await fetch(url, options);
            if (response.status === 429) {
                const delay = backoff * Math.pow(2, i) + Math.random() * 1000;
                console.warn(`Rate limit exceeded for ${url}, retrying after ${delay}ms`);
                showError("Rate limit exceeded. Retrying...");
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
            const data = await response.json();
            console.log(`Successfully fetched ${url}:`, data);
            return data;
        } catch (err) {
            console.error(`Error fetching ${url}:`, err.message);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
        }
    }
}

async function loadRouteData() {
    const loadingMessage = document.getElementById('loadingMessage');
    try {
        const [routeResponse, stopResponse, routeStopResponse] = await Promise.all([
            fetch('/api/routes'),
            fetch('/api/stops'),
            fetch('/api/route-stops')
        ]);

        if (!routeResponse.ok) throw new Error(`Failed to fetch route data: ${routeResponse.statusText}`);
        if (!stopResponse.ok) throw new Error(`Failed to fetch stop data: ${stopResponse.statusText}`);
        if (!routeStopResponse.ok) throw new Error(`Failed to fetch route-stop data: ${routeStopResponse.statusText}`);

        const routeData = await routeResponse.json();
        stopData = await stopResponse.json();
        routeStopData = await routeStopResponse.json();

        kmbRouteList = routeData.kmb_routes || [];
        ctbRouteList = routeData.ctb_routes || [];
        minibusRouteList = routeData.minibus_routes || [];

        console.log("KMB routes loaded:", kmbRouteList.length);
        console.log("CTB routes loaded:", ctbRouteList.length);
        console.log("Minibus routes loaded:", minibusRouteList.length);
        console.log("KMB stops loaded:", Object.keys(stopData.kmb_stops).length);
        console.log("CTB stops loaded:", Object.keys(stopData.ctb_stops).length);
        console.log("Minibus stops loaded:", Object.keys(stopData.minibus_stops).length);
        console.log("KMB route-stops loaded:", Object.keys(routeStopData.kmb_route_stops).length);
        console.log("CTB route-stops loaded:", Object.keys(routeStopData.ctb_route_stops).length);
        console.log("Minibus route-stops loaded:", Object.keys(routeStopData.minibus_route_stops).length);

        if (kmbRouteList.length || ctbRouteList.length || minibusRouteList.length) {
            if (loadingMessage) {
                loadingMessage.textContent = "Route, stop, and route-stop data loaded successfully!";
                setTimeout(() => loadingMessage.style.display = 'none', 2000);
            }
        } else if (loadingMessage) {
            loadingMessage.textContent = "No route data loaded. Please try again.";
        }
    } catch (err) {
        console.error("Failed to load data:", err);
        showError("Failed to load route, stop, or route-stop data from server.");
        if (loadingMessage) loadingMessage.textContent = "Failed to load data.";
    }
}

async function loadFavorites() {
    try {
        favoriteRoutes = await fetchWithRetry('/api/favorites');
        console.log('Favorites loaded:', favoriteRoutes);
    } catch (err) {
        console.error('Failed to load favorites:', err);
        showError('Could not load favorite routes. Please accept cookies to enable favorites.');
        favoriteRoutes = [];
    }
}

async function fetchRouteStops(provider, route, bound) {
    try {
        if (provider === 'kmb') {
            const data = await fetchWithRetry("https://data.etabus.gov.hk/v1/transport/kmb/route-stop");
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

function getStopDetails(provider, stopId) {
    if (!stopData) return null;
    let stopDetails = null;
    if (provider === 'kmb' && stopData.kmb_stops[stopId]) {
        stopDetails = stopData.kmb_stops[stopId];
    } else if (provider === 'ctb' && stopData.ctb_stops[stopId]) {
        stopDetails = stopData.ctb_stops[stopId];
    } else if (provider === 'minibus' && stopData.minibus_stops[stopId]) {
        stopDetails = stopData.minibus_stops[stopId];
    }
    if (stopDetails) {
        return {
            name_en: stopDetails.name_en,
            lat: parseFloat(stopDetails.lat || stopDetails.latitude),
            long: parseFloat(stopDetails.long || stopDetails.longitude)
        };
    }
    return null;
}

async function fetchETA(stopId, provider, route, routeId, bound) {
    console.log(`Fetching ETA: provider=${provider}, stopId=${stopId}, route=${route}, routeId=${routeId}, bound=${bound}`);
    try {
        if (!stopId || !route) {
            console.error(`Missing parameters: stopId=${stopId}, route=${route}`);
            return { data: [] };
        }
        let url, data;
        if (provider === 'kmb') {
            url = `https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`;
            data = await fetchWithRetry(url, {}, 3);
            console.log(`KMB ETA response for ${stopId}:`, data);
            if (!data || !data.data) return { data: [] };
            const filteredData = data.data.filter(entry => entry.route === route);
            return { data: filteredData };
        } else if (provider === 'ctb') {
            url = `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`;
            data = await fetchWithRetry(url, {}, 3);
            console.log(`CTB ETA response for ${stopId}/${route}:`, data);
            return data;
        } else if (provider === 'minibus') {
            url = `https://data.etagmb.gov.hk/eta/stop/${stopId}`;
            data = await fetchWithRetry(url, {}, 3);
            console.log(`Minibus ETA response for ${stopId}:`, data);
            if (!data.data || data.data.length === 0) return { data: [] };
            const routeEntry = data.data.find(entry => 
                entry.enabled && 
                entry.route_id === routeId && 
                entry.route_seq === parseInt(bound)
            );
            if (!routeEntry || !routeEntry.eta || routeEntry.eta.length === 0) return { data: [] };
            return {
                data: routeEntry.eta.map(eta => ({
                    route: route,
                    eta: eta.timestamp,
                    diff: eta.diff,
                    remark_en: eta.remarks_en || ''
                }))
            };
        }
    } catch (err) {
        console.error(`Error fetching ETA for ${provider} stop ${stopId}:`, err.message, err.stack);
        return { data: [] };
    }
}

const routeListUl = document.getElementById("routeList");
const selectedRouteDisplay = document.getElementById("selectedRouteDisplay");
const keypad = document.getElementById("keypad");
const inputDisplay = document.getElementById("input-display");

if (inputDisplay && inputDisplay.value === "undefined") {
    inputDisplay.value = "Enter Route Number";
}

function isFavorite(route) {
    return favoriteRoutes.some(fav => 
        fav.route === route.route && 
        fav.bound === route.bound && 
        fav.provider === route.provider
    );
}

async function toggleFavorite(route) {
    if (isFavorite(route)) {
        favoriteRoutes = favoriteRoutes.filter(fav => 
            !(fav.route === route.route && fav.bound === route.bound && fav.provider === route.provider)
        );
    } else {
        favoriteRoutes.push({
            route: route.route,
            bound: route.bound,
            provider: route.provider,
            orig_en: route.orig_en,
            dest_en: route.dest_en
        });
    }
    try {
        await fetchWithRetry('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(favoriteRoutes)
        });
        console.log('Favorites updated on server:', favoriteRoutes);
    } catch (err) {
        console.error('Failed to save favorites:', err);
        showError('Could not save favorites. Please accept cookies to enable this feature.');
    }
}

function displayAllRoutes() {
    if (!routeListUl) return;
    routeListUl.innerHTML = '';
    const allRoutes = [
        ...(kmbRouteList || []),
        ...(ctbRouteList || []),
        ...(minibusRouteList || [])
    ];
    displayRoutes(allRoutes);
}

function displayRoutes(routes) {
    if (!routeListUl) return;
    routeListUl.innerHTML = '';
    if (!routes.length) {
        routeListUl.innerHTML = '<li>No routes available</li>';
        return;
    }
    routes.forEach(route => {
        const li = document.createElement('li');
        const routeText = `${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
        const starBtn = document.createElement('button');
        starBtn.textContent = isFavorite(route) ? '★' : '☆';
        starBtn.className = 'star-btn';
        starBtn.setAttribute('aria-label', `Toggle favorite for ${routeText}`);
        starBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFavorite(route);
            starBtn.textContent = isFavorite(route) ? '★' : '☆';
            displayFavoriteRoutes();
        });

        li.textContent = routeText;
        li.appendChild(starBtn);
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => selectRoute(route));
        routeListUl.appendChild(li);
    });
}

function displayFavoriteRoutes() {
    const favoriteRouteListUl = document.getElementById("favoriteRouteList");
    if (!favoriteRouteListUl) return;

    favoriteRouteListUl.innerHTML = '';
    if (!favoriteRoutes.length) {
        favoriteRouteListUl.innerHTML = '<li>No favorite routes saved</li>';
        return;
    }

    favoriteRoutes.forEach(route => {
        const li = document.createElement('li');
        const routeText = `${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
        const starBtn = document.createElement('button');
        starBtn.textContent = '★';
        starBtn.className = 'star-btn';
        starBtn.setAttribute('aria-label', `Remove favorite for ${routeText}`);
        starBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFavorite(route);
            displayFavoriteRoutes();
        });

        li.textContent = routeText;
        li.appendChild(starBtn);
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => selectRoute(route));
        favoriteRouteListUl.appendChild(li);
    });
}

function selectRoute(route) {
    selectedRoute = route.route;
    selectedBound = route.bound;
    selectedProvider = route.provider;
    selectedRouteId = route.route_id || null;
    if (selectedRouteDisplay) {
        selectedRouteDisplay.textContent = `Selected Route: ${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
    }

    routeMarkers.forEach(marker => marker.setMap(null));
    routeMarkers = [];
    if (routePolyline) routePolyline.setMap(null);
    if (currentInfoWindow) currentInfoWindow.close();
    currentInfoWindow = null;

    if (userLocationCircle) userLocationCircle.setMap(null);

    fetchRouteStops(selectedProvider, selectedRoute, selectedBound).then(stopsForRoute => {
        if (!stopsForRoute || stopsForRoute.length === 0) {
            showError(`No stops found for route ${selectedRoute} (${selectedProvider.toUpperCase()}).`);
            return;
        }
        displayRouteOnMap(stopsForRoute);
    }).catch(err => {
        console.error("Error selecting route:", err);
        showError("Failed to load route details.");
    });
}

async function displayRouteOnMap(stopsForRoute) {
    const stops = stopsForRoute.map((item, index) => {
        const stop = getStopDetails(selectedProvider, item.stop || item.stop_id);
        if (!stop) return null;
        const coords = { lat: stop.lat, lng: stop.long };
        if (isNaN(coords.lat) || isNaN(coords.lng)) return null;
        return {
            name: stop.name_en,
            lat: coords.lat,
            lng: coords.lng,
            stopId: item.stop || item.stop_id,
            index: index + 1
        };
    }).filter(s => s !== null);

    if (stops.length < 2) {
        showError("Not enough valid stops to draw a route.");
        return;
    }

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

            const etaData = await fetchETA(stop.stopId, selectedProvider, selectedRoute, selectedRouteId, selectedBound);
            const etaInfo = etaData.data.length
                ? etaData.data.map(bus => {
                    const etaField = bus.eta;
                    const arriveTime = etaField ? new Date(etaField) : null;
                    let displayTime = bus.diff !== undefined ? `${bus.diff} mins` : 'Not Available';
                    if (arriveTime && !isNaN(arriveTime.getTime())) {
                        const timeDiff = Math.round((new Date() - arriveTime) / 60000);
                        displayTime = timeDiff <= 0 ? `${timeDiff} mins` : "Arrived";
                    }
                    return `${bus.route} (${displayTime})${bus.remark_en ? ' - ' + bus.remark_en : ''}`;
                }).join('<br/>')
                : "No ETA available.";
            infoWindow.setContent(`<strong>${stop.name}</strong><br/>${etaInfo}`);
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
        const snappedCoords = data.snappedPoints ? data.snappedPoints.map(point => ({
            lat: point.location.latitude,
            lng: point.location.longitude
        })) : pathCoordinates;

        routePolyline = new google.maps.Polyline({
            path: snappedCoords,
            geodesic: true,
            strokeColor: '#007bff',
            strokeOpacity: 1.0,
            strokeWeight: 4
        });
        routePolyline.setMap(map);
    } catch (err) {
        console.error("Roads API error:", err);
        showError("Roads API failed. Using unsnapped path.");
        routePolyline = new google.maps.Polyline({
            path: pathCoordinates,
            geodesic: true,
            strokeColor: '#007bff',
            strokeOpacity: 1.0,
            strokeWeight: 4
        });
        routePolyline.setMap(map);
    }

    const bounds = new google.maps.LatLngBounds();
    stops.forEach(stop => bounds.extend({ lat: stop.lat, lng: stop.lng }));
    if (userLocationMarker) bounds.extend(userLocationMarker.getPosition());
    map.fitBounds(bounds);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function findNearbyStops(radius) {
    if (!userLocationMarker) {
        showError("User location not available");
        return;
    }
    if (!stopData || !routeStopData) {
        showError("Stop or route-stop data not loaded yet");
        return;
    }

    const userPos = userLocationMarker.getPosition();
    const userLat = userPos.lat();
    const userLng = userPos.lng();

    routeMarkers.forEach(marker => marker.setMap(null));
    routeMarkers = [];
    if (routePolyline) routePolyline.setMap(null);
    if (currentInfoWindow) currentInfoWindow.close();

    if (userLocationCircle) {
        userLocationCircle.setRadius(radius);
        userLocationCircle.setCenter(userPos);
        userLocationCircle.setMap(map);
    } else {
        userLocationCircle = new google.maps.Circle({
            strokeColor: '#007bff',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#007bff',
            fillOpacity: 0.2,
            map: map,
            center: userPos,
            radius: radius
        });
    }

    nearbyStops = [];

    for (const provider of ['kmb', 'ctb', 'minibus']) {
        const stops = stopData[`${provider}_stops`];
        const routeStops = routeStopData[`${provider}_route_stops`];
        for (const stopId in stops) {
            const stopDetails = getStopDetails(provider, stopId);
            if (stopDetails) {
                const stopLat = stopDetails.lat;
                const stopLng = stopDetails.long;

                if (isNaN(stopLat) || isNaN(stopLng)) continue;

                const distance = calculateDistance(userLat, userLng, stopLat, stopLng);
                if (distance <= radius) {
                    const routes = [];
                    for (const routeKey in routeStops) {
                        const [route, bound] = routeKey.split('-');
                        if (routeStops[routeKey].some(stop => stop.stop_id === stopId)) {
                            routes.push({
                                route,
                                bound,
                                route_id: provider === 'minibus' ? minibusRouteList.find(r => r.route === route && r.bound === bound)?.route_id : null
                            });
                        }
                    }
                    nearbyStops.push({
                        ...stopDetails,
                        stopId: stopId,
                        provider: provider,
                        routes: routes
                    });
                }
            }
        }
    }

    displayNearbyStops(nearbyStops);
}

function displayNearbyStops(stops) {
    const bounds = new google.maps.LatLngBounds();
    if (userLocationMarker) bounds.extend(userLocationMarker.getPosition());

    routeMarkers = stops.map(stop => {
        const position = { lat: stop.lat, lng: stop.long };
        const marker = new google.maps.Marker({
            position,
            map: map,
            title: stop.name_en || 'Unknown Stop'
        });

        bounds.extend(position);

        const infoWindow = new google.maps.InfoWindow({
            content: `<strong>${marker.getTitle()}</strong><br>Loading routes and ETA...`
        });

        marker.addListener('click', async () => {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(map, marker);
            currentInfoWindow = infoWindow;

            let content = `<strong>${marker.getTitle()}</strong><br>`;
            for (const route of stop.routes) {
                const etaData = await fetchETA(stop.stopId, stop.provider, route.route, route.route_id, route.bound);
                const etaInfo = etaData.data.length
                    ? etaData.data
                        .filter(eta => eta.route === route.route)
                        .map(bus => {
                            const etaField = bus.eta;
                            const arriveTime = etaField ? new Date(etaField) : null;
                            let displayTime = bus.diff !== undefined ? `${bus.diff} mins` : 'Not Available';
                            if (arriveTime && !isNaN(arriveTime.getTime())) {
                                const timeDiff = Math.round((new Date() - arriveTime) / 60000);
                                displayTime = timeDiff <= 0 ? `${-timeDiff} mins` : "Arrived";
                            }
                            return `${bus.route} (${displayTime})${bus.remark_en ? ' - ' + bus.remark_en : ''}`;
                        }).join('<br>')
                    : "No ETA available";
                content += `<div>${route.route}: ${etaInfo}</div>`;
            }
            infoWindow.setContent(content);
        });

        return marker;
    });

    map.fitBounds(bounds);
}

document.addEventListener('DOMContentLoaded', () => {
    const allRoutesBtn = document.getElementById('allRoutesBtn');
    const kmbRoutesBtn = document.getElementById('kmbRoutesBtn');
    const ctbRoutesBtn = document.getElementById('ctbRoutesBtn');
    const minibusRoutesBtn = document.getElementById('minibusRoutesBtn');
    const favoriteRoutesBtn = document.getElementById("favoriteRoutesBtn");
    const nearbyBtn = document.getElementById('nearbyBtn');

    if (allRoutesBtn) allRoutesBtn.addEventListener('click', displayAllRoutes);
    if (kmbRoutesBtn) kmbRoutesBtn.addEventListener('click', () => displayRoutes(kmbRouteList || []));
    if (ctbRoutesBtn) ctbRoutesBtn.addEventListener('click', () => displayRoutes(ctbRouteList || []));
    if (minibusRoutesBtn) minibusRoutesBtn.addEventListener('click', () => displayRoutes(minibusRouteList || []));
    if (favoriteRoutesBtn) favoriteRoutesBtn.addEventListener('click', displayFavoriteRoutes);

    if (nearbyBtn) {
        nearbyBtn.addEventListener('click', () => {
            if (radiusOptionsVisible) {
                document.querySelector('.radius-options')?.remove();
                radiusOptionsVisible = false;
                nearbyBtn.classList.remove('active');
                if (userLocationCircle) userLocationCircle.setMap(null);
                return;
            }

            document.querySelector('.radius-options')?.remove();

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'radius-options';
            optionsDiv.style.left = `${nearbyBtn.offsetLeft}px`;
            optionsDiv.style.top = `${nearbyBtn.offsetTop + nearbyBtn.offsetHeight}px`;

            [100, 200, 400].forEach(radius => {
                const btn = document.createElement('button');
                btn.textContent = `${radius}m`;
                btn.className = 'radius-btn';
                btn.addEventListener('click', () => {
                    findNearbyStops(radius);
                    optionsDiv.remove();
                    radiusOptionsVisible = false;
                    nearbyBtn.classList.remove('active');
                });
                optionsDiv.appendChild(btn);
            });

            nearbyBtn.parentElement.appendChild(optionsDiv);
            radiusOptionsVisible = true;
            nearbyBtn.classList.add('active');

            document.addEventListener('click', function handler(e) {
                if (!optionsDiv.contains(e.target) && e.target !== nearbyBtn) {
                    optionsDiv.remove();
                    radiusOptionsVisible = false;
                    nearbyBtn.classList.remove('active');
                    if (userLocationCircle) userLocationCircle.setMap(null);
                    document.removeEventListener('click', handler);
                }
            }, { once: true });
        });
    }

    if (keypad) {
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
    }
});

function filterRoutes() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        if (!routeListUl) return;
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
        displayRoutes(allFilteredRoutes);
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

window.addEventListener('load', initMap);