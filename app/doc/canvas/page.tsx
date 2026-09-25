"use client";

import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { GeoShapeGeoStyle, toRichText, type Editor } from "tldraw";
import CanvasSidebar from "./CanvasSidebar";
import CanvasBoard from "./CanvasBoard";
import SaveStatus, { type SaveState } from "@/app/components/SaveStatus";
import TopBar from "@/app/components/TopBar";
import { useSitePresence } from "@/lib/useSitePresence";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import { supabase } from "@/lib/supabase";
import { ensureSession, signOutAndClear, type SessionInfo } from "@/lib/session";
import {
  createCanvas,
  createCanvasFolder,
  deleteCanvas,
  deleteCanvasFolder,
  listCanvases,
  listCanvasFolders,
  moveCanvasToFolder,
  renameCanvas,
  renameCanvasFolder,
  type CanvasFolderInfo,
  type CanvasInfo,
} from "@/lib/canvasRepo";
import "../doc.css";
import "./canvas.css";


type IconProps = { className?: string };

const Grid = ({ className, style }: IconProps & { style?: CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const Plus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/* ---------- tldraw tool icons (rendered into the nav bar) ---------- */
const Cursor = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.5 18 2.3-7.2 7.2-2.3z" />
  </svg>
);
const Hand = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13" />
  </svg>
);
const Pencil = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const Eraser = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4L14 4a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L11 21z" /><path d="M22 21H7M5 13l6 6" />
  </svg>
);
const ArrowTool = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 19 19 5M9 5h10v10" />
  </svg>
);
const TextTool = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6V5h16v1M12 5v14M9 19h6" />
  </svg>
);
const Note = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2z" /><path d="M14 21v-5a2 2 0 0 1 2-2h5" />
  </svg>
);
const Square = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);
const ImageIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.5-4.5L5 21" />
  </svg>
);

// tldraw tool id -> nav-bar button. The geo (shape) tool has its own picker.
const TOOLS: { id: string; label: string; tip: string; Icon: ComponentType<IconProps> }[] = [
  { id: "select", label: "Select", tip: "Select & move things · V", Icon: Cursor },
  { id: "hand", label: "Hand", tip: "Pan around the canvas · H", Icon: Hand },
  { id: "draw", label: "Draw", tip: "Draw freehand · D", Icon: Pencil },
  { id: "eraser", label: "Eraser", tip: "Erase things · E", Icon: Eraser },
  { id: "arrow", label: "Arrow", tip: "Connect with arrows · A", Icon: ArrowTool },
  { id: "text", label: "Text", tip: "Add text · T", Icon: TextTool },
  { id: "note", label: "Note", tip: "Add a sticky note · N", Icon: Note },
];

/* ---------- geo shape picker ---------- */
const Ellipse = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8.5" />
  </svg>
);
const Triangle = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 4 21 20H3z" />
  </svg>
);
const Diamond = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 3l9 9-9 9-9-9z" />
  </svg>
);
const Hexagon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M7 4h10l5 8-5 8H7l-5-8z" />
  </svg>
);
const Star = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 2.5l2.9 6.2 6.6.9-4.8 4.6 1.2 6.7L12 17.7l-5.9 3.2 1.2-6.7-4.8-4.6 6.6-.9z" />
  </svg>
);
const Cloud = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);
const Oval = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="12" rx="9.5" ry="6.5" />
  </svg>
);
const XBox = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
  </svg>
);
const CheckBox = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="m8 12.5 3 3 5-6" />
  </svg>
);

const UndoIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
const RedoIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);

type GeoShape = (typeof GeoShapeGeoStyle)["values"] extends Iterable<infer V> ? V : never;

const SHAPES: { id: GeoShape; label: string; Icon: ComponentType<IconProps> }[] = [
  { id: "rectangle", label: "Rectangle", Icon: Square },
  { id: "ellipse", label: "Ellipse", Icon: Ellipse },
  { id: "triangle", label: "Triangle", Icon: Triangle },
  { id: "diamond", label: "Diamond", Icon: Diamond },
  { id: "hexagon", label: "Hexagon", Icon: Hexagon },
  { id: "star", label: "Star", Icon: Star },
  { id: "cloud", label: "Cloud", Icon: Cloud },
  { id: "oval", label: "Oval", Icon: Oval },
  { id: "arrow-right", label: "Arrow box", Icon: ArrowTool },
  { id: "x-box", label: "X box", Icon: XBox },
  { id: "check-box", label: "Check box", Icon: CheckBox },
];

