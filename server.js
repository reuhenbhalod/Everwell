require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET,
  REDIRECT_URI,
  PORT = 3000,
  RENDER_EXTERNAL_URL,
  // Twilio voice — used to place a real automated emergency call to a contact.
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,        // the "base number" calls originate from (your Twilio or verified number)
  EMERGENCY_CONTACT_NUMBER   // optional fallback number if the dashboard sends a placeholder
} = process.env;

// Twilio client is created lazily so the app still boots without voice configured.
let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
}

// Strip formatting like "(253) 555-0142" down to digits so we can spot placeholder numbers.
function normalizeNumber(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

// The 555-01xx range is reserved for fiction, so the seeded demo contacts can't be dialed.
function isPlaceholderNumber(digits) {
  return /55501\d\d$/.test(digits.replace(/^\+?1/, ''));
}

// Public base URL: Render injects RENDER_EXTERNAL_URL; otherwise derive from REDIRECT_URI.
const PUBLIC_URL = RENDER_EXTERNAL_URL
  || (REDIRECT_URI ? REDIRECT_URI.replace(/\/callback$/, '') : null);

// Default axios timeout — keeps /callback and dashboard fetches from hanging on slow WHOOP responses.
axios.defaults.timeout = 20000;

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';

const SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
  'read:cycles',
  'read:workout',
  'offline'
].join(' ');

let tokenStore = {};

app.get('/auth/whoop', (req, res) => {
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: 'everwell_auth'
  });
  res.redirect(`${WHOOP_AUTH_URL}?${params}`);
});

app.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error || !code) {
    console.error('Auth failed at WHOOP:', error, error_description);
    const detail = encodeURIComponent(error_description || error || 'no code');
    return res.redirect(`/?error=auth_failed&detail=${detail}`);
  }
  try {
    const missing = [];
    if (!WHOOP_CLIENT_ID)     missing.push('WHOOP_CLIENT_ID');
    if (!WHOOP_CLIENT_SECRET) missing.push('WHOOP_CLIENT_SECRET');
    if (!REDIRECT_URI)        missing.push('REDIRECT_URI');
    if (missing.length) {
      console.error('Missing env vars:', missing.join(', '));
      return res.redirect(`/?error=config_missing&detail=${encodeURIComponent(missing.join(','))}`);
    }

    const response = await axios.post(WHOOP_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );
    tokenStore = { ...response.data, issued_at: Date.now() };
    res.redirect('/dashboard.html');
  } catch (err) {
    const whoopErr = err.response?.data;
    console.error('Token exchange failed:', whoopErr || err.message);
    const detail = encodeURIComponent(
      (whoopErr && (whoopErr.error_description || whoopErr.error)) || err.message || 'unknown'
    );
    res.redirect(`/?error=token_failed&detail=${detail}`);
  }
});

