"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { OnlineUser } from "@/lib/useSitePresence";
import { setFollowed, useFollowed } from "@/lib/follow";
import { publishFollowedView, withView } from "@/lib/followView";
import { isRiverBeta, riverPathFor } from "@/lib/beta";
import "./chrome.css";

type PresenceUser = OnlineUser;

/**
 * Who's online (dot, "N online", avatar stack). Clicking it lists who's online
 * and where; picking someone goes there, Follow keeps going wherever they go.
 * New arrivals pop in, leavers shrink out, and people who open your page get a
 * nudge. Used by the classic TopBar and the new design's edge.
 */
export default function OnlinePresence({ online, selfKey, className }: {
  online: PresenceUser[];
  /** Your own presence key (profile id), marked "You" and not a jump target. */
  selfKey?: string;
  /** Extra class on the cluster, for placing it outside the top bar. */
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [whoOpen, setWhoOpen] = useState(false);
  const whoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!whoOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!whoRef.current?.contains(e.target as Node)) setWhoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWhoOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [whoOpen]);
  // Places are shared as classic paths; with the new design on, go to its version of the place.
  const local = (path: string) => {
    if (!isRiverBeta()) return path;
    const u = new URL(path, window.location.origin);
    return riverPathFor(u.pathname, u.searchParams) ?? path;
  };
  const goTo = (path: string) => {
    setWhoOpen(false);
    path = local(path);
    // Pages (and the new design's Plan) follow their params; other routes read
    // their params on load, so a same-route jump reloads to pick up the new board / canvas.
    const target = new URL(path, window.location.origin);
    const live = ["/doc", "/river/pages", "/river/plan"];
    if (target.pathname === pathname && !live.includes(target.pathname)) window.location.assign(path);
    else router.push(path);
  };
  // True when this tab is at `path` — same route and every param it names —
  // ignoring extra params such as an open ?card=, which are views, not places.
  const atPlace = (path: string) => {
    const target = new URL(local(path), window.location.origin);
    if (target.pathname !== window.location.pathname) return false;
    const here = new URLSearchParams(window.location.search);
    return [...target.searchParams].every(([k, v]) => here.get(k) === v);
  };
  const others = (online ?? []).filter((u) => u.key !== selfKey);
  const self = (online ?? []).find((u) => u.key === selfKey);
  const here = (u: PresenceUser) => !!self?.path && u.key !== selfKey && u.path === self.path;

  /* ---------- presence you can feel ---------- */
  // People who arrive after the first sync pop into the stack; people who
  // leave shrink out of it; people who open the page you're on get a nudge.
  const mountedAt = useRef(Date.now());
  const settled = () => Date.now() - mountedAt.current > 1500;
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<PresenceUser[]>([]);
  const [nudges, setNudges] = useState<(PresenceUser & { id: number })[]>([]);
  const prev = useRef<{ all: PresenceUser[]; here: Set<string>; path?: string }>({ all: [], here: new Set() });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const onlineKey = (online ?? []).map((u) => `${u.key}@${u.path ?? ""}`).join("|");
  useEffect(() => {
    const list = online ?? [];
    const now = new Set(list.map((u) => u.key));
    const hereNow = new Set(list.filter(here).map((u) => u.key));
    const before = prev.current;
    prev.current = { all: list, here: hereNow, path: self?.path };
    if (!settled()) return;
    const arrived = list.filter((u) => u.key !== selfKey && !before.all.some((b) => b.key === u.key)).map((u) => u.key);
    const gone = before.all.filter((u) => !now.has(u.key) && u.key !== selfKey);
    // Only when they came to us: moving yourself onto a busy page isn't news.
    const joinedHere = before.path === self?.path ? list.filter((u) => hereNow.has(u.key) && !before.here.has(u.key)) : [];
    if (arrived.length) {
      setFresh((f) => new Set([...f, ...arrived]));
      setTimeout(() => alive.current && setFresh((f) => new Set([...f].filter((k) => !arrived.includes(k)))), 700);
    }
    if (gone.length) {
      setLeaving((l) => [...l.filter((u) => !now.has(u.key) && !gone.some((g) => g.key === u.key)), ...gone]);
      setTimeout(() => alive.current && setLeaving((l) => l.filter((u) => !gone.some((g) => g.key === u.key))), 360);
    }
    for (const u of joinedHere) {
      const id = Date.now() + Math.random();
      setNudges((n) => [...n.filter((x) => x.key !== u.key), { ...u, id }].slice(-3));
      setTimeout(() => alive.current && setNudges((n) => n.filter((x) => x.id !== id)), 3800);
    }
    // `here` and `settled` only read refs/props already in onlineKey's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineKey, selfKey]);

  /* ---------- follow ---------- */
  const followed = useFollowed();
  const followedUser = followed ? others.find((u) => u.key === followed.key) : undefined;
  const lastFollowPath = useRef<string | null>(null);
  useEffect(() => {
    if (!followed) {
      lastFollowPath.current = null;
      return;
    }
    // They went offline: give them a moment (a reload, a flaky connection) before letting go.
    if (!followedUser) {
      const t = setTimeout(() => setFollowed(null), 8000);
      return () => clearTimeout(t);
    }
    const path = followedUser.path;
    if (!path || path === lastFollowPath.current) return;
    lastFollowPath.current = path;
    // Arriving with their view in the URL opens it on load; after that, the
    // followed view below keeps it in step without reloading.
    if (!atPlace(path)) goTo(withView(path, followedUser.view));
    // goTo is stable enough: it only reads the current pathname.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followed, followedUser?.path, !!followedUser]);
  // Hand their open task / event / panel to this page while we're at the same place.
  const followedViewKey = JSON.stringify(followedUser?.view ?? {});
  const samePlace = !!followedUser?.path && !!self?.path && followedUser.path === self.path;
  useEffect(() => {
    publishFollowedView(followed && samePlace ? JSON.parse(followedViewKey) : undefined);
  }, [followed, samePlace, followedViewKey]);
  useEffect(() => () => publishFollowedView(undefined), []);
  const follow = (u: PresenceUser) => {
    setWhoOpen(false);
    setFollowed({ key: u.key, name: u.name, color: u.color, initials: u.initials });
  };

  const stack = [...(online ?? []).slice(0, 4), ...leaving.filter((l) => !(online ?? []).some((u) => u.key === l.key)).slice(0, 2)];

  return (
    <>
      <div className={"who-wrap" + (className ? ` ${className}` : "")} ref={whoRef}>
        <button
          type="button"
          className="who-btn"
          aria-haspopup="true"
          aria-expanded={whoOpen}
          title="Who's online — click to see where they are"
          onClick={() => setWhoOpen((o) => !o)}
        >
          <span className="online-dot" />
          <span className="online-text">{online.length} online</span>
          <span className="avatar-stack">
            {stack.map((u) => {
              const gone = !(online ?? []).some((x) => x.key === u.key);
              return (
                <span
                  key={u.key}
                  className={
                    "avatar" +
                    (fresh.has(u.key) ? " is-new" : "") +
                    (gone ? " is-leaving" : "") +
                    (here(u) ? " is-here" : "") +
                    (followed?.key === u.key ? " is-followed" : "")
                  }
                  style={{ background: u.color, "--c": u.color } as React.CSSProperties}
                  title={here(u) ? `${u.name} is on this page` : u.name}
                >
                  {u.initials}
                </span>
              );
            })}
          </span>
        </button>
        {whoOpen && (
          <div className="who-menu" role="menu" aria-label="Online now">
            <p className="who-head">Online now</p>
            {self && (
              <div className="who-row is-self">
                <span className="avatar" style={{ background: self.color }}>{self.initials}</span>
                <span className="who-text">
                  <span className="who-name">{self.name} <span className="who-you">(you)</span></span>
                  {self.label && <span className="who-where">{self.label}</span>}
                </span>
              </div>
            )}
            {others.map((u) => (
              <div key={u.key} className="who-line">
                <button
                  type="button"
                  role="menuitem"
                  className="who-row"
                  disabled={!u.path}
                  onClick={() => u.path && goTo(withView(u.path, u.view))}
                  title={u.path ? `Go to ${u.label ?? "where they are"}` : undefined}
                >
                  <span className={"avatar" + (here(u) ? " is-here" : "")} style={{ background: u.color, "--c": u.color } as React.CSSProperties}>{u.initials}</span>
                  <span className="who-text">
                    <span className="who-name">{u.name}</span>
                    <span className="who-where">{here(u) ? "Here with you" : u.label ?? "Somewhere in Foundry"}</span>
                  </span>
                </button>
                {followed?.key === u.key ? (
                  <button type="button" className="who-follow is-on" onClick={() => setFollowed(null)} title="Stop following">
                    Following
                  </button>
                ) : (
                  <button type="button" className="who-follow" onClick={() => follow(u)} title={`Go wherever ${u.name} goes`}>
                    Follow
                  </button>
                )}
              </div>
            ))}
            {others.length === 0 && <p className="who-empty">Nobody else is online right now.</p>}
          </div>
        )}
      </div>
      {(nudges.length > 0 || followed) && (
        <div className="presence-toasts" aria-live="polite">
          {followed && (
            <div className="presence-follow" style={{ "--c": followed.color } as React.CSSProperties}>
              <span className="avatar" style={{ background: followed.color }}>{followed.initials}</span>
              <span>
                Following <strong>{followed.name}</strong>
                {!followedUser && <span className="presence-muted"> · offline</span>}
              </span>
              <button type="button" onClick={() => setFollowed(null)}>Stop</button>
            </div>
          )}
          {nudges.map((n) => (
            <div key={n.id} className="presence-nudge" style={{ "--c": n.color } as React.CSSProperties}>
              <span className="avatar" style={{ background: n.color }}>{n.initials}</span>
              <span><strong>{n.name}</strong> joined this page</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
