// Table.jsx — database / table view
import React, { useState } from "react";
import { Icon, Avatar, StatusPill } from "./ui.jsx";
import { data } from "./data.js";

const STORDER = { todo: 0, wip: 1, review: 2, done: 3, block: 4 };

export function Table({ onOpenPage, statuses, setStatus }) {
  const { pages, sections, backlinks, team } = data;
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("section");
  const [mode, setMode] = useState("table");
  const stOf = (p) => statuses[p.id] || p.status;

  let rows = Object.values(pages).filter(p => filter === "all" || p.section === filter);
  rows = rows.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "status") return STORDER[stOf(a)] - STORDER[stOf(b)];
    return a.section.localeCompare(b.section) || a.title.localeCompare(b.title);
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="row between" style={{ padding: "18px 26px 12px", flex: "none" }}>
        <div className="row g10">
          <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--ink-2)" }}><Icon name="board" size={16} /></span>
          <h2 className="disp" style={{ fontSize: 26 }}>All Pages</h2>
          <span className="faint mono" style={{ fontSize: 12 }}>{rows.length} of {Object.keys(pages).length}</span>
        </div>
        <div className="row g6" style={{ padding: 4, borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {[["table", "Table"], ["gallery", "Gallery"]].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className="row g6" style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "6px 12px",
              fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600,
              background: mode === m ? "var(--surface)" : "transparent", color: mode === m ? "var(--ink)" : "var(--ink-2)",
              boxShadow: mode === m ? "var(--shadow-sm)" : "none" }}>
              <Icon name={m === "table" ? "board" : "canvas"} size={14} />{l}</button>
          ))}
        </div>
      </div>

      <div className="row between" style={{ padding: "0 26px 12px", flex: "none", gap: 12 }}>
        <div className="row wrap g6" style={{ minWidth: 0 }}>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          {sections.map(s => (
            <Chip key={s.id} active={filter === s.id} color={s.color} onClick={() => setFilter(s.id)}>
              <Icon name={s.icon} size={12} />{s.name.split(" ")[0]}</Chip>
          ))}
        </div>
        <div className="row g8" style={{ flex: "none" }}>
          <span className="faint" style={{ fontSize: 12.5 }}>Sort</span>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{
            fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600, color: "var(--ink)",
            border: "1px solid var(--line-strong)", borderRadius: 9, padding: "6px 10px", background: "var(--surface)", cursor: "pointer" }}>
            <option value="section">Section</option><option value="status">Status</option><option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 26px 120px" }}>
        {mode === "table" ? (
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <div className="row" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, zIndex: 1 }}>
              {[["Page", "2.4"], ["Section", "1.4"], ["Status", "1.2"], ["Owner", "1.3"], ["Links", ".8"], ["Updated", "1"]].map(([c, f]) =>
                <div key={c} className="eyebrow" style={{ flex: f, padding: "11px 16px", fontSize: 10.5 }}>{c}</div>)}
            </div>
            {rows.map((p, i) => {
              const s = sections.find(x => x.id === p.section), bl = (backlinks[p.id] || []).length;
              return (
                <div key={p.id} className="row" style={{ borderTop: i ? "1px solid var(--line)" : "none", alignItems: "center", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div className="row g10" style={{ flex: "2.4", padding: "12px 16px", minWidth: 0 }} onClick={() => onOpenPage(p.id)}>
                    <Icon name="doc" size={15} style={{ color: "var(--ink-3)", flex: "none" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                      <div className="faint" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.kind}</div>
                    </div>
                  </div>
                  <div style={{ flex: "1.4", padding: "12px 16px" }} onClick={() => onOpenPage(p.id)}>
                    <span className="tag" style={{ color: s.color }}><Icon name={s.icon} size={12} />{s.name.split(" ")[0]}</span>
                  </div>
                  <div style={{ flex: "1.2", padding: "10px 16px" }}><StatusPill value={stOf(p)} onChange={(v) => setStatus(p.id, v)} /></div>
                  <div className="row g8" style={{ flex: "1.3", padding: "12px 16px" }} onClick={() => onOpenPage(p.id)}>
                    <Avatar id={p.owner} size={24} ring={false} /><span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team[p.owner].name.split(" ")[0]}</span>
                  </div>
                  <div style={{ flex: ".8", padding: "12px 16px" }} onClick={() => onOpenPage(p.id)}>
                    <span className="tag link mono" style={{ fontSize: 11 }}><Icon name="link" size={11} />{p.links.length + bl}</span>
                  </div>
                  <div className="faint mono" style={{ flex: "1", padding: "12px 16px", fontSize: 12 }} onClick={() => onOpenPage(p.id)}>{p.updated}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 14 }}>
            {rows.map(p => {
              const s = sections.find(x => x.id === p.section);
              return (
                <div key={p.id} onClick={() => onOpenPage(p.id)} className="card lift" style={{ padding: "16px 17px", cursor: "pointer", borderTop: `3px solid ${s.color}` }}>
                  <div className="row between" style={{ marginBottom: 10 }}>
                    <span className="tag" style={{ color: s.color }}><Icon name={s.icon} size={12} />{s.name.split(" ")[0]}</span>
                    <StatusPill value={stOf(p)} editable={false} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>{p.title}</div>
                  <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.summary}</div>
                  <div className="row between">
                    <Avatar id={p.owner} size={24} ring={false} />
                    <span className="faint mono" style={{ fontSize: 11 }}>{p.updated}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, color, onClick, children }) {
  return <span onClick={onClick} className="row g6" style={{
    fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    border: "1px solid " + (active ? "var(--accent)" : "var(--line)"),
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-ink)" : (color || "var(--ink-2)") }}>{children}</span>;
}
