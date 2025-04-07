// 1. Constants and Utilities
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
    // Add Bus Providers for Tag Consistency if needed
    "KMB": { name: "KMB", color: "#FF0000"},
    "CTB": { name: "CityBus", color: "#FFD700"}, // Assuming CTB for CityBus
    "Walk": { name: "Walk", color: "#888"}
};



function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0; // Handle null coords
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const calculateWalkDuration = distance => Math.max(1, Math.round((distance / 5000) * 60)); // Ensure at least 1 min for short walks
class TransitData {
    constructor() {
        this.routes = [];
        this.stops = [];
        this.routeStopsMap = {};
        this.stopMap = new Map(); // Added for O(1) stop lookups
        this.cumulativeDistancesMap = {}; // Added for precomputed distances
        this.loadData();
    }

    loadData() {
        const kmbRoutes = JSON.parse(localStorage.getItem('kmb_allRoutes') || '[]');
        const citybusRoutes = JSON.parse(localStorage.getItem('citybus_allRoutes') || '[]');
        this.routes = [...kmbRoutes, ...citybusRoutes];

        const kmbStops = JSON.parse(localStorage.getItem('kmb_allStops') || '[]');
        const citybusStops = JSON.parse(localStorage.getItem('citybus_allStops') || '[]');
        this.stops = [...kmbStops, ...citybusStops];

        const kmbRouteStops = JSON.parse(localStorage.getItem('kmb_routeStopsMap') || '{}');
        const citybusRouteStops = JSON.parse(localStorage.getItem('citybus_routeStopsMap') || '{}');
        this.routeStopsMap = { ...kmbRouteStops, ...citybusRouteStops };

        // Populate stopMap
        this.stops.forEach(stop => {
            this.stopMap.set(String(stop.stop), stop);
        });

        // Precompute cumulative distances
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
        return this.stopMap.get(String(stopId)) || null; // O(1) lookup
    }

    getNearbyStops(point, radius = 500) {
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

        // Precompute nearest MTR for each bus stop
        this.stopToNearestMTR = new Map();
        for (const stop of this.transit.stops) {
            if (stop.lat && stop.long) {
                const nearest = this.findNearestMTR(stop);
                this.stopToNearestMTR.set(stop.stop, nearest);
            }
        }
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
        return cumulative[endIndex] - cumulative[startIndex]; // O(1) calculation
    }

