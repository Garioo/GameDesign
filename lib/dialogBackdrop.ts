import type { MouseEvent, PointerEvent } from "react";

// Per dialog element, so a re-render between press and release can't lose it.
const pressedOutside = new WeakMap<HTMLDialogElement, boolean>();

const outside = (e: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

/**
 * Props for a native modal <dialog> that closes when you click the dimmed area
 * around it — the same as Escape. Measured against the dialog's box (a click on
 * its own padding still targets the <dialog>), and only when the press also
 * started outside, so selecting text and releasing past the edge doesn't close it.
 */
export function backdropClose(close: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => { pressedOutside.set(e.currentTarget, outside(e)); },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      const wasOutside = pressedOutside.get(e.currentTarget);
      pressedOutside.delete(e.currentTarget);
      if (wasOutside && outside(e)) close();
    },
  };
}
