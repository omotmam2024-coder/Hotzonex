import { useEffect, useMemo, useState } from "react";
import { fetchLedger } from "../lib/api";
import { addDays, dateKey, daysInMonth, eachDay, longDay, monthTitle, rowDate, rowKey, shortDay, today as getToday } from "../lib/dates";
import { ALL_SITES, LOC, LOCATIONS, can, siteName } from "../lib/locations";
import { change, fmt, fmtPct, nv, runningCosts, statement } from "../lib/ledger";
import { TrendChart } from "../components/Charts";
import Kpis from "../components/Kpis";
import { Banner, Loading } from "../components/ui";

const WINDOW = 30;

export default function Today({ profile, loc, reloadKey, onRecord }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const viewAll = can(profile, "canViewAll");
  const fetchLoc = viewAll ? ALL_SITES : profile.location;

  useEffect(() => {
    let live = true;
    const t = getToday();
    // 62 days covers the last 30 days and the same dates last month.
    fetchLedger(fetchLoc, addDays(t, -62), t)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [fetchLoc, reloadKey]);

  const view = useMemo(() => (data ? summarise(data, loc) : null), [data, loc]);

  if (error && !data) return <Banner>{error}</Banner>;
  if (!view) return <Loading />;
  const { t, todayRow, todayIncome, todayKept, yesterday, trend, mtd, lastMtd, missing, sites } = view;
  const single = loc !== ALL_SITES;
  const vs = change(mtd.income, lastMtd.income);

  return (
    <div className="stack">
      <Banner>{error}</Banner>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Business overview</h1>
          <p>{longDay(t)}, <span className="site-name" style={{ "--site": LOC[loc]?.hue }}>{siteName(loc)}</span></p>
        </div>
      </div>

      <div className="hero">
        <section className="panel today-card" aria-labelledby="today-h">
          <h2 id="today-h" style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>Today's takings</h2>
          {todayRow ? (
            <>
              <div className="today-value">{fmt(todayIncome)}<small>SSP</small></div>
              <p style={{ marginTop: 12 }}>
                <strong className={todayKept < 0 ? "red" : "green"}>{fmt(todayKept)} SSP</strong> kept after today's running costs
              </p>
            </>
          ) : (
            <>
              <div className="today-value empty-state">Not recorded yet</div>
              <p className="soft" style={{ marginTop: 10 }}>
                {single ? "Nothing has been entered for today at this site." : "No site has entered today's takings yet."}
              </p>
            </>
          )}
          <p className="soft" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
            Yesterday: <strong style={{ color: "var(--text)" }}>{yesterday == null ? "not recorded" : `${fmt(yesterday)} SSP`}</strong>
          </p>
          {can(profile, "canEdit") && single && (
            <div className="actions">
              <button type="button" className="btn" onClick={() => onRecord(t)}>
                {todayRow ? "Edit today's takings" : "Record today's takings"}
              </button>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="trend-h">
          <div className="panel-head">
            <h2 id="trend-h">Last 30 days</h2>
            <span className="soft">{shortDay(addDays(t, -(WINDOW - 1)))} to today</span>
          </div>
          <TrendChart data={trend} xKey="label" height={210}
            series={[{ key: "income", name: "Taken in", color: "teal" }, { key: "profit", name: "Profit after running costs", color: "green", dashed: true }]} />
        </section>
      </div>

      <section aria-labelledby="mtd-h">
        <div className="panel-head" style={{ marginTop: 8 }}>
          <h2 id="mtd-h">{monthTitle(t)} so far</h2>
          <span className="soft">
            {vs == null ? `${mtd.days} ${mtd.days === 1 ? "day" : "days"} recorded`
              : <>Takings <strong className={vs < 0 ? "red" : "green"}>{fmtPct(vs)}</strong> on the same days last month ({fmt(lastMtd.income)} SSP)</>}
          </span>
        </div>
        <Kpis s={mtd} />
      </section>

      <div className="grid-2">
        {single && (
          <section className="panel" aria-labelledby="miss-h">
            <h2 id="miss-h" style={{ marginBottom: 10 }}>Missing days</h2>
            {missing.length === 0 ? (
              <p className="soft">Every day this month has been recorded so far.</p>
            ) : (
              <>
                <p>{missing.length === 1 ? "1 earlier day this month has" : `${missing.length} earlier days this month have`} no takings recorded: <strong className="orange">{missing.slice(0, 8).map((d) => d.getDate()).join(", ")}{missing.length > 8 ? "…" : ""}</strong></p>
                {can(profile, "canEdit") && (
                  <div className="actions"><button type="button" className="btn quiet" onClick={() => onRecord(missing[0])}>Record {shortDay(missing[0])}</button></div>
                )}
              </>
            )}
          </section>
        )}

        {viewAll && (
          <section className="panel" aria-labelledby="sites-h">
            <h2 id="sites-h" style={{ marginBottom: 6 }}>All sites today</h2>
            <ul className="sites">
              {sites.map((s) => (
                <li key={s.id}>
                  <span className="dot" style={{ background: s.hue }} />
                  <span className="grow">{s.label}
                    <span className="meta">{s.missing == null ? "Nothing recorded this month"
                      : s.missing ? `${s.missing} earlier ${s.missing === 1 ? "day" : "days"} missing this month` : "Up to date this month"}</span>
                  </span>
                  <span className="num" style={{ fontWeight: 700, color: s.recorded ? "var(--teal)" : "var(--muted)" }}>
                    {s.recorded ? `${fmt(s.income)} SSP` : "Not recorded"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function summarise(data, loc) {
  const t = getToday();
  const pick = (rows) => (loc === ALL_SITES ? rows : rows.filter((r) => r.location === loc));
  const daily = pick(data.daily), purchases = pick(data.purchases), usd = pick(data.usd);

  const byDay = new Map();
  for (const r of daily) {
    const k = rowKey(r), cur = byDay.get(k) ?? { income: 0, costs: 0 };
    byDay.set(k, { income: cur.income + nv(r.income), costs: cur.costs + runningCosts(r) });
  }
  const todayRow = byDay.get(dateKey(t));
  // Days nobody recorded are left empty, so the lines show a gap there.
  const trend = eachDay(addDays(t, -(WINDOW - 1)), t).map((d) => {
    const v = byDay.get(dateKey(d));
    return { label: shortDay(d), income: v ? v.income : null, profit: v ? v.income - v.costs : null };
  });

  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
  const lastStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const lastEnd = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(t.getDate(), daysInMonth(lastStart.getMonth(), lastStart.getFullYear())));
  const within = (rows, a, b) => rows.filter((r) => { const d = rowDate(r); return d >= a && d <= b; });
  const mtd = statement({ daily: within(daily, monthStart, t), purchases: within(purchases, monthStart, t), usd: within(usd, monthStart, t) });
  const lastMtd = statement({ daily: within(daily, lastStart, lastEnd) });

  const missingFor = (rows) => {
    const have = new Set(rows.map(rowKey));
    return eachDay(monthStart, addDays(t, -1)).filter((d) => !have.has(dateKey(d)));
  };
  const missing = missingFor(daily);

  const sites = LOCATIONS.map((l) => {
    const rows = data.daily.filter((r) => r.location === l.id);
    const todays = rows.filter((r) => rowKey(r) === dateKey(t));
    const thisMonth = within(rows, monthStart, t);
    return { ...l, recorded: todays.length > 0, income: todays.reduce((s, r) => s + nv(r.income), 0),
      missing: thisMonth.length ? missingFor(thisMonth).length : null };
  });

  return {
    t, todayRow, todayIncome: todayRow?.income ?? 0, todayKept: todayRow ? todayRow.income - todayRow.costs : 0,
    yesterday: byDay.get(dateKey(addDays(t, -1)))?.income ?? null,
    trend, mtd, lastMtd, missing, sites,
  };
}
