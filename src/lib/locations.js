// Sites and the running costs each one records.
export const LOCATIONS = [
  { id: "HQ",    label: "Jebel Iraq HQ",         short: "HQ",         hue: "#0B7A5C", expKeys: ["internet", "power", "feeding", "wages"] },
  { id: "SUB",   label: "Jebel Iraq Sub-Office", short: "Sub-Office", hue: "#2F5BEA", expKeys: ["power", "wages"] },
  { id: "GOROM", label: "Hotzonex Gorom",        short: "Gorom",      hue: "#B4471C", expKeys: ["power", "wages"] },
  { id: "HOME",  label: "Hotzonex Home",         short: "Home",       hue: "#7A4FD1", expKeys: ["internet"] },
];
export const LOC = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
export const ALL_SITES = "ALL";

export const COST_KEYS = ["internet", "power", "feeding", "wages"];
export const COST_LABELS = { internet: "Internet", power: "Power and fuel", feeding: "Feeding", wages: "Wages" };

export const PURCHASE_CATEGORIES = [
  "Equipment / Hardware", "Office Supplies", "Rent / Utilities", "Transport",
  "Food / Drinks", "Maintenance", "Marketing", "Other",
];

export const ROLES = {
  admin:   { label: "Admin",   canDelete: true,  canEdit: true,  canViewAll: true,  canManageUsers: true },
  manager: { label: "Manager", canDelete: false, canEdit: true,  canViewAll: true,  canManageUsers: false },
  staff:   { label: "Staff",   canDelete: false, canEdit: true,  canViewAll: false, canManageUsers: false },
  viewer:  { label: "Viewer",  canDelete: false, canEdit: false, canViewAll: true,  canManageUsers: false },
};
export const can = (profile, perm) => Boolean(profile && ROLES[profile.role]?.[perm]);

export const siteName = (id) => (id === ALL_SITES ? "All sites" : LOC[id]?.label ?? id);
