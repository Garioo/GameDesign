"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { listActivity, type ActivityItem } from "@/lib/activityRepo";
import { listMembers } from "@/lib/docsRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { STATUS_LABEL, type Status } from "@/app/doc/data";
import styles from "./ActivityFeed.module.css";

const PAGE_SIZE = 25;

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const statusLabel = (s?: string) => (s && s in STATUS_LABEL ? STATUS_LABEL[s as Status] : s ?? "");

/**
 * Who did what, newest first, grouped by day and kept live. With `pageId` or
 * `cardId` it becomes that item's compact history ("this page"/"this task").
 */
export default function ActivityFeed({
  workspaceId,
  pageId,
  cardId,
  limit = PAGE_SIZE,
  compact = false,
  emptyText = "Nothing has happened here yet.",
}: {
  workspaceId: string;
  pageId?: string;
  cardId?: string;
  limit?: number;
  compact?: boolean;
  emptyText?: string;
}) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scoped = !!(pageId || cardId);

  const refresh = useCallback(async () => {
    const rows = await listActivity(workspaceId, { limit, pageId, cardId });
    setItems(rows);
    setMore(rows.length === limit);
    setError("");
  }, [workspaceId, limit, pageId, cardId]);

  useEffect(() => {
    setItems(null);
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refresh]);
  useEffect(() => {
    listMembers(workspaceId)
      .then((m) => setNames(new Map(m.map((p) => [p.id, p.name]))))
      .catch(console.error);
  }, [workspaceId]);
  useSidebarLiveUpdates(workspaceId, ["activity"], refresh);

  async function loadMore() {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const older = await listActivity(workspaceId, { limit, pageId, cardId, before: items[items.length - 1].createdAt });
      setItems([...items, ...older]);
      setMore(older.length === limit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <p className={styles.error}>{error}</p>;
  if (items === null) return <p className={styles.muted}>Loading activity…</p>;
  if (items.length === 0) return <p className={styles.muted}>{emptyText}</p>;

  // Group consecutive rows by day.
  const days: { label: string; rows: ActivityItem[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.createdAt);
    if (days[days.length - 1]?.label !== label) days.push({ label, rows: [] });
    days[days.length - 1].rows.push(it);
  }

  return (
    <div className={`${styles.feed}${compact ? ` ${styles.compact}` : ""}`}>
      {days.map((day) => (
        <section key={day.label} className={styles.day}>
          <h3 className={styles.dayLabel}>{day.label}</h3>
          <ul className={styles.list}>
            {day.rows.map((it) => (
              <li key={it.id} className={styles.item}>
                <span className={styles.avatar} style={{ background: it.actor?.color ?? "#a59a8c" }} title={it.actor?.name}>
                  {it.actor?.initials ?? "?"}
                </span>
                <div className={styles.body}>
                  <p className={styles.sentence}>
                    <strong>{it.actor?.name ?? "Someone"}</strong> {describe(it, scoped, names)}
                  </p>
                  {it.action === "comment.added" && it.meta.snippet && !compact && (
                    <p className={styles.snippet}>“{it.meta.snippet}”</p>
                  )}
                </div>
                <time className={styles.time} dateTime={it.createdAt}>{timeOf(it.createdAt)}</time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {more && (
        <button type="button" className={styles.more} disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Loading…" : "Show older"}
        </button>
      )}
    </div>
  );
}

/** A collapsed "History" section that loads the feed only when opened. */
export function HistoryToggle({ workspaceId, pageId, cardId }: { workspaceId: string; pageId?: string; cardId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.history}>
      <button type="button" className={styles.historyToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={styles.caret} aria-hidden="true">{open ? "▾" : "▸"}</span> History
      </button>
      {open && (
        <ActivityFeed
          key={pageId ?? cardId}
          workspaceId={workspaceId}
          pageId={pageId}
          cardId={cardId}
          limit={10}
          compact
          emptyText={cardId ? "No recorded changes to this task yet." : "No recorded changes to this page yet."}
        />
      )}
    </section>
  );
}

/** The rest of the sentence after the actor's name. */
function describe(it: ActivityItem, scoped: boolean, names: Map<string, string>): ReactNode {
  const m = it.meta;
  const page = (): ReactNode => {
    if (scoped) return "this page";
    const title = it.pageTitle ?? it.target ?? "a page";
    return it.pageId && !it.pageTrashed ? <Link href={`/doc?page=${it.pageId}`}>{title}</Link> : <em>{title}</em>;
  };
  const card = (): ReactNode => {
    if (scoped) return "this task";
    const title = it.cardTitle ?? it.target ?? "a task";
    return it.cardId && m.board ? <Link href={`/board?board=${m.board}&card=${it.cardId}`}>{title}</Link> : <em>{title}</em>;
  };
  const board = (): ReactNode =>
    m.board ? <Link href={`/board?board=${m.board}`}>{m.board_name ?? "a board"}</Link> : <em>{m.board_name ?? "a board"}</em>;

  switch (it.action) {
    case "page.created":
      return <>created {scoped ? "this page" : <>page {page()}</>}</>;
    case "page.status":
      return <>set {page()} to <b>{statusLabel(m.to)}</b></>;
    case "page.trashed":
      return <>moved {page()} to the trash{m.subpages ? ` with ${m.subpages} sub-page${m.subpages === 1 ? "" : "s"}` : ""}</>;
    case "page.restored":
      return <>restored {page()} from the trash</>;
    case "card.created":
      return (m.count ?? 1) > 1
        ? <>added {m.count} tasks to {board()}</>
        : <>added {card()}{scoped ? "" : <> to {board()}</>}</>;
    case "card.moved":
      return m.done ? <>completed {card()}</> : <>moved {card()} to <b>{m.to}</b></>;
    case "card.assigned": {
      const users = m.users ?? [];
      if (users.length === 1 && users[0] === it.actor?.id) return <>took {card()}</>;
      const who = users.map((u) => (u === it.actor?.id ? "themselves" : names.get(u) ?? "a teammate"));
      return <>assigned {who.join(", ")} to {card()}</>;
    }
    case "comment.added": {
      const n = m.count ?? 1;
      const what = n > 1 ? `left ${n} comments on` : "commented on";
      return <>{what} {it.pageId || !it.cardId ? page() : card()}</>;
    }
    case "canvas.created": {
      const name = it.canvasName ?? it.target ?? "a canvas";
      return <>created canvas {it.canvasId ? <Link href={`/doc/canvas?c=${it.canvasId}`}>{name}</Link> : <em>{name}</em>}</>;
    }
    case "member.joined":
      return <>joined the workspace{m.role ? ` as ${m.role}` : ""}</>;
    default:
      return it.action;
  }
}
