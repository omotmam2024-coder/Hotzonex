import { siteColor } from "../lib/locations";
import { fmt, fmtUSD } from "../lib/ledger";

// One site: Profit − Exchanged = Balance.
export function BalanceEquation({ s }) {
  return (
    <div className="equation">
      <div><span>Profit</span><strong className={s.profit < 0 ? "red" : "green"}>{fmt(s.profit)}</strong></div>
      <b aria-hidden="true">−</b>
      <div><span>Exchanged to dollars</span><strong>{fmt(s.usdSSP)}</strong>{s.usdUSD > 0 && <em>{fmtUSD(s.usdUSD)}</em>}</div>
      <b aria-hidden="true">=</b>
      <div className="result"><span>Balance in SSP</span><strong className={s.cashLeft < 0 ? "red" : ""}>{fmt(s.cashLeft)}</strong></div>
    </div>
  );
}

// All sites: one row each, plus the total.
export function BalanceTable({ rows, total }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Site</th><th className="r">Profit (SSP)</th><th className="r">Exchanged (SSP)</th><th className="r">Dollars</th><th className="r">Balance (SSP)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={!r.s.days && !r.s.usdSSP && !r.s.purchases ? "muted" : ""}>
              <td><span className="dot" style={{ background: siteColor(r), display: "inline-block", marginRight: 8 }} />{r.label}</td>
              <td className="r">{fmt(r.s.profit)}</td>
              <td className="r">{r.s.usdSSP ? fmt(r.s.usdSSP) : "–"}</td>
              <td className="r">{r.s.usdUSD ? fmtUSD(r.s.usdUSD) : "–"}</td>
              <td className={`r ${r.s.cashLeft < 0 ? "red" : ""}`}><strong>{fmt(r.s.cashLeft)}</strong></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>All sites</td><td className="r">{fmt(total.profit)}</td><td className="r">{fmt(total.usdSSP)}</td><td className="r">{fmtUSD(total.usdUSD)}</td><td className={`r ${total.cashLeft < 0 ? "red" : ""}`}>{fmt(total.cashLeft)}</td></tr></tfoot>
      </table>
    </div>
  );
}
