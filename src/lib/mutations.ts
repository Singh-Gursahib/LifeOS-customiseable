import "server-only";
import { supabaseServer } from "./supabase";
import { SpaceId } from "./session";
import { parseDoc, folderOf, titleOf, wordCount, buildResolver } from "./vault";

/**
 * Save a document: upsert content, refresh derived fields, rebuild its outbound links.
 * The single write path for the editor, ingestion, and the assistant's tools.
 * Scoped to one space — the same path can exist independently in both vaults.
 */
export async function saveDocument(space: SpaceId, path: string, content: string): Promise<{ path: string; title: string }> {
  if (!/^[\w\-./ ]+\.md$/.test(path) || path.includes("..")) {
    throw new Error(`Invalid vault path: ${path}`);
  }
  const sb = supabaseServer();
  const { frontmatter, body, tags } = parseDoc(content);
  const title = titleOf(path, frontmatter, body);

  const { error } = await sb.from("documents").upsert(
    {
      space,
      path,
      folder: folderOf(path),
      title,
      content,
      frontmatter,
      tags,
      word_count: wordCount(body),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "space,path" }
  );
  if (error) throw new Error(`save failed: ${error.message}`);

  await rebuildLinksFor(space, path, content);
  return { path, title };
}

/** Re-extract wiki links for one source document. */
export async function rebuildLinksFor(space: SpaceId, path: string, content: string): Promise<void> {
  const sb = supabaseServer();
  const { wikiLinks } = parseDoc(content);

  // Resolve against this space's paths only — a [[maya]] in the private vault
  // must not silently resolve to the decoy's note of the same name.
  const { data: pathRows } = await sb.from("documents").select("path").eq("space", space);
  const resolve = buildResolver((pathRows ?? []).map((r) => (r as { path: string }).path));

  await sb.from("links").delete().eq("space", space).eq("source_path", path);
  const seen = new Set<string>();
  const rows = [];
  for (const l of wikiLinks) {
    if (seen.has(l.target)) continue;
    seen.add(l.target);
    rows.push({ space, source_path: path, target_raw: l.target, target_path: resolve(l.target) });
  }
  if (rows.length) {
    const { error } = await sb.from("links").insert(rows);
    if (error) throw new Error(`links rebuild failed: ${error.message}`);
  }
}

export async function toggleFavorite(space: SpaceId, path: string): Promise<boolean> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("is_favorite").eq("space", space).eq("path", path).maybeSingle();
  const next = !(data as { is_favorite: boolean } | null)?.is_favorite;
  const { error } = await sb.from("documents").update({ is_favorite: next }).eq("space", space).eq("path", path);
  if (error) throw new Error(error.message);
  return next;
}

/** Record that a document was opened (drives the "recently accessed" signal for the agent). */
export async function touchAccessed(space: SpaceId, path: string): Promise<void> {
  const sb = supabaseServer();
  await sb.from("documents").update({ accessed_at: new Date().toISOString() }).eq("space", space).eq("path", path);
}
