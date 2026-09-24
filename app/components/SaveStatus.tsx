"use client";

import { useOnline } from "@/lib/useOnline";
import styles from "./SaveStatus.module.css";

export type SaveState = "saved" | "saving" | "error";

/**
 * Topbar autosave indicator shared by the page and canvas editors:
 * Saving… / Saved / Save failed · Retry, and while the browser is offline
 * "Offline" or "Offline · changes queued" (queued saves retry on reconnect —
 * the editor owns that; this only renders it).
 */
export default function SaveStatus({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  const online = useOnline();

  if (!online) {
    const queued = state !== "saved";
    return (
      <span
        className={`${styles.status} ${styles.offline}`}
        role="status"
        title={queued ? "Your edits are kept in this tab and will sync when you're back online. Don't close it yet." : "You're offline. Edits will sync when you reconnect."}
      >
        <span className={styles.dot} aria-hidden />
        {queued ? "Offline · changes queued" : "Offline"}
      </span>
    );
  }

  return (
    <span className={`${styles.status} ${styles[state]}`} role="status">
      {state === "saving" && "Saving…"}
      {state === "saved" && "Saved"}
      {state === "error" && (
        <>
          Save failed
          {onRetry && (
            <button className={styles.retry} onClick={onRetry}>
              Retry
            </button>
          )}
        </>
      )}
    </span>
  );
}
