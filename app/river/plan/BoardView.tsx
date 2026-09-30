"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRiver } from "../RiverShell";
import { createCard, listCategories, loadBoards, moveCard, setCardOwner, setCardPriority, type Board, type BoardCard, type BoardCategory, type BoardColumn } from "@/lib/boardRepo";
import { boardColor } from "@/lib/boardColors";
import { listMembers, listPageTargets, type ProfileInfo } from "@/lib/docsRepo";
import { loadPhases, type Phase } from "@/lib/phaseRepo";
import { dayNumber, localToday, weekday } from "@/lib/gantt";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { useFollowedView, useShareView } from "@/lib/followView";
import { saveCard } from "./taskApi";
import TaskPanel from "./TaskPanel";
import styles from "./board.module.css";
import plan from "./plan.module.css";

/* ---------------------------------------------------------------------------
 * The board (new design): boards as chips instead of a sidebar, stages as
 * columns, optional rows by category or person, drop anywhere in a column,
 * one-line adding, and the task in a side panel. Only top-level tasks are
 * cards; their subtasks show as steps in the panel.
 * ------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const sdIso = (iso: string) => { const n = dayNumber(iso), d = new Date(n * 86400000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmtIso = (iso: string) => `${WD[weekday(dayNumber(iso))]} ${sdIso(iso)}`;
const PRI: Record<string, [string, string]> = { high: ["High", "#d93a1f"], medium: ["Medium", "#c98a00"], low: ["Low", "#8a8a8a"] };

type Stage = "todo" | "doing" | "done";
interface Item { board: Board; col: BoardColumn; colIndex: number; card: BoardCard }
interface Lane { key: string; label: string; sub?: string; color?: string; avatar?: ProfileInfo; match: (i: Item) => boolean }
interface ColDef { key: string; label: string; color: string; done: boolean; forItem: (i: Item) => boolean; target: (b: Board) => BoardColumn | undefined }

const stageOf = (b: Board, colIndex: number): Stage => (b.cols[colIndex]?.isCompleted ? "done" : colIndex === 0 ? "todo" : "doing");

export default function BoardView({ switcher, initialBoard, initialCard, initialCategory }: { switcher: ReactNode; initialBoard: string | null; initialCard: string | null; initialCategory: string | null }) {
  const router = useRouter();
  const { session, setPlace } = useRiver();
  const ws = session.workspaceId;
  const canEdit = session.role !== "viewer";

  const [boards, setBoards] = useState<Board[] | null>(null);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [pages, setPages] = useState<{ id: string; title: string }[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selected, setSelected] = useState<string>(initialBoard ?? "all");
  const [rows, setRows] = useState<"none" | "category" | "person">(initialCategory ? "category" : "none");
  const [onlyMine, setOnlyMine] = useState(false);
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [openCard, setOpenCard] = useState<string | null>(initialCard);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 2400); };

  const reload = useCallback(async () => {
    const b = await loadBoards(ws);
    setBoards(b);
  }, [ws]);

  useEffect(() => {
    let cancelled = false;
    reload().catch((e) => !cancelled && setError(e.message));
    listCategories(ws).then((c) => !cancelled && setCategories(c)).catch(console.error);
    listMembers(ws).then((m) => !cancelled && setMembers(m)).catch(console.error);
    listPageTargets(ws).then((p) => !cancelled && setPages(p)).catch(console.error);
    loadPhases(ws).then((s) => !cancelled && setPhases(s.phases)).catch(console.error);
    return () => { cancelled = true; };
  }, [ws, reload]);
  useSidebarLiveUpdates(ws, ["board_cards", "board_columns"], reload);

  // Keep the URL in step so a board or task can be linked.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "board");
    if (selected === "all") url.searchParams.delete("board"); else url.searchParams.set("board", selected);
    if (openCard) url.searchParams.set("card", openCard); else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, [selected, openCard]);

  const color = (b: Board) => (boards ? boardColor(b, boards) : b.color);
  const board = selected === "all" ? null : boards?.find((b) => b.id === selected) ?? null;
  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name;
  const mainPhase = (boardId: string) => phases.find((p) => p.board_id === boardId && !p.category_id);
  const catPhase = (boardId: string, catId: string) => phases.find((p) => p.board_id === boardId && p.category_id === catId);

  const items: Item[] = useMemo(() => {
    if (!boards) return [];
    const q = query.trim().toLowerCase();
    return (board ? [board] : boards).flatMap((b) =>
      b.cols.flatMap((col, colIndex) =>
        col.cards
          .filter((card) => !card.parentId)
          .filter((card) => !onlyMine || card.ownerIds.includes(session.userId))
          .filter((card) => !q || `${card.title} ${card.kind} ${catName(card.categoryId) ?? ""}`.toLowerCase().includes(q))
          .map((card) => ({ board: b, col, colIndex, card })),
      ),
    );
  }, [boards, board, onlyMine, query, session.userId, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtaskStats = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const b of boards ?? []) for (const c of b.cols) for (const k of c.cards) {
      if (!k.parentId) continue;
      const s = m.get(k.parentId) ?? { done: 0, total: 0 };
      s.total++;
      if (c.isCompleted) s.done++;
      m.set(k.parentId, s);
    }
    return m;
  }, [boards]);

  // Columns: a board's own stages, or To do / In progress / Done across all boards.
  const columns: ColDef[] = board
    ? board.cols.map((c) => ({ key: c.id, label: c.name, color: c.color, done: !!c.isCompleted, forItem: (i) => i.col.id === c.id, target: (b) => (b.id === board.id ? c : undefined) }))
    : [
        { key: "todo", label: "To do", color: "#8a8a8a", done: false, forItem: (i) => stageOf(i.board, i.colIndex) === "todo", target: (b) => b.cols[0] },
        { key: "doing", label: "In progress", color: "#171717", done: false, forItem: (i) => stageOf(i.board, i.colIndex) === "doing", target: (b) => b.cols.find((c, k) => k > 0 && !c.isCompleted) ?? b.cols[0] },
        { key: "done", label: "Done", color: "#3f8f5a", done: true, forItem: (i) => stageOf(i.board, i.colIndex) === "done", target: (b) => b.cols.find((c) => c.isCompleted) },
      ];

  const lanes: Lane[] = useMemo(() => {
    if (rows === "none") return [{ key: "all", label: "", match: () => true }];
    if (rows === "person")
      return [
        ...members.map((m) => ({ key: `p:${m.id}`, label: m.name, avatar: m, match: (i: Item) => i.card.ownerIds.includes(m.id) })),
        { key: "p:", label: "Unassigned", match: (i: Item) => i.card.ownerIds.length === 0 },
      ];
    if (!board)
      return (boards ?? []).map((b) => {
        const p = mainPhase(b.id);
        return { key: `b:${b.id}`, label: b.name, color: color(b), sub: p?.effective_end ? `${p.effective_start ? `${sdIso(p.effective_start)} – ` : ""}due ${fmtIso(p.effective_end)}` : undefined, match: (i: Item) => i.board.id === b.id };
      });
    const used = categories.filter((c) => board.cols.some((col) => col.cards.some((k) => k.categoryId === c.id)) || catPhase(board.id, c.id));
    return [
      ...used.map((c) => {
        const p = catPhase(board.id, c.id);
        return { key: `c:${c.id}`, label: c.name, color: color(board), sub: p?.effective_end ? `${p.effective_start ? `${sdIso(p.effective_start)} – ` : ""}due ${fmtIso(p.effective_end)}` : "no dates yet", match: (i: Item) => i.card.categoryId === c.id };
      }),
      { key: "c:", label: "No category", match: (i: Item) => !i.card.categoryId },
    ];
  }, [rows, members, board, boards, categories, phases]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- moving ---------- */
  const moveItem = async (it: Item, col: ColDef, lane: Lane, fromLane: string | null) => {
    if (!canEdit) return;
    const target = col.target(it.board);
    const laneBoard = lane.key.startsWith("b:") ? boards?.find((b) => b.id === lane.key.slice(2)) : null;
    try {
      if (laneBoard && laneBoard.id !== it.board.id) {
        const dest = col.target(laneBoard) ?? laneBoard.cols[0];
        await saveCard(ws, it.card, dest.id, { column_id: dest.id, category_id: null });
        say(`Moved to ${laneBoard.name}`);
      } else {
        if (target && target.id !== it.col.id) {
          await moveCard(it.card.id, target.id, [...target.cards.map((c) => c.id).filter((id) => id !== it.card.id), it.card.id]);
          say(`Moved to ${target.name}`);
        }
        if (lane.key.startsWith("c:")) {
          const cat = lane.key.slice(2) || null;
          if (cat !== (it.card.categoryId ?? null)) await saveCard(ws, it.card, target?.id ?? it.col.id, { category_id: cat, kind: catName(cat) ?? it.card.kind });
        }
        if (lane.key.startsWith("p:")) {
          const person = lane.key.slice(2);
          if (person && !it.card.ownerIds.includes(person)) await setCardOwner(it.card.id, person, true);
          if (fromLane?.startsWith("p:") && fromLane.slice(2) && fromLane !== lane.key) await setCardOwner(it.card.id, fromLane.slice(2), false);
        }
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't move the task");
    }
    await reload();
  };

  const onDragStart = (e: DragEvent, it: Item, laneKey: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ card: it.card.id, lane: laneKey }));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, col: ColDef, lane: Lane) => {
    e.preventDefault();
    setOver(null);
    try {
      const { card, lane: from } = JSON.parse(e.dataTransfer.getData("text/plain")) as { card: string; lane: string };
      const it = items.find((i) => i.card.id === card);
      if (it) void moveItem(it, col, lane, from);
    } catch {
      /* not a card */
    }
  };

  /* ---------- adding ---------- */
  const addTask = async (col: ColDef, lane: Lane) => {
    const v = draft.trim();
    if (!v || !boards) return;
    const laneBoard = lane.key.startsWith("b:") ? boards.find((b) => b.id === lane.key.slice(2)) : null;
    const b = board ?? laneBoard ?? boards[0];
    const target = col.target(b) ?? b.cols[0];
    if (!target) return say(`${b.name} has no stages yet`);
    const who = v.match(/@(\S+)/)?.[1]?.toLowerCase();
    const tag = v.match(/#(\S+)/)?.[1]?.toLowerCase();
    const pr = v.match(/!(high|med\w*|low)/i)?.[1]?.toLowerCase();
    const person = (who && members.find((m) => m.name.toLowerCase().startsWith(who))) || null;
    const cat = (tag && categories.find((c) => c.name.toLowerCase().startsWith(tag))) || (lane.key.startsWith("c:") && lane.key.length > 2 ? categories.find((c) => c.id === lane.key.slice(2)) : null) || null;
    const title = v.replace(/[@#!]\S+/g, "").replace(/\s+/g, " ").trim() || "Untitled";
    setDraft("");
    try {
      const card = await createCard(ws, target.id, title);
      const owner = person?.id ?? (lane.key.startsWith("p:") && lane.key.length > 2 ? lane.key.slice(2) : session.userId);
      await setCardOwner(card.id, owner, true);
      if (pr) await setCardPriority(card.id, pr.startsWith("med") ? "medium" : pr);
      if (cat) await saveCard(ws, { ...card, ownerIds: [owner], priority: pr ? (pr.startsWith("med") ? "medium" : pr) : null }, target.id, { category_id: cat.id, kind: cat.name });
      await reload();
      say(`Added to ${b.name}`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't add the task");
    }
  };

  const openItem = openCard ? (boards ?? []).flatMap((b) => b.cols.flatMap((col, colIndex) => col.cards.map((card) => ({ board: b, col, colIndex, card })))).find((i) => i.card.id === openCard) ?? null : null;

  // Where you are and what's open, as on the classic board: the board (or all
  // boards) is the place, an open task is the view followers open in place.
  const placeLabel = openItem ? `${openItem.card.title || "Untitled task"} · Task` : board ? `${board.name} · Board` : "All boards";
  const placePath = board ? `/board?board=${board.id}` : "/board";
  useEffect(() => setPlace({ path: placePath, label: placeLabel }), [setPlace, placePath, placeLabel]);
  useShareView("board-card", openCard ? { card: openCard } : null);

  // Following someone here: open and close the task they have open, on its board.
  const followedView = useFollowedView();
  const followCard = followedView === undefined ? undefined : followedView.card ?? null;
  const appliedFollowCard = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (followCard === undefined) { appliedFollowCard.current = undefined; return; }
    if (!boards || followCard === appliedFollowCard.current) return;
    if (followCard) {
      const owner = boards.find((b) => b.cols.some((c) => c.cards.some((k) => k.id === followCard)));
      if (!owner) return; // not loaded yet — tried again when boards change
      appliedFollowCard.current = followCard;
      if (selected !== "all" && selected !== owner.id) setSelected(owner.id);
      setOpenCard(followCard);
    } else {
      appliedFollowCard.current = null;
      setOpenCard(null);
    }
    // selected is read once when the followed task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followCard, boards]);
  // Following someone to another board (the link changes under us): switch to it.
  useEffect(() => { setSelected(initialBoard ?? "all"); }, [initialBoard]);

  const openCount = items.filter((i) => !i.col.isCompleted).length;
  const mp = board ? mainPhase(board.id) : null;
  const today = dayNumber(localToday());

  const cardView = (it: Item, lane: Lane) => {
    const st = subtaskStats.get(it.card.id);
    const pr = it.card.priority ? PRI[it.card.priority] : null;
    const cat = catName(it.card.categoryId) ?? (it.card.kind || null);
    return (
      <div key={it.card.id} className={`${styles.card} ${it.col.isCompleted ? styles.cardDone : ""} ${openCard === it.card.id ? styles.cardSel : ""}`}
        draggable={canEdit} onDragStart={(e) => onDragStart(e, it, lane.key)} onClick={() => setOpenCard(it.card.id)} style={{ ["--c" as string]: color(it.board) }}>
        {(!board && rows === "none") || (rows !== "category" && cat) || pr ? (
          <div className={styles.ctop}>
            {!board && rows === "none" && <span className={`${styles.tag} ${styles.tagBoard}`}><i />{it.board.name}</span>}
            {rows !== "category" && cat && <span className={styles.tag}>{cat}</span>}
            {pr && <span className={styles.pri} style={{ ["--pc" as string]: pr[1] }}>{pr[0]}</span>}
          </div>
        ) : null}
        <div className={styles.ct}>{it.card.title}</div>
        <div className={styles.cf}>
          <span className={plan.avs}>
            {it.card.ownerIds.map((id) => { const m = members.find((x) => x.id === id); return m ? <span key={id} className={plan.av} style={{ background: m.color }} title={m.name}>{m.initials}</span> : null; })}
          </span>
          {st && <span title="Steps">☑ {st.done}/{st.total}</span>}
          {it.card.pageIds.length > 0 && <span title="Linked pages">¶ {it.card.pageIds.length}</span>}
        </div>
      </div>
    );
  };

  return (
    <>
      <header className={plan.head}>
        <h1><span>Plan</span>Board</h1>
        <p className={plan.sum}>
          <b>{openCount} open task{openCount === 1 ? "" : "s"}</b>{board ? ` in ${board.name}` : " across all boards"}. Drag a card anywhere in a column to change its stage.
        </p>
        <div className={plan.sp} />
        <div className={plan.ctrls}>{switcher}</div>
      </header>

      {error && <p className={plan.error}>{error}</p>}
      {!boards && !error && <p className={plan.muted}>Loading boards…</p>}

      {boards && (
        <div className={styles.wrap}>
          <div className={styles.chips}>
            <button className={`${styles.chip} ${selected === "all" ? styles.chipOn : ""}`} onClick={() => setSelected("all")}>
              All boards <small>{boards.reduce((a, b) => a + b.cols.filter((c) => !c.isCompleted).reduce((x, c) => x + c.cards.filter((k) => !k.parentId).length, 0), 0)} open</small>
            </button>
            {boards.map((b) => {
              const p = mainPhase(b.id);
              return (
                <button key={b.id} className={`${styles.chip} ${selected === b.id ? styles.chipOn : ""}`} style={{ ["--c" as string]: color(b) }} onClick={() => setSelected(b.id)}>
                  <i />{b.name}{p?.effective_end && <small>due {sdIso(p.effective_end)}</small>}
                </button>
              );
            })}
            {canEdit && <a className={styles.chipNew} href="/board?classic=1">+ New board</a>}
          </div>

          <div className={styles.tool}>
            <input className={styles.search} placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className={`${plan.sw} ${onlyMine ? plan.swOn : ""}`} onClick={() => setOnlyMine((v) => !v)}><i />Only mine</button>
            <span className={styles.lbl}>Rows</span>
            <span className={plan.seg}>
              {(["none", "category", "person"] as const).map((r) => (
                <button key={r} className={rows === r ? plan.segOn : undefined} onClick={() => setRows(r)}>
                  {r === "none" ? "None" : r === "category" ? (board ? "Category" : "Board") : "Person"}
                </button>
              ))}
            </span>
          </div>

          {board && (
            <div className={styles.banner} style={{ ["--c" as string]: color(board) }}>
              <b><i />{board.name}</b>
              {mp?.effective_start && mp.effective_end && <span>{sdIso(mp.effective_start)} – {sdIso(mp.effective_end)}</span>}
              {mp?.effective_end && <span className={styles.due}>Due {fmtIso(mp.effective_end)} · {dayNumber(mp.effective_end) >= today ? `in ${dayNumber(mp.effective_end) - today} days` : "passed"}</span>}
              {mp && <span>{mp.completed} of {mp.total} tasks done</span>}
              <button onClick={() => router.push("/river/plan?view=timeline")}>See it on the timeline →</button>
            </div>
          )}

          <div className={styles.grid} style={{ gridTemplateColumns: columns.map((c) => (c.done && !showDone ? "64px" : "minmax(250px, 1fr)")).join(" ") }}>
            {columns.map((c) => {
              const n = items.filter(c.forItem).length, fold = c.done && !showDone;
              return fold ? (
                <button key={c.key} className={`${styles.khead} ${styles.fold}`} onClick={() => setShowDone(true)} onDragOver={(e) => { e.preventDefault(); setOver(`${c.key}|*`); }} onDrop={(e) => onDrop(e, c, lanes[0])} title="Show done tasks">
                  <span className={styles.kdot} style={{ background: c.color }} />{c.label} {n}
                </button>
              ) : (
                <div key={c.key} className={styles.khead}>
                  <span className={styles.kdot} style={{ background: c.color }} />{c.label}<small>{n}</small>
                  {c.done && <button className={styles.kbtn} onClick={() => setShowDone(false)} title="Fold">‹</button>}
                </div>
              );
            })}
            {lanes.map((lane) => {
              const inLane = items.filter(lane.match);
              return [
                lane.label ? (
                  <div key={`${lane.key}-h`} className={styles.lane} style={{ ["--c" as string]: lane.color ?? "var(--ink3)" }}>
                    <b>{lane.avatar ? <span className={plan.av} style={{ background: lane.avatar.color }}>{lane.avatar.initials}</span> : <i />}{lane.label}</b>
                    <span>{inLane.filter((i) => !i.col.isCompleted).length} open{lane.sub ? ` · ${lane.sub}` : ""}</span>
                  </div>
                ) : null,
                ...columns.map((c) => {
                  const key = `${c.key}|${lane.key}`, list = inLane.filter(c.forItem);
                  if (c.done && !showDone)
                    return <div key={key} className={`${styles.cell} ${styles.cellFold}`} onDragOver={(e) => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, c, lane)}>{list.length || ""}</div>;
                  return (
                    <div key={key} className={`${styles.cell} ${over === key ? styles.over : ""}`} style={rows === "none" ? { minHeight: "calc(100vh - 330px)" } : undefined}
                      onDragOver={(e) => { e.preventDefault(); if (over !== key) setOver(key); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }} onDrop={(e) => onDrop(e, c, lane)}>
                      {adding === key && (
                        <>
                          <input autoFocus className={styles.kin} placeholder="Task title, then Enter" value={draft} onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void addTask(c, lane); if (e.key === "Escape") { setAdding(null); setDraft(""); } }} onBlur={() => !draft && setAdding(null)} />
                          <div className={styles.khint}>@name assigns · #category · !high sets priority · Esc to stop</div>
                        </>
                      )}
                      {list.map((it) => cardView(it, lane))}
                      {canEdit && !c.done && adding !== key && <button className={styles.kadd} onClick={() => { setAdding(key); setDraft(""); }}>+ Add task</button>}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      )}

      <TaskPanel item={openItem} boards={boards ?? []} members={members} categories={categories} pages={pages} canEdit={canEdit}
        color={openItem ? color(openItem.board) : undefined} onClose={() => setOpenCard(null)} onChanged={reload} say={say} />
      {toast && <div className={plan.toast} role="status">{toast}</div>}
    </>
  );
}
