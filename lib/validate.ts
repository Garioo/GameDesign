/* ---------------------------------------------------------------------------
 * Input validation for the repo layer.
 *
 * Every user-typed value passes through here before it is written to
 * Supabase: text fields are trimmed and length-capped, structured payloads
 * (canvas scenes, block content) are byte-capped. These limits mirror the
 * CHECK constraints in supabase/security.sql — the database is the real
 * enforcement; this layer exists to fail fast with a readable message.
 * ------------------------------------------------------------------------- */

export const LIMITS = {
  name: 120, // workspace / section / canvas names
  title: 300, // page titles
  tagline: 300,
  genre: 60,
  summary: 2000,
  profileName: 80,
  initials: 4,
  role: 60,
  comment: 5000,
  tag: 60,
  tagCount: 20,
  blockCount: 500, // blocks per page
  blockBytes: 2_000_000, // per-block content (media blocks carry data URLs)
  sceneBytes: 4_000_000, // whole tldraw scene JSON
} as const;

/** Matches the profiles.color CHECK constraint (#rrggbb). */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** GitHub "owner/repo" — the only shape lib/github.ts ever requests. */
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Trim and enforce a maximum length. Empty results are allowed. */
export function cleanText(value: string, max: number, label: string): string {
  const text = value.trim();
  if (text.length > max) {
    throw new ValidationError(`${label} is too long (max ${max} characters)`);
  }
  return text;
}

/** JSON-encoded byte size of an arbitrary payload. */
export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Reject structured payloads above the byte budget. */
export function assertMaxBytes(value: unknown, max: number, label: string): void {
  if (byteSize(value) > max) {
    throw new ValidationError(`${label} is too large (max ${Math.round(max / 1_000_000)} MB)`);
  }
}
