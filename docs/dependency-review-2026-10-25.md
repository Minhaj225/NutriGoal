# Dependency review — 25 October 2026

The npm advisory snapshots were taken with `npm audit --omit=dev --json` and `npm audit --json` before and after updating the lockfiles. Counts are advisory matches, not confirmed exploits.

| Tree | Before, production | Before, full | After, production | After, full |
| --- | ---: | ---: | ---: | ---: |
| Backend | 11 (1 critical, 7 high) | 21 (1 critical, 15 high) | 0 | 0 |
| Frontend | 13 (2 critical, 9 high) | 22 (2 critical, 14 high) | 0 | 0 |

The backend's Express, proxy address, and router packages process HTTP requests, so their advisories had direct server exposure. Axios runs server-side outbound calls to the configured ML service; its multipart adapter was present in the dependency tree, but this app sends JSON on that path. The frontend bundles router and Axios browser code; Node-only `form-data` and archive tooling such as `tar` belong to install/build paths, not the browser bundle. Vite's advisories concerned development/build tooling. These distinctions do not reduce the need to update the vulnerable packages; all reported matches are removed in the new locks.

The Python 3.12.15 clean environment installed the 22 exact versions in `ml/constraints.txt`. The checked-in model loaded with scikit-learn 1.8.0, and a Flask `/features` test-client request succeeded. `pip-audit --path` found no known vulnerabilities in that environment on this date. A real Vercel build with the declared Python 3.12 runtime, model bundle, and service startup remains a release check; no deployment was performed here.

Node 22.12.0 clean installs passed for both packages, and the frontend built at that floor. Backend tests passed against a disposable local MongoDB replica set. Frontend lint passes with four existing hook dependency warnings; task 15/18 owns those state and lifecycle fixes. The GitHub workflow repeats the Node floor check, but it has not run in CI yet.
