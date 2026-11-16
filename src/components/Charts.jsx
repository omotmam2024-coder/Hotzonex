import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "../lib/ledger";
import { usePalette } from "../lib/palette";

const short = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : v);

function useParts() {
  const P = usePalette();
  return {
    P,
    grid: <CartesianGrid stroke={P.grid} />,
    x: (key) => <XAxis dataKey={key} tick={{ fill: P.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />,
    y: <YAxis tick={{ fill: P.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={short} width={46} />,
    tip: (
      <Tooltip
        cursor={{ stroke: P.grid, fill: P.grid, fillOpacity: 0.4 }}
        contentStyle={{ background: P.card, border: `1px solid ${P.grid}`, borderRadius: 8, fontSize: 12, color: P.text, boxShadow: "0 8px 24px rgba(16,24,40,.12)" }}
        labelStyle={{ color: P.muted, marginBottom: 4 }}
        formatter={(v, name) => [v == null ? "Not recorded" : `${fmt(v)} SSP`, name]}
      />
    ),
  };
}

export function Legend({ items }) {
  const P = usePalette();
  return (
    <div className="legend">
      {items.map((s) => <span key={s.key ?? s.name}><i style={{ background: P[s.color] ?? s.color }} />{s.name}</span>)}
    </div>
  );
}

// Smooth lines with a soft shaded area underneath, as in the reference design.
// series: [{ key, name, color: "brand" | "green" | ... }]
export function TrendChart({ data, xKey, series, height = 260 }) {
  const { P, grid, x, y, tip } = useParts();
  const uid = useId().replace(/:/g, "");
  return (
    <>
      <Legend items={series} />
      <div className="chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P[s.color]} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={P[s.color]} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            {grid}{x(xKey)}{y}{tip}
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={P[s.color]} strokeWidth={2.5}
                fill={`url(#${uid}-${s.key})`} connectNulls={false}
                dot={{ r: 3, fill: P.card, stroke: P[s.color], strokeWidth: 1.5 }} activeDot={{ r: 5, fill: P[s.color], stroke: P.card }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function BarsChart({ data, xKey, series, height = 260 }) {
  const { P, grid, x, y, tip } = useParts();
  return (
    <>
      <Legend items={series} />
      <div className="chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }} barGap={2}>
            {grid}{x(xKey)}{y}{tip}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={P[s.color]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// Ring chart with the total in the middle. slices: [{ name, value, color }]
export function DonutChart({ slices, centre, centreLabel, height = 220 }) {
  const P = usePalette();
  const shown = slices.filter((s) => s.value > 0);
  return (
    <>
      <div className="donut-wrap chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown.length ? shown : [{ name: "Nothing yet", value: 1 }]} dataKey="value" nameKey="name"
              innerRadius="62%" outerRadius="88%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
              {(shown.length ? shown : [{ color: P.grid }]).map((s, i) => <Cell key={i} fill={P[s.color] ?? s.color} />)}
            </Pie>
            {shown.length > 0 && (
              <Tooltip contentStyle={{ background: P.card, border: `1px solid ${P.grid}`, borderRadius: 8, fontSize: 12, color: P.text }}
                formatter={(v, name) => [`${fmt(v)} SSP`, name]} />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-centre"><strong>{centre}</strong><span>{centreLabel}</span></div>
      </div>
      <Legend items={slices.map((s) => ({ name: s.name, color: s.color }))} />
    </>
  );
}
