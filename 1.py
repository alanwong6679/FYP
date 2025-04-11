import requests
import json
import time
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import pyodbc

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
BUS_FARE_MDB_URL = "https://static.data.gov.hk/td/routes-and-fares/FARE_BUS.mdb"
BUS_FARE_MDB = os.path.abspath("FARE_BUS.mdb")  # Use absolute path
ROUTE_JSON_FILE = "static/data/route_data.json"
STOP_JSON_FILE = "static/data/stop_data.json"
ROUTE_STOP_JSON_FILE = "static/data/route-stop_data.json"
ROUTE_FEE_JSON_FILE = "static/data/route_fee_data.json"
MAX_WORKERS = 5

# Function to download .mdb file with size verification
def download_mdb_file(url, filename):
    if not os.path.exists(filename) or (time.time() - os.path.getmtime(filename)) > CACHE_EXPIRY:
        print(f"Downloading {url} to {filename}...")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        with open(filename, 'wb') as f:
            f.write(response.content)
        file_size = os.path.getsize(filename)
        print(f"Downloaded {filename} (Size: {file_size} bytes)")
        if file_size < 1024:  # Arbitrary minimum size check
            print(f"Warning: {filename} is unusually small, possibly corrupted")
    else:
        print(f"{filename} is up-to-date, skipping download")

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

# Function to read .mdb file with enhanced diagnostics
def read_mdb_file(file_path, table_name):
    print(f"Attempting to open {file_path}")
    try:
        conn_str = f"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={file_path};"
        print(f"Connection string: {conn_str}")
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        tables = [table.table_name for table in cursor.tables(tableType='TABLE')]
        print(f"Available tables in {file_path}: {tables}")
        if table_name not in tables:
            print(f"Table {table_name} not found in {file_path}")
            conn.close()
            return None
        query = f"SELECT * FROM {table_name}"
        df = pd.read_sql(query, conn)
        print(f"Loaded {file_path} table {table_name} with {len(df)} rows")
        print(f"Columns in {table_name}: {list(df.columns)}")
        if not df.empty:
            print(f"First row sample: {df.iloc[0].to_dict()}")
        conn.close()
        return df
    except pyodbc.Error as e:
        print(f"Error loading {file_path}: {e}")
        return None

# Process KMB data
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

# Process CTB data
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

# Process Minibus data
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

# Process stop data
def process_stop_data(ctb_routes, minibus_routes):
    stop_data = {
        'kmb_stops': {},
        'ctb_stops': {},
        'minibus_stops': {},
        'timestamp': int(time.time() * 1000)
    }

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
    else:
        print("Failed to fetch KMB stops")

    print("Fetching CTB stops...")
    ctb_stops_map = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        for route in ctb_routes:
            route_name = route['route']
            direction = 'outbound' if route['bound'] == 'O' else 'inbound'
            url = f"{CTB_ROUTE_STOP_BASE_URL}{route_name}/{direction}"
            futures[executor.submit(fetch_with_retry, url)] = (route_name, direction)
        
        for future in as_completed(futures):
            route_name, direction = futures[future]
            data = future.result()
            if data and 'data' in data:
                for stop in data['data']:
                    stop_id = stop.get('stop_id', stop.get('stop'))
                    if stop_id and stop_id not in ctb_stops_map:
                        stop_url = f"{CTB_STOPS_BASE_URL}{stop_id}"
                        stop_details = fetch_with_retry(stop_url)
                        if stop_details and 'data' in stop_details:
                            stop_info = stop_details['data']
                            ctb_stops_map[stop_id] = {
                                'name_en': stop_info.get('name_en', 'Unknown'),
                                'lat': stop_info.get('lat', 'Unknown'),
                                'long': stop_info.get('long', 'Unknown')
                            }
                        else:
                            print(f"Failed to fetch CTB stop details for {stop_id}")
            else:
                print(f"No valid CTB route-stop data for {route_name} ({direction})")
    stop_data['ctb_stops'] = ctb_stops_map
    print(f"CTB stops fetched: {len(stop_data['ctb_stops'])} stops")

    print("Fetching Minibus stops...")
    minibus_stops_map = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        for route in minibus_routes:
            route_url = f"https://data.etagmb.gov.hk/route-stop/{route['route_id']}/{route['bound']}"
            futures[executor.submit(fetch_with_retry, route_url)] = route
        
        for future in as_completed(futures):
            route = futures[future]
            route_stops = future.result()
            if route_stops and 'data' in route_stops and 'route_stops' in route_stops['data']:
                for stop in route_stops['data']['route_stops']:
                    stop_id = stop['stop_id']
                    if stop_id not in minibus_stops_map:
                        stop_details = fetch_with_retry(f"{MINIBUS_STOPS_BASE_URL}{stop_id}")
                        if stop_details and 'data' in stop_details:
                            coords = stop_details['data']['coordinates']['wgs84']
                            minibus_stops_map[stop_id] = {
                                'name_en': stop_details['data'].get('name_en', stop.get('name_en', 'Unknown')),
                                'lat': coords['latitude'],
                                'long': coords['longitude']
                            }
                        else:
                            print(f"Failed to fetch Minibus stop details for {stop_id}")
            else:
                print(f"No valid Minibus route-stop data for route {route['route']}")
    stop_data['minibus_stops'] = minibus_stops_map
    print(f"Minibus stops fetched: {len(stop_data['minibus_stops'])} stops")

    return stop_data

