import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import RouteTransitionSignal from "./RouteTransitionSignal";

// Single-family typography: Hanken Grotesk everywhere. Headings differ by
// size/weight only. --font-display still exists as an alias of --font-ui
// (set in globals.css) so heading rules stay re-skinnable.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  // Each section's layout sets its own title, so the tab reads e.g. "Calendar · Foundry".
  title: { default: "Foundry", template: "%s · Foundry" },
  description: "A shared workspace for your team's docs, canvases, boards and plans.",
};

// Tint browser chrome (Safari window band, mobile status bar) to the app's
// parchment instead of letting the browser guess a color.
export const viewport: Viewport = {
  themeColor: "#f6f1e9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={hanken.variable}>
      <body>
        {children}
        <RouteTransitionSignal />
      </body>
    </html>
  );
}
