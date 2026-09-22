"use client";

import { useEffect } from "react";
import styles from "./UndoToast.module.css";

/** A bottom-center notice with an optional Undo action that dismisses itself. */
export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  timeoutMs = 6000,
}: {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(t);
  }, [message, onDismiss, timeoutMs]);

  return (
    <div className={styles.toast} role="status">
      <span className={styles.message}>{message}</span>
      {onUndo && (
        <button
          type="button"
          className={styles.undo}
          onClick={() => {
            onUndo();
            onDismiss();
          }}
        >
          Undo
        </button>
      )}
      <button type="button" className={styles.close} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
