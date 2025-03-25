
const lines = {
  "AEL": { order: ["HOK", "KOW", "TSY", "AIR", "AWE"], first: "HOK", last: "AWE" },
  "TCL": { order: ["HOK", "KOW", "OLY", "NAC", "LAK", "TSY", "SUN", "TUC"], first: "HOK", last: "TUC" },
  "TML": { order: ["WKS", "MOS", "HEO", "TSH", "SHM", "CIO", "STW", "CKT", "TAW", "HIK", "DIH", "KAT", "SUW", "TKW", "HOM", "HUH", "ETS", "AUS", "NAC", "MEF", "TWW", "KSR", "YUL", "LOP", "TIS", "SIH", "TUM"], first: "WKS", last: "TUM" },
  "TKL": { order: ["NOP", "QUB", "YAT", "TIK", "TKO", "LHP", "HAH", "POA"], first: "NOP", last: ["POA", "LOP"] },
  "EAL": { order: ["HUH", "MKK", "KOT", "TAW", "SHT", "FOT", "UNI", "TAP", "TWO", "FAN", "SHS", "LOW"], first: "HUH", last: "LOW" }, 
  "SIL": { order: ["ADM", "OCP", "WCH", "LET", "SOH"], first: "ADM", last: "SOH" },
  "TWL": { order: ["CEN", "ADM", "TST", "JOR", "YMT", "MOK", "PRE", "SSP", "CSW", "LCK", "MEF", "LAK", "KWF", "KWH", "TWH", "TSW"], first: "CEN", last: "TSW" },
  "ISL": { order: ["KET", "HKU", "SYP", "SHW", "CEN", "ADM", "WAC", "CAB", "TIH", "FOH", "NOP", "QUB", "TAK", "SWH", "SKW", "HFC", "CHW"], first: "KET", last: "CHW" },
  "KTL": { order: ["WHA", "HOM", "YMT", "MOK", "PRE", "SKM", "KOT", "LOF", "WTS", "DIH", "CHH", "KOB", "NTK", "KWT", "LAT", "YAT", "TIK"], first: "WHA", last: "TIK" }
};

const interchangeStations = {
  "ADM": ["ISL", "TWL", "SIL"],
  "NOP": ["TKL", "ISL"],
  "QUB": ["TKL", "ISL"],
  "HUH": ["TML", "EAL"],
  "MEF": ["TML", "TWL"],
  "YAT": ["KTL", "TKL"],
  "TIK": ["KTL", "TKL"],
  "KOT": ["EAL", "KTL"],
  "PRE": ["KTL", "TWL"],
  "LAK": ["TWL", "TCL"],
  "NAC": ["TCL", "TML"],
  "DIH": ["KTL", "TML"],
  "HOK": ["AEL", "TCL", "ISL", "TWL"],
  "CEN": ["ISL", "TWL", "AEL", "TCL"],
  "TSY": ["AEL", "TCL"],
  "KOW": ["AEL", "TCL"]
};

const validInterchangeStations = Object.keys(interchangeStations).filter(station => interchangeStations[station].length > 1);

