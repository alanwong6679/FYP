let originalContent = '';

function toggleModal() {
    var modal = document.getElementById('newsModal');
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

function fetchNewsContent() {
    fetch('https://programme.rthk.hk/channel/radio/trafficnews/index.php')
        .then(response => response.text())
        .then(data => {
            var parser = new DOMParser();
            var doc = parser.parseFromString(data, 'text/html');
            var newsItems = doc.querySelectorAll('ul.dec > li.inner');
            var innerContent = '';
            newsItems.forEach(item => {
                var textContent = item.textContent.trim();
                innerContent += '<div class="news-item">' + textContent + '</div>';
            });
            originalContent = innerContent;
            document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
            toggleModal();
        })
        .catch(error => console.error('Error fetching news content:', error));
}

document.addEventListener('DOMContentLoaded', function() {
    var newsIcon = document.querySelector('.news-icon');
    newsIcon.addEventListener('click', fetchNewsContent);
    document.getElementById('btnChinese').addEventListener('click', () => {
        document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
    });
});

const lineNames = {
    "AEL": "Airport Express Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #00888A; border-radius: 5px;'></span>",
    "TCL": "Tung Chung Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #F7943E; border-radius: 5px;'></span>",
    "TML": "Tuen Ma Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #923011; border-radius: 5px;'></span>",
    "TKL": "Tseung Kwan O Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #7D499D; border-radius: 5px;'></span>",
    "EAL": "East Rail Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #53B7E8; border-radius: 5px;'></span>",
    "SIL": "South Island Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #BAC429; border-radius: 5px;'></span>",
    "TWL": "Tsuen Wan Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #ED1D24; border-radius: 5px;'></span>",
    "ISL": "Island Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #007DC5; border-radius: 5px;'></span>",
    "KTL": "Kwun Tong Line <span style='display: inline-block; width: 20px; height: 10px; background-color: #00AB4E; border-radius: 5px;'></span>"
};

async function fetchSchedule() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentStation = urlParams.get('currentStation');
    const destinationStation = urlParams.get('destinationStation');

    if (!currentStation || !destinationStation) {
        console.error("Invalid station selection: Missing currentStation or destinationStation");
        document.getElementById('schedule').innerHTML = '<div class="error">Invalid station selection. Please go back and try again.</div>';
        return;
    }

    try {
        console.log(`Fetching schedule for ${currentStation} to ${destinationStation}`);
        const response = await fetch('/fetch_schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                currentStation: currentStation,
                destinationStation: destinationStation,
            }),
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log("API Response:", data);

        if (data.error) {
            console.error("API Error:", data.error);
            document.getElementById('schedule').innerHTML = `<div class="error">${data.error}</div>`;
        } else {
            displayRouteOptions(data.bestRoute, data.alternativeRoutes, data.schedules, currentStation, destinationStation);
        }
    } catch (error) {
        console.error('Error fetching schedule:', error);
        document.getElementById('schedule').innerHTML = '<div class="error">An error occurred while fetching the schedule.</div>';
    }
}

function displayRouteOptions(bestRoute, alternativeRoutes, schedules, currentStation, destinationStation) {
    const routeOptions = document.getElementById('route-options');
    const scheduleDetail = document.getElementById('schedule');
    routeOptions.innerHTML = ''; // Clear previous content

    const routes = [
        { route: bestRoute, name: 'Best Route' },
        ...alternativeRoutes.map((route, index) => ({ route, name: `Alternative Route ${index + 1}` }))
    ];

    routes.forEach(routeData => {
        const routeOption = document.createElement('div');
        routeOption.className = 'route-option';

        const routeParts = [];
        const lines = routeData.route.route;
        const interchanges = routeData.route.interchanges;

        for (let i = 0; i < lines.length; i++) {
            routeParts.push(lineNames[lines[i]]);
            if (i < interchanges.length - 1) {
                routeParts.push(getStationFullName(interchanges[i]));
            }
        }
        routeParts.push(getStationFullName(destinationStation));

        const routeString = routeParts.join(' → ');
        routeOption.innerHTML = `
            <strong>${routeData.name}:</strong> ${routeString} 
            (${routeData.route.interchangeCount} interchange${routeData.route.interchangeCount !== 1 ? 's' : ''})
        `;

        routeOption.addEventListener('click', () => {
            displaySchedule(schedules, routeData.route.route, currentStation, destinationStation);
            scheduleDetail.style.display = 'block';
        });

        routeOptions.appendChild(routeOption);
    });
}

function displaySchedule(data, route, currentStation, destinationStation) {
    const scheduleDetail = document.getElementById('schedule');
    if (!data) {
        scheduleDetail.innerHTML = '<div class="error">No schedule data available.</div>';
        return;
    }

    let html = '';
    const currentStationName = getStationFullName(currentStation);
    const destinationStationName = getStationFullName(destinationStation);

    html += `<h2>From ${currentStationName} to ${destinationStationName}</h2>`;

    route.forEach(line => {
        const lineName = lineNames[line] || line;
        html += `
            <h2>${lineName}</h2>
            <div>
                <strong>Current Time:</strong> ${data[line]?.curr_time || '-'}<br>
                <strong>System Time:</strong> ${data[line]?.sys_time || '-'}
            </div>
            <h3>UP Trains</h3>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Platform</th>
                        <th>Destination</th>
                        <th>Sequence</th>
                        <th>Valid</th>
                    </tr>
                </thead>
                <tbody>`;

        if (data[line]?.up?.length === 0) {
            html += `<tr><td colspan="5">No UP trains available</td></tr>`;
        } else {
            data[line]?.up?.forEach(train => {
                html += `
                    <tr>
                        <td>${train.time}</td>
                        <td>${train.plat}</td>
                        <td class="dest-cell" data-dest="${train.dest}">${train.dest}</td>
                        <td>${train.seq}</td>
                        <td>${train.valid}</td>
                    </tr>`;
            });
        }

        html += `</tbody></table>
                <h3>DOWN Trains</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Platform</th>
                            <th>Destination</th>
                            <th>Sequence</th>
                            <th>Valid</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (data[line]?.down?.length === 0) {
            html += `<tr><td colspan="5">No DOWN trains available</td></tr>`;
        } else {
            data[line]?.down?.forEach(train => {
                html += `
                    <tr>
                        <td>${train.time}</td>
                        <td>${train.plat}</td>
                        <td class="dest-cell" data-dest="${train.dest}">${train.dest}</td>
                        <td>${train.seq}</td>
                        <td>${train.valid}</td>
                    </tr>`;
            });
        }

        html += `</tbody></table>`;
    });

    scheduleDetail.innerHTML = html;
    updateStationNames();
}

function getStationFullName(code) {
    for (const line in lines) {
        const station = lines[line].find(station => station.value === code);
        if (station) {
            return station.text;
        }
    }
    return code;
}

function updateStationNames() {
    const destCells = document.querySelectorAll('.dest-cell');
    destCells.forEach(cell => {
        const destCode = cell.dataset.dest;
        cell.innerText = getStationFullName(destCode);
    });
}

fetchSchedule();