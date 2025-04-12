import requests
import json
import time
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import tempfile
import shutil
import signal
import sys
from contextlib import contextmanager

# Constants
CACHE_EXPIRY = 24 * 60 * 60
KMB_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route/"
CTB_URL = "https://rt.data.gov.hk/v2/transport/citybus/route/CTB"
KMB_STOPS_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop"
CTB_STOPS_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/stop/"
CTB_ROUTE_STOP_BASE_URL = "https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/"
KMB_ROUTE_STOP_URL = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"
BUS_FARE_URL = "https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json"
GMB_FARE_URL = "https://static.data.gov.hk/td/routes-fares-geojson/JSON_GMB.json"
ROUTE_JSON_FILE = "static/data/route_data.json"
STOP_JSON_FILE = "static/data/stop_data.json"
ROUTE_STOP_JSON_FILE = "static/data/route-stop_data.json"
ROUTE_FEE_JSON_FILE = "static/data/route_fee_data.json"
MAX_WORKERS = 10

# Global variable to store stop data for minibus routes and stops
minibus_stop_map = {}
minibus_stop_details = {}

@contextmanager
def timeout_handler():
    def signal_handler(sig, frame):
        print("\nReceived interrupt signal, shutting down gracefully...")
        raise SystemExit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    try:
        yield
    finally:
        signal.signal(signal.SIGINT, signal.SIG_DFL)

def fetch_with_retry(url, retries=5, backoff=1000):
    for i in range(retries):
        try:
            print(f"Fetching {url} (Attempt {i + 1}/{retries})")
            response = requests.get(url, timeout=15)
            if response.status_code == 429:
                print(f"Rate limit exceeded for {url}, retrying after {backoff * (2 ** i)}ms")
                time.sleep(backoff * (2 ** i) / 1000)
                continue
            if response.status_code in [404, 400]:
                print(f"Client error {response.status_code} for {url}, skipping")
                return None
            response.raise_for_status()
            text = response.content.decode('utf-8-sig')
            data = json.loads(text)
            print(f"Successfully fetched {url}. Data size: {len(data) if isinstance(data, (list, dict)) else 'N/A'}")
            return data
        except requests.exceptions.RequestException as err:
            print(f"Error fetching {url}: {err}")
            if i == retries - 1:
                print(f"Failed to fetch {url} after {retries} attempts")
                return None
            time.sleep(backoff * (2 ** i) / 1000)
        except json.JSONDecodeError as err:
            print(f"JSON decode error for {url}: {err}")
            if i == retries - 1:
                print(f"Failed to parse JSON from {url} after {retries} attempts")
                return None
            time.sleep(backoff * (2 ** i) / 1000)
    return None

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

def process_minibus_data():
    print("Fetching Minibus route data from JSON_GMB...")
    gmb_response = fetch_with_retry(GMB_FARE_URL)
    if not gmb_response or 'features' not in gmb_response:
        print("Failed to fetch Minibus route data or missing 'features'")
        return []
    
    features = gmb_response['features']
    print(f"Processing Minibus data with {len(features)} features")
    
    unique_routes = []
    seen_routes = set()
    global minibus_stop_map, minibus_stop_details
    minibus_stop_map = {}
    minibus_stop_details = {}
    
    for feature in features:
        props = feature.get('properties', {})
        geometry = feature.get('geometry', {})
        if not props or not geometry:
            print("Skipping feature with no properties or geometry")
            continue
        
        route = props.get('routeNameE')
        route_seq = props.get('routeSeq')
        orig_en = props.get('locStartNameE', 'Unknown')
        dest_en = props.get('locEndNameE', 'Unknown')
        stop_id = props.get('stopId')
        stop_seq = props.get('stopSeq')
        stop_name = props.get('stopNameE', 'Unknown')
        coordinates = geometry.get('coordinates', [])
        
        if not all([route, route_seq, orig_en, dest_en]):
            print(f"Skipping invalid Minibus entry: {props}")
            continue
        
        if not stop_id or not stop_seq:
            print(f"Skipping Minibus stop without stopId/stopSeq: {route}/{route_seq}")
            continue
        
        if not coordinates or len(coordinates) != 2:
            print(f"Skipping Minibus stop without valid coordinates: {stop_id}")
            continue
        
        bound = '1' if route_seq == 1 else '2' if route_seq == 2 else None
        if not bound:
            print(f"Skipping invalid routeSeq for {route}: {route_seq}")
            continue
        
        key = f"{route}-{bound}"
        
        # Collect stops for route-stop data
        if key not in minibus_stop_map:
            minibus_stop_map[key] = []
        minibus_stop_map[key].append({'stop_id': str(stop_id), 'seq': str(stop_seq)})
        
        # Collect stop details for stop_data
        if stop_id not in minibus_stop_details:
            minibus_stop_details[stop_id] = {
                'name_en': stop_name,
                'lat': str(coordinates[1]),  # Latitude
                'long': str(coordinates[0])  # Longitude
            }
        
        # Add route if not seen
        if key not in seen_routes:
            seen_routes.add(key)
            unique_routes.append({
                'route': route,
                'bound': bound,
                'orig_en': orig_en,
                'dest_en': dest_en,
                'provider': 'minibus'
            })
    
    print(f"Minibus processed: {len(unique_routes)} unique routes")
    if unique_routes:
        print(f"Sample Minibus routes: {unique_routes[:3]}")
    if minibus_stop_map:
        sample_key = next(iter(minibus_stop_map), None)
        if sample_key:
            print(f"Sample stops for {sample_key}: {minibus_stop_map[sample_key][:3]}")
    if minibus_stop_details:
        sample_stop = next(iter(minibus_stop_details), None)
        if sample_stop:
            print(f"Sample stop details for {sample_stop}: {minibus_stop_details[sample_stop]}")
    
    return unique_routes

