# OWASP ASVS 4.0.3, level 2, requirement by requirement

Every requirement OWASP ASVS 4.0.3 sets at level 2, 259 of them, and where the
hosted Trazum web app stands on each. Read [the readiness pack](README.md)
first: this is evidence for an assessor, not a verification. Nobody has
verified Trazum against ASVS at any level.

The requirement column is a short paraphrase, written here so the table can be
read on its own; it is not the standard's text. Before relying on a row, read
the requirement itself in [ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3/4.0/en),
which is published by OWASP under CC BY-SA 3.0. Level 1 requirements are
included, because level 2 contains them.

**Scope.** The hosted web app with accounts switched on, as the pack draws it.
The CLI, MCP server and libraries run on the user's machine and are out of
scope; where a row says something about them it says so.

**Status.**

- **Met**: implemented in this repository, with the evidence named.
- **Partial**: part of it is; the row says what is missing.
- **Gap**: not implemented, and a pull request could do it. Each gap is listed
  in [what remains, in code](README.md#what-remains-in-code).
- **Owner**: needs the operator or the organisation, not code. These belong to
  [the owner list](README.md#what-only-the-owner-can-do).
- **N/A**: does not apply, with the reason: Trazum stores no password, accepts
  no file, parses no XML and has no GraphQL.

`compliance.test.js` holds this page to the standard: every level 2 ID appears
exactly once, every status is one of the five, every path cited exists, every
gap is listed in the pack, and the summary below matches the rows.

## Summary

| Chapter | Requirements | Met | Partial | Gap | Owner | N/A |
| --- | --- | --- | --- | --- | --- | --- |
| V1 Architecture, design and threat modelling | 38 | 20 | 14 | 0 | 3 | 1 |
| V2 Authentication | 53 | 3 | 1 | 0 | 2 | 47 |
| V3 Session management | 18 | 13 | 2 | 0 | 0 | 3 |
| V4 Access control | 9 | 7 | 0 | 0 | 1 | 1 |
| V5 Validation, sanitisation and encoding | 30 | 16 | 1 | 0 | 0 | 13 |
| V6 Stored cryptography | 13 | 6 | 0 | 0 | 3 | 4 |
| V7 Error handling and logging | 12 | 7 | 4 | 0 | 1 | 0 |
| V8 Data protection | 15 | 6 | 6 | 0 | 1 | 2 |
| V9 Communication | 7 | 4 | 0 | 0 | 3 | 0 |
| V10 Malicious code | 5 | 2 | 1 | 0 | 1 | 1 |
| V11 Business logic | 8 | 2 | 4 | 0 | 1 | 1 |
| V12 Files and resources | 15 | 5 | 0 | 0 | 0 | 10 |
| V13 API and web services | 13 | 5 | 2 | 2 | 0 | 4 |
| V14 Configuration | 23 | 15 | 5 | 1 | 0 | 2 |
| **Total** | **259** | **111** | **40** | **3** | **16** | **89** |

Most of V2 is not applicable for one reason: Trazum has no passwords. Signing
in is delegated to GitHub, so the password, its storage, its recovery and any
second factor are GitHub's, and GitHub's own assessments cover them.

## V1 Architecture, design and threat modelling

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 1.1.1 | A secure development lifecycle covers every stage | Partial | Every change is a pull request with tests, CodeQL, dependency review and signed releases (`.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`). A written lifecycle policy is the owner's. |
| 1.1.2 | Threat modelling for every design change | Owner | No threat model is kept per change. The pull request template asks what a change refuses to do, which is a part of one, not the whole. |
| 1.1.3 | Features carry their security constraints | Partial | The pull request template asks for what the change refuses and the guard planted to prove it (`.github/PULL_REQUEST_TEMPLATE.md`); there are no user stories to attach constraints to. |
| 1.1.4 | Trust boundaries, components and data flows documented | Met | The system in scope, its components and subservice organisations (`docs/compliance/README.md`); every item of data and where it goes (`docs/accounts.md`). |
| 1.1.5 | Architecture and remote services analysed for security | Partial | Components and remote services are listed (`docs/compliance/README.md`) and the independent review covered them; no standalone security analysis document exists. |
| 1.1.6 | Security controls centralised and reused | Met | One function answers who is asking (`apps/web/lib/auth/session.ts`), one guard every library route starts with (`apps/web/lib/prompts/api.ts`), one limiter, one security log (`apps/web/lib/security-log.ts`). |
| 1.1.7 | Secure coding guidance available to developers | Partial | `CONTRIBUTING.md`, `SECURITY.md` and the pull request checklist; no dedicated secure coding checklist. |
| 1.2.1 | Components run under low-privilege accounts | Met | The container runs as the unprivileged `node` user (`Dockerfile`). |
| 1.2.2 | Component communications authenticated with least privilege | Partial | The database connection is authenticated and its certificate verified (`apps/web/lib/store/index.ts`). The app connects as the owner of its tables; a role limited to reading and writing them is the operator's to create. |
| 1.2.3 | One vetted authentication mechanism, logged | Met | GitHub OAuth only (`apps/web/lib/auth/github.ts`), and every sign-in decision is logged (`apps/web/lib/security-log.ts`). |
| 1.2.4 | No weaker alternative authentication path | Met | There is one path. No password, API key or magic link signs anybody in (`apps/web/app/api/auth/github/callback/route.ts`). |
| 1.4.1 | Access control enforced server-side, never in the client | Met | Every library, share, account and admin route resolves the caller on the server (`apps/web/lib/prompts/api.ts`); the browser only hides buttons. Tested in `apps/web/test/prompts.test.mjs`. |
| 1.4.4 | One access control mechanism for every request | Met | `requireCaller` and owner-bound store methods; no lookup takes an id without an owner (`apps/web/lib/prompts/api.ts`, `apps/web/lib/store/prompts.ts`). |
| 1.4.5 | Authorisation per data item, not only per role | Met | Every record is fetched by owner; the admin overview checks the operator's list (`apps/web/lib/admin/config.ts`). Tested in `apps/web/test/admin.test.mjs`. |
| 1.5.1 | Input and output handling defined by type, content and law | Partial | Each stored field, its limit and its handling are documented (`docs/accounts.md`); there is no formal data handling specification. |
| 1.5.2 | No serialisation to untrusted clients beyond plain data | Met | JSON only, parsed into plain values and validated field by field (`apps/web/app/api/prompts/route.ts`). |
| 1.5.3 | Input validated on a trusted layer | Met | In the route handlers, never only in the browser (`apps/web/app/api/prompts/route.ts`, `apps/web/lib/shares/api.ts`). |
| 1.5.4 | Output encoded by the interpreter it is meant for | Met | React renders text as text (`apps/web/app/c/[token]/page.tsx`); SQL values are bound, never concatenated (`apps/web/lib/store/postgres.ts`). |
| 1.6.1 | Key management policy and lifecycle | Owner | Trazum holds two secrets, the GitHub client secret and the database URL; their lifecycle is the operator's policy. |
| 1.6.2 | Key material held in a vault or behind an API | Partial | Secrets are read from the environment at runtime and never committed (`apps/web/lib/auth/config.ts`); which vault backs that environment is the operator's. |
| 1.6.3 | Keys and passwords replaceable | Partial | Both secrets are replaced by changing the environment, and nothing at rest is encrypted under them, so nothing needs re-encrypting (`apps/web/lib/auth/config.ts`). The rotation procedure is not written down. |
| 1.6.4 | Client-side secrets never protect sensitive data | Met | The browser holds no secret. A provider key a visitor pastes is their own, sent with that one request and never stored (`apps/web/app/api/optimize/route.ts`). |
| 1.7.1 | A common logging format | Met | One JSON line shape for every security event (`apps/web/lib/security-log.ts`). |
| 1.7.2 | Logs shipped to a remote system for analysis | Owner | Lines go to standard output, which the platform collects; forwarding them to analysis and alerting is the operator's. |
| 1.8.1 | Sensitive data identified and classified | Partial | Identified item by item (`docs/accounts.md`); not graded into formal protection levels. |
| 1.8.2 | Protection requirements per level, applied | Partial | Each item's protection is stated with it: hashed tokens, owner-bound prompts, keyed address hashes (`docs/accounts.md`). Without formal levels there is no level-to-requirement table. |
| 1.9.1 | Communications between components encrypted | Met | TLS to any non-loopback database by default, GitHub over HTTPS (`apps/web/lib/store/index.ts`). |
| 1.9.2 | Both ends of a link authenticated | Met | `verify-full` by default for a remote database; loosening it is an explicit setting (`apps/web/lib/store/index.ts`). Tested in `apps/web/test/auth.test.mjs`. |
| 1.10.1 | Source control with traceable, reviewed changes | Partial | Pull requests, signed-off commits and code owners (`.github/CODEOWNERS`); the branch ruleset has to be imported by an admin, and with one maintainer no second person reviews (`.github/rulesets/main-branch.json`). |
| 1.11.1 | Components documented by function | Met | The component table in `docs/compliance/README.md`. |
| 1.11.2 | High-value flows share no unsynchronised state | Met | With a database, sessions and the shared rate limits live in it, written in single statements (`apps/web/lib/store/postgres.ts`, `apps/web/lib/shared-limit.ts`). The memory store is per instance and the UI says so. |
| 1.12.2 | User files served as downloads or from another domain | N/A | The server accepts and serves no uploaded file. |
| 1.14.1 | Components of different trust segregated | Partial | The database is reachable only through the app, and row level security closes REST layers in front of it (`apps/web/db/001_accounts.sql`); network segregation is the platform's. |
| 1.14.2 | Binaries delivered signed and from verified endpoints | Met | npm packages are published by the workflow with an OIDC-signed provenance attestation (`.github/workflows/release.yml`). |
| 1.14.3 | The pipeline flags outdated or insecure components | Met | Dependency review, `npm audit`, Socket and Dependabot (`.github/workflows/security.yml`, `.github/dependabot.yml`). |
| 1.14.4 | The build verifies a secure deployment | Partial | CI builds the production web server and runs the privacy probe against it (`.github/workflows/ci.yml`, `scripts/privacy-probe.mjs`); the hosting platform's own configuration is not verified from here. |
| 1.14.5 | Deployments sandboxed or containerised | Partial | A non-root container (`Dockerfile`), or the platform's isolated functions; network-level isolation is the operator's. |
| 1.14.6 | No deprecated client-side technology | Met | No plugins of any kind; `object-src 'none'` (`apps/web/middleware.ts`). |

## V2 Authentication

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 2.1.1 | Passwords of at least 12 characters | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.2 | Passwords up to 64 allowed, over 128 denied | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.3 | No password truncation | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.4 | Any printable Unicode allowed in passwords | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.5 | Users can change their password | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.6 | Password change asks for the current one | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.7 | Passwords checked against breached lists | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.8 | A password strength meter | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.9 | No composition rules | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.10 | No forced rotation or history | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.11 | Paste and password managers allowed | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.1.12 | Masked password can be shown | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.2.1 | Anti-automation against credential attacks | Met | The sign-in routes are rate-limited across instances (`apps/web/lib/auth/routes.ts`, `apps/web/lib/shared-limit.ts`); guessing a GitHub password happens at GitHub, which limits it. |
| 2.2.2 | Weak authenticators only as secondary factors | N/A | Trazum offers no authenticator. GitHub's own choices apply to GitHub's sign-in. |
| 2.2.3 | Secure notifications after authentication changes | N/A | Trazum holds no authentication detail to change and no address to notify; GitHub notifies about its own sign-ins and new authorisations. |
| 2.3.1 | Initial passwords or codes random and short-lived | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.3.2 | Hardware authenticators supported | N/A | Delegated: GitHub supports security keys and passkeys, and Trazum has no authenticator of its own. |
| 2.3.3 | Renewal reminders for time-bound authenticators | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.4.1 | Passwords stored with an approved password hash | N/A | No passwords are stored. The only stored secrets are session token hashes: SHA-256 of 256 random bits, where a slow hash buys nothing. |
| 2.4.2 | Unique salt of at least 32 bits | N/A | No passwords are stored. The only stored secrets are session token hashes: SHA-256 of 256 random bits, where a slow hash buys nothing. |
| 2.4.3 | PBKDF2 iterations as high as practical | N/A | No passwords are stored. The only stored secrets are session token hashes: SHA-256 of 256 random bits, where a slow hash buys nothing. |
| 2.4.4 | bcrypt work factor of at least 10 | N/A | No passwords are stored. The only stored secrets are session token hashes: SHA-256 of 256 random bits, where a slow hash buys nothing. |
| 2.4.5 | A secret additional salt (pepper) | N/A | No passwords are stored. The only stored secrets are session token hashes: SHA-256 of 256 random bits, where a slow hash buys nothing. |
| 2.5.1 | Activation or recovery secrets never sent in clear | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.5.2 | No password hints or secret questions | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.5.3 | Recovery never reveals the current password | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.5.4 | No shared or default accounts | Met | No account is built in; admins are named by the operator and the list is empty by default (`apps/web/lib/admin/config.ts`). |
| 2.5.5 | Users told when a factor changes | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.5.6 | Recovery uses a secure mechanism | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.5.7 | Identity proofing when factors are lost | N/A | No passwords: sign-in is delegated to GitHub OAuth, where the password, its policy, recovery and any second factor live. Trazum holds no credential of its own. |
| 2.6.1 | Lookup secrets used once | N/A | No lookup secrets (recovery codes) are issued. |
| 2.6.2 | Lookup secrets with enough entropy | N/A | No lookup secrets (recovery codes) are issued. |
| 2.6.3 | Lookup secrets resistant to offline attack | N/A | No lookup secrets (recovery codes) are issued. |
| 2.7.1 | Clear-text out-of-band not offered by default | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.7.2 | Out-of-band codes expire in 10 minutes | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.7.3 | Out-of-band codes used once | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.7.4 | Out-of-band over a secure independent channel | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.7.5 | Only a hash of the code retained | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.7.6 | Codes from a secure random generator | N/A | No out-of-band authenticator (SMS, email or push code) is used. |
| 2.8.1 | Time-based OTPs have a lifetime | N/A | No one-time passwords or biometrics are used. |
| 2.8.2 | OTP keys highly protected | N/A | No one-time passwords or biometrics are used. |
| 2.8.3 | Approved algorithms for OTPs | N/A | No one-time passwords or biometrics are used. |
| 2.8.4 | A time-based OTP used once | N/A | No one-time passwords or biometrics are used. |
| 2.8.5 | A reused OTP logged and rejected | N/A | No one-time passwords or biometrics are used. |
| 2.8.6 | A lost OTP generator can be revoked | N/A | No one-time passwords or biometrics are used. |
| 2.8.7 | Biometrics only as a secondary factor | N/A | No one-time passwords or biometrics are used. |
| 2.9.1 | Verification keys in protected storage | N/A | No cryptographic authenticator is verified by Trazum. |
| 2.9.2 | Challenge nonce of at least 64 bits | N/A | No cryptographic authenticator is verified by Trazum. |
| 2.9.3 | Approved algorithms for verification | N/A | No cryptographic authenticator is verified by Trazum. |
| 2.10.1 | Service-to-service secrets are not static credentials | Partial | The database URL and the GitHub client secret are static until rotated (`apps/web/lib/auth/config.ts`, `apps/web/lib/store/index.ts`); short-lived database credentials are the operator's choice. |
| 2.10.2 | Service accounts are not default credentials | Owner | The database user is created by the operator. |
| 2.10.3 | Service passwords protected against offline recovery | Owner | They live in the platform's environment, never in the repository; how the platform stores them is the platform's. |
| 2.10.4 | Secrets kept out of source code | Met | Read from the environment at runtime and never committed (`apps/web/lib/auth/config.ts`, `apps/web/lib/store/index.ts`). |

## V3 Session management

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 3.1.1 | Session tokens never in URLs | Met | Cookie only (`apps/web/lib/auth/session.ts`). |
| 3.2.1 | A new token at every sign-in | Met | Each sign-in mints a fresh token (`apps/web/app/api/auth/github/callback/route.ts`). |
| 3.2.2 | Tokens of at least 64 bits of entropy | Met | 256 bits from the CSPRNG (`apps/web/lib/auth/session.ts`). |
| 3.2.3 | Tokens stored only in secure cookies | Met | `__Host-` cookie, `HttpOnly`, `Secure` (`apps/web/lib/auth/session.ts`, `apps/web/lib/auth/cookies.ts`). |
| 3.2.4 | Tokens from approved algorithms | Met | `node:crypto` random bytes; stored as SHA-256 (`apps/web/lib/auth/session.ts`). |
| 3.3.1 | Sign-out and expiry end the session server-side | Met | The row is deleted before the cookie is cleared (`apps/web/app/api/auth/signout/route.ts`); tested in `apps/web/test/auth-routes.test.mjs`. |
| 3.3.2 | Periodic re-authentication, in use and when idle | Partial | A lifetime and an idle window, thirty days and a day by default, which is level 1. `TRAZUM_SESSION_MAX_HOURS=12` and `TRAZUM_SESSION_IDLE_MINUTES=30` give level 2's numbers (`apps/web/lib/auth/config.ts`, `apps/web/test/session-lifetime.test.mjs`); choosing them is the owner's. |
| 3.3.3 | Other sessions can be ended after a password change | N/A | No passwords. *Sign out everywhere* ends every session regardless. |
| 3.3.4 | Users can see and end their active sessions | Partial | *Sign out everywhere* ends them all (`apps/web/app/api/auth/signout/route.ts`); there is no list of sessions to inspect, and no re-authentication before ending them. |
| 3.4.1 | Session cookie `Secure` | Met | `apps/web/lib/auth/cookies.ts`, tested in `apps/web/test/auth.test.mjs`. |
| 3.4.2 | Session cookie `HttpOnly` | Met | `apps/web/lib/auth/cookies.ts`. |
| 3.4.3 | Session cookie `SameSite` | Met | `SameSite=Lax` (`apps/web/lib/auth/session.ts`). |
| 3.4.4 | Session cookie `__Host-` prefix | Met | `apps/web/lib/auth/session.ts`. |
| 3.4.5 | Cookie path as narrow as the domain needs | Met | `__Host-` makes the cookie host-only with `Path=/` (`apps/web/lib/auth/session.ts`). |
| 3.5.1 | Users can revoke OAuth grants to linked apps | N/A | Trazum issues no OAuth tokens to other applications and keeps none from GitHub; revoking Trazum's own authorisation is done at GitHub. |
| 3.5.2 | Session tokens, not static API keys | Met | `apps/web/lib/auth/session.ts`. |
| 3.5.3 | Stateless tokens protected against tampering | N/A | Tokens are opaque and stateful: a row exists or it does not. No JWT is used. |
| 3.7.1 | A full session before sensitive actions | Met | Deleting or exporting an account needs a live session; deletion also needs a same-origin request and the login typed back (`apps/web/app/api/account/route.ts`). |

## V4 Access control

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 4.1.1 | Access rules enforced on a trusted layer | Met | `apps/web/lib/prompts/api.ts`. |
| 4.1.2 | Access attributes cannot be changed by users | Met | Identity comes from the session row and the admin list from the environment; no owner id is ever read from a request (`apps/web/lib/prompts/api.ts`, `apps/web/lib/admin/config.ts`). |
| 4.1.3 | Least privilege | Met | Owner-bound queries, an admin overview that answers 404 to everyone else, and the `read:user` scope only (`apps/web/lib/store/prompts.ts`, `apps/web/lib/auth/github.ts`). |
| 4.1.5 | Access control fails securely | Met | `requireCaller` returns a refusal rather than `null`, so a handler cannot continue past a caller it failed to identify (`apps/web/lib/prompts/api.ts`). |
| 4.2.1 | Protection against insecure direct object references | Met | Somebody else's record is 404, decided in the query (`apps/web/lib/store/prompts.ts`); tested in `apps/web/test/prompts.test.mjs` and `apps/web/test/store-contract.test.mjs`. |
| 4.2.2 | Anti-CSRF for authenticated functions | Met | `SameSite=Lax` plus an Origin check on every write (`apps/web/lib/auth/routes.ts`); tested in `apps/web/test/shares.test.mjs`. |
| 4.3.1 | Multi-factor authentication for administration | Owner | The overview is reached by GitHub sign-in; requiring two-factor authentication on the accounts named in `TRAZUM_ADMINS` is set at GitHub. |
| 4.3.2 | No directory browsing or metadata files | Met | The deployed artefact is the built server and its static assets only (`Dockerfile`). |
| 4.3.3 | Step-up authentication for high-value actions | N/A | No financial or high-value transaction exists. Account deletion asks for the login to be typed back. |

## V5 Validation, sanitisation and encoding

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 5.1.1 | Defence against parameter pollution | Met | Each value is read from one place: the JSON body or one named query parameter; nothing merges sources (`apps/web/app/api/auth/signout/route.ts`, `apps/web/app/api/prompts/route.ts`). |
| 5.1.2 | Defence against mass assignment | Met | Fields are copied one by one; share settings pass a whitelist (`apps/web/lib/shares/api.ts`); tested in `apps/web/test/shares.test.mjs`. |
| 5.1.3 | Positive validation of input | Met | Types, lengths and allow-lists for every field: link lifetimes, levels, models (`apps/web/lib/shares/api.ts`, `apps/web/lib/store/prompts.ts`). |
| 5.1.4 | Structured data validated against a schema | Partial | Validated field by field in each route (`apps/web/app/api/prompts/route.ts`); there is no declarative schema. |
| 5.1.5 | Redirects only to allow-listed destinations | Met | `next` must be a same-origin path (`apps/web/lib/auth/github.ts`); tested in `apps/web/test/auth.test.mjs`. |
| 5.2.1 | Untrusted HTML sanitised | N/A | No HTML is accepted; every user string is rendered as text. |
| 5.2.2 | Unstructured data bounded | Met | Every free-text field has a length ceiling (`apps/web/lib/store/prompts.ts`, `apps/web/lib/shares/api.ts`). |
| 5.2.3 | Mail injection prevented | N/A | Trazum sends no mail. |
| 5.2.4 | No `eval` or dynamic code execution | Met | None in the web app or core; the production CSP has no `unsafe-eval` (`apps/web/middleware.ts`). |
| 5.2.5 | Template injection prevented | N/A | No server-side templates over user input; React components only. |
| 5.2.6 | SSRF prevented | Met | The server fetches only GitHub's fixed URLs and LLM endpoints on the operator's allow-list; redirects are refused (`packages/core/src/net.ts`). |
| 5.2.7 | Scriptable SVG prevented | Met | The only SVG served is generated from numbers, with its own CSP (`apps/web/lib/badge/svg.ts`); tested in `apps/web/test/badge.test.mjs`. |
| 5.2.8 | Markdown and similar user content sandboxed | N/A | User text is never rendered as Markdown or any markup. |
| 5.3.1 | Output encoding for its context | Met | React for HTML, `Response.json` for JSON, bound parameters for SQL (`apps/web/app/c/[token]/page.tsx`, `apps/web/lib/store/postgres.ts`). |
| 5.3.2 | Encoding preserves any Unicode | Met | UTF-8 end to end, with the charset declared on every text response (`apps/web/lib/badge/svg.ts`, `apps/web/middleware.ts`). |
| 5.3.3 | Defence against reflected, stored and DOM XSS | Met | Text rendered as text, never `dangerouslySetInnerHTML` with user data (`apps/web/app/c/[token]/page.tsx`), plus a nonce CSP with `strict-dynamic` (`apps/web/middleware.ts`). |
| 5.3.4 | Parameterised database queries | Met | Every statement is a tagged template (`apps/web/lib/store/postgres.ts`); tested in `apps/web/test/store-postgres.test.mjs`. |
| 5.3.5 | Escaping where parameters are impossible | N/A | No query is built without parameters. |
| 5.3.6 | JSON injection and evaluation prevented | Met | JSON is parsed with `JSON.parse` and written with `JSON.stringify`; nothing evaluates it (`apps/web/app/api/prompts/route.ts`, `apps/web/lib/security-log.ts`). |
| 5.3.7 | LDAP injection prevented | N/A | No LDAP. |
| 5.3.8 | OS command injection prevented | N/A | The web app runs no command. |
| 5.3.9 | File inclusion prevented | N/A | No path is built from a request; the server reads no file on a request's behalf. |
| 5.3.10 | XPath and XML injection prevented | N/A | No XML is parsed. |
| 5.4.1 | Memory-safe string handling | N/A | JavaScript manages memory; there is no native code in the app. |
| 5.4.2 | Constant format strings | N/A | No format strings. |
| 5.4.3 | Integer overflow prevented | Met | Money and counts are range-checked, and seeded property suites hold that they stay finite and non-negative (`packages/core/test/properties-usage.test.js`). |
| 5.5.1 | Serialised objects integrity-protected | N/A | No serialised objects are exchanged; only JSON data, covered by 5.5.3. |
| 5.5.2 | XML parsers restricted (no XXE) | N/A | No XML parser. |
| 5.5.3 | Untrusted data deserialised safely | Met | JSON into plain values, then validated field by field (`apps/web/app/api/prompts/route.ts`). |
| 5.5.4 | JSON parsed with `JSON.parse` | Met | Everywhere, the request bodies included (`apps/web/app/api/prompts/route.ts`). |

## V6 Stored cryptography

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 6.1.1 | Regulated personal data encrypted at rest | Owner | At-rest encryption is the database provider's; Trazum adds no field-level encryption. The personal data held is a GitHub profile and a keyed address hash. |
| 6.1.2 | Health data encrypted at rest | N/A | No health data. |
| 6.1.3 | Financial data encrypted at rest | N/A | No financial data. |
| 6.2.1 | Cryptographic modules fail securely | N/A | The app encrypts nothing; it hashes and computes HMACs only. |
| 6.2.2 | Proven algorithms and libraries, no custom crypto | Met | `node:crypto`: SHA-256, HMAC, HKDF, the CSPRNG (`apps/web/lib/auth/session.ts`, `apps/web/lib/shared-limit.ts`). |
| 6.2.3 | Initialisation vectors and modes configured securely | N/A | No encryption. |
| 6.2.4 | Algorithms can be swapped | Met | Each is one function (`apps/web/lib/auth/session.ts`, `apps/web/lib/shared-limit.ts`); swapping the token hash ends live sessions, which re-issue on the next sign-in. |
| 6.2.5 | No insecure modes or weak hashes | Met | SHA-256 and HMAC-SHA-256 only; no MD5 or SHA-1 in the web app (`apps/web/lib/auth/session.ts`, `apps/web/lib/shared-limit.ts`). |
| 6.2.6 | Nonces never reused | Met | A fresh random CSP nonce per response and OAuth state per sign-in (`apps/web/middleware.ts`, `apps/web/lib/auth/github.ts`). |
| 6.3.1 | Random values from a CSPRNG | Met | `randomBytes`, `getRandomValues`, `randomUUID`; `Math.random` is not used for anything that must be unguessable (`apps/web/lib/auth/session.ts`). |
| 6.3.2 | GUIDs are v4 from a CSPRNG | Met | `randomUUID` (`apps/web/lib/store/postgres.ts`). |
| 6.4.1 | A secrets management solution | Owner | Secrets come from the platform's environment; a vault behind it is the operator's. |
| 6.4.2 | Key material isolated in a security module | Owner | The HMAC key is derived in process from the client secret; an HSM or KMS is the operator's choice. |

## V7 Error handling and logging

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 7.1.1 | No credentials or tokens in logs | Met | The log vocabulary has no field for them (`apps/web/lib/security-log.ts`); a test plants each in a request and searches every line (`apps/web/test/security-log.test.mjs`). |
| 7.1.2 | No other sensitive data in logs | Met | No login, address, share token or prompt text; internal ids only (`apps/web/lib/security-log.ts`). |
| 7.1.3 | Security events logged | Partial | Sign-ins, sign-outs, exports, deletions, shares and every access refusal (`apps/web/lib/security-log.ts`); a request refused for invalid input (400) is not logged. |
| 7.1.4 | Each event carries what an investigation needs | Met | UTC time, event, outcome, internal user id, route and reason code (`apps/web/lib/security-log.ts`). |
| 7.2.1 | Authentication decisions logged | Partial | Every sign-in, with the reason for each refusal (`apps/web/app/api/auth/github/callback/route.ts`); a lookup that finds no live session on `/api/auth/session` is answered without a line. |
| 7.2.2 | Failed access control decisions logged | Met | Every refusal is an `access.refused` line with its reason (`apps/web/lib/prompts/api.ts`, `apps/web/lib/security-log.ts`). |
| 7.3.1 | Logs encoded against injection | Met | `JSON.stringify` over a closed vocabulary; the route is a redacted path (`apps/web/lib/security-log.ts`). |
| 7.3.3 | Logs protected from access and modification | Owner | Standard output is held by the platform; who can read it is the operator's configuration. |
| 7.3.4 | Synchronised time, in UTC | Met | ISO 8601 in UTC (`apps/web/lib/security-log.ts`); clock synchronisation is the platform's. |
| 7.4.1 | Generic messages for unexpected errors | Partial | Refusals are short fixed messages (`apps/web/lib/auth/routes.ts`); an unexpected error reaches the framework's generic production page. No custom error page carries an incident id. |
| 7.4.2 | Exceptions handled across the code | Met | Expected failures are caught where they happen: malformed JSON, a store refusal, a provider error (`apps/web/app/api/prompts/route.ts`, `apps/web/app/api/optimize/route.ts`). |
| 7.4.3 | A last-resort error handler | Partial | The framework catches any unhandled exception and answers 500 without detail (`apps/web/package.json`); there is no application error boundary of its own that records one. |

## V8 Data protection

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 8.1.1 | Sensitive data kept out of server-side caches | Met | Every response carrying account data is `private, no-store` (`apps/web/lib/prompts/api.ts`, `apps/web/app/api/auth/session/route.ts`, `apps/web/app/api/account/route.ts`). |
| 8.1.2 | Temporary server copies protected or purged | Met | No server-side cache of account data exists; every answer is read from the store and marked `no-store` (`apps/web/lib/prompts/api.ts`). |
| 8.1.3 | Request parameters kept to a minimum | Met | One cookie (`apps/web/lib/auth/session.ts`) and small JSON bodies. |
| 8.1.4 | Abnormal request volumes detected and alerted | Partial | Limits refuse them and every refusal is logged (`apps/web/lib/shared-limit.ts`, `apps/web/lib/security-log.ts`); alerting on those lines is the operator's. |
| 8.2.1 | Anti-caching headers on sensitive data | Met | `private, no-store` (`apps/web/lib/prompts/api.ts`). |
| 8.2.2 | No sensitive data in browser storage | Partial | Account data is never stored in the browser and the session cookie is `HttpOnly`; the optimiser keeps the visitor's last 20 prompts in their own `localStorage`, by design (`apps/web/components/Optimizer.tsx`). |
| 8.2.3 | Client copies cleared when the session ends | Met | Sign-out reloads the page, dropping everything it held about the account (`apps/web/components/Account.tsx`). |
| 8.3.1 | Sensitive data in bodies and headers, not query strings | Partial | Share tokens are path segments, capability URLs by design, and the OAuth code arrives in a query string because the protocol puts it there; both are redacted from logs and analytics (`apps/web/lib/security-log.ts`, `apps/web/lib/analytics.ts`) and `Referrer-Policy` is `no-referrer`. |
| 8.3.2 | Users can export and delete their data | Met | `GET` and `DELETE /api/account` (`apps/web/app/api/account/route.ts`); tested in `apps/web/test/account-delete.test.mjs`. |
| 8.3.3 | Clear language and consent for personal data | Owner | The accounts guide says what is kept; a privacy notice in the app, and consent where it is required, are the owner's. |
| 8.3.4 | Sensitive data identified, with a policy | Partial | Identified (`docs/accounts.md`); the policy for handling it is the owner's. |
| 8.3.5 | Access to sensitive data audited | Partial | Exports, deletions and admin access are logged (`apps/web/lib/security-log.ts`); a person reading their own library is not. |
| 8.3.6 | Sensitive memory overwritten after use | N/A | JavaScript gives no control over memory; tokens are not kept beyond the request that carries them. |
| 8.3.7 | Encryption with confidentiality and integrity | N/A | The app encrypts nothing itself; transport is TLS and storage encryption is the provider's. |
| 8.3.8 | Retention: old data deleted on a schedule | Partial | Sessions and rate-limit rows are swept, share links expire (`apps/web/lib/store/shares.ts`); prompts stay until their owner deletes them, and log retention is the operator's. |

## V9 Communication

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 9.1.1 | TLS for all client traffic, no fallback | Met | HSTS for a year with subdomains in production (`apps/web/next.config.mjs`); sign-in refuses plain HTTP off localhost (`apps/web/lib/auth/config.ts`). |
| 9.1.2 | Strong cipher suites only | Owner | TLS is terminated by the hosting platform. |
| 9.1.3 | TLS 1.2 and 1.3 only | Owner | TLS is terminated by the hosting platform. |
| 9.2.1 | Trusted certificates on every connection | Met | The database certificate is verified by default (`apps/web/lib/store/index.ts`); GitHub over Node's CA store. |
| 9.2.2 | TLS for every inbound and outbound connection | Met | Including the database, except on the loopback interface (`apps/web/lib/store/index.ts`). |
| 9.2.3 | Connections to external systems authenticated | Met | The database with its credentials over verified TLS (`apps/web/lib/store/index.ts`); GitHub with the client credentials (`apps/web/lib/auth/github.ts`). |
| 9.2.4 | Certificate revocation checking (OCSP stapling) | Owner | TLS is terminated by the hosting platform. |

## V10 Malicious code

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 10.2.1 | No unauthorised phone-home or data collection | Partial | The CLI, MCP server and libraries send nothing unless the user asks (`packages/core/package.json`, `docs/audit-rea-2026-11.md`). Web analytics are off unless the operator sets a key, and strip tokens when on (`apps/web/lib/analytics.ts`); visitors are not asked for consent when an operator turns them on. |
| 10.2.2 | No excessive permissions | Met | `Permissions-Policy` denies camera, microphone, location and the rest (`apps/web/next.config.mjs`); the OAuth scope is `read:user` (`apps/web/lib/auth/github.ts`). |
| 10.3.1 | Auto-updates signed and verified | N/A | Nothing updates itself. |
| 10.3.2 | Integrity protection, no code from untrusted sources | Met | Only first-party scripts run, under a nonce CSP (`apps/web/middleware.ts`); releases carry provenance (`.github/workflows/release.yml`). |
| 10.3.3 | Protection from subdomain takeover | Owner | DNS is the operator's. |

## V11 Business logic

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 11.1.1 | Flows processed in order, without skipped steps | Met | The callback refuses any request without the state its own first step set, within ten minutes (`apps/web/app/api/auth/github/callback/route.ts`); tested in `apps/web/test/auth-routes.test.mjs`. |
| 11.1.2 | Flows at realistic human speed | N/A | No multi-step business transaction exists whose speed matters. |
| 11.1.3 | Per-user limits on business actions | Met | Per-account ceilings: 200 prompts, 500 versions each, 100 share links (`apps/web/lib/store/prompts.ts`, `apps/web/lib/store/shares.ts`). |
| 11.1.4 | Anti-automation against excessive calls | Partial | Every route is rate-limited and every input bounded (`apps/web/lib/shared-limit.ts`); keyed on the address, so an attacker with many addresses gets a budget per address. |
| 11.1.5 | Limits derived from identified business risks | Partial | Each limit states the risk it answers beside its number (`apps/web/lib/auth/routes.ts`, `apps/web/lib/store/prompts.ts`); there is no threat model to derive them from. |
| 11.1.6 | No race conditions on sensitive operations | Partial | Account deletion, rate counts and session refreshes are single statements (`apps/web/lib/store/postgres.ts`). Two simultaneous saves of one prompt cannot both become the same version, the second fails instead; the per-account ceilings are counted before inserting, so saves in flight together can pass one. |
| 11.1.7 | Unusual business activity monitored | Partial | Refusals are logged with reasons (`apps/web/lib/security-log.ts`); watching them is the operator's. |
| 11.1.8 | Configurable alerting on automated attacks | Owner | Alerting runs on the platform's logs. |

## V12 Files and resources

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 12.1.1 | Large inputs refused | Met | Request bodies are capped (400 KB for a prompt) and the server accepts no file (`apps/web/app/api/optimize/route.ts`). |
| 12.1.2 | Compressed files checked before expanding | N/A | The server accepts no file. Logs are read in the browser. |
| 12.1.3 | Per-user storage quota | Met | Per-account ceilings on prompts, versions, characters and links (`apps/web/lib/store/prompts.ts`, `apps/web/lib/store/shares.ts`). |
| 12.2.1 | Files validated by content | N/A | The server accepts no file. |
| 12.3.1 | User file names never reach the file system | N/A | The server accepts no file name. |
| 12.3.2 | File names validated against local inclusion | N/A | The server accepts no file name. |
| 12.3.3 | File names validated against remote inclusion | N/A | The server accepts no file name. |
| 12.3.4 | Reflected file download prevented | N/A | No user-supplied file name is reflected in a response. |
| 12.3.5 | File metadata never reaches system calls | N/A | The server accepts no file. |
| 12.3.6 | No functionality from untrusted sources | Met | No CDN; npm dependencies locked and reviewed on every change (`.github/workflows/security.yml`); core has no runtime dependency (`packages/core/package.json`). |
| 12.4.1 | Untrusted files stored outside the web root | N/A | No file is stored. |
| 12.4.2 | Untrusted files scanned for malware | N/A | No file is stored. |
| 12.5.1 | Only intended file types served | Met | The deployment serves the built app and its static assets only, never the source tree (`Dockerfile`). |
| 12.5.2 | Uploaded files never executed as content | N/A | No file is uploaded. |
| 12.6.1 | Outbound requests restricted to an allow-list | Met | GitHub's fixed URLs and the operator's LLM endpoints only (`packages/core/src/net.ts`, `apps/web/lib/auth/github.ts`). |

## V13 API and web services

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 13.1.1 | One parser for URLs everywhere | Met | The WHATWG `URL` parser for redirects and endpoints alike (`apps/web/lib/auth/github.ts`, `packages/core/src/net.ts`). |
| 13.1.3 | No secrets in API URLs | Partial | No session token or key ever is. Share tokens are capability URLs by design, redacted from logs and analytics, with `no-referrer` and `noindex` (`apps/web/lib/security-log.ts`, `apps/web/next.config.mjs`). |
| 13.1.4 | Authorisation at the route and at the resource | Met | `requireCaller` on the route, owner binding in the query (`apps/web/lib/prompts/api.ts`, `apps/web/lib/store/prompts.ts`). |
| 13.1.5 | Unexpected content types refused (406, 415) | Gap | JSON routes parse the body whatever its `Content-Type`, and the account deletion request is sent without one (`apps/web/components/Account.tsx`). |
| 13.2.1 | Only valid HTTP methods enabled | Met | Each route exports only the methods it serves; any other gets 405 from the framework (`apps/web/app/api/prompts/route.ts`). |
| 13.2.2 | JSON validated against a schema before use | Partial | Field-by-field validation in each route (`apps/web/app/api/prompts/route.ts`); no declarative schema. |
| 13.2.3 | CSRF protection for cookie-authenticated APIs | Met | Origin check on writes plus `SameSite=Lax` (`apps/web/lib/auth/routes.ts`). |
| 13.2.5 | The incoming `Content-Type` checked | Gap | As 13.1.5. |
| 13.2.6 | Headers and payload protected in transit | Met | TLS only, with HSTS (`apps/web/next.config.mjs`). |
| 13.3.1 | XML schema validation | N/A | No XML. |
| 13.3.2 | WS-Security signatures | N/A | No SOAP. |
| 13.4.1 | GraphQL query depth and cost limits | N/A | No GraphQL. |
| 13.4.2 | GraphQL authorisation in the business layer | N/A | No GraphQL. |

## V14 Configuration

| ID | Requirement | Status | Evidence, or why |
| --- | --- | --- | --- |
| 14.1.1 | Secure, repeatable build and deployment | Met | CI on every change and releases from the merge that bumps the version (`.github/workflows/ci.yml`, `.github/workflows/release.yml`). |
| 14.1.2 | Compiler hardening flags | N/A | No native code is compiled. |
| 14.1.3 | Server configuration hardened | Met | `x-powered-by` off, security headers on every page, a standalone non-root server (`apps/web/next.config.mjs`, `Dockerfile`). |
| 14.1.4 | Redeployable from scripts, or restorable from backups | Partial | The app redeploys from the repository (`Dockerfile`, `n0-app.json`); database backups and a tested restore are the owner's. |
| 14.2.1 | Components kept up to date | Met | Dependabot, `npm audit` and dependency review (`.github/dependabot.yml`, `.github/workflows/security.yml`). |
| 14.2.2 | Unneeded features and samples removed | Met | The production image carries the built server only (`Dockerfile`). |
| 14.2.3 | Subresource integrity for CDN assets | N/A | Nothing is loaded from a CDN; scripts, styles and fonts come from the app's own origin. |
| 14.2.4 | Components from trusted, maintained repositories | Met | The npm registry, through a lockfile, reviewed by Socket and dependency review (`.github/workflows/security.yml`). |
| 14.2.5 | A software bill of materials | Partial | The lockfile lists every dependency and Socket reports one per pull request (`.github/workflows/security.yml`); no SBOM is attached to releases. |
| 14.2.6 | Third-party libraries kept to what is needed | Partial | Core, CLI and MCP have no third-party runtime dependency (`packages/core/package.json`); the web app depends on Next, React and `postgres` directly. |
| 14.3.2 | Debug modes off in production | Met | Production builds only; `unsafe-eval` exists only in development (`apps/web/middleware.ts`). |
| 14.3.3 | No version details in responses | Met | `poweredByHeader: false` (`apps/web/next.config.mjs`). |
| 14.4.1 | A `Content-Type` with charset on every response | Met | JSON, HTML, SVG and plain text each declare theirs (`apps/web/lib/badge/svg.ts`, `apps/web/middleware.ts`). |
| 14.4.2 | API responses carry `Content-Disposition: attachment` | Gap | Only the account export sets one (`apps/web/app/api/account/route.ts`). |
| 14.4.3 | A Content Security Policy | Met | Nonce-based with `strict-dynamic` (`apps/web/middleware.ts`); tested in `apps/web/test/middleware.test.mjs`. |
| 14.4.4 | `X-Content-Type-Options: nosniff` | Met | `apps/web/next.config.mjs`. |
| 14.4.5 | HSTS on every response, with subdomains | Met | In production (`apps/web/next.config.mjs`); tested in `apps/web/test/route-invariants.test.mjs`. |
| 14.4.6 | A Referrer-Policy | Met | `no-referrer` (`apps/web/next.config.mjs`). |
| 14.4.7 | Not embeddable by third-party sites | Met | `frame-ancestors 'none'` and `X-Frame-Options: DENY` (`apps/web/middleware.ts`, `apps/web/next.config.mjs`). |
| 14.5.1 | Only methods in use accepted, others logged | Partial | Unused methods get 405 from the framework (`apps/web/app/api/prompts/route.ts`); they are not logged. |
| 14.5.2 | The Origin header never grants access | Met | It only refuses cross-origin writes, on top of the session (`apps/web/lib/auth/routes.ts`). |
| 14.5.3 | CORS with a strict allow-list | Met | No CORS header is sent at all, so the API is same-origin only (`apps/web/next.config.mjs`, `apps/web/middleware.ts`). |
| 14.5.4 | Proxy-added headers authenticated | Partial | `X-Forwarded-For` keys rate limits and nothing else, never identity (`apps/web/lib/rate-limit.ts`); on a platform that does not overwrite it, a caller chooses their own bucket. |