async function getAccessToken() {
  if (!tokenStore.access_token) throw new Error('Not authenticated');
  const expiresAt = tokenStore.issued_at + (tokenStore.expires_in * 1000) - 60000;
  if (Date.now() > expiresAt && tokenStore.refresh_token) {
    const response = await axios.post(WHOOP_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenStore.refresh_token,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    tokenStore = { ...response.data, issued_at: Date.now() };
  }
  return tokenStore.access_token;
}

async function whoopGet(path, params = {}) {
  const token = await getAccessToken();
  const response = await axios.get(`${WHOOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params
  });
  return response.data;
}

app.get('/api/status', (req, res) => {
  res.json({ authenticated: !!tokenStore.access_token });
});

// Lightweight liveness endpoint for Render health checks and the self-ping keep-alive.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
});

// Full dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const [profile, cycles, sleep, recovery] = await Promise.all([
      whoopGet('/user/profile/basic'),
      whoopGet('/cycle', { limit: 14 }),
      whoopGet('/activity/sleep', { limit: 14 }),
      whoopGet('/recovery', { limit: 14 })
    ]);

    // Merge recovery scores into cycle records by cycle_id
    const recoveryMap = {};
    (recovery.records || []).forEach(r => {
      recoveryMap[r.cycle_id] = r.score;
    });
    cycles.records = cycles.records.map(c => ({
      ...c,
      recovery: recoveryMap[c.id] || null
    }));

    res.json({ profile, cycles, sleep });
  } catch (err) {
    console.error('Dashboard error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// AI daily health report — generates plain-language summary from WHOOP data
app.get('/api/report', async (req, res) => {
  try {
    const [cycles, sleep, profile, recovery] = await Promise.all([
      whoopGet('/cycle', { limit: 7 }),
      whoopGet('/activity/sleep', { limit: 7 }),
      whoopGet('/user/profile/basic'),
      whoopGet('/recovery', { limit: 7 })
    ]);

    // Merge recovery into cycles
    const recMap = {};
    (recovery.records || []).forEach(r => { recMap[r.cycle_id] = r.score; });
    cycles.records = cycles.records.map(c => ({ ...c, recovery: recMap[c.id] || null }));

    const latest = cycles.records?.[0];
    const latestSleep = sleep.records?.[0];
    const rec = latest?.recovery;
    const sleepScore = latestSleep?.score;

    // Build summary data for report
    const reportData = {
      name: profile.first_name,
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      recovery: rec ? Math.round(rec.recovery_score) : null,
      hrv: rec ? Math.round(rec.hrv_rmssd_milli) : null,
      rhr: rec ? Math.round(rec.resting_heart_rate) : null,
      respiratory: rec?.respiratory_rate ? rec.respiratory_rate.toFixed(1) : null,
      sleepPerf: sleepScore ? Math.round(sleepScore.sleep_performance_percentage) : null,
      sleepHours: sleepScore ? ((sleepScore.stage_summary?.total_in_bed_time_milli || 0) / 3600000).toFixed(1) : null,
      strain: latest?.score?.strain?.toFixed(1) || null,
      // 7-day averages
      avgRecovery: Math.round(
        cycles.records.filter(c => c.recovery?.recovery_score)
          .reduce((s, c) => s + c.recovery.recovery_score, 0) /
        Math.max(cycles.records.filter(c => c.recovery?.recovery_score).length, 1)
      ),
      avgSleep: (
        sleep.records.filter(s => s.score?.stage_summary?.total_in_bed_time_milli)
          .reduce((s, r) => s + r.score.stage_summary.total_in_bed_time_milli, 0) /
        Math.max(sleep.records.filter(s => s.score?.stage_summary?.total_in_bed_time_milli).length, 1) / 3600000
      ).toFixed(1),
      cycles: cycles.records?.slice(0, 7),
      sleepRecords: sleep.records?.slice(0, 7)
    };

    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anomaly detection — compares recent metrics to 14-day baseline
app.get('/api/anomalies', async (req, res) => {
  try {
    const [cycles, sleep, recovery] = await Promise.all([
      whoopGet('/cycle', { limit: 14 }),
      whoopGet('/activity/sleep', { limit: 14 }),
      whoopGet('/recovery', { limit: 14 })
    ]);

    // Merge recovery into cycles
    const recMap = {};
    (recovery.records || []).forEach(r => { recMap[r.cycle_id] = r.score; });
    cycles.records = cycles.records.map(c => ({ ...c, recovery: recMap[c.id] || null }));

    const records = cycles.records || [];
    const sleepRecs = sleep.records || [];

    // Calculate baselines from older 7 days
    const baseline = records.slice(7);
    const recent = records.slice(0, 1)[0];

    const baselineHRV = baseline.filter(r => r.recovery?.hrv_rmssd_milli)
      .reduce((s, r) => s + r.recovery.hrv_rmssd_milli, 0) / Math.max(baseline.filter(r => r.recovery?.hrv_rmssd_milli).length, 1);
    const baselineRHR = baseline.filter(r => r.recovery?.resting_heart_rate)
      .reduce((s, r) => s + r.recovery.resting_heart_rate, 0) / Math.max(baseline.filter(r => r.recovery?.resting_heart_rate).length, 1);
    const baselineRecovery = baseline.filter(r => r.recovery?.recovery_score)
      .reduce((s, r) => s + r.recovery.recovery_score, 0) / Math.max(baseline.filter(r => r.recovery?.recovery_score).length, 1);
    const baselineSleep = sleepRecs.slice(7).filter(s => s.score?.sleep_performance_percentage)
      .reduce((s, r) => s + r.score.sleep_performance_percentage, 0) /
      Math.max(sleepRecs.slice(7).filter(s => s.score?.sleep_performance_percentage).length, 1);

    const anomalies = [];
    const rec = recent?.recovery;

    if (rec) {
      if (baselineHRV > 0 && Math.abs(rec.hrv_rmssd_milli - baselineHRV) / baselineHRV > 0.2) {
        anomalies.push({
          type: 'HRV',
          severity: rec.hrv_rmssd_milli < baselineHRV ? 'warning' : 'positive',
          message: `HRV is ${rec.hrv_rmssd_milli < baselineHRV ? 'down' : 'up'} ${Math.round(Math.abs(rec.hrv_rmssd_milli - baselineHRV))}ms from your 7-day average`,
          current: Math.round(rec.hrv_rmssd_milli),
          baseline: Math.round(baselineHRV),
          unit: 'ms'
        });
      }
      if (baselineRHR > 0 && rec.resting_heart_rate - baselineRHR > 5) {
        anomalies.push({
          type: 'Resting Heart Rate',
          severity: 'warning',
          message: `Resting heart rate is elevated — ${Math.round(rec.resting_heart_rate)} bpm vs your usual ${Math.round(baselineRHR)} bpm`,
          current: Math.round(rec.resting_heart_rate),
          baseline: Math.round(baselineRHR),
          unit: 'bpm'
        });
      }
      if (baselineRecovery > 0 && baselineRecovery - rec.recovery_score > 20) {
        anomalies.push({
          type: 'Recovery',
          severity: 'warning',
          message: `Recovery dropped ${Math.round(baselineRecovery - rec.recovery_score)}% below your usual baseline`,
          current: Math.round(rec.recovery_score),
          baseline: Math.round(baselineRecovery),
          unit: '%'
        });
      }
    }

    const latestSleep = sleepRecs[0]?.score;
    if (latestSleep && baselineSleep > 0 && baselineSleep - latestSleep.sleep_performance_percentage > 15) {
      anomalies.push({
        type: 'Sleep',
        severity: 'warning',
        message: `Sleep performance dropped ${Math.round(baselineSleep - (latestSleep.sleep_performance_percentage||0))}% below your baseline`,
        current: Math.round(latestSleep.sleep_performance_percentage||0),
        baseline: Math.round(baselineSleep),
        unit: '%'
      });
    }

    res.json({
      anomalies,
      baseline: { hrv: Math.round(baselineHRV), rhr: Math.round(baselineRHR), recovery: Math.round(baselineRecovery), sleep: Math.round(baselineSleep) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Places a real automated voice call to an emergency contact via Twilio.
// Body: { to: "+14255551234", name: "Michael" }. Falls back to EMERGENCY_CONTACT_NUMBER
// when the dashboard sends one of the seeded placeholder numbers.
app.post('/api/call', async (req, res) => {
  const client = getTwilioClient();
  if (!client || !TWILIO_FROM_NUMBER) {
    return res.status(503).json({
      error: 'voice_not_configured',
      message: 'Calling is not set up. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.'
    });
  }

  const name = (req.body && req.body.name) || 'your emergency contact';
  let to = normalizeNumber(req.body && req.body.to);

  // Swap a fake demo number for the real configured contact, if one is set.
  if (!to || isPlaceholderNumber(to)) {
    to = normalizeNumber(EMERGENCY_CONTACT_NUMBER);
  }
  if (!to) {
    return res.status(400).json({
      error: 'no_number',
      message: 'No callable number. Set a real phone number on the contact or EMERGENCY_CONTACT_NUMBER.'
    });
  }

  // Spoken message. Repeated once so a half-distracted listener still catches it.
  const line = `This is an automated alert from Everwell. ` +
    `There was an alert with the device wearer. ` +
    `Please check on them right away, or call emergency services.`;
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Pause length="1"/><Say voice="alice">${line}</Say>` +
    `<Pause length="1"/><Say voice="alice">${line}</Say></Response>`;

  try {
    const call = await client.calls.create({ to, from: TWILIO_FROM_NUMBER, twiml });
    console.log(`Emergency call placed to ${name} (${to}): ${call.sid}`);
    res.json({ ok: true, sid: call.sid, to, name });
  } catch (err) {
    console.error('Call failed:', err.message);
    res.status(500).json({ error: 'call_failed', message: err.message });
  }
});

// Reports whether voice calling is configured, so the UI can show the right state.
app.get('/api/call/status', (req, res) => {
  res.json({ configured: !!(getTwilioClient() && TWILIO_FROM_NUMBER) });
});

app.listen(PORT, () => {
  const publicUrl = PUBLIC_URL || `http://localhost:${PORT}`;
  console.log(`\nEverWell running on port ${PORT}`);
  console.log(`Public base: ${publicUrl}`);
  console.log(`Connect WHOOP → ${publicUrl}/auth/whoop\n`);
});

// Self-ping keep-alive: hits /healthz on the public URL every 10 minutes so Render's
// free-tier 15-minute idle sleep never kicks in. Skipped in local dev (no PUBLIC_URL
// or localhost), and skipped if we can't derive a public URL.
if (PUBLIC_URL && !PUBLIC_URL.startsWith('http://localhost')) {
  const KEEPALIVE_MS = 10 * 60 * 1000;
  setInterval(() => {
    axios.get(`${PUBLIC_URL}/healthz`, { timeout: 5000 })
      .catch(err => console.warn('keep-alive ping failed:', err.message));
  }, KEEPALIVE_MS);
  console.log(`Keep-alive enabled (pinging ${PUBLIC_URL}/healthz every ${KEEPALIVE_MS / 60000}m)`);
}
