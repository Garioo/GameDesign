"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_TONES, type Block, type BlockTone, type BlockType, type CurveData } from "./data";
import GoogleDriveBlock from "./GoogleDriveBlock";
import CurveBlock, { DEFAULT_CURVE } from "./CurveBlock";
import { getFileContent, getRepoTree, getGithubToken, GithubError } from "@/lib/github";
import { detectLang, highlightLines, langLabel, renderLine } from "./highlight";
import { MENTION_REF_RE, mentionHref, type MentionTarget } from "./mentions";
import "./BlockEditor.css";

// True when the editor renders for a viewer: blocks display normally but
// nothing is editable. Context (rather than prop-threading) so the nested
// block components (tables, images, tone picker…) can all consume it.
const ReadOnlyCtx = createContext(false);

/* ---------- slash-menu icons (no emoji) ---------- */
const sv = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IText = () => (
  <svg viewBox="0 0 24 24" {...sv}><path d="M4 6h16M4 12h16M4 18h11" /></svg>
);
const IH2 = () => (
  <svg viewBox="0 0 24 24" {...sv}><path d="M6 5v14M16 5v14M6 12h10" /></svg>
);
const IH3 = () => (
  <svg viewBox="0 0 24 24" {...sv}><path d="M7 7v10M16 7v10M7 12h9" /></svg>
);
const IBullet = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
const INumbered = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 5.5 5.5 4.5v4M4 11h2.5l-2.5 3h2.5M4 17h2a1 1 0 0 1 0 2H5a1 1 0 0 0 0 2h1.5" strokeWidth="1.4" />
  </svg>
);
const ITodo = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="m8.5 12 2.5 2.5 5-5.5" />
  </svg>
);
const IQuote = () => (
  <svg viewBox="0 0 24 24" {...sv}><path d="M5 5v14M10 8h9M10 12h9M10 16h6" /></svg>
);
const ICallout = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);
const IDivider = () => (
  <svg viewBox="0 0 24 24" {...sv}><path d="M4 12h16" /></svg>
);
const ITable = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </svg>
);
const ICopy = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
);
const ITrash = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
  </svg>
);
const IImage = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </svg>
);
const ICode = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />
  </svg>
);
const IPage = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
const ICurve = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <path d="M4 4v15a1 1 0 0 0 1 1h15" />
    <path d="M7 17c6 0 9-2.5 11-10" />
  </svg>
);
const IGrid = () => (
  <svg viewBox="0 0 24 24" {...sv}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

type MenuItem = { type: BlockType; label: string; hint: string; Icon: () => React.ReactElement };
const MENU: MenuItem[] = [
  { type: "text", label: "Text", hint: "Just start writing", Icon: IText },
  { type: "h2", label: "Heading", hint: "Large section heading", Icon: IH2 },
  { type: "h3", label: "Subheading", hint: "Smaller heading", Icon: IH3 },
  { type: "bullet", label: "Bulleted list", hint: "A simple bullet list", Icon: IBullet },
  { type: "numbered", label: "Numbered list", hint: "A list with numbering", Icon: INumbered },
  { type: "todo", label: "To-do list", hint: "Track tasks with checkboxes", Icon: ITodo },
  { type: "quote", label: "Quote", hint: "Capture a quote", Icon: IQuote },
  { type: "callout", label: "Callout", hint: "Make text stand out", Icon: ICallout },
  { type: "image", label: "Image", hint: "Upload or embed a picture", Icon: IImage },
  { type: "googleDrive", label: "Google Drive", hint: "Search your Google documents and embed one", Icon: IGrid },
  { type: "script", label: "Script", hint: "Attach a file from the GitHub repo", Icon: ICode },
  { type: "table", label: "Table", hint: "Add a simple table", Icon: ITable },
  { type: "curve", label: "Stat curve", hint: "Plot a formula or hand-drawn curve", Icon: ICurve },
  { type: "divider", label: "Divider", hint: "Visually separate blocks", Icon: IDivider },
];

const PLACEHOLDER: Record<BlockType, string> = {
  text: "Type '/' for commands",
  h2: "Heading",
  h3: "Subheading",
  bullet: "List",
  numbered: "List",
  todo: "To-do",
  quote: "Empty quote",
  callout: "Type something…",
  divider: "",
  table: "",
  image: "",
  script: "",
  curve: "",
  googleDrive: "",
};

// Blocks with no inline-editable text (rendered as standalone "chrome").
const isChromeBlock = (t: BlockType) =>
  t === "divider" || t === "table" || t === "image" || t === "script" || t === "curve" || t === "googleDrive";

// UUID so new blocks upsert directly into the `blocks` table (uuid PK).
const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/* ---------- image helpers ---------- */
// Read a picked/dropped image file into a data-URL, downscaling large rasters so
// the encoded string we persist (and broadcast over realtime) stays reasonable.
// GIF/SVG pass through untouched to preserve animation / vectors.
async function readImageFile(file: File, maxDim = 1600): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  // GIF/SVG bypass canvas re-encoding, so enforce the size budget directly —
  // oversized data URLs would otherwise be stored verbatim in block content.
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    if (dataUrl.length > 1_200_000) {
      throw new Error("Image is too large (max ~1 MB for GIF/SVG)");
    }
    return dataUrl;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale === 1 && dataUrl.length < 1_200_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.85);
  } catch {
    return dataUrl;
  }
}

/* ---------- inline-HTML sanitizer ---------- */
// Block text is stored as a tiny HTML subset so ⌘B/⌘I/⌘E formatting survives
// persistence and realtime. Mention chips (<a data-mention>) are normalized to
// a canonical attribute set with the href re-derived from data-page, so no
// markup or URL from the outside is ever trusted. Everything else (attributes,
// unknown tags) is stripped down to its text content at every read and write.
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "CODE", "BR"]);

