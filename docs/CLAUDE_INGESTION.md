# LifeOS — Offline Ingestion Playbook (for Claude Code / Claude Opus)

You are ingesting the user's raw journal captures into their LifeOS markdown vault, which
lives in Supabase. This is the same job the in-app Gemini agent does, but you are the
**stronger model** the user reserves for important entries — take more care with prose,
linking, and judgment. The rulebook below matches `src/lib/ingest-prompt.ts`; if you
change one, change both.

**Run from the repo root.** All commands
use `scripts/vault.mjs`, which reads credentials from `.env.local` (must exist).

> **Which vault?** There are two (see `docs/SPACES.md`): `private` — the real journal, and
> `decoy` — a fictional cover vault. `vault.mjs` defaults to **`private`**, which is almost
> always what you want; it prints `[space: …]` on every run, so check that line before you
> write anything. Only pass `--space decoy` if the user explicitly asks for the cover vault.

## The vault in 30 seconds

- Every markdown file is a row in the `documents` table, addressed by `path`
  (e.g. `people/friends/maya.md`). Wiki-link edges live in `links` (rebuilt automatically
  on every write). Raw captures live in `captures` with `status: draft → ingested`.
- Every folder has an `_index.md` — a ≤30-line index with one-line summaries of its notes.
  The root `_index.md` is the vault map with a `## Recent` list.
- Wiki-links resolve by basename: `[[fitness]]`, `[[maya|Maya]]`. A folder name links
  to its `_index.md` (`[[courses]]`).

## Workflow

### 1. Pull the queue and the vault

```bash
node scripts/vault.mjs captures draft          # the un-ingested captures (JSON)
node scripts/vault.mjs pull .ingest-workspace  # mirror the whole vault to local files
```

Now use your native Read / Grep / Glob tools on `.ingest-workspace/` — it's a faithful
mirror. (`.ingest-workspace/` is gitignored.)

### 2. Read the map

Read `.ingest-workspace/_index.md`, then the `_index.md` of any folder you might touch.
Skim, don't inhale — the indexes exist so you don't have to read everything.

### 3. File each capture — THREE MANDATORY PASSES

**Pass A — the daily journal note.** Every capture lands first in
`journal/YYYY/YYYY-MM-DD.md` (the capture's `entry_date`). Append a section if the day
note exists; create it with frontmatter if not. Write clean first-person prose that keeps
the user's voice — light cleanup only, never paraphrase their personality away.
Wiki-link every person/project/event/topic mentioned.

**Pass B — secondary mentions (MANDATORY).** Re-read the capture; for EVERY domain it
touches, append a one-line dated bullet to that domain's note, linking back:

```markdown
## YYYY-MM-DD
- <one-liner> — see [[YYYY-MM-DD]]
```

Signals → destinations: workouts → `health/fitness.md` · sleep → `health/sleep.md` ·
mood/homesickness → `health/mental.md` · food → `health/food.md` · spending →
`finances/expenses.md` · income/savings → `finances/income.md` / `finances/goals.md` ·
any named person → their note under `people/` (create if new) · project work → under
`projects/` · courses/research → under `education/` · jobs/applications → `career/` ·
a distinct trip/festival/milestone → `events/YYYY-MM-DD-<slug>.md` (it gets the full
story; the day note links to it).

**A 60-second voice note touching 4 domains updates 4+ files. Under-filing is failure.**

**Pass C — index upkeep.** Update the `_index.md` of every folder you created a new file
in, and refresh root `_index.md`'s `## Recent` (newest first, ~8 entries).

### 4. Conventions

Frontmatter for new files (append `updated` + `sources` on edits, never touch `created`):

```yaml
---
title: <Display Title>
summary: <one line — indexes and the assistant rely on it>
tags: [tag/one, tag/two]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [<capture_id>]
---
```

- Dated sections `## YYYY-MM-DD`, appended at file end. **Never rewrite or delete existing
  content** — append-only; the user's data is sacred.
- Tags: lowercase hierarchical — `#person/maya`, `#health/workout`, `#finance/expense`,
  `#project/portfolio-site`, `#event/<slug>`, `#mood/positive|neutral|negative`.
- New folders only for clearly recurring topics; give each a proper `_index.md`.
- Record amounts exactly as stated, in the currency the user used. Never assume or convert one.

### 5. Push and mark

```bash
node scripts/vault.mjs push .ingest-workspace   # upserts only changed files, rebuilds links
node scripts/vault.mjs mark-ingested <captureId> --files "journal/2026/2026-07-06.md,health/fitness.md" --by claude-opus
```

Only mark ingested after a successful push. Repeat for each capture.

### 6. Report

Tell the user: captures processed, files created vs updated (grouped by folder), new
people/projects/events discovered, and anything you chose not to file (and why).

## Quick single-file edits (no workspace needed)

```bash
node scripts/vault.mjs read health/fitness.md          # print a file
node scripts/vault.mjs grep "squat" health             # regex search with line numbers
node scripts/vault.mjs search "investor call"          # ranked full-text search
node scripts/vault.mjs write health/fitness.md -  << 'EOF'
<full new content>
EOF
```

## Guardrails

- Never delete `documents` rows or rewrite history sections.
- Don't rename existing files/folders — it breaks links (renames cascade in the DB, but
  basename wiki-links in prose won't follow).
- If a capture is truly unroutable, file it under `inbox/YYYY-MM-DD-<slug>.md` and say so.
- Every capture must end up referenced from at least the day note's `sources`.
