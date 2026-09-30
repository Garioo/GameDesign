import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * Beta features, switched on per browser from Settings. The choice lives in
 * localStorage so it needs no database change; every open tab follows along
 * through the `storage` event, and the current tab through BETA_EVENT.
 * ------------------------------------------------------------------------- */

const RIVER_KEY = "foundry-beta-river";
const BETA_EVENT = "foundry-beta-change";

function read(): boolean {
  try {
    return localStorage.getItem(RIVER_KEY) === "1";
  } catch {
    return false; // storage blocked — stay on the classic design
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(BETA_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(BETA_EVENT, onChange);
  };
}

/** True when this browser has the new design (River) switched on. False on the server. */
export function useRiverBeta(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function isRiverBeta(): boolean {
  return typeof window !== "undefined" && read();
}

export function setRiverBeta(on: boolean): void {
  try {
    if (on) localStorage.setItem(RIVER_KEY, "1");
    else localStorage.removeItem(RIVER_KEY);
  } catch {
    /* storage blocked — nothing to remember */
  }
  window.dispatchEvent(new Event(BETA_EVENT));
}

/* Where each classic page lives in the new design, and back again. Only
   views the new design has rebuilt are redirected; the rest stay classic. */
export function riverPathFor(pathname: string, search: URLSearchParams): string | null {
  // ?classic=1 opens a classic page on purpose (e.g. the full task dialog), so it's never redirected.
  if (search.get("classic")) return null;
  // Someone else's work (/work?person=) has no River view yet, so it stays classic.
  if (pathname === "/home" || pathname === "/digest" || (pathname === "/work" && !search.get("person"))) return "/river";
  if (pathname === "/table") return "/river/plan?view=timeline";
  if (pathname === "/board") {
    const q = new URLSearchParams({ view: "board" });
    for (const k of ["board", "card", "category"]) { const v = search.get(k); if (v) q.set(k, v); }
    return `/river/plan?${q}`;
  }
  if (pathname === "/doc") {
    const q = new URLSearchParams();
    for (const k of ["page", "section"]) { const v = search.get(k); if (v) q.set(k, v); }
    return `/river/pages${q.size ? `?${q}` : ""}`;
  }
  if (pathname === "/calendar") {
    const q = new URLSearchParams({ view: "calendar" });
    for (const k of ["date", "event", "occ"]) { const v = search.get(k); if (v) q.set(k, v); }
    return `/river/plan?${q}`;
  }
  return null;
}

/** Where the new design's Plan and Pages tabs point. */
export const RIVER_PLAN_HREF = "/river/plan";
export const RIVER_PAGES_HREF = "/river/pages";

export function classicPathFor(pathname: string, search: URLSearchParams): string {
  if (pathname.startsWith("/river/plan")) {
    const view = search.get("view");
    if (view === "board") return "/board";
    if (view === "calendar") return "/calendar";
    return "/table";
  }
  if (pathname.startsWith("/river/pages")) return `/doc${search.get("page") ? `?page=${search.get("page")}` : ""}`;
  return "/home";
}
