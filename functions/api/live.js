// GET /api/live: how busy the gym is now, for the badge on the website.
// The number is hidden when nobody has counted for 2 hours, so it is never stale.
import { handle, json, ammanParts } from '../_lib/http.js';
import { getDb } from '../_lib/db.js';
import { latestCount, usualByHour } from '../_lib/crowd.js';

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const [last, usual] = await Promise.all([latestCount(db), usualByHour(db)]);
  const fresh = last && Date.now() - Date.parse(last.at) < 2 * 3_600_000;
  const now = ammanParts(Date.now());
  const row = usual[now.weekday];
  // Quietest hour still ahead today (not the last hour before closing), shown only
  // when it is clearly quieter than now.
  const close = now.weekday === 5 ? 22 : 23;
  let quiet = null;
  for (let h = now.hour + 1; h < close - 1; h++) {
    if (row[h] != null && (quiet == null || row[h] < row[quiet])) quiet = h;
  }
  const busyNow = fresh ? last.people : row[now.hour];
  if (quiet != null && !(busyNow != null && row[quiet] < busyNow * 0.75)) quiet = null;
  return json({
    people: fresh ? last.people : null,
    at: fresh ? last.at : null,
    usual_now: row[now.hour],
    quiet_hour: quiet,
  }, 200, { 'cache-control': 'public, max-age=30' });
});
