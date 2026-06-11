import { supabase, WORKSPACE_ID } from "./supabase";
import {
  seedDocs,
  type Block,
  type BlockType,
  type DesignDoc,
  type LinkedRef,
  type Status,
} from "@/app/doc/data";

/* ---------------------------------------------------------------------------
 * Display-only attributes (owner avatar, "links to", "linked references")
 * are NOT persisted in this foundation phase — they are re-attached from the
 * seed by page title so the page looks identical after a reload. Editing them
 * comes with the metadata phase.
 * ------------------------------------------------------------------------- */
interface Display {
  owner: string;
  ownerName: string;
  ownerColor: string;
  links: string[];
  refs: LinkedRef[];
}
const SEED_DISPLAY: Record<string, Display> = Object.fromEntries(
  seedDocs.map((d) => [
    d.title,
    { owner: d.owner, ownerName: d.ownerName, ownerColor: d.ownerColor, links: d.links, refs: d.refs },
  ]),
);
function displayFor(title: string): Display {
  return (
    SEED_DISPLAY[title] ?? {
      owner: title.slice(0, 2).toUpperCase(),
      ownerName: "Unassigned",
      ownerColor: "#a59a8c",
      links: [],
      refs: [],
    }
  );
}

/* ---- DB row shapes ---- */
interface BlockRow {
  id: string;
  page_id: string;
  type: string;
  content: {
    text?: string;
    rows?: string[][];
    src?: string;
    tone?: string;
    checked?: boolean;
    path?: string;
    code?: string;
  };
  position: number;
}
export interface ProfileInfo {
  id: string;
  name: string;
  initials: string;
  color: string;
}

/** Workspace members (for the owner picker + owner display resolution). */
export async function listMembers(workspaceId: string): Promise<ProfileInfo[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("profile:user_id (id, name, initials, color)")
    .eq("project_id", workspaceId);
  if (error) throw new Error(`listMembers failed: ${error.message}`);
  const out: ProfileInfo[] = [];
  for (const row of (data ?? []) as { profile: ProfileInfo | ProfileInfo[] | null }[]) {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (p?.id) {
      out.push({
        id: p.id,
        name: p.name || "Guest",
        initials: p.initials || (p.name || "G").slice(0, 2).toUpperCase(),
        color: p.color || "#a59a8c",
      });
    }
  }
  return out;
}

/** Assign / clear a page owner. */
export async function setPageOwner(pageId: string, userId: string | null): Promise<void> {
  const { error } = await supabase.from("pages").update({ owner: userId }).eq("id", pageId);
  if (error) throw new Error(`setPageOwner failed: ${error.message}`);
}

interface PageRow {
  id: string;
  section_id: string | null;
  parent_id: string | null;
  owner: string | null;
  title: string;
  kind: string | null;
  status: Status;
  summary: string | null;
  tags: string[];
  links: string[] | null;
  position: number;
  updated_at: string;
}

const blockContent = (b: Block): BlockRow["content"] => {
  const c: BlockRow["content"] = { text: b.text };
  if (b.rows) c.rows = b.rows;
  if (b.src) c.src = b.src;
  if (b.tone) c.tone = b.tone;
  if (b.checked !== undefined) c.checked = b.checked;
  if (b.path) c.path = b.path;
  if (b.code !== undefined) c.code = b.code;
  return c;
};

const blockToRow = (b: Block, pageId: string, position: number): Omit<BlockRow, never> => ({
  id: b.id,
  page_id: pageId,
  type: b.type,
  content: blockContent(b),
  position,
});

const rowToBlock = (r: BlockRow): Block => ({
  id: r.id,
  type: r.type as BlockType,
  text: r.content?.text ?? "",
  ...(r.content?.rows ? { rows: r.content.rows } : {}),
  ...(r.content?.src ? { src: r.content.src } : {}),
  ...(r.content?.tone ? { tone: r.content.tone as Block["tone"] } : {}),
  ...(r.content?.checked !== undefined ? { checked: r.content.checked } : {}),
  ...(r.content?.path ? { path: r.content.path } : {}),
  ...(r.content?.code !== undefined ? { code: r.content.code } : {}),
});

