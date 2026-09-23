"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Icon from "@/app/components/Icon";
import type { MentionTarget } from "@/app/doc/mentions";
import {
  decodePageLinksForEditing,
  encodeEditedPageLinks,
  linkIconName,
  type PageLink,
} from "@/lib/pageLinks";
import { toggleInlineMarker } from "@/lib/inlineMarkdown";
import styles from "./PageLinkTextarea.module.css";

// "[[query" anywhere, or "@query" at the start / after whitespace.
const TRIGGER_RE = /(?:\[\[|(?:^|\s)@)([^[\]@\n]{0,40})$/;

/**
 * A textarea where typing "[[" or "@" opens a list of link targets (pages,
 * sections, canvases, boards, tasks — whatever `targets` holds). Picking one
 * inserts `[[Title]]`; `value` / `onChange` carry the stored `[[Title]](<ref>)`
 * form (lib/pageLinks.ts). With `formatShortcuts`, ⌘B / ⌘I wrap the selection
 * in **bold** / _italic_ (lib/inlineMarkdown.ts).
 */
export default function PageLinkTextarea({
  value,
  onChange,
  targets,
  className,
  placeholder,
  formatShortcuts = false,
  rows,
  maxLength,
  hint = "Type [[ or @ to link a page, section, canvas, board or task.",
}: {
  value: string;
  onChange: (value: string) => void;
  targets: MentionTarget[];
  className?: string;
  placeholder?: string;
  formatShortcuts?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ start: number; query: string; index: number } | null>(null);

  // Links picked here or already in the value, so the shown `[[Title]]` can be encoded again.
  const known = useRef<PageLink[]>([]);
  const { text: shown, links } = decodePageLinksForEditing(value);
  for (const l of links) if (!known.current.some((k) => k.ref === l.ref && k.title === l.title)) known.current.push(l);
  const emit = (text: string) => onChange(encodeEditedPageLinks(text, known.current));

  // The list is positioned against the window (position: fixed) so a dialog's
  // scroll area can't clip it: below the box when it fits, otherwise above.
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const menuOpen = !!menu;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!menuOpen || !el) return setMenuStyle(null);
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const width = Math.min(320, rect.width);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    setMenuStyle(
      below >= 200 || below >= above
        ? { top: rect.bottom + 4, left, width, maxHeight: Math.min(260, below) }
        : { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight: Math.min(260, above) },
    );
  }, [menuOpen]);
  // Anything scrolling underneath would detach the list from the box — close it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Node) || !listRef.current?.contains(e.target)) setMenu(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);
  const listRef = useRef<HTMLDivElement>(null);

  const q = menu?.query.trim().toLowerCase() ?? "";
  const matches = menu ? targets.filter((t) => !q || t.title.toLowerCase().includes(q)).slice(0, 8) : [];

  const readTrigger = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(TRIGGER_RE);
    if (!m) return setMenu(null);
    const query = m[1];
    setMenu({ start: caret - query.length - (m[0].trimStart().startsWith("[[") ? 2 : 1), query, index: 0 });
  };

  const pick = (t: MentionTarget) => {
    if (!menu) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? shown.length;
    const title = t.title.replace(/[[\]\n]/g, "").trim() || "Untitled";
    if (!known.current.some((k) => k.ref === t.ref && k.title === title)) known.current.push({ title, ref: t.ref });
    const label = `[[${title}]] `;
    emit(shown.slice(0, menu.start) + label + shown.slice(caret));
    setMenu(null);
    requestAnimationFrame(() => {
      const pos = menu.start + label.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={styles.field}>
      <textarea
        ref={ref}
        className={className}
        value={shown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => {
          emit(e.target.value);
          readTrigger(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (formatShortcuts && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && ["b", "i"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            const el = e.currentTarget;
            const next = toggleInlineMarker(el.value, el.selectionStart, el.selectionEnd, e.key.toLowerCase() === "b" ? "**" : "_");
            emit(next.value);
            requestAnimationFrame(() => el.setSelectionRange(next.start, next.end));
            return;
          }
          if (!menu || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % matches.length }); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + matches.length) % matches.length }); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[menu.index]); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenu(null); }
        }}
        onBlur={() => setTimeout(() => setMenu(null), 120)} // after a mousedown pick registers
      />
      {hint && <p className={styles.hint}>{hint}</p>}
      {menu && matches.length > 0 && (
        <div ref={listRef} className={styles.menu} style={menuStyle ?? { visibility: "hidden" }} role="listbox" aria-label="Link a page">
          {matches.map((t, i) => (
            <button
              type="button"
              key={t.ref}
              role="option"
              aria-selected={i === menu.index}
              className={`${styles.option}${i === menu.index ? ` ${styles.optionActive}` : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(t); }}
            >
              <Icon name={linkIconName(t.ref)} className={styles.optionIcon} />
              <span className={styles.optionTitle}>{t.title}</span>
              <span className={styles.optionGroup}>{t.group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
