// All money maths lives here so every screen agrees.
//   profit    = taken in − running costs − purchases
//   cash left = profit − SSP moved into USD savings
import { COST_KEYS } from "./locations";

export const nv = (v) => Number(v) || 0;

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (n) => (n < 0 ? "−" : "") + nf.format(Math.abs(Math.round(nv(n))));
export const fmtSigned = (n) => (n > 0 ? "+" : "") + fmt(n);
export const fmtUSD = (n) => "$" + usdf.format(nv(n));
export const fmtPct = (p) => (p == null ? "–" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(0)}%`);

// A day's running costs. Every cost column counts, even ones a site
// doesn't normally use, so no recorded money is ever hidden.
export const runningCosts = (row) => COST_KEYS.reduce((s, k) => s + nv(row[k]), 0);

export function statement({ daily = [], purchases = [], usd = [] }) {
  const costs = Object.fromEntries(COST_KEYS.map((k) => [k, 0]));
  let income = 0;
  for (const r of daily) {
    income += nv(r.income);
    for (const k of COST_KEYS) costs[k] += nv(r[k]);
  }
  const running = COST_KEYS.reduce((s, k) => s + costs[k], 0);
  const bought = purchases.reduce((s, r) => s + nv(r.amount), 0);
  const usdSSP = usd.reduce((s, r) => s + nv(r.ssp_amount), 0);
  const usdUSD = usd.reduce((s, r) => s + nv(r.usd_amount), 0);
  const profit = income - running - bought;
  return {
    income, costs, running, purchases: bought, profit,
    usdSSP, usdUSD, cashLeft: profit - usdSSP,
    margin: income > 0 ? (profit / income) * 100 : null,
    days: daily.length,
  };
}

export const change = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

export const sumBy = (rows, key) => rows.reduce((s, r) => s + nv(r[key]), 0);
