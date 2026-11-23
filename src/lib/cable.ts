// Cable sizing: voltage drop + current-carrying capacity.
//
// Standards used:
//  - IEC 60364-5-52:2009 Annex B — current-carrying capacities (copper, PVC 70 °C):
//      Table B.52.2 (2 loaded conductors) / B.52.4 (3 loaded) — methods B2 and D1
//      Table B.52.10 — method E (multicore cable in free air / perforated tray)
//      Table B.52.14 / B.52.15 — ambient (air / ground) temperature correction
//      Table B.52.17 (item 1) / B.52.19 — grouping correction
//  - IEC 60364-5-52 Annex G — voltage drop (ρ1 = 1.25 × ρ20, λ = 0.08 mΩ/m)
//  - IEC 60364-5-52 Table 52.2 — minimum cross-section (Al ≥ 16 mm² for power circuits)
//  - EN 50618 (= IEC 62930) Annex A, Tables A.3 / A.4 — PV cable, single cable in free air
//  - IEC 62548 — PV string/array cables sized for ≥ 1.25 × Isc(STC)

export const SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300] as const;

export type System = 'dc' | 'ac1' | 'ac3';
export type Material = 'cu' | 'al';
export type Install = 'pv' | 'conduit' | 'tray' | 'buried';

export interface CableInput {
  system: System;
  mode: 'current' | 'power';
  current: number;
  power: number;
  voltage: number; // DC / single-phase: line voltage. Three-phase: line-to-line voltage.
  length: number; // one-way, m
  drop: number; // max %
  pf: number;
  material: Material;
  install: Install;
  ambient: number;
  grouped: number;
  safety: number;
}

export const DEFAULT_CABLE: CableInput = {
  system: 'dc',
  mode: 'current',
  current: 10,
  power: 5000,
  voltage: 400,
  length: 25,
  drop: 1,
  pf: 1,
  material: 'cu',
  install: 'pv',
  ambient: 30,
  grouped: 1,
  safety: 1.25,
};

/** IEC 60364-5-52 Annex G: resistivity in normal service = 1.25 × ρ at 20 °C, Ω·mm²/m. */
export const RHO: Record<Material, number> = { cu: 0.0225, al: 0.036 };
/** IEC 60364-5-52 Annex G: reactance per unit length when no other data is available, Ω/m. */
export const LAMBDA = 0.08e-3;
/** Aluminium capacity relative to copper (IEC 60364-5-52 Annex B tables, ≈ 0.78 across sizes). */
const AL_FACTOR = 0.78;
/** IEC 60364-5-52 Table 52.2: smallest aluminium conductor for power circuits. */
export const AL_MIN_SIZE = 16;

const NA = Number.NaN; // size not covered by the standard table

interface Table {
  tmax: number; // max conductor temperature, °C
  tref: number; // table reference ambient, °C
  maxFactor: number; // highest allowed temperature factor (below the reference ambient)
  two: number[];
  three: number[];
  grouping: [number, number][];
  copperOnly?: boolean;
}

// Bunched in air, on a surface, embedded or enclosed — IEC 60364-5-52 Table B.52.17, item 1.
const GROUP_BUNCHED: [number, number][] = [[1, 1], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [7, 0.54], [8, 0.52], [9, 0.5], [12, 0.45], [16, 0.41], [20, 0.38]];
// Multicore cables in single-way ducts in the ground, ducts touching — IEC 60364-5-52 Table B.52.19.
const GROUP_DUCTS: [number, number][] = [[1, 1], [2, 0.85], [3, 0.75], [4, 0.7], [5, 0.65], [6, 0.6], [7, 0.57], [8, 0.54], [9, 0.52], [12, 0.47], [16, 0.43], [20, 0.4]];

export const TABLES: Record<Install, Table> = {
  // EN 50618 Table A.3: single cable in free air, ambient 60 °C, conductor 120 °C. Sizes 1.5–240 mm².
  // Table A.4 gives no increase below 60 °C, so the factor is capped at 1.00.
  pv: {
    tmax: 120, tref: 60, maxFactor: 1,
    two: [30, 41, 55, 70, 98, 132, 176, 218, 276, 347, 416, 488, 566, 644, 775, NA],
    three: [30, 41, 55, 70, 98, 132, 176, 218, 276, 347, 416, 488, 566, 644, 775, NA],
    grouping: GROUP_BUNCHED,
    copperOnly: true,
  },
  // Method B2: multicore cable in conduit on a wall (PVC, ambient 30 °C).
  conduit: {
    tmax: 70, tref: 30, maxFactor: 1.22,
    two: [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232, 258, 294, 344, 394],
    three: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206, 225, 255, 297, 339],
    grouping: GROUP_BUNCHED,
  },
  // Method E: multicore cable in free air or on perforated tray (PVC, ambient 30 °C).
  tray: {
    tmax: 70, tref: 30, maxFactor: 1.22,
    two: [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514, 593],
    three: [18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430, 497],
    grouping: GROUP_BUNCHED,
  },
  // Method D1: multicore cable in a duct in the ground (PVC, ground 20 °C, 2.5 K·m/W).
  buried: {
    tmax: 70, tref: 20, maxFactor: 1.1,
    two: [22, 29, 37, 46, 60, 78, 99, 119, 140, 173, 204, 231, 261, 292, 336, 379],
    three: [18, 24, 30, 38, 50, 64, 82, 98, 116, 143, 169, 192, 217, 243, 280, 316],
    grouping: GROUP_DUCTS,
  },
};

