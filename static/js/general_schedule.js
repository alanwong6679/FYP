const LINE_NAMES = {
    "AEL": { name: "Airport Express Line", color: "#00888A" },
    "TCL": { name: "Tung Chung Line", color: "#F7943E" },
    "TML": { name: "Tuen Ma Line", color: "#923011" },
    "TKL": { name: "Tseung Kwan O Line", color: "#7D499D" },
    "EAL": { name: "East Rail Line", color: "#53B7E8" },
    "SIL": { name: "South Island Line", color: "#BAC429" },
    "TWL": { name: "Tsuen Wan Line", color: "#ED1D24" },
    "ISL": { name: "Island Line", color: "#007DC5" },
    "KTL": { name: "Kwun Tong Line", color: "#00AB4E" },
    "KMB": { name: "KMB", color: "#FF0000" },
    "CTB": { name: "CityBus", color: "#FFD700" },
    "Walk": { name: "Walk", color: "#888" },
    "Taxi": { name: "Taxi", color: "#FFD700" }
};

function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const calculateWalkDuration = distance => Math.max(1, Math.round((distance / 5000) * 60));

class TransitData {
    constructor() {
        this.routes = [];
        this.stops = [];
        this.routeStopsMap = {};
        this.stopMap = new Map();
        this.cumulativeDistancesMap = {};
        this.loadData();
    }

    loadData() {
        const kmbRoutes = JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]');
        const citybusRoutes = JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]');
        console.log("Loaded KMB Routes:", kmbRoutes.length, "Citybus Routes:", citybusRoutes.length);
        this.routes = [...kmbRoutes, ...citybusRoutes];

        const kmbStops = JSON.parse(localStorage.getItem('kmb_allStops') || '[]');
        const citybusStops = JSON.parse(localStorage.getItem('citybus_allStops') || '[]');
        console.log("Loaded KMB Stops:", kmbStops.length, "Citybus Stops:", citybusStops.length);
        this.stops = [...kmbStops, ...citybusStops];

        const kmbRouteStops = JSON.parse(localStorage.getItem('kmb_routeStopsMap') || '{}');
        const citybusRouteStops = JSON.parse(localStorage.getItem('citybus_routeStopsMap') || '{}');
        this.routeStopsMap = { ...kmbRouteStops, ...citybusRouteStops };

        this.stops.forEach(stop => this.stopMap.set(String(stop.stop), stop));

        for (const key in this.routeStopsMap) {
            const stops = this.routeStopsMap[key];
            if (!stops || stops.length < 2) {
                this.cumulativeDistancesMap[key] = [0];
                continue;
            }
            const cumulative = [0];
            let totalDistance = 0;
            let prevStop = this.findStop(stops[0]);
            for (let i = 1; i < stops.length; i++) {
                const currentStop = this.findStop(stops[i]);
                if (prevStop?.lat && prevStop?.long && currentStop?.lat && currentStop?.long) {
                    const distance = haversineDistance(
                        parseFloat(prevStop.lat), parseFloat(prevStop.long),
                        parseFloat(currentStop.lat), parseFloat(currentStop.long)
                    );
                    totalDistance += distance;
                }
                cumulative.push(totalDistance);
                prevStop = currentStop;
            }
            this.cumulativeDistancesMap[key] = cumulative;
        }
    }

    findStop(stopId) {
        return this.stopMap.get(String(stopId)) || null;
    }

    getNearbyStops(point, radius = 1500) {
        if (!point?.lat || !point?.long) return [];
        const pointLat = parseFloat(point.lat);
        const pointLon = parseFloat(point.long);
        if (isNaN(pointLat) || isNaN(pointLon)) return [];
        return this.stops.filter(s => {
            const stopLat = parseFloat(s.lat);
            const stopLon = parseFloat(s.long);
            return !isNaN(stopLat) && !isNaN(stopLon) &&
                   haversineDistance(pointLat, pointLon, stopLat, stopLon) <= radius;
        });
    }
}

const transit = new TransitData();

class RouteFinder {
    constructor(transitData, mtrStations) {
        this.transit = transitData;
        this.mtrStations = mtrStations;
        this.mtrStationCoords = new Map(
            this.mtrStations
                .filter(s => s && s.value && s.lat != null && s.long != null)
                .map(s => [s.value, { lat: parseFloat(s.lat), long: parseFloat(s.long) }])
        );
        this.MTR_AVG_SPEED_MS = (70 * 1000) / 3600;
        this.MTR_INTERCHANGE_DELAY_MIN = 5;
        this.BUS_WAIT_TIME_MIN = 5;

        this.stopToNearestMTR = new Map();
        for (const stop of this.transit.stops) {
            if (stop.lat && stop.long) {
                const nearest = this.findNearestMTR(stop);
                this.stopToNearestMTR.set(stop.stop, nearest);
            }
        }
    }
    async findBusToBusRoute(startStopId, endStopId) {
        const routes = [];
        const startStop = this.transit.findStop(startStopId);
        const endStop = this.transit.findStop(endStopId);
        if (!startStop || !endStop) {
            return routes;
        }
    
        // Find direct bus routes
        const directRoutes = this.findBusRoutes([startStopId], [endStopId]);
        routes.push(...directRoutes.map(br => {
            const walkDist = 0; // No walking for direct routes
            const busTime = (br.stopCount || 1) * 2 + this.BUS_WAIT_TIME_MIN;
            return {
                type: 'Bus',
                busRoute: br,
                estimatedTime: busTime,
                walkingDistance: walkDist,
                boardingStopName: startStop.name_en || `Stop ${br.boardingStop}`,
                alightingStopName: endStop.name_en || `Stop ${br.alightingStop}`,
                score: this.evaluateRouteScore({ estimatedTime: busTime, walkingDistance: walkDist, transfers: 0 })
            };
        }));
    
        // Find transfer routes with walking
        const WALK_RADIUS = 500; // meters
        const MAX_STOPS_TO_CONSIDER = 20; // Limit to avoid excessive computation
    
        // Get all bus routes passing through the start stop
        const startRoutes = this.transit.routes.filter(route => {
            const keyO = `${route.route}-O`;
            const keyI = `${route.route}-I`;
            return (this.transit.routeStopsMap[keyO] && this.transit.routeStopsMap[keyO].includes(startStopId)) ||
                   (this.transit.routeStopsMap[keyI] && this.transit.routeStopsMap[keyI].includes(startStopId));
        });
    
        for (const r1 of startRoutes) {
            for (const dir1 of ['outbound', 'inbound']) {
                const key1 = `${r1.route}-${dir1 === 'outbound' ? 'O' : 'I'}`;
                const stops1 = this.transit.routeStopsMap[key1] || [];
                const startIndex1 = stops1.indexOf(startStopId);
                if (startIndex1 === -1) continue;
    
                // Get subsequent stops in the direction after start stop
                const subsequentStops = stops1.slice(startIndex1 + 1, startIndex1 + 1 + MAX_STOPS_TO_CONSIDER);
    
                for (const alightingStopId of subsequentStops) {
                    const alightingStop = this.transit.findStop(alightingStopId);
                    if (!alightingStop) continue;
    
                    // Get nearby stops to alighting stop for second leg
                    const nearbyStops = this.transit.getNearbyStops(alightingStop, WALK_RADIUS).map(s => s.stop);
    
                    // Find second leg routes from nearby stops to end stop
                    const secondLegRoutes = this.findBusRoutes(nearbyStops, [endStopId]);
    
                    for (const r2 of secondLegRoutes) {
                        // Ensure it's a different route or different direction
                        if (r1.route === r2.route && dir1 === r2.direction) continue;
    
                        const boardingStop2 = this.transit.findStop(r2.boardingStop);
                        const walkingDistance = alightingStopId === r2.boardingStop ? 0 : haversineDistance(
                            parseFloat(alightingStop.lat), parseFloat(alightingStop.long),
                            parseFloat(boardingStop2.lat), parseFloat(boardingStop2.long)
                        );
    
                        // Calculate times
                        const firstLegStopCount = stops1.indexOf(alightingStopId) - startIndex1;
                        const firstLegTime = (firstLegStopCount * 2) + this.BUS_WAIT_TIME_MIN;
                        const walkTime = calculateWalkDuration(walkingDistance);
                        const secondLegTime = (r2.stopCount || 1) * 2 + this.BUS_WAIT_TIME_MIN;
                        const totalTime = firstLegTime + walkTime + secondLegTime;
    
                        routes.push({
                            type: 'transfer',
                            firstLeg: {
                                route: r1.route,
                                direction: dir1,
                                boardingStop: startStopId,
                                alightingStop: alightingStopId,
                                provider: r1.provider,
                                stopCount: firstLegStopCount
                            },
                            secondLeg: r2,
                            transferStop: alightingStopId,
                            walkingDistance: walkingDistance,
                            estimatedTime: totalTime,
                            boardingStopName: startStop.name_en || `Stop ${startStopId}`,
                            alightingStopName: endStop.name_en || `Stop ${endStopId}`,
                            score: this.evaluateRouteScore({ estimatedTime: totalTime, walkingDistance: walkingDistance, transfers: 1 })
                        });
                    }
                }
            }
        }
    
        // Optional: Add taxi route if no routes found
        if (!routes.length) {
            const taxiRoute = this.calculateTaxiRoute(startStop, endStop);
            if (taxiRoute) {
                taxiRoute.score = this.evaluateRouteScore({ estimatedTime: taxiRoute.estimatedTime, walkingDistance: 0, transfers: 0 });
                routes.push(taxiRoute);
            }
        }
    
        return routes.sort((a, b) => a.score - b.score).slice(0, 5);
    }

