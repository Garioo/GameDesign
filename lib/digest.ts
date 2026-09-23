/* ---------------------------------------------------------------------------
 * The weekly digest (/digest): what changed in a workspace over one week,
 * built from the page edit log (page_edits) and the activity feed. Pure
 * functions only, so the page can stay a thin view and tests can run them.
 *
 * Weeks run Monday 00:00 → next Monday 00:00 in local time.
 * ------------------------------------------------------------------------- */

export interface DigestEdit {
  pageId: string;
  /** Live title; null when the page is gone. */
  pageTitle: string | null;
  pageTrashed: boolean;
  authorId: string | null;
  kind: "added" | "edited" | "removed";
  beforeText: string;
  afterText: string;
  updatedAt: string;
}

export interface DigestActivity {
  action: string;
  actorId: string | null;
  pageId: string | null;
  cardId: string | null;
  /** Live task title (null when deleted); `target` is the name at the time. */
  cardTitle: string | null;
  pageTitle: string | null;
  target: string | null;
  meta: { from?: string; to?: string; done?: boolean; board?: string };
  createdAt: string;
}

export interface DigestPage {
  pageId: string;
  title: string;
  trashed: boolean;
  edits: number;
  blocksAdded: number;
  blocksRemoved: number;
  wordsAdded: number;
  wordsRemoved: number;
  /** Everyone who edited it, most edits first. */
  authorIds: string[];
  lastAt: string;
}

export interface DigestMove {
  cardId: string;
  title: string;
  /** Stage at the start of the week's moves, and where it ended up. */
  from: string;
  to: string;
  done: boolean;
  boardId: string | null;
  /** Whoever moved it last. */
  actorId: string | null;
  at: string;
  moves: number;
}

export interface DigestPerson {
  id: string;
  pages: { pageId: string; title: string; edits: number }[];
  edits: number;
  wordsAdded: number;
  tasksMoved: number;
  tasksDone: number;
  tasksCreated: number;
  pagesCreated: number;
  comments: number;
}

export interface Digest {
  totals: {
    pagesEdited: number;
    editors: number;
    edits: number;
    wordsAdded: number;
    wordsRemoved: number;
    tasksCreated: number;
    tasksMoved: number;
    tasksDone: number;
    comments: number;
    pagesCreated: number;
  };
  people: DigestPerson[];
  pages: DigestPage[];
  moves: DigestMove[];
  newPages: { pageId: string; title: string; actorId: string | null; at: string }[];
  newTasks: { cardId: string; title: string; actorId: string | null; at: string }[];
  /** Activity + edits per weekday, Monday first. */
  perDay: number[];
}

