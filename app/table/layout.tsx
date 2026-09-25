import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gantt" };

export default function TableLayout({ children }: { children: React.ReactNode }) {
  return children;
}
