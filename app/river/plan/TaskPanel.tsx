"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRiver } from "../RiverShell";
import { createSubtask, deleteCard, moveCard, setCardOwner, setCardPriority, type Board, type BoardCard, type BoardCategory, type BoardColumn } from "@/lib/boardRepo";
import type { ProfileInfo } from "@/lib/docsRepo";
import { CardComments } from "@/app/board/CardDetails";
import { saveCard } from "./taskApi";
import SidePanel from "./SidePanel";
import plan from "./plan.module.css";

interface Item { board: Board; col: BoardColumn; colIndex: number; card: BoardCard }

/** A task in the side panel: every everyday field is one click away; rarer ones stay in the classic dialog. */
export default function TaskPanel({ item, boards, members, categories, pages, canEdit, color, onClose, onChanged, say }: {
  item: Item | null;
  boards: Board[];
  members: ProfileInfo[];
  categories: BoardCategory[];
  pages: { id: string; title: string }[];
  canEdit: boolean;
  color?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  say: (m: string) => void;
}) {
  const { session } = useRiver();
  const ws = session.workspaceId;
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardId = item?.card.id;

  useEffect(() => {
    setTitle(item?.card.title ?? "");
    setDesc(item?.card.sub ?? "");
    setConfirmDelete(false);
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await onChanged();
      if (message) say(message);
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't save");
    }
    setBusy(false);
  };

  if (!item)
    return <SidePanel open={false} onClose={onClose} eyebrow="Task"><span /></SidePanel>;

  const { board, col, card } = item;
  const category = categories.find((c) => c.id === card.categoryId);
  const steps = board.cols.flatMap((c) => c.cards.filter((k) => k.parentId === card.id).map((k) => ({ k, c })));
  const doneCol = board.cols.find((c) => c.isCompleted);
  const firstCol = board.cols.find((c) => !c.isCompleted) ?? board.cols[0];
  const linked = card.pageIds.map((id) => pages.find((p) => p.id === id)).filter((p): p is { id: string; title: string } => !!p);
  const toColumn = (target: BoardColumn, k: BoardCard) =>
    moveCard(k.id, target.id, [...target.cards.map((c) => c.id).filter((id) => id !== k.id), k.id]);

  return (
    <SidePanel open onClose={onClose} color={color} eyebrow={<>{board.name}{category ? ` · ${category.name}` : ""}</>}>
      <input className={plan.ptitle} value={title} disabled={!canEdit} aria-label="Task title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onBlur={() => { const t = title.trim(); if (t && t !== card.title) void run(() => saveCard(ws, card, col.id, { title: t })); else setTitle(card.title); }} />

      <div className={plan.prow}>
        <span>Stage</span>
        <div className={plan.chips}>
          {board.cols.map((c) => (
            <button key={c.id} className={c.id === col.id ? plan.chipOn : undefined} disabled={!canEdit || busy} onClick={() => c.id !== col.id && run(() => toColumn(c, card), `Moved to ${c.name}`)}>{c.name}</button>
          ))}
        </div>
      </div>
      <div className={plan.prow}>
        <span>Priority</span>
        <div className={plan.chips}>
          {([["", "None"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]] as const).map(([k, n]) => (
            <button key={k} className={(card.priority ?? "") === k ? plan.chipOn : undefined} disabled={!canEdit || busy} onClick={() => run(() => setCardPriority(card.id, k || null))}>{n}</button>
          ))}
        </div>
      </div>
      <div className={plan.prow}>
        <span>People</span>
        <div className={plan.chips}>
          {members.map((m) => {
            const on = card.ownerIds.includes(m.id);
            return (
              <button key={m.id} className={`${plan.person} ${on ? plan.chipOn : ""}`} disabled={!canEdit || busy} onClick={() => run(() => setCardOwner(card.id, m.id, !on))}>
                <span className={plan.av} style={{ background: m.color }}>{m.initials}</span>{m.name}
              </button>
            );
          })}
        </div>
      </div>
      {categories.length > 0 && (
        <div className={plan.prow}>
          <span>Category</span>
          <div className={plan.chips}>
            <button className={!card.categoryId ? plan.chipOn : undefined} disabled={!canEdit || busy} onClick={() => run(() => saveCard(ws, card, col.id, { category_id: null }))}>None</button>
            {categories.map((c) => (
              <button key={c.id} className={card.categoryId === c.id ? plan.chipOn : undefined} disabled={!canEdit || busy} onClick={() => run(() => saveCard(ws, card, col.id, { category_id: c.id, kind: c.name }))}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className={plan.ph4}><span>Steps</span><span>{steps.filter((s) => s.c.isCompleted).length}/{steps.length}</span></div>
      {steps.map(({ k, c }) => (
        <div key={k.id} className={`${plan.step} ${c.isCompleted ? plan.stepDone : ""}`}>
          <button className={`${plan.box} ${c.isCompleted ? plan.boxOn : ""}`} disabled={!canEdit || busy || !doneCol} aria-label={`Toggle ${k.title}`}
            onClick={() => run(() => toColumn(c.isCompleted ? firstCol : doneCol!, k))}>{c.isCompleted ? "✓" : ""}</button>
          <span>{k.title}</span>
        </div>
      ))}
      {canEdit && (
        <input className={plan.line} placeholder="+ Add a step, press Enter" value={step} onChange={(e) => setStep(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && step.trim() && firstCol) { const t = step.trim(); setStep(""); void run(() => createSubtask(ws, card.id, firstCol.id, t)); } }} />
      )}

      <div className={plan.ph4}><span>Description</span></div>
      <textarea className={plan.area} value={desc} disabled={!canEdit} placeholder="Add a short description…"
        onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== card.sub && run(() => saveCard(ws, card, col.id, { sub: desc }))} />

      <div className={plan.ph4}><span>Linked pages</span></div>
      {linked.length ? linked.map((p) => <Link key={p.id} href={`/river/pages?page=${p.id}`} className={plan.line} style={{ display: "block", textDecoration: "none", color: "inherit" }}>¶ {p.title}</Link>)
        : <p className={plan.hint}>No pages linked. Link one from the full task.</p>}

      <div className={plan.ph4}><span>Comments</span></div>
      <CardComments cardId={card.id} people={members} currentUserId={session.userId} />

      <div className={plan.pbtns}>
        <Link href={`/board?board=${board.id}&card=${card.id}&classic=1`}>Open full task</Link>
        {canEdit && (confirmDelete
          ? <><button className={plan.del} onClick={() => run(async () => { await deleteCard(card.id); onClose(); }, "Task deleted")}>Yes, delete</button><button onClick={() => setConfirmDelete(false)}>Keep it</button></>
          : <button className={plan.del} onClick={() => setConfirmDelete(true)}>Delete</button>)}
      </div>
      <p className={plan.hint}>The full task also has tags, a parent task, a milestone, repeats and a canvas.</p>
    </SidePanel>
  );
}
