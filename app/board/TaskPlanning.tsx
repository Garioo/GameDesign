"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  countdown,
  EVERY_LABEL,
  openBlockers,
  todayKey,
  urgency,
  type CardDependency,
  type Every,
  type Milestone,
  type PlanTask,
  type RecurringRule,
} from "@/lib/planning";
import { addDependency, createMilestone, removeDependency, setCardMilestone, setTaskRecurrence } from "@/lib/planningRepo";
import styles from "./TaskPlanning.module.css";

/* ---------------------------------------------------------------------------
 * Planning on the board: which tasks wait on which, the milestone a task
 * counts towards, and repeating tasks. BoardWorkspace loads the data and
 * provides it; task cards show badges and the task dialog edits it here.
 * ------------------------------------------------------------------------- */

export type BoardTask = PlanTask & { boardName: string; stage: string; recurrenceId: string | null };

export interface PlanningState {
  workspaceId: string;
  canEdit: boolean;
  milestones: Milestone[];
  dependencies: CardDependency[];
  recurring: RecurringRule[];
  /** The database update hasn't been applied yet: hide the controls. */
  missing: boolean;
  tasks: Map<string, BoardTask>;
  blocked: Set<string>;
  /** Reload planning data (and tasks, when a repeat or milestone changed them). */
  refresh: () => Promise<void>;
}

export const PlanningCtx = createContext<PlanningState | null>(null);
export const usePlanning = () => useContext(PlanningCtx);

/** Small badges on a task card: blocked, milestone countdown, repeating. */
export function TaskBadges({ taskId, milestoneId, recurrenceId }: { taskId: string; milestoneId?: string | null; recurrenceId?: string | null }) {
  const p = usePlanning();
  if (!p || p.missing) return null;
  const waiting = p.blocked.has(taskId) ? openBlockers(taskId, p.dependencies, p.tasks) : [];
  const m = milestoneId ? p.milestones.find((x) => x.id === milestoneId) : undefined;
  const rule = recurrenceId ? p.recurring.find((r) => r.id === recurrenceId) : undefined;
  if (!waiting.length && !m && !rule) return null;
  const today = todayKey();
  return (
    <div className={styles.badges}>
      {waiting.length > 0 && (
        <span className={`${styles.badge} ${styles.blocked}`} title={`Waiting on: ${waiting.map((t) => t.title).join(", ")}`}>
          <LockIcon /> Blocked
        </span>
      )}
      {m && (
        <span className={`${styles.badge} ${styles[`m_${urgency(m, today)}`] ?? ""}`} title={`Milestone: ${m.name}${m.dueDate ? ` · due ${m.dueDate}` : ""}`}>
          <FlagIcon /> {m.name}
          {m.dueDate && !m.completedAt && <span className={styles.when}>· {countdown(m.dueDate, today)}</span>}
        </span>
      )}
      {rule && (
        <span className={styles.badge} title={`Repeats ${EVERY_LABEL[rule.every].toLowerCase()}`}>
          <RepeatIcon /> {EVERY_LABEL[rule.every]}
        </span>
      )}
    </div>
  );
}

/**
 * The Planning section of the task dialog. `editable` (the Edit form) shows the
 * controls, which save right away; otherwise it's a read-only summary that
 * only appears when the task has any planning set.
 */
