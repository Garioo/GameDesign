"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BlockEditor from "./BlockEditor";
import Sidebar from "./Sidebar";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  fetchPageBlocks,
  listMembers,
  listSections,
  loadWorkspace,
  renameSection,
  reorderSections,
  saveBlocks,
  savePage,
  seedIfEmpty,
  setPageOwner,
  updatePagePlacement,
  type ProfileInfo,
  type SectionInfo,
} from "@/lib/docsRepo";
import CommandPalette from "./CommandPalette";
import {
  STATUS_LABEL,
  type Block,
  type DesignDoc,
  type RefIcon,
  type Status,
} from "./data";
import "./doc.css";

interface PresenceUser { key: string; name: string; initials: string; color: string }

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

const STATUS_ORDER: Status[] = ["todo", "wip", "review", "done"];

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const Sun = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
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
const Compass = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" />
  </svg>
);
const Database = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" />
  </svg>
);
const ChevronDown = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const Plus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Search = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);
const HomeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
const Grid = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
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

const refIcon = (kind: RefIcon) => {
  if (kind === "mechanic") return <Sun className="ref-icon" />;
  if (kind === "vision") return <Compass className="ref-icon" />;
  if (kind === "economy") return <Database className="ref-icon" />;
  return <Doc className="ref-icon" />;
};