    findBusRoutes(startStopIds, endStopIds, provider) {
        const routes = [];
        // Ensure IDs are strings for comparison
        const startIdsSet = new Set(startStopIds.map(String));
        const endIdsSet = new Set(endStopIds.map(String));

        const filteredRoutes = provider ? this.transit.routes.filter(r => r.provider === provider) : this.transit.routes;

        for (const route of filteredRoutes) {
            if (!route.route) continue; // Skip routes without a route number/code
            for (const direction of ['outbound', 'inbound']) {
                const key = `${route.route}-${direction === 'outbound' ? 'O' : 'I'}`;
                const stops = this.transit.routeStopsMap[key] || [];
                if (!stops || stops.length === 0) continue;

                const stopStrings = stops.map(String); // Work with string IDs

                // Find first matching start stop and its index
                let boardingStopId = null;
                let boardingIndex = -1;
                for (let i = 0; i < stopStrings.length; i++) {
                    if (startIdsSet.has(stopStrings[i])) {
                        boardingStopId = stopStrings[i];
                        boardingIndex = i;
                        break;
                    }
                }

                if (boardingIndex === -1) continue; // No start stop found on this route/direction

                // Find the *closest* valid end stop *after* the boarding stop
                let alightingStopId = null;
                let alightingIndex = -1;
                for (let i = boardingIndex + 1; i < stopStrings.length; i++) {
                    if (endIdsSet.has(stopStrings[i])) {
                        alightingStopId = stopStrings[i];
                        alightingIndex = i;
                        break; // Found the first valid end stop
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
                        distance: distance // Add calculated distance (meters)
                    });
                }
            }
        }
        return routes;
    }async findMixedRoute(start, end, startType, endType) {
        const routes = [];
        let startPoint = startType === 'bus' ? this.transit.findStop(start) : this.mtrStations.find(s => s.value === start);
        let endPoint = endType === 'bus' ? this.transit.findStop(end) : this.mtrStations.find(s => s.value === end);
    
        // Validate start and end points
        if (!startPoint || !endPoint) {
            console.error('Invalid start or end point:', start, end);
            document.getElementById('schedule').innerHTML = '<div class="error">Invalid start or end point selected.</div>';
            return routes;
        }
    
        const provider = startType === 'bus' ? startPoint?.provider : (endType === 'bus' ? endPoint?.provider : null);
    
        if (startType === 'bus' && endType === 'mtr') {
            // Existing Bus-to-MTR logic remains unchanged
            // ...
        } else if (startType === 'mtr' && endType === 'bus') {
            // Step 1: Find the nearest MTR station to the target bus stop
            const nearestMTRToTarget = this.stopToNearestMTR.get(endPoint.stop);
            if (!nearestMTRToTarget?.station || nearestMTRToTarget.distance > 1000) {
                console.warn('No suitable nearby MTR station found for end bus stop:', endPoint.stop);
                return routes;
            }
    
            // Step 2: Fetch MTR route from start to the interchange MTR station
            const mtrResponse = await this.fetchMTRSchedule(start, nearestMTRToTarget.station.value);
            if (mtrResponse.error || !mtrResponse.bestRoute) {
                console.error('MTR schedule fetch failed for MTR-to-Bus leg:', start, '->', nearestMTRToTarget.station.value);
                return routes;
            }
    
            // Calculate MTR travel time and walking time
            const mtrTime = this.calculateMTRTime(mtrResponse.bestRoute);
            const walkTime = calculateWalkDuration(nearestMTRToTarget.distance);
    
            // Step 3: Find bus stops near the interchange MTR station
            const nearbyBusStopsAtInterchange = this.transit.getNearbyStops(nearestMTRToTarget.station, 1500).map(s => s.stop);
            
    
            // Step 4: Find bus routes from nearby bus stops to the target bus stop
            const finalBusStopIdArray = [endPoint.stop];
            const busRoutes = this.findBusRoutes(nearbyBusStopsAtInterchange, finalBusStopIdArray, provider);
    
            // Step 5: Construct the mixed MTR-to-Bus routes
            busRoutes.forEach(busRoute => {
                const busTime = busRoute.stopCount * 2; // Rough estimate: 2 minutes per stop
                routes.push({
                    type: 'MTR-to-Bus',
                    mtrRoute: mtrResponse.bestRoute,
                    busRoute,
                    walkingDistance: nearestMTRToTarget.distance,
                    estimatedTime: mtrTime + walkTime + busTime,
                    schedules: mtrResponse.schedules,
                    currentStation: start,
                    interchangeStation: nearestMTRToTarget.station.value
                });
            });
        }
    
        return routes;
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
            // Use time from response if available, otherwise estimate
            estimatedTime: response.bestRoute.totalDuration || this.calculateMTRTime(response.bestRoute),
            schedules: response.schedules,
            currentStation: start,
            destinationStation: end
        }];
    }findBusRoutes(startStopIds, endStopIds, provider) {
        const routes = [];
        const startIdsSet = new Set(startStopIds.map(String));
        const endIdsSet = new Set(endStopIds.map(String));
        const filteredRoutes = provider ? this.transit.routes.filter(r => r.provider === provider) : this.transit.routes;

        for (const route of filteredRoutes) {
            if (!route.route) continue;
            for (const direction of ['outbound', 'inbound']) {
                const key = `${route.route}-${direction === 'outbound' ? 'O' : 'I'}`;
                const stops = this.transit.routeStopsMap[key] || [];
                if (!stops.length) continue;

                const stopStrings = stops.map(String);
                let boardingStopId = null;
                let boardingIndex = -1;
                for (let i = 0; i < stopStrings.length; i++) {
                    if (startIdsSet.has(stopStrings[i])) {
                        boardingStopId = stopStrings[i];
                        boardingIndex = i;
                        break;
                    }
                }
                if (boardingIndex === -1) continue;

                let alightingStopId = null;
                let alightingIndex = -1;
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
                        distance
                    });
                }
            }
        }
        return routes;
    }
    findNearestMTR(point) {
        // Kept for precomputation; could be removed from runtime use if fully replaced by stopToNearestMTR
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
        if (distance === 0) {
            return { distance: 0, duration: 0 };
        }

        // Duration = Distance (m) / Speed (m/s) -> seconds, then convert to minutes
        const durationSeconds = distance / this.MTR_AVG_SPEED_MS;
        const durationMinutes = Math.max(1, Math.round(durationSeconds / 60)); // Ensure at least 1 min

        return { distance: Math.round(distance), duration: durationMinutes };
    }

    async fetchMTRSchedule(from, to) {
        if (!from || !to) {
            return { error: 'Missing MTR station code(s)', bestRoute: null };
        }
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
           const keyStations = [from, ...(route.interchanges || []), to]; // Sequence of key points
           const uniqueKeyStations = keyStations.filter((station, index, arr) => index === 0 || station !== arr[index - 1]);
           
           for (let i = 0; i < uniqueKeyStations.length - 1; i++) {
            const segmentStart = uniqueKeyStations[i];
            const segmentEnd = uniqueKeyStations[i + 1];
            const details = this.calculateMTRSegmentDetails(segmentStart, segmentEnd);
            route.segmentDetails.push({
                from: segmentStart,
                to: segmentEnd,
                line: route.route[i], // Assumes route array aligns with segments between key stations
                distance: details.distance,
                duration: details.duration,
                // We cannot calculate intermediate stops from coordinates alone
                stops: route.segmentDetails?.[i]?.stops ?? undefined // Keep if backend provided stops
            });
            if (details.duration !== undefined) {
                 calculatedTotalDuration += details.duration;
                 // Add interchange delay if this segment ended at an interchange (not the final destination)
                 if (i < uniqueKeyStations.length - 2) {
                     calculatedTotalDuration += this.MTR_INTERCHANGE_DELAY_MIN;
                 }
            } else {
                // Handle cases where calculation failed - maybe fall back to rough estimate for this segment?
                calculatedTotalDuration += 5; // Add a small default if calculation fails
                console.warn(`Using default duration for segment ${segmentStart} -> ${segmentEnd} due to calculation issue.`);
            }
        }
            return data;
        } catch (e) {
            console.error('MTR Fetch Error:', e);
            return { error: 'Could not connect to MTR schedule service', bestRoute: null };
        }
    }
    

    calculateMTRTime(route) {
        // PRIORITIZE time from backend if available
        if (route?.totalDuration) {
            return route.totalDuration;
        }
        // Fallback estimation (VERY ROUGH)
        if (!route || !route.route) return 0;
        const interchangeCount = route.interchanges?.length || (route.route.length > 1 ? route.route.length - 1 : 0);
        const lineTimeEstimate = route.route.length * 3; // Guess ~3 mins per line segment ride
        const interchangeTimeEstimate = interchangeCount * 5; // Guess 5 mins per change
        return lineTimeEstimate + interchangeTimeEstimate;
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
        let currentTime = new Date(now);
        const items = [];
        const formatTime = (dateObj) => dateObj.toTimeString().slice(0, 5);
        const interchangeDelay = 5; // Minutes assumed for interchange

        // Helper to get segment duration, prioritizing detailed data
        const getSegmentDuration = (segmentData, defaultEstimate) => {
            return segmentData?.duration || defaultEstimate;
        };

        // Helper to get total MTR time, prioritizing detailed data
        const getMtrTotalTime = (mtrRouteData, estimate) => {
            if (mtrRouteData?.totalDuration) return mtrRouteData.totalDuration;
            if (mtrRouteData?.segmentDetails) {
                return mtrRouteData.segmentDetails.reduce((sum, seg) => sum + (seg.duration || 0), 0) +
                       (mtrRouteData.interchanges?.length || 0) * interchangeDelay;
            }
            return estimate; // Fallback to rough estimate
        };


        if (route.type === 'MTR') {
            const mtrRoute = route.mtrRoute;
            const totalMtrTime = getMtrTotalTime(mtrRoute, route.estimatedTime);
            let remainingMtrTime = totalMtrTime;

            items.push({ type: 'point', mode: 'MTR', name: this.getMTRName(route.currentStation), time: formatTime(currentTime), isStart: true, line: mtrRoute.route[0] });

            for (let i = 0; i < mtrRoute.route.length; i++) {
                const currentLine = mtrRoute.route[i];
                const segmentDetail = mtrRoute.segmentDetails?.[i]; // Get specific segment data if available

                // Estimate duration if not provided
                const estimatedSegmentDuration = Math.max(1, Math.round(remainingMtrTime / (mtrRoute.route.length - i))); // Proportional guess
                const segmentDuration = getSegmentDuration(segmentDetail, estimatedSegmentDuration);

                const segmentDistance = segmentDetail?.distance; // Meters
                const segmentStops = segmentDetail?.stops;

                if (i < mtrRoute.route.length - 1) {
                    const nextLine = mtrRoute.route[i+1];
                    const interchangeStationValue = mtrRoute.interchanges?.[i] || this.getDefaultInterchange(currentLine, nextLine);
                    const interchangeStationName = this.getMTRName(interchangeStationValue);

                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segmentDistance, stops: segmentStops, to: interchangeStationName });
                    currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                    remainingMtrTime -= segmentDuration;

                    items.push({ type: 'point', mode: 'MTR', name: interchangeStationName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine }); // Use departing line
                    currentTime.setMinutes(currentTime.getMinutes() + interchangeDelay);
                    remainingMtrTime -= interchangeDelay;

                } else { // Last segment
                    const finalDuration = Math.max(0, remainingMtrTime); // Use what's left
                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: finalDuration, distance: segmentDistance, stops: segmentStops, to: this.getMTRName(route.destinationStation) });
                    currentTime.setMinutes(currentTime.getMinutes() + finalDuration);
                }
            }
            items.push({ type: 'point', mode: 'MTR', name: this.getMTRName(route.destinationStation), time: formatTime(currentTime), isEnd: true, line: mtrRoute.route[mtrRoute.route.length - 1] });

        } else if (route.type === 'Bus-to-MTR') {
            const busRoute = route.busRoute;
            const mtrRoute = route.mtrRoute;
            const boardingStopInfo = transit.findStop(busRoute.boardingStop);
            const alightingStopInfo = transit.findStop(busRoute.alightingStop);
            const boardingStopName = boardingStopInfo?.name_en || `Stop ${busRoute.boardingStop}`;
            const alightingStopName = alightingStopInfo?.name_en || `Stop ${busRoute.alightingStop}`;

            const busTime = busRoute.stopCount * 2; // Estimate
            const walkTime = calculateWalkDuration(route.walkingDistance);
            const mtrEstimate = route.estimatedTime - busTime - walkTime;
            const mtrTotalTime = getMtrTotalTime(mtrRoute, mtrEstimate);
            let remainingMtrTime = mtrTotalTime;

            items.push({ type: 'point', mode: 'Bus', name: boardingStopName, time: formatTime(currentTime), isStart: true, provider: busRoute.provider });
            items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTime, distance: busRoute.distance, alightingStopName: alightingStopName, provider: busRoute.provider });
            currentTime.setMinutes(currentTime.getMinutes() + busTime);
            items.push({ type: 'point', mode: 'Bus', name: alightingStopName, time: formatTime(currentTime), provider: busRoute.provider });

            const interchangeMTRStationName = this.getMTRName(route.interchangeStation);
            items.push({ type: 'segment', mode: 'Walk', duration: walkTime, distance: route.walkingDistance, to: interchangeMTRStationName });
            currentTime.setMinutes(currentTime.getMinutes() + walkTime);
            items.push({ type: 'point', mode: 'MTR', name: interchangeMTRStationName, time: formatTime(currentTime), line: mtrRoute.route[0] }); // Arriving at MTR

             for (let i = 0; i < mtrRoute.route.length; i++) {
                const currentLine = mtrRoute.route[i];
                const segmentDetail = mtrRoute.segmentDetails?.[i];
                const estimatedSegmentDuration = Math.max(1, Math.round(remainingMtrTime / (mtrRoute.route.length - i)));
                const segmentDuration = getSegmentDuration(segmentDetail, estimatedSegmentDuration);
                const segmentDistance = segmentDetail?.distance;
                const segmentStops = segmentDetail?.stops;

                if (i < mtrRoute.route.length - 1) {
                    const nextLine = mtrRoute.route[i+1];
                    const nextInterchangeValue = mtrRoute.interchanges?.[i] || this.getDefaultInterchange(currentLine, nextLine);
                    const nextInterchangeName = this.getMTRName(nextInterchangeValue);

                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segmentDistance, stops: segmentStops, to: nextInterchangeName });
                    currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                    remainingMtrTime -= segmentDuration;
                    items.push({ type: 'point', mode: 'MTR', name: nextInterchangeName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine }); // Departing line
                    currentTime.setMinutes(currentTime.getMinutes() + interchangeDelay);
                    remainingMtrTime -= interchangeDelay;
                } else {
                    const finalMtrDuration = Math.max(0, remainingMtrTime);
                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: finalMtrDuration, distance: segmentDistance, stops: segmentStops, to: this.getMTRName(route.destinationStation) });
                    currentTime.setMinutes(currentTime.getMinutes() + finalMtrDuration);
                }
            }
            items.push({ type: 'point', mode: 'MTR', name: this.getMTRName(route.destinationStation), time: formatTime(currentTime), isEnd: true, line: mtrRoute.route[mtrRoute.route.length - 1] });

        } else if (route.type === 'MTR-to-Bus') {
            const mtrRoute = route.mtrRoute;
            const busRoute = route.busRoute;
            const boardingStopInfo = transit.findStop(busRoute.boardingStop);
            const alightingStopInfo = transit.findStop(busRoute.alightingStop);
            const boardingStopName = boardingStopInfo?.name_en || `Stop ${busRoute.boardingStop}`;
            const alightingStopName = alightingStopInfo?.name_en || `Stop ${busRoute.alightingStop}`;

            const busTime = busRoute.stopCount * 2; // Estimate
            const walkTime = calculateWalkDuration(route.walkingDistance);
            const mtrEstimate = route.estimatedTime - busTime - walkTime;
            const mtrTotalTime = getMtrTotalTime(mtrRoute, mtrEstimate);
            let remainingMtrTime = mtrTotalTime;

            items.push({ type: 'point', mode: 'MTR', name: this.getMTRName(route.currentStation), time: formatTime(currentTime), isStart: true, line: mtrRoute.route[0] });

            for (let i = 0; i < mtrRoute.route.length; i++) {
                const currentLine = mtrRoute.route[i];
                const segmentDetail = mtrRoute.segmentDetails?.[i];
                const estimatedSegmentDuration = Math.max(1, Math.round(remainingMtrTime / (mtrRoute.route.length - i)));
                const segmentDuration = getSegmentDuration(segmentDetail, estimatedSegmentDuration);
                const segmentDistance = segmentDetail?.distance;
                const segmentStops = segmentDetail?.stops;

                if (i < mtrRoute.route.length - 1) {
                    const nextLine = mtrRoute.route[i+1];
                    const nextInterchangeValue = mtrRoute.interchanges?.[i] || this.getDefaultInterchange(currentLine, nextLine);
                    const nextInterchangeName = this.getMTRName(nextInterchangeValue);

                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: segmentDuration, distance: segmentDistance, stops: segmentStops, to: nextInterchangeName });
                    currentTime.setMinutes(currentTime.getMinutes() + segmentDuration);
                    remainingMtrTime -= segmentDuration;
                    items.push({ type: 'point', mode: 'MTR', name: nextInterchangeName, time: formatTime(currentTime), interchange: true, fromLine: currentLine, toLine: nextLine, line: nextLine }); // Departing line
                    currentTime.setMinutes(currentTime.getMinutes() + interchangeDelay);
                    remainingMtrTime -= interchangeDelay;
                } else { // Last MTR segment before walk
                    const finalMtrDuration = Math.max(0, remainingMtrTime);
                    const interchangeMTRStationName = this.getMTRName(route.interchangeStation); // MTR station where walk starts
                    items.push({ type: 'segment', mode: 'MTR', lines: [currentLine], duration: finalMtrDuration, distance: segmentDistance, stops: segmentStops, to: interchangeMTRStationName });
                    currentTime.setMinutes(currentTime.getMinutes() + finalMtrDuration);
                    items.push({ type: 'point', mode: 'MTR', name: interchangeMTRStationName, time: formatTime(currentTime), line: currentLine }); // Alighting MTR station
                }
            }

            items.push({ type: 'segment', mode: 'Walk', duration: walkTime, distance: route.walkingDistance, to: boardingStopName });
            currentTime.setMinutes(currentTime.getMinutes() + walkTime);
            items.push({ type: 'point', mode: 'Bus', name: boardingStopName, time: formatTime(currentTime), provider: busRoute.provider }); // Arriving at Bus stop
            items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTime, distance: busRoute.distance, alightingStopName: alightingStopName, provider: busRoute.provider });
            currentTime.setMinutes(currentTime.getMinutes() + busTime);
            items.push({ type: 'point', mode: 'Bus', name: alightingStopName, time: formatTime(currentTime), isEnd: true, provider: busRoute.provider }); // Final destination

        } else if (route.type === 'Bus') {
            const busRoute = route.busRoute;
            const walkToBusDist = route.walkingDistance / 2; // Simplification
            const walkFromBusDist = route.walkingDistance / 2;
            const walkToBusTime = calculateWalkDuration(walkToBusDist);
            const walkFromBusTime = calculateWalkDuration(walkFromBusDist);
            const busTime = Math.max(1, route.estimatedTime - walkToBusTime - walkFromBusTime);

            items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, time: formatTime(currentTime), isStart: true, provider: busRoute.provider });

            // Optional walk TO bus stop
            if (walkToBusTime > 0 && walkToBusDist > 10) { // Add walk if significant
                 items.push({ type: 'segment', mode: 'Walk', duration: walkToBusTime, distance: walkToBusDist, to: route.boardingStopName });
                 currentTime.setMinutes(currentTime.getMinutes() + walkToBusTime);
                 // Add the actual boarding point time
                 items.push({ type: 'point', mode: 'Bus', name: route.boardingStopName, time: formatTime(currentTime), provider: busRoute.provider });
            }

            items.push({ type: 'segment', mode: 'Bus', route: busRoute.route, direction: busRoute.direction, stops: busRoute.stopCount, duration: busTime, distance: busRoute.distance, alightingStopName: route.alightingStopName, provider: busRoute.provider });
            currentTime.setMinutes(currentTime.getMinutes() + busTime);
            items.push({ type: 'point', mode: 'Bus', name: route.alightingStopName, time: formatTime(currentTime), provider: busRoute.provider }); // Alighting point

            // Optional walk FROM bus stop
             if (walkFromBusTime > 0 && walkFromBusDist > 10) {
                const finalDestName = "Destination Area"; // Generic name
                items.push({ type: 'segment', mode: 'Walk', duration: walkFromBusTime, distance: walkFromBusDist, to: finalDestName });
                currentTime.setMinutes(currentTime.getMinutes() + walkFromBusTime);
                items.push({ type: 'point', mode: 'Walk', name: finalDestName, time: formatTime(currentTime), isEnd: true });
             } else {
                 // If no final walk, the alighting stop is the end
                 const lastPoint = items[items.length - 1];
                 lastPoint.isEnd = true;
                 lastPoint.time = formatTime(currentTime);
             }
        }
        return items;
    }

    static generatePoint(item) {
        const classes = `timeline-item station-point ${item.isStart ? 'start-point' : ''} ${item.isEnd ? 'end-point' : ''} ${item.interchange ? 'interchange-point' : ''}`;
        const dataLine = item.mode === 'Bus' ? (item.provider || 'bus').toUpperCase() : // Use uppercase for data-line consistency? KMB, CTB
                       item.mode === 'Walk' ? 'Walk' :
                       item.line || 'unknown'; // MTR line code

        const time = item.time || '--:--';
        let tag = '';
        if (item.isStart) tag = '<span class="tag">From</span>';
        else if (item.isEnd) tag = '<span class="tag to">To</span>';
        else if (item.interchange) tag = '<span class="tag interchange">Change</span>';

        // Get Line Abbreviation/Provider for Tag
        let lineAbbr = 'UKN';
        let lineTagClass = 'unknown';
        if (item.mode === 'Bus') {
             lineAbbr = (item.provider || 'BUS').toUpperCase();
             lineTagClass = (item.provider || 'bus').toLowerCase();
        } else if (item.mode === 'Walk') {
             lineAbbr = 'WALK';
             lineTagClass = 'walk';
        } else if (item.line) { // MTR
             lineAbbr = item.line;
             lineTagClass = item.line.toLowerCase();
        }

        let interchangeInfo = '';
        if (item.interchange && item.fromLine && item.toLine) {
            const fromLineName = LINE_NAMES[item.fromLine]?.name || item.fromLine;
            const toLineName = LINE_NAMES[item.toLine]?.name || item.toLine;
            interchangeInfo = `<div class="interchange-info">Change from ${fromLineName} to ${toLineName}</div>`;
        } else if (item.interchange) {
             interchangeInfo = `<div class="interchange-info">Interchange</div>`;
        }

        // Only show line tag if abbreviation is known and not 'unknown' etc.
        const showTag = lineAbbr && lineAbbr !== 'unknown' && lineAbbr !== 'UKN';
        const tagHtml = showTag ? `<span class="line-tag ${lineTagClass}">${lineAbbr}</span>` : '';

        return `
            <div class="${classes}" data-line="${dataLine}">
                <div class="timeline-marker">
                    <div class="marker-time">${time}</div>
                    <div class="marker-icon"></div>
                </div>
                <div class="timeline-content">
                    <div class="station-name">${tag} ${item.name} ${tagHtml}</div>
                    ${interchangeInfo}
                </div>
            </div>
        `;
    }

    static generateSegment(item) {
        // Determine data-line based on mode/provider/line
        
        let dataLine = 'unknown';
         if (item.mode === 'Bus') dataLine = (item.provider || 'bus').toUpperCase();
         else if (item.mode === 'Walk') dataLine = 'Walk';
         else if (item.mode === 'MTR' && item.lines && item.lines.length > 0) dataLine = item.lines[0]; // Use first line code for segment

         let distanceDisplay = '--';
    let unit = 'km';
    let distanceSource = item.distance;
    console.log(`Generating segment: Mode=${item.mode}, Received Distance=${distanceSource}`);
    if (item.mode === 'Walk' && typeof distanceSource === 'number' && !isNaN(distanceSource)) {
        distanceDisplay = `${Math.round(distanceSource)}`;
        unit = 'm';
    } else if ((item.mode === 'MTR' || item.mode === 'Bus') && typeof distanceSource === 'number' && !isNaN(distanceSource)) {
        distanceDisplay = `${(distanceSource / 1000).toFixed(1)}`;
        unit = 'km';
    }
    

        // Display '-- km' if distance is null/undefined for MTR/Bus
        const distanceText = (distanceDisplay !== '--' || item.mode === 'Walk') ? `${distanceDisplay}${unit}` : '-- km';

        let stopsDisplay = '';
        if ((item.mode === 'MTR' || item.mode === 'Bus') && item.stops !== undefined && item.stops !== null) {
            stopsDisplay = `<span class="stops">${item.stops} stops</span>`;
        }

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
        // Assume 'lines' is globally available from stations.js
        if (typeof lines === 'undefined') return code; // Fallback if lines data not loaded
        const station = Object.values(lines).flat().find(s => s.value === code);
        return station ? station.text : code;
    }

    static getDefaultInterchange(line1, line2) {
        if (typeof interchangeStations === 'undefined') return 'UKN'; // Fallback
        const key1 = `${line1}_${line2}`;
        const key2 = `${line2}_${line1}`;
        return interchangeStations[key1] || interchangeStations[key2] || 'UKN';
    }
}

