# Compliance readiness pack

**Trazum is not certified against SOC 2, ISO 27001 or any other standard, and
nothing in this repository should be read as saying it is.** This pack is the
preparation for an audit: what the system is, which controls it already
implements in code with the evidence for each, what this repository fixed to
get here, and what only an organisation can do. A certification is issued to
an organisation by an auditor after looking at all of that over time; a
repository can make that audit shorter, not replace it.

The control matrix is [controls.md](controls.md): 23 controls, each with the
files and tests that prove it and its SOC 2, ISO 27001 and OWASP ASVS
references. [asvs-l2.md](asvs-l2.md) goes the other way: every one of the 259
requirements OWASP ASVS 4.0.3 sets at level 2, and where Trazum stands on each
(129 met, 26 partly, 15 for the owner, 89 that do not apply, and no gaps).

Three documents an auditor asks for sit beside them, each held to the code by
`apps/web/test/threat-model.test.mjs`: the [threat model](threat-model.md),
with the risk behind every limit the server sets; the [secure coding
checklist](secure-coding.md), each item naming the test that holds it; and the
[procedure for rotating each secret](secret-rotation.md). They are drafts for
the owner to approve; the code already does what they describe.

## What each framework is, and who it applies to

| Framework | What is assessed | Who issues it | What the repository can do |
| --- | --- | --- | --- |
| **SOC 2** (AICPA Trust Services Criteria) | An organisation's controls over a system. Type I at a point in time; Type II over an observation period, typically 3 to 12 months | A licensed CPA firm | Provide the technical controls and their evidence (the matrix) and a precise system description (below) |
| **ISO/IEC 27001:2022** | An organisation's information security management system (ISMS): policies, risk treatment, the Annex A controls that apply, internal audit, management review | An accredited certification body, in two stages | The same, mapped to Annex A; the ISMS itself is the organisation's |
| **OWASP ASVS 4.0.3** | An application's security requirements, at levels 1 to 3 | Nobody issues it; it is a standard to test against | Most of it: [asvs-l2.md](asvs-l2.md) maps all 259 level 2 requirements |
| **CASA** (App Defense Alliance) | One application, against a tailored subset of ASVS, by an authorised lab | An ADA-authorised assessor | Pass the ASVS rows. Google requires CASA only for apps requesting restricted Google API scopes; Trazum signs in with GitHub and requests none, so it is not required today. Confirm the current tiers and scope on the App Defense Alliance site before relying on this |

## The system in scope

Who reads this first is an auditor drawing the boundary, so it is drawn here.

**Out of scope by design: the CLI, the MCP server, the libraries and the
GitHub Action.** They run on the user's machine or runner, process nothing on
any server of ours, and send nothing unless the user passes a key, a URL or a
flag. There is no service to audit. Their evidence is still in the matrix
(TRZ-01, TRZ-15 to TRZ-20), because a customer's own auditor will ask what the
tool does on their machines.

**In scope: the hosted web app**, when it runs with accounts switched on:

