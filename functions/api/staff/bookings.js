// POST  /api/staff/bookings {class_id, date, name, phone}  add a walk-in or phone booking
// PATCH /api/staff/bookings {id, status}  mark attended, no-show, cancelled or booked again
import { handle, json, readBody, text, phone, isIsoDate, randomToken, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';

const STATUSES = ['booked', 'attended', 'no_show', 'cancelled'];

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const classId = Number.parseInt(body.class_id, 10);
  if (!Number.isInteger(classId) || !isIsoDate(body.date)) throw new HttpError(400, 'Missing class or date.');
  const name = text(body.name, 80, { required: true, label: 'Name' });
  const tel = phone(body.phone);
  const db = await getDb(env);
  try {
    await db.prepare('INSERT INTO bookings (class_id, date, name, phone, token) VALUES (?, ?, ?, ?, ?)')
      .bind(classId, body.date, name, tel, randomToken()).run();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'That phone number is already booked in this class.');
    throw err;
  }
  return json({ ok: true }, 201);
});

export const onRequestPatch = handle(async ({ request, env }) => {
  const body = await readBody(request);
  if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status.');
  const db = await getDb(env);
  try {
    await db.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(body.status, Number(body.id)).run();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'This person already has another booking in that class.');
    throw err;
  }
  return json({ ok: true });
});