// 5. Main Logic
let currentRoutes = [];

// Ensure MTR station data (lines) is loaded before this script runs, or load it here.
// Example: if (typeof lines === 'undefined') { /* load stations.js */ }

window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    const cs = params.get('currentStation'); // MTR start
    const ds = params.get('destinationStation'); // MTR end
    const sbs = params.get('startBusStop'); // Bus start ID
    const ebs = params.get('endBusStop'); // Bus end ID

    const mtrStations = typeof lines !== 'undefined' ? getUniqueMTRStations() : [];
    if (mtrStations.length === 0 && (cs || ds)) {
        // ... (error handling) ...
        return;
    }
    const finder = new RouteFinder(transit, mtrStations);

    // Check if bus data is needed and loaded
    const requiresBusData = sbs || ebs;
    if (requiresBusData && transit.stops.length === 0) {
        document.getElementById('schedule').innerHTML = '<div class="error">Bus stop data not loaded from local storage.</div>';
        return;
    }

    document.getElementById('schedule').innerHTML = '<div class="loading">Finding routes...</div>'; // Loading indicator

    try {
        if (cs && ds && !sbs && !ebs) { // MTR Only
            currentRoutes = await finder.findMTRRoute(cs, ds);
        } else if (sbs && ebs && !cs && !ds) { // Bus Only
            currentRoutes = finder.findBusRoute(sbs, ebs); // This is synchronous
        } else if (sbs && ds && !cs && !ebs) { // Bus to MTR
            currentRoutes = await finder.findMixedRoute(sbs, ds, 'bus', 'mtr');
        } else if (cs && ebs && !sbs && !ds) { // MTR to Bus
            currentRoutes = await finder.findMixedRoute(cs, ebs, 'mtr', 'bus');
        } else {
             document.getElementById('schedule').innerHTML = '<div class="error">Invalid combination of search parameters. Please provide (Start MTR and End MTR) OR (Start Bus and End Bus) OR (Start Bus and End MTR) OR (Start MTR and End Bus).</div>';
             return;
        }
    } catch (error) {
        console.error("Error finding routes:", error);
        document.getElementById('schedule').innerHTML = '<div class="error">An error occurred while finding routes. Please try again.</div>';
        return;
    }


    if (!currentRoutes || currentRoutes.length === 0) {
        document.getElementById('schedule').innerHTML = '<div class="error">No routes found for the selected locations.</div>';
        return;
    }

    // Initial sort (e.g., by estimated time)
    currentRoutes.sort((a, b) => a.estimatedTime - b.estimatedTime);

    displaySortedRoutes(); // Display initially sorted routes

    // Add event listeners for sort buttons
    document.getElementById('sortByTime')?.addEventListener('click', () => {
         currentRoutes.sort((a, b) => a.estimatedTime - b.estimatedTime);
         displaySortedRoutes();
    });
     document.getElementById('sortByWalk')?.addEventListener('click', () => {
         // Calculate total walk distance for sorting
         const getTotalWalk = (route) => {
             let walk = 0;
             if (route.walkingDistance) walk += route.walkingDistance; // Includes walk to/from bus/MTR

             return walk;
         };
         currentRoutes.sort((a, b) => getTotalWalk(a) - getTotalWalk(b));
         displaySortedRoutes();
    });
};

