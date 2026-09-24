import type { CalendarEvent } from "./calendarEventsRepo";

/** Inclusive date range (YYYY-MM-DD) shown as a bar across the calendar grid. */
export interface DateSpan { id: string; from: string; to: string }

export const eventEndDate = (event: CalendarEvent) => event.end_date || event.date;
export const eventCoversDate = (event: CalendarEvent, date: string) => event.date <= date && eventEndDate(event) >= date;
export const spanCoversDate = (span: DateSpan, date: string) => span.from <= date && span.to >= date;
export const spanOverlaps = (span: DateSpan, from: string, to: string) => span.from <= to && span.to >= from;
export const eventSpan = <T extends CalendarEvent>(event: T) => ({ id: event.id, from: event.date, to: eventEndDate(event), event });

/** Inclusive day ranges, clipped to a week, with stable non-overlapping lanes shared by every kind of span. */
export function calendarWeekLayout<T extends DateSpan>(spans: T[], dates: string[]) {
  const laneEnds: number[] = [];
  const segments = spans.filter(span => spanOverlaps(span, dates[0], dates[6]))
    .sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to) || a.id.localeCompare(b.id))
    .map(span => {
      const start = dates.findIndex(date => date >= span.from);
      const end = dates.filter(date => date <= span.to).length - 1;
      let lane = laneEnds.findIndex(last => last < start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { span, start, end, lane, continuesBefore: span.from < dates[0], continuesAfter: span.to > dates[6] };
    });
  return { segments, lanes: laneEnds.length };
}
