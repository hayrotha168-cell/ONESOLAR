'use client';
import { useAuth } from '@/lib/auth';
import { Currency, DEFAULT_PRICE, PRICE_KEY, Price } from '@/lib/energy';
import { useT } from '@/lib/i18n';
import { useStored } from '@/lib/useStored';
import { useUpdates } from '@/lib/updates';
import { Theme, useTheme } from '@/lib/theme';
import { NumField } from './NumField';
import { APP_VERSION, BUILD_TIME, CHANGELOG, COMMIT } from '@/lib/version';

const RIEL_PER_USD = 4100;

export function Settings() {
  const { t, lang, setLang } = useT();
  const { user, required, logout } = useAuth();
  const [price, setPrice] = useStored<Price>(PRICE_KEY, DEFAULT_PRICE);
  const { status, latest, check, apply } = useUpdates();
  const { theme, setTheme } = useTheme();
  const themes: [Theme, string][] = [['auto', `🌓 ${t.themeAuto}`], ['light', `☀️ ${t.themeLight}`], ['dark', `🌙 ${t.themeDark}`]];
  const built = BUILD_TIME ? new Date(BUILD_TIME).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const changeCurrency = (currency: Currency) =>
    // Convert the tariff so it stays about the same in the new currency.
    setPrice((p) => ({
      currency,
      value: p.currency === currency ? p.value
        : currency === 'KHR' ? Math.round(p.value * RIEL_PER_USD) : +(p.value / RIEL_PER_USD).toFixed(3),
    }));

  return (
    <section>
      <h1>⚙️ {t.settings}</h1>

      <div className="card grid">
        <h2 className="full">{t.elecTariff}</h2>
        <label>{t.elecPrice}
          <NumField inputMode="decimal" step="any" min={0} value={price.value}
            onValue={(v) => setPrice((p) => ({ ...p, value: v }))} />
        </label>
        <label>{t.currencyLabel}
          <select value={price.currency} onChange={(e) => changeCurrency(e.target.value as Currency)}>
            <option value="USD">USD ($)</option>
            <option value="KHR">KHR (៛)</option>
          </select>
        </label>
        <p className="small muted full" style={{ margin: 0 }}>{t.priceHelp}</p>
      </div>

      <div className="card grid">
        <h2 className="full">{t.languageLabel}</h2>
        <div className="full seg" role="radiogroup" aria-label={t.languageLabel}>
          <button type="button" role="radio" aria-checked={lang === 'km'} className={lang === 'km' ? 'on' : ''} onClick={() => setLang('km')}>ខ្មែរ</button>
          <button type="button" role="radio" aria-checked={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        </div>
      </div>

      <div className="card grid">
        <h2 className="full">{t.appearance}</h2>
        <div className="full seg seg-3" role="radiogroup" aria-label={t.appearance}>
          {themes.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={theme === k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted full" style={{ margin: 0 }}>{t.themeHelp}</p>
      </div>

      <div className="card">
        <h2>{t.appVersion}</h2>
        <div className="version-row">
          <span className="version-num">v{APP_VERSION}</span>
          <span className="small muted">{built && `${t.builtOn} ${built}`}{COMMIT && ` · ${COMMIT}`}</span>
        </div>
        {status === 'available' ? (
          <div className="row">
            <span className="pill ok">{t.updateAvailable(latest ?? '')}</span>
            <button className="btn" type="button" onClick={apply}>{t.updateNow}</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-ghost" type="button" onClick={check} disabled={status === 'checking'}>
              {status === 'checking' ? t.checking : `↻ ${t.checkUpdates}`}
            </button>
          </div>
        )}
        {status === 'current' && <p className="small v-ok" style={{ margin: 0 }}>✓ {t.upToDate}</p>}
        {status === 'offline' && <p className="small muted" style={{ margin: 0 }}>{t.updateOffline}</p>}

        <details style={{ marginTop: 10 }}>
          <summary>{t.whatsNew}</summary>
          {CHANGELOG.map((r) => (
            <div key={r.version} className="release">
              <div><b>v{r.version}</b> <span className="small muted">{r.date}</span></div>
              <ul className="small">{(lang === 'km' ? r.km : r.en).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          ))}
        </details>
      </div>

      {required && user && (
        <div className="card">
          <h2>{t.account}</h2>
          <div className="account">
            {user.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photo} alt="" width={44} height={44} referrerPolicy="no-referrer" />
            ) : (
              <span className="account-initial">{user.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div>
              <div><b>{user.name}</b></div>
              {user.username && <div className="small muted">@{user.username}</div>}
            </div>
          </div>
          <button className="btn btn-ghost danger" type="button" style={{ width: '100%', marginTop: 12 }}
            onClick={() => { if (confirm(t.confirmLogout)) logout(); }}>
            {t.logout}
          </button>
        </div>
      )}
    </section>
  );
}
