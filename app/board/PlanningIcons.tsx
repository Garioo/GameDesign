import type { SVGProps } from "react";
type Name =
  | "plus"
  | "menu"
  | "more"
  | "search"
  | "close"
  | "grip"
  | "board"
  | "calendar"
  | "timeline"
  | "arrowLeft"
  | "arrowRight"
  | "repeat";
const paths: Record<Name, string> = {
  plus: "M12 5v14M5 12h14",
  menu: "M4 5h16v14H4zM9 5v14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "m6 6 12 12M6 18 18 6",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  board: "M4 4h6v16H4zM14 4h6v11h-6z",
  calendar: "M3 5h18v16H3zM7 3v4M17 3v4M3 11h18M7 15h2M15 15h2",
  timeline: "M3 6h12v4H3zM9 14h12v4H9z",
  arrowLeft: "m14 6-6 6 6 6",
  arrowRight: "m10 6 6 6-6 6",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
};
export function PlanningIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: Name }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
