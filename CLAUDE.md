# CLAUDE.md

Context for working on EverWell. Read this before making changes. Where this file
describes code state, confirm against the actual files in the repo, since the project
moves fast and some details here may be ahead of or behind the current code.

## What EverWell is

EverWell is an AI-powered preventative elder care platform. The long-term product is a
smart ring wearable plus a companion app that passively monitors an older adult's vitals
and surfaces insights to family caregivers. The platform builds a personalized baseline
for each user over 7 to 14 days, then flags deviations from that individual baseline
rather than using generic population thresholds. When something dangerous is detected it
escalates to emergency contacts or 911 based on severity.

The product sits between reactive emergency response and continuous clinical monitoring.
The pitch framing is prevention: catch the subtle warning signs before a crisis.

What exists in code today is the caregiver-facing web dashboard, powered by live WHOOP
data through a WHOOP OAuth integration. The ring hardware is future work.

## Tech stack

- Backend: Node.js + Express (`server.js` is the entry point)
- Backend libraries: express, axios, dotenv, cors
- Frontend: vanilla HTML, CSS, and JavaScript served from `public/`. No React.
- Data source: WHOOP Platform API v2 over OAuth 2.0
- Active mobile work: Capacitor wrapping the app as a native iOS build (see Mobile section)

## How to run locally

```bash
cd ~/Downloads/everwell-full
npm install
node server.js
```

Then open http://localhost:3000 and click Connect WHOOP to authorize. `npm run dev` and
`npm start` both also run `node server.js`.

The WHOOP developer app must have its redirect URI set to exactly
`http://localhost:3000/callback` for local auth to work.

## Environment variables

Stored in `.env` at the project root. Never commit this file. It is gitignored.

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `REDIRECT_URI`
- `PORT` (defaults to 3000 locally)

The client secret must stay server-side. Never move it into frontend code or expose it
to the browser. If it is ever printed, shared, or committed, regenerate it in the WHOOP
developer dashboard.

## Endpoints

- `GET /callback` handles the WHOOP OAuth redirect and exchanges the code for a token
- `GET /api/status` returns `{ "authenticated": true|false }`
- `GET /api/dashboard` returns the merged WHOOP recovery, sleep, and vitals payload used
  by the dashboard

When the dashboard hangs on a loading spinner, the fast way to diagnose is to hit
`/api/dashboard` directly and inspect the JSON before assuming a frontend bug:

```bash
curl http://localhost:3000/api/dashboard
```

## WHOOP v2 data gotcha (important)

In WHOOP API v2, sleep stage times are nested inside `score.stage_summary`, not at the
top level of `score`. Fields like `total_in_bed_time_milli`, deep, REM, and light sleep
durations live under `stage_summary`. Reading them directly off `score` returns
`undefined`, which previously caused a silent JavaScript crash mid-render and left the
dashboard spinner running forever. Any code that parses sleep data must go through
`score.stage_summary`.

## Implemented features

- Live WHOOP data: recovery score, HRV, resting heart rate, day strain, sleep
  performance and duration, respiratory rate
- Recovery ring animation, colored green, yellow, or red by score
- 7-day recovery and sleep bar charts
- Sleep stage breakdown: Deep, REM, Light, Awake
- Daily AI Health Report: plain-language narrative summary of the user's trends
- Anomaly Monitor: 14-day baseline deviation detection
- Emergency escalation: 30-second countdown with Call contact, Confirm 911, and Cancel
- Health Timeline: chronological event log
- Care Team: priority-ordered emergency contacts
- Low recovery alert banner when recovery drops below 34 percent
- Auto-refresh every 5 minutes

## Not built yet (roadmap)

- Fall detection alerts with automatic escalation
- Emergency contact management UI (add contacts, set thresholds, set escalation order)
- Caregiver multi-user view (one caregiver, many seniors, or many caregivers, one senior)
- Voice notes from the ring surfaced in the caregiver app
- Medication reminders
- Senior-facing simplified app view
- Device-agnostic integration layer with planned support for Apple Watch, Garmin, and
  other healthcare devices

## Branding

Pull from the Dempsey pitch deck. Do not invent new colors.

- Deep purple: `#4B2E83`
- Gold accent: `#C9951A`
- Gold border bars on cards and section dividers
- Wordmark is two-tone "EverWell" with "Well" emphasized

Demo and mockup data uses caregiver name Sarah monitoring senior Eleanor Mitchell.

## Mobile build (active work)

The app is being wrapped as a native iOS app with Capacitor so it runs on a phone and can
read Apple Health. The chosen approach loads the deployed site remotely rather than
bundling the frontend, so WHOOP OAuth keeps working same-origin without a redirect rewrite.

- Backend is deployed to Render so the phone can reach it at a public URL
- `capacitor.config.json` uses `server.url` pointing at the Render URL
- HealthKit plugin: `@flomentumsolutions/capacitor-health-extended`, which reads HRV,
  resting heart rate, heart rate, respiratory rate, blood oxygen, and sleep including REM
- A Connect Apple Health button calls the plugin through `window.Capacitor.Plugins`
  because the page loads from the remote server
- Xcode needs the HealthKit capability added and two Info.plist keys:
  `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`
- HealthKit returns no data in the simulator, so test on a real iPhone with real Health data

Note: Apple Health does not provide a WHOOP-style recovery score. It gives the raw signals
(HRV, resting heart rate, sleep stages, respiratory rate, blood oxygen). EverWell either
displays those directly or computes its own recovery-style score from them.

When the frontend changes for the mobile build, the change ships through GitHub and Render,
not through Xcode, because the app loads the live site.

## Coding and writing conventions

- Plain, direct language. No em dashes. No AI-sounding filler phrasing in code comments,
  UI copy, commit messages, or docs.
- Iterative, modular development. Prefer small focused changes over large rewrites.
- Deliver complete, working code, not guidance-only stubs.
- Keep secrets in `.env`. Never hardcode credentials.
- Match the existing branding and structure rather than introducing new patterns.
