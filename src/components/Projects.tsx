'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { Project, deleteProject, listProjects, reportNo, restoreProject, saveProject } from '@/lib/projects';
import { makeReportPdf, sharePdf } from '@/lib/report';

type Details = Pick<Project, 'name' | 'customer' | 'phone' | 'address' | 'notes'>;

/** Change a saved project's name and customer details (the survey data and picture stay as saved). */
function EditDetails({ p, onDone }: { p: Project; onDone: (saved: boolean) => void }) {
  const { t } = useT();
  const [d, setD] = useState<Details>({ name: p.name, customer: p.customer, phone: p.phone, address: p.address, notes: p.notes });
  const [err, setErr] = useState('');
  const field = (k: keyof Details) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveProject({ ...p, ...d, name: d.name.trim(), updated: Date.now() });
      onDone(true);
    } catch (x) {
      setErr(t.saveErr((x as Error).message));
    }
  };

  return (
    <form className="grid project-edit" onSubmit={submit}>
      <h2 className="full">{t.editProject}</h2>
      <label className="full">{t.projectName}<input required autoFocus {...field('name')} /></label>
      <label>{t.customer}<input {...field('customer')} /></label>
      <label>{t.phone}<input type="tel" {...field('phone')} /></label>
      <label className="full">{t.address}<input {...field('address')} /></label>
      <label className="full">{t.notes}<textarea rows={3} {...field('notes')} /></label>
      {err && <p className="small full" style={{ margin: 0, color: 'var(--bad)' }}>{err}</p>}
      <div className="row full" style={{ margin: 0 }}>
        <button className="btn btn-ghost" type="button" onClick={() => onDone(false)}>{t.cancel}</button>
        <button className="btn" type="submit">{t.save}</button>
      </div>
    </form>
  );
}

export function Projects({ onOpen }: { onOpen: () => void }) {
  const { t, lang, dir } = useT();
  const [items, setItems] = useState<Project[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

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

  const when = (ms: number) => new Date(ms).toLocaleString(lang === 'km' ? 'km-KH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

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
            {editing === p.id ? (
              <EditDetails p={p} onDone={(saved) => { setEditing(null); if (saved) { setMsg(t.updated); load(); } }} />
            ) : (
            <div className="project-body">
              <h2>{p.name || t.untitled}</h2>
              <div className="small muted">
                {reportNo(p)} · {when(p.created)}
                {p.updated && <> · {t.editedOn} {when(p.updated)}</>}
              </div>
              {p.customer && <div className="small">{t.customer}: {p.customer}</div>}
              <div className="small">
                {kWp(p)} kWp · {p.array.count} × {p.array.watt} Wp · {p.panel.tilt}° / {p.panel.azimuth}° {dir(p.panel.azimuth)}
              </div>
              <div className="row project-actions">
                <button className="btn btn-small" type="button" disabled={busy === p.id} onClick={() => share(p)}>📄 {t.sharePdf}</button>
                <button className="btn btn-small btn-ghost" type="button" onClick={() => { restoreProject(p); onOpen(); }}>{t.open}</button>
                <button className="btn btn-small btn-ghost" type="button" onClick={() => { setEditing(p.id); setMsg(''); }}>✏️ {t.edit}</button>
                <button className="btn btn-small btn-ghost danger" type="button" onClick={() => remove(p)}>{t.del}</button>
              </div>
            </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

