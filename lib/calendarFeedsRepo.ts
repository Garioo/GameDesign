import { supabase } from "./supabase";
import { isMoodleCalendarUrl, parseIcs } from "./ical";
import type { CalendarEvent } from "./calendarEventsRepo";

/** A subscribed calendar. Its link is never read back into the browser. */
export interface CalendarFeed {
  id: string;
  label: string;
  created_by: string | null;
  created_at: string;
}
/** An event read from a subscribed calendar — shown on the calendar, never edited here. */
export type FeedEvent = CalendarEvent & { feed: { id: string; label: string }; category: string };

const fields = "id,label,created_by,created_at";
function feedError(error: { code?: string; message: string }) {
  return new Error(["PGRST205", "42P01", "PGRST204", "42703", "PGRST202"].includes(error.code ?? "")
    ? "Subscribed calendars need a database update. Apply the calendar-feeds migration in Supabase."
    : error.message);
}

export async function listCalendarFeeds(project: string): Promise<CalendarFeed[]> {
  const { data, error } = await supabase.from("calendar_feeds").select(fields).eq("project_id", project).order("created_at");
  if (error) throw feedError(error);
  return data ?? [];
}

export async function addCalendarFeed(project: string, label: string, url: string): Promise<CalendarFeed> {
  const clean = { label: label.trim() || "Moodle", url: url.trim() };
  if (clean.label.length > 80) throw new Error("Use a name of up to 80 characters.");
  if (!isMoodleCalendarUrl(clean.url))
    throw new Error("Paste the link from Moodle's Export calendar page. It starts with https:// and contains calendar/export_execute.php and authtoken=.");
  const { data, error } = await supabase.from("calendar_feeds").insert({ ...clean, project_id: project }).select(fields).single();
  if (error) throw feedError(error);
  return data;
}

export async function deleteCalendarFeed(project: string, id: string): Promise<void> {
  const { error } = await supabase.from("calendar_feeds").delete().eq("project_id", project).eq("id", id).select("id").single();
  if (error) throw feedError(error);
}

export async function loadFeedEvents(feed: CalendarFeed): Promise<FeedEvent[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to load subscribed calendars.");
  const response = await fetch(`/api/calendar-feed?id=${encodeURIComponent(feed.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`${feed.label}: ${body?.error ?? "Couldn't load this calendar."}`);
  }
  return parseIcs(await response.text()).map(({ uid, ...event }) => ({
    ...event,
    id: `feed:${feed.id}:${uid}:${event.date}`,
    feed: { id: feed.id, label: feed.label },
    attendees: [],
    guests: [],
  }));
}
