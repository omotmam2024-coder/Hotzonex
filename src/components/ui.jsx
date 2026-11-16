import { useEffect, useId, useState } from "react";

const PATHS = {
  today: "M4 20V10M10 20V6M16 20v-8M22 20V3",
  record: "M12 5v14M5 12h14",
  reports: "M4 4h16v16H4zM4 9h16M9 9v11",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  team: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  refresh: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
  out: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  print: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// Four rising bars: the Hotzonex mark.
export function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="6" fill="var(--ink)" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={5 + i * 4.4} y={19 - (i + 1) * 3.3} width="3" height={(i + 1) * 3.3} rx="1"
          fill={i === 3 ? "var(--marker)" : "var(--on-ink)"} />
      ))}
    </svg>
  );
}

export function Banner({ children, tone = "error" }) {
  if (!children) return null;
  return (
    <div className={`banner ${tone === "ok" ? "ok" : ""}`} role={tone === "ok" ? "status" : "alert"}>
      {tone !== "ok" && <span className="out"><Icon name="alert" /></span>}
      <p>{children}</p>
    </div>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function Field({ label, hint, children }) {
  const id = useId();
  const child = typeof children === "function" ? children(id) : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {child}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Stepper({ title, onPrev, onNext, nextDisabled, prevLabel = "Previous", nextLabel = "Next" }) {
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" onClick={onPrev} aria-label={prevLabel}><Icon name="left" /></button>
      <strong>{title}</strong>
      <button type="button" className="icon-btn" onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}
        style={nextDisabled ? { opacity: 0.3 } : undefined}><Icon name="right" /></button>
    </div>
  );
}

// Two-step delete: the first press asks, the second deletes.
export function DeleteButton({ onDelete, label = "Delete" }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) return <button type="button" className="btn quiet small" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="row-actions">
      <button type="button" className="btn danger small" disabled={busy}
        onClick={async () => { setBusy(true); try { await onDelete(); } finally { setBusy(false); setAsking(false); } }}>
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" className="btn quiet small" onClick={() => setAsking(false)}>Keep</button>
    </span>
  );
}

export function Loading({ label = "Loading figures…" }) {
  return <p className="empty" role="status">{label}</p>;
}
