# Control matrix

Every control Trazum implements in code, the file or test that proves it, and
the requirements it answers in three frameworks. Read
[the readiness pack](README.md) first: this is the evidence, not a
certificate, and the organisational half is not in this table.

**References.** SOC 2 uses the AICPA Trust Services Criteria (2017, with the
2022 revised points of focus). ISO 27001 uses the 2022 Annex A control
numbers. ASVS uses OWASP ASVS 4.0.3 section numbers, the version CASA's
assessments were built from. A reference means "this control is evidence
toward that requirement", never "that requirement is met in full": an auditor
decides that, against your whole organisation.

**Status.** *In place*: implemented, tested, and the evidence is in this
repository. *Partial*: implemented with a limit stated in the row. Rows that
need a person rather than code are in the pack's
[owner list](README.md#what-only-the-owner-can-do), not here.

`compliance.test.js` reads this table: every path in an Evidence cell must
exist, and every row must carry a reference in each framework column. A file
renamed without updating this page fails the build.

| ID | Control | Evidence | SOC 2 | ISO 27001 | ASVS | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TRZ-01 | The CLI, MCP server and library read logs and prompts on the user's machine; nothing is sent anywhere unless the user passes a key, a URL or a flag | `docs/audit-rea-2026-11.md`, `packages/core/package.json` | C1.1, CC6.7 | 5.34, 8.12 | V8.3 | In place |
| TRZ-02 | The web page reads a pasted log in the browser; `connect-src 'self'`; a CI probe fails the build if any part of a pasted log leaves the page | `apps/web/middleware.ts`, `scripts/privacy-probe.mjs`, `test/privacy-probe.test.mjs`, `.github/workflows/ci.yml` | C1.1, CC6.7 | 8.12, 8.26 | V8.3, V14.4 | In place |
| TRZ-03 | Sign-in is delegated to GitHub OAuth with a state bound to a `__Host-` cookie and a ten-minute window; GitHub's access token is used once and never stored | `apps/web/lib/auth/github.ts`, `apps/web/app/api/auth/github/callback/route.ts`, `apps/web/test/auth.test.mjs` | CC6.1 | 5.17, 8.5 | V3.2 | In place |
| TRZ-04 | Who may sign in is the operator's list; a refused account is never written | `apps/web/lib/auth/allowlist.ts`, `apps/web/test/auth-routes.test.mjs` | CC6.2 | 5.16, 5.18 | V4.1 | In place |
| TRZ-05 | Sessions: 256-bit random tokens, stored only as SHA-256, `__Host-` cookie with `HttpOnly`, `Secure` and `SameSite=Lax`; 30-day absolute lifetime; sign-out and sign-out everywhere; expired sessions swept | `apps/web/lib/auth/session.ts`, `apps/web/lib/auth/cookies.ts`, `apps/web/app/api/auth/signout/route.ts` | CC6.1 | 8.5, 8.24 | V3.2, V3.3, V3.4, V6.3 | Partial: no idle timeout, the absolute 30 days that ASVS level 1 accepts |
| TRZ-06 | Every library, share and admin route resolves the caller from the session; records are looked up by owner; the admin overview answers 404 to anyone not on the operator's list | `apps/web/lib/prompts/api.ts`, `apps/web/lib/admin/config.ts`, `apps/web/app/api/admin/overview/route.ts`, `apps/web/test/admin.test.mjs`, `apps/web/test/prompts.test.mjs` | CC6.1, CC6.3 | 5.15, 8.2 | V4.1, V4.2 | In place |
| TRZ-07 | Writes from another origin are refused, on top of `SameSite=Lax` | `apps/web/lib/auth/routes.ts`, `apps/web/test/shares.test.mjs` | CC6.6 | 8.26 | V4.2 | In place |
| TRZ-08 | Sign-in, account and library routes are rate-limited | `apps/web/lib/rate-limit.ts`, `apps/web/test/rate-limit.test.mjs` | CC6.6 | 8.26 | V11.1 | Partial: counted per server instance, a barrier to scripts and not to a distributed attacker |
| TRZ-09 | Security headers: a nonce-based CSP with `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` denying unused features, `Cross-Origin-Opener-Policy: same-origin` | `apps/web/middleware.ts`, `apps/web/next.config.mjs`, `apps/web/test/middleware.test.mjs`, `apps/web/test/route-invariants.test.mjs` | CC6.7 | 8.26 | V14.4, V9.1 | In place |
| TRZ-10 | The database holds only what is listed in the accounts guide; deleting an account removes its sessions, prompts, versions and share links at once; share links expire and can be revoked | `docs/accounts.md`, `apps/web/app/api/account/route.ts`, `apps/web/test/account-delete.test.mjs`, `apps/web/lib/store/shares.ts` | C1.2, P4.3 | 5.34, 8.10 | V8.3 | In place |
| TRZ-11 | An account can download everything it holds as one file, without the session hashes that would open it | `apps/web/app/api/account/route.ts`, `apps/web/test/account-delete.test.mjs` | P5.1 | 5.34 | V8.3 | In place |
| TRZ-12 | Analytics are off unless the operator sets a key; when on, share and badge tokens and every query string are removed before an event leaves the browser | `apps/web/lib/analytics.ts`, `apps/web/test/analytics.test.mjs` | C1.1 | 5.34, 8.12 | V8.3 | In place |
| TRZ-13 | Security events (sign-in, sign-out, export, deletion, shares made and revoked, admin access, every refusal) are written as structured lines with an internal id and no token, login, address or prompt text | `apps/web/lib/security-log.ts`, `apps/web/test/security-log.test.mjs` | CC7.2, CC7.3 | 8.15, 8.16 | V7.1, V7.2 | Partial: written to standard output; retention, alerting and review are the operator's |
| TRZ-14 | Every change goes through a pull request with required checks, linear history and no force-push; code owners on every path | `.github/rulesets/main-branch.json`, `.github/CODEOWNERS`, `SECURITY.md` | CC8.1 | 8.32, 8.4 | V1.1 | Partial: the ruleset has to be imported by an admin, and with one maintainer no second person approves |
| TRZ-15 | Build, tests, typecheck, the web build, the privacy probe and a packed-release stress run on every change | `.github/workflows/ci.yml`, `scripts/verify-packed-release.mjs` | CC8.1, CC7.1 | 8.25, 8.29 | V1.1, V14.1 | In place |
| TRZ-16 | Static analysis and vulnerability management: CodeQL, dependency review, `npm audit`, Socket, Dependabot, and a check that `main` carries no open high-severity alert | `.github/workflows/security.yml`, `.github/dependabot.yml`, `.github/codeql` | CC7.1 | 8.8, 8.28 | V14.2 | In place |
| TRZ-17 | Supply chain: no third-party runtime dependency in core, CLI or MCP (the CLI and MCP depend only on core); installs run with `--ignore-scripts`; Actions pinned to commit SHAs; least-privilege workflow permissions | `packages/core/package.json`, `packages/cli/package.json`, `.github/workflows/ci.yml`, `packages/core/test/security.test.js` | CC6.8, CC9.2 | 5.21, 8.7 | V14.2, V10.3 | In place |
| TRZ-18 | Releases are published by the workflow, with an OIDC-signed provenance attestation, from the merge that bumps the version | `.github/workflows/release.yml`, `docs/releasing.md`, `packages/core/test/publish.test.js` | CC8.1 | 8.32, 5.21 | V10.3 | In place |
| TRZ-19 | Every commit is signed off (DCO) and every contributor has signed the CLA | `.github/workflows/dco.yml`, `.github/workflows/cla.yml` | CC8.1 | 5.31, 8.4 | V1.1 | In place |
| TRZ-20 | Input that was never meant for the tool is fuzzed: seeded property suites hold that parsers never throw, never grow, stay idempotent and keep money non-negative | `docs/hardening.md`, `packages/core/test/properties-usage.test.js`, `packages/core/test/properties-redaction.test.js` | CC7.1, PI1.2 | 8.29, 8.28 | V5.1 | In place |
| TRZ-21 | A published way to report a vulnerability, with what to expect | `SECURITY.md` | CC2.3 | 6.8, 5.24 | V1.1 | Partial: no written incident response procedure (owner) |
| TRZ-22 | An independent review from outside: REA read the shipped packages and the production page | `docs/audit-rea-2026-11.md` | CC4.1 | 5.35 | V1.1 | Partial: done once; repeating it is the owner's |
| TRZ-23 | Secrets come from the environment only; none is committed; the OAuth client secret and database URL are read at runtime | `apps/web/lib/auth/config.ts`, `apps/web/lib/store/index.ts` | CC6.1 | 5.17, 8.24 | V2.10, V6.4 | In place |
