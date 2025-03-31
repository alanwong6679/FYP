// Initialize the map with a default view (e.g., Hong Kong)
const map = L.map('map').setView([22.3964, 114.1095], 13); // Default to Hong Kong

// Add a tile layer to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Variables to hold markers and state
let startMarker, endMarker;
let isStartSelected = false;
let routeLine; // Variable to hold the route line

// Function to get the street name from the full address
function getStreetName(fullAddress) {
    const addressParts = fullAddress.split(','); // Split the address by commas
    return addressParts[0].trim(); // Return the first part (street name) and trim whitespace
}

// Function to set the map view to the user's location
function setMapView(lat, lng, zoomLevel = 13) {
    map.setView([lat, lng], zoomLevel); // Set the map view to the specified latitude, longitude, and zoom level
}

// Use Geolocation API to get user's location
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        console.log(`User's location: Latitude: ${lat}, Longitude: ${lng}`); // Log user's location

        // Set the map view to the user's location
        setMapView(lat, lng, 19); // Zoom level can be adjusted (e.g., 15 for a closer view)

        // Add a marker for the user's location
        const userMarker = L.marker([lat, lng]).addTo(map).bindPopup('You are here').openPopup();

        // Get the place name using Nominatim API
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            .then(response => response.json())
            .then(data => {
                const locationName = getStreetName(data.display_name) || 'Unknown Location';
                document.getElementById('currentLocation').innerText = locationName; // Display the location name
            })
            .catch(error => {
                console.error('Error fetching location name:', error);
                document.getElementById('currentLocation').innerText = 'Unable to retrieve location name';
            });
    }, () => {
        // Handle location error
        alert('Unable to retrieve your location.');
        setMapView(22.3964, 114.1095, 13); // Default to Hong Kong with default zoom level
        document.getElementById('currentLocation').innerText = 'Hong Kong'; // Default location name
    });
} else {
    alert('Geolocation is not supported by this browser.');
}

// Function to handle map clicks
map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (!isStartSelected) {
        // Set start point
        if (startMarker) {
            map.removeLayer(startMarker); // Remove existing start marker
        }
        startMarker = L.marker([lat, lng]).addTo(map).bindPopup('Start Point').openPopup();

        // Get the place name for the start point
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            .then(response => response.json())
            .then(data => {
                const startLocationName = getStreetName(data.display_name) || 'Unknown Start Location';
                document.getElementById('startLocation').innerText = startLocationName; // Display the start location name
            })
            .catch(error => {
                console.error('Error fetching start location name:', error);
                document.getElementById('startLocation').innerText = 'Unable to retrieve start location name';
            });

        isStartSelected = true; // Mark start point as selected
    } else {
        // Set end point
        if (endMarker) {
            map.removeLayer(endMarker); // Remove existing end marker
        }
        endMarker = L.marker([lat, lng]).addTo(map).bindPopup('End Point').openPopup();

        // Get the place name for the end point
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            .then(response => response.json())
            .then(data => {
                const endLocationName = getStreetName(data.display_name) || 'Unknown End Location';
                document.getElementById('endLocation').innerText = endLocationName; // Display the end location name
            })
            .catch(error => {
                console.error('Error fetching end location name:', error);
                document.getElementById('endLocation').innerText = 'Unable to retrieve end location name';
            });

        isStartSelected = false; // Mark end point as selected
    }
});

// Function to fetch the route from OpenRouteService
function fetchRoute(start, end) {
    const apiKey = '5b3ce3597851110001cf62486e723c056f9e47d18669bd415c1d2219'; // Replace with your OpenRouteService API key
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;

    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0].geometry.coordinates;
            const latlngs = route.map(coord => [coord[1], coord[0]]); // Convert to [lat, lng]

            // Remove existing route line if it exists
            if (routeLine) {
                map.removeLayer(routeLine);
            }

            // Draw the route on the map
            routeLine = L.polyline(latlngs, { color: 'blue', weight: 5 }).addTo(map);
            map.fitBounds(routeLine.getBounds()); // Adjust the map view to fit the route
        } else {
            console.error('No routes found');
        }
    })
    .catch(error => {
        console.error('Error fetching route:', error);
    });
}

// Add event listener for the "Get Bus Schedule" button
document.getElementById('getBusSchedule').addEventListener('click', function() {
    if (startMarker && endMarker) {
        const startCoords = startMarker.getLatLng();
        const endCoords = endMarker.getLatLng();

        // Open the result page with start and end coordinates as URL parameters
        const resultPageUrl = `result.html?startLat=${startCoords.lat}&startLng=${startCoords.lng}&endLat=${endCoords.lat}&endLng=${endCoords.lng}`;
        window.open(resultPageUrl, '_blank'); // Open in a new tab
    } else {
        alert('Please select both a start and an end point on the map.');
    }
});
