// A4 project report → PDF. Pages are laid out in HTML (so Khmer text is shaped by the browser),
// rendered to images with html2canvas-pro, and placed in a PDF with jsPDF.
import { sizeCable } from './cable';
import type { Dict, Lang } from './i18n';
import { Project, reportNo } from './projects';
import { daySummary, fmtMinutes, yearEnergy } from './solar';
import { fmtMoney, monthName, productionStats } from './energy';

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;
const GREEN = '#1f9e68';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#dbe3ea';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

function dateText(ms: number, lang: Lang) {
  return new Date(ms).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

const section = (title: string, body: string) => `
  <div style="margin-top:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:4px;height:16px;background:${GREEN};border-radius:2px"></div>
      <div style="font-weight:700;font-size:14px;color:${INK};text-transform:uppercase;letter-spacing:.04em">${esc(title)}</div>
    </div>
    ${body}
  </div>`;

/** Two-column key/value table. */
const kv = (rows: [string, string][], cols = 2) => {
  const cells = rows.map(
    ([k, v]) => `<div style="padding:6px 10px;border-bottom:1px solid ${LINE}">
      <div style="font-size:10px;color:${MUTED}">${esc(k)}</div>
      <div style="font-size:13px;font-weight:600;color:${INK}">${esc(v || '—')}</div></div>`,
  );
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);border:1px solid ${LINE};border-radius:8px;overflow:hidden">${cells.join('')}</div>`;
};

const tiles = (items: [string, string][]) => `
  <div style="display:grid;grid-template-columns:repeat(${items.length},1fr);gap:8px">
    ${items
      .map(([k, v]) => `<div style="background:#f1f8f4;border:1px solid #cfe9dc;border-radius:8px;padding:8px 10px">
        <div style="font-size:10px;color:${MUTED}">${esc(k)}</div>
        <div style="font-size:15px;font-weight:700;color:${INK};white-space:nowrap">${esc(v)}</div></div>`)
      .join('')}
  </div>`;

