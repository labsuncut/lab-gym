// POST /api/book: reserve a spot in a class.
import { handle, json, readBody, sameOrigin, text, phone, honeypot, isIsoDate, weekday, ammanNow, randomToken, HttpError } from '../_lib/http.js';
import { getDb, getSettings, rateLimit } from '../_lib/db.js';
import { bookingWindow } from '../_lib/schedule.js';

export const onRequestPost = handle(async ({ request, env }) => {
  sameOrigin(request);
  const body = await readBody(request);
  honeypot(body);
  const name = text(body.name, 80, { required: true, label: 'Your name' });
  const tel = phone(body.phone);
  const classId = Number.parseInt(body.class_id, 10);
  const date = body.date;
  if (!Number.isInteger(classId) || !isIsoDate(date)) throw new HttpError(400, 'Please pick a class.');

  const db = await getDb(env);
  const settings = await getSettings(db);
  if (settings.booking_open !== '1') throw new HttpError(403, 'Online booking is paused. Please call us to book.');

  const { from, to } = bookingWindow();
  if (date < from || date > to) throw new HttpError(400, 'You can book up to 7 days ahead.');

  const cls = await db.prepare('SELECT * FROM classes WHERE id = ? AND active = 1').bind(classId).first();
  if (!cls || cls.weekday !== weekday(date)) throw new HttpError(404, 'That class is not on the timetable.');
  const now = ammanNow();
  if (date === now.date && cls.start_time <= now.time) throw new HttpError(400, 'That class has already started.');
  const off = await db.prepare('SELECT 1 FROM cancelled_sessions WHERE class_id = ? AND date = ?').bind(classId, date).first();
  if (off) throw new HttpError(409, 'That class is cancelled on this day.');

  await rateLimit(db, request, 'book', 10, 60);

  const token = randomToken();
  let result;
  try {
    // One statement checks capacity and inserts, so two people can't take the last spot at once.
    result = await db.prepare(
      `INSERT INTO bookings (class_id, date, name, phone, token)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM bookings WHERE class_id = ? AND date = ? AND status != 'cancelled') < ?`,
    ).bind(classId, date, name, tel, token, classId, date, cls.capacity).run();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'This phone number is already booked in that class.');
    throw err;
  }
  if (!result.meta.changes) throw new HttpError(409, 'Sorry, that class just filled up. Try another time.');

  return json({
    ok: true,
    token,
    booking: {
      date, start_time: cls.start_time, duration_min: cls.duration_min,
      name_en: cls.name_en, name_ar: cls.name_ar || cls.name_en, coach: cls.coach,
    },
  }, 201);
});
