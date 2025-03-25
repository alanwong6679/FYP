
// Function to get and display location, then fetch temperature
async function setupAutocomplete() {
    const response = await fetch('/get-locations');
    const data = await response.json();
    const input = document.getElementById('locationInput');
    new Awesomplete(input, {
        list: data.locations,
        minChars: 1,
        autoFirst: true
    });

    // Add event listener for selection
    input.addEventListener('awesomplete-selectcomplete', async (event) => {
        const selectedLocation = event.text.value;
        const coordsResponse = await fetch('/get-coordinates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: selectedLocation })
        });
        const coordsData = await coordsResponse.json();
        if (coordsData.error) {
            document.getElementById('temperature').innerText = 'Error fetching coordinates.';
            return;
        }
        await showLocationAndFetchTemperature({
            coords: { latitude: coordsData.latitude, longitude: coordsData.longitude }
        });
    });
}

// Get temperature based on coordinates
function getTemperature() {
    if (!navigator.geolocation) {
        document.getElementById("temperature").innerHTML = "Geolocation not supported by your browser.";
        return;
    }

    document.getElementById("temperature").innerHTML = "Fetching your location...";

    navigator.geolocation.getCurrentPosition(
        showLocationAndFetchTemperature,
        showError,
        { timeout: 10000, enableHighAccuracy: true }
    );
}

// Fetch temperature and display location
async function showLocationAndFetchTemperature(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    console.log(`GPS Coordinates: Lat ${latitude}, Lon ${longitude}`);

    document.getElementById("temperature").innerHTML = 
        `Your location: Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}`;

    try {
        const response = await fetch('/get-temperature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude, longitude })
        });

        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        if (data.error) {
            document.getElementById("temperature").innerHTML += ` - ${data.error}`;
        } else {
            document.getElementById("temperature").innerHTML = 
                `Location: ${data.location}, Temperature: ${data.temperature}°${data.unit}`;
        }
    } catch (error) {
        document.getElementById("temperature").innerHTML += " - Error fetching temperature.";
    }
}

// Error callback: Display error message
function showError(error) {
    let message;
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message = "Location access denied.";
            break;
        case error.POSITION_UNAVAILABLE:
            message = "Location unavailable.";
            break;
        case error.TIMEOUT:
            message = "Location request timed out.";
            break;
        default:
            message = "Unknown geolocation error.";
    }
    document.getElementById("temperature").innerHTML = message;
}

// Initialize
window.onload = function() {
    setupAutocomplete();
    getTemperature();
};
