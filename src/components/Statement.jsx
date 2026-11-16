import { COST_KEYS, COST_LABELS } from "../lib/locations";
import { fmt, fmtUSD } from "../lib/ledger";

// The money story for a period, read top to bottom like a cash book.
export default function Statement({ s }) {
  const costLines = COST_KEYS.filter((k) => s.costs[k] > 0);
  return (
    <table className="ledger">
      <tbody>
        <tr><td>Taken in</td><td className="in">{fmt(s.income)}</td></tr>
        <tr className={costLines.length ? "after" : ""}><td>Running costs</td><td className="out">{s.running ? fmt(-s.running) : "0"}</td></tr>
        {costLines.map((k) => (
          <tr key={k} className="sub"><td>{COST_LABELS[k]}</td><td>{fmt(s.costs[k])}</td></tr>
        ))}
        <tr><td>Purchases</td><td className="out">{s.purchases ? fmt(-s.purchases) : "0"}</td></tr>
        <tr className="total"><td>Profit</td><td className={s.profit < 0 ? "out" : "in"}>{fmt(s.profit)} SSP</td></tr>
        <tr><td>Moved to USD savings {s.usdUSD > 0 && <span className="soft">({fmtUSD(s.usdUSD)})</span>}</td>
          <td>{s.usdSSP ? fmt(-s.usdSSP) : "0"}</td></tr>
        <tr className="after"><td><strong>Cash left</strong></td><td><strong>{fmt(s.cashLeft)} SSP</strong></td></tr>
      </tbody>
    </table>
  );
}
