import { useSyncExternalStore } from "react";

/* Browser connectivity as React state. navigator.onLine only knows about the
 * network link (not whether Supabase is reachable), so treat `true` as
 * "worth trying" and let failed requests speak for themselves. */

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // server render: assume online
  );
}
