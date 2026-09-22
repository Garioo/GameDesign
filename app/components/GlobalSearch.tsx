"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { loadSearchIndex, type SearchItem } from "@/lib/searchIndex";
import { storedActiveWorkspace } from "@/lib/session";
import CommandPalette, { type PaletteAction } from "./CommandPalette";

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
}: {
  open: boolean;
  onClose: () => void;
  config?: SearchConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const skipPages = !!config?.pages;
  const request = useRef(0);

  useEffect(() => {
    if (!open) return;
    const workspaceId = storedActiveWorkspace();
    if (!workspaceId) return;
    const mine = ++request.current;
    setLoading(true);
    loadSearchIndex(workspaceId, { skipPages })
      .then((items) => {
        if (mine === request.current) setLoaded(items);
      })
      .catch(console.error)
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
  }, [open, skipPages]);

  const items = useMemo(
    () => (config?.pages ? [...config.pages, ...loaded.filter((i) => i.kind !== "page")] : loaded),
    [config?.pages, loaded],
  );

  const onSelect = useCallback(
    (item: SearchItem) => {
      if (config?.onSelect?.(item)) return;
      // Routes read their query parameters on load, so a same-route jump reloads.
      const target = new URL(item.href, window.location.origin);
      if (target.pathname === pathname) window.location.assign(item.href);
      else router.push(item.href);
    },
    [config, pathname, router],
  );

  // Portal to <body>: the dock that mounts this has a transform (and
  // pointer-events: none), which would trap a position: fixed overlay inside it.
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <CommandPalette
      open={open}
      onClose={onClose}
      items={items}
      loading={loading && loaded.length === 0}
      actions={config?.actions}
      onSelect={onSelect}
    />,
    document.body,
  );
}
