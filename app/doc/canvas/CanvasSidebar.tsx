"use client";

import { useEffect, useState } from "react";
import type { CanvasFolderInfo, CanvasInfo } from "@/lib/canvasRepo";
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
const Folder = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);
const Chevron = ({ className, style }: IconProps & { style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
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

type Menu = { kind: "canvas" | "folder"; id: string } | null;
type Renaming = { kind: "canvas" | "folder"; id: string } | null;

interface CanvasSidebarProps {
  canvases: CanvasInfo[];
  folders: CanvasFolderInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (folderId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onNewFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveToFolder: (canvasId: string, folderId: string | null) => void;
}

export default function CanvasSidebar({
  canvases,
  folders,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveToFolder,
}: CanvasSidebarProps) {
  const [menu, setMenu] = useState<Menu>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [renameText, setRenameText] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  // folder id, or null = the unfiled list, or undefined = nothing hovered
  const [dropFolder, setDropFolder] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".row-menu") && !t.closest(".row-dots")) {
        setMenu(null);
        setConfirmId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const startRename = (kind: "canvas" | "folder", id: string, current: string) => {
    setRenaming({ kind, id });
    setRenameText(current);
    setMenu(null);
  };
  const commitRename = () => {
    if (!renaming) return;
    const text = renameText.trim();
    if (text) {
      if (renaming.kind === "canvas") onRename(renaming.id, text);
      else onRenameFolder(renaming.id, text);
    }
    setRenaming(null);
  };

  const toggleFolder = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearDrag = () => {
    setDragId(null);
    setDropFolder(undefined);
  };
  const dropInto = (folderId: string | null) => {
    if (dragId) {
      const moved = canvases.find((c) => c.id === dragId);
      if (moved && (moved.folderId ?? null) !== folderId) onMoveToFolder(dragId, folderId);
    }
    clearDrag();
  };

  const commitNewFolder = () => {
    const n = newFolderName.trim();
    setNewFolderOpen(false);
    setNewFolderName("");
    if (n) onNewFolder(n);
  };

  const renderCanvas = (c: CanvasInfo, depth: number) => {
    const isRenaming = renaming?.kind === "canvas" && renaming.id === c.id;
    return (
      <div
        key={c.id}
        className={"nav-item" + (c.id === activeId ? " is-active" : "") + (dragId === c.id ? " is-dragging" : "")}
        style={{ paddingLeft: 9 + depth * 16 }}
        draggable={!isRenaming}
        onClick={() => onSelect(c.id)}
        onDragStart={(e) => {
          setDragId(c.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={clearDrag}
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
              if (e.key === "Escape") setRenaming(null);
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
            setMenu((m) => (m?.kind === "canvas" && m.id === c.id ? null : { kind: "canvas", id: c.id }));
          }}
        >
          <Dots className="row-dots-icon" />
        </button>
        {menu?.kind === "canvas" && menu.id === c.id && (
          <div className="row-menu" onClick={(e) => e.stopPropagation()}>
            {confirmId === c.id ? (
              <>
                <div className="row-menu-confirm">Delete &ldquo;{c.name}&rdquo;? This can&apos;t be undone.</div>
                <button
                  className="danger"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMenu(null);
                    setConfirmId(null);
                    onDelete(c.id);
                  }}
                >
                  <Trash /> Yes, delete
                </button>
                <button onMouseDown={(e) => { e.preventDefault(); setConfirmId(null); }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onMouseDown={(e) => { e.preventDefault(); startRename("canvas", c.id, c.name); }}>
                  <Pencil /> Rename
                </button>
                <button
                  className="danger"
                  onMouseDown={(e) => { e.preventDefault(); setConfirmId(c.id); }}
                >
                  <Trash /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const unfiled = canvases.filter((c) => !c.folderId);
  const inFolder = (id: string) => canvases.filter((c) => c.folderId === id);
  const orderedFolders = [...folders].sort((a, b) => a.position - b.position);

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
        {folders.length > 0 && <span className="drag-hint">drag into folders</span>}
      </div>

      <nav className="nav">
        {/* unfiled canvases — also the drop zone for "move out of folder" */}
        <div
          className={"nav-group" + (dragId && dropFolder === null ? " drop-section" : "")}
          onDragOver={(e) => {
            if (dragId) {
              e.preventDefault();
              setDropFolder(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dropInto(null);
          }}
        >
          {unfiled.map((c) => renderCanvas(c, 0))}
          {unfiled.length === 0 && folders.length === 0 && <div className="nav-empty">No canvases yet</div>}
          {unfiled.length === 0 && folders.length > 0 && dragId && (
            <div className="nav-empty">Drop here to move out of its folder</div>
          )}
        </div>

        {/* folders */}
        {orderedFolders.map((f) => {
          const kids = inFolder(f.id);
          const isOpen = !collapsed.has(f.id);
          const isRenaming = renaming?.kind === "folder" && renaming.id === f.id;
          return (
            <div
              key={f.id}
              className={"nav-group" + (dragId && dropFolder === f.id ? " drop-section" : "")}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropFolder(f.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropInto(f.id);
              }}
            >
              <div
                className="nav-group-label"
                style={{ cursor: "pointer", position: "relative" }}
                onClick={() => { if (!isRenaming) toggleFolder(f.id); }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <Chevron
                    className="nav-chevron nav-twisty"
                    style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}
                  />
                  <Folder className="nav-icon" />
                  {isRenaming ? (
                    <input
                      className="nav-rename section-rename"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={commitRename}
                    />
                  ) : (
                    <span className="nav-title">{f.name}</span>
                  )}
                </span>
                <span className="nav-group-actions">
                  <button
                    className="nav-add"
                    title={`New canvas in ${f.name}`}
                    onClick={(e) => { e.stopPropagation(); onNew(f.id); }}
                  >
                    <Plus className="nav-add-icon" />
                  </button>
                  <button
                    className="row-dots"
                    title="Folder options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu((m) => (m?.kind === "folder" && m.id === f.id ? null : { kind: "folder", id: f.id }));
                    }}
                  >
                    <Dots className="row-dots-icon" />
                  </button>
                </span>
                {menu?.kind === "folder" && menu.id === f.id && (
                  <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                    {confirmId === f.id ? (
                      <>
                        <div className="row-menu-confirm">
                          Delete &ldquo;{f.name}&rdquo;? Its canvases move to the main list.
                        </div>
                        <button
                          className="danger"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setMenu(null);
                            setConfirmId(null);
                            onDeleteFolder(f.id);
                          }}
                        >
                          <Trash /> Yes, delete
                        </button>
                        <button onMouseDown={(e) => { e.preventDefault(); setConfirmId(null); }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onMouseDown={(e) => { e.preventDefault(); startRename("folder", f.id, f.name); }}>
                          <Pencil /> Rename
                        </button>
                        <button
                          className="danger"
                          onMouseDown={(e) => { e.preventDefault(); setConfirmId(f.id); }}
                        >
                          <Trash /> Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {isOpen && kids.map((c) => renderCanvas(c, 1))}
              {isOpen && kids.length === 0 && <div className="nav-empty">Empty folder</div>}
            </div>
          );
        })}
      </nav>

      <button className="new-page" onClick={() => onNew(null)}>
        <Plus className="new-page-icon" />
        New canvas
      </button>

      {newFolderOpen ? (
        <input
          className="new-section-input"
          autoFocus
          placeholder="Folder name…"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitNewFolder();
            if (e.key === "Escape") {
              setNewFolderOpen(false);
              setNewFolderName("");
            }
          }}
          onBlur={commitNewFolder}
        />
      ) : (
        <button className="new-page" onClick={() => setNewFolderOpen(true)}>
          <Plus className="new-page-icon" />
          New folder
        </button>
      )}
    </aside>
  );
}
