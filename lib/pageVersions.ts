/* ---------------------------------------------------------------------------
 * Google Docs-style versions from the page edit log (page_edits).
 *
 * Edit rows are grouped into editing sessions ("versions"): rows that start
 * within GAP of the previous row's last change belong together, so a version
 * never cuts through a row. The page as it was at the end of a version is
 * rebuilt backwards from the current blocks: every block touched by a newer
 * row goes back to that row's "before" snapshot (null = it didn't exist yet).
 * Blocks that no longer exist come back under the block that was above them
 * when they were deleted (older rows: their last recorded position). Moving
 * blocks isn't recorded, so order is otherwise the current one.
 * ------------------------------------------------------------------------- */

export type BlockContent = Record<string, unknown> & { text?: string };

export interface EditRow {
  id: string;
  blockId: string;
  blockType: string;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
  /** null = the block didn't exist before / after this row. */
  beforeContent: BlockContent | null;
  afterContent: BlockContent | null;
  position: number;
  /** For a deleted block: the block that was just above it. */
  prevBlockId?: string | null;
}

export interface Version {
  id: string;
  start: string;
  end: string;
  /** Rows in this version, oldest first. */
  rows: EditRow[];
  /** Everyone who edited in this version, most recent first. */
  authorIds: string[];
}

export interface VBlock {
  id: string;
  type: string;
  content: BlockContent;
}

const GAP_MS = 20 * 60 * 1000;
const t = (iso: string) => new Date(iso).getTime();

/** Group edit rows into versions, newest first. */
export function groupVersions(rows: EditRow[], gapMs = GAP_MS): Version[] {
  const sorted = [...rows].sort((a, b) => t(a.createdAt) - t(b.createdAt));
  const out: Version[] = [];
  let cur: Version | null = null;
  for (const r of sorted) {
    if (cur && t(r.createdAt) <= t(cur.end) + gapMs) {
      cur.rows.push(r);
      if (t(r.updatedAt) > t(cur.end)) cur.end = r.updatedAt;
    } else {
      cur = { id: r.id, start: r.createdAt, end: r.updatedAt, rows: [r], authorIds: [] };
      out.push(cur);
    }
  }
  for (const v of out) {
    const byLatest = [...v.rows].sort((a, b) => t(b.updatedAt) - t(a.updatedAt));
    v.authorIds = [...new Set(byLatest.map((r) => r.authorId).filter((a): a is string => !!a))];
  }
  return out.reverse();
}

/**
 * The page with every row in `undo` rolled back. Blocks keep inline data
 * (image src, script code) from the current block when the snapshot left it out.
 */
export function stateBefore(current: VBlock[], undo: EditRow[]): VBlock[] {
  const earliest = new Map<string, EditRow>();
  for (const r of undo) {
    const e = earliest.get(r.blockId);
    if (!e || t(r.createdAt) < t(e.createdAt)) earliest.set(r.blockId, r);
  }
  const currentIds = new Set(current.map((b) => b.id));
  const order: VBlock[] = [];
  for (const b of current) {
    const row = earliest.get(b.id);
    if (!row) order.push(b);
    else if (row.beforeContent) order.push({ id: b.id, type: row.blockType, content: { ...b.content, ...row.beforeContent } });
  }
  // Blocks that are gone now come back after the block that was above them,
  // or (older rows without that) at their last recorded position.
  let pending = [...earliest.values()]
    .filter((r) => !currentIds.has(r.blockId) && r.beforeContent)
    .sort((a, b) => a.position - b.position);
  const put = (r: EditRow, at: number) => order.splice(at, 0, { id: r.blockId, type: r.blockType, content: r.beforeContent! });
  for (let progress = true; progress && pending.length; ) {
    progress = false;
    pending = pending.filter((r) => {
      const k = r.prevBlockId ? order.findIndex((b) => b.id === r.prevBlockId) : -1;
      if (k < 0) return true;
      put(r, k + 1);
      progress = true;
      return false;
    });
  }
  for (const r of pending) put(r, Math.max(0, Math.min(r.position, order.length)));
  return order;
}

/** The page at the start and end of `versions[index]` (versions newest first). */
export function versionStates(current: VBlock[], versions: Version[], index: number): { before: VBlock[]; after: VBlock[] } {
  const newer = versions.slice(0, index).flatMap((v) => v.rows);
  const after = stateBefore(current, newer);
  const before = stateBefore(current, [...newer, ...versions[index].rows]);
  return { before, after };
}

export type ShownBlock = {
  block: VBlock;
  /** Content at the start of the version (null = added in it). */
  was: BlockContent | null;
  status: "same" | "added" | "removed" | "changed";
  /** Who touched this block in the version, most recent last. */
  authorIds: string[];
};

/**
 * The end state of a version with the blocks it deleted put back in place, and
 * each block marked with what the version did to it.
 */
export function showVersion(before: VBlock[], after: VBlock[], rows: EditRow[]): ShownBlock[] {
  const authors = new Map<string, string[]>();
  for (const r of [...rows].sort((a, b) => t(a.updatedAt) - t(b.updatedAt))) {
    if (!r.authorId) continue;
    const list = (authors.get(r.blockId) ?? []).filter((a) => a !== r.authorId);
    authors.set(r.blockId, [...list, r.authorId]);
  }
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterIds = new Set(after.map((b) => b.id));
  const same = (a: BlockContent, b: BlockContent) => JSON.stringify(a) === JSON.stringify(b);

  const shown: { item: ShownBlock; pos: number }[] = after.map((b, i) => {
    const was = beforeById.get(b.id)?.content ?? null;
    const status = !was ? "added" : authors.has(b.id) && !same(was, b.content) ? "changed" : "same";
    return { item: { block: b, was, status, authorIds: authors.get(b.id) ?? [] }, pos: i };
  });
  // Deleted blocks go right after the block that preceded them before.
  before.forEach((b, i) => {
    if (afterIds.has(b.id)) return;
    let anchor = -1;
    for (let j = i - 1; j >= 0; j--) {
      const k = after.findIndex((a) => a.id === before[j].id);
      if (k >= 0) { anchor = k; break; }
    }
    shown.push({ item: { block: b, was: b.content, status: "removed", authorIds: authors.get(b.id) ?? [] }, pos: anchor + 0.5 + i / 1e6 });
  });
  return shown.sort((a, b) => a.pos - b.pos).map((s) => s.item);
}
