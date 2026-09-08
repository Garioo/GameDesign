"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

/** Workspace snapshots recover missed events; DELETE events cannot be filtered. */
export function useSidebarLiveUpdates(workspaceId: string | null, tables: string[], refresh: () => Promise<void>) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const tableKey = tables.join(",");
  useEffect(() => {
    if (!workspaceId) return;
    let disposed = false;
    let running = false;
    let queued = false;
    let degraded = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function run() {
      if (disposed) return;
      if (running) { queued = true; return; }
      running = true;
      try { await refreshRef.current(); }
      catch (error) { console.error("Sidebar refresh failed", error); }
      finally {
        running = false;
        if (queued && !disposed) { queued = false; schedule(); }
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    }
    const channel = supabase.channel(`sidebar:${workspaceId}:${tableKey}`);
    for (const table of tableKey.split(",")) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        channel.on("postgres_changes", { event, schema: "public", table, filter: `project_id=eq.${workspaceId}` }, schedule);
      }
      // Refetch only the current workspace; never trust a deleted row's payload.
      channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, schedule);
    }
    channel.subscribe(status => {
      degraded = status !== "SUBSCRIBED";
      if (!degraded) schedule();
    });
    function visible() { if (document.visibilityState === "visible") schedule(); }
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const fallback = setInterval(() => { if (degraded) visible(); }, 30000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, tableKey]);
}
