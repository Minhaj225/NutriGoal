# NutriGoal: Codebase Audit and Fix Implementation Plan

> This document records the original audit and implementation plan. The code changes are tracked in `.superpowers/sdd/fix/progress.md`; unchecked steps that require real data or staging evidence remain release gates.

**Audit date:** 24 October 2026, Asia/Kolkata.
**Audited checkout:** `a163067`, including the existing uncommitted rating-normalization edit in `backend/routes/mealRoutes.js:243`.
**Goal:** Correct the security, data integrity, recommendation, ML, frontend, deployment, and maintenance problems found throughout this repository.
**Architecture:** Keep React/Vite, Express/Mongoose, and Flask/scikit-learn. Reuse the current API client, models, middleware, and animation hooks. Add small shared modules only where multiple callers need the same validation, feedback write, catalogue import, or scoring rule.
**Scope/specification:** The user's request for a whole-codebase bug and logic audit, the supplied “10. Weaknesses to be honest about” section, and the evidence and implementation decisions recorded below. The older `Scaling.md` and security plan are historical context, not proof that their features or performance targets exist.
**Status (27 October 2026):** Local implementation and tests for Tasks 1–8 and 10–19 are committed or in the current change. Task 9 is gated on authentic behavioral labels and exposure provenance. Task 12's real-data migration, Task 13's proxy/Upstash checks, Task 14's Atlas measurements, and Task 20's staging/load verification are pending. The baseline recommender remains active. The audit findings below describe the original checkout, not the current behavior.

## 1. What this repo does

NutriGoal stores student preferences and a meal catalogue, filters meals against part of each profile, and optionally asks a Flask classifier to score those meals. Users can submit ratings and feedback; administrators can add, import, and soft-delete meals.

The deployment files describe three Vercel services. This audit assumes a small shared application with multiple simultaneous users and multiple backend instances. It does not assume that free hosting or a free MongoDB deployment can serve 10,000 concurrent users or meet a particular latency target.

The most urgent problems are unsafe database tests, unauthenticated profile access and writes, query-filter injection, broken admin token handling, duplicate and racy ratings, ignored allergies, fabricated/model-derived quality claims, vulnerable locked dependencies, and destructive seeding.

## 2. Audit coverage and limits

All 56 tracked files were inventoried. All application source files, scripts, test files, manifests, deployment configurations, and tracked documentation were inspected. The CSV was parsed across all 98 records. The model artifact was inspected with `pickletools` without executing its pickle. Its metadata contains accuracy `1.0`, scikit-learn version `1.8.0`, and 17 feature names. The training code was also executed with its output redirected to a temporary directory.

| Area | Files inspected | Main flows traced |
|---|---|---|
| Backend entry/configuration | `backend/app.js`, `.env.example`, `package.json`, `package-lock.json`, `vercel.json` | Middleware, CORS, rate limiting, errors, startup, database connection, health |
| Authentication | `backend/middleware/auth.js`, `backend/routes/authRoutes.js`, `backend/models/User.js`, `backend/scripts/createAdmin.js` | Credential verification, JWT signing/verification, admin authorization, provisioning |
| Profiles | `backend/models/Student.js`, `backend/routes/studentRoutes.js` | Create/upsert, email lookup, feedback, listing, deletion |
| Meals | `backend/models/Meal.js`, `backend/routes/mealRoutes.js`, `backend/scripts/seedMeals.js` | CRUD, filtering, pagination, statistics, candidate selection, ML/fallback ranking, rating, import |
| Frontend entry/configuration | `frontend/src/App.jsx`, `main.jsx`, `index.css`, `frontend/index.html`, `vite.config.js`, `eslint.config.js`, both package files, `.env.example`, `vercel.json` | Routing, builds, styling, environment handling |
| All six pages | `Home.jsx`, `StudentForm.jsx`, `Recommendations.jsx`, `BrowseMeals.jsx`, `AdminLogin.jsx`, `AdminMealForm.jsx` | Read/write requests, form state, loading, identity, sorting, pagination, admin flows |
| Shared frontend code | `services/api.js`, both hooks, `MealCard.jsx`, `ConfirmModal.jsx`, `Navigation.jsx`, `ErrorMessage.jsx`, `LoadingSpinner.jsx`, `Skeleton.jsx`, `TextType.jsx` | Request ownership, callbacks, formatting, keyboard access, animations, errors |
| ML | `ml/api/app.py`, CSV, `model.pkl`, `ml/requirements.txt`, `ml/test_api.py`, `ml/vercel.json`, `ml/API_GUIDE.md` | Training target, encoding, model lifecycle, inference, malformed input, fallback, health |
| Existing tests | `backend/tests/security.test.js` | Test database selection, setup, cleanup, actual assertion coverage |
| Project documents/assets | `README.md`, `QUICK_Start.md`, `.gitignore`, `LICENSE`, favicon, three PNG assets; locally present `Scaling.md`, `TEST_INFRA.md`, `docs/` | Setup accuracy, claimed features, tracked coverage, licensing metadata, asset references |

The PNGs/favicon were inventoried as static assets; they do not contain application logic. Installed dependency internals were inspected where necessary to verify the Redis integration. Dependency trees were checked through npm's advisory service after the user explicitly approved sending package metadata.

**Limits:** No production endpoint, production database, Upstash account, Vercel project settings, backup system, or actual user records were accessed. Environment files were checked for variable names only; credential values were not printed. Git history was not scanned for previously leaked secrets. No production load test or Python dependency advisory scan was performed. These limits do not establish that those areas are safe.

This is a comprehensive inventory of the issues identified in this checkout, not a proof that no undiscovered bug exists.

## 3. Checks actually performed

| Check | Observed result | Interpretation |
|---|---|---|
| `cd frontend && npm run build` | Pass; Vite built 111 modules | The bundle compiles; this does not validate application behavior |
| `cd frontend && npm run lint` | Fail: unused `useCallback` in `ConfirmModal.jsx`; four hook dependency warnings | The current lint gate is red |
| `cd frontend && npm run type-check` | Exit 1; TypeScript prints help | There is no TypeScript project configuration to check |
| Backend route handlers with stubbed models/HTTP | An email operator object reaches `findOneAndUpdate`; allergies/categories absent from recommendation query; malformed ML success bodies return empty results; confidence `2` accepted | Reproduces logic/contract failures without a database |
| Mongoose query casting | `{email: {$ne: null}}` remains a query operator | Field allow-listing has not protected the query selector |
| Mongoose update validation | A profile upsert update with no name passes update validation | `runValidators` is not full create-payload validation |
| Redis export and SDK inspection | `require('rate-limit-redis')` is an object; construction throws; Upstash client has no `.call()` method | Two separate integration errors prevent the intended shared limiter |
| Flask test client with a stub predictor | Negative nutrients and unknown cuisines accepted; `[{}]` treated as a valid batch; a `null` entry breaks the batch; exceptions expose traces | Input and response contracts are inconsistent |
| Dummy-model health | Reports `healthy` and accuracy `0.75` | An invented number and random model can be presented as real readiness |
| Training against current CSV, saving only under `/tmp` | 98 rows, 17 features, test accuracy `1.0`, protein median **5.0 g** | Confirms the target-definition problem; does not prove personalization |
| Isolated Chromium against a temporary built frontend, all HTTP mocked | Login leaves token null; one star click makes two rating requests plus one feedback request; browse email input disappears after one character; allergy comma disappears; modal receives no initial focus; five closed mobile-overlay links remain focusable; unknown route has no main content | Browser reproductions, not a live end-to-end pass |
| `npm audit --omit=dev --json`, backend | 11 flagged dependency entries: 1 critical, 7 high, 3 moderate | Advisory snapshot, not 11 proven exploits |
| Same production-tree audit, frontend | 13 flagged entries: 2 critical, 9 high, 2 moderate | Includes build-related packages present in that dependency tree |
| Existing backend database tests | Deliberately not run | Their cleanup can delete all users and students in the configured database |

The first browser attempt was blocked by the execution sandbox; the isolated, fully mocked checks subsequently ran with execution approval. No live backend or database was involved.

## 4. Corrections to the supplied weakness section

| Supplied point | Current-code conclusion | Plan coverage |
|---|---|---|
| 10.1: model target/feature leakage | Confirmed. The same protein input defines the label. The current CSV median is **5.0**, not the illustrative 14.5. The model evaluates a nutrition rule, not a student's likelihood of liking a meal. | Tasks 7–10, 17, 20 |
| 10.1: ratings already in `mealHistory` | Numeric ratings are **not** stored there. The schema stores only `mealId`, `liked`, and `consumedAt`; `liked` currently uses `rating >= 3`. A `rating >= 4` training target cannot be reconstructed reliably from that history. | Tasks 5, 9, 12 |
| 10.2: 70/30 blend | The working tree already divides `averageRating` by five on the ML path. Preserve that edit. The fallback remains unnormalized; confidence is also incorrectly presented as a personal match probability. | Task 7 |
| 10.3: authentication, deduplication, lost updates | Confirmed, with an additional duplicate request from the frontend. A unique user/meal collection plus a separate meal summary requires a cross-document consistency strategy; a meal-only atomic update does not solve both together. | Tasks 3–5 |
| 10.4: serverless limiter/cache | Redis packages and attempted integration now exist. The constructor import is wrong and the Upstash command adapter is wrong, so the limiter still falls back to memory. The statistics cache remains process-local and is never invalidated on writes. | Tasks 13–14 |
| 10.5: CSV robustness | Quoting, validation, deduplication, allow-listing, and partial success remain problems. The current frontend trims every field, so ordinary CRLF trailing `\r` is already stripped there; do not report that specific detail as an unhandled current bug. The seeder is independently naive and destructive. | Tasks 11–12 |

Dropping protein from a protein-derived classifier would still leave an artificial target and correlated proxies. Cross-validation does not turn that target into evidence of meal preference. Use an honest baseline while collecting usable behavioral evidence.

## 5. Priorities and implementation order

P0 means prevent unauthorized access, unsafe output, data loss, or materially false product behavior. P1 means fix important correctness and reliability defects. P2 means maintenance and release discipline after those defects have a fix. Effort is a planning estimate: S is roughly half to one engineering day, M one to three days, L three to six days, before review and deployment work. Tasks overlap in touched files; these estimates should not simply be added as a delivery promise.

| Order | Priority | Deliverable | Dependencies | Effort / change risk |
|---|---|---|---|---|
| 1 | P0 | Quarantine destructive tests and create safe test isolation | None | S / medium |
| 2 | P0 | Update vulnerable dependencies and align runtimes | 1 | M / medium |
| 3 | P0 | Repair admin login, JWT configuration, and logout | 1–2 | M / medium |
| 4 | P0 | Add student ownership and strict Express request contracts | 3 | L / high |
| 5 | P0 | Make ratings/feedback single, authenticated, deduplicated writes | 4 | L / high |
| 6 | P0 | Enforce allergies, diet, categories, and catalogue metadata rules | 4 | M / high |
| 7 | P0 | Introduce honest baseline ranking and reliable fallback | 5–6 | M / medium |
| 8 | P0 | Remove random production models and request-time training | 7 | M / medium |
| 9 | P1 | Implement a properly evaluated behavioral-training path | 5, 8, 12 | L / high |
| 10 | P0 | Validate, bound, and protect the Flask API | 6, 8; behavioral contract from 9 before enabling it | M / medium |
| 11 | P0 | Replace CSV parsing and make imports idempotent | 4, 6 | L / high |
| 12 | P0 | Replace destructive seeding and migrate data safely | 5–6, 11 | M / high |
| 13 | P0 | Repair shared rate limiting and deployment-aware client identity | 2–4 | M / medium |
| 14 | P1 | Fix statistics, database startup, readiness, and request bounds | 4–5, 11–13 | M / medium |
| 15 | P1 | Fix profile/browse/recommendation state and request races | 4–7 | M / medium |
| 16 | P1 | Finish the admin UI's real CRUD/import behavior | 3, 11–12, 15 | M / medium |
| 17 | P1 | Make displayed facts and frontend API helpers accurate | 7–10, 14–16 | S / low |
| 18 | P1 | Repair keyboard access, contrast, and motion cleanup | 15–16 | M / low |
| 19 | P1 | Enforce regression and CI gates | Build incrementally from 1; finish after 18 | M / medium |
| 20 | P2 | Correct documentation, tracking, deployment, and release evidence | 1–19 | S / low |

