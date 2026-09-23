"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { SearchItem, SearchKind } from "@/lib/searchIndex";
import { ShortcutKeys } from "./KeyboardLayer";
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
const PersonIcon = svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
const ArrowIcon = svg(<path d="M5 12h14M13 6l6 6-6 6" />);
const DigestIcon = svg(<><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
const UserPlusIcon = svg(<><circle cx="10" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 13.3-6" /><path d="M19 14v6M16 17h6" /></>);
const CommandIcon = svg(<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />);
const FlagIcon = svg(<><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></>);
const ClockIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
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
  person: PersonIcon,
  milestone: FlagIcon,
};
const KIND_TITLE: Record<SearchKind, string> = {
  page: "Pages",
  canvas: "Canvases",
  board: "Boards",
  card: "Tasks",
  event: "Events",
  person: "People",
  milestone: "Milestones",
};
const KIND_ORDER: SearchKind[] = ["page", "card", "milestone", "board", "canvas", "event", "person"];

/**
 * A second step inside the palette: pick an item to act on (e.g. "Assign a
 * task to me…" → pick the task). The palette stays open while `run` works
 * and shows its result.
 */
export interface PalettePicker {
  /** Shown as the mode chip, e.g. "Assign to me". */
  title: string;
  placeholder: string;
  /** Items to offer, best first, each with the hint shown beside it. */
  options: () => { item: SearchItem; hint: string }[];
  /** Resolves with a short confirmation; rejects with a message to show. */
  run: (item: SearchItem) => Promise<string>;
}

/** A command shown after the search results (New page, Settings, Go to…). */
export interface PaletteAction {
  key: string;
  label: string;
  hint?: string;
  icon: "plus" | "settings" | "arrow" | "calendar" | "digest" | "assign" | "command";
  /** Its keyboard shortcut (lib/shortcuts.ts syntax), shown as key caps. */
  shortcut?: string;
  /** Runs the command (closing the palette)… */
  run?: () => void;
  /** …or opens a picker step instead. */
  pick?: PalettePicker;
}
const ACTION_ICON: Record<PaletteAction["icon"], ComponentType<IconProps>> = {
  plus: PlusIcon,
  settings: GearIcon,
  arrow: ArrowIcon,
  calendar: CalendarIcon,
  digest: DigestIcon,
  assign: UserPlusIcon,
  command: CommandIcon,
};

interface Row {
  key: string;
  label: string;
  /** Where the query matched in the label, to bold it. */
  match?: [number, number];
  hint?: string;
  keys?: string;
  Icon: ComponentType<IconProps>;
  run: () => void;
}
interface Section {
  title: string;
  rows: Row[];
}

const MAX_RESULTS = 50;
/** Per-kind cap when browsing with an empty query. */
const BROWSE_PER_KIND = 5;

// A short excerpt around the first match, so the user sees *why* an item matched.
function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len + 30);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "… " + s;
  if (end < text.length) s = s + " …";
  return s;
}

function Label({ row }: { row: Row }): ReactNode {
  if (!row.match) return row.label;
  const [a, b] = row.match;
  return (
    <>
      {row.label.slice(0, a)}
      <mark className="palette-match">{row.label.slice(a, b)}</mark>
      {row.label.slice(b)}
    </>
  );
}

/**
 * The ⌘K palette. With no query it browses: recent picks, then commands, then
 * a few of each kind. Typing searches titles (prefix matches first), then
 * bodies. "@name" searches only people, "> text" only commands.
 */
