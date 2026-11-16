import { fmt } from "../lib/ledger";

export function Kpi({ label, value, color = "var(--teal)", sub = "SSP" }) {
  return (
    <div className="kpi" style={{ "--kpi": color }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === "number" ? fmt(value) : value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// The four headline numbers for any period.
export default function Kpis({ s, incomeLabel = "Taken in" }) {
  return (
    <div className="kpis">
      <Kpi label={incomeLabel} value={s.income} color="var(--teal)" />
      <Kpi label="Running costs" value={s.running} color="var(--orange)" />
      <Kpi label="Purchases" value={s.purchases} color="var(--red)" />
      <Kpi label="Profit" value={s.profit} color={s.profit < 0 ? "var(--red)" : "var(--green)"}
        sub={s.margin != null ? `SSP, ${Math.round(s.margin)}% of takings` : "SSP"} />
    </div>
  );
}
