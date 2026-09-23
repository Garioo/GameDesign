"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useFollowed } from "@/lib/follow";
import styles from "./LiveCursors.module.css";

/* ---------------------------------------------------------------------------
 * Live carets on a page. Everyone with the page open joins a per-page
 * channel: presence says who's here (and drops them when they leave or their
 * connection dies), broadcasts carry where their caret / selection is.
 *
 * A position is (block id, start, end) as text offsets inside that block's
 * .blk-text — the same offset space as the editor's caret helpers — so it
 * lands on the same character whatever the other person's window size, zoom
 * or scroll. Carets are drawn in a pointer-transparent layer over the editor,
 * never inside the contentEditable DOM.
 * ------------------------------------------------------------------------- */

const TOPBAR = 58; // matches .topbar height (chrome.css)
const SEND_EVERY = 70; // ms between caret broadcasts while moving
const ACTIVE_FOR = 2500; // name tag stays open this long after a move

interface Me {
  userId: string;
  name: string;
  initials: string;
  color: string;
}
interface CursorMsg {
  tab: string;
  userId: string;
  name: string;
  initials: string;
  color: string;
  /** null = on the page, but not in the text. */
  blockId: string | null;
  start: number;
  end: number;
}
type Remote = CursorMsg & { moved: number };

interface Drawn {
  tab: string;
  name: string;
  initials: string;
  color: string;
  blockId: string;
  active: boolean;
  caret: { x: number; y: number; h: number };
  sel: { x: number; y: number; w: number; h: number }[];
  /** Where the caret is relative to the visible part of the window. */
  off: "above" | "below" | null;
}

/* ---------- offsets <-> DOM (text-node walk, like BlockEditor's helpers) ---------- */
function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(node, offset);
  return pre.toString().length;
}

function locate(el: HTMLElement, offset: number): { node: Text; off: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node: Text | null;
  let remaining = offset;
  while ((node = walker.nextNode() as Text | null)) {
    if (remaining <= node.length) return { node, off: remaining };
    remaining -= node.length;
    last = node;
  }
  // The text is shorter than the offset (their edit hasn't reached us yet).
  return last ? { node: last, off: last.length } : null;
}

function caretRect(el: HTMLElement, offset: number): { x: number; y: number; h: number } {
  const at = locate(el, offset);
  if (at) {
    const r = document.createRange();
    r.setStart(at.node, at.off);
    r.collapse(true);
    const rect = r.getClientRects()[0];
    if (rect && rect.height > 0) return { x: rect.left, y: rect.top, h: rect.height };
    // Collapsed ranges have no box at some node edges: measure a neighbouring character.
    if (at.off < at.node.length) {
      r.setEnd(at.node, at.off + 1);
      const next = r.getClientRects()[0];
      if (next) return { x: next.left, y: next.top, h: next.height };
    }
    if (at.off > 0) {
      r.setStart(at.node, at.off - 1);
      r.setEnd(at.node, at.off);
      const prev = r.getClientRects()[0];
      if (prev) return { x: prev.right, y: prev.top, h: prev.height };
    }
  }
  // Empty block: start of its first line.
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;
  return {
    x: box.left + (parseFloat(cs.paddingLeft) || 0),
    y: box.top + (parseFloat(cs.paddingTop) || 0),
    h: lh,
  };
}

function selectionRects(el: HTMLElement, start: number, end: number): DOMRect[] {
  const a = locate(el, start);
  const b = locate(el, end);
  if (!a || !b) return [];
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  return [...r.getClientRects()].filter((q) => q.width > 0.5).slice(0, 60);
}

/** Our own caret / selection, if it's in this page's text. */
function readLocal(root: HTMLElement): { blockId: string; start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.focusNode) return null;
  const focusEl = (sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode.parentElement)?.closest<HTMLElement>(
    ".blk-text",
  );
  if (!focusEl || !root.contains(focusEl)) return null;
  const blockId = focusEl.closest<HTMLElement>(".blk[data-block-id]")?.dataset.blockId;
  if (!blockId) return null;
  const focus = offsetIn(focusEl, sel.focusNode, sel.focusOffset);
  // A selection is only shown within one block (each block is its own contentEditable).
  if (sel.anchorNode && focusEl.contains(sel.anchorNode)) {
    const anchor = offsetIn(focusEl, sel.anchorNode, sel.anchorOffset);
    return { blockId, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
  }
  return { blockId, start: focus, end: focus };
}

