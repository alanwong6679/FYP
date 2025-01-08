console.log("stations.js loaded");

const stationsData = {
    "AEL": [
        {"value": "HOK", "text": "Hong Kong"},
        {"value": "KOW", "text": "Kowloon"},
        {"value": "TSY", "text": "Tsing Yi"},
        {"value": "AIR", "text": "Airport"},
        {"value": "AWE", "text": "AsiaWorld Expo"}
    ],
    "TCL": [
        {"value": "HOK", "text": "Hong Kong"},
        {"value": "KOW", "text": "Kowloon"},
        {"value": "OLY", "text": "Olympic"},
        {"value": "NAC", "text": "Nam Cheong"},
        {"value": "LAK", "text": "Lai King"},
        {"value": "TSY", "text": "Tsing Yi"},
        {"value": "SUN", "text": "Sunny Bay"},
        {"value": "TUC", "text": "Tung Chung"}
    ],
    "TML": [
        {"value": "WKS", "text": "Wu Kai Sha"},
        {"value": "MOS", "text": "Ma On Shan"},
        {"value": "HEO", "text": "Heng On"},
        {"value": "TSH", "text": "Tai Shui Hang"},
        {"value": "SHM", "text": "Shek Mun"},
        {"value": "CIO", "text": "City One"},
        {"value": "STW", "text": "Sha Tin Wai"},
        {"value": "CKT", "text": "Che Kung Temple"},
        {"value": "TAW", "text": "Tai Wai"},
        {"value": "HIK", "text": "Hin Keng"},
        {"value": "DIH", "text": "Diamond Hill"},
        {"value": "KAT", "text": "Kai Tak"},
        {"value": "SUW", "text": "Sung Wong Toi"},
        {"value": "TKW", "text": "To Kwa Wan"},
        {"value": "HOM", "text": "Ho Man Tin"},
        {"value": "HUH", "text": "Hung Hom"},
        {"value": "ETS", "text": "East Tsim Sha Tsui"},
        {"value": "AUS", "text": "Austin"},
        {"value": "NAC", "text": "Nam Cheong"},
        {"value": "MEF", "text": "Mei Foo"},
        {"value": "TWW", "text": "Tsuen Wan West"},
        {"value": "KSR", "text": "Kam Sheung Road"},
        {"value": "YUL", "text": "Yuen Long"},
        {"value": "LOP", "text": "Long Ping"},
        {"value": "TIS", "text": "Tin Shui Wai"},
        {"value": "SIH", "text": "Siu Hong"},
        {"value": "TUM", "text": "Tuen Mun"}
    ],
    "TKL": [
        {"value": "NOP", "text": "North Point"},
        {"value": "QUB", "text": "Quarry Bay"},
        {"value": "YAT", "text": "Yau Tong"},
        {"value": "TIK", "text": "Tiu Keng Leng"},
        {"value": "TKO", "text": "Tseung Kwan O"},
        {"value": "LHP", "text": "LOHAS Park"},
        {"value": "HAH", "text": "Hang Hau"},
        {"value": "POA", "text": "Po Lam"}
    ],
    "EAL": [
        {"value": "ADM", "text": "Admiralty"},
        {"value": "EXC", "text": "Exhibition Centre"},
        {"value": "HUH", "text": "Hung Hom"},
        {"value": "MKK", "text": "Mong Kok East"},
        {"value": "KOT", "text": "Kowloon Tong"},
        {"value": "TAW", "text": "Tai Wai"},
        {"value": "SHT", "text": "Sha Tin"},
        {"value": "FOT", "text": "Fo Tan"},
        {"value": "RAC", "text": "Racecourse"},
        {"value": "UNI", "text": "University"},
        {"value": "TAP", "text": "Tai Po Market"},
        {"value": "TWO", "text": "Tai Wo"},
        {"value": "FAN", "text": "Fanling"},
        {"value": "SHS", "text": "Sheung Shui"},
        {"value": "LOW", "text": "Lo Wu"},
        {"value": "LMC", "text": "Lok Ma Chau"}
    ],
    "SIL": [
        {"value": "ADM", "text": "Admiralty"},
        {"value": "OCP", "text": "Ocean Park"},
        {"value": "WCH", "text": "Wong Chuk Hang"},
        {"value": "LET", "text": "Lei Tung"},
        {"value": "SOH", "text": "South Horizons"}
    ],
    "TWL": [
        {"value": "TUC", "text": "Tung Chung"},
        {"value": "SUN", "text": "Sunny Bay"},
        {"value": "TSY", "text": "Tsing Yi"},
        {"value": "LAK", "text": "Lai King"},
        {"value": "NAC", "text": "Nam Cheong"},
        {"value": "OLY", "text": "Olympic"},
        {"value": "KOW", "text": "Kowloon"},
        {"value": "HOK", "text": "Hong Kong"}
    ],
    "ISL": [
        {"value": "KEN", "text": "Kennedy Town"},
        {"value": "HKU", "text": "HKU"},
        {"value": "SYP", "text": "Sai Ying Pun"},
        {"value": "SHW", "text": "Sheung Wan"},
        {"value": "CEN", "text": "Central"},
        {"value": "ADM", "text": "Admiralty"},
        {"value": "WAC", "text": "Wan Chai"},
        {"value": "CAB", "text": "Causeway Bay"},
        {"value": "TIH", "text": "Tin Hau"},
        {"value": "FOH", "text": "Fortress Hill"},
        {"value": "NOP", "text": "North Point"},
        {"value": "QUB", "text": "Quarry Bay"},
        {"value": "TAK", "text": "Tai Koo"},
        {"value": "SAI", "text": "Sai Wan Ho"},
        {"value": "SWH", "text": "Shau Kei Wan"},
        {"value": "HFC", "text": "Heng Fa Chuen"},
        {"value": "CHW", "text": "Chai Wan"}
    ],
    "KTL": [
        {"value": "WHA", "text": "Whampoa"},
        {"value": "HOM", "text": "Ho Man Tin"},
        {"value": "YMT", "text": "Yau Ma Tei"},
        {"value": "MOK", "text": "Mong Kok"},
        {"value": "PRE", "text": "Prince Edward"},
        {"value": "SPW", "text": "Shek Kip Mei"},
        {"value": "KOT", "text": "Kowloon Tong"},
        {"value": "LOF", "text": "Lok Fu"},
        {"value": "WTS", "text": "Wong Tai Sin"},
        {"value": "DIH", "text": "Diamond Hill"},
        {"value": "CHO", "text": "Choi Hung"},
        {"value": "KOB", "text": "Kowloon Bay"},
        {"value": "NTK", "text": "Ngau Tau Kok"},
        {"value": "KWT", "text": "Kwun Tong"},
        {"value": "LCK", "text": "Lam Tin"},
        {"value": "YAT", "text": "Yau Tong"},
        {"value": "TIK", "text": "Tiu Keng Leng"}
    ]
};

function updateStations() {
    console.log("Updating stations");
    const lineSelect = document.getElementById('line');
    const stationSelect = document.getElementById('station');
    const selectedLine = lineSelect.value;

    // Clear previous options
    stationSelect.innerHTML = '';

    // Populate new options
    if (stationsData[selectedLine]) {
        stationsData[selectedLine].forEach(station => {
            const option = document.createElement('option');
            option.value = station.value;
            option.textContent = station.text;
            stationSelect.appendChild(option);
        });
    }
}