| Component | What it is | Where it runs | Holds |
| --- | --- | --- | --- |
| Web front end | Next.js pages; reads pasted logs in the browser | The browser | Nothing server-side |
| API routes | Sign-in, prompt library, share links, account export and deletion, admin overview | The operator's platform (Vercel, or the container in `Dockerfile`) | Nothing between requests |
| Database | Postgres when `TRAZUM_DATABASE_URL` is set; memory otherwise | The operator's database provider | Users, hashed sessions, prompts and versions, share links, one-minute request counters keyed by an HMAC of the caller's address ([what exactly](../accounts.md#what-it-does-with-your-data)) |
| Identity | GitHub OAuth, scope `read:user` | GitHub | The GitHub account; Trazum never stores GitHub's token |
| Logs | Security events on standard output | The operator's platform | Internal ids and event codes only ([TRZ-13](controls.md)) |

**Subservice organisations** (carved out in a SOC 2 report, suppliers under
ISO 27001 5.19 to 5.23): GitHub (identity, source, CI), the hosting platform,
the database provider, and npm (package distribution). Their own reports cover
their physical and infrastructure controls.

**Data**: personal data is the GitHub profile fields listed in the accounts
guide. Prompt text is stored only when a signed-in user saves it to the
library or publishes a share link. Usage logs pasted into the web app are
never sent to the server, which the CI privacy probe checks on every change.

## What has been fixed

Found by reading the code against the three frameworks. The first four rows
were fixed in the same change as this pack, the rest in the pull requests
after it:

| Gap | Fix | Requirement |
| --- | --- | --- |
| No record of any security decision: sign-ins, refusals, deletions and admin access left no trace | `apps/web/lib/security-log.ts`: one structured line per event, never a token, login, address or prompt text; a test plants each in a request and greps every line | SOC 2 CC7.2, ISO 27001 8.15, ASVS V7 |
| An account could be deleted but not taken away | `GET /api/account` and *Download my data* in the account menu: the whole account as one file, without the session hashes | SOC 2 P5.1, ISO 27001 5.34, ASVS V8.3, GDPR access and portability |
| No `Permissions-Policy` or `Cross-Origin-Opener-Policy` | Both added to every page, with a test | ASVS V14.4, ISO 27001 8.26 |
| The accounts guide said account deletion did not exist, after it shipped | Corrected, and the export and the log documented | SOC 2 CC2.3 |
| The Postgres driver had never run against Postgres. When it did, account deletion failed for anyone with a saved prompt, and share settings were stored as a string | `apps/web/test/store-contract.test.mjs` runs one contract on both drivers, against the runner's PostgreSQL in CI; both bugs fixed without a migration | SOC 2 CC8.1, P4.3; ISO 27001 8.29, 8.10; ASVS V8.3 |
| A session lasted thirty days however long it sat unused | An idle window on top of the lifetime: a day and thirty days by default, configurable down to ASVS level 2's thirty minutes and twelve hours; a request moves the end on, never past the lifetime, and writes at most every five minutes; sessions from before the change end at their next use. `apps/web/lib/auth/session.ts`, `apps/web/test/session-lifetime.test.mjs` | SOC 2 CC6.1; ISO 27001 8.5; ASVS V3.3.2 |
| The sign-in, session and library limits were counted by each server instance alone, so a platform running several instances multiplied them | Counted in `trazum_rate_limits` across instances when the deployment has accounts and a database, keyed by an HMAC of the address under a key the database does not hold; falls back to the instance's own count if the table is missing or unreachable. `apps/web/lib/shared-limit.ts`, `apps/web/test/shared-limit.test.mjs` | SOC 2 CC6.6; ISO 27001 8.26; ASVS V11.1 |
| JSON routes parsed a body whatever its `Content-Type`, the account deletion request sent none, and API responses opened in a tab rendered | Every body-reading route answers 415 unless the body says `application/json`, and every request the app sends says so; API responses carry `Content-Disposition: attachment`, except the sign-in hops and the export. `apps/web/lib/request-body.ts`, `apps/web/middleware.ts`, `apps/web/test/request-body.test.mjs` | ASVS 13.1.5, 13.2.5, 14.4.2; ISO 27001 8.26 |
| The per-account ceilings were counted in one statement and written in the next, so saves arriving together could pass one; two new versions of one prompt could both try to be the same number, and the second failed as a 500 | Each count that decides a write runs in one transaction after locking the account's or the prompt's row; six saves fired at once at each ceiling on a real PostgreSQL. `apps/web/lib/store/transaction.ts`, `apps/web/test/store-contract.test.mjs` | ASVS 11.1.6; ISO 27001 8.28 |
| No release said what it was made of: the lockfile listed the dependencies, and nothing a scanner could read came with a release | Each GitHub release carries `trazum-v<version>.cdx.json`, a CycloneDX bill of every workspace and every package any of them needs at run time, written from the lockfile and checked before anything is uploaded. Not `npm sbom`, which on this tree leaves out seven runtime packages a development tool shares; the test holds the bill to what `npm ls --omit dev` and `npm sbom` find. `scripts/sbom.mjs`, `test/sbom.test.mjs` | ASVS 14.2.5; SOC 2 CC9.2; ISO 27001 5.21 |
| A request refused for what it sent (not JSON, would not parse, a value the route would not take) left no trace | Every route that reads a body exports its handlers through `logsRefusedInput`, which writes an `input.refused` line with the reason, the route and, on a signed-in route, the account for any 400, 413, 415 or 422 it answers; never the answer, which quotes the input. A test holds every such route to the wrapper and plants a secret in each refused input. `apps/web/lib/security-log.ts`, `apps/web/test/security-log.test.mjs` | ASVS 7.1.3; SOC 2 CC7.2; ISO 27001 8.15 |
| A method an API route does not serve was answered 405 by the framework, before any code of the app's ran, and recorded nowhere; a CORS preflight was answered as though the app served one | The middleware refuses each with 405, an `Allow` header naming what the route serves and an `input.refused` line; HEAD passes wherever GET is served, `OPTIONS` is refused. The table it reads is held to the route modules' own exports by a test, so a route or method added without a row fails CI rather than being refused. `apps/web/lib/api-methods.ts`, `apps/web/middleware.ts`, `apps/web/test/api-methods.test.mjs` | ASVS 14.5.1; ISO 27001 8.26 |
| A session cookie that opened nothing (expired, revoked, forged, or ended by policy) was answered without a line, and the browser went on presenting it on every page load | `currentSession` writes an `auth.session` failure line for each, `unknown_session` or `session_ended` with the account, and never for a visitor without a cookie; `/api/auth/session` clears the dead cookie where sessions are durable, and not on the memory store, where another instance may still hold it. `apps/web/lib/auth/session.ts`, `apps/web/test/security-log.test.mjs` | ASVS 7.2.1; SOC 2 CC7.2; ISO 27001 8.15 |
| A person could end this session or every session, and could not see any of them | *Your sessions* in the account menu lists every live session (when it started, when it was last used, which one is this device) and ends any one; ending another session, or all of them, needs a sign-in in the last fifteen minutes, so a stolen cookie alone cannot sign its owner out of anywhere. Signing in again from a browser replaces that browser's session. `apps/web/app/api/auth/sessions/route.ts`, `apps/web/test/sessions.test.mjs` | ASVS 3.3.4; SOC 2 CC6.1; ISO 27001 8.5 |
| An error nothing caught left no line of the app's own, and nothing tied the digest on the error page to a record | `onRequestError` in `instrumentation.ts` writes one line per uncaught error with the route's pattern and the digest, never the message, path or headers; checked against the built server with the database unreachable. `apps/web/instrumentation.ts`, `apps/web/test/security-log.test.mjs` | ASVS 7.4.1, 7.4.3; SOC 2 CC7.2; ISO 27001 8.15 |
| No threat model, no secure coding checklist and no written way to rotate a secret: each limit stated its risk beside its number, and nothing gathered them or noticed one go missing | The three documents above. The threat model's table holds every limit the server sets with its value and the risk that chose it; a test fails when a limit is added or changed without its row, when a variable the app reads or a secret a workflow reads is missing from the rotation page, and when any of the three cites a path that is gone. `docs/compliance/threat-model.md`, `docs/compliance/secure-coding.md`, `docs/compliance/secret-rotation.md`, `apps/web/test/threat-model.test.mjs` | ASVS 1.1.5, 1.1.7, 1.6.3, 11.1.5; SOC 2 CC3.2; ISO 27001 5.17, 8.25 |
| A person reading their saved prompts, a prompt's history or their share links left no trace, so a stolen session's reading could not be told from its owner's | Each of those reads writes a `library.read` line with the account and the kind of route, never the text, the name or the id; asking for an id that is not the caller's writes the same line with `not_found`. A test fails any handler that answers with saved prompts and records no read. `apps/web/lib/security-log.ts`, `apps/web/test/security-log.test.mjs` | ASVS 8.3.5; SOC 2 CC7.2; ISO 27001 8.15 |
| Each route read its body field by field, each in its own way: a body of `null` threw in seven of the nine handlers that read one, `llm.apiKey: 5` was sent to a provider as a key, `ttl: "toString"` threw while creating a share link, and a misspelt or mistyped field (`level: "medium"`, `reorder: "true"`, `disable_rules`) was quietly read as something else | Every body the API accepts has a declarative schema, all of them in one file, and a route reads nothing from a body but the language it asked for until its schema has passed it; a field it does not declare is refused by name, a value of the wrong type is refused without coercion, and the output is built from the schema's own keys. A test holds each route to the schema listed for its route and method and sends seven malformed bodies to every one of them. `apps/web/lib/schema.ts`, `apps/web/lib/body-schemas.ts`, `apps/web/test/body-schemas.test.mjs` | ASVS 5.1.2, 5.1.3, 5.1.4, 13.2.2; ISO 27001 8.28 |

## What remains, in code

Nothing a pull request can close. The [ASVS mapping](asvs-l2.md) has no gaps,
and every row it still marks *Partial* waits on the owner or the platform, or
records a trade-off made on purpose and explained in the row itself. The last
item that was here, a record of a person reading their own library (ASVS
8.3.5), shipped once the owner decided it was worth a line per read.

## What only the owner can do

None of these is code, and an audit cannot pass without them. Each names the
requirement that asks for it.

| What | Why an auditor asks | Reference |
| --- | --- | --- |
| An information security policy, roles and responsibilities, approved and reviewed yearly | It is where both frameworks start | SOC 2 CC1, CC2, CC5.3; ISO 27001 clauses 5 and 6, A.5.1 to A.5.4 |
| A risk assessment and treatment plan, with a Statement of Applicability | ISO 27001 cannot be certified without one; SOC 2 asks for the risk process | SOC 2 CC3; ISO 27001 6.1, 8.2, 8.3 |
| Multi-factor authentication on GitHub, the hosting platform, npm and the database provider, for every person with access | The repository's controls are only as strong as the accounts that change them | SOC 2 CC6.1; ISO 27001 5.17, 8.5 |
| Decide the session numbers: the defaults (thirty days, a day idle) or ASVS level 2 (`TRAZUM_SESSION_MAX_HOURS=12`, `TRAZUM_SESSION_IDLE_MINUTES=30`), and write the choice and its reason into the security policy | An auditor asks what the numbers are and why; the code holds a default, only the policy can hold the reason | SOC 2 CC6.1; ISO 27001 5.15, 8.5 |
| The platform and secrets settings the ASVS mapping leaves to the owner: a vault behind the two secrets and how often to rotate them (the procedure is [written](secret-rotation.md)); a database role that is not a default account and can only read and write Trazum's tables; TLS 1.2 or later with strong suites and OCSP stapling; no dangling DNS records; two-factor authentication required on the GitHub accounts in `TRAZUM_ADMINS` | Each is a row marked *Owner* in [asvs-l2.md](asvs-l2.md), and code cannot set any of them | ASVS 1.6.1, 2.10.2, 4.3.1, 6.4.1, 9.1.2, 10.3.3; SOC 2 CC6.1, CC6.6; ISO 27001 5.17, 8.20, 8.24 |
| Quarterly access reviews: `TRAZUM_ADMINS`, `TRAZUM_ALLOWED_USERS`, GitHub collaborators, platform and database users | Access granted once and never reviewed is the most common SOC 2 exception | SOC 2 CC6.2, CC6.3; ISO 27001 5.18 |
| Security log retention, alerting and review: how long the platform keeps standard output, who looks, and what pages someone | TRZ-13 writes the lines; keeping and watching them is the operator's | SOC 2 CC7.2, CC7.3; ISO 27001 8.15, 8.16 |
| An incident response plan, and one tabletop exercise a year | SECURITY.md says how to report; nothing says what happens next | SOC 2 CC7.3 to CC7.5; ISO 27001 5.24 to 5.28 |
| Database backups and a tested restore | The data lives with the provider; recovery is a process, not a setting | SOC 2 A1.2, A1.3; ISO 27001 8.13, 5.29, 5.30 |
| Supplier reviews: collect GitHub's, the platform's and the database provider's SOC 2 reports or ISO certificates yearly | They are the subservice organisations above | SOC 2 CC9.2; ISO 27001 5.19 to 5.23 |
| A privacy notice and terms on the hosted app, and a data processing agreement for business customers | The app stores personal data and has no notice yet | SOC 2 P1 to P8; ISO 27001 5.31, 5.34; GDPR |
| Import the branch ruleset, and add a second maintainer who reviews | Change control with one person and no approval is a finding, stated as such in SECURITY.md | SOC 2 CC8.1; ISO 27001 5.3, 8.32 |
| Repeat the independent review yearly, and after major changes | One audit is a point in time | SOC 2 CC4.1; ISO 27001 5.35 |
| People: background checks where lawful, security training, confidentiality agreements | Required for everyone with access to production | SOC 2 CC1.4; ISO 27001 6.1 to 6.6 |
| Choose the auditor: a CPA firm for a SOC 2 Type I, then a Type II window; or a certification body for ISO 27001 stages 1 and 2 | The only step that produces a certificate | — |

A compliance automation platform (they connect to GitHub, the hosting
platform and the database provider and collect evidence continuously) shortens
most of this list; the matrix's evidence paths are written so they can be
pointed at directly.

## Keeping it true

`packages/core/test/compliance.test.js` fails the build when an evidence path
in the matrix no longer exists, when a row loses a framework reference, or
when the README, the web app's copy or the docs claim a certification or
compliance that this page says does not exist.
