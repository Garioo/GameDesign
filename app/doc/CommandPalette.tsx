"use client";

import { useEffect, useMemo, useState } from "react";
import type { DesignDoc } from "./data";

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

interface Item {
  key: string;
  label: string;
  hint?: string;
  kind: "page" | "action";
  run: () => void;
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
}: {
  open: boolean;
  onClose: () => void;
  docs: DesignDoc[];
  activeSectionId: string | null;
  activeGroup: string;
  onJump: (id: string) => void;
  onNewPage: (sectionId: string | null, sectionName: string) => void;
  onNewSection: () => void;
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
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.group.toLowerCase().includes(q))
      .slice(0, 50)
      .map((d) => ({
        key: `page:${d.id}`,
        label: d.title,
        hint: d.group,
        kind: "page" as const,
        run: () => {
          onJump(d.id);
          onClose();
        },
      }));
    const actions: Item[] = [
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
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    return [...pageItems, ...actions];
  }, [query, docs, activeSectionId, activeGroup, onJump, onNewPage, onNewSection, onClose]);

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
                {it.kind === "page" ? <DocIcon /> : <PlusIcon />}
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
