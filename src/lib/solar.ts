// Solar geometry (NOAA solar position algorithm), clear-sky irradiance and horizon shading.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface SunPos {
  azimuth: number; // degrees clockwise from true north
  elevation: number; // degrees above horizon, refraction corrected
}

export interface Site {
  lat: number;
  lon: number;
  tz: number; // UTC offset in hours
}

export interface HorizonPoint {
  az: number;
  el: number;
}

export function sunPosition(time: Date, lat: number, lon: number): SunPos {
  const jd = time.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;

  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));

  const y = Math.tan(rad(eps / 2)) ** 2;
  const eot =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M)),
    );

  const utcMin = time.getUTCHours() * 60 + time.getUTCMinutes() + time.getUTCSeconds() / 60;
  const tst = mod(utcMin + eot + 4 * lon, 1440);
  const ha = rad(tst / 4 - 180);
  const phi = rad(lat);

  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  const az = mod(deg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi))) + 180, 360);

  const el = 90 - deg(zenith);
  return { azimuth: az, elevation: el + refraction(el) };
}

function refraction(el: number) {
  if (el > 85) return 0;
  const te = Math.tan(rad(el));
  let r: number;
  if (el > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (el > -0.575) r = 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)));
  else r = -20.774 / te;
  return r / 3600;
}

/** UTC instant for a local wall-clock minute of the given yyyy-mm-dd date at a fixed UTC offset. */
export function localTime(date: string, minutes: number, tz: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (minutes - tz * 60) * 60000);
}

export function fmtMinutes(min: number | null) {
  if (min == null || !Number.isFinite(min)) return '–';
  const m = Math.round(mod(min, 1440));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface DaySummary {
  sunrise: number | null; // local minutes
  sunset: number | null;
  noon: number;
  maxElevation: number;
  dayLength: number; // minutes
  path: { min: number; pos: SunPos }[]; // every `step` minutes
}

export function daySummary(site: Site, date: string, step = 5): DaySummary {
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let maxEl = -90;
  let noon = 720;
  let prev = sunPosition(localTime(date, 0, site.tz), site.lat, site.lon).elevation;
  let dayLength = 0;
  const path: DaySummary['path'] = [];
  for (let min = 0; min <= 1440; min++) {
    const pos = sunPosition(localTime(date, min, site.tz), site.lat, site.lon);
    if (min % step === 0) path.push({ min, pos });
    const el = pos.elevation;
    if (prev < -0.833 && el >= -0.833 && sunrise == null) sunrise = min;
    if (prev >= -0.833 && el < -0.833) sunset = min;
    if (el > -0.833) dayLength++;
    if (el > maxEl) { maxEl = el; noon = min; }
    prev = el;
  }
  return { sunrise, sunset, noon, maxElevation: maxEl, dayLength: Math.min(1440, dayLength), path };
}

/** Rule-of-thumb fixed tilt for max annual yield (Jacobson & Jadhav 2018 fit). */
export function recommendedTilt(lat: number) {
  const a = Math.abs(lat);
  return Math.round(Math.max(0, Math.min(60, a <= 25 ? a * 0.87 : a * 0.76 + 3.1)));
}
export function recommendedAzimuth(lat: number) {
  return lat >= 0 ? 180 : 0;
}

/** Horizon height (deg) at an azimuth, by linear interpolation between surveyed points (wraps at 360). */
export function horizonAt(points: HorizonPoint[], az: number) {
  if (points.length === 0) return 0;
  if (points.length === 1) return Math.abs(mod(points[0].az - az + 180, 360) - 180) < 5 ? points[0].el : 0;
  const pts = [...points].sort((a, b) => a.az - b.az);
  const a = mod(az, 360);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const start = p.az;
    const span = mod(q.az - p.az, 360) || 360;
    const off = mod(a - start, 360);
    if (off <= span) {
      // Only fill gaps shorter than 60° — a lone tree should not shade half the sky.
      if (span > 60) {
        if (off < 3) return p.el;
        if (span - off < 3) return q.el;
        return 0;
      }
      return p.el + ((q.el - p.el) * off) / span;
    }
  }
  return 0;
}

/** Clear-sky irradiance on a tilted plane (W/m²). Meinel beam model + isotropic diffuse/ground. */
export function planeIrradiance(sun: SunPos, tilt: number, azimuth: number, shaded = false) {
  if (sun.elevation <= 0) return { poa: 0, beam: 0, diffuse: 0 };
  const zen = 90 - sun.elevation;
  const am = 1 / (Math.cos(rad(zen)) + 0.50572 * (96.07995 - zen) ** -1.6364);
  const dni = 1353 * 0.7 ** (am ** 0.678);
  const dhi = 0.1 * dni;
  const ghi = dni * Math.sin(rad(sun.elevation)) + dhi;
  const cosInc =
    Math.sin(rad(sun.elevation)) * Math.cos(rad(tilt)) +
    Math.cos(rad(sun.elevation)) * Math.sin(rad(tilt)) * Math.cos(rad(sun.azimuth - azimuth));
  const beam = shaded ? 0 : dni * Math.max(0, cosInc);
  const diffuse = dhi * (1 + Math.cos(rad(tilt))) / 2 + ghi * 0.2 * (1 - Math.cos(rad(tilt))) / 2;
  return { poa: beam + diffuse, beam, diffuse };
}

export interface DayEnergy {
  kwhClear: number; // kWh/m²/day with no obstacles
  kwh: number; // with horizon shading
  shadedMinutes: number;
}

export function dayEnergy(site: Site, date: string, tilt: number, azimuth: number, horizon: HorizonPoint[], step = 5): DayEnergy {
  let clear = 0;
  let real = 0;
  let shadedMinutes = 0;
  for (let min = 0; min < 1440; min += step) {
    const pos = sunPosition(localTime(date, min + step / 2, site.tz), site.lat, site.lon);
    if (pos.elevation <= 0) continue;
    const blocked = pos.elevation < horizonAt(horizon, pos.azimuth);
    if (blocked) shadedMinutes += step;
    clear += planeIrradiance(pos, tilt, azimuth).poa;
    real += planeIrradiance(pos, tilt, azimuth, blocked).poa;
  }
  const h = step / 60 / 1000;
  return { kwhClear: clear * h, kwh: real * h, shadedMinutes };
}

/** Annual clear-sky estimate from the 21st of each month. */
export function yearEnergy(site: Site, year: number, tilt: number, azimuth: number, horizon: HorizonPoint[]) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const months = days.map((n, i) => {
    const d = dayEnergy(site, `${year}-${String(i + 1).padStart(2, '0')}-21`, tilt, azimuth, horizon, 10);
    return { month: i, kwhClear: d.kwhClear * n, kwh: d.kwh * n };
  });
  const clear = months.reduce((s, m) => s + m.kwhClear, 0);
  const real = months.reduce((s, m) => s + m.kwh, 0);
  return { months, kwhClear: clear, kwh: real, shadeLossPct: clear > 0 ? (1 - real / clear) * 100 : 0 };
}

/** Unit vector toward the sun in three.js world space (x = east, y = up, z = south). */
export function sunVector(pos: SunPos): [number, number, number] {
  const el = rad(pos.elevation);
  const az = rad(pos.azimuth);
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const compass = (az: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(mod(az, 360) / 45) % 8];