    evaluateRouteScore(route) {
        const timeWeight = 0.7;
        const transferWeight = 0.2;
        const walkWeight = 0.1;
        const normalizedTime = route.estimatedTime / 60;
        const transfers = route.type === 'transfer' ? 1 : route.type === 'Bus-MTR-Bus' ? 2 : 0;
        const walkDistance = (route.walkingDistance || 0) / 1000;
        return (timeWeight * normalizedTime) + (transferWeight * transfers) + (walkWeight * walkDistance);
    }





    

    calculateTaxiRoute(startPoint, endPoint) {
        if (!startPoint?.lat || !startPoint?.long || !endPoint?.lat || !endPoint?.long) {
            console.error("Invalid coordinates for taxi route calculation");
            return null;
        }
        const distance = haversineDistance(
            parseFloat(startPoint.lat), parseFloat(startPoint.long),
            parseFloat(endPoint.lat), parseFloat(endPoint.long)
        );
        const speedKmH = 40;
        const speedMS = (speedKmH * 1000) / 3600;
        const durationSeconds = distance / speedMS;
        const durationMinutes = Math.max(5, Math.round(durationSeconds / 60));
        const fare = this.calculateTaxiFare(distance);
        return {
            type: 'Taxi',
            distance: Math.round(distance),
            estimatedTime: durationMinutes,
            fare: fare.toFixed(1),
            startPoint: startPoint.name_en || startPoint.text || "Starting Point",
            endPoint: endPoint.name_en || endPoint.text || "Destination"
        };
    }

    calculateTaxiFare(distance) {
        const baseFare = 29;
        const baseDistance = 2000;
        const additionalRate = 2.1;
        const incrementDistance = 200;
        if (distance <= baseDistance) return baseFare;
        const additionalDistance = distance - baseDistance;
        const increments = Math.ceil(additionalDistance / incrementDistance);
        return baseFare + (increments * additionalRate);
    }

    getMTRStationCoords(stationCode) {
        return this.mtrStationCoords.get(stationCode) || null;
    }

