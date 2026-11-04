// Server side of the push notifications. Runs on Firebase Cloud Functions
// (needs the Blaze plan). Deploy: see README "Push-meldingen".
import './init.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();

const TIME_ZONE = 'Europe/Amsterdam';

// ── Sending ────────────────────────────────────────────────────────

// Sends to every device a user turned notifications on for. Only data (no
// "notification" block), so the service worker decides how it looks.
async function sendToUser(uid, { title, body, tab, tag }) {
  const snap = await db.collection('users').doc(uid).collection('pushTokens').get();
  const tokens = snap.docs.map((d) => d.id);
  if (tokens.length === 0) return;

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title, body, tab, tag },
    webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
  });

  // Phones that uninstalled the app or revoked permission: forget them
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      dead.push(snap.docs[i].ref.delete());
    }
  });
  await Promise.all(dead);
}

// Household members other than `exceptUid` who didn't switch this type off
async function recipients(householdId, exceptUid, prefKey) {
  const household = await db.collection('households').doc(householdId).get();
  const memberIds = household.get('memberIds') ?? [];
  const users = await Promise.all(
    memberIds.filter((uid) => uid !== exceptUid).map((uid) => db.collection('users').doc(uid).get())
  );
  return users.filter((u) => u.exists && u.get(`notify.${prefKey}`) !== false).map((u) => u.id);
}

function shorten(text, max = 120) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ── Triggers ───────────────────────────────────────────────────────

export const notifyChatMessage = onDocumentCreated(
  'households/{householdId}/messages/{messageId}',
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    const to = await recipients(event.params.householdId, msg.senderId, 'chat');
    await Promise.all(
      to.map((uid) =>
        sendToUser(uid, {
          title: `💬 ${msg.senderName ?? 'Nieuw bericht'}`,
          body: shorten(String(msg.text ?? '')),
          tab: 'chat',
          tag: 'chat',
        })
      )
    );
  }
);

// Someone reacted to a post-it (emoji or a short reply). Uses the same
// "Briefjes op het prikbord" switch as new post-its.
export const notifyNoteReaction = onDocumentUpdated(
  'households/{householdId}/messages/{messageId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const { householdId, messageId } = event.params;
    const noteText = shorten(String(after.text ?? ''), 40);
    const nameOf = async (uid) => (await db.collection('users').doc(uid).get()).get('displayName') ?? 'Je partner';
    const sends = [];

    // New or changed emoji (taking one back sends nothing). Only the writer of
    // the note hears about it, and not about their own reactions.
    const was = before.reactions ?? {};
    for (const [uid, emoji] of Object.entries(after.reactions ?? {})) {
      if (was[uid] === emoji || uid === after.senderId) continue;
      const to = await recipients(householdId, uid, 'chat');
      if (!to.includes(after.senderId)) continue;
      const name = await nameOf(uid);
      sends.push(
        sendToUser(after.senderId, {
          title: `${emoji} ${name}`,
          body: `reageerde op je briefje: "${noteText}"`,
          tab: 'home',
          tag: `note-${messageId}`,
        })
      );
    }

    // New written reply: goes to everyone else in the household (in practice
    // your partner), so the writer can also answer back
    const known = new Set((before.replies ?? []).map((r) => `${r.uid}|${r.at}`));
    for (const reply of after.replies ?? []) {
      if (known.has(`${reply.uid}|${reply.at}`)) continue;
      const to = await recipients(householdId, reply.uid, 'chat');
      if (to.length === 0) continue;
      const name = await nameOf(reply.uid);
      for (const uid of to) {
        sends.push(
          sendToUser(uid, {
            title: `💬 ${name} op "${noteText}"`,
            body: shorten(String(reply.text ?? '')),
            tab: 'home',
            tag: `note-${messageId}`,
          })
        );
      }
    }
    await Promise.all(sends);
  }
);

