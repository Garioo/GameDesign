"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRiver } from "./RiverShell";
import { setActiveWorkspace } from "@/lib/session";
import { listWorkspaces, type WorkspaceSummary } from "@/lib/workspacesRepo";
import { loadWorkspace, listMembers, saveBlocks, type ProfileInfo } from "@/lib/docsRepo";
import { listRecentCommentMeta, type CommentMetaRow } from "@/lib/commentsRepo";
import { createCard, loadBoards, loadCompletions, moveCard, setCardOwner, type Board, type BoardColumn } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { myTasks, type MyTask } from "@/lib/myWork";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { expandOccurrences, type Occurrence } from "@/lib/calendarRecurrence";
import { listNotifications, markNotificationRead, notificationVerb, type NotificationRow } from "@/lib/notificationsRepo";
import { loadPhases, type Phase } from "@/lib/phaseRepo";
import { listMilestones } from "@/lib/planningRepo";
import type { Milestone } from "@/lib/planning";
import type { StatsPeriod } from "@/lib/teamStats";
import { dayNumber, localToday } from "@/lib/gantt";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { stripInlineHtml } from "@/app/doc/mentions";
import type { DesignDoc } from "@/app/doc/data";
import ActivityFeed from "@/app/components/ActivityFeed";
import TeamScoreboard from "@/app/components/TeamScoreboard";
import styles from "./today.module.css";

