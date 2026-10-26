"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { listCalendarEvents, getKindColors, eventKind, EVENT_KINDS, type KindColors, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { listCalendarFeeds, loadFeedEvents, type FeedEvent } from "@/lib/calendarFeedsRepo";
import { addDays, expandOccurrences } from "@/lib/calendarRecurrence";
import { eventCoversDate } from "@/lib/calendarLayout";
import { todayKey } from "@/lib/planning";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import styles from "./HomeSchedule.module.css";
import calendarStyles from "@/app/calendar/calendar.module.css";

const asDate = (day: string) => new Date(`${day}T12:00:00`);
const label = (day: string) => asDate(day).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });

export default function HomeSchedule({ workspaceId }: { workspaceId: string }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [selected, setSelected] = useState(todayKey);
  const [events, setEvents] = useState<(CalendarEvent | FeedEvent)[]>([]);
  const [colors, setColors] = useState<KindColors>({});
  const [loading, setLoading] = useState(true);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    try { if (localStorage.getItem("gd-home-schedule-view") === "week") setMode("week"); } catch { /* optional preference */ }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [calendar, subscriptions, palette] = await Promise.allSettled([listCalendarEvents(workspaceId), listCalendarFeeds(workspaceId), getKindColors(workspaceId)]);
      if (active) setColors(palette.status === "fulfilled" ? palette.value : {});
      const messages: string[] = [];
      const next: (CalendarEvent | FeedEvent)[] = [];
      if (calendar.status === "fulfilled") next.push(...calendar.value);
      else messages.push("Couldn’t load workspace events.");
      if (subscriptions.status === "rejected") messages.push("Couldn’t load subscribed calendars.");
      if (active) { setEvents([...next]); setErrors([...messages]); setLoading(false); setFeedsLoading(subscriptions.status === "fulfilled" && subscriptions.value.length > 0); }
      if (subscriptions.status === "fulfilled") {
        const feeds = await Promise.allSettled(subscriptions.value.map(loadFeedEvents));
        feeds.forEach((feed, i) => {
          if (feed.status === "fulfilled") next.push(...feed.value);
          else messages.push(`Couldn’t load ${subscriptions.value[i].label}.`);
        });
      }
      if (active) { setEvents(next); setErrors(messages); setFeedsLoading(false); }
    })();
    return () => { active = false; };
  }, [workspaceId, refresh]);
  useSidebarLiveUpdates(workspaceId, ["calendar_events", "calendar_feeds"], async () => { setRefresh(v => v + 1); });

  const weekStart = addDays(selected, -((asDate(selected).getDay() + 6) % 7));
  const days = mode === "day" ? [selected] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const occurrences = expandOccurrences(events, days[0], days[days.length - 1]);
  const chooseMode = (value: "day" | "week") => {
    setMode(value);
    try { localStorage.setItem("gd-home-schedule-view", value); } catch { /* optional preference */ }
  };
  const calendarUrl = `/calendar?mode=${mode}&date=${selected}`;

  return <section className={styles.schedule} aria-label="Home schedule" data-custom={Object.keys(colors).join(" ")} style={Object.fromEntries(Object.entries(colors).map(([kind, color]) => [`--kind-${kind}`, color])) as CSSProperties}>
    <header className={styles.header}>
      <div><h2>Your schedule</h2><p aria-live="polite">{mode === "day" ? label(selected) : `${label(days[0])} – ${label(days[6])}`}</p></div>
      <div className={styles.switch} role="group" aria-label="Home schedule view">
        {(["day", "week"] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => chooseMode(value)}>{value === "day" ? "Day" : "Week"}</button>)}
      </div>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.navigation}>
        <button aria-label={`Previous ${mode}`} onClick={() => setSelected(day => addDays(day, mode === "day" ? -1 : -7))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
        <button onClick={() => setSelected(todayKey())}>Today</button>
        <button aria-label={`Next ${mode}`} onClick={() => setSelected(day => addDays(day, mode === "day" ? 1 : 7))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
        <input type="date" aria-label="Schedule date" value={selected} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setSelected(e.target.value); }} />
      </div>
      <Link href={calendarUrl}>Open calendar</Link>
    </div>
    {errors.length > 0 && <p className={styles.error} role="alert">{errors.join(" ")} <button onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}
    {feedsLoading && <p className={styles.empty} role="status">Loading subscribed calendars…</p>}
    {loading ? <p className={styles.empty} role="status">Loading your schedule…</p> : <div className={`${styles.days} ${mode === "week" ? styles.week : ""}`}>
      {days.map(day => {
        const items = occurrences.filter(event => eventCoversDate(event, day)).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.title.localeCompare(b.title));
        return <section key={day} className={styles.day} aria-label={label(day)}>
          {mode === "week" && <h3><button aria-current={day === todayKey() ? "date" : undefined} onClick={() => { setSelected(day); chooseMode("day"); }}>{asDate(day).toLocaleDateString("en", { weekday: "short", day: "numeric" })}</button></h3>}
          {items.length === 0 && <p className={styles.empty}>{errors.length ? "No events available." : feedsLoading ? "No events loaded yet." : "No events planned."}</p>}
          {items.map(event => <Link key={event.id} className={`${styles.event} ${calendarStyles[`kind_${eventKind(event)}`]}`} href={`/calendar?mode=day&date=${day}&event=${encodeURIComponent(event.series.id)}&occ=${event.occurrence}`}>
            <time>{event.date < day ? "Continues" : event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ""}` : "All day"}</time>
            <span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}<small className={styles.kindLabel}>{EVENT_KINDS.find(kind => kind.id === eventKind(event))?.label}{"feed" in event ? ` · ${event.feed.label}` : ""}</small></span>
          </Link>)}
        </section>;
      })}
    </div>}
  </section>;
}
