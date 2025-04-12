import requests
import json
import time
import os
from datetime import datetime

# Constants
CACHE_EXPIRY = 24 * 60 * 60  # Cache expiry in seconds (24 hours)
KMB_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route/"
CTB_URL = "https://rt.data.gov.hk/v2/transport/citybus/route/CTB"
MINIBUS_URL = "https://data.etagmb.gov.hk/route"
KMB_STOPS_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop"
CTB_STOPS_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/stop/"
CTB_ROUTE_STOP_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/"
MINIBUS_STOPS_BASE_URL = "https://data.etagmb.gov.hk/stop/"
KMB_ROUTE_STOP_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"
MINIBUS_STOP_ROUTE_BASE_URL = "https://data.etagmb.gov.hk/stop-route/"
ROUTE_JSON_FILE = "static/data/route_data.json"
STOP_JSON_FILE = "static/data/stop_data.json"
ROUTE_STOP_JSON_FILE = "static/data/route-stop_data.json"
MTR_DATA_JSON_FILE = "static/data/mtr_data.json"

# MTR data with coordinates (partial list; expand with all stations)
MTR_LINES = [
    {"fullName": "Airport Express Line (AEL)", "lineId": "AEL", "stationId": "HOK", "colorClass": "color-ael"},
    {"fullName": "Tung Chung Line (TCL)", "lineId": "TCL", "stationId": "HOK", "colorClass": "color-tcl"},
    {"fullName": "Tuen Ma Line (TML)", "lineId": "TML", "stationId": "WKS", "colorClass": "color-tml"},
    {"fullName": "Tseung Kwan O Line (TKL)", "lineId": "TKL", "stationId": "NOP", "colorClass": "color-tkl"},
    {"fullName": "East Rail Line (EAL)", "lineId": "EAL", "stationId": "LOW", "colorClass": "color-eal"},
    {"fullName": "South Island Line (SIL)", "lineId": "SIL", "stationId": "ADM", "colorClass": "color-sil"},
    {"fullName": "Tsuen Wan Line (TWL)", "lineId": "TWL", "stationId": "CEN", "colorClass": "color-twl"},
    {"fullName": "Island Line (ISL)", "lineId": "ISL", "stationId": "KET", "colorClass": "color-isl"},
    {"fullName": "Kwun Tong Line (KTL)", "lineId": "KTL", "stationId": "WHA", "colorClass": "color-ktl"}
]

