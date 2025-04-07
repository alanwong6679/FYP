
const LINE_NAMES = {
    "AEL": { name: "Airport Express Line", color: "#00888A" },
    "TCL": { name: "Tung Chung Line", color: "#F7943E" },
    "TML": { name: "Tuen Ma Line", color: "#923011" },
    "TKL": { name: "Tseung Kwan O Line", color: "#7D499D" },
    "EAL": { name: "East Rail Line", color: "#53B7E8" },
    "SIL": { name: "South Island Line", color: "#BAC429" },
    "TWL": { name: "Tsuen Wan Line", color: "#ED1D24" },
    "ISL": { name: "Island Line", color: "#007DC5" },
    "KTL": { name: "Kwun Tong Line", color: "#00AB4E" }
};

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const calculateWalkDuration = distance => Math.round((distance / 5000) * 60);

// 2. Data Management
class TransitData {
    constructor() {
        this.routes = [];
        this.stops = [];
        this.routeStopsMap = {};
        this.loadData();
    }

    loadData() {
        this.routes = [
            ...(JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]')),
            ...(JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]'))
        ];
        this.stops = [
            ...(JSON.parse(localStorage.getItem('kmb_allStops') || '[]')),
            ...(JSON.parse(localStorage.getItem('citybus_allStops') || '[]'))
        ];
        this.routeStopsMap = {
            ...JSON.parse(localStorage.getItem('kmb_routeStopsMap') || '{}'),
            ...JSON.parse(localStorage.getItem('citybus_routeStopsMap') || '{}')
        };
    }

    findStop(stopId) {
        return this.stops.find(s => s.stop === stopId) || null;
    }

    getNearbyStops(point, radius = 500) {
        if (!point?.lat || !point?.long) return [];
        return this.stops.filter(s =>
            s.lat && s.long &&
            haversineDistance(parseFloat(s.lat), parseFloat(s.long), point.lat, point.long) <= radius
        );
    }
}

const transit = new TransitData();

// 3. Route Finder
class RouteFinder {
    constructor(transitData, mtrStations) {
        this.transit = transitData;
        this.mtrStations = mtrStations;
    }

    findBusRoutes(startStopIds, endStopIds, provider) {
        const routes = [];
        const filteredRoutes = provider ? this.transit.routes.filter(r => r.provider === provider) : this.transit.routes;

        for (const route of filteredRoutes) {
            for (const direction of ['outbound', 'inbound']) {
                const key = `${route.route}-${direction === 'outbound' ? 'O' : 'I'}`;
                const stops = this.transit.routeStopsMap[key] || [];
                const startMatches = stops.filter(id => startStopIds.includes(id));
                const endMatches = stops.filter(id => endStopIds.includes(id));

                if (startMatches.length && endMatches.length) {
                    const boardingStop = startMatches[0];
                    const validEndStops = endMatches.filter(id => stops.indexOf(id) > stops.indexOf(boardingStop));
                    if (validEndStops.length) {
                        const alightingStop = validEndStops[0];
                        routes.push({
                            route: route.route,
                            direction,
                            boardingStop,
                            alightingStop,
                            provider: route.provider,
                            stopCount: stops.indexOf(alightingStop) - stops.indexOf(boardingStop)
                        });
                    }
                }
            }
        }
        return routes;
    }

