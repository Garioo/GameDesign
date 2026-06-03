// Doc.jsx — rich, editable GDD document view with a full block editor
import React, { useState, useEffect, useRef } from "react";
import { Icon, Avatar, AvStack, StatusPill, Tag } from "./ui.jsx";
import { data } from "./data.js";
import { useEWStore, store, renderMentions } from "./store.js";
import { SectionTree } from "./Tree.jsx";

/* ---------------- inline-editable text ---------------- */
// rich → stores innerHTML (bold/italic/links); plain → stores innerText.
function Editable({ tag, value, html, rich, onSave, className, style, placeholder, multiline, autoFocus }) {
  const Tag = tag || "div";
  const ref = useRef(null);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const el = ref.current;
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [autoFocus]);
  const commit = (el) => {
    if (rich) { const h = el.innerHTML; if (h !== (html || "")) onSave(h); }
    else { const t = el.innerText.replace(/\s+$/, ""); if (t !== value) onSave(t); }
  };
  const props = {
    ref, className: (className || "") + " editable" + (rich ? " rich" : ""), style,
    contentEditable: true, suppressContentEditableWarning: true, spellCheck: false, "data-ph": placeholder,
    onBlur: (e) => commit(e.currentTarget),
    onKeyDown: (e) => { if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } e.stopPropagation(); },
  };
  if (rich) return <Tag {...props} dangerouslySetInnerHTML={{ __html: html || "" }} />;
  return <Tag {...props}>{value}</Tag>;
}

/* ---------------- selection format toolbar ---------------- */
function FormatToolbar() {
  const [bar, setBar] = useState(null);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");
  const savedRange = useRef(null);

  useEffect(() => {
    const update = () => {
      if (linking) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setBar(null); return; }
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === 3) node = node.parentElement;
      const editable = node && node.closest && node.closest(".editable.rich");
      if (!editable) { setBar(null); return; }
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) { setBar(null); return; }
      setBar({ x: r.left + r.width / 2, y: r.top - 8 });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    return () => { document.removeEventListener("selectionchange", update); window.removeEventListener("scroll", update, true); };
  }, [linking]);

  const cmd = (c) => (e) => { e.preventDefault(); document.execCommand(c, false); };
  const openLink = (e) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
    setUrl(""); setLinking(true);
  };
  const applyLink = () => {
    const sel = window.getSelection();
    if (savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
    const u = url.trim();
    if (u) document.execCommand("createLink", false, /^https?:|^mailto:/.test(u) ? u : "https://" + u);
    setLinking(false); setBar(null);
  };

  if (!bar) return null;
  return (
    <div className="fmt-bar" style={{ left: bar.x, top: bar.y }} onMouseDown={(e) => e.preventDefault()}>
      {linking ? (
        <>
          <input autoFocus value={url} placeholder="Paste link, then Enter"
            onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinking(false); }} />
          <button className="fmt-btn" onMouseDown={(e) => { e.preventDefault(); applyLink(); }}><Icon name="check" size={15} /></button>
        </>
      ) : (
        <>
          <button className="fmt-btn" title="Bold" onMouseDown={cmd("bold")}><Icon name="bold" size={14} /></button>
          <button className="fmt-btn" title="Italic" onMouseDown={cmd("italic")}><Icon name="italic" size={14} /></button>
          <button className="fmt-btn" title="Link" onMouseDown={openLink}><Icon name="link" size={15} /></button>
        </>
      )}
    </div>
  );
}

/* ---------------- block catalog ---------------- */
const BLOCK_TYPES = [
  { icon: "text", label: "Text", make: () => ({ t: "p", text: "" }) },
  { icon: "heading", label: "Heading", make: () => ({ t: "h", text: "" }) },
  { icon: "list", label: "Bulleted list", make: () => ({ t: "list", items: [""] }) },
  { icon: "quote", label: "Quote", make: () => ({ t: "quote", text: "", by: null }) },
  { icon: "sparkle", label: "Callout", make: () => ({ t: "callout", tone: "accent", title: "", text: "" }) },
  { icon: "table", label: "Table", make: () => ({ t: "table", cols: ["Column", "Value"], rows: [["", ""], ["", ""]] }) },
  { icon: "frame", label: "Image", make: () => ({ t: "media", label: "Image", ratio: "16/9" }) },
  { icon: "divider", label: "Divider", make: () => ({ t: "hr" }) },
];
const TURN_INTO = [{ t: "p", icon: "text", label: "Text" }, { t: "h", icon: "heading", label: "Heading" }, { t: "quote", icon: "quote", label: "Quote" }];

