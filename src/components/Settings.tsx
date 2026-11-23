'use client';
import { useAuth } from '@/lib/auth';
import { Currency, DEFAULT_PRICE, PRICE_KEY, Price } from '@/lib/energy';
import { useT } from '@/lib/i18n';
import { useStored } from '@/lib/useStored';

const RIEL_PER_USD = 4100;

export function Settings() {
  const { t, lang, setLang } = useT();
  const { user, required, logout } = useAuth();
  const [price, setPrice] = useStored<Price>(PRICE_KEY, DEFAULT_PRICE);

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
          <input type="number" inputMode="decimal" step="any" min={0} value={price.value}
            onChange={(e) => setPrice((p) => ({ ...p, value: parseFloat(e.target.value) }))} />
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
