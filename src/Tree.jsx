// Tree.jsx — nestable, drag-to-reorder page tree for the doc rail
import React, { useState } from "react";
import { Icon } from "./ui.jsx";
import { data } from "./data.js";
import { useEWStore, store } from "./store.js";

/* flatten nested nodes into rows, respecting collapse */
function flatten(nodes, collapsed, depth = 0, parent = null, out = []) {
  for (const n of nodes) {
    const hasKids = n.children && n.children.length > 0;
    out.push({ id: n.id, depth, parent, hasKids });
    if (hasKids && !collapsed[n.id]) flatten(n.children, collapsed, depth + 1, n.id, out);
  }
  return out;
}

export function SectionTree({ sectionId, currentId, onOpenPage }) {
  const { pages } = data;
  const tree = useEWStore((s) => s.tree[sectionId]) || { nodes: [], collapsed: {} };
  const [drag, setDrag] = useState(null);     // id being dragged
  const [over, setOver] = useState(null);      // { id, mode }

  const rows = flatten(tree.nodes, tree.collapsed);

  const onDragOver = (e, id) => {
    e.preventDefault();
    if (drag == null || id === drag) { setOver(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientY - r.top) / r.height;
    const mode = f < 0.3 ? "before" : f > 0.7 ? "after" : "child";
    setOver({ id, mode });
  };
  const drop = (e) => {
    e.preventDefault();
    if (drag != null && over) store.moveNode(sectionId, drag, over.id, over.mode);
    setDrag(null); setOver(null);
  };
  const dropRoot = (e) => {
    e.preventDefault();
    if (drag != null) store.moveNode(sectionId, drag, null, "root");
    setDrag(null); setOver(null);
  };

  return (
    <div className="ew-tree" onDragEnd={() => { setDrag(null); setOver(null); }}>
      {rows.map((row) => {
        const p = pages[row.id];
        if (!p) return null;
        const on = row.id === currentId;
        const isOver = over && over.id === row.id;
        return (
          <div key={row.id}
            draggable
            onDragStart={(e) => { setDrag(row.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", row.id); } catch (_) {} }}
            onDragOver={(e) => onDragOver(e, row.id)}
            onDragLeave={() => setOver((o) => (o && o.id === row.id ? null : o))}
            onDrop={drop}
            onClick={() => onOpenPage(row.id)}
            className={"ew-tree-row" + (on ? " on" : "") + (drag === row.id ? " dragging" : "") +
              (isOver ? " over-" + over.mode : "")}
            style={{ paddingLeft: 8 + row.depth * 16 }}
            title={p.title}>
            <span className="ew-grip" onClick={(e) => e.stopPropagation()}><Icon name="grip" size={13} /></span>
            {row.hasKids ? (
              <span className="ew-twist" onClick={(e) => { e.stopPropagation(); store.toggleCollapse(sectionId, row.id); }}
                style={{ transform: tree.collapsed[row.id] ? "rotate(-90deg)" : "none" }}>
                <Icon name="chevd" size={13} />
              </span>
            ) : <span className="ew-twist ghost" />}
            <Icon name="doc" size={14.5} style={{ opacity: .55, flex: "none" }} />
            <span className="ew-tree-label" style={{ fontWeight: on ? 700 : 500 }}>{p.title}</span>
          </div>
        );
      })}
      {/* root drop zone + new page */}
      <div className={"ew-tree-root-drop" + (drag != null ? " armed" : "")}
        onDragOver={(e) => { e.preventDefault(); }} onDrop={dropRoot}>
        {drag != null ? "Drop here to move to top level" : ""}
      </div>
      <div className="ew-tree-new" onClick={() => { const id = store.createPage(sectionId, null); onOpenPage(id); }}>
        <Icon name="plus" size={14} />New page
      </div>
    </div>
  );
}
