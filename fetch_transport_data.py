import requests
import json
import time
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Constants
CACHE_EXPIRY = 24 * 60 * 60  # Cache expiry in seconds (24 hours)
KMB_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route/"
CTB_URL = "https://rt.data.gov.hk/v2/transport/citybus/route/CTB"
MINIBUS_URL = "https://data.etagmb.gov.hk/route"
KMB_STOPS_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop"
CTB_STOPS_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/stop/"
CTB_ROUTE_STOP_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/"
MINIBUS_STOPS_BASE_URL = "https://data.etagmb.gov.hk/stop/"
MINIBUS_STOP_ROUTE_BASE_URL = "https://data.etagmb.gov.hk/stop-route/"
KMB_ROUTE_STOP_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"
MINIBUS_STOP_ROUTE_BASE_URL = "https://data.etagmb.gov.hk/stop-route/"
BUS_FARE_URL = "https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json"
GMB_FARE_URL = "https://static.data.gov.hk/td/routes-fares-geojson/JSON_GMB.json"
ROUTE_JSON_FILE = "static/data/route_data.json"
STOP_JSON_FILE = "static/data/stop_data.json"
ROUTE_STOP_JSON_FILE = "static/data/route-stop_data.json"
ROUTE_FEE_JSON_FILE = "static/data/route_fee_data.json"
MAX_WORKERS = 10

# Function to fetch data with retry logic and BOM handling
def fetch_with_retry(url, retries=5, backoff=1000):
    for i in range(retries):
        try:
            print(f"Fetching {url} (Attempt {i + 1}/{retries})")
            response = requests.get(url, timeout=10)
            if response.status_code == 429:
                print(f"Rate limit exceeded for {url}, retrying after {backoff * (2 ** i)}ms")
                time.sleep(backoff * (2 ** i) / 1000)
                continue
            if response.status_code in [404, 400]:  # Fail fast on client errors
                print(f"Client error {response.status_code} for {url}, skipping retries")
                return None
            response.raise_for_status()
            text = response.content.decode('utf-8-sig')
            data = json.loads(text)
            print(f"Successfully fetched {url}. Data size: {len(data) if isinstance(data, (list, dict)) else 'N/A'}")
            return data
        except requests.exceptions.RequestException as err:
            print(f"Error fetching {url}: {err}")
            if 'response' in locals():
                print(f"Response status: {response.status_code}")
                print(f"Response text: {response.text[:500]}")
            if i == retries - 1:
                print(f"Failed to fetch {url} after {retries} attempts")
                return None
            time.sleep(backoff * (2 ** i) / 1000)
        except json.JSONDecodeError as err:
            print(f"JSON decode error for {url}: {err}")
            if 'response' in locals():
                print(f"Response text: {response.text[:500]}")
            if i == retries - 1:
                print(f"Failed to parse JSON from {url} after {retries} attempts")
                return None
            time.sleep(backoff * (2 ** i) / 1000)
    return None

# Process KMB data (unchanged)
def process_kmb_data(data):
    if not data:
        print("No KMB data to process")
        return []
    print(f"Processing KMB data with {len(data)} entries")
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
    print(f"KMB processed: {len(unique_routes)} unique routes")
    return unique_routes

# Process CTB data (unchanged)
def process_ctb_data(data):
    if not data:
        print("No CTB data to process")
        return []
    print(f"Processing CTB data with {len(data)} entries")
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
    print(f"CTB processed: {len(unique_routes)} unique routes")
    return unique_routes

# Process Minibus data (unchanged)
def process_minibus_data():
    minibus_route_response = fetch_with_retry(MINIBUS_URL)
    if not minibus_route_response or 'data' not in minibus_route_response:
        print("Failed to fetch Minibus route data or missing 'data' property")
        return []
    
    routes_data = minibus_route_response['data']['routes']
    print(f"Minibus routes data: {len(routes_data)} regions")
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
                print(f"No valid data for Minibus route {route} in {region}")
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
    print(f"Minibus processed: {len(unique_routes)} unique routes")
    return unique_routes

