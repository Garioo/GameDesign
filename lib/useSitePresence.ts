"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * Who's online in the workspace, and where. Every page joins the same
 * presence channel and tracks the current user with the place they're looking
 * at (a path to link to and a short label), so the top bar can list everyone
 * online anywhere in the app and jump to where they are.
 * ------------------------------------------------------------------------- */

export interface OnlineUser {
  key: string; // profile id
  name: string;
  initials: string;
  color: string;
  /** Where they are: an in-app path, and a label such as "Week 3 · Pages". */
  path?: string;
  label?: string;
}

interface Me {
  workspaceId: string;
  userId: string;
  name: string;
  initials: string;
  color: string;
}
type Tracked = OnlineUser & { at: number };

export function useSitePresence(me: Me | null, where: { path: string; label: string }): OnlineUser[] {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const whereRef = useRef(where);
  whereRef.current = where;

  const payload = (): Tracked | null =>
    me && {
      key: me.userId,
      name: me.name,
      initials: me.initials,
      color: me.color,
      path: whereRef.current.path,
      label: whereRef.current.label,
      at: Date.now(),
    };

  const wsId = me?.workspaceId;
  const identity = me ? `${me.userId}|${me.name}|${me.initials}|${me.color}` : "";
  useEffect(() => {
    if (!wsId || !identity) return;
    const channel = supabase.channel(`presence:${wsId}`, { config: { presence: { key: identity.split("|")[0] } } });
    channel
      .on("presence", { event: "sync" }, () => {
        // One entry per person: with several tabs open, the most recently moved one wins.
        const latest = new Map<string, Tracked>();
        for (const metas of Object.values(channel.presenceState<Tracked>())) {
          for (const m of metas) {
            const prev = latest.get(m.key);
            if (!prev || (m.at ?? 0) > (prev.at ?? 0)) latest.set(m.key, m);
          }
        }
        setUsers([...latest.values()].map(({ at: _at, ...u }) => u));
      })
      .subscribe(async (status) => {
        const p = payload();
        if (status === "SUBSCRIBED" && p) await channel.track(p);
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setUsers([]);
      supabase.removeChannel(channel);
    };
    // payload reads the latest identity/location through refs and props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, identity]);

  // Moving around (another page, board, canvas…) updates what others see.
  useEffect(() => {
    const p = payload();
    if (p) channelRef.current?.track(p).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where.path, where.label]);

  // Until the first sync (or when realtime is down), at least show yourself.
  if (users.length === 0 && me) {
    return [{ key: me.userId, name: me.name, initials: me.initials, color: me.color, path: where.path, label: where.label }];
  }
  return users;
}
