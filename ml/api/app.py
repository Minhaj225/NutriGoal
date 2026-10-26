from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import json
import hashlib
import re
import numpy as np
import pandas as pd
import traceback
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
CORS(app)

@app.route('/')
def index():
    return jsonify({"message": "Meal model API is running", "modelStatus": model_status,
                    "modelVersion": model_version})

@app.route('/features', methods=['GET'])
def get_features():
    if model is None:
        return jsonify({"error": "model_unavailable"}), 503
    return jsonify({
        "features": feature_columns,
        "feature_count": len(feature_columns),
        "modelVersion": model_version,
    })

@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict meal recommendation for a single meal
    Expected input format:
    {
        "meal_name": "Dal Tadka",
        "calories": 180,
        "protein": 9,
        "cuisine": "North Indian",
        "category": "Main Dish", 
        "diet": "Vegetarian"
    }
    """
    if model is None:
        return jsonify({"error": "model_unavailable"}), 503
    try:
        data = request.get_json()
        
        required_fields = ['calories', 'protein', 'cuisine', 'category', 'diet']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        # Create a DataFrame to preserve feature names and avoid sklearn warnings
        feature_vector = create_feature_vector(data)
        feature_df = pd.DataFrame([feature_vector], columns=feature_columns)

        prediction = model.predict(feature_df)
        prediction_proba = model.predict_proba(feature_df)
        
        return jsonify({
            "meal_name": data.get('meal_name', 'Unknown'),
            "recommended": bool(prediction[0]),
            "confidence": float(prediction_proba[0][1]),  # Probability of liking
            "features_used": len(feature_columns)
        })

    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    """
    Predict meal recommendations for multiple meals
    Expected input format:
    {
        "meals": [
            {
                "meal_name": "Dal Tadka",
                "calories": 180,
                "protein": 9,
                "cuisine": "North Indian",
                "category": "Main Dish",
                "diet": "Vegetarian"
            },
            ...
        ]
    }
    """
    if model is None:
        return jsonify({"error": "model_unavailable"}), 503
    try:
        data = request.get_json()
        meals = data.get('meals', [])

        if not meals:
            return jsonify({"error": "No meals provided"}), 400

        # Build a single DataFrame for all valid meals
        feature_rows = []
        valid_indices = []
        errors = [None] * len(meals)

        for idx, meal in enumerate(meals):
            try:
                fv = create_feature_vector(meal)
                feature_rows.append(fv)
                valid_indices.append(idx)
            except Exception as e:
                errors[idx] = str(e)

        preds = []
        probas = []
        if feature_rows:
            feature_df = pd.DataFrame(feature_rows, columns=feature_columns)
            preds = model.predict(feature_df)
            probas = model.predict_proba(feature_df)

        # Merge predictions back to original order
        results = []
        vptr = 0
        for idx, meal in enumerate(meals):
            if errors[idx] is not None:
                results.append({
                    "meal_name": meal.get('meal_name', 'Unknown'),
                    "error": errors[idx]
                })
            else:
                results.append({
                    "meal_name": meal.get('meal_name', 'Unknown'),
                    "recommended": bool(preds[vptr]),
                    "confidence": float(probas[vptr][1])
                })
                vptr += 1

        return jsonify({
            "results": results,
            "total_meals": len(meals),
            "successful_predictions": len([r for r in results if 'error' not in r])
        })

    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

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
    return jsonify({"status": "healthy" if model is not None else "degraded",
                    "modelStatus": model_status, "modelVersion": model_version,
                    "timestamp": str(pd.Timestamp.now())}), 200


@app.route('/ready', methods=['GET'])
def ready_check():
    return jsonify({"modelStatus": model_status, "modelVersion": model_version}), 200 if model is not None else 503

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
