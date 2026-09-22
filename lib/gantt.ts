// UTC day arithmetic keeps calendar dates stable across daylight-saving changes.
const DAY = 86_400_000;
export function dayNumber(value: string): number { return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY); }
export function dayKey(day: number): string { return new Date(day * DAY).toISOString().slice(0, 10); }
/** 0 = Monday … 6 = Sunday. Day 0 (1970-01-01) was a Thursday. */
export function weekday(day: number): number { return (((day + 3) % 7) + 7) % 7; }
/** ISO 8601 week number (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeek(day: number): number {
  const thursday = day - weekday(day) + 3;
  return Math.floor((thursday - dayNumber(`${dayKey(thursday).slice(0, 4)}-01-01`)) / 7) + 1;
}
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function barRange(start: string | null | undefined, end: string | null | undefined, first: number, days: number) {
  if (!start && !end) return null;
  const from = dayNumber(start || end!);
  const to = dayNumber(end || start!);
  if (to < first || from >= first + days || to < from) return null;
  return { left: Math.max(0, from - first) / days * 100, width: (Math.min(to, first + days - 1) - Math.max(from, first) + 1) / days * 100 };
}
