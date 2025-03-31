document.addEventListener('DOMContentLoaded', function () {
    // Fetch KMB bus stop data
    fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop')
        .then(response => response.json())
        .then(data => {
            console.log('KMB Stop Data:', data);
            if (data && data.data) {
                populateStopDropdowns(data.data);  // Ensure the correct key is used
            } else {
                console.error('Unexpected API response format', data);
            }
        })
        .catch(error => {
            console.error('Error loading KMB stop data:', error);
        });

    // Function to populate the start and end stop dropdowns
    function populateStopDropdowns(stops) {
        const startSelect = document.getElementById('start-stop');
        const endSelect = document.getElementById('end-stop');

        if (!startSelect || !endSelect) {
            console.error('Dropdown elements not found');
            return;
        }

        // Clear existing options
        startSelect.innerHTML = '<option value="">Select Bus Stop</option>';
        endSelect.innerHTML = '<option value="">Select Bus Stop</option>';

        stops.forEach(stop => {
            const option = document.createElement('option');
            option.value = `${stop.lat},${stop.long}`; // Ensure correct property names
            option.textContent = stop.name_en || stop.name_tc || 'Unknown Stop'; // Use English or Traditional Chinese name
            startSelect.appendChild(option);

            const endOption = option.cloneNode(true); // Clone for end dropdown
            endSelect.appendChild(endOption);
        });
    }

    // Event listener for the "Find Bus Route" button
    document.getElementById('searchBusBtn').addEventListener('click', function () {
        const startSelect = document.getElementById('start-stop');
        const endSelect = document.getElementById('end-stop');

        const startCoordinates = startSelect.value.split(',');
        const endCoordinates = endSelect.value.split(',');

        if (startCoordinates.length === 2 && endCoordinates.length === 2) {
            findBusRoute(startCoordinates, endCoordinates);
        } else {
            alert("Please select both start and end locations.");
        }
    });

    // Function to find the bus route using OpenRouteService API
    function findBusRoute(startCoordinates, endCoordinates) {
        const apiKey = '5b3ce3597851110001cf62486e723c056f9e47d18669bd415c1d2219'; // Replace with your API Key
        const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startCoordinates[1]},${startCoordinates[0]}&end=${endCoordinates[1]},${endCoordinates[0]}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0]; // First route returned
                    const routeCoordinates = route.geometry.coordinates;

                    // Create a polyline for the bus route
                    const routeLine = L.polyline(routeCoordinates.map(coord => [coord[1], coord[0]]), { color: 'blue' }).addTo(map);
                    routeLine.bindPopup("Bus Route").openPopup();

                    document.getElementById('routeInfo').innerText = `Bus Route: Start at (${startCoordinates[0]}, ${startCoordinates[1]}) → End at (${endCoordinates[0]}, ${endCoordinates[1]})`;
                } else {
                    alert("Unable to find a valid bus route.");
                }
            })
            .catch(error => {
                console.error("Error fetching bus route:", error);
                alert("Error fetching bus route.");
            });
    }
});