function monthBars(values: number[], labels: string[]) {
  const max = Math.max(...values, 1);
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:130px;padding:6px 4px 0;border:1px solid ${LINE};border-radius:8px">
    ${values
      .map(
        (v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="font-size:9px;color:${MUTED};margin-bottom:2px">${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}</div>
          <div style="width:100%;height:${Math.max(1, (v / max) * 88)}px;background:${GREEN};border-radius:3px 3px 0 0"></div>
          <div style="font-size:10px;color:${MUTED};padding:3px 0">${esc(labels[i])}</div></div>`,
      )
      .join('')}
  </div>`;
}

function header(p: Project, t: Dict, lang: Lang) {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:3px solid ${GREEN}">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="/logo-mark.png" style="width:44px;height:48px" />
      <div>
        <div style="font-size:22px;font-weight:800;color:${GREEN};letter-spacing:.02em">ONE SOLAR</div>
        <div style="font-size:11px;color:${MUTED}">${esc(t.tagline)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:800;color:${INK}">${esc(t.reportTitle)}</div>
      <div style="font-size:11px;color:${MUTED}">${esc(t.reportNo)}: <b style="color:${INK}">${reportNo(p)}</b></div>
      <div style="font-size:11px;color:${MUTED}">${esc(t.reportDate)}: <b style="color:${INK}">${esc(dateText(p.created, lang))}</b></div>
    </div>
  </div>`;
}

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,var(--font-khmer),sans-serif";
const BODY_BOTTOM = PAGE_H - 70; // keep clear of the footer

function newPage(headerHtml: string) {
  const el = document.createElement('div');
  el.className = 'os-page';
  el.style.cssText = `width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:40px 48px 0;background:#fff;color:${INK};
    position:relative;overflow:hidden;font-family:${FONT};line-height:1.45`;
  el.innerHTML = `${headerHtml}<div class="os-body"></div>`;
  return el;
}

/** The report as a list of blocks (sections), laid out onto A4 pages by layoutReport(). */
export function reportBlocks(p: Project, t: Dict, dir: (az: number) => string, lang: Lang = 'en'): string[] {
  const year = Number(p.date.slice(0, 4)) || new Date().getFullYear();
  const day = daySummary(p.site, p.date);
  const annual = yearEnergy(p.site, year, p.panel.tilt, p.panel.azimuth, p.horizon);
  const kWp = (Math.max(0, p.array.count) * Math.max(0, p.array.watt)) / 1000;
  const pr = Math.max(0, Math.min(100, p.array.pr)) / 100;
  const yearKwh = annual.kwh * kWp * pr;
  const months = annual.months.map((m) => m.kwh * kWp * pr);
  const prod = productionStats(months);
  const cost = p.price && p.price.value > 0 ? p.price : null;
  const c = p.cable;
  const r = sizeCable(c);
  const pick = r.pick;
  const sys = { dc: t.dc, ac1: t.ac1, ac3: t.ac3 }[c.system];

  const info = kv([
    [t.projectName, p.name || t.untitled],
    [t.customer, p.customer],
    [t.phone, p.phone],
    [t.preparedBy, p.preparedBy],
    [t.address, p.address],
    [t.location, `${p.site.lat.toFixed(5)}, ${p.site.lon.toFixed(5)} (UTC${p.site.tz >= 0 ? '+' : ''}${p.site.tz})`],
  ]);

  const img = p.image
    ? `<div style="border:1px solid ${LINE};border-radius:8px;overflow:hidden;background:#0b1120">
         <img src="${p.image}" style="display:block;width:100%;height:300px;object-fit:cover" /></div>
       <div style="font-size:10px;color:${MUTED};margin-top:4px">${esc(t.view3d)} · ${esc(t.surveyDate)} ${esc(p.date)}</div>`
    : '';

  return [
    section(t.projectInfo, info),
    img ? `<div style="margin-top:14px">${img}</div>` : '',
    section(t.siteSun, tiles([
      [t.sunrise, fmtMinutes(day.sunrise)],
      [t.noon, fmtMinutes(day.noon)],
      [t.sunset, fmtMinutes(day.sunset)],
      [t.dayLength, t.hm(Math.floor(day.dayLength / 60), Math.round(day.dayLength % 60))],
      [t.maxEl, `${day.maxElevation.toFixed(1)}°`],
    ])),
    section(t.systemDesign, kv([
      [t.panelCount, t.panelsLine(p.array.count, p.array.watt)],
      [t.arraySize, `${kWp.toFixed(2)} kWp`],
      [t.tilt, `${p.panel.tilt}°`],
      [t.azimuthN, `${p.panel.azimuth}° ${dir(p.panel.azimuth)}`],
      [t.pr, `${p.array.pr} %`],
      [t.obstaclePts, String(p.horizon.length)],
    ], 3)),
    section(t.energyEst, tiles([
      [t.energyYear, `${n(yearKwh)} kWh`],
      [t.avgDay, `${(yearKwh / 365).toFixed(1)} kWh`],
      [t.yieldLabel, `${kWp > 0 ? n(yearKwh / kWp) : '–'} kWh/kWp`],
      [t.sunYear, `${n(annual.kwh)} kWh/m²`],
      [t.shadeLoss, `${annual.shadeLossPct.toFixed(1)} %`],
    ])) + `<div style="margin-top:8px">${tiles([
      [t.avgMonth, `${n(prod.perMonth)} kWh`],
      [t.minDay(monthName(prod.min.month, lang)), `${prod.min.kwh.toFixed(1)} kWh`],
      [t.maxDay(monthName(prod.max.month, lang)), `${prod.max.kwh.toFixed(1)} kWh`],
    ])}</div>` + (cost ? `<div style="margin-top:8px">${tiles([
      [t.saveMonth, fmtMoney(prod.perMonth * cost.value, cost.currency)],
      [t.saveYear, fmtMoney(yearKwh * cost.value, cost.currency)],
      [t.elecPrice, fmtMoney(cost.value, cost.currency)],
    ])}</div>` : '') + `<div style="margin-top:8px">${monthBars(months, t.months)}</div>
      <div style="font-size:10px;color:${MUTED};margin-top:4px">${esc(t.monthly)} · ${esc(t.clearSkyNote)}</div>`,
    section(t.cableSizing, `
      ${kv([
        [t.circuit, sys],
        [t.designInput, c.mode === 'current' ? `${c.current} A` : `${c.power} W`],
        [t.voltage, `${c.voltage} V`],
        [t.length, `${c.length} m`],
        [t.drop, `${c.drop} %`],
        [t.conductor, c.material === 'cu' ? t.copper : t.aluminium],
        [t.installation, t.installs[c.install]],
        [t.ambientTemp, `${c.ambient} °C`],
        [t.grouped, String(c.grouped)],
      ], 3)}
      <div style="margin-top:10px;display:flex;gap:14px;align-items:center;border:2px solid ${GREEN};border-radius:10px;padding:10px 14px;background:#f1f8f4">
        <div style="font-size:11px;color:${MUTED};min-width:120px">${esc(t.result)}</div>
        <div style="font-size:30px;font-weight:800;color:${GREEN}">${pick ? pick.size : '—'}</div>
        <div style="font-size:13px;font-weight:600">${pick ? esc(c.material === 'al' ? t.aluminiumUnit : t.copperUnit) : esc(r.materialNotAllowed ? t.alPvNote : t.noSize)}</div>
        <div style="margin-left:auto;font-size:11px;color:${MUTED};text-align:right">${pick && r.governing ? `${esc(t.setBy)} ${esc(t.governing[r.governing])}` : ''}</div>
      </div>
      ${pick ? `<div style="margin-top:8px">${tiles([
        [t.designCurrent, `${r.Ib.toFixed(2)} A`],
        [t.derated, `${n(pick.iz)} A`],
        [t.vdrop, `${pick.vdrop.toFixed(2)} V · ${pick.vdropPct.toFixed(2)} %`],
        [t.cableLoss, `${n(pick.lossW)} W`],
      ])}</div>
      <div style="font-size:10px;color:${MUTED};margin-top:6px">${esc(t.protNote)}</div>` : ''}`),
    section(t.standards, `<ul style="margin:0;padding-left:18px;font-size:11px;color:${INK}">${t.standardsList.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`),
    p.notes ? section(t.notes, `<div style="font-size:12px;white-space:pre-wrap;border:1px solid ${LINE};border-radius:8px;padding:8px 10px">${esc(p.notes)}</div>`) : '',
    section(t.approval, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        ${[t.customerSig, t.engineerSig]
          .map((who, i) => `<div>
            <div style="font-size:12px;font-weight:600">${esc(who)}${i === 0 && p.customer ? `: ${esc(p.customer)}` : i === 1 && p.preparedBy ? `: ${esc(p.preparedBy)}` : ''}</div>
            <div style="height:56px;border-bottom:1px solid ${INK}"></div>
            <div style="font-size:10px;color:${MUTED};margin-top:4px">${esc(t.signDate)}</div></div>`)
          .join('')}
      </div>`) + `<div style="font-size:9px;color:${MUTED};margin-top:14px">${esc(t.cableDisclaimer)} ${esc(t.sunDisclaimer)}</div>`,
  ].filter(Boolean);
}

/**
 * Builds the A4 pages inside `host` (which must be in the document so sizes can be measured):
 * blocks flow onto a page until the next one would run into the footer.
 */
export async function layoutReport(host: HTMLElement, p: Project, t: Dict, lang: Lang, dir: (az: number) => string) {
  const head = header(p, t, lang);
  const pages: HTMLElement[] = [];
  let page = newPage(head);
  host.appendChild(page);
  pages.push(page);
  const settle = async (el: HTMLElement) => {
    await Promise.all([...el.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  };
  for (const html of reportBlocks(p, t, dir, lang)) {
    const body = page.querySelector<HTMLElement>('.os-body')!;
    const block = document.createElement('div');
    block.innerHTML = html;
    body.appendChild(block);
    await settle(block);
    const bottom = block.getBoundingClientRect().bottom - page.getBoundingClientRect().top;
    if (bottom > BODY_BOTTOM && body.children.length > 1) {
      block.remove();
      page = newPage(head);
      host.appendChild(page);
      pages.push(page);
      page.querySelector('.os-body')!.appendChild(block);
    }
  }
  pages.forEach((pg, i) => {
    const foot = document.createElement('div');
    foot.style.cssText = `position:absolute;left:48px;right:48px;bottom:26px;display:flex;justify-content:space-between;
      border-top:1px solid ${LINE};padding-top:8px;font-size:10px;color:${MUTED}`;
    foot.innerHTML = `<span>${esc(t.reportFoot)} · ${reportNo(p)}</span><span>${esc(t.pageOf(i + 1, pages.length))}</span>`;
    pg.appendChild(foot);
  });
  return pages;
}

/** Renders the report pages to JPEG data URLs (A4, 2× resolution). */
export async function reportImages(p: Project, t: Dict, lang: Lang, dir: (az: number) => string): Promise<string[]> {
  const { default: html2canvas } = await import('html2canvas-pro');
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${PAGE_W + 200}px;top:0;width:${PAGE_W}px;z-index:-1`;
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    const pages = await layoutReport(host, p, t, lang, dir);
    const out: string[] = [];
    for (const pg of pages) {
      const canvas = await html2canvas(pg, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      out.push(canvas.toDataURL('image/jpeg', 0.9));
    }
    return out;
  } finally {
    host.remove();
  }
}

export async function makeReportPdf(p: Project, t: Dict, lang: Lang, dir: (az: number) => string): Promise<File> {
  const [images, { jsPDF }] = await Promise.all([reportImages(p, t, lang, dir), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  images.forEach((img, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
  });
  pdf.setProperties({ title: `${t.reportTitle} – ${p.name || reportNo(p)}`, creator: 'ONE SOLAR' });
  const safe = (p.name || 'project').replace(/[^p{L}p{N}_-]+/gu, '-').slice(0, 40);
  return new File([pdf.output('blob')], `${reportNo(p)}-${safe}.pdf`, { type: 'application/pdf' });
}

/** Opens the phone's share sheet (Telegram, email…) when it can take files, otherwise downloads. */
export async function sharePdf(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
