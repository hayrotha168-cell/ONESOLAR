// Hand-checked cases for the cable calculator. Run: `node scripts/check-cable.mts`
// Expected values are worked out by hand from IEC 60364-5-52 (Annex B tables, Annex G) and EN 50618.
import { DEFAULT_CABLE, groupingFactor, sizeCable, tempFactor } from '../src/lib/cable.ts';
import type { CableInput } from '../src/lib/cable.ts';

let failed = 0;
const near = (name: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${+got.toFixed(4)}, expected ${want}`);
};
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${String(got)}, expected ${String(want)}`);
};
const run = (o: Partial<CableInput>) => sizeCable({ ...DEFAULT_CABLE, ...o });

// --- Temperature factors vs printed tables (rounded to 2 decimals in the standard) ---
near('B.52.14 air 40 °C (0.87)', tempFactor('conduit', 40), 0.87, 0.005);
near('B.52.14 air 50 °C (0.71)', tempFactor('conduit', 50), 0.71, 0.005);
near('B.52.14 air 60 °C (0.50)', tempFactor('tray', 60), 0.5, 0.005);
near('B.52.14 air 10 °C (1.22)', tempFactor('tray', 10), 1.22, 0.005);
near('B.52.15 ground 30 °C (0.89)', tempFactor('buried', 30), 0.89, 0.005);
near('B.52.15 ground 10 °C (1.10)', tempFactor('buried', 10), 1.1, 0.005);
near('EN 50618 A.4 PV 30 °C (1.00, no uprating below 60 °C)', tempFactor('pv', 30), 1.0, 0.001);
near('EN 50618 A.4 PV 70 °C (0.91)', tempFactor('pv', 70), 0.91, 0.005);
near('EN 50618 A.4 PV 90 °C (0.71)', tempFactor('pv', 90), 0.71, 0.005);

// --- Grouping ---
near('B.52.17 bunched, 3 circuits (0.70)', groupingFactor(3, 'conduit'), 0.7, 0.001);
near('B.52.17 bunched, 6 circuits (0.57)', groupingFactor(6, 'tray'), 0.57, 0.001);
near('B.52.19 ducts in ground, 3 circuits (0.75)', groupingFactor(3, 'buried'), 0.75, 0.001);

// --- Case 1: PV string, DC 400 V, 10 A, 25 m, 1 %, 30 °C, ×1.25 ---
// Min area = 2·25·10·0.0225 / 4 V = 2.8125 mm². 2.5 mm² gives 4.5 V (> 4 V) → 4 mm² (2.81 V, 0.70 %).
// Iz(4 mm²) = 55 A × 1.00 ≥ Ib = 12.5 A.
{
  const r = run({});
  near('Case 1 min area for drop', r.minAreaDrop, 2.8125, 0.0001);
  eq('Case 1 picked size', r.pick?.size, 4);
  near('Case 1 voltage drop V', r.pick!.vdrop, 2.8125, 0.0001);
  near('Case 1 capacity A (not uprated)', r.pick!.iz, 55, 0.001);
  eq('Case 1 governed by', r.governing, 'voltage drop');
}

// --- Case 2: three-phase 400 V, 50 A, 50 m, cos φ 0.85, 3 %, tray (method E, 3 loaded), 30 °C ---
// Annex G phase drop for 10 mm²: (0.0225·50·0.85/10 + 0.00008·50·0.5268)·50 = 4.885 V → 4.885/230.9 = 2.12 %.
// 6 mm²: 8.07 V → 3.50 % (too high). Iz(10 mm², E, 3 loaded) = 60 A ≥ 50 A; 6 mm² = 43 A (too low).
{
  const r = run({ system: 'ac3', current: 50, length: 50, pf: 0.85, drop: 3, install: 'tray', safety: 1 });
  eq('Case 2 picked size', r.pick?.size, 10);
  near('Case 2 drop % at 10 mm²', r.pick!.vdropPct, 2.12, 0.01);
  near('Case 2 drop % at 6 mm²', r.rows.find((x) => x.size === 6)!.vdropPct, 3.5, 0.01);
  eq('Case 2 governed by', r.governing, 'both');
}

// --- Case 3: single-phase 230 V from power: 2300 W, cos φ 1 → 10 A. Conduit B2, 2 loaded, 40 °C, 3 circuits ---
// Derate = 0.866 × 0.70 = 0.606. 1.5 mm²: 16.5 × 0.606 = 10.0 A ≥ 10 A.
// Drop 1.5 mm², 20 m: 2·0.0225·20·10/1.5 = 6.0 V = 2.61 % (≤ 3 %).
{
  const r = run({ system: 'ac1', mode: 'power', power: 2300, voltage: 230, pf: 1, length: 20, drop: 3, install: 'conduit', ambient: 40, grouped: 3, safety: 1 });
  near('Case 3 current from power', r.I, 10, 1e-9);
  near('Case 3 derate factor', r.derate, 0.606, 0.001);
  eq('Case 3 picked size', r.pick?.size, 1.5);
  near('Case 3 drop %', r.pick!.vdropPct, 2.61, 0.01);
}

// --- Case 4: three-phase, B2 conduit uses the 3-loaded column (15 / 20 / 27 A …) ---
{
  const r = run({ system: 'ac3', current: 26, length: 5, drop: 5, install: 'conduit', safety: 1 });
  eq('Case 4 picks 4 mm² (27 A ≥ 26 A; 2.5 mm² = 20 A)', r.pick?.size, 4);
}

// --- Case 5: aluminium below 16 mm² is not offered (IEC 60364-5-52 Table 52.2) ---
{
  const r = run({ system: 'ac1', current: 20, voltage: 230, length: 5, drop: 5, material: 'al', install: 'conduit', safety: 1 });
  eq('Case 5 smallest aluminium size', r.pick?.size, 16);
}

// --- Case 6: PV cable is copper only, and 300 mm² is outside EN 50618 ---
{
  eq('Case 6 aluminium PV rejected', run({ material: 'al' }).pick, null);
  eq('Case 6 300 mm² PV unavailable', run({}).rows.at(-1)!.available, false);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
