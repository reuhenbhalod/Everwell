# EverWell

AI-powered preventative elder care. EverWell builds a personalized health baseline for an
older adult over the first 7 to 14 days of wear, then flags deviations from *that
individual's* normal rather than relying on generic population thresholds. When it detects
something dangerous, it escalates to family caregivers or emergency services based on
severity.

The product sits between reactive emergency response (a fall button you press after a
crisis) and continuous clinical monitoring (a hospital bed). The whole idea is prevention:
catch the subtle warning signs before the crisis happens.

The long-term vision is a smart ring wearable plus a companion app that passively monitors
vitals and surfaces insights to family. **What exists in code today** is the caregiver-facing
dashboard, powered by live wearable data through two sources:

- **WHOOP** — via WHOOP's official OAuth API (works in any browser, no special hardware
  beyond a WHOOP band).
- **Apple Health / Apple Watch** — via HealthKit, available when the app runs as a native
  iOS build.

The ring hardware itself is future work. Everything below gets the working dashboard
running on your own devices.

---

## What you get on the dashboard

- Live recovery score, HRV, resting heart rate, day strain, sleep performance and duration,
  respiratory rate
- A recovery ring animation, colored green / yellow / red by score
- 7-day recovery and sleep bar charts
- Sleep stage breakdown (Deep, REM, Light, Awake)
- A daily plain-language **AI Health Report** summarizing the user's trends
- An **Anomaly Monitor** that compares recent metrics to a 14-day baseline and flags
  meaningful deviations
- **Emergency escalation** with a 30-second countdown (Call contact, Confirm 911, Cancel)
- A chronological **Health Timeline** and a priority-ordered **Care Team** contact list
- A low-recovery alert banner, plus auto-refresh every 5 minutes

---

## How it works (architecture in one minute)

```
  Browser / iOS app  ─────►  Node + Express backend (server.js)  ─────►  WHOOP API v2
   (public/*.html)             - handles WHOOP OAuth                       (live vitals)
                               - serves the dashboard
                               - computes report + anomalies
        │
        └── (iOS only) ──►  Apple HealthKit on the device  (HRV, RHR, HR, sleep, SpO2, ...)
```

- **Backend:** Node.js + Express. `server.js` is the entire server. It handles the WHOOP
  OAuth handshake, proxies WHOOP API calls (so your WHOOP secret never reaches the
  browser), and exposes a few JSON endpoints.
- **Frontend:** plain HTML / CSS / JavaScript in `public/`. No React, no build step.
  `index.html` is the landing/connect screen; `dashboard.html` is the dashboard.
