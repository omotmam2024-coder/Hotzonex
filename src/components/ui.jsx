import { useEffect, useId, useState } from "react";

const PATHS = {
  today: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  wifi: "M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01",
  cash: "M2 6h20v12H2zM12 15a3 3 0 100-6 3 3 0 000 6zM6 9v.01M18 15v.01",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  cart: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
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

// The Hotzonex logo mark with the name beside it.
export function Brand({ sub = "WiFi business tracker" }) {
  return (
    <div className="brand">
      <span className="brand-mark"><img src="/logo-mark.png" alt="" width="32" height="32" /></span>
      <span>
        <span className="brand-name">HOTZONEX</span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </div>
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

export function Stepper({ title, onPrev, onNext, nextDisabled, prevDisabled, prevLabel = "Previous", nextLabel = "Next" }) {
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel}
        style={prevDisabled ? { opacity: 0.3 } : undefined}><Icon name="left" /></button>
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