/* ---------------- block body renderers ---------------- */
function TextBlock({ block, pageId, autoFocus }) {
  const set = (patch) => store.updateBlock(pageId, block.id, patch);
  if (block.t === "h") return <Editable tag="h3" rich autoFocus={autoFocus} className="disp" html={block.text} onSave={(v) => set({ text: v })} placeholder="Heading"
    style={{ fontSize: 27, margin: "26px 0 8px" }} />;
  if (block.t === "quote") return (
    <blockquote style={{ margin: "10px 0 16px", padding: "4px 0 4px 20px", borderLeft: "3px solid var(--accent)" }}>
      <Editable tag="div" rich multiline autoFocus={autoFocus} className="disp" html={block.text} onSave={(v) => set({ text: v })} placeholder="Quote"
        style={{ fontSize: 24, lineHeight: 1.25, color: "var(--ink)" }} />
      {block.by != null && <Editable tag="div" className="muted" value={block.by} onSave={(v) => set({ by: v })} placeholder="— Attribution"
        style={{ fontSize: 13.5, marginTop: 8 }} />}
    </blockquote>
  );
  return <Editable tag="p" rich multiline autoFocus={autoFocus} html={block.text} onSave={(v) => set({ text: v })}
    placeholder="Write something, or open the ⋯ menu to add a block…"
    style={{ fontSize: 15.5, lineHeight: 1.7, margin: "0 0 14px", color: "var(--ink)", textWrap: "pretty" }} />;
}

function Callout({ block, pageId }) {
  const set = (patch) => store.updateBlock(pageId, block.id, patch);
  const accent = block.tone === "accent";
  return (
    <div style={{ display: "flex", gap: 13, padding: "15px 17px", borderRadius: 14, margin: "4px 0",
      background: accent ? "var(--accent-soft)" : "var(--st-wip-bg)",
      border: `1px solid ${accent ? "var(--accent-line)" : "color-mix(in srgb, var(--st-wip) 28%, var(--line))"}` }}>
      <span onClick={() => set({ tone: accent ? "warn" : "accent" })} title="Toggle tone"
        style={{ color: accent ? "var(--accent)" : "var(--st-wip)", flex: "none", marginTop: 1, cursor: "pointer" }}>
        <Icon name={accent ? "sparkle" : "flag"} size={19} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {block.title != null && <Editable tag="div" value={block.title} onSave={(v) => set({ title: v })} placeholder="Title"
          style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 3, color: accent ? "var(--accent-ink)" : "#9c6716" }} />}
        <Editable tag="div" rich multiline html={block.text} onSave={(v) => set({ text: v })} placeholder="Write…"
          style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }} />
      </div>
    </div>
  );
}

