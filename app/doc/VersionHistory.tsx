"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Icon from "@/app/components/Icon";
import type { Block } from "@/app/doc/data";
import { sanitizeHtml } from "./BlockEditor";
import { blockContent, contentToBlock } from "@/lib/docsRepo";
import { listPageEdits, type EditAuthor } from "@/lib/pageEditsRepo";
import { groupVersions, showVersion, versionStates, type BlockContent, type EditRow, type ShownBlock, type VBlock } from "@/lib/pageVersions";
import { diffWords, htmlToPlain } from "@/lib/textDiff";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import { useShortcuts } from "@/lib/shortcuts";
import styles from "./VersionHistory.module.css";

const PAGE_SIZE = 300;
const UNKNOWN: EditAuthor = { id: "", name: "A former member", initials: "?", color: "#a59a8c" };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const longDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Full-screen version history, like Google Docs: the page as it was at the
 * chosen version with that version's changes coloured by author, the list of
 * versions on the right, and "Restore this version".
 */
export default function VersionHistory({
  workspaceId,
  pageId,
  pageTitle,
  blocks,
  canEdit,
  onRestore,
  onRestoreBlock,
  onClose,
}: {
  workspaceId: string;
  pageId: string;
  pageTitle: string;
  /** The page's current blocks; versions are rebuilt backwards from them. */
  blocks: Block[];
  canEdit: boolean;
  onRestore: (blocks: Block[]) => void;
  /** Compare view: put one block back the way it was (the whole new block list). */
  onRestoreBlock?: (blocks: Block[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [authors, setAuthors] = useState<Map<string, EditAuthor>>(new Map());
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(true);
  const [confirming, setConfirming] = useState(false);
  // Compare mode: the selected version (newer side) against another one (older side).
  const [comparing, setComparing] = useState(false);
  const [baseId, setBaseId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listPageEdits(pageId, { limit: PAGE_SIZE });
    setAuthors((prev) => new Map([...prev, ...res.authors]));
    // Keep older rows already loaded with "Load older versions".
    setRows((prev) => {
      if (!prev || prev.length <= PAGE_SIZE) return res.rows;
      const seen = new Set(res.rows.map((r) => r.id));
      const cutoff = res.rows[res.rows.length - 1]?.updatedAt ?? "";
      return [...res.rows, ...prev.filter((r) => !seen.has(r.id) && r.updatedAt < cutoff)];
    });
    setMore((m) => m || res.rows.length === PAGE_SIZE);
    setError("");
  }, [pageId]);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refresh]);
  useSidebarLiveUpdates(workspaceId, ["page_edits"], refresh);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function loadMore() {
    if (!rows?.length) return;
    setLoadingMore(true);
    try {
      const res = await listPageEdits(pageId, { limit: PAGE_SIZE, before: rows[rows.length - 1].updatedAt });
      setAuthors((prev) => new Map([...prev, ...res.authors]));
      setRows([...rows, ...res.rows]);
      setMore(res.rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const versions = useMemo(() => groupVersions(rows ?? []), [rows]);
  const index = Math.max(0, versions.findIndex((v) => v.id === selectedId));
  const version = versions[index];
  const current = useMemo<VBlock[]>(
    () => blocks.map((b) => ({ id: b.id, type: b.type, content: blockContent(b) as BlockContent })),
    [blocks],
  );
  const states = useMemo(() => (version ? versionStates(current, versions, index) : null), [current, versions, index, version]);
  const shown = useMemo(
    () => (states && version ? showVersion(states.before, states.after, version.rows) : []),
    [states, version],
  );
  const author = (id: string | undefined) => (id && authors.get(id)) || UNKNOWN;

  // Compare: the end of one version against the end of another. The base
  // defaults to the version just before the selected one; picking a newer
  // base just swaps the sides so the older one is always on the left.
  const pickedBase = versions.findIndex((v) => v.id === baseId);
  const baseIndex = pickedBase >= 0 && pickedBase !== index ? pickedBase : Math.min(index + 1, versions.length);
  const [newerIdx, olderIdx] = baseIndex < index ? [baseIndex, index] : [index, baseIndex];
  const compare = useMemo(() => {
    if (!comparing || !versions.length) return null;
    const newer = versionStates(current, versions, newerIdx).after;
    // olderIdx === versions.length: before the oldest loaded version.
    const older =
      olderIdx >= versions.length
        ? versionStates(current, versions, versions.length - 1).before
        : versionStates(current, versions, olderIdx).after;
    const between = versions.slice(newerIdx, Math.min(olderIdx, versions.length)).flatMap((v) => v.rows);
    return { older, newer, shown: showVersion(older, newer, between) };
  }, [comparing, current, versions, newerIdx, olderIdx]);
  const olderLabel = olderIdx >= versions.length ? "Before these versions" : versions[olderIdx] ? longDate(versions[olderIdx].end) : "";
  const newerLabel = versions[newerIdx] ? longDate(versions[newerIdx].end) : "";

  /** Put one block back to how it is on the older side, in the live page. */
  function restoreBlock(sb: ShownBlock) {
    if (!compare || !onRestoreBlock) return;
    const id = sb.block.id;
    const old = compare.older.find((b) => b.id === id) ?? null;
    let next = [...blocks];
    const at = next.findIndex((b) => b.id === id);
    if (!old) {
      // It didn't exist yet on the older side: restoring means removing it.
      if (at < 0) return;
      next.splice(at, 1);
    } else if (at >= 0) {
      next[at] = contentToBlock(id, old.type, old.content);
    } else {
      // Gone from the page: back under the nearest block above it that still exists.
      const olderPos = compare.older.findIndex((b) => b.id === id);
      let insertAt = 0;
      for (let j = olderPos - 1; j >= 0; j--) {
        const k = next.findIndex((b) => b.id === compare.older[j].id);
        if (k >= 0) { insertAt = k + 1; break; }
      }
      next = [...next.slice(0, insertAt), contentToBlock(id, old.type, old.content), ...next.slice(insertAt)];
    }
    onRestoreBlock(next);
  }

  function restore() {
    if (!states) return;
    onRestore(states.after.map((b) => contentToBlock(b.id, b.type, b.content)));
    onClose();
  }

  // Keyboard: step through versions, compare, restore (press ? for the list).
  const stepVersion = (delta: number) => {
    const next = versions[Math.max(0, Math.min(versions.length - 1, index + delta))];
    if (!next) return;
    setSelectedId(next.id);
    setConfirming(false);
    requestAnimationFrame(() =>
      document.querySelector(`[data-version="${next.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  useShortcuts([
    { id: "vh-older", keys: "j", label: "Older version", group: "Version history", palette: false, run: () => stepVersion(1) },
    { id: "vh-newer", keys: "k", label: "Newer version", group: "Version history", palette: false, run: () => stepVersion(-1) },
    { id: "vh-older-arrow", keys: "ArrowDown", label: "Older version", group: "Version history", palette: false, run: () => stepVersion(1) },
    { id: "vh-newer-arrow", keys: "ArrowUp", label: "Newer version", group: "Version history", palette: false, run: () => stepVersion(-1) },
    {
      id: "vh-compare",
      keys: "c",
      label: comparing ? "Stop comparing" : "Compare versions",
      group: "Version history",
      palette: false,
      enabled: versions.length > 0,
      run: () => {
        setComparing((c) => !c);
        setBaseId(null);
        setConfirming(false);
      },
    },
    {
      id: "vh-changes",
      keys: "s",
      label: showChanges ? "Hide changes" : "Show changes",
      group: "Version history",
      palette: false,
      enabled: !comparing,
      run: () => setShowChanges((v) => !v),
    },
    {
      id: "vh-restore",
      keys: "r",
      label: "Restore this version",
      group: "Version history",
      palette: false,
      enabled: canEdit && !!version && index > 0 && !comparing,
      run: () => setConfirming(true),
    },
  ]);

  // Versions grouped by day for the side list.
  const days: { label: string; items: { v: (typeof versions)[number]; i: number }[] }[] = [];
  versions.forEach((v, i) => {
    const label = dayLabel(v.end);
    if (days[days.length - 1]?.label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push({ v, i });
  });

  const visible = showChanges ? shown : shown.filter((s) => s.status !== "removed");

  return (
    // data-shortcuts-ok: its own keys (above) work while it's open.
    <div className={styles.screen} role="dialog" aria-label="Version history" data-shortcuts-ok="">
      <header className={styles.bar}>
        <button type="button" className={styles.back} onClick={onClose} aria-label="Back to the page" title="Back to the page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div className={styles.barTitle}>
          <span className={styles.barDate}>
            {comparing && compare ? `${olderLabel}  →  ${newerLabel}` : version ? longDate(version.end) : "Version history"}
          </span>
          <span className={styles.barPage}>{pageTitle || "Untitled page"}</span>
        </div>
        {canEdit && version && index > 0 && !comparing && (
          confirming ? (
            <div className={styles.confirm}>
              <span>Replace the page with this version?</span>
              <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className={styles.primary} onClick={restore}>Restore</button>
            </div>
          ) : (
            <button type="button" className={styles.primary} onClick={() => setConfirming(true)}>
              Restore this version
            </button>
          )
        )}
      </header>

      <div className={styles.main}>
        <div className={styles.stage}>
          {comparing && compare ? (
            <article className={`${styles.paper} ${styles.comparePaper}`}>
              <h1 className={styles.pageTitle}>{pageTitle || "Untitled page"}</h1>
              <div className={styles.compareHead}>
                <span><span className={styles.sideTag}>Older</span>{olderLabel}</span>
                <span><span className={`${styles.sideTag} ${styles.sideTagNew}`}>Newer</span>{newerLabel}</span>
              </div>
              {compare.shown.every((s) => s.status === "same") && (
                <p className={styles.notice}>No differences between these two versions.</p>
              )}
              <div className={styles.compareRows}>
                {compare.shown.map((sb, i) => {
                  const changed = sb.status !== "same";
                  const a = author(sb.authorIds[sb.authorIds.length - 1]);
                  const canRestoreHere = canEdit && !!onRestoreBlock && changed;
                  return (
                    <div key={sb.block.id} className={`${styles.compareRow}${changed ? ` ${styles.compareChanged}` : ""}`} style={{ "--author": a.color } as CSSProperties}>
                      <div className={`${styles.blocks} ${styles.compareCell}`}>
                        {sb.status === "added" ? <div className={styles.gap} aria-label="Not in the older version" /> : (
                          <BlockView s={sb} number={numberOf(compare.shown, i)} showChanges author={a} side="old" />
                        )}
                        {canRestoreHere && (
                          <button type="button" className={styles.restoreBlock} onClick={() => restoreBlock(sb)} title={sb.status === "added" ? "Remove this block from the page" : "Put this block back the way it is here"}>
                            {sb.status === "added" ? "Remove block" : "Restore this block"}
                          </button>
                        )}
                      </div>
                      <div className={`${styles.blocks} ${styles.compareCell}`}>
                        {sb.status === "removed" ? <div className={styles.gap} aria-label="Deleted in the newer version" /> : (
                          <BlockView s={sb} number={numberOf(compare.shown, i)} showChanges author={a} side="new" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : (
          <article className={styles.paper}>
            <h1 className={styles.pageTitle}>{pageTitle || "Untitled page"}</h1>
            {error && <p className={styles.notice}>{error}</p>}
            {!error && rows === null && <p className={styles.notice}>Loading versions…</p>}
            {!error && rows?.length === 0 && (
              <p className={styles.notice}>No versions yet. From now on, every edit to this page is saved here with who made it.</p>
            )}
            <div className={styles.blocks}>
              {visible.map((s, i) => (
                <BlockView
                  key={s.block.id}
                  s={s}
                  number={numberOf(visible, i)}
                  showChanges={showChanges}
                  author={author(s.authorIds[s.authorIds.length - 1])}
                />
              ))}
            </div>
          </article>
          )}
        </div>

        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <h2 className={styles.sideTitle}>Version history</h2>
            {versions.length > 0 && (
              <button
                type="button"
                className={comparing ? `${styles.compareToggle} ${styles.compareOn}` : styles.compareToggle}
                aria-pressed={comparing}
                onClick={() => {
                  setComparing((c) => !c);
                  setBaseId(null);
                  setConfirming(false);
                }}
              >
                Compare
              </button>
            )}
          </div>
          {comparing && (
            <p className={styles.compareHint}>
              Pick a version, then <strong>Compare with</strong> another one.
            </p>
          )}
          <div className={styles.versions}>
            {days.map((day) => (
              <section key={day.label}>
                <h3 className={styles.day}>{day.label}</h3>
                {day.items.map(({ v, i }) => (
                  <button
                    key={v.id}
                    data-version={v.id}
                    type="button"
                    className={styles.version}
                    aria-current={i === index}
                    onClick={() => {
                      setSelectedId(v.id);
                      setConfirming(false);
                    }}
                  >
                    <span className={styles.versionTime}>{longDate(v.end)}</span>
                    {i === 0 && <span className={styles.currentTag}>Current version</span>}
                    <span className={styles.people}>
                      {v.authorIds.length === 0 && <span className={styles.person}>{UNKNOWN.name}</span>}
                      {v.authorIds.map((id) => (
                        <span key={id} className={styles.person}>
                          <span className={styles.dot} style={{ background: author(id).color }} />
                          {author(id).name}
                        </span>
                      ))}
                    </span>
                    {comparing && i !== index && (
                      <span
                        role="button"
                        tabIndex={0}
                        className={i === baseIndex ? `${styles.compareWith} ${styles.compareWithOn}` : styles.compareWith}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBaseId(v.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setBaseId(v.id);
                          }
                        }}
                      >
                        {i === baseIndex ? "Comparing with" : "Compare with"}
                      </span>
                    )}
                    {i === index && (
                      <span className={styles.span}>
                        {timeOf(v.start) === timeOf(v.end) ? timeOf(v.end) : `${timeOf(v.start)} – ${timeOf(v.end)}`}
                        {" · "}
                        {v.rows.length} change{v.rows.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </button>
                ))}
              </section>
            ))}
            {more && (
              <button type="button" className={styles.more} disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading…" : "Load older versions"}
              </button>
            )}
          </div>
          {!comparing && <label className={styles.toggle}>
            <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} />
            Show changes
          </label>}
        </aside>
      </div>
    </div>
  );
}

/** The list number of a numbered block (counting the run it's in). */
function numberOf(list: ShownBlock[], i: number): number {
  let n = 1;
  for (let j = i - 1; j >= 0 && list[j].block.type === "numbered"; j--) n++;
  return n;
}

const textOf = (c: BlockContent | null) => (typeof c?.text === "string" ? c.text : "");
const rowsOf = (c: BlockContent | null): string[][] => (Array.isArray(c?.rows) ? (c!.rows as string[][]) : []);

/** Text with this version's changes marked, or the plain formatted text. In
 *  compare view, `side` keeps only that side's half of the diff. */
function Text({ s, showChanges, side }: { s: ShownBlock; showChanges: boolean; side?: "old" | "new" }) {
  const now = textOf(s.block.content);
  if (side && s.status === "changed") {
    const parts = diffWords(htmlToPlain(textOf(s.was)), htmlToPlain(now)).filter((p) => p.kind !== (side === "old" ? "added" : "removed"));
    return (
      <div className="blk-text">
        {parts.map((p, i) =>
          p.kind === "same" ? <span key={i}>{p.text}</span>
          : p.kind === "added" ? <ins key={i} className={styles.ins}>{p.text}</ins>
          : <del key={i} className={styles.del}>{p.text}</del>,
        )}
      </div>
    );
  }
  if (!showChanges || s.status === "same") {
    return <div className="blk-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(now) }} />;
  }
  const parts =
    s.status === "added"
      ? [{ kind: "added" as const, text: htmlToPlain(now) }]
      : s.status === "removed"
        ? [{ kind: "removed" as const, text: htmlToPlain(now) }]
        : diffWords(htmlToPlain(textOf(s.was)), htmlToPlain(now));
  return (
    <div className="blk-text">
      {parts.map((p, i) =>
        p.kind === "same" ? <span key={i}>{p.text}</span>
        : p.kind === "added" ? <ins key={i} className={styles.ins}>{p.text}</ins>
        : <del key={i} className={styles.del}>{p.text}</del>,
      )}
    </div>
  );
}

function Cell({ was, now, mark }: { was: string | undefined; now: string; mark: boolean }) {
  if (!mark || was === now) return <>{now}</>;
  return (
    <>
      {was ? <del className={styles.del}>{was}</del> : null}
      {was && now ? " " : null}
      {now ? <ins className={styles.ins}>{now}</ins> : null}
    </>
  );
}

function BlockView({
  s: shown,
  number,
  showChanges,
  author,
  side,
}: {
  s: ShownBlock;
  number: number;
  showChanges: boolean;
  author: EditAuthor;
  /** Compare view: draw the older ("old") or newer ("new") half of a change. */
  side?: "old" | "new";
}) {
  // The older side of a changed block shows its earlier content (type, checkbox, tone, table).
  const s: ShownBlock = side === "old" && shown.status === "changed" && shown.was
    ? { ...shown, block: { ...shown.block, content: { ...shown.was, text: textOf(shown.block.content) } } }
    : shown;
  const { type, content } = s.block;
  const marked = showChanges && s.status !== "same";
  const text = <Text s={shown} showChanges={showChanges} side={side} />;
  let main: ReactNode;
  switch (type) {
    case "divider":
      main = <hr className="blk-hr" />;
      break;
    case "bullet":
      main = <div className="blk-main bullet-row"><span className="blk-dot">•</span>{text}</div>;
      break;
    case "numbered":
      main = <div className="blk-main bullet-row"><span className="blk-num">{number}.</span>{text}</div>;
      break;
    case "todo":
      main = (
        <div className={"blk-main todo-row" + (content.checked ? " is-checked" : "")}>
          <span className="blk-check" aria-hidden="true">
            {content.checked ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            ) : null}
          </span>
          {text}
        </div>
      );
      break;
    case "quote":
      main = <div className="blk-main quote-box">{text}</div>;
      break;
    case "callout":
      main = <div className={"blk-main callout-box tone-" + (typeof content.tone === "string" ? content.tone : "ember")}>{text}</div>;
      break;
    case "table": {
      const mark = marked && s.status === "changed";
      // Older side: the earlier cells, with what changed struck out.
      const rows = side === "old" && mark ? rowsOf(shown.was) : rowsOf(shown.block.content);
      const was = side === "old" && mark ? rowsOf(shown.block.content) : rowsOf(shown.was);
      main = (
        <div className="blk-table">
          <div className="tbl-grid">
            <table className="tbl">
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={ri === 0 ? "tbl-head" : undefined}>
                        <div className="tbl-cell">
                          {side === "old" && mark ? (
                            was[ri]?.[ci] === cell ? cell : <del className={styles.del}>{cell}</del>
                          ) : side === "new" && mark ? (
                            was[ri]?.[ci] === cell ? cell : <ins className={styles.ins}>{cell}</ins>
                          ) : (
                            <Cell was={was[ri]?.[ci]} now={cell} mark={mark} />
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      break;
    }
    case "image":
      main = (
        <div className="blk-main">
          {typeof content.src === "string" && content.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.image} src={content.src} alt="" />
          )}
          {textOf(content) || s.status !== "same" ? text : null}
        </div>
      );
      break;
    case "script":
    case "curve":
    case "googleDrive": {
      const label =
        type === "script" ? `Script · ${String(content.path ?? "")}`
        : type === "curve" ? "Stat curve"
        : `Google Drive · ${String((content.driveFile as { name?: string } | undefined)?.name ?? "file")}`;
      main = <div className="blk-main"><span className={styles.embed}>{label}</span></div>;
      break;
    }
    default:
      main = <div className="blk-main">{text}</div>;
  }
  return (
    <div
      className={`blk blk-${type} ${styles.block}${marked ? ` ${styles.marked}` : ""}${marked && s.status === "removed" ? ` ${styles.removed}` : ""}`}
      style={{ "--author": author.color } as CSSProperties}
    >
      {marked && s.status === "removed" && !side && <span className={styles.tag}>Deleted by {author.name}</span>}
      {main}
    </div>
  );
}
