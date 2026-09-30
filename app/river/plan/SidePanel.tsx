"use client";

import { useEffect, type ReactNode } from "react";
import styles from "./plan.module.css";

/** The panel that slides in from the right for a task or an event, so the view behind stays visible. */
export default function SidePanel({ open, onClose, eyebrow, color, children }: {
  open: boolean;
  onClose: () => void;
  eyebrow: ReactNode;
  color?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <aside className={`${styles.panel} ${open ? styles.panelOn : ""}`} style={color ? { ["--c" as string]: color } : undefined} aria-hidden={!open}>
      <button className={styles.panelX} onClick={onClose} aria-label="Close">✕</button>
      <div className={styles.panelEb}>
        <i />
        {eyebrow}
      </div>
      {open && children}
    </aside>
  );
}
