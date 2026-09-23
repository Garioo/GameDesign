"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { loadBoards } from "@/lib/boardRepo";
import { blockedIds, countdown, milestoneProgress, sortMilestones, todayKey, urgency, type Milestone, type PlanTask } from "@/lib/planning";
import { loadPlanning } from "@/lib/planningRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import styles from "./UpcomingMilestones.module.css";

interface Row {
  m: Milestone;
  done: number;
  total: number;
  blocked: number;
}

/** The next few open milestones with countdowns and progress (Home). */
export default function UpcomingMilestones({ workspaceId, limit = 3 }: { workspaceId: string; limit?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [plan, boards] = await Promise.all([loadPlanning(workspaceId), loadBoards(workspaceId)]);
    setMissing(plan.missing);
    const tasks: PlanTask[] = boards.flatMap((b) =>
      b.cols.flatMap((c) => c.cards.map((k) => ({ id: k.id, title: k.title, done: !!c.isCompleted, milestoneId: k.milestoneId ?? null }))),
    );
    const blocked = blockedIds(plan.dependencies, new Map(tasks.map((t) => [t.id, t])));
    setRows(
      sortMilestones(plan.milestones)
        .filter((m) => !m.completedAt)
        .slice(0, limit)
        .map((m) => ({ m, ...milestoneProgress(m.id, tasks, blocked) })),
    );
  }, [workspaceId, limit]);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);
  useSidebarLiveUpdates(workspaceId, ["milestones", "board_cards", "card_dependencies"], load);

  if (missing) return null;
  if (rows === null) return <div className={styles.skeleton} />;
  const today = todayKey();
  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        No upcoming milestones. <Link href="/milestones">Add the dates that matter</Link> — reviews, hand-ins, launches.
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {rows.map(({ m, done, total, blocked }) => {
        const u = urgency(m, today);
        return (
          <li key={m.id}>
            <Link href={`/milestones#m-${m.id}`} className={`${styles.row} ${styles[`u_${u}`] ?? ""}`}>
              <span className={styles.diamond} aria-hidden="true" />
              <span className={styles.main}>
                <span className={styles.name}>{m.name}</span>
                <span className={styles.bar}>
                  <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </span>
                <span className={styles.meta}>
                  {total ? `${done}/${total} tasks` : "No tasks yet"}
                  {blocked > 0 && <span className={styles.blocked}> · {blocked} blocked</span>}
                </span>
              </span>
              <span className={styles.when}>{m.dueDate ? countdown(m.dueDate, today) : "No date"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
