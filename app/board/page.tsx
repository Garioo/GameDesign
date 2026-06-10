"use client";

import { useState, useRef } from "react";

/* ── CSS injected into the component (mirrors globals.css tokens) ─────────── */
const css = `
  :root {
    --bg: #f6f1e9;
    --surface: #fffdfa;
    --ink: #2a241e;
    --ink-soft: #6f655a;
    --ink-faint: #a59a8c;
    --line: #e8dfd1;
    --line-soft: #efe8db;
    --ember: #cf6a2c;
    --ember-deep: #b9551f;
    --ember-tint: #fbede0;
    --ember-tint2: #f8e2cf;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--ink); }

  .board-app {
    min-height: 100vh;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E"),
      radial-gradient(1200px 600px at 78% -10%, #fbe9d6 0%, rgba(251,233,214,0) 55%),
      radial-gradient(900px 500px at 0% 100%, #f3ece0 0%, rgba(243,236,224,0) 60%),
      var(--bg);
    background-blend-mode: soft-light, normal, normal, normal;
    display: flex; flex-direction: column;
  }

  /* ── topbar ── */
  .topbar {
    position: sticky; top: 0; z-index: 30;
    display: flex; align-items: center; justify-content: space-between;
    height: 58px; padding: 0 22px;
    border-bottom: 1px solid var(--line);
    background: rgba(246,241,233,0.82);
    backdrop-filter: blur(10px);
  }
  .brand { display: flex; align-items: center; gap: 9px; font-size: 14px; }
  .logo {
    width: 28px; height: 28px; border-radius: 9px;
    display: grid; place-items: center;
    background: linear-gradient(150deg, #e98a45, #c0531c);
    box-shadow: 0 2px 8px rgba(191,99,43,0.4), inset 0 1px 0 rgba(255,255,255,0.25);
    flex-shrink: 0;
  }
  .brand-name { font-weight: 700; letter-spacing: 0.06em; font-size: 13.5px; }
  .crumb-sep { color: var(--ink-faint); }
  .crumb-muted { color: var(--ink-soft); }
  .crumb-current { color: var(--ink); font-weight: 500; }
  .top-right { display: flex; align-items: center; gap: 12px; }
  .online-dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf7d; box-shadow: 0 0 0 3px rgba(76,175,125,0.18); }
  .online-text { font-size: 13px; color: var(--ink-soft); margin-right: 2px; }
  .avatar-stack { display: flex; }
  .avatar {
    width: 26px; height: 26px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 10.5px; font-weight: 600; color: #fff;
    border: 2px solid var(--bg); margin-left: -7px;
  }
  .avatar:first-child { margin-left: 0; }
  .share-btn {
    margin-left: 6px; font: inherit; font-size: 13px; font-weight: 600;
    padding: 7px 16px; border-radius: 9px;
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--line); cursor: pointer;
    transition: background .15s, border-color .15s, transform .15s, box-shadow .15s;
  }
  .share-btn:hover { background: #fff; border-color: #ddd0bd; transform: translateY(-1px); box-shadow: 0 3px 10px rgba(42,36,30,0.08); }

  /* ── body layout (sidebar + main) ── */
  .body-row {
    display: flex; flex: 1; min-height: 0;
  }
  .sidebar {
    width: 224px; flex-shrink: 0;
    padding: 18px 12px;
    border-right: 1px solid var(--line);
    display: flex; flex-direction: column; gap: 2px;
  }
  .sidebar-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--ink-faint);
    padding: 6px 10px 10px;
  }
  .sidebar-item {
    display: flex; align-items: center; gap: 10px;
    font: inherit; font-size: 13.5px; color: var(--ink-soft); text-align: left;
    padding: 9px 10px; border-radius: 9px;
    background: none; border: none; cursor: pointer;
    transition: background .12s, color .12s;
  }
  .sidebar-item:hover { background: var(--line-soft); color: var(--ink); }
  .sidebar-item.active { background: var(--ember-tint); color: var(--ember-deep); font-weight: 600; }
  .sidebar-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .sidebar-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-divider { height: 1px; background: var(--line-soft); margin: 8px 4px; }
  .sidebar-new { color: var(--ink-faint); }
  .sidebar-new:hover { color: var(--ember); background: var(--ember-tint); }
  .sidebar-new svg { width: 13px; height: 13px; }

  .main-col {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
  }

  /* ── board toolbar ── */
  .board-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 28px 0;
    width: 100%;
  }
  .board-toolbar-left { display: flex; align-items: center; gap: 10px; }
  .board-title-area { display: flex; flex-direction: column; gap: 2px; }
  .board-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--ember);
  }
  .board-heading {
    font-family: Georgia, serif; font-weight: 500; font-size: 28px;
    line-height: 1.1; letter-spacing: -0.02em; color: var(--ink);
  }
  .filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .filter-chip {
    display: flex; align-items: center; gap: 5px;
    font: inherit; font-size: 12.5px; color: var(--ink-soft);
    padding: 5px 11px; border-radius: 8px;
    background: var(--surface); border: 1px solid var(--line);
    cursor: pointer; transition: background .12s, border-color .12s, color .12s;
  }
  .filter-chip:hover { background: var(--ember-tint); border-color: var(--ember-tint2); color: var(--ink); }
  .filter-chip.active { background: var(--ember-tint); border-color: var(--ember-tint2); color: var(--ember-deep); font-weight: 600; }
  .filter-chip-icon { width: 13px; height: 13px; }
  .add-col-btn {
    display: flex; align-items: center; gap: 6px;
    font: inherit; font-size: 13px; font-weight: 600; color: #fff;
    padding: 7px 14px; border-radius: 9px; border: none; cursor: pointer;
    background: linear-gradient(150deg, #e98a45, #c0531c);
    box-shadow: 0 2px 8px rgba(191,99,43,0.35);
    transition: filter .12s, transform .12s;
  }
  .add-col-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .add-col-btn svg { width: 15px; height: 15px; }

  /* ── kanban scroll area ── */
  .board-scroll {
    flex: 1;
    overflow-x: auto;
    padding: 20px 28px 120px;
    width: 100%;
    scrollbar-width: thin; scrollbar-color: var(--line) transparent;
  }
  .board-scroll::-webkit-scrollbar { height: 10px; }
  .board-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 6px; }

  .board-cols { display: flex; gap: 14px; align-items: flex-start; min-width: max-content; }

  /* ── column ── */
  .col {
    width: 276px; flex-shrink: 0;
    display: flex; flex-direction: column; gap: 0;
  }
  .col-head {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px 10px;
    border-radius: 12px 12px 0 0;
    background: var(--surface);
    border: 1px solid var(--line); border-bottom: none;
    position: relative;
  }
  .col-head::after {
    content: ""; position: absolute; left: 14px; right: 14px; bottom: 0; height: 1px;
    background: var(--line-soft);
  }
  .col-dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  }
  .col-name {
    font-size: 13px; font-weight: 600; color: var(--ink); flex: 1;
    outline: none; background: none; border: none; font-family: inherit;
    cursor: text;
  }
  .col-name:focus { box-shadow: 0 0 0 2px var(--ember-tint2); border-radius: 4px; }
  .col-count {
    font-size: 11.5px; font-weight: 600; color: var(--ink-faint);
    background: var(--line-soft); padding: 2px 7px; border-radius: 7px;
  }
  .col-menu-btn {
    display: grid; place-items: center;
    width: 22px; height: 22px; border-radius: 6px;
    border: none; background: none; color: var(--ink-faint); cursor: pointer;
    transition: background .12s, color .12s;
  }
  .col-menu-btn:hover { background: var(--line-soft); color: var(--ink); }
  .col-menu-btn svg { width: 15px; height: 15px; }

  .col-body {
    background: var(--line-soft);
    border: 1px solid var(--line); border-top: none; border-radius: 0 0 12px 12px;
    padding: 10px 8px 8px;
    display: flex; flex-direction: column; gap: 7px;
    min-height: 80px;
    transition: background .12s;
  }
  .col-body.drag-over { background: var(--ember-tint); border-color: var(--ember-tint2); }

  /* ── card ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 13px 14px;
    cursor: grab;
    transition: border-color .14s, box-shadow .14s, transform .14s, opacity .14s;
    position: relative;
  }
  .card:hover { border-color: var(--ember-tint2); box-shadow: 0 4px 14px rgba(191,99,43,0.1); transform: translateY(-1px); }
  .card:active { cursor: grabbing; }
  .card.dragging { opacity: 0.45; transform: rotate(1.5deg) scale(0.97); }
  .card.drop-above { box-shadow: inset 0 2px 0 var(--ember); }
  .card.drop-below { box-shadow: inset 0 -2px 0 var(--ember); }

  .card-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
  .card-tag {
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    padding: 2px 7px; border-radius: 6px;
    background: var(--line-soft); color: var(--ink-soft);
  }
  .card-tag.kind-mechanic { background: #fbe9d6; color: #8f4017; }
  .card-tag.kind-vision { background: #e5edf8; color: #1c4a82; }
  .card-tag.kind-economy { background: #e6f1e8; color: #285c38; }
  .card-tag.kind-lore { background: #f2e5f8; color: #6b2888; }

  .card-title { font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.3; margin-bottom: 5px; }
  .card-sub { font-size: 12px; color: var(--ink-soft); line-height: 1.45; margin-bottom: 10px; }

  .card-foot { display: flex; align-items: center; justify-content: space-between; }
  .card-owner { display: flex; align-items: center; gap: 6px; }
  .card-avatar {
    width: 20px; height: 20px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 9px; font-weight: 600; color: #fff;
  }
  .card-owner-name { font-size: 11.5px; color: var(--ink-faint); }
  .card-priority {
    font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 6px;
    background: var(--line-soft); color: var(--ink-faint);
  }
  .card-priority.high { background: #fbe9d6; color: #8f4017; }
  .card-priority.medium { background: #f7ecd2; color: #7a5614; }

  /* ── add card button ── */
  .add-card-btn {
    display: flex; align-items: center; gap: 6px;
    width: 100%; font: inherit; font-size: 13px; color: var(--ink-faint);
    padding: 7px 9px; border-radius: 8px;
    background: none; border: 1px dashed var(--line);
    cursor: pointer; transition: border-color .12s, color .12s, background .12s;
  }
  .add-card-btn:hover { border-color: var(--ember); color: var(--ember); background: var(--ember-tint); }
  .add-card-btn svg { width: 14px; height: 14px; }

  /* ── new card inline form ── */
  .new-card-form {
    background: var(--surface); border: 1px solid var(--ember-tint2);
    border-radius: 10px; padding: 12px 13px;
    box-shadow: 0 4px 14px rgba(191,99,43,0.1);
  }
  .new-card-input {
    width: 100%; font: inherit; font-size: 13.5px; font-weight: 600;
    color: var(--ink); background: none; border: none; outline: none;
    resize: none; line-height: 1.4;
  }
  .new-card-input::placeholder { color: var(--ink-faint); }
  .new-card-actions { display: flex; gap: 6px; margin-top: 10px; }
  .btn-save {
    font: inherit; font-size: 12.5px; font-weight: 600; color: #fff;
    padding: 5px 13px; border-radius: 7px; border: none; cursor: pointer;
    background: linear-gradient(150deg, #e98a45, #c0531c);
    transition: filter .1s;
  }
  .btn-save:hover { filter: brightness(1.06); }
  .btn-cancel {
    font: inherit; font-size: 12.5px; color: var(--ink-soft);
    padding: 5px 13px; border-radius: 7px; cursor: pointer;
    background: none; border: 1px solid var(--line); transition: background .1s;
  }
  .btn-cancel:hover { background: var(--line-soft); }

  /* ── add-column phantom ── */
  .add-col-ghost {
    width: 276px; flex-shrink: 0;
    border: 1.5px dashed var(--line); border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    min-height: 120px; gap: 7px;
    font: inherit; font-size: 13.5px; color: var(--ink-faint);
    background: none; cursor: pointer;
    transition: border-color .12s, color .12s, background .12s;
  }
  .add-col-ghost:hover { border-color: var(--ember); color: var(--ember); background: var(--ember-tint); }
  .add-col-ghost svg { width: 16px; height: 16px; }

  /* ── floating dock (same as original) ── */
  .dock {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
    z-index: 40;
    display: flex; align-items: center; gap: 4px;
    padding: 7px;
    background: rgba(255,253,250,0.9);
    backdrop-filter: blur(16px);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(42,36,30,0.16), 0 2px 6px rgba(42,36,30,0.06);
  }
  .dock-search {
    display: flex; align-items: center; gap: 8px;
    font: inherit; padding: 8px 12px; border-radius: 11px;
    background: var(--line-soft); border: none; color: var(--ink-soft); cursor: pointer;
  }
  .dock-search:hover { background: #ece4d6; }
  .dock-search-icon { width: 16px; height: 16px; }
  .kbd { font-size: 11px; color: var(--ink-faint); }
  .dock-divider { width: 1px; height: 24px; background: var(--line); margin: 0 4px; }
  .dock-item {
    display: flex; align-items: center; gap: 7px;
    font: inherit; font-size: 13.5px; font-weight: 500; color: var(--ink-soft);
    padding: 9px 14px; border-radius: 11px;
    background: none; border: none; cursor: pointer;
    transition: background .12s, color .12s, transform .12s;
  }
  .dock-item:hover { background: var(--line-soft); color: var(--ink); transform: translateY(-1px); }
  .dock-icon { width: 16px; height: 16px; }
  .dock-item.is-active { background: var(--ember); color: #fff; }
  .dock-item.is-active:hover { background: var(--ember); color: #fff; transform: none; }
  .dock-new {
    display: flex; align-items: center; gap: 6px;
    font: inherit; font-size: 13.5px; font-weight: 600; color: #fff;
    padding: 9px 16px; border-radius: 11px; margin-left: 2px;
    background: linear-gradient(150deg, #e98a45, #c0531c);
    border: none; cursor: pointer;
    box-shadow: 0 2px 8px rgba(191,99,43,0.35);
    transition: filter .12s, transform .12s, box-shadow .12s;
  }
  .dock-new:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .dock-new-icon { width: 16px; height: 16px; }

  /* ── modal overlay ── */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(42,36,30,0.28);
    backdrop-filter: blur(2px);
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 12vh;
  }
  .modal {
    width: min(520px, 92vw);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 24px 70px rgba(42,36,30,0.28), 0 4px 12px rgba(42,36,30,0.08);
    padding: 26px 28px;
    animation: riseIn .18s ease both;
  }
  @keyframes riseIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  .modal h2 { font-family: Georgia, serif; font-size: 22px; font-weight: 500; margin-bottom: 16px; }
  .modal-field { margin-bottom: 14px; }
  .modal-label { font-size: 12.5px; font-weight: 600; color: var(--ink-soft); margin-bottom: 5px; display: block; letter-spacing: 0.04em; text-transform: uppercase; }
  .modal-input, .modal-textarea, .modal-select {
    width: 100%; font: inherit; font-size: 14px; color: var(--ink);
    background: var(--bg); border: 1px solid var(--line); border-radius: 9px;
    padding: 9px 12px; outline: none;
    transition: border-color .12s, box-shadow .12s;
  }
  .modal-textarea { resize: vertical; min-height: 72px; }
  .modal-input:focus, .modal-textarea:focus, .modal-select:focus { border-color: var(--ember-tint2); box-shadow: 0 0 0 2px var(--ember-tint2); }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 22px; }
  .modal-save { font: inherit; font-size: 13.5px; font-weight: 600; color: #fff; padding: 8px 20px; border-radius: 9px; border: none; cursor: pointer; background: linear-gradient(150deg, #e98a45, #c0531c); box-shadow: 0 2px 8px rgba(191,99,43,0.35); transition: filter .1s; }
  .modal-save:hover { filter: brightness(1.06); }
  .modal-cancel { font: inherit; font-size: 13.5px; color: var(--ink-soft); padding: 8px 18px; border-radius: 9px; border: 1px solid var(--line); background: none; cursor: pointer; transition: background .1s; }
  .modal-cancel:hover { background: var(--line-soft); }

  @media (max-width: 768px) {
    .board-toolbar { padding: 14px 16px 0; }
    .board-scroll { padding: 14px 16px 120px; }
    .sidebar { width: 64px; padding: 14px 8px; }
    .sidebar-name, .sidebar-label { display: none; }
    .sidebar-item { justify-content: center; padding: 9px; }
    .sidebar-new svg { width: 14px; height: 14px; }
  }
`;

