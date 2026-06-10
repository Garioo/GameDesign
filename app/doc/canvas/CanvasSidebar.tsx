"use client";

import { useEffect, useState } from "react";
import type { CanvasInfo } from "@/lib/canvasRepo";
import "../Sidebar.css";

/* ---------- icons ---------- */
type IconProps = { className?: string };
const Grid = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const Board = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
  </svg>
);
const Plus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Dots = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </svg>
);
const Pencil = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const Trash = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
  </svg>
);

interface CanvasSidebarProps {
  canvases: CanvasInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function CanvasSidebar({
  canvases,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: CanvasSidebarProps) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".row-menu") && !t.closest(".row-dots")) setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const startRename = (c: CanvasInfo) => {
    setRenamingId(c.id);
    setRenameText(c.name);
    setMenu(null);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const text = renameText.trim();
    if (text) onRename(renamingId, text);
    setRenamingId(null);
  };

  return (
    <aside className="sidebar">
      <div className="section-head">
        <span className="section-icon">
          <Grid className="section-icon-svg" />
        </span>
        <div>
          <div className="section-name">Canvases</div>
          <div className="section-meta">
            {canvases.length} {canvases.length === 1 ? "canvas" : "canvases"}
          </div>
        </div>
      </div>

      <div className="nav-label-row">
        <span className="nav-label">Boards</span>
      </div>

      <nav className="nav">
        {canvases.map((c) => {
          const isRenaming = renamingId === c.id;
          return (
            <div
              key={c.id}
              className={"nav-item" + (c.id === activeId ? " is-active" : "")}
              style={{ paddingLeft: 9 }}
              onClick={() => onSelect(c.id)}
            >
              <span className="nav-twisty-spacer" />
              <Board className="nav-icon" />
              {isRenaming ? (
                <input
                  className="nav-rename"
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="nav-title">{c.name}</span>
              )}
              <button
                className="row-dots"
                title="Canvas options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu((m) => (m === c.id ? null : c.id));
                }}
              >
                <Dots className="row-dots-icon" />
              </button>
              {menu === c.id && (
                <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                  <button onMouseDown={(e) => { e.preventDefault(); startRename(c); }}>
                    <Pencil /> Rename
                  </button>
                  <button
                    className="danger"
                    onMouseDown={(e) => { e.preventDefault(); setMenu(null); onDelete(c.id); }}
                  >
                    <Trash /> Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {canvases.length === 0 && <div className="nav-empty">No canvases yet</div>}
      </nav>

      <button className="new-page" onClick={onNew}>
        <Plus className="new-page-icon" />
        New canvas
      </button>
    </aside>
  );
}
