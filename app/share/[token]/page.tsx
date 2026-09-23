"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BlockEditor from "@/app/doc/BlockEditor";
import Comments from "@/app/doc/Comments";
import { contentToBlock } from "@/lib/docsRepo";
import {
  commentOnSharedPage,
  deleteSharedPageComment,
  editSharedPageComment,
  loadSharedPage,
  type SharedPage,
} from "@/lib/pageSharesRepo";
import styles from "./share.module.css";

const POLL_MS = 20000;

/**
 * A single page shared by link. Guests see only this page — no sidebar,
 * dock or workspace — and, when the link allows it and they're signed in,
 * comment on it: on the page, on a paragraph, or in reply to a thread.
 * Everything goes through the token (lib/pageSharesRepo.ts).
 */
export default function SharedPageView() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [data, setData] = useState<SharedPage | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [focusAnchor, setFocusAnchor] = useState<{ anchor: string; at: number } | null>(null);

  const load = useCallback(async () => {
    if (!token) return setData(null);
    setData(await loadSharedPage(token));
  }, [token]);

  useEffect(() => {
    load().catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    });
    // Guests can't subscribe to live changes, so new comments arrive by polling.
    const timer = setInterval(() => void load().catch(() => {}), POLL_MS);
    const onFocus = () => void load().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (data?.page) document.title = `${data.page.title || "Untitled page"} · shared from ${data.workspace || "Foundry"}`;
  }, [data]);

  const blocks = useMemo(() => (data?.blocks ?? []).map((b) => contentToBlock(b.id, b.type, b.content as Parameters<typeof contentToBlock>[2])), [data]);
  const comments = useMemo(() => data?.comments ?? [], [data]);
  const openAnchors = useMemo(
    () => new Set(comments.filter((c) => !c.parent_id && c.anchor && !c.resolved_at).map((c) => c.anchor!)),
    [comments],
  );
  const blockThreads = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const c of comments) {
      if (c.parent_id || !c.block_id || c.resolved_at) continue;
      out.set(c.block_id, [...(out.get(c.block_id) ?? []), c.id]);
    }
    return out;
  }, [comments]);

  const signedIn = !!data?.me;
  const canComment = !!data?.allowComments && signedIn;
  const me = data?.people.find((p) => p.id === data?.me);

  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const signIn = () => {
    try {
      localStorage.setItem("gd-post-login-redirect", `/share/${token}`);
    } catch {
      /* private mode: they can open the link again after signing in */
    }
    router.push("/login");
  };

  if (data === undefined) {
    return (
      <div className={styles.page}>
        <div className={styles.center}><p className={styles.muted}>Opening the shared page…</p></div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <h1 className={styles.goneTitle}>This link doesn’t work any more</h1>
          <p className={styles.muted}>
            {error || "It may have been turned off by the person who shared it, or the page was deleted. Ask them for a new link."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">F</span>
          <span className={styles.workspace}>{data.workspace || "Foundry"}</span>
          <span className={styles.chip}>{data.allowComments ? "Shared with you · view & comment" : "Shared with you · view only"}</span>
        </div>
        {signedIn ? (
          <span className={styles.me}>
            {me && <span className={styles.avatar} style={{ background: me.color }}>{me.initials}</span>}
            {me?.name ?? "Signed in"}
          </span>
        ) : data.allowComments ? (
          <button type="button" className={styles.signIn} onClick={signIn}>Sign in to comment</button>
        ) : null}
      </header>

      <div className={styles.body}>
        <main className={styles.main}>
          <article className={styles.paper}>
            <h1 className={styles.title}>{data.page.title || "Untitled page"}</h1>
            {data.page.summary && <p className={styles.summary}>{data.page.summary}</p>}
            <p className={styles.updated}>
              Last edited {new Date(data.page.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <BlockEditor
              key={data.page.id}
              blocks={blocks}
              onChange={() => {}}
              readOnly
              openAnchors={openAnchors}
              blockThreads={blockThreads}
              people={data.people}
              // Links to other pages would lead nowhere for a guest.
              onNavigate={() => {}}
              onAnnotationClick={(anchor) => setFocusAnchor({ anchor, at: Date.now() })}
              onBlockComment={
                canComment
                  ? async (c) => {
                      await commentOnSharedPage(token, { body: c.body, blockId: c.blockId, quote: c.quote });
                      await load();
                    }
                  : undefined
              }
            />
            {canComment && (
              <p className={styles.hint}>Tip: select text, or use the comment icon beside a paragraph, to comment on that part.</p>
            )}
          </article>
        </main>

        <aside className={styles.rail}>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <Comments
            comments={comments}
            people={data.people}
            currentUserId={data.me ?? ""}
            canComment={canComment}
            canResolve={false}
            composerFallback={
              <div className={styles.fallback}>
                {data.allowComments ? (
                  <>
                    <p>Sign in with Google or GitHub to comment. You’ll only see this page.</p>
                    <button type="button" className={styles.signIn} onClick={signIn}>Sign in to comment</button>
                  </>
                ) : (
                  <p>Comments are turned off for this link.</p>
                )}
              </div>
            }
            focusAnchor={focusAnchor}
            onAdd={(body, parentId) => void act(() => commentOnSharedPage(token, { body, parentId: parentId ?? null }))}
            onEdit={(id, body) => void act(() => editSharedPageComment(token, id, body))}
            onDelete={(id) => void act(() => deleteSharedPageComment(token, id))}
            onResolve={() => {}}
            onJump={(anchor) => {
              const el = anchor.startsWith("block:")
                ? document.querySelector(`.blocks .blk[data-block-id="${CSS.escape(anchor.slice(6))}"]`)
                : document.querySelector(`.blocks [data-comment="${anchor}"], .blocks [data-suggestion="${anchor}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              if (el && anchor.startsWith("block:")) {
                el.classList.remove("blk-flash");
                void (el as HTMLElement).offsetWidth;
                el.classList.add("blk-flash");
              }
            }}
          />
        </aside>
      </div>
    </div>
  );
}