    calculateBusSegmentDistance(routeId, directionKey, boardingStopId, alightingStopId) {
        const stopsOnRoute = this.transit.routeStopsMap[directionKey] || [];
        const startIndex = stopsOnRoute.indexOf(String(boardingStopId));
        const endIndex = stopsOnRoute.indexOf(String(alightingStopId));
        if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
            console.warn(`Invalid stop indices for ${directionKey}: ${boardingStopId} -> ${alightingStopId}`);
            return undefined;
        }
        const cumulative = this.transit.cumulativeDistancesMap[directionKey];
        if (!cumulative || cumulative.length !== stopsOnRoute.length) {
            console.warn(`Cumulative distances not available for ${directionKey}`);
            return undefined;
        }
        return cumulative[endIndex] - cumulative[startIndex];
    }

    findBusRoutes(startStopIds, endStopIds, provider = null) {
        console.log("Finding bus routes from", startStopIds, "to", endStopIds, "with provider", provider);
        const routes = [];
        const startIdsSet = new Set(startStopIds.map(String));
        const endIdsSet = new Set(endStopIds.map(String));
        const allRoutes = this.transit.routes;
    
        console.log("Total routes to check:", allRoutes.length);
    
        for (const route of allRoutes) {
            if (!route.route || (provider && route.provider !== provider)) continue;
            for (const direction of ['outbound', 'inbound']) {
                const key = `${route.route}-${direction === 'outbound' ? 'O' : 'I'}`;
                const stops = this.transit.routeStopsMap[key] || [];
                if (!stops.length) continue;
    
                const stopStrings = stops.map(String);
                let boardingStopId = null, boardingIndex = -1;
                for (let i = 0; i < stopStrings.length; i++) {
                    if (startIdsSet.has(stopStrings[i])) {
                        boardingStopId = stopStrings[i];
                        boardingIndex = i;
                        break;
                    }
                }
                if (boardingIndex === -1) continue;
    
                let alightingStopId = null, alightingIndex = -1;
                for (let i = boardingIndex + 1; i < stopStrings.length; i++) {
                    if (endIdsSet.has(stopStrings[i])) {
                        alightingStopId = stopStrings[i];
                        alightingIndex = i;
                        break;
                    }
                }
                if (alightingIndex !== -1) {
                    const distance = this.calculateBusSegmentDistance(route.route, key, boardingStopId, alightingStopId);
                    routes.push({
                        route: route.route,
                        direction,
                        boardingStop: boardingStopId,
                        alightingStop: alightingStopId,
                        provider: route.provider,
                        stopCount: alightingIndex - boardingIndex,
                        distance,
                        type: 'direct'
                    });
                    console.log(`Found direct route ${key}: ${boardingStopId} -> ${alightingStopId}`);
                }
            }
        }
    
        console.log("Searching for transfer routes...");
        const startStops = startStopIds.map(id => this.transit.findStop(id)).filter(s => s);
        const endStops = endStopIds.map(id => this.transit.findStop(id)).filter(s => s);
    
        if (startStops.length === 0 || endStops.length === 0) {
            console.log("Invalid start or end stops.");
            return routes;
        }
    
        for (const startStop of startStops) {
            const startProvider = startStop.provider;
            const nearbyStops = this.transit.getNearbyStops(startStop, 500);
            const transferCandidates = nearbyStops.filter(s => s.provider && s.stop !== startStop.stop);
    
            console.log(`Found ${transferCandidates.length} transfer candidates near ${startStop.stop}`);
    
            for (const transferStop of transferCandidates) {
                const firstLegRoutes = this.findBusRoutes([startStop.stop], [transferStop.stop], startProvider);
                if (firstLegRoutes.length === 0) continue;
    
                for (const endStop of endStops) {
                    const secondLegRoutes = this.findBusRoutes([transferStop.stop], [endStop.stop], transferStop.provider);
                    if (secondLegRoutes.length === 0) continue;
    
                    firstLegRoutes.forEach(firstLeg => {
                        secondLegRoutes.forEach(secondLeg => {
                            if (firstLeg.route === secondLeg.route && firstLeg.direction === secondLeg.direction) return;
    
                            const transferStart = this.transit.findStop(firstLeg.alightingStop);
                            const transferEnd = this.transit.findStop(secondLeg.boardingStop);
                            const walkDistance = transferStart && transferEnd ? haversineDistance(
                                parseFloat(transferStart.lat), parseFloat(transferStart.long),
                                parseFloat(transferEnd.lat), parseFloat(transferEnd.long)
                            ) : 0;
                            const walkTime = calculateWalkDuration(walkDistance);
                            routes.push({
                                type: 'transfer',
                                firstLeg,
                                secondLeg,
                                transferStop: transferStop.stop,
                                walkingDistance: walkDistance,
                                estimatedTime: (firstLeg.stopCount * 2) + walkTime + (secondLeg.stopCount * 2),
                                boardingStopName: startStop.name_en || `Stop ${startStop.stop}`,
                                alightingStopName: endStop.name_en || `Stop ${endStop.stop}`
                            });
                            console.log(`Found transfer route: ${firstLeg.route} (${firstLeg.provider}) -> ${secondLeg.route} (${secondLeg.provider}) via ${transferStop.stop}`);
                        });
                    });
                }
            }
        }
    
        console.log("Final bus routes found:", routes);
        return routes;
    }












    
    async findMixedRoute(start, end, startType, endType) {
        const routes = [];
        let startPoint = startType === 'bus' ? this.transit.findStop(start) : this.mtrStations.find(s => s.value === start);
        let endPoint = endType === 'bus' ? this.transit.findStop(end) : this.mtrStations.find(s => s.value === end);
    
        if (!startPoint || !endPoint) {
            console.error('Invalid start or end point:', start, end);
            document.getElementById('schedule').innerHTML = '<div class="error">Invalid start or end point selected.</div>';
            return routes;
        }
    
        const MAX_INTERCHANGE_DISTANCE = 2000;
        const BUS_WAIT_TIME_MIN = 5;
        const MAX_INTERCHANGES = 5;
    
        async function fetchETA(route, direction, stopId, company) {
            try {
                const url = company === 'KMB'
                    ? `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/1`
                    : `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
    
                let eta = null;
                if (company === 'KMB') {
                    eta = data.data.find(e => e.seq === 1);
                    if (eta?.eta) {
                        return Math.max(0, Math.round((new Date(eta.eta) - new Date(data.generated_timestamp)) / 60000));
                    }
                } else {
                    const dirMapping = { "outbound": "O", "inbound": "I" };
                    eta = data.data.find(e => e.eta_seq === 1 && e.dir === dirMapping[direction]) || 
                          data.data.find(e => e.eta_seq === 1);
                    if (eta?.eta) {
                        return Math.max(0, Math.round((new Date(eta.eta) - new Date(eta.data_timestamp)) / 60000));
                    }
                }
                return BUS_WAIT_TIME_MIN;
            } catch (error) {
                console.error(`${company} ETA fetch failed for ${route} at ${stopId}:`, error);
                return BUS_WAIT_TIME_MIN;
            }
        }

        const evaluateRouteScore = (route) => {
            const timeWeight = 0.7;
            const transferWeight = 0.2;
            const walkWeight = 0.1;
            const normalizedTime = route.estimatedTime / 60;
            const transfers = (route.type === 'Bus-to-MTR' || route.type === 'MTR-to-Bus') ? 1 : 0;
            const walkDistance = route.walkingDistance / 1000;
            return (timeWeight * normalizedTime) + (transferWeight * transfers) + (walkWeight * walkDistance);
        };
    
        if (startType === 'bus' && endType === 'mtr') {
            const startNearbyMTRs = this.mtrStations
                .map(station => ({
                    station,
                    distance: station.lat && station.long ? haversineDistance(
                        parseFloat(startPoint.lat), parseFloat(startPoint.long),
                        parseFloat(station.lat), parseFloat(station.long)
                    ) : Infinity
                }))
                .filter(m => m.distance <= MAX_INTERCHANGE_DISTANCE)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, MAX_INTERCHANGES);
    
            for (const interchange of startNearbyMTRs) {
                const nearbyBusStops = this.transit.getNearbyStops(interchange.station, MAX_INTERCHANGE_DISTANCE).map(s => s.stop);
                const busRoutes = this.findBusRoutes([startPoint.stop], nearbyBusStops, null);
    
                if (!busRoutes.length) continue;
    
                const mtrResponse = await this.fetchMTRSchedule(interchange.station.value, end);
                if (mtrResponse.error || !mtrResponse.bestRoute) continue;
    
                const mtrTime = this.calculateMTRTime(mtrResponse.bestRoute);
                const walkTime = calculateWalkDuration(interchange.distance);
    
                for (const busRoute of busRoutes) {
                    const etaMinutes = await fetchETA(busRoute.route, busRoute.direction, busRoute.boardingStop, busRoute.provider);
                    const busTime = (busRoute.stopCount * 2) + etaMinutes;
                    const totalTime = busTime + walkTime + mtrTime;
                    const route = {
                        type: 'Bus-to-MTR',
                        busRoute,
                        mtrRoute: mtrResponse.bestRoute,
                        walkingDistance: interchange.distance,
                        estimatedTime: totalTime,
                        schedules: mtrResponse.schedules,
                        currentStation: startPoint.stop,
                        interchangeStation: interchange.station.value,
                        destinationStation: end,
                        busWaitTime: etaMinutes,
                        startTime: new Date(Date.now() + etaMinutes * 60000)
                    };
                    route.score = evaluateRouteScore(route);
                    routes.push(route);
                }
            }
        } else if (startType === 'mtr' && endType === 'bus') {
            const endNearbyMTRs = this.mtrStations
                .map(station => ({
                    station,
                    distance: station.lat && station.long ? haversineDistance(
                        parseFloat(endPoint.lat), parseFloat(endPoint.long),
                        parseFloat(station.lat), parseFloat(station.long)
                    ) : Infinity
                }))
                .filter(m => m.distance <= MAX_INTERCHANGE_DISTANCE)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, MAX_INTERCHANGES);
    
            for (const interchange of endNearbyMTRs) {
                const mtrResponse = await this.fetchMTRSchedule(start, interchange.station.value);
                if (mtrResponse.error || !mtrResponse.bestRoute) continue;
    
                const mtrTime = this.calculateMTRTime(mtrResponse.bestRoute);
                const nearbyBusStops = this.transit.getNearbyStops(interchange.station, MAX_INTERCHANGE_DISTANCE).map(s => s.stop);
                const busRoutes = this.findBusRoutes(nearbyBusStops, [endPoint.stop], null);
    
                for (const busRoute of busRoutes) {
                    const etaMinutes = await fetchETA(busRoute.route, busRoute.direction, busRoute.boardingStop, busRoute.provider);
                    const walkTime = calculateWalkDuration(interchange.distance);
                    const busTime = (busRoute.stopCount * 2) + etaMinutes;
                    const totalTime = mtrTime + walkTime + busTime;
                    const route = {
                        type: 'MTR-to-Bus',
                        mtrRoute: mtrResponse.bestRoute,
                        busRoute,
                        walkingDistance: interchange.distance,
                        estimatedTime: totalTime,
                        schedules: mtrResponse.schedules,
                        currentStation: start,
                        interchangeStation: interchange.station.value,
                        destinationStop: endPoint.stop,
                        busWaitTime: etaMinutes,
                        startTime: new Date(Date.now() + mtrTime * 60000 + walkTime * 60000 + etaMinutes * 60000)
                    };
                    route.score = evaluateRouteScore(route);
                    routes.push(route);
                }
            }
        }
    
        routes.sort((a, b) => a.score - b.score);
        const optimizedRoutes = routes.slice(0, 5);
        console.log(`Found ${optimizedRoutes.length} optimized mixed routes`);
        return optimizedRoutes;
    }

    async findMTRRoute(start, end) {
        const response = await this.fetchMTRSchedule(start, end);
        if (response.error || !response.bestRoute) {
            console.error("MTR Route Error:", response.error || "No route found", "from", start, "to", end);
            return [];
        }
        
        return [{
            type: 'MTR',
            mtrRoute: response.bestRoute,
            estimatedTime: response.bestRoute.totalDuration || this.calculateMTRTime(response.bestRoute),
            schedules: response.schedules,
            currentStation: start,
            destinationStation: end
        }];
    }

    findNearestMTR(point) {
        if (!point?.lat || !point?.long) return { station: null, distance: Infinity };
        const pointLat = parseFloat(point.lat);
        const pointLon = parseFloat(point.long);
        if (isNaN(pointLat) || isNaN(pointLon)) return { station: null, distance: Infinity };

        let closest = { station: null, distance: Infinity };
        for (const station of this.mtrStations) {
            const stationLat = station.lat;
            const stationLon = station.long;
            if (stationLat == null || stationLon == null) continue;
            const distance = haversineDistance(pointLat, pointLon, stationLat, stationLon);
            if (distance < closest.distance) {
                closest = { station, distance };
            }
        }
        return closest;
    }

    calculateMTRSegmentDetails(startStationCode, endStationCode) {
        const startCoords = this.getMTRStationCoords(startStationCode);
        const endCoords = this.getMTRStationCoords(endStationCode);

        if (!startCoords || !endCoords) {
            console.warn(`Missing coordinates for MTR segment: ${startStationCode} -> ${endStationCode}`);
            return { distance: undefined, duration: undefined };
        }

        const distance = haversineDistance(startCoords.lat, startCoords.long, endCoords.lat, endCoords.long);
        if (distance === 0) return { distance: 0, duration: 0 };

        const durationSeconds = distance / this.MTR_AVG_SPEED_MS;
        const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
        return { distance: Math.round(distance), duration: durationMinutes };
    }


    

    async fetchMTRSchedule(from, to) {
        if (!from || !to) return { error: 'Missing MTR station code(s)', bestRoute: null };
        try {
            const response = await fetch('/fetch_schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentStation: from, destinationStation: to })
            });
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status} for ${from} -> ${to}`);
                return { error: `MTR server error (${response.status})`, bestRoute: null };
            }
            const data = await response.json();
            if (!data || !data.bestRoute || !data.bestRoute.route || data.bestRoute.route.length === 0) {
                console.warn("Received invalid/empty MTR schedule data for", from, "to", to, data);
                return { error: 'No valid MTR route found', bestRoute: null };
            }
            const route = data.bestRoute;
            route.segmentDetails = [];
            let calculatedTotalDuration = 0;
            const keyStations = [from, ...(route.interchanges || []), to];
            const uniqueKeyStations = keyStations.filter((station, index, arr) => index === 0 || station !== arr[index - 1]);

            for (let i = 0; i < uniqueKeyStations.length - 1; i++) {
                const segmentStart = uniqueKeyStations[i];
                const segmentEnd = uniqueKeyStations[i + 1];
                const details = this.calculateMTRSegmentDetails(segmentStart, segmentEnd);
                route.segmentDetails.push({
                    from: segmentStart,
                    to: segmentEnd,
                    line: route.route[i],
                    distance: details.distance,
                    duration: details.duration,
                    stops: route.segmentDetails?.[i]?.stops ?? undefined
                });
                if (details.duration !== undefined) {
                    calculatedTotalDuration += details.duration;
                    if (i < uniqueKeyStations.length - 2) {
                        calculatedTotalDuration += this.MTR_INTERCHANGE_DELAY_MIN;
                    }
                } else {
                    calculatedTotalDuration += 5;
                    console.warn(`Using default duration for segment ${segmentStart} -> ${segmentEnd}`);
                }
            }
            return data;
        } catch (e) {
            console.error('MTR Fetch Error:', e);
            return { error: 'Could not connect to MTR schedule service', bestRoute: null };
        }
    }

    calculateMTRTime(route) {
        if (route?.totalDuration) return route.totalDuration;
        if (!route || !route.route) return 0;
        const interchangeCount = route.interchanges?.length || (route.route.length > 1 ? route.route.length - 1 : 0);
        const lineTimeEstimate = route.route.length * 3;
        const interchangeTimeEstimate = interchangeCount * 5;
        return lineTimeEstimate + interchangeTimeEstimate;
    }
}









