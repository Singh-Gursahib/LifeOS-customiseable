// Seed the LifeOS Supabase vault from seed/vault/**.md + seed/captures.json.
// Usage: node scripts/seed.mjs [--wipe]
// Idempotent: upserts documents by path, rebuilds links, skips existing captures.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { load as yamlLoad } from "js-yaml";
const yaml = { load: yamlLoad };

// Seeds the FICTIONAL cover vault by default — that's what seed/vault holds.
// Override with --space private only if you really mean to overwrite the real one.
const SPACES = ["decoy", "private"];
const spaceArg = process.argv.indexOf("--space");
const SPACE = (spaceArg >= 0 ? process.argv[spaceArg + 1] : undefined) ?? process.env.LIFEOS_SPACE ?? "decoy";
if (!SPACES.includes(SPACE)) {
  console.error(`error: --space must be one of ${SPACES.join(", ")} (got '${SPACE}')`);
  process.exit(1);
}
console.error(`[space: ${SPACE}]`);

const ROOT = new URL("..", import.meta.url).pathname;
const VAULT = join(ROOT, "seed/vault");

// --- tiny .env.local loader (no dotenv dep); real env vars win ---
if (existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("error: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.\n  cp .env.example .env.local  and fill it in.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const WIKI_RE = /\[\[([^\]\n#|^]+)(?:[#^][^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g;
const TAG_RE = /(?:^|[\s(])#([A-Za-z][\w\-/]*)/g;
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

function parse(text) {
  let body = text, frontmatter = {};
  const m = FM_RE.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    try { frontmatter = yaml.load(m[1]) ?? {}; } catch {}
  }
  const stripped = body.replace(CODE_RE, " ");
  const wikiLinks = [...stripped.matchAll(WIKI_RE)].map((w) => ({ target: w[1].trim(), display: w[2]?.trim() }));
  const tags = new Set();
  for (const t of stripped.matchAll(TAG_RE)) tags.add(t[1].toLowerCase());
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) fmTags.forEach((t) => typeof t === "string" && tags.add(t.toLowerCase()));
  return { frontmatter, body, wikiLinks, tags: [...tags] };
}

const FAVORITES = new Set([
  "education/courses/algorithms.md",
  "health/fitness.md",
  "projects/portfolio-site.md",
  "people/family/ana.md",
]);

async function main() {
  if (process.argv.includes("--wipe")) {
    console.log("wiping documents/links/captures…");
    await supabase.from("links").delete().eq("space", SPACE);
    await supabase.from("documents").delete().eq("space", SPACE);
    await supabase.from("captures").delete().eq("space", SPACE);
  }

  const paths = walk(VAULT).map((p) => relative(VAULT, p));
  console.log(`seeding ${paths.length} documents…`);

  const rows = [];
  for (const path of paths) {
    const raw = readFileSync(join(VAULT, path), "utf8");
    const { frontmatter, body, tags } = parse(raw);
    const basename = path.split("/").pop().replace(/\.md$/, "");
    const title =
      (typeof frontmatter.title === "string" && frontmatter.title.trim()) ||
      body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      basename;
    const created = frontmatter.created ? new Date(`${frontmatter.created}T12:00:00-07:00`) : new Date();
    const updated = frontmatter.updated ? new Date(`${frontmatter.updated}T12:00:00-07:00`) : created;
    rows.push({
      path,
      folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
      title,
      content: raw,
      frontmatter,
      tags,
      is_favorite: FAVORITES.has(path),
      word_count: body.split(/\s+/).filter(Boolean).length,
      created_at: created.toISOString(),
      updated_at: updated.toISOString(),
      accessed_at: FAVORITES.has(path) ? new Date().toISOString() : null,
    });
  }

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from("documents").upsert(rows.slice(i, i + 50).map((r) => ({ ...r, space: SPACE })), { onConflict: "space,path" });
    if (error) throw new Error(`documents upsert: ${error.message}`);
  }
  console.log("documents upserted.");

  // rebuild links
  const byBasename = new Map();
  const byPath = new Set(rows.map((r) => r.path));
  for (const r of rows) {
    const base = r.path.split("/").pop().replace(/\.md$/, "").toLowerCase();
    if (base !== "_index") byBasename.set(base, r.path);
  }
  // folder name aliases: [[courses]] -> education/courses/_index.md (real notes win over aliases)
  for (const r of rows) {
    if (!r.path.endsWith("/_index.md")) continue;
    const folderName = r.folder.split("/").pop().toLowerCase();
    if (folderName && !byBasename.has(folderName)) byBasename.set(folderName, r.path);
  }

  const linkRows = [];
  for (const path of paths) {
    const raw = readFileSync(join(VAULT, path), "utf8");
    const { wikiLinks } = parse(raw);
    const seen = new Set();
    for (const l of wikiLinks) {
      if (seen.has(l.target)) continue;
      seen.add(l.target);
      const t = l.target.replace(/\.md$/i, "");
      const resolved =
        (byPath.has(`${t}.md`) && `${t}.md`) ||
        (byPath.has(`${t}/_index.md`) && `${t}/_index.md`) ||
        byBasename.get((t.split("/").pop() ?? t).toLowerCase()) ||
        null;
      linkRows.push({ source_path: path, target_raw: l.target, target_path: resolved });
    }
  }
  await supabase.from("links").delete().eq("space", SPACE);
  for (let i = 0; i < linkRows.length; i += 100) {
    const { error } = await supabase.from("links").insert(linkRows.slice(i, i + 100).map((r) => ({ ...r, space: SPACE })));
    if (error) throw new Error(`links insert: ${error.message}`);
  }
  const unresolved = linkRows.filter((l) => !l.target_path).length;
  console.log(`links rebuilt: ${linkRows.length} (${unresolved} unresolved).`);

  // captures (skip if any already exist — don't duplicate on re-seed)
  const { count } = await supabase.from("captures").select("*", { count: "exact", head: true }).eq("space", SPACE);
  if ((count ?? 0) === 0 && existsSync(join(ROOT, "seed/captures.json"))) {
    const captures = JSON.parse(readFileSync(join(ROOT, "seed/captures.json"), "utf8"));
    const { error } = await supabase.from("captures").insert(captures.map((c) => ({ ...c, space: SPACE })));
    if (error) throw new Error(`captures insert: ${error.message}`);
    console.log(`captures inserted: ${captures.length}.`);
  } else {
    console.log(`captures skipped (${count} already present).`);
  }

  const { count: docCount } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("space", SPACE);
  console.log(`DONE — ${docCount} documents in vault.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