Execute dependency-ready work in this order, moving task 9 after task 12. Task 9's real-data evaluation is a separate release gate; the baseline version can ship once all applicable P0 fixes pass. Do not defer the P0 security or data-integrity work merely because behavioral training lacks data.

## 6. Global implementation constraints

- Keep the current stack. Do not add a queue, Kubernetes, FastAPI rewrite, repository pattern, generic model factory, or a new state-management library to fix these defects.
- Preserve the user's existing `averageRating / 5` change. Preserve unrelated local files and edits.
- Introduce a real CSV parser because correct CSV parsing is not a few reliable comma splits. Reuse installed Jest, Supertest, Playwright, Axios, Mongoose, JWT, bcrypt, and GSAP.
- Do not connect tests to `MONGO_URI`, seed a production database, or reset a catalogue as part of verification.
- Never weaken existing admin authorization when adding student authentication. Client route guards remain convenience checks; the server decides access.
- Update Node, Flask, frontend consumers, tests, environment examples, and documentation in the same change whenever their API contract changes.
- Treat all numeric input as finite numbers. JSON objects, arrays, booleans, numeric strings, `null`, and omitted values are distinct cases; do not rely on implicit JavaScript coercion.
- Make schema and index changes additive first. Export and verify affected data before backfilling, deduplicating, or removing a field.
- Keep list, batch, body, and string sizes bounded. Proposed limits below are explicit implementation defaults, not measurements of current capacity.
- Keep database changes compatible with ordinary MongoDB features. Use a replica set for transaction-backed feedback; document this for local development and tests. Do not claim a free-tier capacity result without measurement.
- Record remaining environment-dependent checks separately from completed local tests.

### Review focus

1. An existing unowned profile must not become claimable merely by registering its email: task 4 tests this explicitly.
2. Retrying a timed-out rating or import must not inflate counts or duplicate catalogue entries: tasks 5 and 11 own these tests.
3. ML failure, missing labels, unknown allergens, and restrictive profiles must produce explicit safe states: tasks 6–10 own them.
4. An older network response must not overwrite the active account, filters, or page: task 15 owns delayed-response tests.
5. Tests, migrations, and cleanup must fail closed before accessing a non-test database: tasks 1, 12, and 19 own these checks.

## 7. Must-fix and should-fix implementation tasks

### Task 1 — Isolate tests before any database-backed work

**Priority:** P0. **Why first:** The present verification command itself can destroy application data.

**Findings and evidence**

- **1a — Destructive database selection.** `backend/app.js:7` loads `.env`; `backend/tests/security.test.js:16` subsequently selects `MONGO_URI`. Its `afterAll` at lines 40–43 runs unfiltered `deleteMany({})` on users and students. Running the documented `npm test` can therefore remove real records.
- **1b — Unsafe cleanup after failed setup.** Cleanup is not conditioned on a successfully established, verified test database. Model buffering can also make a failed setup hang during teardown.
- **1c — Tests have almost no meaningful domain coverage.** The three existing cases cover an admin list and a top-level `$set`, but not selector injection, student ownership, ML, imports, ratings, concurrency, or browser behavior. The test locally sets a timeout inside `beforeAll` instead of defining the hook timeout clearly.

**Files:** Modify `backend/tests/security.test.js`, `backend/package.json`; create `backend/tests/setup.js`, `backend/tests/database-safety.test.js`, and `backend/jest.config.js`.

**Interface:** Integration tests consume only `TEST_MONGO_URI`. Unit tests must not establish any database connection. The setup helper returns the exact test database name it created and is the only cleanup owner.

- [x] Add `rejects_application_uri`, `rejects_non_test_database_name`, `does_not_cleanup_after_failed_connect`, and `cleans_only_owned_test_database`. Assert that no connect/delete/drop operation is invoked for an unsafe URI.
- [x] Run `cd backend && npm test -- --runInBand tests/database-safety.test.js`; observe failures before changing the helper.
- [x] Require `NODE_ENV=test`, an explicitly supplied `TEST_MONGO_URI`, a loopback host for automated destructive integration tests, and a database named `nutrigoal_test_<run-id>`. Set this before importing the app. Reject other destinations before connecting. Remove the `MONGO_URI` fallback entirely.
- [x] Await a successful connection, initialize required indexes, and track fixture IDs or the owned database name. Clean only that verified database. Always close a successfully opened connection, including after assertion failures. Use an explicit hook timeout.
- [x] Run the safety tests without MongoDB, then the rewritten security suite against an isolated local test replica set. A missing test URI must produce a clear setup error without touching the application database. Commit the test-isolation change alone.

**Acceptance:** An ordinary developer cannot wipe application users by following the test command. No later task is accepted based on the old suite.

### Task 2 — Update dependencies and make runtime requirements truthful

**Priority:** P0. **Why:** The lockfiles resolve known vulnerable versions; their declared runtime floors cannot run the current toolchain reliably.

**Findings and evidence**

- **2a — Backend advisory matches.** The approved npm production-tree audit flagged `axios@1.10.0`, `body-parser@1.20.3`, `express@4.21.2`, `follow-redirects@1.15.9`, `form-data@4.0.5`, `ip-address@9.0.5`, `mongoose@7.8.7`, `path-to-regexp@0.1.12`, `proxy-addr@2.0.7`, `qs@6.13.0`, and `socks@2.8.5`. Highest reported severity: critical for `proxy-addr`.
- **2b — Frontend-tree advisory matches.** npm flagged `axios@1.10.0`, `follow-redirects@1.15.9`, `form-data@4.0.3`, `nanoid@3.3.11`, `picomatch@4.0.2`, `postcss@8.5.6`, `react-router@7.6.3`, `react-router-dom@7.6.3`, `rollup@4.44.1`, `source-map-js@1.2.1`, `tar@7.4.3`, `vite@7.0.0`, and `yaml@2.8.1`. Highest reported severity: critical for `form-data` and `tar`.
- **2c — Declared Node floors are wrong.** Backend claims Node 14+, while its Redis/limiter packages require at least 16 and installed Jest requires newer versions. Frontend claims Node 16+, while its locked Vite 7 requires `^20.19.0 || >=22.12.0` and Router requires Node 20+. The audit build used Node `22.22.2`.
- **2d — Python environments are not reproducible.** `ml/requirements.txt` mixes exact old pins with unbounded sklearn/pandas/numpy minimums. The checked-in pickle records sklearn `1.8.0`; installing a different sklearn version is not a validated model-loading strategy. README's Python 3.8+ claim is inconsistent with the dependency set.

**Files:** Both `package.json` and `package-lock.json` files; `ml/requirements.txt`; add a tested Python constraints file and a root Node-version file; update runtime declarations in deployment documentation.

**Interface:** A clean install must reproduce the versions used to train/load the released artifact and to run CI.

- [x] Add a runtime assertion/check in CI that verifies the declared Node floor can install and build the frontend. Record the current advisory snapshot before changing locks.
- [ ] Target Node 22 with minimum `22.12.0` for both JavaScript packages. Select a supported Python 3.12 environment, validate it on the chosen deployment runtime, and lock the exact tested scientific dependencies. If deployment cannot supply that runtime, resolve the runtime choice before releasing an artifact.
- [x] Upgrade direct dependencies and their vulnerable transitive dependencies within compatible major lines where possible. Inspect API changes before any major upgrade. Do not run `npm audit fix --force` blindly or edit a lockfile by hand.
- [ ] Run clean `npm ci` installs, the build/lint checks, backend tests, and Flask contract tests. Re-run both production and full development-tree npm audits. Add a Python dependency advisory scan in the release environment; no clean Python result was obtained in this audit.
- [x] Commit manifests, locks, runtime declarations, and a short exposure assessment together. Distinguish browser-bundled code, server-only Axios adapters, development-server issues, and build-time archive handling. Do not label all advisory matches remotely exploitable.

**Acceptance:** Every critical/high advisory is removed or has a specific reachability assessment, owner, and blocking release decision. A fresh environment can reproduce the selected model/runtime combination. For an example of the frontend tree's affected `form-data` version, see the [upstream advisory](https://github.com/advisories/GHSA-fjxv-7rqg-78g4).

### Task 3 — Repair the admin authentication lifecycle

**Priority:** P0.

**Findings and evidence**

- **3a — Login never saves the JWT.** `AdminLogin.jsx:25–36` saves `isAdmin` and `adminUser` but discards `response.token`. `services/api.js:39–43` looks for `token`; authenticated writes consequently return 401. The browser reproduction observed `{isAdmin: 'true', token: null}`.
- **3b — Logout leaves a token behind.** `AdminLogin.jsx:50–54` and `Navigation.jsx:171–177` do not remove `token`. Once token persistence is repaired, logout would leave the credential available to the interceptor.
- **3c — Client state invents admin status.** Any successful login, including a `staff` login, sets `isAdmin=true`. `App.jsx:12–31` checks only that editable boolean, not a session. Backend admin middleware still protects writes; this is not a demonstrated server authorization bypass.
- **3d — Known JWT fallback.** `authRoutes.js:19–22` and `middleware/auth.js:12` use `default_secret_change_me` when configuration is absent. A missing secret must not produce forgeable production tokens.
- **3e — Wrong error field and indiscriminate redirects.** Login reads `message` while backend errors use `error`. The response interceptor logs every 401/403 out as an admin session failure, even when 403 means insufficient permissions for an otherwise valid account.
- **3f — Provisioning failures are reported as successful process exits.** `createAdmin.js:27–30` logs exceptions without setting a failure exit code. Its existing-user path exits before normal cleanup; it validates neither credential presence nor password strength before connecting.
- **3g — Password length is not bounded before bcrypt.** `User.js:24–32` hashes whatever password reaches it. bcrypt uses only the first 72 bytes, so different longer passwords with the same prefix are not distinct credentials; excessively large input also has no deliberate login boundary.

**Files:** `backend/middleware/auth.js`, `routes/authRoutes.js`, `scripts/createAdmin.js`, `models/User.js`, `.env.example`; `frontend/src/services/api.js`, `pages/AdminLogin.jsx`, `components/common/Navigation.jsx`, `App.jsx`; create `frontend/src/services/session.js`, `backend/config.js`, and focused auth tests.

**Interface:** `saveSession({token, role, username})`, `readSession()`, and `clearSession()` are shared by login, logout, the interceptor, and route guards. Add `GET /api/auth/me` for server-confirmed identity. Keep JWT signing/verification configuration in one validated configuration module.

- [x] Add regressions: login then create a meal sends exactly one Bearer token; logout removes all auth keys; a staff response does not open admin UI; missing/placeholder JWT secrets stop production startup; malformed credentials get 400; bad credentials show the backend's message.
- [x] Run the targeted backend auth tests and `frontend/tests/auth.spec.js` against a mocked backend; confirm the present failures.
- [x] Persist the actual token, use the returned role, clear token/role/name consistently, and remove the empty token-check block in `AdminMealForm.jsx:50–53`. Route guards should verify a session through `/auth/me`; an editable boolean is never authorization.
- [x] Validate a non-placeholder JWT secret of at least 32 random bytes, explicit allowed signing algorithm, expiry, and expected claim shape. Require a proper Bearer header. Return 401 for missing/invalid/expired authentication and 403 for a valid but disallowed role. Do not redirect every forbidden public request to admin login.
- [x] Validate login fields as bounded strings before querying. Require newly registered/provisioned passwords to be 12–72 UTF-8 bytes without trimming them, and reject oversized login passwords before bcrypt comparison. Handle legacy credentials through a documented rotation rather than silent truncation. Give the admin script clear nonzero failures and awaited cleanup; reject weak/example provisioning passwords. Remove `admin123` from copy-and-run setup examples. Either update `lastLogin` on successful authentication or remove that unused field; choose removal unless a consumer is added by an existing requirement.
- [x] Run auth, middleware, provisioning, and browser tests. Commit the complete lifecycle change, including examples.

**Acceptance:** A fresh browser can log in, perform an authorized write, reload, and log out. A forged local boolean cannot authorize a server request; a missing server secret cannot silently weaken JWT verification.

### Task 4 — Establish student ownership and validate Express input

**Priority:** P0. **Change risk:** Existing email-only access intentionally stops being a credential.

**Findings and evidence**