class TimelineGenerator {

    static getItems(route) {
        const now = route.startTime || new Date(); // Use route startTime if available
        let currentTime = new Date(now);
        const items = [];
        const formatTime = dateObj => dateObj.toTimeString().slice(0, 5);
        const MTR_INTERCHANGE_DELAY_MIN = 5; // Consistent delay time
        const BUS_WAIT_TIME_MIN = 5; // Default bus wait estimate

        if (!route || !route.type) {
            console.error("Invalid route object passed to getItems", route);
            return items;
        }

        // Helper to get MTR station name
        const getMTRName = (code) => {
            if (typeof lines === 'undefined' || Object.keys(lines).length === 0) {
                 // console.warn("'lines' data (from stations.js) not available for MTR name lookup."); // Reduce console noise
                return code;
            }
            for (const lineKey in lines) {
                const station = lines[lineKey].find(s => s.value === code);
                if (station) return station.text;
            }
            return code;
        };
        // Helper to get default interchange station (less reliable)
         const getDefaultInterchange = (line1, line2) => {
             if (typeof interchangeStations === 'undefined') return 'Interchange';
             const key1 = `${line1}_${line2}`;
             const key2 = `${line2}_${line1}`;
             return interchangeStations[key1] || interchangeStations[key2] || `${line1}/${line2} Interchange`;
         };


        // --- Generate items based on route type ---

        if (route.type === 'Taxi') {
            items.push({ type: 'point', mode: 'Taxi', name: route.startPoint, time: formatTime(currentTime), isStart: true });
            items.push({ type: 'segment', mode: 'Taxi', duration: route.estimatedTime, distance: route.distance, to: route.endPoint });
            currentTime.setMinutes(currentTime.getMinutes() + route.estimatedTime);
            items.push({ type: 'point', mode: 'Taxi', name: route.endPoint, time: formatTime(currentTime), isEnd: true });
        }

        else if (route.type === 'MTR') {
            const mtrRoute = route.mtrRoute;
            if (!mtrRoute || !mtrRoute.route || !mtrRoute.segmentDetails) {
                 console.error("Invalid MTR route data in getItems:", route);
                 return items;
             }
            items.push({ type: 'point', mode: 'MTR', name: getMTRName(route.currentStation), time: formatTime(currentTime), isStart: true, line: mtrRoute.route[0] });
             for (let i = 0; i < mtrRoute.segmentDetails.length; i++) {
                 const segment = mtrRoute.segmentDetails[i];
                 const segmentDuration = segment.duration !== undefined ? segment.duration : 5; // Use duration or fallback
                 const currentLine = segment.line || mtrRoute.route[i]; // Use segment line or route line
                 const destinationName = getMTRName(segment.to);
                 items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segment.distance, stops: segment.stops, to: destinationName });
                 currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                 const isInterchange = i < mtrRoute.segmentDetails.length - 1;
                 if (isInterchange) {
                     const nextSegment = mtrRoute.segmentDetails[i+1];
                     const nextLine = nextSegment.line || mtrRoute.route[i+1];
                     items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine });
                     currentTime.setMinutes(currentTime.getMinutes() + MTR_INTERCHANGE_DELAY_MIN);
                 }
             }
            items.push({ type: 'point', mode: 'MTR', name: getMTRName(route.destinationStation), time: formatTime(currentTime), isEnd: true, line: mtrRoute.route[mtrRoute.route.length - 1] });
        }

        else if (route.type === 'Bus-to-MTR') {
             const busRoute = route.busRoute;
             const mtrRoute = route.mtrRoute;
             if (!busRoute || !mtrRoute || !mtrRoute.route || !mtrRoute.segmentDetails) { console.error("Invalid Bus-to-MTR data:", route); return items; }
             const boardingStopInfo = transit.findStop(busRoute.boardingStop); // Assumes 'transit' is accessible
             const alightingStopInfo = transit.findStop(busRoute.alightingStop);
             const boardingStopName = boardingStopInfo?.name_en || `Stop ${busRoute.boardingStop}`;
             const alightingStopName = alightingStopInfo?.name_en || `Stop ${busRoute.alightingStop}`;
             const busWaitTime = route.busWaitTime !== undefined ? route.busWaitTime : BUS_WAIT_TIME_MIN;
             const busTravelTime = (busRoute.stopCount || 1) * 2;
             const busTotalSegmentTime = busWaitTime + busTravelTime;
             const walkTime = calculateWalkDuration(route.walkingDistance); // Assumes calculateWalkDuration is accessible

             items.push({ type: 'point', mode: 'Bus', name: boardingStopName, time: formatTime(currentTime), isStart: true, provider: busRoute.provider });
             items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTotalSegmentTime, distance: busRoute.distance, alightingStopName: alightingStopName, provider: busRoute.provider, waitTime: busWaitTime });
             currentTime.setMinutes(currentTime.getMinutes() + busTotalSegmentTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingStopName, time: formatTime(currentTime), provider: busRoute.provider });

             const interchangeMTRStationName = getMTRName(route.interchangeStation);
             items.push({ type: 'segment', mode: 'Walk', duration: walkTime, distance: route.walkingDistance, to: interchangeMTRStationName });
             currentTime.setMinutes(currentTime.getMinutes() + walkTime);
             items.push({ type: 'point', mode: 'MTR', name: interchangeMTRStationName, time: formatTime(currentTime), line: mtrRoute.route[0] });

             for (let i = 0; i < mtrRoute.segmentDetails.length; i++) {
                  const segment = mtrRoute.segmentDetails[i];
                  const segmentDuration = segment.duration !== undefined ? segment.duration : 5;
                  const currentLine = segment.line || mtrRoute.route[i];
                  const destinationName = getMTRName(segment.to);
                  items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segment.distance, stops: segment.stops, to: destinationName });
                  currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                  const isInterchange = i < mtrRoute.segmentDetails.length - 1;
                  if (isInterchange) {
                      const nextSegment = mtrRoute.segmentDetails[i+1];
                      const nextLine = nextSegment.line || mtrRoute.route[i+1];
                      items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine });
                      currentTime.setMinutes(currentTime.getMinutes() + MTR_INTERCHANGE_DELAY_MIN);
                  }
              }
             items.push({ type: 'point', mode: 'MTR', name: getMTRName(route.destinationStation), time: formatTime(currentTime), isEnd: true, line: mtrRoute.route[mtrRoute.route.length - 1] });
         }

        else if (route.type === 'MTR-to-Bus') {
             const mtrRoute = route.mtrRoute;
             const busRoute = route.busRoute;
              if (!busRoute || !mtrRoute || !mtrRoute.route || !mtrRoute.segmentDetails) { console.error("Invalid MTR-to-Bus data:", route); return items; }
             const boardingStopInfo = transit.findStop(busRoute.boardingStop);
             const alightingStopInfo = transit.findStop(busRoute.alightingStop);
             const boardingStopName = boardingStopInfo?.name_en || `Stop ${busRoute.boardingStop}`;
             const alightingStopName = alightingStopInfo?.name_en || `Stop ${busRoute.alightingStop}`;
             const walkTime = calculateWalkDuration(route.walkingDistance);
             const busWaitTime = route.busWaitTime !== undefined ? route.busWaitTime : BUS_WAIT_TIME_MIN;
             const busTravelTime = (busRoute.stopCount || 1) * 2;
             const busTotalSegmentTime = busWaitTime + busTravelTime;

             items.push({ type: 'point', mode: 'MTR', name: getMTRName(route.currentStation), time: formatTime(currentTime), isStart: true, line: mtrRoute.route[0] });
             for (let i = 0; i < mtrRoute.segmentDetails.length; i++) {
                  const segment = mtrRoute.segmentDetails[i];
                  const segmentDuration = segment.duration !== undefined ? segment.duration : 5;
                  const currentLine = segment.line || mtrRoute.route[i];
                  const destinationName = getMTRName(segment.to);
                  items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segment.distance, stops: segment.stops, to: destinationName });
                  currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                  const isInternalInterchange = i < mtrRoute.segmentDetails.length - 1;
                  const isFinalMTRPoint = i === mtrRoute.segmentDetails.length - 1;
                  if (isInternalInterchange) {
                      const nextSegment = mtrRoute.segmentDetails[i+1];
                      const nextLine = nextSegment.line || mtrRoute.route[i+1];
                      items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine });
                      currentTime.setMinutes(currentTime.getMinutes() + MTR_INTERCHANGE_DELAY_MIN);
                  } else if (isFinalMTRPoint) {
                      items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), line: currentLine });
                  }
              }
             items.push({ type: 'segment', mode: 'Walk', duration: walkTime, distance: route.walkingDistance, to: boardingStopName });
             currentTime.setMinutes(currentTime.getMinutes() + walkTime);
             items.push({ type: 'point', mode: 'Bus', name: boardingStopName, time: formatTime(currentTime), provider: busRoute.provider });
             items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTotalSegmentTime, distance: busRoute.distance, alightingStopName: alightingStopName, provider: busRoute.provider, waitTime: busWaitTime });
             currentTime.setMinutes(currentTime.getMinutes() + busTotalSegmentTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingStopName, time: formatTime(currentTime), isEnd: true, provider: busRoute.provider });
         }

        else if (route.type === 'Bus') {
             const busRoute = route.busRoute;
             if (!busRoute) { console.error("Invalid Bus data:", route); return items; }
             const busWaitTime = route.busWaitTime !== undefined ? route.busWaitTime : BUS_WAIT_TIME_MIN;
             const busTravelTime = (busRoute.stopCount || 1) * 2;
             const busTotalSegmentTime = busWaitTime + busTravelTime;
             items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, time: formatTime(currentTime), isStart: true, provider: busRoute.provider });
             items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTotalSegmentTime, distance: busRoute.distance, alightingStopName: route.alightingStopName, provider: busRoute.provider, waitTime: busWaitTime });
             currentTime.setMinutes(currentTime.getMinutes() + busTotalSegmentTime);
             items.push({ type: 'point', mode: 'Bus', name: route.alightingStopName, time: formatTime(currentTime), isEnd: true, provider: busRoute.provider });
         }

        else if (route.type === 'transfer') {
             const firstLeg = route.firstLeg;
             const secondLeg = route.secondLeg;
              if (!firstLeg || !secondLeg) { console.error("Invalid transfer data:", route); return items; }
             const boardingStopFirst = route.boardingStopName || `Stop ${firstLeg.boardingStop}`;
             const alightingStopFirst = transit.findStop(firstLeg.alightingStop)?.name_en || `Stop ${firstLeg.alightingStop}`;
             const boardingStopSecond = transit.findStop(secondLeg.boardingStop)?.name_en || `Stop ${secondLeg.boardingStop}`;
             const alightingStopSecond = route.alightingStopName || `Stop ${secondLeg.alightingStop}`;
             const firstBusWait = route.firstLegWaitTime !== undefined ? route.firstLegWaitTime : BUS_WAIT_TIME_MIN;
             const firstBusTravel = (firstLeg.stopCount || 1) * 2;
             const firstBusTime = firstBusWait + firstBusTravel;
             const walkTime = calculateWalkDuration(route.walkingDistance);
             const secondBusWait = route.secondLegWaitTime !== undefined ? route.secondLegWaitTime : BUS_WAIT_TIME_MIN;
             const secondBusTravel = (secondLeg.stopCount || 1) * 2;
             const secondBusTime = secondBusWait + secondBusTravel;

             items.push({ type: 'point', mode: 'Bus', name: boardingStopFirst, time: formatTime(currentTime), isStart: true, provider: firstLeg.provider });
             items.push({ type: 'segment', mode: 'Bus', route: firstLeg.route, direction: firstLeg.direction, stops: firstLeg.stopCount, duration: firstBusTime, distance: firstLeg.distance, alightingStopName: alightingStopFirst, provider: firstLeg.provider, waitTime: firstBusWait });
             currentTime.setMinutes(currentTime.getMinutes() + firstBusTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingStopFirst, time: formatTime(currentTime), provider: firstLeg.provider });

              if (route.walkingDistance > 10 && walkTime > 0) {
                   items.push({ type: 'segment', mode: 'Walk', duration: walkTime, distance: route.walkingDistance, to: boardingStopSecond });
                   currentTime.setMinutes(currentTime.getMinutes() + walkTime);
                   items.push({ type: 'point', mode: 'Walk', name: boardingStopSecond, time: formatTime(currentTime) }); // Indicate arrival point after walk
               } else {
                    items.push({ type: 'point', mode: 'Bus', name: boardingStopSecond, time: formatTime(currentTime), provider: secondLeg.provider });
                }

             items.push({ type: 'segment', mode: 'Bus', route: secondLeg.route, direction: secondLeg.direction, stops: secondLeg.stopCount, duration: secondBusTime, distance: secondLeg.distance, alightingStopName: alightingStopSecond, provider: secondLeg.provider, waitTime: secondBusWait });
             currentTime.setMinutes(currentTime.getMinutes() + secondBusTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingStopSecond, time: formatTime(currentTime), isEnd: true, provider: secondLeg.provider });
         }

        else if (route.type === 'Bus-MTR-Bus') {
             const firstBus = route.firstBusRoute;
             const mtrRoute = route.mtrRoute;
             const secondBus = route.secondBusRoute;
             if (!firstBus || !mtrRoute || !secondBus || !mtrRoute.route || !mtrRoute.segmentDetails) { console.error("Invalid Bus-MTR-Bus data:", route); return items; }
             const boardingFirst = route.boardingStopName || `Stop ${firstBus.boardingStop}`;
             const alightingFirst = transit.findStop(firstBus.alightingStop)?.name_en || `Stop ${firstBus.alightingStop}`;
             const boardingSecond = transit.findStop(secondBus.boardingStop)?.name_en || `Stop ${secondBus.boardingStop}`;
             const alightingSecond = route.alightingStopName || `Stop ${secondBus.alightingStop}`;
             const firstInterchangeName = getMTRName(route.firstInterchange);
             const secondInterchangeName = getMTRName(route.secondInterchange);
             const firstBusWait = route.firstBusWaitTime !== undefined ? route.firstBusWaitTime : BUS_WAIT_TIME_MIN;
             const firstBusTravel = (firstBus.stopCount || 1) * 2;
             const firstBusTime = firstBusWait + firstBusTravel;
             const walkToMTRDist = route.walkingDistance ? route.walkingDistance / 2 : 150;
             const walkFromMTRDist = route.walkingDistance ? route.walkingDistance / 2 : 150;
             const firstWalkTime = calculateWalkDuration(walkToMTRDist);
             const secondWalkTime = calculateWalkDuration(walkFromMTRDist);
             const secondBusWait = route.secondBusWaitTime !== undefined ? route.secondBusWaitTime : BUS_WAIT_TIME_MIN;
             const secondBusTravel = (secondBus.stopCount || 1) * 2;
             const secondBusTime = secondBusWait + secondBusTravel;

             items.push({ type: 'point', mode: 'Bus', name: boardingFirst, time: formatTime(currentTime), isStart: true, provider: firstBus.provider });
             items.push({ type: 'segment', mode: 'Bus', route: firstBus.route, direction: firstBus.direction, stops: firstBus.stopCount, duration: firstBusTime, distance: firstBus.distance, alightingStopName: alightingFirst, provider: firstBus.provider, waitTime: firstBusWait });
             currentTime.setMinutes(currentTime.getMinutes() + firstBusTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingFirst, time: formatTime(currentTime), provider: firstBus.provider });

             items.push({ type: 'segment', mode: 'Walk', duration: firstWalkTime, distance: walkToMTRDist, to: firstInterchangeName });
             currentTime.setMinutes(currentTime.getMinutes() + firstWalkTime);
             items.push({ type: 'point', mode: 'MTR', name: firstInterchangeName, time: formatTime(currentTime), line: mtrRoute.route[0] });

             for (let i = 0; i < mtrRoute.segmentDetails.length; i++) {
                  const segment = mtrRoute.segmentDetails[i];
                  const segmentDuration = segment.duration !== undefined ? segment.duration : 5;
                  const currentLine = segment.line || mtrRoute.route[i];
                  const destinationName = getMTRName(segment.to);
                  items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segment.distance, stops: segment.stops, to: destinationName });
                  currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                  const isInternalInterchange = i < mtrRoute.segmentDetails.length - 1;
                  const isFinalMTRPoint = i === mtrRoute.segmentDetails.length - 1;
                  if (isInternalInterchange) {
                      const nextSegment = mtrRoute.segmentDetails[i+1];
                      const nextLine = nextSegment.line || mtrRoute.route[i+1];
                      items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine });
                      currentTime.setMinutes(currentTime.getMinutes() + MTR_INTERCHANGE_DELAY_MIN);
                  } else if (isFinalMTRPoint) {
                      items.push({ type: 'point', mode: 'MTR', name: destinationName, time: formatTime(currentTime), line: currentLine });
                  }
              }

             items.push({ type: 'segment', mode: 'Walk', duration: secondWalkTime, distance: walkFromMTRDist, to: boardingSecond });
             currentTime.setMinutes(currentTime.getMinutes() + secondWalkTime);
             items.push({ type: 'point', mode: 'Bus', name: boardingSecond, time: formatTime(currentTime), provider: secondBus.provider });

             items.push({ type: 'segment', mode: 'Bus', route: secondBus.route, direction: secondBus.direction, stops: secondBus.stopCount, duration: secondBusTime, distance: secondBus.distance, alightingStopName: alightingSecond, provider: secondBus.provider, waitTime: secondBusWait });
             currentTime.setMinutes(currentTime.getMinutes() + secondBusTime);
             items.push({ type: 'point', mode: 'Bus', name: alightingSecond, time: formatTime(currentTime), isEnd: true, provider: secondBus.provider });
         }

        return items;
    }

    // Generates HTML for a single Point item (Start, End, Interchange, Station)
    static generatePoint(item) {
        const classes = `timeline-item station-point ${item.isStart ? 'start-point' : ''} ${item.isEnd ? 'end-point' : ''} ${item.interchange ? 'interchange-point' : ''}`;
        let dataLine = 'unknown';
        if (item.mode === 'Bus') dataLine = (item.provider || 'bus').toUpperCase();
        else if (item.mode === 'Walk') dataLine = 'Walk';
        else if (item.mode === 'Taxi') dataLine = 'Taxi';
        else if (item.mode === 'MTR' && item.line) dataLine = item.line;
        const time = item.time || '--:--';
        let tag = '';
        if (item.isStart) tag = '<span class="tag from">From</span>';
        else if (item.isEnd) tag = '<span class="tag to">To</span>';
        else if (item.interchange) tag = '<span class="tag interchange">Change</span>';
        let lineAbbr = '', lineTagClass = '';
        if (item.mode === 'Bus') {
            lineAbbr = (item.provider || 'BUS').toUpperCase(); lineTagClass = (item.provider || 'bus').toLowerCase();
        } else if (item.mode === 'Walk') {
             lineAbbr = 'WALK'; lineTagClass = 'walk';
        } else if (item.mode === 'Taxi') {
            lineAbbr = 'TAXI'; lineTagClass = 'taxi';
        } else if (item.mode === 'MTR' && item.line) {
            lineAbbr = item.line; lineTagClass = item.line.toLowerCase();
        } else if (item.mode !== 'Walk') {
             lineAbbr = 'UKN'; lineTagClass = 'unknown';
        }
        let interchangeInfo = '';
        if (item.interchange && item.fromLine && item.toLine && LINE_NAMES[item.fromLine] && LINE_NAMES[item.toLine]) {
            const fromLineName = LINE_NAMES[item.fromLine].name || item.fromLine;
            const toLineName = LINE_NAMES[item.toLine].name || item.toLine;
             interchangeInfo = `<div class="interchange-info">Change from <span class="line-tag ${item.fromLine.toLowerCase()}">${item.fromLine}</span> ${fromLineName} to <span class="line-tag ${item.toLine.toLowerCase()}">${item.toLine}</span> ${toLineName}</div>`;
        } else if (item.interchange) {
            interchangeInfo = `<div class="interchange-info">Interchange</div>`;
        }
        const showTag = lineAbbr && lineAbbr !== 'unknown' && lineAbbr !== 'UKN';
        const tagHtml = showTag ? `<span class="line-tag ${lineTagClass}">${lineAbbr}</span>` : '';
        return `
            <div class="${classes}" data-line="${dataLine}">
                <div class="timeline-marker">
                    <div class="marker-time">${time}</div>
                    <div class="marker-icon"></div>
                </div>
                <div class="timeline-content">
                    <div class="station-name">${tag} ${item.name || 'Unknown Location'} ${tagHtml}</div>
                    ${interchangeInfo}
                </div>
            </div>
        `;
    }

    // Generates HTML for a single Segment item (Travel Leg)
    static generateSegment(item) {
         let dataLine = 'unknown';
         if (item.mode === 'Bus') dataLine = (item.provider || 'bus').toUpperCase();
         else if (item.mode === 'Walk') dataLine = 'Walk';
         else if (item.mode === 'Taxi') dataLine = 'Taxi';
         else if (item.mode === 'MTR' && item.lines && item.lines.length > 0) dataLine = item.lines[0];
        let distanceDisplay = '--', unit = 'km';
        if (typeof item.distance === 'number' && !isNaN(item.distance)) {
            if (item.mode === 'Walk' && item.distance < 1000) {
                distanceDisplay = `${Math.round(item.distance)}`; unit = 'm';
            } else if (item.distance >= 10) {
                distanceDisplay = `${(item.distance / 1000).toFixed(1)}`; unit = 'km';
            } else {
                 distanceDisplay = `${Math.round(item.distance)}`; unit = 'm';
            }
        }
        const distanceText = distanceDisplay !== '--' ? `${distanceDisplay}${unit}` : (item.mode === 'Walk' ? '~ <10m' : '-- km');
        let stopsDisplay = '';
        if (item.stops !== undefined && item.stops !== null && item.stops > 0) {
            stopsDisplay = `<span class="stops">${item.stops} stop${item.stops > 1 ? 's' : ''}</span>`;
        }
        const durationDisplay = Math.max(1, Math.round(item.duration || 1));
        const statsHtml = `<span class="stat-duration">~${durationDisplay} min</span><span class="stat-distance">${distanceText}</span>`;
        let detailsHtml = '';
        if (item.mode === 'MTR') {
            const lineName = (item.lines && item.lines.length === 1 && LINE_NAMES[item.lines[0]]) ? LINE_NAMES[item.lines[0]].name : (item.lines ? item.lines.join('/') : 'MTR');
            const lineTagClass = (item.lines && item.lines.length === 1) ? item.lines[0].toLowerCase() : 'unknown';
             const lineTagHtml = (item.lines && item.lines.length === 1) ? `<span class="line-tag ${lineTagClass}">${item.lines[0]}</span>` : '';
             detailsHtml = `<span class="line-name">${lineTagHtml} ${lineName}</span><span class="direction">Towards ${item.to || 'Next Stop'}</span>${stopsDisplay}`;
        } else if (item.mode === 'Bus') {
            const providerTagClass = (item.provider || 'bus').toLowerCase();
            const providerAbbr = (item.provider || 'BUS').toUpperCase();
            const providerTag = `<span class="line-tag ${providerTagClass}">${providerAbbr}</span>`;
            const waitTimeText = item.waitTime ? ` (Est. wait ~${Math.round(item.waitTime)} min)` : ''; // Optional wait time display
            detailsHtml = `<span class="line-name">${providerTag} Bus ${item.route || ''}</span><span class="direction">${item.direction || ''} direction${waitTimeText}</span><span class="alight">Alight at: ${item.alightingStopName || 'Next Stop'}</span>${stopsDisplay}`;
        } else if (item.mode === 'Walk') {
            detailsHtml = `<span class="line-name"><span class="line-tag walk">WALK</span> Walk</span><span class="direction">Towards ${item.to || 'Next Point'}</span>`;
        } else if (item.mode === 'Taxi') {
             detailsHtml = `<span class="line-name"><span class="line-tag taxi">TAXI</span> Taxi</span><span class="direction">Towards ${item.to || 'Destination'}</span>`;
        }
        // Apply 'walk-stats' class specifically for Walk segments if needed for CSS targeting
        const segmentStatsClass = item.mode === 'Walk' ? 'segment-stats walk-stats' : 'segment-stats';
        return `
            <div class="timeline-item" data-line="${dataLine}">
                <div class="timeline-marker">
                    <div class="marker-icon"></div>
                    <div class="${segmentStatsClass}">${statsHtml}</div>
                </div>
                <div class="timeline-content">
                    <div class="segment-details">${detailsHtml}</div>
                </div>
            </div>
        `;
    }



       static generate(route) {

        const items = this.getItems(route);

        if (!items || items.length === 0) {

            return '<div class="timeline"><div class="timeline-content" style="padding: 15px; color: #555;">No timeline details could be generated for this route.</div></div>';
        }


        let timelineHtml = '<div class="timeline">';

      
        items.forEach(item => {

            if (item.type === 'point') {
                timelineHtml += this.generatePoint(item);
            } else if (item.type === 'segment') {
                timelineHtml += this.generateSegment(item); 
            }
          
        });

        timelineHtml += '</div>';

 
        return timelineHtml;
    }

    static generateSegment(item) {
        let dataLine = item.mode === 'Bus' ? (item.provider || 'bus').toUpperCase() :
                       item.mode === 'Walk' ? 'Walk' :
                       item.mode === 'Taxi' ? 'Taxi' :
                       item.mode === 'MTR' && item.lines && item.lines.length > 0 ? item.lines[0] : 'unknown';

        let distanceDisplay = '--', unit = 'km';
        if (item.mode === 'Walk' && typeof item.distance === 'number' && !isNaN(item.distance)) {
            distanceDisplay = `${Math.round(item.distance)}`;
            unit = 'm';
        } else if ((item.mode === 'MTR' || item.mode === 'Bus' || item.mode === 'Taxi') && typeof item.distance === 'number' && !isNaN(item.distance)) {
            distanceDisplay = `${(item.distance / 1000).toFixed(1)}`;
            unit = 'km';
        }

        const distanceText = (distanceDisplay !== '--' || item.mode === 'Walk') ? `${distanceDisplay}${unit}` : '-- km';
        let stopsDisplay = item.stops !== undefined && item.stops !== null ? `<span class="stops">${item.stops} stops</span>` : '';
        const statsHtml = `<span class="stat-duration">~${Math.round(item.duration)} min</span><span class="stat-distance">${distanceText}</span>`;

        let detailsHtml = '';
        if (item.mode === 'MTR') {
            const lineName = (item.lines && item.lines.length === 1) ? LINE_NAMES[item.lines[0]]?.name || item.lines[0] : 'MTR';
            detailsHtml = `<span class="line-name">MTR: ${lineName}</span><span class="direction">To ${item.to}</span>${stopsDisplay}`;
        } else if (item.mode === 'Bus') {
            const providerTagClass = (item.provider || 'bus').toLowerCase();
            const providerAbbr = (item.provider || 'BUS').toUpperCase();
            const providerTag = `<span class="line-tag ${providerTagClass}">${providerAbbr}</span>`;
            detailsHtml = `<span class="line-name">${providerTag} Bus ${item.route} (${item.direction})</span><span class="direction">Alight at ${item.alightingStopName}</span>${stopsDisplay}`;
        } else if (item.mode === 'Walk') {
            detailsHtml = `<span class="line-name">Walk</span><span class="direction">To ${item.to}</span>`;
        } else if (item.mode === 'Taxi') {
            detailsHtml = `<span class="line-name">Taxi</span><span class="direction">To ${item.to}</span>`;
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
        if (typeof lines === 'undefined') return code;
        const station = Object.values(lines).flat().find(s => s.value === code);
        return station ? station.text : code;
    }

    static getDefaultInterchange(line1, line2) {
        if (typeof interchangeStations === 'undefined') return 'UKN';
        const key1 = `${line1}_${line2}`;
        const key2 = `${line2}_${line1}`;
        return interchangeStations[key1] || interchangeStations[key2] || 'UKN';
    }
}

