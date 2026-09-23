"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileInfo } from "@/lib/docsRepo";
import type { CommentRow } from "@/lib/commentsRepo";
import {
  activeMentionQuery,
  decodeMentionsForEditing,
  encodeEditedMentions,
  splitPersonMentions,
  type KnownMention,
} from "@/lib/personMentions";
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

/** Renders a comment body, turning @[Name](user:<id>) tokens into plain @Name chips. */
function CommentBody({ body }: { body: string }) {
  return (
    <p className={styles.text}>
      {splitPersonMentions(body).map((seg, i) =>
        seg.mention ? (
          <span key={i} className={styles.mention}>{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * A textarea with @-mention autocomplete over the workspace's people. Typing
 * "@" plus a few letters of a name opens a list; picking one inserts "@Name".
 * The textarea only ever shows "@Name" — `value` / `onChange` carry the stored
 * `@[Name](user:<id>)` tokens the notifications trigger looks for.
 */
function MentionTextarea({
  value,
  onChange,
  onSubmit,
  onEscape,
  people,
  className,
  rows,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onEscape?: () => void;
  people: ProfileInfo[];
  className: string;
  rows: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ start: number; query: string; index: number } | null>(null);
  const matches = menu
    ? people.filter((p) => p.name.toLowerCase().includes(menu.query.toLowerCase())).slice(0, 6)
    : [];

  // Everyone mentioned so far (picked here, or already in the value being
  // edited), so the shown "@Name" text can be turned back into tokens.
  const known = useRef<KnownMention[]>([]);
  const { text: shown, mentions } = decodeMentionsForEditing(value);
  for (const m of mentions) {
    if (!known.current.some((k) => k.userId === m.userId && k.name === m.name)) known.current.push(m);
  }
  const emit = (text: string) => onChange(encodeEditedMentions(text, known.current));

  const pick = (p: ProfileInfo) => {
    if (!menu) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? shown.length;
    const label = `@${p.name.replace(/[[\]]/g, "")} `;
    if (!known.current.some((k) => k.userId === p.id)) known.current.push({ name: p.name.replace(/[[\]]/g, ""), userId: p.id });
    emit(shown.slice(0, menu.start) + label + shown.slice(caret));
    setMenu(null);
    requestAnimationFrame(() => {
      const pos = menu.start + label.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={styles.mentionField}>
      <textarea
        ref={ref}
        className={className}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={shown}
        onChange={(e) => {
          emit(e.target.value);
          const q = activeMentionQuery(e.target.value, e.target.selectionStart);
          // A finished mention ("@Name" right before the caret) isn't a new search.
          const finished = q && known.current.some((k) => k.name === q.query);
          setMenu(q && !finished ? { ...q, index: 0 } : null);
        }}
        onKeyDown={(e) => {
          if (menu && matches.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % matches.length }); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + matches.length) % matches.length }); return; }
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); pick(matches[menu.index]); return; }
            if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); }
          if (e.key === "Escape") { setMenu(null); onEscape?.(); }
        }}
        onBlur={() => setTimeout(() => setMenu(null), 120)} // after a mousedown pick registers
      />
      {menu && matches.length > 0 && (
        <div className={styles.mentionMenu} role="listbox">
          {matches.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={i === menu.index ? `${styles.mentionOption} ${styles.mentionOptionActive}` : styles.mentionOption}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
            >
              <span className={styles.avatar} style={{ background: p.color }}>{p.initials}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
  canEdit = false,
  onSettle,
  onJump,
  focusAnchor,
}: {
  comments: CommentRow[];
  people: ProfileInfo[];
  currentUserId: string;
  onAdd: (body: string, parentId?: string | null) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  // Inline comments / suggested edits on page text:
  canEdit?: boolean;
  /** Accept or reject a suggestion (editors only). */
  onSettle?: (comment: CommentRow, accept: boolean) => void;
  /** Scroll the page to the text a thread is attached to. */
  onJump?: (anchor: string) => void;
  /** Thread to scroll into view and flash (its text was clicked on the page). */
  focusAnchor?: { anchor: string; at: number } | null;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusAnchor) return;
    const el = listRef.current?.querySelector(`[data-anchor="${focusAnchor.anchor}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusAnchor]);

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
            {!isReply && c.suggestion != null && <span className={styles.kind}>suggested an edit</span>}
            <span className={styles.time}>{timeAgo(c.created_at)}</span>
            {c.updated_at && <span className={styles.time}>(edited)</span>}
          </div>
          {editing ? (
            <div className={`${styles.composer} ${styles.editComposer}`}>
              <MentionTextarea
                className={styles.textarea}
                autoFocus
                rows={2}
                people={people}
                value={editDraft}
                onChange={setEditDraft}
                onSubmit={() => submitEdit(c.id)}
                onEscape={() => setEditingId(null)}
              />
              <button className={styles.send} onClick={() => submitEdit(c.id)}>
                Save
              </button>
            </div>
          ) : (
            <>
              {!isReply && c.anchor && c.quote != null && (
                <button
                  type="button"
                  className={styles.quote}
                  onClick={() => onJump?.(c.anchor!)}
                  title="Show in the page"
                >
                  {c.suggestion != null ? (
                    <>
                      <del className={styles.quoteOld}>{c.quote}</del>
                      {c.suggestion ? <ins className={styles.quoteNew}>{c.suggestion}</ins> : <span className={styles.quoteHint}>Delete this text</span>}
                    </>
                  ) : (
                    <span className={styles.quoteText}>{c.quote}</span>
                  )}
                </button>
              )}
              {c.suggestion_status && (
                <span className={c.suggestion_status === "accepted" ? styles.settledAccepted : styles.settledRejected}>
                  {c.suggestion_status === "accepted" ? "Accepted" : "Rejected"}
                </span>
              )}
              {c.body && <CommentBody body={c.body} />}
            </>
          )}
          {!editing && (
            <div className={styles.actions}>
              {!isReply && !resolved && c.suggestion != null && canEdit && onSettle && (
                <>
                  <button className={`${styles.action} ${styles.accept}`} onClick={() => onSettle(c, true)}>
                    Accept
                  </button>
                  <button className={styles.action} onClick={() => onSettle(c, false)}>
                    Reject
                  </button>
                </>
              )}
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
              {!isReply && c.suggestion == null && (
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
    <div
      key={c.anchor && focusAnchor?.anchor === c.anchor ? `${c.id}:${focusAnchor.at}` : c.id}
      data-anchor={c.anchor ?? undefined}
      className={[
        styles.thread,
        resolved ? styles.resolved : "",
        c.anchor && focusAnchor?.anchor === c.anchor ? styles.focused : "",
      ].join(" ")}
    >
      {renderComment(c, false, resolved)}
      {(repliesByParent.get(c.id) ?? []).map((r) => renderComment(r, true, resolved))}
      {!resolved && replyTo === c.id && (
        <div className={`${styles.composer} ${styles.replyComposer}`}>
          <MentionTextarea
            className={styles.textarea}
            autoFocus
            rows={2}
            placeholder="Reply…"
            people={people}
            value={replyDraft}
            onChange={setReplyDraft}
            onSubmit={() => submitReply(c.id)}
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

      <div className={styles.list} ref={listRef}>
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
        <MentionTextarea
          className={styles.textarea}
          rows={2}
          placeholder="Add a comment…"
          people={people}
          value={draft}
          onChange={setDraft}
          onSubmit={submitRoot}
        />
        <button className={styles.send} onClick={submitRoot} disabled={!draft.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}
