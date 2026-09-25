import type { Metadata } from "next";

export const metadata: Metadata = { title: "Weekly digest" };

export default function DigestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
