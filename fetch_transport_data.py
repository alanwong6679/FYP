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

# Main loop
def main():
    while True:
        if not all(is_cache_valid(file) for file in [ROUTE_JSON_FILE, STOP_JSON_FILE, ROUTE_STOP_JSON_FILE]):
            print("Cache expired or missing, fetching new data...")
            fetch_and_store_data()
        else:
            print("Cache is still valid, skipping fetch...")
        print(f"Sleeping for {CACHE_EXPIRY} seconds (24 hours)...")
        time.sleep(CACHE_EXPIRY)

if __name__ == "__main__":
    main()