"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureSession, type SessionInfo } from "@/lib/session";
import {
  getWorkspaceInfo,
  leaveWorkspace,
  updateProfile,
  updateWorkspaceInfo,
  type WorkspaceInfo,
} from "@/lib/settingsRepo";
import Settings from "@/app/doc/Settings";
import "./chrome.css";

type IconProps = { className?: string };

const Gear = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 11.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
  </svg>
);

interface SettingsButtonProps {
  /** Pass the page's session when it has one; otherwise the button
      resolves its own via ensureSession(). */
  session?: SessionInfo | null;
  /** Notified after the profile is saved so the page can refresh
      greetings / avatars that show the old identity. */
  onSessionChange?: (session: SessionInfo) => void;
}

/** The topbar settings gear + dialog, self-contained so any page can
    drop it into <TopBar>. The doc page keeps its own wiring (it also
    syncs presence and broadcasts changes to other tabs). */
export default function SettingsButton({ session: sessionProp, onSessionChange }: SettingsButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ownSession, setOwnSession] = useState<SessionInfo | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const session = sessionProp ?? ownSession;

  // Self-serve the session when the page doesn't provide one.
  useEffect(() => {
    if (sessionProp) return;
    let cancelled = false;
    ensureSession()
      .then((s) => {
        if (!cancelled) setOwnSession(s);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [sessionProp]);

  const workspaceId = session?.workspaceId;
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getWorkspaceInfo(workspaceId)
      .then((info) => {
        if (!cancelled) setWorkspace(info);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!session) return null;

  const handleSaveProfile = (patch: { name: string; initials: string; color: string }) => {
    updateProfile(session.userId, patch).catch(console.error);
    const next = { ...session, ...patch };
    setOwnSession(next);
    onSessionChange?.(next);
  };

  const handleSaveWorkspace = (info: WorkspaceInfo) => {
    updateWorkspaceInfo(session.workspaceId, info).catch(console.error);
    setWorkspace(info);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleLeave = async () => {
    try {
      await leaveWorkspace(session.workspaceId, session.userId);
    } catch (e) {
      console.error(e);
    }
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <>
      <button
        className="share-btn settings-btn"
        title="Settings"
        onClick={() => setOpen(true)}
      >
        <Gear className="settings-gear" />
      </button>
      <Settings
        open={open}
        onClose={() => setOpen(false)}
        session={session}
        workspace={workspace}
        onSaveProfile={handleSaveProfile}
        onSaveWorkspace={handleSaveWorkspace}
        onSignOut={handleSignOut}
        onLeave={handleLeave}
      />
    </>
  );
}
