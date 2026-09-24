"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCalendarEvent, listAgendaChecks, saveAgenda, saveCalendarEvent, setAgendaCheck, skipOccurrence, type AgendaItem, type CalendarEvent, type CalendarEventDraft } from "@/lib/calendarEventsRepo";
import { addDays, type Repeat } from "@/lib/calendarRecurrence";
import { EVERY_LABEL } from "@/lib/planning";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import Icon from "@/app/components/Icon";
import type { MentionTarget } from "@/app/doc/mentions";
import { loadLinkTargets } from "@/lib/linkTargets";
import LinkedText from "@/app/components/LinkedText";
import PageLinkTextarea from "@/app/board/PageLinkTextarea";
import { confirmDiscard } from "@/lib/confirmDiscard";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { PlanningIcon } from "@/app/board/PlanningIcons";
import { supabase } from "@/lib/supabase";
import SaveStatus from "@/app/components/SaveStatus";
import { useLiveNotes, type Typer } from "./useLiveNotes";
import styles from "./calendar.module.css";

const newItem = (text = ""): AgendaItem => ({ id: crypto.randomUUID(), text });

export default function EventDialog({ event, occurrence, editingRef, date, project, canEdit, source, onClose, onSaved, onDeleted }: {
  /** The stored event — for a repeating one, the whole series. */
  event: CalendarEvent | null;
  /** Start date of the occurrence that was opened (repeating events). */
  occurrence?: string;
  /** Set while the form is open, so following someone never closes it under you. */
  editingRef?: { current: boolean };
  date: string;
  project: string;
  canEdit: boolean;
  /** Name of the subscribed calendar a read-only event came from. */
  source?: string;
  onClose: () => void;
  /** `stay` = keep the calendar where it is (agenda edits, skipped occurrences). */
  onSaved: (event: CalendarEvent, stay?: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // What the form started from, to tell whether anything was changed.
  const [initial, setInitial] = useState<CalendarEventDraft>(() => event ?? { title: "", date, end_date: null, start_time: null, end_time: null, location: "", notes: "", attendees: [], guests: [], repeat: null, repeat_until: null, skipped_dates: [], repeat_weekends: true, agenda: [] });
  const [draft, setDraft] = useState<CalendarEventDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<false | "one" | "all">(false);
  // Existing events open as a read view; new ones go straight to the form.
  const [editing, setEditing] = useState(!event);
  useEffect(() => { if (editingRef) editingRef.current = editing; }, [editing, editingRef]);
  useEffect(() => () => { if (editingRef) editingRef.current = false; }, [editingRef]);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  // Pages, sections, canvases, boards and tasks the notes can link to.
  const [linkTargets, setLinkTargets] = useState<MentionTarget[]>([]);
  useEffect(() => {
    if (!project || source) return;
    let active = true;
    loadLinkTargets(project).then(t => { if (active) setLinkTargets(t); }).catch(console.error);
    return () => { active = false; };
  }, [project, source]);
  const [guestDraft, setGuestDraft] = useState("");
  useEffect(() => {
    if (!project) return;
    let active = true;
    listMembers(project).then(list => { if (active) setMembers(list); }).catch(console.error);
    return () => { active = false; };
  }, [project]);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);

  // ---- agenda ticks for the occurrence on screen ----
  const repeats = !!event?.repeat;
  const day = event ? (repeats && occurrence ? occurrence : event.date) : date;
  const eventId = event?.id;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [agendaDraft, setAgendaDraft] = useState("");
  const loadChecks = async () => {
    if (!eventId || source) return;
    setChecked(new Set(await listAgendaChecks(eventId, day)));
  };
  useEffect(() => {
    if (!eventId || source) return;
    let active = true;
    listAgendaChecks(eventId, day).then(ids => { if (active) setChecked(new Set(ids)); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [eventId, day, source]);
  useSidebarLiveUpdates(eventId && !source ? project : null, ["calendar_agenda_checks"], loadChecks);

  // ---- meeting notes, typed live (per occurrence for repeating events) ----
  const [me, setMe] = useState<Typer | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      const mine = members.find(m => m.id === data.session?.user.id);
      if (active && mine) setMe({ name: mine.name, color: mine.color });
    }).catch(() => {});
    return () => { active = false; };
  }, [members]);
  const live = useLiveNotes({ project, event, occurrence: repeats ? day : null, enabled: !!event && !source, me, onSaved: saved => onSaved(saved, true) });
  async function toggleItem(id: string) {
    if (!event) return;
    const on = !checked.has(id);
    const set = (value: boolean) => setChecked(c => { const next = new Set(c); if (value) next.add(id); else next.delete(id); return next; });
    set(on);
    try { await setAgendaCheck(project, event.id, day, id, on); }
    catch (e) { set(!on); setError((e as Error).message); }
  }
  // Quick add / remove from the read view; for a repeating event it changes every occurrence.
  async function changeAgenda(agenda: AgendaItem[]) {
    if (!event) return;
    setBusy(true); setError("");
    try { onSaved(await saveAgenda(project, event.id, agenda), true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function quickAdd() {
    const text = agendaDraft.trim();
    if (!event || !text) return;
    setAgendaDraft("");
    await changeAgenda([...event.agenda, newItem(text.slice(0, 300))]);
  }

  function update<K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) { setDraft(old => ({ ...old, [key]: value })); }
  const toggleAttendee = (id: string) => setDraft(old => ({ ...old, attendees: old.attendees.includes(id) ? old.attendees.filter(a => a !== id) : [...old.attendees, id] }));
  function addGuest() {
    const name = guestDraft.trim();
    if (!name) return;
    setDraft(old => old.guests.some(g => g.toLowerCase() === name.toLowerCase()) ? old : { ...old, guests: [...old.guests, name.slice(0, 120)] });
    setGuestDraft("");
  }
  // Save a name still sitting in the guest field instead of silently dropping it.
  const withPendingGuest = (d: CalendarEventDraft): CalendarEventDraft => {
    const name = guestDraft.trim();
    return name && !d.guests.some(g => g.toLowerCase() === name.toLowerCase()) ? { ...d, guests: [...d.guests, name.slice(0, 120)] } : d;
  };
  const setAgendaText = (id: string, text: string) => setDraft(old => ({ ...old, agenda: old.agenda.map(item => item.id === id ? { ...item, text } : item) }));
  async function remove(which: "one" | "all") {
    if (!event) return;
    if (confirmDelete !== which) { setConfirmDelete(which); return; }
    setBusy(true); setError("");
    try {
      if (which === "one") onSaved(await skipOccurrence(project, event, day), true);
      else { await deleteCalendarEvent(project, event.id); onDeleted(event.id); }
      onClose();
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  // Anything typed into the form that Save hasn't sent yet.
  const dirty = editing && (JSON.stringify(draft) !== JSON.stringify(initial) || guestDraft.trim() !== "");
  const okToDropEdits = () => confirmDiscard(dirty, event ? "your edits to this event" : "this new event");
  function close() {
    if (okToDropEdits()) onClose();
  }
  function startEditing() {
    if (!event) return;
    // Start from the latest saved version (a quick agenda add may have changed it).
    setInitial(event); setDraft(event); setConfirmDelete(false); setEditing(true);
  }
  function stopEditing() {
    if (!okToDropEdits()) return;
    if (!event) return onClose();
    setDraft(event); setGuestDraft(""); setError(""); setConfirmDelete(false); setEditing(false);
  }
  const readOnly = !canEdit;
  const shownMembers = readOnly ? members.filter(m => draft.attendees.includes(m.id)) : members;
  // The occurrence on screen, with its own dates.
  const shown = event && repeats && occurrence ? { ...event, date: occurrence, end_date: event.end_date ? addDays(occurrence, dayDiff(event.date, event.end_date)) : null } : event;
  const deleteAllLabel = confirmDelete === "all" ? "Confirm delete" : repeats ? "Delete series" : "Delete event";
  const status = <>
    {error && <p role="alert" className={styles.eventError}>{error}</p>}
    {confirmDelete === "one" && <p role="status">Delete only the {longDate(day)} occurrence? The rest of the series stays.</p>}
    {confirmDelete === "all" && <p role="status">{repeats ? "Delete every occurrence of this event for everyone in the workspace?" : "Delete this event for everyone in the workspace?"}</p>}
  </>;
  return <dialog ref={dialog} className={styles.eventDialog} onCancel={e => { e.preventDefault(); if (!busy) close(); }} aria-labelledby="event-dialog-title">
    {event && shown && !editing ? <div>
      <div className={styles.dialogHeading}><div><h2 id="event-dialog-title">{event.title}</h2><p>{eventWhen(shown)}</p></div><button type="button" aria-label="Close event" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
      <dl className={styles.eventFacts}>
        {event.repeat && <div><dt>Repeats</dt><dd className={styles.repeatFact}><PlanningIcon name="repeat" />{repeatLabel(event.repeat, event.repeat_until, event.repeat_weekends)}</dd></div>}
        {event.location && <div><dt>Location</dt><dd>{/^https?:\/\//i.test(event.location) ? <a href={event.location} target="_blank" rel="noreferrer">{event.location}</a> : event.location}</dd></div>}
        {!source && <div><dt>Attendees</dt><dd>
          {members.some(m => event.attendees.includes(m.id)) || event.guests.length ? <div className={styles.attendeeList}>
            {members.filter(m => event.attendees.includes(m.id)).map(m => <span key={m.id} className={`${styles.attendee} ${styles.attendeeOn}`}><span className={styles.attendeeAvatar} style={{ background: m.color }}>{m.initials}</span>{m.name}</span>)}
            {event.guests.map(g => <span key={g} className={`${styles.attendee} ${styles.attendeeOn}`}><span className={`${styles.attendeeAvatar} ${styles.guestAvatar}`}>{g.trim().charAt(0).toUpperCase()}</span>{g}</span>)}
          </div> : <span className={styles.timeNote}>No attendees.</span>}
        </dd></div>}
        {!source && (event.agenda.length > 0 || canEdit) && <div><dt>
          Agenda{event.agenda.length > 0 && <span className={styles.agendaCount}> · {event.agenda.filter(i => checked.has(i.id)).length}/{event.agenda.length} done{repeats ? ` on ${shortDate(day)}` : ""}</span>}
        </dt><dd>
          {event.agenda.length > 0 && <ul className={styles.agendaList}>
            {event.agenda.map(item => <li key={item.id} className={checked.has(item.id) ? styles.agendaDone : undefined}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={checked.has(item.id)} disabled={!canEdit} onChange={() => void toggleItem(item.id)} />
                <LinkedText text={item.text} targets={linkTargets} />
              </label>
              {canEdit && <button type="button" className={styles.agendaRemove} disabled={busy} aria-label={`Remove “${item.text}” from the agenda`} title={repeats ? "Remove from every occurrence" : "Remove"}
                onClick={() => void changeAgenda(event.agenda.filter(i => i.id !== item.id))}><Icon name="close" /></button>}
            </li>)}
          </ul>}
          {canEdit && <div className={styles.guestAdd}>
            <input aria-label="Add an agenda item" maxLength={300} value={agendaDraft} disabled={busy} onChange={e => setAgendaDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void quickAdd(); } }}
              placeholder={event.agenda.length ? "Add an item" : "Add the first agenda item"} />
            <button type="button" disabled={busy || !agendaDraft.trim()} onClick={() => void quickAdd()}><Icon name="plus" /> Add</button>
          </div>}
          {canEdit && repeats && <p className={styles.timeNote}>Items are shared by every occurrence; ticks are just for this one.</p>}
        </dd></div>}
        {source
          ? event.notes && <div><dt>Notes</dt><dd className={styles.eventNotes}><LinkedText text={event.notes} targets={linkTargets} formatting={false} /></dd></div>
          : <div><dt className={styles.notesHead}>
              <span>{repeats ? `Notes · ${shortDate(day)}` : "Notes"}</span>
              {live.typer && <span className={styles.typing} style={{ color: live.typer.color }}>{live.typer.name} is typing…</span>}
              {canEdit && <SaveStatus state={live.saveState} onRetry={live.retry} />}
            </dt><dd>
              {canEdit
                ? <PageLinkTextarea value={live.notes} onChange={live.change} targets={linkTargets} formatShortcuts rows={6} maxLength={5000}
                    placeholder={live.loaded ? (repeats ? "Notes for this meeting — everyone here sees them as you type" : "Meeting notes — everyone here sees them as you type") : "Loading notes…"}
                    hint="Saved automatically · ⌘B bold · ⌘I italic · type [[ or @ to link a page, section, canvas, board or task" />
                : live.notes
                  ? <div className={styles.eventNotes}><LinkedText text={live.notes} targets={linkTargets} formatting /></div>
                  : <span className={styles.timeNote}>No notes yet.</span>}
              {repeats && canEdit && <p className={styles.timeNote}>Each occurrence has its own notes; the next one starts empty.</p>}
            </dd></div>}
      </dl>
      <p className={styles.timeNote}>{source ? `From the subscribed calendar “${source}”. Change it in Moodle.` : "Everyone in the workspace can see this event."}</p>
      {status}
      <footer>
        {canEdit && repeats && <button type="button" disabled={busy} onClick={() => remove("one")}>{confirmDelete === "one" ? "Confirm" : "Delete this one"}</button>}
        {canEdit && <button type="button" disabled={busy} onClick={() => remove("all")}>{deleteAllLabel}</button>}
        <button type="button" disabled={busy} onClick={onClose}>Close</button>
        {canEdit && <button className="planning-primary" type="button" disabled={busy} onClick={startEditing}>{repeats ? "Edit series" : "Edit event"}</button>}
      </footer>
    </div> : <form onSubmit={async e => {
      e.preventDefault(); if (!canEdit || busy) return;
      setBusy(true); setError("");
      // Existing events: keep the notes as they are live right now, not as when the form opened.
      const toSave = withPendingGuest(event ? { ...draft, notes: repeats ? "" : live.notesRef.current } : draft);
      try { onSaved(await saveCalendarEvent(project, toSave, event?.id)); onClose(); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className={styles.dialogHeading}><div><h2 id="event-dialog-title">{event ? (repeats ? "Edit series" : "Edit event") : "New event"}</h2><p>{source ? `From the subscribed calendar “${source}”. Change it in Moodle.` : repeats ? "Changes apply to every occurrence. The dates below are the first one’s." : "Everyone in the workspace can see this event."}</p></div><button type="button" aria-label="Close event" disabled={busy} onClick={close}><Icon name="close" /></button></div>
      <fieldset disabled={!canEdit || busy}>
        <label>Event title<input autoFocus required maxLength={160} value={draft.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Team meeting" /></label>
        <div className={styles.timeFields}>
          <label>{draft.repeat ? "First date" : "Start date"}<input type="date" required value={draft.date} onChange={e => setDraft(old => ({ ...old, date: e.target.value, end_date: old.end_date && old.end_date < e.target.value ? e.target.value : old.end_date, repeat_until: old.repeat_until && old.repeat_until < e.target.value ? e.target.value : old.repeat_until }))} /></label>
          <label>End date<input type="date" required min={draft.date} value={draft.end_date || draft.date} onChange={e => update("end_date", e.target.value || null)} /></label>
        </div>
        <label className={styles.checkbox}><input type="checkbox" checked={!draft.start_time} onChange={e => setDraft(old => ({ ...old, start_time: e.target.checked ? null : "09:00", end_time: null }))} />All day</label>
        {draft.start_time && <div className={styles.timeFields}><label>Start time<input type="time" required value={draft.start_time.slice(0, 5)} onChange={e => update("start_time", e.target.value)} /></label><label>End time (optional)<input type="time" min={(draft.end_date || draft.date) === draft.date ? draft.start_time.slice(0, 5) : undefined} value={draft.end_time?.slice(0, 5) ?? ""} onChange={e => update("end_time", e.target.value || null)} /></label></div>}
        {draft.start_time && <p className={styles.timeNote}>Times are shared as entered; all attendees see the same time.</p>}
        {!source && <div className={styles.timeFields}>
          <label>Repeats<select value={draft.repeat ?? ""} onChange={e => setDraft(old => ({ ...old, repeat: (e.target.value || null) as Repeat | null, repeat_until: e.target.value ? old.repeat_until : null }))}>
            <option value="">Does not repeat</option>
            {(Object.keys(EVERY_LABEL) as Repeat[]).map(k => <option key={k} value={k}>{EVERY_LABEL[k]}</option>)}
          </select></label>
          {draft.repeat && <label>Until (optional)<input type="date" min={draft.date} value={draft.repeat_until ?? ""} onChange={e => update("repeat_until", e.target.value || null)} /></label>}
        </div>}
        {!source && draft.repeat && <label className={styles.checkbox}><input type="checkbox" checked={draft.repeat_weekends} onChange={e => update("repeat_weekends", e.target.checked)} />Also on weekends</label>}
        <label>Location<input maxLength={500} value={draft.location} onChange={e => update("location", e.target.value)} placeholder="Room or meeting link" /></label>
        {!source && <div className={styles.attendees} role="group" aria-labelledby="event-attendees-label">
          <span id="event-attendees-label" className={styles.attendeesLabel}>Attendees</span>
          {shownMembers.length > 0 && <div className={styles.attendeeList}>
            {shownMembers.map(m => {
              const on = draft.attendees.includes(m.id);
              const face = <><span className={styles.attendeeAvatar} style={{ background: m.color }}>{m.initials}</span>{m.name}</>;
              // Read-only viewers get plain chips; disabled buttons would render faded.
              if (readOnly) return <span key={m.id} className={`${styles.attendee} ${styles.attendeeOn}`}>{face}</span>;
              return <button key={m.id} type="button" className={`${styles.attendee} ${on ? styles.attendeeOn : ""}`} aria-pressed={on} onClick={() => toggleAttendee(m.id)}>
                {face}
                {on && <Icon name="check" className={styles.attendeeCheck} />}
              </button>;
            })}
          </div>}
          {draft.guests.length > 0 && <div className={styles.attendeeList}>
            {draft.guests.map(g => <span key={g} className={`${styles.attendee} ${styles.attendeeOn}`}>
              <span className={`${styles.attendeeAvatar} ${styles.guestAvatar}`}>{g.trim().charAt(0).toUpperCase()}</span>
              {g}
              {canEdit && <button type="button" className={styles.guestRemove} aria-label={`Remove ${g}`} onClick={() => update("guests", draft.guests.filter(x => x !== g))}><Icon name="close" /></button>}
            </span>)}
          </div>}
          {canEdit && <div className={styles.guestAdd}>
            <input aria-label="Add a guest by name" maxLength={120} value={guestDraft} onChange={e => setGuestDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGuest(); } }}
              placeholder="Add someone outside Foundry by name" />
            <button type="button" disabled={!guestDraft.trim()} onClick={addGuest}><Icon name="plus" /> Add</button>
          </div>}
          {readOnly && !draft.attendees.length && !draft.guests.length && <p className={styles.timeNote}>No attendees.</p>}
          {canEdit && <p className={styles.timeNote}>Members you add get a notification. Guests are only listed by name.</p>}
        </div>}
        {!source && <div className={styles.attendees} role="group" aria-labelledby="event-agenda-label">
          <span id="event-agenda-label" className={styles.attendeesLabel}>Agenda</span>
          {draft.agenda.map((item, index) => <div key={item.id} className={styles.guestAdd}>
            <input aria-label={`Agenda item ${index + 1}`} maxLength={300} value={item.text} placeholder="Agenda item" onChange={e => setAgendaText(item.id, e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (draft.agenda.length < 50) update("agenda", [...draft.agenda.slice(0, index + 1), newItem(), ...draft.agenda.slice(index + 1)]); } }} />
            <button type="button" aria-label={`Remove agenda item ${index + 1}`} onClick={() => update("agenda", draft.agenda.filter(i => i.id !== item.id))}><Icon name="close" /></button>
          </div>)}
          <button type="button" className={styles.agendaAdd} disabled={draft.agenda.length >= 50} onClick={() => update("agenda", [...draft.agenda, newItem()])}><Icon name="plus" /> Add agenda item</button>
          <p className={styles.timeNote}>{draft.repeat ? "A checklist every occurrence starts with, unticked." : "A checklist to tick off during the event."}</p>
        </div>}
        {/* Notes of existing events are written live in the event view; a
            repeating event's notes belong to each occurrence, so it has none here. */}
        {!event && !draft.repeat && <div className={styles.notesField}>
          <span className={styles.attendeesLabel}>Notes</span>
          <PageLinkTextarea value={draft.notes} onChange={v => update("notes", v)} targets={linkTargets} formatShortcuts rows={4} maxLength={5000}
            hint="⌘B bold · ⌘I italic · type [[ or @ to link a page, section, canvas, board or task" />
        </div>}
        {!source && (event || draft.repeat) && <p className={styles.timeNote}>{draft.repeat ? "Each occurrence gets its own meeting notes, written in the event view." : "Notes are written live in the event view."}</p>}
      </fieldset>
      {status}
      <footer>
        {event && canEdit && <button type="button" disabled={busy} onClick={() => remove("all")}>{deleteAllLabel}</button>}
        <button type="button" disabled={busy} onClick={stopEditing}>Cancel</button>
        {canEdit && <button className="planning-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save event"}</button>}
      </footer>
    </form>}
  </dialog>;
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });

function repeatLabel(repeat: Repeat, until: string | null, weekends: boolean) {
  return `${EVERY_LABEL[repeat]}${weekends ? "" : ", weekdays only"}${until ? ` until ${longDate(until)}` : ""}`;
}

function eventWhen(event: Pick<CalendarEvent, "date" | "end_date" | "start_time" | "end_time">) {
  const end = event.end_date && event.end_date !== event.date ? ` – ${longDate(event.end_date)}` : "";
  const time = event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}` : "All day";
  return `${longDate(event.date)}${end} · ${time}`;
}
