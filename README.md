# EverWell

> A caregiver dashboard that learns an older adult's personal health baseline from live
> wearable data, then escalates by automated phone call when something deviates from it.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-backend-000000?logo=express&logoColor=white)
![WHOOP API v2](https://img.shields.io/badge/WHOOP-API%20v2-FF0026)
![Capacitor iOS](https://img.shields.io/badge/Capacitor-iOS-119EFF?logo=capacitor&logoColor=white)
![Twilio](https://img.shields.io/badge/Twilio-voice-F22F46?logo=twilio&logoColor=white)
![Render](https://img.shields.io/badge/Render-deploy-46E3B7?logo=render&logoColor=white)

**Live deployment:** https://everwell-mt2a.onrender.com (landing page; the dashboard needs a
WHOOP login to populate with live data)

<!-- HIGH IMPACT: add a screenshot or short GIF of the dashboard here. For anyone viewing this
     on GitHub it is the single biggest improvement you can make. Drop the file in docs/ and
     reference it, for example:  ![EverWell dashboard](docs/dashboard.png) -->

## Contents

- [What you get on the dashboard](#what-you-get-on-the-dashboard)
- [Engineering highlights](#engineering-highlights)
- [How it works](#how-it-works)
- [Before you start](#before-you-start)
- [Part 1: Run the dashboard locally with WHOOP](#part-1-run-the-dashboard-locally-with-whoop)
- [Part 2: Deploy to the cloud so a phone can reach it](#part-2-deploy-to-the-cloud-so-a-phone-can-reach-it)
- [Part 3: Run on your iPhone and Apple Watch with Apple Health](#part-3-run-on-your-iphone-and-apple-watch-with-apple-health)
- [Part 4: Make the emergency call actually ring](#part-4-make-the-emergency-call-actually-ring)
- [How the calling works](#how-the-calling-works)
- [Troubleshooting](#troubleshooting)
- [Environment variables](#environment-variables)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)
- [License](#license)

AI-powered preventative elder care. EverWell builds a personalized health baseline for an
older adult over the first 7 to 14 days of wear, then flags deviations from that person's
own normal rather than from generic population thresholds. When it detects something
dangerous, it escalates to family caregivers or emergency services based on severity.

The product sits between reactive emergency response (a fall button you press after a
crisis) and continuous clinical monitoring (a hospital bed). The whole idea is prevention:
catch the subtle warning signs before the crisis happens.

The long-term vision is a smart ring wearable plus a companion app that passively monitors
vitals and surfaces insights to family. What exists in code today is the caregiver-facing
dashboard, powered by live wearable data through two sources:

- WHOOP, through WHOOP's official OAuth API. Works in any browser, no special hardware
  beyond a WHOOP band.
- Apple Health and Apple Watch, through HealthKit, available when the app runs as a native
  iOS build.

The ring hardware itself is future work. Everything below gets the working dashboard
running on your own devices.


## What you get on the dashboard

- Live recovery score, HRV, resting heart rate, day strain, sleep performance and duration,
  respiratory rate
- A recovery ring animation, colored green, yellow, or red by score
- 7-day recovery and sleep bar charts
- Sleep stage breakdown: Deep, REM, Light, Awake
- A daily plain-language AI Health Report summarizing the user's trends
- An Anomaly Monitor that compares recent metrics to a 14-day baseline and flags meaningful
  deviations
- Emergency escalation with a 30-second countdown: Call contact, Confirm 911, Cancel
- A chronological Health Timeline and a priority-ordered Care Team contact list
- A low-recovery alert banner, plus auto-refresh every 5 minutes
- Stay-signed-in: if a WHOOP session is already active, the landing screen is skipped and you
  go straight to the dashboard, so you do not log in again every launch


## Engineering highlights

A quick tour for engineers of the decisions behind the build:

- **Server-side OAuth proxy.** The WHOOP client secret never touches the browser. The Express
  backend owns the OAuth token exchange and brokers every WHOOP API call, so credentials stay
  server-side.
- **Per-user baseline anomaly detection.** Instead of generic population thresholds, the
  Anomaly Monitor compares recent vitals against each person's own rolling 14-day baseline and
  flags meaningful deviations from their normal.
- **Stateless cloud telephony.** Emergency calls are placed by Twilio from the server using
  TwiML, so any client (a browser, the deployed site, or the iOS app) can trigger a real phone
  call without ever holding the auth token.
- **Remote-loaded native shell.** Capacitor wraps the live deployed site rather than bundling
  the frontend, which keeps WHOOP OAuth on the same origin and lets frontend changes ship
  through Git and Render with no app rebuild.
- **Deliberately lightweight.** A vanilla HTML/CSS/JS frontend, a single-file Express backend,
  and a short-lived response cache shared across the dashboard, report, and anomaly views. No
  framework, no build step.


## How it works

```
  Browser / iOS app  ───►  Node + Express backend (server.js)  ───►  WHOOP API v2
   (public/*.html)           handles WHOOP OAuth                       (live vitals)
                             serves the dashboard
                             computes report + anomalies
        │
        └── (iOS only) ──►  Apple HealthKit on the device  (HRV, RHR, HR, sleep, SpO2, ...)
```

- Backend: Node.js and Express. server.js is the entire server. It handles the WHOOP OAuth
  handshake, proxies WHOOP API calls so your WHOOP secret never reaches the browser, and
  exposes a few JSON endpoints. Repeated WHOOP requests are briefly cached so the dashboard,
  report, and anomaly views share data and load faster.
- Frontend: plain HTML, CSS, and JavaScript in public/. No React, no build step. index.html
  is the landing and connect screen. dashboard.html is the dashboard.
- Mobile: Capacitor wraps the deployed web app as a native iOS app so it can read Apple
  Health. The native shell loads the live deployed site remotely instead of bundling the
  frontend, which keeps WHOOP OAuth working on the same origin.

Backend endpoints:

- GET /auth/whoop starts the WHOOP OAuth flow
- GET /callback receives the WHOOP redirect and exchanges the code for an access token
- GET /api/status returns whether you are authenticated
- GET /api/dashboard returns the merged WHOOP recovery, sleep, and cycle data
- GET /api/report returns the daily health report data
- GET /api/anomalies returns 14-day baseline deviation detection
- POST /api/call places the automated emergency call (see the calling section below)
- GET /api/call/status returns whether calling is configured
- GET /healthz is a liveness check, also used to keep the free Render dyno warm


## Before you start

You need:

- Node.js 18 or newer. Check with: node --version. Get it from https://nodejs.org
- A WHOOP account and band, plus a free WHOOP developer app for API credentials. Sign up at
  https://developer.whoop.com
- Git, to clone the repo.

For the optional iPhone and Apple Watch build you also need:

- A Mac with Xcode installed, from the Mac App Store.
- A free Apple ID for signing. A paid Apple Developer account is optional but lets the app
  live longer than 7 days between rebuilds.
- An iPhone with real Apple Health data. HealthKit returns nothing in the simulator, so you
  must test on a physical device.


## Part 1: Run the dashboard locally with WHOOP

This is the fastest way to see EverWell working, about 10 minutes.

1. Get the code and install dependencies:

   ```
   git clone https://github.com/abhip1008/everwell.git
   cd everwell
   npm install
   ```

2. Create a WHOOP developer app:

   - Go to https://developer.whoop.com and sign in with your WHOOP account.
   - Create a new app.
   - Set the app's Redirect URI to exactly this, character for character including the port:

     ```
     http://localhost:3000/callback
     ```

   - Enable these scopes, which the server requests: read:recovery, read:sleep,
     read:profile, read:body_measurement, read:cycles, read:workout, and offline.
   - Copy your Client ID and Client Secret. You need them next.

3. Create a file named .env in the project root. It is gitignored and never committed:

   ```
   WHOOP_CLIENT_ID=your_client_id_here
   WHOOP_CLIENT_SECRET=your_client_secret_here
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```

   Keep the client secret server-side. Never paste it into frontend code or share it. If it
   ever leaks or gets committed, regenerate it in the WHOOP developer dashboard.

4. Start the server:

   ```
   node server.js
   ```

   You should see output like:

   ```
   EverWell running on port 3000
   Public base: http://localhost:3000
   Connect WHOOP -> http://localhost:3000/auth/whoop
   ```

   npm start and npm run dev do the same thing.

5. Connect and view your data:

   - Open http://localhost:3000 in a browser.
   - Click Connect with WHOOP.
   - Authorize the app in WHOOP's OAuth screen.
   - You land on the dashboard, populated with your live WHOOP data.

That is the full local setup. If the dashboard hangs on a spinner, see Troubleshooting.


## Part 2: Deploy to the cloud so a phone can reach it

To run EverWell on a phone, the backend needs a public URL. These steps deploy it to Render
free tier. Skip this part if you only want local use.

1. Push the repo to GitHub. If you cloned the public repo and want your own copy, create an
   empty repo under your own GitHub account and push to it. The easiest path on a Mac:

   ```
   brew install gh
   gh auth login
   gh repo create <your-username>/everwell --public --source=. --remote=origin --push
   ```

   Pushing is safe. The .env file and node_modules/ are gitignored, so no secrets leave your
   machine.

2. Deploy on Render:

   - Go to https://render.com and sign in with GitHub. Authorize Render to read your
     everwell repo.
   - Click New, then Blueprint, and select the repo. Render reads render.yaml and proposes
     one web service.
   - Click Apply. While it builds, set the environment variables it asks for:
     - WHOOP_CLIENT_ID, from your WHOOP developer dashboard
     - WHOOP_CLIENT_SECRET, from your WHOOP developer dashboard
     - REDIRECT_URI, set to https://<your-render-name>.onrender.com/callback
   - Wait for the deploy to turn green, then open the Render URL. You should see the EverWell
     landing page.

   Note on the free tier: the dyno sleeps after 15 minutes of no traffic and takes about 30
   seconds to cold-start on the next request. The server self-pings /healthz every 10 minutes
   to keep itself warm, which mostly avoids this.

3. Add the Render callback URL to WHOOP:

   - Back in https://developer.whoop.com, open your app's settings.
   - Add this to the allowed redirect URIs:

     ```
     https://<your-render-name>.onrender.com/callback
     ```

     Keep http://localhost:3000/callback too if you still want to run locally.
   - Save.
   - Open the Render page, click Connect with WHOOP, and complete the OAuth flow once to
     confirm the deployed backend works end to end.


## Part 3: Run on your iPhone and Apple Watch with Apple Health

This wraps the deployed site as a native iOS app that can read Apple Health, and therefore
Apple Watch, data. Do Part 2 first, because the iOS app loads your live Render URL.

1. Point Capacitor at your Render URL. Open capacitor.config.json and set server.url:

   ```
   {
     "server": {
       "url": "https://<your-render-name>.onrender.com"
     }
   }
   ```

   Then sync so the iOS project picks up the change:

   ```
   npx cap sync ios
   ```

2. Open the project in Xcode:

   ```
   npx cap open ios
   ```

3. Sign and build to your iPhone. In Xcode:

   - Select the App project in the left navigator, then the App target, then the Signing and
     Capabilities tab.
   - Set Team to your personal Apple ID team, for example "Your Name (Personal Team)". If
     your Apple ID is not listed, add it under Xcode, Settings, Accounts.
   - Confirm HealthKit appears under Capabilities. If it does not, click Add Capability and
     add it. The entitlements file is already wired up, so it usually just appears.
   - Plug in your iPhone, tap Trust on the phone, and pick it in the run destination dropdown
     at the top of Xcode.
   - Press Run.
   - On the first run, iOS blocks the app with "Untrusted Developer." On the iPhone, go to
     Settings, General, VPN and Device Management, your Apple ID, Trust, then run again.
   - When the app opens, tap Connect with Apple Health. iOS prompts for each health
     permission. Grant them. The Apple Health card fills in with HRV, resting heart rate,
     heart rate, respiratory rate, blood oxygen, and sleep including REM.

   Apple Watch data flows in automatically, since it lives in the same HealthKit store.

   Note: Apple Health does not provide a WHOOP-style recovery score. It gives the raw
   signals, and EverWell either displays those directly or computes its own recovery-style
   score from them.

   Note: apps signed with a free personal Apple ID expire after 7 days. Rebuild from Xcode to
   reinstall, or enroll in the paid Apple Developer Program for a 1-year provisioning profile.

Because the iOS app loads the live site, frontend changes ship through GitHub and Render, not
through Xcode. You only return to Xcode when native config changes, such as server.url,
plugins, or capabilities.


## Part 4: Make the emergency call actually ring

The Call Emergency Contact button on the Emergency screen places a real outbound phone call
to your contact and reads them an automated alert. This uses Twilio for the actual phone
call. Read the "How the calling works" section below to understand the flow, then follow
these steps to turn it on.

This wires up the emergency contact call, not 911. Automated calls to 911 are not allowed by
emergency services, so that stays a manual action.

1. Create a Twilio account and number:

   - Sign up at https://www.twilio.com/try-twilio. The free trial includes call credit.
   - In the Twilio Console, copy your Account SID and Auth Token.
   - Buy or claim a Twilio phone number that has Voice capability. This is the base number
     the call comes from, and it is what your contact sees as the caller ID.
   - Trial accounts can only call verified numbers. Add your friend's number under Phone
     Numbers, Verified Caller IDs in the Twilio Console, or upgrade the account.

2. Add these to your .env locally, and to your Render environment variables when deployed.
   Phone numbers must be in E.164 format, which is a plus sign, country code, then the number
   with no spaces:

   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+12065550100
   EMERGENCY_CONTACT_NUMBER=+14255550173
   ```

   - TWILIO_FROM_NUMBER is your Twilio number, the base number the call comes from.
   - EMERGENCY_CONTACT_NUMBER is your friend's real number. It is a safety fallback: the
     seeded demo contacts use fake 555-01xx numbers that cannot be dialed, so when you click
     Call Emergency Contact the server routes the call to this number instead. Once you put
     real numbers on the contacts in public/dashboard.html, the call goes to whichever
     contact you press.

3. Test it. Restart the server, or redeploy, then open the Emergency screen, tap Trigger
   Demo Emergency, then tap Call Emergency Contact. The phone should ring within a few
   seconds and play the automated message. You can confirm calling is set up at any time:

   ```
   curl http://localhost:3000/api/call/status
   ```

   It returns {"configured": true} when Twilio is wired up.


## How the calling works

When you tap Call Emergency Contact, here is the full chain of what happens:

1. The dashboard picks the contact to call. It takes the highest-priority contact in the
   Care Team who is not the caregiver holding the phone, so the alert goes to someone else,
   not back to you.

2. The dashboard sends that contact's name and phone number to the backend by making a POST
   request to /api/call. No phone dialing happens in the browser. The browser only asks the
   server to start the call.

3. The backend checks the number. If it is one of the fake demo numbers, the server swaps in
   your real EMERGENCY_CONTACT_NUMBER so a test still rings a real phone. It also requires
   that Twilio is configured. If it is not, it returns a clear "not set up" message and the
   button just shows the number to dial by hand.

4. The backend asks Twilio to place the call. It calls Twilio's API with three things: the
   number to call (your contact), the number to call from (TWILIO_FROM_NUMBER, the base
   number), and a short script of what to say. The script is written in TwiML, which is
   Twilio's instruction format. EverWell sends a Say instruction with the message, repeated
   once so a distracted listener still catches it. The message is: "This is an automated
   alert from EverWell. There was an alert with the device wearer. Please check on them
   right away, or call emergency services."

5. Twilio places the real phone call. Your contact's phone rings, showing the base number as
   the caller ID. When they answer, Twilio's text-to-speech voice reads the message out loud.

6. The backend gets back a call ID from Twilio and tells the dashboard the call started. The
   Emergency screen updates to confirm the contact is being called.

A few things worth knowing:

- The phone call is placed by Twilio's servers, not by the device running the app. The
  device, or any browser, just triggers it. That is why this works the same whether you are
  on a laptop, on the Render site, or inside the iOS app.
- The base number, what the contact sees as the caller, is whatever you set as
  TWILIO_FROM_NUMBER. On a Twilio trial that has to be your Twilio number. If you want your
  own personal number to show instead, verify it in Twilio as a caller ID and use it there.
- Your Twilio Auth Token stays on the server, in .env or Render, and is never sent to the
  browser. The browser cannot place calls on its own, which keeps the credential safe.
- This is the emergency contact path only. The 911 button stays manual on purpose.


## Troubleshooting

- Dashboard hangs on a loading spinner. Run curl http://localhost:3000/api/dashboard, or hit
  /api/dashboard on your live URL, and inspect the JSON before assuming a frontend bug.
- WHOOP OAuth shows redirect_uri mismatch. The redirect URI in the WHOOP dashboard does not
  exactly match REDIRECT_URI. Check protocol, host, port, and the /callback path.
- Connection failed right after authorizing. A required env var is missing. The server
  reports which ones. Confirm WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, and REDIRECT_URI are set.
- iOS app loads to a white screen. server.url in capacitor.config.json is wrong, or the
  Render service is asleep. Open the URL in Safari first to confirm it loads.
- HealthKit permission prompts never appear. The Capabilities tab did not pick up the
  entitlement. In Xcode, click Add Capability, then HealthKit, then rebuild.
- No Apple Health data on device. If you are on the simulator, that is expected. HealthKit
  only returns data on a real iPhone with real Health data. Always test on device.
- iPhone app stopped opening after about a week. A free personal-team build expired. Rebuild
  from Xcode, or use a paid developer account.
- Call Emergency Contact shows "not set up." Twilio env vars are missing. Set
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER, then restart or redeploy.
- Call fails with a Twilio permissions error. On a trial account the destination must be a
  verified caller ID, and every number must be E.164 format, for example +14255550173.


## Environment variables

- WHOOP_CLIENT_ID, required. WHOOP developer app client ID.
- WHOOP_CLIENT_SECRET, required. WHOOP developer app client secret, server-side only.
- REDIRECT_URI, required. Must exactly match a redirect URI registered in WHOOP.
- PORT, optional. Port for the server, defaults to 3000.
- RENDER_EXTERNAL_URL, optional. Injected automatically by Render, used to derive the public
  URL and self-ping.
- TWILIO_ACCOUNT_SID, required for calls. Twilio Account SID.
- TWILIO_AUTH_TOKEN, required for calls. Twilio Auth Token, server-side only.
- TWILIO_FROM_NUMBER, required for calls. The Twilio base number the call comes from, E.164.
- EMERGENCY_CONTACT_NUMBER, optional. Real fallback number used when a contact has a
  placeholder number.


## Tech stack

- Backend: Node.js, Express, axios, dotenv, cors, and twilio for the call.
- Frontend: plain HTML, CSS, and JavaScript, no framework and no build step.
- Data sources: WHOOP Platform API v2 over OAuth 2.0, and Apple HealthKit.
- Mobile: Capacitor for iOS, with the @flomentumsolutions/capacitor-health-extended HealthKit
  plugin.
- Hosting: Render free tier, via render.yaml.


## Project layout

```
everwell/
  server.js               Express backend: OAuth, WHOOP proxy, report, anomalies, calling
  public/
    index.html            Landing and connect screen (WHOOP and Apple Health)
    dashboard.html        The caregiver dashboard
  ios/                    Capacitor iOS project, opened in Xcode
  capacitor.config.json   Points the native shell at the deployed URL
  render.yaml             Render Blueprint for one-click deploy
  package.json
  CLAUDE.md               Deeper engineering context and roadmap
  SETUP.md                Condensed iPhone setup checklist
```

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text.

Copyright (c) 2026 Abhiram Purohit and Reuhen Bhalod.
</content>
