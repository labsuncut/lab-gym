// GET /api/info: the notice bar text staff set in the dashboard.
import { handle, json } from '../_lib/http.js';
import { getDb, getSettings } from '../_lib/db.js';

export const onRequestGet = handle(async ({ env }) => {
  const s = await getSettings(await getDb(env));
  return json({ notice_en: s.notice_en || '', notice_ar: s.notice_ar || '' }, 200, {
    'cache-control': 'public, max-age=60',
  });
});
