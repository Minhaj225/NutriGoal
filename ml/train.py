"""Build an explicitly unapproved protein-rule demo artifact offline.

This dataset has no behavioral labels. The artifact is for repeatable development
only and cannot pass the inference service's approval check.
"""

import argparse
import hashlib
import json
import os
import pickle
import sys
import tempfile
from pathlib import Path

import pandas as pd
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

DATASET = Path(__file__).parent / 'api' / 'indian_food_nutrition_dataset.csv'


def build_demo(output, dataset=DATASET):
    output = Path(output)
    dataset = Path(dataset)
    frame = pd.read_csv(dataset).dropna()
    features = pd.DataFrame({
        'calories': frame['Calories (kcal)'],
        'protein': frame['Protein (g)'],
        'cuisine': frame['Category'].map(
            lambda value: 'North Indian' if value in ('Main Dish', 'Lentil Dish') else 'General'),
        'category': frame['Category'],
        'diet': frame['Dietary Preference'],
    })
    labels = (features['protein'] > features['protein'].median()).astype(int)
    encoded = pd.get_dummies(features, columns=['cuisine', 'category', 'diet'])
    train_x, test_x, train_y, test_y = train_test_split(
        encoded, labels, test_size=0.2, random_state=42, stratify=labels)
    estimator = RandomForestClassifier(n_estimators=100, random_state=42)
    estimator.fit(train_x, train_y)
    artifact = {'model': estimator, 'features': encoded.columns.tolist(),
                'schemaVersion': 'demo-protein-rule-v1'}
    content = pickle.dumps(artifact)
    assert pickle.loads(content)['features'] == artifact['features']
    metadata = {
        'approved': False,
        'labelDefinition': 'protein_above_dataset_median_demo',
        'schemaVersion': 'demo-protein-rule-v1',
        'modelVersion': 'protein-rule-demo-v1',
        'datasetSha256': hashlib.sha256(dataset.read_bytes()).hexdigest(),
        'artifactSha256': hashlib.sha256(content).hexdigest(),
        'splitPolicy': 'stratified-random-demo-only',
        'sklearnVersion': sklearn.__version__,
        'pandasVersion': pd.__version__,
        'numpyVersion': np.__version__,
        'pythonVersion': sys.version.split()[0],
        'featureColumns': encoded.columns.tolist(),
        'rowCount': len(frame),
        'trainSupport': len(train_y),
        'testSupport': len(test_y),
        'trainPositiveCount': int(train_y.sum()),
        'testPositiveCount': int(test_y.sum()),
        'holdoutAccuracyForProteinRuleOnly': estimator.score(test_x, test_y),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as stream:
        temp_artifact = Path(stream.name)
        stream.write(content)
    try:
        os.replace(temp_artifact, output)
    finally:
        temp_artifact.unlink(missing_ok=True)
    manifest_path = output.with_suffix('.manifest.json')
    with tempfile.NamedTemporaryFile(mode='w', dir=output.parent, delete=False,
                                     encoding='utf-8') as stream:
        temp_manifest = Path(stream.name)
        json.dump(metadata, stream, indent=2)
    try:
        os.replace(temp_manifest, manifest_path)
    finally:
        temp_manifest.unlink(missing_ok=True)
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create an unapproved protein-rule demo artifact')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    build_demo(args.output)
    print(f'Demo artifact written to {args.output}; approved=false')
