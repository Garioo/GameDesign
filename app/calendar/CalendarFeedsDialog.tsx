"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { addCalendarFeed, deleteCalendarFeed, type CalendarFeed } from "@/lib/calendarFeedsRepo";
import styles from "./calendar.module.css";

export default function CalendarFeedsDialog({ project, feeds, canEdit, errors, onClose, onAdded, onRemoved, onReload }: {
  project: string;
  feeds: CalendarFeed[];
  canEdit: boolean;
  /** Load errors per feed id. */
  errors: Record<string, string>;
  onClose: () => void;
  onAdded: (feed: CalendarFeed) => void;
  onRemoved: (id: string) => void;
  onReload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [label, setLabel] = useState("Moodle");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className={styles.eventDialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="feeds-dialog-title">
    <div className={styles.dialogHeading}>
      <div><h2 id="feeds-dialog-title">Subscribed calendars</h2><p>Events from these calendars show up for everyone in the workspace. They're read-only here — change them in Moodle.</p></div>
      <button type="button" aria-label="Close subscribed calendars" disabled={busy} onClick={onClose}><Icon name="close" /></button>
    </div>
    {feeds.length > 0 && <ul className={styles.feedList}>
      {feeds.map(feed => <li key={feed.id}>
        <span className={styles.feedSwatch} aria-hidden="true" />
        <span><strong>{feed.label}</strong>{errors[feed.id] && <small role="alert">{errors[feed.id]}</small>}</span>
        {canEdit && <button type="button" disabled={busy} onClick={async () => {
          if (confirmRemove !== feed.id) { setConfirmRemove(feed.id); return; }
          setBusy(true); setError("");
          try { await deleteCalendarFeed(project, feed.id); onRemoved(feed.id); setConfirmRemove(null); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{confirmRemove === feed.id ? "Confirm remove" : "Remove"}</button>}
      </li>)}
    </ul>}
    {feeds.length > 0 && <button type="button" className={styles.feedReload} disabled={busy} onClick={onReload}>Reload events</button>}
    {canEdit ? <form onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      setBusy(true); setError("");
      try { onAdded(await addCalendarFeed(project, label, url)); setUrl(""); setLabel("Moodle"); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        <label>Name<input required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label>
        <label>Moodle calendar link<input required type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://moodle…/calendar/export_execute.php?userid=…&authtoken=…" /></label>
        <p className={styles.timeNote}>In Moodle, open <strong>Calendar → Import or export calendars → Export calendar</strong>, choose <em>All events</em> and <em>Recent and next 60 days</em>, then <strong>Get calendar URL</strong> and paste it here. Workspace members can see the events this link loads.</p>
      </fieldset>
      {error && <p role="alert" className={styles.eventError}>{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>Done</button>
        <button className="planning-primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add calendar"}</button>
      </footer>
    </form> : <>
      {!feeds.length && <p className={styles.empty}>No subscribed calendars yet.</p>}
      {error && <p role="alert" className={styles.eventError}>{error}</p>}
      <footer><button type="button" onClick={onClose}>Close</button></footer>
    </>}
  </dialog>;
}
