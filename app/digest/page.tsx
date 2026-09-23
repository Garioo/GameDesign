"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import { listActivity } from "@/lib/activityRepo";
import { listWorkspaceEdits } from "@/lib/pageEditsRepo";
import { loadBoards } from "@/lib/boardRepo";
import { buildDigest, dateParam, weekRange, weekStart, type Digest, type DigestActivity, type DigestEdit } from "@/lib/digest";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { useSitePresence } from "@/lib/useSitePresence";
import { useShortcuts } from "@/lib/shortcuts";
import TopBar from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import styles from "./digest.module.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNKNOWN: ProfileInfo = { id: "", name: "A former member", initials: "?", color: "#a59a8c" };

/** All activity rows in [from, to), newest first, paged through the feed. */
async function activityBetween(workspaceId: string, from: Date, to: Date): Promise<DigestActivity[]> {
  const out: DigestActivity[] = [];
  let before = to.toISOString();
  for (let i = 0; i < 10; i++) {
    const page = await listActivity(workspaceId, { limit: 200, before, after: from.toISOString() });
    for (const a of page) {
      out.push({
        action: a.action,
        actorId: a.actor?.id ?? null,
        pageId: a.pageId,
        cardId: a.cardId,
        cardTitle: a.cardTitle,
        pageTitle: a.pageTitle,
        target: a.target,
        meta: a.meta,
        createdAt: a.createdAt,
      });
    }
    if (page.length < 200) break;
    before = page[page.length - 1].createdAt;
  }
  return out;
}

