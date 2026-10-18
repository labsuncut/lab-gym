// GET /api/staff/settings   PUT /api/staff/settings {notice_en, notice_ar, booking_open}
import { handle, json, readBody, text } from '../../_lib/http.js';
import { getDb, getSettings } from '../../_lib/db.js';

export const onRequestGet = handle(async ({ env }) => json(await getSettings(await getDb(env))));

export const onRequestPut = handle(async ({ request, env }) => {
  const body = await readBody(request);
  const db = await getDb(env);
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  await db.batch([
    put.bind('notice_en', text(body.notice_en, 160)),
    put.bind('notice_ar', text(body.notice_ar, 160)),
    put.bind('booking_open', body.booking_open ? '1' : '0'),
  ]);
  return json({ ok: true });
});
