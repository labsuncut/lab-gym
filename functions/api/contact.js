// POST /api/contact: a message from the contact form.
import { handle, json, readBody, sameOrigin, text, phone, email, honeypot, HttpError } from '../_lib/http.js';
import { getDb, rateLimit } from '../_lib/db.js';

export const onRequestPost = handle(async ({ request, env }) => {
  sameOrigin(request);
  const body = await readBody(request);
  honeypot(body);
  const name = text(body.name, 80, { required: true, label: 'Your name' });
  const tel = body.phone ? phone(body.phone) : '';
  const mail = email(body.email);
  if (!tel && !mail) throw new HttpError(400, 'Leave a phone number or an email so we can reply.');
  const topic = text(body.topic, 40);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!message) throw new HttpError(400, 'Please write a message.');
  const db = await getDb(env);
  await rateLimit(db, request, 'contact', 5, 60);
  await db.prepare('INSERT INTO messages (name, phone, email, topic, body) VALUES (?, ?, ?, ?, ?)')
    .bind(name, tel, mail, topic, message).run();
  return json({ ok: true }, 201);
});