export function TaskPlanningSection({
  taskId,
  onOpenCard,
  editable,
}: {
  taskId: string;
  /** Open a linked task (not offered in the Edit form, which would drop unsaved edits). */
  onOpenCard?: (id: string) => void;
  editable: boolean;
}) {
  const p = usePlanning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!p) return null;
  if (p.missing) {
    if (!editable) return null;
    return (
      <div className={styles.section}>
        <div className="modal-label">Planning</div>
        <p className={styles.muted}>Milestones, dependencies and repeating tasks need a database update (supabase/migrate-project-planning.sql).</p>
      </div>
    );
  }
  const { milestones, dependencies, recurring, tasks } = p;
  const canEdit = p.canEdit && editable;
  // Read from the live task list: the dialog's own copy of the task can lag behind.
  const milestoneId = tasks.get(taskId)?.milestoneId ?? null;
  const recurrenceId = tasks.get(taskId)?.recurrenceId ?? null;
  const today = todayKey();
  const waitingOn = dependencies.filter((d) => d.blocked === taskId);
  const blocking = dependencies.filter((d) => d.blocker === taskId);
  const linked = new Set([taskId, ...waitingOn.map((d) => d.blocker), ...blocking.map((d) => d.blocked)]);
  const rule = recurrenceId ? recurring.find((r) => r.id === recurrenceId) : undefined;
  const openMilestones = milestones.filter((m) => !m.completedAt || m.id === milestoneId);
  const current = milestones.find((m) => m.id === milestoneId);
  const stillWaiting = openBlockers(taskId, dependencies, tasks);
  // Read-only view: nothing set, nothing to show.
  if (!canEdit && !current && !rule && !waitingOn.length && !blocking.length) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await p.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const depRow = (d: CardDependency, otherId: string) => {
    const t = tasks.get(otherId);
    return (
      <li key={d.id} className={styles.depRow}>
        <span className={t?.done ? `${styles.dot} ${styles.dotDone}` : styles.dot} aria-hidden="true" />
        {onOpenCard && t ? (
          <button type="button" className={styles.depTitle} onClick={() => onOpenCard(otherId)}>
            {t.title}
          </button>
        ) : (
          <span className={styles.depTitle}>{t?.title ?? "A deleted task"}</span>
        )}
        <span className={styles.depMeta}>{t ? (t.done ? "Done" : `${t.stage}${t.boardName ? ` · ${t.boardName}` : ""}`) : ""}</span>
        {canEdit && (
          <button type="button" className={styles.remove} aria-label="Remove link" title="Remove link" disabled={busy} onClick={() => run(() => removeDependency(d.id))}>
            ×
          </button>
        )}
      </li>
    );
  };

  return (
    <div className={styles.section}>
      <div className="modal-label">Planning</div>
      {canEdit && <p className={styles.muted}>Changes here save right away.</p>}
      {(canEdit || current || rule) && (
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}><FlagIcon /> Milestone</span>
          {canEdit ? (
            <select
              value={milestoneId ?? ""}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new") {
                  const name = window.prompt("New milestone name (you can set its date on the Milestones page)");
                  if (!name?.trim()) return;
                  void run(async () => {
                    const m = await createMilestone(p.workspaceId, { name, dueDate: null });
                    await setCardMilestone(taskId, m.id);
                  });
                  return;
                }
                void run(() => setCardMilestone(taskId, v || null));
              }}
            >
              <option value="">No milestone</option>
              {openMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.dueDate ? ` · ${m.dueDate}` : ""}
                </option>
              ))}
              <option value="__new">+ New milestone…</option>
            </select>
          ) : (
            <span className={styles.value}>{current?.name ?? "None"}</span>
          )}
          {current?.dueDate && !current.completedAt && (
            <span className={`${styles.hint} ${styles[`t_${urgency(current, today)}`] ?? ""}`}>{countdown(current.dueDate, today)}</span>
          )}
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}><RepeatIcon /> Repeats</span>
          {canEdit ? (
            <select
              value={rule?.every ?? ""}
              disabled={busy}
              onChange={(e) => void run(() => setTaskRecurrence(taskId, (e.target.value || null) as Every | null))}
            >
              <option value="">Never</option>
              {(Object.keys(EVERY_LABEL) as Every[]).map((k) => (
                <option key={k} value={k}>{EVERY_LABEL[k]}</option>
              ))}
            </select>
          ) : (
            <span className={styles.value}>{rule ? EVERY_LABEL[rule.every] : "Never"}</span>
          )}
          {rule && <span className={styles.hint}>Next copy {formatDay(rule.nextRun)}, once this one is done</span>}
        </label>
      </div>
      )}

      {(canEdit || waitingOn.length > 0) && (
      <div className={styles.deps}>
        <div className={styles.depHead}>
          <span><LockIcon /> Waiting on</span>
          {stillWaiting.length > 0 && <span className={styles.warn}>{stillWaiting.length} not done yet</span>}
        </div>
        {waitingOn.length > 0 ? <ul className={styles.depList}>{waitingOn.map((d) => depRow(d, d.blocker))}</ul> : <p className={styles.muted}>Nothing — this task can start any time.</p>}
        {canEdit && (
          <TaskPicker
            placeholder="Add a task this waits on…"
            exclude={linked}
            disabled={busy}
            onPick={(other) => run(() => addDependency(p.workspaceId, other, taskId))}
          />
        )}
      </div>
      )}
      {(canEdit || blocking.length > 0) && (
      <div className={styles.deps}>
        <div className={styles.depHead}><span><ArrowIcon /> Blocking</span></div>
        {blocking.length > 0 ? <ul className={styles.depList}>{blocking.map((d) => depRow(d, d.blocked))}</ul> : <p className={styles.muted}>No tasks wait on this one.</p>}
        {canEdit && (
          <TaskPicker
            placeholder="Add a task that waits on this…"
            exclude={linked}
            disabled={busy}
            onPick={(other) => run(() => addDependency(p.workspaceId, taskId, other))}
          />
        )}
      </div>
      )}
      {error && <p role="alert" className="gantt-error">{error}</p>}
    </div>
  );
}

/** Type to find a task in the workspace. */
function TaskPicker({ placeholder, exclude, disabled, onPick }: { placeholder: string; exclude: Set<string>; disabled: boolean; onPick: (id: string) => void }) {
  const p = usePlanning();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !p) return [];
    return [...p.tasks.values()].filter((t) => !exclude.has(t.id) && t.title.toLowerCase().includes(s)).slice(0, 8);
  }, [q, p, exclude]);
  const pick = (id: string) => {
    setQ("");
    setIndex(0);
    onPick(id);
  };
  return (
    <div className={styles.picker}>
      <input
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(matches[index].id); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setQ(""); }
        }}
      />
      {matches.length > 0 && (
        <ul className={styles.pickerList} role="listbox">
          {matches.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className={i === index ? `${styles.option} ${styles.optionActive}` : styles.option}
                onMouseDown={(e) => { e.preventDefault(); pick(t.id); }}
                onMouseMove={() => setIndex(i)}
              >
                <span className={t.done ? `${styles.dot} ${styles.dotDone}` : styles.dot} aria-hidden="true" />
                <span className={styles.optionTitle}>{t.title}</span>
                <span className={styles.depMeta}>{t.stage}{t.boardName ? ` · ${t.boardName}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const FlagIcon = () => <svg {...svgProps} className={styles.icon}><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></svg>;
export const LockIcon = () => <svg {...svgProps} className={styles.icon}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const RepeatIcon = () => <svg {...svgProps} className={styles.icon}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></svg>;
const ArrowIcon = () => <svg {...svgProps} className={styles.icon}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
