"use client";

import { useEffect, useState } from "react";
import { getOccurrence, listAgendaChecks, saveAgenda, saveOccurrenceAgenda, setAgendaCheck, type AgendaItem, type CalendarEvent } from "@/lib/calendarEventsRepo";
import Icon from "@/app/components/Icon";
import LinkedText from "@/app/components/LinkedText";
import type { MentionTarget } from "@/app/doc/mentions";
import styles from "./calendar.module.css";

/* ---------------------------------------------------------------------------
 * An event's agenda checklist shown open under it in the day view, so it can
 * be ticked and added to without opening the event. Same data as the event
 * dialog: a one-off's own agenda, or this occurrence's for a repeating event.
 * `refresh` changes when the calendar hears of agenda/tick changes elsewhere.
 * ------------------------------------------------------------------------- */

const newItem = (text: string): AgendaItem => ({ id: crypto.randomUUID(), text });

export default function DayAgenda({ event, occurrence, project, canEdit, targets, refresh, onSaved }: {
  /** The stored event — for a repeating one, the whole series. */
  event: CalendarEvent;
  /** Start date of the occurrence on screen. */
  occurrence: string;
  project: string;
  canEdit: boolean;
  targets: MentionTarget[];
  refresh: number;
  onSaved: (event: CalendarEvent) => void;
}) {
  const repeats = !!event.repeat;
  const day = repeats ? occurrence : event.date;
  const [occurrenceAgenda, setOccurrenceAgenda] = useState<AgendaItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([listAgendaChecks(event.id, day), repeats ? getOccurrence(event.id, day) : null])
      .then(([ids, row]) => { if (!active) return; setChecked(new Set(ids)); if (row) setOccurrenceAgenda(row.agenda); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [event.id, day, repeats, refresh]);

  const agenda = repeats ? occurrenceAgenda : event.agenda;
  if (!agenda.length && !canEdit) return null;

  async function change(next: AgendaItem[]) {
    setBusy(true); setError("");
    try {
      if (repeats) { await saveOccurrenceAgenda(project, event.id, day, next); setOccurrenceAgenda(next); }
      else onSaved(await saveAgenda(project, event.id, next));
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await change([...agenda, newItem(text.slice(0, 300))]);
  }
  async function toggle(id: string) {
    const on = !checked.has(id);
    const set = (value: boolean) => setChecked(c => { const next = new Set(c); if (value) next.add(id); else next.delete(id); return next; });
    set(on);
    try { await setAgendaCheck(project, event.id, day, id, on); }
    catch (e) { set(!on); setError((e as Error).message); }
  }

  return <div className={styles.dayAgenda}>
    {agenda.length > 0 && <p className={styles.dayAgendaCount}>Agenda · {agenda.filter(i => checked.has(i.id)).length}/{agenda.length} done</p>}
    {agenda.length > 0 && <ul className={styles.agendaList}>
      {agenda.map(item => <li key={item.id} className={checked.has(item.id) ? styles.agendaDone : undefined}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={checked.has(item.id)} disabled={!canEdit} onChange={() => void toggle(item.id)} />
          <LinkedText text={item.text} targets={targets} />
        </label>
        {canEdit && <button type="button" className={styles.agendaRemove} disabled={busy} aria-label={`Remove “${item.text}” from the agenda`} title="Remove"
          onClick={() => void change(agenda.filter(i => i.id !== item.id))}><Icon name="close" /></button>}
      </li>)}
    </ul>}
    {canEdit && <div className={styles.guestAdd}>
      <input aria-label={`Add an agenda item to ${event.title}`} maxLength={300} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void add(); } }}
        placeholder={agenda.length ? "Add an item" : "Add the first agenda item"} />
      <button type="button" disabled={busy || !draft.trim()} onClick={() => void add()}><Icon name="plus" /> Add</button>
    </div>}
    {error && <p role="alert" className={styles.eventError}>{error}</p>}
  </div>;
}
