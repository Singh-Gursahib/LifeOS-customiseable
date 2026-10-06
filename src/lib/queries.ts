import "server-only";
import { supabaseServer, DocumentRow, CaptureRow, LinkRow } from "./supabase";
import { SpaceId } from "./session";
import { isoMinusDays, todayParts } from "./vault";

/**
 * Every read takes the caller's space. There is no unscoped variant on purpose:
 * a query that forgets the filter would quietly merge the two vaults, so the
 * parameter is mandatory and always first.
 */

export type DocMeta = Omit<DocumentRow, "content">;

const META_COLS = "id,path,folder,title,frontmatter,tags,is_favorite,word_count,accessed_at,created_at,updated_at";

export async function getDoc(space: SpaceId, path: string): Promise<DocumentRow | null> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select("*").eq("space", space).eq("path", path).maybeSingle();
  return (data as DocumentRow) ?? null;
}

export async function listDocs(space: SpaceId): Promise<DocMeta[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("documents").select(META_COLS).eq("space", space).order("path");
  return (data as DocMeta[]) ?? [];
}

export async function recentDocs(space: SpaceId, limit = 6): Promise<DocMeta[]> {
  const sb = supabaseServer();
  // index files are structure, not content — keep them out of "recent"
  const { data } = await sb
    .from("documents")
    .select(META_COLS)
    .eq("space", space)
    .not("path", "like", "%_index.md")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data as DocMeta[]) ?? [];
}

export async function favoriteDocs(space: SpaceId, limit = 6): Promise<DocMeta[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("documents")
    .select(META_COLS)
    .eq("space", space)
    .eq("is_favorite", true)
    .order("accessed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as DocMeta[]) ?? [];
}

export async function linksFrom(space: SpaceId, path: string): Promise<LinkRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("links").select("*").eq("space", space).eq("source_path", path);
  return (data as LinkRow[]) ?? [];
}

/** Notes that link TO this path (backlinks). */
export async function backlinks(space: SpaceId, path: string): Promise<{ source_path: string; title: string }[]> {
  const sb = supabaseServer();
  const { data: ls } = await sb.from("links").select("source_path").eq("space", space).eq("target_path", path);
  const sources = [...new Set((ls ?? []).map((l) => (l as { source_path: string }).source_path))];
  if (!sources.length) return [];
  const { data: docs } = await sb.from("documents").select("path,title").eq("space", space).in("path", sources);
  const titleByPath = new Map((docs ?? []).map((d) => [(d as DocMeta).path, (d as DocMeta).title]));
  return sources.map((p) => ({ source_path: p, title: titleByPath.get(p) ?? p }));
}

export async function allLinks(space: SpaceId): Promise<LinkRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.from("links").select("*").eq("space", space).not("target_path", "is", null);
  return (data as LinkRow[]) ?? [];
}

/** Outbound link counts for a set of paths — one query instead of N. */
export async function linkCounts(space: SpaceId, paths: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!paths.length) return counts;
  const sb = supabaseServer();
  const { data } = await sb.from("links").select("source_path").eq("space", space).in("source_path", paths);
  for (const l of (data ?? []) as { source_path: string }[]) {
    counts.set(l.source_path, (counts.get(l.source_path) ?? 0) + 1);
  }
  return counts;
}

export interface VaultStats {
  totalDocs: number;
  totalEntries: number; // journal notes
  totalLinks: number;
  draftCount: number;
  streak: number;
}

export async function vaultStats(space: SpaceId): Promise<VaultStats> {
  const sb = supabaseServer();
  const [{ count: totalDocs }, { count: journalCount }, { count: totalLinks }, { count: draftCount }] = await Promise.all([
    sb.from("documents").select("*", { count: "exact", head: true }).eq("space", space),
    sb
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("space", space)
      .like("folder", "journal%")
      .not("path", "like", "%_index.md"),
    sb.from("links").select("*", { count: "exact", head: true }).eq("space", space).not("target_path", "is", null),
    sb.from("captures").select("*", { count: "exact", head: true }).eq("space", space).eq("status", "draft"),
  ]);

  // streak: consecutive days ending today that have a journal note.
  // The date lives in the path (journal/YYYY/YYYY-MM-DD.md), so fetch paths
  // only — no frontmatter payload — and cap to the newest 400.
  const { data: journalDocs } = await sb
    .from("documents")
    .select("path")
    .eq("space", space)
    .like("folder", "journal%")
    .not("path", "like", "%_index.md")
    .order("path", { ascending: false })
    .limit(400);
  const days = new Set<string>();
  for (const d of journalDocs ?? []) {
    const iso = String((d as { path: string }).path).match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (iso) days.add(iso);
  }
  const { iso: today } = todayParts();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const day = isoMinusDays(today, i);
    if (days.has(day)) streak++;
    else if (i === 0) continue; // today may not be journaled yet
    else break;
  }

  return {
    totalDocs: totalDocs ?? 0,
    totalEntries: journalCount ?? 0,
    totalLinks: totalLinks ?? 0,
    draftCount: draftCount ?? 0,
    streak,
  };
}

/**
 * Reset captures stuck in "ingesting" for over 2 minutes back to "failed" so
 * they can be retried — this happens when a serverless ingest run is killed by
 * the platform timeout before it can record a result. Self-heals the queue.
 */
export async function recoverStuckCaptures(space: SpaceId): Promise<void> {
  const sb = supabaseServer();
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  // reset runs whose ingest started >2min ago (killed by the platform timeout),
  // plus any legacy stuck rows that never recorded a start time
  await sb
    .from("captures")
    .update({ status: "failed", error: "Ingestion timed out — tap Retry to run it again." })
    .eq("space", space)
    .eq("status", "ingesting")
    .or(`ingest_started_at.lt.${cutoff},ingest_started_at.is.null`);
}

export async function listCaptures(space: SpaceId, status?: CaptureRow["status"]): Promise<CaptureRow[]> {
  const sb = supabaseServer();
  await recoverStuckCaptures(space);
  let q = sb.from("captures").select("*").eq("space", space).order("captured_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data as CaptureRow[]) ?? [];
}

/** Full-text + trigram search across the vault, ranked. */
export async function searchDocs(space: SpaceId, query: string, limit = 20): Promise<DocMeta[]> {
  const sb = supabaseServer();
  const q = query.trim();
  if (!q) return [];
  const { data } = await sb
    .from("documents")
    .select(META_COLS)
    .eq("space", space)
    .textSearch("fts", q, { type: "websearch", config: "english" })
    .limit(limit);
  if (data && data.length) return data as DocMeta[];
  // fallback to ILIKE for partials the FTS misses
  const { data: like } = await sb
    .from("documents")
    .select(META_COLS)
    .eq("space", space)
    .or(`title.ilike.%${q}%,path.ilike.%${q}%`)
    .limit(limit);
  return (like as DocMeta[]) ?? [];
}
