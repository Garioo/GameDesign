"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/app/components/Icon";
import { listPageEdits, type PageEdit } from "@/lib/pageEditsRepo";
import { diffWords, htmlToPlain } from "@/lib/textDiff";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";
import styles from "./EditHistory.module.css";

const PAGE_SIZE = 40;

const BLOCK_NAME: Record<string, string> = {
  text: "a paragraph",
  h2: "a heading",
  h3: "a subheading",
  bullet: "a bullet",
  numbered: "a list item",
  todo: "a to-do",
  quote: "a quote",
  callout: "a callout",
  table: "a table",
  image: "an image caption",
  script: "a script",
  googleDrive: "a Google Drive file",
};
const VERB: Record<PageEdit["kind"], string> = { added: "wrote", edited: "edited", removed: "deleted" };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
/** "14:02" or "14:02–14:09" when a run of typing spans minutes. */
function span(e: PageEdit): string {
  const a = timeOf(e.createdAt);
  const b = timeOf(e.updatedAt);
  return a === b ? a : `${a}–${b}`;
}

/** Who wrote what on a page, newest first, with word-level changes. Kept live. */
export default function EditHistory({
  workspaceId,
  pageId,
  pageTitle,
  onClose,
}: {
  workspaceId: string;
  pageId: string;
  pageTitle: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<PageEdit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [person, setPerson] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listPageEdits(pageId, { limit: PAGE_SIZE });
    // Keep older pages that were already loaded with "Show older".
    setItems((prev) => {
      if (!prev || prev.length <= PAGE_SIZE) return rows;
      const seen = new Set(rows.map((r) => r.id));
      const cutoff = rows[rows.length - 1]?.updatedAt ?? "";
      return [...rows, ...prev.filter((p) => !seen.has(p.id) && p.updatedAt < cutoff)];
    });
    setMore((m) => m || rows.length === PAGE_SIZE);
    setError("");
  }, [pageId]);

  useEffect(() => {
    setItems(null);
    setMore(false);
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
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const older = await listPageEdits(pageId, { limit: PAGE_SIZE, before: items[items.length - 1].updatedAt });
      setItems([...items, ...older]);
      setMore(older.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // Everyone who appears in the loaded history, most edits first.
  const people = useMemo(() => {
    const counts = new Map<string, { author: NonNullable<PageEdit["author"]>; n: number }>();
    for (const e of items ?? []) {
      if (!e.author) continue;
      const c = counts.get(e.author.id) ?? { author: e.author, n: 0 };
      c.n++;
      counts.set(e.author.id, c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [items]);

  const shown = (items ?? []).filter((e) => !person || e.author?.id === person);
  const days: { label: string; rows: PageEdit[] }[] = [];
  for (const e of shown) {
    const label = dayLabel(e.updatedAt);
    if (days[days.length - 1]?.label !== label) days.push({ label, rows: [] });
    days[days.length - 1].rows.push(e);
  }

  function jumpTo(blockId: string) {
    const el = document.querySelector<HTMLElement>(`.blk[data-block-id="${CSS.escape(blockId)}"]`);
    if (!el) return;
    onClose();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(styles.flash);
    setTimeout(() => el.classList.remove(styles.flash), 1600);
  }

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.dialog} role="dialog" aria-label="Edit history" onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.title}>Edit history</h2>
            <p className={styles.sub}>Who wrote what on “{pageTitle || "Untitled page"}”</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        {people.length > 1 && (
          <div className={styles.people} role="group" aria-label="Filter by person">
            <button type="button" className={styles.chip} aria-pressed={person === null} onClick={() => setPerson(null)}>
              Everyone
            </button>
            {people.map(({ author, n }) => (
              <button
                key={author.id}
                type="button"
                className={styles.chip}
                aria-pressed={person === author.id}
                onClick={() => setPerson(person === author.id ? null : author.id)}
              >
                <span className={styles.chipDot} style={{ background: author.color }} />
                {author.name}
                <span className={styles.chipCount}>{n}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.list}>
          {error && <p className={styles.error}>{error}</p>}
          {!error && items === null && <p className={styles.empty}>Loading history…</p>}
          {!error && items?.length === 0 && (
            <p className={styles.empty}>No edits recorded yet. Changes made from now on will show up here.</p>
          )}
          {days.map((day) => (
            <section key={day.label} className={styles.day}>
              <h3 className={styles.dayLabel}>{day.label}</h3>
              <ul className={styles.entries}>
                {day.rows.map((e) => (
                  <li key={e.id} className={styles.entry}>
                    <span className={styles.avatar} style={{ background: e.author?.color ?? "#a59a8c" }} title={e.author?.name}>
                      {e.author?.initials ?? "?"}
                    </span>
                    <div className={styles.body}>
                      <p className={styles.sentence}>
                        <strong>{e.author?.name ?? "A former member"}</strong> {VERB[e.kind]} {BLOCK_NAME[e.blockType] ?? "a block"}
                        <time className={styles.time} dateTime={e.updatedAt}>{span(e)}</time>
                      </p>
                      <button
                        type="button"
                        className={styles.diff}
                        onClick={() => jumpTo(e.blockId)}
                        title={e.kind === "removed" ? undefined : "Show on the page"}
                        disabled={e.kind === "removed"}
                      >
                        <Diff before={e.before} after={e.after} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!error && items && shown.length === 0 && items.length > 0 && (
            <p className={styles.empty}>No edits by this person in the loaded history.</p>
          )}
          {more && (
            <button type="button" className={styles.more} disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : "Show older"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CONTEXT = 60;
/** Shorten unchanged text around a change so the change itself stays visible. */
function clipContext(text: string, first: boolean, last: boolean): string {
  if (first && last) return text; // nothing changed around it
  if (first) return text.length > CONTEXT ? "…" + text.slice(-CONTEXT) : text;
  if (last) return text.length > CONTEXT ? text.slice(0, CONTEXT) + "…" : text;
  return text.length > CONTEXT * 2 ? text.slice(0, CONTEXT) + " … " + text.slice(-CONTEXT) : text;
}

function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(htmlToPlain(before), htmlToPlain(after)), [before, after]);
  return (
    <span className={styles.diffText}>
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i} className={styles.same}>{clipContext(p.text, i === 0, i === parts.length - 1)}</span>
        ) : p.kind === "added" ? (
          <ins key={i} className={styles.ins}>{p.text}</ins>
        ) : (
          <del key={i} className={styles.del}>{p.text}</del>
        ),
      )}
    </span>
  );
}
