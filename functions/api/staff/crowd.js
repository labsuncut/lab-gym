// GET    /api/staff/crowd           last count, today's counts, usual crowd by weekday and hour
// POST   /api/staff/crowd {people}  save a head count
// POST   /api/staff/crowd {sample: true}  fill 4 weeks of practice counts (trial only)
// DELETE /api/staff/crowd           remove the practice counts
import { handle, json, readBody, ammanParts, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';
import { latestCount, countsToday, usualByHour } from '../../_lib/crowd.js';

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const [last, today, usual, samples] = await Promise.all([
    latestCount(db), countsToday(db), usualByHour(db),
    db.prepare('SELECT COUNT(*) AS n FROM counts WHERE sample = 1').first(),
  ]);
  return json({ last, today, usual, now: ammanParts(Date.now()), has_samples: samples.n > 0 });
});

// A believable gym day: quiet late morning, a lunch bump, a big evening peak.
function practiceCount(weekday, hour) {
  const shape = { 6: 8, 7: 14, 8: 10, 9: 7, 10: 9, 11: 8, 12: 10, 13: 9, 14: 6, 15: 8, 16: 14, 17: 24, 18: 34, 19: 38, 20: 30, 21: 20, 22: 9 };
  let base = shape[hour] ?? 0;
  if (weekday === 5) base = hour >= 14 ? Math.round(base * 0.6) : 0; // Friday: opens at 2 PM, quieter
  if (weekday === 4) base = Math.round(base * 0.85); // Thursday evenings are lighter
  return Math.max(0, Math.round(base * (0.8 + Math.random() * 0.4)));
}

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const db = await getDb(env);
  if (body.sample) {
    const insert = db.prepare('INSERT INTO counts (people, at, sample) VALUES (?, ?, 1)');
    const rows = [];
    const start = Date.now() - 28 * 86_400_000;
    for (let t = start; t < Date.now() - 3_600_000; t += 30 * 60_000) {
      const { weekday, hour } = ammanParts(t);
      const closed = weekday === 5 ? hour < 14 || hour >= 22 : hour < 6 || hour >= 23;
      if (!closed) rows.push(insert.bind(practiceCount(weekday, hour), new Date(t).toISOString()));
    }
    for (let i = 0; i < rows.length; i += 200) await db.batch(rows.slice(i, i + 200));
    return json({ ok: true, added: rows.length });
  }
  const people = Number.parseInt(body.people, 10);
  if (!(people >= 0 && people <= 1000)) throw new HttpError(400, 'Enter a number from 0 to 1000.');
  await db.prepare('INSERT INTO counts (people, at) VALUES (?, ?)').bind(people, new Date().toISOString()).run();
  return json({ ok: true }, 201);
});

export const onRequestDelete = handle(async ({ env }) => {
  const db = await getDb(env);
  await db.prepare('DELETE FROM counts WHERE sample = 1').run();
  return json({ ok: true });
});
