-- Trazum accounts: users and sessions.
--
-- Apply with psql, or paste into the SQL editor of whatever hosts your
-- Postgres. Idempotent, so re-running it is safe.
--
--   psql "$TRAZUM_DATABASE_URL" -f apps/web/db/001_accounts.sql
--
-- Table names are prefixed so Trazum can share a database with something else.

create table if not exists trazum_users (
  id          uuid primary key,
  provider    text        not null,
  -- The provider's own id, not the login. Logins are renameable and, once
  -- released, reusable: keyed on the login, the next holder of a freed username
  -- would inherit the previous holder's account here.
  provider_id text        not null,
  login       text        not null,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null,
  unique (provider, provider_id)
);

create table if not exists trazum_sessions (
  -- SHA-256 of the cookie value, hex. The cookie value itself is never stored,
  -- so a dump of this table is a list of hashes and not a list of live logins.
  token_hash text        primary key,
  user_id    uuid        not null references trazum_users (id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create index if not exists trazum_sessions_user_id_idx
  on trazum_sessions (user_id);
create index if not exists trazum_sessions_expires_at_idx
  on trazum_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Aimed at one specific deployment: Supabase, and anything else that puts a
-- REST layer in front of `public`. There, every table in this schema is
-- reachable over HTTP with the publishable key unless RLS says otherwise, and a
-- readable `trazum_sessions` is every live session in the deployment.
--
-- Enabled with no policies at all, which is the point: no policy means no row
-- matches, so the anonymous and authenticated roles can read and write nothing.
-- Trazum itself connects as the table owner over a direct Postgres connection,
-- and an owner is exempt from RLS, so the app is unaffected.
--
-- `enable`, deliberately, and not `force`. `force row level security` applies
-- the policies to the owner too — which, with no policies, locks Trazum out of
-- its own tables. It looks like the stricter of the two options and it is the
-- one that takes the site down.
alter table trazum_users    enable row level security;
alter table trazum_sessions enable row level security;
