"use client";

import LinkedDocuments from "./LinkedDocuments";

import { useEffect, useState } from "react";
import type { DesignDoc } from "./data";
import type { SectionInfo } from "@/lib/docsRepo";
import Icon from "@/app/components/Icon";
import "./Sidebar.css";

/* ---------- icons ---------- */
type IconProps = { className?: string };
const Sun = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Chevron = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

type Zone = "before" | "after" | "inside";
type DropTarget = { kind: "page"; id: string; zone: Zone } | { kind: "section"; id: string } | null;
type Menu = { kind: "page" | "section"; id: string } | null;
type Renaming = { kind: "page" | "section"; id: string } | null;

interface SidebarProps {
  workspaceId: string;
  docs: DesignDoc[];
  sections: SectionInfo[];
  active: DesignDoc;
  onSelect: (id: string) => void;
  onNewPage: (sectionId: string | null, sectionName: string) => void;
  onNewSection: (name: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onDeletePage: (id: string) => void;
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  /** Opens the trash dialog; editors only. */
  onOpenTrash?: () => void;
  onMovePage: (movedId: string, sectionId: string | null, parentId: string | null, orderedIds: string[]) => void;
  onMoveSection: (orderedIds: string[]) => void;
  /** False for viewers: navigation only, no create/rename/delete/drag. */
  canEdit?: boolean;
}

const byPos = (a: DesignDoc, b: DesignDoc) => (a.position ?? 0) - (b.position ?? 0);

export default function Sidebar({
  workspaceId,
  docs,
  sections,
  active,
  onSelect,
  onNewPage,
  onNewSection,
  onRenamePage,
  onDeletePage,
  onRenameSection,
  onDeleteSection,
  onOpenTrash,
  onMovePage,
  onMoveSection,
  canEdit = true,
}: SidebarProps) {
  const [dragPage, setDragPage] = useState<string | null>(null);
  const [dragSection, setDragSection] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget>(null);
  const [dropSection, setDropSection] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [renameText, setRenameText] = useState("");
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  // Collapsed sections, remembered per workspace in this browser.
  const collapsedKey = `gd-sidebar-collapsed:${workspaceId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(collapsedKey) ?? "[]");
      setCollapsed(new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [collapsedKey]);
  const setSectionCollapsed = (id: string, value: boolean) =>
    setCollapsed((prev) => {
      if (prev.has(id) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      try { localStorage.setItem(collapsedKey, JSON.stringify([...next])); } catch { /* optional preference */ }
      return next;
    });

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".row-menu") && !(e.target as HTMLElement).closest(".row-dots"))
        setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  /* ---- tree helpers ---- */
  const childrenOf = (parentId: string) => docs.filter((d) => d.parentId === parentId).sort(byPos);
  const topLevel = (sectionId: string) =>
    docs.filter((d) => d.sectionId === sectionId && !d.parentId).sort(byPos);
  const subtreeIds = (rootId: string): Set<string> => {
    const ids = new Set<string>([rootId]);
    const walk = (id: string) => docs.filter((d) => d.parentId === id).forEach((c) => { ids.add(c.id); walk(c.id); });
    walk(rootId);
    return ids;
  };
  const docById = (id: string) => docs.find((d) => d.id === id);

  /* ---- drop logic ---- */
  const performPageDrop = (target: DropTarget) => {
    if (!dragPage || !target) return;
    const moved = docById(dragPage);
    if (!moved) return;

    if (target.kind === "section") {
      const sec = sections.find((s) => s.id === target.id);
      if (!sec) return;
      const sibs = topLevel(sec.id).filter((d) => d.id !== moved.id);
      onMovePage(moved.id, sec.id, null, [...sibs.map((d) => d.id), moved.id]);
      return;
    }

    const tgt = docById(target.id);
    if (!tgt || tgt.id === moved.id) return;
    const blocked = subtreeIds(moved.id); // cannot drop into own subtree
    if (blocked.has(tgt.id)) return;

    if (target.zone === "inside") {
      const sibs = childrenOf(tgt.id).filter((d) => d.id !== moved.id);
      onMovePage(moved.id, tgt.sectionId ?? null, tgt.id, [...sibs.map((d) => d.id), moved.id]);
      return;
    }
    // before / after: same parent + section as target
    const parentId = tgt.parentId ?? null;
    const group = (parentId ? childrenOf(parentId) : topLevel(tgt.sectionId ?? "")).filter(
      (d) => d.id !== moved.id,
    );
    const idx = group.findIndex((d) => d.id === tgt.id);
    const at = target.zone === "before" ? idx : idx + 1;
    const ordered = [...group.map((d) => d.id)];
    ordered.splice(at, 0, moved.id);
    onMovePage(moved.id, tgt.sectionId ?? null, parentId, ordered);
  };

  const performSectionDrop = (targetId: string) => {
    if (!dragSection || dragSection === targetId) return;
    const ids = [...sections].sort((a, b) => a.position - b.position).map((s) => s.id);
    const from = ids.indexOf(dragSection);
    ids.splice(from, 1);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, dragSection);
    onMoveSection(ids);
  };

  const clearDrag = () => {
    setDragPage(null);
    setDragSection(null);
    setDrop(null);
    setDropSection(null);
  };

  const startRename = (kind: "page" | "section", id: string, current: string) => {
    setRenaming({ kind, id });
    setRenameText(current);
    setMenu(null);
  };
  const commitRename = () => {
    if (!renaming) return;
    const text = renameText.trim();
    if (text) {
      if (renaming.kind === "page") onRenamePage(renaming.id, text);
      else onRenameSection(renaming.id, text);
    }
    setRenaming(null);
  };

  /* ---- render a page node + its descendants ---- */
  const renderPage = (doc: DesignDoc, depth: number): React.ReactNode => {
    const kids = childrenOf(doc.id);
    const isRenaming = renaming?.kind === "page" && renaming.id === doc.id;
    const dropHere = drop?.kind === "page" && drop.id === doc.id ? drop.zone : null;
    return (
      <div key={doc.id}>
        <div
          className={
            "nav-item" +
            (doc.id === active.id ? " is-active" : "") +
            (dragPage === doc.id ? " is-dragging" : "") +
            (dropHere ? ` drop-${dropHere}` : "")
          }
          style={{ paddingLeft: 9 + depth * 16 }}
          draggable={canEdit}
          onClick={() => onSelect(doc.id)}
          onDragStart={(e) => {
            setDragSection(null);
            setDragPage(doc.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={clearDrag}
          onDragOver={(e) => {
            if (!dragPage || dragPage === doc.id) return;
            e.preventDefault();
            e.stopPropagation();
            setDropSection(null);
            const r = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - r.top;
            const zone: Zone = y < r.height * 0.3 ? "before" : y > r.height * 0.7 ? "after" : "inside";
            setDrop({ kind: "page", id: doc.id, zone });
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            performPageDrop(drop);
            clearDrag();
          }}
        >
          {kids.length > 0 ? (
            <Chevron className="nav-chevron nav-twisty" />
          ) : (
            <span className="nav-twisty-spacer" />
          )}
          <Doc className="nav-icon" />
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
            <span className="nav-title">{doc.title}</span>
          )}
          {canEdit && (
            <button
              className="row-dots"
              title="Page options"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m?.kind === "page" && m.id === doc.id ? null : { kind: "page", id: doc.id }));
              }}
            >
              <Dots className="row-dots-icon" />
            </button>
          )}
          <span className={"nav-status status-" + doc.status} />
          {menu?.kind === "page" && menu.id === doc.id && (
            <div className="row-menu" onClick={(e) => e.stopPropagation()}>
              <button onMouseDown={(e) => { e.preventDefault(); startRename("page", doc.id, doc.title); }}>
                <Pencil /> Rename
              </button>
              <button
                className="danger"
                onMouseDown={(e) => { e.preventDefault(); setMenu(null); onDeletePage(doc.id); }}
              >
                <Trash /> Move to trash
              </button>
            </div>
          )}
        </div>
        {kids.map((k) => renderPage(k, depth + 1))}
      </div>
    );
  };

  const orderedSections = [...sections].sort((a, b) => a.position - b.position);

  return (
    <aside className="sidebar">
      <div className="section-head">
        <span className="section-icon">
          <Sun className="section-icon-svg" />
        </span>
        <div>
          <div className="section-name">{active.group}</div>
          <div className="section-meta">
            {docs.filter((d) => d.group === active.group).length} pages
          </div>
        </div>
      </div>

      <div className="nav-label-row">
        <span className="nav-label">Workspace</span>
        {canEdit && <span className="drag-hint">drag to reorder / nest</span>}
      </div>

      <nav className="nav">
        {orderedSections.map((sec) => {
          const tops = topLevel(sec.id);
          const isRenaming = renaming?.kind === "section" && renaming.id === sec.id;
          const hasPages = docs.some((d) => d.sectionId === sec.id);
          const pageCount = docs.filter((d) => d.sectionId === sec.id).length;
          const isCollapsed = collapsed.has(sec.id);
          return (
            <div
              key={sec.id}
              className={"nav-group" + (dropSection === sec.id ? " drop-section" : "")}
              onDragOver={(e) => {
                if (dragPage) {
                  e.preventDefault();
                  setDropSection(sec.id);
                }
              }}
              onDrop={(e) => {
                if (dragPage) {
                  e.preventDefault();
                  performPageDrop({ kind: "section", id: sec.id });
                  clearDrag();
                }
              }}
            >
              <div
                className="nav-group-label"
                draggable={canEdit}
                onDragStart={(e) => {
                  setDragPage(null);
                  setDragSection(sec.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (dragSection && dragSection !== sec.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragSection) {
                    e.preventDefault();
                    performSectionDrop(sec.id);
                    clearDrag();
                  }
                }}
              >
                {isRenaming ? (
                  <input
                    className="nav-rename section-rename"
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <button
                    type="button"
                    className="nav-group-toggle"
                    aria-expanded={!isCollapsed}
                    title={isCollapsed ? `Show pages in ${sec.name}` : `Hide pages in ${sec.name}`}
                    onClick={() => setSectionCollapsed(sec.id, !isCollapsed)}
                  >
                    <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} className="nav-group-chevron" />
                    <span className="nav-group-name">{sec.name}</span>
                    {isCollapsed && (
                      <span className="nav-group-count" aria-label={`${pageCount} ${pageCount === 1 ? "page" : "pages"}`}>
                        {pageCount}
                      </span>
                    )}
                  </button>
                )}
                {canEdit && (
                <span className="nav-group-actions">
                  <button
                    className="nav-add"
                    title={`Add page to ${sec.name}`}
                    onClick={() => {
                      setSectionCollapsed(sec.id, false);
                      onNewPage(sec.id, sec.name);
                    }}
                  >
                    <Plus className="nav-add-icon" />
                  </button>
                  <button
                    className="row-dots"
                    title="Section options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu((m) =>
                        m?.kind === "section" && m.id === sec.id ? null : { kind: "section", id: sec.id },
                      );
                    }}
                  >
                    <Dots className="row-dots-icon" />
                  </button>
                </span>
                )}
                {menu?.kind === "section" && menu.id === sec.id && (
                  <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                    <button onMouseDown={(e) => { e.preventDefault(); startRename("section", sec.id, sec.name); }}>
                      <Pencil /> Rename
                    </button>
                    <button
                      className="danger"
                      disabled={hasPages}
                      title={hasPages ? "Section must be empty to delete" : undefined}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (hasPages) return;
                        setMenu(null);
                        onDeleteSection(sec.id);
                      }}
                    >
                      <Trash /> Delete
                    </button>
                  </div>
                )}
              </div>
              {!isCollapsed && tops.map((doc) => renderPage(doc, 0))}
              {!isCollapsed && tops.length === 0 && <div className="nav-empty">No pages yet</div>}
            </div>
          );
        })}
      </nav>

      {canEdit && (
      <button className="new-page" onClick={() => onNewPage(active.sectionId ?? null, active.group)}>
        <Plus className="new-page-icon" />
        New page
      </button>
      )}

      {!canEdit ? null : newSectionOpen ? (
        <input
          className="new-section-input"
          autoFocus
          placeholder="Section name…"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = newSectionName.trim();
              setNewSectionOpen(false);
              setNewSectionName("");
              if (n) onNewSection(n);
            }
            if (e.key === "Escape") {
              setNewSectionOpen(false);
              setNewSectionName("");
            }
          }}
          onBlur={() => {
            const n = newSectionName.trim();
            setNewSectionOpen(false);
            setNewSectionName("");
            if (n) onNewSection(n);
          }}
        />
      ) : (
        <button className="new-page" onClick={() => setNewSectionOpen(true)}>
          <Plus className="new-page-icon" />
          New section
        </button>
      )}
      <LinkedDocuments key={workspaceId} workspaceId={workspaceId} canEdit={canEdit} />
      {canEdit && onOpenTrash && (
        <button className="new-page sidebar-trash" onClick={onOpenTrash}>
          <Trash className="new-page-icon" />
          Trash
        </button>
      )}
    </aside>
  );
}
