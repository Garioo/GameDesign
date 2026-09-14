import { supabase } from "./supabase";
import { validateDocumentLinks, type DocumentLink } from "./documentLinks";

function linkError(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST205" || error.code === "42P01") return new Error("Document links are not set up yet. Run supabase/migrate-document-links.sql in Supabase.");
  if (error.code === "23505") return new Error("This document is already in the sidebar.");
  return new Error(error.message);
}
export async function listDocumentLinks(workspaceId: string): Promise<DocumentLink[]> {
  const {data, error} = await supabase.from("document_links").select("id, title, url").eq("project_id", workspaceId).order("created_at");
  if (error) throw linkError(error);
  return data ?? [];
}
export async function addDocumentLink(workspaceId: string, link: DocumentLink): Promise<DocumentLink> {
  const clean = validateDocumentLinks([link])[0];
  const {data, error} = await supabase.from("document_links").insert({...clean, project_id: workspaceId}).select("id, title, url").single();
  if (error) throw linkError(error);
  return data;
}
export async function removeDocumentLink(workspaceId: string, id: string): Promise<void> {
  const {error} = await supabase.from("document_links").delete().eq("project_id", workspaceId).eq("id", id).select("id").single();
  if (error) throw linkError(error);
}
