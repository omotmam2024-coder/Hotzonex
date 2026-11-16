import { useEffect, useMemo, useState } from "react";
import { fetchLedger } from "../lib/api";
import { addDays, dateKey, daysInMonth, eachDay, longDay, monthTitle, rowDate, rowKey, shortDay, today as getToday } from "../lib/dates";
import { ALL_SITES, COST_KEYS, COST_LABELS, LOCATIONS, can, siteName, siteColor } from "../lib/locations";
import { fmt, nv, runningCosts, statement } from "../lib/ledger";
import { DonutChart, TrendChart } from "../components/Charts";
import Kpis from "../components/Kpis";
import { Banner, Loading } from "../components/ui";

const COST_COLORS = { internet: "cyan", power: "orange", feeding: "grey", wages: "brand" };

export default function Today({ profile, loc, reloadKey, onRecord }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
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

  const view = useMemo(() => (data ? summarise(data, loc, days) : null), [data, loc, days]);

  if (error && !data) return <Banner>{error}</Banner>;
  if (!view) return <Loading />;
  const { t, todayRow, todayIncome, todayKept, yesterday, trend, mtd, lastMtd, missing, sites, bySite } = view;
  const single = loc !== ALL_SITES;
  const firstName = profile.name.split(" ")[0];

  const donut = single
    ? {
        title: "Where the money went",
        slices: [
          ...COST_KEYS.filter((k) => mtd.costs[k] > 0).map((k) => ({ name: COST_LABELS[k], value: mtd.costs[k], color: COST_COLORS[k] })),
          { name: "Purchases", value: mtd.purchases, color: "red" },
          { name: "Kept as profit", value: Math.max(mtd.profit, 0), color: "green" },
        ].filter((s) => s.value > 0),
        centre: fmt(mtd.income), label: "SSP taken in",
      }
    : {
        title: "Takings by site",
        slices: LOCATIONS.map((l) => ({ name: l.short, value: bySite[l.id] ?? 0, color: l.color })),
        centre: fmt(mtd.income), label: "SSP this month",
      };

  return (
    <div className="stack">
      <Banner>{error}</Banner>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Dashboard overview</h1>
          <p>Welcome back, {firstName}. Here's how <span className="site-name">{siteName(loc)}</span> is doing, {longDay(t)}.</p>
        </div>
      </div>

      <Kpis s={mtd} before={lastMtd} compareLabel="vs same days last month" />

      <div className="grid-2">
        <section className="panel" aria-labelledby="trend-h">
          <div className="panel-head">
            <h2 id="trend-h">Takings trend</h2>
            <label className="visually-hidden" htmlFor="trend-days">Period</label>
            <select id="trend-days" className="mini-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          {trend.every((d) => d.income == null)
            ? <div className="empty" style={{ minHeight: 260, display: "grid", placeContent: "center" }}><p>No takings were recorded in the last {days} days.</p></div>
            : <TrendChart data={trend} xKey="label"
                series={[{ key: "income", name: "Taken in (SSP)", color: "brand" }, { key: "profit", name: "Profit after running costs", color: "green" }]} />}
        </section>

        <section className="panel" aria-labelledby="donut-h">
          <div className="panel-head"><h2 id="donut-h">{donut.title}</h2><span className="soft">{monthTitle(t)}</span></div>
          <DonutChart slices={donut.slices} centre={donut.centre} centreLabel={donut.label} />
        </section>
      </div>

      <div className="grid-3">
        <section className="panel" aria-labelledby="today-h">
          <h2 id="today-h">Today's takings</h2>
          {todayRow ? (
            <>
              <div className="today-value">{fmt(todayIncome)}<small>SSP</small></div>
              <p style={{ marginTop: 8 }}><strong className={todayKept < 0 ? "red" : "green"}>{fmt(todayKept)} SSP</strong> kept after today's running costs</p>
            </>
          ) : (
            <>
              <div className="today-value empty-state">Not recorded yet</div>
              <p className="soft" style={{ marginTop: 6 }}>{single ? "Nothing entered for today at this site." : "No site has entered today's takings yet."}</p>
            </>
          )}
          <p className="soft" style={{ marginTop: 12 }}>Yesterday: <strong style={{ color: "var(--text)" }}>{yesterday == null ? "not recorded" : `${fmt(yesterday)} SSP`}</strong></p>
          {can(profile, "canEdit") && single && (
            <div className="actions"><button type="button" className="btn" onClick={() => onRecord(t)}>{todayRow ? "Edit today's takings" : "Record today's takings"}</button></div>
          )}
        </section>

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
          <section className={`panel ${single ? "" : "span-2"}`} aria-labelledby="sites-h">
            <h2 id="sites-h" style={{ marginBottom: 4 }}>All sites today</h2>
            <ul className="sites">
              {sites.map((s) => (
                <li key={s.id}>
                  <span className="dot" style={{ background: siteColor(s) }} />
                  <span className="grow">{s.label}
                    <span className="meta">{s.missing == null ? "Nothing recorded this month"
                      : s.missing ? `${s.missing} earlier ${s.missing === 1 ? "day" : "days"} missing this month` : "Up to date this month"}</span>
                  </span>
                  <span className="num" style={{ fontWeight: 600, color: s.recorded ? "var(--text)" : "var(--faint)" }}>
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

function summarise(data, loc, days) {
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
  const trend = eachDay(addDays(t, -(days - 1)), t).map((d) => {
    const v = byDay.get(dateKey(d));
    return { label: days <= 7 ? d.toLocaleDateString("en-GB", { weekday: "short" }) : shortDay(d), income: v ? v.income : null, profit: v ? v.income - v.costs : null };
  });

  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
  const lastStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const lastEnd = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(t.getDate(), daysInMonth(lastStart.getMonth(), lastStart.getFullYear())));
  const within = (rows, a, b) => rows.filter((r) => { const d = rowDate(r); return d >= a && d <= b; });
  const mtd = statement({ daily: within(daily, monthStart, t), purchases: within(purchases, monthStart, t), usd: within(usd, monthStart, t) });
  const lastMtd = statement({ daily: within(daily, lastStart, lastEnd), purchases: within(purchases, lastStart, lastEnd), usd: within(usd, lastStart, lastEnd) });

  const missingFor = (rows) => {
    const have = new Set(rows.map(rowKey));
    return eachDay(monthStart, addDays(t, -1)).filter((d) => !have.has(dateKey(d)));
  };
  const missing = missingFor(daily);

  const bySite = {};
  for (const r of within(data.daily, monthStart, t)) bySite[r.location] = (bySite[r.location] ?? 0) + nv(r.income);

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
    trend, mtd, lastMtd, missing, sites, bySite,
  };
}