/** Load the whole workspace into the in-memory DesignDoc[] the UI expects. */
export async function loadWorkspace(workspaceId: string): Promise<DesignDoc[]> {
  const [sectionsResult, pagesResult, members] = await Promise.all([
    supabase.from("sections").select("id, name, position").eq("project_id", workspaceId),
    supabase
      .from("pages")
      .select("id, section_id, parent_id, owner, title, kind, status, summary, tags, links, position, updated_at")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
    listMembers(workspaceId),
  ]);
  if (sectionsResult.error) throw new Error(`loadWorkspace sections failed: ${sectionsResult.error.message}`);
  if (pagesResult.error) throw new Error(`loadWorkspace pages failed: ${pagesResult.error.message}`);

  const sections = sectionsResult.data;
  const pages = pagesResult.data;
  const ownerMap = new Map(members.map((m) => [m.id, m]));
  const sectionName = new Map((sections ?? []).map((s) => [s.id as string, s.name as string]));
  const sectionPos = new Map((sections ?? []).map((s) => [s.id as string, s.position as number]));
  const pageRows = (pages ?? []) as PageRow[];
  if (pageRows.length === 0) return [];

  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("id, page_id, type, content, position")
    .in(
      "page_id",
      pageRows.map((p) => p.id),
    )
    .order("position", { ascending: true });
  if (blocksError) throw new Error(`loadWorkspace blocks failed: ${blocksError.message}`);

  const blocksByPage = new Map<string, Block[]>();
  for (const r of (blocks ?? []) as BlockRow[]) {
    const list = blocksByPage.get(r.page_id) ?? [];
    list.push(rowToBlock(r));
    blocksByPage.set(r.page_id, list);
  }

  const docs: DesignDoc[] = pageRows.map((p) => {
    const d = displayFor(p.title);
    const prof = p.owner ? ownerMap.get(p.owner) : undefined;
    return {
      id: p.id,
      sectionId: p.section_id ?? undefined,
      parentId: p.parent_id ?? undefined,
      position: p.position,
      title: p.title,
      group: (p.section_id && sectionName.get(p.section_id)) || "Mechanics & Systems",
      kind: p.kind ?? "",
      status: p.status,
      ownerId: p.owner ?? undefined,
      owner: prof?.initials ?? d.owner,
      ownerName: prof?.name ?? d.ownerName,
      ownerColor: prof?.color ?? d.ownerColor,
      subtitle: p.summary ?? "",
      tags: p.tags ?? [],
      links: p.links ?? [], // page ids
      blocks: blocksByPage.get(p.id) ?? [],
      refs: d.refs,
      updatedAt: p.updated_at,
    };
  });

  // Order by section, then page position, so sidebar groups come out in order.
  docs.sort((a, b) => {
    const sa = sectionPos.get(pageRows.find((p) => p.id === a.id)!.section_id ?? "") ?? 99;
    const sb = sectionPos.get(pageRows.find((p) => p.id === b.id)!.section_id ?? "") ?? 99;
    return sa - sb;
  });
  return docs;
}

/**
 * Seed the workspace from `seedDocs` exactly once (first run). Only the shared
 * bootstrap workspace gets the demo content — user-created workspaces start
 * completely clean.
 */
export async function seedIfEmpty(workspaceId: string): Promise<void> {
  if (workspaceId !== WORKSPACE_ID) return;
  const { count, error: countError } = await supabase
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", workspaceId);
  if (countError) throw new Error(`seedIfEmpty count failed: ${countError.message}`);
  if ((count ?? 0) > 0) return;

  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("id, name")
    .eq("project_id", workspaceId);
  if (sectionsError) throw new Error(`seedIfEmpty sections failed: ${sectionsError.message}`);
  const sectionId = new Map((sections ?? []).map((s) => [s.name as string, s.id as string]));
  const titleToId = new Map<string, string>();

  for (let i = 0; i < seedDocs.length; i++) {
    const d = seedDocs[i];
    const { data: page, error } = await supabase
      .from("pages")
      .insert({
        project_id: workspaceId,
        section_id: sectionId.get(d.group) ?? null,
        title: d.title,
        kind: d.kind,
        status: d.status,
        summary: d.subtitle,
        tags: d.tags,
        position: i,
      })
      .select("id")
      .single();
    if (error || !page) throw new Error(`Seed page failed: ${error?.message}`);
    titleToId.set(d.title, page.id);

    if (d.blocks.length) {
      const rows = d.blocks.map((b, idx) => ({
        page_id: page.id,
        type: b.type,
        content: blockContent(b),
        position: idx,
      }));
      const { error: bErr } = await supabase.from("blocks").insert(rows);
      if (bErr) throw new Error(`Seed blocks failed: ${bErr.message}`);
    }
  }

  // Second pass: resolve each seed doc's links (titles) to the inserted page ids.
  for (const d of seedDocs) {
    const selfId = titleToId.get(d.title);
    const linkIds = d.links.map((t) => titleToId.get(t)).filter((x): x is string => !!x);
    if (selfId && linkIds.length) {
      const { error } = await supabase.from("pages").update({ links: linkIds }).eq("id", selfId);
      if (error) throw new Error(`Seed links failed: ${error.message}`);
    }
  }
}

export interface SectionInfo {
  id: string;
  name: string;
  position: number;
}