MTR_STATIONS = {
    "AEL": {
        "order": [
            {"id": "HOK", "lat": "22.2848", "long": "114.1582"},
            {"id": "KOW", "lat": "22.3046", "long": "114.1614"},
            {"id": "TSY", "lat": "22.3592", "long": "114.1088"},
            {"id": "AIR", "lat": "22.3160", "long": "113.9365"},
            {"id": "AWE", "lat": "22.3208", "long": "113.9418"}
        ],
        "first": "HOK",
        "last": "AWE"
    },
    "TCL": {
        "order": [
            {"id": "HOK", "lat": "22.2848", "long": "114.1582"},
            {"id": "KOW", "lat": "22.3046", "long": "114.1614"},
            {"id": "OLY", "lat": "22.3178", "long": "114.1600"},
            {"id": "NAC", "lat": "22.3267", "long": "114.1538"},
            {"id": "LAK", "lat": "22.3479", "long": "114.1409"},
            {"id": "TSY", "lat": "22.3592", "long": "114.1088"},
            {"id": "SUN", "lat": "22.3328", "long": "114.0289"},
            {"id": "TUC", "lat": "22.2890", "long": "113.9461"}
        ],
        "first": "HOK",
        "last": "TUC"
    },
    "TML": {
        "order": [
            {"id": "WKS", "lat": "22.4274", "long": "114.2429"},
            {"id": "MOS", "lat": "22.4166", "long": "114.2268"},
            {"id": "HEO", "lat": "22.4092", "long": "114.2216"},
            {"id": "TSH", "lat": "22.4028", "long": "114.2188"},
            {"id": "SHM", "lat": "22.3962", "long": "114.2098"},
            {"id": "CIO", "lat": "22.3894", "long": "114.2056"},
            {"id": "STW", "lat": "22.3828", "long": "114.1992"},
            {"id": "CKT", "lat": "22.3762", "long": "114.1928"},
            {"id": "TAW", "lat": "22.3718", "long": "114.1866"},
            {"id": "HIK", "lat": "22.3612", "long": "114.1788"},
            {"id": "DIH", "lat": "22.3408", "long": "114.1938"},
            {"id": "KAT", "lat": "22.3256", "long": "114.1892"},
            {"id": "SUW", "lat": "22.3188", "long": "114.1846"},
            {"id": "TKW", "lat": "22.3122", "long": "114.1788"},
            {"id": "HOM", "lat": "22.3082", "long": "114.1838"},
            {"id": "HUH", "lat": "22.3108", "long": "114.1918"},
            {"id": "ETS", "lat": "22.2968", "long": "114.1728"},
            {"id": "AUS", "lat": "22.3034", "long": "114.1578"},
            {"id": "NAC", "lat": "22.3267", "long": "114.1538"},
            {"id": "MEF", "lat": "22.3378", "long": "114.1478"},
            {"id": "TWW", "lat": "22.3688", "long": "114.1178"},
            {"id": "KSR", "lat": "22.4178", "long": "114.0978"},
            {"id": "YUL", "lat": "22.4468", "long": "114.0378"},
            {"id": "LOP", "lat": "22.4568", "long": "114.0178"},
            {"id": "TIS", "lat": "22.4668", "long": "113.9978"},
            {"id": "SIH", "lat": "22.4768", "long": "113.9778"},
            {"id": "TUM", "lat": "22.4868", "long": "113.9578"}
        ],
        "first": "WKS",
        "last": "TUM"
    },
    "TKL": {
        "order": [
            {"id": "NOP", "lat": "22.3168", "long": "114.2098"},
            {"id": "QUB", "lat": "22.3168", "long": "114.2198"},
            {"id": "YAT", "lat": "22.2988", "long": "114.2378"},
            {"id": "TIK", "lat": "22.2858", "long": "114.2478"},
            {"id": "TKO", "lat": "22.3058", "long": "114.2578"},
            {"id": "LHP", "lat": "22.2958", "long": "114.2678"},
            {"id": "HAH", "lat": "22.3158", "long": "114.2678"},
            {"id": "POA", "lat": "22.3258", "long": "114.2578"}
        ],
        "first": "NOP",
        "last": ["POA", "LHP"]
    },
    "EAL": {
        "order": [
            {"id": "LOW", "lat": "22.5138", "long": "114.1178"},
            {"id": "SHS", "lat": "22.4938", "long": "114.1378"},
            {"id": "FAN", "lat": "22.4738", "long": "114.1478"},
            {"id": "TAP", "lat": "22.4538", "long": "114.1578"},
            {"id": "TWO", "lat": "22.4338", "long": "114.1678"},
            {"id": "UNI", "lat": "22.4138", "long": "114.1778"},
            {"id": "FOT", "lat": "22.3938", "long": "114.1878"},
            {"id": "SHT", "lat": "22.3738", "long": "114.1978"},
            {"id": "KOT", "lat": "22.3538", "long": "114.1878"},
            {"id": "HUH", "lat": "22.3108", "long": "114.1918"}
        ],
        "first": "LOW",
        "last": "HUH"
    },
    "SIL": {
        "order": [
            {"id": "ADM", "lat": "22.2868", "long": "114.1578"},
            {"id": "OCP", "lat": "22.2668", "long": "114.1678"},
            {"id": "WCH", "lat": "22.2568", "long": "114.1778"},
            {"id": "LET", "lat": "22.2468", "long": "114.1878"},
            {"id": "SOH", "lat": "22.2368", "long": "114.1978"}
        ],
        "first": "ADM",
        "last": "SOH"
    },
    "TWL": {
        "order": [
            {"id": "CEN", "lat": "22.2848", "long": "114.1588"},
            {"id": "ADM", "lat": "22.2868", "long": "114.1578"},
            {"id": "TST", "lat": "22.2968", "long": "114.1728"},
            {"id": "JOR", "lat": "22.3068", "long": "114.1728"},
            {"id": "YMT", "lat": "22.3125", "long": "114.1706"},
            {"id": "MOK", "lat": "22.3197", "long": "114.1694"},
            {"id": "PRE", "lat": "22.3268", "long": "114.1689"},
            {"id": "SSP", "lat": "22.3368", "long": "114.1678"},
            {"id": "CSW", "lat": "22.3468", "long": "114.1668"},
            {"id": "LCK", "lat": "22.3568", "long": "114.1658"},
            {"id": "MEF", "lat": "22.3378", "long": "114.1478"},
            {"id": "LAK", "lat": "22.3479", "long": "114.1409"},
            {"id": "KWF", "lat": "22.3668", "long": "114.1378"},
            {"id": "KWH", "lat": "22.3768", "long": "114.1368"},
            {"id": "TWH", "lat": "22.3868", "long": "114.1358"},
            {"id": "TSW", "lat": "22.3968", "long": "114.1348"}
        ],
        "first": "CEN",
        "last": "TSW"
    },
    "ISL": {
        "order": [
            {"id": "KET", "lat": "22.2868", "long": "114.1378"},
            {"id": "HKU", "lat": "22.2868", "long": "114.1478"},
            {"id": "SYP", "lat": "22.2868", "long": "114.1578"},
            {"id": "SHW", "lat": "22.2868", "long": "114.1678"},
            {"id": "CEN", "lat": "22.2848", "long": "114.1588"},
            {"id": "ADM", "lat": "22.2868", "long": "114.1578"},
            {"id": "WAC", "lat": "22.2868", "long": "114.1778"},
            {"id": "CAB", "lat": "22.2868", "long": "114.1878"},
            {"id": "TIH", "lat": "22.2868", "long": "114.1978"},
            {"id": "FOH", "lat": "22.2868", "long": "114.2078"},
            {"id": "NOP", "lat": "22.3168", "long": "114.2098"},
            {"id": "QUB", "lat": "22.3168", "long": "114.2198"},
            {"id": "TAK", "lat": "22.3168", "long": "114.2298"},
            {"id": "SWH", "lat": "22.3168", "long": "114.2398"},
            {"id": "SKW", "lat": "22.3168", "long": "114.2498"},
            {"id": "HFC", "lat": "22.3168", "long": "114.2598"},
            {"id": "CHW", "lat": "22.3168", "long": "114.2698"}
        ],
        "first": "KET",
        "last": "CHW"
    },
    "KTL": {
        "order": [
            {"id": "WHA", "lat": "22.3042", "long": "114.1869"},
            {"id": "HOM", "lat": "22.3082", "long": "114.1838"},
            {"id": "YMT", "lat": "22.3125", "long": "114.1706"},
            {"id": "MOK", "lat": "22.3197", "long": "114.1694"},
            {"id": "PRE", "lat": "22.3268", "long": "114.1689"},
            {"id": "SKM", "lat": "22.3368", "long": "114.1678"},
            {"id": "KOT", "lat": "22.3538", "long": "114.1878"},
            {"id": "LOF", "lat": "22.3468", "long": "114.1978"},
            {"id": "WTS", "lat": "22.3368", "long": "114.2078"},
            {"id": "DIH", "lat": "22.3408", "long": "114.1938"},
            {"id": "CHH", "lat": "22.3268", "long": "114.2178"},
            {"id": "KOB", "lat": "22.3168", "long": "114.2278"},
            {"id": "NTK", "lat": "22.3068", "long": "114.2378"},
            {"id": "KWT", "lat": "22.3118", "long": "114.2258"},
            {"id": "LAT", "lat": "22.2968", "long": "114.2378"},
            {"id": "YAT", "lat": "22.2988", "long": "114.2378"},
            {"id": "TIK", "lat": "22.2858", "long": "114.2478"}
        ],
        "first": "WHA",
        "last": "TIK"
    }
}

