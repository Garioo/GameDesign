"use client";
import { backdropClose } from "@/lib/dialogBackdrop";
import { useEffect, useRef, useState } from "react";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  type BoardCategory,
} from "@/lib/boardRepo";
export default function CategoryManager({
  project,
  categories,
  onClose,
  onRefresh,
}: {
  project: string;
  categories: BoardCategory[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="stage-dialog"
      aria-labelledby="categories-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      {...backdropClose(() => { if (!busy) onClose(); })}
    >
      <header>
        <div>
          <h2 id="categories-title">Categories</h2>
          <p>Categories group tasks by type. Stages track their progress.</p>
        </div>
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </header>
      <div className="stage-dialog-content">
        <fieldset disabled={busy}>
          {categories.map((c) => (
            <div className="category-editor-row" key={c.id}>
              <input
                aria-label={`Category ${c.name}`}
                value={names[c.id] ?? c.name}
                onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
              />
              <button
                disabled={!(names[c.id] ?? c.name).trim()}
                onClick={() =>
                  void run(() =>
                    renameCategory(
                      project,
                      c.id,
                      c.name,
                      (names[c.id] ?? c.name).trim(),
                    ),
                  )
                }
              >
                Save
              </button>
              <button
                onClick={() =>
                  window.confirm(`Delete “${c.name}”? Its tasks will become uncategorized and its Gantt subphases and dependencies will be removed.`) && void run(() => deleteCategory(project, c.id, c.name))
                }
              >
                Remove label
              </button>
            </div>
          ))}
          <form
            className="category-editor-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await createCategory(project, draft.trim());
                setDraft("");
              });
            }}
          >
            <input
              required
              aria-label="New category name"
              placeholder="New category name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button disabled={!draft.trim()}>Add category</button>
          </form>
        </fieldset>
        {error && (
          <p role="alert" className="planning-error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