// Groceries are often added in a row (by hand, or a whole recipe at once).
// Instead of one push per item, the first item of a burst waits a minute and
// then sends ONE summary of everything that person added in the meantime.
const GROCERY_GATHER_MS = 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listNames(texts) {
  const quoted = texts.map((t) => `"${t}"`);
  if (quoted.length === 1) return quoted[0];
  if (quoted.length <= 4) return `${quoted.slice(0, -1).join(', ')} en ${quoted.at(-1)}`;
  return `${quoted.slice(0, 3).join(', ')} en nog ${quoted.length - 3} meer`;
}

export const notifyGroceryAdded = onDocumentCreated(
  {
    document: 'households/{householdId}/groceries/{itemId}',
    // The waiting one shouldn't block the other items' (quick) runs
    maxInstances: 10,
    timeoutSeconds: 120,
  },
  async (event) => {
    const item = event.data?.data();
    if (!item) return;
    const { householdId } = event.params;
    const adderUid = item.addedBy;
    const now = Date.now();

    // Only one run per person per burst gets to send. A transaction, because
    // a batch of items triggers several runs at exactly the same moment.
    const throttleRef = db.doc(`households/${householdId}/meta/groceryNotify_${adderUid}`);
    const isFirst = await db.runTransaction(async (tx) => {
      const snap = await tx.get(throttleRef);
      const last = snap.exists ? snap.get('startedAt') ?? 0 : 0;
      if (now - last < GROCERY_GATHER_MS) return false;
      tx.set(throttleRef, { startedAt: now });
      return true;
    });
    if (!isFirst) return;

    await sleep(GROCERY_GATHER_MS);

    // Everything this person added since the burst started and is still open
    const since = Math.min(item.createdAt ?? now, now) - 5000;
    const added = await db
      .collection(`households/${householdId}/groceries`)
      .where('createdAt', '>=', since)
      .get();
    const texts = added.docs
      .filter((d) => d.get('addedBy') === adderUid && !d.get('checkedAt'))
      .sort((x, y) => x.get('createdAt') - y.get('createdAt'))
      .map((d) => String(d.get('text')));
    if (texts.length === 0) return;

    const to = await recipients(householdId, adderUid, 'groceries');
    if (to.length === 0) return;
    const adder = await db.collection('users').doc(adderUid).get();
    const name = adder.get('displayName') ?? 'Je partner';
    const body =
      texts.length === 1
        ? `${name} zette ${listNames(texts)} op de lijst`
        : `${name} zette ${texts.length} dingen op de lijst: ${listNames(texts)}`;
    await Promise.all(
      to.map((uid) =>
        sendToUser(uid, { title: '🛒 Boodschappen', body: shorten(body), tab: 'groceries', tag: 'groceries' })
      )
    );
  }
);