export default function DocPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DesignDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [people, setPeople] = useState<ProfileInfo[]>([]);
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tagEditing, setTagEditing] = useState(false);

  const wsRef = useRef<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const suppress = useRef<Record<string, number>>({}); // pageId -> ignore-echo-until ts
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const throttle = useRef<
    Record<string, { last: number; timer: ReturnType<typeof setTimeout> | null; pending: unknown }>
  >({});

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
        setSession(s);
        wsRef.current = s.workspaceId;
        await seedIfEmpty(s.workspaceId);
        const [loaded, secs, members] = await Promise.all([
          loadWorkspace(s.workspaceId),
          listSections(s.workspaceId),
          listMembers(s.workspaceId),
        ]);
        if (cancelled) return;
        setSections(secs);
        setPeople(members);
        setDocs(loaded);
        setActiveId(loaded[0]?.id ?? null);
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

    const channel = supabase
      .channel(`workspace:${wsId}`, { config: { broadcast: { self: false } } })
      // instant live edits (no DB hop)
      .on("broadcast", { event: "edit" }, ({ payload }) => {
        const p = payload as
          | { t: "block"; pageId: string; blockId: string; text: string }
          | { t: "blocks"; pageId: string; blocks: Block[] }
          | { t: "page"; id: string; page: Partial<DesignDoc> };
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
          };
          if (!row?.id || (suppress.current[row.id] ?? 0) > Date.now()) return;

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
              refs: [],
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
          const row = payload.new as { id?: string; name?: string; position?: number };
          const id = row?.id;
          if (!id) return;
          setSections((prev) => {
            const name = row.name ?? "Section";
            const position = row.position ?? prev.length;
            return prev.some((s) => s.id === id)
              ? prev.map((s) => (s.id === id ? { ...s, name, position } : s))
              : [...prev, { id, name, position }];
          });
          if (row.name) {
            setDocs((prev) => prev.map((d) => (d.sectionId === id ? { ...d, group: row.name! } : d)));
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

  const activeSectionId =
    active?.sectionId ?? sections.find((s) => s.name === active?.group)?.id ?? null;

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

  // ⌘K / Ctrl-K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- debounced persistence ----
  const scheduleSaveBlocks = (pageId: string, blocks: Block[]) => {
    clearTimeout(saveTimers.current[`b:${pageId}`]);
    saveTimers.current[`b:${pageId}`] = setTimeout(() => {
      suppress.current[pageId] = Date.now() + 1500;
      saveBlocks(pageId, blocks).catch(console.error);
    }, 600);
  };
  const scheduleSavePage = (doc: DesignDoc) => {
    clearTimeout(saveTimers.current[`p:${doc.id}`]);
    saveTimers.current[`p:${doc.id}`] = setTimeout(() => {
      suppress.current[doc.id] = Date.now() + 1500;
      savePage(doc).catch(console.error);
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
    if (!wsId) return;
    try {
      const doc = await createPage(wsId, sectionId, sectionName);
      suppress.current[doc.id] = Date.now() + 2500; // ignore our own INSERT echo
      setDocs((prev) => [...prev, doc]);
      setActiveId(doc.id);
      setFocusTitleId(doc.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewSection = async (name: string) => {
    const wsId = wsRef.current;
    if (!wsId || !name) return;
    try {
      const sec = await createSection(wsId, name);
      setSections((prev) => [...prev, sec]);
      await handleNewPage(sec.id, sec.name); // open it with a first page
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetOwner = (p: ProfileInfo | null) => {
    setOwnerMenuOpen(false);
    const patch: Partial<DesignDoc> = p
      ? { ownerId: p.id, owner: p.initials, ownerName: p.name, ownerColor: p.color }
      : { ownerId: undefined, owner: "—", ownerName: "Unassigned", ownerColor: "#a59a8c" };
    setDocs((prev) => prev.map((d) => (d.id === active.id ? { ...d, ...patch } : d)));
    suppress.current[active.id] = Date.now() + 1500;
    setPageOwner(active.id, p?.id ?? null).catch(console.error);
    broadcast(`p:${active.id}`, { t: "page", id: active.id, page: patch });
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

  const handleDeletePage = (id: string) => {
    suppress.current[id] = Date.now() + 2500;
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
    deletePage(id).catch(console.error);
  };

  const handleRenameSection = (id: string, name: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setDocs((prev) => prev.map((d) => (d.sectionId === id ? { ...d, group: name } : d)));
    renameSection(id, name).catch(console.error);
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
          <p style={{ color: "var(--ink-soft)" }}>No pages yet.</p>
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
    <div className="app">
      {/* ---------------- top bar ---------------- */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">
            <Flame className="logo-icon" />
          </span>
          <span className="brand-name">EMBERWICK</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-muted">{active.group}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{active.title}</span>
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
        {/* ---------------- left sidebar ---------------- */}
        <Sidebar
          docs={docs}
          sections={sections}
          active={active}
          onSelect={setActiveId}
          onNewPage={handleNewPage}
          onNewSection={handleNewSection}
          onRenamePage={(id, title) => update(id, { title })}
          onDeletePage={handleDeletePage}
          onRenameSection={handleRenameSection}
          onDeleteSection={handleDeleteSection}
          onMovePage={handleMovePage}
          onMoveSection={handleMoveSection}
        />

        {/* ---------------- main document ---------------- */}
        <main className="main">
          <article className="doc">
            <div className="doc-crumb">
              {active.group} <span className="dot">·</span> {active.kind}
            </div>

            <Editable
              tag="h1"
              className="doc-title"
              value={active.title}
              onSave={(v) => update(active.id, { title: v })}
            />

            <Editable
              tag="p"
              className="doc-subtitle"
              value={active.subtitle}
              placeholder="Add a one-line summary…"
              onSave={(v) => update(active.id, { subtitle: v })}
            />

            {/* meta card */}
            <div className="meta-card">
              <div className="meta-row">
                <span className="meta-key">Status</span>
                <label className={"status-pill status-" + active.status}>
                  <span className="status-dot" />
                  <select
                    className="status-select"
                    value={active.status}
                    onChange={(e) =>
                      update(active.id, { status: e.target.value as Status })
                    }
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="status-chevron" />
                </label>
              </div>
              <div className="meta-row">
                <span className="meta-key">Owner</span>
                <span className="owner-wrap">
                  <button className="owner owner-btn" onClick={() => setOwnerMenuOpen((o) => !o)}>
                    <span className="owner-avatar" style={{ background: active.ownerColor }}>
                      {active.owner}
                    </span>
                    {active.ownerName}
                    <ChevronDown className="status-chevron" />
                  </button>
                  {ownerMenuOpen && (
                    <div className="owner-menu" onMouseLeave={() => setOwnerMenuOpen(false)}>
                      {session && (
                        <button onMouseDown={(e) => { e.preventDefault(); handleSetOwner({ id: session.userId, name: session.name, initials: session.initials, color: session.color }); }}>
                          <span className="owner-avatar" style={{ background: session.color }}>{session.initials}</span>
                          Assign to me
                        </button>
                      )}
                      {people
                        .filter((p) => p.id !== session?.userId)
                        .map((p) => (
                          <button key={p.id} onMouseDown={(e) => { e.preventDefault(); handleSetOwner(p); }}>
                            <span className="owner-avatar" style={{ background: p.color }}>{p.initials}</span>
                            {p.name}
                          </button>
                        ))}
                      <button className="owner-clear" onMouseDown={(e) => { e.preventDefault(); handleSetOwner(null); }}>
                        Unassign
                      </button>
                    </div>
                  )}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Tags</span>
                <span className="tags">
                  {active.tags.map((t) => (
                    <span key={t} className="tag tag-editable">
                      # {t}
                      <button className="tag-remove" title="Remove tag" onClick={() => removeTag(t)}>×</button>
                    </span>
                  ))}
                  {tagEditing ? (
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
                    <button className="tag-add" onClick={() => setTagEditing(true)}>+ Add</button>
                  )}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Links to</span>
                <span className="links">
                  {active.links.map((id) => {
                    const target = docs.find((d) => d.id === id);
                    if (!target) return null;
                    return (
                      <span key={id} className="link-chip link-editable">
                        <button className="link-go" onClick={() => setActiveId(target.id)}>
                          <LinkIcon className="link-icon" /> {target.title}
                        </button>
                        <button className="link-remove" title="Remove link" onClick={() => removeLink(id)}>
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <span className="link-add-wrap">
                    <button className="tag-add" onClick={() => setLinkMenuOpen((o) => !o)}>
                      + Link
                    </button>
                    {linkMenuOpen && (
                      <div className="link-menu" onMouseLeave={() => setLinkMenuOpen(false)}>
                        {docs
                          .filter((d) => d.id !== active.id && !active.links.includes(d.id))
                          .map((d) => (
                            <button
                              key={d.id}
                              onMouseDown={(e) => { e.preventDefault(); addLink(d.id); }}
                            >
                              <LinkIcon className="link-icon" />
                              <span className="link-menu-title">{d.title}</span>
                              <span className="link-menu-group">{d.group}</span>
                            </button>
                          ))}
                        {docs.filter((d) => d.id !== active.id && !active.links.includes(d.id)).length === 0 && (
                          <div className="link-menu-empty">No other pages</div>
                        )}
                      </div>
                    )}
                  </span>
                </span>
              </div>
            </div>

            {/* block editor body */}
            <BlockEditor
              key={active.id}
              blocks={active.blocks}
              onChange={(b) => update(active.id, { blocks: b })}
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
            <span className="rail-badge">{active.refs.length}</span>
          </div>

          <div className="ref-list">
            {active.refs.map((r) => {
              const target = docs.find((d) => d.title === r.title);
              return (
                <button
                  key={r.title}
                  className="ref-card"
                  onClick={() => target && setActiveId(target.id)}
                >
                  <div className="ref-title">
                    {refIcon(r.icon)}
                    {r.title}
                  </div>
                  <p className="ref-text">{r.text}</p>
                </button>
              );
            })}
          </div>

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

      {/* ---------------- floating dock ---------------- */}
      <nav className="dock">
        <button className="dock-search" onClick={() => setPaletteOpen(true)}>
          <Search className="dock-search-icon" />
          <kbd className="kbd">⌘K</kbd>
        </button>
        <span className="dock-divider" />
        <button className="dock-item">
          <HomeIcon className="dock-icon" /> Home
        </button>
        <button className="dock-item is-active">
          <Doc className="dock-icon" /> Pages
        </button>
        <button className="dock-item">
          <Grid className="dock-icon" /> Canvas
        </button>
        <button className="dock-item">
          <Columns className="dock-icon" /> Board
        </button>
        <button className="dock-item">
          <TableIcon className="dock-icon" /> Table
        </button>
        <button className="dock-new" onClick={() => handleNewPage(activeSectionId, active.group)}>
          <Plus className="dock-new-icon" /> New
        </button>
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        docs={docs}
        activeSectionId={activeSectionId}
        activeGroup={active.group}
        onJump={setActiveId}
        onNewPage={handleNewPage}
        onNewSection={() => {
          const name = window.prompt("New section name");
          if (name && name.trim()) handleNewSection(name.trim());
        }}
      />
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
}: {
  tag: "h1" | "h2" | "p";
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const multiline = Tag === "p";
  return (
    <Tag
      className={(className ?? "") + " editable"}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => {
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
