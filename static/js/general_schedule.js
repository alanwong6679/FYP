// mtr.js
const lineNames = {
    "AEL": "Airport Express Line <span style='display:inline-block;width:20px;height:10px;background:#00888A;border-radius:5px'></span>",
    "TCL": "Tung Chung Line <span style='display:inline-block;width:20px;height:10px;background:#F7943E;border-radius:5px'></span>",
    "TML": "Tuen Ma Line <span style='display:inline-block;width:20px;height:10px;background:#923011;border-radius:5px'></span>",
    "TKL": "Tseung Kwan O Line <span style='display:inline-block;width:20px;height:10px;background:#7D499D;border-radius:5px'></span>",
    "EAL": "East Rail Line <span style='display:inline-block;width:20px;height:10px;background:#53B7E8;border-radius:5px'></span>",
    "SIL": "South Island Line <span style='display:inline-block;width:20px;height:10px;background:#BAC429;border-radius:5px'></span>",
    "TWL": "Tsuen Wan Line <span style='display:inline-block;width:20px;height:10px;background:#ED1D24;border-radius:5px'></span>",
    "ISL": "Island Line <span style='display:inline-block;width:20px;height:10px;background:#007DC5;border-radius:5px'></span>",
    "KTL": "Kwun Tong Line <span style='display:inline-block;width:20px;height:10px;background:#00AB4E;border-radius:5px'></span>"
};

let allRoutes = JSON.parse(localStorage.getItem('allRoutes')) || [];
let allStops = JSON.parse(localStorage.getItem('allStops')) || [];
let routeStopsMap = JSON.parse(localStorage.getItem('routeStopsMap')) || [];
let originalContent = '';

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyStops(station, maxDistance = 1000) {
    return allStops.filter(s => 
        s.lat && s.long && station.lat && station.long &&
        haversineDistance(parseFloat(s.lat), parseFloat(s.long), station.lat, station.long) <= maxDistance
    );
}

function findNearestMTRStation(busStop, mtrStations) {
    if (!busStop || !busStop.lat || !busStop.long) {
        return { station: null, distance: NaN };
    }
    let minDistance = Infinity;
    let nearest = null;
    for (const station of mtrStations) {
        if (!station.lat || !station.long) continue;
        const distance = haversineDistance(
            parseFloat(busStop.lat),
            parseFloat(busStop.long),
            parseFloat(station.lat),
            parseFloat(station.long)
        );
        if (!isNaN(distance) && distance < minDistance) {
            minDistance = distance;
            nearest = station;
        }
    }
    return { station: nearest, distance: minDistance };
}

function getUniqueMTRStations() {
    const stationSet = new Set();
    const stations = [];
    for (let line in lines) {
        lines[line].forEach(station => {
            if (!stationSet.has(station.value)) {
                stationSet.add(station.value);
                stations.push({
                    value: station.value,
                    text: station.text,
                    lat: station.lat,
                    long: station.long
                });
            }
        });
    }
    return stations;
}

function toggleModal() {
    const modal = document.getElementById('newsModal');
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

function fetchNewsContent() {
    fetch('https://programme.rthk.hk/channel/radio/trafficnews/index.php')
        .then(r => r.text())
        .then(d => {
            const doc = new DOMParser().parseFromString(d, 'text/html');
            originalContent = Array.from(doc.querySelectorAll('ul.dec > li.inner'))
                .map(i => `<div class="news-item">${i.textContent.trim()}</div>`)
                .join('') || 'No news.';
            document.getElementById('newsContent').innerHTML = originalContent;
            toggleModal();
        })
        .catch(e => console.error('News fetch error:', e));
}

async function fetchSchedule(cs, ds) {
    try {
        const response = await fetch('/fetch_schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentStation: cs, destinationStation: ds })
        });
        const { error, schedules, bestRoute, alternativeRoutes } = await response.json();
        document.getElementById('schedule').innerHTML = error ? `<div class="error">${error}</div>` : '';
        if (!error) displayRouteOptions(bestRoute, alternativeRoutes, schedules, cs, ds);
    } catch (e) {
        document.getElementById('schedule').innerHTML = '<div class="error">Fetch failed.</div>';
        console.error('Schedule error:', e);
    }
}