- **Mobile:** [Capacitor](https://capacitorjs.com) wraps the deployed web app as a native
  iOS app so it can read Apple Health. The native shell loads the live deployed site
  remotely (it does not bundle the frontend), which keeps WHOOP OAuth working same-origin.

### Backend endpoints

| Method | Path              | Purpose                                                        |
|--------|-------------------|---------------------------------------------------------------|
| GET    | `/auth/whoop`     | Kicks off the WHOOP OAuth flow                                 |
| GET    | `/callback`       | WHOOP redirects here; exchanges the code for an access token  |
| GET    | `/api/status`     | `{ "authenticated": true \| false }`                          |
| GET    | `/api/dashboard`  | Merged WHOOP recovery, sleep, and cycle data for the dashboard|
| GET    | `/api/report`     | Daily plain-language health report data                       |
| GET    | `/api/anomalies`  | 14-day baseline deviation detection                           |
| GET    | `/healthz`        | Liveness check (also used to keep the free Render dyno warm)  |

---

## Prerequisites

Before you start, make sure you have:

- **Node.js 18 or newer** — check with `node --version`. Get it from
  [nodejs.org](https://nodejs.org).
- **A WHOOP account and band**, plus a **WHOOP developer app** (free) to get API
  credentials. Sign up at [developer.whoop.com](https://developer.whoop.com).
- **Git** — to clone the repo.

For the optional iPhone / Apple Watch build you also need:

- A **Mac with Xcode** installed (from the Mac App Store).
- A free **Apple ID** for signing (a paid Apple Developer account is optional but lets the
  app live longer than 7 days between rebuilds).
- An **iPhone** with real Apple Health data. HealthKit returns nothing in the simulator, so
  you must test on a physical device.

---

## Part 1 — Run the dashboard locally (WHOOP)

This is the fastest way to see EverWell working. About 10 minutes.

### 1. Get the code and install dependencies

```bash
git clone https://github.com/abhip1008/everwell.git
cd everwell
npm install
```

### 2. Create a WHOOP developer app

1. Go to [developer.whoop.com](https://developer.whoop.com) and sign in with your WHOOP
   account.
2. Create a new app.
3. Set the app's **Redirect URI** to exactly:
   ```
   http://localhost:3000/callback
   ```
   It must match character-for-character, including the `http://` and the port.
4. Make sure these scopes are enabled (the server requests all of them):
   `read:recovery`, `read:sleep`, `read:profile`, `read:body_measurement`,
   `read:cycles`, `read:workout`, and `offline`.
5. Copy your **Client ID** and **Client Secret**. You'll need them next.

### 3. Create your `.env` file

In the project root, create a file named `.env` (it is gitignored and never committed):

```bash
WHOOP_CLIENT_ID=your_client_id_here
WHOOP_CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

> **Keep the client secret server-side.** Never paste it into frontend code or share it. If
> it ever leaks or gets committed, regenerate it in the WHOOP developer dashboard.

### 4. Start the server

```bash
node server.js
```

You should see output like:

```
EverWell running on port 3000
Public base: http://localhost:3000
Connect WHOOP → http://localhost:3000/auth/whoop
```

(`npm start` and `npm run dev` do the same thing.)

### 5. Connect and view your data

1. Open [http://localhost:3000](http://localhost:3000) in a browser.
2. Click **Connect with WHOOP**.
3. Authorize the app in WHOOP's OAuth screen.
4. You'll be redirected back and land on the dashboard, populated with your live WHOOP data.

That's the full local setup. If the dashboard hangs on a spinner, see
[Troubleshooting](#troubleshooting).

---

## Part 2 — Deploy to the cloud (so a phone can reach it)

To run EverWell on a phone, the backend needs a public URL. These steps deploy it to
[Render](https://render.com) free tier. Skip this part if you only want local use.

### 1. Push the repo to GitHub

If you cloned the public repo and want your own copy, create an empty repo under your own
GitHub account and push to it. The easiest path on a Mac:

```bash
brew install gh          # if you don't already have the GitHub CLI
gh auth login
gh repo create <your-username>/everwell --public --source=. --remote=origin --push
```

Pushing is safe: `.env` and `node_modules/` are gitignored, so no secrets leave your
machine.

### 2. Deploy on Render

1. Go to [render.com](https://render.com) and sign in with GitHub. Authorize Render to read
   your `everwell` repo.
2. Click **New → Blueprint** and select the repo. Render reads `render.yaml` and proposes
   one web service.
3. Click **Apply**. While it builds, set the three environment variables it asks for:
   - `WHOOP_CLIENT_ID` — from your WHOOP developer dashboard
   - `WHOOP_CLIENT_SECRET` — from your WHOOP developer dashboard
   - `REDIRECT_URI` — `https://<your-render-name>.onrender.com/callback`
4. Wait for the deploy to turn green, then open the Render URL. You should see the EverWell
   landing page.

> **Note on the free tier:** the dyno sleeps after 15 minutes of no traffic and takes ~30
> seconds to cold-start on the next request. The server self-pings `/healthz` every 10
> minutes to keep itself warm, which mostly avoids this.

### 3. Add the Render callback URL to WHOOP

1. Back in [developer.whoop.com](https://developer.whoop.com), open your app's settings.
2. Add this to the allowed redirect URIs:
   ```
   https://<your-render-name>.onrender.com/callback
   ```
   Keep `http://localhost:3000/callback` too if you still want to run locally.
3. Save.
4. Open the Render-hosted page, click **Connect with WHOOP**, and complete the OAuth flow
   once to confirm the deployed backend works end-to-end.

---

## Part 3 — Run on your iPhone and Apple Watch (Apple Health)

This wraps the deployed site as a native iOS app that can read Apple Health (and therefore
Apple Watch) data. Do **Part 2** first — the iOS app loads your live Render URL.

### 1. Point Capacitor at your Render URL

Open `capacitor.config.json` and set `server.url` to your deployment:

```json
{
  "server": {
    "url": "https://<your-render-name>.onrender.com"
  }
}
```

Then sync so the iOS project picks up the change:

```bash
npx cap sync ios
```

### 2. Open the project in Xcode

```bash
npx cap open ios
```

### 3. Sign and build to your iPhone

In Xcode:

1. Select the **App** project in the left navigator → the **App** target → the
   **Signing & Capabilities** tab.
2. Set **Team** to your personal Apple ID team (for example, "Your Name (Personal Team)").
   If your Apple ID isn't listed, add it under **Xcode → Settings → Accounts**.
3. Confirm **HealthKit** appears under Capabilities. If it doesn't, click **+ Capability**
   and add it. (The entitlements file is already wired up, so it usually just appears.)
4. Plug in your iPhone, tap **Trust** on the phone, and pick it in the run-destination
   dropdown at the top of Xcode.
5. Press **Run** (▶).
6. On the first run, iOS blocks the app with "Untrusted Developer." On the iPhone, go to
   **Settings → General → VPN & Device Management → your Apple ID → Trust**, then run again.
7. When the app opens, tap **Connect with Apple Health**. iOS prompts for each health
   permission — grant them. The Apple Health card fills in with HRV, resting heart rate,
   heart rate, respiratory rate, blood oxygen, and sleep (including REM).

Apple Watch data flows in automatically, since it lives in the same HealthKit store.

> **Note:** Apple Health doesn't provide a WHOOP-style recovery score. It gives the raw
> signals; EverWell either displays those directly or computes its own recovery-style score
> from them.
>
> **Note:** apps signed with a free personal Apple ID expire after 7 days. Rebuild from
> Xcode to reinstall, or enroll in the paid Apple Developer Program for a 1-year
> provisioning profile.

### Where future changes ship

Because the iOS app loads the live site, frontend changes ship through **GitHub → Render**,
not through Xcode. You only return to Xcode when native config changes (the `server.url`,
plugins, or capabilities).

---

## Part 4 — Make the emergency call actually ring (Twilio)

By default the **Call Emergency Contact** button on the Emergency screen places a *real*
outbound phone call to your contact and reads them an automated alert ("A possible
emergency was detected for ... please check on them right away"). This uses
[Twilio](https://www.twilio.com) for programmable voice. Without Twilio configured, the
button degrades gracefully and just shows the contact's number to dial manually.

> This wires up the **emergency contact** call, not 911. Automated calls to 911 are not
> permitted by emergency services, so that stays a manual action.

### 1. Create a Twilio account and number

1. Sign up at [twilio.com](https://www.twilio.com/try-twilio) (free trial includes credit).
2. From the Twilio Console, copy your **Account SID** and **Auth Token**.
3. Buy or claim a Twilio phone number with **Voice** capability. This is the **base
   number** the call originates from — it's what your contact sees as the caller ID.
4. **Trial accounts can only call verified numbers.** Add your friend's number under
   **Phone Numbers → Verified Caller IDs** in the Twilio Console, or upgrade the account.

### 2. Add the Twilio variables

Add these to your `.env` (local) and to your Render environment variables (deployed):

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+12065550100          # your Twilio number — the "base number"
EMERGENCY_CONTACT_NUMBER=+14255550173    # your friend's real number (E.164 format)
SENIOR_NAME=Eleanor                      # spoken in the automated message
```

`EMERGENCY_CONTACT_NUMBER` is a safety fallback: the seeded demo contacts use fake
`555-01xx` numbers that can't be dialed, so when you click **Call Emergency Contact** the
server automatically routes the call to this real number instead. Once you replace the
demo contacts in `public/dashboard.html` with real numbers, the call goes to whichever
contact you press.

### 3. Test it

Restart the server (or redeploy), open the **Emergency** screen, tap **Trigger Demo
Emergency**, then tap **Call Emergency Contact**. Your phone (or your friend's) should ring
within a few seconds and play the automated message.

You can confirm calling is configured at any time:

```bash
curl http://localhost:3000/api/call/status      # {"configured": true}
```

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Dashboard hangs on a loading spinner | Hit `curl http://localhost:3000/api/dashboard` (or `/api/dashboard` on your live URL) and inspect the JSON before assuming a frontend bug. |
| WHOOP OAuth shows "redirect_uri mismatch" | The redirect URI in the WHOOP dashboard doesn't *exactly* match `REDIRECT_URI`. Check protocol, host, port, and the `/callback` path. |
| Connection failed right after authorizing | A required env var is missing. The server reports which ones — confirm `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and `REDIRECT_URI` are all set. |
| iOS app loads to a white screen | `server.url` in `capacitor.config.json` is wrong, or the Render service is asleep. Open the URL in Safari first to confirm it loads. |
| HealthKit permission prompts never appear | The Capabilities tab didn't pick up the entitlement. In Xcode, click **+ Capability → HealthKit**, then rebuild. |
| No Apple Health data on device | If you're on the simulator, that's expected — HealthKit only returns data on a real iPhone with real Health data. Always test on device. |
| iPhone app stopped opening after about a week | A free personal-team build expired. Rebuild from Xcode, or use a paid developer account. |
| "Call Emergency Contact" shows "not set up" | Twilio env vars are missing. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`, then restart/redeploy. |
| Call fails with a Twilio permissions error | On a trial account the destination must be a **verified caller ID**, and the number must be E.164 format (e.g. `+14255550173`). |

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `WHOOP_CLIENT_ID` | yes | WHOOP developer app client ID |
| `WHOOP_CLIENT_SECRET` | yes | WHOOP developer app client secret — server-side only |
| `REDIRECT_URI` | yes | Must exactly match a redirect URI registered in WHOOP |
| `PORT` | no | Port for the server (defaults to `3000`) |
| `RENDER_EXTERNAL_URL` | no | Injected automatically by Render; used to derive the public URL and self-ping |
| `TWILIO_ACCOUNT_SID` | for calls | Twilio Account SID (enables the emergency call) |
| `TWILIO_AUTH_TOKEN` | for calls | Twilio Auth Token — server-side only |
| `TWILIO_FROM_NUMBER` | for calls | The Twilio "base number" the call originates from (E.164) |
| `EMERGENCY_CONTACT_NUMBER` | no | Real fallback number used when a contact has a placeholder number |
| `SENIOR_NAME` | no | Name spoken in the automated emergency message |

---

## Tech stack

- **Backend:** Node.js, Express, axios, dotenv, cors
- **Frontend:** vanilla HTML / CSS / JavaScript (no framework, no build step)
- **Data sources:** WHOOP Platform API v2 (OAuth 2.0) and Apple HealthKit
- **Mobile:** Capacitor (iOS), with the
  `@flomentumsolutions/capacitor-health-extended` HealthKit plugin
- **Hosting:** Render (free tier) via `render.yaml`

---

## Project layout

```
everwell/
├── server.js               Express backend: OAuth, WHOOP proxy, report + anomaly logic
├── public/
│   ├── index.html          Landing / connect screen (WHOOP + Apple Health)
│   └── dashboard.html       The caregiver dashboard
├── ios/                    Capacitor iOS project (opened in Xcode)
├── capacitor.config.json   Points the native shell at the deployed URL
├── render.yaml             Render Blueprint for one-click deploy
├── package.json
├── CLAUDE.md               Deeper engineering context and roadmap
└── SETUP.md                Condensed iPhone setup checklist
```

---

## Roadmap

Not built yet, in rough priority order:

- Fall detection with automatic escalation
- Emergency contact management UI (add contacts, set thresholds and escalation order)
- Caregiver multi-user views (one caregiver / many seniors, and the reverse)
- Voice notes from the ring surfaced in the caregiver app
- Medication reminders
- A simplified senior-facing app view
- A device-agnostic integration layer with planned support for Apple Watch, Garmin, and
  other health devices
- The EverWell smart ring hardware itself
</content>
</invoke>
