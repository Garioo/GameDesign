import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * "Follow" a teammate: the top bar takes you wherever they go (from site
 * presence), and on a page the editor keeps the block they're typing in on
 * screen (from live cursors). Kept in sessionStorage so it survives the full
 * reloads some same-route jumps do, and cleared when the tab closes.
 * ------------------------------------------------------------------------- */

export interface Followed {
  key: string; // profile id
  name: string;
  color: string;
  initials: string;
}

const STORE_KEY = "gdd:follow";
const listeners = new Set<() => void>();
let current: Followed | null | undefined; // undefined = not read yet

function read(): Followed | null {
  if (current !== undefined) return current;
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
    current = v && typeof v.key === "string" ? (v as Followed) : null;
  } catch {
    current = null;
  }
  return current;
}

export function setFollowed(f: Followed | null): void {
  current = f;
  try {
    if (f) sessionStorage.setItem(STORE_KEY, JSON.stringify(f));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked: following still works until the next reload */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Who you're following, if anyone. */
export function useFollowed(): Followed | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
