"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK_TONES, type Block, type BlockTone, type BlockType } from "./data";
import "./BlockEditor.css";

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

type MenuItem = { type: BlockType; label: string; hint: string; Icon: () => React.ReactElement };
const MENU: MenuItem[] = [
  { type: "text", label: "Text", hint: "Just start writing", Icon: IText },
  { type: "h2", label: "Heading", hint: "Large section heading", Icon: IH2 },
  { type: "h3", label: "Subheading", hint: "Smaller heading", Icon: IH3 },
  { type: "bullet", label: "Bulleted list", hint: "A simple bullet list", Icon: IBullet },
  { type: "quote", label: "Quote", hint: "Capture a quote", Icon: IQuote },
  { type: "callout", label: "Callout", hint: "Make text stand out", Icon: ICallout },
  { type: "image", label: "Image", hint: "Upload or embed a picture", Icon: IImage },
  { type: "table", label: "Table", hint: "Add a simple table", Icon: ITable },
  { type: "divider", label: "Divider", hint: "Visually separate blocks", Icon: IDivider },
];

const PLACEHOLDER: Record<BlockType, string> = {
  text: "Type '/' for commands",
  h2: "Heading",
  h3: "Subheading",
  bullet: "List",
  quote: "Empty quote",
  callout: "Type something…",
  divider: "",
  table: "",
  image: "",
};

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
  if (file.type === "image/gif" || file.type === "image/svg+xml") return dataUrl;
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
function placeCaret(el: HTMLElement, pos: "start" | "end" | number) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (typeof pos === "number") {
    const node = el.firstChild ?? el;
    const len = (node.textContent ?? "").length;
    range.setStart(node, Math.min(pos, len));
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(pos === "start");
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

type Slash = { id: string; query: string; index: number };
type FocusReq = { id: string; pos: "start" | "end" | number };

export default function BlockEditor({
  blocks,
  onChange,
  onLiveInput,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  // Fired on every keystroke (not on slash queries). Lets the parent push the
  // edit out live without re-rendering this editor (no caret disruption).
  onLiveInput?: (blockId: string, text: string, blocks: Block[]) => void;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [slash, setSlash] = useState<Slash | null>(null);
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

  // Snapshot live DOM text for text-bearing blocks; tables/dividers pass through.
  const readBlocks = (): Block[] =>
    blocks.map((b) => {
      if (b.type === "divider" || b.type === "table" || b.type === "image") return b;
      const el = refs.current.get(b.id);
      return el ? { ...b, text: el.innerText.replace(/\n$/, "") } : b;
    });

  const filtered = (q: string) =>
    MENU.filter((m) => m.label.toLowerCase().includes(q.toLowerCase()));

  /* ---------- structural operations ---------- */
  const handleEnter = (id: string) => {
    const cur = readBlocks();
    const idx = cur.findIndex((b) => b.id === id);
    const block = cur[idx];
    const el = refs.current.get(id)!;
    const offset = caretOffset(el);
    const before = block.text.slice(0, offset);
    const after = block.text.slice(offset);

    if (block.type === "bullet" && block.text === "") {
      const next = [...cur];
      next[idx] = { ...block, type: "text" };
      onChange(next);
      setFocusReq({ id, pos: "start" });
      return;
    }

    const nextType: BlockType = block.type === "bullet" ? "bullet" : "text";
    const nb: Block = { id: newId(), type: nextType, text: after };
    const next = [...cur];
    next[idx] = { ...block, text: before };
    next.splice(idx + 1, 0, nb);
    onChange(next);
    setFocusReq({ id: nb.id, pos: "start" });
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
    if (prev.type === "table" || prev.type === "image") return false; // don't merge into these

    const caretAt = prev.text.length;
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
    if (type === "divider" || type === "table" || type === "image") {
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
          : type === "image"
            ? { id: block.id, type: "image", text: "", src: "" }
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
    if (
      neighbour &&
      neighbour.type !== "divider" &&
      neighbour.type !== "table" &&
      neighbour.type !== "image"
    ) {
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
      return; // don't broadcast a slash query
    }
    if (slash && slash.id === id) setSlash(null);
    onLiveInput?.(id, text, readBlocks());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
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
      const el = refs.current.get(id);
      if (el && isCollapsed() && caretOffset(el) === 0) {
        if (handleBackspaceAtStart(id)) e.preventDefault();
      }
    }
  };

  return (
    <div className="blocks">
      {blocks.map((b) => (
        <BlockRow
          key={b.id}
          block={b}
          register={register}
          focused={focusedId === b.id}
          menuOpen={menuFor === b.id}
          dragging={dragId === b.id}
          dropTarget={dropId === b.id && dragId !== null && dragId !== b.id}
          slash={slash && slash.id === b.id ? slash : null}
          menuItems={slash && slash.id === b.id ? filtered(slash.query) : []}
          onPick={(type) => chooseType(b.id, type)}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setFocusedId(b.id)}
          onBlur={() => {
            setFocusedId((f) => (f === b.id ? null : f));
            onChange(readBlocks());
          }}
          onTableChange={(rows) => updateBlock(b.id, { rows })}
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
  );
}

/* ============================================================
   A single block row.
   ============================================================ */
function BlockRow({
  block,
  register,
  focused,
  menuOpen,
  dragging,
  dropTarget,
  slash,
  menuItems,
  onPick,
  onInput,
  onKeyDown,
  onFocus,
  onBlur,
  onTableChange,
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
  register: (id: string, el: HTMLDivElement | null) => void;
  focused: boolean;
  menuOpen: boolean;
  dragging: boolean;
  dropTarget: boolean;
  slash: Slash | null;
  menuItems: MenuItem[];
  onPick: (type: BlockType) => void;
  onInput: (id: string, el: HTMLDivElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onTableChange: (rows: string[][]) => void;
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
  const ref = useRef<HTMLDivElement | null>(null);

  // Keep DOM text in sync with state without disturbing the caret.
  useEffect(() => {
    const el = ref.current;
    if (!el || block.type === "divider" || block.type === "table" || block.type === "image")
      return;
    if (el.innerText !== block.text) el.innerText = block.text;
  }, [block.text, block.type]);

  const editable = block.type !== "divider" && block.type !== "table" && block.type !== "image" && (
    <div
      ref={(el) => {
        ref.current = el;
        register(block.id, el);
      }}
      className={"blk-text" + (focused ? " is-focused" : "")}
      contentEditable
      suppressContentEditableWarning
      data-ph={PLACEHOLDER[block.type]}
      onInput={(e) => onInput(block.id, e.currentTarget)}
      onKeyDown={(e) => onKeyDown(e, block.id)}
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
  } else if (block.type === "bullet") {
    main = (
      <div className="blk-main bullet-row">
        <span className="blk-dot">•</span>
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
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
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

      {menuOpen && (
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
                    {ci === 0 && rows.length > 1 && (
                      <button
                        className="row-del"
                        title="Delete row"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => delRow(ri)}
                      >
                        ×
                      </button>
                    )}
                    {ri === 0 && cols > 1 && (
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
        <button
          className="tbl-add tbl-add-col"
          title="Add column"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addCol}
        >
          +
        </button>
      </div>
      <button
        className="tbl-add tbl-add-row"
        title="Add row"
        onMouseDown={(e) => e.preventDefault()}
        onClick={addRow}
      >
        +
      </button>
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
      contentEditable
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
    } finally {
      setLoading(false);
    }
  };

  if (!src) {
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
        contentEditable
        suppressContentEditableWarning
        data-ph="Add a caption…"
        onBlur={(e) => onSetCaption(e.currentTarget.innerText.trim())}
      />
    </figure>
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".tone-pick")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
