from flask import Flask, request, jsonify
from werkzeug.exceptions import BadRequest
import pickle
import json
import hashlib
import hmac
import math
import re
import numpy as np
import pandas as pd
import os
import sklearn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")
model = None
feature_columns = []
model_version = None
model_status = 'unavailable'


def load_model_artifact(path=MODEL_PATH):
    """Load only a locally packaged, approved behavioral artifact."""
    global model, feature_columns, model_version, model_status
    model, feature_columns, model_version, model_status = None, [], None, 'unavailable'
    try:
        with open(os.fspath(path).removesuffix('.pkl') + '.manifest.json', encoding='utf-8') as stream:
            manifest = json.load(stream)
        if (manifest.get('approved') is not True or
                manifest.get('labelDefinition') != 'behavioral_feedback_v1' or
                manifest.get('schemaVersion') != 'behavioral-v1' or
                manifest.get('sklearnVersion') != sklearn.__version__ or
                not isinstance(manifest.get('modelVersion'), str) or
                not manifest['modelVersion'] or
                not isinstance(manifest.get('splitPolicy'), str) or
                not manifest['splitPolicy'] or
                not re.fullmatch(r'[0-9a-f]{64}', manifest.get('artifactSha256', '')) or
                not re.fullmatch(r'[0-9a-f]{64}', manifest.get('datasetSha256', ''))):
            return False
        with open(path, 'rb') as stream:
            content = stream.read()
        if hashlib.sha256(content).hexdigest() != manifest['artifactSha256']:
            return False
        artifact = pickle.loads(content)
        candidate = artifact['model']
        columns = artifact['features']
        if (artifact.get('schemaVersion') != manifest['schemaVersion'] or
                not isinstance(columns, list) or len(columns) != len(set(columns)) or
                columns != manifest.get('featureColumns') or
                not {'calories', 'protein'}.issubset(columns) or
                not hasattr(candidate, 'predict') or not hasattr(candidate, 'predict_proba') or
                list(candidate.classes_) != [0, 1]):
            return False
        model, feature_columns = candidate, columns
        model_version, model_status = manifest['modelVersion'], 'ready'
        return True
    except (OSError, ValueError, TypeError, KeyError, AttributeError, pickle.UnpicklingError):
        return False


# Import runs once per worker; HTTP handlers never train or load a model.
load_model_artifact()


app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1_048_576

CUISINES = {'North Indian', 'South Indian', 'Street Food', 'General'}
CATEGORIES = {'Main Dish', 'Breakfast', 'Snack', 'Side Dish', 'Staple'}
DIETS = {'Vegetarian', 'Non-Vegetarian'}
MEAL_FIELDS = {'meal_id', 'meal_name', 'calories', 'protein', 'cuisine', 'category', 'diet'}


@app.errorhandler(413)
def body_too_large(_error):
    return jsonify({'error': 'body_too_large'}), 413


def service_auth():
    expected = os.environ.get('ML_API_TOKEN')
    if not expected:
        return jsonify({'error': 'service_not_configured'}), 503
    if not hmac.compare_digest(request.headers.get('X-ML-Token', ''), expected):
        return jsonify({'error': 'unauthorized'}), 401
    return None


def read_json_object():
    if not request.is_json:
        return None, (jsonify({'error': 'json_required'}), 415)
    try:
        data = request.get_json()
    except BadRequest:
        return None, (jsonify({'error': 'invalid_json'}), 400)
    if not isinstance(data, dict):
        return None, (jsonify({'error': 'object_required'}), 400)
    return data, None


def valid_version(data):
    return (data.get('schemaVersion') == 'behavioral-v1' and
            isinstance(data.get('modelVersion'), str) and
            0 < len(data['modelVersion']) <= 100 and
            (model is None or data['modelVersion'] == model_version))


def valid_meal(meal):
    return (isinstance(meal, dict) and set(meal) == MEAL_FIELDS and
            isinstance(meal['meal_id'], str) and
            re.fullmatch(r'[a-fA-F0-9]{24}', meal['meal_id']) is not None and
            isinstance(meal['meal_name'], str) and
            0 < len(meal['meal_name'].strip()) <= 120 and
            all(type(meal[key]) in (int, float) and math.isfinite(meal[key]) and
                0 <= meal[key] <= 10000 for key in ('calories', 'protein')) and
            isinstance(meal['cuisine'], str) and meal['cuisine'] in CUISINES and
            isinstance(meal['category'], str) and meal['category'] in CATEGORIES and
            isinstance(meal['diet'], str) and meal['diet'] in DIETS)


def predict_valid_rows(meals):
    rows = pd.DataFrame([create_feature_vector(meal) for meal in meals], columns=feature_columns)
    predictions = model.predict(rows)
    probabilities = model.predict_proba(rows)
    if len(predictions) != len(meals) or len(probabilities) != len(meals):
        raise ValueError('Incomplete model output')
    positive_index = list(model.classes_).index(1)
    output = []
    for meal, predicted, probability in zip(meals, predictions, probabilities):
        confidence = float(probability[positive_index])
        if not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise ValueError('Invalid model probability')
        output.append({'meal_id': meal['meal_id'], 'recommended': bool(predicted),
                       'confidence': confidence})
    return output

