// Small helpers shared by every API route.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

// Turns thrown errors into clean JSON answers instead of a crash page.
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong. Please try again or call us.' }, 500);
    }
  };
}

// Reads a JSON body (max 10 KB) and refuses anything else.
export async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Send JSON.');
  const text = await request.text();
  if (text.length > 10_000) throw new HttpError(413, 'Too much data.');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'That request was not readable.');
  }
}

// Requests that change data must come from our own site.
export function sameOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, 'Not allowed from another site.');
  }
}

export function text(value, max, { required = false, label = 'This field' } = {}) {
  const v = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  if (required && !v) throw new HttpError(400, `${label} is required.`);
  return v;
}

// Keeps a leading + and digits only. Accepts local Jordan numbers like 079 123 4567.
export function phone(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const count = digits.replace('+', '').length;
  if (count < 7 || count > 15) throw new HttpError(400, 'Please enter a valid phone number.');
  return digits;
}

export function email(value) {
  const v = text(value, 120);
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, 'Please enter a valid email.');
  return v;
}

// Hidden "website" field: people never fill it, spam bots usually do.
export function honeypot(body) {
  if (body.website) throw new HttpError(400, 'Request rejected.');
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || '0.0.0.0';
}

export async function sha256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 18) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Dates and times in Amman, whatever the server's own clock zone is.
export function ammanNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Amman',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Amman weekday (0 = Sunday), hour and date for any moment.
export function ammanParts(when) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date(when)).map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday ... 6 = Saturday
export function weekday(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
