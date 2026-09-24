import { useEffect, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * What's open on screen, for "follow".
 *
 * Presence `path` says *where* someone is (a page, a board, the calendar);
 * a "view" says what they have open there — a task dialog, a calendar event,
 * version history. Views are flat string maps that double as query params
 * (e.g. { card: "<id>" }, { date: "2026-09-21", event: "<id>" }), so the
 * who's-online list can deep-link to them too.
 *
 * Two small stores:
 *  - your view: components publish what they have open with useShareView();
 *    useSitePresence tracks the merged result for everyone else.
 *  - the followed view: TopBar publishes the view of the person you follow
 *    while you're at the same place; pages read it with useFollowedView()
 *    and open / close the same things, no reload needed.
 * ------------------------------------------------------------------------- */

export type View = Record<string, string>;

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
  };
}

/* ---------- your own view ---------- */

const parts = new Map<string, View>();
const own = store<View>({});
const publishOwn = () => own.set(Object.assign({}, ...parts.values()) as View);

/** Publish what `source` has open (null = nothing). Cleared on unmount. */
export function useShareView(source: string, view: View | null): void {
  const key = view ? JSON.stringify(view) : "";
  useEffect(() => {
    if (key) parts.set(source, JSON.parse(key) as View);
    else parts.delete(source);
    publishOwn();
  }, [source, key]);
  useEffect(() => () => { parts.delete(source); publishOwn(); }, [source]);
}

/** Your merged view, for presence. */
export function useOwnView(): View {
  return useSyncExternalStore(own.subscribe, own.get, own.get);
}

/* ---------- the followed person's view ---------- */

// undefined = not following anyone here; {} = following, nothing open.
const followed = store<View | undefined>(undefined);
let followedKey = "";

export function publishFollowedView(view: View | undefined): void {
  const key = view === undefined ? "" : JSON.stringify(view);
  if (key === followedKey) return;
  followedKey = key;
  followed.set(view);
}

/** What the person you follow has open at your current place, or undefined when not following. */
export function useFollowedView(): View | undefined {
  return useSyncExternalStore(followed.subscribe, followed.get, () => undefined);
}

/** A view's params appended to a path — the deep link to "where they are, with that open". */
export function withView(path: string, view: View | undefined): string {
  if (!view || !Object.keys(view).length) return path;
  const url = new URL(path, "http://x");
  for (const [k, v] of Object.entries(view)) url.searchParams.set(k, v);
  return url.pathname + url.search;
}
