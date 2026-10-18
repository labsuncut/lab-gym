// GET   /api/staff/leads  trial requests and messages, newest first
// PATCH /api/staff/leads {type: 'trial'|'message', id, status, note}
import { handle, json, readBody, text, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';

const TRIAL = ['new', 'contacted', 'visited', 'joined', 'not_interested'];
const MESSAGE = ['new', 'replied', 'closed'];

export const onRequestGet = handle(async ({ env }) => {
  const db = await getDb(env);
  const [trials, messages] = await Promise.all([
    db.prepare('SELECT * FROM trials ORDER BY id DESC LIMIT 300').all(),
    db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 300').all(),
  ]);
  return json({ trials: trials.results, messages: messages.results });
});

export const onRequestPatch = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const db = await getDb(env);
  const id = Number(body.id);
  if (body.type === 'trial') {
    if (!TRIAL.includes(body.status)) throw new HttpError(400, 'Unknown status.');
    await db.prepare('UPDATE trials SET status = ?, note = ? WHERE id = ?')
      .bind(body.status, text(body.note, 300), id).run();
  } else if (body.type === 'message') {
    if (!MESSAGE.includes(body.status)) throw new HttpError(400, 'Unknown status.');
    await db.prepare('UPDATE messages SET status = ? WHERE id = ?').bind(body.status, id).run();
  } else {
    throw new HttpError(400, 'Unknown type.');
  }
  return json({ ok: true });
});
