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