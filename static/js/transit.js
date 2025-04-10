/* transit.js */
const API_KEY = 'AIzaSyBBY8WRPKMG0sPNFkHAYNcCwkwTn4T5jGw'; // Replace with a new, secure key
let map;
let routeMarkers = [];
let routePolyline = null;
let userLocationMarker = null;
let userLocationCircle = null;
let userLocation = null;
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
let favoriteRoutes = JSON.parse(localStorage.getItem('favoriteRoutes')) || [];
let stopMarkers = {};

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), { zoom: 12 });
    
    const isHomePage = window.location.pathname.includes('home.html');
    const isTransitPlannerPage = window.location.pathname.includes('transit_planner.html');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                map.setCenter(userLocation);

                if (isHomePage) {
                    userLocationMarker = new google.maps.Marker({
                        position: userLocation,
                        map: map,
                        icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
                        title: "Your Location"
                    });
                    loadRouteData().then(() => displayFavoriteRoutes());
                }

                if (isTransitPlannerPage) {
                    loadRouteData().then(() => {
                        if (document.getElementById("routeList")) displayAllRoutes();
                        if (document.getElementById("favoriteRouteList")) displayFavoriteRoutes();
                    });
                }
            },
            () => {
                console.warn("Geolocation failed, using default center");
                userLocation = { lat: 22.3193, lng: 114.1694 };
                map.setCenter(userLocation);
                if (isHomePage) {
                    userLocationMarker = new google.maps.Marker({
                        position: userLocation,
                        map: map,
                        icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
                        title: "Default Location (Hong Kong)"
                    });
                    loadRouteData().then(() => displayFavoriteRoutes());
                }
            }
        );
    } else {
        console.warn("Geolocation not supported, using default center");
        userLocation = { lat: 22.3193, lng: 114.1694 };
        map.setCenter(userLocation);
        if (isHomePage) {
            userLocationMarker = new google.maps.Marker({
                position: userLocation,
                map: map,
                icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
                title: "Default Location (Hong Kong)"
            });
            loadRouteData().then(() => displayFavoriteRoutes());
        }
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.container')?.prepend(errorDiv);
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

function toggleFavorite(route) {
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
    localStorage.setItem('favoriteRoutes', JSON.stringify(favoriteRoutes));
    console.log('Favorites updated in localStorage:', favoriteRoutes);
    displayFavoriteRoutes();
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
    if (!stopData) {
        console.warn("stopData not loaded yet");
        return null;
    }
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
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(route);
            starBtn.textContent = isFavorite(route) ? '★' : '☆';
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
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(route);
        });

        li.textContent = routeText;
        li.appendChild(starBtn);
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => selectRoute(route));
        favoriteRouteListUl.appendChild(li);
    });
}

