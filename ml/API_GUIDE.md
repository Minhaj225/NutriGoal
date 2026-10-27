# Flask model API

The Flask service is optional while the Node backend uses baseline ranking. No approved behavioral artifact is included in this checkout. A deployed Flask process can answer `GET /health`, but `GET /ready` returns 503 until a trusted `model.pkl` and matching `model.manifest.json` pass the checks in [`MODEL_POLICY.md`](MODEL_POLICY.md) and `ML_API_TOKEN` is set. No live deployment or model accuracy is claimed here.

## Run and test locally

From `ml/`, use Python 3.12:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
ML_API_TOKEN='<unique server-side secret>' .venv/bin/python api/app.py
```

Run deterministic Flask tests from the repository root with `ml/.venv/bin/python -m unittest discover -s ml/tests -p 'test_*.py'`. `ml/test_api.py` is an optional real HTTP check for an approved deployment; set `ML_API_URL` and `ML_API_TOKEN` and run it from `ml/`. It fails if readiness or the response contract fails. Never put the token in a `VITE_` variable or frontend code.

## Routes

| Route | Access | Response |
| --- | --- | --- |
| `GET /` | Public | Service message, model status and version |
| `GET /health` | Public | HTTP 200 with `status: healthy` or `degraded` |
| `GET /ready` | Public | HTTP 200 only with a loaded approved model and token; otherwise 503 |
| `GET /features` | `X-ML-Token` | Feature names, count, and model version; 503 without model |
| `POST /predict` | `X-ML-Token` | One validated prediction |
| `POST /predict_batch` | `X-ML-Token` | Up to 500 predictions with item-level errors; 422 if any row is invalid |

`/predict_batch` accepts a JSON object with exactly `schemaVersion`, `modelVersion`, and `meals`. Each meal has exactly `meal_id` (24 hex characters), `meal_name` (1–120 characters), numeric `calories` and `protein` (0–10000), `cuisine`, `category`, and `diet`. The supported cuisine values are North Indian, South Indian, Street Food, and General; categories are Main Dish, Breakfast, Snack, Side Dish, and Staple; diet is Vegetarian or Non-Vegetarian. Vegetarian can include dairy or eggs.

The current schema version is `behavioral-v1`; `modelVersion` must match the loaded artifact. An approved response contains `success`, `modelVersion`, and ordered `results` with `meal_id`, boolean `recommended`, and `confidence` in 0–1 for valid rows. Confidence is a model class probability, not a clinical or nutritional fit score. See [`contracts/behavioral-v1.json`](../contracts/behavioral-v1.json) for a synthetic request fixture used by both services.

Requests require `Content-Type: application/json`, are bounded to 1 MiB, and have structured 400/401/413/415/422/503 responses. The Node backend calls Flask with the server-side token and a timeout; browsers do not call Flask directly. Provider-level access restrictions and real rate limits for the Flask URL remain staging release checks.

The 98-row nutrition CSV has no verified user feedback or exposure labels. It cannot establish behavioral recommendation accuracy. The model stays unavailable until dataset provenance, label definition, split, evaluation, and artifact approval are recorded in the model policy.
