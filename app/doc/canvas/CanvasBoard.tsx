"use client";

import { useCallback } from "react";
import {
  Tldraw,
  type Editor,
  type TLRecord,
  type TLUser,
  type TLInstancePresence,
  getSnapshot,
  createPresenceStateDerivation,
  InstancePresenceRecordType,
  computed,
  react,
  throttle,
} from "tldraw";
import "tldraw/tldraw.css";
import { supabase } from "@/lib/supabase";
import { loadCanvasScene, saveCanvasScene, type CanvasScene } from "@/lib/canvasRepo";
import { canvasAssetStore, removeAssetUrls, isCanvasAssetUrl } from "@/lib/canvasAssets";
import type { SessionInfo } from "@/lib/session";

type RecordsDiff = {
  added: Record<string, TLRecord>;
  updated: Record<string, [TLRecord, TLRecord]>;
  removed: Record<string, TLRecord>;
};

/** Snapshots of the document scope, as produced by getSnapshot(store).document. */
type DocumentSnapshot = { store: Record<string, TLRecord>; schema: unknown };

export type SaveState = "saved" | "saving" | "error";

// Supabase Realtime rejects broadcasts beyond ~256KB; stay safely under it.
const MAX_BROADCAST_CHARS = 200_000;

// Record types that belong to the document scope (everything that syncs).
const DOC_TYPES = new Set(["document", "page", "shape", "asset", "binding"]);
const tldrawLicenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
const needsTldrawLicenseKey = process.env.NODE_ENV === "production" && !tldrawLicenseKey;

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
  onSaveState,
  onHistoryChange,
}: {
  canvasId: string;
  session: SessionInfo;
  /** Hands the live editor up to the page so the nav-bar tools can drive it. */
  onReady?: (editor: Editor) => void;
  /** Reports the active tool id so the nav bar can highlight it. */
  onToolChange?: (toolId: string) => void;
  /** Reports persistence status so the topbar can show Saved / Saving / error. */
  onSaveState?: (state: SaveState) => void;
  /** Reports undo/redo availability so the nav bar can enable its buttons. */
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}) {
  const handleMount = useCallback(
    (editor: Editor) => {
      let disposed = false;
      let localEdits = false; // the user has drawn since mount
      let peerSnapshotApplied = false;
      let refetchTimer: ReturnType<typeof setTimeout> | null = null;
      onReady?.(editor);

      // Mirror the active tool + undo/redo availability up to the nav bar.
      const stopTool = react("active-tool", () => onToolChange?.(editor.getCurrentToolId()));
      const stopHistory = react("history-state", () =>
        onHistoryChange?.(editor.getCanUndo(), editor.getCanRedo()),
      );
      // Unique per browser tab so each open editor is its own "peer".
      const tabId = crypto.randomUUID();
      const presenceId = InstancePresenceRecordType.createId(tabId);
      const lastSeen = new Map<string, number>(); // remote presence id -> ts

      const channel = supabase.channel(`canvas-board:${canvasId}`, {
        config: { broadcast: { self: false } },
      });
      const sendBroadcast = (event: string, payload: unknown) => {
        if (channel.state !== "joined") return;
        channel
          .send({ type: "broadcast", event, payload })
          .then((result) => {
            if (result !== "ok") console.warn(`canvas broadcast ${event} ${result}`);
          })
          .catch(console.error);
      };

      // ---- persistence (debounced) ----
      const persist = throttle(() => {
        const { document } = getSnapshot(editor.store);
        saveCanvasScene(canvasId, { document } as unknown as CanvasScene)
          .then(() => onSaveState?.("saved"))
          .catch((e) => {
            console.error(e);
            onSaveState?.("error");
          });
      }, 1500);

      /**
       * Replace the document scope with a snapshot, applied as *remote* changes:
       * no broadcast echo, no persist loop, and the camera/session is untouched.
       * (Raw loadSnapshot would re-fire the "user" listener and broadcast a
       * stale full scene to everyone — clobbering their newest edits.)
       */
      const reconcileDocument = (document: DocumentSnapshot) => {
        const incoming = Object.values(document.store ?? {});
        if (incoming.length === 0) return;
        const incomingIds = new Set(incoming.map((r) => r.id));
        const toRemove = editor.store
          .allRecords()
          .filter((r) => DOC_TYPES.has(r.typeName) && !incomingIds.has(r.id))
          .map((r) => r.id);
        editor.store.mergeRemoteChanges(() => {
          editor.store.put(incoming);
          if (toRemove.length) editor.store.remove(toRemove);
        });
      };

      // ---- load the persisted scene ----
      (async () => {
        try {
          const scene = (await loadCanvasScene(canvasId)) as { document?: DocumentSnapshot };
          if (disposed) return;
          if (scene?.document) reconcileDocument(scene.document);
        } catch (e) {
          console.error("canvas scene load failed", e);
        }
      })();

      // Late-join gap: the DB snapshot can trail live edits by ~1.5s, so a
      // doc-big sender (or a joiner) needs a delayed refetch / peer snapshot.
      const scheduleRefetch = (delay: number) => {
        if (refetchTimer) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(async () => {
          refetchTimer = null;
          try {
            const scene = (await loadCanvasScene(canvasId)) as { document?: DocumentSnapshot };
            if (!disposed && scene?.document) reconcileDocument(scene.document);
          } catch (e) {
            console.error("canvas refetch failed", e);
          }
        }, delay);
      };

      // ---- broadcast local document edits ----
      const unlistenDoc = editor.store.listen(
        (update) => {
          localEdits = true;

          // Free Storage files for images the user just deleted.
          const removedAssets = Object.values(update.changes.removed)
            .filter((r) => r.typeName === "asset")
            .map((r) => (r as { props?: { src?: string } }).props?.src)
            .filter((src): src is string => !!src && isCanvasAssetUrl(src));
          if (removedAssets.length) removeAssetUrls(removedAssets).catch(console.error);

          // Oversized diffs (huge paste, big image set) would be rejected by
          // Realtime — tell peers to refetch from the DB after our save lands.
          const json = JSON.stringify(update.changes);
          if (json.length > MAX_BROADCAST_CHARS) {
            sendBroadcast("doc-big", { from: tabId });
          } else {
            sendBroadcast("doc", update.changes);
          }
          onSaveState?.("saving");
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
        sendBroadcast("presence", p);
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
        // A peer made an edit too large to broadcast: refetch once it's saved.
        .on("broadcast", { event: "doc-big" }, () => scheduleRefetch(2500))
        // A new peer joined: offer them our live state (fresher than the DB).
        .on("broadcast", { event: "sync-req" }, ({ payload }) => {
          const from = (payload as { from?: string })?.from;
          if (!from || from === tabId) return;
          const { document } = getSnapshot(editor.store);
          const json = JSON.stringify(document);
          if (json.length > MAX_BROADCAST_CHARS) return; // joiner falls back to DB
          sendBroadcast("sync-res", { to: from, document });
        })
        // Our join request was answered: adopt the first live snapshot offered.
        .on("broadcast", { event: "sync-res" }, ({ payload }) => {
          const p = payload as { to?: string; document?: DocumentSnapshot };
          if (p.to !== tabId || peerSnapshotApplied || localEdits || !p.document) return;
          peerSnapshotApplied = true;
          reconcileDocument(p.document);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            sendBroadcast("sync-req", { from: tabId });
          }
        });

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
        if (refetchTimer) clearTimeout(refetchTimer);
        stopTool();
        stopHistory();
        unlistenDoc();
        unlistenPresence();
        supabase.removeChannel(channel);
      };
    },
    [canvasId, session, onReady, onToolChange, onSaveState, onHistoryChange],
  );

  if (needsTldrawLicenseKey) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 440, textAlign: "center", color: "var(--ink-soft)" }}>
          <h2 style={{ color: "var(--ink)", marginBottom: 8 }}>Canvas license required</h2>
          <p style={{ margin: 0 }}>
            Set <code>NEXT_PUBLIC_TLDRAW_LICENSE_KEY</code> in Vercel to enable the production
            canvas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Toolbar is hidden (tools live in the app nav bar); images upload to
          Supabase Storage instead of being inlined as base64. The license key
          is required on production domains (localhost works without one). */}
      <Tldraw
        onMount={handleMount}
        components={{ Toolbar: null }}
        assets={canvasAssetStore}
        licenseKey={tldrawLicenseKey}
      />
    </div>
  );
}
