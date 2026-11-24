// ONE SOLAR Worker: serves the static app and a small /api for Telegram sign-in.
//
// Setup (once):
//   1. In Telegram, @BotFather → /newbot, then /setdomain → onesolar.1dev.biz
//   2. npx wrangler secret put TELEGRAM_BOT_TOKEN   (paste the bot token)
//   3. npm run deploy
// Without TELEGRAM_BOT_TOKEN the app runs with sign-in switched off.

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional: registered users, one key per Telegram id. */
  USERS?: KV;
}

interface SessionUser {
  id: number;
  name: string;
  username?: string;
  photo?: string;
}

const COOKIE = 'os_session';
const SESSION_DAYS = 60;
const AUTH_MAX_AGE = 24 * 3600; // Telegram auth data older than this is refused

const enc = new TextEncoder();

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function hmac(keyBytes: ArrayBuffer, data: string) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

/** Constant-time comparison of two equal-length strings. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** https://core.telegram.org/widgets/login#checking-authorization */
async function verifyTelegram(data: Record<string, unknown>, token: string) {
  const hash = typeof data.hash === 'string' ? data.hash : '';
  const check = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] != null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const ok = same(hex(await hmac(secret, check)), hash.toLowerCase());
  const fresh = Number(data.auth_date) > Date.now() / 1000 - AUTH_MAX_AGE;
  return ok && fresh;
}

const sessionKey = (token: string) => crypto.subtle.digest('SHA-256', enc.encode(`onesolar-session:${token}`));

async function makeSession(user: SessionUser, token: string) {
  const body = b64url(enc.encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 })));
  const sig = b64url(new Uint8Array(await hmac(await sessionKey(token), body)));
  return `${body}.${sig}`;
}

async function readSession(req: Request, token: string): Promise<SessionUser | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const want = b64url(new Uint8Array(await hmac(await sessionKey(token), body)));
  if (!same(want, sig)) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (typeof v.exp !== 'number' || v.exp < Date.now() / 1000) return null;
    return { id: v.id, name: v.name, username: v.username, photo: v.photo };
  } catch {
    return null;
  }
}

const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

/**
 * Follows a short Google Maps share link (maps.app.goo.gl/…) and returns where it leads, so the app can read
 * the coordinates. Browsers cannot do this themselves (cross-site). Only Google hosts are ever fetched.
 */
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const googleHost = (h: string) => SHORT_HOSTS.has(h) || /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(h);

async function resolveMapLink(raw: string): Promise<Response> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: 'Not a link' }, 400);
  }
  if (url.protocol !== 'https:' || !SHORT_HOSTS.has(url.hostname) || (url.hostname === 'goo.gl' && !url.pathname.startsWith('/maps'))) {
    return json({ error: 'Only Google Maps share links are supported' }, 400);
  }
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(url.toString(), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; ONE SOLAR)' } });
    const loc = r.headers.get('location');
    if (!loc || r.status < 300 || r.status > 399) break;
    const next = new URL(loc, url);
    if (next.protocol !== 'https:' || !googleHost(next.hostname)) break;
    url = next;
    if (!SHORT_HOSTS.has(url.hostname)) break; // reached the full google.com/maps link
  }
  return json({ url: url.toString() }, 200, { 'cache-control': 'public, max-age=86400' });
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();

  if (path === '/api/config') {
    // The bot id (the part before ":") is public; the rest of the token is secret.
    return json({ botId: token ? token.split(':')[0] : null });
  }
  if (path === '/api/maplink') return resolveMapLink(new URL(req.url).searchParams.get('u') ?? '');

  if (!token) return json({ error: 'Sign-in is not configured' }, 404);

  if (path === '/api/auth/telegram' && req.method === 'POST') {
    let data: Record<string, unknown>;
    try {
      data = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'Bad request' }, 400);
    }
    if (!(await verifyTelegram(data, token))) return json({ error: 'Telegram signature check failed' }, 401);
    const user: SessionUser = {
      id: Number(data.id),
      name: [data.first_name, data.last_name].filter(Boolean).join(' ') || String(data.username ?? data.id),
      username: typeof data.username === 'string' ? data.username : undefined,
      photo: typeof data.photo_url === 'string' ? data.photo_url : undefined,
    };
    if (env.USERS) {
      const key = `user:${user.id}`;
      const prev = JSON.parse((await env.USERS.get(key)) ?? 'null') as { registered?: string; logins?: number } | null;
      const now = new Date().toISOString();
      await env.USERS.put(key, JSON.stringify({ ...user, registered: prev?.registered ?? now, lastLogin: now, logins: (prev?.logins ?? 0) + 1 }));
    }
    return json({ user }, 200, { 'set-cookie': cookieHeader(await makeSession(user, token), SESSION_DAYS * 86400) });
  }

  if (path === '/api/me') {
    const user = await readSession(req, token);
    return user ? json({ user }) : json({ error: 'Not signed in' }, 401);
  }

  if (path === '/api/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return api(req, env, url.pathname);
    return env.ASSETS.fetch(req);
  },
};
