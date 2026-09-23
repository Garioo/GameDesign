"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import Icon from "@/app/components/Icon";
import MultiSelectPicker from "@/app/components/MultiSelectPicker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import Dock from "../components/Dock";
import SettingsButton from "../components/SettingsButton";
import StageDialog from "../board/StageDialog";
import CategoryManager from "../board/CategoryManager";
import { ensureSession, type SessionInfo } from "@/lib/session";
import {
  loadBoards,
  listCategories,
  type Board,
  type BoardCategory,
} from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { dayNumber, dayKey, isoWeek, localToday, weekday } from "@/lib/gantt";
import {
  loadPhases,
  mutatePhases,
  phaseBoardHref,
  phaseDuration,
  phasePercent,
  type Phase,
  type PhaseAction,
  type PhaseDependency,
  type PhaseResult,
  type PhaseSnapshot,
} from "@/lib/phaseRepo";
import "../board/planning.css";
import "./phases.css";

const ROW_HEIGHT = 76;
type Drag = {
  id: string;
  kind: "move" | "start" | "end";
  x: number;
  delta: number;
  phase: Phase;
  snapshot: PhaseSnapshot;
};
/** Drawing dates onto an unscheduled phase: the day the drag began and the day under the pointer. */
type Draft = {
  id: string;
  anchor: number;
  current: number;
  x: number;
  moved: boolean;
  snapshot: PhaseSnapshot;
};
/** `shown` lists the board ids to show; `null` means every phase, `[]` means none. */
type Preferences = {
  shown: string[] | null;
  collapsed: string[];
  zoom: number;
  /** "start": earliest start first; "board": the boards' own order from the sidebar. */
  sort: "start" | "board";
};

/** Earliest start first, then earliest end, then title; unscheduled phases go last. */
function byStartDate(a: Phase, b: Phase) {
  const as = a.effective_start, bs = b.effective_start;
  if (!as || !bs) return as ? -1 : bs ? 1 : a.title.localeCompare(b.title);
  return (
    as.localeCompare(bs) ||
    (a.effective_end ?? "").localeCompare(b.effective_end ?? "") ||
    a.title.localeCompare(b.title)
  );
}

function PhaseEditor({
  phase,
  busy,
  scheduleError,
  onRefresh,
  onClose,
  onSave,
}: {
  phase: Phase;
  busy: boolean;
  scheduleError: string;
  onRefresh: () => void;
  onClose: () => void;
  onSave: (action: PhaseAction) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(phase.title);
  const [start, setStart] = useState(phase.effective_start ?? "");
  const [end, setEnd] = useState(phase.effective_end ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="stage-dialog phase-editor"
      aria-labelledby="phase-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="planning-eyebrow">
            {phase.category_id ? "CATEGORY SUBPHASE" : "BOARD PHASE"}
          </span>
          <h2 id="phase-editor-title">{phase.title}</h2>
          <p>
            {phase.category_id
              ? phase.board_name
              : "Plan the window for this board’s work."}
          </p>
        </div>
        <button
          disabled={busy}
          onClick={onClose}
          aria-label="Close phase editor"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="stage-dialog-content">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave({ op: "rename", id: phase.id, title }))
              setError("");
            else
              setError("Could not rename. See the schedule error and retry.");
          }}
        >
          <label>
            {phase.category_id
              ? "Category name · shared across boards"
              : "Phase / board title"}
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <button disabled={busy || title === phase.title}>Save title</button>
        </form>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await onSave({
                op: "dates",
                id: phase.id,
                start: start || null,
                end: end || null,
              })
            )
              onClose();
            else
              setError(
                "Dates were not saved. See the schedule error and retry.",
              );
          }}
        >
          <div className="phase-date-fields">
            <label>
              Start
              <input
                aria-label="Phase start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              End
              <input
                aria-label="Phase end"
                type="date"
                min={start || undefined}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <p className="phase-hint">
            {phase.category_id
              ? "The parent phase expands to include this window."
              : "Dates must contain all scheduled subphases. Drag the phase bar to move the whole phase."}{" "}
            Task dates stay independent.
          </p>
          {(error || scheduleError) && (
            <div role="alert">
              {scheduleError || error}
              <button type="button" disabled={busy} onClick={onRefresh}>
                Close and refresh
              </button>
            </div>
          )}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="planning-primary" disabled={busy}>
              Save dates
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}

