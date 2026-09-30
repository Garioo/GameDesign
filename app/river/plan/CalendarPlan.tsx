"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRiver } from "../RiverShell";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { listCalendarFeeds, loadFeedEvents, type FeedEvent } from "@/lib/calendarFeedsRepo";
import { expandOccurrences, type Occurrence } from "@/lib/calendarRecurrence";
import { loadPhases, type Phase } from "@/lib/phaseRepo";
import { loadBoards, type Board } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { listMilestones } from "@/lib/planningRepo";
import type { Milestone } from "@/lib/planning";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import { dayNumber, localToday, weekday } from "@/lib/gantt";
import { useFollowedView, useShareView } from "@/lib/followView";
import EventDialog from "@/app/calendar/EventDialog";
import EventDetails, { hhmm, longDate, type AnyEvent } from "./EventDetails";
import SidePanel from "./SidePanel";
import styles from "./calendar.module.css";
import plan from "./plan.module.css";

/* ---------------------------------------------------------------------------
 * The calendar (new design). Month for the overview, Week as day columns of
 * event cards, and Day as the list of meetings with the chosen one open next
 * to it (agenda + live notes). Board and category due dates and milestones
 * show with "Plan dates"; subscribed calendars (Moodle) with their switch.
 * ------------------------------------------------------------------------- */

type View = "month" | "week" | "day";
type Occ = Occurrence<AnyEvent>;
interface PlanItem { key: string; label: string; color: string; href: string; milestone?: boolean }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Phones show the month as colour bars; tapping a day opens it.
const phone = () => window.matchMedia("(max-width: 760px)").matches;
const isMode = (v: string | undefined): v is View => v === "month" || v === "week" || v === "day";
const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const keyOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

