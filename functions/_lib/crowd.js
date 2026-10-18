// Crowd numbers: staff count the people in the gym by hand, and every count is
// kept with its time. From those we work out the usual crowd for each weekday and hour.
import { ammanParts } from './http.js';

const HISTORY_DAYS = 28;

export async function latestCount(db) {
  return db.prepare('SELECT people, at FROM counts ORDER BY at DESC LIMIT 1').first();
}

// usual[weekday][hour] = average people seen at that hour over the last 4 weeks (null if never counted)
export async function usualByHour(db) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const { results } = await db.prepare('SELECT people, at FROM counts WHERE at >= ?').bind(since).all();
  const sum = Array.from({ length: 7 }, () => Array(24).fill(0));
  const n = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of results) {
    const { weekday, hour } = ammanParts(r.at);
    sum[weekday][hour] += r.people;
    n[weekday][hour] += 1;
  }
  return sum.map((row, d) => row.map((v, h) => (n[d][h] ? Math.round((v / n[d][h]) * 10) / 10 : null)));
}

// All counts made today (Amman time), oldest first.
export async function countsToday(db) {
  const today = ammanParts(Date.now()).date;
  const since = new Date(Date.now() - 30 * 3_600_000).toISOString();
  const { results } = await db.prepare('SELECT people, at FROM counts WHERE at >= ? ORDER BY at').bind(since).all();
  return results
    .map((r) => ({ ...r, ...ammanParts(r.at) }))
    .filter((r) => r.date === today)
    .map(({ people, at, hour, minute }) => ({ people, at, hour, minute }));
}
