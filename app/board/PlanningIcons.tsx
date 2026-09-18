import type { SVGProps } from "react";
type Name =
  | "plus"
  | "menu"
  | "more"
  | "search"
  | "close"
  | "grip"
  | "board"
  | "timeline"
  | "arrowLeft"
  | "arrowRight";
const paths: Record<Name, string> = {
  plus: "M12 5v14M5 12h14",
  menu: "M4 5h16v14H4zM9 5v14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "m6 6 12 12M6 18 18 6",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  board: "M4 4h6v16H4zM14 4h6v11h-6z",
  timeline: "M3 6h12v4H3zM9 14h12v4H9z",
  arrowLeft: "m14 6-6 6 6 6",
  arrowRight: "m10 6 6 6-6 6",
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
