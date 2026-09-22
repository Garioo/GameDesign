"use client";

import { Fragment, type ReactNode } from "react";
import "./chrome.css";

export interface PresenceUser {
  key: string;
  name: string;
  initials: string;
  color: string;
}

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
  /** Presence cluster (dot, "N online", avatar stack). Omit to hide. */
  online?: PresenceUser[];
  /** Page-specific actions on the right (save state, share, settings…). */
  children?: ReactNode;
  /** Shows a hamburger button before the brand (mobile only, via CSS) that opens the page's own nav drawer. Omit when the page has no collapsible nav. */
  onMenuToggle?: () => void;
}

export default function TopBar({
  brandName,
  crumbs = [],
  online,
  children,
  onMenuToggle,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        {onMenuToggle && (
          <button type="button" className="topbar-menu-btn" onClick={onMenuToggle} aria-label="Toggle navigation">
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
        {online && (
          <>
            <span className="online-dot" />
            <span className="online-text">{online.length} online</span>
            <div className="avatar-stack">
              {online.slice(0, 4).map((u) => (
                <span key={u.key} className="avatar" style={{ background: u.color }} title={u.name}>
                  {u.initials}
                </span>
              ))}
            </div>
          </>
        )}
        {children}
      </div>
    </header>
  );
}
