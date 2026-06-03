# EverWell iPhone Setup

End-to-end checklist for getting EverWell running on your iPhone with Apple Health
(and therefore Apple Watch) data. Follow top to bottom.

The pieces:

1. Push this repo to GitHub.
2. Deploy the Node backend to Render.
3. Update the WHOOP developer dashboard with the Render callback URL.
4. Point `capacitor.config.json` at the Render URL and resync.
5. Open the Xcode project, sign with your personal Apple ID, build to your iPhone.

---

## 1. Push to GitHub

The repo is already initialized and has one commit. To push:

```bash
cd ~/Downloads/everwell-full
git remote add origin https://github.com/abhip1008/everwell.git
git push -u origin main
```

If the GitHub repo doesn't exist yet, create an empty one named `everwell` under
`github.com/abhip1008` first (Public is fine — nothing here is secret because
`.env` and `node_modules/` are gitignored).

If you're on Mac and don't have a GitHub auth set up, the easiest path is to
install GitHub CLI (`brew install gh`) and run `gh auth login`, then
`gh repo create abhip1008/everwell --public --source=. --remote=origin --push`.

---

## 2. Deploy to Render

1. Go to https://render.com, sign in with GitHub, authorize Render to read the
   `everwell` repo.
2. Click **New** → **Blueprint** and select the `everwell` repo. Render reads
   `render.yaml` and proposes one web service.
3. Click **Apply**. The deploy starts. While it builds, set the three env vars
   it asks for:
   - `WHOOP_CLIENT_ID` — from your WHOOP developer dashboard
   - `WHOOP_CLIENT_SECRET` — from your WHOOP developer dashboard
   - `REDIRECT_URI` — `https://<your-render-name>.onrender.com/callback`
4. Wait for the deploy to go green. Open the Render URL in a browser. You should
   see the EverWell landing page.

The free tier sleeps after 15 minutes of no traffic. First request after sleep
takes ~30 seconds to cold-start.

---

## 3. Update WHOOP developer dashboard

1. Go to https://developer.whoop.com
2. Open your app's settings.
3. Add `https://<your-render-name>.onrender.com/callback` to the allowed
   redirect URIs. Keep `http://localhost:3000/callback` if you still want to
   run locally.
4. Save.

Click **Connect WHOOP** on the Render-hosted page and walk through the OAuth
flow once to confirm the backend works end-to-end.

---

## 4. Point Capacitor at the Render URL

Open `capacitor.config.json` and replace the placeholder host:

```json
{
  "server": {
    "url": "https://<your-render-name>.onrender.com"
  }
}
```

Then resync so Xcode picks up the change:

```bash
cd ~/Downloads/everwell-full
npx cap sync ios
```

---

## 5. Open in Xcode and build to your iPhone

```bash
npx cap open ios
```

In Xcode:

1. Select the **App** project in the navigator → **App** target → **Signing &
   Capabilities** tab.
2. Set **Team** to your personal Apple ID team (e.g., "Abhiram Purohit (Personal
   Team)"). If your Apple ID isn't listed, add it under Xcode → Settings →
   Accounts.
3. Confirm **HealthKit** is listed under Capabilities. If it isn't, click
   **+ Capability** and add it. (The entitlements file is already wired in,
   so this should just appear.)
4. Plug your iPhone in. Trust the computer. Pick your iPhone in the run
   destination dropdown.
5. Press the run (▶) button.
6. First run, iOS will refuse to launch with "Untrusted Developer." On the
   iPhone: **Settings → General → VPN & Device Management** → your Apple ID →
   **Trust**. Run again.
7. The app opens. Tap **Connect Apple Health** in the nav bar. iOS prompts for
   each health permission. Grant them. The Apple Health card on the dashboard
   populates with HRV, resting heart rate, heart rate, respiratory rate, blood
   oxygen, and sleep.

Apple Watch data flows in automatically — it's the same HealthKit store.

---

## Troubleshooting

- **HealthKit prompts never appear** — Capabilities tab didn't pick up the
  entitlement. In Xcode, click + Capability → HealthKit, then rebuild.
- **App loads to a white screen** — `server.url` in `capacitor.config.json`
  is wrong or the Render service is sleeping. Hit the URL in Safari first.
- **WHOOP OAuth returns "redirect_uri mismatch"** — the URI in the WHOOP
  dashboard does not exactly match `REDIRECT_URI` in Render env vars.
- **No HealthKit data in simulator** — expected. HealthKit only returns data
  on a real iPhone with real Health data. Always test on device.
- **Personal team app expires after 7 days** — known limitation of free
  Apple Developer. Rebuild from Xcode to reinstall, or enroll in the paid
  developer program for a 1-year provisioning profile.
