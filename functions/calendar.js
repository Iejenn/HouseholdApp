// Google Calendar link (read-only). Flow:
// 1. calendarAuthStart: the app asks for a Google sign-in URL (with a one-time
//    "state" tied to the user, against forged returns)
// 2. Google sends the user back to the app with ?code=…&state=…
// 3. calendarAuthFinish: the server swaps that code for a refresh token using
//    the client secret. The token is stored ONLY in calendarLinks/{uid}, which
//    the app can't read (no Firestore rule allows it).
// 4. calendarEvents: the server reads the chosen calendars of everyone in the
//    household and returns upcoming events.
import './init.js';
import { randomBytes } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const db = getFirestore();
const clientSecret = defineSecret('GOOGLE_CLIENT_SECRET');

// Public values (not secret): the OAuth client and where Google sends you back
const CLIENT_ID = '395619432798-904b0fi63dpujd2388k7mtko6l58d4sv.apps.googleusercontent.com';
const REDIRECT_URI = 'https://iejenn.github.io/HouseholdApp/';
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly';
const STATE_TTL_MS = 15 * 60 * 1000;
const TIME_ZONE = 'Europe/Amsterdam';

function requireUid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log eerst in.');
  return request.auth.uid;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: clientSecret.value(), ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'token error');
    err.code = data.error;
    throw err;
  }
  return data;
}

async function googleGet(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}`);
  return res.json();
}

// ── 1. Start ───────────────────────────────────────────────────────
export const calendarAuthStart = onCall(async (request) => {
  const uid = requireUid(request);
  const state = randomBytes(24).toString('hex');
  await db.collection('oauthStates').doc(state).set({ uid, createdAt: Date.now() });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // we need a refresh token to read later
    prompt: 'consent', // always hand out a refresh token, also on re-linking
    include_granted_scopes: 'true',
    state,
  }).toString();
  return { url: url.toString() };
});

// ── 2/3. Finish: swap the code for a refresh token ─────────────────
export const calendarAuthFinish = onCall({ secrets: [clientSecret] }, async (request) => {
  const uid = requireUid(request);
  const { code, state } = request.data ?? {};
  if (typeof code !== 'string' || typeof state !== 'string') {
    throw new HttpsError('invalid-argument', 'Ongeldige koppeling.');
  }

  // The state must be one we handed out to THIS user, recently, and only once
  const stateRef = db.collection('oauthStates').doc(state);
  const stateDoc = await stateRef.get();
  await stateRef.delete().catch(() => {});
  if (!stateDoc.exists || stateDoc.get('uid') !== uid || Date.now() - stateDoc.get('createdAt') > STATE_TTL_MS) {
    throw new HttpsError('permission-denied', 'Deze koppeling is verlopen. Probeer het opnieuw.');
  }

  let tokens;
  try {
    tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI });
  } catch (err) {
    throw new HttpsError('failed-precondition', `Google weigerde de koppeling (${err.code ?? err.message}).`);
  }
  if (!String(tokens.scope ?? '').includes('calendar.readonly')) {
    throw new HttpsError('failed-precondition', 'Geef toestemming voor het lezen van je agenda (vinkje aanzetten).');
  }
  if (!tokens.refresh_token) {
    throw new HttpsError('failed-precondition', 'Google gaf geen sleutel terug. Ontkoppel en probeer het opnieuw.');
  }

  // Email from the ID token. It comes straight from Google's token endpoint
  // over HTTPS, so reading the payload without re-checking the signature is fine.
  let email = '';
  try {
    email = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()).email ?? '';
  } catch {
    // email is only for display
  }

  const list = await googleGet(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100',
    tokens.access_token
  );
  const available = (list.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: c.backgroundColor || '#9fc6e7',
    primary: !!c.primary,
  }));

  await db.collection('calendarLinks').doc(uid).set({ refreshToken: tokens.refresh_token, email, linkedAt: Date.now() });
  // The visible part (no token): which calendars exist and which are shared.
  // Nothing is shared until you tick a calendar yourself.
  await db.collection('users').doc(uid).set(
    { calendar: { email, linkedAt: Date.now(), available, selected: [], needsRelink: false } },
    { merge: true }
  );
  return { ok: true, email, count: available.length };
});

// ── Unlink: revoke at Google and forget the token ──────────────────
export const calendarUnlink = onCall({ secrets: [clientSecret] }, async (request) => {
  const uid = requireUid(request);
  const linkRef = db.collection('calendarLinks').doc(uid);
  const link = await linkRef.get();
  if (link.exists) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.get('refreshToken'))}`, {
      method: 'POST',
    }).catch(() => {});
    await linkRef.delete();
  }
  await db.collection('users').doc(uid).update({ calendar: FieldValue.delete() }).catch(() => {});
  return { ok: true };
});

// ── 4. Events for the home screen ──────────────────────────────────

// "2026-11-03T00:00:00+01:00" for local midnight in NL, `daysAhead` from today
function dutchMidnight(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZoneName: 'longOffset',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T00:00:00${offset}`;
}

export const calendarEvents = onCall({ secrets: [clientSecret] }, async (request) => {
  const uid = requireUid(request);
  const days = Math.min(Math.max(Number(request.data?.days) || 3, 1), 7);
  const me = await db.collection('users').doc(uid).get();
  const householdId = me.get('householdId');
  if (!householdId) return { linked: 0, events: [] };
  const household = await db.collection('households').doc(householdId).get();
  const memberIds = household.get('memberIds') ?? [];
  if (!memberIds.includes(uid)) throw new HttpsError('permission-denied', 'Geen lid van dit huishouden.');

  const timeMin = dutchMidnight(0);
  const timeMax = dutchMidnight(days);
  const seen = new Set();
  const events = [];
  let linked = 0;

  for (const memberId of memberIds) {
    const [member, link] = await Promise.all([
      db.collection('users').doc(memberId).get(),
      db.collection('calendarLinks').doc(memberId).get(),
    ]);
    const cal = member.get('calendar');
    if (!link.exists || !cal) continue;
    linked++;
    const selected = (cal.available ?? []).filter((c) => (cal.selected ?? []).includes(c.id));
    if (selected.length === 0) continue;

    let accessToken;
    try {
      accessToken = (await tokenRequest({ refresh_token: link.get('refreshToken'), grant_type: 'refresh_token' }))
        .access_token;
    } catch (err) {
      // Revoked or expired at Google: ask that person to link again
      if (err.code === 'invalid_grant') await member.ref.update({ 'calendar.needsRelink': true }).catch(() => {});
      continue;
    }

    for (const c of selected) {
      const url =
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events` +
        `?singleEvents=true&orderBy=startTime&maxResults=25&timeZone=${encodeURIComponent(TIME_ZONE)}` +
        `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      let data;
      try {
        data = await googleGet(url, accessToken);
      } catch {
        continue; // one broken calendar shouldn't hide the rest
      }
      for (const e of data.items ?? []) {
        if (e.status === 'cancelled') continue;
        // A shared calendar linked by both of you shows up once
        const key = `${e.iCalUID ?? e.id}|${e.start?.dateTime ?? e.start?.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
          title: e.summary || '(geen titel)',
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          allDay: !e.start?.dateTime,
          calendar: c.name,
          color: c.color,
        });
      }
    }
  }

  events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { linked, events };
});
