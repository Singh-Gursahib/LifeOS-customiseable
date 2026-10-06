#!/usr/bin/env node
// LifeOS Learning Space CLI — lets Claude Code curate learning content into
// Supabase. See docs/LEARNING_CURATION.md for the full weekly workflow + voice.
// Run from repo root; reads credentials from .env.local.
//
//   node scripts/learn.mjs topics                         list topics
//   node scripts/learn.mjs articles [topicSlug]           list articles
//   node scripts/learn.mjs read <articleSlug>             print an article's markdown
//   node scripts/learn.mjs add-topic <slug> <title> <blurb> [active|planned]
//   node scripts/learn.mjs add-article <file.json|->      insert/upsert one article from JSON
//   node scripts/learn.mjs seed                           load seed/learning.mjs (idempotent upsert)
//
// Article JSON shape (all fields except slug/topic_slug/title/content optional):
//   { slug, topic_slug, title, hook, content, level, est_min, tags[], why_now, status }
//   level ∈ foundation|next-step|stretch   status ∈ published|draft
import { readFileSync } from "node:fs";
import { supabase, resolveSpace } from "./_lib.mjs";

const SPACE = resolveSpace(process.argv, "private");
const [cmd, ...rawArgs] = process.argv.slice(2);
const args = rawArgs.filter((a, i) => a !== "--space" && rawArgs[i - 1] !== "--space");
if (cmd) console.error(`[space: ${SPACE}]`);
const sb = supabase();

const commands = {
  async topics() {
    const { data } = await sb.from("learning_topics").select("*").eq("space", SPACE).order("sort");
    for (const t of data ?? []) console.log(`${t.status === "active" ? "◆" : "○"} ${t.slug.padEnd(20)} ${t.title}  — ${t.blurb}`);
  },

  async articles() {
    let q = sb.from("learning_articles").select("slug,topic_slug,title,level,est_min,status,read_at").eq("space", SPACE).order("created_at", { ascending: false });
    if (args[0]) q = q.eq("topic_slug", args[0]);
    const { data } = await q;
    for (const a of data ?? [])
      console.log(`[${a.level}] ${a.status === "published" ? " " : "D"} ${a.read_at ? "✓" : " "} ${a.topic_slug.padEnd(18)} ${a.slug}  (${a.est_min}m) — ${a.title}`);
  },

  async read() {
    const { data } = await sb.from("learning_articles").select("content").eq("space", SPACE).eq("slug", req(0, "slug")).maybeSingle();
    if (!data) fail(`no article '${args[0]}'`);
    process.stdout.write(data.content);
  },

  async "add-topic"() {
    const row = { slug: req(0, "slug"), title: req(1, "title"), blurb: req(2, "blurb"), status: args[3] || "active" };
    const { error } = await sb.from("learning_topics").upsert({ ...row, space: SPACE }, { onConflict: "space,slug" });
    if (error) fail(error.message);
    console.log(`upserted topic ${row.slug}`);
  },

  async "add-article"() {
    const src = req(0, "file.json or -");
    const raw = src === "-" ? readFileSync(0, "utf8") : readFileSync(src, "utf8");
    const a = JSON.parse(raw);
    await upsertArticle(a);
    console.log(`upserted article ${a.slug}`);
  },

  async seed() {
    const { topics, articles } = await import(new URL("../seed/learning.mjs", import.meta.url));
    for (const t of topics) {
      const { error } = await sb.from("learning_topics").upsert({ ...t, space: SPACE }, { onConflict: "space,slug" });
      if (error) fail(`topic ${t.slug}: ${error.message}`);
    }
    console.log(`upserted ${topics.length} topics`);
    for (const a of articles) await upsertArticle(a);
    console.log(`upserted ${articles.length} articles`);
  },
};

async function upsertArticle(a) {
  if (!a.slug || !a.topic_slug || !a.title) fail("article needs slug, topic_slug, title");
  const row = {
    slug: a.slug,
    topic_slug: a.topic_slug,
    title: a.title,
    hook: a.hook ?? "",
    content: a.content ?? "",
    level: a.level ?? "next-step",
    est_min: a.est_min ?? 6,
    tags: a.tags ?? [],
    why_now: a.why_now ?? "",
    status: a.status ?? "published",
  };
  const { error } = await sb.from("learning_articles").upsert({ ...row, space: SPACE }, { onConflict: "space,slug" });
  if (error) fail(`article ${a.slug}: ${error.message}`);
}

function req(i, name) {
  if (args[i] == null) fail(`missing <${name}>`);
  return args[i];
}
function fail(m) {
  console.error(`error: ${m}`);
  process.exit(1);
}

const run = commands[cmd];
if (!run) {
  console.error("usage: node scripts/learn.mjs <topics|articles|read|add-topic|add-article|seed> …");
  process.exit(1);
}
run().catch((e) => fail(e.message));
