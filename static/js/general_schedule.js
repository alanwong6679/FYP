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
let allRoutes = [], allStops = [], routeStopsMap = {},
    originalContent = '', currentRoutes = [],
    sortByTimeAsc = true, sortByWalkAsc = true;

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyStops(station, radius = 1000) {
    return allStops.filter(s => 
        s.lat && s.long && station.lat && station.long && 
        haversineDistance(parseFloat(s.lat), parseFloat(s.long), station.lat, station.long) <= radius
    );
}

function findNearestMTRStation(busStop, mtrStations) {
    if (!busStop || !busStop.lat || !busStop.long) return { station: null, distance: NaN };
    let minDistance = Infinity, nearest = null;
    for (const station of mtrStations) {
        if (!station.lat || !station.long) continue;
        const distance = haversineDistance(parseFloat(busStop.lat), parseFloat(busStop.long), station.lat, station.long);
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
                stations.push({ value: station.value, text: station.text, lat: station.lat, long: station.long });
            }
        });
    }
    return stations;
}

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const [cs, ds, sbs, ebs] = [params.get('currentStation'), params.get('destinationStation'), 
                                params.get('startBusStop'), params.get('endBusStop')];
    const provider = params.get('company');

    allRoutes = [...(JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]')), 
                 ...(JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]'))];
    allStops = [...(JSON.parse(localStorage.getItem('kmb_allStops') || '[]')), 
                  ...(JSON.parse(localStorage.getItem('citybus_allStops') || '[]'))];
    routeStopsMap = {...JSON.parse(localStorage.getItem('kmb_routeStopsMap') || '{}'), 
                     ...JSON.parse(localStorage.getItem('citybus_routeStopsMap') || '{}')};

    if (!allStops.length) {
        document.getElementById('schedule').innerHTML = '<div class="error">Bus data not loaded.</div>';
        return;
    }

    const mtrStations = getUniqueMTRStations();
    const startStop = sbs ? allStops.find(s => s.stop === sbs) : null;
    const endStop = ebs ? allStops.find(s => s.stop === ebs) : null;
    const isCTBStart = startStop && JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]').some(r => routeStopsMap[`${r.route}-O`]?.includes(sbs));
    const isKMBEnd = endStop && JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]').some(r => routeStopsMap[`${r.route}-O`]?.includes(ebs));

    if (cs && ds) fetchSchedule(cs, ds);
    else if (sbs && ebs && !isCTBStart && !isKMBEnd) fetchBusRoutes(sbs, ebs);
    else if (sbs && ds) fetchMixedTransit(sbs, ds, 'bus', 'mtr', mtrStations);
    else if (cs && ebs) fetchMixedTransit(cs, ebs, 'mtr', 'bus', mtrStations);
    else if (sbs && ebs && isCTBStart && isKMBEnd) fetchCTBToKMB(sbs, ebs);
    else document.getElementById('schedule').innerHTML = '<div class="error">Invalid parameters.</div>';

    document.querySelector('.news-icon').onclick = fetchNewsContent;
    document.getElementById('btnChinese').onclick = () => document.getElementById('newsContent').innerHTML = originalContent || 'No news.';
    setupSortButtons();
};
















const toggleModal = () => document.getElementById('newsModal').style.display = 
    document.getElementById('newsModal').style.display === 'block' ? 'none' : 'block';

const fetchNewsContent = () => fetch('https://programme.rthk.hk/channel/radio/trafficnews/index.php')
    .then(r => r.text())
    .then(d => {
        const doc = new DOMParser().parseFromString(d, 'text/html');
        originalContent = Array.from(doc.querySelectorAll('ul.dec > li.inner'))
            .map(i => `<div class="news-item">${i.textContent.trim()}</div>`).join('') || 'No news.';
        document.getElementById('newsContent').innerHTML = originalContent;
        toggleModal();
    })
    .catch(e => console.error('News fetch error:', e));

const fetchSchedule = async (cs, ds) => {
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
};

const displayRouteOptions = (best, alts, schedules, cs, ds) => {
    currentRoutes = [[best, 'Best Route'], ...alts.map((r, i) => [r, `Alternative Route ${i + 1}`])].map(([r, n]) => ({
        type: 'MTR',
        route: r,
        schedules,
        from: cs,
        to: ds,
        name: n,
        estimatedTime: r.route.reduce((t, l) => t + lines[l].length * 2, 0) + r.interchangeCount * 5,
        walkingDistance: 0
    }));
    displaySortedRoutes();
};

