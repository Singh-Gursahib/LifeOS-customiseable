# LifeOS

**A private, voice-first journal that files itself.** Talk about your day for a minute. LifeOS
transcribes it, then an AI agent files it into a linked markdown knowledge base — the day's
entry, plus a line in every note it touches: the person you met, the workout you did, the
money you spent. Over weeks it becomes a searchable, graph-shaped record of your life that you
can ask questions of.

Mobile-first PWA · Next.js 16 · Supabase · Gemini 3.7 Flash via OpenRouter · dark
"Mission Control" interface.

```
 "Studied with Maya for three hours for the algorithms midterm…
  bubble tea after, eight dollars. Mom called — she wants me
  home for the long weekend."                        ← 40 seconds of speech
                         │
                         ▼
 journal/2026/2026-10-05.md          the day, in your words
 people/friends/maya.md              + studied DP for the midterm
 education/courses/algorithms.md     + midterm prep: knapsack clicked
 people/family/mom.md                + wants me home for the long weekend
 finances/expenses.md                + $8 bubble tea
 …and the folder indexes             a typical run: ~40 s, ~$0.004
```

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Two vaults behind one PIN](#two-vaults-behind-one-pin)
- [Setup](#setup) — about 15 minutes
- [Deploying to Vercel](#deploying-to-vercel)
- [Using it](#using-it)
- [Costs](#costs)
- [Privacy & security](#privacy--security)
- [Customising](#customising)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [License](#license)

---

## Features

| | |
| --- | --- |
| **Capture** | Record in-app (with a live waveform), upload an iPhone voice memo, or type. Audio is conditioned *in the browser* before upload — silences trimmed, then sped up 2× with pitch preserved — so a recording costs about half the tokens and bytes. Uploaded memos get the same treatment, and long audio is split into chunks and transcribed in order automatically. |
| **Transcription** | Speech in English, Hindi or Punjabi comes back as English text (the prompt is exactly *"Transcribe this in English."*). You review and edit it before anything is saved. |
| **Save or ingest** | Keep a capture as a **draft**, or **ingest** it straight away. The drafts tab shows ingestion live — every file the agent writes, as it writes it — then a report with links to each note it touched. |
| **The ingestion agent** | A grep → read → write tool loop, in the style of a coding agent, that files every capture in three passes: the **day note**, a dated line in **every domain the capture touches** (people, health, money, projects, study…), then the **folder indexes**. It writes in your first person, records only what you said, and reuses your folder structure. |
| **Vault** | Every note is markdown with `[[wiki-links]]`, folders and sub-folders, and an `_index.md` per folder summarising its contents. Browse, search, edit, star, and follow backlinks. |
| **Graph** | An Obsidian-style force graph of how your notes connect. Daily logs aren't drawn as nodes — instead, topics mentioned on the same day are linked to each other. |
| **Ask** | *"When is my algorithms midterm?"* The assistant searches and reads your vault with tools, batching several calls at once, and answers with the notes it cited. |
| **Learning Space** | Curated reading, written for you from your own journal by an AI curator, following a "dense learning" philosophy. See [`docs/LEARNING_CURATION.md`](docs/LEARNING_CURATION.md). |
| **Two vaults, one PIN screen** | One code opens a convincing demo journal; another opens your real one. [More below.](#two-vaults-behind-one-pin) |
| **Installable** | A standalone PWA with safe-area handling, built to live on your phone's home screen. |

## How it works

```
 ┌────────────── phone (PWA) ──────────────┐
 │ record → trim silence → 2× speed → WAV  │   audio is conditioned client-side
 └───────────────────┬─────────────────────┘
                     │  HTTPS — session cookie (HMAC-signed, httpOnly)
 ┌───────────────────▼─────────────────────────────────────────────────────┐
 │ Next.js on Vercel                                                       │
 │                                                                         │
 │  src/proxy.ts ── the gate: no valid session → /lock (API routes → 401)  │
 │                                                                         │
 │  /api/transcribe ─┐                                                     │
 │  /api/ingest  ────┼── src/lib/llm.ts ─────────► OpenRouter              │
 │  /api/ask ────────┘   one key · no app headers  (gemini-3.7-flash,      │
 │        │              · data_collection: deny    no-retention routing)  │
 │        ▼                                                                │
 │  src/lib/agent-tools.ts   list · read · grep · keyword_search ·         │
 │                           append_section · edit_file · write_file       │
 │        │                                                                │
 │  pages (server components) ── queries.ts / mutations.ts                 │
 │        │   every call takes the session's `space` as its first argument │
 └────────┼────────────────────────────────────────────────────────────────┘
          │  secret key — server only
 ┌────────▼───────────────────────────────────────────┐
 │ Supabase Postgres                                  │
 │ documents · links · captures · learning_* · spaces │
 │ RLS on, no policies → the public key reads nothing │
 └────────────────────────────────────────────────────┘
```

**The capture lifecycle:** `record → transcribe → review → draft → ingest → filed`. A capture
is a row in `captures` (`draft → ingesting → ingested`). Ingestion runs as a Server-Sent
Events stream, so the UI shows each write as it lands. Writes apply immediately, so a run that
times out partway keeps what it filed rather than retrying and duplicating it. A run killed by
the platform is reset after two minutes and can be retried.

**Data model** ([`supabase/01_schema.sql`](supabase/01_schema.sql)):

| Table | Holds |
| --- | --- |
| `documents` | Every markdown file, including `_index.md`. Full-text (`tsvector`) and trigram indexes. |
| `links` | Wiki-link edges, rebuilt from a note's `[[links]]` on every write. |
| `captures` | The inbox of raw voice / text / upload captures. |
| `learning_topics`, `learning_articles` | The Learning Space roadmap and articles. |
| `spaces` | The two accounts and their PIN hashes. |
| `auth_throttle` | Failed-PIN counter, keyed by a hashed IP. |

## Two vaults behind one PIN

LifeOS opens on a four-digit PIN pad, and the code decides which vault you get.

| Space | Seeded with | Purpose |
| --- | --- | --- |
| `decoy` | A small **fictional** journal: 38 notes about a computer science student — three friends, a family, two courses, a few weeks of everyday entries — plus 2 drafts to try ingesting and a Learning Space. | The code you can hand out, or use to demo the app without exposing anything real. |
| `private` | An **empty skeleton**: the same folders, an empty index in each, and the seven domain notes the agent files into. No people, no entries. | Your actual journal. |

They are separate end to end: separate notes, links, captures and Learning Space. Every table
carries a `space` column; every query filters on it; composite foreign keys stop the database
from linking across vaults; and the space always comes from the signed session cookie, never
from anything the browser sends.

The point is **deniability rather than concealment** — someone in the demo vault has nothing to
find. The access-settings screen never renders in the demo vault's HTML; its URL answers with
the same 404 as a path that never existed; the cookie holds an opaque digest, not a vault name;
and the unlock endpoint responds identically, in the same time, for either code. The full
design is in [`docs/SPACES.md`](docs/SPACES.md).

---

## Setup

### What you need

- **Node.js 20+**
- A **[Supabase](https://supabase.com)** project. The free tier is enough.
- An **[OpenRouter](https://openrouter.ai)** API key with a few dollars of credit. One key runs
  transcription, ingestion and the assistant.

### 1. Get the code

```bash
git clone https://github.com/Singh-Gursahib/LifeOS-customiseable.git
cd LifeOS-customiseable
npm install
```

### 2. Create the database

In your Supabase dashboard, open **SQL Editor → New query**. Run these three files **in order**:
open each one, paste its whole contents, and press **Run**.

| # | File | What it does |
| --- | --- | --- |
| 1 | [`supabase/01_schema.sql`](supabase/01_schema.sql) | Creates the tables, keys, indexes and row-level security. |
| 2 | [`supabase/02_seed_demo.sql`](supabase/02_seed_demo.sql) | Fills the **demo** vault with the fictional journal. |
| 3 | [`supabase/03_seed_private.sql`](supabase/03_seed_private.sql) | Lays down the empty folder skeleton of your **private** vault. |

All three are safe to run again: existing rows are left alone. To skip the demo, leave out
file 2. The demo vault will then be empty, but its PIN still works.

<details>
<summary>Prefer the terminal?</summary>

After step 3 below, the same seeds can be loaded through the API:

```bash
npm run seed                       # demo vault from seed/vault/**
npm run learn -- seed --space decoy
npm run spaces -- seed-private     # private skeleton
```

You still need to run `01_schema.sql` in the SQL Editor first.
</details>

### 3. Configure the environment

```bash
cp .env.example .env.local
npm run secret                     # prints a random AUTH_SECRET — paste it into .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API → the **secret** key (`sb_secret_…`), or the legacy `service_role` key |
| `AUTH_SECRET` | The output of `npm run secret`, at least 32 characters |
| `OPENROUTER_API_KEYS` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |

You don't need the Supabase publishable/anon key. The browser never talks to Supabase
directly. Everything optional is documented in [`.env.example`](.env.example).

### 4. Set your two PINs

PINs are hashed with `AUTH_SECRET`, which never goes in the database, so they're set from the
terminal rather than in SQL:

```bash
npm run spaces -- set-pin private 4821    # your real journal — pick your own
npm run spaces -- set-pin decoy 0000      # the demo
npm run spaces -- status                  # check: both show pin:set
```

The two codes must differ; the command refuses a clash. You can change either one later in the
app under **sidebar → ♥ → Access** (visible only in the private vault).

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter a code. If you see
`NO ACCESS CODES SET`, step 4 hasn't run yet against this database.

---

## Deploying to Vercel

**From the dashboard:** push your copy to GitHub, import it at
[vercel.com/new](https://vercel.com/new), and add the same environment variables you put in
`.env.local`. Every push to `main` then redeploys.

**From the terminal:**

```bash
npm i -g vercel && vercel login
vercel link          # once — create or pick a project
npm run deploy       # uploads the variables from .env.local, then deploys to production
```

Then open the URL on your phone and choose **Add to Home Screen**.

> **Pick a project name that doesn't describe the app.** Vercel URLs are public. A neutral name
> doesn't make the app any more secure (the PIN does that), but it doesn't advertise a journal
> either.

The free Hobby plan works. Its 60-second function limit is why the ingestion and Ask agents
work to a 52-second budget. A typical ingest takes about 40 seconds.

---

## Using it

1. **Capture**: tap the orange button. Record, upload a voice memo, or type.
2. **Review**: edit the transcript. Captures are dated the day you make them.
3. **Save as draft**, or **Ingest** to file it now and watch the agent work.
4. **Explore**: open the vault, follow links and backlinks, check the graph, or ask a question.

**Ingesting with a stronger model offline.** The drafts queue is also reachable from the
terminal, so a coding agent such as Claude Code can process important entries with more care,
using the same three-pass rules as the in-app agent. See
[`docs/CLAUDE_INGESTION.md`](docs/CLAUDE_INGESTION.md).

### Scripts

All data scripts act on **one** vault and print which (`[space: private]`). Add
`--space decoy|private` to choose, or set `LIFEOS_SPACE`.

| Command | Does |
| --- | --- |
| `npm run spaces -- status \| set-pin \| seed-private \| wipe` | Manage the two vaults and their PINs |
| `npm run vault -- list \| read \| grep \| search \| write \| captures \| pull \| push` | Work with a vault from the terminal (defaults to `private`) |
| `npm run learn -- topics \| articles \| add-topic \| add-article \| seed` | Manage the Learning Space (defaults to `private`) |
| `npm run seed [-- --wipe]` | Seed the demo vault through the API (defaults to `decoy`) |
| `npm run seed:sql` | Regenerate `02_seed_demo.sql` and `03_seed_private.sql` from `seed/` |
| `npm run secret` | Print a fresh `AUTH_SECRET` |
| `npm run deploy` | Upload env vars and deploy to Vercel |

---

## Costs

Everything runs on `google/gemini-3.7-flash` through OpenRouter. Measured per action:

| Action | Approximate cost |
| --- | --- |
| Transcribe a 30-second clip | $0.0008 |
| Ask a question | $0.001–0.002 |
| Ingest a capture | $0.004 |

At one capture a day, that's well under a dollar a month. The Supabase free tier covers the
database, and the Vercel Hobby plan covers hosting.

---

## Privacy & security

**What protects your journal**

- **Nothing renders without a session.** The proxy redirects every page to the PIN screen and
  answers every API route with `401`. A stranger can't read the vault or spend your AI credit.
- **The database is closed to the public.** Row-level security is on with no policies. Only the
  server, holding the secret key, can read or write.
- **PINs are peppered.** The hashes are PBKDF2 over an HMAC keyed with `AUTH_SECRET`. A
  4-digit PIN has only 10,000 possibilities, so a salted hash alone wouldn't survive a stolen
  database dump; the pepper, which lives only in the environment, is what makes the dump useless.
- **Brute force is throttled** at 8 failed attempts per IP per 10 minutes. IPs are stored only
  as keyed hashes.
- **AI requests are anonymous and non-retained.** No `HTTP-Referer` or `X-Title` attribution
  headers are sent, so your deployment URL never appears on OpenRouter's dashboards or
  rankings. Every request sets `provider: { data_collection: "deny" }`, so it only routes to
  providers that don't store or train on data. If none is available, the request fails.
- **Rendered pages are never cached.** Each one belongs to one vault, so neither the CDN nor
  the service worker may store it and replay it into the other.

**What it doesn't protect against.** Be clear-eyed about these:

- Your text and audio **do leave your server**: to OpenRouter and the model provider, for
  processing. No-retention routing limits what's stored, but it's still a third-party service.
- Anyone holding your `SUPABASE_SECRET_KEY` or database password can read everything,
  PIN or no PIN.
- A 4-digit PIN is a lock on a diary, not a vault door. The throttle slows guessing; it
  doesn't make guessing impossible.
- Vault contents aren't encrypted at rest beyond what Supabase provides.

---

## Customising

| To change… | Edit |
| --- | --- |
| How captures are filed | [`src/lib/ingest-prompt.ts`](src/lib/ingest-prompt.ts) holds the three-pass rulebook. Keep [`docs/CLAUDE_INGESTION.md`](docs/CLAUDE_INGESTION.md) in step with it. |
| The demo vault | Edit the markdown under `seed/vault/`, `seed/captures.json` or `seed/learning.mjs`, then run `npm run seed:sql` and commit the regenerated SQL. |
| The private vault's starting folders | [`scripts/_skeleton.mjs`](scripts/_skeleton.mjs), then `npm run seed:sql` |
| Models | `OPENROUTER_MODEL` and `OPENROUTER_TRANSCRIBE_MODEL` in `.env.local` |
| The look | [`docs/DESIGN.md`](docs/DESIGN.md) documents the design system. [`docs/design-lab.html`](docs/design-lab.html) is the original five-concept exploration. |
| Who the Learning Space writes for | §1 of [`docs/LEARNING_CURATION.md`](docs/LEARNING_CURATION.md) |

> **Model note.** Don't add `reasoning: { effort }` to the transcription request. On
> gemini-3.7-flash it makes the provider stop partway with `finish_reason: "content_filter"`,
> silently returning a fragment. LifeOS rejects any transcript that didn't finish cleanly,
> rather than saving half an entry.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `NO ACCESS CODES SET` on the lock screen | No PIN exists yet in this database. Run step 4. |
| `ACCESS DENIED` with the right code | `AUTH_SECRET` changed since the PIN was set, which invalidates the hash. Re-run `set-pin` for both vaults. |
| Everything fails, or *"vault is empty"*, after a quiet week | **Free Supabase projects pause after about 7 days of inactivity**, and their hostname stops resolving. Open the project in the dashboard and choose *Restore project*. Your data is kept. |
| `The transcript was cut short by the provider` | A safety guard working as intended: the model returned a partial transcript. Tap **Retry**. |
| An ingest stops early | It hit the 52-second budget. Whatever it already filed is kept and the capture is marked ingested. Ingest a follow-up note for anything missed, or use the [offline path](docs/CLAUDE_INGESTION.md) for long captures. |
| `error: NEXT_PUBLIC_SUPABASE_URL … not set` from a script | Create `.env.local` from `.env.example`. |
| A voice memo upload fails with a size error | Uploads are normally decoded, compressed and chunked in the browser, like recordings. If the browser can't decode the file's format, it's sent as-is, and Vercel's 4.5 MB request limit applies. Convert it to `.m4a`, `.mp3` or `.wav` first. |

---

## Project structure

```
src/
  proxy.ts               the gate — session check on every request
  app/
    lock/                PIN screen
    page.tsx             dashboard
    capture/             record / upload / type → drafts → ingest
    vault/               browser, note viewer + editor
    graph/  ask/  learn/  settings/
    api/                 transcribe · ingest · ask · auth/{unlock,lock}   (SSE where it streams)
  lib/
    session.ts  space.ts  auth.ts      sessions, current vault, PIN hashing + throttle
    llm.ts                             OpenRouter: agent chat + transcription
    ingest.ts  ingest-prompt.ts        the filing agent and its rulebook
    ask.ts  agent-tools.ts             the assistant and the shared vault tools
    queries.ts  mutations.ts  learn.ts  every read/write, all scoped by space
    audio.ts  recorder.ts              client-side capture, silence trim, 2× WSOLA, WAV
    gemini.ts                          optional direct-Gemini transcription fallback
  components/                          UI (Mission Control design system)
supabase/                01_schema.sql · 02_seed_demo.sql · 03_seed_private.sql
seed/                    the demo vault's source: vault/**, captures.json, learning.mjs
scripts/                 CLIs (spaces, vault, learn, seed), SQL generator, deploy
docs/                    DESIGN · SPACES · CLAUDE_INGESTION · LEARNING_CURATION
```

The `CLAUDE.md` and `AGENTS.md` files brief AI coding agents (Claude Code, Codex) on the
codebase's rules. Read them before making changes, whatever you use: they explain why every
query takes a `space`, and why pages are never cached.

## License

[MIT](LICENSE) © 2026 Gursahib Singh
