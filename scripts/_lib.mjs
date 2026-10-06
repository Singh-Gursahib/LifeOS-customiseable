// Shared helpers for LifeOS vault scripts (seed, vault CLI).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";

export const ROOT = new URL("..", import.meta.url).pathname;

/** Loads .env.local if present. Real environment variables always win. */
export function loadEnv() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export function supabase() {
  loadEnv();
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`error: ${missing.join(" and ")} not set.\n  Copy the template and fill it in:  cp .env.example .env.local`);
    process.exit(1);
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKI_RE = /\[\[([^\]\n#|^]+)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g;
const TAG_RE = /(?:^|[\s(])#([A-Za-z][\w\-/]*)/g;
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;

export function parseDoc(text) {
  let body = text,
    frontmatter = {};
  const m = FM_RE.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    try {
      frontmatter = yamlLoad(m[1]) ?? {};
    } catch {}
  }
  const stripped = body.replace(CODE_RE, " ");
  const wikiLinks = [...stripped.matchAll(WIKI_RE)].map((w) => ({ target: w[1].trim(), display: w[2]?.trim() }));
  const tags = new Set();
  for (const t of stripped.matchAll(TAG_RE)) tags.add(t[1].toLowerCase());
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) fmTags.forEach((t) => typeof t === "string" && tags.add(t.toLowerCase()));
  return { frontmatter, body, wikiLinks, tags: [...tags] };
}

export function buildResolver(paths) {
  const byPath = new Set(paths);
  const byBasename = new Map();
  for (const p of byPath) {
    const base = p.split("/").pop().replace(/\.md$/, "").toLowerCase();
    if (base !== "_index") byBasename.set(base, p);
  }
  for (const p of byPath) {
    if (!p.endsWith("/_index.md")) continue;
    const folderName = p.slice(0, p.lastIndexOf("/")).split("/").pop()?.toLowerCase();
    if (folderName && !byBasename.has(folderName)) byBasename.set(folderName, p);
  }
  return (target) => {
    const t = target.trim().replace(/\.md$/i, "");
    if (byPath.has(`${t}.md`)) return `${t}.md`;
    if (byPath.has(`${t}/_index.md`)) return `${t}/_index.md`;
    return byBasename.get((t.split("/").pop() ?? t).toLowerCase()) ?? null;
  };
}

/**
 * Which vault a CLI command acts on: --space <id>, else LIFEOS_SPACE, else the
 * caller's default. Every command prints it — writing into the wrong vault
 * silently would be the worst possible failure mode here.
 */
export const SPACES = ["decoy", "private"];

export function resolveSpace(argv, fallback = "private") {
  const i = argv.indexOf("--space");
  const raw = (i >= 0 ? argv[i + 1] : undefined) ?? process.env.LIFEOS_SPACE ?? fallback;
  if (!SPACES.includes(raw)) {
    console.error(`error: --space must be one of ${SPACES.join(", ")} (got '${raw}')`);
    process.exit(1);
  }
  return raw;
}

/** Upsert one document + rebuild its outbound links. Mirrors src/lib/mutations.ts. */
export async function saveDocument(sb, space, path, content) {
  if (!/^[\w\-./ ]+\.md$/.test(path) || path.includes("..")) throw new Error(`Invalid vault path: ${path}`);
  const { frontmatter, body, tags } = parseDoc(content);
  const title =
    (typeof frontmatter.title === "string" && frontmatter.title.trim()) ||
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    path.split("/").pop().replace(/\.md$/, "");

  const { error } = await sb.from("documents").upsert(
    {
      space,
      path,
      folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
      title,
      content,
      frontmatter,
      tags,
      word_count: body.split(/\s+/).filter(Boolean).length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "space,path" }
  );
  if (error) throw new Error(`save ${path}: ${error.message}`);

  const { data: pathRows } = await sb.from("documents").select("path").eq("space", space);
  const resolve = buildResolver((pathRows ?? []).map((r) => r.path));
  const { wikiLinks } = parseDoc(content);
  await sb.from("links").delete().eq("space", space).eq("source_path", path);
  const seen = new Set();
  const rows = [];
  for (const l of wikiLinks) {
    if (seen.has(l.target)) continue;
    seen.add(l.target);
    rows.push({ space, source_path: path, target_raw: l.target, target_path: resolve(l.target) });
  }
  if (rows.length) {
    const { error: linkErr } = await sb.from("links").insert(rows);
    if (linkErr) throw new Error(`links ${path}: ${linkErr.message}`);
  }
  return title;
}