function weekLabel(start: Date, end: Date): string {
  const last = new Date(end.getTime() - 86400000);
  const sameMonth = start.getMonth() === last.getMonth();
  const a = start.toLocaleDateString(undefined, { day: "numeric", month: sameMonth ? undefined : "long" });
  const b = last.toLocaleDateString(undefined, { day: "numeric", month: "long", year: last.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  return `${a} – ${b}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Counts up to `value` when it appears or changes (skipped for reduced motion). */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

export default function DigestPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const online = useSitePresence(session, { path: "/digest", label: "Weekly digest" });
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [boardNames, setBoardNames] = useState<Map<string, string>>(new Map());
  const [weekParam, setWeekParam] = useState<string | null>(null);
  const [data, setData] = useState<{ edits: DigestEdit[]; activity: DigestActivity[]; key: string } | null>(null);
  const [error, setError] = useState("");

  const range = useMemo(() => weekRange(weekParam), [weekParam]);
  const key = dateParam(range.start);
  const thisWeek = dateParam(weekStart(new Date()));
  const isThisWeek = key === thisWeek;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) { router.replace("/login"); return; }
      if (!s.onboarded || !s.workspaceId) { router.replace("/onboarding"); return; }
      setSession(s);
      setWeekParam(new URLSearchParams(window.location.search).get("week"));
      const [m, boards] = await Promise.all([
        listMembers(s.workspaceId).catch(() => [] as ProfileInfo[]),
        loadBoards(s.workspaceId).catch(() => []),
      ]);
      if (cancelled) return;
      setMembers(m);
      setBoardNames(new Map(boards.map((b) => [b.id, b.name])));
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [router]);

  const workspaceId = session?.workspaceId ?? null;
  const load = useCallback(async () => {
    if (!workspaceId) return;
    const [edits, activity] = await Promise.all([
      listWorkspaceEdits(workspaceId, range.start, range.end),
      activityBetween(workspaceId, range.start, range.end),
    ]);
    setData({ edits, activity, key });
    setError("");
  }, [workspaceId, range, key]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);
  // Only the current week is still changing. Watching page_edits would refetch
  // on every save while someone types; activity (plus refocusing the tab) is enough.
  useSidebarLiveUpdates(isThisWeek ? workspaceId : null, ["activity"], load);

  const goWeek = (delta: number) => {
    const d = new Date(range.start);
    d.setDate(d.getDate() + delta * 7);
    const next = dateParam(d);
    const param = next === thisWeek ? null : next;
    setWeekParam(param);
    const url = new URL(window.location.href);
    if (param) url.searchParams.set("week", param);
    else url.searchParams.delete("week");
    window.history.replaceState(window.history.state, "", url);
  };

  const weeksBack = Math.round((weekStart(new Date()).getTime() - range.start.getTime()) / (7 * 86400000));
  useShortcuts([
    { id: "digest-prev", keys: "[", label: "Previous week", group: "Page", run: () => goWeek(-1) },
    { id: "digest-next", keys: "]", label: "Next week", group: "Page", enabled: !isThisWeek, run: () => goWeek(1) },
    { id: "digest-now", keys: "t", label: "This week", group: "Page", enabled: !isThisWeek, run: () => goWeek(weeksBack) },
  ]);

  const digest: Digest | null = useMemo(
    () => (data && data.key === key ? buildDigest(data.edits, data.activity, range) : null),
    [data, key, range],
  );
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const who = (id: string | null) => (id && byId.get(id)) || UNKNOWN;
  const maxDay = digest ? Math.max(1, ...digest.perDay) : 1;
  const todayIdx = isThisWeek ? (new Date().getDay() + 6) % 7 : -1;
  const empty = digest && digest.totals.edits === 0 && digest.moves.length === 0 && digest.newTasks.length === 0 && digest.newPages.length === 0 && digest.totals.comments === 0;

  const t = digest?.totals;
  const summary = t
    ? [
        t.editors ? `${plural(t.editors, "person", "people")} edited ${plural(t.pagesEdited, "page")}` : null,
        t.tasksMoved ? `${plural(t.tasksMoved, "task")} moved` : null,
        t.tasksDone ? `${t.tasksDone} ${t.tasksDone === 1 ? "was" : "were"} finished` : null,
        t.tasksCreated ? plural(t.tasksCreated, "new task") : null,
        !t.editors && t.pagesCreated ? plural(t.pagesCreated, "new page") : null,
        t.comments ? plural(t.comments, "comment") : null,
      ].filter(Boolean).join(", ")
    : "";

  const Avatar = ({ p, size }: { p: ProfileInfo; size?: "sm" }) => (
    <span className={size === "sm" ? `${styles.avatar} ${styles.avatarSm}` : styles.avatar} style={{ background: p.color }} title={p.name}>
      {p.initials}
    </span>
  );

  return (
    <div className={styles.page}>
      <TopBar crumbs={["Weekly digest"]} workspaceId={session?.workspaceId} online={online} selfKey={session?.userId}>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.weekNav}>
            <button type="button" className={styles.navBtn} onClick={() => goWeek(-1)} aria-label="Previous week">‹</button>
            {!isThisWeek && (
              <button type="button" className={styles.navToday} onClick={() => goWeek(weeksBack)}>
                This week
              </button>
            )}
            <button type="button" className={styles.navBtn} onClick={() => goWeek(1)} disabled={isThisWeek} aria-label="Next week">›</button>
          </div>
          <p className={styles.eyebrow}>{isThisWeek ? "Weekly digest · so far this week" : "Weekly digest"}</p>
          <h1 className={styles.title} key={key}>{weekLabel(range.start, range.end)}</h1>
          <p className={styles.sub}>
            {!digest ? "Gathering the week…" : empty ? "A quiet week — nothing was edited, moved or discussed." : `${summary.charAt(0).toUpperCase()}${summary.slice(1)}.`}
          </p>
        </header>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        {!digest && !error && <div className={styles.skeleton} />}

        {digest && t && (
          <div className={styles.body} key={key}>
            <section className={styles.tiles} aria-label="This week in numbers">
              {[
                { label: "Pages edited", value: t.pagesEdited, hint: t.pagesCreated ? `${t.pagesCreated} new` : undefined },
                { label: "Words written", value: t.wordsAdded, hint: t.wordsRemoved ? `${t.wordsRemoved.toLocaleString()} cut` : undefined },
                { label: "Tasks finished", value: t.tasksDone, accent: true },
                { label: "Tasks moved", value: t.tasksMoved },
                { label: "New tasks", value: t.tasksCreated },
                { label: "Comments", value: t.comments },
              ].map((tile, i) => (
                <div key={tile.label} className={tile.accent ? `${styles.tile} ${styles.tileAccent}` : styles.tile} style={{ "--i": i } as React.CSSProperties}>
                  <span className={styles.tileValue}><CountUp value={tile.value} /></span>
                  <span className={styles.tileLabel}>{tile.label}</span>
                  {tile.hint && <span className={styles.tileHint}>{tile.hint}</span>}
                </div>
              ))}
            </section>

            <section className={styles.card} aria-label="Activity by day">
              <h2 className={styles.cardHead}>Activity by day</h2>
              <div className={styles.bars}>
                {digest.perDay.map((n, i) => (
                  <div key={DAYS[i]} className={i === todayIdx ? `${styles.barCol} ${styles.barToday}` : styles.barCol} title={`${DAYS[i]}: ${plural(n, "change")}`}>
                    <span className={styles.barCount}>{n || ""}</span>
                    <span className={styles.barTrack}>
                      <span className={styles.bar} style={{ "--h": `${(n / maxDay) * 100}%`, "--i": i } as React.CSSProperties} />
                    </span>
                    <span className={styles.barDay}>{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </section>

            {digest.people.length > 0 && (
              <section aria-label="Who worked on what">
                <h2 className={styles.sectionHead}>Who worked on what</h2>
                <div className={styles.people}>
                  {digest.people.map((p, i) => {
                    const m = who(p.id);
                    const bits = [
                      p.edits ? plural(p.pages.length, "page") + " edited" : null,
                      p.wordsAdded ? `${p.wordsAdded.toLocaleString()} words` : null,
                      p.tasksDone ? `${p.tasksDone} finished` : null,
                      p.tasksMoved - p.tasksDone > 0 ? `${p.tasksMoved - p.tasksDone} moved` : null,
                      p.tasksCreated ? `${p.tasksCreated} new ${p.tasksCreated === 1 ? "task" : "tasks"}` : null,
                      p.comments ? plural(p.comments, "comment") : null,
                    ].filter(Boolean);
                    return (
                      <article key={p.id} className={styles.person} style={{ "--c": m.color, "--i": i } as React.CSSProperties}>
                        <header className={styles.personHead}>
                          <Avatar p={m} />
                          <Link href={`/work?person=${encodeURIComponent(p.id)}`} className={styles.personName}>{m.name}</Link>
                        </header>
                        <p className={styles.personStats}>{bits.join(" · ") || "Around, but quiet"}</p>
                        {p.pages.length > 0 && (
                          <ul className={styles.personPages}>
                            {p.pages.slice(0, 4).map((pg) => (
                              <li key={pg.pageId}>
                                <Link href={`/doc?page=${pg.pageId}`}>{pg.title}</Link>
                                <span className={styles.muted}>{plural(pg.edits, "edit")}</span>
                              </li>
                            ))}
                            {p.pages.length > 4 && <li className={styles.muted}>+ {p.pages.length - 4} more</li>}
                          </ul>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className={styles.columns}>
              {digest.pages.length > 0 && (
                <section className={styles.card} aria-label="What changed">
                  <h2 className={styles.cardHead}>What changed <span className={styles.count}>{digest.pages.length}</span></h2>
                  <ul className={styles.rows}>
                    {digest.pages.slice(0, 15).map((pg) => (
                      <li key={pg.pageId} className={styles.row}>
                        <div className={styles.rowMain}>
                          {pg.trashed ? (
                            <span className={`${styles.rowTitle} ${styles.gone}`}>{pg.title}</span>
                          ) : (
                            <Link href={`/doc?page=${pg.pageId}`} className={styles.rowTitle}>{pg.title}</Link>
                          )}
                          <span className={styles.rowMeta}>
                            {pg.wordsAdded > 0 && <span className={styles.plus}>+{pg.wordsAdded.toLocaleString()}</span>}
                            {pg.wordsRemoved > 0 && <span className={styles.minus}>−{pg.wordsRemoved.toLocaleString()}</span>}
                            {" words"}
                            {pg.blocksAdded > 0 && ` · ${plural(pg.blocksAdded, "block")} added`}
                            {pg.blocksRemoved > 0 && ` · ${pg.blocksRemoved} removed`}
                          </span>
                        </div>
                        <span className={styles.stack}>
                          {pg.authorIds.slice(0, 4).map((id) => <Avatar key={id} p={who(id)} size="sm" />)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {digest.pages.length > 15 && <p className={styles.more}>and {digest.pages.length - 15} more pages</p>}
                </section>
              )}

              {digest.moves.length > 0 && (
                <section className={styles.card} aria-label="Tasks that moved">
                  <h2 className={styles.cardHead}>Tasks that moved <span className={styles.count}>{digest.moves.length}</span></h2>
                  <ul className={styles.rows}>
                    {digest.moves.slice(0, 20).map((mv) => (
                      <li key={mv.cardId} className={styles.row}>
                        <div className={styles.rowMain}>
                          <Link href={`/board?card=${encodeURIComponent(mv.cardId)}`} className={styles.rowTitle}>
                            {mv.done && <span className={styles.doneMark} aria-label="Finished">✓</span>}
                            {mv.title}
                          </Link>
                          <span className={styles.rowMeta}>
                            <span className={styles.stage}>{mv.from}</span>
                            <span className={styles.arrow} aria-hidden="true">→</span>
                            <span className={mv.done ? `${styles.stage} ${styles.stageDone}` : styles.stage}>{mv.to}</span>
                            {mv.boardId && boardNames.get(mv.boardId) ? ` · ${boardNames.get(mv.boardId)}` : ""}
                          </span>
                        </div>
                        <Avatar p={who(mv.actorId)} size="sm" />
                      </li>
                    ))}
                  </ul>
                  {digest.moves.length > 20 && <p className={styles.more}>and {digest.moves.length - 20} more</p>}
                </section>
              )}
            </div>

            {(digest.newPages.length > 0 || digest.newTasks.length > 0) && (
              <section className={styles.card} aria-label="New this week">
                <h2 className={styles.cardHead}>New this week</h2>
                <div className={styles.newGrid}>
                  {digest.newPages.length > 0 && (
                    <div>
                      <h3 className={styles.miniHead}>Pages</h3>
                      <ul className={styles.chips}>
                        {digest.newPages.slice(0, 12).map((p) => (
                          <li key={p.pageId}><Link href={`/doc?page=${p.pageId}`} className={styles.chip}><Avatar p={who(p.actorId)} size="sm" />{p.title}</Link></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {digest.newTasks.length > 0 && (
                    <div>
                      <h3 className={styles.miniHead}>Tasks</h3>
                      <ul className={styles.chips}>
                        {digest.newTasks.slice(0, 12).map((c) => (
                          <li key={c.cardId}><Link href={`/board?card=${encodeURIComponent(c.cardId)}`} className={styles.chip}><Avatar p={who(c.actorId)} size="sm" />{c.title}</Link></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <Dock />
    </div>
  );
}
