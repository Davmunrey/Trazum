-- Trazum prompt library: saved prompts and every version of each.
--
-- Apply after 001_accounts.sql. Idempotent, so re-running it is safe.
--
--   psql "$TRAZUM_DATABASE_URL" -f apps/web/db/002_prompts.sql

create table if not exists trazum_prompts (
  id         uuid primary key,
  owner_id   uuid        not null references trazum_users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null,
  -- When the newest version was written, not when the row was last touched by
  -- anything. A rename moves it too, because a rename is a change to the prompt
  -- as the owner experiences it.
  updated_at timestamptz not null,
  -- Per owner, not globally: two people naming a prompt "support triage" is not
  -- a collision, and making it one would leak that the name is taken.
  unique (owner_id, name)
);

create table if not exists trazum_prompt_versions (
  id         uuid primary key,
  prompt_id  uuid        not null references trazum_prompts (id) on delete cascade,
  -- 1, 2, 3… within one prompt. Not a global sequence: "version 4" has to mean
  -- the fourth save of this prompt, or the history reads as nonsense.
  version    integer     not null,
  text       text        not null,
  note       text,
  -- Who saved it. The owner today; a teammate once a prompt can be shared, which
  -- is why it is a column now rather than a migration later.
  author_id  uuid        not null references trazum_users (id),
  created_at timestamptz not null,
  unique (prompt_id, version)
);

create index if not exists trazum_prompts_owner_idx
  on trazum_prompts (owner_id, updated_at desc);
create index if not exists trazum_prompt_versions_prompt_idx
  on trazum_prompt_versions (prompt_id, version desc);

-- No token count column, deliberately.
--
-- Storing the estimate taken at save time makes the history chart lie: two
-- versions saved a year apart get priced by two different estimators, so the
-- line moves when the prompts did not. Counts are recomputed from `text` on
-- read, with today's estimator, which is the only way versions are comparable
-- to each other.

-- Row level security, for the same reason as 001: on a platform that puts a
-- REST layer in front of `public`, an unprotected `trazum_prompts` is every
-- saved prompt in the deployment, readable with the publishable key.
--
-- `enable` with no policies — no policy means no row matches, so the anonymous
-- and authenticated roles get nothing, while Trazum, connecting as the table
-- owner, is exempt. Not `force`, which would apply the policies to the owner
-- too and lock the application out of its own tables.
alter table trazum_prompts         enable row level security;
alter table trazum_prompt_versions enable row level security;
