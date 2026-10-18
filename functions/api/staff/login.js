// POST /api/staff/login {password}   DELETE /api/staff/login  (log out)   GET: am I logged in?
import { handle, json, readBody, HttpError } from '../../_lib/http.js';
import { getDb, rateLimit } from '../../_lib/db.js';
import { checkPassword, sessionCookie, clearCookie, isStaff } from '../../_lib/auth.js';

export const onRequestGet = handle(async ({ request, env }) => json({ staff: await isStaff(request, env) }));

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const db = await getDb(env);
  await rateLimit(db, request, 'login', 8, 15);
  if (!(await checkPassword(env, body.password))) throw new HttpError(401, 'Wrong password.');
  return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env) });
});

export const onRequestDelete = handle(async () => json({ ok: true }, 200, { 'set-cookie': clearCookie() }));
