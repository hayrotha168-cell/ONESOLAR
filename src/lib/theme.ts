'use client';
// Light / Dark / Auto (follow the phone). The choice is stored on the device and applied as
// <html data-theme="…">; layout.tsx applies it before the first paint so the page never flashes.
import { useSyncExternalStore } from 'react';

export type Theme = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'onesolar.theme';

const BAR = { light: '#f4f6fb', dark: '#0b1120' };
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const systemDark = () => typeof matchMedia !== 'undefined' && !matchMedia('(prefers-color-scheme: light)').matches;

/** The theme actually on screen. */
export function effectiveTheme(t: Theme = read()): 'light' | 'dark' {
  return t === 'auto' ? (systemDark() ? 'dark' : 'light') : t;
}

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme;
  else root.dataset.theme = t;
  // Phone status bar colour.
  const color = BAR[effectiveTheme(t)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

export function setTheme(t: Theme) {
  try {
    if (t === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {}
  apply(t);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null;
  const onSystem = () => { apply(read()); cb(); };
  mq?.addEventListener('change', onSystem);
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener('change', onSystem);
  };
}

/** [chosen theme, theme on screen] */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'auto' as Theme);
  const shown = useSyncExternalStore(subscribe, () => effectiveTheme(theme), () => 'dark' as const);
  return { theme, shown, setTheme };
}

/** Runs inline in <head> before the page paints. */
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}var d=t==='dark'||(t!=='light'&&!matchMedia('(prefers-color-scheme: light)').matches);document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',d?'${BAR.dark}':'${BAR.light}')})}catch(e){}`;
