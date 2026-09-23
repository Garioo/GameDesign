import { useEffect, useRef, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * Keyboard shortcuts, app-wide.
 *
 * Components register shortcuts with useShortcuts() while they're mounted;
 * one window listener matches key presses against everything registered.
 * The same registry feeds the "?" help overlay and the ⌘K palette (every
 * shortcut is also a command there), so a shortcut is defined exactly once.
 *
 * Key syntax: "n", "shift+n", "mod+k" (⌘ on Apple, Ctrl elsewhere), "alt+x",
 * symbols as typed ("?", "/", "[", ">"), named keys ("Escape", "ArrowLeft"),
 * and two-step sequences separated by a space ("g h").
 *
 * Plain-key shortcuts never fire while you type (inputs, contentEditable),
 * while a dialog is open, or inside the canvas (tldraw uses letters for its
 * tools). Modifier combos fire everywhere unless `inInputs` is false.
 * Later registrations win, so a page can take over a global key.
 * ------------------------------------------------------------------------- */

export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  /** Help overlay section, e.g. "Navigation", "General", "Page". */
  group: string;
  run: () => void;
  /** Default true. Disabled shortcuts are hidden and don't fire. */
  enabled?: boolean;
  /** Fire while typing. Defaults to true for mod combos, false otherwise. */
  inInputs?: boolean;
  /** List it as a ⌘K command (default true). */
  palette?: boolean;
}

interface Registration {
  order: number;
  list: Shortcut[];
}

const registrations = new Map<symbol, Registration>();
const listeners = new Set<() => void>();
let snapshot: Shortcut[] = [];
let order = 0;

function publish() {
  snapshot = [...registrations.values()]
    .sort((a, b) => a.order - b.order)
    .flatMap((r) => r.list.filter((s) => s.enabled !== false));
  for (const l of listeners) l();
}

/* ---------- key normalisation ---------- */

export const isApple = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "",
  );

/** "mod+shift+K" → "mod+shift+k" (modifier order fixed, letters lowercase). */
function normCombo(combo: string): string {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return [mods.has("mod") && "mod", mods.has("alt") && "alt", mods.has("shift") && "shift", key.length === 1 ? key.toLowerCase() : key]
    .filter(Boolean)
    .join("+");
}

function eventCombo(e: KeyboardEvent): string {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // For symbols Shift is already in e.key ("?" not "shift+/"); only letters,
  // digits and named keys carry an explicit shift.
  const shiftMatters = e.key.length > 1 || /^[a-z0-9]$/i.test(e.key);
  return [(e.metaKey || e.ctrlKey) && "mod", e.altKey && "alt", e.shiftKey && shiftMatters && "shift", key]
    .filter(Boolean)
    .join("+");
}

const steps = (keys: string) => keys.trim().split(/\s+/).map(normCombo);
const hasMod = (keys: string) => /(^|\s|\+)mod\+/.test(keys) || /(^|\+)alt\+/.test(keys);

function isTyping(t: EventTarget | null): boolean {
  const el = t instanceof HTMLElement ? t : null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
  }
  return false;
}

const dialogOpen = () =>
  !!document.querySelector('[role="dialog"]:not([data-shortcuts-ok]), dialog[open], .palette-backdrop');

/* ---------- sequences ("g h") ---------- */

const SEQUENCE_MS = 1500;
let pending: { first: string; at: number; timer: ReturnType<typeof setTimeout> } | null = null;
const pendingListeners = new Set<() => void>();
function setPending(p: typeof pending) {
  if (pending) clearTimeout(pending.timer);
  pending = p;
  for (const l of pendingListeners) l();
}

