"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import GlobalSearch, { type SearchConfig } from "./GlobalSearch";
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

const ITEMS: { id: string; label: string; href?: string; Icon: ComponentType<IconProps> }[] = [
  { id: "home", label: "Home", href: "/home", Icon: HomeIcon },
  { id: "work", label: "My Work", href: "/work", Icon: CheckIcon },
  { id: "pages", label: "Pages", href: "/doc", Icon: Doc },
  { id: "canvas", label: "Canvas", href: "/doc/canvas", Icon: Grid },
  { id: "board", label: "Board", href: "/board", Icon: Columns },
  { id: "calendar", label: "Calendar", href: "/calendar", Icon: CalendarIcon },
  { id: "table", label: "Gantt", href: "/table", Icon: TableIcon },
];

function activeFromPath(path: string): string {
  if (path.startsWith("/doc/canvas")) return "canvas";
  if (path.startsWith("/doc")) return "pages";
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/table")) return "table";
  if (path.startsWith("/board")) return "board";
  if (path.startsWith("/home")) return "home";
  if (path.startsWith("/work")) return "work";
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
  // "⌘K" on Apple devices, "Ctrl K" elsewhere. Decided after mount so the
  // server-rendered markup (which can't know the platform) never mismatches.
  const [shortcut, setShortcut] = useState("⌘K");
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    if (!/mac|iphone|ipad|ipod/i.test(platform)) setShortcut("Ctrl K");
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            <button className="dock-search" onClick={() => setSearchOpen(true)} aria-label={`Search (${shortcut})`}>
              <SearchIcon className="dock-search-icon" />
              <kbd className="kbd">{shortcut}</kbd>
            </button>
            <span className="dock-divider" />
            {ITEMS.map(({ id, label, href, Icon }) => (
              <button
                key={id}
                className={"dock-item" + (id === active ? " is-active" : "")}
                onClick={href && id !== active ? () => router.push(href + (planningBoardId && (id==='board'||id==='table'||id==='calendar') ? `?board=${encodeURIComponent(planningBoardId)}` : '')) : undefined}
              >
                <Icon className="dock-icon" /> {label}
              </button>
            ))}
            {onNew && (
              <button className="dock-new" onClick={onNew}>
                <Plus className="dock-new-icon" /> {newLabel}
              </button>
            )}
          </div>
        ) : (
          <div key="tools" className="dock-row">
            {tools}
          </div>
        )}
      </nav>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} config={search} />
      {tools && (
        <div className="dock-hint" title="Menu" onMouseEnter={() => setNavHover(true)}>
          <span className="dock-hint-bar" />
        </div>
      )}
    </div>
  );
}
