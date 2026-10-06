#!/usr/bin/env node
/**
 * Space admin CLI — the two accounts behind the PIN screen.
 *
 *   node scripts/spaces.mjs status
 *   node scripts/spaces.mjs set-pin decoy <4-digit-pin>
 *   node scripts/spaces.mjs set-pin private <4-digit-pin>
 *   node scripts/spaces.mjs seed-private            # folder skeleton, no content
 *   node scripts/spaces.mjs wipe private --yes      # empty a space back out
 *
 * PIN hashing MUST stay identical to src/lib/auth.ts:
 *   pbkdf2(hmac_sha256(AUTH_SECRET, pin), salt, 210000, 32, sha256)
 */
import { pbkdf2Sync, randomBytes, createHmac } from "node:crypto";
import { supabase, loadEnv } from "./_lib.mjs";
import { SKELETON, DOMAIN_NOTES, skeletonRows } from "./_skeleton.mjs";

const ITERATIONS = 210_000;
const SPACES = ["decoy", "private"];

function pepper() {
  loadEnv();
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    console.error("AUTH_SECRET missing or too short in .env.local (need ≥32 chars).");
    process.exit(1);
  }
  return s;
}

function derive(pin, saltHex) {
  const peppered = createHmac("sha256", pepper()).update(pin).digest();
  return pbkdf2Sync(peppered, Buffer.from(saltHex, "hex"), ITERATIONS, 32, "sha256").toString("hex");
}

const sb = supabase();
const [cmd, ...args] = process.argv.slice(2);

async function status() {
  const { data } = await sb.from("spaces").select("id,label,pin_hash,updated_at").order("id");
  for (const s of data ?? []) {
    const counts = await countsFor(s.id);
    console.log(
      `${s.id.padEnd(8)} pin:${s.pin_hash ? "set" : "UNSET"}  docs:${counts.docs}  links:${counts.links}  captures:${counts.captures}  topics:${counts.topics}  articles:${counts.articles}`
    );
  }
}

async function countsFor(space) {
  const out = {};
  for (const [key, table] of [
    ["docs", "documents"],
    ["links", "links"],
    ["captures", "captures"],
    ["topics", "learning_topics"],
    ["articles", "learning_articles"],
  ]) {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true }).eq("space", space);
    out[key] = count ?? 0;
  }
  return out;
}

async function setPin(space, pin) {
  if (!SPACES.includes(space)) throw new Error(`space must be one of ${SPACES.join(", ")}`);
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits");

  // Refuse a PIN that already opens the other space — one of them would become unreachable.
  const { data: rows } = await sb.from("spaces").select("id,pin_hash,pin_salt");
  for (const r of rows ?? []) {
    if (r.id !== space && r.pin_hash && r.pin_salt && derive(pin, r.pin_salt) === r.pin_hash) {
      throw new Error(`that PIN already opens '${r.id}' — pick a different one`);
    }
  }

  const salt = randomBytes(16).toString("hex");
  const { error } = await sb
    .from("spaces")
    .update({ pin_hash: derive(pin, salt), pin_salt: salt, pin_iterations: ITERATIONS, updated_at: new Date().toISOString() })
    .eq("id", space);
  if (error) throw new Error(error.message);
  console.log(`✓ PIN set for '${space}'`);
}

async function seedPrivate() {
  const { count } = await sb.from("documents").select("*", { count: "exact", head: true }).eq("space", "private");
  if (count) {
    console.log(`private already has ${count} docs — nothing seeded. Use 'wipe private --yes' first if you meant to reset.`);
    return;
  }
  const rows = skeletonRows();
  for (const r of rows) {
    const { error } = await sb.from("documents").upsert(
      {
        space: "private",
        path: r.path,
        folder: r.folder,
        title: r.title,
        content: r.content,
        frontmatter: r.frontmatter,
        tags: r.tags,
        word_count: r.word_count,
      },
      { onConflict: "space,path" }
    );
    if (error) throw new Error(`${r.path}: ${error.message}`);
  }
  console.log(`✓ seeded ${rows.length} files into 'private' (${SKELETON.length} indexes + ${DOMAIN_NOTES.length} domain notes)`);
}

async function wipe(space) {
  if (!SPACES.includes(space)) throw new Error(`space must be one of ${SPACES.join(", ")}`);
  if (!process.argv.includes("--yes")) throw new Error("refusing to wipe without --yes");
  for (const table of ["links", "learning_articles", "learning_topics", "captures", "documents"]) {
    const { error } = await sb.from(table).delete().eq("space", space);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✓ wiped '${space}'`);
}

try {
  switch (cmd) {
    case "status":
      await status();
      break;
    case "set-pin":
      await setPin(args[0], args[1]);
      break;
    case "seed-private":
      await seedPrivate();
      break;
    case "wipe":
      await wipe(args[0]);
      break;
    default:
      console.log(
        "usage:\n  spaces.mjs status\n  spaces.mjs set-pin <decoy|private> <4-digit-pin>\n  spaces.mjs seed-private\n  spaces.mjs wipe <space> --yes"
      );
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
