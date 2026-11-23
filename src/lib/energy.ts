// Production statistics and electricity-bill savings, shared by the Sun survey and the PDF report.

export type Currency = 'USD' | 'KHR';
export interface Price {
  value: number; // price of 1 kWh from the grid
  currency: Currency;
}

export const PRICE_KEY = 'onesolar.price';
export const DEFAULT_PRICE: Price = { value: 0.18, currency: 'USD' };

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface ProductionStats {
  year: number; // kWh per year
  perMonth: number; // average kWh per month
  perDay: number; // average kWh per day over the year
  daily: number[]; // typical kWh per day in each month
  min: { kwh: number; month: number }; // lowest typical day
  max: { kwh: number; month: number }; // highest typical day
}

/** monthKwh: energy of each month (kWh), already scaled to the array size and losses. */
export function productionStats(monthKwh: number[]): ProductionStats {
  const daily = monthKwh.map((m, i) => m / DAYS[i]);
  const year = monthKwh.reduce((s, v) => s + v, 0);
  let lo = 0, hi = 0;
  daily.forEach((v, i) => {
    if (v < daily[lo]) lo = i;
    if (v > daily[hi]) hi = i;
  });
  return {
    year,
    perMonth: year / 12,
    perDay: year / 365,
    daily,
    min: { kwh: daily[lo] ?? 0, month: lo },
    max: { kwh: daily[hi] ?? 0, month: hi },
  };
}

export function fmtMoney(amount: number, currency: Currency) {
  if (!Number.isFinite(amount)) return '–';
  if (currency === 'KHR') return `${Math.round(amount).toLocaleString('en-US')} ៛`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short month name in the app language, e.g. "Jan" or "មករា". */
export function monthName(i: number, lang: string) {
  return new Date(2026, i, 15).toLocaleString(lang === 'km' ? 'km-KH' : 'en-US', { month: 'short' });
}

export function readPrice(): Price {
  try {
    const v = JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null');
    if (v && Number.isFinite(v.value) && (v.currency === 'USD' || v.currency === 'KHR')) return v;
  } catch {}
  return DEFAULT_PRICE;
}
