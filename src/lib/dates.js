// Records are stored as { year, month: "November", day }. These helpers move
// between that shape and real Date objects (always local time, midnight).
export const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const FIRST_YEAR = 2026;

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (monthIndex, year) =>
  [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex];

export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const rowDate = (r) => new Date(r.year, MONTHS.indexOf(r.month), r.day);
export const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const rowKey = (r) => `${r.year}-${MONTHS.indexOf(r.month) + 1}-${r.day}`;
export const toRowFields = (d) => ({ year: d.getFullYear(), month: MONTHS[d.getMonth()], day: d.getDate() });

export function eachDay(from, to) {
  const out = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

const fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
export const longDay = (d) => fmtDay.format(d);
export const shortDay = (d) => fmtShort.format(d);
export const monthTitle = (d) => fmtMonth.format(d);

// Reporting periods. `anchor` is any date inside the period.
export function periodRange(kind, anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  if (kind === "week") {
    const offset = (anchor.getDay() + 6) % 7; // Monday = 0
    const from = addDays(anchor, -offset);
    return { from, to: addDays(from, 6) };
  }
  if (kind === "month") return { from: new Date(y, m, 1), to: new Date(y, m, daysInMonth(m, y)) };
  if (kind === "year") return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
  return { from: new Date(FIRST_YEAR, 0, 1), to: new Date(today().getFullYear(), 11, 31) };
}

export function shiftPeriod(kind, anchor, step) {
  if (kind === "week") return addDays(anchor, 7 * step);
  if (kind === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
  if (kind === "year") return new Date(anchor.getFullYear() + step, 0, 1);
  return anchor;
}

export function periodTitle(kind, anchor) {
  const { from, to } = periodRange(kind, anchor);
  if (kind === "week") return `${shortDay(from)} – ${shortDay(to)} ${to.getFullYear()}`;
  if (kind === "month") return monthTitle(anchor);
  if (kind === "year") return String(anchor.getFullYear());
  return `Since ${FIRST_YEAR}`;
}
