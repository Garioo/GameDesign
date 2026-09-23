"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { navigateWithTransition } from "@/lib/viewTransition";
import { useShortcuts, type Shortcut } from "@/lib/shortcuts";
import GlobalSearch, { type PaletteOpen, type SearchConfig } from "./GlobalSearch";
import { SequenceHint, ShortcutHelp } from "./KeyboardLayer";
import "./chrome.css";

type IconProps = { className?: string };

const HomeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
const Doc = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
const Grid = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const Columns = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" />
  </svg>
);
const TableIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h5M10 12h7M7 17h7" />
  </svg>
);
const CalendarIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2" />
  </svg>
);
const CheckIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
  </svg>
);
const FlagIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" />
  </svg>
);
const SearchIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);
const Plus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** `go` is the second key of its "g …" shortcut. */
const ITEMS: { id: string; label: string; href?: string; go: string; Icon: ComponentType<IconProps> }[] = [
  { id: "home", label: "Home", href: "/home", go: "h", Icon: HomeIcon },
  { id: "work", label: "My Work", href: "/work", go: "w", Icon: CheckIcon },
  { id: "pages", label: "Pages", href: "/doc", go: "p", Icon: Doc },
  { id: "canvas", label: "Canvas", href: "/doc/canvas", go: "c", Icon: Grid },
  { id: "board", label: "Board", href: "/board", go: "b", Icon: Columns },
  { id: "calendar", label: "Calendar", href: "/calendar", go: "l", Icon: CalendarIcon },
  { id: "table", label: "Gantt", href: "/table", go: "t", Icon: TableIcon },
  { id: "milestones", label: "Milestones", href: "/milestones", go: "m", Icon: FlagIcon },
];


function activeFromPath(path: string): string {
  if (path.startsWith("/doc/canvas")) return "canvas";
  if (path.startsWith("/doc")) return "pages";
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/table")) return "table";
  if (path.startsWith("/board")) return "board";
  if (path.startsWith("/home")) return "home";
  if (path.startsWith("/work")) return "work";
  if (path.startsWith("/milestones")) return "milestones";
  return "";
}

interface DockProps {
  planningBoardId?: string;
  /** Route-specific additions to the ⌘K search (live pages, extra commands). */
  search?: SearchConfig;
  /** "New" action; the button is hidden when omitted. */
  onNew?: () => void;
  newLabel?: string;
  /** Page tools (e.g. tldraw tools on the canvas). When given they show by
      default and the app nav swaps in while hovering the hint strip. */
  tools?: ReactNode;
}

export default function Dock({ search, onNew, newLabel = "New", tools, planningBoardId }: DockProps) {
  const router = useRouter();
  const pathname = usePathname();
  const active = activeFromPath(pathname);

  // ⌘K / Ctrl-K toggles the search on every route that shows the dock.
  const [searchOpen, setSearchOpen] = useState(false);
  // How the palette opens: plain, prefilled ("@", ">"), or straight into a picker.
  const [searchMode, setSearchMode] = useState<PaletteOpen>({});
  const openSearch = (mode: PaletteOpen = {}) => {
    setSearchMode(mode);
    setSearchOpen(true);
  };
  const [helpOpen, setHelpOpen] = useState(false);
  // "⌘K" on Apple devices, "Ctrl K" elsewhere. Decided after mount so the
  // server-rendered markup (which can't know the platform) never mismatches.
  const [shortcut, setShortcut] = useState("⌘K");
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    if (!/mac|iphone|ipad|ipod/i.test(platform)) setShortcut("Ctrl K");
  }, []);
  const hrefFor = (id: string, href: string) =>
    href + (planningBoardId && (id === "board" || id === "table" || id === "calendar") ? `?board=${encodeURIComponent(planningBoardId)}` : "");

  // The app-wide layer; pages register their own on top (see lib/shortcuts.ts).
  const shortcuts: Shortcut[] = [
    { id: "search", keys: "mod+k", label: "Search and commands", group: "General", palette: false, run: () => (searchOpen ? setSearchOpen(false) : openSearch()) },
    { id: "search-slash", keys: "/", label: "Search", group: "General", palette: false, run: () => openSearch() },
    { id: "commands", keys: ">", label: "Commands", group: "General", palette: false, run: () => openSearch({ query: ">" }) },
    { id: "people", keys: "@", label: "Find a person", group: "General", palette: false, run: () => openSearch({ query: "@" }) },
    { id: "assign", keys: "a", label: "Assign a task to me", group: "General", palette: false, run: () => openSearch({ picker: "assign-me" }) },
    { id: "help", keys: "?", label: "Show keyboard shortcuts", group: "General", run: () => setHelpOpen((o) => !o) },
    ...ITEMS.filter((it) => it.href).map((it) => ({
      id: `go-${it.id}`,
      keys: `g ${it.go}`,
      label: `Go to ${it.label}`,
      group: "Navigation",
      enabled: it.id !== active,
      run: () => navigateWithTransition(router, hrefFor(it.id, it.href!)),
    })),
    { id: "go-digest", keys: "g d", label: "Go to Weekly digest", group: "Navigation", enabled: pathname !== "/digest", run: () => navigateWithTransition(router, "/digest") },
    ...(onNew ? [{ id: "dock-new", keys: "n", label: newLabel === "New" ? "Create new" : newLabel, group: "General", run: onNew }] : []),
  ];
  useShortcuts(shortcuts);

  const [navHover, setNavHover] = useState(false);
  const navRevert = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grace period: brief mouse excursions outside the bar don't snap it back.
  const cancelNavRevert = () => {
    if (navRevert.current) {
      clearTimeout(navRevert.current);
      navRevert.current = null;
    }
  };
  const scheduleNavRevert = () => {
    cancelNavRevert();
    navRevert.current = setTimeout(() => setNavHover(false), 600);
  };

  const showNav = !tools || navHover;


  return (
    <div
      className={"dock-wrap" + (navHover ? " is-nav" : "") + (tools ? "" : " no-hint")}
      onMouseEnter={tools ? cancelNavRevert : undefined}
      onMouseLeave={tools ? scheduleNavRevert : undefined}
    >
      <nav className="dock">
        {showNav ? (
          <div key="nav" className="dock-row dock-nav">
            <button data-tip className="dock-search" onClick={() => openSearch()} aria-label={`Search (${shortcut})`}>
              <SearchIcon className="dock-search-icon" />
              <kbd className="kbd dock-label">{shortcut}</kbd>
            </button>
            <span className="dock-divider" />
            {ITEMS.map(({ id, label, href, go, Icon }) => (
              <button
                key={id}
                data-tip
                className={"dock-item" + (id === active ? " is-active" : "")}
                onClick={href && id !== active ? () => navigateWithTransition(router, hrefFor(id, href)) : undefined}
              >
                <Icon className="dock-icon" />{" "}
                <span className="dock-label">
                  {label}
                  {id !== active && <kbd className="dock-kbd" aria-hidden="true">G {go.toUpperCase()}</kbd>}
                </span>
              </button>
            ))}
            {onNew && (
              <button data-tip className="dock-new" onClick={onNew}>
                <Plus className="dock-new-icon" /> <span className="dock-label">{newLabel}</span>
              </button>
            )}
          </div>
        ) : (
          <div key="tools" className="dock-row">
            {tools}
          </div>
        )}
      </nav>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} config={search} initial={searchMode} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SequenceHint />
      {tools && (
        <div className="dock-hint" title="Menu" onMouseEnter={() => setNavHover(true)}>
          <span className="dock-hint-bar" />
        </div>
      )}
    </div>
  );
}
