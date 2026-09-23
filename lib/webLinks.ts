/* ---------------------------------------------------------------------------
 * Web links in page text (app/doc/BlockEditor.tsx): which hrefs are allowed,
 * and turning pasted plain text into inline HTML with its URLs linked.
 * ------------------------------------------------------------------------- */

// Only http(s) and mailto links survive; javascript:, data: and friends are
// dropped. A bare "www.example.com" is read as https.
export function safeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  if (/^www\./i.test(value)) return safeLinkHref(`https://${value}`);
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.href : null;
  } catch {
    return null;
  }
}
const URL_IN_TEXT_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Plain text → inline HTML with every URL turned into a link (for paste). */
export function linkifyText(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(URL_IN_TEXT_RE)) {
    const start = m.index ?? 0;
    // Sentence punctuation right after a URL isn't part of it.
    const url = m[0].replace(/[.,;:!?)\]'"]+$/, "");
    const href = safeLinkHref(url);
    out += escapeHtml(text.slice(last, start));
    out += href ? `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>` : escapeHtml(url);
    last = start + url.length;
  }
  return (out + escapeHtml(text.slice(last))).replace(/\r?\n/g, "<br>");
}
