// Saved projects (inputs + a 3D snapshot), kept on this device in IndexedDB.
import { CableInput, DEFAULT_CABLE } from './cable';
import type { HorizonPoint, Site } from './solar';
import type { Price } from './energy';

export interface Project {
  id: string;
  created: number; // ms since epoch
  updated?: number; // ms since epoch, when the details were last edited
  name: string;
  customer: string;
  phone: string;
  address: string;
  notes: string;
  preparedBy: string;
  site: Site;
  date: string; // survey date, YYYY-MM-DD
  panel: { tilt: number; azimuth: number };
  array: { count: number; watt: number; pr: number };
  horizon: HorizonPoint[];
  cable: CableInput;
  image: string; // JPEG data URL of the 3D view
  price?: Price; // electricity tariff when the project was saved (older projects have none)
}

/** localStorage keys the calculator and survey read their inputs from. */
export const KEYS = {
  site: 'onesolar.site',
  panel: 'onesolar.panel',
  array: 'onesolar.array',
  horizon: 'onesolar.horizon',
  cable: 'onesolar.cable',
} as const;

const DB = 'onesolar';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<Project[]> {
  const all = await run<Project[]>('readonly', (s) => s.getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.created - a.created);
}

export const saveProject = (p: Project) => run('readwrite', (s) => s.put(p));
export const deleteProject = (id: string) => run('readwrite', (s) => s.delete(id));

export function newId() {
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${Date.now().toString(36).toUpperCase()}${r}`;
}

/** Report number shown on the PDF, e.g. OS-20261123-4F2A. */
export function reportNo(p: Pick<Project, 'id' | 'created'>) {
  const d = new Date(p.created);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `OS-${ymd}-${p.id.slice(-4)}`;
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...v } : v;
  } catch {
    return fallback;
  }
}

export const readCable = () => readStored<CableInput>(KEYS.cable, DEFAULT_CABLE);

/** Writes a project's inputs back to the calculator and survey. */
export function restoreProject(p: Project) {
  const put = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  put(KEYS.site, p.site);
  put(KEYS.panel, p.panel);
  put(KEYS.array, p.array);
  put(KEYS.horizon, p.horizon);
  put(KEYS.cable, p.cable);
}

/** Grabs the 3D view as a JPEG, scaled to at most `maxW` pixels wide. */
export function snapshot3D(maxW = 1280): string {
  const src = document.querySelector<HTMLCanvasElement>('.scene canvas');
  if (!src || !src.width) return '';
  const scale = Math.min(1, maxW / src.width);
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
