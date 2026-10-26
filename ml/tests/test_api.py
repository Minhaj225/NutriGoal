import os
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'api'))
import app as service


class Predictor:
    classes_ = np.array([0, 1])

    def predict(self, rows):
        return np.ones(len(rows), dtype=int)

    def predict_proba(self, rows):
        return np.tile([0.3, 0.7], (len(rows), 1))


class ApiContractTests(unittest.TestCase):
    def setUp(self):
        self.previous = (service.model, service.feature_columns, service.model_version, service.model_status)
        service.model = Predictor()
        service.feature_columns = ['calories', 'protein', 'cuisine_General',
                                   'category_Main Dish', 'diet_Vegetarian']
        service.model_version = 'test-v1'
        service.model_status = 'ready'
        self.token = patch.dict(os.environ, {'ML_API_TOKEN': 'local-test-secret'})
        self.token.start()
        self.client = service.app.test_client()
        self.headers = {'X-ML-Token': 'local-test-secret'}
        self.meal = {'meal_id': 'a' * 24, 'meal_name': 'Dal', 'calories': 200,
                     'protein': 10, 'cuisine': 'General', 'category': 'Main Dish',
                     'diet': 'Vegetarian'}

    def tearDown(self):
        self.token.stop()
        service.model, service.feature_columns, service.model_version, service.model_status = self.previous

    def single(self, payload, **options):
        return self.client.post('/predict', json=payload, headers=self.headers, **options)

    def batch(self, rows, **options):
        headers = options.pop('headers', self.headers)
        return self.client.post('/predict_batch', json={
            'schemaVersion': 'behavioral-v1', 'modelVersion': 'test-v1', 'meals': rows,
        }, headers=headers, **options)

    def test_authentication_and_cors(self):
        self.assertEqual(self.client.post('/predict', json={}).status_code, 401)
        self.assertEqual(self.client.get('/features').status_code, 401)
        self.assertEqual(self.client.get('/features', headers=self.headers).status_code, 200)
        self.assertNotIn('Access-Control-Allow-Origin', self.client.get('/health').headers)

    def test_single_and_batch_share_canonical_validation(self):
        valid = {'schemaVersion': 'behavioral-v1', 'modelVersion': 'test-v1', **self.meal}
        self.assertEqual(self.single(valid).status_code, 200)
        response = self.batch([self.meal])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['results'][0]['meal_id'], self.meal['meal_id'])
        self.assertEqual(response.json['results'][0]['confidence'], 0.7)
        for change in [
            {'protein': -1}, {'protein': True}, {'protein': '10'},
            {'protein': float('inf')}, {'category': 'Dessert'},
            {'cuisine': 'unknown'}, {'cuisine': []}, {'category': 1},
            {'diet': {}}, {'calories': None}, {'meal_name': 'x' * 121},
        ]:
            with self.subTest(change=change):
                bad = {**self.meal, **change}
                self.assertEqual(self.single({**valid, **change}).status_code, 422)
                self.assertEqual(self.batch([bad]).status_code, 422)

    def test_envelopes_and_size_bounds(self):
        self.assertEqual(self.client.post('/predict', data='{}', headers=self.headers).status_code, 415)
        self.assertEqual(self.client.post('/predict', data='{', content_type='application/json',
                                          headers=self.headers).status_code, 400)
        for value in [None, [], 'text']:
            with self.subTest(value=value):
                self.assertEqual(self.client.post('/predict', data=json.dumps(value),
                                                  content_type='application/json',
                                                  headers=self.headers).status_code, 400)
        self.assertEqual(self.single({'schemaVersion': 'behavioral-v1',
                                      'modelVersion': 'test-v1'}).status_code, 422)
        for rows in [[], {}, 'text', None, [self.meal] * 501]:
            with self.subTest(rows_type=type(rows).__name__):
                self.assertEqual(self.batch(rows).status_code, 400)
        huge = {**self.meal, 'meal_name': 'x' * 1_100_000}
        self.assertEqual(self.batch([huge]).status_code, 413)
        self.assertEqual(self.batch([self.meal], headers={'X-ML-Token': 'bad'}).status_code, 401)
        self.assertEqual(self.batch([self.meal, self.meal]).status_code, 422)
        with patch.dict(os.environ, {'ML_API_TOKEN': ''}):
            self.assertEqual(self.batch([self.meal]).status_code, 503)
        self.assertEqual(self.client.post('/predict_batch', json={'schemaVersion': 'wrong',
            'modelVersion': 'test-v1', 'meals': [self.meal]}, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post('/predict_batch', json={'schemaVersion': 'behavioral-v1',
            'modelVersion': 'wrong', 'meals': [self.meal]}, headers=self.headers).status_code, 422)

    def test_batch_item_errors_preserve_ids_and_order(self):
        bad = {**self.meal, 'meal_id': 'b' * 24, 'protein': -1}
        response = self.batch([self.meal, None, bad, {**self.meal, 'meal_id': 'c' * 24}])
        self.assertEqual(response.status_code, 422)
        self.assertEqual([item['meal_id'] for item in response.json['results']],
                         ['a' * 24, None, 'b' * 24, 'c' * 24])
        self.assertEqual(response.json['results'][1]['error'], 'invalid_meal')
        self.assertEqual(response.json['results'][2]['error'], 'invalid_meal')
        self.assertEqual(response.json['results'][0]['recommended'], True)

    def test_unavailable_and_internal_errors_do_not_leak_traces(self):
        service.model = None
        unavailable = self.batch([self.meal])
        self.assertEqual(unavailable.status_code, 503)
        self.assertNotIn('trace', unavailable.json)
        service.model = Predictor()
        with patch.object(service.model, 'predict', side_effect=RuntimeError('private detail')):
            failure = self.batch([self.meal])
        self.assertEqual(failure.status_code, 500)
        self.assertNotIn('trace', failure.json)
        self.assertNotIn('private detail', str(failure.json))


if __name__ == '__main__':
    unittest.main()
