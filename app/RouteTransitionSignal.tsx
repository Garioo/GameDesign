"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { finishViewTransition } from "@/lib/viewTransition";

/**
 * Tells a pending view transition (lib/viewTransition.ts) that the new route
 * has rendered. Lives in the root layout so it fires on every route change —
 * including pages still showing their loading screen — instead of leaving the
 * old page frozen until the timeout.
 */
export default function RouteTransitionSignal() {
  const pathname = usePathname();
  useEffect(() => {
    finishViewTransition();
  }, [pathname]);
  return null;
}
