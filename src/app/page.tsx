'use client';
import { useEffect, useState } from 'react';
import { CableCalculator } from '@/components/CableCalculator';
import { SunSurvey } from '@/components/SunSurvey';
import { Projects } from '@/components/Projects';
import { Settings } from '@/components/Settings';
import { AuthGate, useAuth } from '@/lib/auth';
import { UpdateProvider, useUpdates } from '@/lib/updates';
import { useTheme } from '@/lib/theme';
import { LangProvider, useT } from '@/lib/i18n';

type Tab = 'cable' | 'sun' | 'projects' | 'settings';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

export default function Home() {
  return (
    <LangProvider>
      <UpdateProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </UpdateProvider>
    </LangProvider>
  );
}

function App() {
  const { t, lang, setLang } = useT();
  const { user, required, logout } = useAuth();
  const { shown, setTheme } = useTheme();
  const [gen, setGen] = useState(0); // bumped to remount the tabs after a project is opened
  const [tab, setTab] = useState<Tab>('cable');
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('onesolar.tab');
      if (saved === 'cable' || saved === 'sun' || saved === 'projects' || saved === 'settings') setTab(saved);
    } catch {}
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const select = (next: Tab) => {
    setTab(next);
    try { localStorage.setItem('onesolar.tab', next); } catch {}
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" width={34} height={37} />
          <span className="brand-text">
            <span className="brand-name">ONE SOLAR</span>
            <span className="brand-tag">{t.tagline}</span>
          </span>
        </div>
        <div className="top-actions">
          {installEvt && (
            <button
              className="btn btn-small"
              onClick={async () => {
                await installEvt.prompt();
                await installEvt.userChoice;
                setInstallEvt(null);
              }}
            >
              {t.install}
            </button>
          )}
          {required && user && (
            <button className="user-chip" type="button" title={`${user.name} · ${t.logout}`}
              onClick={() => { if (confirm(t.confirmLogout)) logout(); }}>
              {user.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photo} alt="" width={28} height={28} referrerPolicy="no-referrer" />
              ) : (
                <span>{user.name.slice(0, 1).toUpperCase()}</span>
              )}
            </button>
          )}
          <button className="btn btn-ghost btn-small icon-btn" type="button" aria-label={t.toggleTheme} title={t.toggleTheme}
            onClick={() => setTheme(shown === 'dark' ? 'light' : 'dark')}>
            {shown === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="btn btn-ghost btn-small lang-btn"
            type="button"
            aria-label={t.switchLabel}
            title={t.switchLabel}
            onClick={() => setLang(lang === 'en' ? 'km' : 'en')}
          >
            {t.switchTo}
          </button>
        </div>
      </header>

      <main key={gen}>
        {tab === 'cable' ? <CableCalculator /> : tab === 'sun' ? <SunSurvey /> : tab === 'settings' ? <Settings /> : <Projects onOpen={() => { setGen((g) => g + 1); select('sun'); }} />}
      </main>

      <UpdateBanner />

      <nav className="tabbar" role="tablist">
        <button role="tab" aria-selected={tab === 'cable'} className={tab === 'cable' ? 'active' : ''} onClick={() => select('cable')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h6a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h12M4 7V4m0 3v3M20 19v-3m0 3v3" /></svg>
          {t.tabCable}
        </button>
        <button role="tab" aria-selected={tab === 'sun'} className={tab === 'sun' ? 'active' : ''} onClick={() => select('sun')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          {t.tabSun}
        </button>
        <button role="tab" aria-selected={tab === 'projects'} className={tab === 'projects' ? 'active' : ''} onClick={() => select('projects')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6l2 2h8v12H4z" /><path d="M8 12h8M8 15h5" /></svg>
          {t.tabProjects}
        </button>
        <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => select('settings')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          {t.settings}
        </button>
      </nav>
    </>
  );
}

/** Shown above the bottom menu when a newer release is live. */
function UpdateBanner() {
  const { t } = useT();
  const { status, latest, apply, dismissed, dismiss } = useUpdates();
  if (status !== 'available' || dismissed) return null;
  return (
    <div className="update-banner" role="status">
      <span>🎉 {t.updateAvailable(latest ?? '')}</span>
      <button className="btn btn-small" type="button" onClick={apply}>{t.updateNow}</button>
      <button className="btn btn-small btn-ghost" type="button" onClick={dismiss}>{t.later}</button>
    </div>
  );
}
