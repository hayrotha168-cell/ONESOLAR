'use client';
import { useEffect, useRef, useState } from 'react';
import { HorizonPoint, Site, sunPosition } from '@/lib/solar';
import { useT } from '@/lib/i18n';
import { Orientation, startOrientation } from '@/lib/orientation';

const mod = (a: number, n: number) => ((a % n) + n) % n;

interface Props {
  site: Site;
  horizon: HorizonPoint[];
  setHorizon: (fn: (h: HorizonPoint[]) => HorizonPoint[]) => void;
  onRoof: (tilt: number, azimuth: number | null) => void;
  exportData: () => unknown;
}

export function SensorSurvey({ site, horizon, setHorizon, onRoof, exportData }: Props) {
  const { t, dir } = useT();
  const [orient, setOrient] = useState<Orientation | null>(null);
  const [active, setActive] = useState(false);
  const [msg, setMsg] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [manual, setManual] = useState({ az: '', el: '' });
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => () => stream.current?.getTracks().forEach((tr) => tr.stop()), []);

  const stopSensors = useRef<(() => void) | null>(null);
  useEffect(() => () => stopSensors.current?.(), []);

  const startSensors = async () => {
    const res = await startOrientation(setOrient);
    if (!res.ok) {
      setMsg(res.error === 'none' ? t.noSensors : res.error === 'denied' ? t.permDenied : t.startErr(res.error));
      return;
    }
    stopSensors.current = res.stop;
    setActive(true);
    setMsg(t.sensorsStarted);
    setTimeout(() => setOrient((o) => { if (!o) setMsg(t.noData); return o; }), 2500);
  };

  const toggleCamera = async () => {
    if (camOn) {
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
      setCamOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stream.current = s;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
      });
    } catch (e) {
      setMsg(t.camErr((e as Error).message));
    }
  };

  const record = () => {
    if (!orient || orient.compass == null) return;
    const point = { az: +orient.compass.toFixed(1), el: +Math.max(0, orient.elevation).toFixed(1) };
    setHorizon((h) => [...h, point]);
    if ('vibrate' in navigator) navigator.vibrate(30);
  };

  const addManual = (e: React.FormEvent) => {
    e.preventDefault();
    const az = parseFloat(manual.az), el = parseFloat(manual.el);
    if (!Number.isFinite(az) || !Number.isFinite(el)) return;
    setHorizon((h) => [...h, { az: mod(az, 360), el: Math.max(0, Math.min(90, el)) }]);
    setManual({ az: '', el: '' });
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify({ app: 'ONE SOLAR', exported: new Date().toISOString(), ...(exportData() as object) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `onesolar-survey-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const sunNow = sunPosition(new Date(), site.lat, site.lon);
  const sorted = [...horizon].map((p, i) => ({ ...p, i })).sort((a, b) => a.az - b.az);

  return (
    <>
      <div className="card">
        <h2>{t.shadeTitle}</h2>
        <p className="muted small">
          {t.shadeHelpA}<b>{t.record}</b>{t.shadeHelpB}
        </p>

        <div className="viewfinder">
          {camOn && <video ref={video} playsInline muted />}
          <div className="crosshair" />
          <div className="hud">
            <div><span className="hud-k">{t.heading}</span>{orient?.compass != null ? `${orient.compass.toFixed(0)}° ${dir(orient.compass)}` : '--'}</div>
            <div><span className="hud-k">{t.elevation}</span>{orient ? `${orient.elevation.toFixed(1)}°` : '--'}</div>
            <div><span className="hud-k">{t.sunNow}</span>{sunNow.elevation > 0 ? `${sunNow.azimuth.toFixed(0)}° / ${sunNow.elevation.toFixed(0)}°` : t.sunSet}</div>
          </div>
        </div>

        <div className="row">
          <button className="btn" type="button" onClick={startSensors} disabled={active}>{active ? t.sensorsOn : t.startSensors}</button>
          <button className="btn btn-ghost" type="button" onClick={toggleCamera}>{camOn ? t.cameraOff : t.camera}</button>
          <button className="btn btn-accent" type="button" onClick={record} disabled={!orient || orient.compass == null}>{t.record}</button>
        </div>
        {msg && <p className="small muted">{msg}</p>}
        {orient && orient.compass == null && <p className="small muted">{t.noCompass}</p>}

        <details>
          <summary>{t.manual}</summary>
          <form className="grid" onSubmit={addManual}>
            <label>{t.azimuthN}<input type="number" inputMode="decimal" step="any" min={0} max={360} required value={manual.az}
              onChange={(e) => setManual((m) => ({ ...m, az: e.target.value }))} /></label>
            <label>{t.elevDeg}<input type="number" inputMode="decimal" step="any" min={0} max={90} required value={manual.el}
              onChange={(e) => setManual((m) => ({ ...m, el: e.target.value }))} /></label>
            <button className="btn btn-ghost full" type="submit">{t.addPoint}</button>
          </form>
        </details>

        {horizon.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>{t.thAzimuth}</th><th>{t.thElevation}</th><th /></tr></thead>
              <tbody>
                {sorted.map((p, n) => (
                  <tr key={p.i}>
                    <td>{n + 1}</td>
                    <td>{p.az.toFixed(1)}° {dir(p.az)}</td>
                    <td>{p.el.toFixed(1)}°</td>
                    <td><button type="button" aria-label={t.removePoint} onClick={() => setHorizon((h) => h.filter((_, j) => j !== p.i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row">
          <button className="btn btn-ghost btn-small" type="button" disabled={!horizon.length}
            onClick={() => { if (confirm(t.confirmClear)) setHorizon(() => []); }}>{t.clearPoints}</button>
          <button className="btn btn-ghost btn-small" type="button" onClick={doExport}>{t.exportSurvey}</button>
        </div>
      </div>

      <div className="card">
        <h2>{t.roofTitle}</h2>
        <p className="muted small">{t.roofHelp}</p>
        <div className="big">{orient ? `${orient.roofTilt.toFixed(1)}°` : '--'}</div>
        {orient?.roofFacing != null && <p className="small">{t.roofFaces(orient.roofFacing.toFixed(0), dir(orient.roofFacing))}</p>}
        <button className="btn btn-ghost" type="button" disabled={!orient} onClick={() => orient && onRoof(orient.roofTilt, orient.roofFacing)}>
          {t.useRoof}{orient?.roofFacing != null ? t.andAzimuth : ''}
        </button>
      </div>
    </>
  );
}
