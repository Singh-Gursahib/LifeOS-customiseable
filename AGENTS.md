# LifeOS — guide for AI coding agents (Codex, Cursor, …)

A personal journal + knowledge-base PWA. Mobile-first, dark "Mission Control" aesthetic.
Next.js 16 (App Router) + React 19 + Tailwind v4 + Supabase. Deployed on Vercel.
One model for everything: **google/gemini-3.7-flash via OpenRouter**. See "Models" below.

Run everything from the repo root; secrets are in `.env.local` (gitignored).

## Key docs — read the relevant one before working in that area

- **`docs/DESIGN.md`** — the design system (colors, type, surface devices). Match it exactly.
- **`docs/CLAUDE_INGESTION.md`** — how to ingest journal drafts into the vault (three-pass
  routing). Use when asked to "ingest my drafts / process captures".
- **`docs/LEARNING_CURATION.md`** — how to curate Learning Space articles + the user's
  dense-learning philosophy. Use when asked to "curate articles / do my learning review".
- **`docs/SPACES.md`** — the two PIN-gated vaults (`decoy` / `private`) and how their
  isolation is enforced. **Read this before touching any query, auth code or script.**

## Scripts (from repo root)

Every data script acts on ONE space and prints which. `--space decoy|private` (or
`LIFEOS_SPACE`) overrides the default shown below.

- `node scripts/spaces.mjs status|set-pin|seed-private|wipe` — the two accounts + their PINs
- `node scripts/vault.mjs …` — vault CLI, **defaults to `private`**
  (list/read/grep/search/write/pull/push/captures/mark-ingested)
- `node scripts/learn.mjs …` — Learning Space CLI, **defaults to `private`**
- `node scripts/seed.mjs [--wipe]` — seeds the fictional vault via the API, **defaults to `decoy`**
- `npm run seed:sql` — regenerates `supabase/02_seed_demo.sql` + `03_seed_private.sql` from
  `seed/` and `scripts/_skeleton.mjs`. Re-run after editing either, and commit the output.
- `bash scripts/deploy-vercel.sh` — set env vars + deploy to prod (needs `vercel login`)

## Data model (Supabase — `supabase/01_schema.sql`)

- `documents` (markdown files, FTS + trigram), `links` (wiki-edges), `captures` (drafts inbox)
- `learning_topics`, `learning_articles` (Learning Space)
- `spaces` (the two accounts + PIN hashes), `auth_throttle` (brute-force limiter)
- RLS on with no policies — all access is server-side via `SUPABASE_SECRET_KEY`.
- **Every content row carries `space`, and every query MUST filter on it.** `space` is a
  mandatory first parameter on all data functions, and always comes from the session
  cookie — never from a client argument. See `docs/SPACES.md`.

## Models

**Everything runs on `google/gemini-3.7-flash` via OpenRouter, on ONE key**
(`OPENROUTER_API_KEYS`) — see `src/lib/llm.ts`. Requests carry no app-identifying headers
(see `postChat`) and every request — audio and text alike — sets
`provider: { data_collection: "deny" }`, because all of them carry journal content.
Extra comma-separated keys are failover only; `postChat()` rotates on auth/quota errors.

- **Transcription** — `OPENROUTER_TRANSCRIBE_MODEL` (kept as its own var so audio can be
  pinned to a different model later; the key is shared).
  **Do not add `reasoning: { effort }` to that request**: on 3.7 it makes the provider
  truncate the reply with `finish_reason: "content_filter"`, silently, partway through.
  `transcribeAudio()` rejects any non-`stop` finish reason for exactly this reason.
- **Assistant + ingestion** — `OPENROUTER_MODEL`. Agentic tool loops in `ask.ts` /
  `ingest.ts`, parallel tool calls, ~52s budget. Measured: an Ask answers in ~6s, a full
  ingest run takes ~40s and costs ~$0.004.
- **Fallback only** — `src/lib/gemini.ts` `withGemini()` (direct Gemini API, cyclic key
  rotation, `GEMINI_API_KEYS`). Used if OpenRouter transcription is unreachable.

Avoid pinning `:free` model slugs: OpenRouter delists them without notice, and the
agent loops 404 until someone notices.

## Conventions

- Verify UI changes in the browser (mobile viewport) — this is a phone-first PWA. The app
  is PIN-gated (two vaults — see `docs/SPACES.md`); ask the user for a code rather than
  guessing, and never write either code into a file.
- Pages are `force-dynamic` on purpose — a cached render belongs to one space and must
  never be replayed to the other. `loading.tsx` skeletons cover the latency.
- Don't commit secrets; sweep the staged diff before pushing.
