#!/usr/bin/env node
// LifeOS vault CLI — lets Claude Code (or you) work the Supabase vault from the
// terminal. See docs/CLAUDE_INGESTION.md for the offline-ingestion workflow.
//
//   node scripts/vault.mjs list [folder]
//   node scripts/vault.mjs read <path>
//   node scripts/vault.mjs grep <pattern> [folder]
//   node scripts/vault.mjs search <query>
//   node scripts/vault.mjs write <path> <localFile|->      (content from file or stdin)
//   node scripts/vault.mjs captures [draft|ingested|failed]
//   node scripts/vault.mjs mark-ingested <captureId> --files "a.md,b.md" [--by claude-code]
//   node scripts/vault.mjs pull <dir>                       (mirror vault -> local dir)
//   node scripts/vault.mjs push <dir>                       (upsert changed local files -> vault)
//
// All commands act on ONE space. Defaults to 'private' (the real journal);
// pass --space decoy (or LIFEOS_SPACE=decoy) for the cover vault.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { supabase, saveDocument, resolveSpace } from "./_lib.mjs";

const [cmd, ...rawArgs] = process.argv.slice(2);
const SPACE = resolveSpace(process.argv, "private");
// strip --space <id> so positional args keep their meaning
const args = rawArgs.filter((a, i) => a !== "--space" && rawArgs[i - 1] !== "--space");
const sb = supabase();
if (cmd) console.error(`[space: ${SPACE}]`);

const commands = {
  async list() {
    const folder = args[0];
    let q = sb.from("documents").select("path,title,frontmatter").eq("space", SPACE).order("path");
    if (folder) q = q.like("path", `${folder.replace(/\/$/, "")}%`);
    const { data } = await q;
    for (const d of data ?? []) {
      const s = typeof d.frontmatter?.summary === "string" ? ` — ${d.frontmatter.summary}` : "";
      console.log(`${d.path}${s}`);
    }
  },

  async read() {
    const { data } = await sb.from("documents").select("content").eq("space", SPACE).eq("path", req(0, "path")).maybeSingle();
    if (!data) fail(`No file at '${args[0]}'`);
    process.stdout.write(data.content);
  },

  async grep() {
    const pattern = req(0, "pattern");
    let q = sb.from("documents").select("path,content").eq("space", SPACE);
    if (args[1]) q = q.like("path", `${args[1].replace(/\/$/, "")}%`);
    const { data } = await q;
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    let n = 0;
    for (const d of data ?? []) {
      const lines = d.content.split("\n");
      for (let i = 0; i < lines.length && n < 80; i++) {
        if (re.test(lines[i])) {
          console.log(`${d.path}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
          n++;
        }
      }
    }
    if (!n) console.log(`(no matches for /${pattern}/i)`);
  },

  async search() {
    const { data } = await sb
      .from("documents")
      .select("path,title")
      .eq("space", SPACE)
      .textSearch("fts", req(0, "query"), { type: "websearch", config: "english" })
      .limit(12);
    for (const d of data ?? []) console.log(`${d.path} — ${d.title}`);
    if (!data?.length) console.log("(no full-text matches)");
  },

  async write() {
    const path = req(0, "path");
    const src = req(1, "local file or -");
    const content = src === "-" ? readFileSync(0, "utf8") : readFileSync(src, "utf8");
    const title = await saveDocument(sb, SPACE, path, content);
    console.log(`wrote ${path} ("${title}") — links rebuilt`);
  },

  async captures() {
    let q = sb.from("captures").select("id,entry_date,source,status,duration_sec,raw_text,files_touched").eq("space", SPACE).order("captured_at");
    if (args[0]) q = q.eq("status", args[0]);
    const { data } = await q;
    console.log(JSON.stringify(data ?? [], null, 2));
  },

  async "mark-ingested"() {
    const id = req(0, "captureId");
    const filesArg = flag("--files");
    const by = flag("--by") ?? "claude-code";
    const { error } = await sb
      .from("captures")
      .update({
        status: "ingested",
        ingested_at: new Date().toISOString(),
        ingested_by: by,
        files_touched: filesArg ? filesArg.split(",").map((s) => s.trim()).filter(Boolean) : [],
      })
      .eq("space", SPACE)
      .eq("id", id);
    if (error) fail(error.message);
    console.log(`capture ${id} marked ingested (by ${by})`);
  },

  async pull() {
    const dir = req(0, "target dir");
    const { data } = await sb.from("documents").select("path,content").eq("space", SPACE);
    for (const d of data ?? []) {
      const dest = join(dir, d.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, d.content);
    }
    console.log(`pulled ${data?.length ?? 0} files -> ${dir}`);
  },

  async push() {
    const dir = req(0, "source dir");
    if (!existsSync(dir)) fail(`No such dir: ${dir}`);
    const { data } = await sb.from("documents").select("path,content").eq("space", SPACE);
    const remote = new Map((data ?? []).map((d) => [d.path, d.content]));
    const walk = (d) =>
      readdirSync(d).flatMap((name) => {
        const p = join(d, name);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
      });
    let changed = 0;
    for (const abs of walk(dir)) {
      const path = relative(dir, abs);
      const content = readFileSync(abs, "utf8");
      if (remote.get(path) !== content) {
        await saveDocument(sb, SPACE, path, content);
        console.log(`  upserted ${path}`);
        changed++;
      }
    }
    console.log(`push done — ${changed} file(s) changed`);
  },
};

function req(i, name) {
  if (!args[i]) fail(`Missing <${name}>`);
  return args[i];
}
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const run = commands[cmd];
if (!run) {
  console.error("usage: node scripts/vault.mjs <list|read|grep|search|write|captures|mark-ingested|pull|push> … [--space decoy|private]");
  process.exit(1);
}
run().catch((e) => fail(e.message));
