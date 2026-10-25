"use client";

import { useEffect } from "react";

let locks = 0;
let bodyOverflow = "";
let rootOverflow = "";

/** Keep touch scrolling inside open overlays, including nested overlays. */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    if (locks++ === 0) {
      bodyOverflow = document.body.style.overflow;
      rootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0) {
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.overflow = rootOverflow;
      }
    };
  }, [locked]);
}