export default function CommandPalette({
  open,
  onClose,
  items,
  loading = false,
  actions = [],
  recentKeys = [],
  initialQuery,
  initialPicker,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  items: SearchItem[];
  /** True while the index is still loading; shown instead of "No matches". */
  loading?: boolean;
  actions?: PaletteAction[];
  /** Keys of recently picked items (newest first), shown when the query is empty. */
  recentKeys?: string[];
  /** Opened by a shortcut: start with this query ("@", ">")… */
  initialQuery?: string;
  /** …or inside this command's picker. */
  initialPicker?: string;
  onSelect: (item: SearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The open picker's command key; looked up in `actions` each render so its
  // options follow the index as it loads.
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const picker = (pickerKey && actions.find((a) => a.key === pickerKey)?.pick) || null;
  const [status, setStatus] = useState<{ kind: "busy" | "done" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery ?? "");
      setIndex(0);
      setPickerKey(initialPicker ?? null);
      setStatus(null);
    }
    // Only when it opens; later changes to the initial mode don't reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const enterPicker = (key: string) => {
    setPickerKey(key);
    setQuery("");
    setIndex(0);
    setStatus(null);
    inputRef.current?.focus();
  };
  const leavePicker = () => {
    setPickerKey(null);
    setQuery("");
    setIndex(0);
    setStatus(null);
  };

  const mode: "all" | "people" | "commands" | "pick" = picker
    ? "pick"
    : query.startsWith("@") ? "people" : query.startsWith(">") ? "commands" : "all";
  const q = (mode === "all" || mode === "pick" ? query : query.slice(1)).trim().toLowerCase();

  const sections = useMemo<Section[]>(() => {
    const toRow = (it: SearchItem, hint: string, match?: [number, number]): Row => ({
      key: it.key,
      label: it.title,
      match,
      hint,
      Icon: KIND_ICON[it.kind],
      run: () => {
        onClose();
        onSelect(it);
      },
    });
    const commandRows: Row[] = actions.flatMap((a) => {
      const at = q ? a.label.toLowerCase().indexOf(q) : -1;
      if (q && at < 0) return [];
      return [{
        key: `act:${a.key}`,
        label: a.label,
        match: at >= 0 ? ([at, at + q.length] as [number, number]) : undefined,
        hint: a.hint,
        keys: a.shortcut,
        Icon: ACTION_ICON[a.icon],
        run: () => {
          if (a.pick) {
            enterPicker(a.key);
            return;
          }
          onClose();
          a.run?.();
        },
      }];
    });

    if (mode === "pick" && picker) {
      const rows: Row[] = [];
      for (const { item, hint } of picker.options()) {
        const at = q ? item.title.toLowerCase().indexOf(q) : -1;
        if (q && at < 0 && !hint.toLowerCase().includes(q)) continue;
        rows.push({
          key: `pick:${item.key}`,
          label: item.title,
          match: at >= 0 ? [at, at + q.length] : undefined,
          hint,
          Icon: KIND_ICON[item.kind],
          run: () => {
            setStatus({ kind: "busy", text: `Working on “${item.title}”…` });
            picker.run(item).then(
              (text) => {
                setStatus({ kind: "done", text });
                setTimeout(onClose, 1100);
              },
              (e) => {
                setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
                setTimeout(() => inputRef.current?.focus(), 0); // re-enabled: let them pick again
              },
            );
          },
        });
        if (rows.length >= MAX_RESULTS) break;
      }
      return [{ title: picker.title, rows }];
    }
    if (mode === "commands") return [{ title: "Commands", rows: commandRows }];
    const pool = mode === "people" ? items.filter((i) => i.kind === "person") : items;

    // Browsing: recent picks, commands, then a taste of each kind.
    if (!q) {
      const out: Section[] = [];
      if (mode === "all") {
        const byKey = new Map(items.map((i) => [i.key, i]));
        const recent = recentKeys.map((k) => byKey.get(k)).filter((i): i is SearchItem => !!i).slice(0, 5);
        if (recent.length) out.push({ title: "Recent", rows: recent.map((i) => ({ ...toRow(i, i.hint), key: `recent:${i.key}`, Icon: ClockIcon })) });
        if (commandRows.length) out.push({ title: "Commands", rows: commandRows });
      }
      for (const kind of KIND_ORDER) {
        const of = pool.filter((i) => i.kind === kind);
        if (of.length) out.push({ title: KIND_TITLE[kind], rows: of.slice(0, mode === "people" ? MAX_RESULTS : BROWSE_PER_KIND).map((i) => toRow(i, i.hint)) });
      }
      return out;
    }

    // Searching: title/hint matches first (prefix matches ahead of the rest), then body matches.
    const prefix: Row[] = [];
    const titled: Row[] = [];
    const bodied: Row[] = [];
    for (const it of pool) {
      const title = it.title.toLowerCase();
      const at = title.indexOf(q);
      if (at === 0) prefix.push(toRow(it, it.hint, [0, q.length]));
      else if (at > 0) titled.push(toRow(it, it.hint, [at, at + q.length]));
      else if (it.hint.toLowerCase().includes(q)) titled.push(toRow(it, it.hint));
      else if (it.body) {
        const idx = it.body.toLowerCase().indexOf(q);
        if (idx >= 0) bodied.push(toRow(it, snippetAround(it.body, idx, q.length)));
      }
    }
    const out: Section[] = [];
    const results = [...prefix, ...titled, ...bodied].slice(0, MAX_RESULTS);
    if (results.length) out.push({ title: mode === "people" ? "People" : "Results", rows: results });
    if (mode === "all" && commandRows.length) out.push({ title: "Commands", rows: commandRows });
    return out;
    // enterPicker only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, picker, items, actions, recentKeys, onClose, onSelect]);

  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  useEffect(() => {
    if (index >= rows.length) setIndex(Math.max(0, rows.length - 1));
  }, [rows, index]);

  // Keep the keyboard selection in view.
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.is-active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const placeholder =
    mode === "pick" && picker ? picker.placeholder
    : mode === "people" ? "Find a person…" : mode === "commands" ? "Run a command…" : "Search, or type @ for people, > for commands";
  const busy = status?.kind === "busy" || status?.kind === "done";
  let flat = -1;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          {mode !== "all" && (
            <span className="palette-mode">{mode === "pick" && picker ? picker.title : mode === "people" ? "People" : "Commands"}</span>
          )}
          <input
            ref={inputRef}
            className="palette-input"
            autoFocus
            disabled={busy}
            placeholder={placeholder}
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
                if (!busy) rows[index]?.run();
              } else if (e.key === "Escape") {
                e.preventDefault();
                // Escape steps back out of a picker before it closes the palette.
                if (picker) leavePicker();
                else onClose();
              } else if (e.key === "Backspace" && picker && query.length === 0) {
                e.preventDefault();
                leavePicker();
              } else if (e.key === "Backspace" && mode !== "all" && mode !== "pick" && query.length === 1) {
                // Backspacing the "@" / ">" leaves the mode like deleting a chip.
                e.preventDefault();
                setQuery("");
              }
            }}
          />
        </div>
        {status && (
          <div className={`palette-status is-${status.kind}`} role="status">
            {status.kind === "busy" && <span className="palette-spinner" aria-hidden="true" />}
            {status.kind === "done" && <span className="palette-status-icon" aria-hidden="true">✓</span>}
            {status.text}
          </div>
        )}
        <div className={"palette-list" + (busy ? " is-busy" : "")} ref={listRef}>
          {rows.length === 0 && <div className="palette-empty">{loading ? "Loading…" : "No matches"}</div>}
          {sections.map((section) => (
            <div key={section.title} className="palette-section">
              <div className="palette-section-title">{section.title}</div>
              {section.rows.map((it) => {
                const i = ++flat;
                return (
                  <button
                    key={it.key}
                    className={"palette-item" + (i === index ? " is-active" : "")}
                    onMouseMove={() => i !== index && setIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!busy) it.run();
                    }}
                  >
                    <span className="palette-glyph">
                      <it.Icon />
                    </span>
                    <span className="palette-label"><Label row={it} /></span>
                    {it.hint && <span className="palette-hint">{it.hint}</span>}
                    {it.keys && <ShortcutKeys keys={it.keys} small />}
                  </button>
                );
              })}
            </div>
          ))}
          {loading && rows.length > 0 && <div className="palette-empty">Loading more…</div>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          {picker ? (
            <span><kbd>⌫</kbd> back</span>
          ) : (
            <>
              <span><kbd>@</kbd> people</span>
              <span><kbd>&gt;</kbd> commands</span>
            </>
          )}
          <span className="palette-foot-end"><kbd>esc</kbd> {picker ? "back" : "close"}</span>
        </div>
      </div>
    </div>
  );
}
