"use client";

import { useMemo, useState } from "react";
import {
  seedDocs,
  STATUS_LABEL,
  type DesignDoc,
  type Status,
} from "./data";

const STATUS_ORDER: Status[] = ["todo", "wip", "review", "done"];

export default function DocPage() {
  const [docs, setDocs] = useState<DesignDoc[]>(seedDocs);
  const [activeId, setActiveId] = useState<string>(seedDocs[0].id);

  const active = docs.find((d) => d.id === activeId) ?? docs[0];

  // Group docs for the sidebar, preserving first-seen group order.
  const groups = useMemo(() => {
    const map = new Map<string, DesignDoc[]>();
    for (const doc of docs) {
      const list = map.get(doc.group) ?? [];
      list.push(doc);
      map.set(doc.group, list);
    }
    return Array.from(map.entries());
  }, [docs]);

  const update = (id: string, patch: Partial<DesignDoc>) =>
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const updateSection = (
    docId: string,
    index: number,
    patch: Partial<DesignDoc["sections"][number]>,
  ) =>
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              sections: d.sections.map((s, i) =>
                i === index ? { ...s, ...patch } : s,
              ),
            }
          : d,
      ),
    );

  const addSection = (docId: string) =>
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              sections: [...d.sections, { heading: "New section", body: "" }],
            }
          : d,
      ),
    );

  return (
    <div className="doc-layout">
      <aside className="doc-sidebar">
        <div className="doc-sidebar-head">Design docs</div>
        {groups.map(([group, list]) => (
          <div key={group} className="doc-group">
            <div className="doc-group-label">{group}</div>
            {list.map((doc) => (
              <button
                key={doc.id}
                className={
                  "doc-nav-item" + (doc.id === active.id ? " is-active" : "")
                }
                onClick={() => setActiveId(doc.id)}
              >
                <span className="doc-nav-title">{doc.title}</span>
                <span className={"doc-dot status-" + doc.status} />
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="doc-main">
        <Editable
          tag="h1"
          className="doc-title"
          value={active.title}
          onSave={(v) => update(active.id, { title: v })}
        />

        <div className="doc-meta">
          <span className="doc-kind">{active.kind}</span>
          <select
            className={"doc-status status-" + active.status}
            value={active.status}
            onChange={(e) =>
              update(active.id, { status: e.target.value as Status })
            }
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="doc-owner">{active.owner}</span>
        </div>

        <div className="doc-tags">
          {active.tags.map((t) => (
            <span key={t} className="doc-tag">
              {t}
            </span>
          ))}
        </div>

        <div className="doc-body">
          {active.sections.map((section, i) => (
            <section key={i} className="doc-section">
              <Editable
                tag="h2"
                className="doc-section-heading"
                value={section.heading}
                onSave={(v) => updateSection(active.id, i, { heading: v })}
              />
              <Editable
                tag="p"
                className="doc-section-body"
                value={section.body}
                placeholder="Write here…"
                onSave={(v) => updateSection(active.id, i, { body: v })}
              />
            </section>
          ))}
          <button className="doc-add" onClick={() => addSection(active.id)}>
            + Add section
          </button>
        </div>
      </main>
    </div>
  );
}

// Inline-editable text. Saves on blur; single-line fields commit on Enter.
function Editable({
  tag: Tag,
  value,
  onSave,
  className,
  placeholder,
}: {
  tag: "h1" | "h2" | "p";
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const multiline = Tag === "p";
  return (
    <Tag
      className={(className ?? "") + " editable"}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={(e) => {
        const text = e.currentTarget.innerText.trim();
        if (text !== value) onSave(text);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}
