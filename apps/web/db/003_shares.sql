-- Trazum share links: a comparison anyone holding the URL can read.
--
-- Apply after 002_prompts.sql. Idempotent.
--
--   psql "$TRAZUM_DATABASE_URL" -f apps/web/db/003_shares.sql

create table if not exists trazum_shares (
  -- The capability, and the primary key: 32 bytes from the CSPRNG, base64url.
  --
  -- Stored in the clear, unlike a session token, and the asymmetry is the point.
  -- Hashing a session token means a leaked table is a list of hashes rather than
  -- a list of live logins. Hashing this one would protect nothing: the row it
  -- points at is itself the secret, so a leaked table gives up the prompts
  -- whether or not it gives up the tokens.
  token       text        primary key,
  owner_id    uuid        not null references trazum_users (id) on delete cascade,
  -- Denormalised so rendering a shared page is one query and not two. It is a
  -- display name; the owner_id above is the identity.
  owner_login text        not null,
  before_text text        not null,
  after_text  text        not null,
  -- Canonicalised on write: only the keys the settings type declares ever reach
  -- this column, so nothing free-form from a client is stored and later read
  -- back as configuration.
  settings    jsonb       not null,
  created_at  timestamptz not null,
  -- Null means it never expires, which the API makes you ask for.
  expires_at  timestamptz
);

create index if not exists trazum_shares_owner_idx
  on trazum_shares (owner_id, created_at desc);
create index if not exists trazum_shares_expires_idx
  on trazum_shares (expires_at);

-- No view counter and no last_viewed_at, deliberately.
--
-- Counting views would turn every anonymous read into a write. Two costs: the
-- obvious one on a connection-limited database, and the one worth stating —
-- an unauthenticated request that can cause a write is a lever, and "how many
-- people opened this" is not worth being one.

-- Row level security: same reasoning as 001 and 002. A readable trazum_shares
-- over a REST layer is every shared prompt in the deployment, no token needed.
-- `enable` with no policies blocks the anonymous role; the table owner, which is
-- Trazum, is exempt. Not `force`, which would lock the application out.
alter table trazum_shares enable row level security;
