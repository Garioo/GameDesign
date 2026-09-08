"use client";

import { Fragment, useState, type CSSProperties, type FormEvent } from "react";
import type { BoardCard, BoardColumn } from "@/lib/boardRepo";
import { barRange, dayKey, dayNumber, localToday } from "@/lib/gantt";
import "./gantt.css";

type Person = { id: string; name: string; initials: string; color: string };
type Props = {
  columns: BoardColumn[];
  people: Person[];
  canEdit: boolean;
  onOpen: (card: BoardCard) => void;
  onSchedule: (id: string, start: string | null, end: string | null) => Promise<void>;
};
const dateLabel = (day: number, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(day * 86400000).toLocaleDateString("en", { ...options, timeZone: "UTC" });

export default function GanttChart({ columns, people, canEdit, onOpen, onSchedule }: Props) {
  const today = dayNumber(localToday());
  const [first, setFirst] = useState(today - 3);
  const [days, setDays] = useState(28);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const cards = columns.flatMap(c => c.cards);
  const selectedCard = cards.find(c => c.id === selected);
  const scheduled = cards.filter(c => c.startDate || c.deadline);
  const dates = Array.from({ length: days }, (_, i) => first + i);
  const groups = columns.map(col => ({ ...col, cards: col.cards.filter(card => card.title.toLowerCase().includes(query.toLowerCase())) }));
  const shownCount = groups.reduce((sum, col) => sum + col.cards.length, 0);
  const todayOffset = (today - first + 0.5) / days * 100;
  function showFirstTask() {
    if (scheduled.length) setFirst(Math.min(...scheduled.map(c => dayNumber(c.startDate || c.deadline!))) - 2);
  }

  return <section className="gantt" aria-label="Board Gantt chart">
    <div className="gantt-controls">
      <div className="gantt-summary"><strong>{scheduled.length} scheduled</strong><span>{cards.length - scheduled.length} without dates</span></div>
      <div className="gantt-actions">
        <input aria-label="Search timeline tasks" placeholder="Find a task…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Timeline scale" value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={14}>2 weeks</option><option value={28}>4 weeks</option><option value={84}>12 weeks</option>
        </select>
        <button onClick={() => setFirst(first - days)} aria-label="Previous date range">←</button>
        <button onClick={() => setFirst(today - 3)}>Today</button>
        <button onClick={() => setFirst(first + days)} aria-label="Next date range">→</button>
        <button onClick={showFirstTask} disabled={!scheduled.length}>First task</button>
      </div>
    </div>
    <div className="gantt-caption"><span>{dateLabel(first, { month: "long", day: "numeric", year: "numeric" })} — {dateLabel(first + days - 1, { month: "long", day: "numeric", year: "numeric" })}</span><span>Grouped by board column · Select a task to schedule it</span></div>
    <div className="gantt-scroll" tabIndex={0} aria-label="Scrollable timeline">
      <div className="gantt-grid" style={{ "--gantt-days": days, "--gantt-width": `${Math.max(680, days * 25)}px` } as CSSProperties}>
        <div className="gantt-header gantt-sticky">Task / assignees</div>
        <div className="gantt-header gantt-dates">{dates.map(day => <span key={day} className={day === today ? "is-today" : ""}>{days < 84 || (day - first) % 7 === 0 ? <>{dateLabel(day, { weekday: "narrow" })}<b>{dateLabel(day, { day: "numeric" })}</b></> : null}</span>)}</div>
        {groups.map(col => <Fragment key={col.id}>
          <button className="gantt-group gantt-sticky" onClick={() => setCollapsed(prev => prev.includes(col.id) ? prev.filter(id => id !== col.id) : [...prev, col.id])} aria-expanded={!collapsed.includes(col.id)}>
            <span>{collapsed.includes(col.id) ? "▸" : "▾"}</span><i style={{ background: col.color }} />{col.name}<small>{col.cards.length}</small>
          </button><div className="gantt-group-fill" />
          {!collapsed.includes(col.id) && col.cards.map(card => {
            const range = barRange(card.startDate, card.deadline, first, days);
            const assigned = people.filter(p => card.ownerIds.includes(p.id));
            return <Fragment key={card.id}>
              <button className={`gantt-task gantt-sticky${selected === card.id ? " is-selected" : ""}`} onClick={() => setSelected(card.id)}>
                <span><strong>{card.title}</strong><small>{card.startDate && card.deadline ? `${card.startDate} → ${card.deadline}` : card.deadline ? `Due ${card.deadline}` : card.startDate ? `Starts ${card.startDate}` : "Unscheduled"}</small></span>
                <span className="gantt-owners">{assigned.slice(0, 2).map(p => <i key={p.id} title={p.name} style={{ background: p.color }}>{p.initials}</i>)}</span>
              </button>
              <div className={`gantt-lane${selected === card.id ? " is-selected" : ""}`}>
                {todayOffset >= 0 && todayOffset <= 100 && <span className="gantt-today" style={{ left: `${todayOffset}%` }} />}
                {range ? <button className="gantt-bar" style={{ left: `${range.left}%`, width: `${range.width}%`, "--bar-color": col.color } as CSSProperties} onClick={() => setSelected(card.id)} title={`${card.title}: ${card.startDate || card.deadline} — ${card.deadline || card.startDate}`} aria-label={`Schedule ${card.title}`}><span>{card.title}</span></button>
                  : <button className="gantt-unscheduled" onClick={() => {
                    setSelected(card.id);
                    if (card.startDate || card.deadline) setFirst(dayNumber(card.startDate || card.deadline!) - 2);
                  }}>{card.startDate || card.deadline ? "Outside this range · Show task ↗" : canEdit ? "+ Set dates" : "No dates"}</button>}
              </div>
            </Fragment>;
          })}
        </Fragment>)}
      </div>
      {!shownCount && <div className="gantt-empty"><strong>{query ? "No matching tasks" : "No cards in this view"}</strong><p>{query ? "Try another task name." : "Add cards on the board or clear your filters. They will appear here automatically."}</p></div>}
    </div>
    {selectedCard && <ScheduleEditor key={selectedCard.id} card={selectedCard} canEdit={canEdit} onSave={onSchedule} onClose={() => setSelected(null)} onOpen={() => onOpen(selectedCard)} />}
  </section>;
}

function ScheduleEditor({ card, canEdit, onSave, onClose, onOpen }: {
  card: BoardCard; canEdit: boolean; onSave: Props["onSchedule"]; onClose: () => void; onOpen: () => void;
}) {
  const [start, setStart] = useState(card.startDate ?? "");
  const [end, setEnd] = useState(card.deadline ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try { await onSave(card.id, start || null, end || null); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save dates. Try again."); }
    finally { setSaving(false); }
  }
  return <form className="gantt-editor" onSubmit={submit} aria-label={`Schedule ${card.title}`}>
    <div className="gantt-editor-heading"><strong>{card.title}</strong><button type="button" onClick={onClose} disabled={saving} aria-label="Close schedule">×</button></div>
    <fieldset disabled={!canEdit || saving}>
      <label>Start date<input type="date" value={start} max={end || undefined} onChange={e => { setStart(e.target.value); setSaved(false); }} /></label>
      <label>Deadline<input type="date" value={end} min={start || undefined} onChange={e => { setEnd(e.target.value); setSaved(false); }} /></label>
      {canEdit && <button className="gantt-save" type="submit">{saving ? "Saving…" : "Save dates"}</button>}
      {canEdit && <button type="button" onClick={() => { setStart(""); setEnd(""); setSaved(false); }}>Clear dates</button>}
    </fieldset>
    {canEdit && <button type="button" onClick={onOpen} disabled={saving}>Edit board card ↗</button>}
    {!canEdit && <span>View only</span>}
    {error && <p className="gantt-error" role="alert">{error}</p>}
    {saved && <p className="gantt-success" role="status">Dates saved to the board.</p>}
  </form>;
}
