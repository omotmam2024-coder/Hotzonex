// Sites come from Hotzonex Cloud (mirrored in the tracker's `sites` table).
// LOCATIONS and LOC are filled in by setSites() once after sign-in; every
// screen reads them, so they are updated in place.
export const LOCATIONS = [];
export const LOC = {};
export const ALL_SITES = "ALL";

export const COST_KEYS = ["internet", "power", "feeding", "wages"];
export const COST_LABELS = { internet: "Internet", power: "Power and fuel", feeding: "Feeding", wages: "Wages" };

const COLORS = ["brand", "cyan", "orange", "grey", "green", "red"];

export function setSites(rows, keepId) {
  const list = rows
    .filter((r) => r.active || r.id === keepId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((r, i) => ({ id: r.id, label: r.name, short: r.name, color: COLORS[i % COLORS.length], expKeys: COST_KEYS }));
  LOCATIONS.splice(0, LOCATIONS.length, ...list);
  for (const k of Object.keys(LOC)) delete LOC[k];
  for (const l of list) LOC[l.id] = l;
}

export const PURCHASE_CATEGORIES = [
  "Equipment / Hardware", "Office Supplies", "Rent / Utilities", "Transport",
  "Food / Drinks", "Maintenance", "Marketing", "Other",
];

export const ROLES = {
  admin:   { label: "Admin",   canDelete: true,  canEdit: true,  canAdjust: true,  canViewAll: true,  canManageUsers: true },
  manager: { label: "Manager", canDelete: false, canEdit: true,  canAdjust: true,  canViewAll: true,  canManageUsers: false },
  staff:   { label: "Staff",   canDelete: false, canEdit: true,  canAdjust: false, canViewAll: false, canManageUsers: false },
  viewer:  { label: "Viewer",  canDelete: false, canEdit: false, canAdjust: false, canViewAll: true,  canManageUsers: false },
};
export const can = (profile, perm) => Boolean(profile && ROLES[profile.role]?.[perm]);

// A site's colour as a theme-aware CSS value (works in light and dark mode).
export const siteColor = (l) => `var(--${l?.color === "grey" ? "faint" : l?.color ?? "brand"})`;

export const siteName = (id) => (id === ALL_SITES ? "All sites" : LOC[id]?.label ?? "Unknown site");