- **4a — Anyone can read or overwrite another profile.** `studentRoutes.js:7`, `:48`, and `:92` have no authentication; `mealRoutes.js:157` reads personalized information by a supplied email. The admin-protected student list does not protect these individual records.
- **4b — Query selector injection survives the allow-list.** `studentRoutes.js:9–29` places `req.body.email` directly into a MongoDB selector. `{email: {$ne: null}, name: 'Injected'}` reaches the update query. A whitelist of update fields does not validate this filter. The same type problem exists for login usernames and meal filter query objects.
- **4c — Missing create validation and inconsistent identity.** The profile upsert can omit required create fields because update validators inspect changed paths. Emails are not normalized, format-validated, or trimmed in the schema, so variants can become separate identities. Existing duplicate-key errors are usually returned as 500.
- **4d — Unbounded or malformed pagination/filter input.** `mealRoutes.js:96–123`, `:159`, and `studentRoutes.js:68–76` accept zero, negative, giant, repeated, fractional, or malformed values. `limit=0` disables MongoDB's result limit; `20junk` is accepted by `parseInt`; missing validation can produce 500 or misleading page counts.
- **4e — ID, numeric, and nested payload errors leak through.** Invalid meal IDs commonly produce 500, `rating='5'` reaches arithmetic, and unknown/oversized nested strings and arrays lack explicit boundary checks. A stored invalid email is accepted by the Student schema.
- **4f — Error middleware is bypassed or misclassifies parser errors.** Most route catches send `err.message` directly instead of forwarding to the global handler. Malformed JSON and oversized requests can fall through the default 500 branch instead of returning 400/413. Email-bearing paths are logged verbatim by `app.js:68`.

**Files:** `backend/models/User.js`, `models/Student.js`, all route modules, `middleware/auth.js`, `app.js`; create `backend/validation.js`, `middleware/requireStudent.js`, `frontend/src/pages/StudentAuth.jsx`; update `StudentForm.jsx`, `Recommendations.jsx`, `BrowseMeals.jsx`, `Navigation.jsx`, `App.jsx`, `services/api.js`, and session tests.

**Ownership design:** Extend the existing User account system with a `student` role and link profiles through a unique `Student.userId`. Reuse bcrypt and JWT. Add student registration/login UI, `POST /api/auth/register` for student accounts only, and `/auth/me`. A new account may create its own profile. An existing legacy profile with the same email must return `409 profile_claim_required` until a trusted migration or an administrator has established ownership; knowing the email alone must never claim it. Registration must reject a supplied admin/staff role. Password reset/email-verification services are outside this fix's automatic scope; do not simulate verification.

**API decision:** Use authenticated `GET/POST /api/students/me`, `POST /api/students/me/feedback`, and `GET /api/meals/recommend/me`. Keep old email paths only as authenticated compatibility aliases that verify the requested email belongs to the session, or require explicit admin access. Register static `/me` paths before dynamic parameters. The supplied email is never the authority for a write.

**Boundary defaults:** `page` is an integer >=1; meal/student list `limit` is 1–100; recommendation `limit` is 1–20; rating is an integer 1–5. Reject duplicate query parameters and object/array values where scalars are expected. Nutrient filters are finite nonnegative numbers; preserve decimals and require min <= max. Accept only the existing cuisine/category/diet/sort enums. Trim strings; use name <=120, email <=254, descriptions <=2,000, arrays <=30 entries with each entry <=80 characters. These are proposed defaults to encode and document together.

- [x] Add tests for unauthenticated read/write, cross-student reads/writes, account-role injection, legacy-email claiming, `$ne` selectors, nested operator keys, duplicate query parameters, missing name on create, canonical-email collisions, invalid ObjectIds, and every invalid pagination class above.
- [x] Demonstrate those failures using the safe fixtures from task 1. Assert no model/database call occurs for rejected payloads.
- [x] Implement ownership with server identity, explicitly validate request types before query construction, allow-list nested fields, and validate the full profile on create. Define partial updates by allowed nested paths so changing diet does not erase cuisine/category preferences. Use server-controlled `userId` and email identity.
- [x] Send route errors to one handler. Return 400 for malformed/types/cast errors, 401/403 for auth, 404 for absent resources, 409 for identity conflicts, 413 for oversized bodies, and a generic 500 for unexpected failures. Log request IDs and route templates rather than raw email-bearing URLs. Never return stacks or credentials. Apply `Cache-Control: no-store` to authentication, profile, and personalized responses; `/auth/me` exposes only the necessary identity/role fields, never a password hash.
- [x] Add an owner-authorized delete route, with the existing admin delete retained. Task 5 must remove/retire linked feedback and adjust summaries consistently. Update the client login/profile flows atomically; never deploy a server that requires a student token while leaving the only frontend unable to obtain one.
- [x] Run `tests/ownership.test.js`, `tests/validation.test.js`, and student-auth browser tests, then commit this compatibility cutover with its migration instructions.

**Acceptance:** Neither a known email nor a MongoDB operator can select another person's data. Every rejected boundary case has a stable 4xx response and does not execute a write.

### Task 5 — Make ratings and feedback consistent under retries and concurrency

**Priority:** P0.

**Findings and evidence**

- **5a — Unauthenticated, unlimited voting.** `mealRoutes.js:275` has no auth or per-user uniqueness. Any request can change crowd ranking and push history for a supplied email.
- **5b — Duplicate frontend writes.** `MealCard.jsx:29–38` writes the rating, then invokes `Recommendations.jsx:92–124`, which writes the rating again and separately posts feedback. One star click produced two `/rate` requests and one feedback request in Chromium; each rating also pushes backend history.
- **5c — Lost updates and cumulative rounding.** `mealRoutes.js:283–296` calculates a new count and mean from a read document, then saves. Concurrent scalar saves can overwrite each other. Repeated rounding of the stored mean loses information; there is no exact rating sum.
- **5d — Incorrect coercion.** With an average of 4 and one existing rating, string rating `"5"` produces `(4 + "5") / 2 = 22.5`. Strings/booleans/arrays pass parts of the present validation.
- **5e — Partial commits and corrupt feedback identity.** Meal totals save before the optional student history update. A later failure returns an error after the vote has already been counted, so retrying counts it again. `studentRoutes.js:108–123` separately reads/edits/saves an array, with no meal existence/active check or database uniqueness constraint.
- **5f — Unbounded, misleading history.** The rating endpoint always pushes another history entry. The other feedback endpoint updates the first match. Numeric rating is not retained, duplicates accumulate, `consumedAt` is actually a feedback time, and failed/unawaited parent callbacks can still show local success.
- **5g — Deleted meals and stale UI.** Ratings can target inactive meals; `MealCard` does not apply the returned new average/count, and local star/feedback state can survive a change of user.

**Files:** Create `backend/models/MealFeedback.js`, `backend/services/feedback.js`, `backend/tests/feedback.test.js`; modify `Meal.js`, `Student.js`, both relevant route modules, `MealCard.jsx`, `Recommendations.jsx`, `BrowseMeals.jsx`, and `services/api.js`.

**Canonical data/interface:** `recordMealFeedback({studentId, mealId, rating?, liked?})` owns all feedback writes. One `MealFeedback` document per `{studentId, mealId}`, enforced by a unique compound index; it stores the numeric rating, resolved liked value, feedback time, and whether the source is explicit feedback or a rating. A rating implies `liked = rating >= 4` for newly recorded data; an explicit later thumbs response can change liked without manufacturing a numeric rating. Version this changed definition. Preserve legacy data separately during task 12.

Add exact `Meal.ratingSum`; `totalRatings` counts distinct current numeric ratings. Define `popularity` as that same distinct-rater count for this version, rather than request count. Compute `averageRating = ratingSum / totalRatings` without storage rounding; round only at presentation. A same-user rerating changes the sum by the difference and does not increment the count.

- [x] Add tests: one browser click -> one server mutation; same-user retry -> one row/count; rerate 2 then 5 -> sum 5/count 1; twenty simultaneous distinct users -> exact sum/count 20; concurrent same-user first writes -> one row; string/boolean/fractional rating ->400; inactive/nonexistent meal ->404; simulated history/summary failure -> no partial success.
- [x] Run the new tests against an isolated MongoDB replica set and observe failures before implementation.
- [x] Use a MongoDB transaction to update the canonical feedback and meal summary together, including bounded retry handling for concurrent insert/index conflicts. Both existing feedback URLs delegate to this one operation with the session's identity. A meal-only atomic arithmetic update is insufficient when a separate unique feedback record must commit too. MongoDB documents the boundary between [single-document atomicity and multi-document transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
- [x] Let the parent page own the network mutation; make `MealCard` await `onRate` and render the returned server values. Remove its direct write and rating-triggered second feedback call. Keep failure state visible, disable only the pending control, and reset identity-specific UI when the signed-in user changes.
- [x] Stop pushing new embedded `mealHistory` entries. Read latest feedback from the indexed collection when needed; paginate it. Delete linked feedback and reconcile summaries transactionally when deleting a profile. Keep the legacy field read-only until task 12 verifies migration.
- [x] Run concurrency, rollback, retry, deletion, and browser tests. Commit schema, service, callers, and migration prerequisites together.

**Acceptance:** Every accepted numeric rating is counted once per authenticated user and meal, even after retries. Feedback never claims that a meal was consumed, and the UI does not announce success for a failed write. The extra transaction writes and unique index must be measured under the intended small deployment's load.

### Task 6 — Enforce profile eligibility and trustworthy food metadata

**Priority:** P0 for allergies; P1 for the other ignored preferences.

**Findings and evidence**

- **6a — Allergies are completely ignored.** The profile schema and form collect allergies, but `mealRoutes.js:167–198` never excludes matching `Meal.allergens`. A dairy-allergic profile can receive a dairy-labelled meal in both ML and fallback paths.
- **6b — Missing allergen metadata is treated as absence.** The seeder has no ingredient/allergen source and inserts no verified allergen information. An empty default array does not establish that a meal is allergen-free.
- **6c — Saved category preferences are ignored.** `student.preferences.categories` is stored but only the request's `mealType` is consulted.
- **6d — Daily goals/activity are saved but unused.** No ranking or model input uses daily calories, daily protein, activity level, or eating history. Product copy claims more adaptation than exists.
- **6e — Inconsistent catalogue meaning.** Seeder cuisine/category heuristics differ from training mappings. Desserts/beverages/condiments can become `Main Dish`; South Indian meals can be represented as General/North Indian in training. These are semantic differences, not a one-hot syntax issue.
- **6f — Soft deletion is inconsistently applied.** `GET /meals/:id` and rating lookups return/find inactive meals even though browse and recommendation queries filter them out.

**Files:** `backend/models/Meal.js`, `models/Student.js`, `routes/mealRoutes.js`, new `backend/services/eligibility.js`, importer/seeder mapping from tasks 11–12; `StudentForm.jsx`, `Recommendations.jsx`, and catalogue tests.

**Interface:** `buildEligibilityFilter(student, {mealType?})` builds the one filter used by every recommender mode. Add `allergenStatus: 'unknown' | 'verified'` to Meal; normalized allergens are explicit catalogue data, never guesses from a food name. Canonical enum values remain the current four cuisines, five categories, and two diets until a deliberate schema/data migration expands them.

- [x] Add fixtures for dairy/peanut aliases and mixed case, unknown metadata, cross-contamination/uncertain entries, vegetarian exclusion, categories, explicit mealType conflicting with saved categories, inactive meals, and zero eligible results. Assert all ranking modes use the same eligible IDs.
- [x] Observe failures in `tests/eligibility.test.js` before implementing the shared rule.
- [ ] Normalize agreed allergen vocabulary and aliases at write time, backfill known tags without inventing missing information, and exclude overlaps. If a student has allergies, exclude unknown/uncertain allergen records from personalized recommendations. Report how many were excluded for missing metadata; never loosen this rule to fill the results list.
- [x] Apply saved categories when mealType is absent; when it is present, intersect it with saved constraints. Keep the current exact vegetarian/non-vegetarian selection behavior and document it. Do not silently reinterpret a non-vegetarian selection as unrestricted.
- [x] Keep daily goals and activity informational for this release, clearly labelled as such, rather than inventing a daily meal planner. Per-meal bounds remain operative. Task 9 may use profile context only when it has validated training evidence.
- [x] Apply active-meal checks consistently to public detail and feedback routes. Provide authenticated admin access for inactive-record management only where task 16 needs it. Validate curated nutrition units per serving; do not infer medical suitability from incomplete metadata.
- [x] Run eligibility tests and the allergy profile-to-recommendation browser flow. Commit the backend rule and truthful user messages together.

