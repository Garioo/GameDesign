"use client";
import { parentChoices as hierarchyParentChoices } from "@/lib/taskHierarchy";
import Icon from "@/app/components/Icon";
import MultiSelectPicker from "@/app/components/MultiSelectPicker";
import { loadSchedule, mutateSchedule, type ScheduleSnapshot } from '@/lib/ganttRepo';

import { useCallback, useEffect, useMemo, useState, useRef, type CSSProperties, type DragEvent } from "react";
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
import { CardComments, SubtaskList, TagInput, type SubtaskItem } from "./CardDetails";
import cardStyles from "./CardDetails.module.css";
import { HistoryToggle } from "@/app/components/ActivityFeed";
import TopBar from "@/app/components/TopBar";
import { useSitePresence } from "@/lib/useSitePresence";
import { useFollowedView, useShareView } from "@/lib/followView";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { listCanvases, type CanvasInfo } from "@/lib/canvasRepo";
import { listMembers, type ProfileInfo } from "@/lib/docsRepo";
import { mentionHref, type MentionTarget } from "@/app/doc/mentions";
import { plainLinkedText } from "@/lib/pageLinks";
import { loadLinkTargets } from "@/lib/linkTargets";
import LinkedText from "@/app/components/LinkedText";
import { useShortcuts } from "@/lib/shortcuts";
import { confirmDiscard, sameItems } from "@/lib/confirmDiscard";
import { blockedIds, type CardDependency, type Milestone, type RecurringRule } from "@/lib/planning";
import { loadPlanning, spawnRecurring } from "@/lib/planningRepo";
import { PlanningCtx, TaskBadges, TaskPlanningSection, type BoardTask, type PlanningState } from "./TaskPlanning";
import PageLinkTextarea from "./PageLinkTextarea";
import {
  boardEndDate,
  copyBoard,
  createCard,
  deleteBoard,
  deleteCard,
  createSubtask,
  listCategories,
  loadBoards,
  moveCard,
  openBoardCardCanvas,
  setCardOwner,
  setCardPages,
  setCardPriority,
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

/** High first, then Medium, then Low; unset priority sinks to the bottom. */
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
function byPriority(a: CardData, b: CardData): number {
  return (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDeadline(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

/* ── Card component ──────────────────────────────────────────────────────── */
function Card({ card, people, subtasks, onDragStart, onDragEnd, dropState, onClick }: {
  card: CardData;
  people: Person[];
  /** Direct-subtask progress, when the task has any. */
  subtasks?: { done: number; total: number };
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
      {card.sub && <div className="card-sub">{plainLinkedText(card.sub)}</div>}
      <TaskBadges taskId={card.id} milestoneId={card.milestoneId} recurrenceId={card.recurrenceId} />
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
        {subtasks && (
          <span className={cardStyles.badges}>
            <span className={subtasks.done === subtasks.total ? cardStyles.badgeDone : undefined} title="Subtasks done">
              ☑ {subtasks.done}/{subtasks.total}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Column component ────────────────────────────────────────────────────── */
function Column({ col, people, subtaskStats, canEdit, onManageStages, onAddCard, onCardClick, dragState, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave }: {
  col: ColData;
  people: Person[];
  subtaskStats: Map<string, { done: number; total: number }>;
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
                subtasks={subtaskStats.get(card.id)}
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
type CardModalProps = {
  boards: BoardData[];
  currentUserId: string;
  /** Switch the dialog to another task (e.g. a subtask). */
  onOpenCard: (id: string) => void;
  onAddSubtask: (parent: CardData, title: string) => Promise<void>;
  onToggleSubtask: (id: string, done: boolean) => Promise<void>;
  /** Move the task to another stage of its own board, straight from the task view. */
  onMoveStage: (id: string, columnId: string) => Promise<void>;
  panel: boolean; canEdit: boolean;
  card: CardData;
  workspaceId: string;
  people: Person[];
  categories: BoardCategory[];
  onClose: () => void;
  onSave: (card: CardData, snapshot: ScheduleSnapshot) => Promise<void>;
  onDelete: (card: CardData) => void;
  onMakeCanvas: (card: CardData, existingCanvasId?: string) => Promise<void>;
  /** Quick changes made straight from the task view, without the edit form. */
  onQuickChange: (id: string, change: QuickChange) => Promise<void>;
  /** Pages and canvases a description can link to (also used for current titles). */
  linkTargets: MentionTarget[];
  /** Set while the edit form is open, so following someone never closes it under you. */
  editingRef?: { current: boolean };
};

type QuickChange = { priority: string | null } | { owner: string; assigned: boolean } | { pageIds: string[] };
const PRIORITIES = ["high", "medium", "low"] as const;

/** Task dialog: a read-only view by default; editors switch to the form with Edit. */
function CardModal(props: CardModalProps) {
  const { card, people, categories, onClose, onOpenCard, onAddSubtask, onToggleSubtask, onMoveStage, currentUserId, panel, canEdit, boards } = props;
  const [editing, setEditing] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [stageError, setStageError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [canvasError, setCanvasError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [linkingPage, setLinkingPage] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const cardBoard = boards.find(b => b.cols.some(c => c.cards.some(k => k.id === card.id)));
  const cardCol = cardBoard?.cols.find(c => c.cards.some(k => k.id === card.id));
  const parent = card.parentId ? boards.flatMap(b => b.cols.flatMap(c => c.cards)).find(k => k.id === card.parentId) : undefined;
  const category = categories.find(c => c.id === card.categoryId);
  const owners = ownersByIds(people, card.ownerIds);
  const subtasks: SubtaskItem[] = boards.flatMap(b => b.cols.flatMap(c => c.cards
    .filter(t => t.parentId === card.id)
    .map(t => ({ id: t.id, title: t.title, stage: c.name, done: !!c.isCompleted }))));
  const canAddSubtask = canEdit && !!cardBoard?.cols.some(c => !c.isCompleted);
  const canToggle = canEdit && !!cardBoard?.cols.some(c => c.isCompleted) && !!cardBoard?.cols.some(c => !c.isCompleted);

  const dialogRef=useRef<HTMLDivElement>(null);
  const editingRef=useRef(editing);
  editingRef.current=editing;
  const outerEditing=props.editingRef;
  useEffect(()=>{if(outerEditing)outerEditing.current=editing;},[editing,outerEditing]);
  useEffect(()=>()=>{if(outerEditing)outerEditing.current=false;},[outerEditing]);
  // Set by the edit form while it holds changes that Save hasn't sent yet.
  const editDirty=useRef(false);
  const okToDropEdits=()=>!editingRef.current||confirmDiscard(editDirty.current,"your edits to this task");
  function leaveEdit(){if(okToDropEdits())setEditing(false);}
  function close(){if(okToDropEdits())onClose();}
  const closeRef=useRef(close);
  closeRef.current=close;
  const leaveEditRef=useRef(leaveEdit);
  leaveEditRef.current=leaveEdit;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialogRef.current?.focus();
    function key(e:KeyboardEvent){
      // Escape leaves the form first, then closes the dialog.
      if(e.key==='Escape'){e.preventDefault();if(editingRef.current)leaveEditRef.current();else closeRef.current();}
      if(e.key==='Tab'){
        const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')??[]).filter(el=>el.offsetParent!==null&&!el.closest('fieldset:disabled'));
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[card.id]);

  async function quick(change: QuickChange) {
    setQuickError("");
    try { await props.onQuickChange(card.id, change); }
    catch (e) { setQuickError(e instanceof Error ? e.message : "Could not update the task."); }
  }
  const pageTargets = props.linkTargets.filter(t => t.kind === "page");
  const linkedPages = card.pageIds.map(id => pageTargets.find(t => t.ref === id) ?? { ref: id, title: "Page unavailable", group: "", kind: "page" as const });
  const pageMatches = pageTargets
    .filter(t => !card.pageIds.includes(t.ref) && `${t.title} ${t.group}`.toLowerCase().includes(pageQuery.trim().toLowerCase()))
    .slice(0, 8);
  function linkPage(id: string) {
    setPageQuery(""); setLinkingPage(false);
    void quick({ pageIds: [...card.pageIds, id] });
  }

  async function createCanvas() {
    if (canvasBusy) return;
    setCanvasBusy(true); setCanvasError("");
    try { await props.onMakeCanvas(card); }
    catch (e) { setCanvasError(e instanceof Error ? e.message : "Could not open canvas."); }
    finally { setCanvasBusy(false); }
  }

  return (
    <div className={`modal-backdrop${panel ? " gantt-inspector-backdrop" : ""}`} onClick={close}>
      <div ref={dialogRef} tabIndex={-1} className={`modal ${cardStyles.dialog}${panel ? " gantt-inspector" : ` ${cardStyles.wide}`}${expanded ? " expanded" : ""}`} role="dialog" aria-modal="true" aria-label="Task details" onClick={(e) => e.stopPropagation()}>
        <div className={`gantt-inspector-heading ${cardStyles.heading}`}>
          {editing
            ? <h2>Edit task</h2>
            : <span className={cardStyles.crumb}>{cardBoard?.name ?? "Task"}{cardCol ? ` · ${cardCol.name}` : ""}</span>}
          {!editing && canEdit && <button type="button" className="modal-save" onClick={() => setEditing(true)}>Edit</button>}
          {!editing && (card.canvasId
            ? <Link className={`modal-cancel ${cardStyles.canvasLink}`} href={`/doc/canvas?c=${card.canvasId}`} title="Open the canvas linked to this task"><Icon name="grid" /> Canvas</Link>
            : canEdit && <button type="button" className={`modal-cancel ${cardStyles.canvasLink}`} disabled={canvasBusy} onClick={createCanvas} title="Open this task as a canvas">
                <Icon name="grid" /> {canvasBusy ? "Opening…" : "Open as canvas"}
              </button>)}
          <button type="button" className="modal-cancel" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(cardBoard?.id ?? "")}&card=${encodeURIComponent(card.id)}`);
              setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500);
            } catch (e) { console.error(e); }
          }}>{linkCopied ? "Copied!" : "Copy link"}</button>
          <button className={cardStyles.close} onClick={close} aria-label="Close task details"><Icon name="close" /></button>
        </div>
        {panel && <button className="gantt-sheet-toggle" onClick={()=>setExpanded(!expanded)}>{expanded ? "Reduce panel" : "Expand panel"}</button>}
        <div className={cardStyles.layout}>
          {editing ? (
            <CardEditForm {...props} dirtyRef={editDirty} onDone={() => setEditing(false)} onCancel={leaveEdit} />
          ) : (
            <div className={cardStyles.view}>
              {parent && (
                <button type="button" className={cardStyles.parentLink} onClick={() => onOpenCard(parent.id)}>
                  <Icon name="cornerLeftUp" /> Subtask of <strong>{parent.title}</strong>
                </button>
              )}
              <h2 className={cardStyles.viewTitle}>{card.title}</h2>
              <div className={cardStyles.chips}>
                {cardCol && (canEdit && cardBoard
                  ? <label className={`${cardStyles.stageChip} ${cardStyles.stagePicker}`}>
                      <span className={cardStyles.stageDot} style={{ background: cardCol.color }} />
                      <select aria-label="Task status" value={cardCol.id} disabled={stageBusy} onChange={async e => {
                        setStageBusy(true); setStageError("");
                        try { await onMoveStage(card.id, e.target.value); }
                        catch (err) { setStageError(err instanceof Error ? err.message : "Could not change the status."); }
                        finally { setStageBusy(false); }
                      }}>
                        {cardBoard.cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  : <span className={cardStyles.stageChip}><span className={cardStyles.stageDot} style={{ background: cardCol.color }} />{cardCol.name}</span>)}
                {canEdit
                  ? <label className={`${cardStyles.stageChip} ${cardStyles.stagePicker} ${cardStyles.priorityPicker} ${card.priority ? cardStyles[`p_${card.priority}`] ?? "" : cardStyles.p_none}`}>
                      <select aria-label="Task priority" value={card.priority ?? ""} onChange={e => void quick({ priority: e.target.value || null })}>
                        <option value="">No priority</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)} priority</option>)}
                      </select>
                    </label>
                  : card.priority && <span className={`card-priority ${card.priority}`}>{card.priority[0].toUpperCase() + card.priority.slice(1)} priority</span>}
                {(category?.name || card.kind) && <span className="card-tag">{category?.name ?? card.kind}</span>}
              </div>

              {stageError && <p role="alert" className="gantt-error">{stageError}</p>}
              {quickError && <p role="alert" className="gantt-error">{quickError}</p>}
              <div className={cardStyles.section}>
                <div className="modal-label">Description</div>
                {card.sub
                  ? <p className={cardStyles.description}><LinkedText text={card.sub} targets={props.linkTargets} /></p>
                  : canEdit
                    ? <button type="button" className={cardStyles.linkBtn} onClick={() => setEditing(true)}><Icon name="plus" /> Add a description</button>
                    : <p className={cardStyles.muted}>No description.</p>}
              </div>

              <div className={cardStyles.section}>
                <div className={cardStyles.sectionHead}>
                  <div className="modal-label">Assignees</div>
                  {canEdit && people.length > 0 && <button type="button" className={cardStyles.linkBtn} aria-expanded={assigning} onClick={() => setAssigning(a => !a)}>
                    {assigning ? "Done" : owners.length ? "Change" : <><Icon name="plus" /> Assign</>}
                  </button>}
                </div>
                {assigning
                  ? <div className="owner-chips">{people.map(p => {
                      const on = card.ownerIds.includes(p.id);
                      return <button key={p.id} type="button" aria-pressed={on} className={`owner-chip${on ? " active" : ""}`} onClick={() => void quick({ owner: p.id, assigned: !on })}>
                        <span className="owner-chip-avatar" style={{ background: p.color }}>{p.initials}</span>{p.name}
                      </button>;
                    })}</div>
                  : owners.length
                    ? <div className={cardStyles.people}>{owners.map(o => (
                        <span key={o.id} className={cardStyles.person}>
                          <span className="owner-chip-avatar" style={{ background: o.color }}>{o.initials}</span>{o.name}
                        </span>))}</div>
                    : <p className={cardStyles.muted}>Unassigned</p>}
              </div>

              {(linkedPages.length > 0 || canEdit) && <div className={cardStyles.section}>
                <div className="modal-label">Linked pages</div>
                {linkedPages.length > 0 && <ul className={cardStyles.pageLinks}>
                  {linkedPages.map(pg => <li key={pg.ref}>
                    <Link href={mentionHref(pg.ref)}><Icon name="file" /><span>{pg.title}</span>{pg.group && <small>{pg.group}</small>}</Link>
                    {canEdit && <button type="button" className={cardStyles.pageUnlink} aria-label={`Unlink “${pg.title}”`} title="Unlink"
                      onClick={() => void quick({ pageIds: card.pageIds.filter(id => id !== pg.ref) })}><Icon name="close" /></button>}
                  </li>)}
                </ul>}
                {canEdit && (linkingPage
                  ? <div className={cardStyles.pagePicker}>
                      <input className="modal-input" autoFocus placeholder="Search pages…" aria-label="Search pages to link" value={pageQuery}
                        onChange={e => setPageQuery(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Escape") { e.nativeEvent.stopPropagation(); setLinkingPage(false); setPageQuery(""); }
                          if (e.key === "Enter" && pageMatches[0]) { e.preventDefault(); linkPage(pageMatches[0].ref); }
                        }} />
                      <ul role="listbox" aria-label="Pages">
                        {pageMatches.map(t => <li key={t.ref}><button type="button" onClick={() => linkPage(t.ref)}>
                          <Icon name="file" /><span>{t.title}</span><small>{t.group}</small>
                        </button></li>)}
                        {pageMatches.length === 0 && <li className={cardStyles.muted}>{pageTargets.length ? "No matching pages." : "No pages in this workspace yet."}</li>}
                      </ul>
                    </div>
                  : <button type="button" className={cardStyles.linkBtn} onClick={() => setLinkingPage(true)}><Icon name="link" /> Link a page</button>)}
              </div>}

              <TaskPlanningSection taskId={card.id} onOpenCard={onOpenCard} editable={false} />

              {card.tags.length > 0 && (
                <div className={cardStyles.section}>
                  <div className="modal-label">Tags</div>
                  <div className={cardStyles.chips}>{card.tags.map(t => <span key={t} className={cardStyles.tag}>{t}</span>)}</div>
                </div>
              )}

              {canvasError && <p role="alert" className="gantt-error">{canvasError}</p>}
            </div>
          )}
          <div>
            <SubtaskList items={subtasks} canAdd={canAddSubtask} onOpen={onOpenCard} onAdd={title => onAddSubtask(card, title)} onToggle={canToggle ? onToggleSubtask : undefined} />
            <CardComments cardId={card.id} people={people} currentUserId={currentUserId} />
            <HistoryToggle workspaceId={props.workspaceId} cardId={card.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Turns bare http(s) URLs in plain text into links. */
/** The editable form, mounted fresh on each Edit so it starts from the latest task data. */
function CardEditForm({ card, workspaceId, people, categories, onClose, onSave, onDelete, onMakeCanvas, canEdit, boards, linkTargets, onDone, onCancel, dirtyRef }: CardModalProps & {
  /** After a successful save. */
  onDone: () => void;
  /** Cancel button — the modal asks first if there are unsaved edits. */
  onCancel: () => void;
  dirtyRef: { current: boolean };
}) {
  const [title, setTitle] = useState(card.title);
  const [sub, setSub] = useState(card.sub ?? "");
  const [kind, setKind] = useState(card.kind ?? "");
  const [categoryId, setCategoryId] = useState(card.categoryId ?? "");
  const [priority, setPriority] = useState(card.priority ?? "");
  const [ownerIds, setOwnerIds] = useState<string[]>(card.ownerIds ?? []);
  const [parentId, setParentId] = useState(card.parentId ?? "");
  const [tags, setTags] = useState<string[]>(card.tags ?? []);
  const [columnId, setColumnId] = useState(card.columnId ?? "");
  const dirty = title !== card.title || sub !== (card.sub ?? "") || kind !== (card.kind ?? "")
    || categoryId !== (card.categoryId ?? "") || priority !== (card.priority ?? "") || parentId !== (card.parentId ?? "")
    || columnId !== (card.columnId ?? "") || !sameItems(ownerIds, card.ownerIds ?? []) || !sameItems(tags, card.tags ?? []);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty, dirtyRef]);
  useEffect(() => () => { dirtyRef.current = false; }, [dirtyRef]);
  const parentChoices = hierarchyParentChoices(boards.find(b => b.cols.some(c => c.id === columnId)), card.id);
  const [baseline, setBaseline] = useState<ScheduleSnapshot | null>(null);
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
        <fieldset disabled={!canEdit || saving} className={`gantt-card-fields ${cardStyles.form}`}>
        <div className="modal-field">
          <label className="modal-label" htmlFor="task-parent">Parent task</label>
          <select id="task-parent" className="modal-select" value={parentId} onChange={e => setParentId(e.target.value)}>
            <option value="">None — main task</option>
            {parentChoices.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            {parentId && !parentChoices.some(t => t.id === parentId) && <option value={parentId}>Parent in another board — choose None to move</option>}
          </select>
        </div>
        <div className="modal-field">
          <label className="modal-label">Title</label>
          <input className="modal-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label">Description</label>
          <PageLinkTextarea className="modal-textarea" value={sub} onChange={setSub} targets={linkTargets} formatShortcuts
            hint="Type [[ or @ to link a page, section, canvas, board or task · ⌘B bold · ⌘I italic" />
        </div>
        <div className="modal-field">
          <label className="modal-label">Tags</label>
          <TagInput tags={tags} onChange={setTags} />
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
        {boards.length > 1 && <div className="modal-field">
          <label className="modal-label" htmlFor="card-board">Board</label>
          <select id="card-board" className="modal-select" value={boards.find(b => b.cols.some(c => c.id === columnId))?.id ?? ""} onChange={e => {
            // Status is changed on the task itself; here a board change keeps a same-named
            // stage when the new board has one, else lands in its first open stage.
            const target = boards.find(b => b.id === e.target.value);
            const current = boards.flatMap(b => b.cols).find(c => c.id === columnId);
            const next = target?.cols.find(c => c.name === current?.name) ?? target?.cols.find(c => !c.isCompleted) ?? target?.cols[0];
            if (next) setColumnId(next.id);
          }}>{boards.map(b => <option key={b.id} value={b.id} disabled={!b.cols.length}>{b.name}</option>)}</select>
        </div>}
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
        <div className="modal-field">
          <TaskPlanningSection taskId={card.id} editable />
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
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-save" disabled={saving || !baseline} onClick={async () => {
            setSaving(true); setSaveError("");
            try {
              if (!baseline) return;
              await onSave({ ...card, title, sub, kind, categoryId: categoryId || null, priority: priority || null, ownerIds, columnId, parentId: parentId || null, tags }, baseline);
              onDone();
            } catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save card."); }
            finally { setSaving(false); }
          }}>{saving ? "Saving…" : "Save"}</button>
        </div>
        </fieldset>
  );
}

/* ── Main BoardPage component ─────────────────────────────────────────────── */
export default function BoardWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const isCalendar = pathname.startsWith("/calendar");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [linkTargets, setLinkTargets] = useState<MentionTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardData[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [allBoards, setAllBoards] = useState(true);
  // Boards shown in the combined view; null = every board (new ones included).
  const [boardFilter, setBoardFilter] = useState<string[] | null>(null);
  const [phaseSnapshot,setPhaseSnapshot]=useState<PhaseSnapshot|null>(null);
  // Milestones, dependencies and repeating tasks (supabase/migrate-project-planning.sql).
  const [plan, setPlan] = useState<{ milestones: Milestone[]; dependencies: CardDependency[]; recurring: RecurringRule[]; missing: boolean }>({ milestones: [], dependencies: [], recurring: [], missing: false });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [stageBoard,setStageBoard]=useState<BoardData|null|undefined>(undefined);
  const [search,setSearch]=useState('');
  const [actionDialog,setActionDialog]=useState<PlanningAction|null>(null);
  const [categoryManager,setCategoryManager]=useState(false);
  const [ownerFilter,setOwnerFilter]=useState('');
  const canEdit=!!session&&session.role!=='viewer';
  const [boardActionError,setBoardActionError]=useState('');
  const [shareCopied,setShareCopied]=useState(false);
  // One board has nothing to combine, so the grouped view needs at least two.
  const combined = allBoards && boards.length > 1;
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  // Pages and canvases a task description can link to; reloaded whenever a
  // task opens so newly created pages show up.
  const openCardId = editingCard?.id ?? null;
  useEffect(() => {
    const ws = session?.workspaceId;
    if (!ws || !openCardId) return;
    let active = true;
    loadLinkTargets(ws, boards)
      .then((targets) => { if (active) setLinkTargets(targets.filter((t) => t.ref !== `task:${openCardId}`)); })
      .catch(console.error);
    return () => { active = false; };
    // Boards are passed in rather than refetched; their titles refresh on the next open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.workspaceId, openCardId]);
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
        // Planning loads beside the board; repeating tasks that are due get created first.
        void (async () => {
          const made = s.role !== "viewer" ? await spawnRecurring(s.workspaceId).catch(() => 0) : 0;
          const [p, fresh] = await Promise.all([loadPlanning(s.workspaceId), made ? loadBoards(s.workspaceId) : Promise.resolve(null)]);
          if (cancelled) return;
          setPlan(p);
          if (fresh) setBoards(fresh);
        })().catch(console.error);
        let remembered: string | null = null;
        try {
          remembered = localStorage.getItem(`gd-board:${s.workspaceId}`);
          const savedFilter = JSON.parse(localStorage.getItem(`gd-board-filter:${s.workspaceId}`) ?? "null");
          if (Array.isArray(savedFilter)) setBoardFilter(savedFilter.filter((id): id is string => typeof id === "string"));
        } catch { /* optional preference */ }
        const params=new URLSearchParams(window.location.search);
        const requested=params.get('board');
        if(requested)setAllBoards(false);
        setFilterKind(params.get('category'));
        setActiveBoardId(loaded.find(b => b.id === (requested||remembered))?.id ?? loaded[0]?.id ?? null);
        // Deep link: ?card=<id> opens that task on its own board.
        const requestedCard=params.get('card');
        const cardBoard=requestedCard?loaded.find(b=>b.cols.some(c=>c.cards.some(k=>k.id===requestedCard))):undefined;
        const linkedCard=cardBoard?.cols.flatMap(c=>c.cards).find(k=>k.id===requestedCard);
        if(cardBoard&&linkedCard){setAllBoards(false);setActiveBoardId(cardBoard.id);setEditingCard(linkedCard);}
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
  const refreshPlan = useCallback(async () => {
    if (!session) return;
    const [p, fresh] = await Promise.all([loadPlanning(session.workspaceId), loadBoards(session.workspaceId)]);
    setPlan(p);
    setBoards(fresh);
  }, [session]);
  useSidebarLiveUpdates(loading ? null : session?.workspaceId ?? null, ["card_dependencies", "milestones", "recurring_tasks"], refreshPlan);
  // Every task with its stage, for badges and the dependency picker.
  const planning = useMemo<PlanningState | null>(() => {
    if (!session) return null;
    const tasks = new Map<string, BoardTask>();
    for (const b of boards) for (const c of b.cols) for (const k of c.cards) {
      tasks.set(k.id, { id: k.id, title: k.title || "Untitled task", done: !!c.isCompleted, milestoneId: k.milestoneId ?? null, recurrenceId: k.recurrenceId ?? null, boardName: b.name, stage: c.name });
    }
    return {
      workspaceId: session.workspaceId,
      canEdit: session.role !== "viewer",
      ...plan,
      tasks,
      blocked: blockedIds(plan.dependencies, tasks),
      refresh: refreshPlan,
    };
  }, [session, boards, plan, refreshPlan]);


  useEffect(() => {
    if (session && activeBoardId) {
      try { localStorage.setItem(`gd-board:${session.workspaceId}`, activeBoardId); } catch { /* optional preference */ }
    }
  }, [session, activeBoardId]);

  useEffect(() => {
    if (!session) return;
    try { localStorage.setItem(`gd-board-filter:${session.workspaceId}`, JSON.stringify(boardFilter)); } catch { /* optional preference */ }
  }, [session, boardFilter]);

  const visibleBoards = boardFilter === null ? boards : boards.filter((b) => boardFilter.includes(b.id));
  const showAllBoards = () => { setAllBoards(true); setBoardFilter(null); };
  // One ticked board opens it on its own; any other choice is the combined view.
  const chooseBoards = (ids: string[] | null) => {
    if (ids && ids.length === 1) { setAllBoards(false); setActiveBoardId(ids[0]); return; }
    setAllBoards(true);
    setBoardFilter(ids);
  };

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const topbarBoard = combined ? undefined : activeBoard;
  // Online teammates, site-wide, each with where they are: this board (or all
  // boards / the calendar). An open task is their *view* there, so followers
  // open it in place instead of reloading the board.
  const place = isCalendar
    ? { path: "/calendar", label: "Calendar" }
    : topbarBoard
      ? { path: `/board?board=${topbarBoard.id}`, label: `${topbarBoard.name} · Board` }
      : { path: "/board", label: "All boards" };
  const onlineList = useSitePresence(
    session,
    editingCard ? { path: place.path, label: `${editingCard.title || "Untitled task"} · Task` } : place,
  );
  useShareView("board-card", editingCard ? { card: editingCard.id } : null);

  // Following someone: open and close the task they have open.
  const followedView = useFollowedView();
  const followCard = followedView === undefined ? undefined : followedView.card ?? null;
  const appliedFollowCard = useRef<string | null | undefined>(undefined);
  const cardEditingRef = useRef(false);
  useEffect(() => {
    if (followCard === undefined) { appliedFollowCard.current = undefined; return; }
    if (loading || followCard === appliedFollowCard.current) return;
    if (followCard) {
      const card = boards.flatMap(b => b.cols.flatMap(c => c.cards)).find(k => k.id === followCard);
      if (!card) return; // not loaded yet — tried again when boards change
      appliedFollowCard.current = followCard;
      if (editingCard?.id === followCard || cardEditingRef.current) return;
      const board = boards.find(b => b.cols.some(c => c.cards.some(k => k.id === followCard)));
      if (board && !combined && board.id !== activeBoardId) setActiveBoardId(board.id);
      openCard(card);
    } else {
      appliedFollowCard.current = null;
      // Never close a form you're typing in.
      if (editingCard && !cardEditingRef.current) openCard(null);
    }
    // openCard only reads state that's in the deps or refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followCard, loading, boards]);
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

  /** Open (or close, with null) the task dialog and mirror it in the URL as ?card=, so the link can be shared. */
  function openCard(card: CardData | null) {
    setEditingCard(card);
    if (isCalendar) return;
    const url = new URL(window.location.href);
    if (card) {
      const board = boardOfColumn(card.columnId ?? "") ?? boards.find(b => b.cols.some(c => c.cards.some(k => k.id === card.id)));
      if (board) url.searchParams.set("board", board.id);
      url.searchParams.set("card", card.id);
    } else {
      url.searchParams.delete("card");
    }
    window.history.replaceState(window.history.state, "", url);
  }
  function openCardById(id: string) {
    const card = boards.flatMap(b => b.cols.flatMap(c => c.cards)).find(k => k.id === id);
    if (card) openCard(card);
  }

  /** New subtask in the parent's stage, or the board's first unfinished stage when the parent is done. */
  async function handleAddSubtask(parent: CardData, title: string) {
    if (!session || !canEdit) throw new Error("You need editor access to add subtasks.");
    const board = boards.find(b => b.cols.some(c => c.cards.some(k => k.id === parent.id)));
    const parentCol = board?.cols.find(c => c.cards.some(k => k.id === parent.id));
    const target = parentCol && !parentCol.isCompleted ? parentCol : board?.cols.find(c => !c.isCompleted);
    if (!target) throw new Error("This board has no unfinished stage for new tasks.");
    await createSubtask(session.workspaceId, parent.id, target.id, title);
    setBoards(await loadBoards(session.workspaceId));
  }

  /** Tick a subtask: move it into the board's first done stage, or back to its first open stage. */
  async function handleToggleSubtask(id: string, done: boolean) {
    const board = boards.find(b => b.cols.some(c => c.cards.some(k => k.id === id)));
    const target = board?.cols.find(c => done ? c.isCompleted : !c.isCompleted);
    if (!target) throw new Error(done ? "This board has no done stage." : "This board has no open stage.");
    await handleMoveStage(id, target.id);
  }

  /** Move a task to the end of another stage on its own board. */
  async function handleMoveStage(id: string, columnId: string) {
    if (!session || !canEdit) return;
    const board = boards.find(b => b.cols.some(c => c.cards.some(k => k.id === id)));
    const card = board?.cols.flatMap(c => c.cards).find(k => k.id === id);
    const target = board?.cols.find(c => c.id === columnId);
    if (!board || !card || !target) throw new Error("That stage isn't on this task's board.");
    if (target.cards.some(k => k.id === id)) return;
    // Optimistic: show the move at once, then reconcile with the server.
    setBoards(prev => prev.map(b => b.id !== board.id ? b : { ...b, cols: b.cols.map(c => ({
      ...c,
      cards: c.id === target.id ? [...c.cards.filter(k => k.id !== id), { ...card, columnId: target.id }] : c.cards.filter(k => k.id !== id),
    })) }));
    try {
      await moveCard(id, target.id, [...target.cards.filter(k => k.id !== id).map(k => k.id), id]);
    } finally {
      setBoards(await loadBoards(session.workspaceId));
    }
  }

  /** Reuse the persistent link; only a newly created canvas receives the seed note. */
  /** Priority, one assignee or the linked pages, changed from the task view. Shown at once, then saved. */
  async function handleQuickChange(id: string, change: QuickChange) {
    if (!session || !canEdit) return;
    const patch = (k: CardData): CardData =>
      "priority" in change ? { ...k, priority: change.priority }
      : "pageIds" in change ? { ...k, pageIds: change.pageIds }
      : { ...k, ownerIds: change.assigned ? [...new Set([...k.ownerIds, change.owner])] : k.ownerIds.filter(o => o !== change.owner) };
    setBoards(prev => prev.map(b => ({ ...b, cols: b.cols.map(c => ({ ...c, cards: c.cards.map(k => k.id === id ? patch(k) : k) })) })));
    try {
      if ("priority" in change) await setCardPriority(id, change.priority);
      else if ("pageIds" in change) await setCardPages(id, change.pageIds);
      else await setCardOwner(id, change.owner, change.assigned);
    } catch (e) {
      setBoards(await loadBoards(session.workspaceId).catch(() => boards));
      throw e;
    }
  }

  async function handleMakeCanvas(card: CardData, existingCanvasId?: string) {
    const canvas = await openBoardCardCanvas(card.id, existingCanvasId);
    setBoards(prev => prev.map(b => ({ ...b, cols: b.cols.map(c => ({ ...c,
      cards: c.cards.map(k => k.id === card.id ? { ...k, canvasId: canvas.id } : k)
    })) })));
    const params = new URLSearchParams({ c: canvas.id });
    if (canvas.created) {
      const lines = [card.title];
      if (card.sub) lines.push("", plainLinkedText(card.sub));
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
    await mutateSchedule(session.workspaceId, snapshot, {op:'card',card:{...((snapshot.cards.find(c=>c.id===updated.id)?.parent_id??null)!==(updated.parentId??null)?{parent_id:updated.parentId??null}:{}),id:updated.id,title:updated.title,sub:updated.sub,kind:updated.kind,category_id:updated.categoryId??null,tags:updated.tags,priority:updated.priority,owners:updated.ownerIds,column_id:updated.columnId}});
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

  // Direct-subtask progress per parent, for the badge on each card.
  const subtaskStats = new Map<string, { done: number; total: number }>();
  for (const b of boards) for (const c of b.cols) for (const k of c.cards) {
    if (!k.parentId) continue;
    const stat = subtaskStats.get(k.parentId) ?? { done: 0, total: 0 };
    stat.total++;
    if (c.isCompleted) stat.done++;
    subtaskStats.set(k.parentId, stat);
  }

  // Subtasks live inside their parent task (details panel + done/total badge),
  // not as cards of their own. Orphans whose parent isn't loaded still show.
  const loadedCardIds = new Set(boards.flatMap((b) => b.cols.flatMap((c) => c.cards.map((k) => k.id))));
  const displayCols = visibleCols.map((c) => ({
    ...c,
    cards: c.cards.filter((k) =>
      !(k.parentId && loadedCardIds.has(k.parentId)) &&
      k.title.toLowerCase().includes(search.toLowerCase()) &&
      (!ownerFilter || k.ownerIds.includes(ownerFilter)) &&
      (!filterKind || k.categoryId === filterKind)
    ).sort(byPriority),
  }));

  // Keyboard shortcuts (lib/shortcuts.ts; press ? for the list). The calendar
  // renders through this workspace too and registers its own.
  const onBoard = !isCalendar && !loading && !error;
  const stepBoard = (delta: number) => {
    if (boards.length < 2) return;
    const i = combined ? -1 : boards.findIndex((b) => b.id === activeBoardId);
    const next = boards[(i + delta + boards.length) % boards.length] ?? boards[0];
    setAllBoards(false);
    setActiveBoardId(next.id);
  };
  useShortcuts([
    {
      id: "board-new-task",
      keys: "n",
      label: "New task",
      group: "Board",
      enabled: onBoard && canEdit && boards.length > 0,
      run: () => {
        const add = document.querySelector<HTMLButtonElement>(".col .add-card-btn");
        add?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        add?.click();
      },
    },
    { id: "board-new-board", keys: "shift+n", label: "New board", group: "Board", enabled: onBoard && canEdit, run: handleAddBoard },
    {
      id: "board-filter",
      keys: "f",
      label: "Filter tasks",
      group: "Board",
      enabled: onBoard,
      run: () => document.querySelector<HTMLInputElement>(".planning-search input")?.focus(),
    },
    { id: "board-next", keys: "]", label: "Next board", group: "Board", enabled: onBoard && boards.length > 1, run: () => stepBoard(1) },
    { id: "board-prev", keys: "[", label: "Previous board", group: "Board", enabled: onBoard && boards.length > 1, run: () => stepBoard(-1) },
    { id: "board-all", keys: "0", label: "All boards together", group: "Board", enabled: onBoard && boards.length > 1 && !combined, run: () => setAllBoards(true) },
    { id: "board-list", keys: "s", label: "Show or hide the boards list", group: "Board", enabled: onBoard, run: () => setNavigationOpen((v) => !v) },
  ]);

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
    <PlanningCtx.Provider value={planning}>
      <style>{css}</style>
      <div className={`board-app planning-app${navigationOpen ? " navigation-open" : ""}`}>

        {/* topbar (global chrome) */}
        <TopBar
          crumbs={topbarBoard ? [isCalendar ? "Calendar" : "Board", topbarBoard.name] : [isCalendar ? "Calendar" : "Board"]}
          online={onlineList}
          selfKey={session?.userId}
          workspaceId={session?.workspaceId}
        >
          {session && !canEdit && (
            <span className="review-chip" title="You can see every board and task and comment on tasks, but not change them.">
              View &amp; comment
            </span>
          )}
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
            {boards.length > 1 && <button className={`sidebar-item${combined && boardFilter === null ? " active" : ""}`} onClick={showAllBoards} title="All boards">
              <span className="sidebar-dot" style={{ background: "var(--ember)" }} />
              <span className="sidebar-name">All boards</span>
            </button>}
            {boards.map((b) => (
              <button
                key={b.id}
                className={`sidebar-item${(!combined && b.id === activeBoardId) || (combined && boardFilter?.includes(b.id)) ? " active" : ""}`}
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
            {!isCalendar&&<PlanningHeader title={combined&&boards.length?(boardFilter===null?'All boards':`${visibleBoards.length} ${visibleBoards.length===1?'board':'boards'}`):activeBoard?.name??'Your boards'} mode="board" boardId={combined?undefined:activeBoardId??undefined} canEdit={canEdit} onCreate={handleAddBoard} onNavigation={()=>setNavigationOpen(v=>!v)}>
              {boards.length>1?<MultiSelectPicker items={boards.map(b=>({id:b.id,label:b.name}))} selected={combined?boardFilter:activeBoard?[activeBoard.id]:null} onChange={chooseBoards} noun="boards" ariaLabel="Boards to show"/>:<span className="planning-board-name">{activeBoard?.name??'No boards yet'}</span>}
              <label className="planning-search"><PlanningIcon name="search"/><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={e=>setSearch(e.target.value)}/></label>
              <details className="planning-menu"><summary>Filters{filterKind||ownerFilter?' · Active':''}</summary><div><label>Category<select value={filterKind??''} onChange={e=>setFilterKind(e.target.value||null)}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Owner<select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="">Everyone</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div></details>
              {canEdit&&activeBoard&&<details className="planning-menu planning-overflow"><summary><PlanningIcon name="more"/>More</summary><div>{!combined&&<button onClick={()=>handleManageStages(activeBoard)}>Manage stages</button>}<button onClick={()=>setCategoryManager(true)}>Manage categories</button>{!combined&&<button onClick={()=>handleCopyBoard(activeBoard)}>Copy board</button>}{!combined&&<button onClick={()=>handleDeleteBoard(activeBoard)}>Delete board</button>}</div></details>}
            </PlanningHeader>}
            {!isCalendar&&!combined&&activeBoard&&<div className="board-phase-summary"><Link href={`/table?board=${activeBoard.id}`}>{phaseRangeLabel(phaseSnapshot?.phases.find(p=>p.board_id===activeBoard.id&&p.category_id===(filterKind||null)))} · Open {filterKind?'subphase':'phase'} in Gantt <Icon name="arrowUpRight" /></Link></div>}
            {!isCalendar&&!boards.length&&<div className="planning-empty"><PlanningIcon name="board"/><h2>No boards yet</h2><p>Create a board with the stages that fit your team's workflow.</p>{canEdit&&<button className="planning-primary" onClick={handleAddBoard}>Create your first board</button>}</div>}
            {isCalendar ? <CalendarView canEdit={canEdit} project={session?.workspaceId ?? ""} onNavigation={()=>setNavigationOpen(v=>!v)} /> :
            <div className="board-scroll">
              {combined && !visibleBoards.length && <div className="planning-empty"><PlanningIcon name="board"/><h2>No boards selected</h2><p>Choose which boards to show in the board picker above.</p><button className="planning-primary" onClick={showAllBoards}>Show all boards</button></div>}
              {(combined ? visibleBoards : activeBoard ? [activeBoard] : []).map((board) => {
                const boardCols = displayCols.filter((c) => board.cols.some((b) => b.id === c.id));
                const count = boardCols.reduce((n, c) => n + c.cards.length, 0);
                const end = boardEndDate(board);
                const phase = phaseSnapshot?.phases.find(p=>p.board_id===board.id&&p.category_id===(filterKind||null));
                return <section key={board.id} className={combined ? "kanban-group" : undefined} aria-label={board.name} style={combined ? { "--board-color": boardColor(board, boards) } as CSSProperties : undefined}>
                  {combined && <header className="board-group-head">
                    <div><h2>{board.name}</h2><Link className="board-phase-summary" href={`/table?board=${board.id}`}>{phaseRangeLabel(phase)} · Gantt <Icon name="arrowUpRight" /></Link></div>
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
                        onCardClick={openCard}
                        subtaskStats={subtaskStats}
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
            card={boards.flatMap(b => b.cols.flatMap(c => c.cards)).find(k => k.id === editingCard.id) ?? editingCard}
            workspaceId={session?.workspaceId ?? ""}
            people={people}
            categories={categories}
            onClose={() => openCard(null)}
            editingRef={cardEditingRef}
            onOpenCard={openCardById}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
            onMoveStage={handleMoveStage}
            currentUserId={session?.userId ?? ""}
            onSave={handleSaveCard}
            onDelete={handleDeleteCard}
            onMakeCanvas={handleMakeCanvas}
            onQuickChange={handleQuickChange}
            linkTargets={linkTargets}
          />
        )}
      </div>
    </PlanningCtx.Provider>
  );
}