    async findMixedRoute(start, end, startType, endType) {
        const routes = [];
        let startPoint, endPoint, provider;

        startPoint = startType === 'bus' ? this.transit.findStop(start) : this.mtrStations.find(s => s.value === start);
        endPoint = endType === 'bus' ? this.transit.findStop(end) : this.mtrStations.find(s => s.value === end);

        if (!startPoint || !endPoint) {
            document.getElementById('schedule').innerHTML = '<div class="error">Invalid start or end point.</div>';
            return routes;
        }

        provider = startType === 'bus' && this.transit.stops.some(s => s.stop === start && s.provider === 'kmb') ? 'kmb' : 'ctb';

        if (startType === 'bus' && endType === 'mtr') {
            const startStops = this.transit.getNearbyStops(startPoint).map(s => s.stop);
            const busRoutes = this.findBusRoutes(startStops, this.transit.stops.map(s => s.stop), provider);

            for (const busRoute of busRoutes) {
                const alightingStop = this.transit.findStop(busRoute.alightingStop);
                const nearestMTR = this.findNearestMTR(alightingStop);
                if (!nearestMTR.station) continue;

                const mtrResponse = await this.fetchMTRSchedule(nearestMTR.station.value, end);
                if (mtrResponse.error) continue;

                const busTime = busRoute.stopCount * 2;
                const walkTime = calculateWalkDuration(nearestMTR.distance);
                const mtrTime = this.calculateMTRTime(mtrResponse.bestRoute);

                routes.push({
                    type: 'Bus-to-MTR',
                    busRoute,
                    mtrRoute: mtrResponse.bestRoute,
                    interchangeStation: nearestMTR.station.value,
                    walkingDistance: nearestMTR.distance,
                    estimatedTime: busTime + walkTime + mtrTime,
                    schedules: mtrResponse.schedules,
                    destinationStation: end
                });
            }
        } else if (startType === 'mtr' && endType === 'bus') {
            const nearestMTR = this.findNearestMTR(endPoint, true);
            const mtrResponse = await this.fetchMTRSchedule(start, nearestMTR.station.value);
            if (!mtrResponse.error) {
                const mtrTime = this.calculateMTRTime(mtrResponse.bestRoute);
                const walkTime = calculateWalkDuration(nearestMTR.distance);
                const busRoutes = this.findBusRoutes(
                    this.transit.getNearbyStops(nearestMTR.station).map(s => s.stop),
                    [endPoint.stop],
                    provider
                );

                busRoutes.forEach(busRoute => {
                    const busTime = busRoute.stopCount * 2;
                    routes.push({
                        type: 'MTR-to-Bus',
                        mtrRoute: mtrResponse.bestRoute,
                        busRoute,
                        walkingDistance: nearestMTR.distance,
                        estimatedTime: mtrTime + walkTime + busTime,
                        schedules: mtrResponse.schedules,
                        currentStation: start,
                        interchangeStation: nearestMTR.station.value
                    });
                });
            }
        }

        return routes;
    }

    async findMTRRoute(start, end) {
        const response = await this.fetchMTRSchedule(start, end);
        if (response.error) return [];

        return [{
            type: 'MTR',
            mtrRoute: response.bestRoute,
            estimatedTime: this.calculateMTRTime(response.bestRoute),
            schedules: response.schedules,
            currentStation: start,
            destinationStation: end
        }];
    }

    findBusRoute(startStopId, endStopId) {
        const startStop = this.transit.findStop(startStopId);
        const endStop = this.transit.findStop(endStopId);
        if (!startStop || !endStop) return [];

        const startStops = this.transit.getNearbyStops(startStop).map(s => s.stop);
        const endStops = this.transit.getNearbyStops(endStop).map(s => s.stop);
        const busRoutes = this.findBusRoutes(startStops, endStops);

        return busRoutes.map(route => {
            const boardingStop = this.transit.findStop(route.boardingStop);
            const alightingStop = this.transit.findStop(route.alightingStop);
            const boardingDistance = boardingStop ? haversineDistance(
                parseFloat(startStop.lat), parseFloat(startStop.long),
                parseFloat(boardingStop.lat), parseFloat(boardingStop.long)
            ) : 0;
            const alightingDistance = alightingStop ? haversineDistance(
                parseFloat(endStop.lat), parseFloat(endStop.long),
                parseFloat(alightingStop.lat), parseFloat(alightingStop.long)
            ) : 0;
            const walkTime = calculateWalkDuration(boardingDistance + alightingDistance);
            const busTime = route.stopCount * 2;

            return {
                type: 'Bus',
                busRoute: route,
                walkingDistance: boardingDistance + alightingDistance,
                estimatedTime: busTime + walkTime,
                boardingStopName: boardingStop?.name_en || `Stop ${route.boardingStop}`,
                alightingStopName: alightingStop?.name_en || `Stop ${route.alightingStop}`
            };
        });
    }

    findNearestMTR(point, reverse = false) {
        if (!point?.lat || !point?.long) return { station: null, distance: Infinity };
        return this.mtrStations.reduce((acc, station) => {
            if (!station.lat || !station.long) return acc;
            const distance = haversineDistance(parseFloat(point.lat), parseFloat(point.long), station.lat, station.long);
            return distance < acc.distance ? { station, distance } : acc;
        }, { station: null, distance: Infinity });
    }

    async fetchMTRSchedule(from, to) {
        try {
            const response = await fetch('/fetch_schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentStation: from, destinationStation: to })
            });
            return await response.json();
        } catch (e) {
            console.error('MTR Fetch Error:', e);
            return { error: 'MTR schedule unavailable' };
        }
    }

    calculateMTRTime(route) {
        return route.route.reduce((t, line) => t + lines[line].length * 2, 0) + route.interchangeCount * 5;
    }
}

