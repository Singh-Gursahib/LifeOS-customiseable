#!/usr/bin/env node
/**
 * Generates the two seed files a new user runs in the Supabase SQL Editor:
 *
 *   supabase/02_seed_demo.sql     the fictional demo vault  → space 'decoy'
 *                                 (seed/vault/**, seed/captures.json, seed/learning.mjs)
 *   supabase/03_seed_private.sql  an empty folder skeleton  → space 'private'
 *                                 (scripts/_skeleton.mjs)
 *
 *   npm run seed:sql
 *
 * Uses the SAME parser and link resolver as the app's write path (scripts/_lib.mjs),
 * so a vault seeded from SQL is identical to one seeded through the API with
 * `scripts/seed.mjs`. Re-run this after editing anything under seed/ and commit
 * the regenerated .sql files. Needs no database and no .env — it only writes files.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseDoc, buildResolver } from "./_lib.mjs";
import { skeletonRows } from "./_skeleton.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const VAULT = join(ROOT, "seed/vault");

// Notes starred in the demo vault (mirrors scripts/seed.mjs).
const FAVORITES = new Set([
  "education/courses/algorithms.md",
  "health/fitness.md",
  "projects/portfolio-site.md",
  "people/family/ana.md",
]);

// ---------------------------------------------------------------- SQL literals
// Supabase runs with standard_conforming_strings = on, so the only character that
// needs escaping inside '…' is the quote itself.
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a?.length ? `array[${a.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const json = (o) => `${q(JSON.stringify(o ?? {}))}::jsonb`;
// A note with no `created`/`updated` in its frontmatter takes the column default
// (now()) — the columns are NOT NULL, so an explicit null would be rejected.
const ts = (iso) => (iso ? `${q(iso)}::timestamptz` : "default");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

function titleOf(path, frontmatter, body) {
  return (
    (typeof frontmatter.title === "string" && frontmatter.title.trim()) ||
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    path.split("/").pop().replace(/\.md$/, "")
  );
}

function documentInsert(space, d) {
  return `insert into documents (space, path, folder, title, content, frontmatter, tags, is_favorite, word_count, accessed_at, created_at, updated_at)
values (${q(space)}, ${q(d.path)}, ${q(d.folder)}, ${q(d.title)}, ${q(d.content)}, ${json(d.frontmatter)}, ${arr(d.tags)}, ${d.is_favorite ? "true" : "false"}, ${d.word_count}, ${d.accessed_now ? "now()" : "null"}, ${ts(d.created_at)}, ${ts(d.updated_at)})
on conflict (space, path) do nothing;`;
}

function linkInserts(space, docs) {
  const resolve = buildResolver(docs.map((d) => d.path));
  const rows = [];
  for (const d of docs) {
    const seen = new Set();
    for (const l of parseDoc(d.content).wikiLinks) {
      if (seen.has(l.target)) continue;
      seen.add(l.target);
      rows.push(`(${q(space)}, ${q(d.path)}, ${q(l.target)}, ${q(resolve(l.target))})`);
    }
  }
  if (!rows.length) return { sql: "", count: 0 };
  return {
    sql: `insert into links (space, source_path, target_raw, target_path) values\n  ${rows.join(",\n  ")}\non conflict (space, source_path, target_raw) do nothing;`,
    count: rows.length,
  };
}

const banner = (lines) => `-- ${"=".repeat(77)}\n${lines.map((l) => `-- ${l}`.trimEnd()).join("\n")}\n-- ${"=".repeat(77)}\n`;

// ------------------------------------------------------------- 02: demo vault
async function buildDemo() {
  const docs = walk(VAULT)
    .map((abs) => relative(VAULT, abs))
    .sort()
    .map((path) => {
      const content = readFileSync(join(VAULT, path), "utf8");
      const { frontmatter, body, tags } = parseDoc(content);
      const created = frontmatter.created ? new Date(`${frontmatter.created}T12:00:00-07:00`).toISOString() : null;
      const updated = frontmatter.updated ? new Date(`${frontmatter.updated}T12:00:00-07:00`).toISOString() : created;
      return {
        path,
        folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
        title: titleOf(path, frontmatter, body),
        content,
        frontmatter,
        tags,
        is_favorite: FAVORITES.has(path),
        accessed_now: FAVORITES.has(path),
        word_count: body.split(/\s+/).filter(Boolean).length,
        created_at: created,
        updated_at: updated,
      };
    });
  const links = linkInserts("decoy", docs);

  const captures = JSON.parse(readFileSync(join(ROOT, "seed/captures.json"), "utf8"));
  const { topics, articles } = await import(new URL("../seed/learning.mjs", import.meta.url));

  const out = [
    banner([
      "LifeOS — DEMO VAULT seed (space 'decoy')",
      "",
      "A complete, fictional, lived-in journal so the app has something to show:",
      `${docs.length} notes, ${links.count} wiki-links, ${captures.length} draft captures, ${topics.length} learning topics, ${articles.length} articles.`,
      "Every row goes into the 'decoy' space — it can never appear in your private vault.",
      "",
      "Run AFTER 01_schema.sql, in the Supabase SQL Editor. Safe to re-run: existing",
      "rows are left untouched (on conflict do nothing).",
      "",
      "GENERATED by `npm run seed:sql` from seed/ — edit the sources, not this file.",
    ]),
    "-- To RESET the demo vault before re-seeding, uncomment these five lines:",
    "-- delete from links             where space = 'decoy';",
    "-- delete from learning_articles where space = 'decoy';",
    "-- delete from learning_topics   where space = 'decoy';",
    "-- delete from captures          where space = 'decoy';",
    "-- delete from documents         where space = 'decoy';",
    "",
    "begin;",
    "",
    `-- ----------------------------------------------------------------- documents (${docs.length})`,
    ...docs.map((d) => documentInsert("decoy", d) + "\n"),
    `-- --------------------------------------------------------------------- links (${links.count})`,
    links.sql,
    "",
    `-- ------------------------------------------------------------------ captures (${captures.length})`,
    "-- Drafts waiting to be ingested — try the INGEST button on these. Only inserted",
    "-- if the demo vault has no captures yet, so re-running never duplicates them.",
    ...captures.map(
      (c) => `insert into captures (space, entry_date, source, raw_text, duration_sec, status)
select 'decoy', ${q(c.entry_date)}::date, ${q(c.source)}, ${q(c.raw_text)}, ${c.duration_sec ?? "null"}, ${q(c.status ?? "draft")}
where not exists (select 1 from captures where space = 'decoy' and raw_text = ${q(c.raw_text)});`
    ),
    "",
    `-- ------------------------------------------------------- learning topics (${topics.length})`,
    ...topics.map(
      (t) => `insert into learning_topics (space, slug, title, blurb, status, sort)
values ('decoy', ${q(t.slug)}, ${q(t.title)}, ${q(t.blurb ?? "")}, ${q(t.status ?? "active")}, ${t.sort ?? 0})
on conflict (space, slug) do nothing;`
    ),
    "",
    `-- ----------------------------------------------------- learning articles (${articles.length})`,
    ...articles.map(
      (a) => `insert into learning_articles (space, slug, topic_slug, title, hook, content, level, est_min, tags, why_now, status)
values ('decoy', ${q(a.slug)}, ${q(a.topic_slug)}, ${q(a.title)}, ${q(a.hook ?? "")}, ${q(a.content ?? "")}, ${q(a.level ?? "next-step")}, ${a.est_min ?? 6}, ${arr(a.tags)}, ${q(a.why_now ?? "")}, ${q(a.status ?? "published")})
on conflict (space, slug) do nothing;\n`
    ),
    "commit;",
    "",
  ];
  writeFileSync(join(ROOT, "supabase/02_seed_demo.sql"), out.join("\n"));
  return { docs: docs.length, links: links.count, captures: captures.length, topics: topics.length, articles: articles.length };
}

// ---------------------------------------------------------- 03: private vault
function buildPrivate() {
  // A fixed date keeps the generated file stable across runs; the app's own write
  // path bumps `updated` the first time a capture lands in a note.
  const docs = skeletonRows("2026-01-01").map((r) => ({ ...r, is_favorite: false, accessed_now: false, created_at: null, updated_at: null }));
  const links = linkInserts("private", docs);
  const out = [
    banner([
      "LifeOS — PRIVATE VAULT seed (space 'private')",
      "",
      "Your real journal starts EMPTY. This only lays down the folder skeleton:",
      `${docs.length} files — one _index.md per folder, plus the 7 domain notes the`,
      "ingestion agent files into by name (health/fitness.md, finances/expenses.md, …).",
      "No people, no entries, no fiction. Everything else is written by you, by voice.",
      "",
      "Run AFTER 01_schema.sql. Safe to re-run — it never touches existing notes.",
      "",
      "GENERATED by `npm run seed:sql` from scripts/_skeleton.mjs.",
    ]),
    "begin;",
    "",
    ...docs.map(
      (d) => `insert into documents (space, path, folder, title, content, frontmatter, tags, word_count)
values ('private', ${q(d.path)}, ${q(d.folder)}, ${q(d.title)}, ${q(d.content)}, ${json(d.frontmatter)}, ${arr(d.tags)}, ${d.word_count})
on conflict (space, path) do nothing;\n`
    ),
    links.sql,
    "",
    "commit;",
    "",
  ];
  writeFileSync(join(ROOT, "supabase/03_seed_private.sql"), out.join("\n"));
  return { docs: docs.length, links: links.count };
}

const demo = await buildDemo();
const priv = buildPrivate();
console.log(`✓ supabase/02_seed_demo.sql     ${demo.docs} notes · ${demo.links} links · ${demo.captures} captures · ${demo.topics} topics · ${demo.articles} articles`);
console.log(`✓ supabase/03_seed_private.sql  ${priv.docs} skeleton files · ${priv.links} links`);
