// Staff login. One shared staff password, set as the secret STAFF_PASSWORD in Cloudflare.
// After login the browser keeps a signed cookie for 12 hours. Changing the password logs everyone out.
import { HttpError } from './http.js';

const COOKIE = 'staff_session';
const HOURS = 12;

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function secretOf(env) {
  if (!env.STAFF_PASSWORD || env.STAFF_PASSWORD.length < 10) {
    throw new HttpError(503, 'Staff login is not set up. Add a STAFF_PASSWORD secret (10+ characters) in Cloudflare.');
  }
  return `${env.STAFF_PASSWORD}|${env.SESSION_SECRET || 'lab-gym'}`;
}

// Compares two strings without leaking how much of them matched.
async function sameText(a, b) {
  const [x, y] = await Promise.all([hmac('compare', a), hmac('compare', b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(env, attempt) {
  secretOf(env);
  return typeof attempt === 'string' && (await sameText(attempt, env.STAFF_PASSWORD));
}

export async function sessionCookie(env) {
  const exp = Date.now() + HOURS * 3_600_000;
  const sig = await hmac(secretOf(env), `staff|${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HOURS * 3600}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function isStaff(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([a-f0-9]{64})`));
  if (!match) return false;
  const [, exp, sig] = match;
  if (Number(exp) < Date.now()) return false;
  return sameText(sig, await hmac(secretOf(env), `staff|${exp}`));
}
