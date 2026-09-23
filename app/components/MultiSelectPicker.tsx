"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import styles from "./MultiSelectPicker.module.css";

export type PickerItem = { id: string; label: string };

/** Checkbox dropdown for picking any subset of items. `selected === null` means
 *  "all", so items added later show up too. The panel is positioned `fixed` from
 *  the trigger's rect because toolbars that scroll horizontally would clip an
 *  absolutely positioned panel. */
export default function MultiSelectPicker({
  items,
  selected,
  onChange,
  noun,
  ariaLabel,
}: {
  items: PickerItem[];
  selected: string[] | null;
  onChange: (selected: string[] | null) => void;
  /** Plural noun for the label, e.g. "phases" → "All phases", "3 phases". */
  noun: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && rootRef.current?.contains(e.target as Node)) return;
      setOpen(null);
      if (e.type === "keydown") triggerRef.current?.focus();
    };
    // Any scrolling container moving under the fixed panel detaches it from the
    // trigger, so close it — except when the panel's own list is scrolled.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    const dismiss = () => setOpen(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const all = `All ${noun}`;
  const label =
    selected === null
      ? all
      : selected.length === 0
        ? `No ${noun}`
        : selected.length === 1
          ? (items.find((i) => i.id === selected[0])?.label ?? `1 of ${items.length}`)
          : `${selected.length} ${noun}`;
  const toggle = (id: string) => {
    // From "all", unticking one item narrows to everything except it.
    const current = selected ?? items.map((i) => i.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Ticking every item is the same as "all", so later items show up too.
    onChange(next.length === items.length ? null : next);
  };

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={!!open}
        onClick={() => {
          if (open) return setOpen(null);
          const r = triggerRef.current!.getBoundingClientRect();
          setOpen({ top: r.bottom + 6, left: r.left });
        }}
      >
        <span className={styles.triggerLabel}>{label}</span> <Icon name="chevronDown" className={styles.chevron} />
      </button>
      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          role="group"
          aria-label={ariaLabel}
          style={{ top: open.top, left: open.left }}
        >
          <label className={styles.option}>
            <input
              type="checkbox"
              className={styles.check}
              checked={selected === null}
              onChange={() => onChange(selected === null ? [] : null)}
            />
            {all}
          </label>
          <hr className={styles.rule} />
          {items.map((i) => (
            <label key={i.id} className={styles.option}>
              <input
                type="checkbox"
                className={styles.check}
                checked={selected === null || selected.includes(i.id)}
                onChange={() => toggle(i.id)}
              />
              {i.label}
            </label>
          ))}
          <div className={styles.actions}>
            <button disabled={selected === null} onClick={() => onChange(null)}>
              Select all
            </button>
            <button disabled={selected?.length === 0} onClick={() => onChange([])}>
              Remove all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
