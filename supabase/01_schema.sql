-- =============================================================================
-- LifeOS — database schema
-- Run this FIRST, once, in the Supabase SQL Editor (Dashboard → SQL Editor → New
-- query → paste → Run). Safe to re-run: every statement is "if not exists".
--
-- Then run 02_seed_demo.sql (the fictional demo vault) and 03_seed_private.sql
-- (an empty folder skeleton for your real journal).
-- =============================================================================

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Spaces: two fully separate accounts behind one PIN screen.
--   'decoy'   — the demo vault (a complete, plausible, fictional journal)
--   'private' — your real journal
-- Every content table carries `space`, and the app never queries without
-- filtering on it. PINs are set with `npm run spaces -- set-pin …`, NOT here:
-- the hash is peppered with AUTH_SECRET, which must never live in the database.
-- -----------------------------------------------------------------------------
create table if not exists spaces (
  id text primary key check (id in ('decoy', 'private')),
  label text not null default '',
  pin_hash text,                          -- pbkdf2(hmac_sha256(AUTH_SECRET, pin), salt)
  pin_salt text,
  pin_iterations int not null default 210000,
  updated_at timestamptz not null default now()
);
insert into spaces (id, label) values ('decoy', 'Decoy'), ('private', 'Private')
  on conflict (id) do nothing;

-- Brute-force throttle for the PIN screen. IPs are stored only as a keyed hash.
create table if not exists auth_throttle (
  ip_hash text primary key,
  attempts int not null default 0,
  window_start timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Every markdown file in a vault (including the per-folder _index.md files)
-- -----------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  space text not null default 'decoy' check (space in ('decoy', 'private')),
  path text not null,
  folder text not null default '',
  title text not null,
  content text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  word_count int not null default 0,
  accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) stored,
  constraint documents_space_path_key unique (space, path)
);
create index if not exists documents_space_folder_idx  on documents (space, folder);
create index if not exists documents_space_updated_idx on documents (space, updated_at desc);
create index if not exists documents_fts_idx           on documents using gin (fts);
create index if not exists documents_content_trgm      on documents using gin (content gin_trgm_ops);
create index if not exists documents_path_trgm         on documents using gin (path gin_trgm_ops);
-- updated_at is maintained by the app's write path, NOT a trigger: opening a
-- note or starring it must not count as editing it.

-- -----------------------------------------------------------------------------
-- Wiki-link edges, rebuilt from a note's [[links]] on every write.
-- The foreign key carries the space, so a link can never point across vaults.
-- -----------------------------------------------------------------------------
create table if not exists links (
  id bigint generated always as identity primary key,
  space text not null default 'decoy' check (space in ('decoy', 'private')),
  source_path text not null,
  target_raw text not null,
  target_path text,
  constraint links_space_source_target_key unique (space, source_path, target_raw),
  constraint links_space_source_fkey foreign key (space, source_path)
    references documents (space, path) on delete cascade on update cascade
);
create index if not exists links_space_source_idx on links (space, source_path);
create index if not exists links_space_target_idx on links (space, target_path);

-- -----------------------------------------------------------------------------
-- Raw captures: voice / text / uploaded audio, held as drafts until ingested.
-- -----------------------------------------------------------------------------
create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  space text not null default 'decoy' check (space in ('decoy', 'private')),
  captured_at timestamptz not null default now(),
  entry_date date not null default current_date,
  source text not null check (source in ('voice', 'text', 'upload')),
  raw_text text not null,
  duration_sec int,
  status text not null default 'draft' check (status in ('draft', 'ingesting', 'ingested', 'failed')),
  ingest_started_at timestamptz,          -- lets a killed ingest run self-heal
  ingested_at timestamptz,
  ingested_by text,
  ingestion_log jsonb not null default '[]'::jsonb,
  files_touched text[] not null default '{}',
  error text
);
create index if not exists captures_space_status_idx on captures (space, status, captured_at desc);

-- -----------------------------------------------------------------------------
-- Learning Space: a topic roadmap + curated articles.
-- -----------------------------------------------------------------------------
create table if not exists learning_topics (
  id uuid primary key default gen_random_uuid(),
  space text not null default 'decoy' check (space in ('decoy', 'private')),
  slug text not null,
  title text not null,
  blurb text not null default '',
  status text not null default 'active' check (status in ('active', 'planned', 'archived')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint learning_topics_space_slug_key unique (space, slug)
);

create table if not exists learning_articles (
  id uuid primary key default gen_random_uuid(),
  space text not null default 'decoy' check (space in ('decoy', 'private')),
  slug text not null,
  topic_slug text not null,
  title text not null,
  hook text not null default '',          -- one-line pull to open it
  content text not null default '',       -- markdown body
  level text not null default 'next-step' check (level in ('foundation', 'next-step', 'stretch')),
  est_min int not null default 6,
  tags text[] not null default '{}',
  why_now text not null default '',       -- why it was curated now (ties to the journal)
  status text not null default 'published' check (status in ('published', 'draft')),
  is_favorite boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint learning_articles_space_slug_key unique (space, slug),
  constraint learning_articles_space_topic_fkey foreign key (space, topic_slug)
    references learning_topics (space, slug) on update cascade
);
create index if not exists learning_articles_space_topic_idx on learning_articles (space, topic_slug);
create index if not exists learning_articles_status_idx      on learning_articles (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security: ON, with NO policies. The browser never talks to Supabase
-- directly — all access goes through the Next.js server using the secret key,
-- which bypasses RLS. With no policies, the public/anon key can read nothing.
-- -----------------------------------------------------------------------------
alter table spaces            enable row level security;
alter table auth_throttle     enable row level security;
alter table documents         enable row level security;
alter table links             enable row level security;
alter table captures          enable row level security;
alter table learning_topics   enable row level security;
alter table learning_articles enable row level security;
