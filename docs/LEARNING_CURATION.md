# LifeOS — Learning Space Curation Playbook

**For Claude Code (any session, including a fresh one with no memory of this).** This
document is the complete spec for curating learning content for the user. If they say
*"curate some articles for me"* / *"do my weekly learning review"* / *"add to my Learning
Space"* — read this top to bottom, then do it. It is designed so a brand-new chat can
replicate the workflow exactly.

Run everything from the repo root.
Credentials load from `.env.local`.

---


> **Which vault?** `vault.mjs` and `learn.mjs` both default to the **`private`** space (the
> real journal) and print `[space: …]` on every run. The `decoy` space has its own separate
> Learning Space; only touch it with `--space decoy` if asked. See `docs/SPACES.md`.

## 1. The learner — fill this in

**Replace this section with a few lines about yourself.** The curator reads it to aim every
article: who you are, what you're building, what you already know, and what you're curious
about. Concrete beats complete — five honest lines are plenty.

```
Who:        <age, what you do / study, where>
Building:   <projects you're actively working on>
Knows well: <domains you're already solid in — don't write below this>
Reaching:   <what you're trying to get better at right now>
Off-hours:  <sports, hobbies, places — metaphor material>
```

*Worked example — the demo vault's fictional persona:* a third-year computer science
student with a part-time campus library job; taking algorithms and databases this term;
building a personal portfolio site; runs and plays Saturday basketball; close to a younger
sister who's into robotics.

Whoever it is, **their journal is your source of truth for what they're doing, curious
about, and ready for.**

## 2. The learning philosophy — encode this, don't dilute it

> **Dense learning > Deep learning or Broad learning.**
>
> Deep learning is vertical. Broad learning is horizontal. **Dense learning is
> multi-dimensional.**
>
> Dense learners:
> - Make metaphors effortlessly.
> - Link unrelated domains intuitively.
> - Hold paradoxes without needing to resolve them.
> - Can feel "thick" with meaning, even when speaking simply.
>
> Mainstream education fails at creating dense thinkers — it clones scarecrows with
> shallow depth and constrained breadth.

This is the **north star**. Everything you curate is judged against it: does this read make
the learner *denser* — more connected — not just deeper in one shaft or thinner across many?

## 3. How they like to learn (the constraints)

1. **Visual.** Lead with a picture, a diagram, a spatial metaphor. Use ASCII diagrams in
   fenced code blocks (they render centered and framed), comparison tables, and structure
   the reader can *see*. Never a wall of text.
2. **Zone of Proximal Development (ZPD).** Aim one step past what they already know —
   near enough to *attach* to existing knowledge, far enough to stretch. Not the inner ring
   (bored, already knows it) and not the outer ring (noise, no hook to attach to). **Don't
waste their time on the known or the unreachable.**
3. **Dense, not deep or broad.** Every article should build *edges*: at least one metaphor
   and one cross-domain link. Connect new ideas to things they already have — their projects,
   their work, their hobbies, the tools they use (see §1).
4. **Thick but simple.** Plain sentences with a dense web underneath. No jargon for its
   own sake; earn every term.

## 4. The weekly workflow

When asked to curate (or on a weekly cadence):

### Step 1 — Read the journal for signal
```bash
node scripts/vault.mjs list journal            # recent day notes
node scripts/vault.mjs read journal/2026/2026-07-06.md
node scripts/vault.mjs grep "learn|curious|want to|figure out|how does"  # intent signals
node scripts/vault.mjs list projects           # what they're building
```
Look for: what they did, what frustrated them, what they said they wanted to understand, new
tools/domains they touched, recurring themes. The best article answers a question their own
week raised.

### Step 2 — See what's already curated (don't repeat)
```bash
node scripts/learn.mjs topics
node scripts/learn.mjs articles
```

### Step 3 — Ask the learner 2-4 sharp questions
Before writing, confirm aim so you land in their Zone. Good questions:
- "You've been deep in X this week — do you want the *foundation* under it, or the *next
  step* past it?"
- "How well do you already know Y? I don't want to write below or above you."
- "Which of these 3 angles pulls you: [A], [B], [C]?"
Keep it short. They'll tell you their ideas — weave them in.

