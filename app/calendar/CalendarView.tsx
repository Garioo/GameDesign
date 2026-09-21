"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { boardEndDate, type Board, type BoardCard } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { calendarWeekLayout, eventCoversDate, eventEndDate, eventSpan, spanCoversDate, spanOverlaps, type DateSpan } from "@/lib/calendarLayout";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import EventDialog from "./EventDialog";
import PlanningHeader from "../board/PlanningHeader";
import { PlanningIcon } from "../board/PlanningIcons";
import styles from "./calendar.module.css";

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type DateField = "period" | "deadline" | "startDate" | "firmDeadline";
const fieldLabels: Record<DateField, string> = { period: "Scheduled period", deadline: "Scheduled end", startDate: "Start date", firmDeadline: "Firm deadline" };

export default function CalendarView({ boards, boardId, onBoardChange, allBoards, onAllBoardsChange, onOpen, canEdit, project, onNavigation }: {
  boards: Board[];
  boardId: string | null;
  onBoardChange: (id: string) => void;
  allBoards: boolean;
  onAllBoardsChange: (all: boolean) => void;
  onOpen: (card: BoardCard) => void;
  canEdit: boolean;
  project: string;
  onNavigation: () => void;
}) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [search, setSearch] = useState("");
  const [field, setField] = useState<DateField>("period");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [standaloneEvents, setStandaloneEvents] = useState<CalendarEvent[]>([]);
  const [eventsError, setEventsError] = useState("");
  const [eventsLoading, setEventsLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null | undefined>();
  useEffect(() => {
    let active = true;
    setStandaloneEvents([]); setEventsLoading(true);
    listCalendarEvents(project).then(events => { if (active) { setStandaloneEvents(events); setEventsError(""); } })
      .catch(error => { if (active) setEventsError(error.message); })
      .finally(() => { if (active) setEventsLoading(false); });
    return () => { active = false; };
  }, [project]);
  useSidebarLiveUpdates(project, ["calendar_events"], async () => {
    try { setStandaloneEvents(await listCalendarEvents(project)); setEventsError(""); }
    catch (error) { setEventsError((error as Error).message); }
  });
  const matchingEvents = standaloneEvents.filter(event => `${event.title} ${event.location} ${event.notes}`.toLowerCase().includes(search.toLowerCase()));
  const eventsOn = (date: string) => matchingEvents.filter(event => eventCoversDate(event, date)).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.title.localeCompare(b.title));
  const eventRange = (event: CalendarEvent) => eventEndDate(event) !== event.date ? `${event.date} – ${eventEndDate(event)} · ` : "";
  const eventTime = (event: CalendarEvent) => event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}` : "All day";
  const formatEnd = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
  const board = boards.find(b => b.id === boardId) ?? boards[0];
  const sourceBoards = allBoards ? boards : board ? [board] : [];
  // Tasks take their board's color so bars from different boards stay tellable apart.
  const tasks = sourceBoards.flatMap(board => board.cols.flatMap(col => col.cards.map(card => ({ card, board, stage: col.name, color: boardColor(board, boards), completed: !!col.isCompleted }))))
    .filter(task => (!hideCompleted || !task.completed) && task.card.title.toLowerCase().includes(search.toLowerCase()));
  type Task = typeof tasks[number];
  /** "Scheduled period" stretches a task from its start date to its deadline, unless the task asks for its end date only; the other modes pin it to one date. */
  const taskSpan = (task: Task): (DateSpan & { task: Task }) | null => {
    const to = field === "period" ? task.card.deadline || task.card.startDate : task.card[field];
    const from = field === "period" ? (task.card.calendarEndOnly ? to : task.card.startDate || task.card.deadline) : task.card[field];
    return from && to ? { id: task.card.id, from, to, task } : null;
  };
  const taskSpans = tasks.map(taskSpan).filter((span): span is DateSpan & { task: Task } => !!span);
  const tasksOn = (date: string) => taskSpans.filter(span => spanCoversDate(span, date)).map(span => span.task);
  const unscheduled = tasks.filter(task => !taskSpan(task));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const cells = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
  const anchor = new Date(`${selected}T12:00:00`);
  const weekStart = new Date(anchor);
  weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const visibleCells = view === "month" ? cells : Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const today = dayKey(new Date());
  const selectedTasks = tasksOn(selected);
  const monthLabel = month.toLocaleDateString("en", { month: "long", year: "numeric" });
  const selectedLabel = new Date(`${selected}T12:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });
  const rangeStart = view === "day" ? selected : view === "week" ? dayKey(visibleCells[0]) : dayKey(month);
  const rangeEnd = view === "day" ? selected : view === "week" ? dayKey(visibleCells[6]) : dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const scheduledCount = taskSpans.filter(span => spanOverlaps(span, rangeStart, rangeEnd)).length;
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
  function taskButton(task: typeof tasks[number]) {
    return <button key={task.card.id} className={styles.agendaTask} onClick={() => onOpen(task.card)}>
      <span className={styles.dot} style={{ background: task.color }} />
      <span><strong>{task.card.title}</strong><small>{allBoards ? `${task.board.name} · ` : ""}{task.stage}{task.card.kind ? ` · ${task.card.kind}` : ""}</small></span>
      <PlanningIcon name="arrowRight" />
    </button>;
  }
  function standaloneButton(event: CalendarEvent, compact = false) {
    return <button key={event.id} className={compact ? `${styles.event} ${styles.standaloneEvent}` : styles.agendaTask} onClick={() => setEditingEvent(event)} title={`${event.title} · ${eventRange(event)}${eventTime(event)}`}>
      <PlanningIcon name="calendar" />
      {compact ? <span>{event.start_time ? `${event.start_time.slice(0, 5)} ` : ""}{event.title}</span> : <span><strong>{event.title}</strong><small>{eventRange(event)}{eventTime(event)}{event.location ? ` · ${event.location}` : ""}</small></span>}
    </button>;
  }
  return <>
    <PlanningHeader title="Calendar" mode="calendar" boardId={boardId ?? undefined} onNavigation={onNavigation} createLabel="New event" onCreate={() => setEditingEvent(null)} canEdit={canEdit}>
      <select aria-label="Choose board" value={allBoards ? "all" : board?.id ?? ""} onChange={e => { if (e.target.value === "all") onAllBoardsChange(true); else { onAllBoardsChange(false); onBoardChange(e.target.value); } }}>
        {!boards.length && <option value="">No boards yet</option>}
        {boards.length > 0 && <option value="all">All boards</option>}
        {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <label className="planning-search"><PlanningIcon name="search" /><input aria-label="Search calendar tasks" placeholder="Search events and tasks" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select aria-label="Calendar date type" value={field} onChange={e => setField(e.target.value as DateField)}>
        {(Object.keys(fieldLabels) as DateField[]).map(key => <option key={key} value={key}>{fieldLabels[key]}</option>)}
      </select>
      <label className={styles.checkbox}><input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} /> Hide completed</label>
    </PlanningHeader>
    {eventsLoading && <p role="status" className={styles.eventNotice}>Loading calendar events…</p>}
    {eventsError && <p role="alert" className={styles.eventError}>{eventsError} <button onClick={async () => { try { setStandaloneEvents(await listCalendarEvents(project)); setEventsError(""); } catch (e) { setEventsError((e as Error).message); } }}>Retry</button></p>}
    <main className={`${styles.layout} ${view === "day" ? styles.dayLayout : ""}`}>
      <section className={styles.calendar} aria-label={`${view === "month" ? "Monthly" : view === "week" ? "Weekly" : "Daily"} calendar`}>
        <div className={styles.toolbar}>
          <div><h2 aria-live="polite">{view === "day" ? selectedLabel : view === "week" ? `${visibleCells[0].toLocaleDateString("en", { month: "short", day: "numeric" })} – ${visibleCells[6].toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : monthLabel}</h2><p>{matchingEvents.filter(event => event.date <= rangeEnd && eventEndDate(event) >= rangeStart).length} events · {scheduledCount} {scheduledCount === 1 ? "task" : "tasks"} this {view} · {fieldLabels[field]}</p></div>
          <div className={styles.navigation}>
            <div className={styles.viewSwitch} role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div>
            <button onClick={goToToday}>Today</button><button aria-label={`Previous ${view}`} onClick={() => shiftMonth(-1)}><PlanningIcon name="arrowLeft" /></button><button aria-label={`Next ${view}`} onClick={() => shiftMonth(1)}><PlanningIcon name="arrowRight" /></button></div>
        </div>
        {allBoards && boards.length > 1 && <ul className={styles.legend} aria-label="Board colors">
          {boards.map(b => { const end = boardEndDate(b); return <li key={b.id}><span className={styles.dot} style={{ background: boardColor(b, boards) }} />{b.name}{end ? ` · Ends ${formatEnd(end)}` : ""}</li>; })}
          <li><span className={`${styles.dot} ${styles.legendEvent}`} />Events</li>
        </ul>}
        {view === "day" ? <div className={styles.daySchedule}>
          <div className={styles.daySectionHead}><h3>Events</h3>{canEdit && <button className={styles.addEvent} onClick={() => setEditingEvent(null)}><PlanningIcon name="plus" /> Add event on this date</button>}</div>
          {eventsOn(selected).map(event => <div key={event.id} className={styles.dayEventRow}><time>{eventCoversDate(event, selected) && event.date !== selected ? "Continues" : eventTime(event)}</time>{standaloneButton(event)}</div>)}
          {!eventsOn(selected).length && <p className={styles.empty}>No events on this date.</p>}
          <h3>Tasks</h3>{selectedTasks.map(taskButton)}{!selectedTasks.length && <p className={styles.empty}>No tasks on this date.</p>}
        </div> : <div className={`${styles.monthScroll} ${view === "week" ? styles.weekView : ""}`}>
          <div className={styles.weekdays}>{weekdays.map(day => <span key={day}>{day}</span>)}</div>
          <div>
            {Array.from({ length: view === "month" ? 6 : 1 }, (_, week) => {
              const weekDates = visibleCells.slice(week * 7, week * 7 + 7);
              const { segments, lanes } = calendarWeekLayout([...matchingEvents.map(eventSpan), ...(field === "period" ? taskSpans : [])], weekDates.map(dayKey));
              return <div key={week} className={styles.week}>
                {weekDates.map(date => {
                  const key = dayKey(date);
                  const events = field === "period" ? [] : tasksOn(key);
                  const standalone = eventsOn(key);
                  const selectDate = () => { setSelected(key); if (canEdit) setEditingEvent(null); };
                  return <div key={key} className={`${styles.day} ${canEdit ? styles.clickableDay : ""} ${view === "month" && date.getMonth() !== month.getMonth() ? styles.outside : ""} ${key === selected ? styles.selected : ""}`}>
                    {canEdit && <button type="button" className={styles.dateTarget} aria-label={`Add event on ${date.toLocaleDateString("en", { dateStyle: "full" })}`} onClick={selectDate} />}
                    <button className={`${styles.date} ${key === today ? styles.today : ""}`} aria-label={`${date.toLocaleDateString("en", { dateStyle: "full" })}, ${tasksOn(key).length} tasks, ${standalone.length} events`} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} onClick={selectDate}>{date.getDate()}</button>
                    <div style={{ height: lanes * 26 }} aria-hidden="true" />
                    {events.slice(0, 3).map(task => <button key={task.card.id} className={`${styles.event} ${task.completed ? styles.completed : ""}`} title={`${task.card.title} · ${allBoards ? `${task.board.name} · ` : ""}${task.stage}`} onClick={() => onOpen(task.card)}><span className={styles.dot} style={{ background: task.color }} /><span>{task.card.title}</span></button>)}
                    {events.length > 3 && <button className={styles.more} onClick={() => setSelected(key)}>+{events.length - 3} more</button>}
                  </div>;
                })}
                <div className={styles.weekEvents}>
                  {segments.map(({ span, start, end, lane, continuesBefore, continuesAfter }) => {
                    const edges = `${continuesBefore ? styles.continuesBefore : ""} ${continuesAfter ? styles.continuesAfter : ""}`;
                    const place = { gridColumn: `${start + 1} / ${end + 2}`, gridRow: lane + 1 };
                    if ("task" in span) {
                      const { task } = span;
                      return <button key={span.id} className={`${styles.spanEvent} ${styles.spanTask} ${task.completed ? styles.completed : ""} ${edges}`} style={{ ...place, "--board-color": task.color } as CSSProperties}
                        title={`${task.card.title} · ${span.from}${span.to !== span.from ? ` – ${span.to}` : ""} · ${allBoards ? `${task.board.name} · ` : ""}${task.stage}`} onClick={() => onOpen(task.card)}>
                        <span>{task.card.title}</span>
                      </button>;
                    }
                    const { event } = span;
                    return <button key={span.id} className={`${styles.spanEvent} ${edges}`} style={place}
                      title={`${event.title} · ${eventRange(event)}${eventTime(event)}`} onClick={() => setEditingEvent(event)}>
                      <PlanningIcon name="calendar" /><span>{event.start_time ? `${event.start_time.slice(0, 5)} ` : ""}{event.title}</span>
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>
        </div>}
      </section>
      {view !== "day" && <aside className={styles.agenda} aria-label="Calendar agenda">
        <div className={styles.agendaHeading}><span>Daily agenda</span><h2>{selectedLabel}</h2></div>
        {canEdit && <button className={styles.addEvent} onClick={() => setEditingEvent(null)}><PlanningIcon name="plus" /> Add event on this date</button>}
        {eventsOn(selected).map(event => standaloneButton(event))}
        {selectedTasks.map(taskButton)}
        {!selectedTasks.length && !eventsOn(selected).length && <p className={styles.empty}>No events or tasks on this date{search || hideCompleted ? " match your filters" : ""}.</p>}
        <div className={styles.unscheduled}><h3>Without a {fieldLabels[field].toLowerCase()}<span>{unscheduled.length}</span></h3><p>Open a task to set its date.</p>{unscheduled.length ? unscheduled.map(taskButton) : <p className={styles.empty}>All matching tasks have a date.</p>}</div>
      </aside>}
    </main>
    {editingEvent !== undefined && <EventDialog key={editingEvent?.id ?? "new"} event={editingEvent} date={selected} project={project} canEdit={canEdit} onClose={() => setEditingEvent(undefined)} onSaved={event => {
      setStandaloneEvents(current => [...current.filter(item => item.id !== event.id), event]);
      setSelected(event.date); setMonth(new Date(`${event.date.slice(0, 7)}-01T12:00:00`)); setEventsError("");
    }} onDeleted={id => setStandaloneEvents(current => current.filter(event => event.id !== id))} />}
  </>;
}