let currentRoutes = [];
let mtrStations = [];

function getRouteSequenceTags(route) {
    const items = TimelineGenerator.getItems(route);
    const sequenceTags = [];
    let lastTagInfo = null;

    items.forEach(item => {
        let currentTag = null, currentMode = item.mode, tagClass = '';
        if (item.type === 'point' && item.isStart) {
            if (item.mode === 'Bus') {
                currentTag = item.provider?.toUpperCase() || 'BUS';
                tagClass = item.provider?.toLowerCase() || 'bus';
            } else if (item.mode === 'MTR' && item.line) {
                currentTag = item.line;
                tagClass = item.line.toLowerCase();
            } else if (item.mode === 'Walk') {
                currentTag = 'Walk';
                tagClass = 'walk';
            } else if (item.mode === 'Taxi') {
                currentTag = 'Taxi';
                tagClass = 'taxi';
            }
        } else if (item.type === 'segment') {
            if (item.mode === 'Bus') {
                currentTag = item.provider?.toUpperCase() || 'BUS';
                tagClass = item.provider?.toLowerCase() || 'bus';
            } else if (item.mode === 'Walk') {
                currentTag = 'Walk';
                tagClass = 'walk';
            } else if (item.mode === 'Taxi') {
                currentTag = 'Taxi';
                tagClass = 'taxi';
            } else if (item.mode === 'MTR' && item.lines && item.lines[0]) {
                currentTag = item.lines[0];
                tagClass = item.lines[0].toLowerCase();
            }
        } else if (item.type === 'point' && item.interchange && item.toLine) {
            currentTag = item.toLine;
            tagClass = item.toLine.toLowerCase();
            currentMode = 'MTR';
        }

        const currentTagInfo = currentTag ? { tag: currentTag, mode: currentMode, cssClass: tagClass } : null;
        let addThisTag = false;
        if (currentTagInfo) {
            if (!lastTagInfo) {
                addThisTag = true;
            } else if (currentTagInfo.tag !== lastTagInfo.tag || currentTagInfo.mode !== lastTagInfo.mode) {
                if (!(currentTagInfo.mode === 'MTR' && lastTagInfo.mode === 'MTR' && item.type === 'point' && items[items.indexOf(item) - 1]?.type !== 'segment' && items[items.indexOf(item) - 1]?.mode !== 'Walk')) {
                    addThisTag = true;
                } else if (currentTagInfo.tag !== lastTagInfo.tag) {
                    addThisTag = true;
                }
            }
        }

        if (addThisTag && (sequenceTags.length === 0 || sequenceTags[sequenceTags.length - 1].tag !== currentTagInfo.tag)) {
            sequenceTags.push(currentTagInfo);
            lastTagInfo = currentTagInfo;
        }
    });

    const lastItem = items[items.length - 1];
    if (sequenceTags.length > 0 && sequenceTags[sequenceTags.length - 1].tag === 'Walk' && lastItem?.mode !== 'Walk') {
        sequenceTags.pop();
    }

    sequenceTags.push({ tag: 'Arrived', cssClass: 'arrived' });
    return sequenceTags;
}

