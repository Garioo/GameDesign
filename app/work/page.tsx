"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/app/components/Icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { loadBoards, moveCard, setCardPriority, type Board } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { loadWorkspace, saveBlocks } from "@/lib/docsRepo";
import { listNotifications, markNotificationRead, notificationVerb, type NotificationRow } from "@/lib/notificationsRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { groupByPriority, myTasks, priorityKey, type MyTask, type PriorityKey } from "@/lib/myWork";
import type { DesignDoc } from "@/app/doc/data";
import { stripInlineHtml } from "@/app/doc/mentions";
import TopBar from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import styles from "./work.module.css";

const GROUP_LABEL: Record<PriorityKey, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
  none: "No priority",
};

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const cardHref = (t: MyTask) => `/board?board=${encodeURIComponent(t.board.id)}&card=${encodeURIComponent(t.card.id)}`;

interface Todo {
  pageId: string;
  pageTitle: string;
  blockId: string;
  text: string;
}

/** Open to-do blocks on pages the user owns. */
function myTodos(docs: DesignDoc[], userId: string): Todo[] {
  const out: Todo[] = [];
  for (const d of docs) {
    if (d.ownerId !== userId) continue;
    for (const b of d.blocks) {
      if (b.type !== "todo" || b.checked) continue;
      const text = stripInlineHtml(b.text);
      if (text) out.push({ pageId: d.id, pageTitle: d.title, blockId: b.id, text });
    }
  }
  return out;
}

