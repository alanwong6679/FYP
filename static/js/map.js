// Initialize the map
const map = L.map('map').setView([22.3964, 114.1095], 13); // Default view: Hong Kong

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// KMB API Endpoints
const KMB_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const STOP_API = `${KMB_API_BASE}/stop`;
const ROUTE_API = `${KMB_API_BASE}/route`;
const ROUTE_STOP_API = `${KMB_API_BASE}/route-stop`;
const ETA_API = `${KMB_API_BASE}/eta/`;

// Store bus stop data
let busStops = {};

// Load and display KMB bus stops
fetch(STOP_API)
    .then(response => response.json())
    .then(data => {
        if (!data.data) {
            console.error("Invalid bus stop data format");
            return;
        }

        busStops = data.data;
        busStops.forEach(stop => {
            const marker = L.marker([stop.lat, stop.long]).addTo(map)
                .bindPopup(`<b>${stop.name_tc}</b><br>Stop Code: ${stop.stop}`);

            marker.on('click', () => {
                showBusArrivals(stop.stop);
            });
        });
    })
    .catch(error => console.error("Error fetching bus stops:", error));

// Function to show real-time bus arrivals
function showBusArrivals(stopId) {
    fetch(`${ETA_API}${stopId}`)
        .then(response => response.json())
        .then(data => {
            if (!data.data || data.data.length === 0) {
                alert("No real-time arrival data available.");
                return;
            }

            let arrivalInfo = `<b>Bus Arrivals at Stop ${stopId}:</b><br>`;
            data.data.forEach(bus => {
                arrivalInfo += `Route: ${bus.route} → ${bus.dest_tc}<br>ETA: ${new Date(bus.eta).toLocaleTimeString()}<br><br>`;
            });

            alert(arrivalInfo);
        })
        .catch(error => console.error("Error fetching bus arrival times:", error));
}

// Function to search routes by bus number
function searchBusRoute() {
    const busNumber = document.getElementById("busNumberInput").value.trim().toUpperCase();

    if (!busNumber) {
        alert("Please enter a valid bus number.");
        return;
    }

    fetch(`${ROUTE_API}`)
        .then(response => response.json())
        .then(data => {
            if (!data.data) {
                console.error("Invalid route data format");
                return;
            }

            const routes = data.data.filter(route => route.route === busNumber);
            if (routes.length === 0) {
                alert("No routes found for this bus number.");
                return;
            }

            displayRoutesOnMap(routes);
        })
        .catch(error => console.error("Error fetching bus routes:", error));
}

// Function to display bus routes on the map
function displayRoutesOnMap(routes) {
    routes.forEach(route => {
        fetch(`${ROUTE_STOP_API}/${route.route}/${route.bound}`)
            .then(response => response.json())
            .then(data => {
                if (!data.data) {
                    console.error("Invalid route stop data");
                    return;
                }

                let routeCoordinates = [];
                data.data.forEach(stop => {
                    if (busStops[stop.stop]) {
                        routeCoordinates.push([busStops[stop.stop].lat, busStops[stop.stop].long]);
                    }
                });

                if (routeCoordinates.length > 0) {
                    const polyline = L.polyline(routeCoordinates, { color: 'blue' }).addTo(map);
                    map.fitBounds(polyline.getBounds());
                }
            })
            .catch(error => console.error("Error fetching route stops:", error));
    });
}

// Attach event to search button
document.getElementById("searchBusBtn").addEventListener("click", searchBusRoute);
