"use client";

import { useEffect, useState } from "react";

export default function InstallHelp() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(query.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (installed) return null;
  return (
    <details className="install-help">
      <summary>Use Foundry as an iPhone app</summary>
      <p>Open Foundry in Safari, tap Share, then Add to Home Screen. If shown, keep Open as Web App enabled, then tap Add.</p>
      <p>Launch Foundry from its home-screen icon. You may need to sign in again. An internet connection is needed to load your workspace.</p>
    </details>
  );
}
