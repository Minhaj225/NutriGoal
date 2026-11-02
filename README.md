# NutriGoal

A meal browsing and recommendation app for students, built with React, Express, MongoDB, and an optional Flask model service.

NutriGoal lets students maintain a profile, filter a meal catalogue, receive eligible meal suggestions, and record ratings or Like/Dislike feedback.
Administrators manage the catalogue and can preview CSV imports before applying them.
The production recommendation path currently uses a crowd-rating baseline; behavioral model ranking has a separate release gate.

[Quick start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Configuration](#configuration) · [API](#api-overview) · [Testing](#testing) · [License](#license)

## Contents

- [Project status](#project-status)
- [Features](#features)
- [How recommendations work](#how-recommendations-work)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [User workflows](#user-workflows)
- [Catalogue data](#catalogue-data)
- [API overview](#api-overview)
- [Optional Flask service](#optional-flask-service)
- [Testing](#testing)
- [Deployment notes](#deployment-notes)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## Project status

The main application is a React/Vite frontend and an Express/Mongoose API backed by MongoDB.
The backend serves baseline recommendations without the Flask service.
The baseline filters ineligible meals and ranks the remaining candidates using verified crowd ratings.
No approved behavioral model artifact is packaged in this checkout.
The Flask service is therefore optional for normal local use and intentionally reports unready for model inference.

A model probability must not be read as an individual's nutritional match percentage.
The model approval rules and current artifact state are documented in [MODEL_POLICY.md](ml/MODEL_POLICY.md).
The previous, detailed README is preserved in [status.md](status.md).

The automated suite covers local and fixture-driven behavior.
It does not establish live deployment readiness, production capacity, or behavioral recommendation quality.
See [testing.md](docs/testing.md) for those evidence boundaries and the staging checklist.

## Features

### For students

- Register and sign in with an email and password.
- Create and update a profile owned by the signed-in account.
- Record cuisine, category, dietary, allergy, activity, and nutrition preferences.
- Browse active catalogue meals with pagination and sorting.
- Filter by cuisine, category, diet, calories, and protein.
- Request recommendations for the signed-in profile.
- Rate a meal from one to five stars.
- Send explicit Like/Dislike feedback.
- Review feedback history.
- Delete an owned profile.

### For administrators

- Sign in with a provisioned admin account.
- Create, edit, and soft-delete catalogue meals.
- Review current catalogue statistics.
- Preview CSV imports and inspect row-level validation errors.
- Apply a reviewed import when the catalogue is ready.
- View student records through protected endpoints.
- Access model feature metadata through the backend proxy when a model is approved and available.

### Operational behavior

- `/api/health` reports process liveness.
- `/api/ready` checks database and rate-limiter readiness.
- The server waits for required infrastructure before opening its local listener.
- Protected requests return an unavailable response when shared rate limiting is not configured or healthy.
- API requests carry an `X-Request-ID` response header for log correlation.
- Missing and invalid routes return structured JSON errors.

## How recommendations work

The recommendation endpoint first loads the authenticated student's profile.
It builds an eligibility filter from that profile and the optional meal type.
Only active catalogue meals are considered.
Dietary, cuisine, category, calorie, and protein constraints narrow the candidates.
Allergy-aware requests exclude records whose allergen information is not verified.
The baseline then ranks eligible meals from the available crowd-rating information.

The app does not infer allergens from a meal name.
An empty allergen list alone is not proof that a meal is free of allergens.
The catalogue's `Vegetarian` value may include dairy and eggs; it does not mean `Vegan`.

The default configuration is `RECOMMENDER_MODE=baseline`.
Behavioral ranking requires real feedback labels, exposure provenance, evaluation, and an approved model package.
When the behavioral path is unavailable, the backend exposes its recommendation mode and degradation reason in the response.
Details of the gate are in [MODEL_POLICY.md](ml/MODEL_POLICY.md).

## Architecture

```text
Browser
  |
  | React + Vite
  v
Frontend (frontend/)
  |
  | JSON over HTTP, Bearer token for protected routes
  v
Express API (backend/)
  |                 \
  | Mongoose        | server-side model token, only when approved
  v                 v
MongoDB         Flask service (ml/, optional)
```

The frontend calls the Express API; it does not call Flask directly.
The backend owns authentication, profile access, catalogue writes, feedback, filtering, and recommendation responses.
MongoDB stores accounts, student profiles, meals, and feedback.
Flask only serves a validated model artifact and matching manifest when both pass startup checks.

### Technology stack

| Layer | Main technology | Role |
| --- | --- | --- |
| Interface | React 19, React Router 7, Vite 7 | Browser navigation and views |
| Styling | Tailwind CSS 4 | Interface styles |
| Browser API client | Axios | Requests to the Express API |
| Backend | Node.js 22, Express 4 | HTTP routes and application logic |
| Data | MongoDB, Mongoose 7 | Persistence and queries |
| Authentication | JSON Web Tokens, bcryptjs | Sessions and password verification |
| Rate limiting | express-rate-limit, optional Upstash Redis | Request limits |
| Optional model service | Python 3.12, Flask 3, scikit-learn | Gated model inference |
| Backend tests | Jest, Supertest | API and service checks |
| Browser tests | Playwright | Fixture-driven journeys |
| Flask tests | unittest | API and lifecycle checks |

### Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/src/pages/` | Student, browsing, recommendation, and admin pages |
| `frontend/src/components/` | Shared UI and meal presentation |
| `frontend/src/services/` | API client and browser session handling |
| `frontend/tests/` | Playwright browser scenarios |
| `backend/app.js` | Express app, middleware, and route mounts |
| `backend/server.js` | Local startup and shutdown |
| `backend/routes/` | Authentication, student, and meal endpoints |
| `backend/services/` | Eligibility, ranking, feedback, and import logic |
| `backend/models/` | MongoDB document schemas |
| `backend/scripts/` | Admin, seed, migration, and restore commands |
| `backend/tests/` | Backend unit and database tests |
| `backend/fixtures/` | Sample catalogue CSV and format notes |
| `ml/api/` | Optional Flask serving code |
| `ml/tests/` | Flask contract and lifecycle tests |
| `contracts/` | Shared synthetic model contract fixture |
| `docs/` | Runbooks and release checks |
| `status.md` | Preserved detailed README content |

## Requirements

For the baseline application:

- Node.js 22.12 or later in the 22.x line.
- npm 10 or later.
- A running MongoDB instance.
- Two terminals for the API and frontend.

For the optional Flask environment and its tests:

- Python 3.12.
- A Python virtual environment.

For the complete backend integration suite, use a disposable local MongoDB replica set.
Do not point the test command at a shared or production database.
The exact test URI and cleanup behavior are described in [testing.md](docs/testing.md).

## Quick start

These commands start the baseline app locally.
The example assumes the default API port (`5001`) and Vite port (`5173`).

### 1. Clone the repository

```sh
git clone https://github.com/Minhaj225/NutriGoal.git
cd NutriGoal
```

If you already have the repository, start in its root directory.

### 2. Install and configure the API

```sh
cd backend
npm ci
cp .env.example .env
```

Edit `backend/.env` before starting the server.
Set `MONGO_URI` to the local database you intend to use.
Generate a unique `JWT_SECRET` with `openssl rand -base64 48` and copy the resulting value into the file.
The sample file selects `RATE_LIMIT_MODE=memory` for local development.
Keep that mode out of production deployments.

Start the API:

```sh
npm run dev
```

The local listener starts after required services are ready.
If MongoDB is unavailable, check the URI and start the database before retrying.

### 3. Install and start the frontend

In another terminal, from the repository root:

```sh
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Visit `http://localhost:5173`.
The default `VITE_API_URL` is `http://localhost:5001/api`.
Update `frontend/.env.local` if the API uses a different origin or port.
The API's `FRONTEND_URL` must match the browser origin for cross-origin requests.

### 4. Create a student account

Open `/student/login` in the browser.
Register with an email and a password of 12 to 72 UTF-8 bytes.
After signing in, open `/profile` to create an owned profile.
Browse meals at `/browse` and view suggestions at `/recommendations`.
A new database may have no catalogue rows until reviewed data is imported.

### 5. Check service health

From another terminal:

```sh
curl http://localhost:5001/api/health
curl http://localhost:5001/api/ready
```

`/api/health` is a liveness check.
`/api/ready` reports database and rate-limiter status and returns HTTP 503 if a required component is unavailable.
It also reports the recommender's configured mode.

## Configuration

Copy the example files, then supply only the values required for your environment.
Do not commit generated `.env` files or secrets.

### Backend variables

| Variable | Purpose | Local guidance |
| --- | --- | --- |
| `MONGO_URI` | MongoDB connection | Select the intended local database |
| `PORT` | Express listener port | Example default: `5001` |
| `NODE_ENV` | Runtime environment | Example: `development` |
| `FRONTEND_URL` | Allowed frontend origin | Match the local Vite origin |
| `JWT_SECRET` | JWT signing secret | Unique base64 random value, at least 32 decoded bytes |
| `RATE_LIMIT_MODE` | Rate-limit store selection | `memory` only for local development/tests |
| `UPSTASH_REDIS_REST_URL` | Shared Redis endpoint | Required with production Redis mode |
| `UPSTASH_REDIS_REST_TOKEN` | Shared Redis credential | Backend only |
| `RATE_LIMIT_NAMESPACE` | Counter namespace | Separate staging from production |
| `TRUST_PROXY_HOPS` | Trusted ingress hop count | `0`, `1`, or `2` after measurement |
| `RECOMMENDER_MODE` | Ranking mode | Leave at `baseline` without approval |
| `ML_API_URL` | Optional Flask address | Backend-to-Flask communication |
| `ML_API_TOKEN` | Optional model-service token | Same server-side secret in Node and Flask |
| `ML_MODEL_VERSION` | Approved model version | Set only for a packaged approved model |
| `ADMIN_USERNAME` | Admin provisioning identity | Used by `create-admin` |
| `ADMIN_PASSWORD` | Admin provisioning password | Unique, 12 to 72 UTF-8 bytes |
| `ADMIN_ROTATE_PASSWORD` | One-time rotation flag | Remove after a rotation run |

The checked-in example is [backend/.env.example](backend/.env.example).
Production rate limiting needs a working shared Redis store.
The backend does not silently fall back to process memory when that store is unavailable.
See [rate-limiting.md](docs/rate-limiting.md) for deployment checks.

### Frontend variable

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_URL` | Base URL of the Node API | `http://localhost:5001/api` |

The checked-in example is [frontend/.env.example](frontend/.env.example).
Only public values should use the `VITE_` prefix.
Never put `JWT_SECRET`, `ML_API_TOKEN`, admin credentials, or Redis credentials in frontend variables.

### Optional Flask variable

| Variable | Purpose |
| --- | --- |
| `ML_API_TOKEN` | Required server-side token for model metadata and prediction routes |

See [ml/.env.example](ml/.env.example).
Use the same token value in the backend when an approved model is deployed.
The baseline app does not need to start Flask.

## User workflows

### Student account and profile

1. Register or sign in at `/student/login`.
2. Open `/profile` to create or edit profile information.
3. Choose cuisines, meal categories, dietary preference, and any allergies.
4. Set nutrition goals if those constraints apply to you.
5. Open `/browse` to inspect active meals.
6. Open `/recommendations` to request suggestions for your profile.
7. Rate or like/dislike meals to record feedback.

The account owns its profile and feedback.
An email match alone does not grant ownership of a legacy profile.
The student ownership migration has a separate rollout guide in [student-ownership-migration.md](docs/student-ownership-migration.md).

### Admin account

Admin accounts are provisioned from the backend rather than self-registered in the browser.
Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` in `backend/.env`.
Then, from `backend/`, run:

```sh
npm run create-admin
```

Sign in at `/admin/login`.
The catalogue management page is `/admin/meals`.
For password rotation, set `ADMIN_ROTATE_PASSWORD=true` for one invocation, run the command, and remove the flag afterward.
Do not print or commit the password.

### Catalogue import preview

The repository includes one illustrative row in `backend/fixtures/sample-meals.csv`.
It is not a complete or curated production catalogue.
From `backend/`, select an explicit local database and run a preview:

```sh
export MIGRATION_URI='mongodb://127.0.0.1:27017/nutrigoal'
npm run seed -- --uri-env MIGRATION_URI --file fixtures/sample-meals.csv
```

Preview is the default for this command.
Review the report before any write.
An existing legacy catalogue may need a controlled migration first.
The apply workflow requires a reviewed mapping, explicit database confirmation, and backup.
Follow [catalogue-migration.md](docs/catalogue-migration.md) before using `--apply`.

## Catalogue data

Meals have a name, cuisine, category, dietary preference, calories, and protein.
Optional fields include carbohydrates, fats, serving size, ingredients, description, image URL, and allergen metadata.
Inactive meals are hidden from the public listing and recommendations.
An admin delete soft-deletes by setting `isActive` to false.

### Supported values

| Field | Accepted values |
| --- | --- |
| Cuisine | `North Indian`, `South Indian`, `Street Food`, `General` |
| Category | `Main Dish`, `Breakfast`, `Snack`, `Side Dish`, `Staple` |
| Diet | `Vegetarian`, `Non-Vegetarian` |
| Allergen status | `unknown`, `verified` |
| Activity level | `Low`, `Moderate`, `High` |

Import sources must use the supported cuisine, category, and diet names exactly.
Unreviewed source categories are not guessed into the application taxonomy.

### CSV format

The sample CSV provides the accepted header shape.
Required import fields are `mealName`, `cuisine`, `category`, `dietaryPreference`, `calories`, `protein`, and `servingSize`.
Stable `source` and `externalId` values help identify imported records consistently.
If those IDs are absent, the importer uses a fallback identity based on normalized name, serving size, and diet.
Distinct meals sharing that fallback identity need separate external IDs.

Use `|` to separate entries inside `allergens` and `ingredients` cells.
Quote CSV cells that contain commas, quotes, or line breaks.
An empty allergen cell does not establish verified absence of allergens.
A verified record needs a complete allergen list and a measured serving size.
Read [backend/fixtures/README.md](backend/fixtures/README.md) before preparing a file.

### Feedback and ratings

Authenticated student feedback is stored separately from meal documents.
A student has one current feedback record per meal.
A star rating must be an integer from one to five.
The public meal statistics use current version-2 rating aggregates.
When no ratings exist, the average rating is represented as unavailable rather than inventing a score.
Legacy feedback is treated separately during migration and is not behavioral training evidence.
See [feedback-v2-migration.md](docs/feedback-v2-migration.md).

## API overview

The frontend uses `VITE_API_URL` as the base URL.
The examples below assume `http://localhost:5001/api`.
Protected routes expect an `Authorization: Bearer <token>` header.
The browser API client attaches the stored token to requests.

### System routes

| Method | Route | Use |
| --- | --- | --- |
| `GET` | `/api` | API information |
| `GET` | `/api/health` | Process liveness |
| `GET` | `/api/ready` | Required service readiness |

Liveness does not prove MongoDB or Redis is healthy.
Use readiness when checking whether the API can serve protected work.

### Authentication routes

| Method | Route | Use |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a student account |
| `POST` | `/api/auth/login` | Sign in as student or admin |
| `GET` | `/api/auth/me` | Inspect the authenticated identity |

Registration takes `email` and `password`.
Login takes `username` and `password`; student usernames are their email addresses.
Successful authentication returns a token and role.
Authentication responses are marked `Cache-Control: no-store`.

### Meal routes

| Method | Route | Access | Use |
| --- | --- | --- | --- |
| `GET` | `/api/meals` | Public | Active meal list |
| `GET` | `/api/meals/stats` | Public | Current catalogue statistics |
| `GET` | `/api/meals/:id` | Public | One active meal |
| `GET` | `/api/meals/recommend/me` | Student | Own recommendations |
| `GET` | `/api/meals/recommend/:email` | Owner or admin | Recommendations by allowed email |
| `POST` | `/api/meals/:id/rate` | Student | One-to-five star rating |
| `POST` | `/api/meals` | Admin | Create a meal |
| `PUT` | `/api/meals/:id` | Admin | Update a meal |
| `DELETE` | `/api/meals/:id` | Admin | Soft-delete a meal |
| `POST` | `/api/meals/bulk-import` | Admin | Validate, preview, or apply an import |
| `GET` | `/api/meals/ml/features` | Admin | Proxy approved model metadata |

Meal-list query options are `cuisine`, `category`, `dietaryPreference`, `minCalories`, `maxCalories`, `minProtein`, `sortBy`, `page`, and `limit`.
The default page is `1` and default page size is `20`.
The maximum page size is `100`.
Valid sorting values are `popularity`, `rating`, `calories`, and `protein`.
The sort includes a stable ID tie-breaker for pagination.
Recommendation query options are `limit` and `mealType`.
The recommendation limit is at most `20`.

Example public list request:

```sh
curl 'http://localhost:5001/api/meals?dietaryPreference=Vegetarian&page=1&limit=10&sortBy=rating'
```

The list response includes `meals`, `count`, `total`, `totalPages`, and `currentPage`.
The recommendations response includes eligible counts and the recommendation mode.

### Student routes

| Method | Route | Access | Use |
| --- | --- | --- | --- |
| `GET` | `/api/students/me` | Student | Own profile |
| `POST` | `/api/students/me` | Student | Create or update own profile |
| `POST` | `/api/students/me/feedback` | Student | Like or dislike a meal |
| `GET` | `/api/students/me/feedback` | Student | Paginated feedback history |
| `DELETE` | `/api/students/me` | Student | Delete own profile |
| `GET` | `/api/students` | Admin | Paginated student list |

The `/:email` student routes exist for owner or admin access.
Prefer the `/me` routes for student-facing integrations because they derive ownership from the token.
Profile and feedback responses are marked `Cache-Control: no-store`.

### Example protected request

After registering or logging in, send the returned token in the header:

```sh
curl -H 'Authorization: Bearer YOUR_TOKEN' \
  'http://localhost:5001/api/students/me'
```

Replace `YOUR_TOKEN` with a token from your local account.
Do not put real tokens in committed scripts, screenshots, or issue reports.

### Error behavior

Invalid input returns a client error instead of being silently coerced.
Unknown routes return JSON with an endpoint-not-found error.
Malformed JSON returns HTTP 400.
Oversized request bodies return HTTP 413.
A missing or unhealthy required service can return HTTP 503.
Rate-limit responses use HTTP 429 with retry metadata.
Unexpected errors return a generic server error to clients.

## Optional Flask service

Flask is only needed for an independently approved behavioral model package.
There is no approved artifact in this checkout.
Installing and starting Flask does not make the current model ready.

To install the optional environment, from `ml/` run:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

For a local service process, set `ML_API_TOKEN` in the Flask environment and run:

```sh
.venv/bin/python api/app.py
```

The same token must be present in the backend environment when it calls Flask.
Keep it server-side; the browser should only call Node.

| Method | Flask route | Availability |
| --- | --- | --- |
| `GET` | `/` | Service and model status |
| `GET` | `/health` | Public health status |
| `GET` | `/ready` | 200 only with approved artifact and token |
| `GET` | `/features` | Token-protected model metadata |
| `POST` | `/predict` | Token-protected single prediction |
| `POST` | `/predict_batch` | Token-protected batch prediction |

The model API requires `X-ML-Token` for metadata and prediction routes.
Prediction payloads must match the versioned `behavioral-v1` contract.
The batch route accepts at most 500 predictions.
See [ml/API_GUIDE.md](ml/API_GUIDE.md) for field rules, responses, and local tests.
The shared synthetic request fixture is [contracts/behavioral-v1.json](contracts/behavioral-v1.json).

## Testing

Use the commands below from each indicated directory.
The full instructions and release limits are in [docs/testing.md](docs/testing.md).

### Backend unit checks

From `backend/`:

```sh
npm ci
npm run test:unit
```

These tests exercise validation, database safety, and the shared contract without starting a test database.

### Backend integration checks

The full backend suite requires a disposable local MongoDB replica set on port `27018`.
From `backend/`, once that instance is ready:

```sh
TEST_MONGO_URI=mongodb://127.0.0.1:27018/nutrigoal_test npm test -- --silent
```

The helper creates an owned, random test database name and drops only that name.
Do not point `TEST_MONGO_URI` at a shared or production server.
Database setup and teardown rules are documented in [docs/testing.md](docs/testing.md).

### Frontend checks

From `frontend/`:

```sh
npm ci
npx playwright install chromium
npm run lint
npm run build
npm run test:e2e
```

Playwright starts its own local Vite server on port `4173`.
Its journeys use controlled API fixtures; they do not prove a live backend deployment works.

### Flask checks

From the repository root, after installing the `ml/` environment:

```sh
ml/.venv/bin/python -m unittest discover -s ml/tests -p 'test_*.py'
```

These checks cover request validation, artifact lifecycle, and the synthetic model contract.
`ml/test_api.py` is a separate optional HTTP smoke check for a deployed approved model.
It needs `ML_API_URL` and `ML_API_TOKEN` and is not a substitute for staging review.

### CI coverage

The repository contains a GitHub Actions workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml).
CI runs clean installs, backend tests against a disposable replica set, Flask tests, frontend lint/build, and browser journeys.
A green CI result supports the local and fixture-driven gates only.
Provider behavior, real traffic, and model quality require their own checks.

## Deployment notes

The frontend, backend, and Flask directories each contain Vercel routing files.
Those files are deployment configuration, not proof of a live release.
A real staging environment must be checked before relying on production behavior.

### Backend readiness

The backend requires MongoDB and a ready rate-limiter store before local startup.
Production protected requests require shared rate limiting through the configured Redis service.
Use `RATE_LIMIT_MODE=redis` for production or staging.
Keep `RATE_LIMIT_MODE=memory` for local development and tests only.
Set `TRUST_PROXY_HOPS` to the measured number of trusted ingress hops.
The allowed values are `0`, `1`, and `2`.
Read [backend-lifecycle.md](docs/backend-lifecycle.md) and [rate-limiting.md](docs/rate-limiting.md) before deployment.

### Staging checks

- Confirm frontend deep links load after refresh.
- Check cold and warm backend requests.
- Verify database outage responses.
- Verify Redis outage responses.
- Exercise limits with two client addresses and a spoofed forwarding header.
- Confirm the effective proxy hop count.
- Check actual Redis behavior with a staging namespace.
- Verify the packaged model hash if behavioral mode is proposed.
- Rehearse catalogue backup and restore before migration.
- Record request duration, failures, and deployment identifiers.

The staging checklist in [docs/testing.md](docs/testing.md) has the full release evidence expectations.
Local tests do not replace those checks.

## Security and privacy

- Use a unique random `JWT_SECRET` for each deployment.
- Keep admin passwords, JWTs, Redis credentials, and model tokens out of Git.
- Keep model tokens in Node and Flask environments only.
- Restrict Flask exposure at the hosting provider if it is deployed.
- Use a shared rate-limiter store for production protected requests.
- Configure trusted proxy hops from the actual ingress topology.
- Keep the browser API origin aligned with `FRONTEND_URL`.
- Review catalogue writes and migration reports before applying them.
- Keep migration backups private and outside the repository.
- Do not treat a legacy email match as account ownership.
- Do not mark missing allergen data as verified.

JWT-protected student routes check account ownership.
Admin routes require an authorized admin token.
Request validation rejects unsupported fields and query parameters.
The application bounds JSON request bodies at one MiB.
These controls still need real deployment verification at the network edge.

## Troubleshooting

### The API does not start

Check that MongoDB is running and that `MONGO_URI` selects the intended database.
Check that `JWT_SECRET` is a valid base64 random value of at least 32 decoded bytes.
If rate limiting is configured for Redis, check the backend-only Upstash settings and service availability.
The local server intentionally waits for its required dependencies.

### The frontend cannot reach the API

Check `VITE_API_URL` in `frontend/.env.local`.
Check that the API is listening on the expected port.
Check that `FRONTEND_URL` in `backend/.env` matches the frontend origin.
Inspect `/api/ready` for backend dependency status.

### Recommendations are empty

Create an owned student profile first.
Check that the catalogue has active meals.
Review diet, cuisine, category, calorie, and protein constraints.
For allergy-aware requests, check whether candidate meals have verified allergen data.
Unknown allergen status excludes a meal from allergy-aware suggestions.

### Import reports a migration requirement

Do not retry the write blindly.
Read [catalogue-migration.md](docs/catalogue-migration.md) and preview the existing catalogue state.
Resolve collisions and mapping decisions before any apply command.

### Flask is unready

That is expected without an approved model artifact, matching manifest, and token.
The baseline Node recommender remains usable without Flask.
Check [MODEL_POLICY.md](ml/MODEL_POLICY.md) before enabling behavioral mode.

## Contributing

This repository has a restricted license; review [LICENSE](LICENSE) before copying, modifying, or distributing its code.
For a proposed change, open an issue describing the behavior, affected area, and how to reproduce it.
Keep a change scoped to the relevant frontend, backend, or model-service component.
Add or update a focused check for non-trivial behavior.
Run the applicable commands in [Testing](#testing) and report what was actually verified.
Do not include real student data, credentials, tokens, or private catalogue backups in a report.

## Documentation

| Document | What it covers |
| --- | --- |
| [status.md](status.md) | Preserved previous README and detailed project state |
| [QUICK_Start.md](QUICK_Start.md) | Short baseline setup path |
| [docs/testing.md](docs/testing.md) | Test commands and evidence limits |
| [docs/catalogue-migration.md](docs/catalogue-migration.md) | Catalogue migration, import, and rollback |
| [docs/student-ownership-migration.md](docs/student-ownership-migration.md) | Ownership rollout for legacy profiles |
| [docs/feedback-v2-migration.md](docs/feedback-v2-migration.md) | Feedback data migration |
| [docs/rate-limiting.md](docs/rate-limiting.md) | Shared limits and proxy checks |
| [docs/backend-lifecycle.md](docs/backend-lifecycle.md) | Startup and readiness behavior |
| [ml/API_GUIDE.md](ml/API_GUIDE.md) | Optional Flask API contract |
| [ml/MODEL_POLICY.md](ml/MODEL_POLICY.md) | Behavioral artifact release gate |
| [backend/fixtures/README.md](backend/fixtures/README.md) | CSV format and allergen verification |

## License

The project is licensed for personal and educational use only.
Commercial use, distribution, and modification require prior written permission from the author.
Read the full [LICENSE](LICENSE) before using or redistributing the code.
