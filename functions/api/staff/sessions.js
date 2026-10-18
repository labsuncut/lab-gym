// GET  /api/staff/sessions?date=YYYY-MM-DD  classes on that day with who booked
// POST /api/staff/sessions {class_id, date, cancelled}  cancel or restore one class on one day
import { handle, json, readBody, isIsoDate, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';
import { sessionsBetween, bookingWindow } from '../../_lib/schedule.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const db = await getDb(env);
  let date = new URL(request.url).searchParams.get('date');
  if (!isIsoDate(date)) date = bookingWindow().from;
  const sessions = await sessionsBetween(db, date, 1);
  const { results } = await db.prepare(
    `SELECT id, class_id, name, phone, status, created_at FROM bookings
     WHERE date = ? AND status != 'cancelled' ORDER BY created_at`,
  ).bind(date).all();
  for (const s of sessions) s.people = results.filter((b) => b.class_id === s.class_id);
  return json({ date, sessions });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const classId = Number.parseInt(body.class_id, 10);
  if (!Number.isInteger(classId) || !isIsoDate(body.date)) throw new HttpError(400, 'Missing class or date.');
  const db = await getDb(env);
  if (body.cancelled) {
    await db.prepare('INSERT OR IGNORE INTO cancelled_sessions (class_id, date) VALUES (?, ?)').bind(classId, body.date).run();
  } else {
    await db.prepare('DELETE FROM cancelled_sessions WHERE class_id = ? AND date = ?').bind(classId, body.date).run();
  }
  return json({ ok: true });
});