function displayRouteOptions(best, alts, schedules, cs, ds) {
    const opts = document.getElementById('route-options');
    opts.innerHTML = '';
    [[best, 'Best Route'], ...alts.map((r, i) => [r, `Alternative Route ${i + 1}`])].forEach(([r, n]) => {
        const div = document.createElement('div');
        div.className = 'route-option';
        div.innerHTML = `<strong>${n}:</strong> ${r.route.map(l => lineNames[l]).concat(r.interchanges.slice(-1).map(getStationFullName)).join(' → ')} (${r.interchangeCount} interchange${r.interchangeCount !== 1 ? 's' : ''})`;
        div.onclick = () => displaySchedule(schedules, r.route, cs, ds);
        opts.appendChild(div);
    });
}

function displaySchedule(data, route, cs, ds) {
    const s = document.getElementById('schedule');
    s.innerHTML = data ? `<h2>From ${getStationFullName(cs)} to ${getStationFullName(ds)}</h2>` + route.map(line => `
        <h2>${lineNames[line]}</h2>
        <div><strong>Current Time:</strong> ${data[line]?.curr_time || '-'}<br><strong>System Time:</strong> ${data[line]?.sys_time || '-'}</div>
        <h3>UP Trains</h3><table class="schedule-table"><tr><th>Time</th><th>Platform</th><th>Destination</th><th>Sequence</th><th>Valid</th></tr>${data[line]?.up?.length ? data[line].up.map(t => `<tr><td>${t.time}</td><td>${t.plat}</td><td class="dest-cell" data-dest="${t.dest}">${t.dest}</td><td>${t.seq}</td><td>${t.valid}</td></tr>`).join('') : '<tr><td colspan="5">No UP trains</td></tr>'}</table>
        <h3>DOWN Trains</h3><table class="schedule-table"><tr><th>Time</th><th>Platform</th><th>Destination</th><th>Sequence</th><th>Valid</th></tr>${data[line]?.down?.length ? data[line].down.map(t => `<tr><td>${t.time}</td><td>${t.plat}</td><td class="dest-cell" data-dest="${t.dest}">${t.dest}</td><td>${t.seq}</td><td>${t.valid}</td></tr>`).join('') : '<tr><td colspan="5">No DOWN trains</td></tr>'}</table>
    `).join('') : '<div class="error">No schedule data.</div>';
    document.querySelectorAll('.dest-cell').forEach(c => c.innerText = getStationFullName(c.dataset.dest));
}

