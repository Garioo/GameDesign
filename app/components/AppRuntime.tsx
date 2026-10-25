"use client";

import { useEffect } from "react";

/** Platform plumbing only: never cache authenticated workspace responses. */
export default function AppRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
        console.warn("Offline launch support is unavailable", error);
      });
    }
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty("--visible-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--visible-top", `${viewport?.offsetTop ?? 0}px`);
      // Hide the floating dock while the keyboard is occupying the viewport.
      const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
      document.documentElement.classList.toggle("keyboard-open", !!editing && window.innerHeight - (viewport?.height ?? window.innerHeight) > 120);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.classList.remove("keyboard-open");
    };
  }, []);
  return null;
}
