"use client";

import LinkedDocuments from "./LinkedDocuments";
import Icon from "@/app/components/Icon";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BlockEditor, { type BlockEditorApi } from "./BlockEditor";
import Sidebar from "./Sidebar";
import TopBar from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import { supabase } from "@/lib/supabase";
import { ensureSession, signOutAndClear, type SessionInfo } from "@/lib/session";
import {
  createPage,
  createSection,
  trashPage,
  restorePage,
  deleteSection,
  fetchPageBlocks,
  listMembers,
  listSections,
  loadWorkspace,
  renameSection,
  setSectionColor,
  cleanSectionColor,
  reorderSections,
  saveBlocks,
  savePage,
  seedIfEmpty,
  updatePagePlacement,
  type ProfileInfo,
  type SectionInfo,
} from "@/lib/docsRepo";
import type { SearchConfig } from "@/app/components/GlobalSearch";
import { pageItems } from "@/lib/searchIndex";
import TrashDialog from "./TrashDialog";
import UndoToast from "@/app/components/UndoToast";
import { HistoryToggle } from "@/app/components/ActivityFeed";
import Comments from "./Comments";
import Settings from "./Settings";
import {
  getWorkspaceInfo,
  leaveWorkspace,
  updateProfile,
  updateWorkspaceInfo,
  type WorkspaceInfo,
} from "@/lib/settingsRepo";
import {
  addComment,
  addInlineComment,
  deleteComment,
  editComment,
  listComments,
  setCommentResolved,
  settleSuggestion,
  type CommentRow,
} from "@/lib/commentsRepo";
import { listCanvases, type CanvasInfo } from "@/lib/canvasRepo";
import {
  mentionToken,
  relabelMentions,
  stripInlineHtml,
  type MentionTarget,
} from "./mentions";
import {
  type Block,
  type DesignDoc,
  type Status,
} from "./data";
import "./doc.css";

interface PresenceUser { key: string; name: string; initials: string; color: string }

// One "Linked references" rail entry: a page that points at the current one.
interface Backlink { doc: DesignDoc; kind: "link" | "mention"; snippet: string }

function relativeTime(iso?: string): string {
  if (!iso) return "just now";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}


/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Chevron = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const LinkIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const Grid = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const PanelInfo = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const Gear = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 11.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
  </svg>
);

type SaveState = "saved" | "saving" | "error";

// Local backup of a page's blocks, written on every edit so content survives
// a reload while the debounced server save hasn't gone through yet (e.g. no
// connection). Cleared once that save succeeds.
interface BlockDraft { blocks: Block[]; ts: number }
const draftKey = (pageId: string) => `gd-draft:${pageId}`;
function writeDraft(pageId: string, blocks: Block[]) {
  try { localStorage.setItem(draftKey(pageId), JSON.stringify({ blocks, ts: Date.now() } satisfies BlockDraft)); }
  catch { /* storage unavailable (private mode, quota) — draft recovery is best-effort */ }
}
function readDraft(pageId: string): BlockDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(pageId));
    return raw ? (JSON.parse(raw) as BlockDraft) : null;
  } catch { return null; }
}
function clearDraft(pageId: string) {
  try { localStorage.removeItem(draftKey(pageId)); } catch { /* ignore */ }
}

// useSearchParams needs a Suspense boundary in the app router.
export default function DocPage() {
  return (
    <Suspense
      fallback={
        <div className="app">
          <div className="screen">
            <p style={{ color: "var(--ink-soft)" }}>Loading workspace…</p>
          </div>
        </div>
      }
    >
      <DocPageInner />
    </Suspense>
  );
}

function DocPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<DesignDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [people, setPeople] = useState<ProfileInfo[]>([]);
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const linkWrapRef = useRef<HTMLSpanElement>(null);

  // Close the links dropdown on outside click or Escape (instead of
  // mouse-leave, which dismissed it mid-reach).
  useEffect(() => {
    if (!linkMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!linkWrapRef.current?.contains(e.target as Node)) setLinkMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [linkMenuOpen]);
  const [tagDraft, setTagDraft] = useState("");
  const [tagEditing, setTagEditing] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [shareCopied, setShareCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  // Inline comments / suggested edits: the editor's live-DOM handle, which
  // threads are open (only those are highlighted), and the thread to flash.
  const editorApi = useRef<BlockEditorApi | null>(null);
  const [focusAnchor, setFocusAnchor] = useState<{ anchor: string; at: number } | null>(null);
  const openAnchors = useMemo(
    () => new Set(comments.filter((c) => !c.parent_id && c.anchor && !c.resolved_at).map((c) => c.anchor!)),
    [comments],
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Wide screens: the docked sidebar can be hidden to give the page the room
  // (remembered in this browser). Narrow screens use the drawer (sidebarOpen).
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => {
    try { setSidebarHidden(localStorage.getItem("gd-doc-sidebar-hidden") === "1"); } catch { /* optional preference */ }
  }, []);
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setSidebarOpen((v) => !v);
      return;
    }
    setSidebarHidden((hidden) => {
      try { localStorage.setItem("gd-doc-sidebar-hidden", hidden ? "0" : "1"); } catch { /* optional preference */ }
      return !hidden;
    });
  }, []);
  // ⌘\ / Ctrl+\ toggles the sidebar, as in most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  const [railOpen, setRailOpen] = useState(false);
  const [draftRecovery, setDraftRecovery] = useState<BlockDraft & { pageId: string } | null>(null);
  const draftChecked = useRef<Set<string>>(new Set());
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const wsRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null); // current page, for realtime handlers
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const suppress = useRef<Record<string, number>>({}); // pageId -> ignore-echo-until ts
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const throttle = useRef<
    Record<string, { last: number; timer: ReturnType<typeof setTimeout> | null; pending: unknown }>
  >({});
  const pendingSaves = useRef(0);
  const lastFailedSave = useRef<(() => Promise<void>) | null>(null);

  // Run a persistence call and surface its outcome in the topbar indicator.
  const trackSave = (run: () => Promise<void>) => {
    pendingSaves.current += 1;
    setSaveState("saving");
    run()
      .then(() => {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) {
          lastFailedSave.current = null; // a newer write superseded the failure
          setSaveState("saved");
        }
      })
      .catch((e) => {
        pendingSaves.current -= 1;
        console.error(e);
        lastFailedSave.current = run;
        setSaveState("error");
      });
  };

  const retryFailedSave = () => {
    const run = lastFailedSave.current;
    lastFailedSave.current = null;
    if (run) trackSave(run);
  };

  // Navigate to a page, recording it in the URL so reload/back/share work.
  const openPage = (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setRailOpen(false);
    router.push(`/doc?page=${id}`, { scroll: false });
  };

  // Push an edit to other clients instantly (leading + trailing, capped rate).
  // This is the "live" path; the DB write (debounced) is the durable path.
  const broadcast = (key: string, payload: unknown, interval = 90) => {
    const send = (p: unknown) =>
      channelRef.current?.send({ type: "broadcast", event: "edit", payload: p });
    const st =
      throttle.current[key] ?? (throttle.current[key] = { last: 0, timer: null, pending: null });
    const now = Date.now();
    if (now - st.last >= interval) {
      st.last = now;
      send(payload);
    } else {
      st.pending = payload;
      if (!st.timer) {
        st.timer = setTimeout(
          () => {
            st.timer = null;
            st.last = Date.now();
            if (st.pending !== null) {
              send(st.pending);
              st.pending = null;
            }
          },
          interval - (now - st.last),
        );
      }
    }
  };

  // ---- initial load: session -> seed -> load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await ensureSession();
        if (cancelled) return;
        if (!s) {
          router.replace("/login");
          return;
        }
        if (!s.onboarded || !s.workspaceId) {
          router.replace("/onboarding");
          return;
        }
        setSession(s);
        wsRef.current = s.workspaceId;
        await seedIfEmpty(s.workspaceId);
        const [loaded, secs, members, wsInfo, boards] = await Promise.all([
          loadWorkspace(s.workspaceId),
          listSections(s.workspaceId),
          listMembers(s.workspaceId),
          getWorkspaceInfo(s.workspaceId),
          listCanvases(s.workspaceId).catch(() => [] as CanvasInfo[]),
        ]);
        if (cancelled) return;
        setSections(secs);
        setPeople(members);
        setWorkspace(wsInfo);
        setCanvases(boards);
        setDocs(loaded);
        // Land on the page in the URL when valid, else the first page.
        // (Read from location, not useSearchParams, so this effect doesn't
        // re-run the whole session init on every navigation.)
        const param = new URLSearchParams(window.location.search).get("page");
        const initial = loaded.find((d) => d.id === param)?.id ?? loaded[0]?.id ?? null;
        setActiveId(initial);
        if (initial && initial !== param) {
          router.replace(`/doc?page=${initial}`, { scroll: false });
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refreshWorkspace = async () => {
      if (!session) return;
      const [fresh, secs, canvasList] = await Promise.all([
        loadWorkspace(session.workspaceId), listSections(session.workspaceId), listCanvases(session.workspaceId),
      ]);
      setSections(secs); setCanvases(canvasList);
      setDocs(prev => {
        const current = new Map(prev.map(doc => [doc.id, doc]));
        return fresh.map(doc => {
          const existing = current.get(doc.id);
          if (!existing) return doc;
          // Keep local editor content and pending edits; refresh sidebar metadata.
          if ((suppress.current[doc.id] ?? 0) > Date.now()) return existing;
          return { ...existing, title: doc.title, sectionId: doc.sectionId,
            parentId: doc.parentId, position: doc.position, group: doc.group };
        });
      });
  };
  useSidebarLiveUpdates(loading ? null : session?.workspaceId ?? null,
    ["pages", "sections", "canvases"], refreshWorkspace);

  // ---- realtime: remote page/block changes + presence ----
  useEffect(() => {
    const wsId = wsRef.current;
    if (loading || !wsId || !session) return;

    const refetchBlocks = async (pageId: string) => {
      const blocks = await fetchPageBlocks(pageId);
      setDocs((prev) =>
        prev.map((d) => (d.id === pageId ? { ...d, blocks } : d)),
      );
    };

    // Re-pull the member list (after a profile change) and re-derive the
    // owner display fields that were copied onto each doc at load time.
    const refreshMembers = async () => {
      const members = await listMembers(wsId);
      setPeople(members);
      setDocs((prev) =>
        prev.map((d) => {
          if (!d.ownerId) return d;
          const m = members.find((x) => x.id === d.ownerId);
          return m ? { ...d, owner: m.initials, ownerName: m.name, ownerColor: m.color } : d;
        }),
      );
    };

    const channel = supabase
      .channel(`workspace:${wsId}`, { config: { broadcast: { self: false } } })
      // instant live edits (no DB hop)
      .on("broadcast", { event: "edit" }, ({ payload }) => {
        const p = payload as
          | { t: "block"; pageId: string; blockId: string; text: string }
          | { t: "blocks"; pageId: string; blocks: Block[] }
          | { t: "page"; id: string; page: Partial<DesignDoc> }
          | { t: "members" }
          | { t: "ws"; info: WorkspaceInfo };
        if (p.t === "block") {
          // live per-keystroke text for a single block (no cross-block clobber)
          setDocs((prev) =>
            prev.map((d) =>
              d.id === p.pageId
                ? { ...d, blocks: d.blocks.map((b) => (b.id === p.blockId ? { ...b, text: p.text } : b)) }
                : d,
            ),
          );
        } else if (p.t === "blocks") {
          setDocs((prev) =>
            prev.map((d) => (d.id === p.pageId ? { ...d, blocks: p.blocks } : d)),
          );
        } else if (p.t === "page") {
          setDocs((prev) => prev.map((d) => (d.id === p.id ? { ...d, ...p.page } : d)));
        } else if (p.t === "members") {
          refreshMembers().catch(console.error);
        } else if (p.t === "ws") {
          setWorkspace(p.info);
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocks" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { page_id?: string };
          const pageId = row?.page_id;
          if (!pageId) return;
          if ((suppress.current[pageId] ?? 0) > Date.now()) return; // our echo
          refetchBlocks(pageId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pages", filter: `project_id=eq.${wsId}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setDocs((prev) => prev.filter((d) => d.id !== oldId));
            return;
          }
          const row = payload.new as {
            id?: string;
            section_id?: string | null;
            parent_id?: string | null;
            position?: number;
            title?: string;
            kind?: string | null;
            status?: Status;
            summary?: string;
            tags?: string[];
            links?: string[];
            updated_at?: string;
            deleted_at?: string | null;
          };
          if (!row?.id || (suppress.current[row.id] ?? 0) > Date.now()) return;
          if (row.deleted_at) {
            // Trashed elsewhere: drop it; the sidebar refresh drops its sub-pages.
            setDocs((prev) => prev.filter((d) => d.id !== row.id));
            return;
          }

          if (payload.eventType === "INSERT") {
            const blocks = await fetchPageBlocks(row.id);
            let secName = sections.find((s) => s.id === row.section_id)?.name;
            if (!secName && row.section_id) {
              const secs = await listSections(wsId);
              setSections(secs);
              secName = secs.find((s) => s.id === row.section_id)?.name;
            }
            const doc: DesignDoc = {
              id: row.id,
              sectionId: row.section_id ?? undefined,
              title: row.title ?? "Untitled page",
              group: secName ?? "Mechanics & Systems",
              kind: row.kind ?? "",
              status: row.status ?? "todo",
              owner: "—",
              ownerName: "Unassigned",
              ownerColor: "#a59a8c",
              subtitle: row.summary ?? "",
              tags: row.tags ?? [],
              links: [],
              blocks,
              updatedAt: row.updated_at,
            };
            setDocs((prev) => (prev.some((d) => d.id === row.id) ? prev : [...prev, doc]));
            return;
          }

          // UPDATE
          const secName = sections.find((s) => s.id === row.section_id)?.name;
          setDocs((prev) =>
            prev.map((d) =>
              d.id === row.id
                ? {
                    ...d,
                    title: row.title ?? d.title,
                    subtitle: row.summary ?? d.subtitle,
                    kind: row.kind ?? d.kind,
                    status: row.status ?? d.status,
                    tags: row.tags ?? d.tags,
                    links: row.links ?? d.links,
                    sectionId: row.section_id ?? d.sectionId,
                    parentId: row.parent_id ?? undefined,
                    position: row.position ?? d.position,
                    group: secName ?? d.group,
                    updatedAt: row.updated_at ?? d.updatedAt,
                  }
                : d,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${wsId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setSections((prev) => prev.filter((s) => s.id !== oldId));
            return;
          }
          const row = payload.new as { id?: string; name?: string; position?: number; color?: string | null };
          const id = row?.id;
          if (!id) return;
          setSections((prev) => {
            const name = row.name ?? "Section";
            const position = row.position ?? prev.length;
            const color = cleanSectionColor(row.color);
            return prev.some((s) => s.id === id)
              ? prev.map((s) => (s.id === id ? { ...s, name, position, color } : s))
              : [...prev, { id, name, position, color }];
          });
          if (row.name) {
            setDocs((prev) => prev.map((d) => (d.sectionId === id ? { ...d, group: row.name! } : d)));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        (payload) => {
          // No server-side filter (page_id isn't project-scoped), so react only
          // when the change touches the page we're looking at, then refetch as
          // the source of truth (covers our own echo + others' edits alike).
          const row = (payload.new ?? payload.old) as { page_id?: string };
          const pid = row?.page_id;
          if (pid && pid === activeIdRef.current) {
            listComments(pid).then(setComments).catch(console.error);
          }
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

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [loading, session]);

  const active = docs.find((d) => d.id === activeId) ?? docs[0];

  // If a local draft survived from a session that never made it to the
  // server (dropped connection, closed tab before the debounce fired),
  // offer to bring it back once — but only once per page per load, and
  // only after that page's real blocks have arrived from the server.
  useEffect(() => {
    if (!active || draftChecked.current.has(active.id)) return;
    draftChecked.current.add(active.id);
    const draft = readDraft(active.id);
    if (!draft) return;
    if (JSON.stringify(draft.blocks) === JSON.stringify(active.blocks)) { clearDraft(active.id); return; }
    setDraftRecovery({ ...draft, pageId: active.id });
  }, [active]);

  // Warn before an unsynced change is silently discarded by a reload/close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState !== "error") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const activeSectionId =
    active?.sectionId ?? sections.find((s) => s.name === active?.group)?.id ?? null;

  // Keep the realtime handlers pointed at the page currently in view.
  activeIdRef.current = active?.id ?? null;

  // Incoming backlinks: pages that reference the current page, either through
  // an inline @-mention in their body (shown with the mentioning block as a
  // snippet) or via their "Links" list. One entry per source page.
  const backlinks: Backlink[] = active
    ? docs.flatMap((d): Backlink[] => {
        if (d.id === active.id) return [];
        const token = mentionToken(active.id);
        const mentionBlock = d.blocks.find((b) => b.text.includes(token));
        if (mentionBlock) {
          const text = stripInlineHtml(mentionBlock.text);
          const snippet = text.length > 140 ? text.slice(0, 140) + "…" : text;
          return [{ doc: d, kind: "mention", snippet: snippet || d.subtitle || d.group }];
        }
        if (d.links.includes(active.id)) {
          return [{ doc: d, kind: "link", snippet: d.subtitle || d.group }];
        }
        return [];
      })
    : [];

  // Everything the @-mention autocomplete can point at (self excluded), and
  // the set of refs that still resolve (deleted targets render as dangling).
  const mentionTargets: MentionTarget[] = active
    ? [
        ...docs
          .filter((d) => d.id !== active.id)
          .map((d) => ({ ref: d.id, title: d.title, group: d.group, kind: "page" as const })),
        ...canvases.map((c) => ({
          ref: "canvas:" + c.id,
          title: c.name,
          group: "Canvas",
          kind: "canvas" as const,
        })),
        ...sections.map((s) => ({
          ref: "section:" + s.id,
          title: s.name,
          group: "Section",
          kind: "section" as const,
        })),
      ]
    : [];
  const refsKey =
    docs.map((d) => d.id).join("|") + "§" + canvases.map((c) => c.id).join("|") + "§" + sections.map((s) => s.id).join("|");
  const validRefs = useMemo(
    () =>
      new Set<string>([
        ...docs.map((d) => d.id),
        ...canvases.map((c) => "canvas:" + c.id),
        ...sections.map((s) => "section:" + s.id),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refsKey],
  );

  // A section link opens the section's first page and unfolds it in the sidebar.
  const [focusSection, setFocusSection] = useState<{ id: string; at: number } | null>(null);
  const openSection = (sectionId: string) => {
    if (!sections.some((s) => s.id === sectionId)) return;
    const first = docs
      .filter((d) => d.sectionId === sectionId && !d.parentId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    setFocusSection({ id: sectionId, at: Date.now() });
    if (first) openPage(first.id);
    else if (window.matchMedia("(max-width: 860px)").matches) setSidebarOpen(true);
  };

  const handleMentionNavigate = (ref: string) => {
    if (ref.startsWith("section:")) {
      openSection(ref.slice("section:".length));
      return;
    }
    if (ref.startsWith("canvas:")) {
      const id = ref.slice("canvas:".length);
      if (canvases.some((c) => c.id === id)) router.push(`/doc/canvas?c=${id}`);
      return;
    }
    if (docs.some((d) => d.id === ref)) openPage(ref);
  };

  // Keep mention chip labels in sync with current page/canvas titles. Display
  // only — corrected labels persist the next time the host page is edited.
  // Keyed on a title fingerprint so per-keystroke block edits never trigger it.
  const titleKey =
    docs.map((d) => d.id + ":" + d.title).join("|") +
    "§" +
    canvases.map((c) => c.id + ":" + c.name).join("|") +
    "§" +
    sections.map((s) => s.id + ":" + s.name).join("|");
  useEffect(() => {
    setDocs((prev) => {
      const titles = new Map<string, string>(prev.map((d) => [d.id, d.title]));
      for (const c of canvases) titles.set("canvas:" + c.id, c.name);
      for (const sec of sections) titles.set("section:" + sec.id, sec.name);
      let changed = false;
      const next = prev.map((d) => {
        let blocksChanged = false;
        const blocks = d.blocks.map((b) => {
          if (!b.text.includes("data-mention")) return b;
          const text = relabelMentions(b.text, titles);
          if (text === b.text) return b;
          blocksChanged = true;
          return { ...b, text };
        });
        if (!blocksChanged) return d;
        changed = true;
        return { ...d, blocks };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKey, canvases, sections]);

  // Section links from outside the editor (/doc?section=<id>, e.g. a task
  // description): open that section once the workspace has loaded.
  const urlSectionId = searchParams.get("section");
  const docsLoaded = docs.length > 0;
  useEffect(() => {
    if (!urlSectionId || !docsLoaded) return;
    openSection(urlSectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSectionId, docsLoaded]);

  // Browser back/forward: follow the URL's page param.
  const urlPageId = searchParams.get("page");
  useEffect(() => {
    if (!urlPageId) return;
    setActiveId((cur) =>
      urlPageId !== cur && docs.some((d) => d.id === urlPageId) ? urlPageId : cur,
    );
  }, [urlPageId, docs]);

  // Load this page's comments whenever the active page changes.
  useEffect(() => {
    const id = active?.id;
    if (!id) {
      setComments([]);
      return;
    }
    let cancelled = false;
    listComments(id)
      .then((c) => {
        if (!cancelled) setComments(c);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Focus the title of a freshly-created page so the user can type immediately.
  useEffect(() => {
    if (!focusTitleId || active?.id !== focusTitleId) return;
    const el = document.querySelector<HTMLElement>(".doc-title");
    if (el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setFocusTitleId(null);
  }, [focusTitleId, active]);

  // Viewers navigate and comment; everything that writes is hidden/disabled.
  const canEdit = session?.role !== "viewer";

  // ---- debounced persistence ----
  const scheduleSaveBlocks = (pageId: string, blocks: Block[]) => {
    if (!canEdit) return;
    writeDraft(pageId, blocks); // instant local backup — see readDraft's recovery check below
    clearTimeout(saveTimers.current[`b:${pageId}`]);
    setSaveState("saving");
    saveTimers.current[`b:${pageId}`] = setTimeout(() => {
      suppress.current[pageId] = Date.now() + 1500;
      trackSave(() => saveBlocks(pageId, blocks).then(() => clearDraft(pageId)));
    }, 600);
  };
  const scheduleSavePage = (doc: DesignDoc) => {
    if (!canEdit) return;
    clearTimeout(saveTimers.current[`p:${doc.id}`]);
    setSaveState("saving");
    saveTimers.current[`p:${doc.id}`] = setTimeout(() => {
      suppress.current[doc.id] = Date.now() + 1500;
      trackSave(() => savePage(doc));
    }, 600);
  };

  const update = (id: string, patch: Partial<DesignDoc>) =>
    setDocs((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d));
      const doc = next.find((d) => d.id === id);
      if (doc) {
        if ("blocks" in patch) {
          broadcast(`b:${id}`, { t: "blocks", pageId: id, blocks: doc.blocks }); // instant
          scheduleSaveBlocks(id, doc.blocks); // durable
        }
        if (["title", "subtitle", "status", "tags", "kind", "links"].some((k) => k in patch)) {
          broadcast(`p:${id}`, {
            t: "page",
            id,
            page: {
              title: doc.title,
              subtitle: doc.subtitle,
              kind: doc.kind,
              status: doc.status,
              tags: doc.tags,
              links: doc.links,
            },
          });
          scheduleSavePage(doc);
        }
      }
      return next;
    });

  // ---- create pages / sections ----
  const handleNewPage = async (sectionId: string | null, sectionName: string) => {
    const wsId = wsRef.current;
    if (!wsId || !canEdit) return;
    try {
      const doc = await createPage(wsId, sectionId, sectionName);
      suppress.current[doc.id] = Date.now() + 2500; // ignore our own INSERT echo
      setDocs((prev) => [...prev, doc]);
      setActiveId(doc.id);
      router.replace(`/doc?page=${doc.id}`, { scroll: false });
      setFocusTitleId(doc.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewSection = async (name: string) => {
    const wsId = wsRef.current;
    if (!wsId || !name || !canEdit) return;
    try {
      const sec = await createSection(wsId, name);
      setSections((prev) => [...prev, sec]);
      await handleNewPage(sec.id, sec.name); // open it with a first page
    } catch (e) {
      console.error(e);
    }
  };

  // ⌘K: live pages from the editor (so unsaved titles/bodies match), plus page commands.
  const livePageItems = useMemo(() => pageItems(docs), [docs]);
  const docSearch: SearchConfig = {
    pages: livePageItems,
    onSelect: (item) => {
      if (item.kind !== "page") return false;
      openPage(item.key.slice("page:".length));
      return true;
    },
    actions: [
      ...(canEdit
        ? [
            {
              key: "new-page",
              label: "New page",
              hint: `in ${active?.group ?? "this section"}`,
              icon: "plus" as const,
              run: () => void handleNewPage(activeSectionId, active?.group ?? ""),
            },
            {
              key: "new-section",
              label: "New section",
              icon: "plus" as const,
              run: () => {
                const name = window.prompt("New section name");
                if (name && name.trim()) void handleNewSection(name.trim());
              },
            },
          ]
        : []),
      { key: "settings", label: "Settings", hint: "profile · workspace · account", icon: "settings" as const, run: () => setSettingsOpen(true) },
    ],
  };

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#+/, "").trim();
    setTagDraft("");
    if (!t || active.tags.includes(t)) return;
    update(active.id, { tags: [...active.tags, t] });
  };
  const removeTag = (t: string) => update(active.id, { tags: active.tags.filter((x) => x !== t) });

  const addLink = (pageId: string) => {
    setLinkMenuOpen(false);
    if (active.links.includes(pageId)) return;
    update(active.id, { links: [...active.links, pageId] });
  };
  const removeLink = (pageId: string) =>
    update(active.id, { links: active.links.filter((x) => x !== pageId) });

  // ---- settings ----
  const handleSaveProfile = (patch: { name: string; initials: string; color: string }) => {
    if (!session) return;
    trackSave(() => updateProfile(session.userId, patch));
    const next = { ...session, ...patch };
    setSession(next);
    // presence sync pushes the new identity to everyone's avatar stacks
    channelRef.current?.track({
      key: next.userId,
      name: next.name,
      initials: next.initials,
      color: next.color,
    });
    setPeople((prev) => prev.map((p) => (p.id === session.userId ? { ...p, ...patch } : p)));
    setDocs((prev) =>
      prev.map((d) =>
        d.ownerId === session.userId
          ? { ...d, owner: patch.initials, ownerName: patch.name, ownerColor: patch.color }
          : d,
      ),
    );
    broadcast("members", { t: "members" });
  };

  const handleSaveWorkspace = (info: WorkspaceInfo) => {
    const wsId = wsRef.current;
    if (!wsId) return;
    trackSave(() => updateWorkspaceInfo(wsId, info));
    setWorkspace(info);
    broadcast("ws", { t: "ws", info });
  };

  const handleSignOut = async () => {
    await signOutAndClear();
    router.replace("/login");
  };

  const handleLeaveWorkspace = async () => {
    const wsId = wsRef.current;
    if (!wsId || !session) return;
    try {
      await leaveWorkspace(wsId, session.userId);
    } catch (e) {
      console.error(e);
    }
    await signOutAndClear();
    router.replace("/login");
  };

  const handleDeletePage = (id: string) => {
    // The page and every sub-page go to the trash together.
    const gone = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const d of docs) if (d.parentId && gone.has(d.parentId) && !gone.has(d.id)) { gone.add(d.id); grew = true; }
    }
    for (const g of gone) suppress.current[g] = Date.now() + 2500;
    const title = docs.find((d) => d.id === id)?.title || "Untitled page";
    const remaining = docs.filter((d) => !gone.has(d.id));
    setDocs(remaining);
    if (activeId && gone.has(activeId)) {
      const fallback = remaining[0]?.id ?? null;
      setActiveId(fallback);
      router.replace(fallback ? `/doc?page=${fallback}` : "/doc", { scroll: false });
    }
    trashPage(id)
      .then(() =>
        setToast({
          message: `“${title}” moved to trash`,
          onUndo: () => {
            restorePage(id).then(refreshWorkspace).catch(console.error);
          },
        }),
      )
      .catch((e) => {
        console.error(e);
        setToast({ message: "Couldn’t delete the page — it has been put back." });
        refreshWorkspace().catch(console.error);
      });
  };

  const handleRenameSection = (id: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setDocs((prev) => prev.map((d) => (d.sectionId === id ? { ...d, group: name } : d)));
    renameSection(id, name).catch(console.error);
  };

  const handleSetSectionColor = (id: string, color: string | null) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
    setSectionColor(id, color).catch(console.error);
  };

  const handleDeleteSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    deleteSection(id).catch(console.error);
  };

  const handleMoveSection = (orderedIds: string[]) => {
    setSections((prev) =>
      [...prev]
        .map((s) => ({ ...s, position: orderedIds.indexOf(s.id) }))
        .sort((a, b) => a.position - b.position),
    );
    reorderSections(orderedIds).catch(console.error);
  };

  const handleMovePage = (
    movedId: string,
    sectionId: string | null,
    parentId: string | null,
    orderedIds: string[],
  ) => {
    const groupName = sections.find((s) => s.id === sectionId)?.name;
    suppress.current[movedId] = Date.now() + 2500;
    setDocs((prev) =>
      prev.map((d) => {
        let nd = d;
        if (d.id === movedId) {
          nd = {
            ...nd,
            sectionId: sectionId ?? undefined,
            parentId: parentId ?? undefined,
            group: groupName ?? nd.group,
          };
        }
        const idx = orderedIds.indexOf(d.id);
        if (idx >= 0) nd = { ...nd, position: idx };
        return nd;
      }),
    );
    const updates = orderedIds.map((id, i) => ({
      id,
      position: i,
      sectionId: id === movedId ? sectionId : undefined,
      parentId: id === movedId ? parentId : undefined,
    }));
    updatePagePlacement(updates).catch(console.error);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="screen">
          <p style={{ color: "var(--ink-soft)" }}>Loading workspace…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app">
        <div className="screen">
          <h1>Couldn&apos;t load the workspace</h1>
          <p style={{ color: "var(--ink-soft)", maxWidth: 460 }}>{error}</p>
          <p style={{ color: "var(--ink-faint)", fontSize: 13 }}>
            Check that the SQL is applied and anonymous sign-ins are enabled in Supabase.
          </p>
        </div>
      </div>
    );
  }
  if (!active) {
    return (
      <div className="app">
        <div className="screen">
          <h1>{workspace?.name ?? "Workspace"} pages</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            {canEdit
              ? "Start the design doc with its first page."
              : "No internal pages yet — an editor can create the first page."}
          </p>
          {canEdit && (
            <button
              type="button"
              className="share-btn"
              onClick={() => handleNewPage(null, "General")}
            >
              Create your first page
            </button>
          )}
          {session && <LinkedDocuments key={session.workspaceId} workspaceId={session.workspaceId} canEdit={canEdit} />}
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
    <div className={"app" + (sidebarOpen ? " nav-open" : "") + (railOpen ? " rail-open" : "") + (sidebarHidden ? " sidebar-hidden" : "")}>
      {/* ---------------- top bar (global chrome) ---------------- */}
      <TopBar
        brandName={workspace?.name}
        crumbs={[active.group, active.title]}
        online={onlineList}
        onMenuToggle={toggleSidebar}
        menuAlwaysVisible
        menuLabel={sidebarHidden ? "Show sidebar (⌘\\)" : "Hide sidebar (⌘\\)"}
        workspaceId={session?.workspaceId}
      >
        <span className={"save-state save-" + saveState}>
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && (
            <>
              Save failed
              <button className="save-retry" onClick={retryFailedSave}>
                Retry
              </button>
            </>
          )}
        </span>
        <button
          className="share-btn rail-toggle-btn"
          title="Linked references & comments"
          onClick={() => setRailOpen((v) => !v)}
        >
          <PanelInfo className="settings-gear" />
          {comments.length > 0 && <span className="rail-toggle-badge">{comments.length}</span>}
        </button>
        <button
          className="share-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 1500);
            } catch (e) {
              console.error(e);
            }
          }}
        >
          {shareCopied ? "Copied!" : "Share"}
        </button>
        <button
          className="share-btn settings-btn"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Gear className="settings-gear" />
        </button>
      </TopBar>

      <div className="body">
        {(sidebarOpen || railOpen) && (
          <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => { setSidebarOpen(false); setRailOpen(false); }} />
        )}
        {/* ---------------- left sidebar ---------------- */}
        <Sidebar
          workspaceId={session!.workspaceId}
          docs={docs}
          sections={sections}
          active={active}
          onSelect={openPage}
          onNewPage={handleNewPage}
          onNewSection={handleNewSection}
          onRenamePage={(id, title) => update(id, { title })}
          onDeletePage={handleDeletePage}
          onRenameSection={handleRenameSection}
          onSetSectionColor={handleSetSectionColor}
          focusSection={focusSection}
          onDeleteSection={handleDeleteSection}
          onMovePage={handleMovePage}
          onMoveSection={handleMoveSection}
          onOpenTrash={() => setTrashOpen(true)}
          canEdit={canEdit}
        />

        {/* ---------------- main document ---------------- */}
        <main className="main">
          <article className="doc">
            {draftRecovery && draftRecovery.pageId === active.id && (
              <div role="alert" className="draft-recovery">
                <span>Found unsaved changes to this page from a previous session (probably lost connection) — from {relativeTime(new Date(draftRecovery.ts).toISOString())}.</span>
                <div>
                  <button onClick={() => { update(active.id, { blocks: draftRecovery.blocks }); setDraftRecovery(null); }}>Restore</button>
                  <button onClick={() => { clearDraft(draftRecovery.pageId); setDraftRecovery(null); }}>Discard</button>
                </div>
              </div>
            )}
            <div className="doc-crumb">
              {active.group} <span className="dot">·</span> {active.kind}
            </div>

            <Editable
              tag="h1"
              className="doc-title"
              value={active.title}
              disabled={!canEdit}
              onSave={(v) => update(active.id, { title: v })}
            />

            <Editable
              tag="p"
              className="doc-subtitle"
              value={active.subtitle}
              placeholder={canEdit ? "Add a one-line summary…" : undefined}
              disabled={!canEdit}
              onSave={(v) => update(active.id, { subtitle: v })}
            />

            {/* meta card */}
            {/* Tags and links as one slim line (status and owner now live on board tasks). */}
            <div className="page-meta">
              <div className="page-meta-group">
                <span className="page-meta-key">Tags</span>
                <span className="tags">
                  {active.tags.map((t) => (
                    <span key={t} className={"tag" + (canEdit ? " tag-editable" : "")}>
                      # {t}
                      {canEdit && (
                        <button className="tag-remove" title="Remove tag" onClick={() => removeTag(t)}><Icon name="close" /></button>
                      )}
                    </span>
                  ))}
                  {!canEdit ? null : tagEditing ? (
                    <input
                      className="tag-input"
                      autoFocus
                      placeholder="tag…"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagDraft); }
                        if (e.key === "Escape") { setTagDraft(""); setTagEditing(false); }
                        if (e.key === "Backspace" && !tagDraft && active.tags.length) removeTag(active.tags[active.tags.length - 1]);
                      }}
                      onBlur={() => { if (tagDraft.trim()) addTag(tagDraft); setTagEditing(false); }}
                    />
                  ) : (
                    <button className="tag-add" onClick={() => setTagEditing(true)}><Icon name="plus" /> Add</button>
                  )}
                </span>
              </div>
              <div className="page-meta-group">
                <span className="page-meta-key">Links</span>
                <span className="links">
                  {active.links.map((id) => {
                    // Canvas links are stored as "canvas:<id>"; page links are bare ids.
                    if (id.startsWith("canvas:")) {
                      const board = canvases.find((c) => "canvas:" + c.id === id);
                      if (!board) return null;
                      return (
                        <span key={id} className={"link-chip" + (canEdit ? " link-editable" : "")}>
                          <button
                            className="link-go"
                            onClick={() => router.push(`/doc/canvas?c=${board.id}`)}
                          >
                            <Grid className="link-icon" /> {board.name}
                          </button>
                          {canEdit && (
                            <button className="link-remove" title="Remove link" onClick={() => removeLink(id)}>
                              <Icon name="close" />
                            </button>
                          )}
                        </span>
                      );
                    }
                    const target = docs.find((d) => d.id === id);
                    if (!target) return null;
                    return (
                      <span key={id} className={"link-chip" + (canEdit ? " link-editable" : "")}>
                        <button className="link-go" onClick={() => openPage(target.id)}>
                          <LinkIcon className="link-icon" /> {target.title}
                        </button>
                        {canEdit && (
                          <button className="link-remove" title="Remove link" onClick={() => removeLink(id)}>
                            <Icon name="close" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {canEdit && (
                  <span className="link-add-wrap" ref={linkWrapRef}>
                    <button className="tag-add" onClick={() => setLinkMenuOpen((o) => !o)}>
                      <Icon name="plus" /> Link
                    </button>
                    {linkMenuOpen && (
                      <div className="link-menu">
                        {docs
                          .filter((d) => d.id !== active.id && !active.links.includes(d.id))
                          .map((d) => (
                            <button
                              key={d.id}
                              onClick={() => addLink(d.id)}
                            >
                              <LinkIcon className="link-icon" />
                              <span className="link-menu-title">{d.title}</span>
                              <span className="link-menu-group">{d.group}</span>
                            </button>
                          ))}
                        {canvases
                          .filter((c) => !active.links.includes("canvas:" + c.id))
                          .map((c) => (
                            <button
                              key={c.id}
                              onClick={() => addLink("canvas:" + c.id)}
                            >
                              <Grid className="link-icon" />
                              <span className="link-menu-title">{c.name}</span>
                              <span className="link-menu-group">Canvas</span>
                            </button>
                          ))}
                        {docs.filter((d) => d.id !== active.id && !active.links.includes(d.id)).length === 0 &&
                          canvases.filter((c) => !active.links.includes("canvas:" + c.id)).length === 0 && (
                            <div className="link-menu-empty">Nothing to link</div>
                          )}
                      </div>
                    )}
                  </span>
                  )}
                </span>
              </div>
            </div>

            {/* block editor body */}
            <BlockEditor
              key={active.id}
              repo={workspace?.repo || null}
              blocks={active.blocks}
              readOnly={!canEdit}
              mentionTargets={mentionTargets}
              validRefs={validRefs}
              onNavigate={handleMentionNavigate}
              onChange={(b) => update(active.id, { blocks: b })}
              apiRef={editorApi}
              openAnchors={openAnchors}
              onAnnotate={
                canEdit && session
                  ? async (a) => {
                      const pageId = active.id;
                      await addInlineComment(pageId, session.userId, a);
                      listComments(pageId).then(setComments).catch(console.error);
                    }
                  : undefined
              }
              onAnnotationClick={(anchor) => {
                setFocusAnchor({ anchor, at: Date.now() });
                // The rail is only a drawer below 1180px (doc.css); on wider
                // screens it's always visible and must not be "opened".
                if (window.matchMedia("(max-width: 1180px)").matches) setRailOpen(true);
              }}
              onLiveInput={(blockId, text, blocks) => {
                // instant: per-block delta to other clients (no local re-render)
                broadcast(`bt:${blockId}`, { t: "block", pageId: active.id, blockId, text });
                // durable: debounced full-array write
                scheduleSaveBlocks(active.id, blocks);
              }}
            />
          </article>
        </main>

        {/* ---------------- right rail ---------------- */}
        <aside className="rail">
          <div className="rail-head">
            <LinkIcon className="rail-head-icon" />
            <span>Linked references</span>
            <span className="rail-badge">{backlinks.length}</span>
          </div>

          <div className="ref-list">
            {backlinks.length === 0 && (
              <p className="ref-text" style={{ padding: "2px 2px 8px" }}>
                No pages link here yet.
              </p>
            )}
            {backlinks.map(({ doc: d, kind, snippet }) => (
              <button key={d.id} className="ref-card" onClick={() => openPage(d.id)}>
                <div className="ref-title">
                  <Doc className="ref-icon" />
                  <span className="ref-name">{d.title}</span>
                  <span className="ref-kind">{kind === "mention" ? "mention" : "link"}</span>
                </div>
                <p className="ref-text">{snippet}</p>
              </button>
            ))}
          </div>

          <Comments
            comments={comments}
            people={people}
            currentUserId={session?.userId ?? ""}
            onAdd={(body, parentId) => {
              if (session) addComment(active.id, session.userId, body, parentId ?? null).catch(console.error);
            }}
            onDelete={(id) => {
              // Deleting an inline thread also drops its mark from the text.
              const anchor = comments.find((c) => c.id === id)?.anchor;
              if (anchor && canEdit) editorApi.current?.removeAnnotation(anchor);
              deleteComment(id).catch(console.error);
            }}
            onEdit={(id, body) => editComment(id, body).catch(console.error)}
            onResolve={(id, resolved) => {
              if (session) setCommentResolved(id, resolved).catch(console.error);
            }}
            canEdit={canEdit}
            focusAnchor={focusAnchor}
            onJump={(anchor) => {
              document
                .querySelector(`.blocks [data-comment="${anchor}"], .blocks [data-suggestion="${anchor}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onSettle={(c, accept) => {
              if (!c.anchor) return;
              const found = editorApi.current?.settleSuggestion(c.anchor, accept, c.suggestion ?? "") ?? false;
              if (!found && accept) {
                setToast({ message: "The original text has already changed, so nothing was replaced." });
              }
              const pageId = active.id;
              settleSuggestion(c.id, accept ? "accepted" : "rejected")
                .then(() => listComments(pageId).then(setComments))
                .catch((e) => setToast({ message: e instanceof Error ? e.message : "Couldn’t update the suggestion." }));
            }}
          />

          {session && <HistoryToggle key={active.id} workspaceId={session.workspaceId} pageId={active.id} />}

          <div className="rail-footer">
            <div className="foot-row">
              <span className="foot-key">Last edited</span>
              <span className="foot-val">{relativeTime(active.updatedAt)}</span>
            </div>
            <div className="foot-row">
              <span className="foot-key">Online now</span>
              <div className="foot-avatars">
                {onlineList.slice(0, 3).map((u) => (
                  <span key={u.key} className="foot-avatar" style={{ background: u.color }} title={u.name}>
                    {u.initials}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------- floating dock (global chrome) ---------------- */}
      <Dock
        search={docSearch}
        onNew={canEdit ? () => handleNewPage(activeSectionId, active.group) : undefined}
      />

      {trashOpen && (
        <TrashDialog
          workspaceId={session!.workspaceId}
          onClose={() => setTrashOpen(false)}
          onRestored={() => refreshWorkspace().catch(console.error)}
        />
      )}
      {toast && <UndoToast message={toast.message} onUndo={toast.onUndo} onDismiss={dismissToast} />}


      {session && (
        <Settings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          session={session}
          workspace={workspace}
          onSaveProfile={handleSaveProfile}
          onSaveWorkspace={handleSaveWorkspace}
          onSignOut={handleSignOut}
          onLeave={handleLeaveWorkspace}
        />
      )}
    </div>
  );
}

// Inline-editable text. Saves on blur; single-line fields commit on Enter.
function Editable({
  tag: Tag,
  value,
  onSave,
  className,
  placeholder,
  disabled = false,
}: {
  tag: "h1" | "h2" | "p";
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const multiline = Tag === "p";
  return (
    <Tag
      className={(className ?? "") + (disabled ? "" : " editable")}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => {
        if (disabled) return;
        const text = e.currentTarget.innerText.trim();
        if (text !== value) onSave(text);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}
