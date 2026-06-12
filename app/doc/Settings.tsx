"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { initialsOf, PALETTE, PALETTE_NAMES, type SessionInfo } from "@/lib/session";
import { getGithubToken, listRepos } from "@/lib/github";
import type { WorkspaceInfo } from "@/lib/settingsRepo";
import {
  createInviteLink,
  listWorkspaceMembers,
  removeMember,
  setMemberRole,
  transferOwnership,
  type GrantableRole,
  type WorkspaceMember,
} from "@/lib/workspacesRepo";
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
  // members
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteRole, setInviteRole] = useState<GrantableRole>("editor");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  // account
  const [email, setEmail] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const myRole = members.find((m) => m.id === session.userId)?.role ?? null;

  const refreshMembers = (workspaceId: string) =>
    listWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch((e: unknown) => {
        console.error(e);
        setMembers([]);
      });

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
    setConfirmRemove(null);
    setConfirmTransfer(null);
    setMemberError(null);
    setInviteCopied(false);
    if (session.workspaceId) refreshMembers(session.workspaceId);
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
    if (!initialsTouched) setInitials(initialsOf(v));
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

  const dirty = profileDirty || wsDirty;
  const valid = (!profileDirty || profileValid) && (!wsDirty || !!wsName.trim());

  const saveAll = () => {
    if (profileDirty && profileValid) {
      onSaveProfile({ name: name.trim(), initials: initials.trim(), color });
    }
    if (wsDirty && wsName.trim()) {
      onSaveWorkspace({
        name: wsName.trim(),
        tagline: wsTagline.trim(),
        genre: wsGenre.trim(),
        repo: wsRepo.trim(),
      });
    }
    onClose();
  };

  /* ---------- members (owner grants access) ---------- */

  const memberAction = (action: Promise<void>) => {
    setMemberError(null);
    action
      .then(() => refreshMembers(session.workspaceId))
      .catch((e: unknown) => {
        console.error(e);
        setMemberError(e instanceof Error ? e.message : "Something went wrong");
      });
  };

  const handleRoleChange = (member: WorkspaceMember, role: string) => {
    if (role === member.role) return;
    if (role === "owner") {
      setConfirmTransfer(member.id); // needs an explicit confirm step
      return;
    }
    memberAction(setMemberRole(session.workspaceId, member.id, role as GrantableRole));
  };

  const handleTransfer = (newOwnerId: string) => {
    setConfirmTransfer(null);
    memberAction(transferOwnership(session.workspaceId, newOwnerId));
  };

  const handleRemove = (userId: string) => {
    setConfirmRemove(null);
    memberAction(removeMember(session.workspaceId, userId));
  };

  const handleCopyInvite = async () => {
    setMemberError(null);
    try {
      const link = await createInviteLink(session.workspaceId, session.userId, inviteRole);
      try {
        await navigator.clipboard.writeText(link);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2500);
      } catch {
        // Clipboard blocked (permissions / insecure context) — show the link.
        window.prompt("Copy this invite link:", link);
      }
    } catch (e) {
      console.error(e);
      setMemberError(e instanceof Error ? e.message : "Could not create the invite link");
    }
  };

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
          <button className={styles.close} title="Close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.body}>
          {/* ---------- identity ---------- */}
          <section className={`${styles.section} ${styles.s1}`}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Identity</h3>
              <span className={styles.rule} />
            </div>

            <div className={styles.identity}>
              <span className={styles.bigAvatar} style={{ background: color }}>
                {initials || "?"}
              </span>
              <div className={styles.identityFields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input
                    className={styles.input}
                    value={name}
                    maxLength={40}
                    onChange={(e) => setNameAndSuggest(e.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <div className={styles.identityMeta}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Initials</span>
                    <input
                      className={`${styles.input} ${styles.inputInitials}`}
                      value={initials}
                      maxLength={2}
                      onChange={(e) => {
                        setInitialsTouched(true);
                        setInitials(e.target.value.toUpperCase());
                      }}
                    />
                  </label>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel} id="settings-color-label">
                      Color
                    </span>
                    <div
                      className={styles.swatches}
                      role="radiogroup"
                      aria-labelledby="settings-color-label"
                    >
                      {PALETTE.map((c, i) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={c === color}
                          aria-label={PALETTE_NAMES[i] ?? c}
                          title={PALETTE_NAMES[i] ?? c}
                          className={
                            c === color ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch
                          }
                          style={{ background: c }}
                          onClick={() => setColor(c)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------- workspace ---------- */}
          <section className={`${styles.section} ${styles.s2}`}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Workspace</h3>
              <span className={styles.rule} />
            </div>

            {workspace ? (
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input
                    className={styles.input}
                    value={wsName}
                    maxLength={60}
                    onChange={(e) => setWsName(e.target.value)}
                    placeholder="Workspace name"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Genre</span>
                  <input
                    className={styles.input}
                    value={wsGenre}
                    maxLength={40}
                    onChange={(e) => setWsGenre(e.target.value)}
                    placeholder="e.g. Cozy survival"
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Tagline</span>
                  <input
                    className={styles.input}
                    value={wsTagline}
                    maxLength={120}
                    onChange={(e) => setWsTagline(e.target.value)}
                    placeholder="A one-line pitch…"
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Repository</span>
                  <input
                    className={styles.input}
                    value={wsRepo}
                    onChange={(e) => setWsRepo(e.target.value)}
                    placeholder={
                      repoOptions.length > 0
                        ? "owner/repo — start typing to search"
                        : "owner/repo (sign in with GitHub to browse)"
                    }
                    list="settings-repo-options"
                    spellCheck={false}
                  />
                  <datalist id="settings-repo-options">
                    {repoOptions.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </label>
              </div>
            ) : (
              <p className={styles.fine}>Workspace info unavailable.</p>
            )}
          </section>

          {/* ---------- members ---------- */}
          <section className={`${styles.section} ${styles.s3}`}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Members</h3>
              <span className={styles.rule} />
            </div>

            <div className={styles.members}>
              {members.map((m) => {
                const isSelf = m.id === session.userId;
                const ownerControls = myRole === "owner" && !isSelf;
                return (
                  <div key={m.id} className={styles.memberRow}>
                    <span className={styles.memberAvatar} style={{ background: m.color }}>
                      {m.initials}
                    </span>
                    <span className={styles.memberName}>
                      {m.name}
                      {isSelf && <span className={styles.memberYou}> (you)</span>}
                    </span>
                    {confirmTransfer === m.id ? (
                      <span className={styles.ashConfirm}>
                        Make {m.name} the owner? You become an editor.
                        <button className={styles.ashYes} onClick={() => handleTransfer(m.id)}>
                          Transfer
                        </button>
                        <button className={styles.ashNo} onClick={() => setConfirmTransfer(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : confirmRemove === m.id ? (
                      <span className={styles.ashConfirm}>
                        Remove {m.name}?
                        <button className={styles.ashYes} onClick={() => handleRemove(m.id)}>
                          Remove
                        </button>
                        <button className={styles.ashNo} onClick={() => setConfirmRemove(null)}>
                          Keep
                        </button>
                      </span>
                    ) : ownerControls ? (
                      <>
                        <select
                          className={styles.roleSelect}
                          value={m.role}
                          aria-label={`Role for ${m.name}`}
                          onChange={(e) => handleRoleChange(m, e.target.value)}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                          <option value="owner">Make owner…</option>
                        </select>
                        <button
                          className={styles.memberRemove}
                          title={`Remove ${m.name}`}
                          aria-label={`Remove ${m.name}`}
                          onClick={() => setConfirmRemove(m.id)}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <span className={styles.roleChip}>{m.role}</span>
                    )}
                  </div>
                );
              })}
              {members.length === 0 && <p className={styles.fine}>Loading members…</p>}
            </div>

            {myRole === "owner" && (
              <div className={styles.inviteRow}>
                <span className={styles.fieldLabel}>Invite as</span>
                <select
                  className={styles.roleSelect}
                  value={inviteRole}
                  aria-label="Role granted by the invite link"
                  onChange={(e) => setInviteRole(e.target.value as GrantableRole)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button className={styles.signOut} onClick={handleCopyInvite}>
                  {inviteCopied ? "Copied!" : "Copy invite link"}
                </button>
              </div>
            )}

            {memberError && <p className={styles.memberError}>{memberError}</p>}
          </section>

          {/* ---------- account ---------- */}
          <section className={`${styles.section} ${styles.s4}`}>
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
              {myRole === "owner" ? (
                <span className={styles.fine}>
                  Owners can’t leave — transfer ownership to another member first.
                </span>
              ) : confirmLeave ? (
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

        <footer className={styles.footer}>
          <span className={styles.footerHint} aria-live="polite">
            {dirty ? (valid ? "Unsaved changes" : "Name and initials can't be empty") : ""}
          </span>
          <div className={styles.footerActions}>
            <button className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button className={styles.save} disabled={!dirty || !valid} onClick={saveAll}>
              Save changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