export default function GanttWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [snapshot, setSnapshot] = useState<PhaseSnapshot | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>({
    shown: null,
    collapsed: [],
    zoom: 40,
    sort: "start",
  });
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
    id: string;
    baseline: PhaseSnapshot;
  } | null>(null);
  const [stageBoard, setStageBoard] = useState<Board | null | undefined>();
  const [categoryManager, setCategoryManager] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [undo, setUndo] = useState<PhaseResult | null>(null);
  const [predecessor, setPredecessor] = useState("");
  const [successor, setSuccessor] = useState("");
  const [kind, setKind] = useState<PhaseDependency["kind"]>("FS");
  const [gap, setGap] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const mutationRef = useRef(false);
  const refreshSequence = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [labelWidth, setLabelWidth] = useState(320);
  useEffect(() => {
    const media = window.matchMedia("(max-width:600px)");
    const update = () => setLabelWidth(media.matches ? 200 : 320);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const canEdit = !!session && session.role !== "viewer";

  const refresh = useCallback(async (project: string) => {
    const sequence = ++refreshSequence.current;
    const [next, items, cats] = await Promise.all([
      loadPhases(project),
      loadBoards(project),
      listCategories(project),
    ]);
    if (sequence !== refreshSequence.current) return;
    setSnapshot(next);
    setBoards(items);
    setCategories(cats);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await ensureSession();
        if (cancelled) return;
        if (!s) {
          router.replace("/login");
          return;
        }
        if (!s.onboarded) {
          router.replace("/onboarding");
          return;
        }
        setSession(s);
        let saved: Partial<Preferences> = {};
        try {
          saved = JSON.parse(
            localStorage.getItem(
              `phase-planning:v1:${s.workspaceId}:${s.userId}`,
            ) || "{}",
          );
        } catch {
          /* Optional preference. */
        }
        const requested = new URLSearchParams(window.location.search).get(
          "board",
        );
        // v1 preferences stored a single `board` ("all" or an id); still honour it.
        const legacy = (saved as { board?: unknown }).board;
        setPreferences({
          shown: requested
            ? [requested]
            : Array.isArray(saved.shown)
              ? saved.shown.filter((id) => typeof id === "string")
              : typeof legacy === "string" && legacy !== "all"
                ? [legacy]
                : null,
          collapsed: Array.isArray(saved.collapsed)
            ? saved.collapsed.filter((id) => typeof id === "string")
            : [],
          zoom: [24, 40, 64].includes(saved.zoom ?? 0) ? saved.zoom! : 40,
          sort: saved.sort === "board" ? "board" : "start",
        });
        await refresh(s.workspaceId);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ++refreshSequence.current;
    };
  }, [router, refresh]);
  useEffect(() => {
    if (!session || loading) return;
    try {
      localStorage.setItem(
        `phase-planning:v1:${session.workspaceId}:${session.userId}`,
        JSON.stringify(preferences),
      );
    } catch {
      /* Optional preference. */
    }
  }, [preferences, session, loading]);
  useSidebarLiveUpdates(
    loading ? null : (session?.workspaceId ?? null),
    [
      "boards",
      "board_columns",
      "board_cards",
      "board_categories",
      "planning_phases",
      "phase_dependencies",
    ],
    async () => {
      if (session && !mutationRef.current && !dragRef.current && !draftRef.current)
        await refresh(session.workspaceId);
    },
  );

  async function mutate(
    action: PhaseAction,
    expected = snapshot,
  ): Promise<boolean> {
    if (!session || !expected || !canEdit || mutationRef.current) return false;
    mutationRef.current = true;
    ++refreshSequence.current;
    setBusy(true);
    setError("");
    try {
      const result = await mutatePhases(session.workspaceId, expected, action);
      setSnapshot(result.snapshot);
      if ("id" in action)
        setEditor((current) =>
          current?.id === action.id
            ? { ...current, baseline: result.snapshot }
            : current,
        );
      setUndo(action.op === "undo" || action.op === "rename" ? null : result);
      if (action.op === "rename") await refresh(session.workspaceId);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  }
  const phases = snapshot?.phases ?? [];
  // The snapshot arrives in board order; "start" re-sorts phases and, within each, categories.
  const ordered =
    preferences.sort === "start" ? [...phases].sort(byStartDate) : phases;
  const main = ordered.filter((p) => !p.category_id);
  const active = ordered.filter((p) => p.active);
  // Drop ids of boards that no longer have a phase. If a non-empty filter loses all of
  // them, show everything rather than an empty chart; an explicit "Remove all" stays empty.
  const surviving = preferences.shown?.filter((id) =>
    main.some((p) => p.board_id === id),
  );
  const chosenBoards =
    !surviving || (!surviving.length && preferences.shown!.length)
      ? null
      : surviving;
  const rows: Phase[] = main
    .filter((p) => !chosenBoards || chosenBoards.includes(p.board_id))
    .flatMap((p) => {
      const children = active.filter(
        (c) => c.board_id === p.board_id && c.category_id,
      );
      const matches = (n: Phase) =>
        n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase());
      if (query && !matches(p) && !children.some(matches)) return [];
      return [
        p,
        ...(preferences.collapsed.includes(p.id) && !query
          ? []
          : children.filter((c) => !query || matches(p) || matches(c))),
      ];
    });
  const today = dayNumber(localToday());
  const dates = active.flatMap((p) =>
    [p.effective_start, p.effective_end]
      .filter((d): d is string => !!d)
      .map(dayNumber),
  );
  const first = Math.min(today - 7, ...dates) - 3;
  const last = Math.max(today + 35, ...dates) + 5;
  const days = last - first + 1;
  const width = days * preferences.zoom;
  const ticks = Array.from({ length: days }, (_, i) => first + i);
  const months = ticks.filter(
    (day) => day === first || dayKey(day).endsWith("-01"),
  );
  // Label each week at its Monday, plus the partial week the chart opens on.
  const weeks = ticks.filter((day) => day === first || weekday(day) === 0);
  const rowIndex = new Map(rows.map((p, i) => [p.id, i]));
  const editing = phases.find((p) => p.id === editor?.id);
  function openEditor(id: string) {
    if (snapshot) setEditor({ id, baseline: snapshot });
  }
  const scheduled = active.filter((p) => p.effective_start && p.effective_end);
  function startDrag(
    e: PointerEvent<HTMLElement>,
    phase: Phase,
    dragKind: Drag["kind"],
  ) {
    if (
      !canEdit ||
      busy ||
      !snapshot ||
      e.button !== 0 ||
      !phase.effective_start ||
      !phase.effective_end
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = {
      id: phase.id,
      kind: dragKind,
      x: e.clientX,
      delta: 0,
      phase,
      snapshot,
    };
    dragRef.current = next;
    setDrag(next);
  }
  function moveDrag(e: PointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    const next = {
      ...dragRef.current,
      delta: Math.round((e.clientX - dragRef.current.x) / preferences.zoom),
    };
    dragRef.current = next;
    setDrag(next);
  }
  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.delta) return;
    if (d.kind === "move")
      void mutate({ op: "move", id: d.id, days: d.delta }, d.snapshot);
    else
      void mutate(
        {
          op: "dates",
          id: d.id,
          start:
            d.kind === "start"
              ? dayKey(dayNumber(d.phase.effective_start!) + d.delta)
              : d.phase.effective_start,
          end:
            d.kind === "end"
              ? dayKey(dayNumber(d.phase.effective_end!) + d.delta)
              : d.phase.effective_end,
        },
        d.snapshot,
      );
  }
  // Unscheduled phases: press on the empty track and drag to draw its dates.
  const dayAt = (e: PointerEvent<HTMLElement>) =>
    first + Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / preferences.zoom);
  function startDraft(e: PointerEvent<HTMLElement>, phase: Phase) {
    if (!canEdit || busy || !snapshot || e.button !== 0 || (phase.effective_start && phase.effective_end)) return;
    if ((e.target as HTMLElement).closest("button")) return; // the "Set dates" button opens the editor instead
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const day = dayAt(e);
    const next = { id: phase.id, anchor: day, current: day, x: e.clientX, moved: false, snapshot };
    draftRef.current = next;
    setDraft(next);
  }
  function moveDraft(e: PointerEvent<HTMLElement>) {
    const d = draftRef.current;
    if (!d) return;
    const next = { ...d, current: dayAt(e), moved: d.moved || Math.abs(e.clientX - d.x) > 4 };
    draftRef.current = next;
    setDraft(next);
  }
  function endDraft() {
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    // A plain click isn't a drag — don't set dates by accident.
    if (!d || !d.moved) return;
    void mutate(
      { op: "dates", id: d.id, start: dayKey(Math.min(d.anchor, d.current)), end: dayKey(Math.max(d.anchor, d.current)) },
      d.snapshot,
    );
  }

  function range(phase: Phase) {
    let start = phase.effective_start ? dayNumber(phase.effective_start) : null,
      end = phase.effective_end ? dayNumber(phase.effective_end) : null;
    if (start === null || end === null) return null;
    if (
      drag &&
      (drag.id === phase.id ||
        (!drag.phase.category_id &&
          drag.phase.board_id === phase.board_id &&
          drag.kind === "move"))
    ) {
      if (drag.kind !== "end") start += drag.delta;
      if (drag.kind !== "start") end += drag.delta;
    }
    return {
      left: (start - first) * preferences.zoom,
      width: Math.max(1, end - start + 1) * preferences.zoom,
    };
  }
  return (
    <div
      className="phase-workspace planning-app"
      style={{ "--phase-label-width": `${labelWidth}px` } as CSSProperties}
    >
      <TopBar crumbs={["Gantt"]}>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>
      <main className="phase-main" aria-label="Gantt planning">
        {error && (
          <div role="alert" className="phase-error">
            {error}
            <button
              disabled={busy}
              onClick={() =>
                session &&
                void refresh(session.workspaceId)
                  .then(() => {
                    setError("");
                    setUndo(null);
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Refresh
            </button>
          </div>
        )}
        {undo && (
          <div role="status" className="phase-notice">
            Phase schedule saved.
            <button
              disabled={busy}
              onClick={() =>
                void mutate({ op: "undo", before: undo.before }, undo.snapshot)
              }
            >
              Undo schedule change
            </button>
          </div>
        )}
        <div className="phase-toolbar">
          <div className="phase-show">
            Show
            <MultiSelectPicker
              items={main.map((p) => ({ id: p.board_id, label: p.title }))}
              selected={chosenBoards}
              onChange={(shown) => setPreferences((p) => ({ ...p, shown }))}
              noun="phases"
              ariaLabel="Phases to show"
            />
          </div>
          <input
            aria-label="Search phases"
            type="search"
            placeholder="Find a phase or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="phase-toolbar-end">
            <button
              onClick={() =>
                scrollRef.current?.scrollTo({
                  left: Math.max(0, (today - first) * preferences.zoom - 80),
                  behavior: "smooth",
                })
              }
            >
              Today
            </button>
            <label>
              Sort
              <select
                aria-label="Sort phases"
                value={preferences.sort}
                onChange={(e) =>
                  setPreferences((p) => ({
                    ...p,
                    sort: e.target.value === "board" ? "board" : "start",
                  }))
                }
              >
                <option value="start">Start date</option>
                <option value="board">Board order</option>
              </select>
            </label>
            <label>
              Scale
              <select
                aria-label="Timeline scale"
                value={preferences.zoom}
                onChange={(e) =>
                  setPreferences((p) => ({
                    ...p,
                    zoom: Number(e.target.value),
                  }))
                }
              >
                <option value={24}>Compact</option>
                <option value={40}>Days</option>
                <option value={64}>Detailed</option>
              </select>
            </label>
            <div className="phase-actions">
              <button
                onClick={() => setShowLinks((v) => !v)}
                aria-expanded={showLinks}
              >
                Dependencies <span>{snapshot?.dependencies.length ?? 0}</span>
              </button>
              {canEdit && (
                <>
                  <button onClick={() => setCategoryManager(true)}>
                    Categories
                  </button>
                  <button
                    className="planning-primary"
                    onClick={() => setStageBoard(null)}
                  >
                    <Icon name="plus" /> New phase
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {showLinks && (
          <section className="phase-links" aria-label="Phase dependencies">
            <header>
              <h2>Dependencies</h2>
              <p>
                Following phases move forward when needed. Suspended links do
                not move dates.
              </p>
            </header>
            {canEdit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutate({
                      op: "dependency",
                      predecessor,
                      successor,
                      kind,
                      gap,
                    })
                  ) {
                    setPredecessor("");
                    setSuccessor("");
                  }
                }}
              >
                <select
                  required
                  aria-label="Predecessor phase"
                  value={predecessor}
                  onChange={(e) => setPredecessor(e.target.value)}
                >
                  <option value="">Predecessor…</option>
                  {scheduled.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category_id ? `${p.board_name} / ${p.title}` : p.title}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Dependency type"
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as PhaseDependency["kind"])
                  }
                >
                  <option value="FS">Finish → start</option>
                  <option value="SS">Start → start</option>
                  <option value="FF">Finish → finish</option>
                </select>
                <select
                  required
                  aria-label="Successor phase"
                  value={successor}
                  onChange={(e) => setSuccessor(e.target.value)}
                >
                  <option value="">Successor…</option>
                  {scheduled
                    .filter((p) => p.id !== predecessor)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.category_id
                          ? `${p.board_name} / ${p.title}`
                          : p.title}
                      </option>
                    ))}
                </select>
                <label>
                  Gap (days)
                  <input
                    aria-label="Dependency gap"
                    type="number"
                    min={0}
                    required
                    value={gap}
                    onChange={(e) => setGap(Number(e.target.value))}
                  />
                </label>
                <button disabled={busy} className="planning-primary">
                  Add link
                </button>
              </form>
            )}
            {!snapshot?.dependencies.length && (
              <p className="phase-hint">No dependencies yet.</p>
            )}
            {snapshot?.dependencies.map((d) => {
              const a = phases.find((p) => p.id === d.predecessor),
                b = phases.find((p) => p.id === d.successor);
              return (
                <div key={d.id} className="phase-link-item">
                  <span>
                    {a?.category_id ? `${a.board_name} / ` : ""}
                    {a?.title} <Icon name="arrowRight" />{" "}
                    {b?.category_id ? `${b.board_name} / ` : ""}
                    {b?.title}{" "}
                    <small>
                      {d.kind} · {d.gap} days
                    </small>
                    {d.suspended && <em>Suspended · {d.reason}</em>}
                  </span>
                  {canEdit && (
                    <>
                      {d.suspended && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void mutate({ op: "resume_dependency", id: d.id })
                          }
                        >
                          Retry link
                        </button>
                      )}
                      <button
                        disabled={busy}
                        aria-label={`Remove dependency ${a?.title} to ${b?.title}`}
                        onClick={() =>
                          void mutate({ op: "delete_dependency", id: d.id })
                        }
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        )}
        {loading ? (
          <div className="phase-empty">Loading phases…</div>
        ) : !rows.length ? (
          <div className="phase-empty">
            <h2>{main.length ? "No matching phases" : "Start with a phase"}</h2>
            <p>
              {main.length
                ? "Try another filter or search."
                : "Create a board for each phase. Its task categories will appear here as subphases."}
            </p>
            {canEdit && !main.length && (
              <button
                className="planning-primary"
                onClick={() => setStageBoard(null)}
              >
                Create your first phase
              </button>
            )}
          </div>
        ) : (
          <div
            className="phase-scroll"
            ref={scrollRef}
            aria-label="Phase timeline"
            tabIndex={0}
          >
            <div
              className="phase-grid"
              style={
                {
                  width: labelWidth + width,
                  // Rows draw day lines, Monday lines and weekend shading from these.
                  "--phase-day": `${preferences.zoom}px`,
                  "--phase-week-offset": `${((7 - weekday(first)) % 7) * preferences.zoom}px`,
                } as CSSProperties
              }
            >
              <div className="phase-grid-header">
                <div className="phase-label-header">PHASE / COMPLETION</div>
                <div className="phase-ruler" style={{ width }}>
                  {months.map((day) => (
                    <span
                      className="phase-month-label"
                      key={day}
                      style={{ left: (day - first) * preferences.zoom }}
                    >
                      {new Date(dayKey(day) + "T12:00:00").toLocaleDateString(
                        "en",
                        { month: "short", year: "numeric" },
                      )}
                    </span>
                  ))}
                  {weeks.map((day) => (
                    <span
                      className="phase-week-label"
                      key={day}
                      style={{
                        left: (day - first) * preferences.zoom,
                        width: (7 - weekday(day)) * preferences.zoom,
                      }}
                    >
                      {preferences.zoom < 40 && day !== first ? "W" : "Week "}
                      {isoWeek(day)}
                    </span>
                  ))}
                  {ticks.map((day) => (
                    <span
                      className={`phase-day-label${weekday(day) >= 5 ? " phase-weekend" : ""}${weekday(day) === 0 ? " phase-monday" : ""}${day === today ? " phase-today-label" : ""}`}
                      key={day}
                      title={`${new Date(
                        dayKey(day) + "T12:00:00",
                      ).toLocaleDateString("en", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })} · Week ${isoWeek(day)}`}
                      style={{
                        left: (day - first) * preferences.zoom,
                        width: preferences.zoom,
                      }}
                    >
                      {preferences.zoom >= 40 && (
                        <small>{"MTWTFSS"[weekday(day)]}</small>
                      )}
                      {Number(dayKey(day).slice(-2))}
                    </span>
                  ))}
                </div>
              </div>
              <div className="phase-rows">
                {rows.map((p) => {
                  const percent = phasePercent(p),
                    duration = phaseDuration(p),
                    r = range(p),
                    children = active.some(
                      (c) => c.board_id === p.board_id && c.category_id,
                    );
                  const color = boardColor(
                    { id: p.board_id, color: p.color },
                    boards,
                  );
                  return (
                    <div
                      key={p.id}
                      className={`phase-row${p.category_id ? " phase-child" : ""}`}
                      data-phase-id={p.id}
                      style={{ "--phase-color": color } as CSSProperties}
                    >
                      <div className="phase-label">
                        <div className="phase-title-line">
                          {!p.category_id && children ? (
                            <button
                              className="phase-expand"
                              aria-label={`${preferences.collapsed.includes(p.id) ? "Expand" : "Collapse"} ${p.title}`}
                              aria-expanded={
                                !preferences.collapsed.includes(p.id)
                              }
                              onClick={() =>
                                setPreferences((s) => ({
                                  ...s,
                                  collapsed: s.collapsed.includes(p.id)
                                    ? s.collapsed.filter((id) => id !== p.id)
                                    : [...s.collapsed, p.id],
                                }))
                              }
                            >
                              {preferences.collapsed.includes(p.id) ? "›" : "⌄"}
                            </button>
                          ) : (
                            <span className="phase-tree-mark">
                              {p.category_id ? "└" : "●"}
                            </span>
                          )}
                          <button
                            className="phase-title"
                            disabled={!canEdit}
                            onClick={() => openEditor(p.id)}
                            title="Edit phase title and dates"
                          >
                            {p.title}
                          </button>
                          <Link
                            className="phase-open"
                            href={phaseBoardHref(p)}
                            aria-label={`Open ${p.title} board`}
                          >
                            <Icon name="arrowUpRight" />
                          </Link>
                        </div>
                        <div className="phase-progress-line">
                          <progress
                            value={percent}
                            max={100}
                            aria-label={`${p.title} completion`}
                          />
                          <strong>{percent}%</strong>
                          <span>
                            {p.total
                              ? `${p.completed} of ${p.total} complete`
                              : "No tasks"}
                          </span>
                          <small>
                            {duration === null ? "Unscheduled" : `${duration}d`}
                          </small>
                        </div>
                        <div className="phase-date-caption">
                          {p.effective_start || "No start"} →{" "}
                          {p.effective_end || "No end"}
                        </div>
                      </div>
                      <div
                        className={`phase-track${!r && canEdit ? " phase-track-drawable" : ""}`}
                        style={{ width }}
                        onPointerDown={r ? undefined : (e) => startDraft(e, p)}
                        onPointerMove={r ? undefined : moveDraft}
                        onPointerUp={r ? undefined : endDraft}
                        onPointerCancel={r ? undefined : () => { draftRef.current = null; setDraft(null); }}
                        title={!r && canEdit ? "Drag across the timeline to set dates" : undefined}
                      >
                        {!r && draft?.id === p.id && draft.moved && (
                          <div
                            className={`phase-bar phase-draft${!p.category_id ? " phase-parent-bar" : ""}`}
                            style={{
                              left: (Math.min(draft.anchor, draft.current) - first) * preferences.zoom,
                              width: (Math.abs(draft.current - draft.anchor) + 1) * preferences.zoom,
                            }}
                            aria-hidden="true"
                          >
                            <span className="phase-draft-label">
                              {dayKey(Math.min(draft.anchor, draft.current))} – {dayKey(Math.max(draft.anchor, draft.current))}
                            </span>
                          </div>
                        )}
                        {r ? (
                          <div
                            className={`phase-bar${!p.category_id ? " phase-parent-bar" : ""}${drag?.id === p.id ? " dragging" : ""}`}
                            style={{ left: r.left, width: r.width }}
                            onPointerDown={(e) => startDrag(e, p, "move")}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={() => {
                              dragRef.current = null;
                              setDrag(null);
                            }}
                            title={`${p.title}: ${p.effective_start} – ${p.effective_end}`}
                          >
                            <span
                              className="phase-bar-fill"
                              style={{ width: `${percent}%` }}
                            />
                            {/* The part of the bar before today, greyed out and fading into
                                full colour at the today line. */}
                            {(() => {
                              const past = Math.min(r.width, (today - first) * preferences.zoom - r.left);
                              return past > 0 ? (
                                <span
                                  className={`phase-bar-past${past >= r.width ? " is-all-past" : ""}`}
                                  style={{ width: past + 1 }}
                                  aria-hidden="true"
                                />
                              ) : null;
                            })()}
                            {canEdit && (
                              <span
                                className="phase-resize phase-resize-start"
                                onPointerDown={(e) => startDrag(e, p, "start")}
                              />
                            )}
                            <button
                              disabled={!canEdit || busy}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => openEditor(p.id)}
                              aria-label={`Edit ${p.title} dates`}
                            >
                              {p.title}
                              <span>{percent}%</span>
                            </button>
                            {canEdit && (
                              <span
                                className="phase-resize phase-resize-end"
                                onPointerDown={(e) => startDrag(e, p, "end")}
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            className="phase-unscheduled"
                            disabled={!canEdit || busy}
                            onClick={() => openEditor(p.id)}
                            title="Or drag across the timeline"
                          >
                            <Icon name="plus" /> Set dates
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div
                  className="phase-today"
                  style={{
                    left: labelWidth + (today - first) * preferences.zoom,
                    height: rows.length * ROW_HEIGHT,
                  }}
                >
                  <span>Today</span>
                </div>
                <svg
                  className="phase-arrows"
                  style={{ left: labelWidth }}
                  width={width}
                  height={rows.length * ROW_HEIGHT}
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="phase-arrowhead"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6" fill="currentColor" />
                    </marker>
                  </defs>
                  {snapshot?.dependencies
                    .filter((d) => !d.suspended)
                    .map((d) => {
                      const ai = rowIndex.get(d.predecessor),
                        bi = rowIndex.get(d.successor);
                      if (ai === undefined || bi === undefined) return null;
                      const a = range(rows[ai]),
                        b = range(rows[bi]);
                      if (!a || !b) return null;
                      const x1 = d.kind === "SS" ? a.left : a.left + a.width,
                        x2 = d.kind === "FF" ? b.left + b.width : b.left,
                        y1 = ai * ROW_HEIGHT + 38,
                        y2 = bi * ROW_HEIGHT + 38;
                      return (
                        <path
                          key={d.id}
                          d={`M${x1},${y1} H${x1 + 12} V${y2 - 24} H${x2 - 10} V${y2} H${x2}`}
                          fill="none"
                          stroke="currentColor"
                          markerEnd="url(#phase-arrowhead)"
                        />
                      );
                    })}
                </svg>
              </div>
            </div>
          </div>
        )}
        <p className="phase-footnote">
          {active.filter((p) => !p.category_id).length} phases ·{" "}
          {active.filter((p) => p.category_id).length} category subphases
          <span>
            {busy
              ? "Saving…"
              : canEdit
                ? "Drag bars to move · Drag edges to resize · Drag on an empty row to set dates · Click a title to edit"
                : "View only"}
          </span>
        </p>
      </main>
      <Dock
        planningBoardId={chosenBoards?.length === 1 ? chosenBoards[0] : undefined}
      />
      {editing && canEdit && (
        <PhaseEditor
          key={editing.id}
          phase={editing}
          busy={busy}
          scheduleError={error}
          onRefresh={() => {
            setEditor(null);
            if (session)
              void refresh(session.workspaceId)
                .then(() => {
                  setError("");
                  setUndo(null);
                })
                .catch((e) => setError(e.message));
          }}
          onClose={() => setEditor(null)}
          onSave={(action) => mutate(action, editor?.baseline)}
        />
      )}
      {stageBoard !== undefined && session && (
        <StageDialog
          project={session.workspaceId}
          board={stageBoard}
          boards={boards}
          onClose={() => setStageBoard(undefined)}
          onSaved={async (id) => {
            await refresh(session.workspaceId);
            // Keep a new phase visible when a filter is active.
            setPreferences((p) =>
              p.shown && !p.shown.includes(id)
                ? { ...p, shown: [...p.shown, id] }
                : p,
            );
          }}
        />
      )}
      {categoryManager && session && (
        <CategoryManager
          project={session.workspaceId}
          categories={categories}
          onClose={() => setCategoryManager(false)}
          onRefresh={() => refresh(session.workspaceId)}
        />
      )}
    </div>
  );
}
