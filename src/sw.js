/*
 * Custom service worker for Random Reminders.
 *
 * This is plain JS (not compiled from TypeScript) because classic service
 * workers can't import Angular/TS app code. The IndexedDB schema and the
 * scheduling algorithm below are intentionally kept in lockstep with
 * src/app/core/db.service.ts and src/app/core/scheduler.ts — if you change
 * the data model or the recurrence math there, mirror the change here too.
 *
 * Its job: on a 'periodicsync' wake-up (Chrome/Android, best-effort timing,
 * only active once the app is installed and has some engagement), check
 * every active reminder profile for due-but-unfired alerts and show them.
 */

const CACHE_NAME = 'rr-shell-v1';
const DB_NAME = 'random-reminders';
const DB_VERSION = 1;
const STORE_PROFILES = 'profiles';
const STORE_OCCURRENCES = 'occurrences';

// ---------- offline shell caching (basic runtime cache-as-you-go) ----------

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })
  );
});

// ---------- IndexedDB (mirrors db.service.ts) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_OCCURRENCES)) {
        const store = db.createObjectStore(STORE_OCCURRENCES, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId', { unique: false });
        store.createIndex('time', 'time', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction([storeName], 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getOccurrencesForProfile(db, profileId) {
  return new Promise((resolve, reject) => {
    const idx = db.transaction([STORE_OCCURRENCES], 'readonly').objectStore(STORE_OCCURRENCES).index('profileId');
    const req = idx.getAll(IDBKeyRange.only(profileId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function replaceOccurrencesForProfile(db, profileId, occurrences) {
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_OCCURRENCES], 'readwrite');
    const store = t.objectStore(STORE_OCCURRENCES);
    const idx = store.index('profileId');
    const cursorReq = idx.openCursor(IDBKeyRange.only(profileId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        occurrences.forEach((o) => store.put(o));
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function markOccurrenceFired(db, id, messageId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_OCCURRENCES], 'readwrite');
    const store = t.objectStore(STORE_OCCURRENCES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const occ = getReq.result;
      if (occ) {
        occ.fired = true;
        occ.messageId = messageId;
        store.put(occ);
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- scheduling engine (mirrors scheduler.ts) ----------

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function cycleBounds(periodType, date) {
  if (periodType === 'day') {
    const start = startOfDay(date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  if (periodType === 'week') {
    const start = addDays(startOfDay(date), -date.getDay());
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  end.setMilliseconds(-1);
  return { start, end };
}

function cycleKeyFor(periodType, date) {
  const { start } = cycleBounds(periodType, date);
  return `${periodType}:${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

function parseHHMM(value) {
  const parts = value.split(':').map((v) => parseInt(v, 10));
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function buildIntervals(rule, cycleStart, cycleEnd) {
  const intervals = [];
  const daySet = new Set(rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
  let day = startOfDay(cycleStart);
  while (day.getTime() <= cycleEnd.getTime()) {
    if (daySet.has(day.getDay())) {
      for (const w of rule.timeWindows) {
        const startMin = parseHHMM(w.start);
        const endMin = parseHHMM(w.end);
        if (endMin > startMin) {
          const s = day.getTime() + startMin * 60000;
          const e = day.getTime() + endMin * 60000;
          const clampedStart = Math.max(s, cycleStart.getTime());
          const clampedEnd = Math.min(e, cycleEnd.getTime());
          if (clampedEnd > clampedStart) intervals.push({ start: clampedStart, end: clampedEnd });
        }
      }
    }
    day = addDays(day, 1);
  }
  return intervals;
}

function pickRandomTimeInIntervals(intervals) {
  const total = intervals.reduce((s, iv) => s + (iv.end - iv.start), 0);
  let r = Math.random() * total;
  for (const iv of intervals) {
    const len = iv.end - iv.start;
    if (r < len) return Math.round(iv.start + r);
    r -= len;
  }
  return intervals[intervals.length - 1].end;
}

function generateOccurrenceTimes(rule, cycleStart, cycleEnd) {
  const intervals = buildIntervals(rule, cycleStart, cycleEnd);
  if (intervals.length === 0 || rule.count <= 0) return [];
  const minGapMs = Math.max(0, rule.minGapMinutes) * 60000;
  const picked = [];
  let attempts = 0;
  while (picked.length < rule.count && attempts < 800) {
    attempts++;
    const t = pickRandomTimeInIntervals(intervals);
    if (picked.every((p) => Math.abs(p - t) >= minGapMs)) picked.push(t);
  }
  picked.sort((a, b) => a - b);
  return picked;
}

async function ensureFreshOccurrences(db, profile, now) {
  const existing = await getOccurrencesForProfile(db, profile.id);
  const key = cycleKeyFor(profile.rule.periodType, now);
  if (existing.length === 0 || existing[0].cycleKey !== key) {
    const { start, end } = cycleBounds(profile.rule.periodType, now);
    const times = generateOccurrenceTimes(profile.rule, start, end);
    const occurrences = times.map((t) => ({
      id: `${profile.id}:${t}`,
      profileId: profile.id,
      cycleKey: key,
      time: t,
      fired: false,
    }));
    await replaceOccurrencesForProfile(db, profile.id, occurrences);
    return occurrences;
  }
  return existing;
}

// ---------- fire due reminders ----------

async function checkAndFireDue() {
  const db = await openDb();
  const profiles = await getAll(db, STORE_PROFILES);
  const now = Date.now();
  for (const profile of profiles) {
    if (!profile.active || !profile.messages || profile.messages.length === 0) continue;
    const occurrences = await ensureFreshOccurrences(db, profile, new Date(now));
    const due = occurrences.filter((o) => !o.fired && o.time <= now);
    for (const occ of due) {
      const msg = profile.messages[Math.floor(Math.random() * profile.messages.length)];
      try {
        await self.registration.showNotification(msg.title || profile.name, {
          body: msg.body || '',
          icon: 'assets/icon/icon.svg',
          badge: 'assets/icon/icon.svg',
          tag: occ.id,
        });
      } catch (err) {
        // Most commonly: notification permission not granted. Still mark fired
        // below so this occurrence isn't retried forever.
      }
      await markOccurrenceFired(db, occ.id, msg.id);
    }
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-reminders') {
    event.waitUntil(checkAndFireDue());
  }
});

// Manual trigger from the page (e.g. a "check now" debug button).
self.addEventListener('message', (event) => {
  if (event.data === 'check-now') {
    event.waitUntil(checkAndFireDue());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