/* ── inline SVG icons ─────────────────────────────────────────────────────── */
const Flame = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const Plus = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Search = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);
const HomeIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
const Doc = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Grid = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const Columns = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" />
  </svg>
);
const TableIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
  </svg>
);
const Dots = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const Filter = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

/* ── seed data ───────────────────────────────────────────────────────────── */
const PEOPLE = [
  { id: "1", name: "Reva S.", initials: "RS", color: "#cf6a2c" },
  { id: "2", name: "Mads L.", initials: "ML", color: "#3f7ebc" },
  { id: "3", name: "Priya K.", initials: "PK", color: "#4caf7d" },
  { id: "4", name: "Owen T.", initials: "OT", color: "#8a54b5" },
];

function mkId() { return Math.random().toString(36).slice(2, 9); }

function defaultCols() {
  return [
    { id: mkId(), name: "To Do", color: "#a59a8c", cards: [] },
    { id: mkId(), name: "In Progress", color: "#cf6a2c", cards: [] },
    { id: mkId(), name: "Review", color: "#d9a441", cards: [] },
    { id: mkId(), name: "Done", color: "#4caf7d", cards: [] },
  ];
}

const INIT_BOARDS = [
  {
    id: "board-core", name: "Core Gameplay", color: "#cf6a2c",
    cols: [
      {
        id: "col-todo", name: "To Do", color: "#a59a8c",
        cards: [
          { id: mkId(), title: "Loot table balancing pass", sub: "Review drop rates across all tier-3 zones and normalise rare item frequency.", kind: "economy", tags: ["v2.3", "balance"], priority: "high", ownerId: "1" },
          { id: mkId(), title: "Stealth system rework", sub: "Replace line-of-sight cone with radius + alertness model.", kind: "mechanic", tags: ["gameplay"], priority: "medium", ownerId: "2" },
          { id: mkId(), title: "Companion dialogue trees", sub: "Branch 4 new NPC threads off the merchant questline.", kind: "lore", tags: ["narrative"], priority: null, ownerId: null },
        ],
      },
      {
        id: "col-wip", name: "In Progress", color: "#cf6a2c",
        cards: [
          { id: mkId(), title: "World map fog of war", sub: "Implement per-tile discovery states with save persistence.", kind: "mechanic", tags: ["exploration", "save"], priority: "high", ownerId: "3" },
          { id: mkId(), title: "Seasonal economy events", sub: "Festival price swings and limited-time vendor stock.", kind: "economy", tags: ["events"], priority: "medium", ownerId: "1" },
        ],
      },
      {
        id: "col-review", name: "Review", color: "#d9a441",
        cards: [
          { id: mkId(), title: "Core vision statement", sub: "Align team on the 3-pillar design philosophy doc.", kind: "vision", tags: ["design"], priority: null, ownerId: "4" },
          { id: mkId(), title: "Audio ambience zones", sub: "Per-biome audio blending using distance cues.", kind: "mechanic", tags: ["audio"], priority: "medium", ownerId: "2" },
        ],
      },
      {
        id: "col-done", name: "Done", color: "#4caf7d",
        cards: [
          { id: mkId(), title: "Player stats dashboard", sub: "In-game HUD displaying health, stamina, gold.", kind: "mechanic", tags: ["ui", "done"], priority: null, ownerId: "3" },
          { id: mkId(), title: "Tutorial flow v1", sub: "Guided onboarding across first 10 minutes of play.", kind: "vision", tags: ["ux", "done"], priority: null, ownerId: "1" },
          { id: mkId(), title: "Save/load system", sub: "Slot-based save with autosave at checkpoints.", kind: "mechanic", tags: ["core", "done"], priority: null, ownerId: "4" },
        ],
      },
    ],
  },
  {
    id: "board-economy", name: "Economy & Items", color: "#4caf7d",
    cols: [
      {
        id: "col-econ-todo", name: "To Do", color: "#a59a8c",
        cards: [
          { id: mkId(), title: "Crafting material sinks", sub: "Add high-tier recipes to drain late-game material surplus.", kind: "economy", tags: ["crafting"], priority: "medium", ownerId: "1" },
          { id: mkId(), title: "Currency exchange rates", sub: "Define conversion between region-specific currencies.", kind: "economy", tags: ["world"], priority: null, ownerId: null },
        ],
      },
      { id: "col-econ-wip", name: "In Progress", color: "#cf6a2c", cards: [
          { id: mkId(), title: "Vendor restock logic", sub: "Tune restock intervals per vendor tier.", kind: "economy", tags: ["vendors"], priority: "high", ownerId: "3" },
        ],
      },
      { id: "col-econ-review", name: "Review", color: "#d9a441", cards: [] },
      { id: "col-econ-done", name: "Done", color: "#4caf7d", cards: [
          { id: mkId(), title: "Starting gold balance", sub: "Set baseline gold for new characters per difficulty.", kind: "economy", tags: ["balance", "done"], priority: null, ownerId: "4" },
        ],
      },
    ],
  },
  {
    id: "board-narrative", name: "World & Narrative", color: "#8a54b5",
    cols: defaultCols().map((c, i) => i === 0 ? {
      ...c, cards: [
        { id: mkId(), title: "Faction reputation arcs", sub: "Outline reputation thresholds and unlocks for the three major factions.", kind: "lore", tags: ["factions"], priority: "medium", ownerId: "4" },
      ],
    } : c),
  },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */
function ownerById(id) { return PEOPLE.find((p) => p.id === id) ?? null; }

/* ── Card component ──────────────────────────────────────────────────────── */
function Card({ card, onDragStart, onDragEnd, dropState, onClick }) {
  const owner = ownerById(card.ownerId);
  return (
    <div
      className={`card${card.dragging ? " dragging" : ""}${dropState === "above" ? " drop-above" : ""}${dropState === "below" ? " drop-below" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card)}
    >
      {(card.kind || card.tags?.length > 0) && (
        <div className="card-tags">
          {card.kind && <span className={`card-tag kind-${card.kind}`}>{card.kind}</span>}
          {card.tags?.map((t) => <span key={t} className="card-tag">{t}</span>)}
        </div>
      )}
      <div className="card-title">{card.title}</div>
      {card.sub && <div className="card-sub">{card.sub}</div>}
      <div className="card-foot">
        <div className="card-owner">
          {owner ? (
            <>
              <span className="card-avatar" style={{ background: owner.color }}>{owner.initials}</span>
              <span className="card-owner-name">{owner.name}</span>
            </>
          ) : (
            <span className="card-owner-name" style={{ color: "var(--ink-faint)" }}>Unassigned</span>
          )}
        </div>
        {card.priority && (
          <span className={`card-priority ${card.priority}`}>{card.priority}</span>
        )}
      </div>
    </div>
  );
}

/* ── Column component ────────────────────────────────────────────────────── */
function Column({ col, onAddCard, onCardClick, dragState, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commitAdd() {
    if (draft.trim()) onAddCard(col.id, draft.trim());
    setDraft(""); setAdding(false);
  }

  return (
    <div className="col">
      <div className="col-head">
        <span className="col-dot" style={{ background: col.color }} />
        <span className="col-name">{col.name}</span>
        <span className="col-count">{col.cards.length}</span>
        <button className="col-menu-btn" title="Column options"><Dots className="" style={{ width: 15, height: 15 }} /></button>
      </div>

      <div
        className={`col-body${dragState?.overCol === col.id && !dragState?.overCard ? " drag-over" : ""}`}
        onDragOver={(e) => onDragOver(e, col.id, null)}
        onDrop={(e) => onDrop(e, col.id, null)}
        onDragLeave={onDragLeave}
      >
        {col.cards.map((card) => {
          const dropState =
            dragState?.overCard === card.id ? dragState.position : null;
          return (
            <div
              key={card.id}
              onDragOver={(e) => { e.stopPropagation(); onDragOver(e, col.id, card.id); }}
              onDrop={(e) => { e.stopPropagation(); onDrop(e, col.id, card.id); }}
            >
              <Card
                card={card}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                dropState={dropState}
                onClick={onCardClick}
              />
            </div>
          );
        })}

        {adding ? (
          <div className="new-card-form">
            <textarea
              className="new-card-input"
              rows={2}
              placeholder="Card title…"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); } if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
            />
            <div className="new-card-actions">
              <button className="btn-save" onClick={commitAdd}>Add card</button>
              <button className="btn-cancel" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="add-card-btn" onClick={() => setAdding(true)}>
            <Plus className="" style={{ width: 14, height: 14 }} /> Add card
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Card detail modal ───────────────────────────────────────────────────── */
function CardModal({ card, onClose, onSave }) {
  const [title, setTitle] = useState(card.title);
  const [sub, setSub] = useState(card.sub ?? "");
  const [kind, setKind] = useState(card.kind ?? "");
  const [priority, setPriority] = useState(card.priority ?? "");
  const [ownerId, setOwnerId] = useState(card.ownerId ?? "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit card</h2>
        <div className="modal-field">
          <label className="modal-label">Title</label>
          <input className="modal-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Description</label>
          <textarea className="modal-textarea" value={sub} onChange={(e) => setSub(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="modal-field">
            <label className="modal-label">Kind</label>
            <select className="modal-select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">—</option>
              <option value="mechanic">Mechanic</option>
              <option value="vision">Vision</option>
              <option value="economy">Economy</option>
              <option value="lore">Lore</option>
            </select>
          </div>
          <div className="modal-field">
            <label className="modal-label">Priority</label>
            <select className="modal-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">—</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Owner</label>
          <select className="modal-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-save" onClick={() => { onSave({ ...card, title, sub, kind, priority: priority || null, ownerId: ownerId || null }); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main BoardPage component ─────────────────────────────────────────────── */
export default function BoardPage() {
  const [boards, setBoards] = useState(INIT_BOARDS);
  const [activeBoardId, setActiveBoardId] = useState(INIT_BOARDS[0].id);
  const [filterKind, setFilterKind] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const drag = useRef({ cardId: null, srcColId: null });
  const [dragState, setDragState] = useState(null); // { overCol, overCard, position }

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const cols = activeBoard.cols;

  function setCols(updater) {
    setBoards((prev) => prev.map((b) =>
      b.id !== activeBoardId ? b : { ...b, cols: typeof updater === "function" ? updater(b.cols) : updater }
    ));
  }

  function handleAddBoard() {
    const name = window.prompt("New board name");
    if (!name?.trim()) return;
    const id = mkId();
    setBoards((prev) => [...prev, { id, name: name.trim(), color: "#cf6a2c", cols: defaultCols() }]);
    setActiveBoardId(id);
  }

  /* drag handlers */
  function handleDragStart(e, cardId) {
    const srcCol = cols.find((c) => c.cards.some((k) => k.id === cardId));
    drag.current = { cardId, srcColId: srcCol?.id };
    setCols((prev) => prev.map((c) => ({
      ...c, cards: c.cards.map((k) => k.id === cardId ? { ...k, dragging: true } : k)
    })));
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragEnd() {
    drag.current = { cardId: null, srcColId: null };
    setCols((prev) => prev.map((c) => ({ ...c, cards: c.cards.map((k) => ({ ...k, dragging: false })) })));
    setDragState(null);
  }
  function handleDragOver(e, colId, cardId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const position = (() => {
      if (!cardId) return null;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2 ? "above" : "below";
    })();
    setDragState({ overCol: colId, overCard: cardId, position });
  }
  function handleDrop(e, colId, targetCardId) {
    e.preventDefault();
    const { cardId, srcColId } = drag.current;
    if (!cardId) return;
    setCols((prev) => {
      let card = null;
      const without = prev.map((c) => {
        const found = c.cards.find((k) => k.id === cardId);
        if (found) card = found;
        return { ...c, cards: c.cards.filter((k) => k.id !== cardId) };
      });
      return without.map((c) => {
        if (c.id !== colId) return c;
        if (!targetCardId) return { ...c, cards: [...c.cards, card] };
        const idx = c.cards.findIndex((k) => k.id === targetCardId);
        const pos = dragState?.position === "above" ? idx : idx + 1;
        const next = [...c.cards];
        next.splice(pos, 0, card);
        return { ...c, cards: next };
      });
    });
    setDragState(null);
  }
  function handleDragLeave() { /* keep state for cross-card sub-regions */ }

  /* add card */
  function handleAddCard(colId, title) {
    setCols((prev) => prev.map((c) =>
      c.id !== colId ? c : {
        ...c,
        cards: [...c.cards, {
          id: mkId(), title, sub: "", kind: "", tags: [], priority: null, ownerId: null
        }]
      }
    ));
  }

  /* save card from modal */
  function handleSaveCard(updated) {
    setCols((prev) => prev.map((c) => ({
      ...c, cards: c.cards.map((k) => k.id === updated.id ? updated : k)
    })));
  }

  /* add new column */
  function handleAddCol() {
    const name = window.prompt("New column name");
    if (!name?.trim()) return;
    setCols((prev) => [...prev, { id: mkId(), name: name.trim(), color: "#a59a8c", cards: [] }]);
  }

  const kinds = ["mechanic", "vision", "economy", "lore"];

  const displayCols = filterKind
    ? cols.map((c) => ({ ...c, cards: c.cards.filter((k) => k.kind === filterKind) }))
    : cols;

  return (
    <>
      <style>{css}</style>
      <div className="board-app">

        {/* topbar */}
        <header className="topbar">
          <div className="brand">
            <span className="logo"><Flame style={{ width: 16, height: 16, color: "#fff4e8" }} /></span>
            <span className="brand-name">EMBERWICK</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-muted">Design</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Board</span>
          </div>
          <div className="top-right">
            <span className="online-dot" />
            <span className="online-text">3 online</span>
            <div className="avatar-stack">
              {PEOPLE.slice(0, 3).map((p) => (
                <span key={p.id} className="avatar" style={{ background: p.color }} title={p.name}>{p.initials}</span>
              ))}
            </div>
            <button className="share-btn">Share</button>
          </div>
        </header>

        <div className="body-row">
          {/* sidebar: board list */}
          <aside className="sidebar">
            <div className="sidebar-label">Boards</div>
            {boards.map((b) => (
              <button
                key={b.id}
                className={`sidebar-item${b.id === activeBoardId ? " active" : ""}`}
                onClick={() => setActiveBoardId(b.id)}
                title={b.name}
              >
                <span className="sidebar-dot" style={{ background: b.color }} />
                <span className="sidebar-name">{b.name}</span>
              </button>
            ))}
            <div className="sidebar-divider" />
            <button className="sidebar-item sidebar-new" onClick={handleAddBoard} title="New board">
              <Plus />
              <span className="sidebar-name">New board</span>
            </button>
          </aside>

          <div className="main-col">
            {/* toolbar */}
            <div className="board-toolbar">
              <div>
                <div className="board-label">Design Workspace · Board</div>
                <div className="board-heading">{activeBoard.name}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="filter-row">
                  <button
                    className={`filter-chip${!filterKind ? " active" : ""}`}
                    onClick={() => setFilterKind(null)}
                  >
                    <Filter style={{ width: 13, height: 13 }} /> All
                  </button>
                  {kinds.map((k) => (
                    <button
                      key={k}
                      className={`filter-chip${filterKind === k ? " active" : ""}`}
                      onClick={() => setFilterKind(filterKind === k ? null : k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button className="add-col-btn" onClick={handleAddCol}>
                  <Plus style={{ width: 15, height: 15 }} /> Column
                </button>
              </div>
            </div>

            {/* kanban board */}
            <div className="board-scroll">
              <div className="board-cols">
                {displayCols.map((col) => (
                  <Column
                    key={col.id}
                    col={col}
                    onAddCard={handleAddCard}
                    onCardClick={setEditingCard}
                    dragState={dragState}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragLeave={handleDragLeave}
                  />
                ))}
                <button className="add-col-ghost" onClick={handleAddCol}>
                  <Plus style={{ width: 16, height: 16 }} />
                  Add column
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* floating dock */}
        <nav className="dock">
          <button className="dock-search">
            <Search className="dock-search-icon" />
            <kbd className="kbd">⌘K</kbd>
          </button>
          <span className="dock-divider" />
          <button className="dock-item"><HomeIcon className="dock-icon" /> Home</button>
          <button className="dock-item"><Doc className="dock-icon" /> Pages</button>
          <button className="dock-item"><Grid className="dock-icon" /> Canvas</button>
          <button className="dock-item is-active"><Columns className="dock-icon" /> Board</button>
          <button className="dock-item"><TableIcon className="dock-icon" /> Table</button>
          <button className="dock-new">
            <Plus className="dock-new-icon" /> New
          </button>
        </nav>

        {/* card edit modal */}
        {editingCard && (
          <CardModal
            card={editingCard}
            onClose={() => setEditingCard(null)}
            onSave={(updated) => { handleSaveCard(updated); setEditingCard(null); }}
          />
        )}
      </div>
    </>
  );
}