function fetchBusRoutes(start, end) {
    const [ss, es] = [allStops.find(s => s.stop === start), allStops.find(s => s.stop === end)];
    if (!ss || !es) return document.getElementById('schedule').innerHTML = '<p>Invalid bus stops.</p>';
    const [startStops, endStops] = [findNearbyStops(ss), findNearbyStops(es)];
    const [startIds, endIds] = [startStops.map(s => s.stop), endStops.map(s => s.stop)];
    const routes = [];
    allRoutes.forEach(r => ['outbound', 'inbound'].forEach(d => {
        const key = `${r.route}-${d}`;
        const stops = routeStopsMap[key] || [];
        const sm = stops.filter(id => startIds.includes(id));
        const em = stops.filter(id => endIds.includes(id));
        if (sm.length && em.length) {
            const cs = sm.reduce((a, id) => {
                const s = allStops.find(s => s.stop === id);
                const d = haversineDistance(parseFloat(ss.lat), parseFloat(ss.long), parseFloat(s.lat), parseFloat(s.long));
                return d < a[1] ? [id, d] : a;
            }, ['', Infinity])[0];
            const si = stops.indexOf(cs);
            const pes = em.filter(id => stops.indexOf(id) > si);
            if (pes.length) {
                const ce = pes.reduce((a, id) => {
                    const s = allStops.find(s => s.stop === id);
                    const d = haversineDistance(parseFloat(es.lat), parseFloat(es.long), parseFloat(s.lat), parseFloat(s.long));
                    return d < a[1] ? [id, d] : a;
                }, ['', Infinity])[0];
                routes.push({
                    route: r.route,
                    direction: d,
                    stops: stops.map(id => ({ id, name: allStops.find(s => s.stop === id)?.name_en || `Stop ${id}` })),
                    boardingStop: cs,
                    alightingStop: ce,
                    boardingDistance: haversineDistance(parseFloat(ss.lat), parseFloat(ss.long), parseFloat(allStops.find(s => s.stop === cs).lat), parseFloat(allStops.find(s => s.stop === cs).long)),
                    alightingDistance: haversineDistance(parseFloat(es.lat), parseFloat(es.long), parseFloat(allStops.find(s => s.stop === ce).lat), parseFloat(allStops.find(s => s.stop === ce).long))
                });
            }
        }
    }));
    document.getElementById('schedule').innerHTML = routes.length ? '<h3>Direct Bus Routes</h3>' + routes.map((r, i) => `
        <div class="route-option" id="route-summary-${i}" data-route="${r.route}" data-direction="${r.direction}" data-boarding-stop="${r.boardingStop}" onclick="toggleRouteDetails('route-details-${i}', this)">
            <strong>Route ${r.route} (${r.direction})</strong> - ${r.stops.length - 1} stops<br>Walk ${Math.round(r.boardingDistance)}m to ${r.stops.find(s => s.id === r.boardingStop).name}, alight at ${r.stops.find(s => s.id === r.alightingStop).name} (${Math.round(r.alightingDistance)}m)
        </div>
        <div class="route-details" id="route-details-${i}">${r.stops.map(s => `<li class="${s.id === r.boardingStop ? 'boarding-stop' : s.id === r.alightingStop ? 'alighting-stop' : ''}">${s.name}${s.id === r.boardingStop ? `<span id="eta-${i}"></span>` : ''}</li>`).join('')}</div>
    `).join('') : '<p>No direct bus routes.</p>';
}

function toggleRouteDetails(id, el) {
    const details = document.getElementById(id);
    details.style.display = details.style.display === 'none' ? 'block' : 'none';
    if (details.style.display === 'block' && window.currentRoutes) {
        const routeIndex = parseInt(id.split('-')[2]);
        const route = window.currentRoutes[routeIndex];
        if (route.busRoute) {
            const company = localStorage.getItem('company') || 'Citybus';
            fetchETA(route.busRoute.route, route.busRoute.direction, route.busRoute.boardingStop, id, company);
        }
    }
}

