/**
 * Normalize dates for JSON APIs: never expose time-of-day (PostgreSQL DATE or JS Date → YYYY-MM-DD).
 */
export function toDateOnlyString(val) {
  if (val == null) return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return val.slice(0, 10) || null;
  }
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }
  return null;
}
