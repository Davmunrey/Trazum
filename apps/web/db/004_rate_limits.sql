-- Trazum request counters, shared by every instance of a deployment.
--
-- Apply after 001 to 003. Idempotent, so re-running it is safe.
--
--   psql "$TRAZUM_DATABASE_URL" -f apps/web/db/004_rate_limits.sql
--
-- Without this table the sign-in, session and library limits are counted by
-- each server instance on its own, as they always were: nothing breaks, and the
-- app says once in its log that the shared count is unavailable.

create table if not exists trazum_rate_limits (
  -- `<limit name>:<keyed hash of the caller's address>`. Never the address: the
  -- hash is an HMAC under a key derived from the GitHub client secret, which
  -- this database does not hold, so a dump of the table cannot be turned back
  -- into addresses by trying all four billion of them.
  bucket       text        not null,
  -- Fixed windows, aligned to the clock, so every instance agrees which window
  -- a request falls in without asking each other.
  window_start timestamptz not null,
  expires_at   timestamptz not null,
  hits         integer     not null,
  primary key (bucket, window_start)
);

-- What the sweep deletes by. A row lives one window, a minute today.
create index if not exists trazum_rate_limits_expires_at_idx
  on trazum_rate_limits (expires_at);

-- Row level security: same reasoning as 001 to 003. Over a REST layer a
-- readable counter table is a list of who is using the deployment right now,
-- hashed or not. `enable` with no policies blocks the anonymous role; the table
-- owner, which is Trazum, is exempt. Not `force`, which would lock the
-- application out.
alter table trazum_rate_limits enable row level security;
