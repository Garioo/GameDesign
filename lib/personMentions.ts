/* ---------------------------------------------------------------------------
 * Shared helpers for @-mentioning a person in a plain-text comment body.
 * A mention is stored inline as `@[Display Name](user:<uuid>)` — the same
 * bracket-link shape as everywhere else in this codebase encodes a rich
 * reference in plain text. supabase/migrate-notifications.sql's mention
 * trigger extracts the uuid with the same pattern to notify that person.
 * ------------------------------------------------------------------------- */

/** Matches one mention token; group 1 is the label, group 2 the user id. */
export const PERSON_MENTION_RE = /@\[([^\]]+)\]\(user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

export function encodePersonMention(name: string, userId: string): string {
  return `@[${name.replace(/[[\]]/g, "")}](user:${userId})`;
}

export interface MentionSegment {
  text: string;
  mention?: { name: string; userId: string };
}

/** Split a comment body into plain-text and mention segments for rendering. */
export function splitPersonMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(PERSON_MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ text: body.slice(last, start) });
    segments.push({ text: `@${m[1]}`, mention: { name: m[1], userId: m[2] } });
    last = start + m[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}

/**
 * If the caret sits right after an in-progress "@partial" token (not part of
 * an already-completed mention), return the partial name typed so far and
 * where it starts — so the composer can show/filter the autocomplete list.
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const between = before.slice(at + 1);
  if (/[\s@]/.test(between)) return null; // whitespace or another "@" breaks the token
  if (between.includes("(")) return null; // already inside a finished token
  return { start: at, query: between };
}
