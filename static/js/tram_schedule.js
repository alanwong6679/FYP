// Navigation bar functionality
const trainBtn = document.getElementById('train-btn');
const busBtn = document.getElementById('bus-btn');
const tramBtn = document.getElementById('tram-btn');
const miniBtn = document.getElementById('mini-btn');

trainBtn.addEventListener('click', function() {
    window.location.href = 'index.html';
});

busBtn.addEventListener('click', function() {
    window.location.href = '/bus_schedule.html';
});

tramBtn.addEventListener('click', function() {
    window.location.href = '/tram_schedule.html';
});

miniBtn.addEventListener('click', function() {
    window.location.href = '/minibus_schedule.html';
});

// Route direction buttons functionality
const routeItems = document.querySelectorAll('.route-list li');

function closeAllDetails() {
    document.querySelectorAll('.route-details').forEach(detail => {
        detail.classList.remove('active');
    });
}

routeItems.forEach(item => {
    const westBtn = item.querySelector('.west-btn');
    const eastBtn = item.querySelector('.east-btn');
    const details = item.querySelector('.route-details');
    const routeTime = item.getAttribute('data-time');
    const routeFare = item.getAttribute('data-fare');

    function showStops(direction) {
        closeAllDetails();

        details.innerHTML = `
            <div class="route-info">
                Journey Time: ${routeTime} min | Full Fare: ${routeFare}
                <button class="details-btn" onclick="window.location.href='https://www.hktramways.com/en/schedules-fares'">Details</button>
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
    }

    westBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showStops('Westbound');
    });

    eastBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showStops('Eastbound');
    });

    // Hide details when clicking outside
    document.addEventListener('click', function(e) {
        if (!item.contains(e.target) && !details.contains(e.target)) {
            details.classList.remove('active');
        }
    });
});