'use client';
import { useEffect, useState } from 'react';

/** useState that is mirrored to localStorage (silently skipped when storage is unavailable). */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        setValue((prev) =>
          prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev, ...parsed } : parsed,
        );
      }
    } catch {}
    setHydrated(true);
  }, [key]);

  // Only write after the stored value has been read, so the initial value never overwrites it.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
