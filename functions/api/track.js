// POST /api/track {kind, page}: counts taps on Call, WhatsApp and Directions.
// Stores no personal data: just what was tapped, on which page, and when.
import { handle, json, readBody, sameOrigin, HttpError } from '../_lib/http.js';
import { getDb, rateLimit } from '../_lib/db.js';

const KINDS = ['whatsapp', 'call', 'directions', 'instagram'];

export const onRequestPost = handle(async ({ request, env }) => {
  sameOrigin(request);
  const body = await readBody(request);
  if (!KINDS.includes(body.kind)) throw new HttpError(400, 'Unknown action.');
  const page = typeof body.page === 'string' ? body.page.slice(0, 60) : '';
  const db = await getDb(env);
  await rateLimit(db, request, 'track', 40, 60);
  await db.prepare('INSERT INTO clicks (kind, page, at) VALUES (?, ?, ?)').bind(body.kind, page, new Date().toISOString()).run();
  return json({ ok: true });
});
