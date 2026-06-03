// Board.jsx — production board (kanban) with drag & drop
import React, { useState } from "react";
import { Icon, Avatar } from "./ui.jsx";
import { data } from "./data.js";

export function Board({ onOpenPage }) {
  const { boardCols, colStatus, tasks: seed, sections } = data;
  const [tasks, setTasks] = useState(seed);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

  const move = (id, col) => setTasks(ts => ts.map(t => t.id === id ? { ...t, col } : t));
  const byCol = (c) => tasks.filter(t => t.col === c);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="row between" style={{ padding: "18px 24px 14px", flex: "none" }}>
        <div className="row g10">
          <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="check" size={17} /></span>
          <h2 className="disp" style={{ fontSize: 26 }}>Production Board</h2>
          <span className="faint mono" style={{ fontSize: 12 }}>{tasks.length} tasks · vertical slice</span>
        </div>
        <div className="row g8">
          <button className="btn ghost sm"><Icon name="filter" size={15} />Discipline</button>
          <button className="btn ghost sm">Assignee</button>
          <button className="btn pri sm"><Icon name="plus" size={15} />Task</button>
        </div>
      </div>

      <div className="row" style={{ flex: 1, minHeight: 0, gap: 14, padding: "4px 24px 120px", overflowX: "auto", alignItems: "stretch" }}>
        {boardCols.map(col => {
          const list = byCol(col.id);
          const isOver = over === col.id;
          return (
            <div key={col.id} style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", minHeight: 0 }}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag, col.id); setDrag(null); setOver(null); }}>
              <div className="row g8" style={{ padding: "4px 6px 10px", flex: "none" }}>
                <span className="d" style={{ width: 9, height: 9, borderRadius: "50%", background: `var(--st-${colStatus[col.id]})` }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{col.name}</span>
                <span className="faint mono" style={{ fontSize: 12 }}>{list.length}</span>
                <span className="grow" />
                <Icon name="plus" size={15} style={{ color: "var(--ink-3)", cursor: "pointer" }} />
              </div>
              <div className="col g10" style={{
                flex: 1, overflowY: "auto", padding: "3px", borderRadius: 14,
                background: isOver ? "var(--accent-soft)" : "transparent",
                outline: isOver ? "1.5px dashed var(--accent-line)" : "1.5px dashed transparent",
                transition: "background .12s, outline-color .12s" }}>
                {list.map(t => {
                  const s = sections.find(x => x.id === t.section);
                  const dragging = drag === t.id;
                  return (
                    <div key={t.id} draggable
                      onDragStart={() => setDrag(t.id)}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => t.page && onOpenPage(t.page)}
                      className="card lift" style={{ padding: "13px 14px", cursor: "grab", boxShadow: "var(--shadow-sm)",
                        opacity: dragging ? .4 : 1, borderLeft: `3px solid ${s.color}` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 10, textWrap: "pretty" }}>{t.title}</div>
                      <div className="row between">
                        <span className="tag" style={{ padding: "2px 8px", fontSize: 11.5, color: s.color, borderColor: "var(--line)" }}>
                          <Icon name={s.icon} size={12} />{s.name.split(" ")[0]}</span>
                        <div className="row g8">
                          {t.due && <span className="faint mono row g4" style={{ fontSize: 11 }}><Icon name="clock" size={12} />{t.due}</span>}
                          <Avatar id={t.who} size={22} ring={false} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="row g6 faint" style={{ padding: "9px 11px", fontSize: 12.5, cursor: "pointer", justifyContent: "center",
                  border: "1.5px dashed var(--line)", borderRadius: 11 }}><Icon name="plus" size={13} />Add card</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
