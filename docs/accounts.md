# Accounts

Signing in is **off by default**. With nothing configured, Trazum's web app is
what it has always been: you paste a prompt, it answers, and it remembers
nothing about you. Nothing in this document is required to run it.

Turn it on when you want the things that need to know who you are — a saved
prompt library, shared budgets, an organisation's spend in one place. This first
release ships the foundation those need: sign in with GitHub, and a session that
lasts.

---

## Turning it on

Three environment variables, and a fourth if you want the sign-in to survive a
restart.

| Variable | Required | What it is |
| --- | --- | --- |
| `TRAZUM_GITHUB_CLIENT_ID` | yes | From your GitHub OAuth app |
| `TRAZUM_GITHUB_CLIENT_SECRET` | yes | From the same place. Never sent to the browser |
| `TRAZUM_PUBLIC_URL` | yes | This deployment's own origin, e.g. `https://trazum.example` |
| `TRAZUM_DATABASE_URL` | no | Any Postgres. Without it, sessions live in memory |
| `TRAZUM_DATABASE_SSL` | no | `verify-full` (default for remote hosts), `require`, `prefer`, `allow`, `disable` |
| `TRAZUM_DATABASE_POOL` | no | Connections per instance. Default `4` |

### 1. Register a GitHub OAuth app

<https://github.com/settings/developers> → **New OAuth App**.

- **Homepage URL** — your `TRAZUM_PUBLIC_URL`
- **Authorization callback URL** — `TRAZUM_PUBLIC_URL` + `/api/auth/github/callback`

Trazum asks for the `read:user` scope and nothing else: the profile, no
repositories, no email addresses, no organisation membership, no write access
anywhere. If the consent screen offers more than that, it is not this app.

### 2. Point it at a database (optional, but read this)

```sh
psql "$TRAZUM_DATABASE_URL" -f apps/web/db/001_accounts.sql
```

The file is idempotent — re-running it is safe — and it works on any Postgres:
Supabase, Neon, RDS, or a container on your laptop.

**Without `TRAZUM_DATABASE_URL`, sessions are held in memory.** That is a real
deployment and not a broken one — a single container that you restart rarely is
fine — but the consequences are worth being explicit about:

- A restart signs everybody out.
- On a platform that runs more than one instance (Vercel, Lambda, anything that
  scales), the same browser is signed in against one instance and signed out
  against the next, apparently at random.

Trazum says so rather than letting you find out: `/api/auth/session` reports
`ephemeralSessions: true`, and the header renders "temporary session" beside
your name.

### 3. Start it

```sh
TRAZUM_GITHUB_CLIENT_ID=Iv1.xxxx \
TRAZUM_GITHUB_CLIENT_SECRET=xxxx \
TRAZUM_PUBLIC_URL=https://trazum.example \
TRAZUM_DATABASE_URL=postgres://... \
npm --prefix apps/web start
```

Misconfiguration does not crash the app. Any missing or invalid variable turns
sign-in off, the header renders no button, and `/api/auth/*` answers **503 with
the name of the variable to set** — so the failure is readable by the person who
can fix it.

---

## What it does with your data

| Thing | Where it goes |
| --- | --- |
| Your GitHub numeric id, login, display name, avatar URL | Stored, refreshed on each sign-in |
| GitHub's access token | **Never stored.** Exchanged, used once to read the profile above, dropped |
| Your session token | Sent to your browser as a cookie. Stored here only as its SHA-256 |
| Your email address | Never requested. `read:user` does not include it |

Trazum cannot act on your GitHub account, because it does not keep the means to.

---

## The security decisions, and why

Written down because a reader should be able to audit them without reading the
code, and because several of them look like details until they are wrong.

**The callback URL is built from `TRAZUM_PUBLIC_URL`, never from a request
header.** `Host` and `X-Forwarded-Host` are supplied by the client. A redirect
URI built from one lets an attacker send a victim to `/api/auth/github` with
`Host: evil.example` and receive the authorisation code themselves. That is why
the variable is mandatory rather than convenient.

**The `state` nonce is checked before the code is exchanged.** Without that
check, an attacker completes their own authorisation and hands the resulting
callback URL to a victim, silently signing the victim into the *attacker's*
account — after which everything the victim saves is in a library the attacker
can read. The order matters as much as the check: verifying state after the
exchange passes every functional test and defends against nothing.

**Session cookies use the `__Host-` prefix over HTTPS.** The browser refuses a
`__Host-` cookie unless it is `Secure`, `Path=/` and carries no `Domain`, which
means a subdomain — or anything that manages to speak plain HTTP to the host —
cannot overwrite your session. It is the only defence here that does not depend
on Trazum's own code being right.

**Sessions are opaque random tokens, not signed claims.** 256 bits from the
CSPRNG, meaningless except that a row with their hash exists. Revoking one is a
`DELETE`, which is a property a JWT does not have.

**Only the hash is stored.** A dump of `trazum_sessions` is a list of SHA-256
hashes, not a list of usable cookies.

**Sign-out deletes the row before clearing the cookie.** The other order leaves
a live session in the database whose token the browser has just forgotten —
invisible, unrevokable through the UI, and valid for a month.

**`?next=` cannot leave the origin.** Anything that is not a same-origin path is
replaced with `/`, including `//evil.example`, `/\evil.example` (browsers
normalise that backslash) and anything containing a control character (browsers
strip tab, newline and carriage return from URLs *before* parsing, so the string
you filtered is not the destination reached).

**Plain HTTP is refused outside localhost.** A session cookie over HTTP is
readable by anyone on the path, on every request. There is no configuration that
makes it safe, so there is no flag to allow it.

**Row level security is enabled on both tables, with no policies.** This is
aimed at Supabase and anything else that puts a REST layer in front of `public`:
no policy means no row matches, so the anonymous key can read nothing. Trazum
connects as the table owner, and owners are exempt. Note that the schema uses
`ENABLE` and not `FORCE` — `FORCE` applies the policies to the owner too and,
with no policies, locks Trazum out of its own tables. The stricter-looking word
is the one that takes the site down.

**Database TLS is verified by default.** `verify-full` for any non-loopback
host. If your provider needs something looser, `TRAZUM_DATABASE_SSL` is how you
say so — deliberately an explicit choice, so that running unverified is
something you did rather than something Trazum did for you.

---

## What is not covered

Stated because the gap between "tested" and "proven" is where this sort of thing
goes wrong.

- **The Postgres driver has never been run against Postgres in CI.** Its SQL is
  checked against a recording tagged template, which catches a mistyped column,
  a value bound in the wrong position, and a `DELETE` whose predicate is too
  wide. It cannot catch SQL that Postgres would reject, because nothing in the
  test suite parses SQL. Applying `001_accounts.sql` to a real database and
  signing in once is a step a human has to take.
- **Rate limiting is per instance and per address.** Thirty sign-in attempts a
  minute, counted in the memory of whichever instance served the request. It
  stops a script; it does not stop a botnet, and behind a corporate NAT the
  budget is the office's rather than yours.
- **There is no account deletion yet.** `deleteSessionsForUser` exists in the
  store and nothing calls it. Signing out ends one session.
- **Sessions do not renew.** Thirty days from issue, absolute. On day 31 you
  sign in again.
- **GitHub is the only provider.** The store keys on `(provider, provider_id)`
  so a second one is additive, but SSO through anything else is not written.
