"use client";

import { useCallback, useEffect, useState } from "react";
import { deletePageForever, listTrash, restorePage, type TrashedPage } from "@/lib/docsRepo";
import styles from "./TrashDialog.module.css";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Lists trashed pages with Restore / Delete forever. */
export default function TrashDialog({
  workspaceId,
  onClose,
  onRestored,
}: {
  workspaceId: string;
  onClose: () => void;
  /** Called after a restore so the page list can reload. */
  onRestored: (pageId: string) => void;
}) {
  const [items, setItems] = useState<TrashedPage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listTrash(workspaceId)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspaceId]);

  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (id: string, action: () => Promise<void>, after?: () => void) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Trash" onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Trash</h2>
            <p className={styles.sub}>Deleted pages are kept for 30 days.</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.list}>
          {items === null && !error && <div className={styles.empty}>Loading…</div>}
          {items?.length === 0 && <div className={styles.empty}>The trash is empty.</div>}
          {items?.map((p) => (
            <div key={p.id} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.name}>{p.title || "Untitled page"}</span>
                <span className={styles.meta}>
                  {ago(p.deletedAt)}
                  {p.deletedByName ? ` · by ${p.deletedByName}` : ""}
                  {p.childCount ? ` · with ${p.childCount} sub-page${p.childCount === 1 ? "" : "s"}` : ""}
                </span>
              </div>
              {confirming === p.id ? (
                <>
                  <button type="button" className={styles.btn} disabled={busy === p.id} onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.danger}`}
                    disabled={busy === p.id}
                    onClick={() => run(p.id, () => deletePageForever(p.id))}
                  >
                    Delete forever
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy === p.id}
                    onClick={() => run(p.id, () => restorePage(p.id), () => onRestored(p.id))}
                  >
                    Restore
                  </button>
                  <button type="button" className={styles.btn} disabled={busy === p.id} onClick={() => setConfirming(p.id)}>
                    Delete…
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
