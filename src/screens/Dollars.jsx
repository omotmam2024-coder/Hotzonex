import { useEffect, useMemo, useState } from "react";
import { deleteRow, deleteUsdSpending, fetchLedger, fetchUsdSpending, saveRow, saveUsdSpending } from "../lib/api";
import { FIRST_YEAR, rowDate, shortDay, today as getToday, toRowFields } from "../lib/dates";
import { ALL_SITES, LOC, LOCATIONS, can } from "../lib/locations";
import { fmt, fmtUSD, nv, statement } from "../lib/ledger";
import { DonutChart, TrendChart } from "../components/Charts";
import { Banner, DeleteButton, Field, Icon, Loading } from "../components/ui";

const SPEND_CATEGORIES = ["Devices / equipment", "Other business purchase", "Taken out as cash", "Other"];
const SPEND_COLORS = { "Devices / equipment": "orange", "Other business purchase": "red", "Taken out as cash": "cyan", Other: "grey" };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function Dollars({ profile, reloadKey, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null); // { kind: "exchange" | "spend", row }
  const edit = can(profile, "canAdjust");

  useEffect(() => {
    let live = true;
    Promise.all([fetchLedger(ALL_SITES, new Date(FIRST_YEAR, 0, 1), getToday()), fetchUsdSpending()])
      .then(([ledger, spending]) => { if (live) { setData({ ledger, spending }); setError(""); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [reloadKey, version]);

  const w = useMemo(() => (data ? wallet(data) : null), [data]);
  const done = (msg) => { setEditing(null); notify(msg); setVersion((v) => v + 1); };

  if (error && !data) return <Banner>{error}</Banner>;
  if (!w) return <Loading label="Loading your dollars…" />;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Dollars</h1>
          <p>Profit you've changed into US dollars, and what's left, for the whole business.</p>
        </div>
      </div>
      <Banner>{error}</Banner>

      <div className="kpis">
        <Card label="Dollar balance" icon="cash" color="var(--brand)" value={fmtUSD(w.held)}
          sub={w.latestRate ? `Worth about ${fmt(w.held * w.latestRate)} SSP at today's rate` : "No exchanges yet"} />
        <Card label="SSP not yet exchanged" icon="trend" color={w.sspLeft < 0 ? "var(--red)" : "var(--green)"} value={`${fmt(w.sspLeft)}`} unit="SSP"
          sub={`Of ${fmt(w.profit)} SSP total profit`} />
        <Card label="Dollars bought" icon="up" color="var(--cyan)" value={fmtUSD(w.bought)}
          sub={w.exchanges.length ? `For ${fmt(w.sspExchanged)} SSP in ${w.exchanges.length} ${w.exchanges.length === 1 ? "exchange" : "exchanges"}` : "No exchanges yet"} />
        <Card label="Dollars spent" icon="cart" color="var(--orange)" value={fmtUSD(w.spent)}
          sub={w.spent ? `Mostly on ${w.topSpend.toLowerCase()}` : "Nothing spent yet"} />
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="rate-h">
          <div className="panel-head">
            <h2 id="rate-h">Exchange rate</h2>
            {w.fall != null && (
              <span className={w.fall > 0 ? "red" : "green"} style={{ fontWeight: 600 }}>
                {w.fall > 0 ? `SSP has lost ${w.fall.toFixed(0)}% of its value` : `SSP has gained ${Math.abs(w.fall).toFixed(0)}%`} since {w.firstDate}
              </span>
            )}
          </div>
          {w.rates.length < 2
            ? <div className="empty" style={{ minHeight: 220, display: "grid", placeContent: "center" }}><p>{w.rates.length ? `One exchange so far, at ${fmt(w.rates[0].rate)} SSP for $1. The trend appears after the next one.` : "Record your first exchange below to start the rate chart."}</p></div>
            : <TrendChart data={w.rates} xKey="label" height={240} series={[{ key: "rate", name: "SSP for $1", color: "brand" }]} />}
        </section>

        <section className="panel" aria-labelledby="split-h">
          <div className="panel-head"><h2 id="split-h">Where your dollars are</h2></div>
          <DonutChart centre={fmtUSD(w.bought)} centreLabel="bought in total"
            slices={[{ name: "Still held (savings)", value: w.held, color: "green" }, ...w.spendSlices]}
            formatValue={(v) => fmtUSD(v)} />
        </section>
      </div>

      {edit && (
        <div className="grid-2 even">
          <ExchangeForm key={editing?.kind === "exchange" ? editing.row.id : "new-x"} editing={editing?.kind === "exchange" ? editing.row : null}
            defaultSite={profile.location} onDone={done} onCancel={() => setEditing(null)} lastRate={w.latestRate} />
          <SpendForm key={editing?.kind === "spend" ? editing.row.id : "new-s"} editing={editing?.kind === "spend" ? editing.row : null}
            held={w.held} onDone={done} onCancel={() => setEditing(null)} />
        </div>
      )}

      <section className="panel" aria-labelledby="hist-h">
        <h2 id="hist-h" style={{ marginBottom: 10 }}>Dollar history</h2>
        {w.history.length === 0 ? <div className="empty"><p>No exchanges or dollar spending yet.</p></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>What</th><th className="r">SSP</th><th className="r">Rate</th><th className="r">Dollars</th><th className="r">Balance</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {w.history.map((h) => (
                  <tr key={h.key} className={editing?.row?.id === h.row.id && editing?.kind === h.kind ? "is-editing" : ""}>
                    <td>{longDate(h.date)}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 180 }}>
                      {h.kind === "exchange"
                        ? <>Exchanged{LOC[h.row.location] ? <span className="soft"> from {LOC[h.row.location].label}</span> : null}</>
                        : <>{h.row.description}<span className="soft"> – {h.row.category}</span></>}
                      {h.row.notes ? <span className="soft" style={{ display: "block", fontSize: 12 }}>{h.row.notes}</span> : null}
                    </td>
                    <td className="r">{h.kind === "exchange" ? fmt(h.row.ssp_amount) : "–"}</td>
                    <td className="r">{h.kind === "exchange" ? fmt(h.row.rate) : "–"}</td>
                    <td className={`r ${h.kind === "exchange" ? "green" : "red"}`} style={{ fontWeight: 600 }}>{h.kind === "exchange" ? "+" : "−"}{fmtUSD(h.usd)}</td>
                    <td className="r"><strong>{fmtUSD(h.balance)}</strong></td>
                    <td>
                      <div className="row-actions">
                        {edit && <button type="button" className="btn quiet small" onClick={() => { setEditing({ kind: h.kind, row: h.row }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>}
                        {can(profile, "canDelete") && <DeleteButton onDelete={async () => {
                          try { if (h.kind === "exchange") await deleteRow("usd", h.row.id); else await deleteUsdSpending(h.row.id); done("Deleted"); }
                          catch (e) { setError(e.message); }
                        }} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, icon, color, value, unit, sub }) {
  return (
    <div className="kpi" style={{ "--kpi": color }}>
      <div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-icon" aria-hidden="true"><Icon name={icon} size={17} /></span></div>
      <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function wallet({ ledger, spending }) {
  const s = statement(ledger); // all sites, all time
  const exchanges = [...ledger.usd].sort((a, b) => rowDate(a) - rowDate(b) || a.id - b.id);
  const bought = exchanges.reduce((t, r) => t + nv(r.usd_amount), 0);
  const sspExchanged = exchanges.reduce((t, r) => t + nv(r.ssp_amount), 0);
  const spent = spending.reduce((t, r) => t + nv(r.amount_usd), 0);

  const byCat = {};
  for (const r of spending) byCat[r.category] = (byCat[r.category] ?? 0) + nv(r.amount_usd);
  const spendSlices = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name: `Spent: ${name.toLowerCase()}`, value, color: SPEND_COLORS[name] ?? "grey" }));

  const rates = exchanges.filter((r) => nv(r.rate) > 0).map((r) => ({ label: shortDay(rowDate(r)), rate: nv(r.rate) }));
  const first = rates[0]?.rate, latest = rates.at(-1)?.rate;

  const events = [
    ...exchanges.map((r) => ({ kind: "exchange", key: `x${r.id}`, row: r, date: rowDate(r), usd: nv(r.usd_amount) })),
    ...spending.map((r) => ({ kind: "spend", key: `s${r.id}`, row: r, date: fromIso(r.spent_on), usd: nv(r.amount_usd) })),
  ].sort((a, b) => a.date - b.date || (a.kind === "exchange" ? -1 : 1));
  let bal = 0;
  for (const e of events) { bal += e.kind === "exchange" ? e.usd : -e.usd; e.balance = bal; }

  return {
    profit: s.profit, sspExchanged, sspLeft: s.profit - sspExchanged,
    bought, spent, held: bought - spent, exchanges, spendSlices,
    topSpend: spendSlices[0]?.name.replace("Spent: ", "") ?? "",
    rates, latestRate: latest ?? null,
    fall: first && latest ? (1 - first / latest) * 100 : null,
    firstDate: rates.length ? rates[0].label : "",
    history: events.reverse(),
  };
}

function MoneyInput({ id, value, onChange, decimals }) {
  return (
    <input id={id} inputMode={decimals ? "decimal" : "numeric"} autoComplete="off" placeholder="0"
      value={value === "" ? "" : decimals ? value : Number(value).toLocaleString("en-US")}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        if (decimals ? /^\d*\.?\d{0,2}$/.test(raw) : /^\d*$/.test(raw)) onChange(raw);
      }} />
  );
}

function ExchangeForm({ editing, defaultSite, onDone, onCancel, lastRate }) {
  const today = iso(getToday());
  const [f, setF] = useState(() => editing
    ? { date: iso(rowDate(editing)), site: editing.location, ssp: String(nv(editing.ssp_amount)), rate: String(nv(editing.rate)), notes: editing.notes ?? "" }
    : { date: today, site: LOC[defaultSite] ? defaultSite : LOCATIONS[0]?.id, ssp: "", rate: lastRate ? String(lastRate) : "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const usd = nv(f.ssp) > 0 && nv(f.rate) > 0 ? nv(f.ssp) / nv(f.rate) : 0;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (nv(f.ssp) <= 0) return setError("Enter how many SSP you changed.");
    if (nv(f.rate) <= 0) return setError("Enter the rate: how many SSP bought $1.");
    setBusy(true); setError("");
    try {
      const d = fromIso(f.date);
      await saveRow("usd", { ...toRowFields(d), location: f.site, ssp_amount: nv(f.ssp), rate: nv(f.rate), usd_amount: Math.round(usd * 100) / 100, notes: f.notes.trim() }, editing?.id);
      onDone(editing ? "Exchange updated" : `Exchange saved: ${fmtUSD(usd)} added`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2 style={{ marginBottom: 4 }}>{editing ? "Change this exchange" : "Change SSP into dollars"}</h2>
      <p className="soft" style={{ marginBottom: 14, fontSize: 13 }}>The dollars are added to your balance. Profit stays the same.</p>
      <div className="fields">
        <div className="fields two">
          <Field label="Date">{(id) => <input id={id} type="date" max={today} value={f.date} onChange={(e) => set("date")(e.target.value)} />}</Field>
          <Field label="From which site's money">{(id) => (
            <select id={id} value={f.site} onChange={(e) => set("site")(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>)}</Field>
          <Field label="SSP changed">{(id) => <MoneyInput id={id} value={f.ssp} onChange={set("ssp")} />}</Field>
          <Field label="Rate (SSP for $1)">{(id) => <MoneyInput id={id} value={f.rate} onChange={set("rate")} />}</Field>
        </div>
        <Field label="Notes (optional)" hint="For example the bank or forex bureau.">{(id) => <input id={id} value={f.notes} onChange={(e) => set("notes")(e.target.value)} />}</Field>
      </div>
      <p style={{ marginTop: 14 }}>You receive <strong className="green">{fmtUSD(usd)}</strong></p>
      <Banner>{error}</Banner>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Update exchange" : "Save exchange"}</button>
        {editing && <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function SpendForm({ editing, held, onDone, onCancel }) {
  const today = iso(getToday());
  const [f, setF] = useState(() => editing
    ? { date: editing.spent_on, usd: String(nv(editing.amount_usd)), category: editing.category, description: editing.description, notes: editing.notes ?? "" }
    : { date: today, usd: "", category: SPEND_CATEGORIES[0], description: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const after = held + (editing ? nv(editing.amount_usd) : 0) - nv(f.usd);

  async function save(e) {
    e.preventDefault();
    if (nv(f.usd) <= 0) return setError("Enter how many dollars you spent.");
    if (!f.description.trim()) return setError("Say what the dollars were spent on, for example a MikroTik router.");
    setBusy(true); setError("");
    try {
      await saveUsdSpending({ spent_on: f.date, amount_usd: nv(f.usd), category: f.category, description: f.description.trim(), notes: f.notes.trim() || null }, editing?.id);
      onDone(editing ? "Spending updated" : `Saved: ${fmtUSD(nv(f.usd))} spent`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2 style={{ marginBottom: 4 }}>{editing ? "Change this spending" : "Spend dollars"}</h2>
      <p className="soft" style={{ marginBottom: 14, fontSize: 13 }}>Lowers your dollar balance. It doesn't change profit.</p>
      <div className="fields">
        <div className="fields two">
          <Field label="Date">{(id) => <input id={id} type="date" max={today} value={f.date} onChange={(e) => set("date")(e.target.value)} />}</Field>
          <Field label="Dollars spent">{(id) => <MoneyInput id={id} value={f.usd} onChange={set("usd")} decimals />}</Field>
        </div>
        <Field label="What kind of spending">{(id) => (
          <select id={id} value={f.category} onChange={(e) => set("category")(e.target.value)}>
            {SPEND_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>)}</Field>
        <Field label="What was bought">{(id) => <input id={id} value={f.description} placeholder="e.g. MikroTik router for Main Office" onChange={(e) => set("description")(e.target.value)} />}</Field>
        <Field label="Notes (optional)">{(id) => <input id={id} value={f.notes} onChange={(e) => set("notes")(e.target.value)} />}</Field>
      </div>
      <p style={{ marginTop: 14 }}>Balance after this: <strong className={after < 0 ? "red" : ""}>{fmtUSD(after)}</strong>
        {after < 0 && <span className="red"> (more than you hold)</span>}</p>
      <Banner>{error}</Banner>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Update spending" : "Save spending"}</button>
        {editing && <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