MTR_INTERCHANGES = {
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
}

STATION_NAMES = {
    "HOK": "Hong Kong",
    "KOW": "Kowloon",
    "TSY": "Tsing Yi",
    "AIR": "Airport",
    "AWE": "AsiaWorld-Expo",
    "OLY": "Olympic",
    "NAC": "Nam Cheong",
    "LAK": "Lai King",
    "SUN": "Sunny Bay",
    "TUC": "Tung Chung",
    "WKS": "Wu Kai Sha",
    "MOS": "Ma On Shan",
    "HEO": "Heng On",
    "TSH": "Tai Shui Hang",
    "SHM": "Shek Mun",
    "CIO": "City One",
    "STW": "Sha Tin Wai",
    "CKT": "Che Kung Temple",
    "TAW": "Tai Wai",
    "HIK": "Hin Keng",
    "DIH": "Diamond Hill",
    "KAT": "Kai Tak",
    "SUW": "Sung Wong Toi",
    "TKW": "To Kwa Wan",
    "HOM": "Ho Man Tin",
    "HUH": "Hung Hom",
    "ETS": "East Tsim Sha Tsui",
    "AUS": "Austin",
    "MEF": "Mei Foo",
    "TWW": "Tsuen Wan West",
    "KSR": "Kam Sheung Road",
    "YUL": "Yuen Long",
    "LOP": "Long Ping",
    "TIS": "Tin Shui Wai",
    "SIH": "Siu Hong",
    "TUM": "Tuen Mun",
    "NOP": "North Point",
    "QUB": "Quarry Bay",
    "YAT": "Yau Tong",
    "TIK": "Tiu Keng Leng",
    "TKO": "Tseung Kwan O",
    "LHP": "LOHAS Park",
    "HAH": "Hang Hau",
    "POA": "Po Lam",
    "LOW": "Lo Wu",
    "SHS": "Sheung Shui",
    "FAN": "Fanling",
    "TAP": "Tai Po Market",
    "TWO": "Tai Wo",
    "UNI": "University",
    "FOT": "Fo Tan",
    "SHT": "Sha Tin",
    "KOT": "Kowloon Tong",
    "ADM": "Admiralty",
    "OCP": "Ocean Park",
    "WCH": "Wong Chuk Hang",
    "LET": "Lei Tung",
    "SOH": "South Horizons",
    "CEN": "Central",
    "TST": "Tsim Sha Tsui",
    "JOR": "Jordan",
    "YMT": "Yau Ma Tei",
    "MOK": "Mong Kok",
    "PRE": "Prince Edward",
    "SSP": "Sham Shui Po",
    "CSW": "Cheung Sha Wan",
    "LCK": "Lai Chi Kok",
    "KWF": "Kwai Fong",
    "KWH": "Kwai Hing",
    "TWH": "Tai Wo Hau",
    "TSW": "Tsuen Wan",
    "KET": "Kennedy Town",
    "HKU": "HKU",
    "SYP": "Sai Ying Pun",
    "SHW": "Sheung Wan",
    "WAC": "Wan Chai",
    "CAB": "Causeway Bay",
    "TIH": "Tin Hau",
    "FOH": "Fortress Hill",
    "TAK": "Tai Koo",
    "SWH": "Sai Wan Ho",
    "SKW": "Shau Kei Wan",
    "HFC": "Heng Fa Chuen",
    "CHW": "Chai Wan",
    "WHA": "Whampoa",
    "LOF": "Lok Fu",
    "WTS": "Wong Tai Sin",
    "CHH": "Choi Hung",
    "KOB": "Kowloon Bay",
    "NTK": "Ngau Tau Kok",
    "KWT": "Kwun Tong",
    "LAT": "Lam Tin"
}

