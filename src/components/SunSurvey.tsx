'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HorizonPoint, Site, dayEnergy, daySummary, fmtMinutes, horizonAt, localTime, planeIrradiance,
  recommendedAzimuth, recommendedTilt, sunPosition, todayISO, yearEnergy,
} from '@/lib/solar';
import { useStored } from '@/lib/useStored';
import { useT } from '@/lib/i18n';
import { startOrientation } from '@/lib/orientation';
import { useAuth } from '@/lib/auth';
import { Project, newId, readCable, saveProject, snapshot3D } from '@/lib/projects';
import { makeReportPdf, sharePdf } from '@/lib/report';
import { DEFAULT_PRICE, PRICE_KEY, Price, fmtMoney, monthName, productionStats } from '@/lib/energy';
import { Stat } from './Stat';
import { SensorSurvey } from './SensorSurvey';
import { NumField } from './NumField';

function SceneLoading() {
  const { t } = useT();
  return <div className="scene-loading">{t.loading3d}</div>;
}

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });
const SunScene3D = dynamic(() => import('./SunScene3D'), { ssr: false, loading: () => <SceneLoading /> });

const DEFAULT_SITE: Site = { lat: 35, lon: 0, tz: 0 };
const clampZoom = (z: number) => Math.max(0.6, Math.min(4, z)); // same limits as the 3D scene
const num = (v: number) => v.toLocaleString('en-US');

/** UTC offset for a picked place: the phone's own when the place is in about the same zone, else estimated from longitude. */
function tzFor(lon: number) {
  const phone = -new Date().getTimezoneOffset() / 60;
  return Math.abs(phone - lon / 15) <= 1.5 ? phone : Math.round(lon / 15);
}

