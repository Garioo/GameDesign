/** Minimal iCalendar (RFC 5545) reader for subscribed calendars such as Moodle's export. */

export interface IcsEvent {
  uid: string;
  title: string;
  /** YYYY-MM-DD in the viewer's local time zone. */
  date: string;
  end_date: string | null;
  /** HH:MM, or null for all-day events. */
  start_time: string | null;
  end_time: string | null;
  location: string;
  notes: string;
  /** Moodle puts the course short name in CATEGORIES. */
  category: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** True for a Moodle "Export calendar" link — the only kind of feed the app will fetch. */
export function isMoodleCalendarUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    value.length <= 2000 &&
    /(^|\/)calendar\/export_execute\.php$/.test(url.pathname) &&
    url.searchParams.has("authtoken")
  );
}

function unescapeText(value: string) {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** DTSTART/DTEND value → a Date (for date-times) or a bare day (for VALUE=DATE). */
function parseStamp(params: string, value: string): { day: string } | { at: Date } | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || /VALUE=DATE(;|$)/i.test(params)) {
    return date ? { day: `${date[1]}-${date[2]}-${date[3]}` } : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  // UTC stamps convert to the viewer's zone; TZID/floating stamps are taken as local time.
  const at = m[7] ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(at.getTime()) ? null : { at };
}

function dayBefore(day: string) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return localDay(d);
}

export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (CRLF followed by a space or tab).
  const lines = text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: IcsEvent[] = [];
  let current: Map<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = new Map();
    else if (line === "END:VEVENT" && current) {
      const event = toEvent(current);
      if (event) events.push(event);
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      const key = name.toUpperCase();
      // Keep the first occurrence; nested components (VALARM) come after the event's own fields.
      if (!current.has(key)) current.set(key, { params: params.join(";"), value: line.slice(colon + 1) });
    }
  }
  return events;
}

function toEvent(props: Map<string, { params: string; value: string }>): IcsEvent | null {
  const text = (key: string) => unescapeText(props.get(key)?.value ?? "").trim();
  const startProp = props.get("DTSTART");
  if (!startProp) return null;
  const start = parseStamp(startProp.params, startProp.value);
  if (!start) return null;
  const endProp = props.get("DTEND");
  const end = endProp ? parseStamp(endProp.params, endProp.value) : null;
  const base = {
    uid: text("UID") || `${startProp.value}-${text("SUMMARY")}`,
    title: (text("SUMMARY") || "Untitled event").slice(0, 160),
    location: text("LOCATION").slice(0, 500),
    notes: text("DESCRIPTION").slice(0, 5000),
    category: text("CATEGORIES"),
  };
  if ("day" in start) {
    // All-day DTEND is exclusive.
    const last = end && "day" in end && end.day > start.day ? dayBefore(end.day) : start.day;
    return { ...base, date: start.day, end_date: last === start.day ? null : last, start_time: null, end_time: null };
  }
  const date = localDay(start.at);
  // Moodle deadlines have DTEND equal to DTSTART; treat those as a single moment.
  const until = end && "at" in end && end.at > start.at ? end.at : null;
  const endDay = until ? localDay(until) : date;
  return {
    ...base,
    date,
    end_date: endDay === date ? null : endDay,
    start_time: localTime(start.at),
    end_time: until ? localTime(until) : null,
  };
}
