"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBoards, type Board, type BoardCard, type BoardColumn } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { loadPhases, type Phase } from "@/lib/phaseRepo";
import { dayNumber, localToday } from "@/lib/gantt";
import { boardForPage } from "./pageTasks";
import styles from "./planStrip.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Under a page's title: the open tasks linked to it and when their board is due. */
export default function PlanStrip({ workspaceId, pageId }: { workspaceId: string; pageId: string }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBoards(workspaceId).then((b) => !cancelled && setBoards(b)).catch(() => !cancelled && setBoards([]));
    loadPhases(workspaceId).then((s) => !cancelled && setPhases(s.phases)).catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId, pageId]);

  if (!boards || boards.length === 0) return null;
  const board = boardForPage(boards, pageId)!;
  const linked: { b: Board; col: BoardColumn; colIndex: number; card: BoardCard }[] = [];
  for (const b of boards) b.cols.forEach((col, colIndex) => { if (!col.isCompleted) for (const card of col.cards) if (card.pageIds.includes(pageId)) linked.push({ b, col, colIndex, card }); });
  linked.sort((x, y) => (y.colIndex > 0 ? 1 : 0) - (x.colIndex > 0 ? 1 : 0));
  const phase = phases.find((p) => p.board_id === board.id && !p.category_id);
  const due = phase?.effective_end;
  const shown = all ? linked : linked.slice(0, 6);
  const color = boardColor(board, boards);

  return (
    <div className={styles.strip} style={{ ["--c" as string]: color }}>
      <div className={styles.head}>
        <i />
        <b>{board.name}</b> board
        {" · "}{linked.length} open task{linked.length === 1 ? "" : "s"} from this page
        {due && <> · due {new Date(dayNumber(due) * 86400000).getUTCDate()} {MONTHS[new Date(dayNumber(due) * 86400000).getUTCMonth()]}{dayNumber(due) >= dayNumber(localToday()) ? ` (in ${dayNumber(due) - dayNumber(localToday())} days)` : ""}</>}
        <Link href={`/river/plan?view=board&board=${board.id}`}>Open board →</Link>
      </div>
      {linked.length > 0 ? (
        <div className={styles.tasks}>
          {shown.map(({ b, col, colIndex, card }) => (
            <Link key={card.id} href={`/river/plan?view=board&board=${b.id}&card=${card.id}`} className={styles.task} style={{ ["--sd" as string]: col.color }}>
              <span className={styles.dot} />{card.title}<em>{colIndex > 0 ? col.name : "To do"}</em>
            </Link>
          ))}
          {linked.length > 6 && <button className={styles.task} onClick={() => setAll((v) => !v)}>{all ? "Show less" : `+ ${linked.length - 6} more`}</button>}
        </div>
      ) : (
        <p className={styles.empty}>Select any sentence and choose <b>Make task</b> to plan work from this page.</p>
      )}
    </div>
  );
}