# Process route-stop data (placeholder)
def process_route_stop_data(kmb_routes, ctb_routes, minibus_routes):
    print(f"Processing route-stop data: KMB={len(kmb_routes)}, CTB={len(ctb_routes)}, Minibus={len(minibus_routes)}")
    return {
        'kmb_route_stops': {},
        'ctb_route_stops': {},
        'minibus_route_stops': {},
        'timestamp': int(time.time() * 1000)
    }

# Process route fare data
def process_route_fee_data(kmb_routes, ctb_routes, minibus_routes):
    route_fee_data = {
        'kmb_routes': [],
        'ctb_routes': [],
        'minibus_routes': [],
        'timestamp': int(time.time() * 1000)
    }

    # Download FARE_BUS.mdb
    download_mdb_file(BUS_FARE_MDB_URL, BUS_FARE_MDB)

    # Load bus fare data
    bus_fare_df = read_mdb_file(BUS_FARE_MDB, "FARE_BUS")
    if bus_fare_df is not None:
        try:
            for _, row in bus_fare_df.iterrows():
                provider = row.get('COMPANY_CODE', '').strip()
                if provider not in ['KMB', 'CTB']:
                    continue

                route_id = str(row.get('ROUTE_ID', ''))
                route_seq = int(row.get('ROUTE_SEQ', 1))
                bound = 'O' if route_seq == 1 else 'I' if route_seq == 2 else str(route_seq)
                on_seq = int(row.get('ON_SEQ', 1))
                price = f"HK${float(row.get('PRICE', '0.00')):.2f}"

                route_entry = {
                    'route': route_id,
                    'orig_en': next((r['orig_en'] for r in (kmb_routes if provider == 'KMB' else ctb_routes) if r['route'] == route_id and r['bound'] == bound), 'Unknown'),
                    'dest_en': next((r['dest_en'] for r in (kmb_routes if provider == 'KMB' else ctb_routes) if r['route'] == route_id and r['bound'] == bound), 'Unknown'),
                    'full_fare': price,
                    'provider': provider,
                    'seq': on_seq,
                    'bound': bound
                }

                if provider == 'KMB':
                    route_fee_data['kmb_routes'].append(route_entry)
                elif provider == 'CTB':
                    route_fee_data['ctb_routes'].append(route_entry)
            print(f"Processed bus fares: KMB={len(route_fee_data['kmb_routes'])}, CTB={len(route_fee_data['ctb_routes'])}")
        except Exception as err:
            print(f"Error processing bus fare data from {BUS_FARE_MDB}: {err}")

    print(f"Route fee data summary: KMB={len(route_fee_data['kmb_routes'])}, CTB={len(route_fee_data['ctb_routes'])}, Minibus={len(route_fee_data['minibus_routes'])}")
    return route_fee_data

# Check cache validity
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

# Fetch and store data
def fetch_and_store_data():
    os.makedirs(os.path.dirname(ROUTE_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(ROUTE_STOP_JSON_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(ROUTE_FEE_JSON_FILE), exist_ok=True)

    # Route data
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

    # Route-fee data
    route_fee_data = process_route_fee_data(route_data['kmb_routes'], route_data['ctb_routes'], route_data['minibus_routes'])
    with open(ROUTE_FEE_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(route_fee_data, f, ensure_ascii=False, indent=4)
    print(f"Route-fee data saved to {ROUTE_FEE_JSON_FILE}")

# Main loop
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