export default function CanvasPage() {
  const router = useRouter();
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [folders, setFolders] = useState<CanvasFolderInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tool, setTool] = useState("select");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  const wsRef = useRef<string | null>(null);
  const retrySave = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await ensureSession();
        if (cancelled) return;
        if (!s) { router.replace("/login"); return; }
        if (!s.onboarded || !s.workspaceId) { router.replace("/onboarding"); return; }
        setSession(s);
        wsRef.current = s.workspaceId;
        const [list, folderList] = await Promise.all([
          listCanvases(s.workspaceId),
          listCanvasFolders(s.workspaceId),
        ]);
        if (cancelled) return;
        setCanvases(list);
        setFolders(folderList);
        // Deep link: honour ?c=<id> when it points at a real canvas.
        const wanted = new URLSearchParams(window.location.search).get("c");
        setActiveId(
          wanted && list.some((c) => c.id === wanted) ? wanted : (list[0]?.id ?? null),
        );
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  useSidebarLiveUpdates(loading ? null : session?.workspaceId ?? null,
    ["canvases", "canvas_folders"], async () => {
      if (!session) return;
      const [list, folderList] = await Promise.all([listCanvases(session.workspaceId), listCanvasFolders(session.workspaceId)]);
      setCanvases(list); setFolders(folderList);
    });


  const active = canvases.find((c) => c.id === activeId) ?? canvases[0] ?? null;

  // Name the browser tab after the open canvas (the route's static title is just "Canvas").
  const tabTitle = active ? active.name.trim() || "Untitled canvas" : null;
  useEffect(() => {
    if (tabTitle) document.title = `${tabTitle} · Foundry`;
  }, [tabTitle]);
  // Online teammates, site-wide, each with where they are (this canvas for us).
  const onlineList = useSitePresence(
    session,
    active ? { path: `/doc/canvas?c=${active.id}`, label: `${active.name || "Untitled"} · Canvas` } : { path: "/doc/canvas", label: "Canvas" },
  );

  // Viewers get a read-only board (CanvasBoard sets tldraw's isReadonly);
  // creating, renaming and deleting boards is hidden for them too.
  const canEdit = session?.role !== "viewer";

  const handleNew = async (folderId: string | null = null) => {
    const wsId = wsRef.current;
    if (!wsId || !canEdit) return;
    try {
      const c = await createCanvas(wsId, undefined, folderId);
      setCanvases((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      setActiveId(c.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRename = (id: string, name: string) => {
    if (!canEdit) return;
    setCanvases((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    renameCanvas(id, name).catch(console.error);
  };

  const handleDelete = (id: string) => {
    if (!canEdit) return;
    setCanvases((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
    deleteCanvas(id).catch(console.error);
  };

  const handleNewFolder = async (name: string) => {
    const wsId = wsRef.current;
    if (!wsId || !canEdit) return;
    try {
      const f = await createCanvasFolder(wsId, name);
      setFolders((prev) => (prev.some((x) => x.id === f.id) ? prev : [...prev, f]));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameFolder = (id: string, name: string) => {
    if (!canEdit) return;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    renameCanvasFolder(id, name).catch(console.error);
  };

  const handleDeleteFolder = (id: string) => {
    if (!canEdit) return;
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setCanvases((prev) => prev.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)));
    deleteCanvasFolder(id).catch(console.error);
  };

  const handleMoveToFolder = (canvasId: string, folderId: string | null) => {
    if (!canEdit) return;
    setCanvases((prev) => prev.map((c) => (c.id === canvasId ? { ...c, folderId } : c)));
    moveCanvasToFolder(canvasId, folderId).catch(console.error);
  };

  // Drop the editor reference when there is no board mounted.
  useEffect(() => {
    if (!active) setEditor(null);
  }, [active]);

  // Fresh board, fresh status.
  useEffect(() => {
    setSaveState("saved");
    setHistory({ canUndo: false, canRedo: false });
  }, [activeId]);

  // Warn before a reload/close drops a save that's still queued or failed.
  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  // Keep ?c=<id> in the URL so refresh / sharing reopens the same canvas.
  // history.replaceState avoids a Next.js re-render round-trip.
  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    if (active?.id) url.searchParams.set("c", active.id);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url.toString());
  }, [loading, active?.id]);

  // Arriving from the scrum board (?note=<text>): drop the to-do onto the
  // fresh canvas as a sticky note. The param is stripped first so reloads
  // (and React strict-mode re-runs) can't spawn duplicates.
  useEffect(() => {
    if (!editor) return;
    const url = new URL(window.location.href);
    const note = url.searchParams.get("note");
    if (!note) return;
    url.searchParams.delete("note");
    window.history.replaceState(null, "", url.toString());
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      type: "note",
      x: center.x - 100,
      y: center.y - 100,
      props: { richText: toRichText(note), size: "l" },
    });
  }, [editor]);

  // Close the shape menu on outside click.
  useEffect(() => {
    if (!shapeMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".shape-wrap")) setShapeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [shapeMenuOpen]);

  const pickTool = (id: string) => editor?.setCurrentTool(id);

  const pickShape = (shape: GeoShape) => {
    setShapeMenuOpen(false);
    if (!editor) return;
    editor.setStyleForNextShapes(GeoShapeGeoStyle, shape);
    editor.setCurrentTool("geo");
  };

  const onImageChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    await editor.putExternalContent({
      type: "files",
      files: [file],
      point: editor.getViewportPageBounds().center,
    });
  };

  if (loading) {
    return (
      <div className="app">
        <div className="screen">
          <p style={{ color: "var(--ink-soft)" }}>Loading canvases…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app">
        <div className="screen">
          <h1>Couldn&apos;t load canvases</h1>
          <p style={{ color: "var(--ink-soft)", maxWidth: 460 }}>{error}</p>
          <p style={{ color: "var(--ink-faint)", fontSize: 13 }}>
            Make sure the <code>canvases</code> table exists — run supabase/schema.sql.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={"app canvas-app" + (sidebarOpen ? " nav-open" : "")}>
      {/* top bar (global chrome) */}
      <TopBar
        crumbs={active ? ["Canvas", active.name] : ["Canvas"]}
        online={onlineList}
        selfKey={session?.userId}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        workspaceId={session?.workspaceId}
      >
        {active && (
          <SaveStatus state={saveState} onRetry={() => retrySave.current?.()} />
        )}
        <button className="share-btn">Share</button>
        <button
          className="share-btn"
          onClick={async () => {
            await signOutAndClear();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      <div className="body">
        {sidebarOpen && (
          <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
        )}
        {/* canvas sidebar */}
        <CanvasSidebar
          canvases={canvases}
          folders={folders}
          activeId={active?.id ?? null}
          onSelect={(id) => { setActiveId(id); setSidebarOpen(false); }}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewFolder={handleNewFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveToFolder={handleMoveToFolder}
          canEdit={canEdit}
        />

        {/* canvas area */}
        <main className="main" style={{ position: "relative", padding: 0, overflow: "hidden" }}>
          {active && session ? (
            <CanvasBoard
              key={active.id}
              canvasId={active.id}
              session={session}
              onReady={setEditor}
              onToolChange={setTool}
              onSaveState={setSaveState}
              retryRef={retrySave}
              onHistoryChange={(canUndo, canRedo) => setHistory({ canUndo, canRedo })}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-faint)",
              }}
            >
              <Grid className="dock-icon" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.3 }} />
              <p style={{ fontSize: 15 }}>No canvas selected</p>
              {canEdit && (
                <button className="new-page" style={{ marginTop: 12 }} onClick={() => handleNew()}>
                  <Plus className="new-page-icon" />
                  New canvas
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* dock (global chrome) — tldraw tools by default; hovering the strip
          underneath swaps in the app nav until the mouse leaves the bar */}
      <Dock
        onNew={canEdit ? () => handleNew() : undefined}
        tools={
          <div className="dock-tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={"dock-tool" + (tool === t.id ? " is-active" : "")}
                data-tip={t.tip}
                aria-label={t.label}
                disabled={!editor}
                onClick={() => pickTool(t.id)}
              >
                <t.Icon className="dock-tool-icon" />
              </button>
            ))}
            <span className="shape-wrap">
              <button
                className={"dock-tool" + (tool === "geo" ? " is-active" : "")}
                data-tip="Add shapes — boxes, circles & more"
                aria-label="Shapes"
                aria-expanded={shapeMenuOpen}
                disabled={!editor}
                onClick={() => setShapeMenuOpen((o) => !o)}
              >
                <Square className="dock-tool-icon" />
              </button>
              {shapeMenuOpen && (
                <div className="shape-menu">
                  {SHAPES.map((s) => (
                    <button
                      key={s.id}
                      className="shape-option"
                      data-tip={s.label}
                      aria-label={s.label}
                      onClick={() => pickShape(s.id)}
                    >
                      <s.Icon className="dock-tool-icon" />
                    </button>
                  ))}
                </div>
              )}
            </span>
            <button
              className="dock-tool"
              data-tip="Insert an image"
              aria-label="Insert image"
              disabled={!editor}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="dock-tool-icon" />
            </button>
            <span className="dock-divider" />
            <button
              className="dock-tool"
              data-tip="Undo · Ctrl+Z"
              aria-label="Undo"
              disabled={!editor || !history.canUndo}
              onClick={() => editor?.undo()}
            >
              <UndoIcon className="dock-tool-icon" />
            </button>
            <button
              className="dock-tool"
              data-tip="Redo · Ctrl+Shift+Z"
              aria-label="Redo"
              disabled={!editor || !history.canRedo}
              onClick={() => editor?.redo()}
            >
              <RedoIcon className="dock-tool-icon" />
            </button>
          </div>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onImageChosen}
      />
    </div>
  );
}
