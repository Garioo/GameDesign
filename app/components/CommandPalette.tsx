"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { SearchItem, SearchKind } from "@/lib/searchIndex";
import "./CommandPalette.css";

type IconProps = { className?: string };
const svg = (d: React.ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    );
  };
const DocIcon = svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>);
const GridIcon = svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
const ColumnsIcon = svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></>);
const TaskIcon = svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>);
const CalendarIcon = svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18" /></>);
const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
const GearIcon = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 11.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
  </>,
);

const KIND_ICON: Record<SearchKind, ComponentType<IconProps>> = {
  page: DocIcon,
  canvas: GridIcon,
  board: ColumnsIcon,
  card: TaskIcon,
  event: CalendarIcon,
};

/** A command shown after the search results (New page, Settings…). */
export interface PaletteAction {
  key: string;
  label: string;
  hint?: string;
  icon: "plus" | "settings";
  run: () => void;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
  Icon: ComponentType<IconProps>;
  run: () => void;
}

const MAX_RESULTS = 50;

// A short excerpt around the first match, so the user sees *why* an item matched.
function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len + 30);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "… " + s;
  if (end < text.length) s = s + " …";
  return s;
}

export default function CommandPalette({
  open,
  onClose,
  items,
  loading = false,
  actions = [],
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  items: SearchItem[];
  /** True while the index is still loading; shown instead of "No matches". */
  loading?: boolean;
  actions?: PaletteAction[];
  onSelect: (item: SearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const toRow = (it: SearchItem, hint: string): Row => ({
      key: it.key,
      label: it.title,
      hint,
      Icon: KIND_ICON[it.kind],
      run: () => {
        onClose();
        onSelect(it);
      },
    });

    // Title/hint matches first (prefix matches ahead of the rest), then body matches.
    const prefix: Row[] = [];
    const titled: Row[] = [];
    const bodied: Row[] = [];
    for (const it of items) {
      if (!q) {
        titled.push(toRow(it, it.hint));
        continue;
      }
      const title = it.title.toLowerCase();
      if (title.startsWith(q)) prefix.push(toRow(it, it.hint));
      else if (title.includes(q) || it.hint.toLowerCase().includes(q)) titled.push(toRow(it, it.hint));
      else if (it.body) {
        const idx = it.body.toLowerCase().indexOf(q);
        if (idx >= 0) bodied.push(toRow(it, snippetAround(it.body, idx, q.length)));
      }
    }
    const results = [...prefix, ...titled, ...bodied].slice(0, MAX_RESULTS);

    const commands: Row[] = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({
        key: `act:${a.key}`,
        label: a.label,
        hint: a.hint,
        Icon: a.icon === "settings" ? GearIcon : PlusIcon,
        run: () => {
          onClose();
          a.run();
        },
      }));
    return [...results, ...commands];
  }, [query, items, actions, onClose, onSelect]);

  useEffect(() => {
    if (index >= rows.length) setIndex(Math.max(0, rows.length - 1));
  }, [rows, index]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          placeholder="Search pages, canvases, tasks, events…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              rows[index]?.run();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {rows.length === 0 && <div className="palette-empty">{loading ? "Loading…" : "No matches"}</div>}
          {rows.map((it, i) => (
            <button
              key={it.key}
              className={"palette-item" + (i === index ? " is-active" : "")}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                it.run();
              }}
            >
              <span className="palette-glyph">
                <it.Icon />
              </span>
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </button>
          ))}
          {loading && rows.length > 0 && <div className="palette-empty">Loading more…</div>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
