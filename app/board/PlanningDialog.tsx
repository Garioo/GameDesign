"use client";
import { useEffect, useRef, useState } from "react";
export interface PlanningAction {
  title: string;
  description: string;
  submit: () => Promise<void>;
}
export default function PlanningDialog({
  action,
  onClose,
}: {
  action: PlanningAction;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="stage-dialog planning-confirm"
      aria-labelledby="action-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await action.submit();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <h2 id="action-title">{action.title}</h2>
        </header>
        <div className="stage-dialog-content">
          <p>{action.description}</p>
          {error && (
            <p role="alert" className="planning-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="planning-primary" disabled={busy}>
            {busy ? "Working…" : "Delete"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