### Step 4 — Pick topics / levels
Topics are the roadmap (`learning_topics`). Reuse an existing one or add a new one when a
theme recurs. Each article gets a **level**:
- `foundation` — the bedrock under something they're using (fills a gap they stepped over).
- `next-step` — one rung past current knowledge. **This is the default and the sweet spot.**
- `stretch` — a reach that plants a flag for later.

### Step 5 — Write the article(s) in the dense-learning voice
See §6 for the style guide and §7 for the exact format. Write genuinely good, fun reads —
this is the point of the whole feature.

### Step 6 — Insert
Write each article as a JSON file (or inline) and upsert:
```bash
node scripts/learn.mjs add-article path/to/article.json
# or add a topic first:
node scripts/learn.mjs add-topic <slug> "<Title>" "<blurb>" active
```
Then verify at `/learn` in the app (or re-run `node scripts/learn.mjs articles`).

### Step 7 — Report
Tell them what you added, to which topics, at what level, and *why* (tie each back to a
journal signal). One line each.

## 5. Data model (`supabase/01_schema.sql`)

- **`learning_topics`**: `slug`, `title`, `blurb`, `status` (`active`|`planned`|`archived`),
  `sort`. The roadmap shown at the bottom of `/learn`.
- **`learning_articles`**: `slug`, `topic_slug`, `title`, `hook` (one-line pull),
  `content` (markdown), `level` (`foundation`|`next-step`|`stretch`), `est_min`, `tags[]`,
  `why_now` (why curated for them now — **always tie to a journal signal**), `status`
  (`published`|`draft`), `is_favorite`, `read_at`.

RLS is on with no policies — access is server-only via `SUPABASE_SECRET_KEY`, same as the
rest of the app.

## 6. Article style guide (the dense-learning voice)

- **Open with the picture, not the definition.** A spatial metaphor or diagram in the
  first screen. ("An embedding is a *map*." "RAG is a *librarian*.")
- **One bolded "The one idea:" callout near the top** (a leading `>` blockquote — it renders
  as a hero callout). Compress the whole article into one sentence.
- **Build edges explicitly.** Include a `> **The cross-domain steal:**` box that names 2-3
  unrelated fields sharing the same structure. This is the density engine.
- **Hold a paradox.** Most good topics have a real tension (wide vs. narrow retrieval,
  depth vs. density). Name it, show both sides in a table, and *don't* resolve it — teach
them to hold it.
- **Connect to their world.** Reference their projects, work, hobbies and places (§1)
  where it genuinely fits. Use `[[wiki-links]]` to vault concepts — the reader renders them
  as bold (they're hints, not required to resolve).
- **End with "Try it this week."** 2-3 concrete, tiny actions that turn the read into an
  edge in their lattice. Often: "notice X in something you already do."
- **Close with a one-line "Next stretch:"** naming where this leads, so the roadmap feels
  alive.
- Length: ~500-900 words, `est_min` 5-8. Plain language. Earn every term.

## 7. Article JSON format

```json
{
  "slug": "kebab-case-unique",
  "topic_slug": "applied-ai",
  "title": "Title in Sentence Case (renders uppercase)",
  "hook": "One line that makes them want to open it.",
  "level": "next-step",
  "est_min": 7,
  "tags": ["lowercase", "topic", "tags"],
  "why_now": "Why this, tied to a specific journal signal from their week.",
  "content": "# Markdown body …\n\n> **The one idea:** …"
}
```

`content` is standard Markdown + GFM: `##` headings, **bold**, *italic*, tables, and fenced
code blocks for ASCII diagrams. The reader styles the first `>` blockquote as a hero
callout and centers code blocks.

## 8. The seed set (already loaded — study these as the quality bar)

`seed/learning.mjs` holds the first 5 topics and 3 articles. Re-load anytime with
`node scripts/learn.mjs seed` (idempotent upsert). The three articles —
*Embeddings Are a Map of Meaning*, *Your Second Brain Is a Filing Cabinet That Thinks*, and
*Dense Learning: The Multi-Dimensional Mind* — are the reference for voice, density, and
visual structure. Match or beat them.
