// Seed data for the Learning Space — topics roadmap + the first curated articles.
// Consumed by scripts/learn.mjs seed. Articles are written in the "dense learning"
// voice: metaphor-first, cross-domain, thick with meaning but plainly said.

export const topics = [
  { slug: "applied-ai", title: "Applied AI & LLMs", status: "active", sort: 1,
    blurb: "How today's models actually work — and how to bend them to your own projects." },
  { slug: "systems-craft", title: "Systems & Software Craft", status: "active", sort: 2,
    blurb: "The durable ideas under the frameworks: data, retrieval, architecture, taste." },
  { slug: "learning-to-learn", title: "Learning How to Learn", status: "active", sort: 3,
    blurb: "Meta-skills — memory, metaphor, and building a mind that's dense, not just deep." },
  { slug: "startups-product", title: "Startups & Product", status: "planned", sort: 4,
    blurb: "Building things people actually want, from a dorm room and a laptop." },
  { slug: "math-intuition", title: "Math for Intuition", status: "planned", sort: 5,
    blurb: "The handful of ideas that quietly make everything else click." },
];

export const articles = [
  {
    slug: "embeddings-are-a-map-of-meaning",
    topic_slug: "applied-ai",
    title: "Embeddings Are a Map of Meaning",
    hook: "You already read maps. An embedding is just a map where the terrain is meaning itself.",
    level: "next-step",
    est_min: 7,
    tags: ["embeddings", "vectors", "rag", "intuition"],
    why_now: "Your databases course keeps brushing past \"vector search\" — this is the one mental model that makes it stop feeling like magic.",
    content: `> **The one idea:** An embedding turns a piece of text into a *coordinate*. Once meaning has coordinates, "similar" becomes "nearby" — and a computer that can't read suddenly navigates ideas like a driver reading a map.

## Start with a map you already know

Look at a map of Europe. Paris and Brussels sit close together; Paris and Athens sit far apart. Nobody *wrote* "these cities are similar" — their **closeness on the map encodes a fact about them**. Distance is meaning.

Now do something strange. Throw away the roads, the rivers, the coastlines. Keep only the rule: *things that belong together are placed near each other.* That rule, applied not to cities but to **words, sentences, whole documents**, is an embedding.

\`\`\`
      cricket ● ● bat
   stadium ●        ● bowler
                          ● wicket
    · · · · · · · · · · · · · · · · ·
        gas ●   ● engine
   station ●        ● fuel
\`\`\`

Two neighbourhoods. The model was never told "cricket is a sport." It just noticed that *cricket*, *bowler*, and *wicket* keep showing up in the same company — so it parked them on the same street.

## From a 2-D map to a 3,072-D map

A paper map has 2 coordinates: latitude, longitude. An embedding has *hundreds or thousands* — Gemini's embeddings live in a space with **3,072 dimensions**. You can't picture that, and you don't need to. You only need the one transferable intuition:

**More dimensions = more ways for two things to be "close."**

Two songs can be close in *tempo* but far in *mood*. Two people close in *age* but far in *taste*. A cramped 2-D map forces a single verdict; a high-dimensional map lets "similar" be true along one axis and false along another — at the same time. (Hold that paradox. It's the whole point.)

## Why this unlocks retrieval

Here's the move that powers every "chat with your notes" tool — including the [[ask]] tab you're using right now:

1. **Embed** every note → each becomes a coordinate.
2. **Embed** your question → it becomes a coordinate too.
3. **Find the nearest neighbours** → the notes closest to your question are, by construction, the ones about the same thing.

Search stops being *"which documents contain these exact words?"* and becomes *"which documents live in the same neighbourhood as this idea?"* That's why you can ask "when was I last near the lake?" and land on a note that never says the word "lake" but talks about Tugboat Beach.

> **The cross-domain steal:** A recommender ("people who liked X liked Y"), a plagiarism checker, face recognition, and Spotify's Discover Weekly are the *same trick* wearing different clothes. Embed the things, measure distance, act on closeness. Learn it once here; you'll recognise it everywhere.

## The catch worth holding

A map is a *lie that's useful*. Flatten the round Earth to paper and Greenland balloons to the size of Africa. Embeddings distort too — squeeze rich meaning into fixed coordinates and some nuance always leaks. The skill isn't trusting the map; it's knowing **which distortions your map introduces** and when they'll bite.

## Try it this week

- Open the Ask tab and deliberately ask something using *words that never appear* in the note you're thinking of. Watch it still find it. That's neighbourhoods beating keywords.
- Sketch your own 2-D map of five things from your life — a project, a person, a place, a habit, a fear. Where you place them *is* an embedding. You've been making them by hand your whole life.

*Next stretch: how "nearest neighbour" is actually computed (cosine similarity) — the geometry is a single angle between two arrows. We'll get there when you want it.*`,
  },
  {
    slug: "your-second-brain-is-a-filing-cabinet-that-thinks",
    topic_slug: "systems-craft",
    title: "Your Second Brain Is a Filing Cabinet That Thinks",
    hook: "RAG isn't a new invention. It's a librarian, and you've met her before.",
    level: "next-step",
    est_min: 6,
    tags: ["rag", "retrieval", "architecture", "lifeos"],
    why_now: "You're literally standing inside the example. LifeOS ingests your captures, files them, and answers questions from them — this article is the blueprint of the app in your hand.",
    content: `> **The one idea:** A large language model has a brilliant, forgetful mind. Retrieval gives it a filing cabinet. **RAG = the mind + the cabinet + a librarian who fetches the right folder before the mind opens its mouth.**

## The forgetful genius

An LLM is a genius who read the entire internet two years ago and remembers *none of it precisely*. Ask about your life and it will confidently invent a plausible answer — because inventing plausible answers is the only thing it was ever trained to do.

You don't want plausible. You want *true about you*. So you don't ask the genius to remember. You hand it the right page **at the moment of the question.**

## Three roles, one flow

Watch what happens when you ask LifeOS *"when is my algorithms midterm?"*

\`\`\`
  YOU ──question──▶ [ LIBRARIAN ] ──finds folders──▶ [ GENIUS ] ──▶ answer
                       (retrieval)   algorithms.md       (the LLM)   grounded
                                     maya.md                         in YOUR files
\`\`\`

- **The Librarian (retrieval).** Doesn't understand your question deeply — she's *fast* and she knows where everything is filed. Grep, keyword search, embeddings: all just different librarians with different filing systems.
- **The Genius (the model).** Can reason, summarise, and phrase things beautifully — but only about the folders on the desk in front of it.
- **The handoff.** The entire art of RAG is *what the librarian puts on the desk.* Wrong folders → the genius reasons flawlessly about the wrong thing. **Garbage retrieved is garbage generated.**

## Why "filing" is the real product

Here's the part most people miss, and the part you're living: **the answer quality is decided long before the question is asked.** It's decided at *filing time.*

When LifeOS ingests a voice note about a study session, it doesn't dump it in one place. It files a line under the day, under *Maya*, under the *course*, under *expenses* for the coffee after. Four folders, four ways the librarian can later find it. A messy filing clerk creates an unanswerable archive; a thoughtful one creates a mind.

> **The cross-domain steal:** This is just **library science** — the Dewey Decimal System is retrieval-augmented generation for humans. It's also how a good lawyer works (the law is the model; case files are retrieval), and how you revise for an exam (your brain is the genius; your notes are the cabinet). Same shape, everywhere.

## The tension that makes it hard

Two forces pull against each other, forever:

| Put *more* on the desk | Put *less* on the desk |
|---|---|
| Safer — the answer is probably in there | Sharper — the genius isn't distracted |
| But: noise, cost, slow, confusion | But: might miss the crucial folder |

There is no "correct" setting. There's only *this question, right now*, and good judgment about how wide to cast. Hold both truths; tune by feel. Systems that pretend the tension doesn't exist are the ones that hallucinate.

## Try it this week

- After your next ingest, open the files it touched. Ask yourself: *if I searched for this six months from now, would the librarian find it?* If not, that's a filing-rule to improve — which is exactly what \`docs/CLAUDE_INGESTION.md\` tunes.
- Notice that **you** are the retrieval system when you journal. Every wiki-link you add is you doing the librarian's job — pre-deciding how your future self will find this moment.

*Next stretch: chunking — why the size of each "folder" you file quietly decides whether retrieval works at all.*`,
  },
  {
    slug: "dense-learning-the-multidimensional-mind",
    topic_slug: "learning-to-learn",
    title: "Dense Learning: The Multi-Dimensional Mind",
    hook: "Deep is a well. Broad is a field. Dense is a web — and the web is where insight lives.",
    level: "foundation",
    est_min: 6,
    tags: ["meta", "dense-learning", "metaphor", "zpd"],
    why_now: "This is the operating philosophy of your whole Learning Space. Read it first — every other article here is built to make you denser, not just deeper.",
    content: `> **The one idea:** Depth digs down. Breadth spreads out. **Density weaves across** — and a woven mind makes connections the deep and the broad simply can't see.

## Three shapes of a mind

- **Deep learning is vertical.** One shaft, straight down. The specialist who knows their one thing cold — and goes quiet the moment the conversation drifts an inch sideways.
- **Broad learning is horizontal.** A thin film spread over everything. The trivia champion who can name it all and *do* none of it.
- **Dense learning is multi-dimensional.** Not a line at all — a **lattice**. Ideas connected to other ideas, across domains, until the whole structure holds weight no single strand could.

\`\`\`
  DEEP        BROAD              DENSE
   │        ─────────          ◆─◆─◆
   │                            │╳│╳│
   │        ─────────          ◆─◆─◆
   ▼                            │╳│╳│
                               ◆─◆─◆
  a well     a field           a web
\`\`\`

## What dense learners can do

They **make metaphors effortlessly** — because a metaphor is just a wire between two nodes far apart in the lattice (an embedding is a *map*; RAG is a *librarian*). They **link unrelated domains intuitively** — cricket field-placing and portfolio risk turn out to be the same math. They **hold paradoxes without needing to resolve them** — retrieval should cast wide *and* narrow; both true, no contradiction. And they can feel **"thick" with meaning even when speaking simply**, because underneath the plain sentence sits a dense web doing the work.

> Mainstream education mostly fails at this. It clones **scarecrows** — shallow depth, constrained breadth, no lattice. Straw stuffed into the shape of a knower, frightening no crows.

## The mechanism: build wires, not just nodes

Here's why density compounds where depth plateaus. Depth adds **nodes** — more facts down one shaft. Density adds **edges** — connections between nodes you already have. And in any network, the edges outnumber the nodes explosively: 10 facts can hold up to 45 connections; 20 facts, 190. **Learn one new thing densely and you don't add one unit of understanding — you add every bridge it forms to what you already knew.**

This is also why density is *efficient*, which matters to you specifically: you don't want to waste time on what you already know or on what's hopelessly far away. You want the **next node that creates the most edges.**

## The zone where it happens

There's a name for that sweet spot: the **Zone of Proximal Development**. Picture three rings:

\`\`\`
   ╭───────────────────────────╮
   │   TOO FAR (just noise)     │
   │   ╭───────────────────╮    │
   │   │   THE ZONE ▓▓▓▓▓   │    │   ← learn here
   │   │  ╭─────────────╮   │    │
   │   │  │  ALREADY    │   │    │
   │   │  │  KNOW (bored)│  │    │
   │   │  ╰─────────────╯   │    │
   │   ╰───────────────────╯    │
   ╰───────────────────────────╯
\`\`\`

- **Inner ring — already known.** Comfortable, zero new edges. Re-reading it *feels* productive and isn't.
- **Outer ring — too far.** No existing node to connect it to, so it bounces off. This is where most "advanced" content is wasted.
- **The Zone — one step out.** New enough to stretch, near enough to *attach*. Every good article here aims for your Zone: not too far from what you already know, just the next step — enough that you feel you're learning a lot, and none of it wasted.

## The paradox to keep

Density needs depth and breadth as raw material — you can't weave with no thread. So this isn't "skip the deep work." It's: **do the deep work, then* spend equal effort on the wiring.** Most people do the first half and stop. The lattice is built in the half everyone skips.

## Try it this week

- After any article here, don't ask *"did I understand it?"* Ask *"what did it connect to?"* Force one metaphor and one link to something unrelated in your life. That question is the edge-builder.
- When you journal, you're already doing this — every \`[[wiki-link]]\` is you weaving a node into the lattice. Your vault and your mind are the same shape. Grow one, grow the other.

*This is the north star for everything in your Learning Space. When you ask Claude to curate more, this is the standard it's held to: dense over deep, dense over broad, always aimed at your Zone.*`,
  },
];
