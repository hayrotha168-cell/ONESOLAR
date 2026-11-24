// Google Maps links without an API key: read coordinates from a shared link, and open a place in Google Maps.

export interface LatLon { lat: number; lon: number }

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const ok = (lat: number, lon: number): LatLon | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

/** "11.5564, 104.9282" or "11.5564 104.9282". */
export function parseCoords(text: string): LatLon | null {
  const m = text.trim().match(new RegExp(`^${NUM}\\s*[,\\s]\\s*${NUM}$`));
  return m ? ok(+m[1], +m[2]) : null;
}

const isGoogleHost = (h: string) => /(^|\.)google\.[a-z.]+$/i.test(h) || /(^|\.)goo\.gl$/i.test(h);

/** Is this text a Google Maps link? */
export function isGoogleMapsLink(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return isGoogleHost(u.hostname) && (u.hostname.startsWith('maps.') || u.pathname.startsWith('/maps') || u.hostname === 'goo.gl');
  } catch {
    return false;
  }
}

/** Short share links (maps.app.goo.gl/…, goo.gl/maps/…) must be followed to see the coordinates. */
export function isShortGoogleLink(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps'));
  } catch {
    return false;
  }
}

/** Coordinates in a full Google Maps link, most exact first: the pin (!3d!4d), q=/query=/ll=, /place/lat,lon, then the view centre (@lat,lon). */
export function coordsFromGoogleLink(link: string): LatLon | null {
  let s = link.trim();
  try { s = decodeURIComponent(s); } catch {}
  const tries = [
    new RegExp(`!3d${NUM}!4d${NUM}`),
    new RegExp(`[?&](?:q|query|ll|destination|center)=(?:loc:)?${NUM}\\s*,\\s*\\+?${NUM}`),
    new RegExp(`/(?:place|search|dir)/${NUM}\\s*,\\s*\\+?${NUM}`),
    new RegExp(`@${NUM},${NUM}`),
  ];
  for (const re of tries) {
    const m = s.match(re);
    const p = m && ok(+m[1], +m[2]);
    if (p) return p;
  }
  return null;
}

/** A place name in a Google Maps link without coordinates (…/place/Name/… or ?q=Name), to look up instead. */
export function placeFromGoogleLink(link: string): string | null {
  try {
    const u = new URL(link.trim());
    const q = u.searchParams.get('q') ?? u.searchParams.get('query');
    if (q) return q;
    const m = u.pathname.match(/\/(?:place|search)\/([^/]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  } catch {
    return null;
  }
}

/** Open this point in Google Maps (app on phones, website elsewhere). */
export const googleMapsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
