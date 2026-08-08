# Random Reminders

An Ionic + Angular Progressive Web App that fires custom alerts at randomized
times you control — "3 times a day between 7am–9pm", "3 times a week",
"17 random times this month", or any custom mix of days/time-windows/counts.
Hosted for free on GitHub Pages, installable to an Android or iOS home screen.

## How scheduling works

Each **reminder profile** has:
- A **name** and a pool of **messages** (title + body) — one is picked at random each time it fires.
- A **rule**: how many alerts per day/week/month, which days of the week are eligible,
  one or more time-of-day windows, and a minimum gap between alerts.

On each app load (and on every background wake-up), the app computes a fresh
batch of random timestamps for the *current* cycle (today / this week / this
month) that satisfy the rule, stores them in IndexedDB, and fires a
notification for any that become due.

## Important: background-alert limitations (read this)

This app has **no backend server** — it's static files on GitHub Pages. That
constrains how reliably it can alert you while fully closed:

- **Foreground / app open**: reminders always fire reliably (checked every
  60s).
- **Installed on Android, Chrome/Edge**: uses the [Periodic Background
  Sync API](https://developer.chrome.com/blog/periodic-background-sync) to
  wake the service worker and check for due reminders even when the app is
  closed. This is **best-effort** — Chrome decides the actual wake frequency
  based on how often you use the app, and it is not a guarantee of exact
  timing. Battery saver / low engagement can suppress it.
- **iOS (Safari / home-screen PWA)**: Periodic Background Sync isn't
  supported at all. Reminders will only fire while the app is open in the
  foreground. Getting real background alerts on iOS requires a native app
  build (e.g. via Capacitor) or a push-notification server — out of scope
  for this no-backend, GitHub-Pages-hosted version.
- **Firefox / desktop browsers**: same story as iOS — foreground only.

The Settings page in the app shows live detection of what your current
browser/install supports, plus a "send test notification" button.

## Local development

```bash
npm install
npm start        # ng serve, http://localhost:4200
```

Notifications and Periodic Background Sync require **https or localhost**
and a real permission grant — `ng serve` on localhost works fine for testing
notification permission and foreground firing. To test the installed-PWA /
background-sync path, build and serve over HTTPS (or use `ionic serve` with
a tunnel), then "Install app" from Chrome's address-bar / menu.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — `.github/workflows/deploy.yml` builds the app with the
   correct `--base-href /<your-repo-name>/` (computed automatically from the
   repo name) and publishes it. Your app will be live at
   `https://<username>.github.io/<repo-name>/`.

Routing uses hash-based URLs (`/#/profile/new`) specifically so GitHub Pages'
static hosting (no server-side rewrites) doesn't 404 on deep links.

## Installing on your phone

**Android (Chrome or Edge):** open the GitHub Pages URL → menu (⋮) → **"Add
to Home screen" / "Install app"**. Then open the installed app once and tap
**Enable notifications** — this also attempts to register background sync.
Using the app a few times increases the odds Chrome grants it steady
background wake-ups.

**iOS (Safari):** open the URL → Share → **"Add to Home Screen"**. Notifications
will work while the app is open; background firing isn't supported by iOS
Safari for home-screen web apps (see limitations above).

## Project structure

- `src/app/core/models.ts` — data model (profiles, rules, occurrences)
- `src/app/core/scheduler.ts` — pure random-occurrence-generation engine
- `src/app/core/db.service.ts` — IndexedDB storage
- `src/app/core/reminder-store.service.ts` — profile CRUD + occurrence refresh
- `src/app/core/notification.service.ts` — permissions, SW registration, foreground polling
- `src/sw.js` — service worker; **mirrors** the scheduler/DB logic in plain JS
  (service workers can't import compiled Angular/TS code) — keep both in sync
  if you touch the data model or recurrence math
- `src/app/home`, `src/app/profile-editor`, `src/app/settings` — UI pages

## Customizing icons

`src/assets/icon/icon.svg` is a placeholder bell icon used for the app icon,
notification icon, and PWA manifest. Swap it for your own before a real
deployment (`src/manifest.webmanifest` references it).