**Acceptance:** A matching allergy or unknown allergen status cannot be bypassed by an ML score, crowd rating, fallback, or empty-result recovery. The catalogue may need real curation before allergy-aware recommendations become useful.

### Task 7 — Correct ranking, degradation, and recommendation response contracts

**Priority:** P0 for truthful behavior; P1 for ranking quality.

**Findings and evidence**

- **7a — Fallback blends incompatible ranges.** `mealRoutes.js:249–256` combines a 0–5 rating and an unbounded popularity counter; popularity eventually dominates. The working ML path's rating normalization is already fixed locally and must remain fixed.
- **7b — Invalid ML responses silently produce empty success.** `success:false`, missing `results`, all per-item errors, and valid-but-all-negative predictions can leave `recommendations=[]` with no degraded-mode explanation. Only thrown errors enter the fallback.
- **7c — Results are trusted by array position.** Lines 227–238 do not validate count, meal identity, recommendation type, finite confidence, or its [0,1] range. Reordered or truncated results can be misapplied; confidence 2 was accepted in a handler probe.
- **7d — Equal timeout budgets defeat graceful fallback.** The browser client and Node's ML call both use 10 seconds. By the time Node falls back, the browser can have abandoned the request.
- **7e — Crowd preselection hides candidates.** Only the top 100 by raw average/popularity enter scoring. Once the catalogue exceeds this bound, a high-fit new meal outside that group cannot be recommended, irrespective of its profile fit.
- **7f — `mlApiUsed` is inferred from the first returned meal.** Empty successful predictions, mixed degraded results, or fabricated fallback confidence `0.5` make service status and displayed confidence misleading.
- **7g — One-rating winners and unstable ties.** Raw averages let a single 5-star vote dominate a well-supported meal, and sort keys do not end with a stable unique tiebreaker.

**Files:** Create `backend/services/recommendations.js`, `backend/tests/recommendations.test.js`; modify `mealRoutes.js`, `frontend/src/services/api.js`, `Recommendations.jsx`, `MealCard.jsx`, and ML contract tests.

**Interfaces and decisions:** Default `RECOMMENDER_MODE=baseline`; enable behavioral mode only after tasks 8–10 pass its release gate. The baseline applies task 6's hard constraints and ranks crowd evidence transparently. Return `recommendationMode`, `degradedReason`, `modelVersion`, `totalEligible`, `totalMealsEvaluated`, and `recommendations`. Each item has `rankingScore` in [0,1] and nullable `confidence`; baseline confidence is `null`. Retain `mlApiUsed` only as a correctly derived compatibility field during client cutover.

Use a bounded Bayesian rating prior: `ratingNorm = (ratingSum + 5 * 3) / (5 * (totalRatings + 5))`; the prior is five ratings with mean three, explicitly a ranking default rather than observed votes. Normalize distinct-rater popularity with `log1p(count) / log1p(maxCount)` within the eligible candidate set; use zero when all counts are zero. Baseline score is `0.6 * ratingNorm + 0.4 * popularityNorm`. Behavioral mode, once valid, uses `0.7 * positiveProbability + 0.3 * ratingNorm`. Break ties with `_id`.

- [x] Add golden ranking tests for zero ratings, one rating versus many, large counts, equal scores, normalized output bounds, explicit weights, malformed ML responses, reversed IDs, partial item failures, all-negative predictions, and safe fallback preserving every constraint.
- [x] Add a delayed-ML integration test: a timeout yields a baseline response before the existing 10-second browser timeout, with an explicit reason and null confidence.
- [x] Move ranking into the shared service. Send stable meal IDs to ML and validate returned IDs against the requested set; require one result or one explicit error per input. Use a 2.5-second ML timeout, bounded response/body sizes, and no automatic retries on feedback writes. On unusable/error output or no positive picks, return eligible baseline meals with an explicit mode/reason. Preserve a true empty result only when hard constraints leave no eligible meals.
- [x] For the current small catalogue, score all eligible meals rather than raw-popularity preselecting 100. Bound one request at 500 candidates by fetching at most 501; above that return a clear `422 narrow_preferences` result rather than silently claiming the best matches from an arbitrary truncated set. Add a documented `shortcut:` comment requiring measured retrieval design when the catalogue routinely exceeds this limit. Batch limits in task 10 must match.
- [x] Derive service/mode metadata from actual execution, not the first result. Never manufacture a probability for a fallback. Update frontend rendering and explain a degraded result without turning it into a generic network error.
- [x] Run scoring, contract, timeout, 101-candidate, 501-candidate, and browser tests. Commit shared scoring and all consumers together.

**Acceptance:** Weights operate on comparable scales; unreliable ML still returns safe, labelled baseline results; result identity cannot drift; and score metadata describes what actually ran. No accuracy number or crowd score is presented as a validated personal match probability.

### Task 8 — Stop serving random or silently retrained models

**Priority:** P0.

**Findings and evidence**

- **8a — Target is an input rule.** `ml/api/app.py:62–84` defines `target = protein > median(protein)` and includes protein in X. The current training run reproduced 1.0 accuracy. Neither that score nor a claimed 85% measures user preference.
- **8b — Dummy results masquerade as production ML.** `create_dummy_model():103–124` trains random labels and hardcodes accuracy `0.75`. `health_check():312–323` then calls it healthy. Failure of the real model can therefore look like success.
- **8c — Requests can train and write models.** `ensure_model_loaded()` lazily invokes a loader that retrains on missing/corrupt artifacts and writes `MODEL_PATH` beside source code. Cold requests can do CPU-heavy training, encounter read-only deployment storage, or run concurrent initialization.
- **8d — Artifact provenance is insufficient.** Only model/features/accuracy are saved; dataset hash, label definition, feature schema, split policy, training library versions, evaluation evidence, and model version are missing. A pickle from an incompatible environment can trigger the unsafe fallback path.

**Files:** `ml/api/app.py`, new `ml/train.py`, `ml/tests/test_model_lifecycle.py`, artifact metadata alongside the eventual model; Node mode handling from task 7; documentation in task 20.

**Interface:** Inference loading returns a validated artifact or an explicit unavailable state. It never trains or writes. Readiness includes `modelStatus`, `modelVersion`, and a meaningful availability status. Baseline service remains available without a model.

- [x] Add tests for missing/corrupt artifact, wrong feature schema, incompatible versions, missing metadata, concurrent initialization, and a read-only application directory. Assert no training function/file write occurs during any HTTP request.
- [x] Confirm the current lifecycle violates those assertions before modifying it.
- [x] Remove automatic calls to `create_model_from_dataset` and `create_dummy_model` from production inference. Remove the fabricated 0.75 metric. Keep synthetic fixtures only inside tests. Make the former protein-rule classifier an explicitly labelled demonstration artifact if retained at all; do not select it in production recommendation mode.
- [x] Load a packaged, trusted artifact once per worker under a safe initialization path. Validate schema/version/metadata before publishing it to the request handler. Missing model returns structured 503/unavailable for prediction and meaningful degraded readiness; Node uses the baseline.
- [x] Move training into an explicit offline command, write to a temporary artifact path, validate it, then atomically replace the release artifact. Record hashes and the full training/evaluation manifest. Never deserialize user-uploaded pickle files.
- [x] Run lifecycle tests on a read-only fixture directory and verify baseline operation with no model. Commit the lifecycle separation and model-claim removal.

