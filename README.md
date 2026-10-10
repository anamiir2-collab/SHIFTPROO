# ShiftPro v2.3.0 — Premium Navy Edition

تطبيق متكامل لإدارة الورديات والحضور وساعات العمل والرواتب — **تجربة عربية أولاً**، يعمل بدون إنترنت، قابل للتثبيت (PWA) على Android و iOS و Desktop.

A complete shift-management, attendance, and salary-tracking PWA. **Arabic-first**, RTL by default, with English as a secondary language. Works fully offline after first load.

---

## ✨ What's New in v2.3.0 (Premium Navy Edition)

This release delivers a comprehensive redesign, an Arabic-first experience, and a robust fix for the previously-broken General Settings sheet.

### 🔧 Critical Bug Fix: General Settings
**Root cause:** `openSettingsSheet()` in `js/settings.js` crashed at line 142 with `TypeError: Cannot set properties of null (setting 'value')` because the `#inpFontSize` element lives in the **App-Control sheet**, not in the General Settings sheet. The crash happened *before* the sheet could be shown — so users perceived Settings as completely dead. The same null-ref bug existed in `saveSettings()`. Both are now null-safe, and every `init()` binding was hardened via a `bind()` helper that warns instead of crashing.

### 🌍 Arabic-First Localization
- Fresh installs now open in **Arabic with RTL** — `i18n.readStored()` no longer falls back to `navigator.language`, only respects an explicitly saved preference.
- Switching to English (and back to Arabic) translates the **entire interface** without reload: nav labels, greetings, settings sections, sheet titles, buttons, dates, currencies, etc.
- Added `data-i18n` attributes to all bottom-nav labels.

### 👋 Personalized Welcome Message
- New `welcome-card` hero on the dashboard: time-based greeting + **personalized welcome line** (`مرحباً يا [Name]` / `Welcome, [Name]`) + contextual sub-greeting (`نتمنى لك يوماً منظماً ومليئاً بالإنجاز`) + avatar initial.
- Updates dynamically whenever the user saves a new name in Settings — no reload needed.

### 🕐 Redesigned Clock
- The legacy standalone clock card was merged into the welcome-card as a `clock-date-row` block, positioned beneath the greeting and above the check-in buttons.
- Live time (tabular-nums) | vertical divider | weekday + Gregorian date + Hijri underneath.
- No duplicate timers — the existing `SPClock` 1s `setInterval` continues to drive updates, paused on `visibilitychange`.

### ⚙️ Reorganized General Settings
Six clearly labeled sections with icons:
- **A. Personal Information** — name, job, employee ID, company
- **B. Salary & Compensation** — method, salary, monthly hours, shift hours, hourly rate
- **Overtime** — enable, multiplier, threshold
- **Deductions** — absence, late, grace
- **C. Shifts & Attendance** — pay cycle day + shortcut to Shift Manager
- **More Settings** — in-sheet quick-links to Date/Time, Notifications, App Control, and Backup sheets (no sheet stacking — `openSheetByName` closes the previous sheet first)

### 🎨 Premium Navy Color System
Centralized palette in `css/style.css`:

| Token | Light | Dark |
|-------|-------|------|
| Primary navy `--sp-navy` | `#1E2A44` | `#1E2A44` |
| Secondary blue `--sp-blue` | `#547AA5` | `#547AA5` |
| Accent blue `--sp-accent-blue` | `#A9C7E8` | `#A9C7E8` |
| Background `--sp-bg` | `#F5F7FA` | `#0F1626` |
| Card `--sp-card` | `#FFFFFF` | `#18223A` |
| Primary text `--sp-text` | `#202B3C` | `#E8EDF5` |
| Secondary text `--sp-muted` | `#6B778A` | `#8B95A8` |
| Border `--sp-border` | `#E3E8EF` | `#2B3852` |
| Success `--sp-success` | `#278568` | `#4FAA89` |
| Warning `--sp-warning` | `#C58A32` | `#E0A855` |
| Danger `--sp-danger` | `#C84C4C` | `#E07070` |

Dark mode is **carefully crafted** — not pure black; cards stay distinguishable from background; all text/icons/status colors remain readable; auto theme follows OS preference via `prefers-color-scheme`.

### 🎬 Refined Animations & Micro-Interactions
- Welcome-card fade-and-slide entrance, cascaded across greeting/name/sub/clock-row
- Settings-section cascade with `nth-child` staggered delays
- Sheet slide-up + overlay fade-in
- Button press feedback (`transform: scale(.97)`)
- Bottom-nav navy active-tab indicator bar above the icon
- Global `prefers-reduced-motion` guard disables all animations for users who prefer reduced motion