export function groupingFactor(n: number, install: Install = 'conduit') {
  let f = 1;
  for (const [count, k] of TABLES[install].grouping) if (n >= count) f = k;
  return f;
}

/** Temperature correction: √((θmax − θ) / (θmax − θref)), the formula behind Tables B.52.14/15 and EN 50618 A.4. */
export function tempFactor(install: Install, ambient: number) {
  const { tmax, tref, maxFactor } = TABLES[install];
  if (ambient >= tmax) return 0;
  return Math.min(maxFactor, Math.sqrt((tmax - ambient) / (tmax - tref)));
}

export interface CableRow {
  size: number;
  /** Derated current-carrying capacity Iz (A); NaN when the size is outside the standard. */
  iz: number;
  vdrop: number;
  vdropPct: number;
  lossW: number;
  okDrop: boolean;
  okAmp: boolean;
  available: boolean;
}

export interface CableResult {
  I: number;
  Ib: number;
  minAreaDrop: number; // Infinity when no area can meet the limit (reactance alone exceeds it)
  dVmax: number;
  derate: number;
  rows: CableRow[];
  pick: CableRow | null;
  governing: 'voltage drop' | 'current capacity' | 'both' | null;
  materialNotAllowed: boolean;
}

export function sizeCable(p: CableInput): CableResult {
  const pf = p.system === 'dc' ? 1 : Math.max(0.1, Math.min(1, p.pf));
  const sinPhi = Math.sqrt(1 - pf * pf);
  const V = p.voltage;
  let I = p.current;
  if (p.mode === 'power') I = p.system === 'ac3' ? p.power / (Math.sqrt(3) * V * pf) : p.power / (V * pf);

  const rho = RHO[p.material];
  const L = p.length;
  const dVmax = (V * p.drop) / 100;

  // Annex G: u = b·(ρ1·L/S·cosφ + λ·L·sinφ)·Ib, b = 2 single-phase / DC, b = 1 three-phase (phase-to-neutral).
  // For three-phase the line-to-line drop is √3·u, so the factor on the line-to-line voltage is √3.
  const b = p.system === 'ac3' ? Math.sqrt(3) : 2;
  const xTerm = p.system === 'dc' ? 0 : LAMBDA * L * sinPhi; // reactance part (AC only)
  const dropAt = (S: number) => b * ((rho * L * pf) / S + xTerm) * I;
  const allowedR = dVmax / (b * I) - xTerm;
  const minAreaDrop = allowedR > 0 ? (rho * L * pf) / allowedR : Infinity;

  const Ib = I * p.safety;
  const table = TABLES[p.install];
  const col = p.system === 'ac3' ? table.three : table.two;
  const materialNotAllowed = p.material === 'al' && !!table.copperOnly;
  const derate =
    tempFactor(p.install, p.ambient) * groupingFactor(p.grouped, p.install) * (p.material === 'al' ? AL_FACTOR : 1);

  const rows: CableRow[] = SIZES.map((S, i) => {
    const available = !materialNotAllowed && Number.isFinite(col[i]) && !(p.material === 'al' && S < AL_MIN_SIZE);
    const iz = available ? col[i] * derate : NA;
    const vdrop = dropAt(S);
    return {
      size: S,
      iz,
      vdrop,
      vdropPct: (vdrop / V) * 100,
      lossW: ((p.system === 'ac3' ? 3 : 2) * I * I * L * rho) / S,
      okDrop: vdrop <= dVmax + 1e-9,
      okAmp: available && iz >= Ib,
      available,
    };
  });

  const usable = rows.filter((r) => r.available);
  const pick = usable.find((r) => r.okDrop && r.okAmp) ?? null;
  const byDrop = usable.find((r) => r.okDrop);
  const byAmp = usable.find((r) => r.okAmp);
  let governing: CableResult['governing'] = null;
  if (pick) governing = byDrop?.size === byAmp?.size ? 'both' : pick === byDrop ? 'voltage drop' : 'current capacity';

  return { I, Ib, minAreaDrop, dVmax, derate, rows, pick, governing, materialNotAllowed };
}
