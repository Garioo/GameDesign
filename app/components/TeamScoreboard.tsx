"use client";

import type { Board } from "@/lib/boardRepo";
import type { ProfileInfo } from "@/lib/docsRepo";
import { doneTasks, inPeriod, leaderboard, startOfWeek, weeklyTotals, type Completions, type StatsPeriod } from "@/lib/teamStats";
import { dayNumber, isoWeek } from "@/lib/gantt";
import styles from "./TeamScoreboard.module.css";

const PERIOD_NOUN: Record<StatsPeriod, string> = { week: "this week", month: "this month", all: "in total" };
/** "since Monday 21 Sep" — the week restarts every Monday at 00:00. */
function since(period: StatsPeriod, now: Date) {
  if (period === "week") return `since Monday ${startOfWeek(now).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · week ${isoWeek(dayNumber(key(now)))}`;
  if (period === "month") return `since ${new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return null;
}
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Finished board tasks per teammate, plus the team's last eight weeks. */
export default function TeamScoreboard({ boards, completions, people, currentUserId, period, now = new Date() }: {
  boards: Board[];
  completions: Completions;
  people: ProfileInfo[];
  currentUserId: string;
  period: StatsPeriod;
  now?: Date;
}) {
  const done = doneTasks(boards, completions);
  const total = done.filter((t) => inPeriod(t, period, now)).length;
  // Compare with the previous full week / month.
  const previous = period === "all" ? null : (() => {
    const end = period === "week" ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1);
    const start = period === "week" ? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7) : new Date(end.getFullYear(), end.getMonth() - 1, 1);
    return done.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length;
  })();
  const rows = leaderboard(boards, completions, people.map((p) => p.id), period, now);
  const best = Math.max(1, ...rows.map((r) => r.done));
  const weeks = weeklyTotals(done, now);
  const weekMax = Math.max(1, ...weeks.map((w) => w.done));
  const unassigned = done.filter((t) => !t.ownerIds.length && inPeriod(t, period, now)).length;

  if (!done.length) {
    return <div className={styles.card}><p className={styles.empty}>No finished tasks yet. Move a task into a done stage on a board and it shows up here.</p></div>;
  }

  return (
    <div className={styles.card}>
      <div className={styles.headline}>
        <div>
          <span className={styles.bigNumber}>{total}</span>
          <span className={styles.bigLabel}>{total === 1 ? "task" : "tasks"} finished {PERIOD_NOUN[period]}</span>
          {since(period, now) && <span className={styles.since}>{since(period, now)}</span>}
        </div>
        {previous !== null && (
          <span className={styles.delta}>
            {total === previous ? "Same as" : total > previous ? `▲ ${total - previous} more than` : `▼ ${previous - total} fewer than`} last {period}
          </span>
        )}
      </div>

      <ol className={styles.board} aria-label={`Tasks finished ${PERIOD_NOUN[period]} per person`}>
        {rows.map((r, i) => {
          const person = people.find((p) => p.id === r.id)!;
          const me = r.id === currentUserId;
          return (
            <li key={r.id} className={`${styles.row}${me ? ` ${styles.me}` : ""}`}>
              <span className={styles.rank}>{r.done ? i + 1 : "–"}</span>
              <span className={styles.avatar} style={{ background: person.color }} aria-hidden="true">{person.initials}</span>
              <span className={styles.name}>
                {person.name}{me && <span className={styles.you}> (you)</span>}
                <small>
                  {r.open} open{r.streak > 1 ? ` · ${r.streak}-week streak` : ""}
                </small>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.bar} style={{ width: `${(r.done / best) * 100}%` }} />
              </span>
              <span className={styles.count}>{r.done}</span>
            </li>
          );
        })}
      </ol>
      {unassigned > 0 && <p className={styles.note}>+{unassigned} finished {unassigned === 1 ? "task" : "tasks"} without an assignee. Tasks count for each person assigned.</p>}

      <figure className={styles.chart}>
        <figcaption>Team tasks finished per week</figcaption>
        <div className={styles.weeks} aria-hidden="true">
          {weeks.map((w, i) => {
            const label = `Week ${isoWeek(dayNumber(key(w.start)))}`;
            const current = i === weeks.length - 1;
            return (
              <div key={w.start.getTime()} className={styles.week} title={`${label}: ${w.done} finished`}>
                <span className={styles.weekValue}>{w.done || ""}</span>
                <span className={styles.weekTrack}>
                  <span className={`${styles.weekBar}${current ? ` ${styles.weekNow}` : ""}`} style={{ height: `${(w.done / weekMax) * 100}%` }} />
                </span>
                <span className={styles.weekLabel}>{current ? "Now" : `W${isoWeek(dayNumber(key(w.start)))}`}</span>
              </div>
            );
          })}
        </div>
        <table className={styles.srOnly}>
          <caption>Team tasks finished per week</caption>
          <tbody>{weeks.map((w) => <tr key={w.start.getTime()}><th>Week {isoWeek(dayNumber(key(w.start)))}</th><td>{w.done}</td></tr>)}</tbody>
        </table>
      </figure>
    </div>
  );
}
