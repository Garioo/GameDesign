"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCalendarEvent, saveCalendarEvent, type CalendarEvent, type CalendarEventDraft } from "@/lib/calendarEventsRepo";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import Icon from "@/app/components/Icon";
import styles from "./calendar.module.css";

export default function EventDialog({ event, date, project, canEdit, source, onClose, onSaved, onDeleted }: {
  event: CalendarEvent | null;
  date: string;
  project: string;
  canEdit: boolean;
  /** Name of the subscribed calendar a read-only event came from. */
  source?: string;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<CalendarEventDraft>(() => event ?? { title: "", date, end_date: null, start_time: null, end_time: null, location: "", notes: "", attendees: [], guests: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  useEffect(() => {
    if (!project) return;
    let active = true;
    listMembers(project).then(list => { if (active) setMembers(list); }).catch(console.error);
    return () => { active = false; };
  }, [project]);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
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
  const readOnly = !canEdit;
  const shownMembers = readOnly ? members.filter(m => draft.attendees.includes(m.id)) : members;
  return <dialog ref={dialog} className={styles.eventDialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="event-dialog-title">
    <form onSubmit={async e => {
      e.preventDefault(); if (!canEdit || busy) return;
      setBusy(true); setError("");
      try { onSaved(await saveCalendarEvent(project, withPendingGuest(draft), event?.id)); onClose(); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className={styles.dialogHeading}><div><h2 id="event-dialog-title">{event ? "Calendar event" : "New event"}</h2><p>{source ? `From the subscribed calendar “${source}”. Change it in Moodle.` : "Everyone in the workspace can see this event."}</p></div><button type="button" aria-label="Close event" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
      <fieldset disabled={!canEdit || busy}>
        <label>Event title<input autoFocus required maxLength={160} value={draft.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Team meeting" /></label>
        <div className={styles.timeFields}>
          <label>Start date<input type="date" required value={draft.date} onChange={e => setDraft(old => ({ ...old, date: e.target.value, end_date: old.end_date && old.end_date < e.target.value ? e.target.value : old.end_date }))} /></label>
          <label>End date<input type="date" required min={draft.date} value={draft.end_date || draft.date} onChange={e => update("end_date", e.target.value || null)} /></label>
        </div>
        <label className={styles.checkbox}><input type="checkbox" checked={!draft.start_time} onChange={e => setDraft(old => ({ ...old, start_time: e.target.checked ? null : "09:00", end_time: null }))} />All day</label>
        {draft.start_time && <div className={styles.timeFields}><label>Start time<input type="time" required value={draft.start_time.slice(0, 5)} onChange={e => update("start_time", e.target.value)} /></label><label>End time (optional)<input type="time" min={(draft.end_date || draft.date) === draft.date ? draft.start_time.slice(0, 5) : undefined} value={draft.end_time?.slice(0, 5) ?? ""} onChange={e => update("end_time", e.target.value || null)} /></label></div>}
        {draft.start_time && <p className={styles.timeNote}>Times are shared as entered; all attendees see the same time.</p>}
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
        <label>Notes<textarea rows={4} maxLength={5000} value={draft.notes} onChange={e => update("notes", e.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className={styles.eventError}>{error}</p>}
      {confirmDelete && <p role="status">Delete this event for everyone in the workspace?</p>}
      <footer>
        {event && canEdit && <button type="button" disabled={busy} onClick={async () => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          setBusy(true); setError("");
          try { await deleteCalendarEvent(project, event.id); onDeleted(event.id); onClose(); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{confirmDelete ? "Confirm delete" : "Delete event"}</button>}
        <button type="button" disabled={busy} onClick={onClose}>{canEdit ? "Cancel" : "Close"}</button>
        {canEdit && <button className="planning-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save event"}</button>}
      </footer>
    </form>
  </dialog>;
}
