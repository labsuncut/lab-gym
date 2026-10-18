// GET /api/staff/export?type=bookings|trials|messages  download as a CSV file (opens in Excel or Google Sheets)
import { handle, HttpError } from '../../_lib/http.js';
import { getDb } from '../../_lib/db.js';

const QUERIES = {
  bookings: `SELECT b.date, c.start_time, c.name_en AS class, c.coach, b.name, b.phone, b.status, b.created_at
             FROM bookings b JOIN classes c ON c.id = b.class_id ORDER BY b.date DESC, c.start_time`,
  trials: 'SELECT created_at, source, name, phone, email, goal, preferred_day, status, note FROM trials ORDER BY id DESC',
  counts: 'SELECT at AS time_utc, people, sample FROM counts ORDER BY at DESC',
  messages: 'SELECT created_at, name, phone, email, topic, body, status FROM messages ORDER BY id DESC',
};

function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheet formulas sneaking in
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const onRequestGet = handle(async ({ request, env }) => {
  const type = new URL(request.url).searchParams.get('type');
  if (!QUERIES[type]) throw new HttpError(400, 'Unknown export.');
  const { results } = await (await getDb(env)).prepare(QUERIES[type]).all();
  const cols = results.length ? Object.keys(results[0]) : [];
  const csv = [cols.join(','), ...results.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  return new Response('﻿' + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ironvale-${type}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