function ListBlock({ block, pageId }) {
  const items = block.items || [];
  const set = (patch) => store.updateBlock(pageId, block.id, patch);
  return (
    <ul style={{ margin: "4px 0 14px", paddingLeft: 4, listStyle: "none" }}>
      {items.map((it, k) => (
        <li key={k} className="li-row row g10" style={{ alignItems: "flex-start", margin: "0 0 9px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 9, flex: "none" }} />
          <Editable tag="div" rich multiline html={it} onSave={(v) => set({ items: items.map((x, j) => (j === k ? v : x)) })} placeholder="List item"
            style={{ fontSize: 15, lineHeight: 1.55, flex: 1 }} />
          <button className="blk-ctl li-del" title="Remove item" onClick={() => set({ items: items.filter((_, j) => j !== k) })}><Icon name="x" size={13} /></button>
        </li>
      ))}
      <div className="row g6 faint" onClick={() => set({ items: [...items, ""] })}
        style={{ cursor: "pointer", fontSize: 13, fontWeight: 500, paddingLeft: 16 }}><Icon name="plus" size={13} />Add item</div>
    </ul>
  );
}

function TableBlock({ block, pageId }) {
  const cols = block.cols || [], rows = block.rows || [];
  const set = (patch) => store.updateBlock(pageId, block.id, patch);
  return (
    <div style={{ margin: "6px 0" }}>
      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <div className="row" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}>
          {cols.map((c, ci) => <Editable key={ci} tag="div" value={c} onSave={(v) => set({ cols: cols.map((x, i) => (i === ci ? v : x)) })}
            placeholder="Column" className="eyebrow" style={{ flex: ci === 0 ? "1.3" : "1", padding: "10px 14px", fontSize: 11 }} />)}
          <span style={{ width: 32, flex: "none" }} />
        </div>
        {rows.map((r, ri) => (
          <div key={ri} className="trow row" style={{ borderTop: ri ? "1px solid var(--line)" : "none", alignItems: "center" }}>
            {r.map((cell, ci) => {
              const st = ["done", "wip", "todo", "review", "block"].includes(cell);
              if (st) return <div key={ci} style={{ flex: ci === 0 ? "1.3" : "1", padding: "11px 14px" }}><StatusPill value={cell} editable={false} /></div>;
              return <Editable key={ci} tag="div" value={cell}
                onSave={(v) => set({ rows: rows.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? v : x)) : row)) })} placeholder="…"
                style={{ flex: ci === 0 ? "1.3" : "1", padding: "11px 14px", fontSize: 13.8, fontWeight: ci === 0 ? 600 : 400, color: ci === 0 ? "var(--ink)" : "var(--ink-2)" }} />;
            })}
            <button className="blk-ctl trow-del" title="Delete row" style={{ width: 32, flex: "none" }}
              onClick={() => set({ rows: rows.filter((_, i) => i !== ri) })}><Icon name="trash" size={13} /></button>
          </div>
        ))}
      </div>
      <div className="row g6 faint" onClick={() => set({ rows: [...rows, cols.map(() => "")] })}
        style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 500, padding: "7px 4px" }}><Icon name="plus" size={13} />Add row</div>
    </div>
  );
}

function Media({ b }) {
  return (
    <div className="lift" style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)",
      aspectRatio: b.ratio, background:
        "repeating-linear-gradient(135deg, var(--surface-2) 0 11px, color-mix(in srgb, var(--surface-2) 60%, var(--surface)) 11px 22px)",
      display: "grid", placeItems: "center", cursor: "pointer", margin: "6px 0" }}>
      <div className="col g8" style={{ alignItems: "center", color: "var(--ink-3)" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}>
          <Icon name="frame" size={20} style={{ color: "var(--ink-2)" }} /></span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{b.label}</span>
      </div>
      <span className="tag" style={{ position: "absolute", top: 10, right: 10, background: "var(--surface)", fontSize: 11 }}>placeholder</span>
    </div>
  );
}

function LinkRow({ b, onOpenPage }) {
  const { pages } = data;
  return (
    <div className="row wrap g8" style={{ margin: "8px 0" }}>
      {b.ids.map((id) => pages[id] && (
        <span key={id} className="tag link" onClick={() => onOpenPage(id)} style={{ padding: "6px 12px", fontSize: 13.5 }}>
          <Icon name="link" size={14} />{pages[id].title}
        </span>
      ))}
    </div>
  );
}

function Block({ block, pageId, onOpenPage, autoFocus }) {
  switch (block.t) {
    case "h": case "p": case "quote": return <TextBlock block={block} pageId={pageId} autoFocus={autoFocus} />;
    case "callout": return <Callout block={block} pageId={pageId} />;
    case "media": return <Media b={block} />;
    case "table": return <TableBlock block={block} pageId={pageId} />;
    case "list": return <ListBlock block={block} pageId={pageId} />;
    case "links": return <LinkRow b={block} onOpenPage={onOpenPage} />;
    case "hr": return <div className="hr" style={{ margin: "22px 0" }} />;
    default: return null;
  }
}

