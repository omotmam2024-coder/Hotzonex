import { ALL_SITES, LOCATIONS, LOC, can } from "../lib/locations";

// Coloured site buttons. Staff only ever see their own site.
export default function SiteTabs({ profile, value, onChange }) {
  if (!can(profile, "canViewAll")) {
    const l = LOC[profile.location];
    return <span className="sitetab-static" style={{ "--site": l?.hue }}>{l?.label}</span>;
  }
  const options = [{ id: ALL_SITES, label: "All sites", short: "All sites", hue: "#E2E8F0" }, ...LOCATIONS];
  return (
    <div className="sitetabs" role="group" aria-label="Site">
      {options.map((l) => (
        <button key={l.id} type="button" className="sitetab" aria-pressed={value === l.id}
          style={{ "--site": l.id === ALL_SITES ? "var(--text)" : l.hue }} onClick={() => onChange(l.id)}>
          {l.id !== ALL_SITES && <span className="dot" style={{ background: l.hue }} />}
          {l.label}
        </button>
      ))}
    </div>
  );
}
