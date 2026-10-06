# Spaces — the two vaults behind one PIN screen

LifeOS opens on a 4-digit PIN pad. Which code you enter decides **which vault you get**.
They are separate accounts: separate notes, separate links, separate captures, separate
Learning Space. Neither can see or reach the other.

| Space | What it is |
| --- | --- |
| `decoy` | The original seeded vault — a complete, plausible, lived-in journal. This is the code you hand out. |
| `private` | The real journal. Same folder structure, none of the fiction. |

**The codes themselves are deliberately not written down anywhere in this repo.** They live
only as peppered hashes in the `spaces` table. Both are changeable in-app: **sidebar → heart
icon → ACCESS**, a screen that exists only in the private space. If you lose one, reset it
with `scripts/spaces.mjs set-pin`.

## Why it's deniable, not just hidden

The point isn't that the second vault is hard to find — it's that there's **nothing to find**.

- The decoy's HTML never contains the settings link. It isn't hidden with CSS; the server
  never renders it (`AppShell` resolves the space and passes `isPrivate`).
- `/settings` from the decoy is rewritten to a dead path, so it returns the same 404 —
  same status, same body — as any URL that was never a route. Probing tells you nothing.
- The session cookie stores an **opaque keyed digest**, not the word "private". Base64 is
  not encryption; a payload reading `{"s":"private"}` would announce the whole scheme.
- The unlock endpoint answers identically for both codes, and hashes every configured
  space on every attempt, so response timing can't distinguish them either.
- A wrong code says only `ACCESS DENIED` — never "wrong for this account".

## How the isolation is enforced

Every content table carries a `space` column, and **every** query filters on it. There is
no unscoped variant of any data function — `space` is a mandatory first parameter on
everything in `queries.ts`, `mutations.ts`, `learn.ts`, `agent-tools.ts`, `ask.ts` and
`ingest.ts`. Composite keys (`unique(space, path)`, and the links/articles foreign keys)
mean the database would reject a cross-vault reference even if the app tried to make one.

The space always comes from the **session cookie**, never from a client argument. Server
actions and API routes call `requireSpace()` / `currentSpace()` themselves, so a crafted
request cannot ask to read or write the other vault.

To audit that nothing slipped through:

```bash
grep -rn 'from("documents")\|from("links")\|from("captures")\|from("learning_' src --include='*.ts' --include='*.tsx'
```

Every hit must have a `.eq("space", …)` within a few lines.

## Auth internals

- `src/lib/session.ts` — signs/verifies the cookie (HMAC-SHA256, Web Crypto so it runs in
  both the Edge proxy and Node). 30-day rolling session.
- `src/lib/auth.ts` — PIN hashing: `pbkdf2(hmac_sha256(AUTH_SECRET, pin), salt, 210k, sha256)`.
  A 4-digit PIN is only 10,000 possibilities, so the salt alone wouldn't survive a database
  dump — the defence that matters is the **pepper**: `AUTH_SECRET` lives in the environment,
  never in Postgres.
- `src/proxy.ts` — the gate. Nothing renders without a valid session; API routes get a 401
  rather than a redirect, which is what stops a stranger burning transcription credits.
- Throttle: 8 failed attempts per IP per 10 minutes, in `auth_throttle`. IPs are stored only
  as a keyed hash, so that table is useless if it leaks.

**`AUTH_SECRET` must be set** (≥32 chars) in `.env.local` and in Vercel. Without it the app
fails closed — every session is rejected and the PIN screen reports the misconfiguration
plainly rather than pretending the code was wrong. Rotating it signs everyone out and
invalidates both PIN hashes, so re-run `set-pin` for both spaces afterwards.

## Setting the spaces up

Both vaults are created by the setup SQL (see the README):

| File | Space | What it lays down |
| --- | --- | --- |
| `supabase/01_schema.sql` | — | tables, keys, indexes, RLS, and the two `spaces` rows |
| `supabase/02_seed_demo.sql` | `decoy` | the fictional demo vault: 38 notes, links, 2 draft captures, Learning Space |
| `supabase/03_seed_private.sql` | `private` | folder skeleton only — empty indexes + 7 domain notes |

PINs can't be set from SQL — the hash is peppered with `AUTH_SECRET`, which never goes in
the database. Set them from a terminal with your `.env.local` in place:

```bash
npm run spaces -- set-pin private 4821    # your real journal
npm run spaces -- set-pin decoy 0000      # the demo — the code you'd hand out
```

Until at least one PIN exists, the lock screen says so instead of `ACCESS DENIED`. The
moment any code is set, it goes back to giving nothing away.

## CLI

```bash
npm run spaces -- status                 # per-space counts + whether a PIN is set
npm run spaces -- set-pin private <pin>  # change a PIN (refuses a clash with the other)
npm run spaces -- seed-private           # same skeleton as 03_seed_private.sql, via the API
npm run spaces -- wipe private --yes     # empty a space back out
```

The vault and learning CLIs act on **one** space and print which:

```bash
npm run vault -- list                     # defaults to private
npm run vault -- list --space decoy
npm run learn -- topics --space decoy
npm run seed -- --wipe                    # API seeder; defaults to decoy (that's the fiction)
npm run seed:sql                          # regenerate 02/03 after editing seed/
```

`--space` also reads from `LIFEOS_SPACE`.

## The private vault's starting shape

The skeleton (defined once in `scripts/_skeleton.mjs`) is the same folder structure the
demo uses — only the contents differ — plus the seven domain notes Pass B routes to by name
(`health/fitness.md`, `health/sleep.md`, `health/food.md`, `health/mental.md`,
`finances/expenses.md`, `finances/income.md`, `finances/goals.md`). Without those, the
first capture would waste turns creating them. The ingestion agent is free to add new
files and folders from there.
