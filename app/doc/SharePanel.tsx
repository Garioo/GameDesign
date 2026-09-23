"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPageShare,
  listPageShares,
  revokePageShare,
  setShareComments,
  shareUrl,
  type PageShare,
} from "@/lib/pageSharesRepo";
import styles from "./SharePanel.module.css";

/**
 * The page's Share button: copy the link for workspace members, or (editors)
 * make a guest link that opens only this page — read, plus comments if allowed.
 */
export default function SharePanel({ pageId, canEdit }: { pageId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<PageShare[] | null>(null);
  const [allowComments, setAllowComments] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Load the page's guest links whenever the panel opens.
  useEffect(() => {
    if (!open || !canEdit) return;
    setError("");
    setConfirmRevoke(null);
    listPageShares(pageId).then(setShares).catch((e) => {
      setShares([]);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [open, canEdit, pageId]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      setError("Couldn’t copy — select the link and copy it yourself.");
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const s = await createPageShare(pageId, allowComments);
      setShares((list) => [s, ...(list ?? [])]);
      await copy(shareUrl(s.token), s.id);
    });

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button type="button" className="share-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        Share
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Share this page" data-shortcuts-ok="">
          <section className={styles.block}>
            <h3>Workspace members</h3>
            <p className={styles.fine}>Everyone in the workspace can open this page with its link.</p>
            <button type="button" className={styles.secondary} onClick={() => copy(window.location.href, "members")}>
              {copied === "members" ? "Link copied ✓" : "Copy page link"}
            </button>
          </section>

          <section className={styles.block}>
            <h3>People outside the workspace</h3>
            {!canEdit ? (
              <p className={styles.fine}>Ask an editor to share this page with someone outside the workspace.</p>
            ) : (
              <>
                <p className={styles.fine}>
                  A guest link opens <strong>only this page</strong> — nothing else in the workspace. Guests sign in with
                  Google or GitHub to comment.
                </p>
                {shares === null && <p className={styles.fine}>Loading links…</p>}
                {shares?.map((s) => (
                  <div key={s.id} className={styles.link}>
                    <div className={styles.urlRow}>
                      <input className={styles.url} readOnly value={shareUrl(s.token)} onFocus={(e) => e.currentTarget.select()} aria-label="Guest link" />
                      <button type="button" className={styles.primary} onClick={() => copy(shareUrl(s.token), s.id)}>
                        {copied === s.id ? "Copied ✓" : "Copy"}
                      </button>
                    </div>
                    <div className={styles.linkFoot}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={s.allowComments}
                          disabled={busy}
                          onChange={(e) => {
                            const allow = e.target.checked;
                            void run(async () => {
                              await setShareComments(s.id, allow);
                              setShares((list) => list?.map((x) => (x.id === s.id ? { ...x, allowComments: allow } : x)) ?? null);
                            });
                          }}
                        />
                        Guests can comment
                      </label>
                      {confirmRevoke === s.id ? (
                        <span className={styles.confirm}>
                          The link stops working.
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await revokePageShare(s.id);
                                setShares((list) => list?.filter((x) => x.id !== s.id) ?? null);
                                setConfirmRevoke(null);
                              })
                            }
                          >
                            Stop sharing
                          </button>
                          <button type="button" className={styles.quiet} onClick={() => setConfirmRevoke(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className={styles.quiet} onClick={() => setConfirmRevoke(s.id)}>Stop sharing</button>
                      )}
                    </div>
                  </div>
                ))}
                {shares !== null && shares.length === 0 && (
                  <>
                    <label className={styles.check}>
                      <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} />
                      Guests can comment
                    </label>
                    <button type="button" className={styles.primary} disabled={busy} onClick={create}>
                      {busy ? "Creating…" : "Create guest link"}
                    </button>
                  </>
                )}
                {shares !== null && shares.length > 0 && (
                  <button type="button" className={styles.more} disabled={busy} onClick={create}>
                    + Another link (e.g. one per person, to revoke separately)
                  </button>
                )}
              </>
            )}
          </section>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
      )}
    </div>
  );
}
