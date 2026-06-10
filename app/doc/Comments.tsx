"use client";

import { useMemo, useState } from "react";
import type { ProfileInfo } from "@/lib/docsRepo";
import type { CommentRow } from "@/lib/commentsRepo";
import styles from "./Comments.module.css";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

interface Author {
  name: string;
  initials: string;
  color: string;
}

function Avatar({ a }: { a: Author }) {
  return (
    <span className={styles.avatar} style={{ background: a.color }} title={a.name}>
      {a.initials}
    </span>
  );
}

export default function Comments({
  comments,
  people,
  currentUserId,
  onAdd,
  onDelete,
  onEdit,
  onResolve,
}: {
  comments: CommentRow[];
  people: ProfileInfo[];
  currentUserId: string;
  onAdd: (body: string, parentId?: string | null) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const authorFor = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return (id: string): Author => {
      const p = byId.get(id);
      return {
        name: p?.name ?? "Member",
        initials: p?.initials ?? (p?.name ?? "M").slice(0, 2).toUpperCase(),
        color: p?.color ?? "#a59a8c",
      };
    };
  }, [people]);

  const { openRoots, resolvedRoots, repliesByParent } = useMemo(() => {
    const openRoots: CommentRow[] = [];
    const resolvedRoots: CommentRow[] = [];
    const repliesByParent = new Map<string, CommentRow[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const list = repliesByParent.get(c.parent_id) ?? [];
        list.push(c);
        repliesByParent.set(c.parent_id, list);
      } else if (c.resolved_at) {
        resolvedRoots.push(c);
      } else {
        openRoots.push(c);
      }
    }
    return { openRoots, resolvedRoots, repliesByParent };
  }, [comments]);

  const submitRoot = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body, null);
    setDraft("");
  };

  const submitReply = (parentId: string) => {
    const body = replyDraft.trim();
    if (!body) return;
    onAdd(body, parentId);
    setReplyDraft("");
    setReplyTo(null);
  };

  const submitEdit = (id: string) => {
    const body = editDraft.trim();
    if (body) onEdit(id, body);
    setEditingId(null);
    setEditDraft("");
  };

  const renderComment = (c: CommentRow, isReply: boolean, resolved: boolean) => {
    const a = authorFor(c.author);
    const mine = c.author === currentUserId;
    const editing = editingId === c.id;
    return (
      <div key={c.id} className={isReply ? `${styles.item} ${styles.reply}` : styles.item}>
        <Avatar a={a} />
        <div className={styles.bubble}>
          <div className={styles.meta}>
            <span className={styles.author}>{a.name}</span>
            <span className={styles.time}>{timeAgo(c.created_at)}</span>
            {c.updated_at && <span className={styles.time}>(edited)</span>}
          </div>
          {editing ? (
            <div className={`${styles.composer} ${styles.editComposer}`}>
              <textarea
                className={styles.textarea}
                autoFocus
                rows={2}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitEdit(c.id);
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <button className={styles.send} onClick={() => submitEdit(c.id)}>
                Save
              </button>
            </div>
          ) : (
            <p className={styles.text}>{c.body}</p>
          )}
          {!editing && (
            <div className={styles.actions}>
              {!isReply && !resolved && (
                <button
                  className={styles.action}
                  onClick={() => {
                    setReplyTo((r) => (r === c.id ? null : c.id));
                    setReplyDraft("");
                  }}
                >
                  Reply
                </button>
              )}
              {!isReply && (
                <button className={styles.action} onClick={() => onResolve(c.id, !resolved)}>
                  {resolved ? "Reopen" : "Resolve"}
                </button>
              )}
              {mine && (
                <button
                  className={styles.action}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditDraft(c.body);
                  }}
                >
                  Edit
                </button>
              )}
              {mine && (
                <button className={`${styles.action} ${styles.danger}`} onClick={() => onDelete(c.id)}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderThread = (c: CommentRow, resolved: boolean) => (
    <div key={c.id} className={resolved ? `${styles.thread} ${styles.resolved}` : styles.thread}>
      {renderComment(c, false, resolved)}
      {(repliesByParent.get(c.id) ?? []).map((r) => renderComment(r, true, resolved))}
      {!resolved && replyTo === c.id && (
        <div className={`${styles.composer} ${styles.replyComposer}`}>
          <textarea
            className={styles.textarea}
            autoFocus
            rows={2}
            placeholder="Reply…"
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitReply(c.id);
              }
            }}
          />
          <button className={styles.send} onClick={() => submitReply(c.id)}>
            Reply
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span>Comments</span>
        <span className={styles.count}>{comments.length}</span>
      </div>

      <div className={styles.list}>
        {openRoots.length === 0 && resolvedRoots.length === 0 && (
          <div className={styles.empty}>No comments yet.</div>
        )}
        {openRoots.map((c) => renderThread(c, false))}

        {resolvedRoots.length > 0 && (
          <>
            <button
              className={styles.resolvedToggle}
              onClick={() => setShowResolved((s) => !s)}
            >
              {showResolved ? "Hide" : "Show"} resolved ({resolvedRoots.length})
            </button>
            {showResolved && resolvedRoots.map((c) => renderThread(c, true))}
          </>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.textarea}
          rows={2}
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitRoot();
            }
          }}
        />
        <button className={styles.send} onClick={submitRoot} disabled={!draft.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}
