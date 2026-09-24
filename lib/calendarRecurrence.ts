/* ---------------------------------------------------------------------------
 * Repeating calendar events. Only the rule is stored (date, repeat,
 * repeat_until, skipped_dates); the occurrences a view needs are computed
 * here. Dates are "YYYY-MM-DD" strings handled as UTC day numbers, so time
 * zones and DST never shift a day.
 * ------------------------------------------------------------------------- */

export type Repeat = "day" | "week" | "2weeks" | "month";

export interface RepeatRule {
  id: string;
  date: string;
  end_date: string | null;
  repeat: Repeat | null;
  repeat_until: string | null;
  skipped_dates: string[];
  /** false = occurrences never land on Saturday or Sunday (default true). */
  repeat_weekends?: boolean;
}

/** One showing of an event: the event itself with the dates moved, plus where it came from. */
export type Occurrence<T extends RepeatRule> = T & {
  /** Start date of this occurrence (the event's own date for a one-off). */
  occurrence: string;
  /** The stored event, i.e. the whole series. */
  series: T;
};

const DAY = 86_400_000;
const toDay = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => fromDay(toDay(iso) + days);

/** The n-th month after `start`, on the same day or the month's last day if it's shorter (31 Jan → 28 Feb → 31 Mar). */
function addMonths(start: string, n: number): string {
  const y = +start.slice(0, 4), m = +start.slice(5, 7) - 1 + n, d = +start.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

const STEP_DAYS: Record<Exclude<Repeat, "month">, number> = { day: 1, week: 7, "2weeks": 14 };

/** Start dates of the occurrences that overlap [from, to] (inclusive), skipped ones left out. */
export function occurrenceStarts(event: RepeatRule, from: string, to: string): string[] {
  const length = event.end_date ? toDay(event.end_date) - toDay(event.date) : 0;
  const last = event.repeat_until && event.repeat_until < to ? event.repeat_until : to;
  // An occurrence overlaps the range if it starts on or before `to` and ends on or after `from`.
  const earliest = addDays(from, -length);
  if (!event.repeat) return event.date <= to && event.date >= earliest ? [event.date] : [];

  const skipped = new Set(event.skipped_dates);
  const weekends = event.repeat_weekends !== false;
  const out: string[] = [];
  const keep = (day: string) => {
    if (skipped.has(day)) return;
    if (!weekends) { const weekday = new Date(toDay(day) * DAY).getUTCDay(); if (weekday === 0 || weekday === 6) return; }
    out.push(day);
  };
  if (event.repeat === "month") {
    const startMonth = +event.date.slice(0, 4) * 12 + +event.date.slice(5, 7);
    const fromMonth = +earliest.slice(0, 4) * 12 + +earliest.slice(5, 7);
    for (let n = Math.max(0, fromMonth - startMonth - 1); ; n++) {
      const day = addMonths(event.date, n);
      if (day > last) break;
      if (day >= earliest) keep(day);
    }
    return out;
  }
  const step = STEP_DAYS[event.repeat];
  const start = toDay(event.date);
  const first = Math.max(0, Math.ceil((toDay(earliest) - start) / step));
  for (let day = start + first * step; fromDay(day) <= last; day += step) keep(fromDay(day));
  return out;
}

/** Events expanded into the occurrences overlapping [from, to]. */
export function expandOccurrences<T extends RepeatRule>(events: T[], from: string, to: string): Occurrence<T>[] {
  return events.flatMap((event) => {
    const length = event.end_date ? toDay(event.end_date) - toDay(event.date) : 0;
    return occurrenceStarts(event, from, to).map((start) => ({
      ...event,
      // One-offs keep their id; repeats get one per occurrence for React keys and layout lanes.
      id: event.repeat ? `${event.id}@${start}` : event.id,
      date: start,
      end_date: event.end_date ? addDays(start, length) : null,
      occurrence: start,
      series: event,
    }));
  });
}

/** True when `day` is an occurrence start of the event (used to honour ?date= deep links). */
export function isOccurrence(event: RepeatRule, day: string): boolean {
  return occurrenceStarts(event, day, day).includes(day);
}