### 🔤 Arabic-First Typography
- Font stack: **Cairo** + **IBM Plex Sans Arabic** + system fallbacks (Segoe UI / Noto Sans Arabic / Tahoma / Arial).
- Preconnects to Google Fonts; falls back gracefully when offline.

### 🧭 Bottom Navigation Polish
- Active-tab indicator: small navy bar above the icon with a subtle shadow
- Label color shift on active (navy in light, accent-blue in dark)
- Icon drop-shadow, blur backdrop on the bar
- Safe-area handling respected

### 🐛 Other Bug Fixes
- Fixed a malformed `<svg <img` tag in the More-tab button that was breaking the bottom-nav DOM parser.
- Fixed `SPi18n.setLocale()` order — `apply(document)` now runs BEFORE subscribers so subscribers (like `renderDashboard()`) can overwrite the static greeting with the time-based one.
- Topbar gear icon now opens General Settings directly (was opening App-Control).

---

## 📁 Project Structure

```
SHIFTPRO1/
├── index.html              # Main page structure (Dashboard / Calendar / Salary / Reports / More)
├── manifest.json           # PWA manifest (Arabic, RTL, navy theme)
├── service-worker.js       # Offline cache (v2.3.0)
├── README.md               # This file
├── .gitignore              # Git ignore rules
├── package.json            # Project metadata
├── favicon-32.png          # Favicon 32×32
├── icon-192.png            # PWA icon 192×192
├── icon-512.png            # PWA icon 512×512
├── apple-touch-icon.png    # iOS touch icon 180×180
├── css/
│   ├── style.css           # Premium Navy palette, all component styles, dark mode
│   ├── ios-style.css       # iOS-inspired layer (now inherits from --sp-* tokens)
│   └── animations.css      # Entrance animations, sheet transitions, reduced-motion guard
├── js/
│   ├── utils.js            # Helpers: date, Hijri, format, toast, confirmDialog
│   ├── storage.js          # localStorage layer with v1 → v2 migration
│   ├── storage-hybrid.js   # IndexedDB hybrid backup layer
│   ├── clock.js            # Live Cairo-time clock (single 1s interval)
│   ├── official-holidays.js # Egyptian official + Islamic occasions
│   ├── calendar.js         # Smart calendar + bulk selection
│   ├── attendance.js       # Attendance system + Day Sheet
│   ├── salary.js           # Salary + overtime + deductions + bonuses
│   ├── reports.js          # Reports + charts + CSV/JSON/print
│   ├── settings.js         # Settings + shifts + leaves + stats + backup
│   ├── shift-templates.js # Shift templates + smart repeat
│   ├── leaves.js           # Leave management
│   ├── charts.js           # Donut + bar chart rendering
│   ├── backup.js           # JSON export/import + danger zone
│   ├── app-lock.js         # PIN / biometric lock
│   ├── smart-notifications.js # Local notifications
│   ├── undo-redo.js        # Undo/redo stack
│   ├── ux-enhancements.js  # UX polish (privacy mode, onboarding)
│   ├── ical-export.js      # iCal feed export
│   ├── pdf-export.js       # PDF report generation
│   └── app.js              # Main coordinator (dashboard, splash, PWA)
├── locales/
│   ├── ar.js               # Arabic dictionary (default)
│   ├── en.js               # English dictionary
│   └── index.js            # i18n engine: t(), setLocale(), apply(), Intl formatting
├── assets/
│   ├── home.svg            # Bottom-nav icons (rendered with currentColor)
│   ├── schedule.svg
│   ├── salary.svg
│   ├── report.svg
│   └── application.svg
└── tests/
    └── utils.test.js       # Unit tests for SPUtils
```

---

## 🚀 Running Locally

ShiftPro is a static site — no build step, no backend, no dependencies to install.

### Option 1: Python's built-in server (simplest)
```bash
cd SHIFTPRO1
python3 -m http.server 8000
```
Open http://localhost:8000/ in your browser.

### Option 2: Node's `serve` (if Node.js is installed)
```bash
npx serve SHIFTPRO1
```

### Option 3: VS Code Live Server extension
Right-click `index.html` → "Open with Live Server".

### Option 4: Open `index.html` directly
You can also just double-click `index.html` to open it via `file://`, but the service worker won't register in that mode (it requires http/https). Everything else works.

> **Tip:** For full PWA testing (install prompt, offline cache, notifications), use `http://localhost:8000` — service workers require a secure context (localhost counts as secure).

---

## 🌐 Deploying to GitHub Pages

### Step-by-step

