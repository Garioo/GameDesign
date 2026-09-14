"use client";

import { useEffect, useState } from "react";
import DocumentLinks from "@/app/components/DocumentLinks";
import type { DocumentLink } from "@/lib/documentLinks";
import { addDocumentLink, listDocumentLinks, removeDocumentLink } from "@/lib/documentLinksRepo";
import { useSidebarLiveUpdates } from "@/lib/useSidebarLiveUpdates";

export default function LinkedDocuments({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [links, setLinks] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    try { setLinks(await listDocumentLinks(workspaceId)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load linked documents."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    listDocumentLinks(workspaceId).then(data => { if (!cancelled) { setLinks(data); setError(""); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);
  useSidebarLiveUpdates(workspaceId, ["document_links"], refresh);
  async function change(next: DocumentLink[]) {
    if (!canEdit) throw new Error("Editor access is required to change links.");
    const added = next.find(item => !links.some(link => link.id === item.id));
    if (added) {
      const saved = await addDocumentLink(workspaceId, added);
      setLinks(prev => prev.some(link => link.id === saved.id) ? prev : [...prev, saved]);
    } else {
      const removed = links.find(link => !next.some(item => item.id === link.id));
      if (removed) { await removeDocumentLink(workspaceId, removed.id); setLinks(prev => prev.filter(link => link.id !== removed.id)); }
    }
    setError("");
  }
  return <div className="linked-documents-sidebar">
    {loading ? <p role="status">Loading linked documents…</p> : <DocumentLinks links={links} onChange={canEdit ? change : undefined} />}
    {error && <p className="document-link-error" role="alert">{error} <button type="button" onClick={refresh}>Retry</button></p>}
  </div>;
}