/** Monday 00:00 (local) of the week containing `d`. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/** The week starting on a "YYYY-MM-DD" (any day in it works), or this week. */
export function weekRange(param?: string | null, now = new Date()): { start: Date; end: Date } {
  const m = param && /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  const day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : now;
  const start = weekStart(isNaN(day.getTime()) ? now : day);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** "YYYY-MM-DD" of a local date (the ?week= format). */
export function dateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function wordCount(s: string): number {
  return (s.match(/[^\s]+/g) ?? []).length;
}

const inRange = (iso: string, start: Date, end: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

export function buildDigest(
  editsIn: DigestEdit[],
  activityIn: DigestActivity[],
  range: { start: Date; end: Date },
): Digest {
  const edits = editsIn.filter((e) => inRange(e.updatedAt, range.start, range.end));
  const activity = activityIn.filter((a) => inRange(a.createdAt, range.start, range.end));

  const people = new Map<string, DigestPerson & { pageEdits: Map<string, { title: string; edits: number }> }>();
  const person = (id: string) => {
    let p = people.get(id);
    if (!p) {
      p = { id, pages: [], edits: 0, wordsAdded: 0, tasksMoved: 0, tasksDone: 0, tasksCreated: 0, pagesCreated: 0, comments: 0, pageEdits: new Map() };
      people.set(id, p);
    }
    return p;
  };
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const dayOf = (iso: string) => (new Date(iso).getDay() + 6) % 7;

  /* ---------- pages ---------- */
  const pages = new Map<string, DigestPage & { byAuthor: Map<string, number> }>();
  let wordsAdded = 0;
  let wordsRemoved = 0;
  for (const e of edits) {
    perDay[dayOf(e.updatedAt)]++;
    let pg = pages.get(e.pageId);
    if (!pg) {
      pg = {
        pageId: e.pageId,
        title: e.pageTitle || "Untitled page",
        trashed: e.pageTrashed || e.pageTitle === null,
        edits: 0, blocksAdded: 0, blocksRemoved: 0, wordsAdded: 0, wordsRemoved: 0,
        authorIds: [], lastAt: e.updatedAt, byAuthor: new Map(),
      };
      pages.set(e.pageId, pg);
    }
    const delta = wordCount(e.afterText) - wordCount(e.beforeText);
    const added = Math.max(0, delta);
    const removed = Math.max(0, -delta);
    pg.edits++;
    if (e.kind === "added") pg.blocksAdded++;
    if (e.kind === "removed") pg.blocksRemoved++;
    pg.wordsAdded += added;
    pg.wordsRemoved += removed;
    if (e.updatedAt > pg.lastAt) pg.lastAt = e.updatedAt;
    wordsAdded += added;
    wordsRemoved += removed;
    if (e.authorId) {
      pg.byAuthor.set(e.authorId, (pg.byAuthor.get(e.authorId) ?? 0) + 1);
      const p = person(e.authorId);
      p.edits++;
      p.wordsAdded += added;
      const pe = p.pageEdits.get(e.pageId) ?? { title: pg.title, edits: 0 };
      pe.edits++;
      p.pageEdits.set(e.pageId, pe);
    }
  }
  const pageList: DigestPage[] = [...pages.values()]
    .map(({ byAuthor, ...pg }) => ({ ...pg, authorIds: [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id) }))
    .sort((a, b) => b.edits - a.edits || b.lastAt.localeCompare(a.lastAt));

  /* ---------- activity ---------- */
  const moves = new Map<string, DigestMove>();
  const newPages: Digest["newPages"] = [];
  const newTasks: Digest["newTasks"] = [];
  let comments = 0;
  // Oldest first, so a task's first move gives "from" and its last gives "to".
  for (const a of [...activity].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    perDay[dayOf(a.createdAt)]++;
    const who = a.actorId ? person(a.actorId) : null;
    switch (a.action) {
      case "card.moved": {
        if (!a.cardId) break;
        const title = a.cardTitle ?? a.target ?? "A deleted task";
        const prev = moves.get(a.cardId);
        moves.set(a.cardId, {
          cardId: a.cardId,
          title,
          from: prev ? prev.from : a.meta.from ?? "?",
          to: a.meta.to ?? "?",
          done: !!a.meta.done,
          boardId: a.meta.board ?? prev?.boardId ?? null,
          actorId: a.actorId,
          at: a.createdAt,
          moves: (prev?.moves ?? 0) + 1,
        });
        if (who) {
          who.tasksMoved++;
          if (a.meta.done) who.tasksDone++;
        }
        break;
      }
      case "card.created":
        if (a.cardId) newTasks.push({ cardId: a.cardId, title: a.cardTitle ?? a.target ?? "A deleted task", actorId: a.actorId, at: a.createdAt });
        if (who) who.tasksCreated++;
        break;
      case "page.created":
        if (a.pageId) newPages.push({ pageId: a.pageId, title: a.pageTitle ?? a.target ?? "A deleted page", actorId: a.actorId, at: a.createdAt });
        if (who) who.pagesCreated++;
        break;
      case "comment.added":
        comments++;
        if (who) who.comments++;
        break;
    }
  }
  // A task moved out and back again didn't really move.
  const moveList = [...moves.values()].filter((m) => m.from !== m.to).sort((a, b) => b.at.localeCompare(a.at));

  const personList: DigestPerson[] = [...people.values()]
    .map(({ pageEdits, ...p }) => ({
      ...p,
      pages: [...pageEdits.entries()].map(([pageId, v]) => ({ pageId, ...v })).sort((a, b) => b.edits - a.edits),
    }))
    .sort((a, b) => score(b) - score(a));

  return {
    totals: {
      pagesEdited: pageList.length,
      editors: new Set(edits.map((e) => e.authorId).filter(Boolean)).size,
      edits: edits.length,
      wordsAdded,
      wordsRemoved,
      tasksCreated: newTasks.length,
      tasksMoved: moveList.length,
      tasksDone: moveList.filter((m) => m.done).length,
      comments,
      pagesCreated: newPages.length,
    },
    people: personList,
    pages: pageList,
    moves: moveList,
    newPages: newPages.reverse(),
    newTasks: newTasks.reverse(),
    perDay,
  };
}

/** Rough "how much did they do" for ordering people (not shown). */
function score(p: DigestPerson): number {
  return p.edits + p.tasksMoved * 2 + p.tasksDone * 3 + p.tasksCreated + p.pagesCreated * 2 + p.comments;
}
