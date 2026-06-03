// store.js — localStorage-backed store + useEWStore hook
// Powers: status edits, the page tree (reorder + nesting), comment threads,
// inline doc edits, and user-created pages. All persisted across reloads.
import React from "react";
import { data } from "./data.js";

const LSKEY = "emberwick.gdd.v1";
const CURRENT_USER = "MR"; // Marco Reyes — "you"

/* ---------------- helpers ---------------- */
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = (p) => p + Math.random().toString(36).slice(2, 8);

function rel(ts) {
  if (!ts) return "";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); if (d < 7) return d + "d ago";
  return Math.round(d / 7) + "w ago";
}

/* nested-tree ops (nodes = [{id, children:[]}]) */
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id); if (f) return f;
  }
  return null;
}
function removeNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0];
    const f = removeNode(nodes[i].children, id); if (f) return f;
  }
  return null;
}
function insertNode(nodes, targetId, node, mode) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      if (mode === "child") nodes[i].children.unshift(node);
      else if (mode === "before") nodes.splice(i, 0, node);
      else nodes.splice(i + 1, 0, node);
      return true;
    }
    if (insertNode(nodes[i].children, targetId, node, mode)) return true;
  }
  return false;
}
function subtreeIds(node, out = []) {
  out.push(node.id);
  node.children.forEach((c) => subtreeIds(c, out));
  return out;
}

/* ---------------- initial state from sample data ---------------- */
function seedState() {
  const D = data;
  // tree per section, with one pre-nested example under "The Ember"
  const tree = {};
  D.sections.forEach((sec) => {
    const ids = Object.values(D.pages).filter((p) => p.section === sec.id).map((p) => p.id);
    tree[sec.id] = { nodes: ids.map((id) => ({ id, children: [] })), collapsed: {} };
  });
  // demonstrate nesting: warmth / shrines / crafting become children of ember
  if (tree.mechanics) {
    const nodes = tree.mechanics.nodes;
    const ember = nodes.find((n) => n.id === "ember");
    ["warmth", "shrines", "crafting"].forEach((id) => {
      const i = nodes.findIndex((n) => n.id === id);
      if (i >= 0 && ember) ember.children.push(nodes.splice(i, 1)[0]);
    });
  }

  // comments seeded from data (now with real reply threads)
  const comments = {};
  Object.entries(D.comments || {}).forEach(([pid, arr]) => {
    comments[pid] = arr.map((c) => ({
      id: uid("c"), who: c.who, text: c.text, when: c.when,
      replies: (c.replies || []).map((r) => ({ id: uid("r"), who: r.who, text: r.text, when: r.when })),
    }));
  });

  return { statuses: {}, tree, comments, edits: {}, docs: {}, created: {}, order: 1 };
}

/* seed a page's editable block list from its sample body (stable ids) */
function seedBlocks(pageId) {
  const pg = data.pages[pageId];
  const body = (pg && pg.body) || [];
  return body.map((b, i) => ({ id: "b" + i, ...clone(b) }));
}

/* ---------------- load / persist ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(LSKEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

let state = (function init() {
  const saved = load();
  const base = seedState();
  if (!saved) return base;
  // merge saved over a fresh seed so new sample pages still appear in the tree
  const merged = {
    statuses: saved.statuses || {},
    comments: saved.comments || base.comments,
    edits: saved.edits || {},
    docs: saved.docs || {},
    created: saved.created || {},
    order: saved.order || 1,
    tree: base.tree,
  };
  // prefer saved tree where it exists (preserves user reordering/nesting)
  if (saved.tree) Object.keys(merged.tree).forEach((sec) => { if (saved.tree[sec]) merged.tree[sec] = saved.tree[sec]; });
  return merged;
})();

function persist() { try { localStorage.setItem(LSKEY, JSON.stringify(state)); } catch (e) {} }

/* re-inject created pages + apply title/summary edits onto live data so every
   view (home, table, board, canvas, breadcrumbs) stays in sync */
function applyToData() {
  const D = data;
  Object.values(state.created).forEach((pg) => { D.pages[pg.id] = D.pages[pg.id] || pg; });
  Object.entries(state.edits).forEach(([pid, e]) => {
    if (D.pages[pid]) {
      if (e.title != null) D.pages[pid].title = e.title;
      if (e.summary != null) D.pages[pid].summary = e.summary;
    }
  });
}
applyToData();

/* ---------------- subscribe / set ---------------- */
const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); }
function setFn(updater) { const next = updater(state); if (next && next !== state) { state = next; persist(); emit(); } }
// shallow path setter that keeps unrelated slices referentially stable
function setIn(key, value) { setFn((s) => ({ ...s, [key]: value })); }

const EMPTY = [];
const EMPTY_EDIT = { blocks: {} };