@app.route('/')
def index():
    return jsonify({"message": "Meal model API is running", "modelStatus": model_status,
                    "modelVersion": model_version})

@app.route('/features', methods=['GET'])
def get_features():
    denied = service_auth()
    if denied:
        return denied
    if model is None:
        return jsonify({"error": "model_unavailable"}), 503
    return jsonify({
        "features": feature_columns,
        "feature_count": len(feature_columns),
        "modelVersion": model_version,
    })

@app.route('/predict', methods=['POST'])
def predict():
    denied = service_auth()
    if denied:
        return denied
    data, error = read_json_object()
    if error:
        return error
    if not valid_version(data) or not valid_meal({k: v for k, v in data.items()
                                                   if k not in ('schemaVersion', 'modelVersion')}):
        return jsonify({'error': 'invalid_meal'}), 422
    if model is None:
        return jsonify({'error': 'model_unavailable'}), 503
    try:
        return jsonify({**predict_valid_rows([data])[0], 'modelVersion': model_version})
    except Exception:
        app.logger.exception('Single inference failed')
        return jsonify({'error': 'internal_error'}), 500

@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    denied = service_auth()
    if denied:
        return denied
    data, error = read_json_object()
    if error:
        return error
    if set(data) != {'schemaVersion', 'modelVersion', 'meals'} or not valid_version(data):
        return jsonify({'error': 'invalid_envelope'}), 422
    meals = data['meals']
    if not isinstance(meals, list) or not 1 <= len(meals) <= 500:
        return jsonify({'error': 'invalid_batch_size'}), 400
    results = [None] * len(meals)
    valid = []
    valid_indices = []
    for index, meal in enumerate(meals):
        if valid_meal(meal):
            valid.append(meal)
            valid_indices.append(index)
        else:
            meal_id = meal.get('meal_id') if isinstance(meal, dict) else None
            results[index] = {'meal_id': meal_id if isinstance(meal_id, str) and
                              re.fullmatch(r'[a-fA-F0-9]{24}', meal_id) else None,
                              'error': 'invalid_meal'}
    if len({meal['meal_id'] for meal in valid}) != len(valid):
        return jsonify({'error': 'duplicate_meal_id'}), 422
    if model is None and valid:
        return jsonify({'error': 'model_unavailable'}), 503
    try:
        if valid:
            for index, result in zip(valid_indices, predict_valid_rows(valid)):
                results[index] = result
        has_errors = len(valid) != len(meals)
        return jsonify({'success': not has_errors, 'modelVersion': model_version,
                        'results': results}), 422 if has_errors else 200
    except Exception:
        app.logger.exception('Batch inference failed')
        return jsonify({'error': 'internal_error'}), 500

def create_feature_vector(meal_data):
    """
    Create a feature vector from meal data that matches the model's expected features
    """
    feature_vector = np.zeros(len(feature_columns))
    
    for i, feature in enumerate(feature_columns):
        if feature == 'calories':
            feature_vector[i] = meal_data.get('calories', 0)
        elif feature == 'protein':
            feature_vector[i] = meal_data.get('protein', 0)
        
        elif feature.startswith('cuisine_'):
            cuisine_value = feature.replace('cuisine_', '').replace('_', ' ').title()
            if meal_data.get('cuisine', '').title() == cuisine_value:
                feature_vector[i] = 1
                
        elif feature.startswith('category_'):
            category_value = feature.replace('category_', '').replace('_', ' ').title()
            if meal_data.get('category', '').title() == category_value:
                feature_vector[i] = 1
                
        elif feature.startswith('diet_'):
            diet_value = feature.replace('diet_', '').replace('_', ' ').title()
            if meal_data.get('diet', '').title() == diet_value:
                feature_vector[i] = 1
    
    return feature_vector

@app.route('/health', methods=['GET'])
def health_check():
    available = model is not None and bool(os.environ.get('ML_API_TOKEN'))
    return jsonify({"status": "healthy" if available else "degraded",
                    "modelStatus": model_status, "modelVersion": model_version,
                    "timestamp": str(pd.Timestamp.now())}), 200


@app.route('/ready', methods=['GET'])
def ready_check():
    available = model is not None and bool(os.environ.get('ML_API_TOKEN'))
    return jsonify({"modelStatus": model_status, "modelVersion": model_version,
                    "serviceConfigured": bool(os.environ.get('ML_API_TOKEN'))}), 200 if available else 503

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Enhanced Meal Recommendation API on port {port}...")
    print(f"Model status: {model_status}")
    print("Available endpoints:")
    print("  GET  /         - API information")
    print("  GET  /features - Model feature information") 
    print("  GET  /health   - Health check")
    print("  POST /predict  - Single meal prediction")
    print("  POST /predict_batch - Batch meal predictions")
    app.run(host='0.0.0.0', port=port, debug=False)

# Ensure app can be imported by gunicorn
app.logger.info("Flask app initialized successfully")
