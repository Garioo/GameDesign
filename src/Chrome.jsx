// Chrome.jsx — top header, floating bottom navbar, quick-find
import React, { useState, useEffect, useRef } from "react";
import { Icon, AvStack } from "./ui.jsx";
import { data } from "./data.js";

/* ---------------- top header ---------------- */
export function TopHeader({ view, page, onNav, account, onSignOut }) {
  const { game, sections, pages } = data;
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef(null);
  useEffect(() => {
    if (!acctOpen) return;
    const h = (e) => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [acctOpen]);
  const crumbs = [{ label: game.name, view: "home" }];
  if (view === "home") crumbs.push({ label: "Home" });
  if (view === "canvas") crumbs.push({ label: "Systems Canvas" });
  if (view === "board") crumbs.push({ label: "Production Board" });
  if (view === "table") crumbs.push({ label: "All Pages" });
  if (view === "doc" && page) {
    const sec = sections.find(s => s.id === pages[page].section);
    crumbs.push({ label: sec ? sec.name : "Pages", view: "home" });
    crumbs.push({ label: pages[page].title });
  }
  return (
    <header className="row between" style={{
      height: 56, padding: "0 20px 0 18px", borderBottom: "1px solid var(--line)",
      background: "color-mix(in srgb, var(--bg) 80%, transparent)", backdropFilter: "blur(10px)",
      position: "relative", zIndex: 30, flex: "none" }}>
      <div className="row g10" style={{ minWidth: 0 }}>
        <div className="row g8" style={{ flex: "none" }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--accent)",
            display: "grid", placeItems: "center", boxShadow: "var(--shadow-sm)", color: "#fff" }}>
            <Icon name="flame" size={17} stroke={1.8} />
          </span>
        </div>
        <nav className="row g6" style={{ minWidth: 0, overflow: "hidden" }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="faint" style={{ fontSize: 13 }}>/</span>}
              <span onClick={() => c.view && onNav(c.view)} style={{
                fontSize: 14, fontWeight: i === crumbs.length - 1 ? 600 : 500,
                color: i === crumbs.length - 1 ? "var(--ink)" : "var(--ink-2)",
                cursor: c.view ? "pointer" : "default", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
            </React.Fragment>
          ))}
        </nav>
      </div>
      <div className="row g14" style={{ flex: "none" }}>
        <span className="row g6 faint" style={{ fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--st-done)" }} />4 online
        </span>
        <AvStack ids={["AK", "MR", "JO", "LP"]} size={28} extra={1} />
        <button className="btn sm">Share</button>
        {onSignOut && (
          <span ref={acctRef} style={{ position: "relative", display: "inline-flex" }}>
            <button className="btn ghost sm" aria-label="Account" onClick={() => setAcctOpen(o => !o)}
              style={{ padding: "5px 7px" }}>
              <Icon name="dots" size={16} />
            </button>
            {acctOpen && (
              <div className="card" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60,
                padding: 6, minWidth: 200, boxShadow: "var(--shadow-lg)" }}>
                <div className="faint" style={{ fontSize: 12, padding: "6px 9px 8px", wordBreak: "break-all" }}>{account}</div>
                <div className="hr" style={{ margin: "0 0 5px" }} />
                <div onClick={() => { setAcctOpen(false); onSignOut(); }}
                  className="row g8" style={{ padding: "7px 9px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Icon name="arrow" size={15} /> Sign out
                </div>
              </div>
            )}
          </span>
        )}
      </div>
    </header>
  );
}

/* ---------------- floating bottom navbar ---------------- */
const NAV = [
  { view: "home",   icon: "home",   label: "Home" },
  { view: "doc",    icon: "doc",    label: "Pages" },
  { view: "canvas", icon: "canvas", label: "Canvas" },
  { view: "board",  icon: "board",  label: "Board" },
  { view: "table",  icon: "stack",  label: "Table" },
];
export function BottomNav({ view, onNav, onSearch, onNew }) {
  return (
    <div style={{ position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 40 }}>
      <div className="row g4" style={{
        padding: 7, borderRadius: 999, background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)", backdropFilter: "blur(14px)" }}>
        <button onClick={onSearch} className="row g8" style={navItemStyle(false)} title="Quick find ⌘K">
          <Icon name="search" size={18} />
          <span className="row g6" style={{ fontSize: 12.5 }}>
            <kbd className="mono" style={{ fontSize: 11, padding: "1px 5px", borderRadius: 5, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>⌘K</kbd>
          </span>
        </button>
        <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 3px" }} />
        {NAV.map(n => {
          const on = view === n.view;
          return (
            <button key={n.view} onClick={() => onNav(n.view)} className="row g8" style={navItemStyle(on)}>
              <Icon name={n.icon} size={18} stroke={on ? 2 : 1.7} />
              <span style={{ fontSize: 13.5, fontWeight: on ? 700 : 600 }}>{n.label}</span>
            </button>
          );
        })}
        <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 3px" }} />
        <button onClick={onNew} className="row g6" style={{ ...navItemStyle(false), background: "var(--accent)", color: "#fff" }}>
          <Icon name="plus" size={18} stroke={2.1} /><span style={{ fontSize: 13.5, fontWeight: 700 }}>New</span>
        </button>
      </div>
    </div>
  );
}
function navItemStyle(on) {
  return {
    border: "none", cursor: "pointer", borderRadius: 999, padding: "9px 15px",
    background: on ? "var(--accent-soft)" : "transparent",
    color: on ? "var(--accent-ink)" : "var(--ink-2)",
    fontFamily: "var(--font-ui)", transition: "background .15s, color .15s",
  };
}

/* ---------------- quick find ---------------- */
export function QuickFind({ open, onClose, onOpenPage }) {
  const { pages, sections } = data;
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  const list = Object.values(pages).filter(p =>
    !q || p.title.toLowerCase().includes(q.toLowerCase()) || (p.tags || []).some(t => t.includes(q.toLowerCase())));
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 80,
      background: "rgba(40,32,22,.22)", backdropFilter: "blur(3px)", display: "grid",
      placeItems: "start center", paddingTop: "12vh" }}>
      <div onMouseDown={e => e.stopPropagation()} className="card rise" style={{
        width: "min(560px, 92vw)", padding: 0, overflow: "hidden", boxShadow: "var(--shadow-lg)", animationDuration: ".22s" }}>
        <div className="row g10" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <Icon name="search" size={19} style={{ color: "var(--ink-2)" }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Jump to a page, system, character…"
            style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 16, fontFamily: "var(--font-ui)", color: "var(--ink)" }} />
          <kbd className="mono faint" style={{ fontSize: 11 }}>esc</kbd>
        </div>
        <div style={{ maxHeight: 340, overflow: "auto", padding: 7 }}>
          {list.length === 0 && <div className="muted" style={{ padding: 18, textAlign: "center", fontSize: 14 }}>No pages match “{q}”.</div>}
          {list.map(p => {
            const sec = sections.find(s => s.id === p.section);
            return (
              <div key={p.id} onClick={() => { onOpenPage(p.id); onClose(); }} className="row g10"
                style={{ padding: "10px 11px", borderRadius: 10, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
                  background: "var(--surface-2)", color: sec.color }}><Icon name={sec.icon} size={16} /></span>
                <div className="grow">
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{sec.name} · {p.kind}</div>
                </div>
                <Icon name="arrow" size={15} style={{ color: "var(--ink-3)" }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
