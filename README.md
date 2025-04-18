Hong Kong Public Transport Web App (FYP)
A comprehensive web application designed to help users navigate Hong Kong's public transport system. This app provides real-time schedules, route planning, fare information, news updates, weather data, and cookie consent management for various transport modes including MTR, buses (KMB, Citybus), ferries, trams, and minibuses. Developed as a Final Year Project (FYP).
![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)
![GitHub Issues](https://img.shields.io/github/issues/alanwong6679/FYP)
Table of Contents
Features (#features)

Installation (#installation)

Usage (#usage)

Project Structure (#project-structure)

Contributing (#contributing)

License (#license)

Contact (#contact)

Features
Real-Time Schedules: View up-to-date schedules for MTR (mtr_schedule.html), trams (tram_schedule.html), ferries (ferry.html), buses (citybus.html, minibus_schedule.html), and more.

Route Planning: Plan your journey using interactive maps (route_planner.html, transit_planner.html, map.js) and direct location search (directloca.js).

Fare and Stop Information: Access detailed route, stop, and fare data stored in JSON files (route_data.json, route_fee_data.json, stop_data.json).

News Updates: Stay informed with transport-related news, possibly sourced via the RTHK API (RTHK.js).

Weather Integration: Check current weather conditions, likely from the Hong Kong Observatory (temperature.js, temperature.css).

Cookie Consent: Manage user privacy preferences through a dedicated page (cookie.html, cookie-parser).

Responsive Frontend: Enjoy a user-friendly interface with custom styles (mtr.css, ferry.css) and interactivity (mtr.js, navbar.js) for each transport mode.

Data Management: Automatically fetch and process transport data using a Python script (fetch_transport_data.py), stored in the data/ directory.

Installation
Prerequisites
Node.js (v16 or higher)

Python (v3.8 or higher)

npm (included with Node.js)

Steps
Clone the Repository:
bash

git clone https://github.com/alanwong6679/FYP.git
cd FYP

Install Node.js Dependencies:
bash

npm install

Install Python Dependencies:
bash

pip install -r requirements.txt

Note: Ensure requirements.txt exists in the root directory. If it’s missing, install assumed dependencies like requests and pandas:
bash

pip install requests pandas

Set Up Environment Variables:
Create a .env file in the root directory to store API keys for transport, weather, and news services:
env

TRANSPORT_API_KEY=your_transport_api_key
WEATHER_API_KEY=your_weather_api_key
RTHK_API_KEY=your_rthk_api_key

Usage
Fetch or Update Transport Data:
Run the Python script to populate or refresh JSON files in the data/ folder (e.g., route_data.json), likely sourcing data from an API like Data.gov.hk:
bash

python fetch_transport_data.py

Start the Node.js Server:
Launch the web server:
bash

npm start

Access the Web App:
Open your browser and go to:

http://localhost:3000

Note: Replace 3000 with the port specified in server.js if it differs.

Navigating the App
Home: Begin at home.html for a project overview.

Schedules: Explore MTR (mtr.html), buses (citybus.html, minibus_schedule.html), ferries (ferry.html), or trams (tram_schedule.html).

Route Planning: Use route_planner.html or transit_planner.html with interactive maps for journey planning.

Fare/Stop Info: Review detailed transport data from JSON files.

News & Weather: Get updates via RTHK.js and weather info via temperature.js.

Cookie Settings: Adjust privacy settings at cookie.html.

Project Structure

FYP/
├── node_modules/                     # Node.js dependencies
├── static/                          # Frontend assets
│   ├── css/                        # Stylesheets
│   │   ├── ferry.css               # Ferry page styling
│   │   ├── general_schedule.css    # General schedule styling
│   │   ├── mtr_schedule.css        # MTR schedule styling
│   │   ├── mtr.css                 # MTR page styling
│   │   ├── navbar.css              # Navigation bar styling
│   │   ├── route_planner.css       # Route planner styling
│   │   ├── styles.css              # General styling
│   │   ├── temperature.css         # Weather display styling
│   │   ├── tram_schedule.css       # Tram schedule styling
│   │   └── transit.css             # Transit page styling
│   ├── js/                         # JavaScript for interactivity
│   │   ├── citybusstop.js          # Citybus stop functionality
│   │   ├── directloca.js           # Direct location search
│   │   ├── ferry.js                # Ferry schedule and data
│   │   ├── general_schedule.js     # General schedule functionality
│   │   ├── hkostation.js           # Hong Kong station data
│   │   ├── kmbusstop.js            # KMB bus stop functionality
│   │   ├── minibus.js              # Minibus schedule and data
│   │   ├── mtr_schedule.js         # MTR schedule functionality
│   │   ├── mtr.js                  # MTR-specific functionality
│   │   ├── navbar.js               # Navigation bar interactivity
│   │   ├── route_planner.js        # Route planning logic
│   │   ├── RTHK.js                # News or real-time updates
│   │   ├── script.js               # General scripting
│   │   ├── stations.js             # Station data handling
│   │   ├── temperature.js          # Weather data display
│   │   ├── tram_schedule.js        # Tram schedule functionality
│   │   ├── tramData.js             # Tram data handling
│   │   └── transit.js              # General transit functionality
│   └── images/                     # Images for UI
│       ├── citybus_button.png      # Citybus button
│       ├── citybus.png             # Citybus logo
│       ├── ferry_button.png        # Ferry button
│       ├── hk_ferry.png            # Ferry logo
│       ├── home.png                # Home page image
│       ├── index.png               # Index page image
│       ├── kmb_button.png          # KMB button
│       ├── KMB.png                 # KMB logo
│       ├── minibus_button.png      # Minibus button
│       ├── minibus.png             # Minibus logo
│       ├── mtr_button.png          # MTR button
│       ├── mtr.png                 # MTR logo
│       ├── news_icon.png           # News icon
│       ├── route_planning.png      # Route planner image
│       ├── switch.png              # UI switch icon
│       ├── tram_button.png         # Tram button
│       └── transit_planner.png     # Transit planner image
├── views/                           # EJS templates
│   ├── citybus.html                # Citybus schedule/info page
│   ├── cookie.html                 # Cookie consent page
│   ├── ferry.html                  # Ferry schedule/info page
│   ├── general_schedule.html       # General schedules page
│   ├── home.html                   # Homepage
│   ├── minibus_schedule.html       # Minibus schedule page
│   ├── mtr.html                    # MTR schedule/info page
│   ├── route_planner.html          # Route planning page
│   ├── tram_schedule.html          # Tram schedule page
│   └── transit_planner.html        # Transit planning page
├── data/                           # Transport data in JSON format
│   ├── route_data.json             # Route information
│   ├── route_fee_data.json         # Fare information
│   ├── route-stop_data.json        # Route-stop mappings
│   └── stop_data.json              # Stop information
├── fetch_transport_data.py          # Python script to fetch/process transport data
├── package.json                     # Node.js dependencies and scripts
├── package-lock.json                # Lockfile for Node.js dependencies
├── requirements.txt                 # Python dependencies
└── server.js                       # Node.js/Express server

Contributing
Contributions are encouraged! Follow these steps to contribute:
Fork the Repository: Visit https://github.com/alanwong6679/FYP.

Create a New Branch:
bash

git checkout -b feature-branch

Commit Your Changes:
bash

git commit -m 'Add feature'

Push to the Branch:
bash

git push origin feature-branch

Open a Pull Request: Submit your changes for review.

Please include tests and update documentation where necessary. Report any issues at https://github.com/alanwong6679/FYP/issues.
License
This project is licensed under the ISC License. See the LICENSE file for details.
Contact
For questions or feedback:
GitHub: alanwong6679

Issues: https://github.com/alanwong6679/FYP/issues

Happy commuting with Hong Kong's public transport!

