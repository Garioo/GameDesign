import { supabase } from "./supabase";

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
}
export type CalendarEventDraft = Omit<CalendarEvent, "id">;
const fields = "id,title,date,end_date,start_time,end_time,location,notes,attendees,guests";
function eventError(error: { code?: string; message: string }) {
  return new Error(error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST204" || error.code === "42703"
    ? "Calendar events need a database update. Apply the calendar-events, calendar-event-ranges and event-attendees migrations in Supabase."
    : error.message);
}
export async function listCalendarEvents(project: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.from("calendar_events").select(fields).eq("project_id", project).order("date").order("start_time", { nullsFirst: true }).order("title");
  if (error) throw eventError(error);
  return data ?? [];
}
export async function saveCalendarEvent(project: string, draft: CalendarEventDraft, id?: string): Promise<CalendarEvent> {
  const guests = [...new Set(draft.guests.map(g => g.trim()).filter(Boolean))];
  const clean = { ...draft, title: draft.title.trim(), location: draft.location.trim(), notes: draft.notes.trim(), attendees: [...new Set(draft.attendees)], guests };
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
  return data;
}
export async function deleteCalendarEvent(project: string, id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("project_id", project).eq("id", id).select("id").single();
  if (error) throw eventError(error);
}