function sanitizeHtml(html: string): string {
  if (!/[<&]/.test(html)) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (el.tagName === "A" && el.hasAttribute("data-mention")) {
          const ref = el.getAttribute("data-page") ?? "";
          const label = (el.textContent ?? "").trim();
          if (MENTION_REF_RE.test(ref) && label) {
            el.textContent = label; // flatten any formatting nested in the chip
            while (el.attributes.length) el.removeAttribute(el.attributes[0].name);
            el.setAttribute("data-mention", "");
            el.setAttribute("data-page", ref);
            el.setAttribute("contenteditable", "false");
            el.setAttribute("href", mentionHref(ref));
            continue;
          }
          // invalid ref / empty label — falls through and gets unwrapped
        }
        walk(el);
        if (ALLOWED_TAGS.has(el.tagName)) {
          while (el.attributes.length) el.removeAttribute(el.attributes[0].name);
        } else {
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
        }
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child); // comments & friends
      }
    }
  };
  walk(root);
  // A trailing <br> is just contentEditable's empty-line filler — drop it so
  // empty blocks stay truly empty (placeholders rely on :empty).
  return root.innerHTML.replace(/<br\s*\/?>$/i, "");
}

/* ---------- caret helpers ---------- */
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return el.innerText.length;
  const range = sel.getRangeAt(0).cloneRange();
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}
function isCollapsed(): boolean {
  const sel = window.getSelection();
  return !sel || sel.isCollapsed;
}
// Non-editable atom (mention chip) wrapping a node, if any.
function closestAtom(n: Node, root: HTMLElement): Element | null {
  let cur: Node | null = n.parentNode;
  while (cur && cur !== root) {
    if (cur instanceof Element && cur.getAttribute("contenteditable") === "false") return cur;
    cur = cur.parentNode;
  }
  return null;
}
function placeCaret(el: HTMLElement, pos: "start" | "end" | number) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (typeof pos === "number") {
    // Walk text nodes so the offset lands correctly inside formatted content.
    let remaining = pos;
    let placed = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (remaining <= node.length) {
        // Never land inside a non-editable chip — settle right after it.
        const atom = closestAtom(node, el);
        if (atom) range.setStartAfter(atom);
        else range.setStart(node, remaining);
        placed = true;
        break;
      }
      remaining -= node.length;
    }
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.collapse(true);
    }
  } else {
    range.selectNodeContents(el);
    range.collapse(pos === "start");
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// Build a range between two text offsets (same walk as placeCaret).
function rangeFromOffsets(el: HTMLElement, start: number, end: number): Range | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startSet = false;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const next = offset + node.length;
    if (!startSet && start <= next) {
      range.setStart(node, start - offset);
      startSet = true;
    }
    if (startSet && end <= next) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  return null;
}

// Total text-node length (matches the offset space of caretOffset).
function textLength(el: HTMLElement): number {
  let n = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) n += node.length;
  return n;
}

// Plain text from the block start to the (collapsed) caret.
function textBeforeCaret(el: HTMLElement): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const pre = sel.getRangeAt(0).cloneRange();
  const at = pre.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(at.endContainer, at.endOffset);
  return pre.toString();
}

// The mention chip sitting immediately before a collapsed caret, if any.
// (Chromium deletes contenteditable=false atoms atomically on Backspace;
// this makes Safari behave the same.)
function chipBeforeCaret(): Element | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const { startContainer, startOffset } = sel.getRangeAt(0);
  let prev: Node | null = null;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset > 0) return null; // caret is mid-text
    prev = startContainer.previousSibling;
  } else {
    prev = startContainer.childNodes[startOffset - 1] ?? null;
  }
  return prev instanceof Element && prev.matches("a[data-mention]") ? prev : null;
}