function generateDetailedSequenceHtml(route) {
    const items = TimelineGenerator.getItems(route);
    let sequenceHtml = '';
    let lastAddedType = null;

    items.forEach((item, index) => {
        if (item.type === 'point') {
            if (item.isStart) {
                let startTag = null, startTagClass = '';
                if (item.mode === 'Bus') {
                    startTag = item.provider?.toUpperCase() || 'BUS';
                    startTagClass = `line-tag ${item.provider?.toLowerCase() || 'bus'}`;
                } else if (item.mode === 'MTR' && item.line) {
                    startTag = item.line;
                    startTagClass = `line-tag ${item.line.toLowerCase()}`;
                } else if (item.mode === 'Taxi') {
                    startTag = 'Taxi';
                    startTagClass = 'line-tag taxi';
                }
                if (startTag) {
                    sequenceHtml += `<span class="sequence-item ${startTagClass}">${startTag}</span>`;
                    lastAddedType = 'tag';
                }
            }

            if (lastAddedType === 'tag' && (!item.isStart || sequenceHtml === '')) {
                sequenceHtml += `<span class="sequence-station-name">${item.name}</span>`;
                lastAddedType = 'station';
            } else if (item.interchange || item.isEnd || (item.mode === 'Bus' && !item.isStart)) {
                const prevItem = items[index - 1];
                if (prevItem && prevItem.type === 'segment' && lastAddedType !== 'station') {
                    sequenceHtml += `<span class="sequence-station-name">${item.name}</span>`;
                    lastAddedType = 'station';
                } else if (item.isEnd && lastAddedType !== 'station') {
                    sequenceHtml += `<span class="sequence-station-name">${item.name}</span>`;
                    lastAddedType = 'station';
                }
            }

            if (lastAddedType === 'station' && !item.isEnd) {
                let nextTag = null, nextTagClass = '';
                const nextSegment = items.find((seg, segIdx) => seg.type === 'segment' && segIdx > index);
                if (item.interchange && item.toLine) {
                    nextTag = item.toLine;
                    nextTagClass = `line-tag ${item.toLine.toLowerCase()}`;
                } else if (nextSegment) {
                    if (nextSegment.mode === 'Bus') {
                        nextTag = nextSegment.provider?.toUpperCase() || 'BUS';
                        nextTagClass = `line-tag ${nextSegment.provider?.toLowerCase() || 'bus'}`;
                    } else if (nextSegment.mode === 'Walk') {
                        nextTag = 'Walk';
                        nextTagClass = 'line-tag walk';
                    } else if (nextSegment.mode === 'Taxi') {
                        nextTag = 'Taxi';
                        nextTagClass = 'line-tag taxi';
                    } else if (nextSegment.mode === 'MTR' && nextSegment.lines && nextSegment.lines[0]) {
                        nextTag = nextSegment.lines[0];
                        nextTagClass = `line-tag ${nextSegment.lines[0].toLowerCase()}`;
                    }
                }
                if (nextTag) {
                    sequenceHtml += `<span class="sequence-item ${nextTagClass}">${nextTag}</span>`;
                    lastAddedType = 'tag';
                }
            }
        }
    });

    sequenceHtml += `<span class="sequence-item arrived">Arrived</span>`;
    return sequenceHtml;
}

