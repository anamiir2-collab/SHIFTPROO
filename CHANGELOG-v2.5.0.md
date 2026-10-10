# ShiftPro v2.5.0 — Fixed Package

This package contains the complete ShiftPro repository with the
attendance, working hours, and salary calculation fix applied.

## What's inside

```
SHIFTPRO1-v2.5.0-fixed/
├── index.html                  (asset versions bumped to v2.5.0)
├── service-worker.js           (cache bumped to shifpro-v2.5.0)
├── package.json                (v2.5.0 + jsdom devDeps)
├── manifest.json
├── css/
│   ├── style.css
│   ├── animations.css
│   └── ios-style.css
├── js/
│   ├── storage.js              ★ fixed: + normalizeLegacyAttendance()
│   ├── attendance.js           ★ fixed: legacy records w/o fromDate
│   ├── salary.js               ★ fixed: duplicate const holidayRow
│   ├── calendar.js
│   ├── reports.js
│   ├── app.js
│   ├── utils.js
│   └── ... (all other modules)
├── locales/
│   ├── ar.js
│   ├── en.js
│   └── index.js
├── tests/
│   ├── utils.test.js           (33 tests — pre-existing, fixed rounding)
│   ├── shiftpro.test.js        ★ new: 23 tests, all 10 required scenarios
│   └── smoke.test.js           ★ new: 9 tests, full app boot in jsdom
├── assets/
├── icons (icon-192.png, icon-512.png, apple-touch-icon.png, favicon-32.png)
├── README.md
├── CHANGELOG-v2.5.0.md         ★ detailed fix report
└── .git/                       (full git history, HEAD = 42f9371)
```

★ = changed or added in v2.5.0

## Root cause (one paragraph)

`js/salary.js` declared `const holidayRow` twice in the same `render()`
function scope (lines 811 and 887 of the original file). Per the ECMAScript
spec that is a SyntaxError, so the browser refused to execute the entire
file and `window.SPSalary` was never created. Every caller that touched
`SPSalary.render()` or `SPSalary.computeSalary()` then threw a silent
`ReferenceError`, which is exactly why the salary page showed zero for
attendance days, leave days, absence days, regular hours, overtime hours,
total hours, and every salary breakdown component.

## How to install / verify

```bash
# 1. Unzip anywhere
unzip SHIFTPRO1-v2.5.0-fixed.zip
cd SHIFTPRO1-v2.5.0-fixed

# 2. Install dev dependencies (jest + jsdom)
npm install

# 3. Run the full test suite
npx jest tests/
# Expected: 3 suites, 65 tests, all passing

# 4. Serve locally (any static server works)
python3 -m http.server 8080
# Open http://localhost:8080 in a browser
```

## How to push to GitHub

This package's `.git` directory already contains the fix commit
(`42f9371`). From a machine with push rights to
`anamiir2-collab/SHIFTPRO1`:

```bash
cd SHIFTPRO1-v2.5.0-fixed
git remote add origin https://github.com/anamiir2-collab/SHIFTPRO1.git
git push origin main
```

GitHub Pages will rebuild within 1–2 minutes. Mobile users will pick up
the new service worker cache (`shifpro-v2.5.0`) on next navigation —
no manual uninstall needed.

## Data safety

- No attendance records deleted
- No localStorage / IndexedDB cleared
- The migration (`normalizeLegacyAttendance`) is purely additive and
  idempotent — it only backfills missing `fromDate`/`toDate` fields on
  legacy records and re-keys legacy date formats when unambiguous
- Original keys are preserved when a newer ISO-keyed entry already exists

## Commit

- Hash:  `42f9371e6f35c02414311325a87066cc4461177d`
- Title: `Fix salary/attendance calculations and protect legacy user data (v2.5.0)`
- Stats: 9 files changed, 1200 insertions(+), 15 deletions(-)