const fetchBusRoutes = (start, end) => {
    const [ss, es] = [allStops.find(s => s.stop === start), allStops.find(s => s.stop === end)];
    if (!ss || !es) return document.getElementById('schedule').innerHTML = '<p>Invalid bus stops.</p>';
    const [startStops, endStops] = [findNearbyStops(ss), findNearbyStops(es)];
    const [startIds, endIds] = [startStops.map(s => s.stop), endStops.map(s => s.stop)];
    const routes = [];

    allRoutes.forEach(r => ['outbound', 'inbound'].forEach(d => {
        const key = `${r.route}-${d === 'outbound' ? 'O' : 'I'}`;
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
                    type: 'Bus',
                    busRoute: { 
                        route: r.route, 
                        direction: d, 
                        stops: stops.map(id => ({ id, name: allStops.find(s => s.stop === id)?.name_en || `Stop ${id}` })), 
                        boardingStop: cs, 
                        alightingStop: ce,
                        provider: r.provider // Use provider
                    },
                    boardingDistance: haversineDistance(parseFloat(ss.lat), parseFloat(ss.long), parseFloat(allStops.find(s => s.stop === cs).lat), parseFloat(allStops.find(s => s.stop === cs).long)),
                    alightingDistance: haversineDistance(parseFloat(es.lat), parseFloat(es.long), parseFloat(allStops.find(s => s.stop === ce).lat), parseFloat(allStops.find(s => s.stop === ce).long)),
                    estimatedTime: (stops.indexOf(ce) - stops.indexOf(cs)) * 2,
                    walkingDistance: haversineDistance(parseFloat(ss.lat), parseFloat(ss.long), parseFloat(allStops.find(s => s.stop === cs).lat), parseFloat(allStops.find(s => s.stop === cs).long)) + 
                                    haversineDistance(parseFloat(es.lat), parseFloat(es.long), parseFloat(allStops.find(s => s.stop === ce).lat), parseFloat(allStops.find(s => s.stop === ce).long))
                });
            }
        }
    }));
    currentRoutes = routes;
    displaySortedRoutes();
};
function findBusInterchange(startPoint, endBusStop, maxWalkingDistance = 1000, isBusStart = false) {
    const endStop = allStops.find(s => s.stop === endBusStop);
    if (!endStop || !startPoint.lat || !startPoint.long) return [];

    const initialWalkingDistance = haversineDistance(startPoint.lat, startPoint.long, parseFloat(endStop.lat), parseFloat(endStop.long));
    const nearbyStartStops = findNearbyStops(startPoint, 500);
    const nearbyEndStops = findNearbyStops(endStop, 500);
    const nearbyStartStopIds = nearbyStartStops.map(s => s.stop);
    const nearbyEndStopIds = nearbyEndStops.map(s => s.stop);

    const interchangeRoutes = [];
    const providers = ['kmb', 'ctb'];

    for (const provider of providers) {
        const busRoutes = findBusRoutesToStops(nearbyStartStopIds, nearbyEndStopIds, provider);
        for (const busRoute of busRoutes) {
            const boardingStop = allStops.find(s => s.stop === busRoute.boardingStop);
            const alightingStop = allStops.find(s => s.stop === busRoute.alightingStop);
            const walkingToBus = haversineDistance(startPoint.lat, startPoint.long, parseFloat(boardingStop.lat), parseFloat(boardingStop.long));
            const walkingFromBus = haversineDistance(parseFloat(alightingStop.lat), parseFloat(alightingStop.long), parseFloat(endStop.lat), parseFloat(endStop.long));
            const totalWalking = walkingToBus + walkingFromBus;
            const stopCount = busRoute.stops.findIndex(s => s.id === busRoute.alightingStop) -
                             busRoute.stops.findIndex(s => s.id === busRoute.boardingStop);
            const busTime = stopCount * 2;

            if (isBusStart || totalWalking < initialWalkingDistance) { // Include all routes if starting with bus
                interchangeRoutes.push({
                    busRoute,
                    boardingStopName: boardingStop?.name_en || `Stop ${busRoute.boardingStop}`,
                    alightingStopName: alightingStop?.name_en || `Stop ${busRoute.alightingStop}`,
                    walkingDistance: totalWalking,
                    walkingToBus,
                    walkingFromBus,
                    busTime,
                    stopCount,
                    provider,
                    endStopName: endStop.name_en // Explicitly set end stop name
                });
            }
        }
    }

    return interchangeRoutes.sort((a, b) => a.walkingDistance - b.walkingDistance);
}