# Function to fetch data with retry logic
def fetch_with_retry(url, retries=5, backoff=1000):
    for i in range(retries):
        try:
            print(f"Fetching {url} (Attempt {i + 1}/{retries})")
            response = requests.get(url, timeout=10)
            if response.status_code == 429:
                print(f"Rate limit exceeded for {url}, retrying after {backoff * (2 ** i)}ms")
                time.sleep(backoff * (2 ** i) / 1000)
                continue
            response.raise_for_status()
            data = response.json()
            print(f"Successfully fetched {url}")
            return data
        except requests.exceptions.RequestException as err:
            print(f"Error fetching {url}: {err}")
            if 'response' in locals():
                print(f"Response status: {response.status_code}")
                print(f"Response text: {response.text}")
            if i == retries - 1:
                return None
            time.sleep(backoff * (2 ** i) / 1000)
    return None

# Process KMB data
def process_kmb_data(data):
    unique_routes = []
    seen = set()
    for route in data:
        if not all(key in route for key in ['route', 'bound', 'orig_en', 'dest_en']):
            print(f"Invalid KMB route entry: {route}")
            continue
        key = f"{route['route']}-{route['bound']}"
        if key not in seen:
            seen.add(key)
            unique_routes.append({
                'route': route['route'],
                'bound': route['bound'],
                'orig_en': route['orig_en'],
                'dest_en': route['dest_en'],
                'provider': 'kmb'
            })
    return unique_routes

