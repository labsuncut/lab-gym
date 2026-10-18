// GET /api/staff/overview: the numbers on the dashboard's first screen.
import { handle, json, addDays } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';
import { bookingWindow } from '../../_lib/schedule.js';

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const { from } = bookingWindow();
  const weekAgo = addDays(from, -6);
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first().then((r) => r.n);
  const [today, upcoming, lastWeek, attended, trialsNew, trialsWeek, messagesNew] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM bookings WHERE date = ? AND status != 'cancelled'`, from),
    one(`SELECT COUNT(*) AS n FROM bookings WHERE date >= ? AND status = 'booked'`, from),
    one(`SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status != 'cancelled'`, weekAgo, from),
    one(`SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status = 'attended'`, weekAgo, from),
    one(`SELECT COUNT(*) AS n FROM trials WHERE status = 'new'`),
    one(`SELECT COUNT(*) AS n FROM trials WHERE created_at >= datetime('now', '-7 days')`),
    one(`SELECT COUNT(*) AS n FROM messages WHERE status = 'new'`),
  ]);
  return json({ today: from, counts: { today, upcoming, lastWeek, attended, trialsNew, trialsWeek, messagesNew } });
});
