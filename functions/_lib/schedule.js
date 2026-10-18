// Turns the weekly timetable into dated sessions with live spot counts.
import { ammanNow, addDays, weekday } from './http.js';

export const BOOKING_WINDOW_DAYS = 7;

export async function sessionsBetween(db, from, days) {
  const to = addDays(from, days - 1);
  const [classes, counts, cancelled] = await Promise.all([
    db.prepare('SELECT * FROM classes WHERE active = 1 ORDER BY start_time').all(),
    db.prepare(
      `SELECT class_id, date, COUNT(*) AS n FROM bookings
       WHERE date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY class_id, date`,
    ).bind(from, to).all(),
    db.prepare('SELECT class_id, date FROM cancelled_sessions WHERE date BETWEEN ? AND ?').bind(from, to).all(),
  ]);
  const booked = new Map(counts.results.map((r) => [`${r.class_id}|${r.date}`, r.n]));
  const off = new Set(cancelled.results.map((r) => `${r.class_id}|${r.date}`));
  const now = ammanNow();

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const day = weekday(date);
    for (const c of classes.results) {
      if (c.weekday !== day) continue;
      const key = `${c.id}|${date}`;
      const taken = booked.get(key) || 0;
      out.push({
        class_id: c.id,
        date,
        start_time: c.start_time,
        duration_min: c.duration_min,
        name_en: c.name_en,
        name_ar: c.name_ar || c.name_en,
        coach: c.coach,
        ladies_only: !!c.ladies_only,
        capacity: c.capacity,
        booked: taken,
        spots_left: Math.max(0, c.capacity - taken),
        cancelled: off.has(key),
        past: date < now.date || (date === now.date && c.start_time <= now.time),
      });
    }
  }
  return out;
}

export function bookingWindow() {
  const today = ammanNow().date;
  return { from: today, to: addDays(today, BOOKING_WINDOW_DAYS - 1) };
}