export default function CalendarPlan({ switcher, initialDate, initialEvent }: { switcher: ReactNode; initialDate: string | null; initialEvent: string | null }) {
  const router = useRouter();
  const { session } = useRiver();
  const ws = session.workspaceId;
  const canEdit = session.role !== "viewer";
  const todayIso = localToday();
  const today = dayNumber(todayIso);

  // A link to a day (and an event) opens that day with the event in focus.
  const linked = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? dayNumber(initialDate) : null;
  const [view, setView] = useState<View>(linked !== null ? "day" : "month");
  const [cursor, setCursor] = useState(linked ?? today);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [hasFeeds, setHasFeeds] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [showPlan, setShowPlan] = useState(true);
  const [showFeeds, setShowFeeds] = useState(true);
  const [panel, setPanel] = useState<Occ | null>(null);
  const [focusId, setFocusId] = useState<string | null>(initialEvent && linked !== null ? `${initialEvent}` : null);
  const [dialog, setDialog] = useState<{ event: CalendarEvent | null; occurrence?: string; date: string } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 2600); };

  const reloadEvents = useCallback(() => listCalendarEvents(ws).then(setEvents).catch((e) => setError(e.message)), [ws]);
  useEffect(() => {
    let cancelled = false;
    reloadEvents();
    listCalendarFeeds(ws)
      .then((feeds) => {
        if (cancelled) return;
        setHasFeeds(feeds.length > 0);
        feeds.forEach((f) => loadFeedEvents(f).then((ev) => !cancelled && setFeedEvents((cur) => [...cur.filter((x) => x.feed.id !== f.id), ...ev])).catch(console.error));
      })
      .catch(() => {});
    loadPhases(ws).then((s) => !cancelled && setPhases(s.phases.filter((p) => p.active))).catch(console.error);
    loadBoards(ws).then((b) => !cancelled && setBoards(b)).catch(console.error);
    listMilestones(ws).then((m) => !cancelled && setMilestones(m)).catch(console.error);
    listMembers(ws).then((m) => !cancelled && setMembers(m)).catch(console.error);
    return () => { cancelled = true; };
  }, [ws, reloadEvents]);

  // The days on screen.
  const { from, to, days } = useMemo(() => {
    if (view === "month") {
      const d = new Date(cursor * 86400000), first = dayNumber(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`), start = first - weekday(first);
      return { from: start, to: start + 41, days: Array.from({ length: 42 }, (_, i) => start + i) };
    }
    if (view === "week") { const m = cursor - weekday(cursor); return { from: m, to: m + 6, days: Array.from({ length: 7 }, (_, i) => m + i) }; }
    return { from: cursor, to: cursor, days: [cursor] };
  }, [view, cursor]);

  const occs: Occ[] = useMemo(
    () => expandOccurrences<AnyEvent>([...(events ?? []), ...(showFeeds ? feedEvents : [])], keyOf(from), keyOf(to)),
    [events, feedEvents, showFeeds, from, to],
  );
  const onDay = (n: number, month = false) => {
    const k = keyOf(n);
    return occs
      .filter((o) => o.date <= k && (o.end_date ?? o.date) >= k)
      .filter((o) => !(month && o.series.repeat === "day")) // daily stand-ups would fill every cell
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  };
  const color = (p: Phase) => (boards.length ? boardColor({ id: p.board_id, color: p.color }, boards) : p.color);
  const planOn = (n: number): PlanItem[] => {
    if (!showPlan) return [];
    const k = keyOf(n), out: PlanItem[] = [];
    for (const m of milestones) if (m.dueDate === k && !m.completedAt) out.push({ key: m.id, label: m.name, color: "var(--due)", href: "/milestones", milestone: true });
    for (const p of phases) if (p.effective_end === k) out.push({ key: p.id, label: p.category_id ? `${p.title} · ${p.board_name}` : p.board_name, color: color(p), href: `/river/plan?view=board&board=${p.board_id}${p.category_id ? `&category=${p.category_id}` : ""}` });
    return out;
  };
  const planChip = (x: PlanItem) =>
    x.milestone
      ? <span key={x.key} className={`${styles.chip} ${styles.ms}`}>◆ {x.label}</span>
      : <button key={x.key} className={`${styles.chip} ${styles.due}`} style={{ ["--c" as string]: x.color }} onClick={(e) => { e.stopPropagation(); router.push(x.href); }}>Due · {x.label}</button>;
  const isFeed = (o: Occ) => "feed" in o.series;
  const open = (o: Occ, e?: { stopPropagation: () => void }) => { e?.stopPropagation(); setPanel(o); };
  const newEvent = (n: number) => canEdit && setDialog({ event: null, date: keyOf(n) });

  const title = view === "month"
    ? `${MONTHS[new Date(cursor * 86400000).getUTCMonth()]} ${new Date(cursor * 86400000).getUTCFullYear()}`
    : view === "week" ? `Week of ${longDate(keyOf(from))}` : longDate(keyOf(cursor));
  const step = (k: number) => {
    if (!k) return setCursor(today);
    if (view === "month") { const d = new Date(cursor * 86400000); setCursor(Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) / 86400000)); }
    else setCursor(cursor + k * (view === "week" ? 7 : 1));
  };
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const startH = (o: Occ) => (o.start_time ? +o.start_time.slice(0, 2) + +o.start_time.slice(3, 5) / 60 : -1);

  /* ---------- the Day view's chosen meeting ---------- */
  const dayTimed = view === "day" ? onDay(cursor).filter((o) => o.start_time) : [];
  const focus = view === "day" ? dayTimed.find((o) => o.id === focusId || o.series.id === focusId) ?? (cursor === today ? dayTimed.find((o) => startH(o) > nowH) : undefined) ?? dayTimed[0] ?? null : null;
  // Followers see the same view, day and open event, as on the classic calendar (lib/followView).
  const shownEvent = panel ?? (view === "day" && focusId ? focus : null);
  useShareView("calendar", {
    mode: view,
    date: keyOf(cursor),
    ...(shownEvent ? { event: shownEvent.series.id, occ: shownEvent.occurrence } : {}),
  });
  const followedView = useFollowedView();
  const followMode = followedView?.mode, followDate = followedView?.date;
  useEffect(() => {
    if (isMode(followMode)) setView(followMode);
    if (isDay(followDate)) setCursor(dayNumber(followDate));
  }, [followMode, followDate]);
  const followEvent = followedView === undefined ? undefined : `${followedView.event ?? ""}@${followedView.occ ?? ""}`;
  const appliedFollowEvent = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (followEvent === undefined) { appliedFollowEvent.current = undefined; return; }
    if (followEvent === appliedFollowEvent.current) return;
    const [id, occ] = followEvent.split("@");
    if (!id) { appliedFollowEvent.current = followEvent; setPanel(null); return; }
    // Day view shows the event in focus; the other views open it in the side panel.
    if ((isMode(followMode) ? followMode : view) === "day") { appliedFollowEvent.current = followEvent; setPanel(null); setFocusId(id); return; }
    const o = occs.find((x) => x.series.id === id && (!occ || x.occurrence === occ));
    if (!o) return; // not loaded (or not in range) yet — tried again when occs change
    appliedFollowEvent.current = followEvent;
    setPanel(o);
    // view is only a fallback for when they share no mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followEvent, followMode, occs]);

  const afterChange = (ev: CalendarEvent) => setEvents((cur) => (cur ?? []).map((x) => (x.id === ev.id ? ev : x)));
  const gone = (m: string) => { setPanel(null); say(m); reloadEvents(); };

  return (
    <>
      <header className={plan.head}>
        <h1><span>Plan</span>Calendar</h1>
        <p className={plan.sum}>Meetings and deadlines. Board due dates and milestones show with <b>Plan dates</b> on.</p>
        <div className={plan.sp} />
        <div className={plan.ctrls}>{switcher}</div>
      </header>

      <div className={styles.tool}>
        <div className={styles.nav}>
          <button onClick={() => step(-1)} aria-label="Previous">‹</button>
          <button onClick={() => step(0)}>Today</button>
          <button onClick={() => step(1)} aria-label="Next">›</button>
        </div>
        <h2>{title}</h2>
        <span className={plan.seg}>
          {(["month", "week", "day"] as const).map((v) => <button key={v} className={view === v ? plan.segOn : undefined} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </span>
        <button className={`${plan.sw} ${showPlan ? plan.swOn : ""}`} onClick={() => setShowPlan((v) => !v)}><i />Plan dates</button>
        {hasFeeds && <button className={`${plan.sw} ${showFeeds ? plan.swOn : ""}`} onClick={() => setShowFeeds((v) => !v)}><i />Subscribed</button>}
        <span className={plan.sp} />
        {canEdit && <button className={plan.primary} onClick={() => newEvent(view === "month" ? Math.max(today, cursor) : cursor)}>+ Event</button>}
      </div>
      {error && <p className={plan.error}>{error}</p>}
      {events === null && !error && <p className={plan.muted}>Loading the calendar…</p>}

      {events && view === "month" && (
        <>
          <div className={styles.month}>
            {DOW.map((d) => <div key={d} className={styles.dh}>{d}</div>)}
            {days.map((n) => {
              const d = new Date(n * 86400000), inMonth = d.getUTCMonth() === new Date(cursor * 86400000).getUTCMonth();
              const items = [
                ...planOn(n).map(planChip),
                ...onDay(n, true).map((o) => o.start_time
                  ? <button key={o.id} className={`${styles.ev} ${isFeed(o) ? styles.feed : ""}`} onClick={(e) => open(o, e)}><b>{hhmm(o.start_time)}</b>{o.title}</button>
                  : <button key={o.id} className={`${styles.chip} ${styles.allday} ${isFeed(o) ? styles.feed : ""}`} onClick={(e) => open(o, e)}>{o.title}</button>),
              ];
              return (
                <div key={n} className={`${styles.cell} ${!inMonth ? styles.out : ""} ${weekday(n) > 4 ? styles.weCell : ""} ${n === today ? styles.today : ""}`} onClick={() => (phone() ? (setCursor(n), setView("day")) : newEvent(n))}>
                  <span className={styles.dn}>{d.getUTCDate()}</span>
                  {items.slice(0, 4)}
                  {items.length > 4 && <button className={styles.more} onClick={(e) => { e.stopPropagation(); setCursor(n); setView("day"); }}>+ {items.length - 4} more</button>}
                </div>
              );
            })}
          </div>
          <p className={plan.hint}>Events that repeat every day are hidden in Month to keep it readable. They show in Week and Day.</p>
        </>
      )}

      {events && view === "week" && (
        <div className={styles.week}>
          {days.map((n) => {
            const d = new Date(n * 86400000), list = onDay(n), timed = list.filter((o) => o.start_time), allDay = list.filter((o) => !o.start_time);
            let placed = n !== today;
            return (
              <div key={n} className={`${styles.wd} ${n === today ? styles.wdToday : ""} ${weekday(n) > 4 ? styles.wdWe : ""}`} onClick={() => newEvent(n)}>
                <button className={styles.wdh} onClick={(e) => { e.stopPropagation(); setCursor(n); setView("day"); }}>
                  <span>{DOW[weekday(n)]}</span><b>{d.getUTCDate()} {MONTHS[d.getUTCMonth()].slice(0, 3)}</b>
                </button>
                <div className={styles.wl}>
                  {planOn(n).map(planChip)}
                  {allDay.map((o) => <button key={o.id} className={`${styles.chip} ${styles.allday} ${isFeed(o) ? styles.feed : ""}`} onClick={(e) => open(o, e)}>{o.title}</button>)}
                  {timed.map((o) => {
                    const nowRow = !placed && startH(o) > nowH ? ((placed = true), <div key="now" className={styles.nowRow}>now · {`${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`}</div>) : null;
                    return [nowRow, (
                      <button key={o.id} className={`${styles.we} ${isFeed(o) ? styles.feed : ""}`} onClick={(e) => open(o, e)}>
                        <b>{hhmm(o.start_time)}</b><span>{o.title}</span>
                        <small>{hhmm(o.start_time)}{o.end_time ? `–${hhmm(o.end_time)}` : ""}{o.location ? ` · ${o.location}` : ""}</small>
                      </button>
                    )];
                  })}
                  {!placed && <div className={styles.nowRow}>now</div>}
                  {canEdit && <span className={styles.wadd}>+ Add</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {events && view === "day" && (
        <div className={styles.focus}>
          <div className={styles.fl}>
            {(() => {
              const top = [...planOn(cursor).map(planChip), ...onDay(cursor).filter((o) => !o.start_time).map((o) => <button key={o.id} className={`${styles.chip} ${styles.allday} ${isFeed(o) ? styles.feed : ""}`} onClick={() => open(o)}>{o.title}</button>)];
              return top.length ? <div className={styles.ftop}>{top}</div> : null;
            })()}
            {dayTimed.length === 0 && <p className={plan.muted} style={{ padding: 10 }}>No meetings this day.</p>}
            {(() => {
              let placed = cursor !== today;
              const rows = dayTimed.map((o) => {
                const nowRow = !placed && startH(o) > nowH ? ((placed = true), <div key="now" className={styles.nowRow}>now</div>) : null;
                return [nowRow, (
                  <button key={o.id} className={`${styles.frow} ${focus?.id === o.id ? styles.frowOn : ""} ${isFeed(o) ? styles.feed : ""}`} onClick={() => setFocusId(o.id)}>
                    <b>{hhmm(o.start_time)}</b>
                    <span><strong>{o.title}</strong><small>{hhmm(o.start_time)}{o.end_time ? `–${hhmm(o.end_time)}` : ""}{o.location ? ` · ${o.location}` : ""}</small></span>
                  </button>
                )];
              });
              return <>{rows}{!placed && dayTimed.length > 0 && <div className={styles.nowRow}>now</div>}</>;
            })()}
            {canEdit && <button className={styles.fadd} onClick={() => newEvent(cursor)}>+ Add an event</button>}
          </div>
          <section className={styles.fd}>
            {focus ? (
              <EventDetails key={focus.id} occ={focus} members={members} big onChanged={afterChange} onGone={gone}
                onEdit={() => setDialog({ event: focus.series as CalendarEvent, occurrence: focus.series.repeat ? focus.occurrence : undefined, date: focus.occurrence })} />
            ) : (
              <div className={styles.blank}><b>Nothing scheduled</b><p>Add a meeting and its agenda and notes open here.</p></div>
            )}
          </section>
        </div>
      )}

      <SidePanel open={!!panel} onClose={() => setPanel(null)} eyebrow={panel && isFeed(panel) ? "Subscribed calendar" : "Event"} color={panel && isFeed(panel) ? "#3b82d6" : undefined}>
        {panel && (
          <EventDetails key={panel.id} occ={panel} members={members} onChanged={afterChange} onGone={gone}
            onEdit={() => { setDialog({ event: panel.series as CalendarEvent, occurrence: panel.series.repeat ? panel.occurrence : undefined, date: panel.occurrence }); setPanel(null); }} />
        )}
      </SidePanel>

      {dialog && (
        <EventDialog key={`${dialog.event?.id ?? "new"}@${dialog.occurrence ?? ""}`} event={dialog.event} occurrence={dialog.occurrence} date={dialog.date} project={ws} canEdit={canEdit}
          onClose={() => setDialog(null)}
          onSaved={(ev, stay) => { setEvents((cur) => [...(cur ?? []).filter((x) => x.id !== ev.id), ev]); if (!stay) { setDialog(null); say(`Saved ${ev.title}`); } }}
          onDeleted={() => { setDialog(null); reloadEvents(); say("Event deleted"); }} />
      )}
      {toast && <div className={plan.toast} role="status">{toast}</div>}
    </>
  );
}