# Process CTB data
def process_ctb_data(data):
    unique_routes = []
    seen = set()
    for route in data:
        if 'route' not in route or 'orig_en' not in route:
            print(f"Invalid CTB route entry: {route}")
            continue
        direction = route.get('direction', 'outbound')
        dest_en = route.get('dest_en', route.get('dest_tc', 'Unknown Destination'))
        key = f"{route['route']}-{direction}"
        if key not in seen:
            seen.add(key)
            unique_routes.append({
                'route': route['route'],
                'bound': 'O' if direction == 'outbound' else 'I',
                'orig_en': route['orig_en'],
                'dest_en': dest_en,
                'provider': 'ctb'
            })
    return unique_routes

# Process Minibus data
def process_minibus_data():
    minibus_route_response = fetch_with_retry(MINIBUS_URL)
    if not minibus_route_response or 'data' not in minibus_route_response:
        raise ValueError("Minibus route data is missing 'data' property")
    
    routes_data = minibus_route_response['data']['routes']
    minibus_routes = []
    for region, routes in routes_data.items():
        if isinstance(routes, list):
            minibus_routes.extend([{'route': route, 'region': region} for route in routes])

    unique_routes = []
    seen = set()
    for route_info in minibus_routes:
        route = route_info['route']
        region = route_info['region']
        route_url = f"https://data.etagmb.gov.hk/route/{region}/{route}"
        try:
            route_response = fetch_with_retry(route_url)
            if not route_response or 'data' not in route_response or not route_response['data']:
                continue
            service = route_response['data'][0]
            for direction in service['directions']:
                key = f"{route}-{direction['route_seq']}"
                if key not in seen:
                    seen.add(key)
                    unique_routes.append({
                        'route': route,
                        'bound': direction['route_seq'],
                        'route_id': service['route_id'],
                        'region': region,
                        'orig_en': direction.get('orig_en', 'Loading...'),
                        'dest_en': direction.get('dest_en', 'Loading...'),
                        'provider': 'minibus'
                    })
        except Exception as err:
            print(f"Failed to load details for minibus route {route} in {region}: {err}")
    return unique_routes

