import { useEffect, useMemo, useState } from "react";
import { deleteRow, fetchDaily, fetchPurchases, fetchUsd, saveRow, saveTakings } from "../lib/api";
import { MONTHS, dateKey, daysInMonth, longDay, monthTitle, rowKey, today as getToday, toRowFields } from "../lib/dates";
import { ALL_SITES, COST_KEYS, COST_LABELS, LOC, LOCATIONS, PURCHASE_CATEGORIES, can, siteColor } from "../lib/locations";
import { fmt, fmtUSD, nv, runningCosts } from "../lib/ledger";
import { Banner, DeleteButton, Field, Loading, Segmented, Stepper } from "../components/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Record({ profile, loc, onPickSite, startDate, reloadKey, notify }) {
  const t = getToday();
  const [tab, setTabState] = useState("takings");
  const [editing, setEditing] = useState(null); // a purchase or exchange row being changed
  const [date, setDate] = useState(startDate ?? t);
  const [loaded, setLoaded] = useState(null); // { key, daily, purchases, usd }
  const [error, setError] = useState("");
  const month = useMemo(() => new Date(date.getFullYear(), date.getMonth(), 1), [date]);
  const isCurrentMonth = month.getFullYear() === t.getFullYear() && month.getMonth() === t.getMonth();
  const rows = loaded?.key === `${loc}|${dateKey(month)}` ? loaded : null; // only this month's records

  const [version, setVersion] = useState(0); // bumped after every save or delete

  useEffect(() => {
    if (loc === ALL_SITES) return;
    let live = true;
    const to = new Date(month.getFullYear(), month.getMonth(), daysInMonth(month.getMonth(), month.getFullYear()));
    Promise.all([fetchDaily(loc, month, to), fetchPurchases(loc, month, to), fetchUsd(loc, month, to)])
      .then(([daily, purchases, usd]) => { if (live) { setLoaded({ key: `${loc}|${dateKey(month)}`, daily, purchases, usd }); setError(""); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [loc, month, reloadKey, version]);

  if (loc === ALL_SITES) {
    return (
      <div>
        <div className="page-head"><div><h1>Record</h1><p>Choose the site you're recording for.</p></div></div>
        <ul className="sites panel">
          {LOCATIONS.map((l) => (
            <li key={l.id}>
              <span className="dot" style={{ background: siteColor(l) }} />
              <span className="grow">{l.label}</span>
              <button type="button" className="btn quiet small" onClick={() => onPickSite(l.id)}>Record here</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const shiftMonth = (step) => {
    const m = new Date(month.getFullYear(), month.getMonth() + step, 1);
    const sameAsNow = m.getFullYear() === t.getFullYear() && m.getMonth() === t.getMonth();
    setEditing(null);
    setDate(sameAsNow ? t : m);
  };
  const saved = (msg) => { setEditing(null); notify(msg); setVersion((v) => v + 1); };
  const setTab = (v) => { setEditing(null); setTabState(v); };

  return (
    <div>
      <div className="page-head">
        <div><h1>Record</h1><p>{LOC[loc].label}</p></div>
        <Segmented label="What to record" value={tab} onChange={setTab}
          options={[["takings", "Takings"], ["purchase", "Purchase"], ["usd", "USD exchange"]]} />
      </div>
      <Banner>{error}</Banner>
      <div className="stack">
        <section className="panel narrow">
          <div className="panel-head">
            <Stepper title={monthTitle(month)} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)}
              nextDisabled={isCurrentMonth} prevLabel="Previous month" nextLabel="Next month" />
          </div>
          {!rows ? <Loading /> : tab === "takings"
            ? <TakingsForm key={dateKey(date) + loc} loc={loc} date={date} setDate={setDate} month={month} rows={rows.daily} onSaved={saved} />
            : tab === "purchase"
              ? <PurchaseForm key={`p${dateKey(month)}${loc}${editing?.id ?? ""}`} loc={loc} month={month} editing={editing} onSaved={saved} onCancel={() => setEditing(null)} />
              : <UsdForm key={`u${dateKey(month)}${loc}${editing?.id ?? ""}`} loc={loc} month={month} editing={editing} onSaved={saved} onCancel={() => setEditing(null)} />}
        </section>
        <section className="panel" aria-label="Entries this month">
          {!rows ? <Loading /> : tab === "takings"
            ? <TakingsList loc={loc} profile={profile} rows={rows.daily} selected={date} onPick={setDate} onDeleted={() => saved("Day deleted")} />
            : tab === "purchase"
              ? <SimpleList kind="purchases" profile={profile} rows={rows.purchases} month={month} editing={editing} onEdit={setEditing} onDeleted={() => saved("Purchase deleted")}
                  columns={[["Day", (r) => r.day], ["Bought", (r) => <>{r.description}<span className="soft"> – {r.category}</span></>], ["SSP", (r) => fmt(r.amount), true]]}
                  total={(rs) => fmt(rs.reduce((s, r) => s + nv(r.amount), 0))} empty="No purchases this month." />
              : <SimpleList kind="usd" profile={profile} rows={rows.usd} month={month} editing={editing} onEdit={setEditing} onDeleted={() => saved("Exchange deleted")}
                  columns={[["Day", (r) => r.day], ["SSP", (r) => fmt(r.ssp_amount), true], ["Rate", (r) => fmt(r.rate), true], ["USD", (r) => fmtUSD(r.usd_amount), true]]}
                  total={(rs) => `${fmtUSD(rs.reduce((s, r) => s + nv(r.usd_amount), 0))} bought`} empty="No exchanges this month." />}
        </section>
      </div>
    </div>
  );
}

/* ── Takings ─────────────────────────────────────────────────────────── */
function MonthStrip({ month, date, setDate, recorded }) {
  const t = getToday();
  const dim = daysInMonth(month.getMonth(), month.getFullYear());
  const lead = (month.getDay() + 6) % 7;
  return (
    <div>
      <div className="strip" role="group" aria-label={`Days in ${monthTitle(month)}`}>
        {WEEKDAYS.map((w) => <span key={w} className="wd" aria-hidden="true">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={"x" + i} />)}
        {Array.from({ length: dim }, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          const future = d > t, done = recorded.has(dateKey(d)), isToday = d.getTime() === t.getTime();
          const state = future ? "future" : done ? "done" : isToday ? "" : "missing";
          return (
            <button key={i} type="button" className={`day ${state} ${isToday ? "is-today" : ""}`} disabled={future}
              aria-pressed={d.getTime() === date.getTime()} onClick={() => setDate(d)}
              aria-label={`${longDay(d)}${done ? ", recorded" : future ? "" : ", not recorded"}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="cal-legend"><span className="l-done">Recorded</span><span className="l-missing">Not recorded</span></div>
    </div>
  );
}

function TakingsForm({ loc, date, setDate, month, rows, onSaved }) {
  const existing = rows.find((r) => rowKey(r) === dateKey(date));
  // Show the site's usual costs, plus any other cost already entered for this day.
  const keys = COST_KEYS.filter((k) => LOC[loc].expKeys.includes(k) || nv(existing?.[k]) > 0);
  const [form, setForm] = useState(() => Object.fromEntries(["income", ...COST_KEYS].map((k) => [k, existing ? String(existing[k] ?? "") : ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorded = useMemo(() => new Set(rows.map(rowKey)), [rows]);
  const income = nv(form.income), costs = runningCosts(form);

  async function save(e) {
    e.preventDefault();
    if (form.income === "") { setError("Enter the takings for this day. Use 0 if the site took nothing."); return; }
    setBusy(true); setError("");
    try {
      const fields = { ...toRowFields(date), location: loc, income: nv(form.income) };
      for (const k of COST_KEYS) fields[k] = nv(form[k]);
      await saveTakings(fields, existing?.id);
      await onSaved(existing ? "Day updated" : "Day saved");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <MonthStrip month={month} date={date} setDate={setDate} recorded={recorded} />
      <form onSubmit={save} style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 14 }}>{longDay(date)}{existing && <span className="soft" style={{ fontWeight: 500 }}> – editing</span>}</h2>
        <div className="fields">
          <Field label="Taken in (SSP)">
            {(id) => <MoneyInput id={id} value={form.income} onChange={(v) => setForm((f) => ({ ...f, income: v }))} />}
          </Field>
          <div className="fields two">
            {keys.map((k) => (
              <Field key={k} label={`${COST_LABELS[k]} (SSP)`}>
                {(id) => <MoneyInput id={id} value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />}
              </Field>
            ))}
          </div>
        </div>
        <p style={{ marginTop: 16 }}>
          Profit for the day: <strong className={income - costs < 0 ? "out" : "in"}>{fmt(income - costs)} SSP</strong>
        </p>
        <Banner>{error}</Banner>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : existing ? "Update day" : "Save day"}</button>
        </div>
      </form>
    </>
  );
}

function TakingsList({ loc, profile, rows, selected, onPick, onDeleted }) {
  const keys = COST_KEYS.filter((k) => LOC[loc].expKeys.includes(k) || rows.some((r) => nv(r[k]) > 0));
  const [error, setError] = useState("");
  if (!rows.length) return <div className="empty"><p>No days recorded this month yet.</p></div>;
  const total = (k) => rows.reduce((s, r) => s + nv(r[k]), 0);
  const tIncome = total("income"), tCosts = rows.reduce((s, r) => s + runningCosts(r), 0);
  return (
    <>
      <h2 style={{ marginBottom: 10 }}>{rows.length} {rows.length === 1 ? "day" : "days"} recorded</h2>
      <Banner>{error}</Banner>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Day</th><th className="r">Taken in</th>{keys.map((k) => <th key={k} className="r">{COST_LABELS[k]}</th>)}<th className="r">Profit</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = nv(r.income) - runningCosts(r);
              const isSel = rowKey(r) === dateKey(selected);
              return (
                <tr key={r.id} className={isSel ? "is-editing" : ""}>
                  <td><button type="button" className="link-btn" onClick={() => onPick(new Date(r.year, MONTHS.indexOf(r.month), r.day))}>{r.day}</button></td>
                  <td className="r">{fmt(r.income)}</td>
                  {keys.map((k) => <td key={k} className="r">{nv(r[k]) ? fmt(r[k]) : "–"}</td>)}
                  <td className={`r ${p < 0 ? "out" : ""}`}>{fmt(p)}</td>
                  <td>{can(profile, "canDelete") && (
                    <div className="row-actions"><DeleteButton onDelete={async () => {
                      try { await deleteRow("daily", r.id); onDeleted(); } catch (e) { setError(e.message); }
                    }} /></div>)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>Total</td><td className="r">{fmt(tIncome)}</td>{keys.map((k) => <td key={k} className="r">{fmt(total(k))}</td>)}<td className="r">{fmt(tIncome - tCosts)}</td><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ── Purchases and USD ───────────────────────────────────────────────── */
function DaySelect({ month, value, onChange, id }) {
  const t = getToday();
  const dim = daysInMonth(month.getMonth(), month.getFullYear());
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: dim }, (_, i) => i + 1)
        .filter((d) => new Date(month.getFullYear(), month.getMonth(), d) <= t)
        .map((d) => <option key={d} value={d}>{longDay(new Date(month.getFullYear(), month.getMonth(), d))}</option>)}
    </select>
  );
}

const defaultDay = (month) => {
  const t = getToday();
  return month.getFullYear() === t.getFullYear() && month.getMonth() === t.getMonth()
    ? t.getDate() : daysInMonth(month.getMonth(), month.getFullYear());
};

function PurchaseForm({ loc, month, editing, onSaved, onCancel }) {
  const [form, setForm] = useState(() => editing
    ? { day: editing.day, category: editing.category || "Other", description: editing.description ?? "", amount: String(editing.amount ?? ""), notes: editing.notes ?? "" }
    : { day: defaultDay(month), category: "Other", description: "", amount: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (!form.description.trim()) { setError("Say what was bought, for example \"Ethernet cable\"."); return; }
    if (nv(form.amount) <= 0) { setError("Enter what it cost in SSP."); return; }
    setBusy(true); setError("");
    try {
      await saveRow("purchases", { year: month.getFullYear(), month: MONTHS[month.getMonth()], day: form.day, location: loc,
        description: form.description.trim(), amount: nv(form.amount), category: form.category, notes: form.notes.trim() }, editing?.id);
      await onSaved(editing ? "Purchase updated" : "Purchase saved");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      <h2 style={{ marginBottom: 6 }}>{editing ? "Change this purchase" : "A one-off purchase"}</h2>
      <p className="soft" style={{ marginBottom: 16 }}>Equipment, repairs and other costs that aren't part of a normal day.</p>
      <div className="fields">
        <div className="fields two">
          <Field label="Day">{(id) => <DaySelect id={id} month={month} value={form.day} onChange={set("day")} />}</Field>
          <Field label="Category">{(id) => (
            <select id={id} value={form.category} onChange={(e) => set("category")(e.target.value)}>
              {PURCHASE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>)}</Field>
        </div>
        <Field label="What was bought">{(id) => <input id={id} value={form.description} onChange={(e) => set("description")(e.target.value)} />}</Field>
        <Field label="Cost (SSP)">{(id) => <MoneyInput id={id} value={form.amount} onChange={set("amount")} />}</Field>
        <Field label="Notes (optional)">{(id) => <input id={id} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />}</Field>
      </div>
      <Banner>{error}</Banner>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Update purchase" : "Save purchase"}</button>
        {editing && <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function UsdForm({ loc, month, editing, onSaved, onCancel }) {
  const [form, setForm] = useState(() => editing
    ? { day: editing.day, ssp: String(editing.ssp_amount ?? ""), rate: String(editing.rate ?? ""), notes: editing.notes ?? "" }
    : { day: defaultDay(month), ssp: "", rate: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const usd = nv(form.ssp) > 0 && nv(form.rate) > 0 ? nv(form.ssp) / nv(form.rate) : 0;

  async function save(e) {
    e.preventDefault();
    if (nv(form.ssp) <= 0) { setError("Enter how many SSP you exchanged."); return; }
    if (nv(form.rate) <= 0) { setError("Enter the rate: how many SSP buy 1 US dollar."); return; }
    setBusy(true); setError("");
    try {
      await saveRow("usd", { year: month.getFullYear(), month: MONTHS[month.getMonth()], day: form.day, location: loc,
        ssp_amount: nv(form.ssp), rate: nv(form.rate), usd_amount: Math.round(usd * 100) / 100, notes: form.notes.trim() }, editing?.id);
      await onSaved(editing ? "Exchange updated" : "Exchange saved");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      <h2 style={{ marginBottom: 6 }}>{editing ? "Change this exchange" : "Move cash into USD savings"}</h2>
      <p className="soft" style={{ marginBottom: 16 }}>This doesn't reduce profit. It shows how much cash went into dollars.</p>
      <div className="fields">
        <Field label="Day">{(id) => <DaySelect id={id} month={month} value={form.day} onChange={set("day")} />}</Field>
        <div className="fields two">
          <Field label="SSP exchanged">{(id) => <MoneyInput id={id} value={form.ssp} onChange={set("ssp")} />}</Field>
          <Field label="Rate (SSP for $1)">{(id) => <MoneyInput id={id} value={form.rate} onChange={set("rate")} />}</Field>
        </div>
        <Field label="Notes (optional)" hint="For example the bank or exchange used.">{(id) => <input id={id} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />}</Field>
      </div>
      <p style={{ marginTop: 16 }}>You receive <strong className="in">{usd ? fmtUSD(usd) : "$0.00"}</strong></p>
      <Banner>{error}</Banner>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Update exchange" : "Save exchange"}</button>
        {editing && <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function SimpleList({ kind, profile, rows, month, columns, total, empty, editing, onEdit, onDeleted }) {
  const [error, setError] = useState("");
  if (!rows.length) return <div className="empty"><p>{empty}</p></div>;
  return (
    <>
      <h2 style={{ marginBottom: 10 }}>{monthTitle(month)}</h2>
      <Banner>{error}</Banner>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{columns.map(([h, , r]) => <th key={h} className={r ? "r" : ""}>{h}</th>)}<th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={editing?.id === row.id ? "is-editing" : ""}>
                {columns.map(([h, get, r]) => <td key={h} className={r ? "r" : ""}>{get(row)}</td>)}
                <td><div className="row-actions">
                  <button type="button" className="btn quiet small" onClick={() => onEdit(row)}>Edit</button>
                  {can(profile, "canDelete") && <DeleteButton onDelete={async () => {
                    try { await deleteRow(kind, row.id); onDeleted(); } catch (e) { setError(e.message); }
                  }} />}
                </div></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={columns.length + 1} className="r">{total(rows)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

// Numbers only, shown with thousands separators while typing.
function MoneyInput({ id, value, onChange }) {
  const shown = value === "" ? "" : Number(value).toLocaleString("en-US");
  return (
    <input id={id} inputMode="numeric" autoComplete="off" value={shown} placeholder="0"
      onChange={(e) => { const digits = e.target.value.replace(/[^\d]/g, ""); onChange(digits === "" ? "" : String(Number(digits))); }} />
  );
}
