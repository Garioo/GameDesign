"use client";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as PE,
} from "react";
import type { Board, BoardCard } from "@/lib/boardRepo";
import { dayKey, dayNumber, localToday, barRange } from "@/lib/gantt";
import {
  loadSchedule,
  loadViews,
  mutateSchedule,
  saveView,
  type ScheduleSnapshot,
  type ScheduleResult,
  type SavedView,
  type ViewSettings,
  type Milestone,
} from "@/lib/ganttRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import "./gantt.css";
import PlanningHeader from "./PlanningHeader";
import { PlanningIcon } from "./PlanningIcons";
type Person = { id: string; name: string; initials: string; color: string };
type Props = {
  onCreate: () => void;
  onManageStages: (board: Board) => void;
  onManageCategories: () => void;
  onBoardSelection: (id: string | undefined) => void;
  externalResult: ScheduleResult | null;
  boardRequest: { id: string; sequence: number } | null;
  boards: Board[];
  people: Person[];
  project: string;
  user: string;
  canEdit: boolean;
  onOpen: (card: BoardCard) => void;
  onRefresh: () => Promise<void>;
  onNavigation: () => void;
};
const defaults: ViewSettings = {
  boards: [],
  query: "",
  owner: "",
  category: "",
  completed: true,
  days: 30,
  collapsed: [],
};
const label = (
  day: number,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Date(day * 86400000).toLocaleDateString("en", {
    ...options,
    timeZone: "UTC",
  });
export default function GanttChart({
  externalResult,
  onCreate,
  onManageStages,
  onManageCategories,
  onBoardSelection,
  boardRequest,
  boards,
  people,
  project,
  user,
  canEdit,
  onOpen,
  onRefresh,
  onNavigation,
}: Props) {
  const [view, setView] = useState(defaults),
    [ready, setReady] = useState(false),
    [first, setFirst] = useState(dayNumber(localToday()) - 3),
    [width, setWidth] = useState(260);
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null),
    [views, setViews] = useState<SavedView[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<ScheduleResult | null>(null);
  const [selected, setSelected] = useState(""),
    [tray, setTray] = useState(false),
    [settings, setSettings] = useState(false),
    [viewName, setViewName] = useState("");
  useEffect(() => {
    if (ready)
      onBoardSelection(view.boards.length === 1 ? view.boards[0] : undefined);
  }, [ready, view.boards, onBoardSelection]);
  const [predecessor, setPredecessor] = useState(""),
    [successor, setSuccessor] = useState(""),
    [kind, setKind] = useState("FS"),
    [gap, setGap] = useState(0);
  const [milestone, setMilestone] = useState<Milestone | null>(null),
    [milestoneTasks, setMilestoneTasks] = useState<string[]>([]),
    [drag, setDrag] = useState<{
      id: string;
      start: number;
      end: number;
    } | null>(null);
  const scroll = useRef<HTMLDivElement>(null),
    cleanup = useRef<() => void>(() => {}),
    suppressClick = useRef(false),
    busyRef = useRef(false);
  const [viewport, setViewport] = useState({ available: 0, task: 260 });
  useEffect(() => {
    const element = scroll.current;
    const taskLabel = element?.querySelector(".gantt-task-label");
    if (!element || !taskLabel) return;
    const measure = () => {
      const task = taskLabel.getBoundingClientRect().width;
      const available = Math.max(0, element.clientWidth - task);
      setViewport((previous) =>
        previous.task === task && previous.available === available
          ? previous
          : { task, available },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(taskLabel);
    measure();
    return () => observer.disconnect();
  }, []);
  const prefKey = `gantt:v2:${project}:${user}`,
    dayWidth = Math.max(
      view.days === 14 ? 52 : view.days === 30 ? 34 : 20,
      viewport.available / view.days,
    ),
    timelineWidth = dayWidth * view.days;
  const cards = boards.flatMap((b) =>
      b.cols.flatMap((c) =>
        c.cards.map((card) => ({ card, col: c, board: b })),
      ),
    ),
    cardMap = new Map(cards.map((t) => [t.card.id, t]));
  const update = (patch: Partial<ViewSettings>) =>
    setView((v) => ({ ...v, ...patch }));
  const toggle = (id: string) =>
    update({
      collapsed: view.collapsed.includes(id)
        ? view.collapsed.filter((x) => x !== id)
        : [...view.collapsed, id],
    });
  useEffect(() => {
    if (boardRequest)
      setView((v) => ({
        ...v,
        boards: boardRequest.id === "all" ? [] : [boardRequest.id],
      }));
  }, [boardRequest]);
  useEffect(() => {
    if (externalResult) {
      setUndo(externalResult);
      setSnapshot(externalResult.snapshot);
      setNotice(`${externalResult.moved} tasks moved. Changes saved.`);
    }
  }, [externalResult]);
  const matches = (c: BoardCard) =>
    c.title.toLowerCase().includes(view.query.toLowerCase()) &&
    (!view.owner || c.ownerIds.includes(view.owner)) &&
    (!view.category || c.kind === view.category);
  async function refresh() {
    const [s, v] = await Promise.all([
      loadSchedule(project),
      loadViews(project),
    ]);
    setSnapshot(s);
    setViews(v);
  }
  useEffect(() => {
    let active = true;
    Promise.all([loadSchedule(project), loadViews(project)])
      .then(([s, v]) => {
        if (active) {
          setSnapshot(s);
          setViews(v);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    try {
      const saved = JSON.parse(localStorage.getItem(prefKey) || "null");
      if (
        saved &&
        Array.isArray(saved.boards) &&
        Array.isArray(saved.collapsed)
      )
        setView({
          ...defaults,
          ...saved,
          days: [14, 30, 90].includes(saved.days) ? saved.days : 30,
        });
    } catch {}
    const requested = new URLSearchParams(window.location.search).get("board");
    if (requested) setView((v) => ({ ...v, boards: [requested] }));
    setReady(true);
    return () => {
      active = false;
      cleanup.current();
    };
  }, [project, prefKey]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(prefKey, JSON.stringify(view));
      } catch {}
  }, [view, ready, prefKey]);
  useSidebarLiveUpdates(
    project,
    [
      "board_cards",
      "board_columns",
      "gantt_dependencies",
      "gantt_milestones",
      "gantt_milestone_tasks",
      "gantt_views",
    ],
    refresh,
  );
  async function mutate(
    action: Record<string, unknown>,
    allowUndo = false,
    expected = snapshot,
  ) {
    if (!expected || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutateSchedule(project, expected, action);
      setSnapshot(result.snapshot);
      setNotice(`${result.moved} tasks moved. Changes saved.`);
      setUndo(allowUndo ? result : null);
      await onRefresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save schedule");
      await refresh().catch(() => {});
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function schedule(card: BoardCard, start: number, end: number) {
    return mutate(
      {
        op: "card",
        card: {
          id: card.id,
          start_date: dayKey(start),
          deadline: dayKey(end),
          firm_deadline: card.firmDeadline ?? null,
        },
      },
      true,
    );
  }
  function begin(
    e: PE<HTMLElement>,
    card: BoardCard,
    mode: "move" | "start" | "end" | "new",
  ) {
    if (!canEdit || busy || !snapshot) return;
    e.stopPropagation();
    cleanup.current();
    const x = e.clientX,
      y = e.clientY,
      initialScroll = scroll.current?.scrollLeft ?? 0,
      taskWidth =
        scroll.current
          ?.querySelector(".gantt-task-label")
          ?.getBoundingClientRect().width ?? width,
      target = e.currentTarget,
      pointer = e.pointerId;
    const start = dayNumber(card.startDate || card.deadline || dayKey(first)),
      end = dayNumber(card.deadline || card.startDate || dayKey(first));
    let active = e.pointerType !== "touch",
      moved = false,
      a = start,
      b = end;
    const timer = setTimeout(
      () => {
        active = true;
        target.setPointerCapture(pointer);
        setSelected(card.id);
      },
      e.pointerType === "touch" ? 400 : 0,
    );
    const move = (event: PointerEvent) => {
      if (!active) {
        if (Math.hypot(event.clientX - x, event.clientY - y) > 8) finish(false);
        return;
      }
      if (event.cancelable) event.preventDefault();
      const delta = Math.round(
        (event.clientX -
          x +
          (scroll.current?.scrollLeft ?? 0) -
          initialScroll) /
          dayWidth,
      );
      if (mode === "new") {
        const r = scroll.current?.getBoundingClientRect();
        if (!r) return;
        a =
          first +
          Math.max(
            0,
            Math.floor(
              (event.clientX -
                r.left +
                (scroll.current?.scrollLeft ?? 0) -
                taskWidth) /
                dayWidth,
            ),
          );
        b = a;
      } else if (mode === "move") {
        a = start + delta;
        b = end + delta;
      } else if (mode === "start") a = Math.min(end, start + delta);
      else b = Math.max(start, end + delta);
      moved = moved || Math.hypot(event.clientX - x, event.clientY - y) > 4;
      setDrag({ id: card.id, start: a, end: b });
      const r = scroll.current?.getBoundingClientRect();
      if (r && scroll.current) {
        if (event.clientX > r.right - 35) scroll.current.scrollLeft += 12;
        else if (event.clientX < r.left + taskWidth + 25)
          scroll.current.scrollLeft -= 12;
      }
    };
    const finish = (save: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", preventTouch);
      window.removeEventListener("keydown", escape);
      if (target.hasPointerCapture(pointer))
        target.releasePointerCapture(pointer);
      setDrag(null);
      if (moved || (active && e.pointerType === "touch")) {
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 100);
      }
      if (save && active && moved) void schedule(card, a, b);
    };
    const up = (event: PointerEvent) => {
        const r = scroll.current?.getBoundingClientRect();
        finish(
          mode !== "new" ||
            (!!r &&
              event.clientY >= r.top &&
              event.clientY <= r.bottom &&
              event.clientX >= r.left + taskWidth),
        );
      },
      cancel = () => finish(false);
    const preventTouch = (event: TouchEvent) => {
      if (active && event.cancelable) event.preventDefault();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    cleanup.current = cancel;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", preventTouch, { passive: false });
    window.addEventListener("keydown", escape);
  }
  function editMilestone(m: Milestone) {
    setMilestone(m);
    setMilestoneTasks(
      snapshot?.links
        .filter((l) => l.milestone_id === m.id)
        .map((l) => l.card_id) ?? [],
    );
    setSettings(true);
  }
  const visibleBoards = boards.filter(
    (b) => !view.boards.length || view.boards.includes(b.id),
  );
  const unscheduled = cards.filter(
    (t) =>
      (!view.boards.length || view.boards.includes(t.board.id)) &&
      !t.card.startDate &&
      !t.card.deadline &&
      matches(t.card) &&
      (view.completed || !t.col.isCompleted),
  );
  const visibleMilestones =
    snapshot?.milestones.filter(
      (m) => !m.board_id || visibleBoards.some((b) => b.id === m.board_id),
    ) ?? [];
  const rowY = new Map<string, number>();
  let gridHeight = 64 + visibleMilestones.length * 35;
  for (const board of visibleBoards) {
    if (visibleBoards.length > 1) {
      gridHeight += 38;
      if (view.collapsed.includes(board.id)) continue;
    }
    for (const col of board.cols) {
      for (const card of col.cards) {
        if (
          (card.startDate || card.deadline) &&
          matches(card) &&
          (view.completed || !col.isCompleted)
        ) {
          rowY.set(card.id, gridHeight + 32);
          gridHeight += 64;
        }
      }
    }
  }
  const endpoint = (id: string, end: boolean) => {
    const card = cardMap.get(id)?.card;
    if (!card) return 0;
    const date =
      drag?.id === id
        ? end
          ? drag.end
          : drag.start
        : dayNumber(
            (end
              ? card.deadline || card.startDate
              : card.startDate || card.deadline)!,
          );
    return Math.max(
      0,
      Math.min(timelineWidth, (date - first + (end ? 1 : 0)) * dayWidth),
    );
  };
  return (
    <section className="gantt-workspace" aria-label="Project schedule">
      <PlanningHeader
        title={
          view.boards.length === 1
            ? (boards.find((b) => b.id === view.boards[0])?.name ?? "Timeline")
            : "All tasks"
        }
        mode="timeline"
        boardId={view.boards.length === 1 ? view.boards[0] : undefined}
        canEdit={canEdit}
        onCreate={onCreate}
        onNavigation={onNavigation}
      >
        <details className="gantt-menu">
          <summary>
            {view.boards.length
              ? `${view.boards.length} ${view.boards.length === 1 ? "board" : "boards"}`
              : "All boards"}
          </summary>
          <div>
            <button onClick={() => update({ boards: [] })}>All boards</button>
            {boards.map((b) => (
              <label key={b.id}>
                <input
                  type="checkbox"
                  checked={!view.boards.length || view.boards.includes(b.id)}
                  onChange={(e) =>
                    update({
                      boards: e.target.checked
                        ? [...view.boards, b.id]
                        : (view.boards.length
                            ? view.boards
                            : boards.map((x) => x.id)
                          ).filter((id) => id !== b.id),
                    })
                  }
                />
                {b.name}
              </label>
            ))}
          </div>
        </details>
        <input
          aria-label="Search tasks"
          placeholder="Find a task…"
          value={view.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        <details className="gantt-menu">
          <summary>Filters</summary>
          <div>
            <label>
              Owner
              <select
                value={view.owner}
                onChange={(e) => update({ owner: e.target.value })}
              >
                <option value="">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={view.category}
                onChange={(e) => update({ category: e.target.value })}
              >
                <option value="">All categories</option>
                {Array.from(
                  new Set(cards.map((t) => t.card.kind).filter(Boolean)),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.completed}
                onChange={(e) => update({ completed: e.target.checked })}
              />
              Show completed
            </label>
          </div>
        </details>
        <div className="timeline-period-controls">
        <select
          aria-label="Timeline zoom"
          value={view.days}
          onChange={(e) => update({ days: Number(e.target.value) })}
        >
          <option value={14}>2 weeks</option>
          <option value={30}>1 month</option>
          <option value={90}>3 months</option>
        </select>
        <button
          aria-label="Previous period"
          onClick={() => setFirst((f) => f - view.days)}
        >
          <PlanningIcon name="arrowLeft" />
        </button>
        <button
          onClick={() => {
            setFirst(dayNumber(localToday()) - 3);
            scroll.current?.scrollTo({ left: 0 });
          }}
        >
          Today
        </button>
        <button
          aria-label="Next period"
          onClick={() => setFirst((f) => f + view.days)}
        >
          <PlanningIcon name="arrowRight" />
        </button>
        </div>
        <details className="planning-menu planning-overflow">
          <summary>
            <PlanningIcon name="more" />
            More
          </summary>
          <div>
        <details className="gantt-menu timeline-saved-views">
          <summary>Saved views</summary>
          <div>
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => setView({ ...defaults, ...v.settings })}
              >
                {v.name}
              </button>
            ))}
            <input
              aria-label="View name"
              placeholder="Name this view"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
            <button
              disabled={!viewName.trim()}
              onClick={async () => {
                try {
                  await saveView(project, viewName, view);
                  setViewName("");
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save current view
            </button>
          </div>
        </details>
            <label>Task list width
              <input
                type="range"
                min={160}
                max={440}
                value={width}
                aria-label="Task list width"
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <button onClick={() => setSettings((v) => !v)}>
              {settings
                ? "Hide planning settings"
                : "Dependencies & milestones"}
            </button>
            {canEdit && (
              <button onClick={onManageCategories}>Manage categories</button>
            )}
            {canEdit &&
              boards.map((b) => (
                <button key={b.id} onClick={() => onManageStages(b)}>
                  Manage stages · {b.name}
                </button>
              ))}
          </div>
        </details>
      </PlanningHeader>
      <div className="gantt-caption">
        <span>
          {label(first)} — {label(first + view.days - 1)} ·{" "}
          {visibleBoards.length}{" "}
          {visibleBoards.length === 1 ? "board" : "boards"}
        </span>
        <span role="status">
          {busy ? "Saving…" : notice}
          {undo && (
            <button
              disabled={busy}
              onClick={() =>
                void mutate(
                  { op: "undo", dates: undo.before },
                  false,
                  undo.snapshot,
                )
              }
            >
              Undo
            </button>
          )}
        </span>
      </div>
      {error && (
        <div role="alert" className="gantt-error">
          {error}
          <button
            onClick={() => {
              setError("");
              void refresh().catch((e) => setError(e.message));
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!snapshot && !error && <p className="gantt-empty">Loading schedule…</p>}
      {settings && (
        <section className="gantt-planning" aria-label="Planning settings">
          <div>
            <h2>Dependencies</h2>
            {canEdit && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({
                    op: "dependency",
                    predecessor,
                    successor,
                    kind,
                    gap,
                  });
                }}
              >
                <select
                  required
                  aria-label="Prerequisite"
                  value={predecessor}
                  onChange={(e) => setPredecessor(e.target.value)}
                >
                  <option value="">Prerequisite task</option>
                  {cards
                    .filter((t) => t.card.startDate && t.card.deadline)
                    .map((t) => (
                      <option key={t.card.id} value={t.card.id}>
                        {t.board.name} · {t.card.title}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Dependency type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="FS">Finish → start</option>
                  <option value="SS">Start → start</option>
                  <option value="FF">Finish → finish</option>
                </select>
                <select
                  required
                  aria-label="Dependent task"
                  value={successor}
                  onChange={(e) => setSuccessor(e.target.value)}
                >
                  <option value="">Dependent task</option>
                  {cards
                    .filter(
                      (t) =>
                        t.card.id !== predecessor &&
                        t.card.startDate &&
                        t.card.deadline,
                    )
                    .map((t) => (
                      <option key={t.card.id} value={t.card.id}>
                        {t.board.name} · {t.card.title}
                      </option>
                    ))}
                </select>
                <label>
                  Gap (days)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={gap}
                    onChange={(e) => setGap(Number(e.target.value))}
                  />
                </label>
                <button disabled={busy || !snapshot}>Link tasks</button>
              </form>
            )}
            {snapshot?.dependencies.map((d) => (
              <p key={d.id}>
                {cardMap.get(d.predecessor)?.card.title} →{" "}
                {cardMap.get(d.successor)?.card.title}{" "}
                <small>
                  {d.kind} +{d.gap}d
                </small>
                {canEdit && (
                  <button
                    disabled={busy}
                    aria-label="Remove dependency"
                    onClick={() =>
                      void mutate({ op: "delete_dependency", id: d.id })
                    }
                  >
                    ×
                  </button>
                )}
              </p>
            ))}
          </div>
          <div>
            <h2>Fixed milestones</h2>
            {snapshot?.milestones.map((m) => (
              <button key={m.id} onClick={() => editMilestone(m)}>
                ◆ {m.name} · {m.day}
              </button>
            ))}
            {canEdit && (
              <button
                onClick={() => {
                  setMilestone({
                    id: crypto.randomUUID(),
                    name: "",
                    day: localToday(),
                    board_id: null,
                  });
                  setMilestoneTasks([]);
                }}
              >
                + Milestone
              </button>
            )}
            {milestone && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutate({
                      op: "milestone",
                      milestone,
                      tasks: milestoneTasks,
                    })
                  )
                    setMilestone(null);
                }}
              >
                <input
                  aria-label="Milestone name"
                  required
                  maxLength={120}
                  value={milestone.name}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setMilestone({ ...milestone, name: e.target.value })
                  }
                />
                <input
                  aria-label="Milestone date"
                  required
                  type="date"
                  disabled={!canEdit}
                  value={milestone.day}
                  onChange={(e) =>
                    setMilestone({ ...milestone, day: e.target.value })
                  }
                />
                <select
                  aria-label="Milestone scope"
                  disabled={!canEdit}
                  value={milestone.board_id ?? ""}
                  onChange={(e) => {
                    setMilestone({
                      ...milestone,
                      board_id: e.target.value || null,
                    });
                    setMilestoneTasks([]);
                  }}
                >
                  <option value="">Whole workspace</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <fieldset disabled={!canEdit}>
                  <legend>Prerequisite tasks</legend>
                  {cards
                    .filter(
                      (t) =>
                        (!milestone.board_id ||
                          t.board.id === milestone.board_id) &&
                        t.card.deadline,
                    )
                    .map((t) => (
                      <label key={t.card.id}>
                        <input
                          type="checkbox"
                          checked={milestoneTasks.includes(t.card.id)}
                          onChange={(e) =>
                            setMilestoneTasks(
                              e.target.checked
                                ? [...milestoneTasks, t.card.id]
                                : milestoneTasks.filter(
                                    (id) => id !== t.card.id,
                                  ),
                            )
                          }
                        />
                        {t.card.title}
                      </label>
                    ))}
                </fieldset>
                {canEdit && (
                  <>
                    <button disabled={busy}>Save milestone</button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await mutate({
                            op: "delete_milestone",
                            id: milestone.id,
                          })
                        )
                          setMilestone(null);
                      }}
                    >
                      Delete milestone
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setMilestone(null)}>
                  Close
                </button>
              </form>
            )}
          </div>
        </section>
      )}
      <div
        className="gantt-scroll"
        ref={scroll}
        style={
          {
            "--task-width": `${width}px`,
            "--day-width": `${dayWidth}px`,
            "--timeline-width": `${timelineWidth}px`,
          } as CSSProperties
        }
      >
        <div className="gantt-grid" style={{ width: viewport.task + timelineWidth }}>
          <svg
            className="gantt-connections"
            width={timelineWidth}
            height={gridHeight}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="gantt-arrow"
                viewBox="0 0 6 6"
                refX="5"
                refY="3"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0 0 L6 3 L0 6" fill="#a38b72" />
              </marker>
            </defs>
            {snapshot?.dependencies.map((d) => {
              const y1 = rowY.get(d.predecessor),
                y2 = rowY.get(d.successor);
              if (y1 === undefined || y2 === undefined) return null;
              const x1 = endpoint(d.predecessor, d.kind !== "SS"),
                x2 = endpoint(d.successor, d.kind === "FF"),
                bend = Math.min(timelineWidth - 4, Math.max(x1, x2) + 12);
              return (
                <path
                  key={d.id}
                  d={`M${x1} ${y1} H${bend} V${y2} H${x2}`}
                  fill="none"
                  stroke="#a38b72"
                  strokeWidth={
                    selected === d.predecessor || selected === d.successor
                      ? 1.8
                      : 1
                  }
                  opacity={
                    selected === d.predecessor || selected === d.successor
                      ? 1
                      : 0.5
                  }
                  markerEnd="url(#gantt-arrow)"
                />
              );
            })}
          </svg>
          {drag && unscheduled.some((t) => t.card.id === drag.id) && (
            <div
              className="gantt-drop-preview"
              style={{
                left: `calc(var(--task-width) + ${(drag.start - first) * dayWidth}px)`,
              }}
            >
              ↓ {label(drag.start)}
            </div>
          )}
          <div className="gantt-header">
            <div className="gantt-task-label">
              <strong>Tasks</strong><span>Click a task to edit its details</span>

            </div>
            <div className="gantt-dates">
              {Array.from({ length: view.days }, (_, i) => first + i).map(
                (d, i) => (
                  <div
                    key={d}
                    className={`${dayKey(d) === localToday() ? "today " : ""}${[0, 6].includes(new Date(d * 86400000).getUTCDay()) ? "weekend" : ""}`}
                  >
                    <small>
                      {i === 0 || new Date(d * 86400000).getUTCDate() === 1
                        ? label(d, { month: "short" })
                        : new Date(d * 86400000).getUTCDay() === 1
                          ? "Mon"
                          : ""}
                    </small>
                    <span>
                      {view.days < 90 || i % 7 === 0
                        ? label(d, { day: "numeric" })
                        : "·"}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
          {snapshot?.milestones
            .filter(
              (m) =>
                !m.board_id || visibleBoards.some((b) => b.id === m.board_id),
            )
            .map((m) => (
              <div className="gantt-row gantt-milestone" key={m.id}>
                <button
                  className="gantt-task-label"
                  onClick={() => editMilestone(m)}
                >
                  ◆ {m.name}
                </button>
                <div className="gantt-track">
                  {dayNumber(m.day) >= first &&
                  dayNumber(m.day) < first + view.days ? (
                    <button
                      style={{ left: (dayNumber(m.day) - first) * dayWidth }}
                      onClick={() => editMilestone(m)}
                      title={`${m.name}: ${m.day}`}
                    >
                      ◆
                    </button>
                  ) : (
                    <button onClick={() => setFirst(dayNumber(m.day) - 3)}>
                      Show {m.day} →
                    </button>
                  )}
                </div>
              </div>
            ))}
          {visibleBoards.map((b) => (
            <Fragment key={b.id}>
              {visibleBoards.length > 1 && <div className="gantt-group board-group">
                <button
                  onClick={() => toggle(b.id)}
                  aria-expanded={!view.collapsed.includes(b.id)}
                >
                  {view.collapsed.includes(b.id) ? "▸" : "▾"} {b.name}
                  <small>
                    {b.cols.reduce((n, c) => n + c.cards.length, 0)} tasks
                  </small>
                </button>
                {canEdit && (
                  <button
                    className="gantt-manage-stages"
                    onClick={() => onManageStages(b)}
                    aria-label={`Manage stages for ${b.name}`}
                  >
                    Manage stages
                  </button>
                )}
              </div>}
              {(visibleBoards.length === 1 || !view.collapsed.includes(b.id)) &&
                b.cols.map((c) => (
                  <Fragment key={c.id}>
                    {c.cards
                      .filter(
                        (card) =>
                          (card.startDate || card.deadline) &&
                          matches(card) &&
                          (view.completed || !c.isCompleted),
                      )
                      .map((card) => {
                        const owner = people.find((person) => card.ownerIds.includes(person.id));
                        const ownerNames = people.filter((person) => card.ownerIds.includes(person.id)).map((person) => person.name).join(", ");
                        const preview = drag?.id === card.id ? drag : null,
                          start = preview
                            ? dayKey(preview.start)
                            : card.startDate,
                          end = preview ? dayKey(preview.end) : card.deadline,
                          range = barRange(start, end, first, view.days),
                          overdue =
                            !c.isCompleted &&
                            !!card.deadline &&
                            card.deadline < localToday(),
                          links =
                            snapshot?.dependencies.filter(
                              (d) => d.successor === card.id,
                            ) ?? [];
                        return (
                          <div
                            className={`gantt-row${c.isCompleted ? " completed" : ""}${selected === card.id ? " selected" : ""}`}
                            key={card.id}
                          >
                            <button
                              className="gantt-task-label"
                              onClick={() => {
                                setSelected(card.id);
                                onOpen(card);
                              }}
                            >
                              <i className="gantt-task-dot" style={{ background: c.color }} />
                              <span className="gantt-task-copy">
                                <strong>{card.title}</strong>
                                <small>{overdue ? "Overdue" : card.kind || "Task"}{links.length ? ` · ${links.length} links` : ""}</small>
                              </span>
                              {owner && <span className="planning-avatar" style={{ background: owner.color }} title={ownerNames}>{owner.initials}</span>}
                            </button>
                            <div
                              className="gantt-track"
                              style={{
                                backgroundSize: `${dayWidth * 7}px 100%`,
                                backgroundPosition: `${((6 - new Date(first * 86400000).getUTCDay() + 7) % 7) * dayWidth}px 0`,
                              }}
                            >
                              {dayNumber(localToday()) >= first &&
                                dayNumber(localToday()) <
                                  first + view.days && (
                                  <div
                                    className="gantt-today-line"
                                    style={{
                                      left:
                                        (dayNumber(localToday()) - first) *
                                        dayWidth,
                                    }}
                                  />
                                )}
                              {range ? (
                                <div
                                  className={`gantt-bar${preview ? " dragging" : ""}`}
                                  style={
                                    {
                                      left: `${range.left}%`,
                                      width: `${range.width}%`,
                                      "--bar-color": c.color,
                                    } as CSSProperties
                                  }
                                >
                                  <button
                                    className="gantt-bar-body"
                                    onPointerDown={(e) =>
                                      begin(e, card, "move")
                                    }
                                    title={`${card.title}: ${start} → ${end}${links.length ? " · Depends on " + links.map((d) => cardMap.get(d.predecessor)?.card.title).join(", ") : ""}`}
                                    onClick={() => {
                                      if (!suppressClick.current) {
                                        setSelected(card.id);
                                        onOpen(card);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (
                                        canEdit &&
                                        ["ArrowLeft", "ArrowRight"].includes(
                                          e.key,
                                        )
                                      ) {
                                        e.preventDefault();
                                        const delta =
                                            e.key === "ArrowLeft" ? -1 : 1,
                                          s = dayNumber(
                                            card.startDate || card.deadline!,
                                          ),
                                          t = dayNumber(
                                            card.deadline || card.startDate!,
                                          );
                                        void schedule(
                                          card,
                                          e.shiftKey ? s : s + delta,
                                          e.shiftKey
                                            ? Math.max(s, t + delta)
                                            : t + delta,
                                        );
                                      }
                                    }}
                                  >
                                    <span className="gantt-bar-copy">
                                      <small><i />{card.kind || "Task"}</small>
                                      <strong>{card.title}</strong>
                                    </span>
                                    {owner && <span className="planning-avatar" style={{ background: owner.color }} title={ownerNames}>{owner.initials}</span>}
                                  </button>
                                  {canEdit && (
                                    <>
                                      <button
                                        className="gantt-resize start"
                                        aria-label={`Resize start of ${card.title}`}
                                        onPointerDown={(e) =>
                                          begin(e, card, "start")
                                        }
                                      />
                                      <button
                                        className="gantt-resize end"
                                        aria-label={`Resize end of ${card.title}`}
                                        onPointerDown={(e) =>
                                          begin(e, card, "end")
                                        }
                                      />
                                    </>
                                  )}
                                </div>
                              ) : (
                                <button
                                  className="gantt-outside"
                                  onClick={() =>
                                    setFirst(
                                      dayNumber(
                                        card.startDate || card.deadline!,
                                      ) - 3,
                                    )
                                  }
                                >
                                  Show task →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </Fragment>
                ))}
            </Fragment>
          ))}
          {!cards.length && (
            <p className="gantt-empty">
              No tasks yet. Add cards to a board to start planning.
            </p>
          )}
          {!!cards.length && !rowY.size && (
            <p className="gantt-empty">
              No scheduled tasks are visible. Expand a board, adjust filters, or
              schedule a task below.
            </p>
          )}
        </div>
      </div>
      <section className="gantt-tray">
        <button onClick={() => setTray(!tray)} aria-expanded={tray}>
          {tray ? "▾" : "▸"} Unscheduled <small>{unscheduled.length}</small>
        </button>
        {tray && (
          <div>
            {unscheduled.map((t) => (
              <button
                key={t.card.id}
                onPointerDown={(e) => begin(e, t.card, "new")}
                onClick={() => {
                  if (!suppressClick.current) onOpen(t.card);
                }}
                title="Drag onto a day, or click to set dates"
              >
                <strong>{t.card.title}</strong>
                <small>
                  {t.board.name}
                </small>
              </button>
            ))}
            {!unscheduled.length && (
              <span>No unscheduled tasks in this view.</span>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