function displaySortedRoutes() {
    const scheduleDiv = document.getElementById('schedule'); // Target the main schedule display area
    scheduleDiv.innerHTML = ''; // Clear previous routes
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);

    if (!currentRoutes || currentRoutes.length === 0) {
         scheduleDiv.innerHTML = '<div class="error">No routes to display.</div>';
         return;
    }

    // Limit displayed routes if needed (e.g., top 5)
    const routesToDisplay = currentRoutes.slice(0, 5);

    routesToDisplay.forEach((route, i) => {
        if (!route || route.estimatedTime === undefined) {
            console.warn("Skipping invalid route object:", route);
            return; // Skip invalid route objects
        }

        const arrivalTime = new Date(now.getTime() + route.estimatedTime * 60000).toTimeString().slice(0, 5);

        // Calculate transfers more accurately
        let transfers = 0;
        const items = TimelineGenerator.getItems(route); // Generate items once
        items.forEach(item => {
            if (item.interchange || (item.mode === 'Walk' && item.type === 'segment')) {
                 // Count MTR changes and mode changes involving walk as transfers
                 transfers++;
            } else if (item.type === 'point' && items.length > 1) {
                // Check for simple mode change (e.g., Bus -> Walk point without interchange flag) - rudimentary
                const prevItem = items[items.indexOf(item) - 1];
                if (prevItem && prevItem.mode !== item.mode && prevItem.mode && item.mode) {
                    // This logic might be too simple, refine based on getItems structure
                }
            }
        });
        // Refine transfer count based on specific logic if needed. The above is a basic guess.

        const headerHtml = `
            <div class="route-header">
                <div><span class="time-info">${startTime} → ${arrivalTime}</span> <span class="duration">(${Math.round(route.estimatedTime)} mins)</span></div>
                <div class="cost-transfers">
                    <div class="fare">Fare: (Not Available)</div>
                    <div class="transfers">~${transfers} Transfers</div>
                </div>
            </div>
        `;

        // Generate timeline HTML using the pre-generated items
        let timelineHtml = '<div class="timeline">';
        items.forEach(item => {
             timelineHtml += item.type === 'point' ? TimelineGenerator.generatePoint(item) : TimelineGenerator.generateSegment(item);
        });
        timelineHtml += '</div>';


        const routeContainer = document.createElement('div');
        routeContainer.className = 'route-container';
        routeContainer.id = `route-summary-${i}`;
        // Removed onclick for details for now, just display full timeline
        routeContainer.innerHTML = headerHtml + timelineHtml;

        scheduleDiv.appendChild(routeContainer);
    });
}

// Removed toggleRouteDetails as we display full timeline directly

function getUniqueMTRStations() {
    if (typeof lines === 'undefined') return [];
    const stationSet = new Set();
    const uniqueStations = [];
     Object.values(lines).flat().forEach(station => {
        if (station && station.value && !stationSet.has(station.value)) {
            stationSet.add(station.value);
            // Ensure lat/long are present and are numbers
            const lat = parseFloat(station.lat);
            const long = parseFloat(station.long);
            uniqueStations.push({
                ...station,
                 lat: !isNaN(lat) ? lat : null,
                 long: !isNaN(long) ? long : null
            });
        }
    });
    return uniqueStations;
};