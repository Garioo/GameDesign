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

export interface KnownMention {
  name: string;
  userId: string;
}

/**
 * What the comment box shows while you write: mention tokens become plain
 * "@Name", and the people they point at are returned so the text can be
 * encoded again with encodeEditedMentions.
 */
export function decodeMentionsForEditing(body: string): { text: string; mentions: KnownMention[] } {
  const mentions: KnownMention[] = [];
  const text = body.replace(PERSON_MENTION_RE, (_m, name: string, userId: string) => {
    mentions.push({ name, userId });
    return `@${name}`;
  });
  return { text, mentions };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The inverse of decodeMentionsForEditing: every "@Name" of a known mention
 * (followed by the end, whitespace or punctuation) becomes its token again.
 * Longer names go first, so "@Bob Smith" wins over "@Bob".
 */
export function encodeEditedMentions(text: string, mentions: KnownMention[]): string {
  const byName = new Map<string, string>();
  for (const m of mentions) byName.set(m.name.replace(/[[\]]/g, ""), m.userId);
  const names = Array.from(byName.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`@(${names.map(escapeRe).join("|")})(?=$|[\\s.,!?;:)\\]'"’])`, "g");
  return text.replace(re, (_m, name: string) => encodePersonMention(name, byName.get(name)!));
}