async function fetchMixedTransit(start, end, startType, endType, mtrStations) {
    const scheduleDiv = document.getElementById('schedule');
    let startPoint, endPoint, provider;

    // Validate and initialize start and end points
    if (startType === 'bus') {
        startPoint = allStops.find(s => s.stop === start);
        if (!startPoint) {
            scheduleDiv.innerHTML = '<p>Invalid starting bus stop.</p>';
            return;
        }
        const kmbStops = JSON.parse(localStorage.getItem('kmb_allStops') || '[]');
        provider = kmbStops.some(s => s.stop === start) ? 'kmb' : 'ctb';
    } else if (startType === 'mtr') {
        startPoint = mtrStations.find(s => s.value === start);
        if (!startPoint) {
            scheduleDiv.innerHTML = '<p>Invalid starting MTR station.</p>';
            return;
        }
    }

    if (endType === 'bus') {
        endPoint = allStops.find(s => s.stop === end);
        if (!endPoint) {
            scheduleDiv.innerHTML = '<p>Invalid ending bus stop.</p>';
            return;
        }
    } else if (endType === 'mtr') {
        endPoint = mtrStations.find(s => s.value === end);
        if (!endPoint) {
            scheduleDiv.innerHTML = '<p>Invalid ending MTR station.</p>';
            return;
        }
    }

    const routes = [];

    // Direct bus option (for MTR-to-bus or bus-to-bus scenarios)
    if (startType === 'mtr' && endType === 'bus') {
        const directBusOptions = findBusInterchange(startPoint, end, 1000, true); // Force all bus options
        directBusOptions.forEach(option => {
            routes.push({
                type: 'Bus',
                busRoute: option.busRoute,
                boardingStopName: option.boardingStopName,
                alightingStopName: option.alightingStopName,
                walkingDistance: option.walkingDistance,
                estimatedTime: Math.round(option.busTime + (option.walkingDistance / 5000 * 60)),
                boardingDistance: option.walkingToBus,
                alightingDistance: option.walkingFromBus,
                stopCount: option.stopCount,
                provider: option.provider
            });
        });
    }

    if (startType === 'bus' && endType === 'mtr') {
        // Bus-to-MTR flow
        const nearbyStartStops = findNearbyStops(startPoint, 500);
        const nearbyStartStopIds = nearbyStartStops.map(s => s.stop);
        const busRoutes = findBusRoutesToStops(nearbyStartStopIds, allStops.map(s => s.stop), provider);

        if (!busRoutes.length) {
            scheduleDiv.innerHTML = '<p>No bus routes found.</p>';
            return;
        }

        for (const busRoute of busRoutes) {
            const boardingStop = allStops.find(s => s.stop === busRoute.boardingStop);
            const alightingStop = allStops.find(s => s.stop === busRoute.alightingStop);
            const stopCount = busRoute.stops.findIndex(s => s.id === busRoute.alightingStop) -
                             busRoute.stops.findIndex(s => s.id === busRoute.boardingStop);

            const busDetails = {
                busRoute,
                boardingStopName: boardingStop?.name_en || `Stop ${busRoute.boardingStop}`,
                alightingStopName: alightingStop?.name_en || `Stop ${busRoute.alightingStop}`,
                boardingDistance: busRoute.boardingDistance,
                stopCount
            };

            const nearbyMTRs = mtrStations
                .map(station => ({
                    station,
                    distance: haversineDistance(parseFloat(alightingStop.lat), parseFloat(alightingStop.long), station.lat, station.long)
                }))
                .filter(m => !isNaN(m.distance))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3);

            for (const { station, distance } of nearbyMTRs) {
                const interchangeStation = station.value;
                const mtrResponse = await fetch('/fetch_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentStation: interchangeStation, destinationStation: end })
                }).then(res => res.json()).catch(() => ({ error: 'MTR schedule unavailable' }));

                if (!mtrResponse.error) {
                    const busTime = stopCount * 2;
                    const walkingTime = distance / 5000 * 60;
                    const mtrTime = mtrResponse.bestRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + mtrResponse.bestRoute.interchangeCount * 5;
                    routes.push({
                        type: 'Bus-to-MTR',
                        ...busDetails,
                        mtrRoute: mtrResponse.bestRoute,
                        interchangeStation,
                        walkingDistance: distance,
                        schedules: mtrResponse.schedules,
                        estimatedTime: Math.round(busTime + walkingTime + mtrTime)
                    });
                }
            }
        }
    } else if (startType === 'mtr' && endType === 'bus') {
        // MTR-to-Bus flow with interchange
        const nearbyMTRs = mtrStations
            .map(station => ({
                station,
                distance: haversineDistance(parseFloat(endPoint.lat), parseFloat(endPoint.long), station.lat, station.long)
            }))
            .filter(m => !isNaN(m.distance))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3);

        for (const { station, distance: initialWalkingDistance } of nearbyMTRs) {
            const destinationMTRStation = station.value;
            const mtrResponse = await fetch('/fetch_schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentStation: start, destinationStation: destinationMTRStation })
            }).then(res => res.json()).catch(() => ({ error: 'MTR schedule unavailable' }));

            if (mtrResponse.error) continue;

            const mtrTime = mtrResponse.bestRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + mtrResponse.bestRoute.interchangeCount * 5;

            // Walking-only option
            const walkingTime = initialWalkingDistance / 5000 * 60;
            routes.push({
                type: 'MTR-to-Bus',
                mtrRoute: mtrResponse.bestRoute,
                schedules: mtrResponse.schedules,
                from: start,
                to: destinationMTRStation,
                walkingDistance: initialWalkingDistance,
                endStopName: endPoint.name_en,
                estimatedTime: Math.round(mtrTime + walkingTime)
            });

            // Bus interchange options
            const interchangeOptions = findBusInterchange(station, end, 1000);
            for (const option of interchangeOptions) {
                routes.push({
                    type: 'MTR-to-Bus-with-Interchange',
                    mtrRoute: mtrResponse.bestRoute,
                    schedules: mtrResponse.schedules,
                    from: start,
                    to: destinationMTRStation,
                    busRoute: option.busRoute,
                    boardingStopName: option.boardingStopName,
                    alightingStopName: option.alightingStopName,
                    walkingDistance: option.walkingDistance,
                    mtrWalkingDistance: option.walkingToBus,
                    busWalkingDistance: option.walkingFromBus,
                    estimatedTime: Math.round(mtrTime + (option.walkingDistance / 5000 * 60) + option.busTime),
                    busStopCount: option.stopCount,
                    provider: option.provider,
                    endStopName: endPoint.name_en // Fix undefined issue
                });
            }

            // Alternative MTR routes
            if (mtrResponse.alternativeRoutes?.length) {
                mtrResponse.alternativeRoutes.forEach(altRoute => {
                    const altMtrTime = altRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + altRoute.interchangeCount * 5;
                    routes.push({
                        type: 'MTR-to-Bus',
                        mtrRoute: altRoute,
                        schedules: mtrResponse.schedules,
                        from: start,
                        to: destinationMTRStation,
                        walkingDistance: initialWalkingDistance,
                        endStopName: endPoint.name_en,
                        estimatedTime: Math.round(altMtrTime + walkingTime)
                    });
                });
            }
        }
    } else if (startType === 'bus' && endType === 'bus') {
        // Bus-to-MTR-to-Bus or Bus-to-Bus
        const nearbyStartStops = findNearbyStops(startPoint, 500);
        const nearbyStartStopIds = nearbyStartStops.map(s => s.stop);
        const directBusRoutes = findBusRoutesToStops(nearbyStartStopIds, [end], provider);

        // Direct bus option
        directBusRoutes.forEach(route => {
            const boardingStop = allStops.find(s => s.stop === route.boardingStop);
            const alightingStop = allStops.find(s => s.stop === route.alightingStop);
            const walkingToBus = haversineDistance(startPoint.lat, startPoint.long, parseFloat(boardingStop.lat), parseFloat(boardingStop.long));
            const walkingFromBus = haversineDistance(parseFloat(alightingStop.lat), parseFloat(alightingStop.long), parseFloat(endPoint.lat), parseFloat(endPoint.long));
            const stopCount = route.stops.findIndex(s => s.id === route.alightingStop) -
                             route.stops.findIndex(s => s.id === route.boardingStop);

            routes.push({
                type: 'Bus',
                busRoute: route,
                boardingStopName: boardingStop?.name_en || `Stop ${route.boardingStop}`,
                alightingStopName: alightingStop?.name_en || `Stop ${route.alightingStop}`,
                walkingDistance: walkingToBus + walkingFromBus,
                boardingDistance: walkingToBus,
                alightingDistance: walkingFromBus,
                estimatedTime: Math.round(stopCount * 2 + (walkingToBus + walkingFromBus) / 5000 * 60),
                stopCount
            });
        });

        // Bus-to-MTR-to-Bus
        const firstLegBusRoutes = findBusRoutesToStops(nearbyStartStopIds, allStops.map(s => s.stop), provider);
        for (const firstBus of firstLegBusRoutes) {
            const firstAlightingStop = allStops.find(s => s.stop === firstBus.alightingStop);
            const nearbyMTRs = mtrStations
                .map(station => ({
                    station,
                    distance: haversineDistance(parseFloat(firstAlightingStop.lat), parseFloat(firstAlightingStop.long), station.lat, station.long)
                }))
                .filter(m => !isNaN(m.distance))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3);

            for (const { station } of nearbyMTRs) {
                const interchangeMTR = station.value;
                const mtrResponse = await fetch('/fetch_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentStation: interchangeMTR, destinationStation: null }) // Find nearest MTR to end
                }).then(res => res.json()).catch(() => ({ error: 'MTR schedule unavailable' }));

                if (mtrResponse.error) continue;

                const secondLegMTR = mtrStations
                    .map(st => ({
                        station: st,
                        distance: haversineDistance(parseFloat(endPoint.lat), parseFloat(endPoint.long), st.lat, st.long)
                    }))
                    .sort((a, b) => a.distance - b.distance)[0].station;

                const mtrResponse2 = await fetch('/fetch_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentStation: interchangeMTR, destinationStation: secondLegMTR.value })
                }).then(res => res.json()).catch(() => ({ error: 'MTR schedule unavailable' }));

                if (mtrResponse2.error) continue;

                const mtrTime = mtrResponse2.bestRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + mtrResponse2.bestRoute.interchangeCount * 5;
                const secondLegOptions = findBusInterchange(secondLegMTR, end, 1000);

                for (const secondBus of secondLegOptions) {
                    const firstBusTime = firstBus.stopCount * 2;
                    const walkingToFirst = firstBus.boardingDistance;
                    const walkingToMTR = haversineDistance(parseFloat(firstAlightingStop.lat), parseFloat(firstAlightingStop.long), secondLegMTR.lat, secondLegMTR.long);
                    const totalWalking = walkingToFirst + walkingToMTR + secondBus.walkingDistance;
                    routes.push({
                        type: 'Bus-to-MTR-to-Bus',
                        firstBusRoute: firstBus,
                        mtrRoute: mtrResponse2.bestRoute,
                        secondBusRoute: secondBus.busRoute,
                        firstBoardingStopName: firstBus.boardingStopName,
                        firstAlightingStopName: firstBus.alightingStopName,
                        mtrFrom: interchangeMTR,
                        mtrTo: secondLegMTR.value,
                        secondBoardingStopName: secondBus.boardingStopName,
                        secondAlightingStopName: secondBus.alightingStopName,
                        walkingDistance: totalWalking,
                        estimatedTime: Math.round(firstBusTime + mtrTime + secondBus.busTime + (totalWalking / 5000 * 60)),
                        schedules: mtrResponse2.schedules,
                        endStopName: endPoint.name_en
                    });
                }
            }
        }
    }

    currentRoutes = routes.length ? routes : [];
    if (!routes.length) scheduleDiv.innerHTML = '<p>No mixed transit routes found.</p>';
    displaySortedRoutes();
}

