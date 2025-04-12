import requests
import json
import time
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Constants (unchanged)
CACHE_EXPIRY = 24 * 60 * 60
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

# MTR data (unchanged, omitted for brevity)
MTR_LINES = [...]  # Same as original
MTR_STATIONS = {...}
MTR_INTERCHANGES = {...}
STATION_NAMES = {...}

# Fetch with retry (unchanged)
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

# Process KMB data (unchanged)
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

# Process CTB data (unchanged)
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

# Process Minibus data (optimized for parallelism)
def fetch_minibus_route_details(route_info):
    route = route_info['route']
    region = route_info['region']
    route_url = f"https://data.etagmb.gov.hk/route/{region}/{route}"
    try:
        route_response = fetch_with_retry(route_url)
        if not route_response or 'data' not in route_response or not route_response['data']:
            return []
        service = route_response['data'][0]
        unique_routes = []
        seen = set()
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
        return unique_routes
    except Exception as err:
        print(f"Failed to load details for minibus route {route} in {region}: {err}")
        return []

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
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_route = {executor.submit(fetch_minibus_route_details, route_info): route_info for route_info in minibus_routes}
        for future in as_completed(future_to_route):
            try:
                routes = future.result()
                unique_routes.extend(routes)
            except Exception as err:
                route_info = future_to_route[future]
                print(f"Error processing route {route_info['route']} in {route_info['region']}: {err}")
    return unique_routes

# Process stop data (parallelized stop ID collection)
def fetch_ctb_route_stops_for_ids(route, direction):
    url = f"{CTB_ROUTE_STOP_BASE_URL}{route['route']}/{direction}"
    stop_ids = set()
    data = fetch_with_retry(url)
    if data and 'data' in data and data['data']:
        for stop in data['data']:
            stop_id = stop.get('stop_id', stop.get('stop'))
            if stop_id:
                stop_ids.add(stop_id)
    else:
        print(f"No valid data for {route['route']} ({direction})")
    return stop_ids

def fetch_minibus_route_stops_for_ids(route):
    route_url = f"https://data.etagmb.gov.hk/route-stop/{route['route_id']}/{route['bound']}"
    stop_ids = set()
    route_stops = fetch_with_retry(route_url)
    if route_stops and 'data' in route_stops and 'route_stops' in route_stops['data']:
        for stop in route_stops['data']['route_stops']:
            stop_ids.add(stop['stop_id'])
    return stop_ids

def fetch_ctb_stop_details(stop_id):
    stop_details_url = f"{CTB_STOPS_BASE_URL}{stop_id}"
    stop_details = fetch_with_retry(stop_details_url)
    if stop_details and 'data' in stop_details:
        stop_info = stop_details['data']
        return stop_id, {
            'name_en': stop_info.get('name_en', 'Unknown'),
            'lat': stop_info.get('lat', 'Unknown'),
            'long': stop_info.get('long', 'Unknown')
        }
    return stop_id, None

def fetch_minibus_stop_details(stop_id):
    stop_details = fetch_with_retry(f"{MINIBUS_STOPS_BASE_URL}{stop_id}")
    if stop_details and 'data' in stop_details:
        coords = stop_details['data']['coordinates']['wgs84']
        return stop_id, {
            'name_en': stop_details['data'].get('name_en', 'Unknown'),
            'lat': coords['latitude'],
            'long': coords['longitude']
        }
    return stop_id, None

