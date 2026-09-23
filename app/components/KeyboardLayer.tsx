"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { continuations, keyChips, usePendingSequence, useShortcutList, type Shortcut } from "@/lib/shortcuts";
import styles from "./KeyboardLayer.module.css";

/** A shortcut drawn as key caps: "g h" → [G] then [H], "mod+k" → [⌘][K]. */
export function ShortcutKeys({ keys, small = false }: { keys: string; small?: boolean }) {
  const chips = keyChips(keys);
  return (
    <span className={small ? `${styles.keys} ${styles.keysSmall}` : styles.keys} aria-label={keys}>
      {chips.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles.then}>then</span>}
          {step.map((k, j) => (
            <kbd key={j} className={styles.kbd}>{k}</kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/** Keys that belong to the page editor itself, not the shortcut registry. */
const WRITING: { keys: string; label: string }[] = [
  { keys: "mod+b", label: "Bold" },
  { keys: "mod+i", label: "Italic" },
  { keys: "mod+e", label: "Inline code" },
  { keys: "/", label: "Block menu (in an empty line)" },
  { keys: "@", label: "Link a page, canvas or task" },
  { keys: "[ [", label: "Link a page" },
  { keys: "#", label: "Heading (then space)" },
  { keys: "-", label: "Bullet list (then space)" },
  { keys: "[ ]", label: "To-do (then space)" },
  { keys: ">", label: "Quote (then space)" },
  { keys: "mod+a", label: "Select all blocks (press twice)" },
  { keys: "Escape", label: "Leave the text" },
];

const GROUP_ORDER = ["General", "Navigation", "Page", "Board", "Calendar", "Gantt"];

/** The "?" overlay: every shortcut active right now, by group. */
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useShortcutList();
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!open) return;
    setFilter("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const seen = new Set<string>();
    const by = new Map<string, Shortcut[]>();
    // Newest first, so a page's override hides the global one with the same keys.
    for (const s of [...list].reverse()) {
      if (seen.has(s.keys)) continue;
      seen.add(s.keys);
      if (q && !s.label.toLowerCase().includes(q)) continue;
      by.set(s.group, [s, ...(by.get(s.group) ?? [])]);
    }
    const names = [...by.keys()].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99);
    const out = names.map((g) => ({ name: g, items: by.get(g)!.map((s) => ({ keys: s.keys, label: s.label })) }));
    const writing = WRITING.filter((w) => !q || w.label.toLowerCase().includes(q));
    if (writing.length && document.querySelector(".blocks")) out.push({ name: "Writing in a page", items: writing });
    return out;
  }, [list, filter]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.help}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-shortcuts-ok=""
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2>Keyboard shortcuts</h2>
          <input
            autoFocus
            className={styles.filter}
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter shortcuts"
          />
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className={styles.cols}>
          {groups.map((g) => (
            <section key={g.name} className={styles.group}>
              <h3>{g.name}</h3>
              <ul>
                {g.items.map((s) => (
                  <li key={s.keys + s.label}>
                    <span>{s.label}</span>
                    <ShortcutKeys keys={s.keys} small />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && <p className={styles.none}>No shortcut matches “{filter}”.</p>}
        </div>
        <footer className={styles.foot}>
          Single-key shortcuts work when you’re not typing — press <kbd className={styles.kbd}>Esc</kbd> to leave a text field first.
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** After the first key of a sequence ("g"), shows where each next key goes. */
export function SequenceHint() {
  const first = usePendingSequence();
  const list = useShortcutList();
  if (!first || typeof document === "undefined") return null;
  const next = continuations(list, first);
  if (!next.length) return null;
  return createPortal(
    <div className={styles.hint} role="status" aria-live="polite">
      <div className={styles.hintHead}>
        <ShortcutKeys keys={first} small /> <span>then…</span>
      </div>
      <ul>
        {next.map((n) => (
          <li key={n.key}>
            <ShortcutKeys keys={n.key} small />
            <span>{n.label}</span>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
