console.log("script.js loaded");

(function() {
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

        if (input && optionsContainer) {
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
    }

    // Function to swap stations
    function swapStations() {
        const currentInput = document.getElementById('currentStationInput');
        const destinationInput = document.getElementById('destinationStationInput');

        // Swap the displayed text (value)
        const tempValue = currentInput.value;
        currentInput.value = destinationInput.value;
        destinationInput.value = tempValue;

        // Swap the dataset values
        const tempDataValue = currentInput.dataset.value || '';
        currentInput.dataset.value = destinationInput.dataset.value || '';
        destinationInput.dataset.value = tempDataValue;
    }

    // Initialize everything on page load
    document.addEventListener('DOMContentLoaded', function() {
        // Make inputs searchable
        makeSearchable('currentStationInput', 'currentStationOptions');
        makeSearchable('destinationStationInput', 'destinationStationOptions');

        // Add swap button functionality
        const swapButton = document.getElementById('swapStations');
        if (swapButton) {
            swapButton.addEventListener('click', swapStations);
        }

        // Form submission
        const routeForm = document.getElementById('routeForm');
        if (routeForm) {
            routeForm.addEventListener('submit', function(event) {
                event.preventDefault();

                const currentStation = document.getElementById('currentStationInput').dataset.value;
                const destinationStation = document.getElementById('destinationStationInput').dataset.value;

                // Validate the input values
                if (!currentStation || !destinationStation) {
                    alert("Please select both a current station and a destination station.");
                    return;
                }

                const url = `/mtr_schedule.html?currentStation=${currentStation}&destinationStation=${destinationStation}`;
                window.location.href = url;
            });
        }
    });
})();