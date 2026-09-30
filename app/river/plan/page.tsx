"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Timeline from "./Timeline";
import BoardView from "./BoardView";
import CalendarPlan from "./CalendarPlan";
import { useRiver } from "../RiverShell";
import styles from "./plan.module.css";

/* Plan (new design): the same boards seen three ways — a vertical Gantt, the board, and the calendar. */

export type PlanView = "timeline" | "board" | "calendar";
const VIEWS: { key: PlanView; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "board", label: "Board" },
  { key: "calendar", label: "Calendar" },
];

function PlanInner() {
  const params = useSearchParams();
  const raw = params.get("view");
  const view: PlanView = raw === "board" || raw === "calendar" ? raw : "timeline";
  // Tell the team which view you're on, as its classic path so anyone can follow
  // (the board says which board and task itself).
  const { setPlace } = useRiver();
  useEffect(() => {
    if (view === "calendar") setPlace({ path: "/calendar", label: "Calendar" });
    else if (view === "timeline") setPlace({ path: "/table", label: "Gantt" });
  }, [view, setPlace]);
  const switcher = (
    <nav className={styles.views} aria-label="Plan views">
      {VIEWS.map((v) => (
        <Link key={v.key} href={`/river/plan?view=${v.key}`} className={view === v.key ? styles.viewOn : undefined} aria-current={view === v.key ? "page" : undefined}>
          {v.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <main className={styles.page}>
      {view === "timeline" && <Timeline switcher={switcher} />}
      {view === "board" && <BoardView switcher={switcher} initialBoard={params.get("board")} initialCard={params.get("card")} initialCategory={params.get("category")} />}
      {view === "calendar" && <CalendarPlan switcher={switcher} initialDate={params.get("date")} initialEvent={params.get("event")} />}
    </main>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanInner />
    </Suspense>
  );
}
