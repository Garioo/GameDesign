"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getOccurrenceNotes, saveEventNotes, saveOccurrenceNotes, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import type { SaveState } from "@/app/components/SaveStatus";

/* ---------------------------------------------------------------------------
 * Meeting notes on a calendar event, typed live.
 *
 * A one-off event keeps its notes on the event; each occurrence of a
 * repeating event has its own (calendar_event_notes), so every meeting starts
 * with an empty page. Keystrokes go out over a per-occurrence Realtime
 * broadcast (throttled), so everyone with it open sees the text as it's
 * written; the database write is debounced and is what late joiners and
 * reloads get. While you're typing, incoming text is ignored so your cursor
 * never jumps — the last person to type wins, fine for one note-taker at a time.
 * ------------------------------------------------------------------------- */

const BROADCAST_MS = 150;
const SAVE_MS = 800;
const TYPING_MS = 1500;

export interface Typer { name: string; color: string }

export function useLiveNotes({ project, event, occurrence, enabled, me, onSaved }: {
  project: string;
  event: CalendarEvent | null;
  /** Start date of the occurrence for a repeating event; null for a one-off. */
  occurrence: string | null;
  enabled: boolean;
  me: Typer | null;
  /** A one-off's notes were saved on the event. */
  onSaved: (event: CalendarEvent) => void;
}) {
  const eventId = event?.id ?? null;
  const room = eventId ? `${eventId}@${occurrence ?? ""}` : null;
  const [notes, setNotes] = useState(occurrence ? "" : event?.notes ?? "");
  const [loaded, setLoaded] = useState(!occurrence);
  const [fetched, setFetched] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [typer, setTyper] = useState<Typer | null>(null);
  const notesRef = useRef(notes);
  const lastLocal = useRef(0); // when you last typed
  const unsaved = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const apply = (text: string) => { notesRef.current = text; setNotes(text); };
  const typingNow = () => Date.now() - lastLocal.current < TYPING_MS;

  // Occurrence notes: fetch, and refetch when someone saves.
  const refetch = async () => {
    if (!eventId || !occurrence) return;
    setFetched(await getOccurrenceNotes(eventId, occurrence));
    setLoaded(true);
  };
  useEffect(() => { refetch().catch(console.error); }, [eventId, occurrence]); // eslint-disable-line react-hooks/exhaustive-deps
  useSidebarLiveUpdates(enabled && occurrence ? project : null, ["calendar_event_notes"], refetch);

  // A saved version arriving is adopted unless you have edits of your own in flight.
  const savedNotes = occurrence ? fetched : event?.notes ?? "";
  useEffect(() => {
    if (savedNotes !== null && !unsaved.current && !typingNow()) apply(savedNotes);
  }, [savedNotes]);

  const save = async () => {
    if (!eventId) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const text = notesRef.current;
    setSaveState("saving");
    try {
      if (occurrence) await saveOccurrenceNotes(project, eventId, occurrence, text);
      else onSavedRef.current(await saveEventNotes(project, eventId, text));
      if (notesRef.current === text) { unsaved.current = false; setSaveState("saved"); }
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!room || !enabled) return;
    const ch = supabase.channel(`event-notes:${room}`, { config: { broadcast: { self: false } } });
    let typerTimer: ReturnType<typeof setTimeout> | undefined;
    ch.on("broadcast", { event: "notes" }, ({ payload }) => {
      const p = payload as { notes?: unknown; by?: Typer };
      if (typeof p.notes !== "string") return;
      if (p.by) {
        setTyper(p.by);
        clearTimeout(typerTimer);
        typerTimer = setTimeout(() => setTyper(null), TYPING_MS * 2);
      }
      if (!typingNow()) apply(p.notes.slice(0, 5000));
    }).subscribe();
    channel.current = ch;
    // Retry a failed save when the connection comes back.
    const onOnline = () => { if (unsaved.current) void saveRef.current(); };
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(typerTimer);
      window.removeEventListener("online", onOnline);
      if (sendTimer.current) { clearTimeout(sendTimer.current); sendTimer.current = null; }
      // Closing the dialog mid-debounce: send the save now instead of dropping it.
      if (saveTimer.current) void saveRef.current();
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [room, enabled]);

  // Warn before a reload/close drops notes that haven't reached the server.
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const change = (text: string) => {
    apply(text);
    lastLocal.current = Date.now();
    unsaved.current = true;
    setSaveState("saving");
    if (!sendTimer.current) {
      sendTimer.current = setTimeout(() => {
        sendTimer.current = null;
        channel.current?.send({ type: "broadcast", event: "notes", payload: { notes: notesRef.current, by: meRef.current ?? undefined } }).catch(() => {});
      }, BROADCAST_MS);
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveRef.current(), SAVE_MS);
  };

  return { notes, notesRef, loaded, change, saveState, retry: () => void save(), typer };
}
