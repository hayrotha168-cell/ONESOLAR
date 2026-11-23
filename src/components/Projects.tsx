'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { Project, deleteProject, listProjects, reportNo, restoreProject } from '@/lib/projects';
import { makeReportPdf, sharePdf } from '@/lib/report';

export function Projects({ onOpen }: { onOpen: () => void }) {
  const { t, lang, dir } = useT();
  const [items, setItems] = useState<Project[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => listProjects().then(setItems).catch((e) => { setItems([]); setMsg(String(e.message ?? e)); });
  useEffect(() => { load(); }, []);

  const share = async (p: Project) => {
    setBusy(p.id);
    setMsg(t.makingPdf);
    try {
      const how = await sharePdf(await makeReportPdf(p, t, lang, dir), t.reportTitle);
      setMsg(how === 'downloaded' ? t.pdfSaved : '');
    } catch (e) {
      setMsg(t.pdfErr((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: Project) => {
    if (!confirm(t.confirmDelete)) return;
    await deleteProject(p.id);
    load();
  };

  const kWp = (p: Project) => ((p.array.count * p.array.watt) / 1000).toFixed(2);

  return (
    <section>
      <h1>{t.projectsTitle}</h1>
      {msg && <p className="small muted">{msg}</p>}
      {items && items.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t.projectsEmpty}</p></div>}
      <div className="project-list">
        {items?.map((p) => (
          <article className="card project" key={p.id}>
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="project-img" />
            ) : (
              <div className="project-img" />
            )}
            <div className="project-body">
              <h2>{p.name || t.untitled}</h2>
              <div className="small muted">
                {reportNo(p)} · {new Date(p.created).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              {p.customer && <div className="small">{t.customer}: {p.customer}</div>}
              <div className="small">
                {kWp(p)} kWp · {p.array.count} × {p.array.watt} Wp · {p.panel.tilt}° / {p.panel.azimuth}° {dir(p.panel.azimuth)}
              </div>
              <div className="row project-actions">
                <button className="btn btn-small" type="button" disabled={busy === p.id} onClick={() => share(p)}>📄 {t.sharePdf}</button>
                <button className="btn btn-small btn-ghost" type="button" onClick={() => { restoreProject(p); onOpen(); }}>{t.open}</button>
                <button className="btn btn-small btn-ghost danger" type="button" onClick={() => remove(p)}>{t.del}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