**Acceptance:** A failed model cannot become a healthy random model. Requests do inference only. A real behavioral model remains unavailable until its data and evaluation justify enabling it. Vercel documents a [read-only function filesystem with temporary scratch storage](https://vercel.com/docs/functions/runtimes), so source-adjacent artifact writes are not a persistence mechanism.

### Task 9 — Build genuine behavioral training and consistent feature encoding

**Priority:** P1. **Dependencies:** Complete task 12's data provenance migration before using historical feedback.

**Findings and evidence**

- **9a — Model input has no student context.** `mealRoutes.js:209–216` sends only meal features. Two students with the same eligible meals get the same model scores, regardless of history/activity/daily goals.
- **9b — Training/serving taxonomy drift.** Training fabricates cuisine from raw Category and sees only General/North Indian. Serving supports four cuisines and only five categories. The artifact has 17 features, including categories the app cannot create. South Indian/Street Food become all-zero cuisine vectors.
- **9c — Batch/single preprocessing can silently default missing values.** `create_feature_vector():283–310` fills missing numerical values with zero and unknown categories with all zeros; it never distinguishes valid zero, absent input, and unseen vocabulary.
- **9d — Evaluation is too narrow for the product claim.** There is one non-stratified 80/20 split of 98 nutrition rows, around 20 test examples, no behavioral labels, no baseline comparison, no group/time holdout, and no ranking evaluation. A feature-importance warning alone would not repair this.
- **9e — Probability lookup assumes class 1 is column 1.** Both prediction handlers index `[1]` without validating the trained class set. A single-class artifact breaks this assumption.
- **9f — No exposure/context evidence exists.** The system records feedback without the recommendation context that preceded it. Unrated/unseen meals cannot be treated as disliked, and evaluating only volunteered ratings can overstate ranking performance through selection bias.

**Files:** `ml/train.py`, new `ml/features.py`, `ml/evaluate.py`, `ml/tests/test_training.py`, `ml/tests/test_encoding.py`; `ml/api/app.py`; new `backend/models/RecommendationEvent.js`; feedback export/migration utility; Node recommendation service/request builder and feedback service; `frontend/src/services/api.js`, recommendation/rating consumers; `ml/API_GUIDE.md`.

**Interface:** Versioned `student_context + meals[{meal_id, canonical meal fields}]` request. The artifact contains the preprocessing pipeline and classifier together, canonical vocabularies, positive class, feature schema version, and dataset/split metadata. It returns `meal_id`, `recommended`, `confidence`, and model version, or an explicit per-item error.

- [ ] Add tests that pin identical training/serving encodings for every canonical cuisine/category/diet; unknown values must follow a documented explicit unknown path or be rejected. Test single-class labels and mismatched schema versions as unavailable, not an indexing error.
- [ ] Add a label-audit test asserting neither `rating`, `liked`, the target, post-feedback timestamps, nor post-event aggregate statistics occur among input features. Test that changing a future rating cannot change an earlier evaluation feature row.
- [ ] Record one bounded `RecommendationEvent` per authenticated recommendation response, containing its returned meal IDs, prediction-time feature snapshots, schema/model version, and timestamp. Return an opaque `contextId`; a later feedback write may reference it only when it belongs to the same student and includes that meal. Update the response/client/feedback contracts and tests together. Do not reconstruct the snapshot from the mutable profile at rating time. Browse ratings without a valid exposure remain valid crowd feedback but are excluded from exposure-based ranking evaluation.
- [ ] Export only authenticated, provenance-approved feedback linked to the applicable event. Define the new target as task 5's versioned liked outcome. Unobserved outcomes remain missing, not negative labels. Measure/report selection bias and the limits of volunteered feedback; do not describe this offline test as an unbiased experiment. Minimize stored personal data and export pseudonymous IDs rather than email/name. Bound event retention through an explicit export/retention policy before enabling collection; do not silently delete the only training evidence.
- [ ] Split chronologically for returning-user predictions and hold out users separately for cold-start evaluation. Keep repeated user/meal pairs in a coherent split. Fit encoders/imputers on training data only. Compare against the exact deployed baseline, majority prediction, and simple popularity. Report positive/negative counts, per-split support, precision/recall, PR-AUC, and ranking metrics such as NDCG@10 and Recall@10, with uncertainty and split limitations. Do not promise 85% accuracy.
- [ ] Package the preprocessing with the classifier; resolve positive probabilities through `classes_` and reject unsupported class sets. Validate calibrated-probability claims separately from discrimination/ranking metrics. Without adequate real labels or improvement over the baseline, publish an evaluation status of `insufficient_data`/`not_approved` and keep baseline mode.
- [ ] Run `python -m unittest discover -s ml/tests -p 'test_training.py'` and the encoding/evaluation tests. Synthetic fixtures prove pipeline mechanics only. Commit training/export/evaluation code separately from enabling any real model.

**Acceptance:** The training path is executable and its schema agrees with serving. Enabling behavioral mode additionally requires a real-data report with no target leakage, both classes in applicable splits, a documented deployment-matched comparison, and a reviewed improvement over baseline. Real labels do not currently exist in sufficient verified form merely because a model file exists. Follow the guidance on [preventing leakage through correct split and preprocessing boundaries](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage).

### Task 10 — Validate and protect the Flask inference boundary

**Priority:** P0.

**Findings and evidence**

- **10a — Inconsistent malformed-input handling.** `predict():184–208` only checks field presence. Batch handling skips that check entirely. A batch of `[{}]` was predicted; `[null, validMeal]` broke the whole batch while attempting `meal.get` during error serialization. Non-object envelopes and malformed JSON can become 500s.
- **10b — No finite/range/enum validation.** Negative nutrients, unknown cuisines, booleans/numeric strings, NaN-like values, and oversized strings are not deliberately controlled. A single bad numeric value can reach model-wide failure.
- **10c — Unbounded public work and permissive CORS.** `CORS(app)` permits arbitrary browser origins; there is no service authentication, batch bound, or configured `MAX_CONTENT_LENGTH`. Direct callers can bypass Node's limits and trigger expensive work/model initialization.
- **10d — Stack traces and misleading status.** Broad handlers return `traceback.format_exc()` to clients. Root/health/features can initialize a model, and their healthy status does not establish a trustworthy model.
- **10e — Frontend calls ML directly without timeouts.** The `mlAPI` helpers use global Axios without timeouts; `AdminMealForm` fetches features through that path. Introducing service authentication without changing this caller would break the admin page.

**Files:** `ml/api/app.py`, `ml/features.py`, `ml/tests/test_api.py`; add a Node admin-only ML metadata proxy in `backend/routes/mealRoutes.js` or a focused `backend/routes/mlRoutes.js`; update `backend/app.js`, both environment examples, `frontend/src/services/api.js`, and `AdminMealForm.jsx`.

**Boundary defaults:** JSON object envelopes; single and batch rows share the same validator; batches have 1–500 items; raw body <=1 MiB. Nutrients must be finite nonnegative numbers, never booleans or numeric strings. Require canonical enum strings and matching schema/model versions. Return JSON 400/413/422 for client errors, 503 for unavailable inference, and a generic 500 for an unexpected internal failure. No response contains a trace.

- [x] Add table-driven Flask tests for absent/wrong content type, malformed JSON, `null`, array/string envelope, missing required fields, empty/non-array meals, null rows, unknown categories, negative/infinite values, boolean/string nutrients, 501 items, and excessive body size. Verify batch item errors preserve original meal IDs/order and do not crash error formatting.
- [x] Run the tests using Flask's test client; confirm the failures before implementation.
- [x] Apply one validator to single and batch input, enforcing bounds before constructing a DataFrame or loading a model. Serialize per-item errors without assuming the bad item is a dict. Do not silently turn missing features into valid zeros. Keep inference vectorized for valid rows.
- [x] Make Node the only intended inference caller. Require a server-held `ML_API_TOKEN` with constant-time comparison for prediction and private metadata; do not put it in `VITE_` variables. Restrict/remove browser CORS. Proxy admin feature metadata through authenticated Node and remove unused direct ML helpers from the frontend.
- [ ] Keep a cheap liveness check separate from model readiness. Report unavailable/degraded status honestly; apply provider-level access restrictions/rate limits when deploying the public URL. CORS is not an access-control mechanism for non-browser callers.
- [x] Run single/batch contract tests, Node proxy authorization tests, and admin feature-display tests. Commit all callers/configuration with the boundary change.

**Acceptance:** Bad input cannot cause unbounded work, leak a stack, or become a valid fabricated prediction. The frontend does not need a secret or a direct ML connection.

### Task 11 — Replace CSV splitting with validated, idempotent imports

**Priority:** P0 for catalogue integrity.

**Findings and evidence**

- **11a — Invalid CSV parser.** `AdminMealForm.jsx:170–184` splits lines and commas. It breaks quoted commas, escaped quotes, embedded newlines, BOM headers, missing cells, duplicate headers, and row-width mismatches. Field trimming already handles ordinary CRLF suffixes; quoting remains broken.
- **11b — No shared field allow-list or typed row contract.** `mealRoutes.js:384–400` passes the raw array to `insertMany`. Schema-known counters, active status, nutrition score, and timestamps can bypass the stricter single-create interface. Strings rely on Mongoose casting; empty/invalid cells can fail after other rows were written.
- **11c — Retry creates duplicates.** No stable import key or uniqueness constraint exists. Reuploading a file inserts new meals, and retry after a timeout cannot know what already persisted.
- **11d — Partial success is misreported.** Unordered inserts can write some rows, then throw or drop invalid documents. The backend can return generic 500 after writes; the frontend always announces the input array length rather than the server's confirmed count.
- **11e — No explicit import-size limits or preview.** The file picker accepts a suffix, not valid data; the whole file is loaded without a row/file policy. The original ML CSV headers also differ from the canonical API property names.

**Files:** Create `backend/services/catalogueImport.js`, `backend/tests/import.test.js`, and a small valid/invalid CSV fixture set; modify `Meal.js`, `mealRoutes.js`, `AdminMealForm.jsx`, `services/api.js`, backend package files, and the task 12 seeder.

**Interface:** `parseAndValidateMeals({csv?, meals?})` accepts exactly one of raw CSV text or a canonical JSON row array and returns normalized rows or row-numbered errors. Add only a maintained CSV parser dependency, such as `csv-parse`, on the backend. `importMeals(rows, {dryRun})` owns upserts. Preserve the current JSON array API as a validated compatibility input. The browser sends CSV text for authoritative server parsing.

**Identity policy:** Prefer a stable `source + externalId`; otherwise derive a normalized key from name, serving size, and diet. Changes to nutrition/cuisine/category update the same keyed item. Ambiguous distinct meals with the same fallback key require explicit external IDs; do not silently merge them. Add a unique `catalogueKey` index only after task 12 resolves existing collisions.

- [x] Add tests for quoted comma/newline/quote, BOM, CRLF, duplicate/unknown/missing headers, bad row length, empty/invalid/negative numeric cells, malformed arrays, injected counters, duplicate keys, same-file retry, concurrent import, and unchanged ratings after updating nutrition.
- [x] Add browser assertions that the displayed created/updated/rejected counts equal the server response, not the number of lines selected. Confirm current behavior fails.
- [x] Parse CSV on the backend, map supported source headers explicitly, validate all rows before writing, and reuse the same nested allow-list/types as single-meal writes. Treat allergen/ingredient lists with an explicit in-cell delimiter documented in the sample file. Reject supplied identity/counter/timestamp fields that the server owns.
- [x] Limit each import to 500 rows and 1 MiB of CSV text; bound the JSON envelope as well. Offer a dry-run validation summary before applying writes. Use keyed `bulkWrite` upserts with nutrition/catalogue fields in `$set` and counters in `$setOnInsert`; do not reset ratings or reactivate a soft-deleted record just because a CSV is reuploaded.
- [x] Return confirmed inserted/updated/unchanged/error counts and row errors. Validation failure writes nothing. If persistence fails partway, return explicit partial/unknown state and a safe retry instruction; do not claim all-or-nothing behavior without a transaction. Repeating the operation must converge without duplicates.
- [x] Run parser, database import, and admin import browser tests. Commit parser, index/migration prerequisites, server responses, sample CSV, and UI together.

**Acceptance:** A valid quoted CSV imports correctly; repeating it preserves meal IDs and crowd data. An invalid file is rejected predictably before writes, and a persistence failure does not produce a false full-success message. Streaming/background jobs remain unnecessary within the stated bound.

### Task 12 — Replace destructive seeding and migrate existing records safely

**Priority:** P0.

**Findings and evidence**

- **12a — Seeder destroys existing IDs and ratings.** `seedMeals.js:99–100` runs `Meal.deleteMany({})` before row validation. A malformed file, later insertion failure, or routine rerun can erase the catalogue and leave history pointing to deleted ObjectIds.
- **12b — Seeder invents crowd evidence.** Lines 141–143 use random popularity, average ratings, and rating counts. Those values feed recommendations and cannot be treated as real behavioral labels or user opinions.
- **12c — Counts and failures are dishonest.** Lines 165–169 increment the inserted count by the entire batch even when insertion throws. The outer catch logs failures without a nonzero process exit code. Connection starts at module import and is not explicitly awaited before work.
- **12d — Independent heuristics distort categories.** Cuisine heuristics depend on substring order; e.g. a food containing `vada` is South Indian before Street Food checks run. Unsupported CSV categories fall back to Main Dish. Nutrition score is generated from an undocumented protein/calorie formula and can disagree with later edited nutrition.
- **12e — Existing feedback cannot reconstruct authentic ratings.** Embedded entries may be duplicated, unauthenticated, and affected by the double-write bug. Meal aggregate counters have no attribution and may include fabricated seed values. A migration cannot invent the missing voters or numeric ratings.

**Files:** `backend/scripts/seedMeals.js`; create `backend/scripts/migrateCatalogue.js`, `backend/scripts/migrateFeedback.js`, and migration tests; reuse `services/catalogueImport.js`; modify schema/index rollout documentation and `QUICK_Start.md`.

**Interface:** Seeder is a thin, explicit CLI around the same validated importer. Module import performs no connection, delete, or write. Migration CLIs default to dry-run and require an explicitly selected database and apply mode; destructive reset is not the ordinary seeding command.

- [x] Add tests: importing the seeder has no side effects; rerun preserves IDs/feedback; bad CSV preserves the old catalogue; failure exits nonzero; confirmed counts match writes; identical names with conflicting identities are reported rather than merged.
- [x] Export a backup and manifest containing affected IDs, counts, canonical keys, and hashes. Test restore on an isolated database. Run migrations in dry-run mode and review the collision/unowned-profile reports.
- [ ] Route seeding through task 11's importer, remove the collection wipe, remove random production counters, and use a curated source-ID mapping for cuisine/category rather than two conflicting heuristics. Preserve original source category metadata when mapping into the supported app taxonomy. Unknown mappings require review, not a default Main Dish. (Importer complete; the 98-row source still needs a reviewed mapping.)
- [x] Preserve legacy crowd aggregates in an exported/archived snapshot with provenance `legacy_unverified`. Start new authenticated feedback statistics separately at cutover; do not silently claim old aggregates were reconstructed. Migrate only defensible latest per-user/per-meal feedback with original timestamps and an untrusted-legacy marker; exclude it from task 9 training until verified. Do not fabricate numeric ratings from booleans.
- [ ] Backfill catalogue keys and allergen status, resolve duplicates through an explicit ID remapping table, update references, then create unique indexes. Keep old fields readable until the new version passes reconciliation. Link profiles to accounts only through trusted ownership evidence, per task 4. (Script and isolated rehearsal complete; live backfill awaits reviewed data and a maintenance window.)
- [ ] Make the scripts await connections/cleanup, report exact results, and return meaningful exit codes. Remove `nutritionScore` unless its semantics and recomputation on every nutrition edit are deliberately retained; task 16 chooses removal from the form.
- [x] Run migration rehearsal twice, verify the second pass is idempotent, restore the backup in a separate database, and commit scripts plus the migration/rollback runbook.

**Acceptance:** Normal setup no longer deletes a working catalogue. New crowdsourced statistics are attributable. Legacy ambiguity is documented rather than disguised. Preserve recoverable data before any reset of public counts.

### Task 13 — Repair the shared rate limiter and define outage behavior

**Priority:** P0.

**Findings and evidence**

- **13a — Wrong RedisStore import.** `backend/app.js:6,38` treats the CommonJS module object as a constructor. The local probe reproduced `RedisStore is not a constructor`, so the catch selects memory even with Redis variables configured.
- **13b — Wrong Upstash command adapter.** `app.js:39` calls `redisClient.call`, which does not exist in the installed SDK. Fixing only the import still does not make the store work.
- **13c — Misleading fallback and asynchronous failures.** The constructor catch is not a comprehensive policy for later network/script failures. Silently falling back to per-process memory in a multi-instance deployment weakens the stated limit.
- **13d — Client-IP assumptions are not deployment-validated.** No proxy trust setting is configured. Behind a proxy, clients may share a key, or a careless future `trust proxy=true` fix may trust spoofed headers. This is a deployment-dependent risk, not a verified production incident.
- **13e — One global policy mixes unrelated traffic.** Login guesses, ratings, stats polling, and health requests share 100 requests per 15 minutes. The setup provides no distinct login or authenticated mutation protection; health polling can also exhaust the limit.
- **13f — Large bodies are parsed before rate limiting.** The 10 MB parsers run before the limiter. Rejected clients can still impose avoidable parsing/memory work.

**Files:** `backend/app.js`, new `backend/rateLimiter.js`, `backend/tests/rate-limit.test.js`, `.env.example`, deployment runbook.

**Interface:** A configured limiter store must pass startup/initialization checks. Production requires shared state or an explicitly verified edge limiter; memory is an explicit local-development mode only. Authentication and mutation policies use distinct prefixes.

- [ ] Add adapter tests asserting the named `RedisStore` export is used and `sendCommand(...args)` calls the installed Upstash SDK's raw `exec(args)` API. Test async initialization and request-time failure paths separately.
- [ ] Run the current code against these stubs and confirm both integration defects before editing.
- [ ] Use `const { RedisStore } = require('rate-limit-redis')`, with a validated SDK command adapter and a bounded Redis timeout. Match store initialization/error behavior to the installed package version; never assume the constructor catch catches later promises. The [store's upstream CommonJS and command-adapter documentation](https://github.com/express-rate-limit/rate-limit-redis) describes the required interfaces.
- [ ] Retain the public global limit as a documented starting policy; add a proposed login limit of 10 attempts per 15 minutes per trusted client key and an authenticated rating/feedback limit of 30 writes per minute per account. Prefix keys by environment and policy. Keep shared state across instances and return consistent 429/retry metadata. Test IPv4/IPv6 handling through the limiter's supported key helpers.
- [ ] Configure proxy trust for the actual deployment path, never arbitrary forwarded values. Validate two real client addresses and a spoofed `X-Forwarded-For` in staging. Put cheap admission limiting before large body parsing; exempt cheap liveness from the user quota while protecting it at the deployment edge if needed.
- [ ] Define Redis outage as explicit 503 for protected admission paths, with logs/alerts, rather than silently changing to a weaker production policy. Keep local memory behavior opt-in and visible in non-production configuration.
- [ ] Run isolated two-app shared-store tests. Before marking deployment verified, run an actual harmless Upstash/staging limit test using a separate test prefix; mocked adapter tests alone are not that evidence. Commit implementation and runbook.

**Acceptance:** Two instances enforce one limit. Missing/broken shared infrastructure does not present a false claim of global protection.

### Task 14 — Fix statistics, database lifecycle, readiness, and bounded reads

**Priority:** P1.

**Findings and evidence**

- **14a — Statistics are stale after every mutation.** `mealRoutes.js:10–53` caches for five minutes in process memory; create/update/delete/import/rating never invalidate it. Multiple instances can return different counts and ratings.
- **14b — Average rating includes unrated meals equally.** Stats averages per-meal averages, including zero defaults. A single-rated meal has the same weight as one with many votes; adding an unrated meal depresses the apparent community rating.
- **14c — Readiness lies.** `app.js:93–99` always sends `status:'healthy'` and 200 even when DB is disconnected. `/api` always says ML enabled and exposes its configured internal URL; Home treats these as service checks.
- **14d — Importing the app opens infrastructure.** Outside test mode, `app.js:165–197` connects and listens at import, starts listening before the DB promise resolves, and calls `process.exit` on failure. This complicates serverless imports, safe tests, and controlled shutdown. Actual Vercel behavior still needs deployment verification.
- **14e — Pool/request lifetimes are not explicitly bounded.** Default per-instance pools can multiply across serverless instances. List/detail endpoints return full documents, profiles include growing history, and there is no application query deadline or graceful local-server shutdown.
- **14f — Pagination lacks stable ordering.** Student listing has no sort; meal sort keys have no unique tiebreaker. With many equal ratings/calories, pages can overlap or omit records as the database chooses different tie orders.
- **14g — Index effectiveness is unverified.** Existing indexes do not necessarily match `isActive` plus current sort/filter patterns. That is a measurement gap, not proof of a collection scan on 98 records.

**Files:** `backend/app.js`, new `backend/server.js`, `backend/db.js`, `backend/tests/lifecycle.test.js`, `routes/mealRoutes.js`, `studentRoutes.js`, `Meal.js`, backend package/deploy config, Home health rendering.

**Interface:** Export a side-effect-free Express application. `connectDb()` reuses one in-flight connection promise per process. A separate local entrypoint listens after readiness and handles shutdown. Serverless handlers await the connection without spawning their own listener. Health separates cheap liveness from readiness.

- [ ] Add tests for app import without connect/listen, repeated concurrent connection requests sharing one promise, failed connection returning 503, shutdown awaiting server/DB closure, stable pagination ties, profile projection, and statistics immediately reflecting writes.
- [ ] Remove the process-local stats cache for this small catalogue. Keep the existing aggregation approach and return fresh data; add shared caching only after measurement proves it necessary and all write invalidation paths are tested. This is smaller and more honest than adding Redis cache state immediately.
- [ ] Define community average as `sum(ratingSum) / sum(totalRatings)` over active meals, returning `null` when there are no actual ratings. Return the count supporting the mean. Handle an empty catalogue without hardcoded data or a formatting crash.
- [ ] Separate liveness and readiness; return 503 when required DB infrastructure is unavailable. Report model mode/unavailability as a distinct component rather than pretending the classifier is required for baseline operation. Remove the internal ML URL from public API metadata.
- [ ] Add explicit connection configuration, starting with `maxPoolSize:5`, `minPoolSize:0`, `serverSelectionTimeoutMS:3000`, and `socketTimeoutMS:5000`, then verify against the actual Atlas/runtime workload. Bound query execution and avoid per-request reconnects. These are starting values, not a free-tier scale guarantee. Set production index creation to an explicit migration process.
- [ ] Apply projections and `.lean()` to read-only lists where document methods are not required; keep transforms compatible with the recommendation mapper. Add `_id` tiebreakers and a stable student sort. Return only required profile fields and paginate feedback separately. Use `explain('executionStats')` on representative larger fixtures before adding/removing compound indexes; record write/storage costs.
- [ ] Run lifecycle/statistics/pagination tests and a small staged dependency-outage check. Commit app/server separation, config/scripts, and callers together.

**Acceptance:** Statistics mean what the UI says, health can detect a real outage, a cold start does not accept work before its required connection is ready, and ordinary reads are bounded. No unmeasured index or pool change is described as a throughput result.

### Task 15 — Correct frontend identity, form input, and asynchronous state

**Priority:** P1.

**Findings and evidence**

- **15a — Browse email form disappears after one character.** `BrowseMeals.jsx:220` renders the entire form only when `!userEmail`; `onChange` immediately makes that false. The Save button vanishes before a valid address can be entered, and any nonempty character enables the card's email check.
- **15b — Allergy typing destroys the delimiter.** `StudentForm.jsx:91–94,366` splits/trims on each keystroke and renders `.join(', ')`. Typing `nuts,` immediately becomes `nuts`; normal typing cannot reliably enter multiple allergies.
- **15c — Profile identity is not carried consistently.** Saving a profile updates the URL but not saved email/session context. The base Profile link does not load the saved identity; a missing requested profile also leaves email blank. Raw `?email=${email}` links break plus-addresses (`+` becomes a space); unencoded path emails can be truncated by `#`/`?` characters.
- **15d — Old requests can overwrite new input.** Browse, profile lookup, recommendations, and admin list requests have no cancellation or request-generation guard. Delayed response A can overwrite a later response B, or a profile load can overwrite form edits.
- **15e — Extra requests and stale pagination.** Browse calls `fetchMeals` in two mount effects, then StrictMode can repeat them in development. Changing a filter while on page >1 first changes page with old debounced filters; sorting does not reset page. An out-of-range page after deletion/filtering can strand the UI.
- **15f — Previous identity's cards remain actionable.** Changing Recommendations' email neither clears the old results nor binds rating callbacks to the identity that fetched them. A new email can be used to rate cards fetched for an earlier email. The signed-in identity must replace this email-selector authority.
- **15g — Confusing partial states.** Profile loading has no distinct initial loading state; recommendation errors leave old cards visible, timers are not cleaned on unmount, and state updates after unmount are not guarded. `response.recommendations.length` assumes the field exists even after using a fallback empty array.
- **15h — Pagination renders every page button.** Browse/admin create an array for all pages. This becomes a slow or overflowing control for a larger catalogue, while the API already supports bounded pages.

**Files:** `StudentForm.jsx`, `BrowseMeals.jsx`, `Recommendations.jsx`, `AdminMealForm.jsx`, `services/api.js`, `Navigation.jsx`, session helper, and `frontend/tests/profile.spec.js`, `browse.spec.js`, `recommendations.spec.js`.

**Interfaces:** API helpers accept an optional Axios `signal`; the effect that starts a read owns cancellation. Session identity is the sole source of profile/rating ownership. Store allergy input as raw text until validation/submit. For retained compatibility links use `URLSearchParams` and `encodeURIComponent`.

- [ ] Add browser regressions for typing two allergies character by character; returning to Profile; plus-address links; a missing legacy profile; delayed A/B responses; switching session; rapid filter changes; sort reset; empty/last-page deletion; malformed response; and no updates after unmount.
- [ ] Confirm current cases fail. Count initial browse requests outside StrictMode separately from development's intentional remount behavior; do not disable StrictMode to hide the duplicate effect.
- [ ] Replace the disappearing email prompt with task 4's explicit sign-in state. If an email field remains as a compatibility flow, separate `emailDraft` from committed validated identity and keep the form mounted until Save succeeds. A typed string alone must never authorize a rating.
- [ ] Keep raw allergy text in form state and normalize it on submit. Merge loaded profiles with explicit nested defaults; do not blindly replace the form with a partial document. Distinguish loading, not-found, network failure, and saved states. Prevent a late fetch from overwriting user edits.
- [ ] Use one browse-fetch effect with cancellation. Commit filter changes and page reset coherently after debouncing; reset page on sort changes. Abort obsolete requests and ignore their completion in `finally`; a cancelled request must not stop a newer loading indicator. Clear stale recommendations/profile state on identity changes and tie mutations to the session.
- [ ] Use the returned total for result counts, a short pagination window plus Previous/Next, and deterministic recovery when a page is beyond the new last page. Keep loading/errors/empty states mutually meaningful, clean success timers, and defensively validate array response shapes at the API boundary.
- [ ] Run the targeted browser tests, then lint. Commit the complete state/consumer fixes without replacing the existing hooks or adding a state library.

**Acceptance:** Normal typing works, results belong to the active session/query, and slower obsolete responses cannot win a race.

### Task 16 — Finish the existing admin workflow and remove dropped fields

**Priority:** P1.

**Findings and evidence**

- **16a — Nutrition score is silently discarded.** `AdminMealForm.jsx:97–99,367–380` accepts/sends a value that the create/update allow-lists in `mealRoutes.js:69,330` do not include. Success is displayed even though that field was not saved.
- **16b — Claimed CRUD has no edit flow.** The backend exposes PUT and the API helper exists, but the admin UI only creates and deletes. A nutrition correction requires a separate API call or duplicate creation.
- **16c — Create/import fetch the wrong page.** `setPage(1); loadMeals()` at lines 134–135 and 188–189 uses the old closure's page before the state update. A second effect request then races with it.
- **16d — Deleting the last item can strand a page.** `confirmDelete` reloads the old page without clamping; once totalPages drops, the pagination may disappear, leaving an empty out-of-range view.
- **16e — Failures are hidden or misclassified.** `loadMeals` and `loadMLFeatures` only log errors. The UI can look empty/healthy after a failed request; create/import/delete display Axios' generic `err.message` rather than server validation details. One shared `loading` state also confuses unrelated buttons.
- **16f — Delete closes before success.** `ConfirmModal.jsx:67–69` invokes but does not await confirmation, then closes immediately. Failed deletes cannot stay in context, and repeated actions have no pending guard.
- **16g — File selection state is only half reset.** Setting `bulkImportFile=null` does not clear the actual file input, so reselecting the same file can fail to fire a change event. Import success and error messages can remain together.
- **16h — ML features refetch on every page change.** The page effect mixes catalogue pagination with independent model metadata. Direct requests lack a timeout and feature failure has no visible state.

**Files:** `AdminMealForm.jsx`, `ConfirmModal.jsx`, `services/api.js`, backend meal validation/routes, `frontend/tests/admin.spec.js`, admin API tests.

**Decisions:** Remove the unused nutrition-score and image-URL form controls for this version; neither currently affects the public card and nutrition score has no defensible shared definition. Preserve already stored fields during migrations. Add a small edit mode using the existing form and `mealAPI.updateMeal`, with a clear cancel action. Do not add a new administration framework.

- [ ] Add tests for create-read-edit-read-delete, persistent edited nutrients, preserved ratings on edit, no silently accepted unsupported fields, server row-error display, exact import counts, same-file reselect, deleting a last-page item, and a failed delete remaining retryable.
- [ ] Confirm present failures using mocked APIs, plus safe API fixtures for create/update validation.
- [ ] Implement edit using the existing form/API, reuse one normalization path for create/edit, and surface field-specific validation. Remove controls that the backend deliberately does not persist; reject unknown input instead of dropping it unnoticed.
- [ ] Make one effect own page-based reads. After mutations, refresh the intended current/first valid page through state, not a stale direct call. Separate list-loading, form-saving, importing, and deletion-pending state; show errors for failed catalogue/metadata reads. Fetch ML metadata independently through task 10's Node proxy.
- [ ] Await `onConfirm`, disable confirmation while pending, and close only after successful deletion; display an inline error on failure. Reset both React file state and the DOM input after a successful import. Clear stale success when starting a new action.
- [ ] Run admin API/browser tests and keyboard deletion tests, then commit UI and response-contract changes together.

**Acceptance:** CRUD means a user can actually create, read, edit, and delete through the admin interface. Successful messages describe fields and rows the server really saved.

### Task 17 — Make displayed facts and exported frontend API surface accurate

**Priority:** P1.

**Findings and evidence**

- **17a — Hardcoded evaluation count.** `Recommendations.jsx:304` displays 99 regardless of the returned `totalMealsEvaluated` (the CSV has 98 rows). The mock browser showed 99 for a single evaluated meal.
- **17b — Mislabelled probabilities and capabilities.** Meal cards label any confidence as “% match”; baseline fallback supplies a fabricated 0.5. Home shows a static 98% sample without identifying it as an illustration and claims learning from history, which the current pipeline does not do.
- **17c — False system health and swallowed failures.** Home catches each promise individually into a fake success-shaped default, so its outer error handler often never runs when all APIs are down. It calls static `/api` metadata an ML connection check.
- **17d — Duplicate query and logging configuration.** `Home.jsx:26` passes limit/sort as filters while `getMeals` appends them again. The request client logs every request twice and ignores the advertised debug/log flags. Raw paths include email information.
- **17e — Dead endpoint helpers.** `searchMeals`, `getMealHistory`, and `updatePreferences` call nonexistent backend routes. Repository searches found no call sites for these helpers. `searchMeals`' `/meals/search` currently hits the dynamic ID route instead of a search implementation.
- **17f — Nonfunctional home rating controls.** Featured `MealCard`s receive `showRating=true` but no user/session context or mutation owner, so clicking cannot complete the advertised action.
- **17g — Formatting treats zero as missing.** `formatMealData` hides zero carbs/fat, confidence rendering uses truthiness, and mean-rating rendering assumes a non-null number. Task 14's truthful no-ratings state needs explicit handling.
- **17h — Missing frontend 404.** `App.jsx:39–53` has no catch-all route; unknown URLs render navigation and empty body content.

**Files:** `Home.jsx`, `Recommendations.jsx`, `MealCard.jsx`, `services/api.js`, `App.jsx`, new small `pages/NotFound.jsx`, environment examples, relevant browser tests.

- [ ] Add assertions that 1 evaluated meal displays 1, baseline has no percent match, unavailable health is shown as unavailable, zero nutrition values remain visible, a plus-address does not enter logs, and an unknown route has a useful main heading/navigation action.
- [ ] Remove unused helpers after rechecking all callers, including docs. Do not implement unrequested search/history/preferences endpoints merely to justify dead exports. Remove direct browser ML helpers after task 10 updates the real metadata caller.
- [ ] Read all recommendation/system facts from task 7/14 responses. Label static hero meal data as an example or replace it with actual data; remove invented confidence. Describe a model output by its validated meaning, and do not announce learning over time until task 9's deployed model does it.
- [ ] Handle partial dashboard failure explicitly using settled results; show unavailable/error states and a working retry. Call `getMeals({}, 1, 3, 'popularity')` with one source for each parameter. Consolidate Axios interceptors into one request interceptor and one response interceptor, with production-safe logging that respects a real flag or removes the unused flags.
- [ ] Disable rating controls on noninteractive example/featured cards, or connect them to the same authenticated mutation owner as other pages. Use explicit null/undefined checks for zero values. Add a catch-all Not Found page.
- [ ] Run Home/recommendation/route tests and lint. Commit truthful copy, helpers, and consumer changes together.

**Acceptance:** The UI does not invent catalogue counts, service health, saved fields, learning behavior, or probabilities. Every retained public API helper has a real consumer and implemented server contract.

### Task 18 — Repair accessibility and animation lifecycle bugs

**Priority:** P1. These affect actual operation; this is not a visual redesign.

**Findings and evidence**

- **18a — Dialog focus trap never starts properly.** ConfirmModal saves the prior focus and cycles between buttons only when already there, but never focuses a dialog control. The isolated browser confirmed active focus remains outside the dialog. The initial animation also schedules a second frame without keeping its cancellation handle.
- **18b — Closed mobile menu stays keyboard-focusable.** Navigation hides its overlay with opacity and pointer-events; its links remain in the tab sequence on a small viewport. There is no Escape handling/focus return/expanded-controls relationship for the mobile toggle. The user menu also lacks expected keyboard dismissal/focus behavior.
- **18c — Rating buttons have indistinguishable accessible names.** Each is simply `★`, with no numeric label, selected state, or group description. Toggle chips do not expose `aria-pressed`; several browse/recommendation/login labels have no associated `htmlFor`/ID.
- **18d — Error/loading/success changes are not announced.** Shared status components lack appropriate alert/status/live-region semantics. Alerts replace inline, accessible action feedback in MealCard.
- **18e — Insufficient contrast.** `#10b981` against white and muted `#9ca3af` against white each have contrast about 2.54:1. The former is used for white-on-green buttons and small green text; both fail normal text's 4.5:1 target. Small error/warning text also uses colors that need a darker foreground. Focus/radio state must remain visible.
- **18f — JS animation ignores reduced motion and leaks work.** `TextType.jsx:76–87` creates an infinite GSAP tween with no cleanup. Its typing timers do not honor reduced motion; CSS animation overrides do not stop JS tweens. Navigation away/re-entry can retain unnecessary animation work. Its nested timer path can leave an untracked scheduled callback.
- **18g — Hook dependencies recreate animation unnecessarily.** `useScrollReveal(selector, options={})` gets a new default options object every render, rebuilding media contexts. `||` defaults also reject a deliberate zero offset/duration. Reuse these hooks but stabilize the options they consume.
- **18h — Undefined spinner color token.** `LoadingSpinner.jsx` uses `border-*-accent`, while `index.css` defines no `--color-accent`, producing unintended styling rather than the specified primary spinner.

**Files:** `ConfirmModal.jsx`, `Navigation.jsx`, `MealCard.jsx`, `ErrorMessage.jsx`, `LoadingSpinner.jsx`, `Skeleton.jsx`, all affected forms, `TextType.jsx`, `useScrollReveal.js`, `useStaggeredEntry.js`, `index.css`, accessibility tests.

- [ ] Add keyboard-only tests for dialog open/Tab/Shift+Tab/Escape/return-focus, mobile menu closed/open, user menu dismissal, star labels/selection, form labels, error announcements, and a pending failed delete.
- [ ] Add reduced-motion/unmount tests that assert a stable readable heading and no surviving typing/blink timers or tweens. Add computed-color contrast checks for actual text/background pairs.
- [ ] Focus the safe Cancel action when the dialog becomes interactive; keep focus within it, make the background inert while open, restore the trigger on close, cancel all scheduled animation callbacks, and coordinate pending confirmation with task 16. A native dialog is an option only if it preserves the existing component's callers and behavior with less code.
- [ ] Remove closed overlays from interaction/focus using conditional rendering, `hidden`, or `inert`; restore focus and handle Escape. Add IDs/labels, meaningful star button names and pressed values, group labels, `aria-current` for navigation, `aria-busy` for loading, and appropriate live regions. Replace card `alert()` calls with inline action feedback.
- [ ] Keep the palette but use accessible text/button tokens: `#047857` on white is about 5.48:1; `#6b7280` on white is about 4.83:1. Use darker error/warning foregrounds such as `#b91c1c` and `#92400e`, and verify every actual pair, including muted surfaces and focus outlines, before accepting the token change. Use an existing primary token for the spinner.
- [ ] Retain the existing GSAP hooks. Stabilize/default individual option values with nullish checks; track and clean all TextType timers/tweens. Render static text without a blinking cursor when reduced motion is requested. Remove the unused `useCallback` import that currently breaks lint.
- [ ] Run keyboard, contrast, motion, and lint tests at mobile/desktop widths. Commit the accessibility repair without unrelated layout changes.

**Acceptance:** All core actions work without a mouse; hidden UI is not tabbable; text is readable; reduced-motion users do not receive an endless JS typing animation.

### Task 19 — Turn the regression plan into executable release gates

**Priority:** P1. Build the relevant test beside each earlier fix rather than postponing all tests to this task.

**Findings and evidence**

- **19a — ML smoke script cannot establish correctness.** `ml/test_api.py` prints responses without assertions or HTTP timeouts, catches errors without failing the process, and imports `requests` without a declared test dependency. Its final message says `python api.py`, which is not the application path.
- **19b — No committed browser test infrastructure.** Playwright is installed, but there are no tracked Playwright tests/config or CI workflows. Locally present `TEST_INFRA.md` lists 80 scenarios as a plan, not 80 passing tests, and includes unsupported Vegan, written feedback, and image behaviors.
- **19c — Lint/type checks do not form a usable gate.** Lint currently fails; `type-check` has no tsconfig and checks nothing. Hooks have known dependency warnings. No CI prevents the defects demonstrated by this audit.
- **19d — Contracts are not tested across services.** Flask can return unusable bodies with HTTP 200; Node and the client assume shapes that no shared fixture verifies.

**Files:** `backend/tests/`, `backend/jest.config.js`; `ml/tests/`, `ml/test_api.py`, test dependency declarations; `frontend/playwright.config.js`, `frontend/tests/`, frontend scripts; new `.github/workflows/ci.yml`; update `TEST_INFRA.md` or its tracked replacement.

**Interface:** Backend unit/contract tests need no DB; integration tests explicitly request the isolated local replica set. Flask tests use `unittest` and Flask's test client. Browser tests use Playwright with controlled fixtures and mocked external inference. One separately named staging smoke validates real integration.

- [ ] Keep every regression named in tasks 1–18 as a tracked test or explicit manual deployment check, with its owner and command. No checkbox may say passed just because a scenario appears in documentation.
- [ ] Replace/retire the print-only ML smoke as a release gate. Use assertions, request timeouts, `raise_for_status` where HTTP is intended, and nonzero failures. Prefer Flask's test client for deterministic unit/contract coverage; retain a small optional real-HTTP smoke separately.
- [ ] Add Playwright configuration, a `test:e2e` script, deterministic fixture data, and the six real core journeys: student account/profile, safe recommendations, browse/filter/pagination, one rating, admin login/logout, and admin create/edit/import/delete. Include delayed/error states from task 15.
- [ ] Remove the broken `type-check` script and unused TypeScript tooling if the project remains JavaScript. Alternatively adopting checked JavaScript would require a configured, passing `checkJs` project; do not keep an empty success-shaped command. This plan chooses removal, avoiding a TypeScript migration.
- [ ] Add CI jobs for clean Node installs/build/lint, backend unit/integration tests with a disposable MongoDB replica set, Flask validation/lifecycle/training mechanics, and browser tests. Give tests explicit timeouts and restrict cleanup to their own resources. Use no production `.env` or cloud database credentials in CI.
- [ ] Add a cross-service fixture suite for IDs, enums, mode metadata, errors, class probability, and schema versions. Run dependency advisory checks with an explicit metadata-sharing policy and record scan dates; apply the user's approved policy to the current manual scan only unless CI sharing is also configured deliberately.
- [ ] Run the commands below on a clean checkout and capture actual counts/results. Commit tests/config and corrected testing documentation.

**Required commands after the fixes exist**

```bash
cd backend
npm ci
npm test -- --runInBand
```

The integration command requires the validated `TEST_MONGO_URI` setup from task 1. Unit jobs must be separately selectable and safe without that variable.

```bash
cd frontend
npm ci
npm run lint
npm run build
npm run test:e2e
```

```bash
python -m unittest discover -s ml/tests -p 'test_*.py'
```

The ML command runs in the locked test environment from task 2. Real-data evaluation is an additional task 9 gate, not satisfied by synthetic fixtures.

**Acceptance:** A failing regression makes CI fail. The test report distinguishes isolated mechanics, real database concurrency, mocked browser behavior, staging integration, and actual production measurements.

### Task 20 — Correct documentation, tracking, and release procedures

**Priority:** P2, except removing false safety/accuracy claims belongs to the relevant P0 release.

**Findings and evidence**

- **20a — Documentation overstates implemented behavior.** README claims complete meal CRUD, secure profile-related behavior, injection prevention, feedback-driven improvement, and real-time stats beyond what the code supplies. It lists MUI/daisyUI, DotGrid, and `tailwind.config.js`, which are absent from the installed/current source. The API guide claims 75–85% meaningful accuracy and unmeasured response-time/memory figures.
- **20b — Setup instructions can damage data or fail.** The quick start recommends destructive `npm run seed`; clone instructions omit a clear `cd NutriGoal` transition. Runtime floors and the ML smoke working directory are inconsistent. Example provisioning credentials are weak.
- **20c — Important working documents are ignored.** `.gitignore` ignores the entire `docs` directory, `Scaling.md`, and `TEST_INFRA.md`. Existing plans/test inventories therefore do not travel with a fresh clone. The model ignore path is `ml/model.pkl`, while the actual artifact is `ml/api/model.pkl`.
- **20d — Configuration advertises unused features.** Several frontend feature/debug flags and backend email-notification examples have no behavior. Keeping them makes deployment operators believe they can disable features or obtain notifications that do not exist.
- **20e — Broken guide links and metadata.** The API guide links to `backend/README.md` and a dataset path that do not exist. Backend package metadata says MIT while the actual LICENSE restricts commercial use. Default author/team metadata is also inconsistent.
- **20f — Deployment verification is absent.** There is no checked-in evidence for Vercel routing, packaged artifacts, authenticated inter-service access, proxy trust, independent client limits, graceful local shutdown, connection counts, or the performance numbers in the guide.

**Files:** `README.md`, `QUICK_Start.md`, `ml/API_GUIDE.md`, `.gitignore`, environment examples, package metadata, all three deployment configs as needed, tracked testing/runbook documentation; keep `fix.md` as the issue ledger.

- [ ] Correct every capability/setup statement against the final implementation. Distinguish profile filtering, crowd ranking, and optional evaluated behavioral ML. Report measured numbers with dataset/split/commit/environment, or remove them. Correct Vegetarian to allow dairy/eggs according to the catalogue's actual policy; do not describe it as universally plant-based or add a Vegan enum without a full data change.
- [ ] Update the actual file tree, commands, script working directories, supported runtime floors, admin/student account flows, sample CSV, ML authentication, baseline/degraded behavior, and limits. Remove unused environment flags/examples instead of inventing handlers for them.
- [ ] Stop blanket-ignoring required plans/test/runbook documents. Decide artifact policy explicitly: version the trusted release artifact plus manifest, or fetch a hash-verified release artifact during build; fix the stale ignore path accordingly. Keep real environment files, generated build output, caches, and secrets ignored. Unused Next.js snippet documents and unused icon assets may be removed only after a full reference check; they are optional cleanup, not correctness blockers.
- [ ] Align package licensing metadata with `LICENSE` without changing the author's actual license terms; keep private packages private. Fix broken guide links and remove stale generated stack/tool claims.
- [ ] Rehearse a staging deployment: static frontend deep links; cold/warm backend and Flask requests; trusted proxy identity; missing DB/Redis/model behavior; token-required ML access; correct bundled artifact/hash; and an actual harmless rate-limit operation. Record request durations, failure reasons, pool use, memory, and deployment identifiers. Measure before claiming a latency/SLO result.
- [ ] Perform a small concurrency test against disposable or staging data, starting with 20 simultaneous rating clients and modest read traffic. Verify sums/counts and that slow ML does not exhaust standard requests. Increase only within the environment's limits. Do not use the free production database as a load-test target.
- [ ] Review diffs, restore/rollback instructions, test output, unresolved environment checks, and claim wording. Commit final documentation and the completed issue ledger; release only when the acceptance checklist below is satisfied.

**Acceptance:** A new collaborator can install, test, seed safely, and understand which recommender is running using only tracked files. No documentation implies that a planned test, deployment assumption, or synthetic metric is a verified result.

## 8. Data migration and rollback sequence

Perform this sequence on an isolated copy before changing real data. Take backups before each irreversible operation, and retain the backup ID and migration manifest in the deployment record.

1. **Inventory:** Count users/profiles/meals/history; identify duplicate canonical emails, malformed profiles, inactive meals, duplicate catalogue keys, orphan meal references, unverifiable crowd totals, and unknown allergen metadata. Do not export passwords/tokens into logs.
2. **Additive schema:** Add `Student.userId`, `MealFeedback`, `ratingSum`, `catalogueKey`, allergen status, feedback provenance/version, and model metadata. Deploy code able to read old and new formats but write only the new canonical paths.
3. **Establish ownership:** Create new student accounts through the authenticated flow. Leave legacy profiles unclaimable until ownership has been established through a trusted process. Log administrator-assisted links without exposing identity in public logs. Never mass-link on a supplied email alone.
4. **Clean catalogue identity:** Dry-run duplicate reports. Resolve collisions with explicit preserved-ID mappings; update legitimate references in the same controlled migration. Verify counts and sample records before creating uniqueness constraints.
5. **Separate feedback provenance:** Archive old aggregates/history with original IDs and timestamps. Do not translate synthetic totals into invented users/ratings. Initialize authenticated summaries consistently; show a clear transition in community-rating semantics. Reconcile new feedback counts and exact sums.
6. **Create indexes:** At minimum, unique `Student.userId` for owned profiles, canonical account identity, unique `MealFeedback(studentId, mealId)`, and unique `Meal.catalogueKey` for keyed records. Use a partial index where a field is intentionally absent on unmigrated documents; do not allow many `null` identities to collide. Create/query indexes explicitly in the target environment, not on every cold start.
7. **Enable constraints:** Turn on authenticated student writes, canonical import upserts, verified allergen filtering, and baseline ranking. Coordinate frontend/backend deployment so old clients receive a useful authentication/update response rather than a silent failure.
8. **Observe:** Reconcile counts/sums after real writes, inspect duplicate-key/conflict/timeout errors, and verify the UI's returned metadata. Keep the leaky model disabled. Enable behavioral mode only after task 9's separate review.
9. **Remove legacy fields later:** Only after export, reconciliation, and a retention decision. Removing a field from the new schema is not authorization to discard the archived original data.

**Rollback:** Keep the previous application build and original data exports. Roll back to a version that understands the additive schema and keeps unsafe public writes disabled; do not roll back to anonymous rating/profile mutation or the known JWT fallback. Disable behavioral mode to restore baseline immediately if the model fails. Revert migrations through preserved ID mappings/backups in a write-paused window, not by rerunning the destructive seeder. Test restoring into a new database before switching the application to it.

**Storage/load impact:** Feedback adds one bounded-size document and a compound index per distinct student/meal interaction, rather than an unbounded duplicated embedded history. Each rating transaction adds summary and feedback writes. Task 9 adds one bounded event write per recommendation response and a student/time lookup index; enable it only with a measured storage/write budget and an export/retention policy. Feature snapshots store only prediction-relevant fields. Canonical keys/indexes add modest catalogue storage. Removing duplicate history and fake/unused fields may recover space, but no savings are claimed before measurement. Index changes and connection-pool sizes require measurements on representative data; free-tier compatibility does not imply a capacity guarantee.

## 9. Minimum acceptance matrix

| Area | Mandatory evidence | Owner task |
|---|---|---|
| Test safety | Unsafe URI rejected before connect; cleanup only owned fixture data | 1 |
| Dependencies | Dated prod/dev npm reports and Python scan; high/critical disposition | 2, 19 |
| Admin | Login -> protected write -> reload -> logout; no surviving credential | 3 |
| Student privacy | Anonymous/cross-account actions fail; legacy-email claiming blocked | 4 |
| Input validation | Operator objects, duplicate params, invalid IDs/numbers, body errors -> stable 4xx | 4, 10 |
| Ratings | One click/one mutation; retry idempotence; same/different-user concurrency; rollback | 5 |
| Deletion | Inactive meal cannot be rated/recommended; account deletion reconciles feedback | 4–6 |
| Allergies | Matching/unknown metadata excluded in both ML and baseline | 6 |
| Ranking | Golden score order, finite normalized scores, deterministic ties | 7 |
| Degradation | Timeout/malformed/negative ML -> explicit eligible baseline; no fake confidence | 7–8 |
| Model trust | No HTTP training/dummy metrics; validated artifact/provenance | 8 |
| ML quality | Real-data leakage audit, deployment-matched holdouts, baseline comparison | 9 |
| ML boundary | Single/batch parity, null entries, unknown enums, 501 rows, no traces, service auth | 10 |
| Import | Quoted CSV, all-row prevalidation, repeat/concurrent upsert, accurate partial reporting | 11 |
| Seed/migration | Preserved IDs, no default wipe/random votes, dry-run/restore/idempotence | 12 |
| Shared limit | Correct adapter, async outage policy, two instances, actual staging operation | 13 |
| Health/readiness | DB outage ->503; model unavailable explicit; app import has no listener | 14 |
| Stats/reads | Exact weighted average, immediate mutations, bounded projected stable pages | 14 |
| Client races/forms | First-character email regression gone; typed allergy list; A/B response order | 15 |
| Admin UI | Actual edit path; no dropped fields; correct page/import/delete recovery | 16 |
| Truthful UI | Real evaluated count, correct mode/health, no unsupported helper routes | 17 |
| Accessibility | Keyboard dialog/menu/rating; readable colors; reduced-motion/unmount cleanup | 18 |
| CI | Fresh installs/build/lint and all real test jobs fail on a broken assertion | 19 |
| Deployment/docs | Tracked runbook and staging evidence; no unsupported claims | 20 |

## 10. Release checklist

- [ ] Tasks 1–8 and 10–13 have passed their P0 acceptance criteria; task 9 remains disabled if real data cannot justify a model.
- [ ] No unauthenticated personal-data access or mutation remains; admin and student permissions are tested independently.
- [ ] Missing secrets, unsafe test databases, and invalid payloads fail closed.
- [ ] A single rating, retry, and concurrent rating produce exact canonical data and summaries.
- [ ] Allergies are enforced using trustworthy metadata; insufficient metadata produces an explicit limitation/empty state.
- [ ] Imports and seed commands preserve existing IDs/ratings and are safe to retry.
- [ ] No request trains a model, returns a random-model score, or publishes a fabricated accuracy/confidence number.
- [ ] Baseline recommendations work when Flask is unavailable; both mode and reason are visible.
- [ ] Admin create/edit/import/delete and student profile/recommend/rate journeys pass.
- [ ] Lint/build, isolated database tests, Flask tests, browser tests, and cross-service contract tests pass on the final commit.
- [ ] Dependency advisory results are current and unresolved risks have an explicit release disposition.
- [ ] Backup/restore rehearsal, migration reconciliation, proxy/Redis checks, and staged cold-start behavior are recorded.
- [ ] Documentation and API examples match the released contracts and measured evidence.

**Verdict:** Fix the unsafe tests, ownership/input boundaries, ratings, ignored allergies, dependency exposure, and model truthfulness before spending effort on scale architecture. The current stack can support an honest small application after those corrections; this audit provides no basis for the existing accuracy or high-concurrency claims.

**Not checked:** Production state/traffic, cloud settings, live databases/Redis, secret history, full dependency source review, Python CVEs, and real behavioral-model performance. The isolated checks establish the failures described here; they do not constitute a production acceptance test.