async function fetchCTBToKMB(startBusStop, endBusStop) {
    const startStop = allStops.find(s => s.stop === startBusStop);
    const endStop = allStops.find(s => s.stop === endBusStop);
    if (!startStop || !endStop) {
        document.getElementById('schedule').innerHTML = '<p>Invalid bus stops.</p>';
        return;
    }

    const ctbRoutes = JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]');
    const kmbRoutes = JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]');
    const ctbStops = JSON.parse(localStorage.getItem('citybus_allStops') || '[]');
    const kmbStops = JSON.parse(localStorage.getItem('kmb_allStops') || '[]');
    const ctbRouteStopsMap = JSON.parse(localStorage.getItem('citybus_routeStopsMap') || '{}');
    const kmbRouteStopsMap = JSON.parse(localStorage.getItem('kmb_routeStopsMap') || '{}');

    const nearbyStartStops = findNearbyStops(startStop, 500);
    const nearbyStartStopIds = nearbyStartStops.map(s => s.stop);
    const ctbRouteOptions = findBusRoutesToStops(nearbyStartStopIds, ctbStops.map(s => s.stop), 'ctb', ctbRoutes, ctbStops, ctbRouteStopsMap);

    if (!ctbRouteOptions.length) {
        document.getElementById('schedule').innerHTML = '<p>No Citybus routes found.</p>';
        return;
    }

    const routes = [];
    for (const ctbRoute of ctbRouteOptions) {
        const ctbAlightingStop = ctbStops.find(s => s.stop === ctbRoute.alightingStop);
        const nearbyKMBStops = findNearbyStops(ctbAlightingStop, 500);
        const nearbyKMBStopIds = nearbyKMBStops.map(s => s.stop);
        const kmbRouteOptions = findBusRoutesToStops(nearbyKMBStopIds, [endBusStop], 'kmb', kmbRoutes, kmbStops, kmbRouteStopsMap);

        for (const kmbRoute of kmbRouteOptions) {
            const kmbBoardingStop = kmbStops.find(s => s.stop === kmbRoute.boardingStop);
            const walkingDistance = haversineDistance(
                parseFloat(ctbAlightingStop.lat), parseFloat(ctbAlightingStop.long),
                parseFloat(kmbBoardingStop.lat), parseFloat(kmbBoardingStop.long)
            );

            const ctbStopCount = ctbRoute.stops.findIndex(s => s.id === ctbRoute.alightingStop) -
                                ctbRoute.stops.findIndex(s => s.id === ctbRoute.boardingStop);
            const kmbStopCount = kmbRoute.stops.findIndex(s => s.id === kmbRoute.alightingStop) -
                                kmbRoute.stops.findIndex(s => s.id === kmbRoute.boardingStop);

            const ctbTime = ctbStopCount * 2;
            const walkingTime = walkingDistance / 5000 * 60;
            const kmbTime = kmbStopCount * 2;

            routes.push({
                type: 'CTB-to-KMB',
                ctbRoute,
                kmbRoute,
                ctbBoardingStopName: ctbStops.find(s => s.stop === ctbRoute.boardingStop)?.name_en || `Stop ${ctbRoute.boardingStop}`,
                ctbAlightingStopName: ctbStops.find(s => s.stop === ctbRoute.alightingStop)?.name_en || `Stop ${ctbRoute.alightingStop}`,
                kmbBoardingStopName: kmbStops.find(s => s.stop === kmbRoute.boardingStop)?.name_en || `Stop ${kmbRoute.boardingStop}`,
                kmbAlightingStopName: kmbStops.find(s => s.stop === kmbRoute.alightingStop)?.name_en || `Stop ${kmbRoute.alightingStop}`,
                ctbBoardingDistance: ctbRoute.boardingDistance,
                walkingDistance,
                kmbAlightingDistance: kmbRoute.alightingDistance,
                estimatedTime: Math.round(ctbTime + walkingTime + kmbTime),
                ctbStopCount,
                kmbStopCount
            });
        }
    }

    currentRoutes = routes.length ? routes : [];
    if (!routes.length) document.getElementById('schedule').innerHTML = '<p>No transfer routes found.</p>';
    displaySortedRoutes();
}

