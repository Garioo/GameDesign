import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Single-family typography: Hanken Grotesk everywhere. Headings differ by
// size/weight only. --font-display still exists as an alias of --font-ui
// (set in globals.css) so heading rules stay re-skinnable.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "Game Design System",
  description: "A collaborative game design system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={hanken.variable}>
      <body>{children}</body>
    </html>
  );
}
