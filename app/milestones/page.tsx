"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { loadBoards, type Board } from "@/lib/boardRepo";
import {
  blockedIds,
  countdown,
  daysUntil,
  milestoneProgress,
  sortMilestones,
  todayKey,
  urgency,
  type CardDependency,
  type Milestone,
  type PlanTask,
} from "@/lib/planning";
import { createMilestone, deleteMilestone, loadPlanning, updateMilestone, type MilestoneInput } from "@/lib/planningRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { useSitePresence } from "@/lib/useSitePresence";
import { useShortcuts } from "@/lib/shortcuts";
import TopBar from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import styles from "./milestones.module.css";

type Task = PlanTask & { stage: string; boardName: string; boardId: string };

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: y !== new Date().getFullYear() ? "numeric" : undefined });
}

export default function MilestonesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const online = useSitePresence(session, { path: "/milestones", label: "Milestones" });
  const [boards, setBoards] = useState<Board[]>([]);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [deps, setDeps] = useState<CardDependency[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showReached, setShowReached] = useState(false);

  const workspaceId = session?.workspaceId ?? null;
  const canEdit = !!session && session.role !== "viewer";
  const today = todayKey();

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const [b, plan] = await Promise.all([loadBoards(workspaceId), loadPlanning(workspaceId)]);
    setBoards(b);
    setMilestones(plan.milestones);
    setDeps(plan.dependencies);
    setMissing(plan.missing);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) { router.replace("/login"); return; }
      if (!s.onboarded || !s.workspaceId) { router.replace("/onboarding"); return; }
      setSession(s);
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [router]);
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);
  useSidebarLiveUpdates(workspaceId, ["milestones", "board_cards", "board_columns", "card_dependencies"], load);

  // Links elsewhere point at "#m-<id>": scroll there and flash it once the list is in.
  const loaded = milestones !== null;
  useEffect(() => {
    if (!loaded) return;
    const target = window.location.hash.slice(1);
    if (!target.startsWith("m-")) return;
    if (reachedIds.current.has(target.slice(2))) setShowReached(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(target) ?? document.querySelector(`[data-milestone="${CSS.escape(target.slice(2))}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add(styles.flash);
    });
  }, [loaded]);

  const tasks = useMemo(() => {
    const list: Task[] = [];
    for (const b of boards) for (const c of b.cols) for (const k of c.cards) {
      list.push({ id: k.id, title: k.title || "Untitled task", done: !!c.isCompleted, milestoneId: k.milestoneId ?? null, stage: c.name, boardName: b.name, boardId: b.id });
    }
    return list;
  }, [boards]);
  const blocked = useMemo(() => blockedIds(deps, new Map(tasks.map((t) => [t.id, t]))), [deps, tasks]);
  const sorted = useMemo(() => sortMilestones(milestones ?? []), [milestones]);
  const open = sorted.filter((m) => !m.completedAt);
  const reached = sorted.filter((m) => m.completedAt);
  const reachedIds = useRef(new Set<string>());
  reachedIds.current = new Set(reached.map((m) => m.id));
  const next = open.find((m) => m.dueDate && daysUntil(m.dueDate, today) >= 0) ?? open[0];

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useShortcuts([
    { id: "ms-new", keys: "n", label: "New milestone", group: "Page", enabled: canEdit && !missing, run: () => { setCreating(true); setEditingId(null); } },
    { id: "ms-reached", keys: "r", label: showReached ? "Hide reached milestones" : "Show reached milestones", group: "Page", enabled: reached.length > 0, run: () => setShowReached((v) => !v) },
  ]);

  // The timeline strip spans today → the last dated open milestone (at least a month).
  const dated = open.filter((m) => m.dueDate);
  const span = Math.max(30, ...dated.map((m) => daysUntil(m.dueDate!, today) + 3));
  const pos = (m: Milestone) => Math.min(100, Math.max(0, (daysUntil(m.dueDate!, today) / span) * 100));

  const renderCard = (m: Milestone, i: number) => {
    const prog = milestoneProgress(m.id, tasks, blocked);
    const u = urgency(m, today);
    const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    const board = boards.find((b) => b.id === m.boardId);
    if (editingId === m.id) {
      return (
        <MilestoneForm
          key={m.id}
          boards={boards}
          initial={{ name: m.name, dueDate: m.dueDate, description: m.description, boardId: m.boardId }}
          submitLabel="Save"
          onCancel={() => setEditingId(null)}
          onSubmit={(input) => act(async () => { await updateMilestone(m.id, input); setEditingId(null); })}
        />
      );
    }
    return (
      <article key={m.id} className={`${styles.card} ${styles[`u_${u}`] ?? ""}`} style={{ "--i": i } as React.CSSProperties}>
        <header className={styles.cardHead}>
          <span className={styles.diamond} aria-hidden="true" />
          <div className={styles.cardTitle}>
            <h2>{m.name}</h2>
            <p className={styles.meta}>
              {m.dueDate ? formatDay(m.dueDate) : "No date yet"}
              {board ? ` · ${board.name}` : " · Whole project"}
            </p>
          </div>
          {m.completedAt ? (
            <span className={`${styles.pill} ${styles.pillDone}`}>Reached</span>
          ) : m.dueDate ? (
            <span className={`${styles.pill} ${styles[`pill_${u}`] ?? ""}`}>{countdown(m.dueDate, today)}</span>
          ) : null}
        </header>
        {m.description && <p className={styles.description}>{m.description}</p>}
        <div className={styles.progress}>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${m.name} progress`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressText}>
            {prog.total === 0 ? "No tasks yet" : `${prog.done}/${prog.total} tasks done`}
            {prog.blocked > 0 && <span className={styles.blockedText}> · {prog.blocked} blocked</span>}
          </span>
        </div>
        {prog.open.length > 0 && (
          <ul className={styles.tasks}>
            {(prog.open as Task[]).slice(0, 6).map((t) => (
              <li key={t.id}>
                <span className={blocked.has(t.id) ? `${styles.taskDot} ${styles.taskDotBlocked}` : styles.taskDot} aria-hidden="true" />
                <Link href={`/board?card=${encodeURIComponent(t.id)}`}>{t.title}</Link>
                <span className={styles.taskMeta}>{blocked.has(t.id) ? "Blocked" : t.stage}</span>
              </li>
            ))}
            {prog.open.length > 6 && <li className={styles.taskMeta}>+ {prog.open.length - 6} more open</li>}
          </ul>
        )}
        {prog.total === 0 && canEdit && (
          <p className={styles.hint}>Add tasks from a task’s Planning section on the board.</p>
        )}
        {canEdit && (
          <footer className={styles.actions}>
            {confirmDelete === m.id ? (
              <>
                <span className={styles.confirm}>Delete “{m.name}”? Its tasks stay.</span>
                <button type="button" className={styles.danger} onClick={() => act(() => deleteMilestone(m.id))}>Delete</button>
                <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => act(() => updateMilestone(m.id, { completed: !m.completedAt }))}>
                  {m.completedAt ? "Reopen" : "Mark reached"}
                </button>
                <button type="button" onClick={() => { setEditingId(m.id); setCreating(false); }}>Edit</button>
                <button type="button" className={styles.quiet} onClick={() => setConfirmDelete(m.id)}>Delete</button>
              </>
            )}
          </footer>
        )}
      </article>
    );
  };

  return (
    <div className={styles.page}>
      <TopBar crumbs={["Milestones"]} workspaceId={session?.workspaceId} online={online} selfKey={session?.userId}>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      <main className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Milestones</p>
          <h1 className={styles.title}>
            {milestones === null
              ? "Loading milestones…"
              : next
                ? <>{next.name}{next.dueDate ? <span className={styles.titleWhen}> · {countdown(next.dueDate, today).toLowerCase()}</span> : null}</>
                : "No upcoming milestones"}
          </h1>
          <p className={styles.sub}>
            {milestones === null ? "" : `${open.length} open · ${reached.length} reached`}
            {!canEdit && session ? " · you can view and comment" : ""}
          </p>
          {canEdit && !missing && !creating && (
            <button type="button" className={styles.primary} onClick={() => { setCreating(true); setEditingId(null); }}>
              + New milestone <kbd>N</kbd>
            </button>
          )}
        </header>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {missing && (
          <p className={styles.error}>Milestones need a database update. Apply supabase/migrate-project-planning.sql in Supabase.</p>
        )}

        {dated.length > 0 && (
          <section className={styles.timeline} aria-label="Timeline">
            <div className={styles.track}>
              <span className={styles.todayMark} style={{ left: 0 }}><span>Today</span></span>
              {dated.map((m) => (
                <Link
                  key={m.id}
                  href={`#m-${m.id}`}
                  className={`${styles.stop} ${styles[`u_${urgency(m, today)}`] ?? ""}`}
                  style={{ left: `${pos(m)}%` }}
                  title={`${m.name} · ${formatDay(m.dueDate!)}`}
                >
                  <span className={styles.stopDiamond} aria-hidden="true" />
                  <span className={styles.stopLabel}>{m.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {creating && (
          <MilestoneForm
            boards={boards}
            initial={{ name: "", dueDate: null, description: "", boardId: null }}
            submitLabel="Create milestone"
            onCancel={() => setCreating(false)}
            onSubmit={(input) => act(async () => { await createMilestone(workspaceId!, input); setCreating(false); })}
          />
        )}

        <div className={styles.list}>
          {open.map((m, i) => (
            <div key={m.id} id={`m-${m.id}`}>{renderCard(m, i)}</div>
          ))}
          {milestones !== null && open.length === 0 && !creating && (
            <div className={styles.empty}>
              <p>Milestones are the dates that matter — a mid-term review, a hand-in, a launch. Tasks on the board can count towards one, so you can see what still stands in the way.</p>
            </div>
          )}
        </div>

        {reached.length > 0 && (
          <section className={styles.reached}>
            <button type="button" className={styles.toggle} onClick={() => setShowReached((v) => !v)} aria-expanded={showReached}>
              {showReached ? "Hide" : "Show"} reached ({reached.length})
            </button>
            {showReached && (
              <div className={styles.list}>
                {reached.map((m, i) => <div key={m.id} data-milestone={m.id}>{renderCard(m, i)}</div>)}
              </div>
            )}
          </section>
        )}
      </main>

      <Dock />
    </div>
  );
}

function MilestoneForm({
  boards,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  boards: Board[];
  initial: MilestoneInput;
  submitLabel: string;
  onSubmit: (input: MilestoneInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [boardId, setBoardId] = useState(initial.boardId ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name, dueDate: dueDate || null, description, boardId: boardId || null });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.form}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
    >
      <label className={styles.formWide}>
        <span>Name</span>
        <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid-term review, Hand-in" />
      </label>
      <label>
        <span>Due date</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label>
        <span>For</span>
        <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
          <option value="">The whole project</option>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className={styles.formWide}>
        <span>Description</span>
        <textarea rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="What has to be true when you get there?" />
      </label>
      <div className={styles.formActions}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.primary} disabled={!name.trim() || busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