function displayRouteSummaries() {
    const optionsDiv = document.getElementById('route-options');
    optionsDiv.innerHTML = '';
    const now = new Date();
    const routesToDisplay = currentRoutes.slice(0, 5);

    routesToDisplay.forEach((route, i) => {
        const startTime = now.toTimeString().slice(0, 5);
        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);
        const items = TimelineGenerator.getItems(route);
        let transfers = 0;
        items.forEach(item => { if (item.interchange || (item.mode === 'Walk' && item.type === 'segment')) transfers++; });

        let sequenceHtml = generateDetailedSequenceHtml(route);
        const fareDisplay = route.type === 'Taxi' ? `$${route.fare}` : 'N/A';
        const summaryHtml = `
            <div class="route-summary-option" data-route-index="${i}">
                <div class="summary-header">
                    <div class="summary-time">
                        <span class="time-departure">${startTime}</span>
                        <span class="arrow">→</span>
                        <span class="time-arrival">${arrivalTime}</span>
                        <span class="duration">(${Math.round(route.estimatedTime)} mins)</span>
                    </div>
                    <div class="summary-tags"></div>
                </div>
                <div class="summary-details">
                    <span class="detail-item fare">Fare: ${fareDisplay}</span>
                    <span class="detail-item transfers">~${transfers} Transfers</span>
                </div>
                <div class="summary-sequence">
                    ${sequenceHtml}
                </div>
            </div>
        `;
        optionsDiv.innerHTML += summaryHtml;
    });

    showSummaries();
}

