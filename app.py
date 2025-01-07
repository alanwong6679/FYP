import json
import requests
from flask import Flask, render_template, request

app = Flask(__name__)

# Load API configuration
with open('config/api_config.json') as config_file:
    config = json.load(config_file)

# Extract API URLs
api_urls = {api['name']: api['url'] for api in config['apis']}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/mtr_schedule', methods=['POST'])
def mtr_schedule():
    line = request.form.get('line')
    station = request.form.get('station')

    # Check if both line and station are provided
    if not line or not station:
        return render_template('mtr_schedule.html', error="Please select both a line and a station.")

    # Construct the API URL with the specified line and station
    url = f"{api_urls['MTR Schedule']}?line={line}&sta={station}&lang=EN"
    
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an error for bad responses
        data = response.json()

        # Print the raw API response for debugging
        print("API Response:", data)

        # Check if the response contains the expected structure
        if 'status' not in data:
            return render_template('mtr_schedule.html', error="Unexpected response format from the API.")

        # Handle different response scenarios
        if data['status'] == 0:
            # Handle special train service arrangements or station suspensions
            error_message = data.get('message', 'An error occurred.')
            return render_template('mtr_schedule.html', error=error_message)

        if data['status'] == 1:
            # Check if 'data' key exists and contains the expected line-station key
            if 'data' not in data:
                return render_template('mtr_schedule.html', error="No data available in the response.")

            schedule_data = data['data'].get(f"{line}-{station}", {})
            
            # Check if schedule_data is empty
            if not schedule_data:
                return render_template('mtr_schedule.html', error="No schedule data available for the selected line and station.")

            # Populate the stations dictionary
            stations = {
                'curr_time': schedule_data.get('curr_time', '-'),
                'sys_time': schedule_data.get('sys_time', '-'),
                'up': [],
                'down': []
            }

            # Process UP trains
            for train in schedule_data.get('UP', []):
                stations['up'].append({
                    'time': train.get('time'),
                    'plat': train.get('plat'),
                    'dest': train.get('dest'),
                    'seq': train.get('seq'),
                    'valid': train.get('valid')
                })

            # Process DOWN trains
            for train in schedule_data.get('DOWN', []):
                stations['down'].append({
                    'time': train.get('time'),
                    'plat': train.get('plat'),
                    'dest': train.get('dest'),
                    'seq': train.get('seq'),
                    'valid': train.get('valid')
                })

            return render_template('mtr_schedule.html', stations=stations, line=line, station=station)

    except requests.exceptions.RequestException as e:
        print("API Request Error:", e)
        return render_template('mtr_schedule.html', error="An error occurred while fetching the schedule.")

    return render_template('mtr_schedule.html', error="Unexpected response from the API.")

@app.route('/kmb_routes')
def kmb_routes():
    response = requests.get(api_urls['KMB Route List'])
    data = response.json()
    return render_template('kmb_routes.html', data=data['data'])

@app.route('/kmb_route_detail/<route>/<direction>/<service_type>')
def kmb_route_detail(route, direction, service_type):
    url = api_urls['KMB Route Details'].format(route=route, direction=direction, service_type=service_type)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_route_detail.html', data=data['data'])

@app.route('/kmb_stops')
def kmb_stops():
    response = requests.get(api_urls['KMB Stop List'])
    data = response.json()
    return render_template('kmb_stops.html', data=data['data'])

@app.route('/kmb_stop_detail/<stop_id>')
def kmb_stop_detail(stop_id):
    url = api_urls['KMB Stop Details'].format(stop_id=stop_id)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_stop_detail.html', data=data['data'])

@app.route('/kmb_route_stops')
def kmb_route_stops():
    response = requests.get(api_urls['KMB Route Stop List'])
    data = response.json()
    return render_template('kmb_route_stops.html', data=data['data'])

@app.route('/kmb_route_stop_detail/<route>/<direction>/<service_type>')
def kmb_route_stop_detail(route, direction, service_type):
    url = api_urls['KMB Route Stop Details'].format(route=route, direction=direction, service_type=service_type)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_route_stop_detail.html', data=data['data'])

@app.route('/kmb_eta/<stop_id>/<route>/<service_type>')
def kmb_eta(stop_id, route, service_type):
    url = api_urls['KMB ETA by Stop and Route'].format(stop_id=stop_id, route=route, service_type=service_type)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_eta.html', data=data['data'])

@app.route('/kmb_stop_eta/<stop_id>')
def kmb_stop_eta(stop_id):
    url = api_urls['KMB ETA by Stop'].format(stop_id=stop_id)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_stop_eta.html', data=data['data'])

@app.route('/kmb_route_eta/<route>/<service_type>')
def kmb_route_eta(route, service_type):
    url = api_urls['KMB ETA by Route'].format(route=route, service_type=service_type)
    response = requests.get(url)
    data = response.json()
    return render_template('kmb_route_eta.html', data=data['data'])


if __name__ == '__main__':
    app.run(debug=True)
    
    