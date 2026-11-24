'use client';
import { useMemo } from 'react';
import { CableInput, DEFAULT_CABLE, Install, TABLES, sizeCable } from '@/lib/cable';
import { useStored } from '@/lib/useStored';
import { useT } from '@/lib/i18n';
import { Stat } from './Stat';
import { NumField } from './NumField';

const fmt = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';

export function CableCalculator() {
  const { t } = useT();
  const [p, setP] = useStored<CableInput>('onesolar.cable', DEFAULT_CABLE);
  const set = <K extends keyof CableInput>(k: K, v: CableInput[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const num = (k: keyof CableInput) => (v: number) => set(k, v as never);

  const missing = (['voltage', 'length', 'drop', p.mode] as const).filter((k) => !((p[k] as number) > 0));
  const r = useMemo(() => (missing.length ? null : sizeCable(p)), [p, missing.length]);
  const pick = r?.pick;

  return (
    <section>
      <h1>{t.cableTitle}</h1>
      <p className="muted">{t.cableIntro}</p>

      <form className="card grid" onSubmit={(e) => e.preventDefault()} autoComplete="off">
        <label className="full">
          {t.circuitType}
          <select value={p.system} onChange={(e) => set('system', e.target.value as CableInput['system'])}>
            <option value="dc">{t.dc}</option>
            <option value="ac1">{t.ac1}</option>
            <option value="ac3">{t.ac3}</option>
          </select>
        </label>

        <label>
          {t.inputBy}
          <select value={p.mode} onChange={(e) => set('mode', e.target.value as CableInput['mode'])}>
            <option value="current">{t.current}</option>
            <option value="power">{t.power}</option>
          </select>
        </label>
        {p.mode === 'current' ? (
          <label>
            {t.current}
            <NumField inputMode="decimal" step="any" min={0} value={p.current} onValue={num('current')} />
          </label>
        ) : (
          <label>
            {t.power}
            <NumField inputMode="decimal" step="any" min={0} value={p.power} onValue={num('power')} />
          </label>
        )}

        <label>
          {t.voltage}{p.system === 'ac3' ? t.lineLine : ''}
          <NumField inputMode="decimal" step="any" min={0} value={p.voltage} onValue={num('voltage')} />
        </label>
        <label>
          {t.length}
          <NumField inputMode="decimal" step="any" min={0} value={p.length} onValue={num('length')} />
        </label>

        <label>
          {t.drop}
          <NumField inputMode="decimal" step="any" min={0.1} value={p.drop} onValue={num('drop')} />
        </label>
        {p.system !== 'dc' ? (
          <label>
            {t.pf}
            <NumField inputMode="decimal" step={0.01} min={0.1} max={1} value={p.pf} onValue={num('pf')} />
          </label>
        ) : (
          <div />
        )}

        <label>
          {t.conductor}
          <select value={p.material} onChange={(e) => set('material', e.target.value as CableInput['material'])}>
            <option value="cu">{t.copper}</option>
            <option value="al">{t.aluminium}</option>
          </select>
        </label>
        <label>
          {t.installation}
          <select value={p.install} onChange={(e) => set('install', e.target.value as Install)}>
            {(Object.keys(TABLES) as Install[]).map((k) => (
              <option key={k} value={k}>{t.installs[k]}</option>
            ))}
          </select>
        </label>

        <label>
          {p.install === 'buried' ? t.groundTemp : t.ambientTemp}
          <NumField inputMode="decimal" step={1} value={p.ambient} onValue={num('ambient')} />
        </label>
        <label>
          {t.grouped}
          <NumField inputMode="numeric" step={1} min={1} int value={p.grouped} onValue={num('grouped')} />
        </label>

        <label className="full">
          {t.safety}
          <select value={p.safety} onChange={(e) => set('safety', parseFloat(e.target.value))}>
            <option value={1}>{t.safety1}</option>
            <option value={1.25}>{t.safety125}</option>
            <option value={1.56}>{t.safety156}</option>
          </select>
        </label>

        <button className="btn btn-ghost full" type="button"
          onClick={() => { if (confirm(t.confirmReset)) setP(DEFAULT_CABLE); }}>
          ↺ {t.resetInputs}
        </button>
      </form>

      <div className="card" aria-live="polite">
        {!r ? (
          <p className="muted">{t.missing} {missing.map((k) => t.fieldNames[k]).join(', ')}.</p>
        ) : pick ? (
          <>
            <div className="headline">
              <span className="size">{pick.size}</span>
              <span className="unit">{p.material === 'al' ? t.aluminiumUnit : t.copperUnit}</span>
              <span className="pill ok">{t.setBy} {r.governing ? t.governing[r.governing] : ''}</span>
            </div>
            <div className="stats stats-inline">
              <Stat k={t.loadCurrent} v={`${fmt(r.I, 2)} A`} />
              <Stat k={t.designCurrent} v={`${fmt(r.Ib, 2)} A`} />
              <Stat k={t.minArea} v={`${fmt(r.minAreaDrop, 2)} mm²`} />
              <Stat k={t.vdrop} v={`${fmt(pick.vdrop, 2)} V · ${fmt(pick.vdropPct, 2)} %`} />
              <Stat k={t.derated} v={`${fmt(pick.iz, 0)} A`} />
              <Stat k={t.cableLoss} v={`${fmt(pick.lossW, 0)} W`} />
            </div>
            <p className="small muted">{t.protNote}</p>
          </>
        ) : r.materialNotAllowed ? (
          <span className="pill bad">{t.alPvNote}</span>
        ) : (
          <>
            <span className="pill bad">{t.noSize}</span>
            <p className="small">{t.noSizeHelp(fmt(r.I, 1), fmt(r.minAreaDrop, 0))}</p>
          </>
        )}
      </div>

      {r && (
        <details className="card">
          <summary>{t.sizeTable}</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>mm²</th><th>{t.thCapacity}</th><th>ΔV V</th><th>ΔV %</th><th>{t.thLoss}</th><th>{t.thOk}</th></tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.size} className={pick?.size === row.size ? 'pick' : ''}>
                    <td>{row.size}</td>
                    <td>{row.available ? fmt(row.iz, 0) : '—'}</td>
                    <td>{fmt(row.vdrop, 2)}</td>
                    <td>{fmt(row.vdropPct, 2)}</td>
                    <td>{fmt(row.lossW, 0)}</td>
                    <td>
                      {!row.available ? (
                        <span className="muted">—</span>
                      ) : row.okDrop && row.okAmp ? (
                        <span className="v-ok">✓</span>
                      ) : (
                        <span className="x">{[!row.okAmp && 'A', !row.okDrop && 'ΔV'].filter(Boolean).join(' ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <details className="card">
        <summary>{t.howTitle}</summary>
        <ul className="small">
          <li>{t.howDc}: ΔV = 2 · I · ρ · L / A</li>
          <li>{t.how1}: ΔV = 2 · I · (ρ · L · cos φ / A + λ · L · sin φ)</li>
          <li>{t.how3}: ΔV = √3 · I · (ρ · L · cos φ / A + λ · L · sin φ)</li>
          <li>{t.howRho}</li>
          <li>{t.howCap}</li>
          <li>{t.howPv}</li>
        </ul>
        <p className="warn small">{t.cableDisclaimer}</p>
      </details>
    </section>
  );
}
