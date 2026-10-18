// POST /api/trial: free trial pass request.
import { handle, json, readBody, sameOrigin, text, phone, email, honeypot } from '../_lib/http.js';
import { getDb, rateLimit } from '../_lib/db.js';

export const onRequestPost = handle(async ({ request, env }) => {
  sameOrigin(request);
  const body = await readBody(request);
  honeypot(body);
  const row = {
    name: text(body.name, 80, { required: true, label: 'Your name' }),
    phone: phone(body.phone),
    email: email(body.email),
    goal: text(body.goal, 60),
    preferred_day: text(body.preferred_day, 40),
  };
  const db = await getDb(env);
  await rateLimit(db, request, 'trial', 5, 60);
  await db.prepare('INSERT INTO trials (name, phone, email, goal, preferred_day) VALUES (?, ?, ?, ?, ?)')
    .bind(row.name, row.phone, row.email, row.goal, row.preferred_day).run();
  return json({ ok: true }, 201);
});
