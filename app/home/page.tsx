"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { loadWorkspace, listMembers, type ProfileInfo } from "@/lib/docsRepo";
import { STATUS_LABEL, type DesignDoc, type Status } from "@/app/doc/data";
import styles from "./home.module.css";

/* ---------- inline icon set (lucide-flavoured, no deps) ---------- */
type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await ensureSession();
      if (cancelled) return;
      if (!s) {
        router.replace("/login");
        return;
      }
      setSession(s);
      const [docs, team] = await Promise.all([
        loadWorkspace(s.workspaceId),
        listMembers(s.workspaceId),
      ]);
      if (cancelled) return;
      setRecent(
        [...docs]
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
          .slice(0, 6),
      );
      setMembers(team);
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

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Flame className={styles.logoIcon} />
          </span>
          <span className={styles.brandName}>EMBERWICK</span>
        </div>
        <div className={styles.topRight}>
          {session && (
            <span
              className={styles.me}
              style={{ background: session.color }}
              title={session.name}
            >
              {session.initials}
            </span>
          )}
          <button type="button" className={styles.signOut} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {!loaded ? (
        <div className={styles.loading}>Opening your workspace…</div>
      ) : (
        <main className={styles.shell}>
          <p className={styles.eyebrow}>Home</p>
          <h1 className={styles.greeting}>
            {timeOfDayGreeting()}, {session?.name}.
          </h1>
          <p className={styles.greetingSub}>
            Pick up where the team left off, or jump straight into a workspace.
          </p>

          <nav className={styles.destinations}>
            <Link href="/doc" className={styles.dest}>
              <div className={styles.destHead}>
                <span className={styles.destIcon}>
                  <Doc />
                </span>
                <ArrowRight className={styles.destArrow} />
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
                <ArrowRight className={styles.destArrow} />
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
                <ArrowRight className={styles.destArrow} />
              </div>
              <h2 className={styles.destTitle}>Board</h2>
              <p className={styles.destBody}>
                Track features from idea to shipped on the production board.
              </p>
            </Link>
          </nav>

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
                  No pages yet — <Link href="/doc">open the docs</Link> to start
                  your first one.
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

          {members.length > 0 && (
            <section className={styles.team}>
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
                  : `${members.length} people are designing in this workspace.`}
              </p>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