function textElFor(root: HTMLElement, blockId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`.blk[data-block-id="${CSS.escape(blockId)}"] .blk-text`);
}

export default function LiveCursors({ pageId, me }: { pageId: string; me: Me | null }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const tab = useMemo(() => crypto.randomUUID(), []);
  const remotes = useRef(new Map<string, Remote>());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  // Following someone (top bar → Follow): keep the block they're in on screen.
  const followed = useFollowed();
  const followedRef = useRef(followed);
  followedRef.current = followed;
  const [layerBox, setLayerBox] = useState<{ left: number; width: number } | null>(null);

  // The editor root (.blocks) is the previous sibling in the page's <article>.
  const editorRoot = useCallback(
    () => layerRef.current?.parentElement?.querySelector<HTMLElement>(".blocks") ?? null,
    [],
  );

  /* ---------- draw ---------- */
  const frame = useRef<number | null>(null);
  const measure = useCallback(() => {
    const layer = layerRef.current;
    const root = editorRoot();
    if (!layer || !root) return;
    const origin = layer.getBoundingClientRect();
    const now = Date.now();
    const out: Drawn[] = [];
    for (const r of remotes.current.values()) {
      if (!r.blockId) continue;
      const el = textElFor(root, r.blockId);
      if (!el) continue;
      const c = caretRect(el, r.end);
      const sel =
        r.end > r.start
          ? selectionRects(el, r.start, r.end).map((q) => ({
              x: q.left - origin.left,
              y: q.top - origin.top,
              w: q.width,
              h: q.height,
            }))
          : [];
      out.push({
        tab: r.tab,
        name: r.name,
        initials: r.initials,
        color: r.color,
        blockId: r.blockId,
        active: now - r.moved < ACTIVE_FOR,
        caret: { x: c.x - origin.left, y: c.y - origin.top, h: c.h },
        sel,
        off: c.y + c.h < TOPBAR ? "above" : c.y > window.innerHeight ? "below" : null,
      });
    }
    setDrawn(out);
    setLayerBox({ left: origin.left, width: origin.width });
  }, [editorRoot]);
  const redraw = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measure();
    });
  }, [measure]);

  const followBlock = useCallback(
    (blockId: string) => {
      const el = editorRoot()?.querySelector<HTMLElement>(`.blk[data-block-id="${CSS.escape(blockId)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < TOPBAR + 40 || r.bottom > window.innerHeight - 120) el.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [editorRoot],
  );

  /* ---------- channel ---------- */
  const last = useRef<{ sent: number; key: string; timer: ReturnType<typeof setTimeout> | null }>({
    sent: 0,
    key: "",
    timer: null,
  });
  const sendNow = useCallback(
    (force = false) => {
      const who = meRef.current;
      const channel = channelRef.current;
      const root = editorRoot();
      if (!who || !channel || !root) return;
      const pos = readLocal(root);
      const key = pos ? `${pos.blockId}:${pos.start}:${pos.end}` : "-";
      if (!force && key === last.current.key) return;
      last.current.key = key;
      last.current.sent = Date.now();
      const msg: CursorMsg = {
        tab,
        userId: who.userId,
        name: who.name,
        initials: who.initials,
        color: who.color,
        blockId: pos?.blockId ?? null,
        start: pos?.start ?? 0,
        end: pos?.end ?? 0,
      };
      channel.send({ type: "broadcast", event: "cursor", payload: msg });
    },
    [editorRoot, tab],
  );
  // Leading + trailing throttle, so a burst of typing costs a few messages.
  const send = useCallback(() => {
    const st = last.current;
    const wait = SEND_EVERY - (Date.now() - st.sent);
    if (wait <= 0) {
      sendNow();
    } else if (!st.timer) {
      st.timer = setTimeout(() => {
        st.timer = null;
        sendNow();
      }, wait);
    }
  }, [sendNow]);

  const myId = me?.userId ?? null;
  useEffect(() => {
    const channel = supabase.channel(`cursors:${pageId}`, {
      config: { broadcast: { self: false }, presence: { key: tab } },
    });
    const st = last.current;
    const map = remotes.current;
    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const m = payload as CursorMsg;
        if (!m?.tab || m.userId === myId) return; // our own other tabs aren't "someone else"
        const prev = map.get(m.tab);
        const moved = !prev || prev.blockId !== m.blockId || prev.start !== m.start || prev.end !== m.end;
        map.set(m.tab, { ...m, moved: moved ? Date.now() : prev.moved });
        if (m.blockId && m.userId === followedRef.current?.key && prev?.blockId !== m.blockId) {
          followBlock(m.blockId);
        }
        redraw();
      })
      .on("presence", { event: "sync" }, () => {
        // Presence is the source of truth for who's still here.
        const here = new Set(Object.keys(channel.presenceState()));
        for (const t of [...map.keys()]) if (!here.has(t)) map.delete(t);
        redraw();
      })
      .on("presence", { event: "join" }, ({ key }) => {
        // Someone arrived: tell them where we are (they missed our last move).
        if (key !== tab) setTimeout(() => sendNow(true), 300);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ at: Date.now() });
        sendNow(true);
      });
    channelRef.current = channel;
    return () => {
      if (st.timer) clearTimeout(st.timer);
      st.timer = null;
      st.key = "";
      channelRef.current = null;
      map.clear();
      setDrawn([]);
      supabase.removeChannel(channel);
    };
  }, [pageId, tab, myId, redraw, sendNow, followBlock]);

  // Starting to follow someone who's already here: go to them straight away.
  useEffect(() => {
    if (!followed) return;
    const r = [...remotes.current.values()].find((x) => x.userId === followed.key && x.blockId);
    if (r?.blockId) followBlock(r.blockId);
  }, [followed, followBlock]);

  /* ---------- listeners ---------- */
  // Our caret moved (clicks, arrows, typing, selecting).
  useEffect(() => {
    document.addEventListener("selectionchange", send);
    return () => document.removeEventListener("selectionchange", send);
  }, [send]);

  // Anything that moves text around on our screen moves their carets too.
  useLayoutEffect(() => {
    const root = editorRoot();
    const onScroll = () => redraw();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    const mo = root ? new MutationObserver(redraw) : null;
    mo?.observe(root!, { subtree: true, childList: true, characterData: true });
    const ro = root ? new ResizeObserver(redraw) : null;
    ro?.observe(root!);
    // Name tags fold away a moment after someone stops moving.
    const tick = setInterval(() => {
      if (remotes.current.size) redraw();
    }, 1000);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      mo?.disconnect();
      ro?.disconnect();
      clearInterval(tick);
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [editorRoot, redraw, pageId]);

  const jumpTo = (blockId: string) => {
    const root = editorRoot();
    const el = root?.querySelector(`.blk[data-block-id="${CSS.escape(blockId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const above = drawn.filter((d) => d.off === "above");
  const below = drawn.filter((d) => d.off === "below");
  const pill = (d: Drawn, dir: "above" | "below") => (
    <button
      key={d.tab}
      className={styles.pill}
      style={{ "--c": d.color } as React.CSSProperties}
      onClick={() => jumpTo(d.blockId)}
      title={`Jump to ${d.name}`}
    >
      <span className={styles.pillDot}>{d.initials}</span>
      {d.name}
      <span aria-hidden>{dir === "above" ? "↑" : "↓"}</span>
    </button>
  );

  return (
    <>
      <div ref={layerRef} className={styles.layer} aria-hidden>
        {drawn.map((d) => (
          <div key={d.tab} style={{ "--c": d.color } as React.CSSProperties}>
            {d.sel.map((s, i) => (
              <div key={i} className={styles.sel} style={{ left: s.x, top: s.y, width: s.w, height: s.h }} />
            ))}
            <div
              className={d.active ? `${styles.caret} ${styles.moving}` : styles.caret}
              style={{ left: d.caret.x, top: d.caret.y, height: d.caret.h }}
            >
              <span className={d.active ? `${styles.tag} ${styles.tagOpen}` : styles.tag}>
                {d.active ? d.name : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
      {layerBox &&
        (above.length > 0 || below.length > 0) &&
        createPortal(
          <>
            {above.length > 0 && (
              <div className={`${styles.edge} ${styles.edgeTop}`} style={{ left: layerBox.left, width: layerBox.width }}>
                {above.map((d) => pill(d, "above"))}
              </div>
            )}
            {below.length > 0 && (
              <div
                className={`${styles.edge} ${styles.edgeBottom}`}
                style={{ left: layerBox.left, width: layerBox.width }}
              >
                {below.map((d) => pill(d, "below"))}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
