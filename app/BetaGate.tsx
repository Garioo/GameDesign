"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { classicPathFor, riverPathFor, useRiverBeta } from "@/lib/beta";

/** Sends each page to its counterpart when the new design (River) is switched on or off in Settings. */
export default function BetaGate() {
  const on = useRiverBeta();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const inRiver = pathname === "/river" || pathname.startsWith("/river/");
    if (on && !inRiver) {
      const target = riverPathFor(pathname, new URLSearchParams(search.toString()));
      if (target) router.replace(target);
    } else if (!on && inRiver) {
      router.replace(classicPathFor(pathname, new URLSearchParams(search.toString())));
    }
  }, [on, pathname, search, router]);

  return null;
}
