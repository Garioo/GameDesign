import type { Metadata } from "next";
import { Epilogue, Geist } from "next/font/google";
import RiverShell from "./RiverShell";

export const metadata: Metadata = { title: "Today" };

// The new design (beta) reads with Geist and uses Epilogue only for big headings.
const geist = Geist({ subsets: ["latin"], variable: "--river-ui" });
const epilogue = Epilogue({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--river-display" });

export default function RiverLayout({ children }: { children: React.ReactNode }) {
  return <RiverShell fontClass={`${geist.variable} ${epilogue.variable}`}>{children}</RiverShell>;
}
