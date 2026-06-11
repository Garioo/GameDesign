"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureSession, setActiveWorkspace, type SessionInfo } from "@/lib/session";
import { loadWorkspace, listMembers, type ProfileInfo } from "@/lib/docsRepo";
import {
  listWorkspaces,
  createWorkspace,
  createInviteLink,
  type WorkspaceSummary,
} from "@/lib/workspacesRepo";
import { STATUS_LABEL, type DesignDoc, type Status } from "@/app/doc/data";
import TopBar from "@/app/components/TopBar";
import Dock from "@/app/components/Dock";
import SettingsButton from "@/app/components/SettingsButton";
import styles from "./home.module.css";

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const ArrowRight = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Shapes = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <circle cx="17.5" cy="17.5" r="3.5" />
  </svg>
);
const Columns = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18" />
  </svg>
);

const STATUS_CLASS: Record<Status, string> = {
  todo: styles.statusTodo,
  wip: styles.statusWip,
  review: styles.statusReview,
  done: styles.statusDone,
};

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function HomeDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [recent, setRecent] = useState<DesignDoc[]>([]);
  const [members, setMembers] = useState<ProfileInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) {
        router.replace("/login");
        return;
      }
      if (!s.onboarded) {
        router.replace("/onboarding");
        return;
      }
      setSession(s);
      const [docs, team, spaces] = await Promise.all([
        loadWorkspace(s.workspaceId),
        listMembers(s.workspaceId),
        listWorkspaces(s.userId),
      ]);
      if (cancelled) return;
      setRecent(
        [...docs]
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
          .slice(0, 6),
      );
      setDocCount(docs.length);
      setMembers(team);
      setWorkspaces(spaces);
      setLoaded(true);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  /** Make a workspace active and reload its docs + members. */
  const switchWorkspace = async (id: string) => {
    if (!session || id === session.workspaceId) return;
    setActiveWorkspace(id);
    setSession({ ...session, workspaceId: id });
    setLoaded(false);
    try {
      const [docs, team] = await Promise.all([loadWorkspace(id), listMembers(id)]);
      setRecent(
        [...docs]
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
          .slice(0, 6),
      );
      setDocCount(docs.length);
      setMembers(team);
    } catch (e) {
      console.error(e);
    }
    setLoaded(true);
  };

  const handleCreateWorkspace = async () => {
    const name = newName.trim();
    if (!session || !name || creating) return;
    setCreating(true);
    try {
      const id = await createWorkspace(session.userId, name);
      setNewName("");
      setWorkspaces(await listWorkspaces(session.userId));
      await switchWorkspace(id);
    } catch (e) {
      console.error(e);
    }
    setCreating(false);
  };

  const handleInvite = async (id: string) => {
    if (!session) return;
    try {
      const link = await createInviteLink(id, session.userId);
      try {
        await navigator.clipboard.writeText(link);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2500);
      } catch {
        // Clipboard blocked (permissions / insecure context) — show the link.
        window.prompt("Copy this invite link:", link);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar crumbs={["Home"]}>
        {session && (
          <span
            className={styles.me}
            style={{ background: session.color }}
            title={session.name}
          >
            {session.initials}
          </span>
        )}
        <button type="button" className="share-btn" onClick={handleSignOut}>
          Sign out
        </button>
        <SettingsButton session={session} onSessionChange={setSession} />
      </TopBar>

      {!loaded ? (
        <div className={styles.loading}>Opening your workspace…</div>
      ) : (
        <main className={styles.shell}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>
              <span className={styles.spark} aria-hidden="true" />
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className={styles.greeting}>
              {timeOfDayGreeting()},{" "}
              <em className={styles.greetName}>{session?.name}</em>.
            </h1>
            <p className={styles.greetingSub}>
              You&apos;re in{" "}
              <strong>
                {workspaces.find((w) => w.id === session?.workspaceId)?.name ??
                  "your workspace"}
              </strong>{" "}
              — pick up where the team left off.
            </p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statNum}>{docCount}</span>
                <span className={styles.statLabel}>
                  {docCount === 1 ? "page" : "pages"}
                </span>
              </div>
              <span className={styles.statRule} aria-hidden="true" />
              <div className={styles.stat}>
                <span className={styles.statNum}>{members.length}</span>
                <span className={styles.statLabel}>
                  {members.length === 1 ? "teammate" : "teammates"}
                </span>
              </div>
              <span className={styles.statRule} aria-hidden="true" />
              <div className={styles.stat}>
                <span className={styles.statNum}>{workspaces.length}</span>
                <span className={styles.statLabel}>
                  {workspaces.length === 1 ? "workspace" : "workspaces"}
                </span>
              </div>
            </div>
          </header>

          <nav className={styles.destinations}>
            <Link href="/doc" className={styles.dest}>
              <div className={styles.destHead}>
                <span className={styles.destIcon}>
                  <Doc />
                </span>
                <span className={styles.destNo}>
                  01
                  <ArrowRight className={styles.destArrow} />
                </span>
              </div>
              <h2 className={styles.destTitle}>Docs</h2>
              <p className={styles.destBody}>
                The living design document — specs, systems and decisions.
              </p>
            </Link>
            <Link href="/doc/canvas" className={styles.dest}>
              <div className={styles.destHead}>
                <span className={styles.destIcon}>
                  <Shapes />
                </span>
                <span className={styles.destNo}>
                  02
                  <ArrowRight className={styles.destArrow} />
                </span>
              </div>
              <h2 className={styles.destTitle}>Canvas</h2>
              <p className={styles.destBody}>
                Sketch flows, systems and level layouts on the shared canvas.
              </p>
            </Link>
            <Link href="/board" className={styles.dest}>
              <div className={styles.destHead}>
                <span className={styles.destIcon}>
                  <Columns />
                </span>
                <span className={styles.destNo}>
                  03
                  <ArrowRight className={styles.destArrow} />
                </span>
              </div>
              <h2 className={styles.destTitle}>Board</h2>
              <p className={styles.destBody}>
                Track features from idea to shipped on the production board.
              </p>
            </Link>
          </nav>

          <div className={styles.columns}>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Recently edited</h2>
                <Link href="/doc" className={styles.sectionLink}>
                  All pages →
                </Link>
              </div>
              <div className={styles.recentList}>
                {recent.length === 0 ? (
                  <p className={styles.empty}>
                    No pages yet — <Link href="/doc">open the docs</Link> to
                    start your first one.
                  </p>
                ) : (
                  recent.map((d) => (
                    <Link
                      key={d.id}
                      href={`/doc?page=${d.id}`}
                      className={styles.recentRow}
                    >
                      <span className={styles.recentMain}>
                        <span className={styles.recentTitle}>{d.title}</span>
                        <span className={styles.recentGroup}>{d.group}</span>
                      </span>
                      <span className={`${styles.statusPill} ${STATUS_CLASS[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      <span
                        className={styles.recentOwner}
                        style={{ background: d.ownerColor }}
                        title={d.ownerName}
                      >
                        {d.owner}
                      </span>
                      <span className={styles.recentWhen}>{timeAgo(d.updatedAt)}</span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <aside className={styles.rail}>
              <section className={styles.railCard}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Workspaces</h2>
                  <span className={styles.railCount}>{workspaces.length}</span>
                </div>
                <div className={styles.wsList}>
                  {workspaces.map((w) => (
                    <div
                      key={w.id}
                      className={`${styles.wsRow} ${
                        w.id === session?.workspaceId ? styles.wsActive : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.wsMain}
                        onClick={() => switchWorkspace(w.id)}
                      >
                        <span className={styles.wsName}>{w.name}</span>
                        <span className={styles.wsMeta}>
                          {w.memberCount}{" "}
                          {w.memberCount === 1 ? "member" : "members"}
                          {w.genre ? ` · ${w.genre}` : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.wsInvite}
                        onClick={() => handleInvite(w.id)}
                        title="Copy an invite link (valid 14 days)"
                      >
                        {copiedId === w.id ? "Copied!" : "Invite"}
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  className={styles.wsNew}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateWorkspace();
                  }}
                >
                  <input
                    className={styles.wsInput}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New workspace…"
                    maxLength={60}
                  />
                  <button
                    type="submit"
                    className={styles.wsCreate}
                    disabled={creating || !newName.trim()}
                  >
                    {creating ? "…" : "Create"}
                  </button>
                </form>
              </section>

              {members.length > 0 && (
                <section className={styles.teamCard}>
                  <div className={styles.teamAvatars}>
                    {members.slice(0, 8).map((m) => (
                      <span
                        key={m.id}
                        className={styles.teamAvatar}
                        style={{ background: m.color }}
                        title={m.name}
                      >
                        {m.initials}
                      </span>
                    ))}
                  </div>
                  <p className={styles.teamNote}>
                    {members.length === 1
                      ? "Just you in this workspace so far."
                      : `${members.length} people are designing here.`}
                  </p>
                </section>
              )}
            </aside>
          </div>
        </main>
      )}

      <Dock />
    </div>
  );
}
