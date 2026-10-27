# Model availability

Production recommendations use the backend's crowd-rating baseline. There is no approved behavioral model artifact in this checkout. The old `api/model.pkl` was trained to predict whether protein exceeds a median while protein was also an input; it has been removed from the serving package.

The Flask worker loads a model only at startup and only when a local `api/model.pkl` is paired with an approved `api/model.manifest.json`. The manifest must name the behavioral label and feature schema, exact scikit-learn version, dataset and artifact hashes, split policy, and model version. A missing or invalid pair leaves prediction unavailable; `/health` reports degraded and `/ready` returns 503. The backend remains in baseline mode.

`python train.py --output /tmp/protein-rule-demo.pkl` reproduces the old nutrition-rule experiment offline. Its manifest says `approved: false`; the serving worker will reject it. The score in that manifest measures the nutrition rule only. Behavioral training and approval require the real feedback provenance and evaluation work in Task 9 after the catalogue migration in Task 12.

Artifact policy: after independent review, version the trusted `api/model.pkl` and its `api/model.manifest.json` together as one release change. The manifest's SHA-256 value must match the packaged artifact, and staging must verify the exact deployed pair. No artifact is fetched from an unverified URL during build. The current baseline release intentionally contains neither file.

Inference and feature metadata require the same server-side `ML_API_TOKEN` in Node and Flask. The browser calls Node's admin proxy for feature metadata and never receives the token. Before exposing a Flask deployment, restrict its public reach and rate at the hosting provider as well; the application token is one layer, not a provider access policy. A deployment without the token or an approved artifact is intentionally unready.