// "@query" must start the block or follow whitespace / an opening bracket, so
// emails and mid-word @s never open the menu. "[[query" works anywhere.
const AT_TRIGGER_RE = /(^|[\s([{])@([^@\n]{0,40})$/;
const WIKI_TRIGGER_RE = /\[\[([^[\]\n]{0,40})$/;

type Slash = { id: string; query: string; index: number };
type Mention = { id: string; query: string; trigger: "@" | "[["; index: number };
type FocusReq = { id: string; pos: "start" | "end" | number };

export default function BlockEditor({
  blocks,
  onChange,
  onLiveInput,
  repo,
  mentionTargets = [],
  validRefs,
  onNavigate,
  readOnly = false,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  // Fired on every keystroke (not on slash queries). Lets the parent push the
  // edit out live without re-rendering this editor (no caret disruption).
  onLiveInput?: (blockId: string, text: string, blocks: Block[]) => void;
  // Workspace GitHub repository ("owner/name") for script blocks, if linked.
  repo?: string | null;
  // Pages/canvases offered by the @-mention autocomplete.
  mentionTargets?: MentionTarget[];
  // Refs that still resolve — chips pointing elsewhere render as dangling.
  validRefs?: Set<string>;
  // Follow a mention chip ("<pageId>" or "canvas:<id>").
  onNavigate?: (ref: string) => void;
  // Viewer mode: render everything, mutate nothing (RLS rejects writes anyway).
  readOnly?: boolean;
}) {
  // Belt and braces: even if some affordance slips through, no change events
  // ever leave a read-only editor.
  if (readOnly) {
    onChange = () => {};
    onLiveInput = undefined;
  }
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [slash, setSlash] = useState<Slash | null>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [focusReq, setFocusReq] = useState<FocusReq | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  // Re-focus a block after a structural change has rendered.
  useEffect(() => {
    if (!focusReq) return;
    const el = refs.current.get(focusReq.id);
    if (el) placeCaret(el, focusReq.pos);
    setFocusReq(null);
  }, [focusReq, blocks]);

  // Close the block menu on an outside click.
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".blk-menu") && !t.closest(".blk-handle")) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuFor]);

  const register = (id: string, el: HTMLDivElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  // Snapshot live DOM content for text-bearing blocks; tables/dividers pass
  // through. Text is stored as sanitized inline HTML (bold/italic/code).
  const readBlocks = (): Block[] =>
    blocks.map((b) => {
      if (isChromeBlock(b.type)) return b;
      const el = refs.current.get(b.id);
      return el ? { ...b, text: sanitizeHtml(el.innerHTML) } : b;
    });

  const filtered = (q: string) =>
    MENU.filter((m) => m.label.toLowerCase().includes(q.toLowerCase()));

  const mentionMatches = (q: string): MentionTarget[] => {
    const s = q.trim().toLowerCase();
    return mentionTargets.filter((t) => !s || t.title.toLowerCase().includes(s)).slice(0, 8);
  };

  const isListType = (t: BlockType) => t === "bullet" || t === "numbered" || t === "todo";

  /* ---------- structural operations ---------- */
  const handleEnter = (id: string) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const block = cur[idx];
    const el = refs.current.get(id)!;
    const offset = caretOffset(el);
    const plain = el.innerText.replace(/\n$/, "");

    if (isListType(block.type) && plain === "") {
      const next = [...cur];
      next[idx] = { ...block, type: "text", checked: undefined };
      onChange(next);
      setFocusReq({ id, pos: "start" });
      return;
    }

    // Split the live DOM at the caret so inline formatting and mention chips
    // survive on both sides. (A chip split exactly at its edge leaves an
    // empty-label half, which the sanitizer drops.)
    let before = block.text;
    let after = "";
    const total = textLength(el);
    if (offset < total) {
      const range = rangeFromOffsets(el, offset, total);
      if (range) {
        const tmp = document.createElement("div");
        tmp.appendChild(range.extractContents());
        after = sanitizeHtml(tmp.innerHTML);
        before = sanitizeHtml(el.innerHTML);
      } else {
        before = plain.slice(0, offset);
        after = plain.slice(offset);
      }
    }

    const nextType: BlockType = isListType(block.type) ? block.type : "text";
    const nb: Block = { id: newId(), type: nextType, text: after };
    const next = [...cur];
    next[idx] = { ...block, text: before };
    next.splice(idx + 1, 0, nb);
    onChange(next);
    setFocusReq({ id: nb.id, pos: "start" });
  };

  // Replace the trigger + query before the caret with a mention chip.
  const insertMention = (id: string, target: MentionTarget) => {
    const el = refs.current.get(id);
    const m = mention;
    setMention(null);
    if (!el || !m || m.id !== id) return;
    const end = caretOffset(el);
    const start = Math.max(end - m.query.length - m.trigger.length, 0);
    const range = rangeFromOffsets(el, start, end);
    if (!range) return;
    range.deleteContents();
    const chip = document.createElement("a");
    chip.setAttribute("data-mention", "");
    chip.setAttribute("data-page", target.ref);
    chip.setAttribute("contenteditable", "false");
    chip.setAttribute("href", mentionHref(target.ref));
    chip.textContent = target.title;
    range.insertNode(chip);
    const space = document.createTextNode(" ");
    chip.after(space);
    // Caret directly after the space, via the DOM (not focusReq) so there is
    // no re-render race; the state commit below round-trips to the same HTML.
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.setStart(space, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    onChange(readBlocks());
  };

  // Returns true if it consumed the keystroke.
  const handleBackspaceAtStart = (id: string): boolean => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    if (idx <= 0) return false;
    const prev = cur[idx - 1];
    const block = cur[idx];

    if (prev.type === "divider") {
      const next = [...cur];
      next.splice(idx - 1, 1);
      onChange(next);
      setFocusReq({ id, pos: "start" });
      return true;
    }
    if (prev.type === "table" || prev.type === "image" || prev.type === "script" || prev.type === "curve" || prev.type === "googleDrive") return false; // don't merge into these

    const prevEl = refs.current.get(prev.id);
    const caretAt = prevEl ? prevEl.innerText.replace(/\n$/, "").length : prev.text.length;
    const next = [...cur];
    next[idx - 1] = { ...prev, text: prev.text + block.text };
    next.splice(idx, 1);
    onChange(next);
    setFocusReq({ id: prev.id, pos: caretAt });
    return true;
  };

  const chooseType = (id: string, type: BlockType) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const block = cur[idx];

    // Block types with no inline text get a trailing text block to keep writing.
    if (isChromeBlock(type)) {
      const next = [...cur];
      next[idx] =
        type === "table"
          ? {
              id: block.id,
              type: "table",
              text: "",
              rows: [
                ["", ""],
                ["", ""],
              ],
            }
          : type === "googleDrive"
            ? { id: block.id, type: "googleDrive", text: "" }
          : type === "image"
            ? { id: block.id, type: "image", text: "", src: "" }
            : type === "script"
              ? { id: block.id, type: "script", text: "" }
              : type === "curve"
                ? {
                    id: block.id,
                    type: "curve",
                    text: "",
                    curve: JSON.parse(JSON.stringify(DEFAULT_CURVE)) as CurveData,
                  }
                : { id: block.id, type: "divider", text: "" };
      const nb: Block = { id: newId(), type: "text", text: "" };
      next.splice(idx + 1, 0, nb);
      onChange(next);
      setSlash(null);
      setFocusReq({ id: nb.id, pos: "start" });
      return;
    }

    const next = [...cur];
    next[idx] = { id: block.id, type, text: "" };
    onChange(next);
    setSlash(null);
    setFocusReq({ id, pos: "start" });
  };

  const insertAfter = (id: string) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const nb: Block = { id: newId(), type: "text", text: "" };
    const next = [...cur];
    next.splice(idx + 1, 0, nb);
    onChange(next);
    setFocusReq({ id: nb.id, pos: "start" });
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    const next = readBlocks().map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange(next);
  };

  const deleteBlock = (id: string) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const next = cur.filter((b) => b.id !== id);
    setMenuFor(null);
    if (next.length === 0) {
      const nb: Block = { id: newId(), type: "text", text: "" };
      onChange([nb]);
      setFocusReq({ id: nb.id, pos: "start" });
      return;
    }
    onChange(next);
    const neighbour = cur[idx - 1] ?? cur[idx + 1];
    if (neighbour && !isChromeBlock(neighbour.type)) {
      setFocusReq({ id: neighbour.id, pos: "end" });
    }
  };

  const duplicateBlock = (id: string) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const orig = cur[idx];
    const copy: Block = {
      ...orig,
      id: newId(),
      rows: orig.rows ? orig.rows.map((r) => [...r]) : undefined,
      curve: orig.curve ? (JSON.parse(JSON.stringify(orig.curve)) as CurveData) : undefined,
    };
    const next = [...cur];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setMenuFor(null);
  };

  const reorder = (from: string, to: string) => {
    if (from === to) return;
    const cur = readBlocks();
    const fromIdx = cur.findIndex((b) => b.id === from);
    if (fromIdx < 0) return;
    const next = [...cur];
    const [moved] = next.splice(fromIdx, 1);
    const toIdx = next.findIndex((b) => b.id === to);
    if (toIdx < 0) return;
    next.splice(toIdx, 0, moved);
    onChange(next);
  };

  /* ---------- per-block text handlers ---------- */
  const onInput = (id: string, el: HTMLDivElement) => {
    const text = el.innerText;
    if (text.startsWith("/") && !text.slice(1).includes(" ")) {
      setSlash({ id, query: text.slice(1), index: 0 });
      if (mention) setMention(null);
      return; // don't broadcast a slash query
    }
    if (slash && slash.id === id) setSlash(null);

    // @-mention session — recomputed from the text before the caret on every
    // input, so deletions close it naturally. Unlike slash queries this is
    // real prose and broadcasts as normal text.
    const before = textBeforeCaret(el);
    const at = before?.match(AT_TRIGGER_RE);
    const wiki = before?.match(WIKI_TRIGGER_RE);
    if (at || wiki) {
      // If both triggers match, the one closer to the caret (shorter query) wins.
      const useAt = !!at && (!wiki || at[2].length <= wiki[1].length);
      const query = useAt ? at![2] : wiki![1];
      // A query that ran past every title (and contains a space) is prose, not
      // a lookup — stop shadowing the user's sentence with an empty menu.
      if (mentionMatches(query).length === 0 && /\s/.test(query)) {
        if (mention) setMention(null);
      } else {
        setMention({ id, query, trigger: useAt ? "@" : "[[", index: 0 });
      }
    } else if (mention) {
      setMention(null);
    }
    onLiveInput?.(id, sanitizeHtml(el.innerHTML), readBlocks());
  };

  // "## " at the start of a plain text block converts it, Notion-style.
  const MD_TRIGGERS: Record<string, BlockType> = {
    "#": "h2",
    "##": "h3",
    "-": "bullet",
    "*": "bullet",
    "1.": "numbered",
    "[]": "todo",
    "[ ]": "todo",
    ">": "quote",
    "---": "divider",
  };

  // Toggle <code> around the selection (execCommand has no code variant).
  const toggleInlineCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const ancestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    const codeEl = ancestor?.closest("code");
    if (codeEl) {
      const parent = codeEl.parentNode;
      while (codeEl.firstChild) parent?.insertBefore(codeEl.firstChild, codeEl);
      parent?.removeChild(codeEl);
      return;
    }
    try {
      range.surroundContents(document.createElement("code"));
    } catch {
      // selection crosses element boundaries — wrap its extracted contents instead
      const code = document.createElement("code");
      code.appendChild(range.extractContents());
      range.insertNode(code);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    // ⌘B / ⌘I / ⌘E inline formatting
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i" || k === "e") {
        e.preventDefault();
        if (k === "e") toggleInlineCode();
        else document.execCommand(k === "b" ? "bold" : "italic");
        const el = refs.current.get(id);
        if (el) onInput(id, el);
        return;
      }
    }

    // Markdown shortcuts: trigger token + space at the start of a text block.
    if (e.key === " " && !e.metaKey && !e.ctrlKey && !(slash && slash.id === id)) {
      const el = refs.current.get(id);
      const block = blocks.find((b) => b.id === id);
      if (el && block?.type === "text" && isCollapsed()) {
        const plain = el.innerText.replace(/\n$/, "");
        const target = MD_TRIGGERS[plain];
        if (target && caretOffset(el) === plain.length) {
          e.preventDefault();
          chooseType(id, target);
          return;
        }
      }
    }
    onKeyDownRest(e, id);
  };

  const onKeyDownRest = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    // Mention menu first, so Enter never splits the block while it's open.
    if (mention && mention.id === id) {
      const items = mentionMatches(mention.query);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention({ ...mention, index: Math.min(mention.index + 1, Math.max(items.length - 1, 0)) });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention({ ...mention, index: Math.max(mention.index - 1, 0) });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pick = items[Math.min(mention.index, items.length - 1)];
        if (pick) {
          e.preventDefault();
          insertMention(id, pick);
          return;
        }
        setMention(null); // nothing to pick — let Enter split as usual
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
      // Caret left the query without an input event — close, keep the key.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") setMention(null);
    }

    if (slash && slash.id === id) {
      const items = filtered(slash.query);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash({ ...slash, index: Math.min(slash.index + 1, items.length - 1) });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash({ ...slash, index: Math.max(slash.index - 1, 0) });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (items[slash.index]) chooseType(id, items[slash.index].type);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
      if (e.key === "Backspace" && slash.query === "") setSlash(null);
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnter(id);
      return;
    }
    if (e.key === "Backspace") {
      // A chip directly before the caret deletes as one atom.
      const chip = chipBeforeCaret();
      if (chip) {
        e.preventDefault();
        chip.remove();
        const el = refs.current.get(id);
        if (el) onInput(id, el);
        return;
      }
      const el = refs.current.get(id);
      if (el && isCollapsed() && caretOffset(el) === 0) {
        if (handleBackspaceAtStart(id)) e.preventDefault();
      }
    }
  };

  // Display numbers for numbered-list runs (resets when the run breaks).
  let numberedRun = 0;
  const numberFor = (b: Block): number => {
    numberedRun = b.type === "numbered" ? numberedRun + 1 : 0;
    return numberedRun;
  };

  return (
    <ReadOnlyCtx.Provider value={readOnly}>
    <div
      className={"blocks" + (readOnly ? " read-only" : "")}
      onClick={(e) => {
        // Mention chips: plain click navigates in-app; cmd/ctrl/shift-click
        // falls through to the real href (open in new tab).
        const chip = (e.target as HTMLElement).closest?.("a[data-mention]");
        if (!chip || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        const ref = chip.getAttribute("data-page");
        if (ref) onNavigate?.(ref);
      }}
    >
      {blocks.map((b) => (
        <BlockRow
          key={b.id}
          block={b}
          index={numberFor(b)}
          repo={repo}
          validRefs={validRefs}
          onToggleChecked={() => updateBlock(b.id, { checked: !b.checked })}
          onSetScript={(patch) => updateBlock(b.id, patch)}
          register={register}
          focused={focusedId === b.id}
          menuOpen={menuFor === b.id}
          dragging={dragId === b.id}
          dropTarget={dropId === b.id && dragId !== null && dragId !== b.id}
          slash={slash && slash.id === b.id ? slash : null}
          menuItems={slash && slash.id === b.id ? filtered(slash.query) : []}
          mention={mention && mention.id === b.id ? mention : null}
          mentionItems={mention && mention.id === b.id ? mentionMatches(mention.query) : []}
          onPick={(type) => chooseType(b.id, type)}
          onPickMention={(t) => insertMention(b.id, t)}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setFocusedId(b.id)}
          onBlur={() => {
            setFocusedId((f) => (f === b.id ? null : f));
            setMention((m) => (m && m.id === b.id ? null : m));
            onChange(readBlocks());
          }}
          onTableChange={(rows) => updateBlock(b.id, { rows })}
          onDriveFileChange={(driveFile) => updateBlock(b.id, { driveFile })}
          onCurveChange={(curve) => updateBlock(b.id, { curve })}
          onSetImage={(src) => updateBlock(b.id, { src })}
          onSetCaption={(text) => updateBlock(b.id, { text })}
          onSetTone={(tone) => updateBlock(b.id, { tone })}
          onPlus={() => insertAfter(b.id)}
          onToggleMenu={() => setMenuFor((m) => (m === b.id ? null : b.id))}
          onDuplicate={() => duplicateBlock(b.id)}
          onDelete={() => deleteBlock(b.id)}
          onDragStart={() => setDragId(b.id)}
          onDragEnd={() => {
            setDragId(null);
            setDropId(null);
          }}
          onDragOver={() => dragId && dragId !== b.id && setDropId(b.id)}
          onDrop={() => {
            if (dragId) reorder(dragId, b.id);
            setDragId(null);
            setDropId(null);
          }}
        />
      ))}
    </div>
    </ReadOnlyCtx.Provider>
  );
}

