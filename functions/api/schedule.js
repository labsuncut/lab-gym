// GET /api/schedule: the next 7 days of classes with spots left.
import { handle, json } from '../_lib/http.js';
import { getDb, getSettings } from '../_lib/db.js';
import { sessionsBetween, bookingWindow, BOOKING_WINDOW_DAYS } from '../_lib/schedule.js';

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const { from } = bookingWindow();
  const [sessions, settings] = await Promise.all([
    sessionsBetween(db, from, BOOKING_WINDOW_DAYS),
    getSettings(db),
  ]);
  return json({ today: from, booking_open: settings.booking_open === '1', sessions });
});
