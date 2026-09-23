"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/app/components/Icon";
import { mentionHref, type MentionTarget } from "@/app/doc/mentions";
import { linkIconName, splitPageLinks } from "@/lib/pageLinks";
import { parseInlineMarkdown, type MdNode } from "@/lib/inlineMarkdown";
import styles from "./LinkedText.module.css";

/** Plain text with web URLs made clickable. */
function withUrls(text: string, key: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, j) =>
    j % 2 ? <a key={`${key}-${j}`} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part,
  );
}

function renderMarkdown(nodes: MdNode[], key: string): ReactNode[] {
  return nodes.map((n, i) =>
    typeof n === "string"
      ? withUrls(n, `${key}-${i}`)
      : "bold" in n
        ? <strong key={`${key}-${i}`}>{renderMarkdown(n.bold, `${key}-${i}`)}</strong>
        : <em key={`${key}-${i}`}>{renderMarkdown(n.italic, `${key}-${i}`)}</em>,
  );
}

/**
 * Stored plain text (task descriptions, calendar notes) shown with its
 * [[links]] as chips, **bold** / _italic_, and clickable web URLs. Everything
 * is built as React elements — no HTML from the text is ever injected.
 * `targets` supplies current titles, so renamed pages show their new name.
 */
export default function LinkedText({
  text,
  targets = [],
  formatting = true,
}: {
  text: string;
  targets?: MentionTarget[];
  /** Render **bold** / _italic_ (off for text from outside, like Moodle). */
  formatting?: boolean;
}) {
  const titleOf = new Map(targets.map((t) => [t.ref, t.title]));
  return (
    <>
      {splitPageLinks(text).map((seg, i) =>
        seg.link ? (
          <Link key={i} href={mentionHref(seg.link.ref)} className={styles.link}>
            <Icon name={linkIconName(seg.link.ref)} />
            {titleOf.get(seg.link.ref) ?? seg.link.title}
          </Link>
        ) : formatting ? (
          renderMarkdown(parseInlineMarkdown(seg.text), String(i))
        ) : (
          withUrls(seg.text, String(i))
        ),
      )}
    </>
  );
}
