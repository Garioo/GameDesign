"use client";

import { useEffect, useState } from "react";
import { useRiver } from "../RiverShell";
import { deleteCalendarEvent, listAgendaChecks, saveAgenda, saveOccurrenceAgenda, setAgendaCheck, skipOccurrence, type AgendaItem, type CalendarEvent } from "@/lib/calendarEventsRepo";
import type { FeedEvent } from "@/lib/calendarFeedsRepo";
import type { Occurrence } from "@/lib/calendarRecurrence";
import type { ProfileInfo } from "@/lib/docsRepo";
import { useLiveNotes } from "@/app/calendar/useLiveNotes";
import plan from "./plan.module.css";
import styles from "./calendar.module.css";

export type AnyEvent = CalendarEvent | FeedEvent;
export const REPEAT_LABEL: Record<string, string> = { day: "Every day", week: "Every week", "2weeks": "Every 2 weeks", month: "Every month" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const longDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** One meeting: when, where, who, its agenda (ticked per occurrence) and notes everyone sees as they're typed. */
export default function EventDetails({ occ, members, big, onEdit, onChanged, onGone }: {
  occ: Occurrence<AnyEvent>;
  members: ProfileInfo[];
  /** The Day view shows it large, with a tall notes area. */
  big?: boolean;
  onEdit: () => void;
  onChanged: (event: CalendarEvent) => void;
  onGone: (message: string) => void;
}) {
  const { session } = useRiver();
  const ws = session.workspaceId;
  const series = occ.series;
  const feed = "feed" in series ? series.feed : null;
  const repeats = !!series.repeat;
  const canEdit = session.role !== "viewer" && !feed;
  const me = members.find((m) => m.id === session.userId);
  const live = useLiveNotes({ project: ws, event: feed ? null : series, occurrence: repeats ? occ.occurrence : null, enabled: !feed, me: me ? { name: me.name, color: me.color } : null, onSaved: onChanged });
  const agenda: AgendaItem[] = repeats ? live.agenda : series.agenda;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (feed) return;
    let active = true;
    listAgendaChecks(series.id, occ.occurrence).then((ids) => active && setChecked(new Set(ids))).catch(() => {});
    return () => { active = false; };
  }, [series.id, occ.occurrence, feed]);

  const toggle = async (id: string) => {
    const on = !checked.has(id);
    setChecked((c) => { const n = new Set(c); if (on) n.add(id); else n.delete(id); return n; });
    try { await setAgendaCheck(ws, series.id, occ.occurrence, id, on); } catch (e) { setError((e as Error).message); }
  };
  const addItem = async () => {
    const text = draft.trim().slice(0, 300);
    if (!text) return;
    setDraft("");
    const next = [...agenda, { id: crypto.randomUUID(), text }];
    try {
      if (repeats) { await saveOccurrenceAgenda(ws, series.id, occ.occurrence, next); live.setAgenda(next); }
      else onChanged(await saveAgenda(ws, series.id, next));
    } catch (e) { setError((e as Error).message); }
  };

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let soon = "";
  if (occ.occurrence === todayIso && occ.start_time) {
    const mins = Math.round(((+occ.start_time.slice(0, 2) * 60 + +occ.start_time.slice(3, 5)) - (now.getHours() * 60 + now.getMinutes())));
    if (mins > 0) soon = mins < 60 ? `starts in ${mins} min` : `starts in ${Math.floor(mins / 60)} h ${mins % 60} min`;
  }
  const people = series.attendees.map((id) => members.find((m) => m.id === id)).filter((m): m is ProfileInfo => !!m);
  const when = occ.start_time
    ? `${longDate(occ.occurrence)} · ${hhmm(occ.start_time)}${occ.end_time ? `–${hhmm(occ.end_time)}` : ""}`
    : `${longDate(occ.date)}${occ.end_date && occ.end_date !== occ.date ? ` – ${longDate(occ.end_date)}` : ""} · all day`;
  const done = agenda.filter((a) => checked.has(a.id)).length;

  return (
    <div className={big ? styles.focusBody : undefined}>
      <div className={styles.fhead}>
        <div>
          <span className={styles.fk}>{feed ? `From ${feed.label}` : repeats ? REPEAT_LABEL[series.repeat!] : "Meeting"}{soon && <em> · {soon}</em>}</span>
          <h3>{occ.title}</h3>
          <p>{when}{occ.location ? ` · ${occ.location}` : ""}</p>
        </div>
        {(people.length > 0 || series.guests.length > 0) && (
          <span className={plan.avs} title={[...people.map((p) => p.name), ...series.guests].join(", ")}>
            {people.map((p) => <span key={p.id} className={plan.av} style={{ background: p.color }}>{p.initials}</span>)}
            {series.guests.length > 0 && <span className={plan.av} style={{ background: "var(--ink3)" }}>+{series.guests.length}</span>}
          </span>
        )}
      </div>
      {feed ? (
        <p className={styles.src}>This comes from your subscribed calendar “{feed.label}”, so it can only be changed there.</p>
      ) : (
        <>
          <div className={plan.ph4}><span>Agenda{repeats ? " for this meeting" : ""}</span><span>{done}/{agenda.length}</span></div>
          {agenda.map((a) => (
            <div key={a.id} className={`${plan.step} ${checked.has(a.id) ? plan.stepDone : ""}`}>
              <button className={`${plan.box} ${checked.has(a.id) ? plan.boxOn : ""}`} onClick={() => toggle(a.id)} aria-label={`Tick ${a.text}`}>{checked.has(a.id) ? "✓" : ""}</button>
              <span>{a.text}</span>
            </div>
          ))}
          {canEdit && <input className={plan.line} placeholder="+ Add an agenda item, press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />}
          <div className={plan.ph4}>
            <span>Notes</span>
            <span className={styles.live}>{live.typer ? `● ${live.typer.name} is typing` : live.saveState === "saving" ? "Saving…" : live.saveState === "error" ? "Not saved" : ""}</span>
          </div>
          <textarea className={`${plan.area} ${big ? styles.bigNotes : ""}`} value={live.notes} disabled={!canEdit || !live.loaded}
            placeholder={live.loaded ? "Take notes during the meeting. Everyone here sees them as you type." : "Loading notes…"}
            onChange={(e) => live.change(e.target.value)} />
          {error && <p className={plan.error}>{error}</p>}
          {canEdit && (
            <div className={plan.pbtns}>
              <button onClick={onEdit}>{repeats ? "Edit series" : "Edit"}</button>
              {repeats && <button className={plan.del} onClick={async () => { try { onChanged(await skipOccurrence(ws, series, occ.occurrence)); onGone(`Skipped ${occ.title} on ${longDate(occ.occurrence)}`); } catch (e) { setError((e as Error).message); } }}>Skip this one</button>}
              {confirm
                ? <button className={plan.del} onClick={async () => { try { await deleteCalendarEvent(ws, series.id); onGone(`Deleted ${occ.title}`); } catch (e) { setError((e as Error).message); } }}>Yes, delete{repeats ? " the series" : ""}</button>
                : <button className={plan.del} onClick={() => setConfirm(true)}>{repeats ? "Delete series" : "Delete"}</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