# Updated process_stop_data with full parallelization
def process_stop_data(ctb_routes, minibus_routes):
    stop_data = {
        'kmb_stops': {},
        'ctb_stops': {},
        'minibus_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    # Validate CTB route IDs
    print("Validating CTB route IDs...")
    ctb_validation_start = time.time()
    ctb_route_response = fetch_with_retry(CTB_URL)
    valid_ctb_route_ids = set()
    if ctb_route_response and 'data' in ctb_route_response:
        for route in ctb_route_response['data']:
            valid_ctb_route_ids.add(route.get('route'))
    
    valid_ctb_routes = [route for route in ctb_routes if route.get('route') in valid_ctb_route_ids]
    invalid_ctb_routes = [route.get('route') for route in ctb_routes if route.get('route') not in valid_ctb_route_ids]
    if invalid_ctb_routes:
        print(f"Warning: {len(invalid_ctb_routes)} invalid CTB routes skipped:")
        for route_id in invalid_ctb_routes[:10]:
            print(f"- {route_id}")
    print(f"Valid CTB routes: {len(valid_ctb_routes)} in {time.time() - ctb_validation_start:.2f}s")

    # Validate Minibus route IDs
    print("Validating Minibus route IDs...")
    minibus_validation_start = time.time()
    minibus_route_response = fetch_with_retry(MINIBUS_URL)
    valid_minibus_route_ids = set()

    def fetch_minibus_route_details(region, route):
        url = f"https://data.etagmb.gov.hk/route/{region}/{route}"
        response = fetch_with_retry(url)
        return region, route, response

    if minibus_route_response and 'data' in minibus_route_response:
        route_tasks = [(region, route) for region, routes in minibus_route_response['data']['routes'].items() for route in routes]
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_task = {executor.submit(fetch_minibus_route_details, region, route): (region, route) for region, route in route_tasks}
            for future in as_completed(future_to_task):
                region, route, response = future.result()
                if response and 'data' in response and response['data']:
                    for service in response['data']:
                        valid_minibus_route_ids.add((region, service['route_id']))

    valid_minibus_routes = [route for route in minibus_routes if (route.get('region'), route.get('route_id')) in valid_minibus_route_ids]
    invalid_minibus_routes = [(route.get('region'), route.get('route_id')) for route in minibus_routes if (route.get('region'), route.get('route_id')) not in valid_minibus_route_ids]
    if invalid_minibus_routes:
        print(f"Warning: {len(invalid_minibus_routes)} invalid Minibus routes skipped:")
        for region, route_id in invalid_minibus_routes[:10]:
            print(f"- {region}/{route_id}")
    print(f"Valid Minibus routes: {len(valid_minibus_routes)} in {time.time() - minibus_validation_start:.2f}s")

    # Fetch KMB stops
    print("Fetching KMB stops...")
    kmb_start = time.time()
    kmb_response = fetch_with_retry(KMB_STOPS_URL)
    if kmb_response and 'data' in kmb_response:
        for stop in kmb_response['data']:
            stop_id = stop.get('stop')
            if stop_id:
                stop_data['kmb_stops'][stop_id] = {
                    'name_en': stop.get('name_en', ''),
                    'lat': stop.get('lat', ''),
                    'long': stop.get('long', '')
                }
    print(f"KMB stops fetched: {len(stop_data['kmb_stops'])} stops in {time.time() - kmb_start:.2f}s")

    # Fetch CTB stops
    print("Fetching CTB stops...")
    ctb_start = time.time()
    ctb_stop_ids = set()

    def fetch_ctb_route_stop(route_id, direction):
        url = f"{CTB_ROUTE_STOP_BASE_URL}{route_id}/{direction}"
        response = fetch_with_retry(url)
        return route_id, direction, response

    ctb_route_tasks = [(route['route'], direction) for route in valid_ctb_routes for direction in ['outbound', 'inbound']]
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_task = {executor.submit(fetch_ctb_route_stop, route_id, direction): (route_id, direction) for route_id, direction in ctb_route_tasks}
        for future in as_completed(future_to_task):
            route_id, direction, response = future.result()
            if response and 'data' in response:
                for stop in response['data']:
                    stop_id = stop.get('stop')
                    if stop_id:
                        ctb_stop_ids.add(stop_id)

    def fetch_ctb_stop(stop_id):
        url = f"{CTB_STOPS_BASE_URL}{stop_id}"
        response = fetch_with_retry(url)
        return stop_id, response

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_stop = {executor.submit(fetch_ctb_stop, stop_id): stop_id for stop_id in ctb_stop_ids}
        for future in as_completed(future_to_stop):
            stop_id, response = future.result()
            if response and 'data' in response:
                data = response['data']
                stop_data['ctb_stops'][stop_id] = {
                    'name_en': data.get('name_en', ''),
                    'lat': data.get('lat', ''),
                    'long': data.get('long', '')
                }
    print(f"CTB stops fetched: {len(stop_data['ctb_stops'])} stops in {time.time() - ctb_start:.2f}s")

    # Fetch Minibus stops
    print("Fetching Minibus stops...")
    minibus_start = time.time()
    minibus_stop_ids = set()

    def fetch_minibus_route_stop(region, route_id):
        url = f"{MINIBUS_STOP_ROUTE_BASE_URL}{region}/{route_id}"
        response = fetch_with_retry(url)
        return region, route_id, response

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_route = {
            executor.submit(fetch_minibus_route_stop, route['region'], route['route_id']): route
            for route in valid_minibus_routes if route.get('region') and route.get('route_id')
        }
        for future in as_completed(future_to_route):
            region, route_id, response = future.result()
            if response and 'data' in response:
                for stop in response['data'].get('stops', []):
                    stop_id = stop.get('stop_id')
                    if stop_id:
                        minibus_stop_ids.add(stop_id)

    def fetch_minibus_stop(stop_id):
        url = f"{MINIBUS_STOPS_BASE_URL}{stop_id}"
        response = fetch_with_retry(url)
        return stop_id, response

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_stop = {executor.submit(fetch_minibus_stop, stop_id): stop_id for stop_id in minibus_stop_ids}
        for future in as_completed(future_to_stop):
            stop_id, response = future.result()
            if response and 'data' in response:
                data = response['data']
                stop_data['minibus_stops'][stop_id] = {
                    'name_en': data.get('name_en', ''),
                    'lat': data.get('lat', ''),
                    'long': data.get('long', '')
                }
    print(f"Minibus stops fetched: {len(stop_data['minibus_stops'])} stops in {time.time() - minibus_start:.2f}s")

    return stop_data

# Process route-stop data (unchanged placeholder)
def process_route_stop_data(kmb_routes, ctb_routes, minibus_routes):
    print(f"Processing route-stop data: KMB={len(kmb_routes)}, CTB={len(ctb_routes)}, Minibus={len(minibus_routes)}")
    return {
        'kmb_route_stops': {},
        'ctb_route_stops': {},
        'minibus_route_stops': {},
        'timestamp': int(time.time() * 1000)
    }

# Process route fare data (unchanged)
def process_route_fee_data():
    route_fee_data = {
        'kmb_routes': [],
        'ctb_routes': [],
        'minibus_routes': [],
        'timestamp': int(time.time() * 1000)
    }

    def fetch_bus_fare():
        print("Fetching Bus fare data...")
        response = fetch_with_retry(BUS_FARE_URL)
        if not response or 'features' not in response:
            print(f"Bus fare data invalid or no response: {json.dumps(response, indent=2)[:1000] if response else 'None'}")
            return None
        print(f"Bus fare data fetched with {len(response['features'])} features")
        return response

    def fetch_gmb_fare():
        print("Fetching GMB fare data...")
        response = fetch_with_retry(GMB_FARE_URL)
        if not response or 'features' not in response:
            print(f"GMB fare data invalid or no response: {json.dumps(response, indent=2)[:1000] if response else 'None'}")
            return None
        print(f"GMB fare data fetched with {len(response['features'])} features")
        return response

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_bus = executor.submit(fetch_bus_fare)
        future_gmb = executor.submit(fetch_gmb_fare)

        bus_fare_response = future_bus.result()
        if bus_fare_response:
            try:
                for feature in bus_fare_response['features']:
                    props = feature['properties']
                    provider = props['companyCode']
                    route_seq = props['routeSeq']
                    if provider in ['KMB', 'CTB']:
                        bound = 'O' if route_seq == 1 else 'I' if route_seq == 2 else route_seq
                    else:
                        bound = route_seq
                    
                    route_entry = {
                        'route': props['routeNameE'],
                        'orig_en': props['locStartNameE'],
                        'dest_en': props['locEndNameE'],
                        'full_fare': props['fullFare'],
                        'provider': provider,
                        'seq': props['stopSeq'],
                        'bound': bound
                    }
                    
                    if provider == 'KMB':
                        route_fee_data['kmb_routes'].append(route_entry)
                    elif provider == 'CTB':
                        route_fee_data['ctb_routes'].append(route_entry)
                print(f"Bus fare data processed: {len(bus_fare_response['features'])} entries")
                print(f"KMB routes: {len(route_fee_data['kmb_routes'])}, CTB routes: {len(route_fee_data['ctb_routes'])}")
            except Exception as err:
                print(f"Error processing Bus fare data: {err}")

        gmb_fare_response = future_gmb.result()
        if gmb_fare_response:
            try:
                for feature in gmb_fare_response['features']:
                    props = feature['properties']
                    route_seq = props['routeSeq']
                    bound = route_seq
                    
                    route_entry = {
                        'route': props['routeNameE'],
                        'orig_en': props['locStartNameE'],
                        'dest_en': props['locEndNameE'],
                        'full_fare': props['fullFare'],
                        'provider': 'minibus',
                        'seq': props['stopSeq'],
                        'bound': bound
                    }
                    
                    route_fee_data['minibus_routes'].append(route_entry)
                print(f"GMB fare data processed: {len(gmb_fare_response['features'])} entries")
            except Exception as err:
                print(f"Error processing GMB fare data: {err}")

    print(f"Route fee data summary: KMB={len(route_fee_data['kmb_routes'])}, CTB={len(route_fee_data['ctb_routes'])}, Minibus={len(route_fee_data['minibus_routes'])}")
    return route_fee_data

# Check cache validity (unchanged)
def is_cache_valid(file_path):
    if not os.path.exists(file_path):
        print(f"Cache file {file_path} does not exist")
        return False
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if data is None:
            print(f"Cache file {file_path} is empty or invalid JSON")
            return False
        timestamp = data.get('timestamp', 0)
        current_time = int(time.time() * 1000)
        return (current_time - timestamp) < (CACHE_EXPIRY * 1000)
    except json.JSONDecodeError as err:
        print(f"Cache file {file_path} is corrupted: {err}")
        return False
    except Exception as err:
        print(f"Error reading cache file {file_path}: {err}")
        return False

# Fetch and store data (updated)
def fetch_and_store_data():
    os.makedirs(os.path.dirname(ROUTE_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(ROUTE_STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(ROUTE_FEE_JSON_FILE), exist_ok=True)

    # Route data (unchanged)
    route_data = {
        'kmb_routes': [],
        'ctb_routes': [],
        'minibus_routes': [],
        'timestamp': int(time.time() * 1000)
    }

    def fetch_kmb_routes():
        print("Fetching KMB routes...")
        response = fetch_with_retry(KMB_URL)
        if response and 'data' in response:
            return process_kmb_data(response['data'])
        print("Failed to load KMB routes")
        return []

    def fetch_ctb_routes():
        print("Fetching CTB routes...")
        response = fetch_with_retry(CTB_URL)
        if response and 'data' in response:
            return process_ctb_data(response['data'])
        print("Failed to load CTB routes")
        return []

    def fetch_minibus_routes():
        print("Fetching Minibus routes...")
        try:
            return process_minibus_data()
        except Exception as err:
            print(f"Failed to load Minibus routes: {err}")
            return []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            'kmb': executor.submit(fetch_kmb_routes),
            'ctb': executor.submit(fetch_ctb_routes),
            'minibus': executor.submit(fetch_minibus_routes)
        }

        for key, future in futures.items():
            result = future.result()
            route_data[f"{key}_routes"] = result
            print(f"{key.upper()} routes fetched: {len(result)} routes")

    with open(ROUTE_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_data, f, ensure_ascii=False, indent=4)
    print(f"Route data saved to {ROUTE_JSON_FILE}")

    # Stop data (updated)
    stop_data = process_stop_data(route_data['ctb_routes'], route_data['minibus_routes'])
    with open(STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(stop_data, f, ensure_ascii=False, indent=4)
    print(f"Stop data saved to {STOP_JSON_FILE}")

    # Route-stop data (unchanged)
    route_stop_data = process_route_stop_data(route_data['kmb_routes'], route_data['ctb_routes'], route_data['minibus_routes'])
    with open(ROUTE_STOP_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_stop_data, f, ensure_ascii=False, indent=4)
    print(f"Route-stop data saved to {ROUTE_STOP_JSON_FILE}")

    # Route-fee data (unchanged)
    route_fee_data = process_route_fee_data()
    with open(ROUTE_FEE_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_fee_data, f, ensure_ascii=False, indent=4)
    print(f"Route-fee data saved to {ROUTE_FEE_JSON_FILE}")

# Main loop (unchanged)
def main():
    while True:
        files = [ROUTE_JSON_FILE, STOP_JSON_FILE, ROUTE_STOP_JSON_FILE, ROUTE_FEE_JSON_FILE]
        if not all(is_cache_valid(file) for file in files):
            print("Cache expired or missing, fetching new data...")
            fetch_and_store_data()
        else:
            print("Cache is still valid, skipping fetch...")
        print(f"Sleeping for {CACHE_EXPIRY} seconds (24 hours)...")
        time.sleep(CACHE_EXPIRY)

if __name__ == "__main__":
    main()