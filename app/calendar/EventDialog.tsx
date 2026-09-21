"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCalendarEvent, saveCalendarEvent, type CalendarEvent, type CalendarEventDraft } from "@/lib/calendarEventsRepo";
import styles from "./calendar.module.css";

export default function EventDialog({ event, date, project, canEdit, onClose, onSaved, onDeleted }: {
  event: CalendarEvent | null;
  date: string;
  project: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<CalendarEventDraft>(() => event ?? { title: "", date, end_date: null, start_time: null, end_time: null, location: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  function update<K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) { setDraft(old => ({ ...old, [key]: value })); }
  return <dialog ref={dialog} className={styles.eventDialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="event-dialog-title">
    <form onSubmit={async e => {
      e.preventDefault(); if (!canEdit || busy) return;
      setBusy(true); setError("");
      try { onSaved(await saveCalendarEvent(project, draft, event?.id)); onClose(); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className={styles.dialogHeading}><div><h2 id="event-dialog-title">{event ? "Calendar event" : "New event"}</h2><p>A shared workspace event, independent of your boards.</p></div><button type="button" aria-label="Close event" disabled={busy} onClick={onClose}>×</button></div>
      <fieldset disabled={!canEdit || busy}>
        <label>Event title<input autoFocus required maxLength={160} value={draft.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Team playtest" /></label>
        <div className={styles.timeFields}>
          <label>Start date<input type="date" required value={draft.date} onChange={e => setDraft(old => ({ ...old, date: e.target.value, end_date: old.end_date && old.end_date < e.target.value ? e.target.value : old.end_date }))} /></label>
          <label>End date<input type="date" required min={draft.date} value={draft.end_date || draft.date} onChange={e => update("end_date", e.target.value || null)} /></label>
        </div>
        <label className={styles.checkbox}><input type="checkbox" checked={!draft.start_time} onChange={e => setDraft(old => ({ ...old, start_time: e.target.checked ? null : "09:00", end_time: null }))} />All day</label>
        {draft.start_time && <div className={styles.timeFields}><label>Start time<input type="time" required value={draft.start_time.slice(0, 5)} onChange={e => update("start_time", e.target.value)} /></label><label>End time (optional)<input type="time" min={(draft.end_date || draft.date) === draft.date ? draft.start_time.slice(0, 5) : undefined} value={draft.end_time?.slice(0, 5) ?? ""} onChange={e => update("end_time", e.target.value || null)} /></label></div>}
        {draft.start_time && <p className={styles.timeNote}>Times are shared as entered; all attendees see the same time.</p>}
        <label>Location<input maxLength={500} value={draft.location} onChange={e => update("location", e.target.value)} placeholder="Room or meeting link" /></label>
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
