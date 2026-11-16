import { useEffect, useState } from "react";
import { fmt } from "../lib/ledger";

// Income drawn like a WiFi signal meter: one bar per day (or month, or year).
// items: [{ key, label, value, missing, highlight, loss }]
export default function SignalBars({ items, height = 120, axis, caption }) {
  // The bars grow once when the chart first appears, not on later changes.
  const [animate, setAnimate] = useState(true);
  useEffect(() => { const t = setTimeout(() => setAnimate(false), 1400); return () => clearTimeout(t); }, []);

  const n = Math.max(items.length, 1);
  const W = Math.max(n * 12, 360), H = height, step = W / n, barW = Math.min(step * 0.62, 26);
  const max = Math.max(1, ...items.map((d) => d.value || 0));
  const summary = caption ?? `${items.filter((d) => !d.missing).length} of ${items.length} recorded, highest ${fmt(max)} SSP`;

  return (
    <figure style={{ margin: 0 }}>
      <svg className={`signal ${animate ? "grow" : ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label={summary} style={{ aspectRatio: `${W} / ${H}`, maxHeight: H * 1.6 }}>
        {items.map((d, i) => {
          const x = i * step + (step - barW) / 2;
          const band = d.highlight ? <rect className="today-band" x={i * step} y={0} width={step} height={H} rx={2} /> : null;
          if (d.missing) {
            return (
              <g key={d.key}>
                {band}
                <line className="stub" x1={x + barW / 2} x2={x + barW / 2} y1={H - 1} y2={H - 14} vectorEffect="non-scaling-stroke">
                  <title>{`${d.label}: not recorded`}</title>
                </line>
              </g>
            );
          }
          const h = Math.max(3, Math.round(((d.value || 0) / max) * (H - 6)));
          return (
            <g key={d.key}>
              {band}
              <rect className={`bar ${d.loss ? "loss" : ""}`} x={x} y={H - h} width={barW} height={h} rx={1.5}
                style={{ "--i": i }}>
                <title>{`${d.label}: ${fmt(d.value)} SSP`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      {axis && (
        <figcaption className="signal-axis">
          {axis.map((a, i) => <span key={i}>{a}</span>)}
        </figcaption>
      )}
    </figure>
  );
}
