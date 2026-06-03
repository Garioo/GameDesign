// Canvas.jsx — spatial systems canvas (draggable nodes + links)
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon, StatusPill } from "./ui.jsx";
import { data } from "./data.js";

const W = 1500, H = 960, NW = 216, NH = 104;

export function Canvas({ onOpenPage, statuses }) {
  const { canvas, pages, sections } = data;
  const boardRef = useRef(null);
  const [nodes, setNodes] = useState(() =>
    Object.fromEntries(canvas.nodes.map(n => [n.id, { x: n.x / 100 * W, y: n.y / 100 * H }])));
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.82);
  const drag = useRef(null);

  useEffect(() => {
    const b = boardRef.current; if (!b) return;
    const r = b.getBoundingClientRect();
    setPan({ x: (r.width - W * 0.82) / 2, y: (r.height - H * 0.82) / 2 - 10 });
  }, []);

  const onMove = useCallback((e) => {
    const d = drag.current; if (!d) return;
    d.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (d.type === "node") {
      const r = boardRef.current.getBoundingClientRect();
      const nx = (e.clientX - r.left - pan.x) / scale - d.ox;
      const ny = (e.clientY - r.top - pan.y) / scale - d.oy;
      setNodes(prev => ({ ...prev, [d.id]: { x: nx, y: ny } }));
    } else {
      setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
    }
  }, [pan, scale]);

  const onUp = useCallback(() => {
    const d = drag.current;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (d && d.type === "node" && d.moved < 5) onOpenPage(d.id);
    drag.current = null;
  }, [onMove, onOpenPage]);

  const onPointerDown = (e, id) => {
    e.stopPropagation();
    const r = boardRef.current.getBoundingClientRect();
    drag.current = { type: "node", id, moved: 0,
      sx: e.clientX, sy: e.clientY,
      ox: (e.clientX - r.left - pan.x) / scale - nodes[id].x,
      oy: (e.clientY - r.top - pan.y) / scale - nodes[id].y };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onBoardDown = (e) => {
    drag.current = { type: "pan", moved: 0, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const zoom = (dir) => setScale(s => Math.min(1.4, Math.max(0.4, +(s + dir * 0.12).toFixed(2))));
  const center = (id) => nodes[id] ? { x: nodes[id].x + NW / 2, y: nodes[id].y + NH / 2 } : { x: 0, y: 0 };

  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="row between" style={{ position: "absolute", top: 16, left: 20, right: 20, zIndex: 20, pointerEvents: "none" }}>
        <div className="card" style={{ padding: "9px 15px", pointerEvents: "auto" }}>
          <div className="row g10">
            <Icon name="canvas" size={17} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Systems Canvas</span>
            <span className="faint mono" style={{ fontSize: 11.5 }}>{canvas.nodes.length} nodes · {canvas.edges.length} links</span>
          </div>
        </div>
        <div className="card row g4" style={{ padding: 5, pointerEvents: "auto" }}>
          <button className="btn ghost sm" onClick={() => zoom(-1)} style={{ padding: 7 }}><Icon name="zoomout" size={16} /></button>
          <span className="mono muted" style={{ fontSize: 12.5, width: 42, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
          <button className="btn ghost sm" onClick={() => zoom(1)} style={{ padding: 7 }}><Icon name="zoomin" size={16} /></button>
        </div>
      </div>

      <div ref={boardRef} onPointerDown={onBoardDown} style={{
        position: "absolute", inset: 0, cursor: drag.current?.type === "pan" ? "grabbing" : "grab",
        background: "var(--bg-2)",
        backgroundImage: "radial-gradient(color-mix(in srgb, var(--ink) 9%, transparent) 1.1px, transparent 1.1px)",
        backgroundSize: `${26 * scale}px ${26 * scale}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px` }}>

        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
            {canvas.edges.map(([a, b], i) => {
              const A = center(a), B = center(b);
              const mx = (A.x + B.x) / 2;
              return <path key={i} d={`M${A.x},${A.y} C${mx},${A.y} ${mx},${B.y} ${B.x},${B.y}`}
                fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeOpacity="0.45" strokeDasharray="1 7" strokeLinecap="round" />;
            })}
          </svg>
          {canvas.nodes.map(n => {
            const p = pages[n.id], s = sections.find(x => x.id === p.section);
            const st = statuses[n.id] || p.status;
            const pos = nodes[n.id];
            return (
              <div key={n.id} onPointerDown={(e) => onPointerDown(e, n.id)} className="lift" style={{
                position: "absolute", left: pos.x, top: pos.y, width: NW, minHeight: NH,
                background: "var(--surface)", border: "1px solid var(--line)", borderTop: `3px solid ${s.color}`,
                borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "12px 14px", cursor: "grab", userSelect: "none" }}>
                <div className="row g8" style={{ marginBottom: 8 }}>
                  <span style={{ color: s.color }}><Icon name={s.icon} size={16} /></span>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
                  <Icon name="grip" size={15} style={{ color: "var(--ink-3)" }} />
                </div>
                <div className="faint" style={{ fontSize: 11.5, marginBottom: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>{p.kind}</div>
                <div className="row between">
                  <StatusPill value={st} editable={false} />
                  <span className="tag mono" style={{ fontSize: 11, padding: "2px 7px" }}><Icon name="link" size={11} />{p.links.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="faint" style={{ position: "absolute", bottom: 92, left: 22, fontSize: 12.5, zIndex: 15, pointerEvents: "none" }}>
        Drag nodes to rearrange · drag canvas to pan · click a node to open
      </div>

      <div className="card" style={{ position: "absolute", bottom: 22, right: 22, width: 168, padding: 8, zIndex: 20 }}>
        <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Overview</div>
        <div style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}`, background: "var(--bg-2)", borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)" }}>
          {canvas.edges.map(([a, b], i) => {
            const A = center(a), B = center(b);
            return <svg key={i} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
              <line x1={`${A.x/W*100}%`} y1={`${A.y/H*100}%`} x2={`${B.x/W*100}%`} y2={`${B.y/H*100}%`} stroke="var(--accent)" strokeWidth="1" strokeOpacity=".4" /></svg>;
          })}
          {canvas.nodes.map(n => {
            const s = sections.find(x => x.id === pages[n.id].section), pos = nodes[n.id];
            return <span key={n.id} style={{ position: "absolute", left: `${(pos.x+NW/2)/W*100}%`, top: `${(pos.y+NH/2)/H*100}%`,
              width: 7, height: 7, borderRadius: "50%", background: s.color, transform: "translate(-50%,-50%)" }} />;
          })}
        </div>
      </div>
    </div>
  );
}
