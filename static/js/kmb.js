let allLocations = [];
let busRouteMarkers = []; // To hold markers for bus route stops
let routePolyline; // To hold the polyline for the route

// Process transit location JSON (from location.json)
function processLocationData(data) {
    const locationsArray = [];
    for (const region in data) {
        for (const subregion in data[region]) {
            const locArray = data[region][subregion].locations;
            locArray.forEach(loc => {
                locationsArray.push({
                    fullName: `${region} > ${subregion} > ${loc.name}`,
                    coordinates: loc.coordinates
                });
            });
        }
    }
    return locationsArray;
}

function populateP2PDropdowns(locations) {
    const startSelect = document.getElementById("startSelect");
    const destSelect = document.getElementById("destSelect");
    startSelect.innerHTML = "";
    destSelect.innerHTML = "";
    locations.forEach((loc, index) => {
        const option1 = document.createElement("option");
        option1.value = index;
        option1.text = loc.fullName;
        startSelect.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = index;
        option2.text = loc.fullName;
        destSelect.appendChild(option2);
    });
}

// Load location.json for point-to-point planner
fetch("location.json")
    .then(response => response.json())
    .then(data => {
        allLocations = processLocationData(data);
        populateP2PDropdowns(allLocations);
    })
    .catch(err => {
        console.error("Error loading location data:", err);
        alert("Failed to load location data.");
    });

/***********************
 * BUS ROUTE LOOKUP
 ***********************/
let routeStopData = null; // kmb_route_stop.json data
let stopData = null;      // kmb_stop.json data

// Load route stop data
fetch("https://data.etabus.gov.hk/v1/transport/kmb/route-stop")
    .then(response => response.json())
    .then(data => {
        routeStopData = data.data; // Assume "data" field contains an array of route stops
    })
    .catch(err => console.error("Error loading route stop data:", err));

// Load stop details data
fetch("https://data.etabus.gov.hk/v1/transport/kmb/stop")
    .then(response => response.json())
    .then(data => {
        stopData = data.data; // Assume "data" field contains an array of stops
    })
    .catch(err => console.error("Error loading stop data:", err));

// Function to get ETA info from the API for a given stop ID.
function fetchETA(stopId) {
    const url = `https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${stopId}`;
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .catch(err => {
            console.error("Error fetching ETA for stop", stopId, err);
            return null;
        });
}

/***********************
 * MAP INITIALIZATION
 ***********************/
const map = L.map('map').setView([22.3193, 114.1694], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/***********************
 * POINT-TO-POINT EVENT
 ***********************/
document.getElementById("planRoute").addEventListener("click", function() {
    const startIndex = document.getElementById("startSelect").value;
    const destIndex = document.getElementById("destSelect").value;
    if (startIndex === "" || destIndex === "") {
        alert("Please select both start and destination locations.");
        return;
    }
    if (startIndex === destIndex) {
        alert("Please choose two different locations.");
        return;
    }
    const startLoc = allLocations[startIndex];
    const destLoc = allLocations[destIndex];

    // Clear previous route polyline
    if (routePolyline) {
        map.removeLayer(routePolyline);
    }

    fetchRoute(startLoc.coordinates, destLoc.coordinates)
        .then(routeCoords => {
            routePolyline = L.polyline(routeCoords, { color: 'blue', weight: 4 }).addTo(map);
        })
        .catch(err => {
            console.error(err);
            alert("Error fetching route.");
        });
});

/***********************
 * BUS ROUTE LOOKUP EVENT
 ***********************/
document.getElementById("showBusRoute").addEventListener("click", function() {
    const busRouteInput = document.getElementById("busRouteInput").value.trim();
    const selectedBound = document.getElementById("boundSelect").value; // Get selected bound
    if (!busRouteInput) {
        alert("Please enter a bus route number.");
        return;
    }

    // Clear previous bus route markers and ETA info
    busRouteMarkers.forEach(marker => map.removeLayer(marker));
    busRouteMarkers = [];
    document.getElementById("etaContainer").innerHTML = "";

    // Clear previous route polyline
    if (routePolyline) {
        map.removeLayer(routePolyline);
    }

    if (!routeStopData || !stopData) {
        alert("Bus route data is not loaded yet. Please try again later.");
        return;
    }
    
    // Filter route stop data by route number and bound.
    const stopsForRoute = routeStopData.filter(item => item.route === busRouteInput && item.bound === selectedBound);

    if (stopsForRoute.length === 0) {
        alert(`No stops found for bus route ${busRouteInput} in the ${selectedBound === 'O' ? 'outbound' : 'inbound'} direction.`);
        return;
    }

    // Sort stops by sequence number
    stopsForRoute.sort((a, b) => a.seq - b.seq);

    // Fetch details for each stop
    const stopPromises = stopsForRoute.map(item =>
        fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${item.stop}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .catch(err => {
                console.error(`Error fetching details for stop ${item.stop}:`, err);
                return null;
            })
    );

    Promise.all(stopPromises)
        .then(stopsDetails => {
            // Filter out any stops that couldn't be fetched
            const validStops = stopsDetails.filter(stopDetail => stopDetail && stopDetail.data);

            if (validStops.length === 0) {
                alert("No valid stops found for this bus route.");
                return;
            }

            // Add markers for each stop on the map
            validStops.forEach(stop => {
                const coords = [parseFloat(stop.data.lat), parseFloat(stop.data.long)];
                const marker = L.marker(coords).addTo(map);
                marker.bindPopup(`
                    <strong>${stop.data.name_en}</strong><br/>
                    Stop ID: ${stop.data.stop}<br/>
                    Loading ETA...
                `);
                busRouteMarkers.push(marker);

                // Fetch ETA info for each stop and update popup content
                fetchETA(stop.data.stop).then(etaData => {
                    if (etaData && etaData.data) {
                        const now = new Date(); // Get the current time
                        const etaInfo = etaData.data
                            .filter(bus => bus.route === busRouteInput) // Filter by user input
                            .map(bus => {
                                const arriveTime = new Date(bus.eta); // Convert ETA to a Date object
                                const timeDiff = Math.round((arriveTime - now) / 60000); // Calculate difference in minutes
                                return `${bus.route} (${timeDiff} mins)`; // Format the ETA
                            })
                            .join('<br/>'); // Join the formatted ETA strings with line breaks
                        marker.getPopup().setContent(`
                            <strong>${stop.data.name_en}</strong><br/>
                            Stop ID: ${stop.data.stop}<br/>
                            ${etaInfo || "No ETA data available."}
                        `);
                    } else {
                        marker.getPopup().setContent(`
                            <strong>${stop.data.name_en}</strong><br/>
                            Stop ID: ${stop.data.stop}<br/>
                            No ETA data available.
                        `);
                    }
                }).catch(err => {
                    console.error("Error fetching ETA data:", err);
                    marker.getPopup().setContent(`
                        <strong>${stop.data.name_en}</strong><br/>
                        Stop ID: ${stop.data.stop}<br/>
                        Error fetching ETA data.
                    `);
                });
            });

            // Draw a route line connecting all stops based on seq
            const routeCoords = validStops.map(stop => [parseFloat(stop.data.lat), parseFloat(stop.data.long)]);
            routePolyline = L.polyline(routeCoords, { color: 'blue', weight: 4 }).addTo(map);
        })
        .catch(err => {
            console.error("Error fetching stop details:", err);
            alert("Error fetching stop details.");
        });
});