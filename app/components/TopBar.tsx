"use client";

import { Fragment, type ReactNode } from "react";
import type { OnlineUser } from "@/lib/useSitePresence";
import OnlinePresence from "./OnlinePresence";
import NotificationBell from "./NotificationBell";
import WorkspaceLinks from "./WorkspaceLinks";
import "./chrome.css";

/** Someone online; `path` / `label` say where they are (lib/useSitePresence). */
export type PresenceUser = OnlineUser;

type IconProps = { className?: string };

const Flame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const Menu = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

interface TopBarProps {
  /** Workspace name shown next to the logo; falls back to the app name. */
  brandName?: string;
  /** Breadcrumb trail after the brand; the last entry renders as current. */
  crumbs?: string[];
  /** Presence cluster (dot, "N online", avatar stack). Omit to hide. Clicking it
   *  lists who's online and where; picking someone goes to that place. */
  online?: PresenceUser[];
  /** Your own presence key (profile id), marked "You" and not a jump target. */
  selfKey?: string;
  /** Page-specific actions on the right (save state, share, settings…). */
  children?: ReactNode;
  /** Shows a hamburger button before the brand (mobile only, via CSS) that opens the page's own nav drawer. Omit when the page has no collapsible nav. */
  onMenuToggle?: () => void;
  /** Also show the menu button on wide screens (e.g. to hide/show a docked sidebar). */
  menuAlwaysVisible?: boolean;
  /** Accessible label / tooltip for the menu button. */
  menuLabel?: string;
  /** Current workspace id — shows the notification bell when given. */
  workspaceId?: string;
}

export default function TopBar({
  brandName,
  crumbs = [],
  online,
  children,
  onMenuToggle,
  menuAlwaysVisible = false,
  menuLabel = "Toggle navigation",
  workspaceId,
  selfKey,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        {onMenuToggle && (
          <button
            type="button"
            className={"topbar-menu-btn" + (menuAlwaysVisible ? " is-always" : "")}
            onClick={onMenuToggle}
            aria-label={menuLabel}
            title={menuLabel}
          >
            <Menu className="topbar-menu-icon" />
          </button>
        )}
        <span className="logo">
          <Flame className="logo-icon" />
        </span>
        <span className="brand-name">{brandName || "FOUNDRY"}</span>
        {crumbs.map((crumb, i) => (
          <Fragment key={`${i}-${crumb}`}>
            <span className="crumb-sep">/</span>
            <span className={i === crumbs.length - 1 ? "crumb-current" : "crumb-muted"}>
              {crumb}
            </span>
          </Fragment>
        ))}
      </div>
      <div className="top-right">
        {workspaceId && <WorkspaceLinks workspaceId={workspaceId} />}
        {online && <OnlinePresence online={online} selfKey={selfKey} />}
        {workspaceId && <NotificationBell workspaceId={workspaceId} />}
        {children}
      </div>
    </header>
  );
}
