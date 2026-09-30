"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ensureSession, type SessionInfo } from "@/lib/session";
import { listNotifications } from "@/lib/notificationsRepo";
import { RIVER_PAGES_HREF, RIVER_PLAN_HREF } from "@/lib/beta";
import { useSitePresence, type OnlineUser } from "@/lib/useSitePresence";
import { isApple, useShortcuts, type Shortcut } from "@/lib/shortcuts";
import GlobalSearch, { type PaletteOpen, type SearchConfig } from "@/app/components/GlobalSearch";
import { SequenceHint, ShortcutHelp } from "@/app/components/KeyboardLayer";
import SettingsButton from "@/app/components/SettingsButton";
import OnlinePresence from "@/app/components/OnlinePresence";
import styles from "./river.module.css";

/* ---------------------------------------------------------------------------
 * The new design's frame: no top bar, no sidebar — three tabs on the right
 * edge (Today, Plan, Pages) and settings in the corner. Pages under /river
 * read the signed-in session from RiverContext.
 * ------------------------------------------------------------------------- */

/** Where you are, as others see it: a classic path (so everyone can follow) and a label. */
export interface Place {
  path: string;
  label: string;
}
interface RiverState {
  session: SessionInfo;
  setSession: (s: SessionInfo) => void;
  unread: number;
  setUnread: (n: number) => void;
  /** Who's online in the workspace, and where. */
  online: OnlineUser[];
  /** A screen says more precisely where you are (a page, a plan view). */
  setPlace: (p: Place) => void;
  /** A screen's additions to ⌘K (live pages, its own commands); read when the palette opens. */
  searchRef: MutableRefObject<SearchConfig | undefined>;
}
const RiverContext = createContext<RiverState | null>(null);

export function useRiver(): RiverState {
  const ctx = useContext(RiverContext);
  if (!ctx) throw new Error("useRiver must be used inside the River shell");
  return ctx;
}
/** The shell's state, or null outside it (screens shared with the classic design). */
export function useRiverOptional(): RiverState | null {
  return useContext(RiverContext);
}

// Until a screen says more, each tab is its classic counterpart.
const placeFor = (pathname: string): Place =>
  pathname.startsWith("/river/plan") ? { path: "/table", label: "Plan" }
  : pathname.startsWith("/river/pages") ? { path: "/doc", label: "Pages" }
  : { path: "/home", label: "Today" };

const TABS = [
  { key: "1", label: "Today", href: "/river", match: (p: string) => p === "/river" },
  { key: "2", label: "Plan", href: RIVER_PLAN_HREF, match: (p: string) => p.startsWith("/river/plan") },
  { key: "3", label: "Pages", href: RIVER_PAGES_HREF, match: (p: string) => p.startsWith("/river/pages") },
];

export default function RiverShell({ fontClass, children }: { fontClass: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [unread, setUnread] = useState(0);
  const [place, setPlaceAt] = useState<(Place & { at: string }) | null>(null);
  const setPlace = useCallback((p: Place) => setPlaceAt({ ...p, at: window.location.pathname }), []);
  const online = useSitePresence(session, place && place.at === pathname ? place : placeFor(pathname));

  useEffect(() => {
    let cancelled = false;
    ensureSession()
      .then((s) => {
        if (cancelled) return;
        if (!s) return router.replace("/login");
        if (!s.onboarded || !s.workspaceId) return router.replace("/onboarding");
        setSession(s);
        listNotifications(s.workspaceId)
          .then((rows) => !cancelled && setUnread(rows.filter((r) => !r.read_at).length))
          .catch(() => {});
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Overlays portal to <body>, outside .river; lend it the tokens and fonts meanwhile.
  useEffect(() => {
    const cls = [styles.tokens, ...fontClass.split(" ").filter(Boolean)];
    document.body.classList.add(...cls);
    return () => document.body.classList.remove(...cls);
  }, [fontClass]);

  // ⌘K search, like the classic dock's; it opens over whichever place you're in.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<PaletteOpen>({});
  const searchRef = useRef<SearchConfig | undefined>(undefined);
  const openSearch = (mode: PaletteOpen = {}) => {
    setSearchMode(mode);
    setSearchOpen(true);
  };
  const [helpOpen, setHelpOpen] = useState(false);
  // Decided after mount so server markup never mismatches.
  const [modKey, setModKey] = useState("⌘K");
  useEffect(() => {
    if (!isApple()) setModKey("Ctrl K");
  }, []);

  // The app-wide layer; screens register their own on top (see lib/shortcuts.ts).
  const shortcuts: Shortcut[] = [
    { id: "search", keys: "mod+k", label: "Search and commands", group: "General", palette: false, run: () => (searchOpen ? setSearchOpen(false) : openSearch()) },
    { id: "search-slash", keys: "/", label: "Search", group: "General", palette: false, run: () => openSearch() },
    { id: "commands", keys: ">", label: "Commands", group: "General", palette: false, run: () => openSearch({ query: ">" }) },
    { id: "people", keys: "@", label: "Find a person", group: "General", palette: false, run: () => openSearch({ query: "@" }) },
    { id: "assign", keys: "a", label: "Assign a task to me", group: "General", palette: false, run: () => openSearch({ picker: "assign-me" }) },
    { id: "help", keys: "?", label: "Show keyboard shortcuts", group: "General", run: () => setHelpOpen((o) => !o) },
    // 1 / 2 / 3 switch places.
    ...TABS.map((t) => ({
      id: `go-river-${t.key}`,
      keys: t.key,
      label: `Go to ${t.label}`,
      group: "Navigation",
      enabled: !t.match(pathname),
      run: () => router.push(t.href),
    })),
  ];
  useShortcuts(shortcuts);

  return (
    <div className={`${styles.river} ${fontClass}`}>
      <span className={styles.brand}>Foundry</span>
      <nav className={styles.tabs} aria-label="Places">
        <button type="button" className={`${styles.tab} ${styles.tabSearch}`} onClick={() => openSearch()} aria-label={`Search (${modKey})`} title={`Search (${modKey})`}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className={styles.tabKey}>{modKey}</span>
        </button>
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className={`${styles.tab} ${t.match(pathname) ? styles.tabOn : ""}`} aria-current={t.match(pathname) ? "page" : undefined}>
            <span className={styles.tabKey}>{t.key}</span>
            {t.label}
            {t.label === "Today" && unread > 0 && <b className={styles.tabBadge}>{unread}</b>}
          </Link>
        ))}
      </nav>
      {session && (
        <div className={styles.presence}>
          <OnlinePresence online={online} selfKey={session.userId} />
        </div>
      )}
      <div className={styles.corner}>{session && <SettingsButton session={session} onSessionChange={setSession} />}</div>
      {session ? (
        <RiverContext.Provider value={{ session, setSession, unread, setUnread, online, setPlace, searchRef }}>{children}</RiverContext.Provider>
      ) : (
        <div className={styles.loading} aria-busy="true">Loading…</div>
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} config={searchOpen ? searchRef.current : undefined} initial={searchMode} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SequenceHint />
    </div>
  );
}
