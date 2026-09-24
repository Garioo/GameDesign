"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Icon from "@/app/components/Icon";
import Comments from "@/app/doc/Comments";
import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  setCommentResolved,
  type CommentRow,
} from "@/lib/commentsRepo";
import type { ProfileInfo } from "@/lib/docsRepo";
import { supabase } from "@/lib/supabase";
import { LIMITS } from "@/lib/validate";
import styles from "./CardDetails.module.css";

// Unique per mount: supabase.channel() reuses a same-named channel, which can't take new callbacks once subscribed.
let commentChannelSeq = 0;

/* ── Discussion ──────────────────────────────────────────────────────────── */

/** A task's comment thread, kept live over realtime. Viewers can comment too. */
export function CardComments({ cardId, people, currentUserId }: { cardId: string; people: ProfileInfo[]; currentUserId: string }) {
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState("");
  // With no comments yet the thread stays folded into one button until someone writes.
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      listComments({ cardId })
        .then((rows) => {
          if (active) { setComments(rows); setError(""); }
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : String(e));
        });
    refresh();
    // DELETE events can't be filtered server-side, so match the card here.
    const channel = supabase
      .channel(`card-comments:${cardId}:${++commentChannelSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as { card_id?: string };
        if (row?.card_id === cardId) refresh();
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [cardId]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const reload = () => listComments({ cardId }).then(setComments).catch(fail);

  if (!error && !composing && comments?.length === 0) {
    return (
      <section className={styles.discussion} aria-label="Task discussion">
        <button type="button" className={styles.linkBtn} onClick={() => setComposing(true)}><Icon name="comment" /> Add a comment</button>
      </section>
    );
  }
  if (!error && !comments) return null;

  return (
    <section className={styles.discussion} aria-label="Task discussion">
      {error && <p role="alert" className={styles.error}>{error.includes("card_id") ? "Task comments need a database update. Apply supabase/migrate-card-comments.sql." : error}</p>}
      <Comments
        comments={comments ?? []}
        people={people}
        currentUserId={currentUserId}
        onAdd={(body, parentId) => addComment({ cardId }, currentUserId, body, parentId ?? null).then(reload).catch(fail)}
        onDelete={(id) => deleteComment(id).then(reload).catch(fail)}
        onEdit={(id, body) => editComment(id, body).then(reload).catch(fail)}
        onResolve={(id, resolved) => setCommentResolved(id, resolved).then(reload).catch(fail)}
      />
    </section>
  );
}

/* ── Subtasks ────────────────────────────────────────────────────────────── */

export interface SubtaskItem {
  id: string;
  title: string;
  stage: string;
  done: boolean;
}

/** Direct subtasks with their stage, plus quick creation for editors. */
export function SubtaskList({
  items,
  canAdd,
  onOpen,
  onAdd,
  onToggle,
}: {
  items: SubtaskItem[];
  canAdd: boolean;
  onOpen: (id: string) => void;
  onAdd: (title: string) => Promise<void>;
  /** Mark a subtask done / not done; omitted when the viewer can't, or the board has no done stage. */
  onToggle?: (id: string, done: boolean) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = items.filter((i) => i.done).length;
  const [toggling, setToggling] = useState<string | null>(null);

  async function toggle(item: SubtaskItem) {
    if (!onToggle || toggling) return;
    setToggling(item.id); setError("");
    try {
      await onToggle(item.id, !item.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(null);
    }
  }

  async function commit() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true); setError("");
    try {
      await onAdd(title);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.subtasks}>
      <div className={styles.subHead}>
        <span className="modal-label">Subtasks</span>
        {items.length > 0 && <span className={styles.progress}>{done}/{items.length} done</span>}
      </div>
      {items.length > 0 && (
        <ul className={styles.subList}>
          {items.map((t) => (
            <li key={t.id} className={styles.subItem}>
              {onToggle ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? `Mark “${t.title}” not done` : `Mark “${t.title}” done`}
                  className={`${styles.check} ${styles.checkBtn}${t.done ? ` ${styles.checkDone}` : ""}`}
                  disabled={toggling === t.id}
                  onClick={() => void toggle(t)}
                />
              ) : (
                <span className={`${styles.check}${t.done ? ` ${styles.checkDone}` : ""}`} aria-hidden="true" />
              )}
              <button type="button" className={styles.subRow} onClick={() => onOpen(t.id)}>
                <span className={`${styles.subTitle}${t.done ? ` ${styles.subTitleDone}` : ""}`}>{t.title}</span>
                <span className={styles.stage}>{t.stage}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (adding ? (
        <div className={styles.subAdd}>
          <input
            className="modal-input"
            autoFocus
            placeholder="Subtask title…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") { e.preventDefault(); void commit(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAdding(false); setDraft(""); }
            }}
          />
          <button type="button" className="modal-cancel" disabled={busy || !draft.trim()} onClick={() => void commit()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      ) : (
        <button type="button" className={styles.linkBtn} onClick={() => setAdding(true)}><Icon name="plus" /> Add subtask</button>
      ))}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}

/* ── Tags ────────────────────────────────────────────────────────────────── */

/** Chip input: Enter or comma adds a tag, Backspace on empty removes the last. */
export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= LIMITS.tagCount;

  function add() {
    const tag = draft.replace(/,/g, " ").trim().slice(0, LIMITS.tag);
    setDraft("");
    if (!tag || full || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
  }

  return (
    <div className={styles.tags}>
      {tags.map((t) => (
        <span key={t} className={styles.tag}>
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><Icon name="close" /></button>
        </span>
      ))}
      <input
        className={styles.tagInput}
        aria-label="Add tag"
        placeholder={full ? "Tag limit reached" : tags.length ? "Add tag…" : "Add tags…"}
        disabled={full}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
    </div>
  );
}
