"use client";

import { useEffect, useRef, useState } from "react";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { listCalendarFeeds, loadFeedEvents, type CalendarFeed, type FeedEvent } from "@/lib/calendarFeedsRepo";
import { calendarWeekLayout, eventCoversDate, eventEndDate, eventSpan } from "@/lib/calendarLayout";
import { expandOccurrences, isOccurrence, type Occurrence } from "@/lib/calendarRecurrence";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { dayNumber, isoWeek } from "@/lib/gantt";
import EventDialog from "./EventDialog";
import { plainLinkedText } from "@/lib/pageLinks";
import CalendarFeedsDialog from "./CalendarFeedsDialog";
import PlanningHeader from "../board/PlanningHeader";
import { PlanningIcon } from "../board/PlanningIcons";
import styles from "./calendar.module.css";
import { useShortcuts } from "@/lib/shortcuts";
import Link from "next/link";
import { usePlanning } from "../board/TaskPlanning";
import { useFollowedView, useShareView } from "@/lib/followView";

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekOf = (date: Date) => isoWeek(dayNumber(dayKey(date)));
const isDay = (value: string | null | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const isMode = (value: string | null | undefined): value is "month" | "week" | "day" => value === "month" || value === "week" || value === "day";

export default function CalendarView({ canEdit, project, onNavigation }: {
  canEdit: boolean;
  project: string;
  onNavigation: () => void;
}) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [search, setSearch] = useState("");
  const [standaloneEvents, setStandaloneEvents] = useState<CalendarEvent[]>([]);
  const [eventsError, setEventsError] = useState("");
  const [eventsLoading, setEventsLoading] = useState(true);
  // The stored event (a repeating one's whole series) and which occurrence was opened.
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | FeedEvent | null | undefined>();
  const [editingOccurrence, setEditingOccurrence] = useState<string | undefined>();
  const openEvent = (shown: Occurrence<CalendarEvent | FeedEvent>) => { setEditingEvent(shown.series); setEditingOccurrence(shown.occurrence); };
  const eventEditingRef = useRef(false);

  // Followers see the same view, day and open event (lib/followView).
  useShareView("calendar", {
    mode: view,
    date: selected,
    ...(editingEvent ? { event: editingEvent.id, ...(editingOccurrence ? { occ: editingOccurrence } : {}) } : {}),
  });
  const followedView = useFollowedView();
  const following = followedView !== undefined;
  const followMode = followedView?.mode, followDate = followedView?.date;
  useEffect(() => {
    if (isMode(followMode)) setView(followMode);
    if (isDay(followDate)) goToDay(followDate);
  }, [followMode, followDate]);
  const followEvent = following ? `${followedView?.event ?? ""}@${followedView?.occ ?? ""}` : undefined;
  const appliedFollowEvent = useRef<string | undefined>(undefined);
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [feedEvents, setFeedEvents] = useState<Record<string, FeedEvent[]>>({});
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({});
  const [feedsOpen, setFeedsOpen] = useState(false);
  const [feedsReload, setFeedsReload] = useState(0);
  // Event to open once events load (?event=<id>, from an attendee notification).
  const [wantedEvent, setWantedEvent] = useState<string | null>(null);
  // Deep link (search, notifications, following someone):
  // /calendar?date=YYYY-MM-DD&mode=week&event=<id>&occ=YYYY-MM-DD
  const [wantedOccurrence, setWantedOccurrence] = useState<string | null>(null);
  const goToDay = (wanted: string) => {
    const day = new Date(`${wanted}T12:00:00`);
    setSelected(wanted);
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setWantedEvent(params.get("event"));
    const occ = params.get("occ");
    if (isDay(occ)) setWantedOccurrence(occ);
    const mode = params.get("mode");
    if (isMode(mode)) setView(mode);
    const wanted = params.get("date");
    if (isDay(wanted)) goToDay(wanted);
  }, []);
  useEffect(() => {
    let active = true;
    setStandaloneEvents([]); setEventsLoading(true);
    listCalendarEvents(project).then(events => { if (active) { setStandaloneEvents(events); setEventsError(""); } })
      .catch(error => { if (active) setEventsError(error.message); })
      .finally(() => { if (active) setEventsLoading(false); });
    return () => { active = false; };
  }, [project]);
  // Subscribed calendars are fetched through /api/calendar-feed; each loads independently
  // so one broken link doesn't hide the others.
  useEffect(() => {
    if (!project) return;
    let active = true;
    listCalendarFeeds(project).then(list => {
      if (!active) return;
      setFeeds(list);
      setFeedEvents(current => Object.fromEntries(Object.entries(current).filter(([id]) => list.some(f => f.id === id))));
      list.forEach(feed => loadFeedEvents(feed)
        .then(events => { if (active) { setFeedEvents(c => ({ ...c, [feed.id]: events })); setFeedErrors(({ [feed.id]: _, ...rest }) => rest); } })
        .catch(error => { if (active) setFeedErrors(c => ({ ...c, [feed.id]: error.message })); }));
    }).catch(error => { if (active) setFeedErrors({ list: error.message }); });
    return () => { active = false; };
  }, [project, feedsReload]);
  // Kept until the event turns up: the first load can run before the workspace
  // id is known and come back empty.
  useEffect(() => {
    const found = wantedEvent ? standaloneEvents.find(e => e.id === wantedEvent) : undefined;
    if (!found) return;
    setEditingEvent(found);
    // ?occ= (or ?date=) picks the occurrence of a repeating event.
    const day = wantedOccurrence ?? selected;
    setEditingOccurrence(found.repeat && isOccurrence(found, day) ? day : found.date);
    setWantedEvent(null);
  }, [wantedEvent, standaloneEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (followEvent === undefined) { appliedFollowEvent.current = undefined; return; }
    if (followEvent === appliedFollowEvent.current) return;
    const [id, occ] = followEvent.split("@");
    if (!id) {
      appliedFollowEvent.current = followEvent;
      // Never close a form you're typing in.
      if (editingEvent && !eventEditingRef.current) { setEditingEvent(undefined); setEditingOccurrence(undefined); }
      return;
    }
    const found = [...standaloneEvents, ...Object.values(feedEvents).flat()].find(e => e.id === id);
    if (!found) return; // not loaded yet — tried again when events arrive
    appliedFollowEvent.current = followEvent;
    if (eventEditingRef.current) return;
    setEditingEvent(found);
    setEditingOccurrence(occ || found.date);
  }, [followEvent, standaloneEvents, feedEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep an open event current when someone else saves it (notes, agenda, time…).
  useEffect(() => {
    setEditingEvent(current => {
      if (!current || "feed" in current) return current;
      return standaloneEvents.find(e => e.id === current.id) ?? current;
    });
  }, [standaloneEvents]);
  useSidebarLiveUpdates(project, ["calendar_events"], async () => {
    try { setStandaloneEvents(await listCalendarEvents(project)); setEventsError(""); }
    catch (error) { setEventsError((error as Error).message); }
  });
  const feedClass = (event: CalendarEvent | FeedEvent) => "feed" in event ? styles.feedEvent : "";
  const failedFeeds = Object.keys(feedErrors).length;
  const eventRange = (event: CalendarEvent) => eventEndDate(event) !== event.date ? `${event.date} – ${eventEndDate(event)} · ` : "";
  const eventTime = (event: CalendarEvent) => event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}` : "All day";
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const cells = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
  const anchor = new Date(`${selected}T12:00:00`);
  const weekStart = new Date(anchor);
  weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const visibleCells = view === "month" ? cells : Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const today = dayKey(new Date());
  const monthLabel = month.toLocaleDateString("en", { month: "long", year: "numeric" });
  const selectedLabel = new Date(`${selected}T12:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });
  const rangeStart = view === "day" ? selected : view === "week" ? dayKey(visibleCells[0]) : dayKey(month);
  const rangeEnd = view === "day" ? selected : view === "week" ? dayKey(visibleCells[6]) : dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  // Repeating events become one entry per occurrence, over every day on screen.
  const shownFrom = [dayKey(visibleCells[0]), selected].sort()[0];
  const shownTo = [dayKey(visibleCells[visibleCells.length - 1]), selected].sort()[1];
  const allEvents = expandOccurrences<CalendarEvent | FeedEvent>([...standaloneEvents, ...Object.values(feedEvents).flat()], shownFrom, shownTo);
  const matchingEvents = allEvents.filter(event => `${event.title} ${event.location} ${plainLinkedText(event.notes)} ${event.agenda.map(i => i.text).join(" ")} ${"feed" in event ? `${event.feed.label} ${event.category}` : ""}`.toLowerCase().includes(search.toLowerCase()));
  const eventsOn = (date: string) => matchingEvents.filter(event => eventCoversDate(event, date)).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.title.localeCompare(b.title));
  function shiftMonth(delta: number) {
    if (view !== "month") {
      const next = new Date(anchor); next.setDate(next.getDate() + delta * (view === "week" ? 7 : 1));
      setSelected(dayKey(next)); setMonth(new Date(next.getFullYear(), next.getMonth(), 1)); return;
    }
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelected(dayKey(next));
  }
  function goToToday() {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(dayKey(now));
  }
  // Milestones (from the board's planning data) show on their due dates.
  const planning = usePlanning();
  const milestonesOn = (date: string) => (planning?.milestones ?? []).filter((m) => m.dueDate === date);
  const milestoneLink = (m: { id: string; name: string; completedAt: string | null }, compact: boolean) => (
    <Link key={m.id} href={`/milestones#m-${m.id}`} className={`${compact ? styles.milestoneFlag : styles.milestoneRow} ${m.completedAt ? styles.milestoneDone : ""}`} title={`Milestone: ${m.name}`}>
      <span className={styles.milestoneDiamond} aria-hidden="true" />
      <span>{m.name}</span>
    </Link>
  );

  // Keyboard shortcuts (lib/shortcuts.ts; press ? for the list).
  useShortcuts([
    { id: "cal-today", keys: "t", label: "Go to today", group: "Calendar", run: goToToday },
    { id: "cal-prev", keys: "ArrowLeft", label: `Previous ${view}`, group: "Calendar", run: () => shiftMonth(-1) },
    { id: "cal-next", keys: "ArrowRight", label: `Next ${view}`, group: "Calendar", run: () => shiftMonth(1) },
    { id: "cal-prev-j", keys: "k", label: `Previous ${view}`, group: "Calendar", palette: false, run: () => shiftMonth(-1) },
    { id: "cal-next-j", keys: "j", label: `Next ${view}`, group: "Calendar", palette: false, run: () => shiftMonth(1) },
    { id: "cal-month", keys: "m", label: "Month view", group: "Calendar", enabled: view !== "month", run: () => setView("month") },
    { id: "cal-week", keys: "w", label: "Week view", group: "Calendar", enabled: view !== "week", run: () => setView("week") },
    { id: "cal-day", keys: "d", label: "Day view", group: "Calendar", enabled: view !== "day", run: () => setView("day") },
    { id: "cal-new", keys: "n", label: "New event", group: "Calendar", enabled: canEdit, run: () => setEditingEvent(null) },
    {
      id: "cal-filter",
      keys: "f",
      label: "Search events",
      group: "Calendar",
      run: () => document.querySelector<HTMLInputElement>(".planning-search input")?.focus(),
    },
  ]);
  function standaloneButton(event: Occurrence<CalendarEvent | FeedEvent>, compact = false) {
    return <button key={event.id} className={`${compact ? `${styles.event} ${styles.standaloneEvent}` : styles.agendaTask} ${feedClass(event)}`} onClick={() => openEvent(event)} title={`${event.title} · ${eventRange(event)}${eventTime(event)}${event.repeat ? " · repeats" : ""}`}>
      <PlanningIcon name={event.repeat ? "repeat" : "calendar"} />
      {compact ? <span>{event.start_time ? `${event.start_time.slice(0, 5)} ` : ""}{event.title}</span> : <span><strong>{event.title}</strong><small>{eventRange(event)}{eventTime(event)}{event.location ? ` · ${event.location}` : ""}{"feed" in event ? ` · ${event.category || event.feed.label}` : ""}</small></span>}
    </button>;
  }
  return <>
    <PlanningHeader title="Calendar" mode="calendar" onNavigation={onNavigation} createLabel="New event" onCreate={() => setEditingEvent(null)} canEdit={canEdit}>
      <label className="planning-search"><PlanningIcon name="search" /><input aria-label="Search calendar events" placeholder="Search events" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <button className={styles.feedsButton} onClick={() => setFeedsOpen(true)} aria-label={`Subscribed calendars${failedFeeds ? `, ${failedFeeds} failed to load` : ""}`}><PlanningIcon name="calendar" />Calendars{feeds.length ? ` · ${feeds.length}` : ""}{failedFeeds ? <span className={styles.feedWarning} aria-hidden="true">!</span> : null}</button>
    </PlanningHeader>
    {eventsLoading && <p role="status" className={styles.eventNotice}>Loading calendar events…</p>}
    {eventsError && <p role="alert" className={styles.eventError}>{eventsError} <button onClick={async () => { try { setStandaloneEvents(await listCalendarEvents(project)); setEventsError(""); } catch (e) { setEventsError((e as Error).message); } }}>Retry</button></p>}
    <main className={`${styles.layout} ${view === "day" ? styles.dayLayout : ""}`}>
      <section className={styles.calendar} aria-label={`${view === "month" ? "Monthly" : view === "week" ? "Weekly" : "Daily"} calendar`}>
        <div className={styles.toolbar}>
          <div><h2 aria-live="polite">{view === "day" ? `${selectedLabel} · Week ${weekOf(anchor)}` : view === "week" ? `Week ${weekOf(visibleCells[0])} · ${visibleCells[0].toLocaleDateString("en", { month: "short", day: "numeric" })} – ${visibleCells[6].toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : monthLabel}</h2><p>{matchingEvents.filter(event => event.date <= rangeEnd && eventEndDate(event) >= rangeStart).length} events this {view}</p></div>
          <div className={styles.navigation}>
            <div className={styles.viewSwitch} role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div>
            <button onClick={goToToday}>Today</button><button aria-label={`Previous ${view}`} onClick={() => shiftMonth(-1)}><PlanningIcon name="arrowLeft" /></button><button aria-label={`Next ${view}`} onClick={() => shiftMonth(1)}><PlanningIcon name="arrowRight" /></button></div>
        </div>
        {view === "day" ? <div className={styles.daySchedule}>
          <div className={styles.daySectionHead}><h3>Events</h3>{canEdit && <button className={styles.addEvent} onClick={() => setEditingEvent(null)}><PlanningIcon name="plus" /> Add event on this date</button>}</div>
          {milestonesOn(selected).map((m) => milestoneLink(m, false))}
          {eventsOn(selected).map(event => <div key={event.id} className={styles.dayEventRow}><time>{eventCoversDate(event, selected) && event.date !== selected ? "Continues" : eventTime(event)}</time>{standaloneButton(event)}</div>)}
          {!eventsOn(selected).length && <p className={styles.empty}>No events on this date.</p>}
        </div> : <div className={`${styles.monthScroll} ${view === "week" ? styles.weekView : ""}`}>
          <div className={styles.weekdays}>{weekdays.map((day, i) => <span key={day} className={i >= 5 ? styles.weekendHead : undefined}>{day}</span>)}</div>
          <div>
            {Array.from({ length: view === "month" ? 6 : 1 }, (_, week) => {
              const weekDates = visibleCells.slice(week * 7, week * 7 + 7);
              const { segments, lanes } = calendarWeekLayout(matchingEvents.map(eventSpan), weekDates.map(dayKey));
              return <div key={week} className={styles.week}>
                {weekDates.map((date, column) => {
                  const key = dayKey(date);
                  const standalone = eventsOn(key);
                  const selectDate = () => { setSelected(key); if (canEdit) setEditingEvent(null); };
                  return <div key={key} className={`${styles.day} ${canEdit ? styles.clickableDay : ""} ${view === "month" && date.getMonth() !== month.getMonth() ? styles.outside : ""} ${key === selected ? styles.selected : ""} ${column >= 5 ? styles.weekend : ""}`}>
                    {canEdit && <button type="button" className={styles.dateTarget} aria-label={`Add event on ${date.toLocaleDateString("en", { dateStyle: "full" })}`} onClick={selectDate} />}
                    {column === 0 && <span className={styles.weekNumber} title={`Week ${weekOf(date)}`}>W{weekOf(date)}</span>}
                    {milestonesOn(key).slice(0, 1).map((m) => milestoneLink(m, true))}
                    <button className={`${styles.date} ${key === today ? styles.today : ""}`} aria-label={`${date.toLocaleDateString("en", { dateStyle: "full" })}, ${standalone.length} events`} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} onClick={selectDate}>{date.getDate()}</button>
                    <div style={{ height: lanes * 26 }} aria-hidden="true" />
                  </div>;
                })}
                <div className={styles.weekEvents}>
                  {segments.map(({ span, start, end, lane, continuesBefore, continuesAfter }) => {
                    const edges = `${continuesBefore ? styles.continuesBefore : ""} ${continuesAfter ? styles.continuesAfter : ""}`;
                    const place = { gridColumn: `${start + 1} / ${end + 2}`, gridRow: lane + 1 };
                    const { event } = span;
                    return <button key={span.id} className={`${styles.spanEvent} ${edges} ${feedClass(event)}`} style={place}
                      title={`${event.title} · ${eventRange(event)}${eventTime(event)}${event.repeat ? " · repeats" : ""}`} onClick={() => openEvent(event)}>
                      <PlanningIcon name={event.repeat ? "repeat" : "calendar"} /><span>{event.start_time ? `${event.start_time.slice(0, 5)} ` : ""}{event.title}</span>
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>
        </div>}
      </section>
      {view !== "day" && <aside className={styles.agenda} aria-label="Calendar agenda">
        <div className={styles.agendaHeading}><span>Daily agenda · Week {weekOf(anchor)}</span><h2>{selectedLabel}</h2></div>
        {canEdit && <button className={styles.addEvent} onClick={() => setEditingEvent(null)}><PlanningIcon name="plus" /> Add event on this date</button>}
        {milestonesOn(selected).map((m) => milestoneLink(m, false))}
        {eventsOn(selected).map(event => standaloneButton(event))}
        {!eventsOn(selected).length && <p className={styles.empty}>No events on this date{search ? " match your search" : ""}.</p>}
      </aside>}
    </main>
    {feedsOpen && <CalendarFeedsDialog project={project} feeds={feeds} canEdit={canEdit} errors={feedErrors} onClose={() => setFeedsOpen(false)}
      onAdded={() => setFeedsReload(n => n + 1)} onReload={() => setFeedsReload(n => n + 1)}
      onRemoved={id => { setFeeds(c => c.filter(f => f.id !== id)); setFeedEvents(({ [id]: _, ...rest }) => rest); setFeedErrors(({ [id]: _, ...rest }) => rest); }} />}
    {editingEvent !== undefined && <EventDialog key={`${editingEvent?.id ?? "new"}@${editingOccurrence ?? ""}`} event={editingEvent} occurrence={editingOccurrence ?? undefined} editingRef={eventEditingRef} date={selected} project={project} canEdit={canEdit && !(editingEvent && "feed" in editingEvent)} source={editingEvent && "feed" in editingEvent ? editingEvent.feed.label : undefined} onClose={() => { setEditingEvent(undefined); setEditingOccurrence(undefined); }} onSaved={(event, stay) => {
      setStandaloneEvents(current => [...current.filter(item => item.id !== event.id), event]);
      // Keep an open dialog showing the latest agenda after a quick add.
      setEditingEvent(current => current && current.id === event.id ? event : current);
      setEventsError("");
      if (stay) return;
      setSelected(event.date); setMonth(new Date(`${event.date.slice(0, 7)}-01T12:00:00`));
    }} onDeleted={id => setStandaloneEvents(current => current.filter(event => event.id !== id))} />}
  </>;
}
