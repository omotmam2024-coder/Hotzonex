import { ALL_SITES, LOCATIONS, LOC, can } from "../lib/locations";

export default function LocationPicker({ profile, value, onChange, allowAll = true }) {
  if (!can(profile, "canViewAll")) {
    return <span className="soft" style={{ fontWeight: 600 }}>{LOC[profile.location]?.label}</span>;
  }
  return (
    <>
      <label htmlFor="site" className="visually-hidden">Site</label>
      <select id="site" className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowAll && <option value={ALL_SITES}>All sites</option>}
        {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </>
  );
}
