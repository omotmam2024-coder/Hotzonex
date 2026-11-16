import { useEffect, useMemo, useState } from "react";
import { fetchLedger } from "../lib/api";
import { FIRST_YEAR, MONTHS, dateKey, eachDay, periodRange, periodTitle, rowDate, rowKey, shiftPeriod, shortDay, today as getToday } from "../lib/dates";
import { ALL_SITES, LOCATIONS, siteName } from "../lib/locations";
import { change, fmt, fmtPct, statement } from "../lib/ledger";
import { BarsChart } from "../components/Charts";
import Kpis from "../components/Kpis";
import Statement from "../components/Statement";
import { Banner, Icon, Loading, Segmented, Stepper } from "../components/ui";

const KINDS = [["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "All years"]];
const PREV_LABEL = { week: "last week", month: "last month", year: "last year" };
const TWO = [{ key: "income", name: "Taken in", color: "brand" }, { key: "profit", name: "Profit", color: "green" }];
const BARS = [{ key: "income", name: "Taken in", color: "brand" }, { key: "costs", name: "Costs and purchases", color: "orange" }, { key: "profit", name: "Profit", color: "green" }];

export default function Reports({ loc, reloadKey }) {
  const [kind, setKind] = useState("month");
  const [anchor, setAnchor] = useState(getToday);
  const [result, setResult] = useState({ key: null, data: null, error: "" });

  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const prev = useMemo(() => (kind === "all" ? null : periodRange(kind, shiftPeriod(kind, anchor, -1))), [kind, anchor]);

  // Results are tagged with the request they answer, so stale figures never show.
  const reqKey = `${loc}|${kind}|${dateKey(range.from)}|${reloadKey}`;
  useEffect(() => {
    let live = true;
    fetchLedger(loc, prev ? prev.from : range.from, range.to)
      .then((d) => live && setResult({ key: reqKey, data: d, error: "" }))
      .catch((e) => live && setResult({ key: reqKey, data: null, error: e.message }));
    return () => { live = false; };
  }, [loc, range, prev, reqKey]);
  const data = result.key === reqKey ? result.data : null;
  const error = result.key === reqKey ? result.error : "";

  const report = useMemo(() => (data ? build(data, kind, range, prev, loc) : null), [data, kind, range, prev, loc]);
  const t = getToday();
  const atLatest = range.to >= t;

  function exportCsv() {
    const lines = [report.table.head, ...report.table.rows.map((r) => r.cells), report.table.foot]
      .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hotzonex-${loc.toLowerCase()}-${kind}-${dateKey(range.from)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="print-only" style={{ marginBottom: 16, alignItems: "center", gap: 16 }}>
        <img className="print-logo" src="/logo.png" alt="Hotzonex" />
        <div>
          <h1>Hotzonex report</h1>
          <p>{siteName(loc)}, {periodTitle(kind, anchor)}. Printed {shortDay(t)} {t.getFullYear()}.</p>
        </div>
      </div>
      <div className="page-head no-print">
        <div><h1>Reports</h1><p>Money in and out for <span className="site-name">{siteName(loc)}</span>.</p></div>
        <Segmented label="Period" value={kind} options={KINDS} onChange={(k) => { setKind(k); setAnchor(getToday()); }} />
      </div>
      <Banner>{error}</Banner>

      <div className="panel-head no-print" style={{ flexWrap: "wrap" }}>
        {kind === "all"
          ? <strong>{periodTitle(kind, anchor)}</strong>
          : <Stepper title={periodTitle(kind, anchor)} onPrev={() => setAnchor(shiftPeriod(kind, anchor, -1))}
              onNext={() => setAnchor(shiftPeriod(kind, anchor, 1))} nextDisabled={atLatest}
              prevLabel={`Previous ${kind}`} nextLabel={`Next ${kind}`} />}
        {report && (
          <span className="row-actions">
            <button type="button" className="btn quiet small" onClick={() => window.print()}><Icon name="print" size={16} />Print or save PDF</button>
            <button type="button" className="btn quiet small" onClick={exportCsv}><Icon name="download" size={16} />Export CSV</button>
          </span>
        )}
      </div>

      {!report ? (!error && <Loading />) : (
        <div className="stack">
          <Kpis s={report.s} before={report.before} compareLabel={kind === "all" ? undefined : report.partial ? `vs same days ${PREV_LABEL[kind]}` : `from ${PREV_LABEL[kind]}`} />
          <div className="grid-2">
            <section className="panel" aria-labelledby="st-h">
              <div className="panel-head">
                <h2 id="st-h">Money in and out</h2>
                {report.vs != null && (
                  <span className="soft">Takings <strong className={report.vs < 0 ? "red" : "green"}>{fmtPct(report.vs)}</strong> on {report.partial ? `the same days ${PREV_LABEL[kind]}` : PREV_LABEL[kind]}</span>
                )}
              </div>
              <Statement s={report.s} />
            </section>
            {report.chart.length > 1 && <section className="panel" aria-labelledby="ch-h">
              <div className="panel-head">
                <h2 id="ch-h">{report.unit === "year" ? "Year by year" : `By ${report.unit}`}</h2>
                {report.s.margin != null && <span className="soft">You keep {Math.round(report.s.margin)}% of takings</span>}
              </div>
              <BarsChart key={kind + dateKey(range.from)} data={report.chart} xKey="label" series={kind === "month" ? TWO : BARS} />
              {report.missingCount > 0 && (
                <p className="soft" style={{ marginTop: 10 }}>
                  {report.missingCount} {report.missingCount === 1 ? "day has" : "days have"} no takings recorded in this period{kind === "month" ? " (empty spaces in the chart)" : ""}.
                </p>
              )}
            </section>}
          </div>

          <section className="panel" aria-labelledby="tb-h">
            <h2 id="tb-h" style={{ marginBottom: 10 }}>{report.table.title}</h2>
            {report.table.rows.length === 0 ? <div className="empty"><p>Nothing was recorded in this period.</p></div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>{report.table.head.map((h, i) => <th key={h} className={i ? "r" : ""}>{h}</th>)}</tr></thead>
                  <tbody>
                    {report.table.rows.map((r) => (
                      <tr key={r.key} className={r.muted ? "muted" : ""}>
                        {r.cells.map((c, i) => <td key={i} className={i ? "r" : ""}>{i && typeof c === "number" ? fmt(c) : c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>{report.table.foot.map((c, i) => <td key={i} className={i ? "r" : ""}>{i && typeof c === "number" ? fmt(c) : c}</td>)}</tr></tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function build(data, kind, range, prev, loc) {
  const t = getToday();
  const inRange = (rows, r) => rows.filter((x) => { const d = rowDate(x); return d >= r.from && d <= r.to; });
  const cur = { daily: inRange(data.daily, range), purchases: inRange(data.purchases, range), usd: inRange(data.usd, range) };
  const s = statement(cur);
  // While a period is still running, compare it with the same number of days
  // at the start of the previous period, not the whole of it.
  const elapsed = Math.round((Math.min(t, range.to) - range.from) / 86400000);
  const prevCut = prev && { from: prev.from, to: new Date(Math.min(prev.to, prev.from.getTime() + elapsed * 86400000)) };
  const partial = range.to > t;
  const before = prev ? statement({ daily: inRange(data.daily, prevCut), purchases: inRange(data.purchases, prevCut), usd: inRange(data.usd, prevCut) }) : null;
  const vs = before ? change(s.income, before.income) : null;

  // Buckets: days for week and month, months for a year, years for all.
  let buckets;
  if (kind === "week" || kind === "month") {
    buckets = eachDay(range.from, range.to).map((d) => ({
      key: dateKey(d), label: kind === "week" ? `${shortDay(d)} (${d.toLocaleDateString("en-GB", { weekday: "short" })})` : shortDay(d),
      test: (r) => rowKey(r) === dateKey(d), future: d > t,
    }));
  } else if (kind === "year") {
    const y = range.from.getFullYear();
    buckets = MONTHS.map((m, i) => ({ key: m, label: `${m} ${y}`, test: (r) => r.month === m && r.year === y, future: new Date(y, i, 1) > t }));
  } else {
    buckets = [];
    for (let y = FIRST_YEAR; y <= t.getFullYear(); y++) buckets.push({ key: String(y), label: String(y), test: (r) => r.year === y, future: false });
  }

  const sliced = buckets.map((b) => {
    const part = { daily: cur.daily.filter(b.test), purchases: cur.purchases.filter(b.test), usd: cur.usd.filter(b.test) };
    return { ...b, s: statement(part), empty: !part.daily.length && !part.purchases.length && !part.usd.length };
  });
  const dayBuckets = kind === "week" || kind === "month";
  // Chart points. Periods with nothing recorded (or still to come) stay empty.
  const chart = sliced.map((b) => {
    const none = b.future || (dayBuckets ? b.s.days === 0 : b.empty);
    const label = kind === "week" ? b.label.split(" (")[1]?.replace(")", "") : kind === "year" ? b.key.slice(0, 3) : b.label;
    return { label, income: none ? null : b.s.income, profit: none ? null : b.s.profit, costs: none ? null : b.s.running + b.s.purchases };
  });
  const missingCount = dayBuckets ? sliced.filter((b) => !b.future && b.s.days === 0).length : 0;

  const head5 = ["Taken in", "Running costs", "Purchases", "Profit", "To USD"];
  let table;
  if (loc === ALL_SITES) {
    const rows = LOCATIONS.map((l) => {
      const st = statement({ daily: cur.daily.filter((r) => r.location === l.id), purchases: cur.purchases.filter((r) => r.location === l.id), usd: cur.usd.filter((r) => r.location === l.id) });
      return { key: l.id, muted: st.days === 0 && !st.purchases, cells: [l.label, st.income, st.running, st.purchases, st.profit, st.usdSSP, st.cashLeft] };
    });
    table = { title: "By site", head: ["Site", ...head5, "Cash left"], rows, foot: ["All sites", s.income, s.running, s.purchases, s.profit, s.usdSSP, s.cashLeft] };
  } else {
    const unitName = dayBuckets ? "Day" : kind === "year" ? "Month" : "Year";
    const rows = sliced
      .filter((b) => !b.future && (dayBuckets || !b.empty))
      .map((b) => ({ key: b.key, muted: b.empty,
        cells: b.empty ? [b.label, "Not recorded", "", "", "", ""] : [b.label, b.s.income, b.s.running, b.s.purchases, b.s.profit, b.s.usdSSP] }));
    table = { title: `By ${unitName.toLowerCase()}`, head: [unitName, ...head5], rows, foot: ["Total", s.income, s.running, s.purchases, s.profit, s.usdSSP] };
  }

  return { s, before, vs, partial, chart, missingCount, table, unit: dayBuckets ? "day" : kind === "year" ? "month" : "year" };
}