/* ---------- dispatcher ---------- */

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing || e.repeat) return;
    if (["Shift", "Meta", "Control", "Alt"].includes(e.key)) return;
    const combo = eventCombo(e);
    const typing = isTyping(e.target);
    const inCanvas = e.target instanceof Element && !!e.target.closest(".tl-container");
    const modal = dialogOpen();
    const allowed = (s: Shortcut) => {
      const modded = hasMod(s.keys);
      if (typing && !(s.inInputs ?? modded)) return false;
      if (!modded && (inCanvas || (modal && s.keys !== "?"))) return false;
      return true;
    };
    // Newest registration first: pages override the global layer.
    const all = [...snapshot].reverse();

    if (pending && Date.now() - pending.at < SEQUENCE_MS) {
      const first = pending.first;
      setPending(null);
      const hit = all.find((s) => {
        const st = steps(s.keys);
        return st.length === 2 && st[0] === first && st[1] === combo && allowed(s);
      });
      if (hit) {
        e.preventDefault();
        hit.run();
        return;
      }
      if (combo === "Escape") return;
    }

    const single = all.find((s) => {
      const st = steps(s.keys);
      return st.length === 1 && st[0] === combo && allowed(s);
    });
    if (single) {
      e.preventDefault();
      single.run();
      return;
    }
    if (all.some((s) => { const st = steps(s.keys); return st.length === 2 && st[0] === combo && allowed(s); })) {
      e.preventDefault();
      setPending({ first: combo, at: Date.now(), timer: setTimeout(() => setPending(null), SEQUENCE_MS) });
    }
  });
}

/* ---------- hooks ---------- */

/**
 * Register shortcuts while the component is mounted. The list may be rebuilt
 * every render; `run` always calls the latest closure.
 */
export function useShortcuts(list: Shortcut[]): void {
  const id = useRef<symbol | null>(null);
  if (!id.current) id.current = Symbol("shortcuts");
  const latest = useRef(list);
  latest.current = list;
  // Only re-publish when what's shown (keys, labels, enabled) changes.
  const shape = list.map((s) => `${s.id}|${s.keys}|${s.label}|${s.group}|${s.enabled !== false}|${s.palette !== false}`).join("\n");
  useEffect(() => {
    install();
    const key = id.current!;
    const wrapped = latest.current.map((s) => ({ ...s, run: () => latest.current.find((x) => x.id === s.id)?.run() }));
    const prev = registrations.get(key);
    registrations.set(key, { order: prev?.order ?? ++order, list: wrapped });
    publish();
  }, [shape]);
  useEffect(() => {
    const key = id.current!;
    return () => {
      registrations.delete(key);
      publish();
    };
  }, []);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Shortcut[] = [];

/** Every enabled shortcut, in registration order (for help and the palette). */
export function useShortcutList(): Shortcut[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** The first key of a sequence that's waiting for its second key, if any. */
export function usePendingSequence(): string | null {
  return useSyncExternalStore(
    (l) => {
      pendingListeners.add(l);
      return () => pendingListeners.delete(l);
    },
    () => pending?.first ?? null,
    () => null,
  );
}

/** Second steps available after `first` (for the "g → …" hint). */
export function continuations(list: Shortcut[], first: string): { key: string; label: string }[] {
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const s of [...list].reverse()) {
    const st = steps(s.keys);
    if (st.length !== 2 || st[0] !== first || seen.has(st[1])) continue;
    seen.add(st[1]);
    out.push({ key: st[1], label: s.label });
  }
  return out.reverse();
}

/** Keys as display chips: "mod+shift+k" → ["⌘", "⇧", "K"]; "g h" → ["G", "H"]. */
export function keyChips(keys: string): string[][] {
  const apple = isApple();
  const name = (k: string): string => {
    switch (k) {
      case "mod": return apple ? "⌘" : "Ctrl";
      case "alt": return apple ? "⌥" : "Alt";
      case "shift": return "⇧";
      case "Escape": return "Esc";
      case "ArrowLeft": return "←";
      case "ArrowRight": return "→";
      case "ArrowUp": return "↑";
      case "ArrowDown": return "↓";
      case "Enter": return "↵";
      default: return k.length === 1 ? k.toUpperCase() : k;
    }
  };
  return keys.trim().split(/\s+/).map((step) => step.split("+").map(name));
}
