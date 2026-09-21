"use client";
import { useRef, useState } from "react";
import type { Board, BoardCard } from "@/lib/boardRepo";
import { loadSchedule, mutateSchedule } from "@/lib/ganttRepo";

export default function TaskQuickAdd({ boards, parent, initialBoardId, project, onClose, onSaved }: {
  boards: Board[]; parent: BoardCard | null; initialBoardId?: string; project: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const parentBoard = boards.find(b => b.cols.some(c => c.cards.some(t => t.id === parent?.id)));
  const [boardId, setBoardId] = useState(parentBoard?.id ?? initialBoardId ?? boards[0]?.id ?? "");
  const [titles, setTitles] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  const board = boards.find(b => b.id === boardId);
  const stage = board?.cols.find(c => !c.isCompleted);
  async function submit() {
    if (saving.current || !stage || !titles.trim()) return;
    const submitted = titles;
    saving.current = true;
    setBusy(true); setError(""); setNotice(""); setTitles("");
    input.current?.focus();
    try {
      await mutateSchedule(project, await loadSchedule(project), {
        op: "create_tasks", day: null, parent_id: parent?.id ?? null, column_id: stage.id,
        titles: submitted.split("\n").map(t => t.trim()).filter(Boolean),
      });
      setNotice("Added. Keep typing to add another.");
    } catch (e) {
      setTitles(current => submitted + (current ? "\n" + current : ""));
      setError(e instanceof Error ? e.message : "Could not create tasks.");
      saving.current = false; setBusy(false); return;
    }
    try { await onSaved(); }
    catch { setError("Saved, but could not refresh the timeline. Reload to see your tasks."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <form className="task-quick-add" aria-label={parent ? `Add subtasks to ${parent.title}` : "Add tasks"} onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="quick-add-heading">
      <strong>{parent ? `Under ${parent.title}` : "Add tasks"}</strong>
      {!parent && boards.length > 1 && <select aria-label="Board for new tasks" value={boardId} onChange={e => setBoardId(e.target.value)} disabled={busy}>{boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      <button type="button" disabled={busy} onClick={onClose} aria-label="Close task entry">×</button>
    </div>
    <div className="quick-add-entry">
      <textarea ref={input} autoFocus aria-label={parent ? "Subtask names" : "Task names"} rows={titles.includes("\n") ? 4 : 1} value={titles} onChange={e => setTitles(e.target.value)} placeholder={parent ? "Add a subtask…" : "Add a task…"} onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
        if (e.key === "Escape" && !busy) onClose();
      }} />
      <button className="planning-primary" disabled={busy || !stage || !titles.trim()}>{busy ? "Adding…" : "Add"}</button>
    </div>
    <small>{!stage ? "Add an unfinished stage to this board first." : "Enter to add · Shift+Enter for a new line · Paste a list to add several"}</small>
    {error ? <p role="alert">{error}</p> : <p role="status">{notice}</p>}
  </form>;
}
