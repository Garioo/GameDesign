"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { loadSearchIndex, type SearchItem } from "@/lib/searchIndex";
import { storedActiveWorkspace } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { setCardOwner } from "@/lib/boardRepo";
import { navigateWithTransition } from "@/lib/viewTransition";
import { useShortcutList } from "@/lib/shortcuts";
import CommandPalette, { type PaletteAction } from "./CommandPalette";

/** How to open the palette: prefilled ("@", ">") or straight into a picker command. */
export interface PaletteOpen {
  query?: string;
  picker?: string;
}

const RECENT_MAX = 8;
const recentStoreKey = (workspaceId: string) => `gdd:palette-recent:${workspaceId}`;

function readRecent(workspaceId: string | null): string[] {
  if (!workspaceId) return [];
  try {
    const v = JSON.parse(localStorage.getItem(recentStoreKey(workspaceId)) ?? "[]");
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(workspaceId: string | null, key: string) {
  if (!workspaceId) return;
  try {
    const next = [key, ...readRecent(workspaceId).filter((k) => k !== key)].slice(0, RECENT_MAX);
    localStorage.setItem(recentStoreKey(workspaceId), JSON.stringify(next));
  } catch {
    /* storage blocked: recents are a convenience */
  }
}

/** Today as YYYY-MM-DD in local time (the calendar's ?date= format). */
function todayParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}



/** Per-route additions to the global ⌘K palette. */
export interface SearchConfig {
  /** Live page items; when given, pages are not loaded from the database. */
  pages?: SearchItem[];
  actions?: PaletteAction[];
  /** Handle a selection in place (e.g. open a page without navigating). Return true when handled. */
  onSelect?: (item: SearchItem) => boolean;
}

/**
 * The ⌘K palette over the whole workspace. The index loads on first open and
 * refreshes in the background on every later open, so results show at once.
 */
export default function GlobalSearch({
  open,
  onClose,
  config,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  config?: SearchConfig;
  initial?: PaletteOpen;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const skipPages = !!config?.pages;
  const request = useRef(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  // Local owner changes made from the palette, until the index reloads.
  const [ownerPatch, setOwnerPatch] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!open) return;
    const workspaceId = storedActiveWorkspace();
    setRecentKeys(readRecent(workspaceId));
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null)).catch(() => {});
    if (!workspaceId) return;
    const mine = ++request.current;
    setLoading(true);
    loadSearchIndex(workspaceId, { skipPages })
      .then((items) => {
        if (mine === request.current) {
          setLoaded(items);
          setOwnerPatch(new Map());
        }
      })
      .catch(console.error)
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
  }, [open, skipPages]);

  const items = useMemo(() => {
    const all = config?.pages ? [...config.pages, ...loaded.filter((i) => i.kind !== "page")] : loaded;
    return ownerPatch.size ? all.map((i) => (ownerPatch.has(i.key) ? { ...i, ownerIds: ownerPatch.get(i.key) } : i)) : all;
  }, [config?.pages, loaded, ownerPatch]);

  const go = useCallback(
    (href: string) => {
      // Routes read their query parameters on load, so a same-route jump reloads.
      const target = new URL(href, window.location.origin);
      if (target.pathname === pathname) window.location.assign(href);
      else navigateWithTransition(router, href);
    },
    [pathname, router],
  );

  const onSelect = useCallback(
    (item: SearchItem) => {
      rememberRecent(storedActiveWorkspace(), item.key);
      if (config?.onSelect?.(item)) return;
      go(item.href);
    },
    [config, go],
  );

  // "Assign a task to me…": pick a task; picking one that's already yours unassigns you.
  const assign = useMemo<PaletteAction | null>(() => {
    if (!userId) return null;
    return {
      key: "assign-me",
      label: "Assign a task to me…",
      hint: "or unassign yourself",
      icon: "assign",
      pick: {
        title: "Assign to me",
        placeholder: "Which task? Pick one of yours to unassign",
        options: () => {
          const tasks = items.filter((i) => i.kind === "card");
          const rank = (i: SearchItem) => (i.done ? 2 : i.ownerIds?.includes(userId) ? 1 : 0);
          return tasks
            .map((item) => ({ item, r: rank(item) }))
            .sort((a, b) => a.r - b.r)
            .map(({ item, r }) => ({
              item,
              hint: r === 1 ? "Yours · pick to unassign" : r === 2 ? `Done · ${item.hint}` : item.ownerIds?.length ? `${item.hint} · ${item.ownerIds.length} assigned` : item.hint,
            }));
        },
        run: async (item) => {
          const cardId = item.key.slice("card:".length);
          const mineNow = !!item.ownerIds?.includes(userId);
          const owners = await setCardOwner(cardId, userId, !mineNow);
          setOwnerPatch((m) => new Map(m).set(item.key, owners));
          return mineNow ? `Unassigned you from “${item.title}”` : `Assigned “${item.title}” to you`;
        },
      },
    };
  }, [items, userId]);

  // Every keyboard shortcut is a command too (lib/shortcuts.ts), shown with its keys.
  const shortcuts = useShortcutList();
  const actions = useMemo<PaletteAction[]>(() => {
    const seen = new Set<string>();
    const fromKeys: PaletteAction[] = [];
    for (const sc of [...shortcuts].reverse()) {
      if (sc.palette === false || seen.has(sc.keys)) continue;
      seen.add(sc.keys);
      fromKeys.unshift({
        key: `sc:${sc.id}`,
        label: sc.label,
        hint: sc.group === "Navigation" || sc.group === "General" ? undefined : sc.group,
        icon: sc.group === "Navigation" ? (sc.id === "go-digest" ? "digest" : "arrow") : "command",
        shortcut: sc.keys,
        run: sc.run,
      });
    }
    // A route action and a shortcut can be the same command; keep the one with keys.
    const labels = new Set(fromKeys.map((a) => a.label.toLowerCase()));
    return [
      ...(config?.actions ?? []).filter((a) => !labels.has(a.label.toLowerCase())),
      ...(assign ? [{ ...assign, shortcut: "a" }] : []),
      ...fromKeys,
      {
        key: "today",
        label: "Jump to today in calendar",
        icon: "calendar" as const,
        run: () => go(`/calendar?date=${todayParam()}`),
      },
    ];
  }, [config?.actions, assign, go, shortcuts]);

  // Portal to <body>: the dock that mounts this has a transform (and
  // pointer-events: none), which would trap a position: fixed overlay inside it.
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <CommandPalette
      open={open}
      onClose={onClose}
      items={items}
      loading={loading && loaded.length === 0}
      actions={actions}
      recentKeys={recentKeys}
      initialQuery={initial?.query}
      initialPicker={initial?.picker}
      onSelect={onSelect}
    />,
    document.body,
  );
}