function findBusRoutesToStops(startBusStopIds, targetStopIds, provider, routes = allRoutes, stops = allStops, routeMap = routeStopsMap) {
    const directRoutes = [];
    const startStops = Array.isArray(startBusStopIds) ? startBusStopIds.map(id => stops.find(s => s.stop === id)) : [stops.find(s => s.stop === startBusStopIds)];
    const startStopIdsArray = Array.isArray(startBusStopIds) ? startBusStopIds : [startBusStopIds];
    console.log("Start Stop IDs:", startStopIdsArray);
    console.log("Target Stop IDs Sample:", targetStopIds.slice(0, 5)); 
    console.log("Provider:", provider);

    const filteredRoutes = provider ? routes.filter(r => r.provider === provider) : routes;
    console.log("Filtered Routes:", filteredRoutes);

    for (const route of filteredRoutes) {
        for (const direction of ['outbound', 'inbound']) {
            const key = `${route.route}-${direction === 'outbound' ? 'O' : 'I'}`;
            const stopsList = routeMap[key] || [];
            console.log(`Route ${key} Stops:`, stopsList);
            const startMatches = stopsList.filter(id => startStopIdsArray.includes(id));
            const endMatches = stopsList.filter(id => targetStopIds.includes(id));
            console.log(`Start Matches for ${key}:`, startMatches);
            console.log(`End Matches for ${key}:`, endMatches);

            if (startMatches.length && endMatches.length) {
                let closestStartStop = null, minStartDistance = Infinity;
                const referenceStartStop = startStops[0];
                for (const stopId of startMatches) {
                    const stop = stops.find(s => s.stop === stopId);
                    const distance = haversineDistance(parseFloat(referenceStartStop.lat), parseFloat(referenceStartStop.long), parseFloat(stop.lat), parseFloat(stop.long));
                    if (distance < minStartDistance) {
                        minStartDistance = distance;
                        closestStartStop = stopId;
                    }
                }
                const startIndex = stopsList.indexOf(closestStartStop);
                const possibleEndStops = endMatches.filter(id => stopsList.indexOf(id) > startIndex);
                if (possibleEndStops.length) {
                    let closestEndStop = null, minEndDistance = Infinity;
                    const referenceEndStop = stops.find(s => s.stop === targetStopIds[0]);
                    for (const stopId of possibleEndStops) {
                        const stop = stops.find(s => s.stop === stopId);
                        const distance = haversineDistance(parseFloat(referenceEndStop.lat), parseFloat(referenceEndStop.long), parseFloat(stop.lat), parseFloat(stop.long));
                        if (distance < minEndDistance) {
                            minEndDistance = distance;
                            closestEndStop = stopId;
                        }
                    }
                    const stopDetails = stopsList.map(id => ({
                        id,
                        name: stops.find(s => s.stop === id)?.name_en || `Stop ${id}`
                    }));
                    directRoutes.push({
                        route: route.route,
                        direction,
                        stops: stopDetails,
                        boardingStop: closestStartStop,
                        alightingStop: closestEndStop,
                        boardingDistance: minStartDistance,
                        alightingDistance: minEndDistance,
                        provider: route.provider
                    });
                }
            }
        }
    }
    return directRoutes;
}
// Add this at the top of general_schedule.js, before the existing functions
function generateTimeline(route) {
    const items = getTimelineItems(route);
    let html = '<div class="timeline">';
    items.forEach(item => {
        if (item.type === 'point') {
            html += generatePointItem(item);
        } else if (item.type === 'segment') {
            html += generateSegmentItem(item);
        }
    });
    html += '</div>';
    return html;
}

