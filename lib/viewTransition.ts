/* ---------------------------------------------------------------------------
 * Animated route changes with the browser's View Transitions API.
 *
 * Next's client navigation is a same-document update, so the transition is
 * started by hand: the browser snapshots the old page, we push the route, and
 * the new page is revealed once it has rendered — signalled by the dock (on
 * every signed-in page) calling finishViewTransition() when the path changes.
 * A timeout reveals it anyway if that signal never comes (a page without the
 * dock, a slow chunk). The animations themselves live in
 * app/components/chrome.css. Browsers without the API, and people who prefer
 * reduced motion, just navigate.
 * ------------------------------------------------------------------------- */

type Router = { push: (href: string) => void };
type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };

/** Longest the old page stays frozen while the new one loads. */
const MAX_WAIT_MS = 700;

let reveal: (() => void) | null = null;

export function navigateWithTransition(router: Router, href: string): void {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    router.push(href);
    return;
  }
  reveal?.(); // a transition still waiting: let it finish before starting another
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const done = () => {
          if (reveal === done) reveal = null;
          resolve();
        };
        reveal = done;
        setTimeout(done, MAX_WAIT_MS);
        router.push(href);
      }),
  );
}

/** The new route has rendered: let the pending transition animate in. */
export function finishViewTransition(): void {
  // One frame later, so the new page has painted its first layout.
  if (reveal) requestAnimationFrame(() => reveal?.());
}
