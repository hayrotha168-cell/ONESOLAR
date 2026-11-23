// Checks toOrientation() against poses worked out by hand from the W3C DeviceOrientation spec
// (alpha counter-clockwise from north seen from above, so compass heading = 360 − alpha when flat).
// Run: node scripts/check-orientation.mts
import { toOrientation } from '../src/lib/orientation.ts';

let fail = 0;
const near = (a: number | null, b: number, tol = 0.5) => a != null && Math.abs(((a - b + 540) % 360) - 180) <= tol;
function check(name: string, got: number | null, want: number) {
  const ok = near(got, want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got == null ? 'null' : got.toFixed(1)}, want ${want}`);
}

// Flat on a table, screen up, top edge pointing at the compass direction (what a compass app shows).
for (const h of [0, 45, 90, 91, 180, 270]) {
  check(`flat, top edge to ${h}° → compass`, toOrientation(360 - h, 0, 0, true).compass, h);
}
// Flat but tipped slightly toward the user (top edge lower than bottom): must not flip.
check('flat, top tipped down 10°, facing E → compass', toOrientation(270, -10, 0, true).compass, 90);
check('flat, top tipped up 20°, facing E → compass', toOrientation(270, 20, 0, true).compass, 90);
check('flat, rolled 15°, facing E → compass', toOrientation(270, 5, 15, true).compass, 90);
// Upright in portrait, back camera looking at the horizon.
for (const h of [0, 90, 180, 270]) {
  const o = toOrientation(360 - h, 90, 0, true);
  check(`upright, camera to ${h}° → heading`, o.heading, h);
  check(`upright, camera to ${h}° → compass`, o.compass, h);
}
// Upright, camera raised 30° above the horizon, facing E.
const up = toOrientation(270, 120, 0, true);
check('camera 30° up, facing E → heading', up.heading, 90);
check('camera 30° up → elevation', up.elevation, 30);
// Half-raised (45°) facing S: top edge and camera agree.
check('raised 45°, facing S → compass', toOrientation(180, 45, 0, true).compass, 180);
check('raised 70°, facing S → compass', toOrientation(180, 70, 0, true).compass, 180);
// iOS path: alpha rebuilt as 360 − webkitCompassHeading.
check('iOS heading 91 → compass', toOrientation(360 - 91, 0, 0, true).compass, 91);

console.log(fail ? `\n${fail} check(s) failed` : '\nAll orientation checks passed');
process.exit(fail ? 1 : 0);
