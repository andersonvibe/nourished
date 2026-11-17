// Nourished service worker: makes the app open offline and load fast.
// Bump VERSION whenever you upload a new index.html so phones pick it up.
const VERSION = 'nourished-v35';
const STATE = 'nourished-state'; // the app's streak snapshot for reminders; kept across versions
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STATE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the app itself: try the network first so updates arrive, fall back to the saved copy offline
  if (url.origin === self.location.origin) {
    // cache: 'no-cache' asks GitHub every time, so a new upload shows up straight away instead of after its 10-minute cache
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // fonts: keep a copy once downloaded
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
  // everything else (Claude API, food database) goes straight to the network
});

/* ---------- streak reminders (v34) ----------
   No server, so no true push. On an installed Android app, Chrome wakes this worker now and then for
   Periodic Background Sync ('streak-check'; Chrome picks the times). Each wake reads the snapshot the app saved
   (streak-state.json in the STATE cache) and shows one notification if a main meal is overdue (same hours as the
   app's tip: breakfast 11am, lunch 4pm, dinner 10pm) or it's evening and a meal is still missing. Each meal is
   nudged at most once a day, and nothing is sent at night. */
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function streakNudge(snap, now, sent) {
  if (!snap || !snap.on) return null;
  const h = now.getHours(), today = isoDay(now), yest = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (h < 11 || h >= 23) return null;
  const types = snap.date === today ? snap.types || [] : [];
  const due = snap.due || [['Breakfast', 11], ['Lunch', 16], ['Dinner', 22]];
  // overdue meals, plus dinner from 8pm so there's still time to log it before the day ends
  const missing = due.filter(([ty, at]) => !types.includes(ty) && (h >= at || (ty === 'Dinner' && h >= 20))).map(x => x[0]);
  const fresh = missing.filter(ty => !(sent.day === today && (sent.meals || []).includes(ty)));
  if (!fresh.length) return null;
  const alive = s => s && s.cur && (s.last === today || s.last === yest) ? s.cur : 0;
  const ms = alive(snap.m), cs = snap.date === today && snap.c && snap.c.over ? 0 : alive(snap.c);
  const names = missing.map(x => x.toLowerCase()), list = names.length < 2 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const title = ms ? `Keep your ${ms}-day streak going` : 'Time to log your meals';
  const body = `No ${list} logged yet today.` + (ms ? ` Log ${names.length > 1 ? 'them' : 'it'} to keep your all-meals streak.` : ' Log it in Nourished, a rough guess is fine.')
    + (cs ? ` You're also on a ${cs}-day run under your calorie goal.` : '');
  return { title, body, meals: missing, day: today };
}
async function streakCheck() {
  const c = await caches.open(STATE);
  const read = async k => { const r = await c.match(k); return r ? r.json().catch(() => null) : null; };
  const snap = await read('./streak-state.json'), sent = (await read('./streak-sent.json')) || {};
  const n = streakNudge(snap, new Date(), sent);
  if (!n) return;
  // don't nudge while the app is on screen: the Home tip already says it
  const open = await self.clients.matchAll({ type: 'window' });
  if (open.some(w => w.visibilityState === 'visible')) return;
  await self.registration.showNotification(n.title, { body: n.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'streak', data: { url: './' } });
  const prev = sent.day === n.day ? sent.meals || [] : [];
  await c.put('./streak-sent.json', new Response(JSON.stringify({ day: n.day, meals: [...new Set([...prev, ...n.meals])] })));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'streak-check') e.waitUntil(streakCheck()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
