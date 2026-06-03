"use client";

import { useMemo, useState } from "react";
import BlockEditor from "./BlockEditor";
import {
  seedDocs,
  STATUS_LABEL,
  type DesignDoc,
  type RefIcon,
  type Status,
} from "./data";

const STATUS_ORDER: Status[] = ["todo", "wip", "review", "done"];

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
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
const LinkIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const Compass = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" />
  </svg>
);
const Database = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" />
  </svg>
);
const ChevronDown = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const Plus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Search = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);
const HomeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
const Grid = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const Columns = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" />
  </svg>
);
const TableIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
  </svg>
);

const refIcon = (kind: RefIcon) => {
  if (kind === "mechanic") return <Sun className="ref-icon" />;
  if (kind === "vision") return <Compass className="ref-icon" />;
  if (kind === "economy") return <Database className="ref-icon" />;
  return <Doc className="ref-icon" />;
};

export default function DocPage() {
  const [docs, setDocs] = useState<DesignDoc[]>(seedDocs);
  const [activeId, setActiveId] = useState<string>(seedDocs[0].id);

  const active = docs.find((d) => d.id === activeId) ?? docs[0];

  // Group docs for the sidebar, preserving first-seen group order.
  const groups = useMemo(() => {
    const map = new Map<string, DesignDoc[]>();
    for (const doc of docs) {
      const list = map.get(doc.group) ?? [];
      list.push(doc);
      map.set(doc.group, list);
    }
    return Array.from(map.entries());
  }, [docs]);

  const update = (id: string, patch: Partial<DesignDoc>) =>
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div className="app">
      {/* ---------------- top bar ---------------- */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">
            <Flame className="logo-icon" />
          </span>
          <span className="brand-name">EMBERWICK</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-muted">{active.group}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{active.title}</span>
        </div>
        <div className="top-right">
          <span className="online-dot" />
          <span className="online-text">4 online</span>
          <div className="avatar-stack">
            {docs.slice(0, 4).map((d) => (
              <span key={d.id} className="avatar" style={{ background: d.ownerColor }}>
                {d.owner}
              </span>
            ))}
          </div>
          <button className="share-btn">Share</button>
        </div>
      </header>

      <div className="body">
        {/* ---------------- left sidebar ---------------- */}
        <aside className="sidebar">
          <div className="section-head">
            <span className="section-icon">
              <Sun className="section-icon-svg" />
            </span>
            <div>
              <div className="section-name">{active.group}</div>
              <div className="section-meta">
                {groups.find(([g]) => g === active.group)?.[1].length ?? 0} pages
              </div>
            </div>
          </div>

          <div className="nav-label-row">
            <span className="nav-label">In this section</span>
            <span className="drag-hint">drag to nest</span>
          </div>

          <nav className="nav">
            {groups.map(([group, list]) => (
              <div key={group} className="nav-group">
                {group !== active.group && (
                  <div className="nav-group-label">{group}</div>
                )}
                {list.map((doc) => (
                  <button
                    key={doc.id}
                    className={"nav-item" + (doc.id === active.id ? " is-active" : "")}
                    onClick={() => setActiveId(doc.id)}
                  >
                    {doc.id === active.id && <Chevron className="nav-chevron" />}
                    <Doc className="nav-icon" />
                    <span className="nav-title">{doc.title}</span>
                    <span className={"nav-status status-" + doc.status} />
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <button className="new-page">
            <Plus className="new-page-icon" />
            New page
          </button>
        </aside>

        {/* ---------------- main document ---------------- */}
        <main className="main">
          <article className="doc">
            <div className="doc-crumb">
              {active.group} <span className="dot">·</span> {active.kind}
            </div>

            <Editable
              tag="h1"
              className="doc-title"
              value={active.title}
              onSave={(v) => update(active.id, { title: v })}
            />

            <Editable
              tag="p"
              className="doc-subtitle"
              value={active.subtitle}
              placeholder="Add a one-line summary…"
              onSave={(v) => update(active.id, { subtitle: v })}
            />

            {/* meta card */}
            <div className="meta-card">
              <div className="meta-row">
                <span className="meta-key">Status</span>
                <label className={"status-pill status-" + active.status}>
                  <span className="status-dot" />
                  <select
                    className="status-select"
                    value={active.status}
                    onChange={(e) =>
                      update(active.id, { status: e.target.value as Status })
                    }
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="status-chevron" />
                </label>
              </div>
              <div className="meta-row">
                <span className="meta-key">Owner</span>
                <span className="owner">
                  <span className="owner-avatar" style={{ background: active.ownerColor }}>
                    {active.owner}
                  </span>
                  {active.ownerName}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Tags</span>
                <span className="tags">
                  {active.tags.map((t) => (
                    <span key={t} className="tag"># {t}</span>
                  ))}
                </span>
              </div>
              {active.links.length > 0 && (
                <div className="meta-row">
                  <span className="meta-key">Links to</span>
                  <span className="links">
                    {active.links.map((l) => {
                      const target = docs.find((d) => d.title === l);
                      return (
                        <button
                          key={l}
                          className="link-chip"
                          onClick={() => target && setActiveId(target.id)}
                        >
                          <LinkIcon className="link-icon" /> {l}
                        </button>
                      );
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* block editor body */}
            <BlockEditor
              key={active.id}
              blocks={active.blocks}
              onChange={(b) => update(active.id, { blocks: b })}
            />
          </article>
        </main>

        {/* ---------------- right rail ---------------- */}
        <aside className="rail">
          <div className="rail-head">
            <LinkIcon className="rail-head-icon" />
            <span>Linked references</span>
            <span className="rail-badge">{active.refs.length}</span>
          </div>

          <div className="ref-list">
            {active.refs.map((r) => {
              const target = docs.find((d) => d.title === r.title);
              return (
                <button
                  key={r.title}
                  className="ref-card"
                  onClick={() => target && setActiveId(target.id)}
                >
                  <div className="ref-title">
                    {refIcon(r.icon)}
                    {r.title}
                  </div>
                  <p className="ref-text">{r.text}</p>
                </button>
              );
            })}
          </div>

          <div className="rail-footer">
            <div className="foot-row">
              <span className="foot-key">Last edited</span>
              <span className="foot-val">2h ago</span>
            </div>
            <div className="foot-row">
              <span className="foot-key">Contributors</span>
              <div className="foot-avatars">
                {docs.slice(0, 3).map((d) => (
                  <span key={d.id} className="foot-avatar" style={{ background: d.ownerColor }}>
                    {d.owner}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------- floating dock ---------------- */}
      <nav className="dock">
        <button className="dock-search">
          <Search className="dock-search-icon" />
          <kbd className="kbd">⌘K</kbd>
        </button>
        <span className="dock-divider" />
        <button className="dock-item">
          <HomeIcon className="dock-icon" /> Home
        </button>
        <button className="dock-item is-active">
          <Doc className="dock-icon" /> Pages
        </button>
        <button className="dock-item">
          <Grid className="dock-icon" /> Canvas
        </button>
        <button className="dock-item">
          <Columns className="dock-icon" /> Board
        </button>
        <button className="dock-item">
          <TableIcon className="dock-icon" /> Table
        </button>
        <button className="dock-new">
          <Plus className="dock-new-icon" /> New
        </button>
      </nav>
    </div>
  );
}

// Inline-editable text. Saves on blur; single-line fields commit on Enter.
function Editable({
  tag: Tag,
  value,
  onSave,
  className,
  placeholder,
}: {
  tag: "h1" | "h2" | "p";
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const multiline = Tag === "p";
  return (
    <Tag
      className={(className ?? "") + " editable"}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => {
        const text = e.currentTarget.innerText.trim();
        if (text !== value) onSave(text);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}
