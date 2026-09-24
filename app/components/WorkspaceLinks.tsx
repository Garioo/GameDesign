"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { BRAND_PATHS } from "./brandIcons";
import {
  WORKSPACE_LINK_KINDS,
  getWorkspaceLinks,
  updateWorkspaceLinks,
  type WorkspaceLinkKind,
  type WorkspaceLinks as Links,
} from "@/lib/settingsRepo";
import styles from "./WorkspaceLinks.module.css";

const INFO: Record<WorkspaceLinkKind, { name: string; color: string; placeholder: string }> = {
  discord: { name: "Discord", color: "#5865F2", placeholder: "https://discord.gg/…" },
  overleaf: { name: "Overleaf", color: "#47A141", placeholder: "https://www.overleaf.com/project/…" },
  drive: { name: "Google Drive", color: "#4285F4", placeholder: "https://drive.google.com/drive/folders/…" },
  github: { name: "GitHub", color: "#181717", placeholder: "https://github.com/owner/repo" },
};

function BrandIcon({ kind }: { kind: WorkspaceLinkKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path d={BRAND_PATHS[kind]} fill="currentColor" />
    </svg>
  );
}

/** The team's Discord, Overleaf, Drive and GitHub as icons in the top bar; the pencil sets them. */
export default function WorkspaceLinks({ workspaceId }: { workspaceId: string }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Links>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getWorkspaceLinks(workspaceId).then((l) => active && setLinks(l)).catch(() => active && setLinks({}));
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!links) return null;
  const set = WORKSPACE_LINK_KINDS.filter((k) => links[k]);

  function toggle() {
    if (!open) { setDraft(links ?? {}); setError(""); }
    setOpen((o) => !o);
  }
  async function save() {
    setSaving(true); setError("");
    try {
      await updateWorkspaceLinks(workspaceId, draft);
      setLinks(await getWorkspaceLinks(workspaceId));
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the links."); }
    finally { setSaving(false); }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {set.map((k) => (
        <a key={k} className={styles.link} href={links[k]} target="_blank" rel="noopener noreferrer"
          title={INFO[k].name} aria-label={`Open ${INFO[k].name}`} style={{ "--brand": INFO[k].color } as React.CSSProperties}>
          <BrandIcon kind={k} />
        </a>
      ))}
      <button type="button" className={`${styles.link} ${styles.edit}${set.length ? "" : ` ${styles.empty}`}`} aria-expanded={open}
        title={set.length ? "Edit team links" : "Add team links"} aria-label={set.length ? "Edit team links" : "Add team links"} onClick={toggle}>
        <Icon name={set.length ? "pencil" : "link"} />{!set.length && <span>Links</span>}
      </button>
      {open && (
        <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className={styles.head}>Team links</p>
          {WORKSPACE_LINK_KINDS.map((k) => (
            <label key={k} className={styles.field} style={{ "--brand": INFO[k].color } as React.CSSProperties}>
              <BrandIcon kind={k} />
              <span className={styles.srOnly}>{INFO[k].name}</span>
              <input type="text" inputMode="url" value={draft[k] ?? ""} placeholder={INFO[k].placeholder} disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
            </label>
          ))}
          <p className={styles.hint}>Everyone in the workspace sees these. Leave a field empty to hide its icon.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
