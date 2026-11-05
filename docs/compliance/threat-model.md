# Threat model

What a hosted Trazum is worth attacking for, who would try, where the lines
between them run, and what answers each attempt. It is written for an auditor
asking for the analysis behind the controls (OWASP ASVS 4.0.3 1.1.5) and for the
risk behind each limit (11.1.5), and for whoever changes this code next.

It is a draft for the owner to approve. Approving it, and deciding when it is
read again, is part of the security policy, which only the owner can write
([what only the owner can do](README.md#what-only-the-owner-can-do)). Two
things keep it from going stale on its own: `apps/web/test/threat-model.test.mjs`
fails the build when a limit in the code is missing from the table at the end
or no longer has the value written here, and when a path this page cites no
longer exists.

**Scope** is the hosted web app with accounts switched on, as the
[readiness pack](README.md#the-system-in-scope) draws it. The CLI, the MCP
server, the libraries and the GitHub Action run on the user's own machine or
runner and hold nothing of anybody else's; what can go wrong there is in
[SECURITY.md](../../SECURITY.md#what-trazum-is-exposed-to), and the last
section here summarises it.

## What is worth protecting

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Saved prompts and every version of each | The database | A prompt is how a product behaves, and people paste secrets into prompts |
| Shared comparisons | The database, readable by anyone holding the link | Published on purpose, but only to whoever was given the link, and only for as long as it was meant to last |
| Who someone is | The database: GitHub id, login, display name, avatar URL | Personal data ([the accounts guide](../accounts.md#what-it-does-with-your-data) lists every field) |
| Sessions | A random token in the browser's cookie; only its SHA-256 in the database | Whoever holds the cookie is the account |
| The OAuth client secret and the database URL | The platform's environment | Between them, sign-in for everybody and every row |
| The instance's CPU and memory | The platform | The anonymous routes run the rule engine on text a stranger sends |
| The database's capacity | The database provider | Every saved prompt and link costs storage the operator pays for |
| A pasted usage log | The browser only | It is the user's bill and their prompts; it must never reach the server |
| A caller's own LLM key | One request | Used for that request and dropped; it must never be logged or kept |

## Who might act against it

- **Anyone with the URL.** Every anonymous route is public: optimise, compare,
  write, the share pages and the sign-in hops. Expect scripts.
- **A signed-in user, against somebody else's data.** The most likely attacker
  with an account is another account.
- **Someone holding a stolen session cookie.** From a shared computer, a
  malicious extension, or a backup of a browser profile.
- **A page on another site** the user visits while signed in, which can make
  their browser send requests (cross-site request forgery) and frame pages.
- **Whoever is sent a share link,** and whoever they forward it to. The link is
  the only thing between them and the two prompts.
- **An admin** named in `TRAZUM_ADMINS`. Trusted with the deployment's counts
  and prompt names, not with anybody's prompt text.
- **A contributor, a dependency or a compromised workflow,** reaching
  production through the repository rather than the network.

The operator is trusted: they hold the secrets, the database and the logs.
What they never hold is a pasted usage log or a caller's model key, the last
two rows of the table above.

## Where the lines run

| Boundary | What crosses it | Answered by |
| --- | --- | --- |
| Browser to API routes | JSON bodies, the session cookie, a method, an `Origin` | Same-origin writes, JSON only, a declared schema for every body, a method table, rate limits, a security line for every refusal (TRZ-05, TRZ-07, TRZ-08, TRZ-13) |
| API routes to the database | Bound SQL parameters; every record read or written by its owner | The owner predicate in every library and share query (TRZ-06); the server's certificate verified by default (`apps/web/lib/store/index.ts`) |
| API routes to GitHub | An authorisation code, then one profile read | A state bound to a `__Host-` cookie and ten minutes; GitHub's token used once and never stored (TRZ-03) |
| API routes to a model endpoint | A prompt, and the caller's own key | Anthropic's API, the operator's own `TRAZUM_LLM_BASE_URL`, or an entry the operator listed in `TRAZUM_ALLOWED_LLM_ENDPOINTS`, never a URL a caller names; the caller's key, never the operator's; redirects refused (`apps/web/app/api/optimize/route.ts`, `packages/core/src/net.ts`) |
| A pasted log to anywhere | Nothing | `connect-src 'self'`, and a CI probe that fails the build if any part of a pasted log leaves the page (TRZ-02) |
| The repository to production and npm | Code and packages | Pull requests with required checks, pinned actions, provenance-signed releases, a bill of materials (TRZ-14 to TRZ-18) |

## Threats, and what answers each

Grouped by STRIDE, the categories most threat modelling uses: spoofing,
tampering, repudiation, information disclosure, denial of service, elevation
of privilege.

| Threat | Kind | What answers it | Evidence |
| --- | --- | --- | --- |
| Signing a victim in as the attacker, or replaying a callback | Spoofing | The OAuth state is a random nonce in a `__Host-` cookie that the callback must match, inside ten minutes | `apps/web/lib/auth/github.ts`, TRZ-03 |
| Using a stolen session cookie | Spoofing | Sessions end after a day unused and thirty days at most (configurable down to ASVS level 2); the owner can see every session and end any one; ending a session other than the one asking needs a sign-in in the last fifteen minutes, which a stolen cookie cannot provide | `apps/web/lib/auth/session.ts`, `apps/web/app/api/auth/sessions/route.ts`, TRZ-05 |
| Reading or changing another account's prompts or links | Elevation | Every query carries the owner; a record that is not yours is a 404, the same as one that does not exist | `apps/web/lib/store/prompts.ts`, TRZ-06 |
| A page on another site writing with the visitor's cookie | Tampering | Writes from another `Origin` are refused; `SameSite=Lax`; a body that does not say it is JSON is refused before it is read, which covers every type a cross-site form can send | `apps/web/lib/auth/routes.ts`, `apps/web/lib/request-body.ts`, TRZ-07 |
| A body shaped to crash a route or be misread by it | Tampering | Every body has a declared schema; an undeclared field or a wrong type is a 400 naming it, before the route reads anything | `apps/web/lib/body-schemas.ts` |
| A method a route does not serve, or a preflight | Tampering | Refused with 405 and recorded | `apps/web/lib/api-methods.ts` |
| Script injected into a page | Tampering | A nonce-based CSP with `strict-dynamic`; React escapes what it renders | `apps/web/middleware.ts`, TRZ-09 |
| A page framed to trick a click | Tampering | `X-Frame-Options: DENY` and `frame-ancestors 'none'` | TRZ-09 |
| An action nobody can show happened | Repudiation | One structured line per security decision, with the account where there is one | `apps/web/lib/security-log.ts`, TRZ-13 |
| A token, address, login or prompt in a log | Information disclosure | The log writes none of them; a test plants each in a request and reads every line | `apps/web/test/security-log.test.mjs`, TRZ-13 |
| Guessing a share link | Information disclosure | 256 bits from the system's random source, and the share page is rate-limited | `apps/web/lib/shares/api.ts`, `apps/web/middleware.ts` |
| A share link that outlives its purpose | Information disclosure | Every link expires after the lifetime chosen when it was made (unless *never* was chosen), can be revoked, and goes with the account | `apps/web/lib/store/shares.ts`, TRZ-10 |
| A share token leaking through a `Referer` or to analytics | Information disclosure | `Referrer-Policy: no-referrer`; tokens are stripped before an analytics event leaves the browser | TRZ-09, TRZ-12 |
| A pasted log or a prompt leaving the browser | Information disclosure | Logs are read in the page; `connect-src 'self'`; the privacy probe | TRZ-02 |
| An admin reading other people's prompts | Information disclosure | The overview shows counts, prompt names and logins, never prompt text | `docs/accounts.md`, `apps/web/app/api/admin/overview/route.ts` |
| Pointing the server at an internal address | Elevation | A caller selects an endpoint the operator listed and never names one; private hosts and redirects are refused | `packages/core/src/net.ts`, [SECURITY.md](../../SECURITY.md#the-controls-and-what-each-is-actually-for) |
| Spending the operator's model key | Elevation | The server never lends a key: the model-assisted passes need the caller's own | `apps/web/app/api/optimize/route.ts` |
| Taking an instance down with work | Denial of service | Input caps, and a per-address rate limit on every API route but sign-out, which only ends the caller's own session (the table below) | `apps/web/lib/rate-limit.ts` |
| Filling the database | Denial of service | Per-account ceilings, each counted and written in one transaction under a row lock | `apps/web/lib/store/transaction.ts` |
| A dependency or workflow that reaches production | Elevation | Zero runtime dependencies in the published packages, actions pinned to a commit, provenance-signed releases, a bill of materials on each | TRZ-16, TRZ-17, TRZ-18 |

## Accepted, and why

Each is a decision rather than an oversight. The longer reasoning is in
[SECURITY.md](../../SECURITY.md#known-limits-stated-rather-than-implied) and the
[accounts guide](../accounts.md).

- **Rate limits do not stop many addresses.** They are a barrier against
  scripts and accidents, not a quota. The anonymous routes count per instance,
  so on a platform that runs several the real limit is looser; `x-forwarded-for`
  is the client's to write wherever no proxy overwrites it. The sign-in, session
  and library limits count across instances when there is a database.
- **A share link is a bearer capability.** Whoever holds it can read the two
  prompts until it expires or is revoked. The control that makes one says so
  before anything is published.
- **The memory store forgets.** Without `TRAZUM_DATABASE_URL`, accounts, sessions
  and links last until the process restarts. The account menu says so.
- **The SSRF filter reads names, not resolved addresses.** On the one path where
  a stranger supplies the string, the string is no longer what gets fetched; the
  filter alone guards only what the operator types.
- **Reading one's own library is not recorded.** Exports, deletions, shares and
  admin access are; a read of one's own prompts is a decision for the owner
  (ASVS 8.3.5, listed as remaining in the [pack](README.md#what-remains-in-code)).

## The limits, and the risk behind each

Every limit the server and its libraries set, with its value and the risk that
chose it. The test reads this table: a limit in the code without a row here
fails it, and so does a row whose value is not the code's.

Rate limits count per address, over one minute.

| Limit | Value | The risk it answers | Set in |
| --- | --- | --- | --- |
| Optimise requests | 30 a minute | The rule engine runs over up to 400,000 characters per request, and a model-assisted pass makes an outbound call; this is the route a script would hammer | `apps/web/app/api/optimize/route.ts` |
| Compare requests | 30 a minute | The same engine, twice per request | `apps/web/app/api/compare/route.ts` |
| Interview requests | 60 a minute | Deterministic and small, but answered on every change a person makes; twice the engine routes, still far below a loop | `apps/web/app/api/write/route.ts` |
| Share page views | 120 a minute | Guessing tokens, and scraping a page that is never cached because it holds somebody's prompt; far above a reader, far below a loop | `apps/web/middleware.ts` |
| Sign-in, account export and deletion, and ending a session | 30 a minute, `authRateLimited` | Each starts an OAuth round trip, reads a whole account or ends something; counted across instances, because a limit each instance kept alone would multiply by the number of instances | `apps/web/lib/auth/routes.ts` |
| Session checks | 60 a minute, `sessionRateLimited` | Every page load asks once; each answer is a database read | `apps/web/lib/auth/routes.ts` |
| Library, share and admin requests | 60 a minute, `libraryRateLimited` | Each is a database round trip; writes cost storage | `apps/web/lib/prompts/api.ts` |

Sizes and counts.

| Limit | Value | The risk it answers | Set in |
| --- | --- | --- | --- |
| A prompt to optimise, compare or share | 400,000 characters, `MAX_INPUT_CHARS` | Memory and CPU per request on a public route; well above any real prompt | `packages/core/src/limits.ts` |
| A prompt in a share link | 400,000 characters, `MAX_SHARE_PROMPT_CHARS` | A share stores what the compare route accepts, no more | `apps/web/lib/shares/api.ts` |
| A prompt in the library | 100,000 characters, `MAX_PROMPT_TEXT_CHARS` | Storage per version: a library keeps every version, so a version is held to a quarter of what one request may carry | `apps/web/lib/store/prompts.ts` |
| A prompt's name | 120 characters, `MAX_PROMPT_NAME_CHARS` | A label shown in lists; a pasted paragraph is a mistake | `apps/web/lib/store/prompts.ts` |
| A version's note | 500 characters, `MAX_NOTE_CHARS` | A note, not a second prompt | `apps/web/lib/store/prompts.ts` |
| Saved prompts per account | 200, `MAX_PROMPTS_PER_OWNER` | One account filling the database the operator pays for | `apps/web/lib/store/prompts.ts` |
| Versions per prompt | 500, `MAX_VERSIONS_PER_PROMPT` | The same, one prompt at a time | `apps/web/lib/store/prompts.ts` |
| Share links per account | 100, `MAX_SHARES_PER_OWNER` | Storage, and how much one account can publish | `apps/web/lib/store/shares.ts` |
| Prompts one admin overview reads | 500, `CENSUS_LIMIT` | The overview holds every prompt's text in memory to count it; past this it says it stopped, with both numbers | `apps/web/lib/store/prompts.ts` |
| An answer in the interview | 20,000 characters, `MAX_ANSWER_CHARS` | An interview is short fields, not a pasted corpus | `apps/web/lib/body-schemas.ts` |
| Calls a month, and output tokens a call, in a pricing request | 1,000,000,000,000 and 10,000,000, `USAGE_LIMITS` | Above any real workload, and below where the arithmetic stops meaning anything | `apps/web/lib/usage-input.ts` |

Time.

| Limit | Value | The risk it answers | Set in |
| --- | --- | --- | --- |
| A session, from sign-in | 30 days by default, `DEFAULT_SESSION_POLICY` | A cookie that never ends is a theft that never ends; thirty days is the most ASVS accepts at level 1 | `apps/web/lib/auth/config.ts` |
| A session, unused | 1 day by default, `DEFAULT_SESSION_POLICY` | A computer walked away from; signing in again is one click | `apps/web/lib/auth/config.ts` |
| The longest session an operator may set | 720 hours, `MAX_HOURS_CEILING` | The same thirty days, as a ceiling the environment cannot raise | `apps/web/lib/auth/config.ts` |
| The shortest idle window an operator may set | 5 minutes, `IDLE_MINUTES_FLOOR` | Below it nobody can finish reading a bill before signing in again | `apps/web/lib/auth/config.ts` |
| A sign-in that counts as recent | 15 minutes, `REAUTH_WINDOW_MS` | Ending another session needs proof of the account, not only of the cookie; a stolen cookie is older than this and cannot be made younger | `apps/web/lib/auth/session.ts` |
| A sign-in in progress | 10 minutes, `OAUTH_STATE_TTL_SECONDS` | A state left lying around is a state that can be replayed | `apps/web/lib/auth/session.ts` |
| A share link | 7, 30 or 90 days, or never; 30 by default, `SHARE_TTL_DAYS` | A publication that outlives its reason; *never* is offered because some links are documentation, and is never the default | `apps/web/lib/store/shares.ts` |

In the browser, where the limits protect the reader's own tab rather than the
server:

| Limit | Value | The risk it answers | Set in |
| --- | --- | --- | --- |
| Task reports read at once | 16, `MAX_TASK_FILES` | A folder dropped by mistake | `apps/web/lib/task-workflow.ts` |
| A task report's size | 1,200,000 bytes, `MAX_TASK_FILE_BYTES` | Three bytes for every character the engine accepts, checked before a buffer is allocated | `apps/web/lib/task-workflow.ts` |

Every other length in [`apps/web/lib/body-schemas.ts`](../../apps/web/lib/body-schemas.ts)
(a locale tag, a model name, an endpoint, a key, a login typed to confirm) is a
ceiling well above any real value, there so that a pasted file cannot ride in
through a field nobody expected to be long.

## The tools on the user's machine

Out of scope for the hosted service, and summarised here so the analysis is
whole. The threats are a prompt crafted to make a rule's regular expression
take forever, a log file crafted to crash or exhaust a parser, a dependency
that reads what it is handed, and a URL that points a model call somewhere
internal. They are answered by a time budget over pathological inputs, seeded
property suites over every parser ([hardening](../hardening.md)), no runtime
dependencies in any published package, and the endpoint filter, each held by
`packages/core/test/security.test.js`.