// ── Daily reminder ─────────────────────────────────────────────────
// Same rules as the app (src/lib/time.ts and src/data/catShop.ts), but
// counted in whole calendar days in Dutch time.

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Calendar date in NL as a plain day number (days since 1970-01-01)
function dayNumber(ms) {
  const [y, m, d] = dayFormat.format(new Date(ms)).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function nextDueDay(day, { unit, interval }) {
  if (unit === 'day') return day + interval;
  if (unit === 'week') return day + 7 * interval;
  const d = new Date(day * 86_400_000);
  d.setUTCMonth(d.getUTCMonth() + interval);
  return d.getTime() / 86_400_000;
}

function isLate(task, today) {
  // One-off task with a deadline: late once that day is over
  if (!task.isRecurring) return !task.completedAt && task.dueAt != null && today > dayNumber(task.dueAt);
  if (!task.recurrence || !task.completedAt) return false;
  const due = nextDueDay(dayNumber(task.completedAt), task.recurrence);
  return today >= nextDueDay(due, task.recurrence);
}

const FOOD_LASTS_MS = 48 * 60 * 60 * 1000;

// Vacation mode (same as src/lib/vacation.ts): the last period has no end yet
function onVacation(household) {
  const last = (household.get('vacations') ?? []).at(-1);
  return !!last && last.to == null;
}

// Time spent on vacation doesn't count for the food bowl (src/data/catShop.ts)
function pausedMs(from, to, periods) {
  let total = 0;
  for (const p of periods) {
    const start = Math.max(from, p.from);
    const end = Math.min(to, p.to ?? to);
    if (end > start) total += end - start;
  }
  return total;
}
const HUNGRY_BELOW = 25; // percent, same as the app

export const dailyReminder = onSchedule(
  { schedule: '30 8 * * *', timeZone: TIME_ZONE },
  async () => {
    const now = Date.now();
    const today = dayNumber(now);
    const households = await db.collection('households').get();

    for (const household of households.docs) {
      if (onVacation(household)) continue; // no nagging on holiday
      // Last feeding from the points summary (functions/stats.js); only
      // households without one yet fall back to reading every food purchase
      const [tasks, points] = await Promise.all([
        household.ref.collection('tasks').get(),
        household.ref.collection('stats').doc('points').get(),
      ]);

      const lateCount = tasks.docs.filter((t) => isLate(t.data(), today)).length;
      // One-off tasks whose deadline is today
      const dueToday = tasks.docs
        .map((t) => t.data())
        .filter((t) => !t.isRecurring && !t.completedAt && t.dueAt != null && dayNumber(t.dueAt) === today);
      let lastFood = points.get('lastFoodAt');
      if (lastFood === undefined) {
        const food = await household.ref.collection('purchases').where('item', '==', 'food').get();
        lastFood = Math.max(0, ...food.docs.map((p) => p.get('createdAt') ?? 0));
      }
      const paused = pausedMs(lastFood, now, household.get('vacations') ?? []);
      const fullness = lastFood ? 100 * (1 - (now - lastFood - paused) / FOOD_LASTS_MS) : 0;
      const catName = household.get('catName')?.trim() || 'Poes';

      const parts = [];
      if (dueToday.length === 1) parts.push(`"${shorten(String(dueToday[0].title), 40)}" moet vandaag`);
      if (dueToday.length > 1) parts.push(`${dueToday.length} taken moeten vandaag`);
      if (lateCount > 0) parts.push(`${lateCount} ${lateCount === 1 ? 'taak is' : 'taken zijn'} te laat`);
      if (fullness < HUNGRY_BELOW) parts.push(`${catName} heeft honger 🥣`);
      if (parts.length === 0) continue; // nothing to nag about today

      const to = await recipients(household.id, null, 'daily');
      await Promise.all(
        to.map((uid) =>
          sendToUser(uid, {
            title: '☀️ Goedemorgen!',
            body: parts.join(' · '),
            tab: lateCount > 0 || dueToday.length > 0 ? 'tasks' : 'cat',
            tag: 'daily',
          })
        )
      );
    }
  }
);

// ── Weekly summary ─────────────────────────────────────────────────
// Monday morning: who did how much last week, and which room got the most
// love. Labels mirror src/data/taskCatalog.ts.

const GROUP_LABELS = {
  stofzuigen: '🧹 Stofzuigen',
  dweilen: '🪣 Dweilen',
  badkamer: '🛁 Badkamer',
  keuken: '🍳 Keuken',
  woonkamer: '🛋️ Woonkamer',
  slaapkamer: '🛏️ Slaapkamer',
  was: '🧺 Was',
  afval: '🗑️ Afval',
  tuin: '🌿 Tuin & balkon',
};

export const weeklySummary = onSchedule(
  { schedule: '0 9 * * 1', timeZone: TIME_ZONE },
  async () => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const households = await db.collection('households').get();

    for (const household of households.docs) {
      if (onVacation(household)) continue; // no summary on holiday
      const [completions, tasks] = await Promise.all([
        household.ref.collection('completions').where('completedAt', '>=', since).get(),
        household.ref.collection('tasks').get(),
      ]);
      const memberIds = household.get('memberIds') ?? [];
      const catName = household.get('catName')?.trim() || 'Poes';

      const perUser = new Map();
      const perGroup = new Map();
      const categoryOf = new Map(tasks.docs.map((t) => [t.id, t.get('category')]));
      for (const c of completions.docs) {
        const uid = c.get('uid');
        perUser.set(uid, (perUser.get(uid) ?? 0) + 1);
        const group = categoryOf.get(c.get('taskId'));
        if (group && GROUP_LABELS[group]) perGroup.set(group, (perGroup.get(group) ?? 0) + 1);
      }

      let body;
      if (completions.size === 0) {
        body = `Een rustige week: geen taken afgevinkt. ${catName} rekent deze week op jullie! 🐾`;
      } else {
        const names = await Promise.all(
          memberIds.map(async (uid) => {
            const u = await db.collection('users').doc(uid).get();
            return `${u.get('displayName') ?? '?'} ${perUser.get(uid) ?? 0}`;
          })
        );
        const top = [...perGroup.entries()].sort((a, b) => b[1] - a[1])[0];
        body =
          `${names.join(' · ')} ${completions.size === 1 ? 'taak' : 'taken'}.` +
          (top ? ` Meeste aandacht: ${GROUP_LABELS[top[0]]}.` : '') +
          ` Samen ${completions.size} 🐾 verdiend!`;
      }

      const to = await recipients(household.id, null, 'weekly');
      await Promise.all(
        to.map((uid) => sendToUser(uid, { title: '📊 Jullie week', body, tab: 'tasks', tag: 'weekly' }))
      );
    }
  }
);

