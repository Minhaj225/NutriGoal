# Quick start

Use Node.js 22.12+ (22.x), npm 10+, Python 3.12, and a local MongoDB instance. This starts the safe baseline recommender; no model artifact is required.

```sh
git clone https://github.com/Minhaj225/NutriGoal.git
cd NutriGoal
cd backend
npm ci
cp .env.example .env
```

Edit `backend/.env`: set a local `MONGO_URI`, a unique `JWT_SECRET` from `openssl rand -base64 48`, `FRONTEND_URL=http://localhost:5173`, and `RATE_LIMIT_MODE=memory` for local use. Keep `.env` out of Git. Start the API from `backend/` with `npm run dev`.

In another terminal, from the directory containing the clone:

```sh
cd NutriGoal/frontend
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_API_URL=http://localhost:5001/api` in `.env.local` if the default differs. Students can register in the browser, create a profile, browse, and rate meals. If the catalogue is empty, preview the sample CSV before deciding whether to apply it:

```sh
cd NutriGoal/backend
export MIGRATION_URI='mongodb://127.0.0.1:27017/nutrigoal'
npm run seed -- --uri-env MIGRATION_URI --file fixtures/sample-meals.csv
```

The command above is a preview. Follow [catalogue-migration.md](docs/catalogue-migration.md) for backup, mapping, apply, and rollback. Do not apply to an existing or production catalogue without that review.

For an admin account, set a unique `ADMIN_USERNAME` and a 12–72 byte `ADMIN_PASSWORD` in `backend/.env`, then run `npm run create-admin` from `backend/`. The browser admin login is `/admin/login`.

The Flask service is optional for baseline mode. For its contract tests, start from the directory containing the clone and run:

```sh
cd NutriGoal/ml
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd ..
ml/.venv/bin/python -m unittest discover -s ml/tests -p 'test_*.py'
```

See [testing.md](docs/testing.md) for backend replica-set and browser test commands. `GET /api/health` checks liveness; `GET /api/ready` reports required infrastructure readiness.
