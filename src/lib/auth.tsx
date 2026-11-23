'use client';
// Telegram sign-in. The Worker (worker/index.ts) checks Telegram's signature and sets a session cookie.
// When the Worker has no bot configured (or on `next dev`, where /api does not exist) the app runs without sign-in.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useT } from './i18n';

export interface User {
  id: number;
  name: string;
  username?: string;
  photo?: string;
}

interface AuthCtx {
  user: User | null;
  /** True when this deployment requires Telegram sign-in. */
  required: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, required: false, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

const USER_KEY = 'onesolar.user';
const REQ_KEY = 'onesolar.authRequired';

const cached = <T,>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const store = (k: string, v: unknown) => {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

type State =
  | { phase: 'loading' }
  | { phase: 'open' } // no sign-in needed
  | { phase: 'in'; user: User }
  | { phase: 'login'; botId: string | null; offline?: boolean; error?: string; working?: boolean };

async function getJSON<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const isJson = (r.headers.get('content-type') ?? '').includes('application/json');
  return { status: r.status, data: isJson ? ((await r.json()) as T) : null };
}

interface TelegramLogin {
  Login: {
    auth: (opts: { bot_id: string; request_access?: string; lang?: string }, cb: (data: Record<string, unknown> | false) => void) => void;
  };
}

let widgetPromise: Promise<TelegramLogin> | null = null;
/** Loads https://telegram.org/js/telegram-widget.js once. */
function loadTelegramWidget(): Promise<TelegramLogin> {
  const w = window as unknown as { Telegram?: TelegramLogin };
  if (w.Telegram?.Login) return Promise.resolve(w.Telegram);
  widgetPromise ??= new Promise<TelegramLogin>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.onload = () => (w.Telegram?.Login ? resolve(w.Telegram) : reject(new Error('Telegram script did not load')));
    s.onerror = () => { widgetPromise = null; reject(new Error('Telegram script did not load')); };
    document.head.appendChild(s);
  });
  return widgetPromise;
}

/** Reads the `#tgAuthResult=…` fragment Telegram appends after a redirect sign-in. */
function takeTelegramResult(): Record<string, unknown> | null {
  const m = location.hash.match(/tgAuthResult=([A-Za-z0-9_=-]+)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [state, setState] = useState<State>({ phase: 'loading' });

  const signIn = useCallback(async (payload: Record<string, unknown>, botId: string | null) => {
    setState({ phase: 'login', botId, working: true });
    try {
      const r = await getJSON<{ user?: User; error?: string }>('/api/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.status === 200 && r.data?.user) {
        store(USER_KEY, r.data.user);
        setState({ phase: 'in', user: r.data.user });
      } else {
        setState({ phase: 'login', botId, error: r.data?.error ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setState({ phase: 'login', botId, error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tg = takeTelegramResult();
      let cfg: { status: number; data: { botId: string | null } | null };
      try {
        cfg = await getJSON('/api/config');
      } catch {
        // Offline: trust the last known state so the installed app keeps working.
        const user = cached<User>(USER_KEY);
        if (cancelled) return;
        if (user) setState({ phase: 'in', user });
        else if (cached<boolean>(REQ_KEY)) setState({ phase: 'login', botId: null, offline: true });
        else setState({ phase: 'open' });
        return;
      }
      if (cancelled) return;
      const botId = cfg.data?.botId ?? null;
      store(REQ_KEY, botId ? true : null);
      if (!botId) { setState({ phase: 'open' }); return; }
      if (tg) { await signIn(tg, botId); return; }
      try {
        const me = await getJSON<{ user: User }>('/api/me');
        if (cancelled) return;
        if (me.status === 200 && me.data?.user) {
          store(USER_KEY, me.data.user);
          setState({ phase: 'in', user: me.data.user });
        } else {
          store(USER_KEY, null);
          setState({ phase: 'login', botId });
        }
      } catch {
        const user = cached<User>(USER_KEY);
        setState(user ? { phase: 'in', user } : { phase: 'login', botId, offline: true });
      }
    })();
    return () => { cancelled = true; };
  }, [signIn]);

  const logout = useCallback(async () => {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
    store(USER_KEY, null);
    location.reload();
  }, []);

  // Load Telegram's script as soon as the login screen shows, so the popup opens straight from the tap.
  const showLogin = state.phase === 'login' && !state.offline;
  useEffect(() => { if (showLogin) loadTelegramWidget().catch(() => {}); }, [showLogin]);

  if (state.phase === 'loading') return <div className="auth-screen" aria-busy="true" />;

  if (state.phase === 'login') {
    const start = async () => {
      if (!state.botId) return;
      const botId = state.botId;
      // Preferred: Telegram's own login script opens a popup and hands the signed result back.
      const tg = await loadTelegramWidget().catch(() => null);
      if (tg) {
        tg.Login.auth({ bot_id: botId, request_access: 'write', lang: document.documentElement.lang }, (data) => {
          if (data) signIn(data, botId);
        });
        return;
      }
      // Fallback when the script cannot load: full-page redirect with return_to.
      const q = new URLSearchParams({
        bot_id: state.botId,
        origin: location.origin,
        embed: '0',
        request_access: 'write',
        return_to: `${location.origin}/`,
      });
      location.href = `https://oauth.telegram.org/auth?${q}`;
    };
    return (
      <div className="auth-screen">
        <div className="auth-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="ONE SOLAR" width={120} height={120} />
          <h1>{t.loginTitle}</h1>
          <p className="muted">{t.loginHelp}</p>
          {state.offline ? (
            <p className="warn small">{t.loginOffline}</p>
          ) : (
            <button className="btn tg-btn" type="button" onClick={start} disabled={state.working || !state.botId}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
                <path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5L18 6.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4Z" />
              </svg>
              {state.working ? t.loginWorking : t.loginBtn}
            </button>
          )}
          {state.error && <p className="small bad-text">{t.loginErr(state.error)}</p>}
        </div>
      </div>
    );
  }

  const user = state.phase === 'in' ? state.user : null;
  return <Ctx.Provider value={{ user, required: state.phase === 'in', logout }}>{children}</Ctx.Provider>;
}
