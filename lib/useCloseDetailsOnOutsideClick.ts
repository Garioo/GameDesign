"use client";

import { useEffect } from "react";

/**
 * Closes every open native <details> dropdown/overflow menu on the page when a pointerdown
 * lands outside it. All of the app's board/gantt menus (`planning-menu`, `planning-overflow`,
 * `gantt-menu`, `stage-header-menu`, `timeline-row-menu`, `timeline-saved-views`) are plain
 * uncontrolled <details><summary> panels with no other close-on-outside-click behavior, so one
 * global listener covers them all rather than wiring a ref to each instance. A click inside an
 * open menu's own summary or panel is inside that element, so it's left alone — the browser's
 * native toggle still handles closing a menu via its own summary.
 */
export function useCloseDetailsOnOutsideClick() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      document.querySelectorAll("details[open]").forEach((el) => {
        if (!el.contains(target)) el.removeAttribute("open");
      });
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
}
