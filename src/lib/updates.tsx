'use client';
// Notices when a newer release is live (by comparing /version.json with this build) and applies it.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BUILD_ID } from './version';

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'offline';

interface UpdateCtx {
  status: UpdateStatus;
  latest: string | null; // version number of the live release
  check: () => Promise<void>;
  apply: () => Promise<void>;
  dismissed: boolean;
  dismiss: () => void;
}

const Ctx = createContext<UpdateCtx | null>(null);
export function useUpdates() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUpdates must be used inside <UpdateProvider>');
  return c;
}

const EVERY = 30 * 60 * 1000; // re-check every 30 minutes while open

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus((s) => (s === 'available' ? s : 'checking'));
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      const v = (await r.json()) as { version?: string; build?: string };
      setLatest(v.version ?? null);
      setStatus(v.build && v.build !== BUILD_ID ? 'available' : 'current');
    } catch {
      setStatus((s) => (s === 'available' ? s : 'offline'));
    } finally {
      busy.current = false;
    }
  }, []);

  const apply = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {}
    // Pages are fetched network-first and build files are content-hashed, so a reload loads the new release.
    location.reload();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const first = setTimeout(check, 3000);
    const timer = setInterval(check, EVERY);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return (
    <Ctx.Provider value={{ status, latest, check, apply, dismissed, dismiss: () => setDismissed(true) }}>
      {children}
    </Ctx.Provider>
  );
}
