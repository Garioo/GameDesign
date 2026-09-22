"use client";
import { parentChoices as hierarchyParentChoices } from "@/lib/taskHierarchy";
import { loadSchedule, mutateSchedule, type ScheduleSnapshot, type ScheduleResult } from '@/lib/ganttRepo';

import { useEffect, useState, useRef, type CSSProperties, type DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { useCloseDetailsOnOutsideClick } from "@/lib/useCloseDetailsOnOutsideClick";
import CalendarView from "../calendar/CalendarView";
import { boardColor } from "@/lib/boardColors";
import Link from "next/link";
import { loadPhases, phaseRangeLabel, type PhaseSnapshot } from "@/lib/phaseRepo";
import PlanningHeader from "./PlanningHeader";
import StageDialog from "./StageDialog";
import {PlanningIcon} from "./PlanningIcons";
import "./planning.css";
import PlanningDialog,{type PlanningAction} from './PlanningDialog';
import CategoryManager from './CategoryManager';
import TopBar, { type PresenceUser } from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { listCanvases, type CanvasInfo } from "@/lib/canvasRepo";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import {
  boardEndDate,
  copyBoard,
  createCard,
  deleteBoard,
  deleteCard,
  listCategories,
  loadBoards,
  moveCard,
  openBoardCardCanvas,
  type Board as BoardData,
  type BoardCard as CardData,
  type BoardCategory,
  type BoardColumn as ColData,
} from "@/lib/boardRepo";

/* Board layout inherits the shared typography and design tokens. */
const css = `
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

  /* ── topbar + dock come from the global chrome (app/components) ── */

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
  .sidebar-del {
    display: none; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0;
    color: var(--ink-faint); cursor: pointer;
    transition: background .12s, color .12s;
  }
  .sidebar-item:hover .sidebar-del { display: flex; }
  .sidebar-del:hover { background: #fbe2dc; color: #b9421f; }
  .col-del-btn:hover { background: #fbe2dc; color: #b9421f; }
  .modal-delete { display: inline-flex; align-items: center; gap: 6px; }
  .modal-delete:hover { background: #fbe2dc; color: #b9421f; border-color: #f3cabe; }
  .sidebar-new { color: var(--ink-faint); }
  .sidebar-new:hover { color: var(--ember); background: var(--ember-tint); }
  .sidebar-new svg { width: 13px; height: 13px; }

  .cal-due-empty { font-size: 12px; color: var(--ink-faint); padding: 4px 0; }

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
  .chip-del {
    display: none; align-items: center; justify-content: center;
    width: 14px; height: 14px; border-radius: 50%; margin-left: 2px;
    font-size: 12px; line-height: 1; color: var(--ink-faint); cursor: pointer;
  }
  .filter-chip:hover .chip-del { display: inline-flex; }
  .chip-del:hover { background: #fbe2dc; color: #b9421f; }
  .filter-chip-add { color: var(--ink-faint); border-style: dashed; }
  .filter-chip-add:hover { color: var(--ember); }
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
  .col-head { cursor: grab; }
  .col-head:active { cursor: grabbing; }
  .col.col-drag-target { outline: 2px dashed var(--ember); outline-offset: 3px; border-radius: 12px; }
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
  .col-menu-btn:disabled { opacity: 0.3; cursor: default; }
  .col-menu-btn:disabled:hover { background: none; color: var(--ink-faint); }
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
  .card-avatar-group { display: flex; }
  .card-avatar {
    width: 20px; height: 20px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 9px; font-weight: 600; color: #fff;
    border: 2px solid var(--surface); margin-left: -6px;
  }
  .card-avatar:first-child { margin-left: 0; }
  .card-owner-name { font-size: 11.5px; color: var(--ink-faint); }
  .card-priority {
    font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 6px;
    background: var(--line-soft); color: var(--ink-faint);
  }
  .card-priority.high { background: #fbe9d6; color: #8f4017; }
  .card-priority.medium { background: #f7ecd2; color: #7a5614; }
  .card-priority.low { background: #e6f1e8; color: #285c38; }

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
  .owner-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .owner-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font: inherit; font-size: 12.5px; color: var(--ink-soft);
    padding: 5px 10px 5px 6px; border-radius: 999px;
    background: var(--bg); border: 1px solid var(--line);
    cursor: pointer; transition: background .12s, border-color .12s, color .12s;
  }
  .owner-chip:hover { border-color: var(--ember-tint2); }
  .owner-chip.active { background: var(--ember-tint); border-color: var(--ember-tint2); color: var(--ember-deep); font-weight: 600; }
  .owner-chip-avatar {
    width: 18px; height: 18px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 8.5px; font-weight: 600; color: #fff; flex-shrink: 0;
  }
  .modal-input:focus, .modal-textarea:focus, .modal-select:focus { border-color: var(--ember-tint2); box-shadow: 0 0 0 2px var(--ember-tint2); }
  .canvas-link-picker { display: grid; gap: 8px; margin-top: 10px; }
  .modal-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 22px; }
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
type IconProps = { className?: string; style?: CSSProperties };

const Plus = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Dots = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const Filter = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const Trash = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" />
  </svg>
);

/* ── data model ──────────────────────────────────────────────────────────── */
/* Board / column / card shapes come from lib/boardRepo (aliased to the local
   names BoardData / ColData / CardData). People are real workspace members. */
type Person = ProfileInfo;

interface DragInfo {
  overCol: string | null;
  overCard: string | null;
  position: "above" | "below" | null;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function ownerById(people: Person[], id: string | null | undefined): Person | null {
  return people.find((p) => p.id === id) ?? null;
}
function ownersByIds(people: Person[], ids: string[] | undefined): Person[] {
  return (ids ?? [])
    .map((id) => ownerById(people, id))
    .filter((p): p is Person => p !== null);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDeadline(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

/* ── Card component ──────────────────────────────────────────────────────── */
function Card({ card, people, onDragStart, onDragEnd, dropState, onClick }: {
  card: CardData;
  people: Person[];
  onDragStart: (e: DragEvent<HTMLDivElement>, cardId: string) => void;
  onDragEnd: () => void;
  dropState: "above" | "below" | null;
  onClick: (card: CardData) => void;
}) {
  const owners = ownersByIds(people, card.ownerIds);
  return (
    <div
      className={`card${card.dragging ? " dragging" : ""}${dropState === "above" ? " drop-above" : ""}${dropState === "below" ? " drop-below" : ""}`}
      role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick(card);}}}
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card)}
    >
      {(card.kind || card.tags.length > 0 || card.priority) && (
        <div className="card-tags">
          {card.kind && <span className={`card-tag kind-${card.kind}`}>{card.kind}</span>}
          {card.tags.map((t) => <span key={t} className="card-tag">{t}</span>)}
          {card.priority && <span className={`card-priority ${card.priority}`}>{card.priority}</span>}
        </div>
      )}
      <div className="card-title">{card.title}</div>
      {card.sub && <div className="card-sub">{card.sub}</div>}
      <div className="card-foot">
        <div className="card-owner">
          {owners.length > 0 ? (
            <>
              <span className="card-avatar-group">
                {owners.map((o) => (
                  <span key={o.id} className="card-avatar" style={{ background: o.color }} title={o.name}>{o.initials}</span>
                ))}
              </span>
              <span className="card-owner-name">
                {owners.length === 1 ? owners[0].name : `${owners[0].name} +${owners.length - 1}`}
              </span>
            </>
          ) : (
            <span className="card-owner-name" style={{ color: "var(--ink-faint)" }}>Unassigned</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Column component ────────────────────────────────────────────────────── */
function Column({ col, people, canEdit, onManageStages, onAddCard, onCardClick, dragState, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave }: {
  col: ColData;
  people: Person[];
  canEdit:boolean;
  onManageStages:()=>void;
  onAddCard: (colId: string, title: string) => Promise<void>;
  onCardClick: (card: CardData) => void;
  dragState: DragInfo | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, cardId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, colId: string, cardId: string | null) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, colId: string, cardId: string | null) => void;
  onDragLeave: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const [addError, setAddError] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const addLock = useRef(false);
  const entryRef = useRef<HTMLTextAreaElement>(null);
  async function commitAdd() {
    if (addLock.current || !draft.trim()) return;
    const remaining = draft.split("\n").map(title => title.trim()).filter(Boolean);
    addLock.current = true; setSavingTask(true); setAddError(""); setDraft("");
    entryRef.current?.focus();
    try {
      while (remaining.length) {
        await onAddCard(col.id, remaining[0]);
        remaining.shift();
      }
    } catch (e) {
      setDraft(current => remaining.join("\n") + (current ? "\n" + current : ""));
      setAddError(e instanceof Error ? e.message : "Could not add task.");
    } finally { addLock.current = false; setSavingTask(false); }
  }

  return (
    <div
      className="col"
    >
      <div
        className="col-head"
        title="Manage stages to change their order"
      >
        <span className="col-status" style={{ "--stage-color": col.color } as CSSProperties}>
          <span className="col-dot" />
          <span className="col-name">{col.name}</span>
        </span>
        <span className="col-count">{col.cards.length}</span>
        {canEdit&&<details className="planning-menu stage-header-menu"><summary aria-label={`Actions for ${col.name}`}><PlanningIcon name="more"/></summary><div><button onClick={onManageStages}>Manage stages</button><button onClick={()=>setAdding(true)}>Add task</button></div></details>}
        {canEdit && <button className="col-add-task" aria-label={`Add task to ${col.name}`} onClick={() => setAdding(true)}><PlanningIcon name="plus" /></button>}
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
                people={people}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                dropState={dropState}
                onClick={onCardClick}
              />
            </div>
          );
        })}

        {canEdit&&(adding ? (
          <div className="new-card-form">
            <textarea
              ref={entryRef}
              aria-label={`New task in ${col.name}`}
              className="new-card-input"
              rows={2}
              placeholder="Task title…"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); } if (e.key === "Escape" && !savingTask) { setAdding(false); setDraft(""); } }}
            />
            <small>Enter to add · Paste several lines to add a list</small>
            {addError && <p role="alert">{addError}</p>}
            <div className="new-card-actions">
              <button className="btn-save" disabled={savingTask || !draft.trim()} onClick={commitAdd}>{savingTask ? "Adding…" : "Add task"}</button>
              <button className="btn-cancel" disabled={savingTask} onClick={() => { setAdding(false); setDraft(""); }}>Close</button>
            </div>
          </div>
        ) : (
          <button className="add-card-btn" onClick={() => setAdding(true)}>
            <Plus className="" style={{ width: 14, height: 14 }} /> Add task
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Card detail modal ───────────────────────────────────────────────────── */
function CardModal({ card, workspaceId, people, categories, onClose, onSave, onDelete, onMakeCanvas, panel, canEdit, columns, boards }: {
  boards: BoardData[];
  panel: boolean; canEdit: boolean; columns: {id:string;name:string}[];
  card: CardData;
  workspaceId: string;
  people: Person[];
  categories: BoardCategory[];
  onClose: () => void;
  onSave: (card: CardData, snapshot: ScheduleSnapshot) => Promise<void>;
  onDelete: (card: CardData) => void;
  onMakeCanvas: (card: CardData, existingCanvasId?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(card.title);
  const [sub, setSub] = useState(card.sub ?? "");
  const [kind, setKind] = useState(card.kind ?? "");
  const [categoryId, setCategoryId] = useState(card.categoryId ?? "");
  const [priority, setPriority] = useState(card.priority ?? "");
  const [ownerIds, setOwnerIds] = useState<string[]>(card.ownerIds ?? []);
  const [parentId, setParentId] = useState(card.parentId ?? "");
  const childTasks = boards.flatMap(b => b.cols.flatMap(c => c.cards)).filter(t => t.parentId === card.id);
  const [columnId, setColumnId] = useState(card.columnId ?? "");
  const parentChoices = hierarchyParentChoices(boards.find(b => b.cols.some(c => c.id === columnId)), card.id);
  const [baseline, setBaseline] = useState<ScheduleSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    function key(e:KeyboardEvent){
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab'){
        const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')??[]).filter(el=>el.offsetParent!==null&&!el.closest('fieldset:disabled'));
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[card.id]);
  useEffect(() => { let active=true; loadSchedule(workspaceId).then(s=>{if(active)setBaseline(s);}).catch(e=>{if(active)setSaveError(e.message);}); return()=>{active=false;}; }, [workspaceId]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [canvasChoices, setCanvasChoices] = useState<CanvasInfo[] | null>(null);
  const [chosenCanvas, setChosenCanvas] = useState("");

  async function openCanvas(existingId?: string) {
    if (canvasBusy) return;
    setCanvasBusy(true); setSaveError("");
    try { await onMakeCanvas(card, existingId); }
    catch (e) { setSaveError(e instanceof Error ? e.message : "Could not open canvas."); }
    finally { setCanvasBusy(false); }
  }
  async function chooseCanvas() {
    setCanvasBusy(true); setSaveError("");
    try { setCanvasChoices(await listCanvases(workspaceId)); }
    catch (e) { setSaveError(e instanceof Error ? e.message : "Could not load canvases."); }
    finally { setCanvasBusy(false); }
  }

  function toggleOwner(id: string) {
    setOwnerIds((prev) => prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]);
  }

  return (
    <div className={`modal-backdrop${panel ? " gantt-inspector-backdrop" : ""}`} onClick={onClose}>
      <div ref={dialogRef} className={`modal${panel ? " gantt-inspector" : ""}${expanded ? " expanded" : ""}`} role="dialog" aria-modal="true" aria-label="Task details" onClick={(e) => e.stopPropagation()}>
        <div className="gantt-inspector-heading"><h2>Task details</h2><button onClick={onClose} aria-label="Close task details">×</button></div>
        {panel && <button className="gantt-sheet-toggle" onClick={()=>setExpanded(!expanded)}>{expanded ? "Reduce panel" : "Expand panel"}</button>}
        <fieldset disabled={!canEdit || saving} className="gantt-card-fields">
        <div className="modal-field">
          <label className="modal-label" htmlFor="task-parent">Parent task</label>
          <select id="task-parent" className="modal-select" value={parentId} onChange={e => setParentId(e.target.value)}>
            <option value="">None — main task</option>
            {parentChoices.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            {parentId && !parentChoices.some(t => t.id === parentId) && <option value={parentId}>Parent in another board — choose None to move</option>}
          </select>
          {childTasks.length > 0 && <small>This task contains {childTasks.length} direct subtasks. Dates and completion are independent.</small>}
        </div>
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
            <label className="modal-label">Category</label>
            <select aria-label="Task category" className="modal-select" value={categoryId} onChange={(e) => {setCategoryId(e.target.value);setKind(categories.find(c=>c.id===e.target.value)?.name??'');}}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label className="modal-label">Priority</label>
            <select className="modal-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">—</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div className="modal-field">
          <label className="modal-label">Assignees</label>
          <div className="owner-chips">
            {people.length === 0 && <span className="cal-due-empty">No workspace members to assign yet.</span>}
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`owner-chip${ownerIds.includes(p.id) ? " active" : ""}`}
                onClick={() => toggleOwner(p.id)}
              >
                <span className="owner-chip-avatar" style={{ background: p.color }}>{p.initials}</span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-field"><label className="modal-label" htmlFor="card-status">Stage</label><select id="card-status" className="modal-select" value={columnId} onChange={e=>setColumnId(e.target.value)}>{columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="modal-field">
          <button className="modal-cancel" disabled={canvasBusy || saving} onClick={chooseCanvas}>
            {card.canvasId ? "Change linked canvas" : "Link existing canvas"}
          </button>
          {canvasChoices && <div className="canvas-link-picker">
            <label className="modal-label" htmlFor="linked-canvas">Canvas in this workspace</label>
            <select id="linked-canvas" className="modal-select" value={chosenCanvas} onChange={e => setChosenCanvas(e.target.value)}>
              <option value="">Choose a canvas…</option>
              {canvasChoices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {canvasChoices.length === 0 && <p>No canvases yet. Use Open as canvas to create one.</p>}
            <button className="modal-cancel" disabled={!chosenCanvas || canvasBusy || saving} onClick={() => openCanvas(chosenCanvas)}>Link and open</button>
          </div>}
        </div>
        {saveError && <p role="alert" className="gantt-error">{saveError}</p>}
        <div className="modal-actions">
          <button
            className="modal-cancel modal-delete"
            title="Delete this card"
            onClick={() => { onDelete(card); onClose(); }}
          >
            <Trash style={{ width: 13, height: 13 }} /> Delete
          </button>
          <button className="modal-cancel" disabled={canvasBusy || saving} onClick={() => openCanvas()}>
            {canvasBusy ? "Opening…" : card.canvasId ? "Open linked canvas" : "Open as canvas"}
          </button>
          <button className="modal-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-save" disabled={saving || !baseline} onClick={async () => {
            setSaving(true); setSaveError("");
            try {
              if (!baseline) return;
              await onSave({ ...card, title, sub, kind, categoryId: categoryId || null, priority: priority || null, ownerIds, columnId, parentId: parentId || null }, baseline);
              onClose();
            } catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save card."); }
            finally { setSaving(false); }
          }}>{saving ? "Saving…" : "Save"}</button>
        </div>
        </fieldset>
      </div>
    </div>
  );
}

/* ── Main BoardPage component ─────────────────────────────────────────────── */
export default function BoardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const isCalendar = pathname.startsWith("/calendar");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<{ key: string; name: string; initials: string; color: string }[]>([]);
  const [boards, setBoards] = useState<BoardData[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [allBoards, setAllBoards] = useState(true);
  const [phaseSnapshot,setPhaseSnapshot]=useState<PhaseSnapshot|null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [stageBoard,setStageBoard]=useState<BoardData|null|undefined>(undefined);
  const [search,setSearch]=useState('');
  const [actionDialog,setActionDialog]=useState<PlanningAction|null>(null);
  const [categoryManager,setCategoryManager]=useState(false);
  const [ownerFilter,setOwnerFilter]=useState('');
  const canEdit=!!session&&session.role!=='viewer';
  const [scheduleResult,setScheduleResult]=useState<ScheduleResult|null>(null);
  const [boardActionError,setBoardActionError]=useState('');
  const [shareCopied,setShareCopied]=useState(false);
  const [undoBusy,setUndoBusy]=useState(false);
  // One board has nothing to combine, so the grouped view needs at least two.
  const combined = allBoards && boards.length > 1;
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const drag = useRef<{ cardId: string | null; srcColId: string | null }>({ cardId: null, srcColId: null });
  const [dragState, setDragState] = useState<DragInfo | null>(null);
  const wsRef = useRef<string | null>(null);

  // ---- initial load: session -> boards + members ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await ensureSession();
        if (cancelled) return;
        if (!s) { router.replace("/login"); return; }
        if (!s.onboarded) { router.replace("/onboarding"); return; }
        setSession(s);
        wsRef.current = s.workspaceId;

        const [loaded, members, cats, phases] = await Promise.all([
          loadBoards(s.workspaceId),
          listMembers(s.workspaceId),
          listCategories(s.workspaceId),
          loadPhases(s.workspaceId),
        ]);
        if (cancelled) return;
        setBoards(loaded);
        setPhaseSnapshot(phases);
        let remembered: string | null = null;
        try { remembered = localStorage.getItem(`gd-board:${s.workspaceId}`); } catch { /* optional preference */ }
        const params=new URLSearchParams(window.location.search);
        const requested=params.get('board');
        if(requested)setAllBoards(false);
        setFilterKind(params.get('category'));
        setActiveBoardId(loaded.find(b => b.id === (requested||remembered))?.id ?? loaded[0]?.id ?? null);
        setPeople(members);
        setCategories(cats);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  useCloseDetailsOnOutsideClick();

  useSidebarLiveUpdates(loading ? null : session?.workspaceId ?? null,
    ["boards", "board_columns", "board_cards", "board_categories", "planning_phases", "phase_dependencies"], async () => {
      if (!session) return;
      const [fresh, cats, phases] = await Promise.all([loadBoards(session.workspaceId), listCategories(session.workspaceId), loadPhases(session.workspaceId)]);
      setBoards(fresh); setCategories(cats); setPhaseSnapshot(phases);
      setActiveBoardId(cur => cur && fresh.some(b => b.id === cur) ? cur : fresh[0]?.id ?? null);
    });

  // ---- realtime: refetch on any board change from a teammate + presence ----
  useEffect(() => {
    const wsId = wsRef.current;
    if (loading || !wsId || !session) return;

    const channel = supabase.channel(`board:${wsId}`, { config: { broadcast: { self: false } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ key: string; name: string; initials: string; color: string }>();
        const seen = new Map<string, { key: string; name: string; initials: string; color: string }>();
        for (const metas of Object.values(state)) {
          for (const m of metas) seen.set(m.key, m);
        }
        setOnline(Array.from(seen.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            key: session.userId,
            name: session.name,
            initials: session.initials,
            color: session.color,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading, session]);

  useEffect(() => {
    if (session && activeBoardId) {
      try { localStorage.setItem(`gd-board:${session.workspaceId}`, activeBoardId); } catch { /* optional preference */ }
    }
  }, [session, activeBoardId]);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const topbarBoard = combined ? undefined : activeBoard;
  // Same presence fallback as the doc/canvas pages: show yourself when alone.
  const onlineList: PresenceUser[] =
    online.length > 0
      ? online
      : session
        ? [{ key: session.userId, name: session.name, initials: session.initials, color: session.color }]
        : [];
  // In All boards mode the kanban works on every column at once; edits are mapped back to each board by column id.
  const cols = combined ? boards.flatMap((b) => b.cols) : activeBoard?.cols ?? [];
  const visibleCols = cols;
  const boardOfColumn = (colId: string) => boards.find((b) => b.cols.some((c) => c.id === colId));

  function setCols(updater: ColData[] | ((cols: ColData[]) => ColData[])) {
    setBoards((prev) => {
      if (!combined) return prev.map((b) =>
        b.id !== (activeBoardId ?? prev[0]?.id) ? b : { ...b, cols: typeof updater === "function" ? updater(b.cols) : updater }
      );
      const next = typeof updater === "function" ? updater(prev.flatMap((b) => b.cols)) : updater;
      const byId = new Map(next.map((c) => [c.id, c]));
      return prev.map((b) => ({ ...b, cols: b.cols.map((c) => byId.get(c.id) ?? c) }));
    });
  }

  /** Reuse the persistent link; only a newly created canvas receives the seed note. */
  async function handleMakeCanvas(card: CardData, existingCanvasId?: string) {
    const canvas = await openBoardCardCanvas(card.id, existingCanvasId);
    setBoards(prev => prev.map(b => ({ ...b, cols: b.cols.map(c => ({ ...c,
      cards: c.cards.map(k => k.id === card.id ? { ...k, canvasId: canvas.id } : k)
    })) })));
    const params = new URLSearchParams({ c: canvas.id });
    if (canvas.created) {
      const lines = [card.title];
      if (card.sub) lines.push("", card.sub);
      const meta = [card.kind, ...(card.tags ?? [])].filter(Boolean).map(t => "#" + t).join("  ");
      if (meta) lines.push("", meta);
      params.set("note", lines.join("\n"));
    }
    router.push(`/doc/canvas?${params}`);
  }

  function handleAddBoard() { if(canEdit)setStageBoard(null); }
  function handleManageStages(board:BoardData) { if(canEdit)setStageBoard(board); }

  /* drag handlers */
  function handleDragStart(e: DragEvent<HTMLDivElement>, cardId: string) {
    if(!canEdit){e.preventDefault();return;}
    const srcCol = cols.find((c) => c.cards.some((k) => k.id === cardId));
    drag.current = { cardId, srcColId: srcCol?.id ?? null };
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
  // Boards keep their own stages, so a card never crosses boards by drag.
  const crossesBoards = (colId: string) => !!drag.current.srcColId && boardOfColumn(drag.current.srcColId)?.id !== boardOfColumn(colId)?.id;
  function handleDragOver(e: DragEvent<HTMLDivElement>, colId: string, cardId: string | null) {
    if (!drag.current.cardId || crossesBoards(colId)) return; // a column (not a card) is being dragged, or another board
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const position = ((): "above" | "below" | null => {
      if (!cardId) return null;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2 ? "above" : "below";
    })();
    setDragState({ overCol: colId, overCard: cardId, position });
  }
  function handleDrop(e: DragEvent<HTMLDivElement>, colId: string, targetCardId: string | null) {
    e.preventDefault();
    const { cardId } = drag.current;
    if (!cardId || crossesBoards(colId)) return;

    // compute the move synchronously so we can persist the resulting order
    let card: CardData | undefined;
    const without = cols.map((c) => {
      const found = c.cards.find((k) => k.id === cardId);
      if (found) card = found;
      return { ...c, cards: c.cards.filter((k) => k.id !== cardId) };
    });
    if (!card) return;
    const moved = { ...card, dragging: false };
    const next = without.map((c) => {
      if (c.id !== colId) return c;
      if (!targetCardId) return { ...c, cards: [...c.cards, moved] };
      const idx = c.cards.findIndex((k) => k.id === targetCardId);
      const pos = dragState?.position === "above" ? idx : idx + 1;
      const cards = [...c.cards];
      cards.splice(pos, 0, moved);
      return { ...c, cards };
    });
    setCols(next);
    setDragState(null);

    const destCol = next.find((c) => c.id === colId);
    if (destCol) {
      moveCard(cardId, colId, destCol.cards.map((k) => k.id))
        .then(async()=>{if(wsRef.current)setBoards(await loadBoards(wsRef.current));})
        .catch(async(err) => {setBoardActionError(err.message);if(wsRef.current)setBoards(await loadBoards(wsRef.current));});
    }
  }
  function handleDragLeave() { /* keep state for cross-card sub-regions */ }

  /* add card */
  async function handleAddCard(colId: string, title: string) {
    if (!wsRef.current) throw new Error("Workspace is not ready yet.");
    try {
      const card = await createCard(wsRef.current, colId, title);
      setCols((prev) => prev.map((c) =>
        c.id !== colId ? c : c.cards.some((k) => k.id === card.id) ? c : { ...c, cards: [...c.cards, card] }
      ));
    } catch (e) {
      throw e;
    }
  }

  /* save card from modal */
  async function handleSaveCard(updated: CardData, snapshot: ScheduleSnapshot) {
    if (session?.role === "viewer") throw new Error("You need editor access to change cards.");
    if (!session) return;
    setScheduleResult(await mutateSchedule(session.workspaceId, snapshot, {op:'card',card:{...((snapshot.cards.find(c=>c.id===updated.id)?.parent_id??null)!==(updated.parentId??null)?{parent_id:updated.parentId??null}:{}),id:updated.id,title:updated.title,sub:updated.sub,kind:updated.kind,category_id:updated.categoryId??null,tags:updated.tags,priority:updated.priority,owners:updated.ownerIds,column_id:updated.columnId}}));
    setBoards(await loadBoards(session.workspaceId));
  }

  async function refreshPlanning(){if(!session)return;const [fresh,cats,phases]=await Promise.all([loadBoards(session.workspaceId),listCategories(session.workspaceId),loadPhases(session.workspaceId)]);setBoards(fresh);setCategories(cats);setPhaseSnapshot(phases);}
  function handleDeleteCard(card:CardData){if(!canEdit)return;setActionDialog({title:'Delete task?',description:`“${card.title}” and its scheduling relationships will be removed. Its subtasks become main tasks. Its linked canvas is kept.`,submit:async()=>{await deleteCard(card.id);await refreshPlanning();}});}
  function handleDeleteBoard(board:BoardData){if(!canEdit)return;setActionDialog({title:'Delete board?',description:`“${board.name}” and all its tasks, phase schedules, dependencies, and board milestones will be removed. This cannot be undone.`,submit:async()=>{await deleteBoard(board.id);await refreshPlanning();}});}
  async function handleCopyBoard(board:BoardData){
    if(!canEdit||!session)return;
    setBoardActionError('');
    try{
      const copy=await copyBoard(session.workspaceId,board.id);
      setBoards(await loadBoards(session.workspaceId));
      setAllBoards(false);
      setActiveBoardId(copy.id);
    }catch(e){setBoardActionError((e as Error).message);}
  }

  const displayCols = visibleCols.map((c) => ({
    ...c,
    cards: c.cards.filter((k) =>
      k.title.toLowerCase().includes(search.toLowerCase()) &&
      (!ownerFilter || k.ownerIds.includes(ownerFilter)) &&
      (!filterKind || k.categoryId === filterKind)
    ),
  }));

  if (loading || error) {
    return (
      <>
        <style>{css}</style>
        <div className="board-app" style={{ alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: error ? "#b9421f" : "var(--ink-soft)", fontSize: 14 }}>
            {error ? `Couldn't load boards: ${error}` : "Loading boards…"}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className={`board-app planning-app${navigationOpen ? " navigation-open" : ""}`}>

        {/* topbar (global chrome) */}
        <TopBar
          crumbs={topbarBoard ? [isCalendar ? "Calendar" : "Board", topbarBoard.name] : [isCalendar ? "Calendar" : "Board"]}
          online={onlineList}
        >
          <button
            className="share-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 1500);
              } catch (e) {
                console.error(e);
              }
            }}
          >
            {shareCopied ? "Copied!" : "Share"}
          </button>
          <SettingsButton session={session} onSessionChange={setSession} />
        </TopBar>

        <div className="body-row">
          {/* sidebar: board list */}
          <aside className="sidebar">
            <div className="sidebar-label">Boards</div>
            {boards.length > 1 && <button className={`sidebar-item${combined ? " active" : ""}`} onClick={() => {setAllBoards(true);}} title="All boards">
              <span className="sidebar-dot" style={{ background: "var(--ember)" }} />
              <span className="sidebar-name">All boards</span>
            </button>}
            {boards.map((b) => (
              <button
                key={b.id}
                className={`sidebar-item${!combined && b.id === activeBoardId ? " active" : ""}`}
                onClick={() => { setAllBoards(false); setActiveBoardId(b.id); }}
                title={b.name}
              >
                <span className="sidebar-dot" style={{ background: boardColor(b, boards) }} />
                <span className="sidebar-name">{b.name}</span>
              </button>
            ))}
            <div className="sidebar-divider" />
            {canEdit&&<button className="sidebar-item sidebar-new" onClick={handleAddBoard} title="New board">
              <Plus />
              <span className="sidebar-name">New board</span>
            </button>}

            <div className="sidebar-divider" />

          </aside>

          <div className="main-col">
            {boardActionError&&<div role="alert" className="gantt-error">{boardActionError}<button onClick={()=>setBoardActionError('')}>Dismiss</button></div>}
            {scheduleResult&&<div role="status" className="gantt-caption">{scheduleResult.moved} tasks moved. Changes saved.<button disabled={undoBusy} onClick={async()=>{
              if(!session)return;setUndoBusy(true);
              try{await mutateSchedule(session.workspaceId,scheduleResult.snapshot,{op:'undo',dates:scheduleResult.before});setScheduleResult(null);setBoards(await loadBoards(session.workspaceId));}
              catch(e){setBoardActionError((e as Error).message);}finally{setUndoBusy(false);}
            }}>Undo dates</button></div>}
            {!isCalendar&&<PlanningHeader title={combined&&boards.length?'All boards':activeBoard?.name??'Your boards'} mode="board" boardId={combined?undefined:activeBoardId??undefined} canEdit={canEdit} onCreate={handleAddBoard} onNavigation={()=>setNavigationOpen(v=>!v)}>
              <select aria-label="Choose board" value={combined?'all':activeBoard?.id??''} onChange={e=>{if(e.target.value==='all'){setAllBoards(true);}else{setAllBoards(false);setActiveBoardId(e.target.value);}}}>{!boards.length&&<option value="">No boards yet</option>}{boards.length>1&&<option value="all">All boards</option>}{boards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <label className="planning-search"><PlanningIcon name="search"/><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={e=>setSearch(e.target.value)}/></label>
              <details className="planning-menu"><summary>Filters{filterKind||ownerFilter?' · Active':''}</summary><div><label>Category<select value={filterKind??''} onChange={e=>setFilterKind(e.target.value||null)}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Owner<select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="">Everyone</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div></details>
              {canEdit&&activeBoard&&<details className="planning-menu planning-overflow"><summary><PlanningIcon name="more"/>More</summary><div>{!combined&&<button onClick={()=>handleManageStages(activeBoard)}>Manage stages</button>}<button onClick={()=>setCategoryManager(true)}>Manage categories</button>{!combined&&<button onClick={()=>handleCopyBoard(activeBoard)}>Copy board</button>}{!combined&&<button onClick={()=>handleDeleteBoard(activeBoard)}>Delete board</button>}</div></details>}
            </PlanningHeader>}
            {!isCalendar&&!combined&&activeBoard&&<div className="board-phase-summary"><Link href={`/table?board=${activeBoard.id}`}>{phaseRangeLabel(phaseSnapshot?.phases.find(p=>p.board_id===activeBoard.id&&p.category_id===(filterKind||null)))} · Open {filterKind?'subphase':'phase'} in Gantt ↗</Link></div>}
            {!isCalendar&&!boards.length&&<div className="planning-empty"><PlanningIcon name="board"/><h2>A place for your next idea</h2><p>Create a board with the stages that fit your team's workflow.</p>{canEdit&&<button className="planning-primary" onClick={handleAddBoard}>Create your first board</button>}</div>}
            {isCalendar ? <CalendarView canEdit={canEdit} project={session?.workspaceId ?? ""} onNavigation={()=>setNavigationOpen(v=>!v)} /> :
            <div className="board-scroll">
              {(combined ? boards : activeBoard ? [activeBoard] : []).map((board) => {
                const boardCols = displayCols.filter((c) => board.cols.some((b) => b.id === c.id));
                const count = boardCols.reduce((n, c) => n + c.cards.length, 0);
                const end = boardEndDate(board);
                const phase = phaseSnapshot?.phases.find(p=>p.board_id===board.id&&p.category_id===(filterKind||null));
                return <section key={board.id} className={combined ? "kanban-group" : undefined} aria-label={board.name} style={combined ? { "--board-color": boardColor(board, boards) } as CSSProperties : undefined}>
                  {combined && <header className="board-group-head">
                    <div><h2>{board.name}</h2><Link className="board-phase-summary" href={`/table?board=${board.id}`}>{phaseRangeLabel(phase)} · Gantt ↗</Link></div>
                    <div className="board-group-meta">
                      <span className="board-group-count">{count} {count === 1 ? "task" : "tasks"}{end ? ` · Ends ${formatDeadline(end)}` : ""}</span>
                      <details className="planning-menu planning-overflow">
                        <summary aria-label={`${board.name} actions`}><PlanningIcon name="more" /></summary>
                        <div>
                          {canEdit && <button onClick={() => handleManageStages(board)}>Manage stages</button>}
                          {canEdit && <button onClick={() => handleCopyBoard(board)}>Copy board</button>}
                          <button onClick={() => { setAllBoards(false); setActiveBoardId(board.id); }}>Open board</button>
                        </div>
                      </details>
                    </div>
                  </header>}
                  <div className="board-cols">
                    {boardCols.map((col) => (
                      <Column
                        key={col.id}
                        col={col}
                        people={people}
                        canEdit={canEdit}
                        onManageStages={()=>handleManageStages(board)}
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
                    {canEdit&&<button className="add-col-ghost" onClick={()=>handleManageStages(board)}>
                      <Plus style={{ width: 16, height: 16 }} />
                      <span>Add a stage</span>
                    </button>}
                  </div>
                </section>;
              })}
            </div>}
          </div>
        </div>

        {/* Compact app navigation stays outside the task scroll area. */}
        <Dock planningBoardId={combined?undefined:activeBoardId??undefined} />

        {stageBoard!==undefined&&session&&<StageDialog project={session.workspaceId} board={stageBoard} boards={boards} onClose={()=>setStageBoard(undefined)} onSaved={async id=>{setBoards(await loadBoards(session.workspaceId));setActiveBoardId(id);setAllBoards(false);}}/>}
        {actionDialog&&<PlanningDialog action={actionDialog} onClose={()=>setActionDialog(null)}/>}
        {categoryManager&&session&&<CategoryManager project={session.workspaceId} categories={categories} onClose={()=>setCategoryManager(false)} onRefresh={refreshPlanning}/>}
        {/* card edit modal */}
        {editingCard && (
          <CardModal
            key={editingCard.id}
            panel={false}
            canEdit={!!session && session.role !== 'viewer'}
            boards={boards}
            columns={boards.flatMap(b=>b.cols.map(c=>({id:c.id,name:`${b.name} · ${c.name}`})))}
            card={editingCard}
            workspaceId={session?.workspaceId ?? ""}
            people={people}
            categories={categories}
            onClose={() => setEditingCard(null)}
            onSave={handleSaveCard}
            onDelete={handleDeleteCard}
            onMakeCanvas={handleMakeCanvas}
          />
        )}
      </div>
    </>
  );
}