1. **Create a new GitHub repository** (e.g. `SHIFTPRO1`), or use the existing one at `anamiir2-collab/SHIFTPRO1`.

2. **Push the project files to the repository root:**
   ```bash
   cd SHIFTPRO1
   git init
   git remote add origin https://github.com/<your-username>/SHIFTPRO1.git
   git add .
   git commit -m "Initial commit: ShiftPro v2.3.0 Premium Navy Edition"
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repo on GitHub → **Settings** → **Pages** (left sidebar).
   - Under "Source", select **Deploy from a branch**.
   - Choose **`main`** branch and **`/root`** folder.
   - Click **Save**.

4. **Wait ~1 minute** for the build to finish. Your site will be live at:
   ```
   https://<your-username>.github.io/SHIFTPRO1/
   ```

5. **For the existing repo** (`anamiir2-collab/SHIFTPRO1`), simply pushing the updated files to `main` will trigger a redeploy. The cache-busting version (`v=2.3.0` on all CSS/JS script tags) ensures GitHub Pages serves the latest version, not a stale cached one.

### Notes on GitHub Pages specifics
- GitHub Pages serves over HTTPS by default — perfect for service workers and PWA installation.
- The relative paths (`./index.html`, `./css/style.css`, etc.) ensure the app works whether deployed at the repo root or at a sub-path.
- The `manifest.json` `start_url` is `./index.html` and `scope` is `./`, so the PWA installs cleanly on a project-page URL.

---

## 🧪 Verifying the Build

After deploying, verify these flows:

1. **Fresh install opens in Arabic + RTL** — clear localStorage and reload.
2. **General Settings opens** — click the gear icon in the topbar (it should open the General Settings sheet, not the App-Control sheet).
3. **Save your name** — the dashboard greeting should update to `مرحباً يا [YourName]` immediately.
4. **Switch language** — More → App Control → Language. The entire interface should translate instantly without reload.
5. **Switch theme** — More → App Control → Theme. Light / Dark / Auto should all work; Auto follows OS.
6. **Salary calculation** — Open the Salary tab. With default settings (6000 EGP / 208 monthly hours), the rate should be `28.85 EGP/hr`.
7. **No horizontal overflow** — Open Chrome DevTools mobile emulation (iPhone 14, 390px) and verify `scrollWidth === clientWidth`.

---

## 🛡️ Privacy & Security

- **All data is local** — attendance, salary, settings, and leaves are stored in `localStorage` and IndexedDB on the user's device. Nothing is ever sent to any server.
- **No analytics, no tracking** — the app makes no outbound requests except the initial Google Fonts CDN (which degrades gracefully to system fonts if blocked).
- **No API keys or secrets** — the project contains no API keys, passwords, access tokens, or any sensitive credentials.
- **PWA offline** — after the first load, the service worker caches the app shell. The app continues to work without an internet connection.

---

## 📦 What's in this ZIP

- All application source files (HTML, CSS, JS, locales, assets, PWA icons, manifest, service worker)
- This README.md
- A `.gitignore` file
- The `tests/` folder with unit tests

**Excluded:**
- `.git/` directory
- `node_modules/` (not present — no JS dependencies)
- OS metadata (`.DS_Store`, `Thumbs.db`)
- Editor config (`.vscode/`, `.idea/`)
- Logs and debug files

---

## 🔧 Technical Stack

- **HTML5 + CSS3 + vanilla JavaScript (ES2015+)** — no framework, no build step.
- **CSS Custom Properties (variables)** — centralized theming.
- **Service Worker** — offline cache with network-first for navigations, cache-first for static assets.
- **Web Manifest** — installable PWA.
- **`Intl.DateTimeFormat`** — locale-aware date/time/Hijri formatting.
- **`localStorage` + `IndexedDB`** — hybrid storage with auto-migration from v1.

**Browser support:** Any modern browser that supports Service Workers and `Intl.DateTimeFormat` (Chrome 78+, Firefox 78+, Safari 14+, Edge 88+). Works on Android, iOS, and Desktop.

---

## 📜 Version History

- **v2.3.0** (current) — Premium Navy redesign, Arabic-first default, General Settings fix, welcome card + merged clock, settings section reorganization, dark mode palette, refined animations.
- **v2.2.0** — iOS-style refresh, hybrid storage migration, official holidays, smart notifications.
- **v2.1.0** — Leave management, iCal export, undo/redo.
- **v2.0.0** — Complete rewrite with PWA support, dark mode, advanced reports.
- **v1.0.0** — Initial shift calendar.

---

## 👨‍💻 Developer

**أمير أنور** — 01066227553

---

## 📄 License

This project is provided as-is for personal and commercial use. All data stays on the user's device.