/** List the workspace sections, ordered. */
export async function listSections(workspaceId: string): Promise<SectionInfo[]> {
  const { data, error } = await supabase
    .from("sections")
    .select("id, name, position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: true });
  if (error) throw new Error(`listSections failed: ${error.message}`);
  return (data ?? []) as SectionInfo[];
}

/** Create a new section (top-level group). Returns it with its assigned position. */
export async function createSection(workspaceId: string, name: string): Promise<SectionInfo> {
  const { data: maxRow, error: maxError } = await supabase
    .from("sections")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(`createSection position failed: ${maxError.message}`);
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("sections")
    .insert({ project_id: workspaceId, name, position })
    .select("id, name, position")
    .single();
  if (error || !data) throw new Error(`createSection failed: ${error?.message}`);
  return data as SectionInfo;
}

/** Create a blank page in a section (with one empty text block) and return it. */
export async function createPage(
  workspaceId: string,
  sectionId: string | null,
  sectionName: string,
): Promise<DesignDoc> {
  const { data: maxRow, error: maxError } = await supabase
    .from("pages")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(`createPage position failed: ${maxError.message}`);
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      project_id: workspaceId,
      section_id: sectionId,
      title: "Untitled page",
      kind: "Page",
      status: "todo",
      summary: "",
      tags: [],
      position,
    })
    .select("id, updated_at")
    .single();
  if (error || !page) throw new Error(`createPage failed: ${error?.message}`);

  const firstBlock: Block = { id: crypto.randomUUID(), type: "text", text: "" };
  const { error: bErr } = await supabase
    .from("blocks")
    .insert({ id: firstBlock.id, page_id: page.id, type: "text", content: { text: "" }, position: 0 });
  if (bErr) throw new Error(`createPage blocks failed: ${bErr.message}`);

  return {
    id: page.id as string,
    sectionId: sectionId ?? undefined,
    parentId: undefined,
    position,
    title: "Untitled page",
    group: sectionName,
    kind: "Page",
    status: "todo",
    owner: "—",
    ownerName: "Unassigned",
    ownerColor: "#a59a8c",
    subtitle: "",
    tags: [],
    links: [],
    blocks: [firstBlock],
    refs: [],
    updatedAt: page.updated_at as string,
  };
}

/** Fetch a single page's blocks (used by realtime to merge remote edits). */
export async function fetchPageBlocks(pageId: string): Promise<Block[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("id, page_id, type, content, position")
    .eq("page_id", pageId)
    .order("position", { ascending: true });
  if (error) throw new Error(`fetchPageBlocks failed: ${error.message}`);
  return ((data ?? []) as BlockRow[]).map(rowToBlock);
}

/** Delete a page (blocks cascade via FK; child pages cascade too). */
export async function deletePage(pageId: string): Promise<void> {
  const { error } = await supabase.from("pages").delete().eq("id", pageId);
  if (error) throw new Error(`deletePage failed: ${error.message}`);
}

/** Rename a section. */
export async function renameSection(sectionId: string, name: string): Promise<void> {
  const { error } = await supabase.from("sections").update({ name }).eq("id", sectionId);
  if (error) throw new Error(`renameSection failed: ${error.message}`);
}

/** Delete a section (only call when it has no pages). */
export async function deleteSection(sectionId: string): Promise<void> {
  const { error } = await supabase.from("sections").delete().eq("id", sectionId);
  if (error) throw new Error(`deleteSection failed: ${error.message}`);
}

/** Persist new positions for a set of sections. */
export async function reorderSections(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("sections").update({ position: i }).eq("id", id),
    ),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`reorderSections failed: ${error.message}`);
}

export interface PagePlacement {
  id: string;
  position: number;
  sectionId?: string | null; // only set for the moved page
  parentId?: string | null; // only set for the moved page
}

/** Persist page placement: positions for a sibling group, plus section/parent for the moved one. */
export async function updatePagePlacement(updates: PagePlacement[]): Promise<void> {
  const results = await Promise.all(
    updates.map((u) => {
      const patch: Record<string, unknown> = { position: u.position };
      if (u.sectionId !== undefined) patch.section_id = u.sectionId;
      if (u.parentId !== undefined) patch.parent_id = u.parentId;
      return supabase.from("pages").update(patch).eq("id", u.id);
    }),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`updatePagePlacement failed: ${error.message}`);
}

/** Persist editable page fields. */
export async function savePage(doc: DesignDoc): Promise<void> {
  const { error } = await supabase
    .from("pages")
    .update({
      title: doc.title,
      summary: doc.subtitle,
      kind: doc.kind,
      status: doc.status,
      tags: doc.tags,
      links: doc.links,
    })
    .eq("id", doc.id);
  if (error) throw new Error(`savePage failed: ${error.message}`);
}

/** Persist a page's blocks: upsert current, delete removed. */
export async function saveBlocks(pageId: string, blocks: Block[]): Promise<void> {
  const rows = blocks.map((b, i) => blockToRow(b, pageId, i));
  const incoming = new Set(blocks.map((b) => b.id));

  const { data: existing, error: existingError } = await supabase.from("blocks").select("id").eq("page_id", pageId);
  if (existingError) throw new Error(`saveBlocks existing failed: ${existingError.message}`);
  const toDelete = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !incoming.has(id));

  if (rows.length) {
    const { error } = await supabase.from("blocks").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`saveBlocks upsert failed: ${error.message}`);
  }
  if (toDelete.length) {
    const { error } = await supabase.from("blocks").delete().in("id", toDelete);
    if (error) throw new Error(`saveBlocks delete failed: ${error.message}`);
  }
}
