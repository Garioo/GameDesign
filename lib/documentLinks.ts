export interface DocumentLink { id: string; title: string; url: string; }

export function documentProvider(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "docs.google.com") {
      if (parsed.pathname.startsWith("/document/")) return "Google Docs";
      if (parsed.pathname.startsWith("/spreadsheets/")) return "Google Sheets";
      if (parsed.pathname.startsWith("/presentation/")) return "Google Slides";
      if (parsed.pathname.startsWith("/forms/")) return "Google Forms";
    }
    if (parsed.hostname === "drive.google.com") return "Google Drive";
    return parsed.hostname.replace(/^www\./, "");
  } catch { return "Document"; }
}

export function documentUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Paste a complete https:// document link."); }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) {
    throw new Error("Use an HTTPS link without a username or password.");
  }
  return url.href;
}

export function validateDocumentLinks(links: DocumentLink[]): DocumentLink[] {
  if (!Array.isArray(links) || links.length > 30) throw new Error("Add up to 30 document links.");
  return links.map(link => {
    const url = documentUrl(link.url);
    const title = link.title.trim().slice(0, 160) || documentProvider(url);
    return { id: link.id, title, url };
  });
}