export function SunSurvey() {
  const { t, dir, lang } = useT();
  const [site, setSite] = useStored<Site>('onesolar.site', DEFAULT_SITE);
  const [panel, setPanel] = useStored('onesolar.panel', { tilt: 30, azimuth: 180 });
  const [array, setArray] = useStored('onesolar.array', { count: 10, watt: 550, pr: 80 });
  const [horizon, setHorizon] = useStored<HorizonPoint[]>('onesolar.horizon', []);
  const [date, setDate] = useState('2026-06-21');
  const [minute, setMinute] = useState(720);
  const [playing, setPlaying] = useState(false);
  const [locMsg, setLocMsg] = useState('');

  // Compass mode: the 3D view turns with the phone.
  const headingRef = useRef<number | null>(null);
  const roseRef = useRef<HTMLDivElement>(null);
  const stopCompass = useRef<(() => void) | null>(null);
  const [follow, setFollow] = useState(false);
  const [compassMsg, setCompassMsg] = useState('');
  const starting = useRef(false);
  useEffect(() => () => stopCompass.current?.(), []);

  const endCompass = () => {
    stopCompass.current?.();
    stopCompass.current = null;
    headingRef.current = null;
    setFollow(false);
  };

  /** auto = started by default on load: fail quietly (desktop, no sensors). */
  const beginCompass = async (auto: boolean) => {
    if (starting.current || stopCompass.current) return;
    starting.current = true;
    const res = await startOrientation((o) => { headingRef.current = o.compass; });
    starting.current = false;
    if (!res.ok) {
      if (!auto) setCompassMsg(res.error === 'denied' ? t.permDenied : t.compassNA);
      return;
    }
    stopCompass.current = res.stop;
    setFollow(true);
    if (!auto) setCompassMsg(t.compassOn);
    setTimeout(() => {
      if (stopCompass.current === res.stop && headingRef.current == null) {
        endCompass();
        setCompassMsg(auto ? '' : t.compassNA);
      }
    }, 2500);
  };

  const toggleCompass = () => {
    if (!follow) beginCompass(false);
    else { endCompass(); setCompassMsg(''); }
  };

  // Compass mode always starts on. iOS asks for sensor permission, which needs a tap first.
  useEffect(() => {
    try { localStorage.removeItem('onesolar.compass'); } catch {} // older versions remembered "off"
    if (typeof DeviceOrientationEvent === 'undefined') return;
    const needsTap = typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
    if (!needsTap) { beginCompass(true); return; }
    const onTap = () => beginCompass(true);
    document.addEventListener('click', onTap, { once: true });
    return () => document.removeEventListener('click', onTap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom: buttons, mouse wheel and two-finger pinch all change one zoom factor.
  const zoomRef = useRef(1);
  const sceneRef = useRef<HTMLDivElement>(null);
  const zoomBy = (f: number) => { zoomRef.current = clampZoom(zoomRef.current * f); };
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let d0 = 0, z0 = 1;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomRef.current = clampZoom(zoomRef.current * Math.exp(-e.deltaY * 0.0015)); };
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e); z0 = zoomRef.current; } };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      zoomRef.current = clampZoom((z0 * dist(e)) / d0);
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) d0 = 0; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Save project
  const { user } = useAuth();
  const [saveOpen, setSaveOpen] = useState(false);
  const [meta, setMeta] = useState({ name: '', customer: '', phone: '', address: '', notes: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [lastSaved, setLastSaved] = useState<Project | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // First visit: guess the time zone from the device, and start on today at the current time.
  useEffect(() => {
    let hasSite = false;
    try { hasSite = localStorage.getItem('onesolar.site') != null; } catch {}
    if (!hasSite) {
      const tz = -new Date().getTimezoneOffset() / 60;
      setSite({ lat: DEFAULT_SITE.lat, lon: Math.round(tz * 15), tz });
    }
    setDate(todayISO());
    const now = new Date();
    setMinute(now.getHours() * 60 + now.getMinutes());
  }, [setSite]);

  const valid = Number.isFinite(site.lat) && Number.isFinite(site.lon) && Number.isFinite(site.tz) && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const year = valid ? Number(date.slice(0, 4)) : 2026;

  const day = useMemo(() => (valid ? daySummary(site, date) : null), [site, date, valid]);
  const summer = useMemo(() => (valid ? daySummary(site, `${year}-06-21`, 10).path.map((p) => p.pos) : []), [site, year, valid]);
  const winter = useMemo(() => (valid ? daySummary(site, `${year}-12-21`, 10).path.map((p) => p.pos) : []), [site, year, valid]);
  const hourMarks = useMemo(
    () => (day ? day.path.filter((p) => p.min % 60 === 0 && p.pos.elevation > 0).map((p) => ({ hour: p.min / 60, pos: p.pos })) : []),
    [day],
  );

  const sun = valid ? sunPosition(localTime(date, minute, site.tz), site.lat, site.lon) : { azimuth: 180, elevation: -10 };
  const shaded = sun.elevation > 0 && sun.elevation < horizonAt(horizon, sun.azimuth);
  const irr = planeIrradiance(sun, panel.tilt, panel.azimuth, shaded);

  const energy = useMemo(() => (valid ? dayEnergy(site, date, panel.tilt, panel.azimuth, horizon) : null), [site, date, panel, horizon, valid]);
  const annual = useMemo(() => (valid ? yearEnergy(site, year, panel.tilt, panel.azimuth, horizon) : null), [site, year, panel, horizon, valid]);

  // Array power: kWp × (plane irradiance / 1000 W/m²) × performance ratio.
  const kWp = (Math.max(0, array.count || 0) * Math.max(0, array.watt || 0)) / 1000;
  const pr = Math.max(0, Math.min(100, array.pr || 0)) / 100;
  const powerNowKw = (irr.poa / 1000) * kWp * pr;
  const dayKwh = energy ? energy.kwh * kWp * pr : 0;
  const yearKwh = annual ? annual.kwh * kWp * pr : 0;
  const monthKwh = annual ? annual.months.map((m) => m.kwh * kWp * pr) : [];
  const prod = productionStats(monthKwh);
  const [price] = useStored<Price>(PRICE_KEY, DEFAULT_PRICE); // set on the Settings tab
  const cost = Number.isFinite(price.value) && price.value > 0 ? price.value : 0;
  const money = (kwh: number) => fmtMoney(kwh * cost, price.currency);
  const fKw = (kw: number) => (kw < 1 ? `${Math.round(kw * 1000)} W` : `${kw.toFixed(2)} kW`);
  const hm = (min: number) => t.hm(Math.floor(min / 60), min % 60);

  // Animate through daylight hours.
  const raf = useRef(0);
  useEffect(() => {
    if (!playing || !day) return;
    const start = day.sunrise ?? 0;
    const end = day.sunset ?? 1440;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setMinute((m) => {
        const next = m + dt * 0.12; // ~2 h per second
        return next > end || next < start ? start : next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, day]);

  /** Back to defaults: site from the device time zone, today at the current time, default panels. */
  const resetInputs = () => {
    if (!confirm(t.confirmReset)) return;
    const tz = -new Date().getTimezoneOffset() / 60;
    setSite({ lat: DEFAULT_SITE.lat, lon: Math.round(tz * 15), tz });
    setPanel({ tilt: 30, azimuth: 180 });
    setArray({ count: 10, watt: 550, pr: 80 });
    setDate(todayISO());
    const now = new Date();
    setMinute(now.getHours() * 60 + now.getMinutes());
    setPlaying(false);
    setLocMsg('');
  };

  const [mapOpen, setMapOpen] = useState(false);
  const pickMap = (lat: number, lon: number) => {
    const tz = tzFor(lon);
    setSite({ lat, lon, tz });
    setMapOpen(false);
    setLocMsg(t.mapPicked(tz));
  };

  const locate = () => {
    if (!navigator.geolocation) { setLocMsg(t.locNA); return; }
    setLocMsg(t.locFinding);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setSite({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5), tz: -new Date().getTimezoneOffset() / 60 });
        setLocMsg(t.locSet(Math.round(p.coords.accuracy)));
      },
      (e) => setLocMsg(t.locErr(e.message)),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const f1 = (v: number) => v.toFixed(1);

  const doSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const proj: Project = {
      id: newId(), created: Date.now(), ...meta, name: meta.name.trim(), preparedBy: user?.name ?? '',
      site, date, panel, array, horizon, cable: readCable(), image: snapshot3D(), price,
    };
    try {
      await saveProject(proj);
      setLastSaved(proj);
      setSaveOpen(false);
      setMeta({ name: '', customer: '', phone: '', address: '', notes: '' });
      setSaveMsg(t.saved);
    } catch (err) {
      setSaveMsg(t.saveErr((err as Error).message));
    }
  };

  const shareLast = async () => {
    if (!lastSaved) return;
    setPdfBusy(true);
    setSaveMsg(t.makingPdf);
    try {
      const file = await makeReportPdf(lastSaved, t, lang, dir);
      const how = await sharePdf(file, t.reportTitle);
      setSaveMsg(how === 'downloaded' ? t.pdfSaved : t.saved);
    } catch (err) {
      setSaveMsg(t.pdfErr((err as Error).message));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <section>
      <h1>{t.sunTitle}</h1>

      <div className="card grid">
        <label>{t.lat}<NumField inputMode="decimal" step="any" min={-90} max={90} value={site.lat} onValue={(v) => setSite((s) => ({ ...s, lat: v }))} /></label>
        <label>{t.lon}<NumField inputMode="decimal" step="any" min={-180} max={180} value={site.lon} onValue={(v) => setSite((s) => ({ ...s, lon: v }))} /></label>
        <label>{t.date}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t.tz}<NumField inputMode="decimal" step={0.5} min={-12} max={14} value={site.tz} onValue={(v) => setSite((s) => ({ ...s, tz: v }))} /></label>
        <button className="btn" type="button" onClick={() => setMapOpen(true)}>🗺️ {t.pickOnMap}</button>
        <button className="btn btn-ghost" type="button" onClick={locate}>📍 {t.locate}</button>
        <button className="btn btn-ghost full" type="button" onClick={resetInputs}>↺ {t.resetInputs}</button>
        {locMsg && <p className="small muted full" style={{ margin: 0 }}>{locMsg}</p>}
      </div>
      {mapOpen && (
        <MapPicker lat={site.lat} lon={site.lon} close={site.lon !== Math.round(site.tz * 15) || site.lat !== DEFAULT_SITE.lat}
          onPick={pickMap} onClose={() => setMapOpen(false)} />
      )}

      <div className="card grid">
        <h2 className="full">{t.orientation}</h2>
        <label>{t.tilt}
          <NumField inputMode="decimal" step={1} min={0} max={90} value={panel.tilt}
            onValue={(v) => setPanel((p) => ({ ...p, tilt: v }))} />
        </label>
        <label>{t.azimuthN}
          <NumField inputMode="decimal" step={1} wrap={360} value={panel.azimuth}
            onValue={(v) => setPanel((p) => ({ ...p, azimuth: v }))} />
        </label>
        <button className="btn btn-ghost full" type="button"
          onClick={() => setPanel({ tilt: recommendedTilt(site.lat), azimuth: recommendedAzimuth(site.lat) })}>
          {t.recommended(recommendedTilt(site.lat), site.lat >= 0)}
        </button>
        {energy && annual && (
          <div className="full stats stats-inline">
            <Stat k={t.sunDay} v={`${energy.kwh.toFixed(2)} kWh/m²`} />
            <Stat k={t.sunYear} v={`${Math.round(annual.kwh)} kWh/m²`} />
            <Stat k={t.shadeLoss} v={`${annual.shadeLossPct.toFixed(1)} %`} />
            <Stat k={t.shadedToday} v={hm(energy.shadedMinutes)} />
          </div>
        )}
      </div>

      <div className="card grid">
        <h2 className="full">{t.panelPower}</h2>
        <label>{t.panelCount}
          <NumField inputMode="numeric" step={1} min={0} int value={array.count} onValue={(v) => setArray((a) => ({ ...a, count: v }))} />
        </label>
        <label>{t.panelRating}
          <NumField inputMode="numeric" step={5} min={0} value={array.watt} onValue={(v) => setArray((a) => ({ ...a, watt: v }))} />
        </label>
        <label className="full">{t.pr}
          <NumField inputMode="numeric" step={1} min={0} max={100} value={array.pr} onValue={(v) => setArray((a) => ({ ...a, pr: v }))} />
        </label>
        <p className="small muted full" style={{ margin: 0 }}>{t.prHelp}</p>
        <div className="full stats stats-inline">
          <Stat k={t.arraySize} v={`${kWp.toFixed(2)} kWp`} />
          <Stat k={t.powerAt(fmtMinutes(minute))} v={fKw(powerNowKw)} />
          <Stat k={t.energyDay} v={`${dayKwh.toFixed(1)} kWh`} />
          <Stat k={t.energyYear} v={`${num(Math.round(yearKwh))} kWh`} />
          <Stat k={t.avgDay} v={`${prod.perDay.toFixed(1)} kWh`} />
          <Stat k={t.avgMonth} v={`${num(Math.round(prod.perMonth))} kWh`} />
          <Stat k={t.minDay(monthName(prod.min.month, lang))} v={`${prod.min.kwh.toFixed(1)} kWh`} />
          <Stat k={t.maxDay(monthName(prod.max.month, lang))} v={`${prod.max.kwh.toFixed(1)} kWh`} />
          <Stat k={t.yieldLabel} v={`${kWp > 0 ? num(Math.round(yearKwh / kWp)) : '–'} kWh/kWp`} />
        </div>
        {cost > 0 && kWp > 0 && (
          <div className="full">
            <h3 className="sub">{t.savings}</h3>
            <div className="stats stats-inline">
              <Stat k={t.saveDay} v={money(dayKwh)} />
              <Stat k={t.saveMonth} v={money(prod.perMonth)} />
              <Stat k={t.saveYear} v={money(yearKwh)} />
            </div>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{t.priceUsed(fmtMoney(cost, price.currency))}</p>
          </div>
        )}
        {monthKwh.length > 0 && kWp > 0 && <MonthChart values={monthKwh} labels={t.months} caption={t.monthly} />}
        <p className="small muted full" style={{ margin: 0 }}>{t.clearSkyNote}</p>
      </div>

      {day && (
        <div className="stats">
          <Stat k={t.sunrise} v={day.sunrise == null ? (day.maxElevation > 0 ? t.noSunset : t.noSunrise) : fmtMinutes(day.sunrise)} />
          <Stat k={t.noon} v={fmtMinutes(day.noon)} />
          <Stat k={t.sunset} v={fmtMinutes(day.sunset)} />
          <Stat k={t.dayLength} v={hm(day.dayLength)} />
          <Stat k={t.maxEl} v={`${f1(day.maxElevation)}°`} />
        </div>
      )}

      <div className="card">
        <h2>{t.path3d}</h2>
        <div className="scene" ref={sceneRef}>
          <SunScene3D sun={sun} path={day?.path.map((p) => p.pos) ?? []} summer={summer} winter={winter} hourMarks={hourMarks}
            tilt={panel.tilt} azimuth={panel.azimuth} horizon={horizon} shaded={shaded} panels={Math.round(array.count || 0)}
            dirs={t.dirs} hourLabel={t.hour} headingRef={headingRef} follow={follow} roseRef={roseRef} zoomRef={zoomRef} />
          <div className="zoom-btns">
            <button type="button" onClick={() => zoomBy(1.25)} aria-label={t.zoomIn} title={t.zoomIn}>+</button>
            <button type="button" onClick={() => zoomBy(0.8)} aria-label={t.zoomOut} title={t.zoomOut}>−</button>
            <button type="button" onClick={() => { zoomRef.current = 1; }} aria-label={t.zoomReset} title={t.zoomReset}>⟲</button>
          </div>
          <div className="rose" ref={roseRef} aria-hidden="true">
            <svg viewBox="-50 -50 100 100">
              <circle r="46" className="rose-ring" />
              <g className="rose-needle">
                <path d="M0 -38 L9 0 L0 6 L-9 0 Z" fill="#ef4444" />
                <path d="M0 38 L9 0 L0 -6 L-9 0 Z" fill="#cbd5e1" />
                <text y="-24" textAnchor="middle" className="rose-n" transform="translate(0 -12)">{t.dirs[0]}</text>
              </g>
            </svg>
            <div className="rose-deg" />
          </div>
          <div className="scene-overlay">
            <div>{sun.elevation > 0 ? t.sunAt(f1(sun.azimuth), dir(sun.azimuth), f1(sun.elevation)) : t.belowHorizon}</div>
            <div>
              {shaded ? `${t.shaded} · ` : ''}
              {fKw(powerNowKw)} · {Math.round(irr.poa)} W/m²
            </div>
          </div>
        </div>
        <div className="timebar">
          <button className="btn btn-small" type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t.pause : t.play}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input type="range" min={0} max={1439} step={1} value={Math.round(minute)} aria-label={t.timeOfDay}
            onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }} />
          <span className="t">{fmtMinutes(minute)}</span>
          <button className={`btn btn-small ${follow ? '' : 'btn-ghost'}`} type="button" onClick={toggleCompass} aria-pressed={follow}>
            🧭 {t.compassMode}
          </button>
        </div>
        {compassMsg && <p className="small muted" style={{ margin: '6px 0 0' }}>{compassMsg}</p>}
        <div className="legend">
          <span><i className="sw" style={{ background: '#f59e0b' }} />{t.legSelected}</span>
          <span><i className="sw" style={{ background: '#38bdf8' }} />{t.legJun}</span>
          <span><i className="sw" style={{ background: '#a78bfa' }} />{t.legDec}</span>
          <span><i className="sw" style={{ background: '#475569', height: 9 }} />{t.legObstacles}</span>
          <span>{t.legDrag}</span>
        </div>
      </div>

      <div className="card">
        {!saveOpen ? (
          <div className="row">
            <button className="btn btn-accent" type="button" onClick={() => { setSaveOpen(true); setSaveMsg(''); }}>💾 {t.saveProject}</button>
            {lastSaved && (
              <button className="btn btn-ghost" type="button" onClick={shareLast} disabled={pdfBusy}>📄 {t.sharePdf}</button>
            )}
          </div>
        ) : (
          <form className="grid" onSubmit={doSave}>
            <h2 className="full">{t.saveProject}</h2>
            <p className="small muted full" style={{ margin: 0 }}>{t.saveHelp}</p>
            <label className="full">{t.projectName}
              <input required value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
            </label>
            <label>{t.customer}
              <input value={meta.customer} onChange={(e) => setMeta((m) => ({ ...m, customer: e.target.value }))} />
            </label>
            <label>{t.phone}
              <input type="tel" value={meta.phone} onChange={(e) => setMeta((m) => ({ ...m, phone: e.target.value }))} />
            </label>
            <label className="full">{t.address}
              <input value={meta.address} onChange={(e) => setMeta((m) => ({ ...m, address: e.target.value }))} />
            </label>
            <label className="full">{t.notes}
              <textarea rows={3} value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} />
            </label>
            <div className="row full">
              <button className="btn btn-accent" type="submit">{t.save}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setSaveOpen(false)}>{t.cancel}</button>
            </div>
          </form>
        )}
        {saveMsg && <p className="small muted" style={{ margin: '8px 0 0' }}>{saveMsg}</p>}
      </div>

      <SensorSurvey site={site} horizon={horizon} setHorizon={setHorizon}
        onRoof={(tilt, az) => setPanel({ tilt: Math.round(tilt), azimuth: az == null ? panel.azimuth : Math.round(az) })}
        exportData={() => ({
          site, date, panel, array: { ...array, kWp }, horizon,
          annual: annual && { kwhPerM2: annual.kwh, shadeLossPct: annual.shadeLossPct, kwh: yearKwh, monthsKwh: monthKwh.map((v) => +v.toFixed(1)) },
        })} />

      <p className="warn small">{t.sunDisclaimer}</p>
    </section>
  );
}

/** Monthly energy bars (kWh). */
function MonthChart({ values, labels, caption }: { values: number[]; labels: string[]; caption: string }) {
  const max = Math.max(...values, 1);
  const W = 360, H = 150, top = 18, bottom = 18, gap = 6;
  const bw = (W - gap * 11) / 12;
  return (
    <figure className="full" style={{ margin: '4px 0 0' }}>
      <figcaption className="small muted">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {values.map((v, i) => {
          const h = ((H - top - bottom) * v) / max;
          const x = i * (bw + gap);
          const y = H - bottom - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} rx={3} fill="var(--accent)">
                <title>{`${Math.round(v)} kWh`}</title>
              </rect>
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="8" fill="var(--muted)">
                {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
              </text>
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">{labels[i]}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
