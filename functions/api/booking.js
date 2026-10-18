// GET  /api/booking?t=TOKEN  see one booking (the link in the confirmation)
// POST /api/booking {token}  cancel it
import { handle, json, readBody, sameOrigin, ammanNow, HttpError } from '../_lib/http.js';
import { getDb } from '../_lib/db.js';

async function find(db, token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 64) throw new HttpError(404, 'Booking not found.');
  const row = await db.prepare(
    `SELECT b.date, b.name, b.status, c.start_time, c.duration_min, c.name_en, c.name_ar, c.coach, b.id
     FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.token = ?`,
  ).bind(token).first();
  if (!row) throw new HttpError(404, 'Booking not found.');
  return row;
}

export const onRequestGet = handle(async ({ request, env }) => {
  const db = await getDb(env);
  const { id, ...booking } = await find(db, new URL(request.url).searchParams.get('t'));
  return json({ booking });
});

export const onRequestPost = handle(async ({ request, env }) => {
  sameOrigin(request);
  const body = await readBody(request);
  const db = await getDb(env);
  const row = await find(db, body.token);
  if (row.status !== 'booked') throw new HttpError(409, 'This booking can no longer be cancelled.');
  const now = ammanNow();
  if (row.date < now.date || (row.date === now.date && row.start_time <= now.time)) {
    throw new HttpError(409, 'This class has already started.');
  }
  await db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).bind(row.id).run();
  return json({ ok: true });
});