def process_stop_data(ctb_routes, minibus_routes):
    stop_data = {
        'kmb_stops': {},
        'ctb_stops': {},
        'minibus_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    # KMB stops
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

    # CTB stops
    print("Fetching CTB stops...")
    ctb_start = time.time()
    ctb_stop_ids = set()
    
    if ctb_routes:
        ctb_route_tasks = [(route['route'], direction) for route in ctb_routes for direction in ['outbound', 'inbound']]
        def fetch_ctb_route_stop(route_id, direction):
            url = f"{CTB_ROUTE_STOP_BASE_URL}{route_id}/{direction}"
            response = fetch_with_retry(url)
            return route_id, direction, response

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_task = {executor.submit(fetch_ctb_route_stop, route_id, direction): (route_id, direction) for route_id, direction in ctb_route_tasks}
            for future in as_completed(future_to_task):
                route_id, direction, response = future.result()
                if response and 'data' in response:
                    for stop in response['data']:
                        stop_id = stop.get('stop')
                        if stop_id:
                            ctb_stop_ids.add(stop_id)
                else:
                    print(f"Failed to fetch CTB route stops for {route_id}/{direction}")
    else:
        print("No CTB routes available, skipping CTB stop fetching")

    def fetch_ctb_stop(stop_id):
        url = f"{CTB_STOPS_BASE_URL}{stop_id}"
        response = fetch_with_retry(url)
        return stop_id, response

    if ctb_stop_ids:
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
                else:
                    print(f"Failed to fetch CTB stop {stop_id}")
    else:
        print("No CTB stop IDs collected")
    print(f"CTB stops fetched: {len(stop_data['ctb_stops'])} stops in {time.time() - ctb_start:.2f}s")

    # Minibus stops
    print("Processing Minibus stops from collected data...")
    minibus_start = time.time()
    global minibus_stop_details
    stop_data['minibus_stops'] = minibus_stop_details
    print(f"Minibus stops processed: {len(stop_data['minibus_stops'])} stops in {time.time() - minibus_start:.2f}s")

    return stop_data

def process_route_stop_data(kmb_routes, ctb_routes, minibus_routes):
    print(f"Processing route-stop data: KMB={len(kmb_routes)}, CTB={len(ctb_routes)}, Minibus={len(minibus_routes)}")
    if minibus_routes:
        print(f"Sample Minibus routes for route-stop: {minibus_routes[:3]}")
    else:
        print("No Minibus routes available for route-stop processing")
    route_stop_data = {
        'kmb_route_stops': {},
        'ctb_route_stops': {},
        'minibus_route_stops': {},
        'timestamp': int(time.time() * 1000)
    }

    # KMB route stops
    print("Fetching KMB route stops...")
    kmb_start = time.time()
    kmb_response = fetch_with_retry(KMB_ROUTE_STOP_URL)
    if kmb_response and 'data' in kmb_response:
        stop_map = {}
        for entry in kmb_response['data']:
            route = entry.get('route')
            bound = entry.get('bound')
            stop_id = entry.get('stop')
            seq = entry.get('seq')
            if route and bound and stop_id and seq is not None:
                key = f"{route}-{bound}"
                if key not in stop_map:
                    stop_map[key] = []
                stop_map[key].append({'stop_id': stop_id, 'seq': str(seq)})
        for key in stop_map:
            sorted_stops = sorted(stop_map[key], key=lambda x: float(x['seq']))
            route_stop_data['kmb_route_stops'][key] = sorted_stops
        print(f"KMB route stops processed: {len(route_stop_data['kmb_route_stops'])} routes in {time.time() - kmb_start:.2f}s")
    else:
        print("Failed to fetch KMB route stops")

    # CTB route stops
    print("Fetching CTB route stops...")
    ctb_start = time.time()
    def fetch_ctb_route_stop(route_id, direction):
        url = f"{CTB_ROUTE_STOP_BASE_URL}{route_id}/{direction}"
        response = fetch_with_retry(url)
        return route_id, direction, response

    ctb_tasks = [(route['route'], direction) for route in ctb_routes for direction in ['outbound', 'inbound']] if ctb_routes else []
    if ctb_tasks:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_task = {executor.submit(fetch_ctb_route_stop, route_id, direction): (route_id, direction) for route_id, direction in ctb_tasks}
            for future in as_completed(future_to_task):
                route_id, direction, response = future.result()
                if response and 'data' in response:
                    key = f"{route_id}-{'O' if direction == 'outbound' else 'I'}"
                    sorted_stops = sorted(response['data'], key=lambda x: float(x.get('seq', float('inf'))))
                    stop_list = [
                        {'stop_id': stop.get('stop'), 'seq': str(stop.get('seq', float('inf')))}
                        for stop in sorted_stops if stop.get('stop') and stop.get('seq')
                    ]
                    if stop_list:
                        route_stop_data['ctb_route_stops'][key] = stop_list
                    else:
                        print(f"No valid stops for CTB route {route_id}/{direction}")
                else:
                    print(f"Failed to fetch CTB route stops for {route_id}/{direction}")
    else:
        print("No CTB routes available for route-stop processing")
    print(f"CTB route stops processed: {len(route_stop_data['ctb_route_stops'])} routes in {time.time() - ctb_start:.2f}s")

    # Minibus route stops
    print("Processing Minibus route stops...")
    minibus_start = time.time()
    global minibus_stop_map
    for route in minibus_routes:
        route_name = route['route']
        bound = route['bound']
        key = f"{route_name}-{bound}"
        if key in minibus_stop_map:
            sorted_stops = sorted(minibus_stop_map[key], key=lambda x: float(x['seq']))
            route_stop_data['minibus_route_stops'][key] = sorted_stops
            print(f"Added {len(sorted_stops)} stops for Minibus route {key}")
        else:
            print(f"No stops found for Minibus route {key}")
    print(f"Minibus route stops processed: {len(route_stop_data['minibus_route_stops'])} routes in {time.time() - minibus_start:.2f}s")

    return route_stop_data

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
            print(f"Bus fare data invalid or no response")
            return None
        print(f"Bus fare data fetched with {len(response['features'])} features")
        return response

    def fetch_gmb_fare():
        print("Fetching GMB fare data...")
        response = fetch_with_retry(GMB_FARE_URL)
        if not response or 'features' not in response:
            print(f"Bus fare data invalid or no response")
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
                    props = feature.get('properties', {})
                    if not props:
                        continue
                    provider = props.get('companyCode')
                    if not provider:
                        continue
                    route_seq = props.get('routeSeq')
                    bound = 'O' if route_seq == 1 else 'I' if route_seq == 2 else str(route_seq)
                    route_entry = {
                        'route': props.get('routeNameE', ''),
                        'orig_en': props.get('locStartNameE', ''),
                        'dest_en': props.get('locEndNameE', ''),
                        'full_fare': props.get('fullFare', None),
                        'provider': provider.lower(),
                        'seq': props.get('stopSeq', '')
                    }
                    if provider == 'KMB':
                        route_fee_data['kmb_routes'].append(route_entry)
                    elif provider == 'CTB':
                        route_fee_data['ctb_routes'].append(route_entry)
                print(f"Bus fare data processed: KMB={len(route_fee_data['kmb_routes'])}, CTB={len(route_fee_data['ctb_routes'])}")
            except Exception as err:
                print(f"Error processing Bus fare data: {err}")

        gmb_fare_response = future_gmb.result()
        if gmb_fare_response:
            try:
                for feature in gmb_fare_response['features']:
                    props = feature.get('properties', {})
                    if not props:
                        continue
                    route_seq = props.get('routeSeq')
                    bound = '1' if route_seq == 1 else '2' if route_seq == 2 else str(route_seq)
                    route_entry = {
                        'route': props.get('routeNameE', ''),
                        'orig_en': props.get('locStartNameE', ''),
                        'dest_en': props.get('locEndNameE', ''),
                        'full_fare': props.get('fullFare', None),
                        'provider': 'minibus',
                        'seq': props.get('stopSeq', ''),
                        'bound': bound
                    }
                    route_fee_data['minibus_routes'].append(route_entry)
                print(f"GMB fare data processed: {len(route_fee_data['minibus_routes'])} routes")
            except Exception as err:
                print(f"Error processing GMB fare data: {err}")

    return route_fee_data

def is_cache_valid(file_path):
    if not os.path.exists(file_path):
        print(f"Cache file {file_path} does not exist")
        return False
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        timestamp = data.get('timestamp', 0)
        current_time = int(time.time() * 1000)
        return (current_time - timestamp) < (CACHE_EXPIRY * 1000)
    except json.JSONDecodeError as err:
        print(f"Cache file {file_path} is corrupted: {err}")
        return False

def fetch_and_store_data():
    os.makedirs(os.path.dirname(ROUTE_JSON_FILE), exist_ok=True)
    route_data = {
        'kmb_routes': [],
        'ctb_routes': [],
        'minibus_routes': [],
        'timestamp': int(time.time() * 1000)
    }

    try:
        print("Fetching KMB routes...")
        kmb_response = fetch_with_retry(KMB_URL)
        route_data['kmb_routes'] = process_kmb_data(kmb_response['data'] if kmb_response and 'data' in kmb_response else [])

        print("Fetching CTB routes...")
        ctb_response = fetch_with_retry(CTB_URL)
        if ctb_response:
            route_data['ctb_routes'] = process_ctb_data(ctb_response['data'] if 'data' in ctb_response else [])
        else:
            print("CTB route fetch failed, setting empty routes")
            route_data['ctb_routes'] = []

        print("Fetching Minibus routes...")
        route_data['minibus_routes'] = process_minibus_data()

        with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as temp:
            json.dump(route_data, temp, ensure_ascii=False, indent=4)
            temp.flush()
            os.fsync(temp.fileno())
        shutil.move(temp.name, ROUTE_JSON_FILE)
        print(f"Route data saved to {ROUTE_JSON_FILE}")

        stop_data = process_stop_data(route_data['ctb_routes'], route_data['minibus_routes'])
        with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as temp:
            json.dump(stop_data, temp, ensure_ascii=False, indent=4)
            temp.flush()
            os.fsync(temp.fileno())
        shutil.move(temp.name, STOP_JSON_FILE)
        print(f"Stop data saved to {STOP_JSON_FILE}")

        route_stop_data = process_route_stop_data(route_data['kmb_routes'], route_data['ctb_routes'], route_data['minibus_routes'])
        with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as temp:
            json.dump(route_stop_data, temp, ensure_ascii=False, indent=4)
            temp.flush()
            os.fsync(temp.fileno())
        shutil.move(temp.name, ROUTE_STOP_JSON_FILE)
        print(f"Route-stop data saved to {ROUTE_STOP_JSON_FILE}")

        route_fee_data = process_route_fee_data()
        with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as temp:
            json.dump(route_fee_data, temp, ensure_ascii=False, indent=4)
            temp.flush()
            os.fsync(temp.fileno())
        shutil.move(temp.name, ROUTE_FEE_JSON_FILE)
        print(f"Route-fee data saved to {ROUTE_FEE_JSON_FILE}")

    except SystemExit:
        print("Data fetching interrupted")
        raise
    except Exception as err:
        print(f"Unexpected error during data fetching: {err}")
        raise

def main():
    with timeout_handler():
        while True:
            try:
                if not all(is_cache_valid(file) for file in [ROUTE_JSON_FILE, STOP_JSON_FILE, ROUTE_STOP_JSON_FILE, ROUTE_FEE_JSON_FILE]):
                    print("Cache expired or missing, fetching new data...")
                    fetch_and_store_data()
                else:
                    print("Cache is still valid, skipping fetch...")
                print(f"Sleeping for {CACHE_EXPIRY} seconds...")
                time.sleep(CACHE_EXPIRY)
            except SystemExit:
                print("Exiting main loop...")
                break
            except Exception as err:
                print(f"Error in main loop: {err}")
                time.sleep(60)

if __name__ == "__main__":
    main()