export default function MyWorkPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [docs, setDocs] = useState<DesignDoc[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) { router.replace("/login"); return; }
      if (!s.onboarded || !s.workspaceId) { router.replace("/onboarding"); return; }
      setSession(s);
      const [b, d, n] = await Promise.all([
        loadBoards(s.workspaceId),
        loadWorkspace(s.workspaceId),
        listNotifications(s.workspaceId).catch(() => [] as NotificationRow[]),
      ]);
      if (cancelled) return;
      setBoards(b); setDocs(d); setNotifications(n);
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [router]);

  const workspaceId = session?.workspaceId ?? null;
  useSidebarLiveUpdates(workspaceId, ["boards", "board_columns", "board_cards"], async () => {
    if (workspaceId) setBoards(await loadBoards(workspaceId));
  });
  useSidebarLiveUpdates(workspaceId, ["notifications"], async () => {
    if (workspaceId) setNotifications(await listNotifications(workspaceId));
  });

  const canEdit = !!session && session.role !== "viewer";
  const tasks = useMemo(() => (boards && session ? myTasks(boards, session.userId) : []), [boards, session]);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const groups = groupByPriority(open);
  const todos = useMemo(() => (session ? myTodos(docs, session.userId) : []), [docs, session]);
  const unread = notifications.filter((n) => !n.read_at);

  async function changeStage(t: MyTask, columnId: string) {
    if (!boards || !workspaceId || columnId === t.columnId) return;
    const target = t.board.cols.find((c) => c.id === columnId);
    if (!target) return;
    setBusy(t.card.id); setError("");
    // Optimistic: append to the new stage, as a board drop at the end would.
    setBoards(boards.map((b) => b.id !== t.board.id ? b : {
      ...b,
      cols: b.cols.map((c) => ({
        ...c,
        cards: c.id === columnId ? [...c.cards.filter((k) => k.id !== t.card.id), { ...t.card, columnId }] : c.cards.filter((k) => k.id !== t.card.id),
      })),
    }));
    try {
      await moveCard(t.card.id, columnId, [...target.cards.filter((k) => k.id !== t.card.id).map((k) => k.id), t.card.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setBoards(await loadBoards(workspaceId));
    }
  }

  async function changePriority(t: MyTask, priority: string) {
    if (!boards || !workspaceId) return;
    const value = priority || null;
    setBusy(t.card.id); setError("");
    setBoards(boards.map((b) => ({ ...b, cols: b.cols.map((c) => ({ ...c, cards: c.cards.map((k) => k.id === t.card.id ? { ...k, priority: value } : k) })) })));
    try {
      await setCardPriority(t.card.id, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBoards(await loadBoards(workspaceId));
    } finally {
      setBusy(null);
    }
  }

  async function completeTodo(t: Todo) {
    const doc = docs.find((d) => d.id === t.pageId);
    if (!doc) return;
    const blocks = doc.blocks.map((b) => (b.id === t.blockId ? { ...b, checked: true } : b));
    const prev = docs;
    setDocs(docs.map((d) => (d.id === t.pageId ? { ...d, blocks } : d)));
    try {
      await saveBlocks(t.pageId, blocks);
    } catch (e) {
      console.error(e);
      setDocs(prev);
    }
  }

  function openNotification(n: NotificationRow) {
    if (!n.read_at) {
      setNotifications((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)));
      markNotificationRead(n.id).catch(console.error);
    }
    router.push(n.link);
  }

  const row = (t: MyTask) => (
    <li key={t.card.id} className={`${styles.task}${t.done ? ` ${styles.taskDone}` : ""}`}>
      <span className={styles.boardDot} style={{ background: boardColor(t.board, boards ?? []) }} title={t.board.name} />
      <div className={styles.taskMain}>
        <Link href={cardHref(t)} className={styles.taskTitle}>{t.card.title || "Untitled task"}</Link>
        <span className={styles.taskMeta}>
          {t.board.name}
          {t.card.kind ? ` · ${t.card.kind}` : ""}
          {t.subtasks ? ` · ☑ ${t.subtasks.done}/${t.subtasks.total}` : ""}
          {t.card.ownerIds.length > 1 ? ` · with ${t.card.ownerIds.length - 1} other${t.card.ownerIds.length > 2 ? "s" : ""}` : ""}
        </span>
      </div>
      <div className={styles.taskControls}>
        <label className={styles.selectWrap}>
          <span className={styles.stageDot} style={{ background: t.columnColor }} aria-hidden="true" />
          <select
            aria-label={`Stage of ${t.card.title}`}
            className={styles.select}
            value={t.columnId}
            disabled={!canEdit || busy === t.card.id}
            onChange={(e) => void changeStage(t, e.target.value)}
          >
            {t.board.cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <select
          aria-label={`Priority of ${t.card.title}`}
          className={`${styles.select} ${styles.priority} ${styles[`p_${priorityKey(t.card.priority)}`] ?? ""}`}
          value={t.card.priority ?? ""}
          disabled={!canEdit || busy === t.card.id}
          onChange={(e) => void changePriority(t, e.target.value)}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="">None</option>
        </select>
      </div>
    </li>
  );

  return (
    <div className={styles.page}>
      <TopBar crumbs={["My Work"]} workspaceId={session?.workspaceId}>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      <main className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>My Work</p>
          <h1 className={styles.title}>
            {boards === null
              ? "Loading your tasks…"
              : open.length === 0
                ? "Nothing assigned to you right now."
                : `${open.length} open ${open.length === 1 ? "task" : "tasks"}`}
          </h1>
          {boards !== null && open.length > 0 && (
            <p className={styles.sub}>
              {groups.map((g) => `${g.tasks.length} ${g.key === "none" ? "without priority" : g.key}`).join(" · ")}
            </p>
          )}
        </header>

        {error && <p role="alert" className={styles.error}>{error}<button type="button" onClick={() => setError("")}>Dismiss</button></p>}

        <div className={styles.columns}>
          <section className={styles.tasks} aria-label="My tasks">
            {boards === null && <div className={styles.skeleton} />}
            {boards !== null && open.length === 0 && (
              <div className={styles.empty}>
                <p>When someone assigns you a task on a board, it shows up here, sorted by priority.</p>
                <Link href="/board" className={styles.emptyLink}>Go to boards <Icon name="arrowRight" /></Link>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key} className={styles.group}>
                <h2 className={styles.groupHead}>
                  <span className={`${styles.groupDot} ${styles[`p_${g.key}`] ?? ""}`} aria-hidden="true" />
                  {GROUP_LABEL[g.key]}
                  <span className={styles.count}>{g.tasks.length}</span>
                </h2>
                <ul className={styles.list}>{g.tasks.map(row)}</ul>
              </div>
            ))}
            {done.length > 0 && (
              <div className={styles.group}>
                <button type="button" className={styles.doneToggle} onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                  {showDone ? "Hide" : "Show"} done ({done.length})
                </button>
                {showDone && <ul className={styles.list}>{done.map(row)}</ul>}
              </div>
            )}
          </section>

          <aside className={styles.rail}>
            <section className={styles.panel} aria-label="Mentions and assignments">
              <h2 className={styles.panelHead}>
                Mentions &amp; assignments
                {unread.length > 0 && <span className={styles.count}>{unread.length}</span>}
              </h2>
              {unread.length === 0 ? (
                <p className={styles.muted}>You’re all caught up.</p>
              ) : (
                <ul className={styles.plainList}>
                  {unread.slice(0, 8).map((n) => (
                    <li key={n.id}>
                      <button type="button" className={styles.notif} onClick={() => openNotification(n)}>
                        <span className={styles.avatar} style={{ background: n.actor_color ?? "#a59a8c" }}>{n.actor_initials ?? "?"}</span>
                        <span className={styles.notifBody}>
                          <span><strong>{n.actor_name ?? "Someone"}</strong> {notificationVerb(n)}</span>
                          <span className={styles.snippet}>{n.snippet}</span>
                          <span className={styles.time}>{timeAgo(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.panel} aria-label="My open to-dos">
              <h2 className={styles.panelHead}>
                To-dos on my pages
                {todos.length > 0 && <span className={styles.count}>{todos.length}</span>}
              </h2>
              {todos.length === 0 ? (
                <p className={styles.muted}>No open to-dos on pages you own.</p>
              ) : (
                <ul className={styles.plainList}>
                  {todos.slice(0, 12).map((t) => (
                    <li key={t.blockId} className={styles.todo}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={false}
                        aria-label={`Complete “${t.text}”`}
                        className={styles.todoCheck}
                        disabled={!canEdit}
                        onClick={() => void completeTodo(t)}
                      />
                      <span className={styles.todoText}>
                        {t.text}
                        <Link href={`/doc?page=${t.pageId}`} className={styles.todoPage}>{t.pageTitle}</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>

      <Dock />
    </div>
  );
}
