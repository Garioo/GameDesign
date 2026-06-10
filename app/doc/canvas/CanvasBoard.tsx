"use client";

import { useCallback } from "react";
import {
  Tldraw,
  type Editor,
  type TLRecord,
  type TLUser,
  type TLInstancePresence,
  getSnapshot,
  loadSnapshot,
  createPresenceStateDerivation,
  InstancePresenceRecordType,
  computed,
  react,
  throttle,
} from "tldraw";
import "tldraw/tldraw.css";
import { supabase } from "@/lib/supabase";
import { loadCanvasScene, saveCanvasScene, type CanvasScene } from "@/lib/canvasRepo";
import type { SessionInfo } from "@/lib/session";

type RecordsDiff = {
  added: Record<string, TLRecord>;
  updated: Record<string, [TLRecord, TLRecord]>;
  removed: Record<string, TLRecord>;
};

/**
 * A single collaborative tldraw board. Document edits and live cursors are
 * synced over a per-canvas Supabase Realtime channel; the scene is persisted
 * (debounced) to canvases.data so it survives reloads and late-joiners see it.
 */
export default function CanvasBoard({
  canvasId,
  session,
  onReady,
  onToolChange,
}: {
  canvasId: string;
  session: SessionInfo;
  /** Hands the live editor up to the page so the nav-bar tools can drive it. */
  onReady?: (editor: Editor) => void;
  /** Reports the active tool id so the nav bar can highlight it. */
  onToolChange?: (toolId: string) => void;
}) {
  const handleMount = useCallback(
    (editor: Editor) => {
      let disposed = false;
      onReady?.(editor);

      // Mirror the active tool up to the nav bar.
      const stopTool = react("active-tool", () => onToolChange?.(editor.getCurrentToolId()));
      // Unique per browser tab so each open editor is its own "peer".
      const tabId = crypto.randomUUID();
      const presenceId = InstancePresenceRecordType.createId(tabId);
      const lastSeen = new Map<string, number>(); // remote presence id -> ts

      const channel = supabase.channel(`canvas-board:${canvasId}`, {
        config: { broadcast: { self: false } },
      });

      // ---- persistence (debounced) ----
      const persist = throttle(() => {
        const { document } = getSnapshot(editor.store);
        saveCanvasScene(canvasId, { document } as unknown as CanvasScene).catch(console.error);
      }, 1500);

      // ---- load the persisted scene ----
      (async () => {
        try {
          const scene = await loadCanvasScene(canvasId);
          if (disposed) return;
          if (scene && (scene as { document?: unknown }).document) {
            loadSnapshot(editor.store, scene as Parameters<typeof loadSnapshot>[1]);
          }
        } catch (e) {
          console.error("canvas loadSnapshot failed", e);
        }
      })();

      // ---- broadcast local document edits ----
      const unlistenDoc = editor.store.listen(
        (update) => {
          channel.send({ type: "broadcast", event: "doc", payload: update.changes });
          persist();
        },
        { source: "user", scope: "document" },
      );

      // ---- broadcast our live presence (cursor / selection) ----
      const userSignal = computed<TLUser>("user", () => ({
        id: `user:${tabId}` as TLUser["id"],
        typeName: "user",
        name: session.name,
        color: session.color,
        imageUrl: "",
        meta: {},
      }));
      const presence$ = createPresenceStateDerivation(userSignal, { instanceId: presenceId })(
        editor.store,
      );
      const sendPresence = throttle((p: TLInstancePresence) => {
        channel.send({ type: "broadcast", event: "presence", payload: p });
      }, 60);
      const unlistenPresence = react("broadcast-presence", () => {
        const p = presence$.get();
        if (p) sendPresence(p);
      });

      // ---- apply remote changes ----
      const applyDoc = (changes: RecordsDiff) => {
        editor.store.mergeRemoteChanges(() => {
          for (const r of Object.values(changes.added)) editor.store.put([r]);
          for (const [, to] of Object.values(changes.updated)) editor.store.put([to]);
          for (const r of Object.values(changes.removed)) editor.store.remove([r.id]);
        });
      };
      const applyPresence = (p: TLInstancePresence) => {
        lastSeen.set(p.id, Date.now());
        editor.store.mergeRemoteChanges(() => editor.store.put([p]));
      };

      channel
        .on("broadcast", { event: "doc" }, ({ payload }) => applyDoc(payload as RecordsDiff))
        .on("broadcast", { event: "presence" }, ({ payload }) =>
          applyPresence(payload as TLInstancePresence),
        )
        .subscribe();

      // ---- prune cursors of peers that went quiet ----
      const prune = setInterval(() => {
        const cutoff = Date.now() - 8000;
        const stale: TLRecord["id"][] = [];
        for (const [id, ts] of lastSeen) {
          if (ts < cutoff) {
            stale.push(id as TLRecord["id"]);
            lastSeen.delete(id);
          }
        }
        if (stale.length) {
          editor.store.mergeRemoteChanges(() => editor.store.remove(stale));
        }
      }, 4000);

      return () => {
        disposed = true;
        clearInterval(prune);
        stopTool();
        unlistenDoc();
        unlistenPresence();
        supabase.removeChannel(channel);
      };
    },
    [canvasId, session, onReady, onToolChange],
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* The default bottom toolbar is hidden — its tools live in the app nav bar. */}
      <Tldraw onMount={handleMount} components={{ Toolbar: null }} />
    </div>
  );
}
