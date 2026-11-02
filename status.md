# NutriGoal

NutriGoal is a meal browsing and recommendation application with a React/Vite frontend, an Express/MongoDB API, and an optional Flask model service. Students sign in to own their profiles and ratings. Administrators can create, edit, soft-delete, and bulk-import catalogue meals.

The current recommendation path filters meals by diet, cuisine, meal type, nutrition limits, and verified allergen information, then ranks eligible meals with verified crowd ratings. `RECOMMENDER_MODE=baseline` is the safe default. Behavioral model ranking remains disabled until real feedback labels, exposure provenance, evaluation, and an approved packaged artifact pass the release gate in [MODEL_POLICY.md](ml/MODEL_POLICY.md). A model probability is not a personal nutrition match percentage.

## What runs today

- Student account registration/login, owned profile changes, authenticated ratings and Like/Dislike feedback.
- Meal listing with filters, stable pagination, current catalogue statistics, and a no-rating state.
- Admin login, catalogue create/edit/delete, and preview/apply CSV import. Imports to a legacy catalogue require the controlled migration first.
- Backend liveness (`/api/health`) and readiness (`/api/ready`). The Flask service exposes separate `/health` and `/ready` endpoints; its prediction endpoints require a server-side token.
- A shared rate limiter is required in production. Local development can opt into an in-memory limiter; see [rate-limiting.md](docs/rate-limiting.md).

The app does not infer allergens from a meal name. Allergy-aware recommendations exclude meals whose allergen data is unverified. In this catalogue, Vegetarian may include dairy and eggs; it does not mean Vegan.

## Layout

- `backend/app.js` exports the Express app; `backend/server.js` starts the local listener after MongoDB and rate-limit readiness.
- `backend/models`, `backend/routes`, and `backend/services` contain the API, ownership, feedback, import, and ranking logic.
- `frontend/src/pages`, `frontend/src/components`, and `frontend/src/services` contain the user interface and API client.
- `ml/api/app.py` serves validated model requests only when an approved local artifact and matching manifest are packaged.
- `contracts/behavioral-v1.json` is a synthetic cross-service contract fixture.
- `docs/` contains migration, lifecycle, rate-limit, and test runbooks. [fix.md](fix.md) is the remediation issue ledger.

## Local setup

Use Node.js 22.12 or later in the 22.x line, npm 10 or later, Python 3.12, and MongoDB. The full backend test suite requires a disposable local MongoDB replica set. Run from the repository root:

```sh
git clone https://github.com/Minhaj225/NutriGoal.git
cd NutriGoal
cd backend && npm ci && cp .env.example .env
cd ../frontend && npm ci && cp .env.example .env.local
cd ../ml && python3.12 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
```

Set `JWT_SECRET` to a unique random value (`openssl rand -base64 48`), choose a local `MONGO_URI`, and keep `RATE_LIMIT_MODE=memory` only for local development. Set the frontend `VITE_API_URL` to the Node API. To run locally, start `npm run dev` from `backend/`, `npm run dev` from `frontend/`, and `ml/.venv/bin/python api/app.py` from `ml/` in separate terminals. The baseline works while Flask is unavailable.

Students register through `/student/login`, then create a profile through `/profile`. To provision an admin, set `ADMIN_USERNAME` and a unique 12–72 byte `ADMIN_PASSWORD` in `backend/.env`, then run `npm run create-admin` from `backend/`. To rotate an existing admin password, set `ADMIN_ROTATE_PASSWORD=true` for one invocation and remove it afterwards. Do not print or commit passwords.

For safe catalogue setup, preview `backend/fixtures/sample-meals.csv` using the non-destructive seeder and an explicitly selected database:

```sh
cd backend
export MIGRATION_URI='mongodb://127.0.0.1:27017/nutrigoal'
npm run seed -- --uri-env MIGRATION_URI --file fixtures/sample-meals.csv
```

Preview is the default. Review [catalogue-migration.md](docs/catalogue-migration.md) before any `--apply`; it requires an explicit database confirmation, backup, and mapping review. Never run a write against a production database from this example.

## Tests and deployment

See [testing.md](docs/testing.md) for exact commands, isolation rules, and the remaining staging checklist. CI covers clean installs, backend local replica-set tests, Flask unit tests, lint/build, and mocked browser journeys. These tests do not prove production capacity or a live deployment.

The frontend, backend, and Flask directories contain deployment routing files. No linked deployment was available for this change, so Vercel routing, trusted proxy hops, Upstash state, Atlas pool sizing, model packaging, and real request duration still require staging verification. Keep behavioral mode disabled until its separate data/model gate is satisfied.

## License

Personal and educational use only; commercial use and redistribution are restricted. See [LICENSE](LICENSE). Package metadata does not grant MIT rights.