/* ---------------------------------------------------------------------------
 * Today (new design): what the old Home, My Work and Digest showed, in one
 * place — your meetings, your tasks, what needs you, what's due soon, then
 * recent pages, team activity and the scoreboard.
 * ------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = (hhmm: string | null) => (hhmm ? +hhmm.slice(0, 2) + +hhmm.slice(3, 5) / 60 : null);
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
function ago(iso?: string): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};

interface PageTodo { doc: DesignDoc; blockId: string; text: string }
interface DueItem { key: string; name: string; of?: string; day: string; color: string; href: string; milestone?: boolean }

const H0 = 8, H1 = 18, HP = 46; // day column: 08:00–18:00, 46px per hour (--hp; less on phones)
const hp = (n: number) => `calc(var(--hp) * ${n})`;

export default function TodayPage() {
  const router = useRouter();
  const { session, setSession, setUnread } = useRiver();
  const ws = session.workspaceId;
  const today = localToday();

  const [boards, setBoards] = useState<Board[] | null>(null);
  const [completions, setCompletions] = useState<Map<string, string>>(new Map());
  const [docs, setDocs] = useState<DesignDoc[] | null>(null);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [comments, setComments] = useState<CommentMetaRow[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<NotificationRow[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  const [showAllTodo, setShowAllTodo] = useState(false);
  const [recentFilter, setRecentFilter] = useState<"all" | "mine" | "comments">("all");
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => new Date());

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 2400);
  };

  const reloadBoards = useCallback(async () => {
    const [b, done] = await Promise.all([loadBoards(ws), loadCompletions(ws)]);
    setBoards(b);
    setCompletions(done);
  }, [ws]);

  // Everything Today shows loads in parallel; one failing part never blanks the rest.
  useEffect(() => {
    let cancelled = false;
    setBoards(null);
    setDocs(null);
    const ok = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then((v) => !cancelled && set(v)).catch((e) => console.error(e));
    ok(reloadBoards(), () => {});
    ok(listCalendarEvents(ws), setEvents);
    ok(listNotifications(ws), (rows) => {
      setNotes(rows);
      setUnread(rows.filter((r) => !r.read_at).length);
    });
    ok(loadPhases(ws).then((s) => s.phases), setPhases);
    ok(listMilestones(ws), setMilestones);
    ok(listMembers(ws), setMembers);
    ok(listWorkspaces(session.userId), setWorkspaces);
    ok(
      loadWorkspace(ws).then(async (pages) => ({ pages, meta: await listRecentCommentMeta(pages.map((p) => p.id)) })),
      ({ pages, meta }) => {
        setDocs(pages);
        setComments(meta);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ws, session.userId, reloadBoards, setUnread]);

  useSidebarLiveUpdates(ws, ["board_cards", "board_columns"], reloadBoards);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowH = now.getHours() + now.getMinutes() / 60;

  /* ---------- your day ---------- */
  const occurrences = useMemo(() => expandOccurrences(events, today, today), [events, today]);
  const timed = occurrences.filter((o) => o.start_time).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const allDay = occurrences.filter((o) => !o.start_time);
  const d0 = Math.min(H0, ...timed.map((o) => Math.floor(hours(o.start_time) ?? H0)));
  const d1 = Math.max(H1, ...timed.map((o) => Math.ceil(hours(o.end_time) ?? (hours(o.start_time) ?? H0) + 1)));
  const eventHref = (o: Occurrence<CalendarEvent>) =>
    `/river/plan?view=calendar&date=${o.occurrence}&event=${o.series.id}`;
  const next = timed.find((o) => (hours(o.start_time) ?? 0) > nowH);

  /* ---------- your tasks ---------- */
  const mine = useMemo(() => (boards ? myTasks(boards, session.userId) : []), [boards, session.userId]);
  const open = mine.filter((t) => !t.done);
  const doing = open.filter((t) => t.columnIndex > 0);
  const upNext = open.filter((t) => t.columnIndex === 0);
  const doneToday = mine.filter((t) => t.done && (completions.get(t.card.id) ?? "").startsWith(today));
  const colorOf = (b: Board) => (boards ? boardColor(b, boards) : b.color);

  const moveTo = async (t: MyTask, target: BoardColumn | undefined, message: string) => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await moveCard(t.card.id, target.id, [...target.cards.map((c) => c.id).filter((id) => id !== t.card.id), t.card.id]);
      await reloadBoards();
      say(message);
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't move the task");
    }
    setBusy(false);
  };
  const finish = (t: MyTask) => moveTo(t, t.board.cols.find((c) => c.isCompleted), `Done: ${t.card.title}`);
  const start = (t: MyTask) => moveTo(t, t.board.cols.find((c, i) => i > t.columnIndex && !c.isCompleted), `Started ${t.card.title}`);

  // One line adds a task: #design picks the board, @anna assigns.
  const addTask = async () => {
    const v = draft.trim();
    if (!v || !boards?.length || busy) return;
    const tag = v.match(/#(\S+)/)?.[1]?.toLowerCase();
    const who = v.match(/@(\S+)/)?.[1]?.toLowerCase();
    const board = (tag && boards.find((b) => b.name.toLowerCase().startsWith(tag))) || boards[0];
    const column = board.cols.find((c) => !c.isCompleted) ?? board.cols[0];
    const person = (who && members.find((m) => m.name.toLowerCase().startsWith(who))) || null;
    const title = v.replace(/[#@]\S+/g, "").replace(/\s+/g, " ").trim() || "Untitled";
    if (!column) return say(`${board.name} has no stages yet`);
    setBusy(true);
    try {
      const card = await createCard(ws, column.id, title);
      await setCardOwner(card.id, person?.id ?? session.userId, true);
      setDraft("");
      await reloadBoards();
      say(`Added to ${board.name}${person ? ` for ${person.name}` : ""}`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't add the task");
    }
    setBusy(false);
  };

  /* ---------- to-dos written in pages ---------- */
  const pageTodos: PageTodo[] = useMemo(() => {
    if (!docs) return [];
    const out: PageTodo[] = [];
    for (const doc of [...docs].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")))
      for (const b of doc.blocks) if (b.type === "todo" && !b.checked && stripInlineHtml(b.text)) out.push({ doc, blockId: b.id, text: stripInlineHtml(b.text) });
    return out.slice(0, 8);
  }, [docs]);
  const tickTodo = async (t: PageTodo) => {
    if (!docs) return;
    const blocks = t.doc.blocks.map((b) => (b.id === t.blockId ? { ...b, checked: true } : b));
    const prev = docs;
    setDocs(docs.map((d) => (d.id === t.doc.id ? { ...d, blocks } : d)));
    try {
      await saveBlocks(t.doc.id, blocks);
      say(`Ticked in ${t.doc.title}`);
    } catch {
      setDocs(prev);
      say("Couldn't save the to-do");
    }
  };

  /* ---------- needs you ---------- */
  const needs = notes.filter((n) => !n.read_at).slice(0, 5);
  const clearNote = async (n: NotificationRow, go: boolean) => {
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread(Math.max(0, notes.filter((x) => !x.read_at).length - 1));
    markNotificationRead(n.id).catch(console.error);
    if (go && n.link) router.push(n.link);
  };

  /* ---------- due soon (next two weeks) ---------- */
  const due: DueItem[] = useMemo(() => {
    const t0 = dayNumber(today), within = (iso: string | null) => !!iso && dayNumber(iso) >= t0 && dayNumber(iso) <= t0 + 14;
    const items: DueItem[] = phases
      .filter((p) => p.active && within(p.effective_end))
      .map((p) => ({
        key: p.id,
        name: p.title,
        of: p.category_id ? p.board_name : undefined,
        day: p.effective_end!,
        color: boards ? boardColor({ id: p.board_id, color: p.color }, boards) : p.color,
        href: `/river/plan?view=board&board=${p.board_id}${p.category_id ? `&category=${p.category_id}` : ""}`,
      }));
    for (const m of milestones) if (!m.completedAt && within(m.dueDate)) items.push({ key: m.id, name: m.name, day: m.dueDate!, color: "var(--due)", href: "/milestones", milestone: true });
    return items.sort((a, b) => a.day.localeCompare(b.day));
  }, [phases, milestones, boards, today]);
  const inDays = (iso: string) => {
    const n = dayNumber(iso) - dayNumber(today);
    return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  };

  /* ---------- recently edited ---------- */
  const recent = useMemo(() => {
    if (!docs) return [];
    const count = new Map<string, number>();
    for (const c of comments) if (c.author !== session.userId) count.set(c.page_id, (count.get(c.page_id) ?? 0) + 1);
    let list = [...docs].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).map((d) => ({ d, comments: count.get(d.id) ?? 0 }));
    if (recentFilter === "mine") list = list.filter((x) => x.d.ownerId === session.userId);
    if (recentFilter === "comments") list = list.filter((x) => x.comments > 0);
    return list.slice(0, 7);
  }, [docs, comments, recentFilter, session.userId]);

  const switchWorkspace = (id: string) => {
    setWsOpen(false);
    if (id === ws) return;
    setActiveWorkspace(id);
    setSession({ ...session, workspaceId: id });
  };
  const current = workspaces.find((w) => w.id === ws);
  const continueDoc = recent[0]?.d;
  const loadingTasks = boards === null;

  const taskRow = (t: MyTask) => {
    const b = t.board;
    const canStart = t.columnIndex === 0 && b.cols.some((c, i) => i > 0 && !c.isCompleted);
    return (
      <div key={t.card.id} className={styles.row} style={{ ["--c" as string]: colorOf(b) }}>
        <button className={styles.check} onClick={() => finish(t)} disabled={busy} aria-label={`Mark ${t.card.title} done`} />
        <div className={styles.rowText}>
          <b>{t.card.title}</b>
          <small>
            <i className={styles.dot} />
            {t.columnIndex > 0 && <span className={styles.stage} style={{ background: t.columnColor }}>{t.columnName}</span>}
            {b.name}
            {t.card.kind ? ` · ${t.card.kind}` : ""}
            {t.subtasks ? ` · ${t.subtasks.done}/${t.subtasks.total} steps` : ""}
          </small>
        </div>
        <div className={styles.acts}>
          {canStart && <button onClick={() => start(t)} disabled={busy}>Start</button>}
          <Link href={`/river/plan?view=board&board=${b.id}&card=${t.card.id}`}>Open</Link>
        </div>
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1>
          <span className={styles.eyebrow}>
            <span className={styles.ws}>
              <button className={styles.wsBtn} onClick={() => setWsOpen((o) => !o)} aria-expanded={wsOpen}>
                {current?.name ?? "Workspace"} ▾
              </button>
              {wsOpen && (
                <span className={styles.wsMenu}>
                  {workspaces.map((w) => (
                    <button key={w.id} onClick={() => switchWorkspace(w.id)}>
                      <i>{w.name.slice(0, 1).toUpperCase()}</i>
                      {w.name}
                      <small>{w.id === ws ? "current" : `${w.memberCount} people`}</small>
                    </button>
                  ))}
                  <Link href="/onboarding" onClick={() => setWsOpen(false)}>
                    <i className={styles.wsNew}>+</i>New workspace
                  </Link>
                </span>
              )}
            </span>
            {" · "}
            {WEEKDAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]} · week {isoWeek(now)}
          </span>
          Today
        </h1>
        <p className={styles.sum}>
          {needs.length > 0 && (
            <>
              <b>{needs.length} thing{needs.length > 1 ? "s" : ""}</b> need you.{" "}
            </>
          )}
          {!loadingTasks && (
            <>
              You have <b>{open.length} open task{open.length === 1 ? "" : "s"}</b>.
            </>
          )}
          {next && (
            <>
              {" "}Next: <b>{next.title}</b> at {next.start_time?.slice(0, 5)}.
            </>
          )}
          {continueDoc && (
            <Link className={styles.cont} href={`/river/pages?page=${continueDoc.id}`}>
              Continue: {continueDoc.title || "Untitled"} →
            </Link>
          )}
        </p>
      </header>

      <div className={styles.grid}>
        {/* ---------- your day ---------- */}
        <section>
          <div className={styles.colh}>
            Your day <em>from the calendar</em>
          </div>
          {allDay.length > 0 && (
            <div className={styles.allDay}>
              {allDay.map((o) => (
                <Link key={o.id} href={eventHref(o)} className={styles.allDayChip}>{o.title}</Link>
              ))}
            </div>
          )}
          <div className={styles.hours} style={{ height: hp(d1 - d0) }}>
            {Array.from({ length: d1 - d0 }, (_, i) => (
              <div key={i} className={styles.hr} style={{ top: hp(i) }}>{clock(d0 + i)}</div>
            ))}
            {timed.map((o) => {
              const a = hours(o.start_time) ?? d0, b = hours(o.end_time) ?? a + 1;
              const tall = (b - a) * HP - 3 >= 40;
              return (
                <Link key={o.id} href={eventHref(o)} className={`${styles.ev} ${tall ? styles.evTall : ""}`} style={{ top: `calc(${hp(a - d0)} + 2px)`, height: `max(22px, calc(${hp(b - a)} - 3px))` }} title={`${o.title} · ${clock(a)}–${clock(b)}`}>
                  {o.title}
                  <small>{clock(a)}{tall ? `–${clock(b)}${o.location ? ` · ${o.location}` : ""}` : ""}</small>
                </Link>
              );
            })}
            {nowH >= d0 && nowH <= d1 && (
              <div className={styles.now} style={{ top: hp(nowH - d0) }}>
                <span>{clock(nowH)}</span>
              </div>
            )}
          </div>
          {timed.length === 0 && allDay.length === 0 && <p className={styles.empty}>No meetings today.</p>}
        </section>

        {/* ---------- your tasks ---------- */}
        <section>
          <div className={styles.colh}>
            Your tasks <em>{loadingTasks ? "" : `${open.length} open`}</em>
          </div>
          <input
            className={styles.add}
            value={draft}
            disabled={busy || !boards?.length}
            placeholder={boards?.length ? "Add a task… #board picks the board, @name assigns" : "Create a board to add tasks"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          {loadingTasks && <p className={styles.empty}>Loading tasks…</p>}
          {doing.length > 0 && (
            <>
              <div className={styles.sub}><span>In progress</span><span>{doing.length}</span></div>
              {doing.map(taskRow)}
            </>
          )}
          {!loadingTasks && (
            <>
              <div className={styles.sub}><span>Up next</span><span>{upNext.length}</span></div>
              {upNext.length === 0 && <p className={styles.empty}>Nothing waiting. Nice.</p>}
              {(showAllTodo ? upNext : upNext.slice(0, 5)).map(taskRow)}
              {upNext.length > 5 && (
                <button className={styles.more} onClick={() => setShowAllTodo((s) => !s)}>
                  {showAllTodo ? "Show less" : `+ ${upNext.length - 5} more to do`}
                </button>
              )}
            </>
          )}
          {pageTodos.length > 0 && (
            <>
              <div className={styles.sub}><span>From pages</span><span>{pageTodos.length}</span></div>
              {pageTodos.map((t) => (
                <div key={t.blockId} className={`${styles.row} ${styles.pageRow}`}>
                  <button className={styles.check} onClick={() => tickTodo(t)} aria-label={`Tick ${t.text}`} />
                  <div className={styles.rowText}>
                    <b>{t.text}</b>
                    <small><i className={styles.dot} />to-do in {t.doc.title || "Untitled"}</small>
                  </div>
                  <div className={styles.acts}>
                    <Link href={`/river/pages?page=${t.doc.id}`}>Open page</Link>
                  </div>
                </div>
              ))}
            </>
          )}
          {doneToday.length > 0 && (
            <>
              <div className={styles.sub}><span>Done today</span><span>{doneToday.length}</span></div>
              {doneToday.map((t) => (
                <div key={t.card.id} className={`${styles.row} ${styles.doneRow}`} style={{ ["--c" as string]: colorOf(t.board) }}>
                  <span className={`${styles.check} ${styles.checked}`}>✓</span>
                  <div className={styles.rowText}><b>{t.card.title}</b><small><i className={styles.dot} />{t.board.name}</small></div>
                </div>
              ))}
            </>
          )}
        </section>

        {/* ---------- needs you + due soon ---------- */}
        <section>
          <div className={styles.colh}>
            Needs you <em>{needs.length ? `${needs.length} open` : ""}</em>
          </div>
          {needs.length === 0 && <div className={styles.card}><div><h4>All clear</h4><p>Nothing needs you right now.</p></div></div>}
          {needs.map((n) => (
            <div key={n.id} className={styles.card}>
              <span className={styles.avatar} style={{ background: n.actor_color ?? "var(--ink3)" }}>{n.actor_initials ?? "?"}</span>
              <div>
                <h4>{n.actor_name ?? "Someone"} {notificationVerb(n)}</h4>
                {n.snippet && <p>“{stripInlineHtml(n.snippet)}”</p>}
                <small>{ago(n.created_at)}</small>
                <div className={styles.cardActs}>
                  <button onClick={() => clearNote(n, true)}>Open</button>
                  <button onClick={() => clearNote(n, false)}>Mark as read</button>
                </div>
              </div>
            </div>
          ))}

          <div className={`${styles.colh} ${styles.gap}`}>
            Due soon <em>next two weeks</em>
          </div>
          {due.length === 0 && <p className={styles.empty}>Nothing is due in the next two weeks.</p>}
          {due.map((x) => (
            <Link key={x.key} href={x.href} className={styles.due} style={{ ["--c" as string]: x.color }}>
              <i className={x.milestone ? styles.diamond : undefined} />
              <div>
                <b>{x.name}</b>
                <span>{x.milestone ? "Milestone" : x.of ?? "Whole board"} · {shortDate(x.day)}</span>
              </div>
              <em className={dayNumber(x.day) - dayNumber(today) <= 3 ? styles.soon : undefined}>{inDays(x.day)}</em>
            </Link>
          ))}
        </section>
      </div>

      {/* ---------- what the old Home showed ---------- */}
      <div className={styles.lower}>
        <section>
          <div className={styles.colh}>
            Recently edited
            <span className={styles.seg}>
              {(["all", "mine", "comments"] as const).map((f) => (
                <button key={f} className={recentFilter === f ? styles.segOn : undefined} onClick={() => setRecentFilter(f)}>
                  {f === "all" ? "All" : f === "mine" ? "Mine" : "Comments"}
                </button>
              ))}
            </span>
          </div>
          {docs === null && <p className={styles.empty}>Loading pages…</p>}
          {docs && recent.length === 0 && <p className={styles.empty}>Nothing here yet.</p>}
          {recent.map(({ d, comments: n }) => (
            <Link key={d.id} href={`/river/pages?page=${d.id}`} className={styles.rec}>
              <b>{d.title || "Untitled"}</b>
              <span>{d.group}{d.ownerName ? ` · ${d.ownerName}` : ""}</span>
              <em>
                {n > 0 && <i>{n} comment{n > 1 ? "s" : ""}</i>}
                {ago(d.updatedAt)}
              </em>
            </Link>
          ))}
        </section>
        <section>
          <div className={styles.colh}>Team activity</div>
          <ActivityFeed workspaceId={ws} limit={8} compact />
        </section>
        <section>
          <div className={styles.colh}>
            Team
            <span className={styles.seg}>
              {(["week", "month", "all"] as const).map((p) => (
                <button key={p} className={period === p ? styles.segOn : undefined} onClick={() => setPeriod(p)}>
                  {p === "week" ? "Week" : p === "month" ? "Month" : "All"}
                </button>
              ))}
            </span>
          </div>
          {boards && <TeamScoreboard boards={boards} completions={completions} people={members} currentUserId={session.userId} period={period} />}
        </section>
      </div>

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </main>
  );
}