def process_stop_data(ctb_routes, minibus_routes):
    stop_data = {
        'kmb_stops': {},
        'ctb_stops': {},
        'minibus_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    # KMB stops (unchanged, single API call)
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

    # CTB stops (parallelized stop ID collection)
    try:
        print("Fetching CTB stop IDs...")
        ctb_stop_ids = set()
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for route in ctb_routes:
                for direction in ['outbound', 'inbound']:
                    futures.append(executor.submit(fetch_ctb_route_stops_for_ids, route, direction))
            for future in as_completed(futures):
                stop_ids = future.result()
                ctb_stop_ids.update(stop_ids)
        print(f"CTB stop IDs collected: {len(ctb_stop_ids)}")

        print("Fetching CTB stop details...")
        ctb_stops_map = {}
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_stop = {executor.submit(fetch_ctb_stop_details, stop_id): stop_id for stop_id in ctb_stop_ids}
            for future in as_completed(future_to_stop):
                stop_id, stop_info = future.result()
                if stop_info:
                    ctb_stops_map[stop_id] = stop_info
                else:
                    print(f"Failed to fetch stop details for {stop_id}")
        stop_data['ctb_stops'] = ctb_stops_map
        print(f"CTB stops fetched: {len(stop_data['ctb_stops'])} stops")
    except Exception as err:
        print(f"Failed to load CTB stops: {err}")

    # Minibus stops (parallelized stop ID collection)
    try:
        print("Fetching Minibus stop IDs...")
        minibus_stop_ids = set()
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_route = {executor.submit(fetch_minibus_route_stops_for_ids, route): route for route in minibus_routes}
            for future in as_completed(future_to_route):
                stop_ids = future.result()
                minibus_stop_ids.update(stop_ids)
        print(f"Minibus stop IDs collected: {len(minibus_stop_ids)}")

        print("Fetching Minibus stop details...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_stop = {executor.submit(fetch_minibus_stop_details, stop_id): stop_id for stop_id in minibus_stop_ids}
            for future in as_completed(future_to_stop):
                stop_id, stop_info = future.result()
                if stop_info:
                    stop_data['minibus_stops'][stop_id] = stop_info
        print(f"Minibus stops fetched: {len(stop_data['minibus_stops'])} stops")
    except Exception as err:
        print(f"Failed to load Minibus stops: {err}")

    return stop_data

# Process route-stop data (unchanged, already parallelized with 10 workers)
def fetch_kmb_route_stops(route):
    key = f"{route['route']}-{route['bound']}"
    kmb_route_stop_response = fetch_with_retry(KMB_ROUTE_STOP_URL)
    if kmb_route_stop_response and 'data' in kmb_route_stop_response:
        stops = [
            {
                'stop_id': item['stop'],
                'seq': item['seq']
            }
            for item in kmb_route_stop_response['data']
            if item['route'] == route['route'] and item['bound'] == route['bound']
        ]
        stops.sort(key=lambda x: x['seq'])
        return key, stops
    return key, []

def fetch_ctb_route_stops(route):
    direction = 'outbound' if route['bound'] == 'O' else 'inbound'
    route_stop_url = f"{CTB_ROUTE_STOP_BASE_URL}{route['route']}/{direction}"
    route_stops = fetch_with_retry(route_stop_url)
    key = f"{route['route']}-{route['bound']}"
    if route_stops and 'data' in route_stops:
        stops = [
            {
                'stop_id': stop.get('stop_id', stop.get('stop')),
                'seq': stop['seq']
            }
            for stop in route_stops['data']
        ]
        stops.sort(key=lambda x: x['seq'])
        return key, stops
    return key, []

def fetch_minibus_route_stops(route):
    route_url = f"https://data.etagmb.gov.hk/route-stop/{route['route_id']}/{route['bound']}"
    route_stops = fetch_with_retry(route_url)
    key = f"{route['route']}-{route['bound']}"
    if route_stops and 'data' in route_stops and 'route_stops' in route_stops['data']:
        stops = [
            {
                'stop_id': stop['stop_id'],
                'seq': stop['stop_seq']
            }
            for stop in route_stops['data']['route_stops']
        ]
        stops.sort(key=lambda x: x['seq'])
        return key, stops
    return key, []

def process_route_stop_data(kmb_routes, ctb_routes, minibus_routes):
    route_stop_data = {
        'kmb_route_stops': {},
        'ctb_route_stops': {},
        'minibus_route_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    try:
        print("Fetching KMB route-stops...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_route = {executor.submit(fetch_kmb_route_stops, route): route for route in kmb_routes}
            for future in as_completed(future_to_route):
                key, stops = future.result()
                route_stop_data['kmb_route_stops'][key] = stops
        print(f"KMB route-stops fetched: {len(route_stop_data['kmb_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load KMB route-stops: {err}")

    try:
        print("Fetching CTB route-stops...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_route = {executor.submit(fetch_ctb_route_stops, route): route for route in ctb_routes}
            for future in as_completed(future_to_route):
                key, stops = future.result()
                route_stop_data['ctb_route_stops'][key] = stops
        print(f"CTB route-stops fetched: {len(route_stop_data['ctb_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load CTB route-stops: {err}")

    try:
        print("Fetching Minibus route-stops...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_route = {executor.submit(fetch_minibus_route_stops, route): route for route in minibus_routes}
            for future in as_completed(future_to_route):
                key, stops = future.result()
                route_stop_data['minibus_route_stops'][key] = stops
        print(f"Minibus route-stops fetched: {len(route_stop_data['minibus_route_stops'])} routes")
    except Exception as err:
        print(f"Failed to load Minibus route-stops: {err}")

    return route_stop_data

# Process MTR data (unchanged)
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

# Cache validity check (unchanged)
def is_cache_valid(file_path):
    if not os.path.exists(file_path):
        return False
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    timestamp = data.get('timestamp', 0)
    current_time = int(time.time() * 1000)
    return (current_time - timestamp) < (CACHE_EXPIRY * 1000)

# Fetch and store data (parallelized across providers)
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

    def fetch_kmb_routes():
        try:
            print("Fetching KMB routes...")
            kmb_response = fetch_with_retry(KMB_URL)
            if not kmb_response or 'data' not in kmb_response:
                raise ValueError("KMB route data is missing 'data' property")
            return process_kmb_data(kmb_response['data'])
        except Exception as err:
            print(f"Failed to load KMB routes: {err}")
            return []

    def fetch_ctb_routes():
        try:
            print("Fetching CTB routes...")
            ctb_response = fetch_with_retry(CTB_URL)
            if ctb_response:
                if 'data' not in ctb_response:
                    raise ValueError("CTB route data is missing 'data' property")
                return process_ctb_data(ctb_response['data'])
            raise ValueError("CTB route fetch returned None")
        except Exception as err:
            print(f"Failed to load CTB routes: {err}")
            return []

    def fetch_minibus_routes():
        try:
            print("Fetching Minibus routes...")
            return process_minibus_data()
        except Exception as err:
            print(f"Failed to load Minibus routes: {err}")
            return []

    # Fetch routes concurrently (use 10 workers to allow overlap with other tasks)
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_kmb = executor.submit(fetch_kmb_routes)
        future_ctb = executor.submit(fetch_ctb_routes)
        future_minibus = executor.submit(fetch_minibus_routes)

        route_data['kmb_routes'] = future_kmb.result()
        route_data['ctb_routes'] = future_ctb.result()
        route_data['minibus_routes'] = future_minibus.result()

    print(f"KMB routes fetched: {len(route_data['kmb_routes'])} routes")
    print(f"CTB routes fetched: {len(route_data['ctb_routes'])} routes")
    print(f"Minibus routes fetched: {len(route_data['minibus_routes'])} routes")

    with open(ROUTE_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_data, f, ensure_ascii=False, indent=4)
    print(f"Route data saved to {ROUTE_JSON_FILE}")

    # Stop data (already parallelized)
    stop_data = process_stop_data(route_data['ctb_routes'], route_data['minibus_routes'])
    with open(STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(stop_data, f, ensure_ascii=False, indent=4)
    print(f"Stop data saved to {STOP_JSON_FILE}")

    # Route-stop data (already parallelized)
    route_stop_data = process_route_stop_data(route_data['kmb_routes'], route_data['ctb_routes'], route_data['minibus_routes'])
    with open(ROUTE_STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_stop_data, f, ensure_ascii=False, indent=4)
    print(f"Route-stop data saved to {ROUTE_STOP_JSON_FILE}")

    # MTR data
    mtr_data = process_mtr_data()
    with open(MTR_DATA_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(mtr_data, f, ensure_ascii=False, indent=4)
    print(f"MTR data saved to {MTR_DATA_JSON_FILE}")

# Main loop (unchanged)
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