/* ---------------- public API ---------------- */
export const store = {
  get: () => state,
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  currentUser: CURRENT_USER,
  rel,

  setStatus(id, v) { setIn("statuses", { ...state.statuses, [id]: v }); },

  /* tree */
  getTree(sectionId) { return state.tree[sectionId] || { nodes: [], collapsed: {} }; },
  toggleCollapse(sectionId, id) {
    const t = clone(state.tree[sectionId]);
    t.collapsed[id] = !t.collapsed[id];
    setIn("tree", { ...state.tree, [sectionId]: t });
  },
  moveNode(sectionId, dragId, targetId, mode) {
    if (dragId === targetId && mode !== "root") return;
    const t = clone(state.tree[sectionId]);
    const node = findNode(t.nodes, dragId);
    if (!node) return;
    if (mode !== "root" && subtreeIds(node).includes(targetId)) return; // no drop into own subtree
    removeNode(t.nodes, dragId);
    if (mode === "root") t.nodes.push(node);
    else if (!insertNode(t.nodes, targetId, node, mode)) t.nodes.push(node);
    setIn("tree", { ...state.tree, [sectionId]: t });
  },

  /* comments */
  getComments(pageId) { return state.comments[pageId] || EMPTY; },
  addComment(pageId, text) {
    const c = { id: uid("c"), who: CURRENT_USER, text, when: null, ts: Date.now(), replies: [] };
    setIn("comments", { ...state.comments, [pageId]: [...(state.comments[pageId] || []), c] });
    return c.id;
  },
  addReply(pageId, commentId, text) {
    const list = (state.comments[pageId] || []).map((c) =>
      c.id === commentId ? { ...c, replies: [...c.replies, { id: uid("r"), who: CURRENT_USER, text, when: null, ts: Date.now() }] } : c);
    setIn("comments", { ...state.comments, [pageId]: list });
  },
  deleteComment(pageId, commentId) {
    const list = (state.comments[pageId] || []).filter((c) => c.id !== commentId);
    setIn("comments", { ...state.comments, [pageId]: list });
  },
  whenLabel(item) { return item.when || rel(item.ts); },

  /* inline edits */
  getEdit(pageId) { return state.edits[pageId] || EMPTY_EDIT; },
  setMeta(pageId, field, value) {
    const e = { ...(state.edits[pageId] || { blocks: {} }), [field]: value };
    setIn("edits", { ...state.edits, [pageId]: e });
    if (data.pages[pageId]) data.pages[pageId][field] = value;
  },
  setBlock(pageId, idx, value) {
    const prev = state.edits[pageId] || { blocks: {} };
    const e = { ...prev, blocks: { ...prev.blocks, [idx]: value } };
    setIn("edits", { ...state.edits, [pageId]: e });
  },

  /* block editor — structural edits on a page's body */
  getBlocks(pageId) { return state.docs[pageId] || null; },
  ensureDoc(pageId) { if (!state.docs[pageId]) setIn("docs", { ...state.docs, [pageId]: seedBlocks(pageId) }); },
  _blocks(pageId) { return state.docs[pageId] || seedBlocks(pageId); },
  _setBlocks(pageId, blocks) {
    if (data.pages[pageId]) data.pages[pageId].updated = "just now";
    setIn("docs", { ...state.docs, [pageId]: blocks });
  },
  updateBlock(pageId, id, patch) {
    this._setBlocks(pageId, this._blocks(pageId).map((b) => (b.id === id ? { ...b, ...patch } : b)));
  },
  insertBlock(pageId, index, block) {
    const blocks = this._blocks(pageId).slice();
    const nb = { id: uid("b"), ...block };
    blocks.splice(index, 0, nb);
    this._setBlocks(pageId, blocks);
    return nb.id;
  },
  deleteBlock(pageId, id) { this._setBlocks(pageId, this._blocks(pageId).filter((b) => b.id !== id)); },
  duplicateBlock(pageId, id) {
    const blocks = this._blocks(pageId);
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const next = blocks.slice();
    next.splice(i + 1, 0, { ...clone(blocks[i]), id: uid("b") });
    this._setBlocks(pageId, next);
  },
  moveBlock(pageId, dragId, targetId, mode) {
    if (dragId === targetId) return;
    const blocks = this._blocks(pageId).slice();
    const from = blocks.findIndex((b) => b.id === dragId);
    if (from < 0) return;
    const [node] = blocks.splice(from, 1);
    let to = blocks.findIndex((b) => b.id === targetId);
    if (to < 0) { blocks.push(node); this._setBlocks(pageId, blocks); return; }
    if (mode === "after") to += 1;
    blocks.splice(to, 0, node);
    this._setBlocks(pageId, blocks);
  },

  /* created pages */
  createPage(sectionId, parentId) {
    const D = data;
    const id = uid("p");
    const n = state.order;
    const pg = {
      id, section: sectionId, title: "Untitled page", kind: "Draft",
      status: "todo", owner: CURRENT_USER, updated: "just now", tags: [],
      summary: "", links: [], body: [{ t: "p", text: "" }], created: true,
    };
    D.pages[id] = pg;
    const t = clone(state.tree[sectionId] || { nodes: [], collapsed: {} });
    const node = { id, children: [] };
    if (parentId && findNode(t.nodes, parentId)) insertNode(t.nodes, parentId, node, "child");
    else t.nodes.push(node);
    state = { ...state, created: { ...state.created, [id]: pg }, tree: { ...state.tree, [sectionId]: t }, order: n + 1 };
    persist(); emit();
    return id;
  },
};

/* ---------------- React hook ---------------- */
export function useEWStore(selector) {
  const sel = selector || ((s) => s);
  return React.useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

/* mention parsing — highlight @FirstName tokens that match a team member */
export function firstNames() {
  const t = data.team, m = {};
  Object.values(t).forEach((p) => { m[p.name.split(" ")[0].toLowerCase()] = p; });
  return m;
}
export function renderMentions(text) {
  const names = firstNames();
  const parts = String(text).split(/(@[A-Za-zÀ-ÿ]+)/g);
  return parts.map((part, i) => {
    if (part[0] === "@") {
      const key = part.slice(1).toLowerCase();
      if (names[key]) return React.createElement("span", { key: i, className: "mention" }, part);
    }
    return part;
  });
}
