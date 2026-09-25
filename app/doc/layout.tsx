import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pages" };

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return children;
}