/* ============================================================
   A single block row.
   ============================================================ */
function BlockRow({
  block,
  index,
  repo,
  validRefs,
  onToggleChecked,
  onSetScript,
  register,
  focused,
  menuOpen,
  dragging,
  dropTarget,
  slash,
  menuItems,
  mention,
  mentionItems,
  onPick,
  onPickMention,
  onInput,
  onKeyDown,
  onFocus,
  onBlur,
  onTableChange,
  onCurveChange,
  onDriveFileChange,
  onSetImage,
  onSetCaption,
  onSetTone,
  onPlus,
  onToggleMenu,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: Block;
  index: number;
  repo?: string | null;
  validRefs?: Set<string>;
  onToggleChecked: () => void;
  onSetScript: (patch: Partial<Block>) => void;
  register: (id: string, el: HTMLDivElement | null) => void;
  focused: boolean;
  menuOpen: boolean;
  dragging: boolean;
  dropTarget: boolean;
  slash: Slash | null;
  menuItems: MenuItem[];
  mention: Mention | null;
  mentionItems: MentionTarget[];
  onPick: (type: BlockType) => void;
  onPickMention: (target: MentionTarget) => void;
  onInput: (id: string, el: HTMLDivElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onTableChange: (rows: string[][]) => void;
  onCurveChange: (curve: CurveData) => void;
  onDriveFileChange: (file: NonNullable<Block["driveFile"]>) => void;
  onSetImage: (src: string) => void;
  onSetCaption: (text: string) => void;
  onSetTone: (tone: BlockTone) => void;
  onPlus: () => void;
  onToggleMenu: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const ref = useRef<HTMLDivElement | null>(null);

  // Keep DOM content in sync with state without disturbing the caret.
  // Compared on the sanitized form so browser HTML normalization can't loop.
  // block.text is sanitized again here: rows written to the DB by other
  // clients (or directly via the REST API) must never reach innerHTML raw.
  useEffect(() => {
    const el = ref.current;
    if (!el || isChromeBlock(block.type)) return;
    const clean = sanitizeHtml(block.text);
    if (sanitizeHtml(el.innerHTML) !== clean) el.innerHTML = clean;
  }, [block.text, block.type]);

  // Decorate mentions of deleted pages as dangling. Class-only: the sanitizer
  // strips attributes on every read, so it never reaches state or the DB.
  useEffect(() => {
    const el = ref.current;
    if (!el || isChromeBlock(block.type) || !validRefs) return;
    el.querySelectorAll("a[data-mention]").forEach((a) => {
      const target = a.getAttribute("data-page");
      a.classList.toggle("is-dangling", !target || !validRefs.has(target));
    });
  }, [block.text, block.type, validRefs]);

  const editable = !isChromeBlock(block.type) && (
    <div
      ref={(el) => {
        ref.current = el;
        register(block.id, el);
      }}
      className={"blk-text" + (focused ? " is-focused" : "")}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-ph={PLACEHOLDER[block.type]}
      onInput={(e) => onInput(block.id, e.currentTarget)}
      onKeyDown={(e) => onKeyDown(e, block.id)}
      onPaste={(e) => {
        // Paste as plain text — except for internal rich content carrying
        // mention chips, which round-trips through the sanitizer instead.
        e.preventDefault();
        const html = e.clipboardData.getData("text/html");
        if (html && html.includes("data-mention")) {
          document.execCommand("insertHTML", false, sanitizeHtml(html));
        } else {
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }
        onInput(block.id, e.currentTarget);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );

  let main: React.ReactNode;
  if (block.type === "divider") {
    main = <hr className="blk-hr" />;
  } else if (block.type === "table") {
    main = (
      <div className="blk-main">
        <TableBlock rows={block.rows ?? [["", ""]]} onChange={onTableChange} />
      </div>
    );
  } else if (block.type === "googleDrive") {
    main = <div className="blk-main"><GoogleDriveBlock file={block.driveFile} onChange={onDriveFileChange} readOnly={readOnly} /></div>;
  } else if (block.type === "image") {
    main = (
      <div className="blk-main">
        <ImageBlock
          src={block.src ?? ""}
          caption={block.text}
          onSetImage={onSetImage}
          onSetCaption={onSetCaption}
        />
      </div>
    );
  } else if (block.type === "script") {
    // Read-only: the script/curve internals keep their own controls, so the
    // whole card goes inert rather than threading the flag into each one.
    main = (
      <div className="blk-main" style={readOnly ? { pointerEvents: "none" } : undefined}>
        <ScriptBlock repo={repo} path={block.path} code={block.code} onSet={onSetScript} />
      </div>
    );
  } else if (block.type === "curve") {
    main = (
      <div className="blk-main" style={readOnly ? { pointerEvents: "none" } : undefined}>
        <CurveBlock data={block.curve} onChange={onCurveChange} />
      </div>
    );
  } else if (block.type === "bullet") {
    main = (
      <div className="blk-main bullet-row">
        <span className="blk-dot">•</span>
        {editable}
      </div>
    );
  } else if (block.type === "numbered") {
    main = (
      <div className="blk-main bullet-row">
        <span className="blk-num">{index}.</span>
        {editable}
      </div>
    );
  } else if (block.type === "todo") {
    main = (
      <div className={"blk-main todo-row" + (block.checked ? " is-checked" : "")}>
        <button
          className="blk-check"
          contentEditable={false}
          role="checkbox"
          aria-checked={!!block.checked}
          disabled={readOnly}
          title={readOnly ? undefined : block.checked ? "Mark as not done" : "Mark as done"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={readOnly ? undefined : onToggleChecked}
        >
          {block.checked && (
            <svg viewBox="0 0 24 24" {...sv} strokeWidth={3}>
              <path d="m5 13 5 5L20 7" />
            </svg>
          )}
        </button>
        {editable}
      </div>
    );
  } else if (block.type === "callout") {
    main = (
      <div className={"blk-main callout-box tone-" + (block.tone ?? "ember")}>
        <TonePicker tone={block.tone ?? "ember"} onSetTone={onSetTone} />
        {editable}
      </div>
    );
  } else if (block.type === "quote") {
    main = <div className="blk-main quote-box">{editable}</div>;
  } else {
    main = <div className="blk-main">{editable}</div>;
  }

  return (
    <div
      className={
        "blk blk-" +
        block.type +
        (dragging ? " is-dragging" : "") +
        (dropTarget ? " is-drop" : "")
      }
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        onDrop();
      }}
    >
      {!readOnly && (
        <div className={"blk-gutter" + (menuOpen ? " is-open" : "")} contentEditable={false}>
          <button
            className="blk-plus"
            title="Add block below"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onPlus}
          >
            +
          </button>
          <button
            className="blk-handle"
            title="Drag to move · click for options"
            draggable
            onClick={onToggleMenu}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            ⠿
          </button>
        </div>
      )}

      {!readOnly && menuOpen && (
        <div className="blk-menu" contentEditable={false}>
          <button onMouseDown={(e) => { e.preventDefault(); onDuplicate(); }}>
            <ICopy /> Duplicate
          </button>
          <button className="danger" onMouseDown={(e) => { e.preventDefault(); onDelete(); }}>
            <ITrash /> Delete
          </button>
        </div>
      )}

      {main}

      {slash && (
        <div className="slash-menu" contentEditable={false}>
          {menuItems.length === 0 && (
            <div className="slash-empty">No matching blocks</div>
          )}
          {menuItems.map((m, i) => (
            <button
              key={m.type}
              className={"slash-item" + (i === slash.index ? " is-active" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(m.type);
              }}
            >
              <span className="slash-glyph">
                <m.Icon />
              </span>
              <span className="slash-copy">
                <span className="slash-label">{m.label}</span>
                <span className="slash-hint">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {mention && (
        <div className="slash-menu mention-menu" contentEditable={false}>
          {mentionItems.length === 0 && (
            <div className="slash-empty">No matching pages</div>
          )}
          {mentionItems.map((t, i) => (
            <button
              key={t.ref}
              className={"slash-item" + (i === mention.index ? " is-active" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                onPickMention(t);
              }}
            >
              <span className="slash-glyph">{t.kind === "canvas" ? <IGrid /> : <IPage />}</span>
              <span className="slash-copy">
                <span className="slash-label">{t.title}</span>
                <span className="slash-hint">{t.group}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Table block — editable cells, Tab navigation, add/delete row & column.
   ============================================================ */
function TableBlock({
  rows,
  onChange,
}: {
  rows: string[][];
  onChange: (rows: string[][]) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const key = (r: number, c: number) => `${r}:${c}`;
  const cols = rows[0]?.length ?? 1;

  const read = (): string[][] =>
    rows.map((row, ri) =>
      row.map((cell, ci) => {
        const el = cellRefs.current.get(key(ri, ci));
        return el ? el.innerText.replace(/\n$/, "") : cell;
      }),
    );

  const commit = () => onChange(read());
  const addRow = () => onChange([...read(), new Array(cols).fill("")]);
  const addCol = () => onChange(read().map((row) => [...row, ""]));
  const delRow = (ri: number) => {
    if (rows.length <= 1) return;
    const r = read();
    r.splice(ri, 1);
    onChange(r);
  };
  const delCol = (ci: number) => {
    if (cols <= 1) return;
    onChange(read().map((row) => row.filter((_, i) => i !== ci)));
  };

  const focusCell = (ri: number, ci: number) => {
    const el = cellRefs.current.get(key(ri, ci));
    if (el) placeCaret(el, "end");
  };

  const onCellKey = (e: React.KeyboardEvent, ri: number, ci: number) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    let nr = ri;
    let nc = ci + (e.shiftKey ? -1 : 1);
    if (nc >= cols) {
      nc = 0;
      nr = ri + 1;
    }
    if (nc < 0) {
      nc = cols - 1;
      nr = ri - 1;
    }
    if (nr >= rows.length) {
      onChange([...read(), new Array(cols).fill("")]);
      setTimeout(() => focusCell(rows.length, 0), 0);
      return;
    }
    if (nr < 0) return;
    focusCell(nr, nc);
  };

  return (
    <div className="blk-table" contentEditable={false}>
      <div className="tbl-grid">
        <table className="tbl">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={ri === 0 ? "tbl-head" : undefined}>
                    {!readOnly && ci === 0 && rows.length > 1 && (
                      <button
                        className="row-del"
                        title="Delete row"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => delRow(ri)}
                      >
                        ×
                      </button>
                    )}
                    {!readOnly && ri === 0 && cols > 1 && (
                      <button
                        className="col-del"
                        title="Delete column"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => delCol(ci)}
                      >
                        ×
                      </button>
                    )}
                    <TableCell
                      value={cell}
                      register={(el) => {
                        if (el) cellRefs.current.set(key(ri, ci), el);
                        else cellRefs.current.delete(key(ri, ci));
                      }}
                      onBlur={commit}
                      onKeyDown={(e) => onCellKey(e, ri, ci)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && (
          <button
            className="tbl-add tbl-add-col"
            title="Add column"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addCol}
          >
            +
          </button>
        )}
      </div>
      {!readOnly && (
        <button
          className="tbl-add tbl-add-row"
          title="Add row"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addRow}
        >
          +
        </button>
      )}
    </div>
  );
}

function TableCell({
  value,
  register,
  onBlur,
  onKeyDown,
}: {
  value: string;
  register: (el: HTMLDivElement | null) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== value) el.innerText = value;
  }, [value]);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        register(el);
      }}
      className="tbl-cell"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}

/* ============================================================
   Image block — drag-drop / file-pick / paste-URL, with caption.
   ============================================================ */
function ImageBlock({
  src,
  caption,
  onSetImage,
  onSetCaption,
}: {
  src: string;
  caption: string;
  onSetImage: (src: string) => void;
  onSetCaption: (text: string) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const capRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const el = capRef.current;
    if (el && el.innerText !== caption) el.innerText = caption;
  }, [caption]);

  const pick = async (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setLoading(true);
    try {
      onSetImage(await readImageFile(file));
    } catch {
      /* unreadable or oversized image — keep the drop zone as-is */
    } finally {
      setLoading(false);
    }
  };

  if (!src) {
    if (readOnly) {
      return (
        <div className="img-drop" contentEditable={false}>
          <div className="img-drop-head">
            <span className="img-drop-glyph">
              <IImage />
            </span>
            <span className="img-drop-text">No image yet</span>
          </div>
        </div>
      );
    }
    return (
      <div
        className={"img-drop" + (over ? " is-over" : "") + (loading ? " is-loading" : "")}
        contentEditable={false}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <div className="img-drop-head">
          <span className="img-drop-glyph">
            <IImage />
          </span>
          <span className="img-drop-text">
            {loading ? "Adding image…" : "Drag an image here, or "}
            {!loading && (
              <button
                className="img-pick"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                choose a file
              </button>
            )}
          </span>
        </div>
        <input
          className="img-url-input"
          placeholder="…or paste an image URL and press Enter"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) {
              e.preventDefault();
              onSetImage(url.trim());
              setUrl("");
            }
          }}
        />
      </div>
    );
  }

  return (
    <figure className="img-figure" contentEditable={false}>
      <div className="img-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="img-el" src={src} alt={caption || "image"} />
        {!readOnly && (
        <div className="img-tools">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            Replace
          </button>
          <button
            className="danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSetImage("")}
          >
            Remove
          </button>
        </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <figcaption
        ref={capRef}
        className="img-caption"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-ph={readOnly ? undefined : "Add a caption…"}
        onBlur={(e) => onSetCaption(e.currentTarget.innerText.trim())}
      />
    </figure>
  );
}

/* ============================================================
   Script block — attach a file from the workspace's GitHub repo
   by name. Caches the file content in the block (so teammates see
   it without hitting the API) and shows whether the file still
   exists on the default branch.
   ============================================================ */
function ScriptBlock({
  repo,
  path,
  code,
  onSet,
}: {
  repo?: string | null;
  path?: string;
  code?: string;
  onSet: (patch: Partial<Block>) => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("main");
  const [status, setStatus] = useState<"ok" | "missing" | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // One tree fetch per repo per session (cached in lib/github); used for the
  // picker list and for the staleness dot on attached files.
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    setError(null);
    getRepoTree(repo)
      .then((t) => {
        if (cancelled) return;
        setBranch(t.branch);
        setFiles(t.list);
        if (path) setStatus(t.paths.has(path) ? "ok" : "missing");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof GithubError && (e.status === 401 || e.status === 403)) {
          setError(
            getGithubToken()
              ? "GitHub access expired — sign in with GitHub again."
              : "Private repo? Sign in with GitHub to browse it.",
          );
        } else if (e instanceof GithubError && e.status === 404) {
          setError(`Repository "${repo}" not found.`);
        } else {
          setError("Couldn't reach GitHub.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repo, path]);

  if (!repo) {
    return (
      <div className="script-unlinked" contentEditable={false}>
        <ICode />
        <span>Link a GitHub repository in Settings to attach scripts.</span>
      </div>
    );
  }

  const attach = async (p: string) => {
    setBusy(true);
    try {
      const c = await getFileContent(repo, p);
      onSet({ path: p, code: c });
    } catch {
      onSet({ path: p }); // attach anyway; preview can be fetched later
    } finally {
      setBusy(false);
    }
  };

  /* ---- picker (no file attached yet) ---- */
  if (!path) {
    const q = query.trim().toLowerCase();
    const base = (f: string) => f.slice(f.lastIndexOf("/") + 1).toLowerCase();
    const matches = !files
      ? []
      : files
          .filter((f) => f.toLowerCase().includes(q))
          .sort((a, b) => {
            // basename hits first, then shorter paths
            const rank = (f: string) =>
              base(f).startsWith(q) ? 0 : base(f).includes(q) ? 1 : 2;
            return rank(a) - rank(b) || a.length - b.length;
          })
          .slice(0, 8);
    return (
      <div className="script-pick" contentEditable={false}>
        <input
          className="script-search"
          autoFocus
          placeholder={`Search files in ${repo}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <div className="script-error">{error}</div>}
        {!error && files === null && <div className="script-hint">Loading file list…</div>}
        {!error && files !== null && q && matches.length === 0 && (
          <div className="script-hint">No matching files.</div>
        )}
        <div className="script-results">
          {matches.map((f) => {
            const i = f.lastIndexOf("/");
            return (
              <button
                key={f}
                disabled={busy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => attach(f)}
              >
                <span className="script-result-name">{i >= 0 ? f.slice(i + 1) : f}</span>
                {i >= 0 && <span className="script-result-dir">{f.slice(0, i)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---- attached card ---- */
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dir = slash >= 0 ? path.slice(0, slash) : "";

  const refresh = async () => {
    setBusy(true);
    try {
      const [c, t] = await Promise.all([getFileContent(repo, path), getRepoTree(repo, true)]);
      onSet({ code: c });
      setBranch(t.branch);
      setStatus(t.paths.has(path) ? "ok" : "missing");
    } catch (e: unknown) {
      if (e instanceof GithubError && e.status === 404) setStatus("missing");
      else setError("Refresh failed — couldn't reach GitHub.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="script-card" contentEditable={false}>
      <div className="script-head">
        <span className="script-glyph">
          <ICode />
        </span>
        <button className="script-name" title={open ? "Hide code" : "Show code"} onClick={() => setOpen((o) => !o)}>
          {name}
        </button>
        {dir && <span className="script-dir">{dir}</span>}
        {code !== undefined && (
          <span className="script-meta">
            {langLabel(detectLang(path))} · {code.split("\n").length} lines
          </span>
        )}
        <span
          className={"script-status is-" + status}
          title={
            status === "ok"
              ? `Exists on ${branch}`
              : status === "missing"
                ? `Not found on ${branch} — moved or deleted?`
                : "Checking…"
          }
        />
        <span className="script-tools">
          <button onClick={refresh} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
          <a
            href={`https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${path
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
          <button className="danger" onClick={() => onSet({ path: undefined, code: undefined })}>
            Detach
          </button>
        </span>
      </div>
      {error && <div className="script-error">{error}</div>}
      {open &&
        (code !== undefined ? (
          <ScriptCode code={code} path={path} />
        ) : (
          <div className="script-hint" style={{ padding: "10px 14px" }}>
            No cached copy yet — hit Refresh.
          </div>
        ))}
    </div>
  );
}

// Cap rendering so a 10k-line file can't lock up the page; the full file is
// one click away on GitHub.
const MAX_CODE_LINES = 500;

function ScriptCode({ code, path }: { code: string; path: string }) {
  const lang = detectLang(path);
  const { lines, total } = useMemo(() => {
    const all = highlightLines(code.replace(/\n$/, ""), lang);
    return { lines: all.slice(0, MAX_CODE_LINES), total: all.length };
  }, [code, lang]);
  const gutter = String(total).length;

  return (
    <div className="script-codewrap">
      <pre className="script-code">
        {lines.map((toks, i) => (
          <div key={i} className="script-codeline">
            <span className="script-ln" style={{ width: `${gutter}ch` }}>
              {i + 1}
            </span>
            <span className="script-src">{renderLine(toks)}</span>
          </div>
        ))}
        {total > MAX_CODE_LINES && (
          <div className="script-codemore">
            … {total - MAX_CODE_LINES} more lines — open on GitHub for the rest
          </div>
        )}
      </pre>
    </div>
  );
}

/* ============================================================
   Tone picker — a colour swatch for callout blocks.
   ============================================================ */
const TONE_LABEL: Record<BlockTone, string> = {
  ember: "Ember",
  honey: "Honey",
  sage: "Sage",
  sky: "Sky",
  rose: "Rose",
  plum: "Plum",
  slate: "Slate",
};

function TonePicker({
  tone,
  onSetTone,
}: {
  tone: BlockTone;
  onSetTone: (tone: BlockTone) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".tone-pick")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (readOnly) {
    return (
      <span className="tone-pick" contentEditable={false}>
        <span className={"tone-dot tone-dot-" + tone} />
      </span>
    );
  }

  return (
    <span className="tone-pick" contentEditable={false}>
      <button
        className={"tone-dot tone-dot-" + tone}
        title="Change colour"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span className="tone-menu">
          {BLOCK_TONES.map((t) => (
            <button
              key={t}
              className={"tone-swatch tone-dot-" + t + (t === tone ? " is-active" : "")}
              title={TONE_LABEL[t]}
              onMouseDown={(e) => {
                e.preventDefault();
                onSetTone(t);
                setOpen(false);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
