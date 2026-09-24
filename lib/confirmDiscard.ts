/** Ask before a form with unsaved edits is closed; true when it's fine to go. */
export function confirmDiscard(dirty: boolean, what = "your changes"): boolean {
  return !dirty || window.confirm(`Discard ${what}? They haven't been saved.`);
}

/** Order-insensitive equality for id / tag lists. */
export function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