function getTimelineItems(route) {
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);
    const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);
    const items = [];

    // Handle different route types
    if (route.type === 'MTR') {
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.from), time: startTime, isStart: true, line: route.route[0] });
        items.push({ type: 'segment', mode: 'MTR', lines: route.route, duration: route.estimatedTime, to: getStationFullName(route.to) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.to), time: arrivalTime, isEnd: true, line: route.route[route.route.length - 1] });
    } else if (route.type === 'Bus') {
        // For bus routes, we need to use the stop names from your data
        const startStopName = allStops.find(s => s.stop === route.busRoute.boardingStop)?.name_en || `Stop ${route.busRoute.boardingStop}`;
        const endStopName = allStops.find(s => s.stop === route.busRoute.alightingStop)?.name_en || `Stop ${route.busRoute.alightingStop}`;
        items.push({ type: 'point', mode: 'Bus', name: startStopName, time: startTime, isStart: true, provider: route.busRoute.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: calculateWalkDuration(route.boardingDistance), distance: route.boardingDistance, to: route.boardingStopName });
        items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, provider: route.busRoute.provider });
        items.push({ type: 'segment', mode: 'Bus', route: route.busRoute.route, direction: route.busRoute.direction, stops: route.stopCount, duration: route.estimatedTime - calculateWalkDuration(route.boardingDistance) - calculateWalkDuration(route.alightingDistance), alightingStopName: route.alightingStopName, provider: route.busRoute.provider });
        items.push({ type: 'point', mode: 'Bus', name: route.alightingStopName, provider: route.busRoute.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: calculateWalkDuration(route.alightingDistance), distance: route.alightingDistance, to: endStopName });
        items.push({ type: 'point', mode: 'End', name: endStopName, time: arrivalTime, isEnd: true });
    } else if (route.type === 'MTR-to-Bus-with-Interchange') {
        // Calculate segment times
        const mtrTime = route.mtrRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + route.mtrRoute.interchangeCount * 5;
        const walkingToBusTime = calculateWalkDuration(route.mtrWalkingDistance);
        const busTime = route.estimatedTime - mtrTime - walkingToBusTime - calculateWalkDuration(route.busWalkingDistance);
        const walkingFromBusTime = calculateWalkDuration(route.busWalkingDistance);

        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.from), time: startTime, isStart: true, line: route.mtrRoute.route[0] });
        items.push({ type: 'segment', mode: 'MTR', lines: route.mtrRoute.route, duration: mtrTime, to: getStationFullName(route.to) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.to), line: route.mtrRoute.route[route.mtrRoute.route.length - 1] });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingToBusTime, distance: route.mtrWalkingDistance, to: route.boardingStopName });
        items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, provider: route.provider });
        items.push({ type: 'segment', mode: 'Bus', route: route.busRoute.route, direction: route.busRoute.direction, stops: route.busStopCount, duration: busTime, alightingStopName: route.alightingStopName, provider: route.provider });
        items.push({ type: 'point', mode: 'Bus', name: route.alightingStopName, provider: route.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingFromBusTime, distance: route.busWalkingDistance, to: route.endStopName });
        items.push({ type: 'point', mode: 'End', name: route.endStopName, time: arrivalTime, isEnd: true });
    } else if (route.type === 'Bus-to-MTR') {
        const busTime = route.stopCount * 2;
        const walkingTime = calculateWalkDuration(route.walkingDistance);
        const mtrTime = route.estimatedTime - busTime - walkingTime;

        items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, time: startTime, isStart: true, provider: route.busRoute.provider });
        items.push({ type: 'segment', mode: 'Bus', route: route.busRoute.route, direction: route.busRoute.direction, stops: route.stopCount, duration: busTime, alightingStopName: route.alightingStopName, provider: route.busRoute.provider });
        items.push({ type: 'point', mode: 'Bus', name: route.alightingStopName, provider: route.busRoute.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingTime, distance: route.walkingDistance, to: getStationFullName(route.interchangeStation) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.interchangeStation), line: route.mtrRoute.route[0] });
        items.push({ type: 'segment', mode: 'MTR', lines: route.mtrRoute.route, duration: mtrTime, to: getStationFullName(route.to) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.to), time: arrivalTime, isEnd: true, line: route.mtrRoute.route[route.mtrRoute.route.length - 1] });
    } else if (route.type === 'Bus-to-MTR-to-Bus') {
        const firstBusTime = route.firstBusRoute.stopCount * 2;
        const walkingToMtrTime = calculateWalkDuration(route.walkingDistance / 3); // Approximate split
        const mtrTime = route.mtrRoute.route.reduce((t, l) => t + lines[l].length * 2, 0) + route.mtrRoute.interchangeCount * 5;
        const walkingToSecondBusTime = calculateWalkDuration(route.walkingDistance / 3);
        const secondBusTime = route.secondBusRoute.stopCount * 2;
        const walkingToEndTime = calculateWalkDuration(route.walkingDistance / 3);

        items.push({ type: 'point', mode: 'Bus', name: route.firstBoardingStopName, time: startTime, isStart: true, provider: route.firstBusRoute.provider });
        items.push({ type: 'segment', mode: 'Bus', route: route.firstBusRoute.route, direction: route.firstBusRoute.direction, stops: route.firstBusRoute.stopCount, duration: firstBusTime, alightingStopName: route.firstAlightingStopName, provider: route.firstBusRoute.provider });
        items.push({ type: 'point', mode: 'Bus', name: route.firstAlightingStopName, provider: route.firstBusRoute.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingToMtrTime, distance: route.walkingDistance / 3, to: getStationFullName(route.mtrFrom) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.mtrFrom), line: route.mtrRoute.route[0] });
        items.push({ type: 'segment', mode: 'MTR', lines: route.mtrRoute.route, duration: mtrTime, to: getStationFullName(route.mtrTo) });
        items.push({ type: 'point', mode: 'MTR', name: getStationFullName(route.mtrTo), line: route.mtrRoute.route[route.mtrRoute.route.length - 1] });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingToSecondBusTime, distance: route.walkingDistance / 3, to: route.secondBoardingStopName });
        items.push({ type: 'point', mode: 'Bus', name: route.secondBoardingStopName, provider: route.secondBusRoute.provider });
        items.push({ type: 'segment', mode: 'Bus', route: route.secondBusRoute.route, direction: route.secondBusRoute.direction, stops: route.secondBusRoute.stopCount, duration: secondBusTime, alightingStopName: route.secondAlightingStopName, provider: route.secondBusRoute.provider });
        items.push({ type: 'point', mode: 'Bus', name: route.secondAlightingStopName, provider: route.secondBusRoute.provider });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingToEndTime, distance: route.walkingDistance / 3, to: route.endStopName });
        items.push({ type: 'point', mode: 'End', name: route.endStopName, time: arrivalTime, isEnd: true });
    } else if (route.type === 'CTB-to-KMB') {
        const ctbTime = route.ctbStopCount * 2;
        const walkingTime = calculateWalkDuration(route.walkingDistance);
        const kmbTime = route.kmbStopCount * 2;

        items.push({ type: 'point', mode: 'Bus', name: route.ctbBoardingStopName, time: startTime, isStart: true, provider: 'CityBus' });
        items.push({ type: 'segment', mode: 'Bus', route: route.ctbRoute.route, direction: route.ctbRoute.direction, stops: route.ctbStopCount, duration: ctbTime, alightingStopName: route.ctbAlightingStopName, provider: 'CityBus' });
        items.push({ type: 'point', mode: 'Bus', name: route.ctbAlightingStopName, provider: 'CityBus' });
        items.push({ type: 'segment', mode: 'Walk', duration: walkingTime, distance: route.walkingDistance, to: route.kmbBoardingStopName });
        items.push({ type: 'point', mode: 'Bus', name: route.kmbBoardingStopName, provider: 'KMB' });
        items.push({ type: 'segment', mode: 'Bus', route: route.kmbRoute.route, direction: route.kmbRoute.direction, stops: route.kmbStopCount, duration: kmbTime, alightingStopName: route.kmbAlightingStopName, provider: 'KMB' });
        items.push({ type: 'point', mode: 'End', name: route.kmbAlightingStopName, time: arrivalTime, isEnd: true, provider: 'KMB' });
    }

    return items;
}

