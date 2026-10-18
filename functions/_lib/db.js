// The database. Tables are created automatically the first time the site runs,
// so a fresh Cloudflare D1 database needs no setup beyond connecting it.
import { HttpError, sha256, clientIp } from './http.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL DEFAULT '',
    coach TEXT NOT NULL DEFAULT '',
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 60,
    capacity INTEGER NOT NULL DEFAULT 12,
    ladies_only INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id),
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','attended','no_show','cancelled')),
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_phone
    ON bookings (class_id, date, phone) WHERE status != 'cancelled'`,
  `CREATE INDEX IF NOT EXISTS bookings_by_date ON bookings (date, class_id)`,
  `CREATE TABLE IF NOT EXISTS cancelled_sessions (
    class_id INTEGER NOT NULL REFERENCES classes(id),
    date TEXT NOT NULL,
    PRIMARY KEY (class_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    preferred_day TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','visited','joined','not_interested')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS hits (
    bucket TEXT NOT NULL,
    who TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS hits_lookup ON hits (bucket, who, at)`,
];

// Starter timetable for the demo gym. Staff can change all of it from the dashboard.
// weekday: 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
const STARTER_CLASSES = [
  ['Strength Foundations', 'أساسيات القوة', 'Karim', [6, 1, 3], '07:00', 60, 12, 0],
  ['Ladies Strength', 'قوة للسيدات', 'Lina', [6, 1, 3], '10:30', 60, 10, 1],
  ['HIIT Conditioning', 'تمارين اللياقة المتقطعة', 'Lina', [6, 0, 1, 2, 3, 4], '18:00', 45, 16, 0],
  ['Boxing Basics', 'أساسيات الملاكمة', 'Yazan', [0, 2, 4], '19:00', 60, 14, 0],
  ['Mobility and Yoga', 'مرونة ويوغا', 'Dana', [0, 2, 4], '20:15', 50, 15, 0],
  ['Olympic Lifting', 'رفع الأثقال الأولمبي', 'Karim', [1, 3], '20:00', 75, 8, 0],
  ['Friday Open Circuit', 'دائرة الجمعة المفتوحة', 'Karim', [5], '16:00', 60, 20, 0],
];

const DEFAULT_SETTINGS = {
  notice_en: '',
  notice_ar: '',
  booking_open: '1',
};

let ready = false;

export async function getDb(env) {
  if (!env.DB) {
    throw new HttpError(503, 'The database is not connected yet. Add a D1 binding named DB in Cloudflare.');
  }
  if (!ready) {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    // Several copies of the site can start at the same moment. Only the one that
    // writes this flag first may add the starter timetable, so it's added once.
    if (await claimOnce(env.DB, 'starter_timetable')) {
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM classes').first();
      if (n === 0) {
        const insert = env.DB.prepare(
          `INSERT INTO classes (name_en, name_ar, coach, weekday, start_time, duration_min, capacity, ladies_only)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const rows = [];
        for (const [en, ar, coach, days, time, dur, cap, ladies] of STARTER_CLASSES) {
          for (const day of days) rows.push(insert.bind(en, ar, coach, day, time, dur, cap, ladies));
        }
        await env.DB.batch(rows);
      }
    }
    // One-time repair (18 Oct 2026): the first launch added the starter timetable twice.
    // Keeps the oldest copy of each class and moves bookings onto it.
    if (await claimOnce(env.DB, 'fix_duplicate_classes')) {
      const keep = `(SELECT MIN(k.id) FROM classes c JOIN classes k
        ON k.name_en = c.name_en AND k.weekday = c.weekday AND k.start_time = c.start_time WHERE c.id = %s.class_id)`;
      const dupes = 'SELECT id FROM classes WHERE id NOT IN (SELECT MIN(id) FROM classes GROUP BY name_en, weekday, start_time)';
      await env.DB.batch([
        env.DB.prepare(`UPDATE OR IGNORE bookings SET class_id = ${keep.replace('%s', 'bookings')}`),
        env.DB.prepare(`UPDATE OR IGNORE cancelled_sessions SET class_id = ${keep.replace('%s', 'cancelled_sessions')}`),
        env.DB.prepare(`DELETE FROM bookings WHERE class_id IN (${dupes})`),
        env.DB.prepare(`DELETE FROM cancelled_sessions WHERE class_id IN (${dupes})`),
        env.DB.prepare(`DELETE FROM classes WHERE id IN (${dupes})`),
      ]);
    }
    const seed = env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    await env.DB.batch(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => seed.bind(k, v)));
    ready = true;
  }
  return env.DB;
}

// True for exactly one caller, ever: the first to write this key.
async function claimOnce(db, key) {
  const { meta } = await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, datetime('now'))").bind(`done:${key}`).run();
  return meta.changes === 1;
}

export async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

// Allows `limit` actions per `minutes` from one visitor. The visitor is stored
// as a hash of their IP address, never the address itself.
export async function rateLimit(db, request, bucket, limit, minutes) {
  const who = (await sha256(`${clientIp(request)}|${bucket}`)).slice(0, 32);
  const since = Date.now() - minutes * 60_000;
  const { n } = await db
    .prepare('SELECT COUNT(*) AS n FROM hits WHERE bucket = ? AND who = ? AND at > ?')
    .bind(bucket, who, since)
    .first();
  if (n >= limit) throw new HttpError(429, 'Too many tries. Please wait a few minutes, or call us.');
  await db.batch([
    db.prepare('INSERT INTO hits (bucket, who, at) VALUES (?, ?, ?)').bind(bucket, who, Date.now()),
    db.prepare('DELETE FROM hits WHERE at < ?').bind(Date.now() - 24 * 3_600_000),
  ]);
}