function displayRouteDetails(routeIndex) {
    const scheduleDiv = document.getElementById('schedule');
    const optionsDiv = document.getElementById('route-options');
    const backdrop = document.getElementById('details-backdrop');
    const selectedRoute = currentRoutes[routeIndex];
    if (!selectedRoute) return;

    scheduleDiv.innerHTML = '';
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);
    const arrivalTime = new Date(now.getTime() + selectedRoute.estimatedTime * 60000).toTimeString().slice(0, 5);
    const items = TimelineGenerator.getItems(selectedRoute);
    let transfers = 0;
    items.forEach(item => { if (item.interchange || (item.mode === 'Walk' && item.type === 'segment')) transfers++; });
    const fareDisplay = selectedRoute.type === 'Taxi' ? `$${selectedRoute.fare}` : 'N/A';
    const headerHtml = `
        <div class="route-header">
            <div class="time-info">
                ${startTime} → ${arrivalTime}
                <span class="duration">(${Math.round(selectedRoute.estimatedTime)} mins)</span>
            </div>
            <div class="cost-transfers">
                <div class="fare">Fare: ${fareDisplay}</div>
                <div class="transfers">${transfers} Transfers</div>
            </div>
        </div>
    `;
    const timelineHtml = TimelineGenerator.generate(selectedRoute);

    const routeContainer = document.createElement('div');
    routeContainer.className = 'route-container';
    routeContainer.innerHTML = headerHtml + timelineHtml;
    scheduleDiv.appendChild(routeContainer);

    optionsDiv.style.display = 'none';
    scheduleDiv.style.display = 'block';
    if (backdrop) backdrop.style.display = 'block';
}

function showSummaries() {
    const scheduleDiv = document.getElementById('schedule');
    const optionsDiv = document.getElementById('route-options');
    const backdrop = document.getElementById('details-backdrop');

    if (scheduleDiv) {
        scheduleDiv.style.display = 'none';
        scheduleDiv.innerHTML = '';
    }
    if (optionsDiv) optionsDiv.style.display = 'block';
    if (backdrop) backdrop.style.display = 'none';
}

function getUniqueMTRStations() {
    if (typeof lines === 'undefined') {
        console.error("Stations.js not loaded or 'lines' undefined");
        return [];
    }
    const stationSet = new Set();
    const uniqueStations = [];
    Object.values(lines).flat().forEach(station => {
        if (station && station.value && !stationSet.has(station.value)) {
            stationSet.add(station.value);
            const lat = parseFloat(station.lat);
            const long = parseFloat(station.long);
            uniqueStations.push({
                ...station,
                lat: !isNaN(lat) ? lat : null,
                long: !isNaN(long) ? long : null
            });
        }
    });
    console.log("Loaded MTR stations:", uniqueStations.length);
    return uniqueStations;
}
window.onload = async () => {
    let sortByTimeDirection = 'asc'; // 'asc' or 'desc'
    let sortByWalkDirection = 'asc';
    const sortByTimeBtn = document.getElementById('sortByTime');
    if (sortByTimeBtn) {
        sortByTimeBtn.addEventListener('click', () => {
            sortByTimeDirection = sortByTimeDirection === 'asc' ? 'desc' : 'asc';
            currentRoutes.sort((a, b) => {
                const timeA = a.estimatedTime || Infinity;
                const timeB = b.estimatedTime || Infinity;
                return sortByTimeDirection === 'asc' ? timeA - timeB : timeB - timeA;
            });
            displayRouteSummaries();
            // Optional: Update button text or style to reflect sort direction
            sortByTimeBtn.textContent = `Sort by Time (${sortByTimeDirection === 'asc' ? '↑' : '↓'})`;
        });
    } else {
        console.warn("Sort by Time button not found in DOM");
    }
    const sortByWalkBtn = document.getElementById('sortByWalk');
    if (sortByWalkBtn) {
        sortByWalkBtn.addEventListener('click', () => {
            sortByWalkDirection = sortByWalkDirection === 'asc' ? 'desc' : 'asc';
            const getTotalWalk = (route) => route.walkingDistance || 0;
            currentRoutes.sort((a, b) => {
                const walkA = getTotalWalk(a);
                const walkB = getTotalWalk(b);
                return sortByWalkDirection === 'asc' ? walkA - walkB : walkB - walkA;
            });
            displayRouteSummaries();
            // Optional: Update button text or style
            sortByWalkBtn.textContent = `Sort by Walk (${sortByWalkDirection === 'asc' ? '↑' : '↓'})`;
        });
    } else {
        console.warn("Sort by Walk button not found in DOM");
    }
    const params = new URLSearchParams(window.location.search);
    const cs = params.get('currentStation');
    const ds = params.get('destinationStation');
    const sbs = params.get('startBusStop');
    const ebs = params.get('endBusStop');
    const MAX_ACCEPTABLE_INTERCHANGES = 2;
    if (mtrStations.length === 0) {
        mtrStations = getUniqueMTRStations();
    }
    const finder = new RouteFinder(transit, mtrStations);
    const requiresBusData = sbs || ebs;
    if (requiresBusData && transit.stops.length === 0) {
        document.getElementById('route-options').innerHTML = `
            <div class="no-routes-container">
                <h2>No Routes Available</h2>
                <p>Bus stop data is not loaded from local storage. Please start from the route planner page.</p>
                <button class="back-button" onclick="window.location.href='route_planner.html'">Try Again</button>
            </div>`;
        return;
    }
    document.getElementById('route-options').innerHTML = '<div class="loading">Finding routes...</div>';
    document.getElementById('schedule').style.display = 'none';
    document.getElementById('route-options').style.display = 'block';
    try {
        if (cs && ds && !sbs && !ebs) {
            currentRoutes = await finder.findMTRRoute(cs, ds);
        } else if (sbs && ebs && !cs && !ds) {
            currentRoutes = await finder.findBusToBusRoute(sbs, ebs);
        } else if (sbs && ds && !cs && !ebs) {
            currentRoutes = await finder.findMixedRoute(sbs, ds, 'bus', 'mtr');
        } else if (cs && ebs && !sbs && !ds) {
            currentRoutes = await finder.findMixedRoute(cs, ebs, 'mtr', 'bus');
        } else {
            document.getElementById('route-options').innerHTML = `
                <div class="no-routes-container">
                    <h2>No Routes Available</h2>
                    <p>Invalid combination of start and end points. Please select a valid pair of locations.</p>
                    <button class="back-button" onclick="window.location.href='route_planner.html'">Try Again</button>
                </div>`;
            return;
        }
        const validRoutes = currentRoutes.filter(route => {
            const items = TimelineGenerator.getItems(route);
            let transfers = 0;
            items.forEach(item => {
                if (item.interchange || (item.mode === 'Walk' && item.type === 'segment')) transfers++;
            });
            return transfers <= MAX_ACCEPTABLE_INTERCHANGES;
        });
        currentRoutes = validRoutes.length > 0 ? validRoutes : currentRoutes;
    } catch (error) {
        document.getElementById('route-options').innerHTML = `
            <div class="no-routes-container">
                <h2>Error Finding Routes</h2>
                <p>An unexpected error occurred while searching for routes. Please try again later.</p>
                <button class="back-button" onclick="window.location.href='route_planner.html'">Back to Planner</button>
            </div>`;
        return;
    }
    if (!currentRoutes.length) {
        const startStop = sbs ? transit.findStop(sbs)?.name_en || `Stop ${sbs}` : cs;
        const endStop = ebs ? transit.findStop(ebs)?.name_en || `Stop ${ebs}` : ds;
        document.getElementById('route-options').innerHTML = `
            <div class="no-routes-container">
                <h2>No Public Transit Routes Found</h2>
                <p>We couldn’t find any public transit routes from <strong>${startStop}</strong> to <strong>${endStop}</strong>.</p>
                <button class="back-button" onclick="window.location.href='route_planner.html'">Try Different Locations</button>
            </div>`;
        return;
    }
    currentRoutes.sort((a, b) => (a.score || Infinity) - (b.score || Infinity));
    displayRouteSummaries();
    document.getElementById('sortByTime')?.addEventListener('click', () => {
        currentRoutes.sort((a, b) => (a.estimatedTime || Infinity) - (b.estimatedTime || Infinity));
        displayRouteSummaries();
    });
    document.getElementById('sortByWalk')?.addEventListener('click', () => {
        const getTotalWalk = (route) => route.walkingDistance || 0;
        currentRoutes.sort((a, b) => getTotalWalk(a) - getTotalWalk(b));
        displayRouteSummaries();
    });
    document.getElementById('route-options').addEventListener('click', (event) => {
        const summaryElement = event.target.closest('.route-summary-option');
        if (summaryElement) {
            const routeIndex = parseInt(summaryElement.dataset.routeIndex, 10);
            if (!isNaN(routeIndex) && routeIndex >= 0 && routeIndex < currentRoutes.length) {
                displayRouteDetails(routeIndex);
            }
        }
    });
    const backdrop = document.getElementById('details-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', showSummaries);
    }
};