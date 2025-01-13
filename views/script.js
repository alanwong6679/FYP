console.log("script.js loaded");

// Function to get a unique list of stations
function getUniqueStations(stationsData) {
    const stationSet = new Set();
    const stations = [];

    for (let line in stationsData) {
        stationsData[line].forEach(station => {
            if (!stationSet.has(station.value)) {
                stationSet.add(station.value);
                stations.push(station);
            }
        });
    }

    return stations;
}

// Function to make dropdown searchable
function makeSearchable(inputId, optionsId) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(optionsId);
    const uniqueStations = getUniqueStations(lines);

    input.addEventListener('input', function() {
        const filter = input.value.toLowerCase();
        optionsContainer.innerHTML = '';

        uniqueStations.forEach(station => {
            if (station.text.toLowerCase().includes(filter)) {
                const div = document.createElement('div');
                div.textContent = station.text;
                div.dataset.value = station.value;
                div.addEventListener('click', function() {
                    input.value = station.text;
                    input.dataset.value = station.value;
                    optionsContainer.style.display = 'none';
                });
                optionsContainer.appendChild(div);
            }
        });

        optionsContainer.style.display = optionsContainer.childElementCount > 0 ? 'block' : 'none';
    });

    input.addEventListener('focus', function() {
        optionsContainer.style.display = optionsContainer.childElementCount > 0 ? 'block' : 'none';
    });

    document.addEventListener('click', function(event) {
        if (!input.contains(event.target) && !optionsContainer.contains(event.target)) {
            optionsContainer.style.display = 'none';
        }
    });
}

// Call the function to make inputs searchable on page load
document.addEventListener('DOMContentLoaded', function() {
    makeSearchable('currentStationInput', 'currentStationOptions');
    makeSearchable('destinationStationInput', 'destinationStationOptions');
});

document.getElementById('routeForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const currentStation = document.getElementById('currentStationInput').dataset.value;
    const destinationStation = document.getElementById('destinationStationInput').dataset.value;
    const url = `/mtr_schedule.html?currentStation=${currentStation}&destinationStation=${destinationStation}`;
    
    // Redirect to mtr_schedule.html with query parameters
    window.location.href = url;
});