async function fetchETA(route, dir, stop, detailsId, company) {
    const span = document.querySelector(`#${detailsId} .boarding-stop span`) || document.createElement('span');
    try {
        const url = company === 'KMB'
            ? `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stop}/${route}/1`
            : `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop}/${route}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { data } = await response.json();

        const dirMapping = { "outbound": "O", "inbound": "I" };
        const direction = dirMapping[dir] || dir;
        let eta = null;

        if (company === 'KMB') {
            eta = data.find(e => e.seq === 1 && e.dir === direction) || data.find(e => e.seq === 1);
            if (eta?.eta) {
                const mins = Math.round((new Date(eta.eta) - new Date()) / 60000);
                span.textContent = mins >= 0 ? ` (ETA: ${mins} min)` : ` (Due now)`;
            } else {
                span.textContent = ` (No ETA data)`;
            }
        } else {
            eta = data.find(e => e.eta_seq === 1 && e.dir === direction) || data.find(e => e.eta_seq === 1);
            if (eta?.eta) {
                const mins = Math.round((new Date(eta.eta) - new Date(eta.data_timestamp)) / 60000);
                span.textContent = mins >= 0 ? ` (ETA: ${mins} min)` : ` (Due now)`;
            } else {
                span.textContent = ` (No ETA data)`;
            }
        }
    } catch (e) {
        span.textContent = ` (ETA unavailable)`;
    }
}

function getStationFullName(code) {
    return Object.values(lines).flat().find(s => s.value === code)?.text || code;
}

function displayMTRWithWalking(mtrResponse, start, interchange, endStop, walkingDistance) {
    const scheduleDiv = document.getElementById('schedule');
    scheduleDiv.innerHTML = `
        <h3>MTR Route from ${getStationFullName(start)} to ${getStationFullName(interchange)}</h3>
        <p>${mtrResponse.bestRoute} - Approx. ${mtrResponse.schedules.duration} mins</p>
        <p>Then walk ${Math.round(walkingDistance)}m to ${endStop.name_en} (Bus Stop)</p>
    `;
}

async function fetchMTRToBus(currentStation, endBusStop, mtrStations) {
    const endStop = allStops.find(s => s.stop === endBusStop);
    if (!endStop || isNaN(parseFloat(endStop.lat)) || isNaN(parseFloat(endStop.long))) {
        document.getElementById('schedule').innerHTML = '<p>Invalid ending bus stop.</p>';
        return;
    }

    const nearestMTR = findNearestMTRStation(endStop, mtrStations);
    if (!nearestMTR.station) {
        document.getElementById('schedule').innerHTML = '<p>No nearby MTR station found.</p>';
        return;
    }
    const walkingDistance = nearestMTR.distance;
    const destinationMTRStation = nearestMTR.station.value;

    const mtrResponse = await fetch('/fetch_schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStation, destinationStation: destinationMTRStation })
    }).then(res => res.json()).catch(err => {
        console.error(`MTR fetch error: ${err}`);
        return { error: 'MTR schedule unavailable' };
    });

    if (mtrResponse.error) {
        document.getElementById('schedule').innerHTML = `<p>Error fetching MTR schedule: ${mtrResponse.error}</p>`;
        return;
    }

    const routeString = mtrResponse.bestRoute.route.map(line => lineNames[line]).join(' → ');
    const mtrTime = mtrResponse.bestRoute.route.reduce((total, line) => {
        const lineStations = lines[line].length;
        return total + (lineStations * 2);
    }, 0) + (mtrResponse.bestRoute.interchangeCount * 5);
    const walkingTime = walkingDistance / 5000 * 60;
    const estimatedTime = Math.round(mtrTime + walkingTime);

    const routes = [{
        type: 'MTR',
        mtrRoute: mtrResponse.bestRoute,
        schedules: mtrResponse.schedules,
        from: currentStation,
        to: destinationMTRStation,
        interchangeStation: destinationMTRStation,
        walkingDistanceToMTR: walkingDistance,
        endStopName: endStop.name_en,
        estimatedTime
    }];

    displayMixedRoutes(routes, 'MTR-to-Bus', currentStation, endBusStop);
}

async function fetchBusToMTR(startBusStop, destinationStation, mtrStations) {
    const startStop = allStops.find(s => s.stop === startBusStop);
    if (!startStop) {
        document.getElementById('schedule').innerHTML = '<p>Invalid starting bus stop.</p>';
        return;
    }
    const company = new URLSearchParams(window.location.search).get('company') || 'Citybus';
    localStorage.setItem('company', company);
    const nearbyStartStops = findNearbyStops(startStop, 500);
    const nearbyStartStopIds = nearbyStartStops.map(s => s.stop);
    const busRoutes = findBusRoutesToStops(nearbyStartStopIds, allStops.map(s => s.stop));

    if (!busRoutes.length) {
        document.getElementById('schedule').innerHTML = '<p>No bus routes found.</p>';
        return;
    }

    const routes = [];
    for (const busRoute of busRoutes) {
        const boardingStop = allStops.find(s => s.stop === busRoute.boardingStop);
        const alightingStop = allStops.find(s => s.stop === busRoute.alightingStop);

        const stopIndexStart = busRoute.stops.findIndex(s => s.id === busRoute.boardingStop);
        const stopIndexEnd = busRoute.stops.findIndex(s => s.id === busRoute.alightingStop);
        const stopCount = stopIndexEnd >= stopIndexStart ? stopIndexEnd - stopIndexStart : 0;

        const busDetails = {
            busRoute,
            boardingStopName: boardingStop?.name_en || `Stop ${busRoute.boardingStop}`,
            alightingStopName: alightingStop?.name_en || `Stop ${busRoute.alightingStop}`,
            boardingDistance: busRoute.boardingDistance,
            stopCount
        };

        let walkingDistanceToMTR = "unavailable";
        let interchangeStation = null;
        let schedules = null;

        if (alightingStop && alightingStop.lat && alightingStop.long && !isNaN(parseFloat(alightingStop.lat)) && !isNaN(parseFloat(alightingStop.long))) {
            const nearestMTR = findNearestMTRStation(alightingStop, mtrStations);
            if (nearestMTR.station && !isNaN(nearestMTR.distance)) {
                walkingDistanceToMTR = nearestMTR.distance;
                interchangeStation = nearestMTR.station.value;

                const mtrResponse = await fetch('/fetch_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentStation: interchangeStation, destinationStation })
                }).then(res => res.json()).catch(err => {
                    console.error(`MTR fetch error: ${err}`);
                    return { error: 'MTR schedule unavailable' };
                });

                if (!mtrResponse.error) {
                    busDetails.mtrRoute = mtrResponse.bestRoute;
                    schedules = mtrResponse.schedules;
                }
            }
        }

        const busTime = stopCount * 2;
        const walkingTime = (typeof walkingDistanceToMTR === 'number' ? walkingDistanceToMTR : 0) / 5000 * 60;
        const mtrTime = schedules ? Object.keys(schedules).reduce((total, line) => {
            const lineStations = lines[line].length;
            return total + (lineStations * 2);
        }, 0) + (busDetails.mtrRoute?.interchangeCount || 0) * 5 : 0;

        routes.push({
            ...busDetails,
            interchangeStation,
            walkingDistanceToMTR,
            schedules,
            estimatedTime: Math.round(busTime + walkingTime + mtrTime)
        });
    }

    routes.sort((a, b) => a.estimatedTime - b.estimatedTime);
    displayMixedRoutes(routes.slice(0, 3), 'Bus-to-MTR', startBusStop, destinationStation);
}

function findBusRoutesToStops(startBusStopIds, targetStopIds) {
    const directRoutes = [];
    const startStops = Array.isArray(startBusStopIds) ? startBusStopIds.map(id => allStops.find(s => s.stop === id)) : [allStops.find(s => s.stop === startBusStopIds)];
    const startStopIdsArray = Array.isArray(startBusStopIds) ? startBusStopIds : [startBusStopIds];

    for (const route of allRoutes) {
        for (const direction of ['outbound', 'inbound']) {
            const key = `${route.route}-${direction}`;
            const stops = routeStopsMap[key] || [];
            const startMatches = stops.filter(id => startStopIdsArray.includes(id));
            const endMatches = stops.filter(id => targetStopIds.includes(id));
            if (startMatches.length > 0 && endMatches.length > 0) {
                let closestStartStop = null, minStartDistance = Infinity;
                const referenceStartStop = startStops[0];
                for (const stopId of startMatches) {
                    const stop = allStops.find(s => s.stop === stopId);
                    const distance = haversineDistance(parseFloat(referenceStartStop.lat), parseFloat(referenceStartStop.long), parseFloat(stop.lat), parseFloat(stop.long));
                    if (distance < minStartDistance) {
                        minStartDistance = distance;
                        closestStartStop = stopId;
                    }
                }
                const startIndex = stops.indexOf(closestStartStop);
                const possibleEndStops = endMatches.filter(id => stops.indexOf(id) > startIndex);
                if (possibleEndStops.length > 0) {
                    let closestEndStop = null, minEndDistance = Infinity;
                    const referenceEndStop = allStops.find(s => s.stop === targetStopIds[0]);
                    for (const stopId of possibleEndStops) {
                        const stop = allStops.find(s => s.stop === stopId);
                        const distance = haversineDistance(parseFloat(referenceEndStop.lat), parseFloat(referenceEndStop.long), parseFloat(stop.lat), parseFloat(stop.long));
                        if (distance < minEndDistance) {
                            minEndDistance = distance;
                            closestEndStop = stopId;
                        }
                    }
                    const stopDetails = stops.map(id => {
                        const stop = allStops.find(s => s.stop === id);
                        return { id, name: stop ? stop.name_en : `Stop ${id}` };
                    });
                    directRoutes.push({
                        route: route.route,
                        direction,
                        stops: stopDetails,
                        boardingStop: closestStartStop,
                        alightingStop: closestEndStop,
                        boardingDistance: minStartDistance,
                        alightingDistance: minEndDistance
                    });
                }
            }
        }
    }
    return directRoutes;
}

function displayMixedRoutes(routes, type, start, end) {
    const scheduleDiv = document.getElementById('schedule');
    if (routes.length === 0) {
        scheduleDiv.innerHTML = `<p>No ${type} routes found.</p>`;
        return;
    }

    window.currentRoutes = routes; // Temporary global for toggleRouteDetails

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);

    scheduleDiv.innerHTML = `<h3>${type} Routes</h3>` + routes.map((route, i) => {
        const mtrRoute = route.mtrRoute;
        const interchangeName = getStationFullName(route.interchangeStation || 'unknown');
        const walkDistanceText = (typeof route.walkingDistanceToMTR === 'number' && !isNaN(route.walkingDistanceToMTR)) 
            ? `${Math.round(route.walkingDistanceToMTR)}m` 
            : 'unavailable';

        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000);
        const arrivalTimeStr = arrivalTime.toTimeString().slice(0, 5);

        if (type === 'Bus-to-MTR') {
            const busRoute = route.busRoute;
            const boardingBusStop = route.boardingStopName;
            const alightingBusStop = route.alightingStopName;
            return `
                <div class="route-option" id="route-summary-${i}" onclick="toggleRouteDetails('route-details-${i}', this)">
                    <strong>Route ${i + 1}</strong><br>
                    <div class="time-display">${currentTime} → ${arrivalTimeStr} <span class="eta">(${route.estimatedTime} mins)</span></div>
                    Bus ${busRoute.route} (${busRoute.direction}): Walk ${Math.round(busRoute.boardingDistance)}m to ${boardingBusStop}, alight at ${alightingBusStop} (${route.stopCount} stops)<br>
                    Walk ${walkDistanceText} to ${interchangeName}<br>
                    ${mtrRoute ? `MTR: ${mtrRoute.route.map(l => lineNames[l]).join(' → ')} to ${getStationFullName(end)}` : 'MTR unavailable'}
                </div>
                <div class="route-details" id="route-details-${i}" style="display: none;">
                    <h4>Bus Segment</h4>
                    <ul class="stop-list">${busRoute.stops.map(s => `
                        <li class="${s.id === busRoute.boardingStop ? 'boarding-stop' : s.id === busRoute.alightingStop ? 'alighting-stop' : ''}">
                            ${s.name}${s.id === busRoute.boardingStop ? `<span id="eta-${i}"></span>` : ''}
                        </li>`).join('')}</ul>
                    <p>Walk ${walkDistanceText} to ${interchangeName}</p>
                    ${mtrRoute ? `
                        <h4>MTR Segment</h4>
                        ${mtrRoute.route.map(line => {
                            const direction = getDirection(route.interchangeStation, end, line, route.schedules);
                            const trains = route.schedules[line]?.[direction] || [];
                            const nextTrain = trains.find(t => new Date(t.time) > new Date()) || trains[0];
                            return `
                                <h5>${lineNames[line]}</h5>
                                <table class="schedule-table">
                                    <tr><th>Next Train (mins)</th><th>Platform</th><th>Destination</th><th>Sequence</th></tr>
                                    ${nextTrain ? `
                                        <tr><td>${calculateETAMins(nextTrain.time)}</td><td>${nextTrain.plat}</td><td>${getStationFullName(nextTrain.dest)}</td><td>${nextTrain.seq}</td></tr>
                                    ` : '<tr><td colspan="4">No upcoming trains</td></tr>'}
                                </table>
                            `;
                        }).join('')}` : '<p>MTR schedule unavailable</p>'}
                </div>
            `;
        } else if (type === 'MTR-to-Bus') {
            return `
                <div class="route-option" id="route-summary-${i}" onclick="toggleRouteDetails('route-details-${i}', this)">
                    <strong>Route ${i + 1}</strong><br>
                    <div class="time-display">${currentTime} → ${arrivalTimeStr} <span class="eta">(${route.estimatedTime} mins)</span></div>
                    MTR: ${mtrRoute.route.map(l => lineNames[l]).join(' → ')}: From ${getStationFullName(route.from)} to ${getStationFullName(route.to)}<br>
                    Then walk ${walkDistanceText} to ${route.endStopName} (Bus Stop)
                </div>
                <div class="route-details" id="route-details-${i}" style="display: none;">
                    <h4>MTR Segment</h4>
                    ${mtrRoute.route.map(line => {
                        const direction = getDirection(route.from, route.to, line, route.schedules);
                        const trains = route.schedules[line]?.[direction] || [];
                        const nextTrain = trains.find(t => new Date(t.time) > new Date()) || trains[0];
                        return `
                            <h5>${lineNames[line]}</h5>
                            <table class="schedule-table">
                                <tr><th>Next Train (mins)</th><th>Platform</th><th>Destination</th><th>Sequence</th></tr>
                                ${nextTrain ? `
                                    <tr><td>${calculateETAMins(nextTrain.time)}</td><td>${nextTrain.plat}</td><td>${getStationFullName(nextTrain.dest)}</td><td>${nextTrain.seq}</td></tr>
                                ` : '<tr><td colspan="4">No upcoming trains</td></tr>'}
                            </table>
                        `;
                    }).join('')}
                    <p>Then walk ${walkDistanceText} to ${route.endStopName} (Bus Stop)</p>
                </div>
            `;
        }
    }).join('');
}

function calculateETAMins(trainTime) {
    const now = new Date();
    const trainDate = new Date(trainTime);
    const diffMs = trainDate - now;
    const mins = Math.round(diffMs / 60000);
    return mins >= 0 ? mins : 'Due';
}

function getDirection(currentStation, destinationStation, line, schedules) {
    const lineStations = lines[line];
    const currentIndex = lineStations.findIndex(s => s.value === currentStation);
    const destIndex = lineStations.findIndex(s => s.value === destinationStation);
    return destIndex > currentIndex ? 'up' : 'down';
}

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const [cs, ds, sbs, ebs] = [params.get('currentStation'), params.get('destinationStation'), params.get('startBusStop'), params.get('endBusStop')];
    const mtrStations = getUniqueMTRStations();

    if (cs && ds) {
        fetchSchedule(cs, ds);
    } else if (sbs && ebs) {
        fetchBusRoutes(sbs, ebs);
    } else if (sbs && ds) {
        fetchBusToMTR(sbs, ds, mtrStations);
    } else if (cs && ebs) {
        fetchMTRToBus(cs, ebs, mtrStations);
    } else {
        document.getElementById('schedule').innerHTML = '<div class="error">Invalid parameters.</div>';
    }
    document.querySelector('.news-icon').addEventListener('click', fetchNewsContent);
    document.getElementById('btnChinese').addEventListener('click', () => document.getElementById('newsContent').innerHTML = originalContent || 'No news.');
    document.querySelector('.close').addEventListener('click', toggleModal);
};