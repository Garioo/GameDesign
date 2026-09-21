"use client";
import { useEffect, useRef, useState } from "react";
import { automaticBoardEndDate, updateBoardEndDate, type Board } from "@/lib/boardRepo";
import { boardColor, BOARD_PALETTE } from "@/lib/boardColors";
import {
  loadStageSnapshot,
  saveBoardStages,
  type StageDraft,
  type StageSnapshot,
} from "@/lib/stagesRepo";
import { PlanningIcon } from "./PlanningIcons";

const BASIC_STAGES = [
  { name: "To do", color: "#a59a8c", completed: false },
  { name: "In progress", color: "#cf6a2c", completed: false },
  { name: "In review", color: "#d4a13b", completed: false },
  { name: "Done", color: "#4caf7d", completed: true },
];

function addBasicStages(existing: StageDraft[] = []): StageDraft[] {
  const names = new Set(existing.map((stage) => stage.name.trim().toLowerCase()));
  return [
    ...existing,
    ...BASIC_STAGES.filter((stage) => !names.has(stage.name.toLowerCase())).map(
      (stage) => ({ ...stage, id: crypto.randomUUID() }),
    ),
  ];
}

export default function StageDialog({
  project,
  board,
  boards,
  onClose,
  onSaved,
}: {
  project: string;
  board: Board | null;
  /** Every board in the workspace, so the board-color picker can preview/compare against the
   *  same auto-assigned palette color shown elsewhere (sidebar, calendar, kanban, gantt). */
  boards: Board[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(board?.name ?? ""),
    [stages, setStages] = useState<StageDraft[]>(() =>
      board?.cols.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        completed: !!c.isCompleted,
      })) ?? addBasicStages(),
    );
  const [baseline, setBaseline] = useState<StageSnapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!board),
    [saving, setSaving] = useState(false),
    [transfers, setTransfers] = useState<Record<string, string>>({}),
    [conflict, setConflict] = useState(false);
  const [original, setOriginal] = useState<StageDraft[]>(board ? stages : []);
  const [endDateMode, setEndDateMode] = useState<"auto" | "custom">(board?.endDateOverride ? "custom" : "auto");
  const [endDate, setEndDate] = useState(board?.endDateOverride ?? "");
  const [savedEndDateOverride, setSavedEndDateOverride] = useState<string | null>(board?.endDateOverride ?? null);
  // Preview the swatch with the same effective color shown elsewhere (sidebar/calendar/gantt) —
  // the board's own custom color if it has one, otherwise its auto-assigned palette color (or,
  // for a brand-new board, the palette color it would get once created).
  const [boardColorValue, setBoardColorValue] = useState(() =>
    board ? boardColor(board, boards) : BOARD_PALETTE[boards.length % BOARD_PALETTE.length],
  );
  const [savedColor, setSavedColor] = useState(boardColorValue);
  const dialog = useRef<HTMLDialogElement>(null),
    dragged = useRef<string | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  async function reload() {
    if (!board) return;
    setLoading(true);
    setError("");
    try {
      const s = await loadStageSnapshot(project, board.id);
      if (!s.board) throw new Error("This board is no longer available.");
      const next = s.schedule.columns
        .filter((c) => c.board_id === board.id)
        .map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
          completed: row.is_completed,
          position: row.position,
        }))
        .sort((a, b) => a.position - b.position);
      setBaseline(s);
      setName(s.board.name);
      setStages(next);
      setOriginal(next);
      setTransfers({});
      setConflict(false);
      setEndDateMode(s.board.end_date ? "custom" : "auto");
      setEndDate(s.board.end_date ?? "");
      setSavedEndDateOverride(s.board.end_date ?? null);
      if (s.board.color) {
        const effective = boardColor({ id: board.id, color: s.board.color }, boards);
        setBoardColorValue(effective);
        setSavedColor(effective);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    void reload();
    const element = dialog.current;
    return () => element?.close();
  }, []);
  function update(id: string, patch: Partial<StageDraft>) {
    setStages((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }
  function move(id: string, to: number) {
    setStages((list) => {
      const next = [...list],
        from = next.findIndex((s) => s.id === id);
      if (from < 0 || to < 0 || to >= next.length) return list;
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }
  const removed = original.filter((s) => !stages.some((n) => n.id === s.id));
  // The freshest deadlines available: the just-loaded snapshot's cards for this board, falling back
  // to the board prop (e.g. while creating, or before the snapshot has loaded).
  const automaticEnd = baseline && board
    ? (() => {
        const colIds = new Set(baseline.schedule.columns.filter((c) => c.board_id === board.id).map((c) => c.id));
        const deadlines = baseline.schedule.cards.filter((c) => colIds.has(c.column_id)).map((c) => c.deadline).filter((d): d is string => !!d);
        return deadlines.length ? deadlines.reduce((latest, d) => (d > latest ? d : latest)) : null;
      })()
    : board ? automaticBoardEndDate(board) : null;
  const formatEnd = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  const count = (id: string) =>
    baseline?.schedule.cards.filter((c) => c.column_id === id).length ??
    board?.cols.find((c) => c.id === id)?.cards.length ??
    0;
  async function submit() {
    setError("");
    const names = stages.map((s) => s.name.trim().toLocaleLowerCase());
    if (!name.trim() || !stages.length || names.some((n) => !n)) {
      setError("Enter a board name and at least one named stage.");
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("Give each stage a different name.");
      return;
    }
    if (
      removed.some(
        (s) =>
          count(s.id) > 0 &&
          !stages.some((dest) => dest.id === transfers[s.id]),
      )
    ) {
      setError("Choose where to move the tasks from each removed stage.");
      return;
    }
    if (endDateMode === "custom" && !endDate) {
      setError("Choose an end date, or switch back to Automatic.");
      return;
    }
    setSaving(true);
    try {
      const id = await saveBoardStages(
        project,
        board?.id ?? null,
        baseline,
        name,
        stages,
        transfers,
        boardColorValue !== savedColor ? boardColorValue : undefined,
      );
      // The end date lives outside the stage snapshot, so only write it when it changed.
      const nextOverride = endDateMode === "custom" ? endDate : null;
      if (nextOverride !== savedEndDateOverride) await updateBoardEndDate(id, nextOverride);
      await onSaved(id);
      closeRef.current();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message.includes("Reload stages")) setConflict(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="stage-dialog"
      aria-labelledby="stages-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header>
          <div>
            <span className="planning-eyebrow">YOUR WORKFLOW</span>
            <h2 id="stages-title">
              {board ? "Manage stages" : "Create a board"}
            </h2>
            <p>
              {board
                ? "Shape this board around how your team works."
                : "Start with the basic stages below, or customize them to fit your team."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close stage setup"
            className="planning-icon-button"
            disabled={saving}
            onClick={onClose}
          >
            <PlanningIcon name="close" />
          </button>
        </header>
        <div className="stage-dialog-content">
          <div className="stage-name-color">
            <label className="stage-board-name">
              Board name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || saving}
                placeholder="Name your board"
                autoFocus
              />
            </label>
            <label className="stage-board-color">
              Color
              <input
                type="color"
                aria-label="Board color"
                value={boardColorValue}
                disabled={saving}
                onChange={(e) => setBoardColorValue(e.target.value)}
              />
            </label>
          </div>
          <div className="stage-end-date">
            <span className="stage-end-date-label">End date</span>
            <label className="stage-end-date-option">
              <input
                type="radio"
                name="end-date-mode"
                checked={endDateMode === "auto"}
                disabled={saving}
                onChange={() => setEndDateMode("auto")}
              />
              <span>
                Automatic — last task&apos;s deadline
                <small>{loading ? "Loading…" : automaticEnd ? formatEnd(automaticEnd) : "No dated tasks yet"}</small>
              </span>
            </label>
            <label className="stage-end-date-option">
              <input
                type="radio"
                name="end-date-mode"
                checked={endDateMode === "custom"}
                disabled={saving}
                onChange={() => setEndDateMode("custom")}
              />
              <span>
                Custom date
                {endDateMode === "custom" && (
                  <input
                    type="date"
                    className="stage-end-date-input"
                    aria-label="Board end date"
                    value={endDate}
                    disabled={saving}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                )}
              </span>
            </label>
          </div>
          {loading ? (
            <p role="status">Loading stages…</p>
          ) : (
            <fieldset disabled={saving || conflict}>
              <legend>
                Stages <span>{stages.length}</span>
              </legend>
              <div className="stage-list">
                {stages.map((stage, index) => (
                  <div
                    className="stage-editor-row"
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragged.current) move(dragged.current, index);
                      dragged.current = null;
                    }}
                  >
                    <span
                      className="stage-drag-handle"
                      draggable
                      onDragStart={() => {
                        dragged.current = stage.id;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                      title="Drag to reorder"
                    >
                      <PlanningIcon name="grip" />
                    </span>
                    <input
                      type="color"
                      aria-label={`Color for stage ${index + 1}`}
                      value={stage.color}
                      onChange={(e) =>
                        update(stage.id, { color: e.target.value })
                      }
                    />
                    <input
                      aria-label={`Stage ${index + 1} name`}
                      maxLength={120}
                      required
                      placeholder="Stage name"
                      value={stage.name}
                      onChange={(e) =>
                        update(stage.id, { name: e.target.value })
                      }
                    />
                    <label className="stage-completion">
                      <input
                        type="checkbox"
                        checked={stage.completed}
                        onChange={(e) =>
                          update(stage.id, { completed: e.target.checked })
                        }
                      />
                      Completed
                    </label>
                    <div className="stage-row-actions">
                      <button
                        type="button"
                        aria-label={`Move stage ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(stage.id, index - 1)}
                      >
                        <PlanningIcon name="arrowLeft" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move stage ${index + 1} down`}
                        disabled={index === stages.length - 1}
                        onClick={() => move(stage.id, index + 1)}
                      >
                        <PlanningIcon name="arrowRight" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove stage ${index + 1}`}
                        disabled={stages.length === 1}
                        onClick={() =>
                          setStages((list) =>
                            list.filter((s) => s.id !== stage.id),
                          )
                        }
                      >
                        <PlanningIcon name="close" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="stage-add"
                disabled={BASIC_STAGES.every((basic) =>
                  stages.some((stage) => stage.name.trim().toLowerCase() === basic.name.toLowerCase()),
                )}
                onClick={() => setStages(addBasicStages)}
              >
                <PlanningIcon name="plus" />
                Add basic stages
              </button>
              <button
                type="button"
                className="stage-add"
                onClick={() =>
                  setStages((list) => [
                    ...list,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      color: "#64748b",
                      completed: false,
                    },
                  ])
                }
              >
                <PlanningIcon name="plus" />
                Add stage
              </button>
              {!stages.length && (
                <p className="stage-empty">
                  Add the basic stages or create a stage of your own.
                </p>
              )}
              {removed.map((s) => (
                <div className="stage-transfer" key={s.id}>
                  <span>
                    Removing <strong>{s.name}</strong> · {count(s.id)} tasks
                  </span>
                  {count(s.id) > 0 && (
                    <label>
                      Move tasks to
                      <select
                        required
                        aria-label={`Move tasks from ${s.name}`}
                        value={transfers[s.id] ?? ""}
                        onChange={(e) =>
                          setTransfers({ ...transfers, [s.id]: e.target.value })
                        }
                      >
                        <option value="">Choose a stage</option>
                        {stages.map((dest) => (
                          <option key={dest.id} value={dest.id}>
                            {dest.name || "Unnamed stage"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setStages((list) => [...list, s])}
                  >
                    Restore stage
                  </button>
                </div>
              ))}
              <div className="stage-preview">
                <span className="planning-eyebrow">BOARD PREVIEW</span>
                <div>
                  {stages.map((s) => (
                    <span key={s.id}>
                      <i style={{ background: s.color }} />
                      {s.name || "Stage name"}
                      {s.completed && <small>Completed</small>}
                    </span>
                  ))}
                </div>
              </div>
            </fieldset>
          )}
          {error && (
            <p className="planning-error" role="alert">
              {error}
            </p>
          )}
          {(conflict || (!!board && !baseline && !loading)) && (
            <button type="button" onClick={() => void reload()}>
              Reload stages
            </button>
          )}
        </div>
        <footer>
          <span>Tasks and links stay connected.</span>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="planning-primary"
            disabled={
              loading ||
              saving ||
              conflict ||
              !stages.length ||
              (!!board && !baseline)
            }
          >
            {saving ? "Saving…" : board ? "Save stages" : "Create board"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
