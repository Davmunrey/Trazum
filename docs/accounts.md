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
| `TRAZUM_ADMINS` | no | Who may see the deployment overview. Empty means nobody, and the page does not exist |

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
psql "$TRAZUM_DATABASE_URL" -f apps/web/db/002_prompts.sql
psql "$TRAZUM_DATABASE_URL" -f apps/web/db/003_shares.sql
```

Apply them in order. Both files are idempotent — re-running it is safe — and it works on any Postgres:
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

## The prompt library

Signed in, a **Library** tab appears. It holds prompts you saved and every
version of each.

| Route | What it does |
| --- | --- |
| `GET /api/prompts` | Your library. A preview per prompt, not the whole text |
| `POST /api/prompts` | Save the current prompt as version 1 |
| `GET /api/prompts/:id` | One prompt and its whole history |
| `POST /api/prompts/:id` | Save the current text as the next version |
| `PATCH /api/prompts/:id` | Rename |
| `DELETE /api/prompts/:id` | Remove it and every version |

Four things about it that are decisions rather than defaults:

**History is append-only.** Saving over a prompt writes a new row; nothing ever
updates one. A history you can edit is not a history, and the question the
feature exists to answer — *what did we change, and did it get more expensive?*
— is unanswerable the moment a row can be rewritten.

**Saving unedited text saves nothing, and says so.** The response is `200` with
`saved: false`, not an error and not a duplicate row. Pressing Save twice is a
reasonable thing to do; putting two identical versions in a history whose only
job is showing what moved is not.

**Token counts are recomputed on read, never stored.** The history is a chart of
how a prompt's cost moved. Priced with the estimator of the day each version was
saved, that line moves when the estimator changes and the prompts did not.
Recomputing every version with today's is the only way two are comparable.

**Somebody else's prompt is `404`, not `403`.** A `403` confirms the id exists,
which turns the route into an oracle for enumerating other people's libraries.
There is nothing a legitimate caller can do with the distinction, because they
were never getting in either way. The store enforces it in the query — every
method takes an owner id and puts it in the `where` clause, and there is no
lookup that takes an id without one, so the mistake cannot be written.

### Ceilings

Refused, never trimmed. Pruning the oldest version to make room would quietly
delete the record the prompt was kept for.

| Limit | Value |
| --- | --- |
| Prompts per account | 200 |
| Versions per prompt | 500 |
| Prompt text | 100,000 characters |
| Name | 120 characters |
| Note | 500 characters |
| Requests per minute per address | 60 |

---

## Share links

On the Compare tab, signed in, **Create share link** publishes a comparison at
`/c/<token>` — readable by anyone holding the URL, with no sign-in.

That is a genuinely different security model from everything else here, and the
page says so before the button rather than after: *a share link publishes both
prompts to anyone who has the URL.* The warning is above the control, always
visible, and not behind a dialog — a dialog on click is a thing people dismiss;
a sentence above the button is a thing they read while deciding.

| Route | Who |
| --- | --- |
| `POST /api/shares` | Signed in, same-origin |
| `GET /api/shares` | Signed in — your links, previews only, never the prompts |
| `DELETE /api/shares/:token` | Signed in, and only the link's owner |
| `GET /c/:token` | **Anyone with the token** |

**The token is the secret.** 32 bytes from the CSPRNG, the same generator that
mints session cookies. It is stored in the clear, unlike a session token, and
the asymmetry is deliberate: hashing a session token means a leaked table is a
list of hashes rather than a list of live logins, whereas hashing this one would
protect nothing, because the row it points at *is* the secret.

**Links expire.** Thirty days by default; 7, 90 or never if you ask. A link that
never expires is a permanent publication made by somebody thinking about the
next ten minutes, so `never` exists and has to be chosen.

**Reading a link writes nothing.** No view counter, no last-seen timestamp. An
unauthenticated request that can cause a write is a lever, and "how many people
opened this" is not worth being one.

**It is kept out of search twice.** The page declares `noindex` in its metadata
and `robots.txt` disallows `/c/`. Two defences that fail differently: one stops
the fetch, the other stops the indexing of a fetch that happened anyway. Neither
is a security control — anyone with the URL can read it, which is the feature —
both are about the URL not spreading on its own. The page also sends
`no-referrer`, because the token is in the path and any outbound navigation
would otherwise put the whole capability in someone else's access log.

**Nothing derived is stored.** A share holds the two prompts and the settings;
the comparison is recomputed on every view, so a link opened next year is priced
by next year's rules rather than by a snapshot that quietly stopped being true.
The settings are canonicalised on write from a whitelist of known keys — they
are replayed into the core on every future view, by a reader who did not choose
them and cannot see them.

### The README badge

Every share link doubles as a badge at `/badge/<token>.svg`:

```markdown
[![Trazum](https://trazum.example/badge/<token>.svg)](https://trazum.example/c/<token>)
```

It shows the token change and is **recomputed on every load**, so it follows the
prompts rather than freezing a number from the day it was made. Same capability
as the link — revoking the link revokes the badge, because there is only one
thing to revoke.

Four properties worth knowing:

- **It always answers 200.** An unknown, expired or malformed token renders the
  same neutral "unavailable" badge. A non-2xx makes GitHub's image proxy show a
  broken image, which tells every reader of the README something is wrong without
  saying what — and the three cases must be indistinguishable anyway.
- **The document is inert.** No script, no `foreignObject`, no external font,
  image or stylesheet. It is served with `nosniff` and
  `default-src 'none'; sandbox`, because an SVG from your own origin is a page
  when navigated to rather than embedded.
- **No prompt text ever reaches it.** The message is assembled from numbers. It
  is XML-escaped regardless, because "no untrusted text gets here" is a property
  one commit can break.
- **It is cached** (five minutes, public), unlike the page behind the same token.
  Safe because the token is in the URL, and necessary because a README badge is
  fetched by every reader of the page.

Limits: 100 links per account, refused rather than evicted.

---

## The deployment overview

`/admin`, for accounts named in `TRAZUM_ADMINS`. **Unset by default, and unset
means the page does not exist** — not "exists and refuses". A signed-in account
that is not on the list gets the same `404` as one asking about a deployment
with no admins at all, because a `403` would confirm that a dashboard is here
and that they are outside it.

There is no organisation model in Trazum and this is the decision not to invent
one: a self-hosted instance *is* the team. The alternative was reading GitHub
organisation membership, which means asking for the `read:org` scope on every
sign-in so that some deployments can skip an environment variable. Sign-in asks
for `read:user` and nothing else, and keeping that true is worth more.

```sh
# By GitHub username — convenient
TRAZUM_ADMINS=octocat,monalisa

# By GitHub numeric id — safer, see below
TRAZUM_ADMINS=583231,1024025
```

**Prefer ids.** A GitHub login is renameable and, once released, reusable, so an
admin list naming `octocat` grants the overview to whoever holds that name
*today*. A numeric id cannot be transferred. Logins are still accepted because
they are what an operator actually knows — the dashboard says on screen when it
let you in on the strength of one. (Usernames may also be entirely digits, so a
list entry of `1001` is read as an id and will *not* admit the account whose
username is `1001`.)

### It is not a spend report, and it says so

Trazum has never seen a bill, an API call or a token counter. It reads prompt
text and measures it. A dashboard headed "spend" would be printing a number
nobody can reconcile against an invoice.

So the headline is **input tokens**, which is a property of a prompt alone and
needs no assumption about how often anyone calls it, and the second figure is
**how many of those the rules would remove** — measured by running the rules, the
same standard `trazum rank` is held to. There is no score. Every number on the
page can be reproduced by running `trazum` on the same prompt.

### What it shows about other people

Counts, prompt names and account logins. **Never the text of anybody's prompt.**
An admin is an operator, not an auditor of what their colleagues wrote, and
"which prompt is expensive" is answerable from a name. The text reaches the
overview layer only long enough to be counted and is never serialised to a
browser.

One overview reads at most 500 prompts. When a deployment has more, the page
says so with both numbers rather than reporting a total that quietly covers part
of it.

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
- **A revoked link is gone, but a copy taken while it was live is not.** This is
  what "publish" means; there is no recall.
- **The overview is deployment-wide, not per team.** One instance, one group of
  people. Two teams sharing a deployment share an overview.
- **The library is per person, not per team.** Every prompt has one owner and
  there is no way to share one. The `author_id` column on a version exists so
  that becomes a migration rather than a rewrite, and today it is always the
  owner.
- **One mutant in the prompt library survives, and is documented on the line
  that survives it.** The memory driver's version sweep on delete cannot be
  observed through the store's interface: the prompt is already gone and ids are
  UUIDs, so nothing will ever ask for the orphaned versions again. What it costs
  is memory, which no assertion in the suite can see.
