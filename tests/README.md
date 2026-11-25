# MISMO Link HQ Checks

`npm test` opens MISMO Link HQ (`index.html`) in a headless browser against a pretend sign-in and a
pretend save relay (`harness.js`), with made-up records, and runs the checks in `run.js`. Nothing
real is read or changed. The shared Back helper is served from the live
https://resources.mismo.org/assets/back.js (or a local copy named in `MISMO_BACK`).

They run on GitHub after every upload (`.github/workflows/checks.yml`). To run one check by name:
`node tests/run.js "back"`. When you add a feature, add a check for it to `run.js`.