function getFormattedStops(stopsForRoute) {
    return stopsForRoute.map((item, index) => {
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
}

function selectRoute(route) {
    if (!stopData || !routeStopData) {
        showError("Route data not loaded yet. Please wait...");
        loadRouteData().then(() => selectRoute(route));
        return;
    }

    selectedRoute = route.route;
    selectedBound = route.bound;
    selectedProvider = route.provider;
    selectedRouteId = route.route_id || null;
    if (selectedRouteDisplay) {
        selectedRouteDisplay.textContent = `Selected Route: ${route.route} from ${route.orig_en} to ${route.dest_en} (${route.provider.toUpperCase()})`;
    }

    routeMarkers.forEach(marker => marker.setMap(null));
    routeMarkers = [];
    stopMarkers = {};
    if (routePolyline) {
        routePolyline.setMap(null);
        console.log("Cleared previous routePolyline");
        routePolyline = null;
    }
    if (currentInfoWindow) currentInfoWindow.close();
    currentInfoWindow = null;

    if (userLocationCircle) userLocationCircle.setMap(null);

    fetchRouteStops(selectedProvider, selectedRoute, selectedBound).then(stopsForRoute => {
        if (!stopsForRoute || stopsForRoute.length === 0) {
            showError(`No stops found for route ${selectedRoute} (${selectedProvider.toUpperCase()}).`);
            return;
        }
        const stops = getFormattedStops(stopsForRoute);
        if (stops.length < 2) {
            showError("Not enough valid stops to draw a route.");
            return;
        }
        displayRouteOnMap(stops);
        displayStopList(stops);
    }).catch(err => {
        console.error("Error selecting route:", err);
        showError("Failed to load route details.");
    });
}

function displayStopList(stops) {
    const stopListUl = document.getElementById("stopList");
    if (!stopListUl) return;
    stopListUl.innerHTML = ''; // Clear existing content
    stops.forEach(stop => {
        const li = document.createElement('li');
        li.textContent = `${stop.index}. ${stop.name}`;
        li.addEventListener('click', () => {
            const marker = stopMarkers[stop.stopId];
            if (marker) {
                google.maps.event.trigger(marker, 'click');
            } else {
                console.error("Marker not found for stopId:", stop.stopId);
            }
        });
        stopListUl.appendChild(li);
    });
}

async function displayRouteOnMap(stops) {
    const etaPromises = stops.map(stop => 
        fetchETA(stop.stopId, selectedProvider, selectedRoute, selectedRouteId, selectedBound)
    );
    const etaResults = await Promise.all(etaPromises);

    let totalETAs = 0;
    let delayedETAs = 0;
    let avgInterval = 0;
    let validETACount = 0;
    const now = new Date();
    const currentHour = now.getHours();

    etaResults.forEach((etaData, index) => {
        console.log(`Stop ${stops[index].name} ETA data:`, etaData.data);
        etaData.data.forEach(eta => {
            totalETAs++;
            const etaTime = new Date(eta.eta);
            if (etaTime && !isNaN(etaTime.getTime())) {
                const timeDiff = (etaTime - now) / 60000; // Minutes until arrival
                console.log(`ETA for ${eta.route}: timeDiff=${timeDiff.toFixed(2)}, diff=${eta.diff}`);
                if (timeDiff < -5) delayedETAs++;
                if (timeDiff >= -1 && eta.diff !== undefined && eta.diff >= 0) {
                    avgInterval += eta.diff;
                    validETACount++;
                }
            }
        });
    });

    avgInterval = validETACount > 0 ? avgInterval / validETACount : Infinity;
    const busyScore = delayedETAs / (totalETAs || 1);

    const isOffPeak = currentHour >= 0 && currentHour < 6;
    let routeStatus = 'free';
    let strokeColor = '#00FF00'; // Green

    if (isOffPeak) {
        if (avgInterval < 3 || busyScore > 0.5) {
            routeStatus = 'busy';
            strokeColor = '#FF0000'; // Red
        } else if (avgInterval < 4 || busyScore > 0.35) {
            routeStatus = 'busy half';
            strokeColor = '#FF8C00'; // Dark Orange
        } else if (avgInterval < 6 || busyScore > 0.2) {
            routeStatus = 'moderate';
            strokeColor = '#FFA500'; // Light Orange
        }
    } else {
        if (avgInterval < 5 || busyScore > 0.3) {
            routeStatus = 'busy';
            strokeColor = '#FF0000'; // Red
        } else if (avgInterval < 7 || busyScore > 0.2) {
            routeStatus = 'busy half';
            strokeColor = '#FF8C00'; // Dark Orange
        } else if (avgInterval < 10 || busyScore > 0.1) {
            routeStatus = 'moderate';
            strokeColor = '#FFA500'; // Light Orange
        }
    }

    console.log(`Route ${selectedRoute} at ${currentHour}:00 - Status: ${routeStatus}, Avg Interval: ${avgInterval.toFixed(2)} mins, Busy Score: ${busyScore.toFixed(2)}, Total ETAs: ${totalETAs}, Delayed: ${delayedETAs}, Valid ETAs: ${validETACount}`);

    routeMarkers = stops.map(stop => {
        const marker = new google.maps.Marker({
            position: { lat: stop.lat, lng: stop.lng },
            map: map,
            title: stop.name,
            label: `${stop.index}`
        });

        marker.stopId = stop.stopId;
        const infoWindow = new google.maps.InfoWindow({
            content: `<strong>${stop.name}</strong><br/>Loading ETA...`
        });

        marker.infoWindow = infoWindow;
        marker.addListener('click', async () => {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(map, marker);
            currentInfoWindow = infoWindow;

            const etaData = await fetchETA(stop.stopId, selectedProvider, selectedRoute, selectedRouteId, selectedBound);
            let etaInfo = etaData.data.length
                ? etaData.data.map(bus => {
                    const etaField = bus.eta;
                    const arriveTime = etaField ? new Date(etaField) : null;
                    let displayTime = bus.diff !== undefined ? `${bus.diff} mins` : 'Not Available';
                    if (arriveTime && !isNaN(arriveTime.getTime())) {
                        const timeDiff = Math.round((new Date() - arriveTime) / 60000);
                        displayTime = timeDiff <= 0 ? `${-timeDiff} mins` : "Arrived";
                    }
                    const providerShort = selectedProvider.toUpperCase();
                    return `${providerShort} ${bus.route}: ${displayTime}${bus.remark_en ? ' - ' + bus.remark_en : ''}`;
                }).join('<br>')
                : "No ETA available.";
            infoWindow.setContent(`<strong>${stop.name}</strong><br/>${etaInfo}`);
        });

        stopMarkers[stop.stopId] = marker;
        return marker;
    });

    const pathCoordinates = stops.map(stop => ({ lat: stop.lat, lng: stop.lng }));
    const sampledPath = samplePath(pathCoordinates, 100);
    const pathString = sampledPath.map(coord => `${coord.lat},${coord.lng}`).join('|');

    console.log(`Path string length: ${sampledPath.length}, Path: ${pathString}`);

    try {
        if (sampledPath.length < 2) throw new Error("Sampled path has fewer than 2 points.");
        const response = await fetch(`https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(pathString)}&interpolate=true&key=${API_KEY}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Roads API request failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        const snappedCoords = data.snappedPoints ? data.snappedPoints.map(point => ({
            lat: point.location.latitude,
            lng: point.location.longitude
        })) : pathCoordinates;

        if (routePolyline) {
            routePolyline.setMap(null);
            console.log("Extra cleanup of lingering routePolyline");
        }
        routePolyline = new google.maps.Polyline({
            path: snappedCoords,
            geodesic: true,
            strokeColor: strokeColor,
            strokeOpacity: 1.0,
            strokeWeight: 4
        });
        routePolyline.setMap(map);
        console.log("New routePolyline set on map");

        if (selectedRouteDisplay) {
            selectedRouteDisplay.textContent = `Selected Route: ${selectedRoute} from ${stops[0].name} to ${stops[stops.length - 1].name} (${selectedProvider.toUpperCase()}) - Status: ${routeStatus}`;
        }
    } catch (err) {
        console.error("Roads API error:", err);
        showError(`Failed to snap route to roads: ${err.message}. Using unsnapped path.`);
        if (routePolyline) {
            routePolyline.setMap(null);
            console.log("Extra cleanup of lingering routePolyline in error case");
        }
        routePolyline = new google.maps.Polyline({
            path: pathCoordinates,
            geodesic: true,
            strokeColor: strokeColor,
            strokeOpacity: 1.0,
            strokeWeight: 4
        });
        routePolyline.setMap(map);
        console.log("New unsnapped routePolyline set on map");
    }

    const bounds = new google.maps.LatLngBounds();
    stops.forEach(stop => bounds.extend({ lat: stop.lat, lng: stop.lng }));
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
    if (!stopData || !routeStopData) {
        showError("Stop or route-stop data not loaded yet");
        await loadRouteData();
        return findNearbyStops(radius);
    }

    if (!userLocation) {
        showError("User location not available yet. Please wait...");
        return;
    }

    const userLat = userLocation.lat;
    const userLng = userLocation.lng;

    routeMarkers.forEach(marker => marker.setMap(null));
    routeMarkers = [];
    if (routePolyline) routePolyline.setMap(null);
    if (currentInfoWindow) currentInfoWindow.close();

    if (userLocationCircle) {
        userLocationCircle.setRadius(radius);
        userLocationCircle.setCenter(userLocation);
        userLocationCircle.setMap(map);
    } else {
        userLocationCircle = new google.maps.Circle({
            strokeColor: '#007bff',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#007bff',
            fillOpacity: 0.2,
            map: map,
            center: userLocation,
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
                            const providerShort = stop.provider.toUpperCase();
                            return `${providerShort} ${bus.route}: ${displayTime}${bus.remark_en ? ' - ' + bus.remark_en : ''}`;
                        }).join('<br>')
                    : "No ETA available";
                content += `<div>${etaInfo}</div>`;
            }
            infoWindow.setContent(content);
        });

        return marker;
    });

    map.fitBounds(bounds);
}

document.addEventListener('DOMContentLoaded', () => {
    const isHomePage = window.location.pathname.includes('home.html');
    const isTransitPlannerPage = window.location.pathname.includes('transit_planner.html');
    
    const allRoutesBtn = document.getElementById('allRoutesBtn');
    const kmbRoutesBtn = document.getElementById('kmbRoutesBtn');
    const ctbRoutesBtn = document.getElementById('ctbRoutesBtn');
    const minibusRoutesBtn = document.getElementById('minibusRoutesBtn');
    const favoriteRoutesBtn = document.getElementById("favoriteRoutesBtn");
    const nearbyBtn = document.getElementById('nearbyBtn');

    if (isHomePage) {
        if (favoriteRoutesBtn) {
            favoriteRoutesBtn.addEventListener('click', displayFavoriteRoutes);
        }
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
    }

    if (isTransitPlannerPage) {
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