// ui.jsx — shared hi-fi UI kit
import React, { useState, useRef, useEffect } from "react";
import { data } from "./data.js";

/* ---------------- icons ---------------- */
const PATHS = {
  // section icons
  compass: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6"/></>,
  book: <><path d="M5 4.5A1.5 1.5 0 016.5 3H18a1 1 0 011 1v15a1 1 0 01-1 1H6.5A1.5 1.5 0 005 21.5z"/><path d="M5 18.5A1.5 1.5 0 016.5 17H19"/><path d="M9 7.5h6M9 11h6"/></>,
  map: <><path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/></>,
  palette: <><path d="M12 3a9 9 0 100 18c1.4 0 2-1 1.7-2-.3-1.2.5-2 1.8-2H17a4 4 0 004-4c0-4.4-4-7-9-7z"/><circle cx="8" cy="11.5" r="1.1"/><circle cx="12" cy="8" r="1.1"/><circle cx="15.5" cy="11" r="1.1"/></>,
  wave: <><path d="M4 12h2M8 7v10M12 4v16M16 8v8M20 11v2"/></>,
  frame: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8.5 9v10.5"/></>,
  coin: <><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12l2.5 2.5L16 9"/></>,
  stack: <><path d="M12 3l8 4-8 4-8-4 8-4z"/><path d="M4 12l8 4 8-4M4 16.5l8 4 8-4"/></>,
  // ui icons
  search: <><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.8-3.8"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  link: <><path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1"/></>,
  comment: <><path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 16.5H10l-4 3.5V16.5H5A1.5 1.5 0 013.5 15V7A1.5 1.5 0 015 5.5z"/></>,
  bell: <><path d="M6.5 10a5.5 5.5 0 1111 0c0 4.5 1.8 5.5 1.8 5.5H4.7S6.5 14.5 6.5 10z"/><path d="M10 19a2 2 0 004 0"/></>,
  home: <><path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9.5h12V10"/></>,
  canvas: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 13.5v7M13.5 17h7"/></>,
  board: <><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></>,
  doc: <><path d="M6 3.5h8L18.5 8v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 12h7M8.5 15.5h7"/></>,
  chev: <><path d="M9 6l6 6-6 6"/></>,
  chevd: <><path d="M6 9l6 6 6-6"/></>,
  dots: <><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></>,
  flame: <><path d="M12 3s5 4 5 9a5 5 0 11-10 0c0-1.8 1-3 1-3 .5 1.5 1.5 2 1.5 2C9 8 12 3 12 3z"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l2.8 1.8"/></>,
  flag: <><path d="M6 21V4M6 4h11l-2.2 4L17 12H6"/></>,
  x: <><path d="M6 6l12 12M18 6L6 18"/></>,
  sparkle: <><path d="M12 4l1.6 4.6L18 10l-4.4 1.4L12 16l-1.6-4.6L6 10l4.4-1.4z"/></>,
  filter: <><path d="M4 5.5h16l-6 7v5.5l-4 2v-7.5z"/></>,
  grip: <><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></>,
  reply: <><path d="M9 7L4 12l5 5"/><path d="M4 12h9a6 6 0 016 6v1"/></>,
  zoomin: <><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5M11 8.5v5M8.5 11h5"/></>,
  zoomout: <><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5M8.5 11h5"/></>,
  // block-editor icons
  text: <><path d="M5 6h14M5 12h14M5 18h9"/></>,
  heading: <><path d="M6 5v14M16 5v14M6 12h10"/></>,
  list: <><circle cx="4.5" cy="6.5" r="1.3"/><circle cx="4.5" cy="12" r="1.3"/><circle cx="4.5" cy="17.5" r="1.3"/><path d="M9 6.5h11M9 12h11M9 17.5h11"/></>,
  quote: <><path d="M9 6H6a2 2 0 00-2 2v3a2 2 0 002 2h2v1a3 3 0 01-3 3M20 6h-3a2 2 0 00-2 2v3a2 2 0 002 2h2v1a3 3 0 01-3 3"/></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15"/></>,
  divider: <><path d="M3 12h18"/><circle cx="12" cy="6" r="1"/><circle cx="12" cy="18" r="1"/></>,
  bold: <><path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/></>,
  italic: <><path d="M10 5h8M6 19h8M14 5l-4 14"/></>,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></>,
};
export function Icon({ name, size = 18, stroke = 1.7, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: "none", ...style }} className={className}>
      {PATHS[name] || PATHS.doc}
    </svg>
  );
}

/* ---------------- avatars ---------------- */
const TEAM = () => data.team;
export function Avatar({ id, size = 28, ring = true }) {
  const m = TEAM()[id] || { color: "#999", name: id };
  const ini = m.initials || (m.name ? m.name.split(" ").map(w => w[0]).slice(0,2).join("") : id);
  return <span className="av" title={m.name} style={{
    width: size, height: size, background: m.color, fontSize: size * 0.4,
    border: ring ? "2px solid var(--surface)" : "none" }}>{ini}</span>;
}
export function AvStack({ ids, size = 28, extra }) {
  return <span className="av-stack">
    {ids.map(id => <Avatar key={id} id={id} size={size} />)}
    {extra > 0 && <span className="av" style={{ width: size, height: size, background: "var(--surface-2)", color: "var(--ink-2)", fontSize: size*0.36 }}>+{extra}</span>}
  </span>;
}

/* ---------------- status pill w/ inline editor ---------------- */
const STATUSES = [
  { k: "todo", label: "Not started" }, { k: "wip", label: "In progress" },
  { k: "review", label: "In review" }, { k: "done", label: "Done" }, { k: "block", label: "Blocked" },
];
export const STMAP = Object.fromEntries(STATUSES.map(s => [s.k, s.label]));
export function StatusPill({ value, onChange, editable = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span className={"spill s-" + value} onClick={() => editable && setOpen(o => !o)} style={{ cursor: editable ? "pointer" : "default" }}>
        <i className="d" />{STMAP[value] || value}
        {editable && <Icon name="chevd" size={13} style={{ marginLeft: 1, opacity: .55 }} />}
      </span>
      {open && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
          padding: 5, minWidth: 168, boxShadow: "var(--shadow-lg)" }}>
          {STATUSES.map(s => (
            <div key={s.k} onClick={() => { onChange && onChange(s.k); setOpen(false); }}
              className="row g8" style={{ padding: "7px 9px", borderRadius: 8, cursor: "pointer",
                background: s.k === value ? "var(--surface-2)" : "transparent", fontSize: 13.5, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={e => e.currentTarget.style.background = s.k === value ? "var(--surface-2)" : "transparent"}>
              <i className="d" style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--st-${s.k})` }} />
              {s.label}
              {s.k === value && <Icon name="check" size={14} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/* ---------------- progress ring ---------------- */
export function Ring({ value, size = 92, stroke = 9, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value/100)}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="disp" style={{ fontSize: size * 0.34, lineHeight: 1 }}>{value}<span style={{ fontSize: size*0.16 }}>%</span></div>
          {label && <div className="faint" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

export function Tag({ children, link, mono, onClick, style }) {
  return <span className={"tag" + (link ? " link" : "") + (mono ? " mono" : "")} onClick={onClick} style={style}>{children}</span>;
}
