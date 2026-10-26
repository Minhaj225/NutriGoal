import json
import hashlib
import os
import pickle
import sys
import tempfile
import unittest
import sklearn
from sklearn.dummy import DummyClassifier
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'api'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as service
from train import build_demo


class ModelLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'model.pkl'
        self.manifest = {
            'approved': True, 'labelDefinition': 'behavioral_feedback_v1',
            'schemaVersion': 'behavioral-v1', 'modelVersion': 'test-v1',
            'datasetSha256': 'a' * 64, 'splitPolicy': 'chronological-and-user-holdout',
            'featureColumns': ['calories', 'protein'],
            'sklearnVersion': sklearn.__version__,
        }

    def write(self, manifest=None, artifact=None):
        with self.path.open('wb') as stream:
            pickle.dump(artifact or {'model': object(), 'features': ['calories', 'protein'],
                                     'schemaVersion': 'behavioral-v1'}, stream)
        metadata = {**(manifest or self.manifest),
                    'artifactSha256': hashlib.sha256(self.path.read_bytes()).hexdigest()}
        self.path.with_suffix('.manifest.json').write_text(json.dumps(metadata))

    def test_missing_corrupt_and_unapproved_artifacts_are_unavailable(self):
        self.assertFalse(service.load_model_artifact(self.path))
        self.assertEqual(service.model_status, 'unavailable')
        self.write(manifest={**self.manifest, 'approved': False})
        self.assertFalse(service.load_model_artifact(self.path))
        self.write()
        self.path.write_bytes(b'bad pickle')
        self.assertFalse(service.load_model_artifact(self.path))

    def test_schema_version_and_library_mismatch_are_unavailable(self):
        self.write(artifact={'model': object(), 'features': ['calories'], 'schemaVersion': 'wrong'})
        self.assertFalse(service.load_model_artifact(self.path))
        self.write(manifest={**self.manifest, 'sklearnVersion': '0.0.0'})
        self.assertFalse(service.load_model_artifact(self.path))

    def test_approved_artifact_loads_once_without_training(self):
        candidate = DummyClassifier(strategy='prior').fit([[100, 5], [200, 10]], [0, 1])
        self.write(artifact={'model': candidate, 'features': ['calories', 'protein'],
                             'schemaVersion': 'behavioral-v1'})
        self.assertTrue(service.load_model_artifact(self.path))
        client = service.app.test_client()
        self.assertEqual(client.get('/ready').status_code, 200)
        self.assertEqual(client.get('/features').json['modelVersion'], 'test-v1')
        with patch.object(service, 'load_model_artifact', side_effect=AssertionError('reloaded')):
            self.assertEqual(client.get('/health').status_code, 200)

    def test_requests_do_not_train_or_write_even_with_missing_model(self):
        self.assertFalse(service.load_model_artifact(self.path))
        client = service.app.test_client()
        with patch.object(service, 'load_model_artifact', side_effect=AssertionError('request loaded model')):
            with ThreadPoolExecutor(max_workers=8) as pool:
                statuses = list(pool.map(lambda _: client.post('/predict', json={}).status_code, range(16)))
        self.assertEqual(statuses, [503] * 16)
        self.assertFalse(self.path.exists())
        self.assertEqual(client.get('/health').json['modelStatus'], 'unavailable')
        self.assertEqual(client.get('/ready').status_code, 503)

    def test_read_only_directory_does_not_trigger_model_creation(self):
        self.path.parent.chmod(0o555)
        self.addCleanup(lambda: self.path.parent.chmod(0o755))
        self.assertFalse(service.load_model_artifact(self.path))
        self.assertFalse(self.path.exists())

    def test_offline_demo_is_labelled_and_never_served(self):
        metadata = build_demo(self.path)
        self.assertFalse(metadata['approved'])
        self.assertEqual(metadata['labelDefinition'], 'protein_above_dataset_median_demo')
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), metadata['artifactSha256'])
        self.assertFalse(service.load_model_artifact(self.path))


if __name__ == '__main__':
    unittest.main()