// ── Poke your partner about a task ─────────────────────────────────

const NUDGE_COOLDOWN_MS = 10 * 60 * 1000; // per task, so nobody gets spammed

export const nudgeTask = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log eerst in.');
  const uid = request.auth.uid;
  const { householdId, taskId } = request.data ?? {};
  if (typeof householdId !== 'string' || typeof taskId !== 'string') {
    throw new HttpsError('invalid-argument', 'Onbekende taak.');
  }

  const household = await db.collection('households').doc(householdId).get();
  if (!(household.get('memberIds') ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Je hoort niet bij dit huishouden.');
  }
  const taskRef = household.ref.collection('tasks').doc(taskId);
  const task = await taskRef.get();
  if (!task.exists) throw new HttpsError('not-found', 'Deze taak bestaat niet meer.');

  const last = task.get('lastNudgedAt') ?? 0;
  if (Date.now() - last < NUDGE_COOLDOWN_MS) {
    throw new HttpsError('resource-exhausted', 'Er is net al gepord voor deze taak. Probeer het over een paar minuten weer.');
  }

  const to = await recipients(householdId, uid, 'nudge');
  if (to.length === 0) return { ok: false, reason: 'no-recipient' };

  const sender = await db.collection('users').doc(uid).get();
  const name = sender.get('displayName') ?? 'Je partner';
  await Promise.all(
    to.map((other) =>
      sendToUser(other, {
        title: `👉 ${name} port je`,
        body: shorten(`Kun je "${task.get('title')}" doen? 🙏`),
        tab: 'tasks',
        tag: `nudge-${taskId}`,
      })
    )
  );
  await taskRef.update({ lastNudgedAt: Date.now(), lastNudgedBy: uid });
  return { ok: true };
});

// ── Test button in Instellingen ────────────────────────────────────

export const sendTestPush = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Log eerst in.');
  await sendToUser(request.auth.uid, {
    title: '🔔 Testmelding',
    body: 'Het werkt! Zo zien jullie meldingen eruit.',
    tab: 'tasks',
    tag: 'test',
  });
  return { ok: true };
});

// Google Calendar link (read-only)
export { calendarAuthStart, calendarAuthFinish, calendarUnlink, calendarEvents } from './calendar.js';

// Summaries that keep the app fast and cheap (points, cat, grocery suggestions)
export {
  statsCompletionCreated,
  statsCompletionDeleted,
  statsPurchaseCreated,
  statsGroceryCreated,
  nightlyMaintenance,
} from './stats.js';
