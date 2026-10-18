// GET   /api/staff/classes  the whole weekly timetable, including hidden classes
// POST  /api/staff/classes {...}  add a class
// PATCH /api/staff/classes {id, ...}  change a class (send active: false to hide it)
import { handle, json, readBody, text, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';

function clean(body) {
  const weekday = Number.parseInt(body.weekday, 10);
  const duration = Number.parseInt(body.duration_min, 10);
  const capacity = Number.parseInt(body.capacity, 10);
  if (!(weekday >= 0 && weekday <= 6)) throw new HttpError(400, 'Pick a day.');
  if (typeof body.start_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start_time)) throw new HttpError(400, 'Start time looks wrong (use 18:30).');
  if (!(duration >= 10 && duration <= 240)) throw new HttpError(400, 'Length must be 10 to 240 minutes.');
  if (!(capacity >= 1 && capacity <= 200)) throw new HttpError(400, 'Spots must be 1 to 200.');
  return {
    name_en: text(body.name_en, 60, { required: true, label: 'English name' }),
    name_ar: text(body.name_ar, 60),
    coach: text(body.coach, 40),
    weekday, start_time: body.start_time, duration_min: duration, capacity,
    ladies_only: body.ladies_only ? 1 : 0,
    active: body.active === false ? 0 : 1,
  };
}

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const { results } = await db.prepare('SELECT * FROM classes ORDER BY weekday, start_time').all();
  return json({ classes: results });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const c = clean(await readBody(request));
  const db = await getDb(env);
  await db.prepare(
    `INSERT INTO classes (name_en, name_ar, coach, weekday, start_time, duration_min, capacity, ladies_only, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(c.name_en, c.name_ar, c.coach, c.weekday, c.start_time, c.duration_min, c.capacity, c.ladies_only, c.active).run();
  return json({ ok: true }, 201);
});

export const onRequestPatch = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const c = clean(body);
  const db = await getDb(env);
  await db.prepare(
    `UPDATE classes SET name_en = ?, name_ar = ?, coach = ?, weekday = ?, start_time = ?, duration_min = ?,
     capacity = ?, ladies_only = ?, active = ? WHERE id = ?`,
  ).bind(c.name_en, c.name_ar, c.coach, c.weekday, c.start_time, c.duration_min, c.capacity, c.ladies_only, c.active, Number(body.id)).run();
  return json({ ok: true });
});