// Helper function to fetch schedule data
const fetchScheduleData = async (line, station) => {
  try {
      const response = await axios.get(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php`, {
          params: {
              line: line,
              sta: station,
              lang: 'en'
          }
      });
      return { line, station, data: response.data };
  } catch (error) {
      console.error(`Error fetching schedule for ${line}-${station}:`, error.message);
      return { line, station, error: error.message };
  }
};

const processScheduleResponses = async (responses, schedules) => {
  const processedStations = new Set();

  responses.forEach(response => {
      const { line, station, data, error } = response;
      const stationKey = `${line}-${station}`;

      if (data && data.data && data.data[stationKey] && !processedStations.has(stationKey)) {
          processedStations.add(stationKey);
          schedules[line] = schedules[line] || { curr_time: '-', sys_time: '-', up: [], down: [] };
          schedules[line].curr_time = data.sys_time || '-';
          schedules[line].sys_time = data.curr_time || '-';

          const stationIndex = lines[line].order.indexOf(station);
          if (stationIndex > 0 && data.data[stationKey].UP) {
              schedules[line].up = [...new Map((data.data[stationKey].UP || []).map(item => [item.time, item])).values()].slice(0, 5);
          }
          if (stationIndex < lines[line].order.length - 1 && data.data[stationKey].DOWN) {
              schedules[line].down = [...new Map((data.data[stationKey].DOWN || []).map(item => [item.time, item])).values()].slice(0, 5);
          }
      } else {
          console.error(`No schedule data for ${station} on ${line}. Error: ${error || 'API returned no data'}`);
          schedules[line] = schedules[line] || { curr_time: '-', sys_time: '-', up: [], down: [] };
          schedules[line].message = `No schedule available for ${station} on ${line}`;
      }
  });
  return schedules;
};

const findRoutesDFS = (
  currentLine, currentStation, destinationStation, 
  currentRoute, visited, interchangeCount, routes, 
  pathStations, interchanges = [], stationsPassed = 0, 
  boardingStations = []
) => {
  if (pathStations.includes(currentStation)) return;
  const newPathStations = [...pathStations, currentStation];

  if (visited.has(`${currentLine}-${currentStation}`)) return;
  visited.add(`${currentLine}-${currentStation}`);

  const currentLineStations = lines[currentLine].order;

  if (currentLineStations.includes(destinationStation)) {
      const stationsOnCurrentLine = calculateStationsBetween(currentLine, currentStation, destinationStation);
      routes.push({
          route: [...currentRoute, currentLine],
          boardingStations: boardingStations,
          interchanges: [...interchanges, destinationStation],
          interchangeCount,
          stationsPassed: stationsPassed + stationsOnCurrentLine
      });
      return;
  }

  if (interchangeCount >= 5) return;

  for (const interchange of validInterchangeStations) {
      if (!lines[currentLine].order.includes(interchange)) continue;

      for (const nextLine of interchangeStations[interchange]) {
          if (
              nextLine !== currentLine && 
              lines[nextLine].order.includes(interchange) && 
              !currentRoute.includes(nextLine)
          ) {
              const stationsOnCurrentLine = calculateStationsBetween(currentLine, currentStation, interchange);
              findRoutesDFS(
                  nextLine, interchange, destinationStation, 
                  [...currentRoute, currentLine], new Set([...visited]), 
                  interchangeCount + 1, routes, newPathStations, 
                  [...interchanges, interchange], 
                  stationsPassed + stationsOnCurrentLine,
                  [...boardingStations, interchange]
              );
          }
      }
  }
};

const calculateRoutesDFS = (currentStation, destinationStation) => {
  let validRoutes = [];
  for (const line in lines) {
      if (lines[line].order.includes(currentStation)) {
          findRoutesDFS(line, currentStation, destinationStation, [], new Set(), 0, validRoutes, [], [], 0, [currentStation]);
      }
  }
  validRoutes.sort((a, b) => calculateTravelTime(a) - calculateTravelTime(b));
  return validRoutes.slice(0, 3);
};

app.post('/fetch_schedule', async (req, res) => {
  const { currentStation, destinationStation } = req.body;

  if (!currentStation || !destinationStation) {
      console.error("Invalid station selection: Missing currentStation or destinationStation");
      return res.json({ error: "Please select both a current station and a destination station.", schedules: null });
  }

  try {
      console.log(`Fetching schedule for ${currentStation} to ${destinationStation}`);
      const validRoutes = calculateRoutesDFS(currentStation, destinationStation);

      if (!validRoutes.length) {
          console.error("No valid routes found");
          return res.json({ error: "No valid route found.", schedules: null });
      }

      const { schedules, bestRoute, alternativeRoutes } = await fetchAndProcessSchedules(currentStation, destinationStation);
      console.log("Best Route:", bestRoute);
      console.log("Alternative Routes:", alternativeRoutes);
      console.log("Schedules:", schedules);

      return res.json({
          error: null,
          schedules,
          bestRoute,
          alternativeRoutes,
          currentStation,
          destinationStation
      });
  } catch (error) {
      console.error("Error in /fetch_schedule:", error);
      return res.json({ error: "An error occurred while fetching the schedule.", schedules: null });
  }
});

function calculateStationsBetween(line, startStation, endStation) {
  const stations = lines[line].order;
  const startIndex = stations.indexOf(startStation);
  const endIndex = stations.indexOf(endStation);

  if (startIndex === -1 || endIndex === -1) return Infinity;
  return Math.abs(endIndex - startIndex);
}

const calculateTravelTime = route => {
  const interchangePenalty = route.interchangeCount * 5;
  return route.stationsPassed + interchangePenalty;
};

const fetchAndProcessSchedules = async (currentStation, destinationStation) => {
  const validRoutes = calculateRoutesDFS(currentStation, destinationStation);

  let bestRoute = null;
  let alternativeRoutes = [];

  validRoutes.forEach(route => {
      const travelTime = calculateTravelTime(route);
      if (!bestRoute || travelTime < bestRoute.travelTime) {
          if (bestRoute) alternativeRoutes.push(bestRoute);
          bestRoute = { ...route, travelTime };
      } else {
          alternativeRoutes.push({ ...route, travelTime });
      }
  });

  if (bestRoute && bestRoute.interchangeCount === 0) {
      alternativeRoutes = [];
  } else {
      alternativeRoutes = alternativeRoutes.slice(0, 2);
  }

  const scheduleRequests = [];
  [bestRoute, ...alternativeRoutes].forEach(route => {
      route.route.forEach((line, index) => {
          scheduleRequests.push(fetchScheduleData(line, route.boardingStations[index]));
      });
  });

  const initialResponses = await Promise.all(scheduleRequests);
  const schedules = await processScheduleResponses(initialResponses, {});

  return { schedules, bestRoute, alternativeRoutes };
};