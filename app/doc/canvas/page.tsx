"use client";

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "tldraw";
import CanvasSidebar from "./CanvasSidebar";
import CanvasBoard from "./CanvasBoard";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import {
  createCanvas,
  deleteCanvas,
  listCanvases,
  renameCanvas,
  type CanvasInfo,
} from "@/lib/canvasRepo";
import "../doc.css";
import "./canvas.css";

interface PresenceUser { key: string; name: string; initials: string; color: string }

type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Grid = ({ className, style }: IconProps & { style?: CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const HomeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
const Columns = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" />
  </svg>
);
const TableIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
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

// tldraw tool id -> nav-bar button. `geo` covers rectangles/shapes.
const TOOLS: { id: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { id: "select", label: "Select", Icon: Cursor },
  { id: "hand", label: "Hand", Icon: Hand },
  { id: "draw", label: "Draw", Icon: Pencil },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "arrow", label: "Arrow", Icon: ArrowTool },
  { id: "text", label: "Text", Icon: TextTool },
  { id: "note", label: "Note", Icon: Note },
  { id: "geo", label: "Shape", Icon: Square },
];

export default function CanvasPage() {
  const router = useRouter();
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tool, setTool] = useState("select");
  const [navOpen, setNavOpen] = useState(false);

  const wsRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await ensureSession();
        if (cancelled) return;
        if (!s) { router.replace("/login"); return; }
        setSession(s);
        wsRef.current = s.workspaceId;
        const list = await listCanvases(s.workspaceId);
        if (cancelled) return;
        setCanvases(list);
        setActiveId(list[0]?.id ?? null);
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

  // ---- realtime: canvas list changes + presence ----
  useEffect(() => {
    const wsId = wsRef.current;
    if (loading || !wsId || !session) return;

    const channel = supabase
      .channel(`canvas:${wsId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canvases", filter: `project_id=eq.${wsId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setCanvases((prev) => prev.filter((c) => c.id !== oldId));
            return;
          }
          const row = payload.new as { id?: string; name?: string; position?: number; updated_at?: string };
          if (!row?.id) return;
          setCanvases((prev) => {
            const info: CanvasInfo = {
              id: row.id!,
              name: row.name ?? "Untitled canvas",
              position: row.position ?? prev.length,
              updatedAt: row.updated_at ?? new Date().toISOString(),
            };
            return prev.some((c) => c.id === row.id)
              ? prev.map((c) => (c.id === row.id ? { ...c, ...info } : c))
              : [...prev, info];
          });
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const seen = new Map<string, PresenceUser>();
        for (const metas of Object.values(state)) {
          for (const m of metas) seen.set(m.key, m);
        }
        setOnline(Array.from(seen.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            key: session.userId,
            name: session.name,
            initials: session.initials,
            color: session.color,
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [loading, session]);

  const active = canvases.find((c) => c.id === activeId) ?? canvases[0] ?? null;

  const handleNew = async () => {
    const wsId = wsRef.current;
    if (!wsId) return;
    try {
      const c = await createCanvas(wsId);
      setCanvases((prev) => [...prev, c]);
      setActiveId(c.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRename = (id: string, name: string) => {
    setCanvases((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    renameCanvas(id, name).catch(console.error);
  };

  const handleDelete = (id: string) => {
    setCanvases((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
    deleteCanvas(id).catch(console.error);
  };

  // Drop the editor reference when there is no board mounted.
  useEffect(() => {
    if (!active) setEditor(null);
  }, [active]);

  const pickTool = (id: string) => editor?.setCurrentTool(id);

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

  const onlineList: PresenceUser[] =
    online.length > 0
      ? online
      : session
        ? [{ key: session.userId, name: session.name, initials: session.initials, color: session.color }]
        : [];

  return (
    <div className="app canvas-app">
      {/* top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">
            <Flame className="logo-icon" />
          </span>
          <span className="brand-name">EMBERWICK</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-muted">Canvas</span>
          {active && <span className="crumb-sep">/</span>}
          {active && <span className="crumb-current">{active.name}</span>}
        </div>
        <div className="top-right">
          <span className="online-dot" />
          <span className="online-text">{onlineList.length} online</span>
          <div className="avatar-stack">
            {onlineList.slice(0, 4).map((u) => (
              <span key={u.key} className="avatar" style={{ background: u.color }} title={u.name}>
                {u.initials}
              </span>
            ))}
          </div>
          <button className="share-btn">Share</button>
          <button
            className="share-btn"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="body">
        {/* canvas sidebar */}
        <CanvasSidebar
          canvases={canvases}
          activeId={active?.id ?? null}
          onSelect={setActiveId}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
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
              <button className="new-page" style={{ marginTop: 12 }} onClick={handleNew}>
                <Plus className="new-page-icon" />
                New canvas
              </button>
            </div>
          )}
        </main>
      </div>

      {/* dock — house toggles the app-nav cluster; tldraw tools always shown */}
      <nav className="dock">
        <button
          className={"dock-toggle" + (navOpen ? " is-open" : "")}
          title={navOpen ? "Hide menu" : "Show menu"}
          aria-label="Toggle menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <HomeIcon className="dock-icon" />
        </button>

        <div className={"dock-nav" + (navOpen ? " is-open" : "")}>
          <button className="dock-item" onClick={() => router.push("/doc")}>
            <HomeIcon className="dock-icon" /> Home
          </button>
          <button className="dock-item" onClick={() => router.push("/doc")}>
            <Doc className="dock-icon" /> Pages
          </button>
          <button className="dock-item is-active">
            <Grid className="dock-icon" /> Canvas
          </button>
          <button className="dock-item">
            <Columns className="dock-icon" /> Board
          </button>
          <button className="dock-item">
            <TableIcon className="dock-icon" /> Table
          </button>
        </div>

        <span className="dock-divider" />

        <div className="dock-tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={"dock-tool" + (tool === t.id ? " is-active" : "")}
              title={t.label}
              aria-label={t.label}
              disabled={!editor}
              onClick={() => pickTool(t.id)}
            >
              <t.Icon className="dock-tool-icon" />
            </button>
          ))}
          <button
            className="dock-tool"
            title="Insert image"
            aria-label="Insert image"
            disabled={!editor}
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon className="dock-tool-icon" />
          </button>
        </div>

        <span className="dock-divider" />

        <button className="dock-new" onClick={handleNew}>
          <Plus className="dock-new-icon" /> New
        </button>
      </nav>

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
