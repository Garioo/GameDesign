import type { ReactNode } from "react";
import Link from "next/link";
import { PlanningIcon } from "./PlanningIcons";
export default function PlanningHeader({
  title,
  mode,
  boardId,
  onNavigation,
  onCreate,
  canEdit,
  children,
  createLabel = "New board",
}: {
  createLabel?: string;
  title: string;
  mode: "board" | "timeline";
  boardId?: string;
  onNavigation: () => void;
  onCreate: () => void;
  canEdit: boolean;
  children?: ReactNode;
}) {
  const suffix = boardId ? `?board=${encodeURIComponent(boardId)}` : "";
  return (
    <header className="planning-header">
      <div className="planning-heading">
        <button
          className="planning-icon-button"
          onClick={onNavigation}
          aria-label="Toggle board sidebar"
        >
          <PlanningIcon name="menu" />
        </button>
        <div>
          <h1>{title}</h1>
        </div>
        <nav className="planning-view-switch" aria-label="Planning view">
          <Link
            href={`/board${suffix}`}
            aria-current={mode === "board" ? "page" : undefined}
          >
            <PlanningIcon name="board" />
            Board
          </Link>
          <Link
            href={`/table${suffix}`}
            aria-current={mode === "timeline" ? "page" : undefined}
          >
            <PlanningIcon name="timeline" />
            Timeline
          </Link>
        </nav>
        {canEdit && (
          <button className="planning-primary" onClick={onCreate}>
            <PlanningIcon name="plus" />
            {createLabel}
          </button>
        )}
      </div>
      <div className="planning-controls">{children}</div>
    </header>
  );
}
