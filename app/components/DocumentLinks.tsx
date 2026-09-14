"use client";

import { useId, useState } from "react";
import { documentProvider, documentUrl, type DocumentLink } from "@/lib/documentLinks";
import "./document-links.css";

export default function DocumentLinks({ links, onChange, disabled = false }: {
  links: DocumentLink[]; onChange?: (links: DocumentLink[]) => Promise<void>; disabled?: boolean;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  disabled = disabled || busy;
  async function add() {
    setBusy(true);
    try {
      const normalized = documentUrl(url);
      if (links.some(link => link.url === normalized)) throw new Error("This link is already attached.");
      await onChange?.([...links, { id: crypto.randomUUID(), title: title.trim() || documentProvider(normalized), url: normalized }]);
      setUrl(""); setTitle(""); setError(""); setAdding(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add link."); }
    finally { setBusy(false); }
  }
  async function remove(link: DocumentLink) {
    setBusy(true); setError("");
    try { await onChange?.(links.filter(item => item.id !== link.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove link."); }
    finally { setBusy(false); }
  }
  return <section className="document-links" aria-label="Attached documents">
    <div className="document-links-head"><strong>Documents & links</strong>{onChange && <button type="button" disabled={disabled} onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add link"}</button>}</div>
    {links.map(link => <div className="document-link" key={link.id}>
      <a href={(() => { try { return documentUrl(link.url); } catch { return undefined; } })()} target="_blank" rel="noopener noreferrer"><span>{link.title}</span><small>{documentProvider(link.url)} ↗</small></a>
      {onChange && <button type="button" disabled={disabled} aria-label={`Remove ${link.title}`} onClick={() => remove(link)}>×</button>}
    </div>)}
    {!links.length && !adding && <p>Add Google Docs, Sheets, Slides, or another shared link.</p>}
    {adding && <div className="document-link-fields">
      <label htmlFor={`${id}-url`}>Document link</label>
      <input id={`${id}-url`} type="url" placeholder="https://docs.google.com/…" value={url} disabled={disabled} onChange={e => setUrl(e.target.value)} />
      <label htmlFor={`${id}-title`}>Name (optional)</label>
      <input id={`${id}-title`} maxLength={160} value={title} disabled={disabled} placeholder="Design brief" onChange={e => setTitle(e.target.value)} />
      <p>Opens in a new tab. Access follows the document’s sharing settings.</p>
      <button type="button" disabled={disabled || !url.trim()} onClick={add}>Attach link</button>
    </div>}
    {error && <p role="alert" className="document-link-error">{error}</p>}
  </section>;
}
