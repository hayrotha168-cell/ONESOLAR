'use client';
// Full-screen map to choose the site: search a place, tap or drag the pin, or jump to the phone's location.
// Leaflet + OpenStreetMap (street) and Esri World Imagery (satellite): free, no API key.
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useT } from '@/lib/i18n';

interface Props {
  lat: number;
  lon: number;
  /** Zoom in close (the site is already known) or show the whole region. */
  close: boolean;
  onPick: (lat: number, lon: number) => void;
  onClose: () => void;
}

interface Place { display_name: string; lat: string; lon: string }

const STREET = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attr: '© OpenStreetMap contributors' };
const SAT = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  max: 19,
  attr: 'Imagery © Esri, Maxar, Earthstar Geographics',
};
const round5 = (v: number) => +v.toFixed(5);

export function MapPicker({ lat, lon, close, onPick, onClose }: Props) {
  const { t, lang } = useT();
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pin = useRef<Leaflet.Marker | null>(null);
  const layer = useRef<Leaflet.TileLayer | null>(null);
  const [pos, setPos] = useState({ lat: round5(lat), lon: round5(lon) });
  const [sat, setSat] = useState(true);
  const [place, setPlace] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [msg, setMsg] = useState('');
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let dead = false;
    import('leaflet').then((mod) => {
      if (dead || !box.current) return;
      const lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as typeof Leaflet);
      L.current = lf;
      const m = lf.map(box.current, { zoomControl: false, attributionControl: true }).setView([lat, lon], close ? 17 : 6);
      lf.control.zoom({ position: 'bottomright' }).addTo(m);
      const icon = lf.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [30, 42], iconAnchor: [15, 42] });
      const mk = lf.marker([lat, lon], { draggable: true, icon, autoPan: true }).addTo(m);
      mk.on('dragend', () => { const p = mk.getLatLng(); setPos({ lat: round5(p.lat), lon: round5(p.lng) }); });
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        mk.setLatLng(e.latlng);
        setPos({ lat: round5(e.latlng.lat), lon: round5(e.latlng.lng) });
      });
      map.current = m;
      pin.current = mk;
      setReady(true);
      setTimeout(() => m.invalidateSize(), 50);
    });
    return () => { dead = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Street / satellite tiles.
  useEffect(() => {
    const lf = L.current, m = map.current;
    if (!lf || !m) return;
    layer.current?.remove();
    const src = sat ? SAT : STREET;
    layer.current = lf.tileLayer(src.url, { maxZoom: src.max, attribution: src.attr }).addTo(m);
  }, [sat, ready]);

  // Name of the place under the pin (debounced; OpenStreetMap Nominatim allows about one request per second).
  useEffect(() => {
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${pos.lat}&lon=${pos.lon}&accept-language=${lang}`,
          { signal: ctl.signal },
        );
        const j = await r.json();
        setPlace(j?.display_name ?? '');
      } catch {}
    }, 700);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [pos.lat, pos.lon, lang]);

  // Close on the Back key / Escape.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  const moveTo = (la: number, lo: number, zoom = 17) => {
    map.current?.setView([la, lo], zoom);
    pin.current?.setLatLng([la, lo]);
    setPos({ lat: round5(la), lon: round5(lo) });
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    // Pasted coordinates, e.g. "11.5564, 104.9282" from Google Maps.
    const c = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (c && Math.abs(+c[1]) <= 90 && Math.abs(+c[2]) <= 180) { moveTo(+c[1], +c[2]); setResults(null); return; }
    setMsg(t.mapSearching);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(text)}&accept-language=${lang}`,
      );
      const list: Place[] = await r.json();
      setResults(list);
      setMsg(list.length ? '' : t.mapNoResults);
    } catch {
      setMsg(t.mapSearchErr);
    }
  };

  const myLocation = () => {
    if (!navigator.geolocation) { setMsg(t.locNA); return; }
    setMsg(t.locFinding);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        moveTo(p.coords.latitude, p.coords.longitude, 18);
        setMsg(t.locSet(Math.round(p.coords.accuracy)));
      },
      (err) => setMsg(t.locErr(err.message)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="map-modal" role="dialog" aria-modal="true" aria-label={t.pickOnMap}>
      <form className="map-search" onSubmit={search}>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t.mapCancel}>✕</button>
        <input type="search" enterKeyHint="search" placeholder={t.mapSearch} value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null); }} />
        <button className="btn btn-small" type="submit">🔍</button>
      </form>
      {results && results.length > 0 && (
        <ul className="map-results">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => { moveTo(+r.lat, +r.lon); setResults(null); setQ(r.display_name); }}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="map-box" ref={box} />

      <div className="map-tools">
        <button type="button" className="map-fab" onClick={myLocation} aria-label={t.locate} title={t.locate}>◎</button>
        <button type="button" className="map-fab map-layer" onClick={() => setSat((s) => !s)}>
          {sat ? t.mapStreet : t.mapSatellite}
        </button>
      </div>

      <div className="map-sheet">
        {msg && <p className="small muted" style={{ margin: '0 0 6px' }}>{msg}</p>}
        <p className="small muted" style={{ margin: 0 }}>{t.mapHint}</p>
        <p className="map-place">{place || '…'}</p>
        <p className="small" style={{ margin: '2px 0 10px' }}>{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</p>
        <div className="row" style={{ margin: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t.mapCancel}</button>
          <button type="button" className="btn" onClick={() => onPick(pos.lat, pos.lon)}>{t.mapUse}</button>
        </div>
      </div>
    </div>
  );
}

export default MapPicker;