/* ---------------- block menu (insert + actions) ---------------- */
function BlockMenu({ block, onInsert, onDuplicate, onDelete, onTurnInto }) {
  const canTurn = ["p", "h", "quote"].includes(block.t);
  return (
    <div className="card pop" style={{ width: 210, maxHeight: 380, overflow: "auto", right: "auto" }}>
      <div className="menu-item" onClick={onDuplicate}><Icon name="copy" size={15} />Duplicate</div>
      <div className="menu-item danger" onClick={onDelete}><Icon name="trash" size={15} />Delete</div>
      {canTurn && (
        <>
          <div className="eyebrow" style={{ padding: "7px 9px 4px", fontSize: 10 }}>Turn into</div>
          {TURN_INTO.filter((o) => o.t !== block.t).map((o) => (
            <div key={o.t} className="menu-item" onClick={() => onTurnInto(o.t)}><Icon name={o.icon} size={15} />{o.label}</div>
          ))}
        </>
      )}
      <div className="hr" style={{ margin: "5px 4px" }} />
      <div className="eyebrow" style={{ padding: "3px 9px 4px", fontSize: 10 }}>Add below</div>
      {BLOCK_TYPES.map((bt) => (
        <div key={bt.label} className="ins-item" onClick={() => onInsert(bt.make())}>
          <span className="ic"><Icon name={bt.icon} size={15} /></span>{bt.label}
        </div>
      ))}
    </div>
  );
}

