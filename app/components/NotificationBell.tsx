"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { useRouter } from "next/navigation";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationVerb,
  type NotificationRow,
} from "@/lib/notificationsRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const Bell = () => (
  <svg className="notif-bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export default function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const refresh = async () => setNotifications(await listNotifications(workspaceId));
  useEffect(() => { refresh().catch(console.error); }, [workspaceId]);
  useSidebarLiveUpdates(workspaceId, ["notifications"], refresh);

  const unread = notifications.filter((n) => !n.read_at).length;

  const openNotification = async (n: NotificationRow) => {
    setOpen(false);
    if (!n.read_at) {
      setNotifications((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)));
      markNotificationRead(n.id).catch(console.error);
    }
    // Routes read their query (e.g. ?card=) on load, so a same-route link reloads.
    if (new URL(n.link, window.location.origin).pathname === window.location.pathname) window.location.assign(n.link);
    else router.push(n.link);
  };

  const dismiss = (n: NotificationRow) => {
    setNotifications((prev) => prev.filter((p) => p.id !== n.id));
    deleteNotification(n.id).catch((e) => {
      console.error(e);
      refresh().catch(console.error);
    });
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="notif-mark-all"
                onClick={() => {
                  setNotifications((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })));
                  markAllNotificationsRead(workspaceId).catch(console.error);
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 && <p className="notif-empty">No notifications. You’ll be notified about @mentions, replies to your comments, tasks assigned to you and pages you’re made owner of.</p>}
            {notifications.map((n) => (
              <div key={n.id} className="notif-row">
              <button type="button" className={"notif-item" + (n.read_at ? "" : " is-unread")} onClick={() => openNotification(n)}>
                <span className="notif-avatar" style={{ background: n.actor_color ?? "#a59a8c" }}>
                  {n.actor_initials ?? "?"}
                </span>
                <span className="notif-body">
                  <span className="notif-text">
                    <strong>{n.actor_name ?? "Someone"}</strong>{" "}
                    {notificationVerb(n)}
                  </span>
                  <span className="notif-snippet">{n.snippet}</span>
                  <span className="notif-time">{timeAgo(n.created_at)}</span>
                </span>
              </button>
              <button type="button" className="notif-dismiss" aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(n)}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
