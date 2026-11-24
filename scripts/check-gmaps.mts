// Checks reading Google Maps links and the Worker's short-link follower (network is faked).
// Run: node scripts/check-gmaps.mts
import {
  coordsFromGoogleLink, isGoogleMapsLink, isShortGoogleLink, parseCoords, placeFromGoogleLink,
} from '../src/lib/gmaps.ts';
import worker from '../worker/index.ts';

let fail = 0;
const ok = (name: string, cond: boolean) => { if (!cond) fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const near = (p: { lat: number; lon: number } | null, lat: number, lon: number) =>
  !!p && Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6;

ok('plain coordinates', near(parseCoords('11.5564, 104.9282'), 11.5564, 104.9282));
ok('coordinates with space only', near(parseCoords('-33.8688 151.2093'), -33.8688, 151.2093));
ok('out of range rejected', parseCoords('95, 200') === null);
ok('text is not coordinates', parseCoords('Phnom Penh') === null);

const place = 'https://www.google.com/maps/place/Royal+Palace/@11.5640,104.9300,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d11.5636!4d104.9312';
ok('pin (!3d!4d) wins over view centre', near(coordsFromGoogleLink(place), 11.5636, 104.9312));
ok('view centre @lat,lon', near(coordsFromGoogleLink('https://www.google.com/maps/@13.3622,103.8597,15z'), 13.3622, 103.8597));
ok('q=lat,lon', near(coordsFromGoogleLink('https://maps.google.com/?q=12.5657,104.991'), 12.5657, 104.991));
ok('api=1 query', near(coordsFromGoogleLink('https://www.google.com/maps/search/?api=1&query=10.6104,103.5296'), 10.6104, 103.5296));
ok('/search/lat,+lon', near(coordsFromGoogleLink('https://www.google.com/maps/search/11.55,+104.92?entry=tts'), 11.55, 104.92));
ok('no coordinates → null', coordsFromGoogleLink('https://www.google.com/maps/place/Central+Market') === null);
ok('place name from link', placeFromGoogleLink('https://www.google.com/maps/place/Central+Market/data=x') === 'Central Market');
ok('is Google Maps link', isGoogleMapsLink(place) && isGoogleMapsLink('https://maps.app.goo.gl/abc') && !isGoogleMapsLink('https://example.com/maps'));
ok('short link detected', isShortGoogleLink('https://maps.app.goo.gl/AbC123') && !isShortGoogleLink(place));

// Worker: follows Google redirects only.
const env = { ASSETS: { fetch: async () => new Response('asset') } } as never;
const seen: string[] = [];
globalThis.fetch = (async (u: string) => {
  seen.push(u);
  if (u.startsWith('https://maps.app.goo.gl/')) return new Response(null, { status: 302, headers: { location: place } });
  return new Response('page', { status: 200 });
}) as typeof fetch;
const resolve = async (u: string) => {
  const r = await worker.fetch(new Request(`https://onesolar.test/api/maplink?u=${encodeURIComponent(u)}`), env);
  return { status: r.status, body: (await r.json()) as { url?: string } };
};
const short = await resolve('https://maps.app.goo.gl/AbC123');
ok('short link resolves to the full link', short.status === 200 && short.body.url === place);
ok('only one request for a one-hop link', seen.length === 1);
seen.length = 0;
ok('other sites refused', (await resolve('https://example.com/x')).status === 400 && seen.length === 0);
ok('internal addresses refused', (await resolve('http://169.254.169.254/')).status === 400 && seen.length === 0);

globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })) as typeof fetch;
const evil = await resolve('https://maps.app.goo.gl/x');
ok('redirect to a non-Google site is not followed', evil.body.url === 'https://maps.app.goo.gl/x');

if (fail) { console.log(`\n${fail} Google Maps check(s) failed`); process.exit(1); }
console.log('\nAll Google Maps link checks passed');