/* ---------------- block shell (gutter + drag/drop) ---------------- */
function BlockShell({ pageId, block, index, dragId, setDragId, over, setOver, onInsertAfter, onDuplicate, onDelete, onTurnInto, children }) {
  const [pop, setPop] = useState(false);
  const gref = useRef(null);
  useEffect(() => {
    if (!pop) return;
    const h = (e) => { if (gref.current && !gref.current.contains(e.target)) setPop(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [pop]);
  const isOver = over && over.id === block.id;
  return (
    <div className={"blk" + (dragId === block.id ? " dragging" : "") + (isOver ? " over-" + over.mode : "")}
      onDragOver={(e) => {
        if (dragId == null || dragId === block.id) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const mode = (e.clientY - r.top) / r.height < 0.5 ? "before" : "after";
        if (!over || over.id !== block.id || over.mode !== mode) setOver({ id: block.id, mode });
      }}
      onDragLeave={() => setOver((o) => (o && o.id === block.id ? null : o))}
      onDrop={(e) => { e.preventDefault(); if (dragId != null && over) store.moveBlock(pageId, dragId, over.id, over.mode); setDragId(null); setOver(null); }}>
      <div ref={gref} className={"blk-gutter" + (pop ? " open" : "")}>
        <span className="blk-ctl blk-grip" draggable title="Drag to reorder"
          onDragStart={(e) => { setDragId(block.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", block.id); } catch (_) {} }}
          onDragEnd={() => { setDragId(null); setOver(null); }}><Icon name="grip" size={14} /></span>
        <span style={{ position: "relative", display: "inline-flex" }}>
          <button className="blk-ctl" title="Add & options" onClick={() => setPop((p) => !p)}><Icon name="dots" size={16} /></button>
          {pop && <BlockMenu block={block}
            onInsert={(tpl) => { onInsertAfter(index, tpl); setPop(false); }}
            onDuplicate={() => { onDuplicate(block.id); setPop(false); }}
            onDelete={() => { onDelete(block.id); setPop(false); }}
            onTurnInto={(t) => { onTurnInto(block.id, t); setPop(false); }} />}
        </span>
      </div>
      <div className="blk-body">{children}</div>
    </div>
  );
}

/* ---------------- properties ---------------- */
function Prop({ label, children }) {
  return <div className="row g14" style={{ minHeight: 30 }}>
    <span className="muted" style={{ width: 96, fontSize: 13.5, flex: "none" }}>{label}</span>
    <div className="row wrap g6" style={{ minWidth: 0 }}>{children}</div>
  </div>;
}

/* ---------------- @mention composer ---------------- */
function MentionInput({ value, onChange, onSubmit, placeholder, autoFocus }) {
  const ref = useRef(null);
  const [menu, setMenu] = useState(null);
  const team = Object.values(data.team);
  const matches = menu ? team.filter((m) => menu.q === "" || m.name.toLowerCase().includes(menu.q.toLowerCase())) : [];

  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const grow = (el) => { if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; };
  useEffect(() => { grow(ref.current); }, [value]);

  const change = (e) => {
    const v = e.target.value, caret = e.target.selectionStart;
    const m = v.slice(0, caret).match(/@([A-Za-zÀ-ÿ]*)$/);
    setMenu(m ? { q: m[1], start: caret - m[1].length - 1 } : null);
    onChange(v);
  };
  const pick = (member) => {
    const first = member.name.split(" ")[0];
    const before = value.slice(0, menu.start), after = value.slice(menu.start + 1 + menu.q.length);
    onChange(before + "@" + first + " " + after);
    setMenu(null);
    setTimeout(() => ref.current && ref.current.focus(), 0);
  };
  const key = (e) => {
    if (menu && matches.length && e.key === "Enter") { e.preventDefault(); pick(matches[0]); return; }
    if (menu && e.key === "Escape") { setMenu(null); return; }
    if (!menu && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div style={{ position: "relative", flex: 1 }}>
      {menu && matches.length > 0 && (
        <div className="card" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, padding: 5, boxShadow: "var(--shadow-lg)", zIndex: 70 }}>
          <div className="eyebrow" style={{ padding: "4px 8px 5px", fontSize: 10.5 }}>Mention</div>
          {matches.map((m) => (
            <div key={m.id} onMouseDown={(e) => { e.preventDefault(); pick(m); }} className="row g8"
              style={{ padding: "6px 8px", borderRadius: 8, cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <Avatar id={m.id} size={24} ring={false} />
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div className="faint" style={{ fontSize: 11 }}>{m.role}</div></div>
            </div>
          ))}
        </div>
      )}
      <textarea ref={ref} value={value} onChange={change} onKeyDown={key} placeholder={placeholder} rows={1}
        style={{ width: "100%", resize: "none", border: "none", outline: "none", background: "transparent",
          fontSize: 13.5, fontFamily: "var(--font-ui)", color: "var(--ink)", lineHeight: 1.5, padding: 0 }} />
    </div>
  );
}

/* ---------------- comments (threaded + mentions) ---------------- */
function CommentBody({ text }) {
  return <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)", whiteSpace: "pre-wrap" }}>{renderMentions(text)}</div>;
}
function Comments({ pageId }) {
  const { team } = data;
  const list = useEWStore((s) => s.comments[pageId]) || [];
  const [val, setVal] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyVal, setReplyVal] = useState("");
  useEffect(() => { setVal(""); setReplyTo(null); setReplyVal(""); }, [pageId]);

  const total = list.reduce((n, c) => n + 1 + c.replies.length, 0);
  const add = () => { const t = val.trim(); if (!t) return; store.addComment(pageId, t); setVal(""); };
  const sendReply = (cid) => { const t = replyVal.trim(); if (!t) return; store.addReply(pageId, cid, t); setReplyVal(""); setReplyTo(null); };

  const Author = ({ who, when }) => (
    <div className="row g6" style={{ marginBottom: 2 }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{team[who] ? team[who].name.split(" ")[0] : who}</span>
      <span className="faint" style={{ fontSize: 11.5 }}>{store.whenLabel({ when })}</span>
    </div>
  );

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row g8"><Icon name="comment" size={16} style={{ color: "var(--ink-2)" }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Comments</span></div>
        <span className="tag mono" style={{ fontSize: 11 }}>{total}</span>
      </div>

      <div className="col g16">
        {list.map((c) => (
          <div key={c.id} className="row g10" style={{ alignItems: "flex-start" }}>
            <Avatar id={c.who} size={28} ring={false} />
            <div className="grow">
              <Author who={c.who} when={store.whenLabel(c)} />
              <CommentBody text={c.text} />

              {c.replies.length > 0 && (
                <div className="col g10" style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
                  {c.replies.map((r) => (
                    <div key={r.id} className="row g8" style={{ alignItems: "flex-start" }}>
                      <Avatar id={r.who} size={22} ring={false} />
                      <div className="grow"><Author who={r.who} when={store.whenLabel(r)} /><CommentBody text={r.text} /></div>
                    </div>
                  ))}
                </div>
              )}

              {replyTo === c.id ? (
                <div className="row g8" style={{ marginTop: 8, padding: "7px 8px 7px 12px", borderRadius: 12, border: "1px solid var(--accent-line)", background: "var(--surface)" }}>
                  <MentionInput value={replyVal} onChange={setReplyVal} onSubmit={() => sendReply(c.id)} placeholder="Reply… use @ to mention" autoFocus />
                  <button className="btn pri sm" style={{ padding: "6px 11px", alignSelf: "flex-end" }} onClick={() => sendReply(c.id)}><Icon name="arrow" size={15} /></button>
                </div>
              ) : (
                <div className="row g6" onClick={() => { setReplyTo(c.id); setReplyVal(""); }}
                  style={{ marginTop: 6, color: "var(--accent-ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", width: "fit-content" }}>
                  <Icon name="reply" size={13} />Reply
                </div>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="faint" style={{ fontSize: 13 }}>No comments yet — start the thread.</div>}
      </div>

      <div className="row g8" style={{ marginTop: 16, padding: "8px 8px 8px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", alignItems: "flex-end" }}>
        <Avatar id={store.currentUser} size={26} ring={false} />
        <MentionInput value={val} onChange={setVal} onSubmit={add} placeholder="Add a comment… use @ to mention" />
        <button className="btn pri sm" style={{ padding: "6px 11px" }} onClick={add}><Icon name="arrow" size={15} /></button>
      </div>
    </div>
  );
}

/* ---------------- doc view ---------------- */
export function Doc({ pageId, onOpenPage, statuses, setStatus }) {
  const { pages, sections, backlinks, team } = data;
  const scrollRef = useRef(null);
  const docBlocks = useEWStore((s) => s.docs[pageId]);
  const page = pages[pageId] || pages.ember;
  const sec = sections.find((s) => s.id === page.section);
  const status = statuses[page.id] || page.status;
  const bl = backlinks[page.id] || [];
  const sectionCount = Object.values(pages).filter((p) => p.section === sec.id).length;
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [focusId, setFocusId] = useState(null);

  useEffect(() => { store.ensureDoc(pageId); }, [pageId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [pageId]);

  const blocks = docBlocks || (page.body || []).map((b, i) => ({ id: "b" + i, ...b }));
  const insertAfter = (index, tpl) => setFocusId(store.insertBlock(pageId, index + 1, tpl));
  const duplicate = (id) => store.duplicateBlock(pageId, id);
  const remove = (id) => store.deleteBlock(pageId, id);
  const turnInto = (id, t) => store.updateBlock(pageId, id, { t });
  const addAtEnd = () => setFocusId(store.insertBlock(pageId, blocks.length, { t: "p", text: "" }));

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <FormatToolbar />

      {/* left section rail */}
      <aside className="col" style={{ width: 256, flex: "none", borderRight: "1px solid var(--line)", overflow: "auto", padding: "20px 12px 120px" }}>
        <div className="row g8" style={{ padding: "0 8px 14px" }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${sec.color} 14%, var(--surface))`, color: sec.color }}><Icon name={sec.icon} size={17} /></span>
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>{sec.name}</div>
            <div className="faint" style={{ fontSize: 11.5 }}>{sectionCount} pages</div></div>
        </div>
        <div className="row between" style={{ padding: "0 8px 6px" }}>
          <div className="eyebrow">In this section</div>
          <span className="faint" style={{ fontSize: 10.5 }} title="Drag to reorder · drop onto a page to nest">drag to nest</span>
        </div>
        <SectionTree key={sec.id} sectionId={sec.id} currentId={page.id} onOpenPage={onOpenPage} />
      </aside>

      {/* center document */}
      <div ref={scrollRef} className="grow" style={{ overflow: "auto", minWidth: 0 }}>
        <article className="rise" style={{ maxWidth: 740, margin: "0 auto", padding: "44px 40px 140px 60px" }} key={pageId}>
          <div className="row g8" style={{ marginBottom: 10 }}>
            <span className="eyebrow" style={{ color: sec.color }}>{sec.name}</span>
            <span className="faint">·</span><span className="eyebrow">{page.kind}</span>
          </div>
          <Editable tag="h1" className="disp" value={page.title} placeholder="Untitled page"
            onSave={(v) => store.setMeta(page.id, "title", v)}
            style={{ fontSize: 52, lineHeight: 1.0, letterSpacing: "-0.01em", marginBottom: 14 }} />
          <Editable tag="p" multiline className="muted" value={page.summary} placeholder="Add a one-line summary…"
            onSave={(v) => store.setMeta(page.id, "summary", v)}
            style={{ fontSize: 18, lineHeight: 1.5, margin: "0 0 22px", textWrap: "pretty" }} />

          <div className="col g8" style={{ padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface)", marginBottom: 8 }}>
            <Prop label="Status"><StatusPill value={status} onChange={(v) => setStatus(page.id, v)} /></Prop>
            <Prop label="Owner"><span className="row g8"><Avatar id={page.owner} size={24} ring={false} /><span style={{ fontSize: 13.5, fontWeight: 500 }}>{team[page.owner].name}</span></span></Prop>
            {page.tags.length > 0 && <Prop label="Tags">{page.tags.map((t) => <Tag key={t} mono>#{t}</Tag>)}</Prop>}
            {page.links.length > 0 && <Prop label="Links to">{page.links.map((id) => pages[id] && <Tag key={id} link onClick={() => onOpenPage(id)}><Icon name="link" size={13} />{pages[id].title}</Tag>)}</Prop>}
          </div>

          <div className="hr" style={{ margin: "26px 0" }} />
          {blocks.map((b, i) => (
            <BlockShell key={b.id} pageId={pageId} block={b} index={i}
              dragId={dragId} setDragId={setDragId} over={over} setOver={setOver}
              onInsertAfter={insertAfter} onDuplicate={duplicate} onDelete={remove} onTurnInto={turnInto}>
              <Block block={b} pageId={pageId} onOpenPage={onOpenPage} autoFocus={b.id === focusId} />
            </BlockShell>
          ))}
          <div className="add-block" onClick={addAtEnd}><Icon name="plus" size={14} />Add a block</div>
        </article>
      </div>

      {/* right meta panel */}
      <aside className="col" style={{ width: 308, flex: "none", borderLeft: "1px solid var(--line)", overflow: "auto", padding: "28px 22px 120px", background: "color-mix(in srgb, var(--surface-2) 45%, var(--bg))" }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="row g8"><Icon name="link" size={16} style={{ color: "var(--ink-2)" }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Linked references</span></div>
          <span className="tag mono" style={{ fontSize: 11 }}>{bl.length}</span>
        </div>
        {bl.length === 0 && <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>No backlinks yet.</div>}
        <div className="col g8">
          {bl.map((id) => {
            const p = pages[id], s = sections.find((x) => x.id === p.section);
            return <div key={id} onClick={() => onOpenPage(id)} className="card lift" style={{ padding: "11px 13px", cursor: "pointer", boxShadow: "none" }}>
              <div className="row g7" style={{ marginBottom: 4 }}><Icon name={s.icon} size={13} style={{ color: s.color }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.title}</span></div>
              <div className="faint" style={{ fontSize: 12, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.summary}</div>
            </div>;
          })}
        </div>

        <div className="hr" style={{ margin: "22px 0" }} />
        <div className="col g8" style={{ marginBottom: 22 }}>
          <div className="row between"><span className="muted" style={{ fontSize: 13 }}>Last edited</span><span style={{ fontSize: 13, fontWeight: 600 }}>{page.updated}</span></div>
          <div className="row between"><span className="muted" style={{ fontSize: 13 }}>Contributors</span><AvStack ids={["AK", page.owner, "JO"].filter((v, i, a) => a.indexOf(v) === i)} size={24} /></div>
        </div>

        <div className="hr" style={{ margin: "0 0 22px" }} />
        <Comments pageId={page.id} />
      </aside>
    </div>
  );
}
