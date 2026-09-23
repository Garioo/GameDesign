"use client";

import { useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ensureSession,
  setActiveWorkspace,
  signOutAndClear,
  storedActiveWorkspace,
  type SessionInfo,
} from "@/lib/session";
import {
  loadWorkspace,
  listMembers,
  saveBlocks,
  type ProfileInfo,
} from "@/lib/docsRepo";
import {
  listWorkspaces,
  createWorkspace,
  createInviteLink,
  type WorkspaceSummary,
} from "@/lib/workspacesRepo";
import { listRecentCommentMeta, type CommentMetaRow } from "@/lib/commentsRepo";
import { loadBoards, loadCompletions, type Board } from "@/lib/boardRepo";
import type { StatsPeriod } from "@/lib/teamStats";
import { myTasks } from "@/lib/myWork";
import type { DesignDoc } from "@/app/doc/data";
import { stripInlineHtml } from "@/app/doc/mentions";
import TopBar from "@/app/components/TopBar";
import { useSitePresence } from "@/lib/useSitePresence";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import ActivityFeed from "@/app/components/ActivityFeed";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import TeamScoreboard from "@/app/components/TeamScoreboard";
import UpcomingMilestones from "@/app/components/UpcomingMilestones";
import styles from "./home.module.css";

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const ArrowRight = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Check = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);
const CheckSquare = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
const AtSign = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);
const History = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);
const Bubble = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
  </svg>
);

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* ---------------------------------------------------------------------------
 * Dashboard snapshot — a lightweight projection of the workspace cached in
 * localStorage per workspace, so a revisit paints instantly while the real
 * fetch runs in the background. Blocks (which can carry data-URL images) are
 * never cached; to-dos keep only their flattened text.
 * ------------------------------------------------------------------------- */
interface RecentPage {
  id: string;
  title: string;
  group: string;
  updatedAt?: string;
}
interface ForYouPage extends RecentPage {
  commentCount: number; // teammates' comments in the activity window
  lastCommentAt: string;
}
interface TodoItem {
  pageId: string;
  pageTitle: string;
  blockId: string;
  text: string;
}
interface MeDisplay {
  name: string;
  initials: string;
  color: string;
}
interface Snapshot {
  v: 3;
  me: MeDisplay | null;
  docCount: number;
  recent: RecentPage[];
  forYou: ForYouPage[];
  todos: TodoItem[];
  members: ProfileInfo[];
  workspaces: WorkspaceSummary[];
}

const SNAPSHOT_PREFIX = "gd-home-snapshot:";
const snapshotKey = (workspaceId: string) => `${SNAPSHOT_PREFIX}${workspaceId}`;

