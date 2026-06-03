import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
