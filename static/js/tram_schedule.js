// /static/js/tram_schedule.js
document.addEventListener('DOMContentLoaded', () => {
    const trainBtn = document.getElementById('train-btn');
    const routeItems = document.querySelectorAll('.route-list li');

    // Define tramStops locally
    const tramStops = [
        { direction: "Westbound", code: "001W", name: "Shau Kei Wan" },
        { direction: "Westbound", code: "002W", name: "North Point" },
        { direction: "Westbound", code: "003W", name: "Causeway Bay" },
        { direction: "Westbound", code: "004W", name: "Western Market" },
        { direction: "Westbound", code: "005W", name: "Kennedy Town" },
        { direction: "Eastbound", code: "001E", name: "Kennedy Town" },
        { direction: "Eastbound", code: "002E", name: "Western Market" },
        { direction: "Eastbound", code: "003E", name: "Causeway Bay" },
        { direction: "Eastbound", code: "004E", name: "North Point" },
        { direction: "Eastbound", code: "005E", name: "Shau Kei Wan" }
        // Add more stops as needed
    ];

    // Navigate to train page
    if (trainBtn) {
        trainBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Function to close all route details
    function closeAllDetails() {
        document.querySelectorAll('.route-details').forEach(detail => {
            detail.classList.remove('active');
        });
    }

    // Add event listeners to each route item
    routeItems.forEach(item => {
        const westBtn = item.querySelector('.west-btn');
        const eastBtn = item.querySelector('.east-btn');
        const details = item.querySelector('.route-details');
        const routeTime = item.getAttribute('data-time');
        const routeFare = item.getAttribute('data-fare');

        function showStops(direction) {
            closeAllDetails();

            // Populate route details
            details.innerHTML = `
                <div class="route-info">
                    Journey Time: ${routeTime} min | Full Fare: ${routeFare}
                    <button class="details-btn">Details</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Traveling Direction</th>
                            <th>Stops Code</th>
                            <th>Stops Name</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            `;

            const tbody = details.querySelector('tbody');
            const filteredStops = tramStops.filter(stop => stop.direction === direction);
            filteredStops.forEach(stop => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${stop.direction}</td>
                    <td>${stop.code}</td>
                    <td>${stop.name}</td>
                `;
                tbody.appendChild(row);
            });

            details.classList.add('active');

            // Add event listener to the details button dynamically
            const detailsBtn = details.querySelector('.details-btn');
            detailsBtn.addEventListener('click', () => {
                window.location.href = 'https://www.hktramways.com/en/schedules-fares';
            });
        }

        westBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showStops('Westbound');
        });

        eastBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showStops('Eastbound');
        });

        // Hide details when clicking outside
        document.addEventListener('click', (e) => {
            if (!item.contains(e.target) && !details.contains(e.target)) {
                details.classList.remove('active');
            }
        });
    });
});