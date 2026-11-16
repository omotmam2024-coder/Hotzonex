import { change, fmt } from "../lib/ledger";
import { Icon } from "./ui";

// One number card: label, coloured icon square, value, and how it moved.
// goodWhenUp: income and profit going up is good; costs going up is not.
export function Kpi({ label, value, icon, color, before, goodWhenUp = true, compareLabel, sub }) {
  const pct = before == null ? null : change(value, before);
  let line = sub ?? "Total for this period";
  let tone = "";
  if (pct != null && compareLabel) {
    const up = pct >= 0;
    tone = up === goodWhenUp ? "up" : "down";
    line = <><Icon name={up ? "up" : "down"} size={13} /> {Math.abs(pct).toFixed(0)}% {compareLabel}</>;
  }
  return (
    <div className="kpi" style={{ "--kpi": color }}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon" aria-hidden="true"><Icon name={icon} size={17} /></span>
      </div>
      <div className="kpi-value">{fmt(value)}<small>SSP</small></div>
      <div className={`kpi-sub ${tone}`}>{line}</div>
    </div>
  );
}

// The four headline numbers for a period, compared with the period before.
export default function Kpis({ s, before, compareLabel = "from last month" }) {
  const b = before ?? {};
  return (
    <div className="kpis">
      <Kpi label="Taken in" value={s.income} before={b.income} icon="cash" color="var(--brand)" compareLabel={compareLabel} />
      <Kpi label="Running costs" value={s.running} before={b.running} icon="bolt" color="var(--orange)" goodWhenUp={false} compareLabel={compareLabel} />
      <Kpi label="Purchases" value={s.purchases} before={b.purchases} icon="cart" color="var(--red)" goodWhenUp={false} compareLabel={compareLabel} />
      <Kpi label="Profit" value={s.profit} before={b.profit > 0 ? b.profit : null} icon="trend" color="var(--green)" compareLabel={compareLabel}
        sub={s.margin != null ? `${Math.round(s.margin)}% of takings kept` : "SSP"} />
    </div>
  );
}
