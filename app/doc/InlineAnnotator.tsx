"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Icon from "@/app/components/Icon";
import type { ProfileInfo } from "@/lib/docsRepo";
import { MentionTextarea } from "./Comments";
import styles from "./InlineAnnotator.module.css";

export type AnnotationKind = "comment" | "suggest";
export interface AnnotationRequest {
  kind: AnnotationKind;
  /** Clone of the selected range inside `block` (a .blk-text element). */
  range: Range;
  block: HTMLElement;
  quote: string;
  body: string;
  /** Proposed replacement for suggestions ('' = delete); unused for comments. */
  suggestion: string;
}

type Spot = { range: Range; block: HTMLElement; rect: DOMRect; quote: string };

/**
 * Floating "Comment" / "Suggest edit" toolbar over a text selection inside one
 * block, plus the small form each opens. The selection is captured as a Range
 * when a button is pressed, so it survives focus moving into the form.
 */
export default function InlineAnnotator({
  rootRef,
  onSubmit,
  people = [],
  openFor,
  suggest = true,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  onSubmit: (req: AnnotationRequest) => Promise<void>;
  /** Workspace people offered by @ in the comment field (mentions notify them). */
  people?: ProfileInfo[];
  /** Open the comment form over a whole block's text (block menu → Comment). */
  openFor?: { block: HTMLElement | null; at: number } | null;
  /** Offer "Suggest edit" (off for people who can only comment). */
  suggest?: boolean;
}) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [form, setForm] = useState<(Spot & { kind: AnnotationKind; blocked: boolean }) | null>(null);
  const [body, setBody] = useState("");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [formPos, setFormPos] = useState<{ top: number; left: number } | null>(null);

  // Place the form once its real height is known: below the selection when it
  // fits above the floating dock, otherwise above the selection, always on screen.
  useLayoutEffect(() => {
    if (!form) return setFormPos(null);
    const el = formRef.current;
    if (!el) return;
    const margin = 12;
    const dock = document.querySelector(".dock-wrap")?.getBoundingClientRect();
    const bottomLimit = (dock && dock.top > window.innerHeight / 2 ? dock.top : window.innerHeight) - margin;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    let top = form.rect.bottom + 8;
    if (top + h > bottomLimit) top = form.rect.top - 8 - h;
    top = Math.max(margin, Math.min(top, bottomLimit - h));
    const left = Math.max(margin, Math.min(form.rect.left, window.innerWidth - w - margin));
    setFormPos({ top, left });
  }, [form, error]);

  // "Comment on this block": select its whole text and open the form.
  const openAt = openFor?.at;
  useEffect(() => {
    const block = openFor?.block;
    if (!block || !block.isConnected) return;
    const range = document.createRange();
    range.selectNodeContents(block);
    const quote = range.toString();
    if (!quote.trim()) return;
    setError("");
    setBody("");
    setReplacement("");
    setSpot(null);
    setForm({ range, block, rect: block.getBoundingClientRect(), quote, kind: "comment", blocked: false });
    // Only a new request (its timestamp) opens the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAt]);

  // Track the selection while no form is open.
  useEffect(() => {
    if (form) return;
    const read = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return setSpot(null);
      const range = sel.getRangeAt(0);
      const blockOf = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>(".blk-text") ?? null;
      const block = blockOf(range.startContainer);
      const quote = range.toString();
      if (!block || block !== blockOf(range.endContainer) || !rootRef.current?.contains(block) || !quote.trim()) {
        return setSpot(null);
      }
      setSpot({ range: range.cloneRange(), block, rect: range.getBoundingClientRect(), quote });
    };
    const hide = () => setSpot(null);
    document.addEventListener("selectionchange", read);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("selectionchange", read);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [form, rootRef]);

  // Close the form on an outside click or Escape.
  useEffect(() => {
    if (!form) return;
    const onDown = (e: PointerEvent) => {
      if (!busy && !formRef.current?.contains(e.target as Node)) setForm(null);
    };
    const onKey = (e: KeyboardEvent) => {
      // The @-mention list handles (and prevents) its own Escape first.
      if (e.key === "Escape" && !busy && !e.defaultPrevented) setForm(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [form, busy]);

  const open = (kind: AnnotationKind) => {
    if (!spot) return;
    // A suggestion can't sit inside or around another suggestion.
    if (kind === "suggest") {
      const inside = (spot.range.commonAncestorContainer instanceof Element
        ? spot.range.commonAncestorContainer
        : spot.range.commonAncestorContainer.parentElement)?.closest("del[data-suggestion]");
      if (inside || spot.range.cloneContents().querySelector("del[data-suggestion]")) {
        setError("This text already has a suggested edit.");
        setForm({ ...spot, kind, blocked: true });
        return;
      }
    }
    setError("");
    setBody("");
    setReplacement(kind === "suggest" ? spot.quote : "");
    setForm({ ...spot, kind, blocked: false });
    setSpot(null);
  };

  const submit = async () => {
    if (!form || busy) return;
    if (form.kind === "comment" && !body.trim()) return;
    if (form.kind === "suggest" && replacement === form.quote) {
      setError("Change the text to suggest an edit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ kind: form.kind, range: form.range, block: form.block, quote: form.quote, body, suggestion: replacement });
      setForm(null);
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  if (form) {
    const { blocked } = form;
    // Portalled to <body> so no editor container (transforms, overflow, button
    // styles) can clip or restyle it.
    return createPortal(
      <form
        ref={formRef}
        className={styles.form}
        // Hidden for the first layout pass, until it's measured and placed.
        style={formPos ? { top: formPos.top, left: formPos.left } : { top: 0, left: 0, visibility: "hidden" }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className={styles.formTitle}>{form.kind === "suggest" ? "Suggest an edit" : "Comment"}</p>
        {form.kind === "suggest" && !blocked && (
          <>
            <p className={styles.original}>
              <del>{form.quote}</del>
            </p>
            <label className={styles.label}>
              Replace with
              <textarea
                autoFocus
                rows={2}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Leave empty to suggest deleting it"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
              />
            </label>
          </>
        )}
        {!blocked && (
          <label className={styles.label}>
            {form.kind === "suggest" ? "Note (optional)" : `On “${form.quote.length > 60 ? form.quote.slice(0, 60) + "…" : form.quote}”`}
            <MentionTextarea
              className={styles.field}
              autoFocus={form.kind === "comment"}
              rows={form.kind === "suggest" ? 2 : 3}
              value={body}
              onChange={setBody}
              people={people}
              menuBelow
              placeholder={form.kind === "suggest" ? "Why this change? Type @ to mention someone" : "Write a comment — type @ to mention someone"}
              onSubmit={() => void submit()}
            />
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={busy} onClick={() => setForm(null)}>
            {blocked ? "Close" : "Cancel"}
          </button>
          {!blocked && (
            <button type="submit" className={styles.submit} disabled={busy || (form.kind === "comment" && !body.trim())}>
              {busy ? "Saving…" : form.kind === "suggest" ? "Suggest" : "Comment"}
            </button>
          )}
        </div>
      </form>,
      document.body,
    );
  }

  if (!spot) return null;
  return createPortal(
    <div
      className={styles.toolbar}
      style={{ top: Math.max(8, spot.rect.top - 40), left: Math.max(8, spot.rect.left) }}
      // Keep the text selection while the buttons are pressed.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" onClick={() => open("comment")}>
        <Icon name="comment" /> Comment
      </button>
      {suggest && (
        <button type="button" onClick={() => open("suggest")}>
          <Icon name="pencil" /> Suggest edit
        </button>
      )}
    </div>,
    document.body,
  );
}