function generatePointItem(item) {
    const classes = `timeline-item station-point ${item.isStart ? 'start-point' : ''} ${item.isEnd ? 'end-point' : ''}`;
    const dataLine = item.mode === 'End' ? 'End' : item.mode === 'Bus' ? item.provider : item.line || item.mode;
    const time = item.time || '--:--';
    const tag = item.isStart ? '<span class="tag">From</span>' : item.isEnd ? '<span class="tag to">To</span>' : '';
    const lineTagClass = item.mode === 'End' ? 'dest' : item.mode === 'Walk' ? 'walk' : item.mode === 'Bus' ? item.provider.toLowerCase() : item.line.toLowerCase();
    const lineAbbr = item.mode === 'End' ? 'Destination' : item.mode === 'Walk' ? 'Walk' : item.mode === 'Bus' ? item.provider.toUpperCase() : item.line;
    return `
        <div class="${classes}" data-line="${dataLine}">
            <div class="timeline-marker">
                <div class="marker-time">${time}</div>
                <div class="marker-icon"></div>
            </div>
            <div class="timeline-content">
                <div class="station-name">${tag} ${item.name} <span class="line-tag ${lineTagClass}">${lineAbbr}</span></div>
            </div>
        </div>
    `;
}

function generateSegmentItem(item) {
    const dataLine = item.mode === 'Bus' ? item.provider : item.mode;
    const statsHtml = item.mode === 'Walk'
    
        ? `<span class="stat-duration">~${Math.round(item.duration)} min</span><span class="stat-distance">${Math.round(item.distance)}m</span>`
        : `<span class="stat-duration">~${Math.round(item.duration)} min</span><span class="stat-distance">-- km</span>`;
    let detailsHtml = '';
    if (item.mode === 'MTR') {
        const lineNamesHtml = item.lines.map(line => lineNames[line].split('<')[0].trim()).join(' → ');
        detailsHtml = `<span class="line-name">MTR: ${lineNamesHtml}</span><span class="direction">To ${item.to}</span>`;
    } else if (item.mode === 'Bus') {
        detailsHtml = `<span class="line-name">Bus ${item.route} (${item.direction})</span><span class="direction">Alight at ${item.alightingStopName}</span><span class="stops">${item.stops} stops</span>`;
    } else if (item.mode === 'Walk') {
        detailsHtml = `<span class="line-name">Walk</span><span class="direction">To ${item.to}</span>`;
    }
    return `
        <div class="timeline-item" data-line="${dataLine}">
            <div class="timeline-marker">
                <div class="marker-icon"></div>
                <div class="segment-stats">${statsHtml}</div>
            </div>
            <div class="timeline-content">
                <div class="segment-details">${detailsHtml}</div>
            </div>
        </div>
    `;
    
}



function calculateWalkDuration(distance) {
    return (distance / 5000) * 60; // 5 km/h walking speed
}

