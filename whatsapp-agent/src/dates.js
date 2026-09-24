// Date helpers in the business's local timezone (the server may run in UTC).
import { MONTHS } from "./supabase.js";

export function localParts(date = new Date(), timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", weekday: "long", hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  return {
    year, month, day,
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: parts.weekday,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

// "2026-09-24" → { year: 2026, month: "September", day: 24 } (the dashboard's row key).
export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) throw new Error(`Invalid date "${iso}", expected YYYY-MM-DD.`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new Error(`Invalid date "${iso}".`);
  return { year, month: MONTHS[month - 1], day };
}
