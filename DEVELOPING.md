# Developing MISMO Link

- `index.html` is MISMO Link HQ (the team's app, behind the shared sign-in). `help/`, `sign/`, `user/` and
  `email/` are public one-screen pages with no left menu.
- **Checks:** `npm install`, `npx playwright install chromium`, then `npm test` (see `tests/README.md`).
  They also run on GitHub on every upload (`.github/workflows/checks.yml`).
- **Going live:** GitHub Pages publishes `main` to resources.mismo.org/mismo-link/. Run the checks first;
  push to main only when they pass.
- **Back button (CN-033):** `index.html` loads the shared `/assets/back.js` right after `session.js`
  (never copy it here, never call `history.pushState`). The left menu marks the page showing with
  `aria-current`; the phone menu drawer and the right-hand panel (`#rpane`) are registered with
  `MismoBack.layer` at the end of `index.html`. A new panel or pop-up gets its own `MismoBack.layer`
  line, and check 4 in `tests/run.js` covers Back.
- **December hat (CN-052):** the santa hat on the O of the masthead logo comes from the shared
  `/assets/holiday.js`, which `session.js` loads on `index.html` (never copy it here, and don't bring back
  the old `.santa` / `data-season` hat). It finds the logo by `header use[href="#mismo-logo"]`; if the
  masthead changes and it stops finding it, add `data-mismo-logo` to the logo's `<svg>`. The public pages
  (`help/`, `sign/`, `user/`, `email/`) never load session.js or holiday.js. Preview with `?holiday=preview`;
  check 5 in `tests/run.js` covers it.
- **Masthead (CN-053):** `header.hqtop` is Certification Management's masthead to the pixel (68px bar,
  padding 13px 22px; white logo box 9px 13px, 5px corners, sky line under it; logo 24px; 1px divider 42px tall;
  name 16px/500/#94c8e9). At 560px and under it takes CMS's phone step (62px bar, logo 19px). Everything
  under it (left menu, `#rpane`, toasts, the Help side menu) offsets from `--hq-h`, never a fixed pixel value.
  Check 6 in `tests/run.js` measures it.
