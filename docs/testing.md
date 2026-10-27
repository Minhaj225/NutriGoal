# Release checks

The CI workflow runs clean installs, backend tests against a disposable local MongoDB replica set, Flask contract and lifecycle tests, frontend lint/build, and mocked Playwright journeys. These checks are deterministic fixtures, not evidence of a live Atlas, Upstash, Vercel, or behavioral-model deployment.

## Local commands

Run from the repository root unless a `cd` is shown:

```sh
cd backend
npm ci
npm run test:unit
TEST_MONGO_URI=mongodb://127.0.0.1:27018/nutrigoal_test npm test -- --silent
```

The full backend command requires a disposable loopback MongoDB replica set on port 27018. The test helper creates a random `nutrigoal_test_<hex>` database and drops only that owned name. Do not point it at a shared or production database.

```sh
cd frontend
npm ci
npx playwright install chromium
npm run lint
npm run build
npm run test:e2e
```

```sh
cd ml
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd ..
ml/.venv/bin/python -m unittest discover -s ml/tests -p 'test_*.py'
```

`backend/tests/contracts.test.js` and `ml/tests/test_api.py` consume the same synthetic `contracts/behavioral-v1.json` fixture. It checks IDs, enum compatibility, envelope version, and probability bounds. The fixture does not measure model quality. `ml/test_api.py` is an optional real HTTP smoke for a deployed approved behavioral model; it requires `ML_API_URL` and `ML_API_TOKEN` and exits nonzero on missing readiness or a bad response.

## Evidence boundaries

| Check | What it establishes |
| --- | --- |
| Backend unit gate | Validation, safety, and contract behavior without a database |
| Backend full gate | API and concurrency behavior against an isolated local replica set |
| Flask unit gate | Request validation, artifact lifecycle, synthetic inference contract |
| Playwright gate | Browser journeys with controlled API fixtures; no live backend |
| Staging checklist | Real routing, proxy identity, Redis, Atlas, packaged model, and outage behavior; still pending |
| Production measurements | Latency, memory, pool use, and recommendation quality; still pending |

The following require a staged environment and must be recorded before release: frontend deep links; cold and warm backend/Flask requests; DB and Redis outage responses; actual Upstash rate-limit operation with a staging namespace; two client addresses plus a spoofed forwarding header at the measured proxy hop; approved artifact hash; 20 simultaneous rating clients against disposable data; representative `explain('executionStats')`; and backup/restore rehearsal before the real catalogue migration. Record deployment identifiers, times, counts, and failures. Do not run load checks against the free production database.

Dependency advisory reviews are manual and dated in `docs/dependency-review-2026-10-25.md`. CI does not send a new dependency inventory to an advisory service automatically.
