import type { SVGProps } from "react";

// Shared stroke icons (lucide paths) for inline UI: close buttons, link
// arrows, "+ Add" buttons. Sized in em so they drop in where a text glyph
// used to be and follow the surrounding font size.
const paths = {
  close: ["M18 6 6 18", "m6 6 12 12"],
  plus: ["M12 5v14", "M5 12h14"],
  check: ["M20 6 9 17l-5-5"],
  trash: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  external: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  arrowUp: ["m5 12 7-7 7 7", "M12 19V5"],
  arrowDown: ["M12 5v14", "m19 12-7 7-7-7"],
  arrowUpRight: ["M7 17 17 7", "M7 7h10v10"],
  cornerLeftUp: ["M14 9 9 4 4 9", "M20 20h-7a4 4 0 0 1-4-4V4"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  comment: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
  pencil: ["M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z", "m15 5 4 4"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8", "M8 17h6"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  logOut: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
} as const;

export type IconName = keyof typeof paths;

export default function Icon({ name, style, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", verticalAlign: "-0.125em", ...style }}
      {...props}
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
