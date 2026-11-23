'use client';
import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // A service worker in dev serves stale bundles; make sure none is left over.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
