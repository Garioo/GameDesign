"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PALETTE, type SessionInfo } from "@/lib/session";
import { getGithubToken, listRepos } from "@/lib/github";
import type { WorkspaceInfo } from "@/lib/settingsRepo";
import styles from "./Settings.module.css";

const Flame = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

export default function Settings({
  open,
  onClose,
  session,
  workspace,
  onSaveProfile,
  onSaveWorkspace,
  onSignOut,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  session: SessionInfo;
  workspace: WorkspaceInfo | null;
  onSaveProfile: (patch: { name: string; initials: string; color: string }) => void;
  onSaveWorkspace: (patch: WorkspaceInfo) => void;
  onSignOut: () => void;
  onLeave: () => void;
}) {
  // profile draft
  const [name, setName] = useState(session.name);
  const [initials, setInitials] = useState(session.initials);
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [color, setColor] = useState(session.color);
  // workspace draft
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [wsTagline, setWsTagline] = useState(workspace?.tagline ?? "");
  const [wsGenre, setWsGenre] = useState(workspace?.genre ?? "");
  const [wsRepo, setWsRepo] = useState(workspace?.repo ?? "");
  const [repoOptions, setRepoOptions] = useState<string[]>([]);
  // account
  const [email, setEmail] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Re-seed drafts each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(session.name);
    setInitials(session.initials);
    setInitialsTouched(false);
    setColor(session.color);
    setWsName(workspace?.name ?? "");
    setWsTagline(workspace?.tagline ?? "");
    setWsGenre(workspace?.genre ?? "");
    setWsRepo(workspace?.repo ?? "");
    setConfirmLeave(false);
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setEmail(s?.user.email ?? null);
      setProvider((s?.user.app_metadata?.provider as string | undefined) ?? null);
    });
    // Repo suggestions for the datalist (GitHub sign-ins only).
    if (getGithubToken()) listRepos().then(setRepoOptions).catch(() => setRepoOptions([]));
  }, [open, session, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setNameAndSuggest = (v: string) => {
    setName(v);
    if (!initialsTouched) setInitials(v.trim().slice(0, 2).toUpperCase());
  };

  const profileDirty =
    name.trim() !== session.name || initials.trim() !== session.initials || color !== session.color;
  const profileValid = !!name.trim() && !!initials.trim();
  const wsDirty =
    !!workspace &&
    (wsName.trim() !== workspace.name ||
      wsTagline.trim() !== workspace.tagline ||
      wsGenre.trim() !== workspace.genre ||
      wsRepo.trim() !== workspace.repo);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <span className={styles.flame}>
            <Flame />
          </span>
          <div className={styles.headText}>
            <h2 className={styles.title}>Settings</h2>
            <p className={styles.tagline}>Who you are around the fire — and the fire itself.</p>
          </div>
          <button className={styles.close} title="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {/* ---------- identity ---------- */}
        <section className={`${styles.section} ${styles.s1}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Identity</h3>
            <span className={styles.rule} />
            {profileDirty && (
              <button
                className={styles.saveChip}
                disabled={!profileValid}
                onClick={() =>
                  onSaveProfile({ name: name.trim(), initials: initials.trim(), color })
                }
              >
                Save
              </button>
            )}
          </div>

          <div className={styles.identity}>
            <span className={styles.bigAvatar} style={{ background: color }}>
              {initials || "?"}
            </span>
            <div className={styles.identityFields}>
              <input
                className={styles.nameInput}
                value={name}
                onChange={(e) => setNameAndSuggest(e.target.value)}
                placeholder="Your name"
                aria-label="Name"
              />
              <div className={styles.identityMeta}>
                <label className={styles.miniKey} htmlFor="set-initials">
                  Initials
                </label>
                <input
                  id="set-initials"
                  className={styles.initialsInput}
                  value={initials}
                  maxLength={2}
                  onChange={(e) => {
                    setInitialsTouched(true);
                    setInitials(e.target.value.toUpperCase());
                  }}
                />
                <span className={styles.metaDot}>·</span>
                <span className={styles.swatches}>
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      className={
                        c === color ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch
                      }
                      style={{ background: c }}
                      title={c}
                      aria-label={`Avatar color ${c}`}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- workspace ---------- */}
        <section className={`${styles.section} ${styles.s2}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Workspace</h3>
            <span className={styles.rule} />
            {wsDirty && (
              <button
                className={styles.saveChip}
                disabled={!wsName.trim()}
                onClick={() =>
                  onSaveWorkspace({
                    name: wsName.trim(),
                    tagline: wsTagline.trim(),
                    genre: wsGenre.trim(),
                    repo: wsRepo.trim(),
                  })
                }
              >
                Save
              </button>
            )}
          </div>

          {workspace ? (
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.key}>Name</span>
                <input
                  className={styles.inline}
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="Workspace name"
                  aria-label="Workspace name"
                />
              </div>
              <div className={styles.row}>
                <span className={styles.key}>Tagline</span>
                <input
                  className={styles.inline}
                  value={wsTagline}
                  onChange={(e) => setWsTagline(e.target.value)}
                  placeholder="A one-line pitch…"
                  aria-label="Workspace tagline"
                />
              </div>
              <div className={styles.row}>
                <span className={styles.key}>Genre</span>
                <input
                  className={styles.inline}
                  value={wsGenre}
                  onChange={(e) => setWsGenre(e.target.value)}
                  placeholder="e.g. Cozy survival"
                  aria-label="Workspace genre"
                />
              </div>
              <div className={styles.row}>
                <span className={styles.key}>Repository</span>
                <input
                  className={styles.inline}
                  value={wsRepo}
                  onChange={(e) => setWsRepo(e.target.value)}
                  placeholder={
                    repoOptions.length > 0
                      ? "owner/repo — start typing to search"
                      : "owner/repo (sign in with GitHub to browse)"
                  }
                  list="settings-repo-options"
                  aria-label="GitHub repository"
                  spellCheck={false}
                />
                <datalist id="settings-repo-options">
                  {repoOptions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>
          ) : (
            <p className={styles.fine}>Workspace info unavailable.</p>
          )}
        </section>

        {/* ---------- account ---------- */}
        <section className={`${styles.section} ${styles.s3}`}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Account</h3>
            <span className={styles.rule} />
          </div>

          <div className={styles.account}>
            <div className={styles.accountWho}>
              <span className={styles.accountEmail}>{email ?? "—"}</span>
              {provider && <span className={styles.providerChip}>via {provider}</span>}
            </div>
            <button className={styles.signOut} onClick={onSignOut}>
              Sign out
            </button>
          </div>

          <div className={styles.ash}>
            {confirmLeave ? (
              <span className={styles.ashConfirm}>
                Leave this workspace and lose access to its pages?
                <button className={styles.ashYes} onClick={onLeave}>
                  Leave
                </button>
                <button className={styles.ashNo} onClick={() => setConfirmLeave(false)}>
                  Stay
                </button>
              </span>
            ) : (
              <button className={styles.ashLink} onClick={() => setConfirmLeave(true)}>
                Leave this workspace…
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
