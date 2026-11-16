import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "../lib/ledger";
import { usePalette } from "../lib/palette";

const short = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : v);

function useAxes() {
  const P = usePalette();
  return {
    P,
    grid: <CartesianGrid strokeDasharray="3 3" stroke={P.grid} vertical={false} />,
    x: (key, interval) => <XAxis dataKey={key} tick={{ fill: P.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval={interval ?? "preserveStartEnd"} minTickGap={12} />,
    y: <YAxis tick={{ fill: P.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={short} width={44} />,
    tip: (
      <Tooltip
        cursor={{ fill: P.grid, opacity: 0.35, stroke: P.grid }}
        contentStyle={{ background: P.card, border: `1px solid ${P.grid}`, borderRadius: 8, fontSize: 12, color: P.text }}
        labelStyle={{ color: P.muted, marginBottom: 4 }}
        formatter={(v, name) => [v == null ? "Not recorded" : `${fmt(v)} SSP`, name]}
      />
    ),
  };
}

function Legend({ series }) {
  const P = usePalette();
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}><i style={s.dashed ? { background: `repeating-linear-gradient(90deg, ${P[s.color]} 0 4px, transparent 4px 6px)`, height: 3, verticalAlign: 3 } : { background: P[s.color] }} />{s.name}</span>
      ))}
    </div>
  );
}

// series: [{ key, name, color: "teal" | "green" | ... }]
export function TrendChart({ data, xKey, series, height = 240 }) {
  const { P, grid, x, y, tip } = useAxes();
  return (
    <>
      <div className="chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {grid}{x(xKey)}{y}{tip}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={P[s.color]} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 4" : undefined}
                dot={false} activeDot={{ r: 5, fill: P[s.color], stroke: P.card }} connectNulls={false} isAnimationActive />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && <Legend series={series} />}
    </>
  );
}

export function BarsChart({ data, xKey, series, height = 240 }) {
  const { P, grid, x, y, tip } = useAxes();
  return (
    <>
      <div className="chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            {grid}{x(xKey)}{y}{tip}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={P[s.color]} radius={[3, 3, 0, 0]} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && <Legend series={series} />}
    </>
  );
}