# Process stop data
def process_stop_data(ctb_routes, minibus_routes):
    stop_data = {
        'kmb_stops': {},
        'ctb_stops': {},
        'minibus_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    try:
        print("Fetching KMB stops...")
        kmb_stops_response = fetch_with_retry(KMB_STOPS_URL)
        if kmb_stops_response and 'data' in kmb_stops_response:
            for stop in kmb_stops_response['data']:
                stop_data['kmb_stops'][stop['stop']] = {
                    'name_en': stop['name_en'],
                    'lat': stop['lat'],
                    'long': stop['long']
                }
        print(f"KMB stops fetched: {len(stop_data['kmb_stops'])} stops")
    except Exception as err:
        print(f"Failed to load KMB stops: {err}")

    try:
        print("Fetching CTB stops...")
        ctb_stops_map = {}
        for route in ctb_routes:
            route_name = route['route']
            directions = ['outbound', 'inbound']
            for direction in directions:
                url = f"{CTB_ROUTE_STOP_BASE_URL}{route_name}/{direction}"
                data = fetch_with_retry(url)
                if data and 'data' in data and data['data']:
                    for stop in data['data']:
                        stop_id = stop.get('stop_id', stop.get('stop'))
                        if stop_id and stop_id not in ctb_stops_map:
                            stop_details_url = f"{CTB_STOPS_BASE_URL}{stop_id}"
                            stop_details = fetch_with_retry(stop_details_url)
                            if stop_details and 'data' in stop_details:
                                stop_info = stop_details['data']
                                ctb_stops_map[stop_id] = {
                                    'name_en': stop_info.get('name_en', 'Unknown'),
                                    'lat': stop_info.get('lat', 'Unknown'),
                                    'long': stop_info.get('long', 'Unknown')
                                }
                            else:
                                print(f"Failed to fetch stop details for {stop_id}")
                else:
                    print(f"No valid data for {route_name} ({direction}): {data}")
        stop_data['ctb_stops'] = ctb_stops_map
        print(f"CTB stops fetched: {len(stop_data['ctb_stops'])} stops")
    except Exception as err:
        print(f"Failed to load CTB stops: {err}")

    try:
        print("Fetching Minibus stops...")
        for route in minibus_routes:
            route_url = f"https://data.etagmb.gov.hk/route-stop/{route['route_id']}/{route['bound']}"
            route_stops = fetch_with_retry(route_url)
            if route_stops and 'data' in route_stops and 'route_stops' in route_stops['data']:
                for stop in route_stops['data']['route_stops']:
                    stop_id = stop['stop_id']
                    if stop_id not in stop_data['minibus_stops']:
                        stop_details = fetch_with_retry(f"{MINIBUS_STOPS_BASE_URL}{stop_id}")
                        if stop_details and 'data' in stop_details:
                            coords = stop_details['data']['coordinates']['wgs84']
                            stop_data['minibus_stops'][stop_id] = {
                                'name_en': stop_details['data'].get('name_en', stop.get('name_en', 'Unknown')),
                                'lat': coords['latitude'],
                                'long': coords['longitude']
                            }
        print(f"Minibus stops fetched: {len(stop_data['minibus_stops'])} stops")
    except Exception as err:
        print(f"Failed to load Minibus stops: {err}")

    return stop_data

# Process route-stop data
def process_route_stop_data(kmb_routes, ctb_routes, minibus_routes):
    route_stop_data = {
        'kmb_route_stops': {},
        'ctb_route_stops': {},
        'minibus_route_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    try:
        print("Fetching KMB route-stops...")
        kmb_route_stop_response = fetch_with_retry(KMB_ROUTE_STOP_URL)
        if kmb_route_stop_response and 'data' in kmb_route_stop_response:
            for route in kmb_routes:
                key = f"{route['route']}-{route['bound']}"
                route_stop_data['kmb_route_stops'][key] = [
                    {
                        'stop_id': item['stop'],
                        'seq': item['seq']
                    }
                    for item in kmb_route_stop_response['data']
                    if item['route'] == route['route'] and item['bound'] == route['bound']
                ]
                route_stop_data['kmb_route_stops'][key].sort(key=lambda x: x['seq'])
        print(f"KMB route-stops fetched: {len(route_stop_data['kmb_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load KMB route-stops: {err}")

    try:
        print("Fetching CTB route-stops...")
        for route in ctb_routes:
            direction = 'outbound' if route['bound'] == 'O' else 'inbound'
            route_stop_url = f"{CTB_ROUTE_STOP_BASE_URL}{route['route']}/{direction}"
            route_stops = fetch_with_retry(route_stop_url)
            if route_stops and 'data' in route_stops:
                key = f"{route['route']}-{route['bound']}"
                route_stop_data['ctb_route_stops'][key] = [
                    {
                        'stop_id': stop.get('stop_id', stop.get('stop')),
                        'seq': stop['seq']
                    }
                    for stop in route_stops['data']
                ]
                route_stop_data['ctb_route_stops'][key].sort(key=lambda x: x['seq'])
        print(f"CTB route-stops fetched: {len(route_stop_data['ctb_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load CTB route-stops: {err}")

    try:
        print("Fetching Minibus route-stops...")
        for route in minibus_routes:
            route_url = f"https://data.etagmb.gov.hk/route-stop/{route['route_id']}/{route['bound']}"
            route_stops = fetch_with_retry(route_url)
            if route_stops and 'data' in route_stops and 'route_stops' in route_stops['data']:
                key = f"{route['route']}-{route['bound']}"
                route_stop_data['minibus_route_stops'][key] = [
                    {
                        'stop_id': stop['stop_id'],
                        'seq': stop['stop_seq']
                    }
                    for stop in route_stops['data']['route_stops']
                ]
                route_stop_data['minibus_route_stops'][key].sort(key=lambda x: x['seq'])
        print(f"Minibus route-stops fetched: {len(route_stop_data['minibus_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load Minibus route-stops: {err}")

    return route_stop_data

# Process MTR data
def process_mtr_data():
    mtr_data = {
        'trainLines': MTR_LINES,
        'lines': MTR_STATIONS,
        'interchangeStations': MTR_INTERCHANGES,
        'stationNames': STATION_NAMES,
        'timestamp': int(time.time() * 1000)
    }
    print(f"MTR data prepared: {len(mtr_data['trainLines'])} train lines, {len(mtr_data['lines'])} lines, {len(mtr_data['interchangeStations'])} interchange stations")
    return mtr_data

# Check if cached data is still valid
def is_cache_valid(file_path):
    if not os.path.exists(file_path):
        return False
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    timestamp = data.get('timestamp', 0)
    current_time = int(time.time() * 1000)
    return (current_time - timestamp) < (CACHE_EXPIRY * 1000)

# Fetch and store all transport data
def fetch_and_store_data():
    os.makedirs(os.path.dirname(ROUTE_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(ROUTE_STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(MTR_DATA_JSON_FILE), exist_ok=True)

    # Route data
    route_data = {
        'kmb_routes': [],
        'ctb_routes': [],
        'minibus_routes': [],
        'timestamp': int(time.time() * 1000)
    }

    try:
        print("Fetching KMB routes...")
        kmb_response = fetch_with_retry(KMB_URL)
        if not kmb_response or 'data' not in kmb_response:
            raise ValueError("KMB route data is missing 'data' property")
        route_data['kmb_routes'] = process_kmb_data(kmb_response['data'])
        print(f"KMB routes fetched: {len(route_data['kmb_routes'])} routes")
    except Exception as err:
        print(f"Failed to load KMB routes: {err}")

    try:
        print("Fetching CTB routes...")
        ctb_response = fetch_with_retry(CTB_URL)
        if ctb_response:
            if 'data' not in ctb_response:
                raise ValueError("CTB route data is missing 'data' property")
            route_data['ctb_routes'] = process_ctb_data(ctb_response['data'])
            print(f"CTB routes fetched: {len(route_data['ctb_routes'])} routes")
        else:
            raise ValueError("CTB route fetch returned None")
    except Exception as err:
        print(f"Failed to load CTB routes: {err}")

    try:
        print("Fetching Minibus routes...")
        route_data['minibus_routes'] = process_minibus_data()
        print(f"Minibus routes fetched: {len(route_data['minibus_routes'])} routes")
    except Exception as err:
        print(f"Failed to load Minibus routes: {err}")

    with open(ROUTE_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_data, f, ensure_ascii=False, indent=4)
    print(f"Route data saved to {ROUTE_JSON_FILE}")

    # Stop data
    stop_data = process_stop_data(route_data['ctb_routes'], route_data['minibus_routes'])
    with open(STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(stop_data, f, ensure_ascii=False, indent=4)
    print(f"Stop data saved to {STOP_JSON_FILE}")

    # Route-stop data
    route_stop_data = process_route_stop_data(route_data['kmb_routes'], route_data['ctb_routes'], route_data['minibus_routes'])
    with open(ROUTE_STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_stop_data, f, ensure_ascii=False, indent=4)
    print(f"Route-stop data saved to {ROUTE_STOP_JSON_FILE}")

    # MTR data
    mtr_data = process_mtr_data()
    with open(MTR_DATA_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(mtr_data, f, ensure_ascii=False, indent=4)
    print(f"MTR data saved to {MTR_DATA_JSON_FILE}")

# Main loop
def main():
    while True:
        if not all(is_cache_valid(file) for file in [ROUTE_JSON_FILE, STOP_JSON_FILE, ROUTE_STOP_JSON_FILE, MTR_DATA_JSON_FILE]):
            print("Cache expired or missing, fetching new data...")
            fetch_and_store_data()
        else:
            print("Cache is still valid, skipping fetch...")
        print(f"Sleeping for {CACHE_EXPIRY} seconds (24 hours)...")
        time.sleep(CACHE_EXPIRY)

if __name__ == "__main__":
    main()