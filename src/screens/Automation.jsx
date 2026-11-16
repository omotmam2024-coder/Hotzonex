import { useEffect, useState } from "react";
import { fetchFixedCosts, fetchSyncStatus, saveFixedCosts, syncNow } from "../lib/api";
import { COST_KEYS, COST_LABELS, LOCATIONS, can, siteColor } from "../lib/locations";
import { fmt, nv } from "../lib/ledger";
import { Banner, Loading } from "../components/ui";

const when = (iso) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function Automation({ profile, notify, onSynced }) {
  const isAdmin = can(profile, "canManageUsers");
  const [status, setStatus] = useState(null);
  const [costs, setCosts] = useState(null); // { [siteId]: { [key]: "amount" } }
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([fetchSyncStatus(), fetchFixedCosts()])
      .then(([s, rows]) => {
        if (!live) return;
        const grid = Object.fromEntries(LOCATIONS.map((l) => [l.id, Object.fromEntries(COST_KEYS.map((k) => [k, ""]))]));
        for (const r of rows) if (grid[r.site_id]) grid[r.site_id][r.cost_key] = nv(r.amount) ? String(nv(r.amount)) : "";
        setStatus(s); setCosts(grid);
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [version]);

  async function sync(all) {
    setBusy(all ? "all" : "now"); setError("");
    try {
      const r = await syncNow(all ? { all: true } : {});
      notify(`Synced ${r.days} ${r.days === 1 ? "day" : "days"} from Hotzonex Cloud`);
      onSynced(); setVersion((v) => v + 1);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function saveCosts() {
    setBusy("costs"); setError("");
    try {
      const rows = [];
      for (const [site_id, byKey] of Object.entries(costs)) for (const [cost_key, v] of Object.entries(byKey)) rows.push({ site_id, cost_key, amount: nv(v) });
      await saveFixedCosts(rows);
      await syncNow(); // apply to the last week straight away
      notify("Fixed costs saved");
      onSynced(); setVersion((v) => v + 1);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  if (!status || !costs) return error ? <Banner>{error}</Banner> : <Loading label="Loading automation…" />;
  const set = (site, key) => (e) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setCosts((c) => ({ ...c, [site]: { ...c[site], [key]: digits } }));
  };
  const perDay = (site) => COST_KEYS.reduce((s, k) => s + nv(costs[site]?.[k]), 0);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Automation</h1>
          <p>Income and expenses come in from Hotzonex Cloud by themselves, every 15 minutes.</p>
        </div>
      </div>
      <Banner>{error}</Banner>

      <section className="panel" aria-labelledby="sync-h">
        <div className="panel-head">
          <h2 id="sync-h">Hotzonex Cloud connection</h2>
          <span className={status.last_error ? "red" : status.last_ok_at ? "green" : "soft"} style={{ fontWeight: 600 }}>
            {status.last_error ? "Last sync failed" : status.last_ok_at ? "Connected" : "Waiting for first sync"}
          </span>
        </div>
        <table className="ledger">
          <tbody>
            <tr><td>Last successful sync</td><td>{when(status.last_ok_at)}</td></tr>
            <tr><td>Days covered by that sync</td><td>{status.window_from ? `${status.window_from} to ${status.window_to}` : "–"}</td></tr>
            {status.last_error && <tr className="after"><td>What went wrong</td><td className="red" style={{ whiteSpace: "normal" }}>{status.last_error}</td></tr>}
          </tbody>
        </table>
        <ul className="soft" style={{ margin: "14px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          <li><strong style={{ color: "var(--text)" }}>Income</strong>: every voucher sold or first used in Hotzonex Cloud, per site, per day.</li>
          <li><strong style={{ color: "var(--text)" }}>Running costs</strong>: power, feeding and salaries entered in Hotzonex Cloud, plus the fixed daily costs below.</li>
          <li><strong style={{ color: "var(--text)" }}>Purchases</strong>: repairs, equipment and other expenses entered in Hotzonex Cloud.</li>
        </ul>
        <div className="actions">
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => sync(false)}>{busy === "now" ? "Syncing…" : "Sync now"}</button>
          {isAdmin && <button type="button" className="btn quiet" disabled={Boolean(busy)} onClick={() => sync(true)}>{busy === "all" ? "Filling in history…" : "Fill in all history again"}</button>}
        </div>
      </section>

      <section className="panel" aria-labelledby="fixed-h">
        <div className="panel-head">
          <h2 id="fixed-h">Fixed daily costs</h2>
          <span className="soft">Added on each day a site has sales</span>
        </div>
        <p className="soft" style={{ marginBottom: 14 }}>
          Use this for costs that are the same every day, like daily wages. Don't also enter them in Hotzonex Cloud, or they'll be counted twice.
          {!isAdmin && " Only the admin can change these."}
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Site</th>{COST_KEYS.map((k) => <th key={k} className="r">{COST_LABELS[k]}</th>)}<th className="r">Per day</th></tr></thead>
            <tbody>
              {LOCATIONS.map((l) => (
                <tr key={l.id}>
                  <td><span className="dot" style={{ background: siteColor(l), display: "inline-block", marginRight: 8 }} />{l.label}</td>
                  {COST_KEYS.map((k) => (
                    <td key={k} className="r">
                      <label className="visually-hidden" htmlFor={`fc-${l.id}-${k}`}>{COST_LABELS[k]} at {l.label}</label>
                      <input id={`fc-${l.id}-${k}`} inputMode="numeric" disabled={!isAdmin} placeholder="0"
                        value={costs[l.id]?.[k] ? Number(costs[l.id][k]).toLocaleString("en-US") : ""} onChange={set(l.id, k)}
                        style={{ width: 110, minHeight: 38, padding: "6px 10px", textAlign: "right", border: "1px solid var(--line)", borderRadius: 8, background: "var(--input)" }} />
                    </td>
                  ))}
                  <td className="r"><strong>{fmt(perDay(l.id))}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <div className="actions">
            <button type="button" className="btn" disabled={Boolean(busy)} onClick={saveCosts}>{busy === "costs" ? "Saving…" : "Save fixed costs"}</button>
            <span className="soft" style={{ alignSelf: "center" }}>Saving updates the last 7 days. Use "Fill in all history again" to apply them further back.</span>
          </div>
        )}
      </section>
    </div>
  );
}
