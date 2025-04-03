// ferry.js
document.addEventListener('DOMContentLoaded', () => {
    const companyList = document.getElementById('companyList');
    const routeDetails = document.getElementById('routeDetails');
    const routeTitle = document.getElementById('routeTitle');
    const timetable = document.getElementById('timetable');
    const eta = document.getElementById('eta');
    const fares = document.getElementById('fares');

    // Fallback timetable data for Central ↔ Sok Kwu Wan (HKKF, route_id: 1)
    const fallbackTimetableCSV = `Time,Direction,Days\n07:20,Outbound,Mon-Sat\n08:35,Outbound,Mon-Sat\n10:20,Outbound,Mon-Sat\n06:45,Inbound,Mon-Sat\n08:00,Inbound,Mon-Sat\n09:35,Inbound,Mon-Sat`;

    // Ferry company data
    const ferryCompanies = [
        {
            name: "Hong Kong and Kowloon Ferry (HKKF)",
            apiBase: "https://www.hkkfeta.com/opendata",
            hasTimetable: true,
            hasFares: true,
            mockRoutes: [
                { route_id: 1, route_name_en: "Central ↔ Sok Kwu Wan", origin_en: "Central", destination_en: "Sok Kwu Wan" },
                { route_id: 2, route_name_en: "Central ↔ Yung Shue Wan", origin_en: "Central", destination_en: "Yung Shue Wan" },
                { route_id: 3, route_name_en: "Central ↔ Peng Chau", origin_en: "Central", destination_en: "Peng Chau" },
                { route_id: 4, route_name_en: "Peng Chau ↔ Hei Ling Chau", origin_en: "Peng Chau", destination_en: "Hei Ling Chau" }
            ]
        },
        {
            name: "Sun Ferry Services Company Limited",
            apiBase: "https://www.sunferry.com.hk",
            hasTimetable: false,
            hasFares: false,
            mockRoutes: [
                { route_code: "CECC", route_name_en: "Central ↔ Cheung Chau", origin_en: "Central", destination_en: "Cheung Chau" },
                { route_code: "CCCE", route_name_en: "Cheung Chau ↔ Central", origin_en: "Cheung Chau", destination_en: "Central" },
                { route_code: "CEMW", route_name_en: "Central ↔ Mui Wo", origin_en: "Central", destination_en: "Mui Wo" },
                { route_code: "MWCE", route_name_en: "Mui Wo ↔ Central", origin_en: "Mui Wo", destination_en: "Central" },
                { route_code: "NPHH", route_name_en: "North Point ↔ Hung Hom", origin_en: "North Point", destination_en: "Hung Hom" },
                { route_code: "HHNP", route_name_en: "Hung Hom ↔ North Point", origin_en: "Hung Hom", destination_en: "North Point" },
                { route_code: "NPKC", route_name_en: "North Point ↔ Kowloon City", origin_en: "North Point", destination_en: "Kowloon City" },
                { route_code: "KCNP", route_name_en: "Kowloon City ↔ North Point", origin_en: "Kowloon City", destination_en: "North Point" },
                { route_code: "IIPECMUW", route_name_en: "Peng Chau ↔ Mui Wo", origin_en: "Peng Chau", destination_en: "Mui Wo" },
                { route_code: "IIMUWPEC", route_name_en: "Mui Wo ↔ Peng Chau", origin_en: "Mui Wo", destination_en: "Peng Chau" },
                { route_code: "IIMUWCMW", route_name_en: "Mui Wo ↔ Chi Ma Wan", origin_en: "Mui Wo", destination_en: "Chi Ma Wan" },
                { route_code: "IICMWMUW", route_name_en: "Chi Ma Wan ↔ Mui Wo", origin_en: "Chi Ma Wan", destination_en: "Mui Wo" },
                { route_code: "IICMWCHC", route_name_en: "Chi Ma Wan ↔ Cheung Chau", origin_en: "Chi Ma Wan", destination_en: "Cheung Chau" },
                { route_code: "IICHCCMW", route_name_en: "Cheung Chau ↔ Chi Ma Wan", origin_en: "Cheung Chau", destination_en: "Chi Ma Wan" },
                { route_code: "IICHCMUW", route_name_en: "Cheung Chau ↔ Mui Wo", origin_en: "Cheung Chau", destination_en: "Mui Wo" },
                { route_code: "IIMUWCHC", route_name_en: "Mui Wo ↔ Cheung Chau", origin_en: "Mui Wo", destination_en: "Cheung Chau" }
            ]
        }
    ];

    // Display company buttons
    ferryCompanies.forEach((company, index) => {
        const companyButton = document.createElement('button');
        companyButton.classList.add('company-button');
        companyButton.textContent = company.name;
        const routeList = document.createElement('div');
        routeList.classList.add('route-list');
        routeList.id = `route-list-${index}`;

        companyButton.addEventListener('click', () => {
            const isActive = routeList.classList.contains('active');
            document.querySelectorAll('.route-list').forEach(list => list.classList.remove('active'));
            routeDetails.classList.remove('active');
            if (!isActive) routeList.classList.add('active');
        });

        let routes = company.mockRoutes;
        if (company.name === "Hong Kong and Kowloon Ferry (HKKF)") {
            fetch(`${company.apiBase}/route`)
                .then(response => {
                    if (!response.ok) throw new Error(`Route fetch failed: ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    routes = data.data;
                    displayRoutes(company, routes, routeList);
                })
                .catch(error => {
                    console.error('Error fetching HKKF routes:', error);
                    displayRoutes(company, routes, routeList); // Use mock routes as fallback
                });
        } else {
            displayRoutes(company, routes, routeList); // Sun Ferry uses mock routes only
        }

        companyList.appendChild(companyButton);
        companyList.appendChild(routeList);
    });

    // Display routes as buttons
    function displayRoutes(company, routes, routeList) {
        routeList.innerHTML = '';
        routes.forEach(route => {
            const routeButton = document.createElement('button');
            routeButton.classList.add('route-button');
            routeButton.textContent = route.route_name_en;
            routeButton.addEventListener('click', () => showRouteDetails(company, route));
            routeList.appendChild(routeButton);
        });
    }

    // Show route details
    function showRouteDetails(company, route) {
        routeTitle.textContent = `${route.route_name_en} (${company.name})`;
        routeDetails.classList.add('active');

        const timetableSection = document.getElementById('timetable-section');
        const etaSection = document.getElementById('eta-section');
        const faresSection = document.getElementById('fares-section');

        // ETA section (both companies)
        etaSection.style.display = 'block';
        eta.innerHTML = '<div class="loading">Loading ETA...</div>';

        if (company.name === "Hong Kong and Kowloon Ferry (HKKF)") {
            fetch(`${company.apiBase}/eta/${route.route_id}/outbound`)
                .then(response => {
                    if (!response.ok) throw new Error(`ETA fetch failed: ${response.status}`);
                    return response.json();
                })
                .then(data => renderETA(data.data, route.origin_en, route.destination_en, company.name))
                .catch(error => {
                    console.error('HKKF ETA fetch error:', error);
                    renderETA([{ session_time: "08:00:00", ETA: "2025-04-03T08:30:00+08:00", direction: "outbound" }], 
                              route.origin_en, route.destination_en, company.name);
                    eta.innerHTML += '<p class="error">Using fallback data due to API failure.</p>';
                });
        } else if (company.name === "Sun Ferry Services Company Limited") {
            fetch(`${company.apiBase}/eta/?route=${route.route_code}`)
                .then(response => {
                    if (!response.ok) throw new Error(`Sun Ferry ETA fetch failed: ${response.status}`);
                    return response.json();
                })
                .then(data => renderETA(data.data, route.origin_en, route.destination_en, company.name))
                .catch(error => {
                    console.error('Sun Ferry ETA fetch error:', error);
                    const mockData = [{ route_en: route.route_name_en, depart_time: "16:15", eta: "17:07" }];
                    renderETA(mockData, route.origin_en, route.destination_en, company.name);
                    eta.innerHTML += '<p class="error">Using fallback data due to API failure.</p>';
                });
        }

        // Timetable section (HKKF only)
        if (company.hasTimetable) {
            timetableSection.style.display = 'block';
            timetable.innerHTML = '<div class="loading">Loading timetable...</div>';
            fetch(`${company.apiBase}/time_table/${route.route_id}/outbound`) // Adjusted endpoint
                .then(response => {
                    if (!response.ok) throw new Error(`Timetable fetch failed: ${response.status}`);
                    return response.text();
                })
                .then(csv => renderTimetable(csv, route.origin_en, route.destination_en))
                .catch(error => {
                    console.error('HKKF timetable fetch error:', error);
                    if (route.route_id === 1) {
                        renderTimetable(fallbackTimetableCSV, route.origin_en, route.destination_en);
                        timetable.innerHTML += '<p class="error">Using cached data due to API failure.</p>';
                    } else {
                        renderTimetable(`Time,Direction,Days\n08:00,To ${route.destination_en},Mon-Sat\n08:30,From ${route.destination_en},Mon-Sat\n09:00,To ${route.destination_en},Mon-Sat`, 
                                        route.origin_en, route.destination_en);
                        timetable.innerHTML += '<p class="error">Using fallback data due to API failure.</p>';
                    }
                });
        } else {
            timetableSection.style.display = 'none';
            timetable.innerHTML = '<p>Not available for this operator.</p>';
        }

        // Fares section (HKKF only)
        if (company.hasFares) {
            faresSection.style.display = 'block';
            fares.innerHTML = '<div class="loading">Loading fares...</div>';
            fetch(`${company.apiBase}/fare_table/${route.route_id}`)
                .then(response => {
                    if (!response.ok) throw new Error(`Fares fetch failed: ${response.status}`);
                    return response.text();
                })
                .then(csv => renderFares(csv))
                .catch(error => {
                    console.error('HKKF fares fetch error:', error);
                    renderFares(`Day,Adult,Child\nMonday to Saturday,$20,$10\nSunday and Public Holidays,$25,$12`);
                    fares.innerHTML += '<p class="error">Using fallback data due to API failure.</p>';
                });
        } else {
            faresSection.style.display = 'none';
            fares.innerHTML = '<p>Not available for this operator.</p>';
        }
    }

    // Render timetable
    function renderTimetable(csv, origin, destination) {
        timetable.innerHTML = '';
        const rows = csv.split('\n').map(row => row.split(','));
        const headers = ['Time', 'Direction', 'Days'];
        const body = rows.slice(1).map(row => row.slice(0, 3));

        if (body.length === 0 || body.every(row => row.length < 3)) {
            timetable.innerHTML = '<p class="error">Timetable data unavailable.</p>';
            return;
        }

        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        timetable.appendChild(thead);

        const tbody = document.createElement('tbody');
        body.forEach(row => {
            if (row.length >= 3) {
                const tr = document.createElement('tr');
                const direction = row[1].includes("To") ? row[1] : row[1] === "Outbound" ? `To ${destination}` : `From ${destination}`;
                [row[0], direction, row[2]].forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell;
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }
        });
        timetable.appendChild(tbody);
    }

    // Render ETA (supports both HKKF and Sun Ferry)
    function renderETA(etaData, origin, destination, companyName) {
        const nextETA = etaData[0];
        let time, direction;

        if (!nextETA) {
            eta.innerHTML = '<p>No upcoming ferries for this route.</p>';
            return;
        }

        if (companyName === "Hong Kong and Kowloon Ferry (HKKF)") {
            time = nextETA.ETA ? nextETA.ETA.split('T')[1].slice(0, 5) : nextETA.session_time.slice(0, 5);
            direction = nextETA.direction === "outbound" ? `to ${destination}` : `from ${destination}`;
        } else if (companyName === "Sun Ferry Services Company Limited") {
            time = nextETA.eta ? (nextETA.eta.split('T')?.[1]?.slice(0, 5) || nextETA.eta) : nextETA.depart_time;
            direction = nextETA.route_en.includes("to") || nextETA.route_en.includes("↔") ? `to ${destination}` : `from ${destination}`;
        }

        eta.innerHTML = `Next Ferry: <span class="eta-highlight">${time}</span> ${direction}`;
    }

    // Render fares
    function renderFares(csv) {
        fares.innerHTML = '';
        const rows = csv.split('\n').map(row => row.split(','));
        const headers = rows[0];
        const body = rows.slice(1);

        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header === "Day" ? "Type" : header;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        fares.appendChild(thead);

        const tbody = document.createElement('tbody');
        body.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        fares.appendChild(tbody);
    }
});