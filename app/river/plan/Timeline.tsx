"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useRiver } from "../RiverShell";
import { loadPhases, mutatePhases, type Phase, type PhaseSnapshot } from "@/lib/phaseRepo";
import { loadBoards, type Board } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { listMilestones } from "@/lib/planningRepo";
import type { Milestone } from "@/lib/planning";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendarEventsRepo";
import { expandOccurrences } from "@/lib/calendarRecurrence";
import { dayKey, dayNumber, localToday, weekday } from "@/lib/gantt";
import styles from "./timeline.module.css";
import plan from "./plan.module.css";

/* ---------------------------------------------------------------------------
 * The Gantt, two ways round. Horizontal (default): each board is a row (⌄ adds
 * its categories as rows), weeks and days run along the top, and every bar
 * says when it's due just past its end. Vertical: time runs down, each board
 * is a column. Either way, drag a bar to move it, drag its ends to change the
 * start or due date.
 * ------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GW_WIDE = 164, GW_PHONE = 92; // date column (phones drop the event names)
const sd = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmt = (n: number) => `${WD[weekday(n)]} ${sd(n)}`;
const rng = (a: number, b: number) => {
  const x = new Date(a * 86400000), y = new Date(b * 86400000);
  return x.getUTCMonth() === y.getUTCMonth() ? `${x.getUTCDate()}–${sd(b)}` : `${sd(a)} – ${sd(b)}`;
};
const isoWeekOf = (n: number) => {
  const th = n - weekday(n) + 3, y = new Date(th * 86400000).getUTCFullYear();
  return Math.floor((th - dayNumber(`${y}-01-01`)) / 7) + 1;
};

/** The timeline's view settings, remembered per workspace in this browser. */
interface Prefs { dir: "h" | "v"; dense: boolean; open: string[]; hidden: string[]; deps: boolean; meet: boolean }
const prefsKey = (ws: string) => `foundry-river-timeline:${ws}`;
function readPrefs(ws: string): Partial<Prefs> {
  try {
    const v = JSON.parse(localStorage.getItem(prefsKey(ws)) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {}; // storage blocked or garbled — defaults
  }
}
const LW_WIDE = 268, LW_PHONE = 132; // board-name column (horizontal)
const HEAD_H = 62; // week + day header (horizontal)

interface Item {
  phase: Phase;
  key: string;
  cat: boolean;
  s: number | null;
  e: number | null;
  color: string;
}
interface Row extends Item {
  y: number;
  h: number;
}
interface Col {
  phase: Phase;
  key: string;
  cat: boolean;
  s: number | null;
  e: number | null;
  color: string;
  x: number;
  w: number;
}
interface Drag { id: string; mode: "move" | "start" | "end"; p0: number; s0: number; e0: number; s: number; e: number; moved: boolean }

export default function Timeline({ switcher }: { switcher: ReactNode }) {
  const router = useRouter();
  const { session } = useRiver();
  const ws = session.workspaceId;
  const canEdit = session.role !== "viewer";
  const today = dayNumber(localToday());

  const [snap, setSnap] = useState<PhaseSnapshot | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dense, setDense] = useState(true);
  const [showDeps, setShowDeps] = useState(false);
  const [showMeet, setShowMeet] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(700);
  const [fitH, setFitH] = useState<number | null>(null);
  const [dir, setDirState] = useState<"h" | "v">("h");
  // Phase ids (boards or categories) left out of the chart.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  // Which workspace's saved settings are applied; saving waits for it, so
  // defaults never overwrite what was saved.
  const [prefsFor, setPrefsFor] = useState<string | null>(null);
  const horiz = dir === "h";
  const wrap = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Restore the last view settings, then keep them saved.
  useEffect(() => {
    const p = readPrefs(ws);
    if (p.dir === "v" || p.dir === "h") setDirState(p.dir);
    if (typeof p.dense === "boolean") setDense(p.dense);
    if (Array.isArray(p.open)) setOpen(new Set(p.open));
    if (Array.isArray(p.hidden)) setHidden(new Set(p.hidden));
    if (typeof p.deps === "boolean") setShowDeps(p.deps);
    if (typeof p.meet === "boolean") setShowMeet(p.meet);
    setPrefsFor(ws);
  }, [ws]);
  useEffect(() => {
    if (prefsFor !== ws) return;
    const p: Prefs = { dir, dense, open: [...open], hidden: [...hidden], deps: showDeps, meet: showMeet };
    try { localStorage.setItem(prefsKey(ws), JSON.stringify(p)); } catch { /* storage blocked */ }
  }, [ws, prefsFor, dir, dense, open, hidden, showDeps, showMeet]);
  const setDir = (d: "h" | "v") => {
    setDirState(d);
    scrolled.current = false; // land on this week again in the new layout
  };
  // The Show menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => { if (!pickRef.current?.contains(e.target as Node)) setPicking(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [picking]);
  const toggleHidden = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 2600); };

  useEffect(() => {
    let cancelled = false;
    loadPhases(ws).then((s) => !cancelled && setSnap(s)).catch((e) => !cancelled && setError(e.message));
    loadBoards(ws).then((b) => !cancelled && setBoards(b)).catch(console.error);
    listMilestones(ws).then((m) => !cancelled && setMilestones(m)).catch(console.error);
    listCalendarEvents(ws).then((e) => !cancelled && setEvents(e)).catch(console.error);
    return () => { cancelled = true; };
  }, [ws]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const size = () => { setWidth(el.clientWidth); setHeight(el.clientHeight); };
    // The chart runs to the bottom of the window, however tall the header wraps.
    const fit = () => setFitH(Math.max(320, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 16));
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();
    fit();
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [snap, dir]);

  const phases = useMemo(() => (snap?.phases ?? []).filter((p) => p.active), [snap]);
  // Within the rest, what needs doing first: running now or overdue (soonest due first), then
  // finished, then not started yet (soonest start first), then undated.
  const byUrgency = useCallback((a: Phase, b: Phase) => {
    const rank = (p: Phase) => {
      if (!p.effective_start || !p.effective_end) return [3, 0];
      const st = dayNumber(p.effective_start), en = dayNumber(p.effective_end);
      const finished = en < today && p.total > 0 && p.completed >= p.total;
      if (st > today) return [2, st];
      if (finished) return [1, -en];
      return [0, en];
    };
    const [ga, ka] = rank(a), [gb, kb] = rank(b);
    return ga - gb || ka - kb;
  }, [today]);
  // The first board (the whole project, by board order) stays on top; the rest follow by urgency.
  const lead = boards[0]?.id;
  const allMains = useMemo(
    () => phases.filter((p) => !p.category_id).sort((a, b) => Number(b.board_id === lead) - Number(a.board_id === lead) || byUrgency(a, b)),
    [phases, byUrgency, lead],
  );
  const catsOf = useCallback((boardId: string) => phases.filter((p) => p.category_id && p.board_id === boardId).sort(byUrgency), [phases, byUrgency]);
  // What you chose to see (Show menu).
  const mains = useMemo(() => allMains.filter((p) => !hidden.has(p.id)), [allMains, hidden]);
  const hiddenCount = phases.filter((p) => hidden.has(p.id)).length;
  const colorFor = useCallback((p: Phase) => (boards.length ? boardColor({ id: p.board_id, color: p.color }, boards) : p.color), [boards]);

  // The range: from a week before the earliest start (or today) to two weeks past the latest end.
  const dated = phases.filter((p) => p.effective_start && p.effective_end);
  const minS = Math.min(today - 7, ...dated.map((p) => dayNumber(p.effective_start!)));
  const maxE = Math.max(today + 42, ...dated.map((p) => dayNumber(p.effective_end!) + 14));
  const FROM = minS - weekday(minS), TO = maxE;

  const DH = (n: number) => (dense ? (weekday(n) > 4 ? 6 : 18) : weekday(n) > 4 ? 12 : 38);
  const BAND = dense ? 26 : 46;
  const { Y, BANDY, TOTAL } = useMemo(() => {
    const Y: Record<number, number> = {}, BANDY: Record<number, number> = {};
    let y = 0;
    for (let n = FROM; n <= TO + 1; n++) {
      if (weekday(n) === 0 && n <= TO) { BANDY[n] = y; y += BAND; }
      Y[n] = y;
      if (n <= TO) y += DH(n);
    }
    return { Y, BANDY, TOTAL: Y[TO + 1] + 30 };
  }, [FROM, TO, dense]); // eslint-disable-line react-hooks/exhaustive-deps
  // Horizontal: weekdays wide, weekends narrow.
  const DW = (n: number) => (dense ? (weekday(n) > 4 ? 10 : 28) : weekday(n) > 4 ? 16 : 42);
  const { X, TW } = useMemo(() => {
    const X: Record<number, number> = {};
    let x = 0;
    for (let n = FROM; n <= TO + 1; n++) { X[n] = x; if (n <= TO) x += DW(n); }
    return { X, TW: x + 260 }; // room for the last "Due …" label
  }, [FROM, TO, dense]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayAt = (pos: number, at: Record<number, number>) => { let r = FROM; for (let n = FROM; n <= TO; n++) if (at[n] <= pos) r = n; return r; };

  const GW = width < 520 ? GW_PHONE : GW_WIDE;
  // Columns share the width; each block stays slim inside its column.
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    for (const m of mains) {
      const at = (p: Phase) => {
        const live = drag && drag.id === p.id && drag.moved ? { s: drag.s, e: drag.e } : null;
        return { s: live ? live.s : p.effective_start ? dayNumber(p.effective_start) : null, e: live ? live.e : p.effective_end ? dayNumber(p.effective_end) : null };
      };
      list.push({ phase: m, key: m.id, cat: false, color: colorFor(m), ...at(m) });
      if (open.has(m.board_id))
        for (const c of catsOf(m.board_id).filter((p) => !hidden.has(p.id))) list.push({ phase: c, key: c.id, cat: true, color: colorFor(m), ...at(c) });
    }
    return list;
  }, [mains, catsOf, hidden, open, colorFor, drag]);
  const cols: Col[] = useMemo(() => {
    const list = items;
    const weight = list.reduce((a, c) => a + (c.cat ? 0.95 : 1), 0) || 1;
    const unit = Math.max(width < 520 ? 124 : 150, (width - GW - 2) / weight);
    let x = 0;
    return list.map((c) => { const w = Math.floor(unit * (c.cat ? 0.95 : 1)); const col = { ...c, x, w }; x += w; return col; });
  }, [items, width, GW]);
  const W = cols.reduce((a, c) => a + c.w, 0);
  const barX = (c: Col) => c.x + 10;
  const barW = (c: Col) => Math.min(c.w - 20, c.cat ? 170 : 190);

  const LW = width < 520 ? LW_PHONE : LW_WIDE;
  const msDays = useMemo(
    () => milestones.filter((m) => m.dueDate && !m.completedAt).map((m) => ({ m, n: dayNumber(m.dueDate!) })).sort((a, b) => a.n - b.n),
    [milestones],
  );
  // Horizontal: milestones get their own row on top; names that would collide drop to a second line.
  const msLaid = useMemo(() => {
    const ends: number[] = [];
    return msDays.map((x) => {
      const left = X[x.n] + DW(x.n) / 2 - 6, right = left + 22 + x.m.name.length * 7;
      let lane = ends.findIndex((e) => e < left);
      if (lane < 0) { lane = ends.length; ends.push(right); } else ends[lane] = right;
      return { ...x, left, lane };
    });
  }, [msDays, X]); // eslint-disable-line react-hooks/exhaustive-deps
  const msLanes = msLaid.reduce((a, x) => Math.max(a, x.lane + 1), 0);
  const MS_H = msLanes ? msLanes * 22 + 14 : 0;
  const rows: Row[] = useMemo(() => {
    let y = MS_H;
    return items.map((it) => {
      const h = dense ? (it.cat ? 34 : 48) : it.cat ? 42 : 60;
      const r = { ...it, y, h };
      y += h;
      return r;
    });
  }, [items, dense, MS_H]);
  const rowsH = rows.reduce((a, r) => a + r.h, 0);
  const TH = Math.max(rowsH + 24, height - HEAD_H - 2);

  useEffect(() => {
    if (!snap || scrolled.current || !wrap.current) return;
    scrolled.current = true;
    const monday = today - weekday(today);
    if (horiz) { wrap.current.scrollTop = 0; wrap.current.scrollLeft = Math.max(0, X[Math.max(FROM, monday - 7)] ?? 0); }
    else { wrap.current.scrollLeft = 0; wrap.current.scrollTop = Math.max(0, (BANDY[monday] ?? 0) - 8); }
  }, [snap, BANDY, X, FROM, today, horiz, dir]);

  /* ---------- dragging ---------- */
  const onDown = (e: RPointerEvent, c: Item) => {
    if (!canEdit || c.s === null || c.e === null || e.button !== 0) return;
    const t = e.target as HTMLElement;
    const mode = t.dataset.edge === "start" ? "start" : t.dataset.edge === "end" ? "end" : "move";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: c.phase.id, mode, p0: horiz ? e.clientX : e.clientY, s0: c.s, e0: c.e, s: c.s, e: c.e, moved: false });
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag || !wrap.current) return;
    const pos = horiz ? e.clientX : e.clientY, at = horiz ? X : Y;
    if (!drag.moved && Math.abs(pos - drag.p0) < 4) return;
    const from = drag.mode === "end" ? at[drag.e0 + 1] - 1 : at[drag.s0];
    const d = dayAt(from + (pos - drag.p0), at) - (drag.mode === "end" ? drag.e0 : drag.s0);
    let s = drag.s0, en = drag.e0;
    if (drag.mode === "move") { s += d; en += d; } else if (drag.mode === "start") s = Math.min(drag.e0, drag.s0 + d); else en = Math.max(drag.s0, drag.e0 + d);
    const r = wrap.current.getBoundingClientRect();
    if (horiz) {
      if (e.clientX > r.right - 40) wrap.current.scrollLeft += 14;
      if (e.clientX < r.left + LW + 30) wrap.current.scrollLeft -= 14;
    } else {
      if (e.clientY > r.bottom - 40) wrap.current.scrollTop += 14;
      if (e.clientY < r.top + 110) wrap.current.scrollTop -= 14;
    }
    setDrag({ ...drag, s, e: en, moved: true });
  };
  const onUp = async (c: Item) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) return router.push(`/river/plan?view=board&board=${c.phase.board_id}${c.phase.category_id ? `&category=${c.phase.category_id}` : ""}`);
    if (!snap || (d.s === d.s0 && d.e === d.e0)) return;
    try {
      const res = await mutatePhases(ws, snap, { op: "dates", id: d.id, start: dayKey(d.s), end: dayKey(d.e) });
      setSnap(res.snapshot);
      say(`${c.cat ? `${c.phase.title} · ${c.phase.board_name}` : c.phase.board_name}: due ${fmt(d.e)}`);
    } catch (err) {
      say(err instanceof Error ? err.message : "Couldn't save the dates");
      loadPhases(ws).then(setSnap).catch(console.error);
    }
  };
  const addDates = async (c: Item) => {
    if (!snap || !canEdit) return;
    try {
      const res = await mutatePhases(ws, snap, { op: "dates", id: c.phase.id, start: dayKey(today), end: dayKey(today + 6) });
      setSnap(res.snapshot);
      say(`${c.phase.title} placed ${rng(today, today + 6)}. Drag it to adjust.`);
    } catch (err) {
      say(err instanceof Error ? err.message : "Couldn't set dates");
    }
  };

  /* ---------- derived pieces ---------- */
  const occ = useMemo(() => (showMeet ? expandOccurrences(events, dayKey(FROM), dayKey(TO)) : []), [events, FROM, TO, showMeet]);
  // Daily events would sit next to every date, so the date column leaves them out.
  const meetingOn = (n: number) => occ.find((o) => o.occurrence === dayKey(n) && o.series.repeat !== "day");
  const hot = hover ? items.find((c) => c.key === hover) : null;
  const toggleOpen = (boardId: string) => setOpen((o) => { const n = new Set(o); if (n.has(boardId)) n.delete(boardId); else n.add(boardId); return n; });
  const openBoard = (p: Phase) => router.push(`/river/plan?view=board&board=${p.board_id}${p.category_id ? `&category=${p.category_id}` : ""}`);
  const dueIn = (n: number) => (n === today ? "today" : n > today ? (n - today === 1 ? "tomorrow" : `in ${n - today} days`) : `${today - n} days ago`);

  const depPaths = () => {
    if (!showDeps || !snap) return null;
    if (horiz) {
      const row = (id: string) => rows.find((r) => r.phase.id === id && r.s !== null) ?? null;
      return snap.dependencies.filter((d) => !d.suspended).map((d) => {
        const p = row(d.predecessor), q = row(d.successor);
        if (!p || !q || p === q || p.e === null || q.s === null) return null;
        const x1 = X[p.e + 1], y1 = p.y + p.h / 2, x2 = X[q.s] - 3, y2 = q.y + q.h / 2, bad = q.s <= p.e;
        return <path key={d.id} className={bad ? styles.bad : undefined} markerEnd="url(#rv-ah)" d={`M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`} />;
      });
    }
    const at = (id: string) => cols.find((c) => c.phase.id === id && c.s !== null) ?? null;
    return snap.dependencies.filter((d) => !d.suspended).map((d) => {
      const p = at(d.predecessor), q = at(d.successor);
      if (!p || !q || p === q || p.e === null || q.s === null) return null;
      const x1 = barX(p) + barW(p) / 2, y1 = Y[p.e + 1], x2 = barX(q) + barW(q) / 2, y2 = Y[q.s] - 3, bad = q.s <= p.e;
      return <path key={d.id} className={bad ? styles.bad : undefined} markerEnd="url(#rv-ah)" d={`M${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`} />;
    });
  };

  const next = [...mains].filter((p) => p.effective_end && dayNumber(p.effective_end) >= today).sort((a, b) => a.effective_end!.localeCompare(b.effective_end!))[0];

  return (
    <>
      <header className={plan.head}>
        <h1><span>Plan</span>Timeline</h1>
        <p className={plan.sum}>
          {next ? (() => { const n = dayNumber(next.effective_end!) - today; return <>Next due: <b>{next.board_name}</b> on <b>{fmt(n + today)}</b>, {n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}.</>; })() : "Give a board dates to see it here."}
        </p>
        <div className={plan.sp} />
        <div className={plan.ctrls}>
          {switcher}
          <span className={plan.seg} aria-label="Direction">
            <button className={horiz ? plan.segOn : undefined} onClick={() => setDir("h")} aria-pressed={horiz}>→ Across</button>
            <button className={!horiz ? plan.segOn : undefined} onClick={() => setDir("v")} aria-pressed={!horiz}>↓ Down</button>
          </span>
          <div className={styles.pick} ref={pickRef}>
            <button className={`${styles.pickBtn} ${hiddenCount ? styles.pickBtnOn : ""}`} onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-haspopup="true">
              Show{hiddenCount ? ` · ${hiddenCount} hidden` : ""} <span aria-hidden="true">⌄</span>
            </button>
            {picking && (
              <div className={styles.pickMenu} role="group" aria-label="Boards to show">
                <div className={styles.pickHead}>
                  <b>Show on the timeline</b>
                  {hiddenCount > 0 && <button onClick={() => setHidden(new Set())}>Show all</button>}
                </div>
                <div className={styles.pickList}>
                  {allMains.map((m) => {
                    const off = hidden.has(m.id);
                    return (
                      <div key={m.id} className={styles.pickGroup}>
                        <label className={styles.pickRow} style={{ ["--c" as string]: colorFor(m) }}>
                          <input type="checkbox" checked={!off} onChange={() => toggleHidden(m.id)} />
                          <i className={styles.sq} />
                          <span>{m.board_name}</span>
                          <em>{m.effective_end ? sd(dayNumber(m.effective_end)) : "No dates"}</em>
                        </label>
                        {!off && catsOf(m.board_id).map((c) => (
                          <label key={c.id} className={`${styles.pickRow} ${styles.pickCat}`}>
                            <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggleHidden(c.id)} />
                            <span>{c.title}</span>
                            <em>{c.effective_end ? sd(dayNumber(c.effective_end)) : "No dates"}</em>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <p className={styles.pickFoot}>Saved in this browser — it stays like this next time.</p>
              </div>
            )}
          </div>
          <button className={`${plan.sw} ${showDeps ? plan.swOn : ""}`} onClick={() => setShowDeps((v) => !v)}><i />Dependencies</button>
          {!horiz && <button className={`${plan.sw} ${showMeet ? plan.swOn : ""}`} onClick={() => setShowMeet((v) => !v)}><i />Meetings</button>}
          <span className={plan.seg}>
            <button className={dense ? plan.segOn : undefined} onClick={() => setDense(true)}>Compact</button>
            <button className={!dense ? plan.segOn : undefined} onClick={() => setDense(false)}>Roomy</button>
          </span>
          <span className={plan.seg}>
            <button onClick={() => setOpen(open.size === mains.length ? new Set() : new Set(mains.map((m) => m.board_id)))}>{open.size === mains.length && mains.length ? "Collapse all" : "Expand all"}</button>
          </span>
        </div>
      </header>

      {error && <p className={plan.error}>{error}</p>}
      {!snap && !error && <p className={plan.muted}>Loading the timeline…</p>}
      {snap && allMains.length === 0 && <p className={plan.muted}>No boards yet. Create one on the Board view.</p>}
      {snap && allMains.length > 0 && mains.length === 0 && (
        <p className={plan.muted}>Every board is hidden. <button className={styles.linkBtn} onClick={() => setHidden(new Set())}>Show all</button></p>
      )}

      {snap && mains.length > 0 && horiz && (
        <div ref={wrap} className={`${styles.wrap} ${styles.hz} ${dense ? styles.dense : ""} ${LW === LW_PHONE ? styles.narrow : ""}`} style={{ ["--lw" as string]: `${LW}px`, ["--hh" as string]: `${HEAD_H}px`, height: fitH ?? undefined }}>
          <div style={{ width: LW + TW }}>
            {/* weeks and days along the top */}
            <div className={styles.hHead} style={{ width: LW + TW }}>
              <div className={styles.hCorner}>Boards</div>
              <div className={styles.hScale} style={{ width: TW }}>
                {Object.keys(BANDY).map((k) => {
                  const n = +k, cur = n === today - weekday(today), end = Math.min(n + 7, TO + 1);
                  return (
                    <div key={k} className={`${styles.hWeek} ${cur ? styles.hWeekCur : ""} ${n < today - weekday(today) ? styles.hWeekPast : ""}`} style={{ left: X[n], width: X[end] - X[n] }}>
                      <b>Week {isoWeekOf(n)}</b>
                      <span>{rng(n, n + 6)}</span>
                    </div>
                  );
                })}
                {Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i).map((n) => {
                  const we = weekday(n) > 4, ms = msDays.find((x) => x.n === n);
                  return (
                    <div key={n} className={`${styles.hDay} ${we ? styles.we : ""} ${n === today ? styles.today : ""} ${hot && hot.e === n ? styles.hot : ""}`} style={{ left: X[n], width: DW(n), ["--c" as string]: hot?.color }}
                      title={we ? undefined : [fmt(n), ms && `◆ ${ms.m.name}`].filter(Boolean).join(" · ")}>
                      {!we && <b>{new Date(n * 86400000).getUTCDate()}</b>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.body}>
              {/* board names down the side */}
              <div className={styles.hLabels} style={{ height: TH }}>
                {MS_H > 0 && <div className={styles.hMsLab} style={{ height: MS_H }}>◆ Milestones</div>}
                {rows.map((r) => {
                  const hasCats = !r.cat && catsOf(r.phase.board_id).some((p) => !hidden.has(p.id));
                  return (
                    <div key={r.key} className={`${styles.hLab} ${r.cat ? styles.hLabCat : ""} ${hover === r.key ? styles.hLabHot : ""}`} style={{ top: r.y, height: r.h, ["--c" as string]: r.color }}
                      onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                      <div className={styles.hn}>
                        {r.cat ? <span className={styles.arr}>↳</span> : <i className={styles.sq} />}
                        <button className={styles.nm} onClick={() => openBoard(r.phase)}>{r.cat ? r.phase.title : r.phase.board_name}</button>
                        <span className={`${styles.hLabDue} ${r.e !== null && r.e < today ? styles.hLabPast : ""}`}>{r.e !== null ? sd(r.e) : "—"}</span>
                        {hasCats && (
                          <button className={`${styles.chev} ${open.has(r.phase.board_id) ? styles.chevOn : ""}`} aria-expanded={open.has(r.phase.board_id)} aria-label={`${open.has(r.phase.board_id) ? "Hide" : "Show"} categories`} onClick={() => toggleOpen(r.phase.board_id)}>⌄</button>
                        )}
                      </div>
                      {!r.cat && (
                        <div className={styles.hLabSub}>
                          <span>{r.phase.total ? `${r.phase.completed}/${r.phase.total} done` : "No tasks"}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={styles.track} style={{ width: TW, height: TH }}>
                {Object.keys(BANDY).map((k) => <div key={k} className={styles.hWk} style={{ left: X[+k] }} />)}
                {MS_H > 0 && <div className={styles.hMsRow} style={{ height: MS_H }} />}
                {msLaid.map(({ m, n, left, lane }) => (
                  <button key={m.id} className={`${styles.hMsTag} ${n < today ? styles.hMsPast : ""}`} style={{ left, top: 8 + lane * 22 }} title={`${m.name} · ${fmt(n)}`} onClick={() => router.push(`/milestones#m-${m.id}`)}>
                    <i />{m.name}
                  </button>
                ))}
                {rows.map((r) => {
                  if (r.s === null || r.e === null)
                    return (
                      <button key={r.key} className={styles.unsched} style={{ left: X[today] + 8, top: r.y + r.h / 2 - 12, ["--c" as string]: r.color }} onClick={() => addDates(r)} disabled={!canEdit}>
                        No dates · add
                      </button>
                    );
                  const left = X[Math.max(FROM, r.s)], w = X[Math.min(TO, r.e) + 1] - left;
                  const dragging = drag?.id === r.phase.id && drag.moved;
                  const name = r.cat ? r.phase.title : r.phase.board_name;
                  // Name and dates inside when they fit; otherwise the name goes out by the due date.
                  const roomy = w >= name.length * (r.cat ? 7 : 8) + 110;
                  return (
                    <div key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                      <div className={`${styles.hBar} ${r.cat ? styles.hBarCat : ""} ${dragging ? styles.dragging : ""}`}
                        style={{ left, width: w, top: r.y + (r.cat ? 5 : 7), height: r.h - (r.cat ? 10 : 14), ["--c" as string]: r.color }}
                        onPointerDown={(e) => onDown(e, r)} onPointerMove={onMove} onPointerUp={() => onUp(r)} onPointerCancel={() => setDrag(null)}
                        title={`${r.cat ? `${r.phase.board_name} / ${r.phase.title}` : r.phase.board_name}: ${fmt(r.s)} – ${fmt(r.e)}`}>
                        {r.s < today && <span className={styles.hPast} style={{ width: Math.min(w, X[Math.min(today, TO + 1)] - left) }} />}
                        {roomy && (
                          <div className={styles.hin}>
                            <b>{name}</b>
                            <span>{rng(r.s, r.e)}</span>
                          </div>
                        )}
                        {canEdit && <><span className={styles.edgeL} data-edge="start" /><span className={styles.edgeR} data-edge="end" /></>}
                      </div>
                      <div className={styles.hDue} style={{ left: left + w + 10, top: r.y, height: r.h, ["--c" as string]: r.color }}>
                        {!roomy && <em>{name}</em>}
                        <b>Due {r.cat ? sd(r.e) : fmt(r.e)}</b>
                        {!r.cat && <span>{dueIn(r.e)}</span>}
                      </div>
                    </div>
                  );
                })}
                {today >= FROM && today <= TO && <div className={styles.hNow} style={{ left: X[today] + DW(today) * 0.5 }} />}
                <svg className={styles.deps} width={TW} height={TH}>
                  <defs><marker id="rv-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
                  {depPaths()}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {snap && mains.length > 0 && !horiz && (
        <div ref={wrap} className={`${styles.wrap} ${dense ? styles.dense : ""} ${GW === GW_PHONE ? styles.narrow : ""}`} style={{ ["--lw" as string]: `${GW}px` }}>
          <div style={{ width: GW + W }}>
            <div className={styles.head} style={{ width: GW + W }}>
              <div className={styles.corner}>Date</div>
              {cols.map((c) => {
                const pct = c.phase.total ? (c.phase.completed / c.phase.total) * 100 : 0;
                const hasCats = !c.cat && catsOf(c.phase.board_id).some((p) => !hidden.has(p.id));
                return (
                  <div key={c.key} className={`${styles.hcell} ${c.cat ? styles.hcat : ""}`} style={{ width: c.w, ["--c" as string]: c.color }} onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}>
                    <div className={styles.hn}>
                      {c.cat ? <span className={styles.arr}>↳</span> : <i className={styles.sq} />}
                      <button className={styles.nm} onClick={() => router.push(`/river/plan?view=board&board=${c.phase.board_id}${c.phase.category_id ? `&category=${c.phase.category_id}` : ""}`)}>{c.cat ? c.phase.title : c.phase.board_name}</button>
                      {!c.cat && hasCats && (
                        <button className={`${styles.chev} ${open.has(c.phase.board_id) ? styles.chevOn : ""}`} aria-expanded={open.has(c.phase.board_id)} aria-label={`${open.has(c.phase.board_id) ? "Hide" : "Show"} categories`}
                          onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(c.phase.board_id)) n.delete(c.phase.board_id); else n.add(c.phase.board_id); return n; })}>⌄</button>
                      )}
                    </div>
                    <div className={styles.hs}>{c.phase.total ? `${c.phase.completed}/${c.phase.total} done` : "No tasks"}</div>
                    <div className={styles.hp}><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>

            <div className={styles.body} style={{ height: TOTAL }}>
              <div className={styles.gut} style={{ height: TOTAL }}>
                {Object.entries(BANDY).map(([k, y]) => {
                  const n = +k, cur = n === today - weekday(today);
                  return (
                    <div key={k} className={`${styles.band} ${cur ? styles.bandCur : ""} ${n < today - weekday(today) ? styles.bandPast : ""}`} style={{ top: y, height: BAND }}>
                      <b>Week {isoWeekOf(n)}</b>
                      <span>{rng(n, n + 6)}</span>
                    </div>
                  );
                })}
                {Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i).map((n) => {
                  const we = weekday(n) > 4, d = new Date(n * 86400000), ms = msDays.find((x) => x.n === n), mt = meetingOn(n);
                  return (
                    <div key={n} className={`${styles.day} ${we ? styles.we : ""} ${n === today ? styles.today : ""} ${hot && hot.e === n ? styles.hot : ""}`} style={{ top: Y[n], height: DH(n), ["--c" as string]: hot?.color }}>
                      <span className={styles.dn}>{we ? "" : `${WD[weekday(n)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`}</span>
                      {!we && ms ? <span className={styles.gms}>◆ {ms.m.name}</span> : !we && mt ? <span className={styles.gev}>● {mt.title}</span> : null}
                    </div>
                  );
                })}
              </div>

              <div className={styles.track} style={{ width: W, height: TOTAL }}>
                {Object.entries(BANDY).map(([k, y]) => <div key={k} className={`${styles.tband} ${+k === today - weekday(today) ? styles.tbandCur : ""}`} style={{ top: y, height: BAND }} />)}
                {cols.map((c) => (
                  <div key={c.key} className={styles.col} style={{ left: c.x, width: c.w, height: TOTAL }} />
                ))}
                {cols.map((c) => {
                  if (c.s === null || c.e === null)
                    return (
                      <button key={c.key} className={styles.unsched} style={{ left: c.x + 12, top: Y[today] + 8, ["--c" as string]: c.color }} onClick={() => addDates(c)} disabled={!canEdit}>
                        No dates · add
                      </button>
                    );
                  const top = Y[Math.max(FROM, c.s)], bot = Y[Math.min(TO, c.e) + 1], h = bot - top;
                  const dragging = drag?.id === c.phase.id && drag.moved;
                  return (
                    <div key={c.key} className={`${styles.bar} ${c.cat ? styles.barCat : ""} ${h < (dense ? 70 : 96) ? styles.short : ""} ${h < (dense ? 46 : 60) ? styles.tiny : ""} ${dragging ? styles.dragging : ""}`}
                      style={{ left: barX(c), width: barW(c), top, height: h, ["--c" as string]: c.color }}
                      onPointerDown={(e) => onDown(e, c)} onPointerMove={onMove} onPointerUp={() => onUp(c)} onPointerCancel={() => setDrag(null)}
                      onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}
                      title={`${c.cat ? `${c.phase.board_name} / ${c.phase.title}` : c.phase.board_name}: ${fmt(c.s)} – ${fmt(c.e)}`}>
                      {c.s < today && <span className={styles.vPast} style={{ height: Math.min(h, Y[Math.min(today, TO + 1)] - top) }} />}
                      <div className={styles.vin}>
                        <b>{c.cat ? c.phase.title : c.phase.board_name}</b>
                        <span>{rng(c.s, c.e)}</span>
                      </div>
                      <div className={styles.vdue}>
                        <b>Due {c.cat ? sd(c.e) : fmt(c.e)}</b>
                        {!c.cat && <span>{c.e === today ? "today" : c.e > today ? `in ${c.e - today} days` : `${today - c.e} days ago`}</span>}
                      </div>
                      {canEdit && <><span className={styles.edgeT} data-edge="start" /><span className={styles.edgeB} data-edge="end" /></>}
                    </div>
                  );
                })}
                {msDays.map(({ m, n }) => (
                  <div key={m.id} className={styles.ms} style={{ top: Y[n + 1] }}><span>◆ {m.name}</span></div>
                ))}
                {today >= FROM && today <= TO && <div className={styles.nowl} style={{ top: Y[today] + DH(today) * 0.55 }} />}
                {hot && hot.e !== null && (() => { const c = cols.find((x) => x.key === hot.key); return c ? <div className={styles.guide} style={{ top: Y[hot.e + 1], width: barX(c), ["--c" as string]: hot.color }} /> : null; })()}
                <svg className={styles.deps} width={W} height={TOTAL}>
                  <defs><marker id="rv-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
                  {depPaths()}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
      {drag?.moved && <div className={plan.tip}>{fmt(drag.s)} → due {fmt(drag.e)}</div>}
      {toast && <div className={plan.toast} role="status">{toast}</div>}
    </>
  );
}
