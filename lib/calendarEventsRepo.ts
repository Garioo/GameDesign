import { supabase } from "./supabase";
import type { Repeat } from "./calendarRecurrence";

/** One line of an event's agenda checklist. */
export interface AgendaItem { id: string; text: string }

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  notes: string;
  /** Workspace members on the event (profile ids). */
  attendees: string[];
  /** People outside Foundry, by name. */
  guests: string[];
  /** null for a one-off; otherwise how often it repeats (see lib/calendarRecurrence.ts). */
  repeat: Repeat | null;
  /** Last day an occurrence may start on; null = no end. */
  repeat_until: string | null;
  /** Occurrences removed one at a time. */
  skipped_dates: string[];
  /** false = a repeating event skips Saturdays and Sundays. */
  repeat_weekends: boolean;
  /** A one-off's checklist. Repeating events keep theirs per occurrence (getOccurrence), so every one starts empty. */
  agenda: AgendaItem[];
}
export type CalendarEventDraft = Omit<CalendarEvent, "id">;
const fields = "id,title,date,end_date,start_time,end_time,location,notes,attendees,guests,repeat,repeat_until,skipped_dates,repeat_weekends,agenda";
function eventError(error: { code?: string; message: string }) {
  return new Error(error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST204" || error.code === "42703"
    ? "Calendar events need a database update. Apply the calendar-events, calendar-event-ranges, event-attendees and event-recurrence migrations in Supabase."
    : error.message);
}
export async function listCalendarEvents(project: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.from("calendar_events").select(fields).eq("project_id", project).order("date").order("start_time", { nullsFirst: true }).order("title");
  if (error) throw eventError(error);
  return data ?? [];
}
export async function saveCalendarEvent(project: string, draft: CalendarEventDraft, id?: string): Promise<CalendarEvent> {
  const guests = [...new Set(draft.guests.map(g => g.trim()).filter(Boolean))];
  const agenda = draft.agenda.map(item => ({ id: item.id, text: item.text.trim() })).filter(item => item.text);
  const repeat = draft.repeat ?? null;
  const clean = {
    ...draft, title: draft.title.trim(), location: draft.location.trim(), attendees: [...new Set(draft.attendees)], guests,
    repeat, repeat_until: repeat ? draft.repeat_until || null : null, skipped_dates: repeat ? draft.skipped_dates : [],
    repeat_weekends: repeat ? draft.repeat_weekends : true,
    // A repeating event's notes and agenda live per occurrence (calendar_event_notes), so every one starts empty.
    notes: repeat ? "" : draft.notes.trim(),
    agenda: repeat ? [] : agenda,
  };
  if (agenda.length > 50 || agenda.some(item => item.text.length > 300)) throw new Error("An agenda can have up to 50 items of up to 300 characters.");
  if (clean.repeat_until && clean.repeat_until < clean.date) throw new Error("A repeating event must end on or after its first date.");
  if (guests.some(g => g.length > 120)) throw new Error("Guest names can be up to 120 characters.");
  if (clean.attendees.length > 100 || guests.length > 100) throw new Error("An event can have up to 100 attendees and 100 guests.");
  if (!clean.title || clean.title.length > 160) throw new Error("Enter an event title of up to 160 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)) throw new Error("Choose an event date.");
  if (clean.end_date && (!/^\d{4}-\d{2}-\d{2}$/.test(clean.end_date) || clean.end_date < clean.date)) throw new Error("End date must be on or after the start date.");
  if (clean.end_time && (!clean.start_time || ((clean.end_date || clean.date) === clean.date && clean.end_time <= clean.start_time))) throw new Error("End time must be after start time.");
  const query = id
    ? supabase.from("calendar_events").update(clean).eq("project_id", project).eq("id", id)
    : supabase.from("calendar_events").insert({ ...clean, project_id: project });
  const { data, error } = await query.select(fields).single();
  if (error) throw eventError(error);
  // Turning a one-off into a series: its notes and agenda become the first occurrence's.
  const carried = draft.notes.trim();
  if (repeat && carried) await saveOccurrenceNotes(project, data.id, data.date, carried);
  if (repeat && agenda.length) await saveOccurrenceAgenda(project, data.id, data.date, agenda);
  return data;
}
export async function deleteCalendarEvent(project: string, id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("project_id", project).eq("id", id).select("id").single();
  if (error) throw eventError(error);
}

/** Remove one occurrence of a repeating event, leaving the rest of the series. */
export async function skipOccurrence(project: string, event: CalendarEvent, occurrence: string): Promise<CalendarEvent> {
  const skipped_dates = [...new Set([...event.skipped_dates, occurrence])].sort();
  const { data, error } = await supabase.from("calendar_events").update({ skipped_dates }).eq("project_id", project).eq("id", event.id).select(fields).single();
  if (error) throw eventError(error);
  return data;
}

/** Replace just the agenda (quick add / remove from the event view). */
export async function saveAgenda(project: string, eventId: string, agenda: AgendaItem[]): Promise<CalendarEvent> {
  if (agenda.length > 50) throw new Error("An agenda can have up to 50 items.");
  const { data, error } = await supabase.from("calendar_events").update({ agenda }).eq("project_id", project).eq("id", eventId).select(fields).single();
  if (error) throw eventError(error);
  return data;
}

/** Ids of the agenda items ticked on one occurrence. */
export async function listAgendaChecks(eventId: string, occurrence: string): Promise<string[]> {
  const { data, error } = await supabase.from("calendar_agenda_checks").select("item_id").eq("event_id", eventId).eq("occurrence", occurrence);
  if (error) throw eventError(error);
  return (data ?? []).map(row => row.item_id as string);
}

export async function setAgendaCheck(project: string, eventId: string, occurrence: string, itemId: string, checked: boolean): Promise<void> {
  const { error } = checked
    ? await supabase.from("calendar_agenda_checks").upsert({ project_id: project, event_id: eventId, occurrence, item_id: itemId }, { onConflict: "event_id,occurrence,item_id", ignoreDuplicates: true })
    : await supabase.from("calendar_agenda_checks").delete().eq("event_id", eventId).eq("occurrence", occurrence).eq("item_id", itemId);
  if (error) throw eventError(error);
}

/** Save just the notes (edited live from the event view). */
export async function saveEventNotes(project: string, eventId: string, notes: string): Promise<CalendarEvent> {
  if (notes.length > 5000) throw new Error("Notes can be up to 5000 characters.");
  const { data, error } = await supabase.from("calendar_events").update({ notes }).eq("project_id", project).eq("id", eventId).select(fields).single();
  if (error) throw eventError(error);
  return data;
}

/** Notes and agenda of one occurrence of a repeating event (empty until someone writes them). */
export async function getOccurrence(eventId: string, occurrence: string): Promise<{ notes: string; agenda: AgendaItem[] }> {
  const { data, error } = await supabase.from("calendar_event_notes").select("notes,agenda").eq("event_id", eventId).eq("occurrence", occurrence).maybeSingle();
  if (error) throw eventError(error);
  return { notes: (data?.notes as string | undefined) ?? "", agenda: (data?.agenda as AgendaItem[] | undefined) ?? [] };
}

/** Replace one occurrence's agenda (its notes are left alone). */
export async function saveOccurrenceAgenda(project: string, eventId: string, occurrence: string, agenda: AgendaItem[]): Promise<void> {
  if (agenda.length > 50 || agenda.some(item => !item.text.trim() || item.text.length > 300)) throw new Error("An agenda can have up to 50 items of up to 300 characters.");
  const { error } = await supabase.from("calendar_event_notes")
    .upsert({ project_id: project, event_id: eventId, occurrence, agenda, updated_at: new Date().toISOString() }, { onConflict: "event_id,occurrence" });
  if (error) throw eventError(error);
}

export async function saveOccurrenceNotes(project: string, eventId: string, occurrence: string, notes: string): Promise<void> {
  if (notes.length > 5000) throw new Error("Notes can be up to 5000 characters.");
  const { error } = await supabase.from("calendar_event_notes")
    .upsert({ project_id: project, event_id: eventId, occurrence, notes, updated_at: new Date().toISOString() }, { onConflict: "event_id,occurrence" });
  if (error) throw eventError(error);
}

/** Undo skipOccurrence: bring one occurrence back (its notes and agenda were never removed). */
export async function unskipOccurrence(project: string, eventId: string, occurrence: string): Promise<CalendarEvent> {
  const { data: row, error: readError } = await supabase.from("calendar_events").select("skipped_dates").eq("project_id", project).eq("id", eventId).single();
  if (readError) throw eventError(readError);
  const skipped_dates = ((row?.skipped_dates as string[] | null) ?? []).filter(d => d !== occurrence);
  const { data, error } = await supabase.from("calendar_events").update({ skipped_dates }).eq("project_id", project).eq("id", eventId).select(fields).single();
  if (error) throw eventError(error);
  return data;
}

/** Undo a deleted one-off event: put the same row (same id, so links keep working) back. */
export async function restoreCalendarEvent(project: string, event: CalendarEvent): Promise<CalendarEvent> {
  const { data, error } = await supabase.from("calendar_events").insert({ ...event, project_id: project }).select(fields).single();
  if (error) throw eventError(error);
  return data;
}
