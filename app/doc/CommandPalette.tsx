"use client";

import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "./data";
import "./CommandPalette.css";

type IconProps = { className?: string };
const DocIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);
const PlusIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const GearIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 11.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
  </svg>
);

interface Item {
  key: string;
  label: string;
  hint?: string;
  kind: "page" | "action" | "settings";
  run: () => void;
}

// A short excerpt around the first match, so the user sees *why* a page matched.
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
  docs,
  activeSectionId,
  activeGroup,
  onJump,
  onNewPage,
  onNewSection,
  onOpenSettings,
  canCreate = true,
}: {
  open: boolean;
  onClose: () => void;
  docs: DesignDoc[];
  activeSectionId: string | null;
  activeGroup: string;
  onJump: (id: string) => void;
  onNewPage: (sectionId: string | null, sectionName: string) => void;
  onNewSection: () => void;
  onOpenSettings?: () => void;
  /** False for viewers: the "New page / New section" actions are hidden. */
  canCreate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pageItems: Item[] = docs
      .map((d): Item | null => {
        const titleMatch =
          !q || d.title.toLowerCase().includes(q) || d.group.toLowerCase().includes(q);

        // Fall back to scanning block bodies (and table cells) for the query.
        // Block text may carry inline HTML (bold/code) — strip tags first.
        let snippet: string | undefined;
        if (!titleMatch && q) {
          for (const b of d.blocks) {
            const hay =
              b.text.replace(/<[^>]+>/g, "") + (b.rows ? " " + b.rows.flat().join(" ") : "");
            const idx = hay.toLowerCase().indexOf(q);
            if (idx >= 0) {
              snippet = snippetAround(hay, idx, q.length);
              break;
            }
          }
          if (!snippet) return null; // matches neither title nor content
        }

        return {
          key: `page:${d.id}`,
          label: d.title,
          hint: snippet ?? d.group, // content snippet, else the group name
          kind: "page" as const,
          run: () => {
            onJump(d.id);
            onClose();
          },
        };
      })
      .filter((x): x is Item => x !== null)
      .slice(0, 50);
    const actions: Item[] = [
      ...(canCreate
        ? [
            {
              key: "act:new-page",
              label: "New page",
              hint: `in ${activeGroup}`,
              kind: "action" as const,
              run: () => {
                onNewPage(activeSectionId, activeGroup);
                onClose();
              },
            },
            {
              key: "act:new-section",
              label: "New section",
              kind: "action" as const,
              run: () => {
                onNewSection();
                onClose();
              },
            },
          ]
        : []),
      ...(onOpenSettings
        ? [
            {
              key: "act:settings",
              label: "Settings",
              hint: "profile · workspace · account",
              kind: "settings" as const,
              run: () => {
                onOpenSettings();
                onClose();
              },
            },
          ]
        : []),
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    return [...pageItems, ...actions];
  }, [query, docs, activeSectionId, activeGroup, onJump, onNewPage, onNewSection, onClose, canCreate, onOpenSettings]);

  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items, index]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          placeholder="Jump to a page or run a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              items[index]?.run();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty">No matches</div>}
          {items.map((it, i) => (
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
                {it.kind === "page" ? <DocIcon /> : it.kind === "settings" ? <GearIcon /> : <PlusIcon />}
              </span>
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </button>
          ))}
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