// 4. Timeline Generator
class TimelineGenerator {
    static generate(route) {
        const items = this.getItems(route);
        let html = '<div class="timeline">';
        items.forEach(item => {
            html += item.type === 'point' ? this.generatePoint(item) : this.generateSegment(item);
        });
        html += '</div>';
        return html;
    }

    static getItems(route) {
        const now = new Date();
        const startTime = now.toTimeString().slice(0, 5);
        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);
        const items = [];

        console.log("Route data:", route);

        if (route.type === 'Bus-to-MTR') {
            const busTime = route.busRoute.stopCount * 2;
            const walkTime = calculateWalkDuration(route.walkingDistance);
            const mtrTime = route.estimatedTime - busTime - walkTime;

            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: transit.findStop(route.busRoute.boardingStop)?.name_en || `Stop ${route.busRoute.boardingStop}`, 
                time: startTime, 
                isStart: true, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Bus', 
                route: route.busRoute.route, 
                direction: route.busRoute.direction, 
                stops: route.busRoute.stopCount, 
                duration: busTime, 
                alightingStopName: transit.findStop(route.busRoute.alightingStop)?.name_en || `Stop ${route.busRoute.alightingStop}`,
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: transit.findStop(route.busRoute.alightingStop)?.name_en || `Stop ${route.busRoute.alightingStop}`, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Walk', 
                duration: walkTime, 
                distance: route.walkingDistance, 
                to: this.getMTRName(route.interchangeStation) 
            });
            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.interchangeStation), 
                line: route.mtrRoute.route[0] 
            });
            items.push({ 
                type: 'segment', 
                mode: 'MTR', 
                lines: route.mtrRoute.route, 
                duration: mtrTime, 
                to: this.getMTRName(route.destinationStation) 
            });
            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.destinationStation), 
                time: arrivalTime, 
                isEnd: true, 
                line: route.mtrRoute.route[route.mtrRoute.route.length - 1] 
            });
        } else if (route.type === 'MTR-to-Bus') {
            const mtrTime = route.estimatedTime - route.busRoute.stopCount * 2 - calculateWalkDuration(route.walkingDistance);
            const walkTime = calculateWalkDuration(route.walkingDistance);
            const busTime = route.busRoute.stopCount * 2;

            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.currentStation), 
                time: startTime, 
                isStart: true, 
                line: route.mtrRoute.route[0] 
            });
            items.push({ 
                type: 'segment', 
                mode: 'MTR', 
                lines: route.mtrRoute.route, 
                duration: mtrTime, 
                to: this.getMTRName(route.interchangeStation) 
            });
            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.interchangeStation), 
                line: route.mtrRoute.route[route.mtrRoute.route.length - 1] 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Walk', 
                duration: walkTime, 
                distance: route.walkingDistance, 
                to: transit.findStop(route.busRoute.boardingStop)?.name_en || `Stop ${route.busRoute.boardingStop}` 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: transit.findStop(route.busRoute.boardingStop)?.name_en || `Stop ${route.busRoute.boardingStop}`, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Bus', 
                route: route.busRoute.route, 
                direction: route.busRoute.direction, 
                stops: route.busRoute.stopCount, 
                duration: busTime, 
                alightingStopName: transit.findStop(route.busRoute.alightingStop)?.name_en || `Stop ${route.busRoute.alightingStop}`,
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: transit.findStop(route.busRoute.alightingStop)?.name_en || `Stop ${route.busRoute.alightingStop}`, 
                time: arrivalTime, 
                isEnd: true, 
                provider: route.busRoute.provider 
            });
        } else if (route.type === 'MTR') {
            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.currentStation), 
                time: startTime, 
                isStart: true, 
                line: route.mtrRoute.route[0] 
            });
            items.push({ 
                type: 'segment', 
                mode: 'MTR', 
                lines: route.mtrRoute.route, 
                duration: route.estimatedTime, 
                to: this.getMTRName(route.destinationStation) 
            });
            items.push({ 
                type: 'point', 
                mode: 'MTR', 
                name: this.getMTRName(route.destinationStation), 
                time: arrivalTime, 
                isEnd: true, 
                line: route.mtrRoute.route[route.mtrRoute.route.length - 1] 
            });
        } else if (route.type === 'Bus') {
            const walkToBus = calculateWalkDuration(route.walkingDistance / 2);
            const busTime = route.estimatedTime - route.walkingDistance / 2500 * 60;
            const walkFromBus = calculateWalkDuration(route.walkingDistance / 2);

            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: route.boardingStopName, 
                time: startTime, 
                isStart: true, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Walk', 
                duration: walkToBus, 
                distance: route.walkingDistance / 2, 
                to: route.boardingStopName 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: route.boardingStopName, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Bus', 
                route: route.busRoute.route, 
                direction: route.busRoute.direction, 
                stops: route.busRoute.stopCount, 
                duration: busTime, 
                alightingStopName: route.alightingStopName,
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: route.alightingStopName, 
                provider: route.busRoute.provider 
            });
            items.push({ 
                type: 'segment', 
                mode: 'Walk', 
                duration: walkFromBus, 
                distance: route.walkingDistance / 2, 
                to: route.alightingStopName 
            });
            items.push({ 
                type: 'point', 
                mode: 'Bus', 
                name: route.alightingStopName, 
                time: arrivalTime, 
                isEnd: true, 
                provider: route.busRoute.provider 
            });
        }

        return items;
    }

    static generatePoint(item) {
        const classes = `timeline-item station-point ${item.isStart ? 'start-point' : ''} ${item.isEnd ? 'end-point' : ''}`;
        const dataLine = item.mode === 'Bus' ? item.provider : item.line || item.mode;
        const time = item.time || '--:--';
        const tag = item.isStart ? '<span class="tag">From</span>' : item.isEnd ? '<span class="tag to">To</span>' : '';
        const lineTagClass = item.mode === 'Bus' ? (item.provider || 'unknown').toLowerCase() : (item.line || 'unknown').toLowerCase();
        const lineAbbr = item.mode === 'Bus' ? (item.provider || 'Unknown').toUpperCase() : item.line || item.mode;

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

    static generateSegment(item) {
        const dataLine = item.mode === 'Bus' ? item.provider : item.mode;
        const statsHtml = item.mode === 'Walk'
            ? `<span class="stat-duration">~${Math.round(item.duration)} min</span><span class="stat-distance">${Math.round(item.distance)}m</span>`
            : `<span class="stat-duration">~${Math.round(item.duration)} min</span><span class="stat-distance">-- km</span>`;
        let detailsHtml = '';
        if (item.mode === 'MTR') {
            const lineNamesHtml = item.lines.map(line => LINE_NAMES[line]?.name || line).join(' → ');
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

    static getMTRName(code) {
        const station = Object.values(lines).flat().find(s => s.value === code);
        return station ? station.text : code;
    }
}

// 5. Main Logic
let currentRoutes = [];


window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    const [cs, ds, sbs, ebs] = [
        params.get('currentStation'),
        params.get('destinationStation'),
        params.get('startBusStop'),
        params.get('endBusStop')
    ];

    const mtrStations = getUniqueMTRStations();
    const finder = new RouteFinder(transit, mtrStations);

    // Only check bus data for bus-related searches
    const requiresBusData = sbs || ebs;
    if (requiresBusData && !transit.stops.length) {
        document.getElementById('schedule').innerHTML = '<div class="error">Bus data not loaded.</div>';
        return;
    }

    if (cs && ds && !sbs && !ebs) {
        currentRoutes = await finder.findMTRRoute(cs, ds);
    } else if (sbs && ebs && !cs && !ds) {
        currentRoutes = finder.findBusRoute(sbs, ebs);
    } else if (sbs && ds && !cs && !ebs) {
        currentRoutes = await finder.findMixedRoute(sbs, ds, 'bus', 'mtr');
    } else if (cs && ebs && !sbs && !ds) {
        currentRoutes = await finder.findMixedRoute(cs, ebs, 'mtr', 'bus');
    } else {
        document.getElementById('schedule').innerHTML = '<div class="error">Invalid search parameters.</div>';
        return;
    }

    if (!currentRoutes.length) {
        document.getElementById('schedule').innerHTML = '<div class="error">No routes found.</div>';
        return;
    }

    displaySortedRoutes();
};

function displaySortedRoutes() {
    const opts = document.getElementById('route-options');
    opts.innerHTML = '';
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);

    currentRoutes.slice(0, 7).forEach((route, i) => {
        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);
        const transfers = route.type === 'Bus-to-MTR' || route.type === 'MTR-to-Bus' ? 1 : 0;

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
                ${TimelineGenerator.generate(route)}
                <div class="route-details" id="route-details-${i}" style="display: none;"></div>
            </div>
        `;
    });
}

function toggleRouteDetails(id, el) {
    const details = document.getElementById(id);
    details.style.display = details.style.display === 'none' ? 'block' : 'none';
}

function getUniqueMTRStations() {
    const stationSet = new Set();
    return Object.values(lines).flat().filter(station => {
        if (!stationSet.has(station.value)) {
            stationSet.add(station.value);
            return true;
        }
        return false;
    });
}