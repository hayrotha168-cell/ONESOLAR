// Checks the Worker's Telegram sign-in with a made-up bot token (no network).
// Run: node scripts/check-auth.mts
import { createHash, createHmac } from 'node:crypto';
import worker from '../worker/index.ts';

const TOKEN = '123456789:TEST-not-a-real-token';
const store = new Map<string, string>();
const env = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  ASSETS: { fetch: async () => new Response('asset') },
  USERS: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) },
};

function signed(data: Record<string, string | number>) {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
  const secret = createHash('sha256').update(TOKEN).digest();
  return { ...data, hash: createHmac('sha256', secret).update(check).digest('hex') };
}

let fail = 0;
const ok = (name: string, cond: boolean) => { if (!cond) fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://onesolar.test${path}`, init), env);
const post = (body: unknown) => call('/api/auth/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const now = Math.floor(Date.now() / 1000);
const good = signed({ id: 42, first_name: 'Sok', last_name: 'Dara', username: 'sokdara', auth_date: now });

ok('config exposes only the bot id', (await (await call('/api/config')).json()).botId === '123456789');
const r = await post(good);
const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
ok('valid Telegram data signs in', r.status === 200 && cookie.startsWith('os_session='));
ok('user is registered in KV', JSON.parse(store.get('user:42') ?? '{}').logins === 1);
const me = await call('/api/me', { headers: { cookie } });
ok('session cookie returns the user', me.status === 200 && (await me.json()).user.name === 'Sok Dara');
ok('tampered name is refused', (await post({ ...good, first_name: 'Evil' })).status === 401);
ok('old auth data is refused', (await post(signed({ id: 42, first_name: 'Sok', auth_date: now - 3 * 86400 }))).status === 401);
ok('missing hash is refused', (await post({ id: 42, auth_date: now })).status === 401);
const [body] = cookie.slice('os_session='.length).split('.');
ok('forged cookie is refused', (await call('/api/me', { headers: { cookie: `os_session=${body}.AAAA` } })).status === 401);
ok('no cookie is 401', (await call('/api/me')).status === 401);
ok('logout clears the cookie', ((await call('/api/logout', { method: 'POST' })).headers.get('set-cookie') ?? '').includes('Max-Age=0'));
ok('other paths go to the static app', (await (await call('/')).text()) === 'asset');

console.log(fail ? `\n${fail} check(s) failed` : '\nAll sign-in checks passed');
process.exit(fail ? 1 : 0);