function readSnapshot(workspaceId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(workspaceId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    return snap?.v === 3 ? snap : null;
  } catch {
    return null;
  }
}
function writeSnapshot(workspaceId: string, snap: Snapshot): void {
  try {
    localStorage.setItem(snapshotKey(workspaceId), JSON.stringify(snap));
  } catch {
    /* storage unavailable or full — next visit just loads cold */
  }
}
function clearSnapshots(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(SNAPSHOT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** "For you" looks back this far for teammates' comments. */
const ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function buildSnapshot(
  docs: DesignDoc[],
  members: ProfileInfo[],
  workspaces: WorkspaceSummary[],
  me: MeDisplay | null,
  comments: CommentMetaRow[],
  myId: string,
): Snapshot {
  const sorted = [...docs].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  const toRecent = (d: DesignDoc): RecentPage => ({
    id: d.id,
    title: d.title,
    group: d.group,
    updatedAt: d.updatedAt,
  });
  const recent = sorted.slice(0, 12).map(toRecent);


  // Pages with recent comments from teammates (not your own echoes).
  const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
  const activity = new Map<string, { count: number; latest: string }>();
  for (const c of comments) {
    if (c.author === myId) continue;
    if (new Date(c.created_at).getTime() < cutoff) continue;
    const a = activity.get(c.page_id);
    if (a) {
      a.count += 1;
      if (c.created_at > a.latest) a.latest = c.created_at;
    } else {
      activity.set(c.page_id, { count: 1, latest: c.created_at });
    }
  }
  const forYou: ForYouPage[] = [];
  for (const d of docs) {
    const a = activity.get(d.id);
    if (a) forYou.push({ ...toRecent(d), commentCount: a.count, lastCommentAt: a.latest });
  }
  forYou.sort((a, b) => b.lastCommentAt.localeCompare(a.lastCommentAt));

  const todos: TodoItem[] = [];
  for (const d of sorted) {
    for (const b of d.blocks) {
      if (b.type !== "todo" || b.checked) continue;
      const text = stripInlineHtml(b.text);
      if (!text) continue;
      todos.push({ pageId: d.id, pageTitle: d.title, blockId: b.id, text });
    }
  }
  return {
    v: 3,
    me,
    docCount: docs.length,
    recent,
    forYou: forYou.slice(0, 12),
    todos: todos.slice(0, 30),
    members,
    workspaces,
  };
}

const TODOS_SHOWN = 6;
const RECENT_SHOWN = 6;

/** "Good to know" tips dismissal — sticks across sessions and workspaces. */
const TIPS_DISMISSED_KEY = "gd-home-tips-dismissed";

export default function HomeDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Full docs from the live fetch (needed to persist to-do toggles); null
  // while only the cached snapshot is on screen.
  const [docs, setDocs] = useState<DesignDoc[] | null>(null);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [comments, setComments] = useState<CommentMetaRow[]>([]);
  // Open tasks assigned to me (null until loaded; boards may be unavailable).
  const [myOpenTasks, setMyOpenTasks] = useState<number | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [completions, setCompletions] = useState<Map<string, string>>(new Map());
  const [scorePeriod, setScorePeriod] = useState<StatsPeriod>("week");
  const [cached, setCached] = useState<Snapshot | null>(null);
  const [recentFilter, setRecentFilter] = useState<"all" | "foryou">("all");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Starts true and flips in the mount effect when undismissed, so the
  // server-rendered markup never disagrees with the first client paint.
  const [tipsHidden, setTipsHidden] = useState(true);

  const me: MeDisplay | null = session
    ? { name: session.name, initials: session.initials, color: session.color }
    : (cached?.me ?? null);

  const snap: Snapshot | null = docs
    ? buildSnapshot(docs, members, workspaces, me, comments, session?.userId ?? "")
    : cached;
  const stale = !docs;

  useEffect(() => {
    let cancelled = false;

    try {
      if (localStorage.getItem(TIPS_DISMISSED_KEY) !== "1") setTipsHidden(false);
    } catch {
      /* storage unavailable — leave the tips hidden rather than un-dismissable */
    }

    // Paint the last-seen dashboard immediately while auth + data resolve.
    const hint = storedActiveWorkspace();
    if (hint) {
      const fromCache = readSnapshot(hint);
      if (fromCache) setCached(fromCache);
    }

    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) {
        router.replace("/login");
        return;
      }
      // No workspace left (never onboarded, or left/removed from the last
      // one) — onboarding is where a new workspace gets created.
      if (!s.onboarded || !s.workspaceId) {
        router.replace("/onboarding");
        return;
      }
      setSession(s);
      Promise.all([loadBoards(s.workspaceId), loadCompletions(s.workspaceId)])
        .then(([b, done]) => {
          if (cancelled) return;
          setBoards(b);
          setCompletions(done);
          setMyOpenTasks(myTasks(b, s.userId).filter((t) => !t.done).length);
        })
        .catch(console.error);
      // The hint can point at a workspace the user has since left — drop the
      // cached paint rather than flashing someone else's data.
      if (hint && hint !== s.workspaceId) setCached(readSnapshot(s.workspaceId));
      const [pages, team, spaces] = await Promise.all([
        loadWorkspace(s.workspaceId),
        listMembers(s.workspaceId),
        listWorkspaces(s.userId),
      ]);
      if (cancelled) return;
      const meta = await listRecentCommentMeta(pages.map((p) => p.id));
      if (cancelled) return;
      setComments(meta);
      setDocs(pages);
      setMembers(team);
      setWorkspaces(spaces);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Keep the cached snapshot in step with live data (incl. to-do toggles).
  useEffect(() => {
    if (!session || !docs) return;
    writeSnapshot(
      session.workspaceId,
      buildSnapshot(
        docs,
        members,
        workspaces,
        { name: session.name, initials: session.initials, color: session.color },
        comments,
        session.userId,
      ),
    );
  }, [session, docs, members, workspaces, comments]);

  // Who's online anywhere in the workspace (and where), shared with every page.
  const online = useSitePresence(session, { path: "/home", label: "Home" });
  const onlineIds = new Set(online.map((u) => u.key));

  const handleSignOut = async () => {
    clearSnapshots(); // don't leave dashboard data behind on a shared machine
    await signOutAndClear();
    router.replace("/login");
  };

  // A task finished or reopened anywhere (another tab, a teammate) updates the scoreboard.
  useSidebarLiveUpdates(session?.workspaceId ?? null, ["board_cards", "board_columns"], async () => {
    if (!session?.workspaceId) return;
    const [b, done] = await Promise.all([loadBoards(session.workspaceId), loadCompletions(session.workspaceId)]);
    setBoards(b);
    setCompletions(done);
    setMyOpenTasks(myTasks(b, session.userId).filter((t) => !t.done).length);
  });

  /** Make a workspace active and reload its docs + members. */
  const switchWorkspace = async (id: string) => {
    if (!session || id === session.workspaceId) return;
    setActiveWorkspace(id);
    setSession({ ...session, workspaceId: id });
    setDocs(null);
    setCached(readSnapshot(id));
    setRecentFilter("all");
    setBoards(null);
    setMyOpenTasks(null);
    try {
      const [pages, team, b, done] = await Promise.all([loadWorkspace(id), listMembers(id), loadBoards(id), loadCompletions(id)]);
      setComments(await listRecentCommentMeta(pages.map((p) => p.id)));
      setDocs(pages);
      setMembers(team);
      setBoards(b);
      setCompletions(done);
      setMyOpenTasks(myTasks(b, session.userId).filter((t) => !t.done).length);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newName.trim();
    if (!session || !name || creating) return;
    setCreating(true);
    try {
      const id = await createWorkspace(session.userId, name);
      setNewName("");
      setWorkspaces(await listWorkspaces(session.userId));
      await switchWorkspace(id);
    } catch (e) {
      console.error(e);
    }
    setCreating(false);
  };

  const handleInvite = async (id: string) => {
    if (!session) return;
    try {
      const link = await createInviteLink(id, session.userId);
      try {
        await navigator.clipboard.writeText(link);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      } catch {
        // Clipboard blocked (permissions / insecure context) — show the link.
        window.prompt("Copy this invite link:", link);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const dismissTips = () => {
    setTipsHidden(true);
    try {
      localStorage.setItem(TIPS_DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable — hides for this visit only */
    }
  };

  /** Check a to-do off right from the dashboard (needs the live blocks). */
  const completeTodo = async (t: TodoItem) => {
    if (!docs) return; // still painting from cache — the page will be live in a beat
    const doc = docs.find((d) => d.id === t.pageId);
    if (!doc) return;
    const blocks = doc.blocks.map((b) =>
      b.id === t.blockId ? { ...b, checked: true } : b,
    );
    const prev = docs;
    setDocs(docs.map((d) => (d.id === t.pageId ? { ...d, blocks } : d)));
    try {
      await saveBlocks(t.pageId, blocks);
    } catch (e) {
      console.error(e);
      setDocs(prev);
    }
  };

  const recentShown: (RecentPage | ForYouPage)[] = (
    recentFilter === "foryou" ? (snap?.forYou ?? []) : (snap?.recent ?? [])
  ).slice(0, RECENT_SHOWN);

  // "Continue" jumps to the most recently edited page.
  const continuePage = snap?.recent[0];

  return (
    <div className={styles.page}>
      <TopBar crumbs={["Home"]} workspaceId={session?.workspaceId} online={online} selfKey={session?.userId}>
        {me && (
          <span className={styles.me} style={{ background: me.color }} title={me.name}>
            {me.initials}
          </span>
        )}
        <button type="button" className="share-btn" onClick={handleSignOut}>
          Sign out
        </button>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      {!snap ? (
        <main className={styles.shell} aria-busy="true">
          <header className={styles.hero}>
            <span className={`${styles.skeleton} ${styles.skelEyebrow}`} />
            <span className={`${styles.skeleton} ${styles.skelTitle}`} />
            <span className={`${styles.skeleton} ${styles.skelSub}`} />
            <div className={styles.stats}>
              <span className={`${styles.skeleton} ${styles.skelStat}`} />
              <span className={`${styles.skeleton} ${styles.skelStat}`} />
              <span className={`${styles.skeleton} ${styles.skelStat}`} />
            </div>
          </header>
          <div className={styles.columns}>
            <span className={`${styles.skeleton} ${styles.skelList}`} />
            <span className={`${styles.skeleton} ${styles.skelRail}`} />
          </div>
        </main>
      ) : (
        <main className={styles.shell} data-stale={stale || undefined}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>
              <span className={styles.spark} aria-hidden="true" />
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className={styles.greeting}>
              {timeOfDayGreeting()}
              {me ? (
                <>
                  , <em className={styles.greetName}>{me.name}</em>
                </>
              ) : null}
              .
            </h1>
            <p className={styles.greetingSub}>
              {continuePage && (
                <Link
                  href={`/doc?page=${continuePage.id}`}
                  className={styles.continuePill}
                >
                  Continue <strong>{continuePage.title}</strong>
                  <ArrowRight className={styles.continueArrow} />
                </Link>
              )}
            </p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statNum}>{snap.docCount}</span>
                <span className={styles.statLabel}>
                  {snap.docCount === 1 ? "page" : "pages"}
                </span>
              </div>
              <span className={styles.statRule} aria-hidden="true" />
              <div className={styles.stat}>
                <span className={styles.statNum}>{snap.members.length}</span>
                <span className={styles.statLabel}>
                  {snap.members.length === 1 ? "teammate" : "teammates"}
                </span>
              </div>
              <span className={styles.statRule} aria-hidden="true" />
              <div className={styles.stat}>
                <span className={styles.statNum}>{snap.todos.length}</span>
                <span className={styles.statLabel}>
                  {snap.todos.length === 1 ? "open to-do" : "open to-dos"}
                </span>
              </div>
              {myOpenTasks !== null && (
                <>
                  <span className={styles.statRule} aria-hidden="true" />
                  <Link href="/work" className={`${styles.stat} ${styles.statLink}`}>
                    <span className={styles.statNum}>{myOpenTasks}</span>
                    <span className={styles.statLabel}>
                      {myOpenTasks === 1 ? "task for me" : "tasks for me"}
                    </span>
                  </Link>
                </>
              )}
            </div>
          </header>

          <div className={styles.columns}>
            <div className={styles.main}>
              {/* Pages on the left, the team on the right; one stack on narrower screens. */}
              <div className={styles.mainCol}>
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Recently edited</h2>
                  <div className={styles.sectionTools}>
                    <div className={styles.filter} role="group" aria-label="Filter pages">
                      <button
                        type="button"
                        className={`${styles.filterBtn} ${
                          recentFilter === "all" ? styles.filterOn : ""
                        }`}
                        onClick={() => setRecentFilter("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`${styles.filterBtn} ${
                          recentFilter === "foryou" ? styles.filterOn : ""
                        }`}
                        onClick={() => setRecentFilter("foryou")}
                      >
                        For you
                        {snap.forYou.length > 0 && (
                          <span className={styles.filterBadge}>
                            {snap.forYou.length}
                          </span>
                        )}
                      </button>
                    </div>
                    <Link href="/doc" className={styles.sectionLink}>
                      All pages <Icon name="arrowRight" />
                    </Link>
                  </div>
                </div>
                <div className={styles.recentList}>
                  {recentShown.length === 0 ? (
                    <p className={styles.empty}>
                      {recentFilter === "foryou" ? (
                        <>No new comments.</>
                      ) : (
                        <>
                          No pages yet. <Link href="/doc">Create a page</Link>{" "}
                          to get started.
                        </>
                      )}
                    </p>
                  ) : (
                    recentShown.map((d) => (
                      <Link
                        key={d.id}
                        href={`/doc?page=${d.id}`}
                        className={styles.recentRow}
                      >
                        <span className={styles.recentMain}>
                          <span className={styles.recentTitle}>{d.title}</span>
                          <span className={styles.recentGroup}>{d.group}</span>
                        </span>
                        {"commentCount" in d ? (
                          <span
                            className={styles.commentChip}
                            title={`${d.commentCount} ${
                              d.commentCount === 1 ? "comment" : "comments"
                            } from the team`}
                          >
                            <Bubble className={styles.commentBubble} />
                            {d.commentCount}
                          </span>
                        ) : null}
                        <span className={styles.recentWhen}>
                          {timeAgo("lastCommentAt" in d ? d.lastCommentAt : d.updatedAt)}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>
                    Open to-dos
                    {snap.todos.length > 0 && (
                      <span className={styles.todoCount}>{snap.todos.length}</span>
                    )}
                  </h2>
                </div>
                <div className={styles.todoList}>
                  {snap.todos.length === 0 ? (
                    <p className={styles.empty}>
                      No open to-dos. To-dos you add on pages appear here.
                    </p>
                  ) : (
                    snap.todos.slice(0, TODOS_SHOWN).map((t) => (
                      <div key={t.blockId} className={styles.todoRow}>
                        <button
                          type="button"
                          className={styles.todoCheck}
                          onClick={() => completeTodo(t)}
                          disabled={stale}
                          aria-label={`Mark “${t.text}” done`}
                          title="Mark done"
                        >
                          <Check className={styles.todoTick} />
                        </button>
                        <span className={styles.todoText}>{t.text}</span>
                        <Link
                          href={`/doc?page=${t.pageId}`}
                          className={styles.todoPage}
                        >
                          {t.pageTitle}
                        </Link>
                      </div>
                    ))
                  )}
                  {snap.todos.length > TODOS_SHOWN && (
                    <p className={styles.todoMore}>
                      +{snap.todos.length - TODOS_SHOWN} more inside the docs
                    </p>
                  )}
                </div>
              </section>

              </div>

              <div className={styles.mainCol}>
              {session?.workspaceId && (
                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Upcoming milestones</h2>
                    <Link href="/milestones" className={styles.sectionLink}>All milestones</Link>
                  </div>
                  <UpcomingMilestones workspaceId={session.workspaceId} />
                </section>
              )}

              {session && boards && members.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Team scoreboard</h2>
                    <div className={styles.filter} role="group" aria-label="Scoreboard period">
                      {(["week", "month", "all"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={scorePeriod === p}
                          className={`${styles.filterBtn} ${scorePeriod === p ? styles.filterOn : ""}`}
                          onClick={() => setScorePeriod(p)}
                        >
                          {p === "week" ? "This week" : p === "month" ? "This month" : "All time"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TeamScoreboard
                    boards={boards}
                    completions={completions}
                    people={members}
                    currentUserId={session.userId}
                    period={scorePeriod}
                  />
                </section>
              )}

              {session?.workspaceId && (
                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Team activity</h2>
                    <Link href="/digest" className={styles.sectionLink}>Weekly digest</Link>
                  </div>
                  <div className={styles.activityCard}>
                    <ActivityFeed
                      workspaceId={session.workspaceId}
                      limit={15}
                      emptyText="No activity yet. Changes to pages, tasks, comments and canvases appear here."
                    />
                  </div>
                </section>
              )}
              </div>
            </div>

            <aside className={styles.rail}>
              <section className={styles.railCard}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Workspaces</h2>
                  <span className={styles.railCount}>{snap.workspaces.length}</span>
                </div>
                <div className={styles.wsList}>
                  {snap.workspaces.map((w) => {
                    const active = w.id === session?.workspaceId;
                    return (
                      <div
                        key={w.id}
                        className={`${styles.wsRow} ${active ? styles.wsActive : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.wsMain}
                          onClick={() => switchWorkspace(w.id)}
                        >
                          <span className={styles.wsNameLine}>
                            <span className={styles.wsName}>{w.name}</span>
                            {active && (
                              <span className={styles.wsCurrent}>Current</span>
                            )}
                          </span>
                          <span className={styles.wsMeta}>
                            {w.memberCount}{" "}
                            {w.memberCount === 1 ? "member" : "members"}
                            {w.genre ? ` · ${w.genre}` : ""}
                          </span>
                        </button>
                        {/* only the owner grants access (invites_insert RLS) */}
                        {w.role === "owner" && (
                          <button
                            type="button"
                            className={styles.wsInvite}
                            onClick={() => handleInvite(w.id)}
                            title="Copy an invite link (valid 14 days)"
                          >
                            {copiedId === w.id ? "Copied!" : "Invite"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <form
                  className={styles.wsNew}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateWorkspace();
                  }}
                >
                  <input
                    className={styles.wsInput}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New workspace…"
                    maxLength={60}
                  />
                  <button
                    type="submit"
                    className={styles.wsCreate}
                    disabled={creating || !newName.trim()}
                  >
                    {creating ? "…" : "Create"}
                  </button>
                </form>
              </section>

              {snap.members.length > 0 && (
                <section className={styles.teamCard}>
                  <div className={styles.teamAvatars}>
                    {snap.members.slice(0, 8).map((m) => (
                      <span
                        key={m.id}
                        className={`${styles.teamAvatar} ${
                          onlineIds.has(m.id) ? styles.online : ""
                        }`}
                        style={{ background: m.color }}
                        title={onlineIds.has(m.id) ? `${m.name} — online` : m.name}
                      >
                        {m.initials}
                      </span>
                    ))}
                  </div>
                  <p className={styles.teamNote}>
                    {onlineIds.size > 1
                      ? `${onlineIds.size} online now.`
                      : snap.members.length === 1
                        ? "You’re the only member so far."
                        : `${snap.members.length} members.`}
                  </p>
                </section>
              )}

              {!tipsHidden && (
              <section className={styles.tipsCard}>
                <div className={styles.tipsHead}>
                  <h2 className={styles.tipsTitle}>Tips</h2>
                  <button
                    type="button"
                    className={styles.tipsClose}
                    onClick={dismissTips}
                    aria-label="Dismiss tips"
                    title="Dismiss"
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>
                    <CheckSquare />
                  </span>
                  <div>
                    <h3 className={styles.tipName}>To-dos</h3>
                    <p className={styles.tipBody}>
                      Open to-dos from your pages are listed here, so you can
                      check them off without opening each page.
                    </p>
                  </div>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>
                    <AtSign />
                  </span>
                  <div>
                    <h3 className={styles.tipName}>Mentions</h3>
                    <p className={styles.tipBody}>
                      Type @ on a page to link another page, a canvas or a
                      teammate. Links update when things are renamed.
                    </p>
                  </div>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>
                    <History />
                  </span>
                  <div>
                    <h3 className={styles.tipName}>Continue</h3>
                    <p className={styles.tipBody}>
                      The Continue button at the top opens the page you edited last.
                    </p>
                  </div>
                </div>
              </section>
              )}
            </aside>
          </div>
        </main>
      )}

      <Dock />
    </div>
  );
}