// Replace the existing displaySortedRoutes function
function displaySortedRoutes() {
    const opts = document.getElementById('route-options');
    opts.innerHTML = '';
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);

    currentRoutes.slice(0, 7).forEach((route, i) => {
        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);
        let transfers = 0;
        if (route.type === 'MTR') {
            transfers = route.route.length - 1; // Number of line changes
        } else if (route.type === 'Bus') {
            transfers = 0; // Direct bus route
        } else if (route.type === 'MTR-to-Bus-with-Interchange' || route.type === 'Bus-to-MTR') {
            transfers = 1; // One transfer between modes
        } else if (route.type === 'Bus-to-MTR-to-Bus' || route.type === 'CTB-to-KMB') {
            transfers = 2; // Two transfers
        }

        const headerHtml = `
            <div class="route-header">
                <div><span class="time-info">${startTime} → ${arrivalTime}</span> <span class="duration">(${route.estimatedTime} mins)</span></div>
                <div class="cost-transfers">
                    <div class="fare">Fare: (Not Available)</div>
                    <div class="transfers">~${transfers} Transfers</div>
                </div>
            </div>
        `;
        opts.innerHTML += `
            <div class="route-container" id="route-summary-${i}" onclick="toggleRouteDetails('route-details-${i}', this)">
                ${headerHtml}
                ${generateTimeline(route)}
                <div class="route-details" id="route-details-${i}" style="display: none;">
                    <!-- Detailed schedule will be added here if needed -->
                </div>
            </div>
        `;
    });
}

// Update toggleRouteDetails to work with the new structure (minimal change needed)
function toggleRouteDetails(id, el) {
    const details = document.getElementById(id);
    details.style.display = details.style.display === 'none' ? 'block' : 'none';
    if (details.style.display === 'block' && currentRoutes) {
        const routeIndex = parseInt(id.split('-')[2]);
        const route = currentRoutes[routeIndex];
        if (route.type === 'Bus' || route.type === 'Bus-to-MTR') {
            const etaProvider = route.busRoute.provider === 'kmb' ? 'KMB' : 'Citybus';
            fetchETA(route.busRoute.route, route.busRoute.direction, route.busRoute.boardingStop, id, etaProvider, routeIndex);
        } else if (route.type === 'MTR-to-Bus-with-Interchange') {
            const etaProvider = route.provider === 'kmb' ? 'KMB' : 'Citybus';
            fetchETA(route.busRoute.route, route.busRoute.direction, route.busRoute.boardingStop, id, etaProvider, routeIndex);
        } else if (route.type === 'Bus-to-MTR-to-Bus') {
            const firstProvider = route.firstBusRoute.provider === 'kmb' ? 'KMB' : 'Citybus';
            const secondProvider = route.secondBusRoute.provider === 'kmb' ? 'KMB' : 'Citybus';
            fetchETA(route.firstBusRoute.route, route.firstBusRoute.direction, route.firstBusRoute.boardingStop, id, firstProvider, routeIndex, 'first');
            fetchETA(route.secondBusRoute.route, route.secondBusRoute.direction, route.secondBusRoute.boardingStop, id, secondProvider, routeIndex, 'second');
        } else if (route.type === 'CTB-to-KMB') {
            fetchETA(route.ctbRoute.route, route.ctbRoute.direction, route.ctbRoute.boardingStop, id, 'Citybus', routeIndex);
            fetchETA(route.kmbRoute.route, route.kmbRoute.direction, route.kmbRoute.boardingStop, id, 'KMB', routeIndex);
        }
    }
}

// Ensure the rest of your general_schedule.js remains intact, such as window.onload, fetchSchedule, etc.
async function fetchETA(route, dir, stop, detailsId, provider, index, segment = '') {
    const span = document.querySelector(`#${detailsId} .boarding-stop span[id='eta-${segment ? segment + '-' : ''}${index}']`);
    if (!span) return;

    try {
        const url = provider === 'KMB' ? `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stop}/${route}/1` : 
                   `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop}/${route}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { data } = await response.json();
        const dirMapping = { "outbound": "O", "inbound": "I" };
        const direction = dirMapping[dir] || dir;
        let eta = provider === 'KMB' ? data.find(e => e.seq === 1 && e.dir === direction) || data.find(e => e.seq === 1) :
                  data.data.find(e => e.eta_seq === 1 && e.dir === direction) || data.data.find(e => e.eta_seq === 1);
        if (eta?.eta) {
            const mins = Math.round((new Date(eta.eta) - new Date(provider === 'KMB' ? eta.generated_timestamp : eta.data_timestamp)) / 60000);
            span.textContent = mins >= 0 ? ` (ETA: ${mins} min)` : ` (Due now)`;
        } else {
            span.textContent = ` (No ETA data)`;
        }
    } catch (e) {
        span.textContent = ` (ETA unavailable)`;
        console.error(`ETA fetch error for ${provider} route ${route} at stop ${stop}:`, e);
    }
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

const getStationFullName = code => Object.values(lines).flat().find(s => s.value === code)?.text || code;

function setupSortButtons() {
    const sortByTimeBtn = document.getElementById('sortByTime');
    const sortByWalkBtn = document.getElementById('sortByWalk');

    sortByTimeBtn.addEventListener('click', () => {
        sortByTimeAsc = !sortByTimeAsc;
        currentRoutes.sort((a, b) => sortByTimeAsc ? a.estimatedTime - b.estimatedTime : b.estimatedTime - a.estimatedTime);
        displaySortedRoutes();
        sortByTimeBtn.classList.add('active');
        sortByWalkBtn.classList.remove('active');
        sortByTimeBtn.textContent = `Sort by Time (${sortByTimeAsc ? 'Fastest' : 'Slowest'})`;
    });

    sortByWalkBtn.addEventListener('click', () => {
        sortByWalkAsc = !sortByWalkAsc;
        currentRoutes.sort((a, b) => sortByWalkAsc ? a.walkingDistance - b.walkingDistance : b.walkingDistance - a.walkingDistance);
        displaySortedRoutes();
        sortByWalkBtn.classList.add('active');
        sortByTimeBtn.classList.remove('active');
        sortByWalkBtn.textContent = `Sort by Walk Distance (${sortByWalkAsc ? 'Shortest' : 'Longest'})`;
    });
}