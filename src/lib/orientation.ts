// Device orientation → earth-frame directions, shared by the shade survey and the 3D compass mode.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface Orientation {
  heading: number | null; // where the back camera points, ° from north (null = no absolute compass)
  elevation: number; // back camera elevation, °
  roofTilt: number; // angle of the screen plane from horizontal, °
  roofFacing: number | null; // direction the surface under the phone faces, °
  /** Compass heading of the phone's top edge — what a compass app shows. */
  compass: number | null;
}

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * Converts W3C device orientation (alpha, beta, gamma; Z-X'-Y'' intrinsic) into
 * earth-frame directions. Earth frame: x = east, y = north, z = up.
 */
export function toOrientation(alpha: number | null, beta: number, gamma: number, absolute: boolean): Orientation {
  const a = rad(alpha ?? 0), b = rad(beta), g = rad(gamma);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // Device +Z axis (out of the screen) in earth frame = third column of Rz(a)·Rx(b)·Ry(g).
  const zx = ca * sg + sa * sb * cg;
  const zy = sa * sg - ca * sb * cg;
  const zz = cb * cg;
  // Device +Y axis (top edge) = second column.
  const yx = -sa * cb;
  const yy = ca * cb;

  // The back camera looks along −Z.
  const heading = absolute ? mod(deg(Math.atan2(-zx, -zy)), 360) : null;
  const elevation = deg(Math.asin(Math.max(-1, Math.min(1, -zz))));
  const roofTilt = deg(Math.acos(Math.max(-1, Math.min(1, Math.abs(zz)))));
  const roofFacing = absolute && roofTilt > 2 ? mod(deg(Math.atan2(zx, zy)) + (zz < 0 ? 180 : 0), 360) : null;

  // Compass: top edge when the phone is held flat, back camera once it is held upright.
  let compass: number | null = null;
  if (absolute) compass = Math.abs(zz) > 0.5 ? mod(deg(Math.atan2(yx, yy)), 360) : heading;
  return { heading, elevation, roofTilt, roofFacing, compass };
}

export type StartResult = { ok: true; stop: () => void } | { ok: false; error: 'none' | 'denied' | string };

/**
 * Starts listening to orientation events. Must be called from a user gesture (iOS asks for permission).
 * Prefers absolute (true-north) readings when the browser provides them.
 */
export async function startOrientation(onChange: (o: Orientation) => void): Promise<StartResult> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return { ok: false, error: 'none' };
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') {
      return { ok: false, error: 'denied' };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  let gotAbsolute = false;
  const handle = (e: Event) => {
    const ev = e as OrientationEventWithCompass;
    if (ev.beta == null || ev.gamma == null) return;
    if (typeof ev.webkitCompassHeading === 'number') {
      // iOS: alpha is relative; rebuild an absolute alpha from the compass heading.
      onChange(toOrientation(360 - ev.webkitCompassHeading, ev.beta, ev.gamma, true));
    } else if (e.type === 'deviceorientationabsolute' || ev.absolute) {
      gotAbsolute = true;
      onChange(toOrientation(ev.alpha, ev.beta, ev.gamma, true));
    } else if (!gotAbsolute) {
      onChange(toOrientation(ev.alpha, ev.beta, ev.gamma, false));
    }
  };
  window.addEventListener('deviceorientationabsolute', handle);
  window.addEventListener('deviceorientation', handle);
  return {
    ok: true,
    stop: () => {
      window.removeEventListener('deviceorientationabsolute', handle);
      window.removeEventListener('deviceorientation', handle);
    },
  };
}
