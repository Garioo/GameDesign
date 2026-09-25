import type { Metadata } from "next";

// Nested under /doc, whose title replaces the root template, so spell the full title out.
export const metadata: Metadata = { title: { absolute: "Canvas · Foundry" } };

export default function DocCanvasLayout({ children }: { children: React.ReactNode }) {
  return children;
}
