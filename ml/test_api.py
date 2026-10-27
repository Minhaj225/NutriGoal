"""Manual smoke check for a running Flask model service."""

import os
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API_BASE_URL = os.environ.get('ML_API_URL', 'http://localhost:5000')


def call(path, headers=None, body=None):
    request = Request(f'{API_BASE_URL}{path}', headers={**(headers or {}),
        **({'Content-Type': 'application/json'} if body is not None else {})},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        response = urlopen(request, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


def main():
    token = os.environ.get('ML_API_TOKEN')
    if not token:
        raise SystemExit('Set the server-side ML_API_TOKEN before running this check')
    headers = {'X-ML-Token': token}
    health_status, health = call('/health')
    ready_status, ready = call('/ready')
    if health_status != 200 or not isinstance(health, dict):
        raise SystemExit(f'Health check failed: {health_status}')
    if ready_status != 200 or ready.get('modelStatus') != 'ready':
        raise SystemExit(f'Approved model is unavailable: {ready_status}')
    features_status, features = call('/features', headers)
    if (features_status != 200 or not isinstance(features, dict) or
            not isinstance(features.get('features'), list) or not features.get('modelVersion')):
        raise SystemExit(f'Feature request failed: {features_status}')
    version = features['modelVersion']
    meal = {'meal_id': 'a' * 24, 'meal_name': 'Dal Tadka', 'calories': 180,
            'protein': 9, 'cuisine': 'North Indian', 'category': 'Main Dish',
            'diet': 'Vegetarian'}
    body = {'schemaVersion': 'behavioral-v1', 'modelVersion': version, 'meals': [meal]}
    prediction_status, prediction = call('/predict_batch', headers, body)
    results = prediction.get('results') if isinstance(prediction, dict) else None
    if (prediction_status != 200 or not isinstance(prediction, dict) or
            prediction.get('modelVersion') != version or
            not isinstance(results, list) or len(results) != 1 or
            results[0].get('meal_id') != meal['meal_id'] or
            not isinstance(results[0].get('recommended'), bool) or
            not isinstance(results[0].get('confidence'), (int, float)) or
            not 0 <= results[0]['confidence'] <= 1):
        raise SystemExit(f'Prediction contract failed: {prediction_status}')
    print('Approved model HTTP smoke passed')


if __name__ == '__main__':
    main()
