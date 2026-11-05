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
references.

## What each framework is, and who it applies to

| Framework | What is assessed | Who issues it | What the repository can do |
| --- | --- | --- | --- |
| **SOC 2** (AICPA Trust Services Criteria) | An organisation's controls over a system. Type I at a point in time; Type II over an observation period, typically 3 to 12 months | A licensed CPA firm | Provide the technical controls and their evidence (the matrix) and a precise system description (below) |
| **ISO/IEC 27001:2022** | An organisation's information security management system (ISMS): policies, risk treatment, the Annex A controls that apply, internal audit, management review | An accredited certification body, in two stages | The same, mapped to Annex A; the ISMS itself is the organisation's |
| **OWASP ASVS 4.0.3** | An application's security requirements, at levels 1 to 3 | Nobody issues it; it is a standard to test against | Most of it: the matrix maps what is in place |
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
| Database | Postgres when `TRAZUM_DATABASE_URL` is set; memory otherwise | The operator's database provider | Users, hashed sessions, prompts and versions, share links ([what exactly](../accounts.md#what-it-does-with-your-data)) |
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

## What this change fixed

Found by reading the code against the three frameworks, and fixed in the same
change as this pack:

| Gap | Fix | Requirement |
| --- | --- | --- |
| No record of any security decision: sign-ins, refusals, deletions and admin access left no trace | `apps/web/lib/security-log.ts`: one structured line per event, never a token, login, address or prompt text; a test plants each in a request and greps every line | SOC 2 CC7.2, ISO 27001 8.15, ASVS V7 |
| An account could be deleted but not taken away | `GET /api/account` and *Download my data* in the account menu: the whole account as one file, without the session hashes | SOC 2 P5.1, ISO 27001 5.34, ASVS V8.3, GDPR access and portability |
| No `Permissions-Policy` or `Cross-Origin-Opener-Policy` | Both added to every page, with a test | ASVS V14.4, ISO 27001 8.26 |
| The accounts guide said account deletion did not exist, after it shipped | Corrected, and the export and the log documented | SOC 2 CC2.3 |
| The Postgres driver had never run against Postgres. When it did, account deletion failed for anyone with a saved prompt, and share settings were stored as a string | `apps/web/test/store-contract.test.mjs` runs one contract on both drivers, against the runner's PostgreSQL in CI; both bugs fixed without a migration | SOC 2 CC8.1, P4.3; ISO 27001 8.29, 8.10; ASVS V8.3 |

## What remains, in code

Things a pull request can still do, in the order they matter to an audit:

1. **An idle timeout for sessions**, on top of the 30-day absolute one. ASVS
   level 1 accepts 30 days; level 2 asks for less, and a SOC 2 auditor will ask
   what the number is and why.
2. **A shared rate-limit store.** Limits are counted per server instance today
   (TRZ-08), which stops scripts and not a distributed attacker.
3. **The ASVS level 2 rows not yet mapped**, worked through section by section.

## What only the owner can do

None of these is code, and an audit cannot pass without them. Each names the
requirement that asks for it.

| What | Why an auditor asks | Reference |
| --- | --- | --- |
| An information security policy, roles and responsibilities, approved and reviewed yearly | It is where both frameworks start | SOC 2 CC1, CC2, CC5.3; ISO 27001 clauses 5 and 6, A.5.1 to A.5.4 |
| A risk assessment and treatment plan, with a Statement of Applicability | ISO 27001 cannot be certified without one; SOC 2 asks for the risk process | SOC 2 CC3; ISO 27001 6.1, 8.2, 8.3 |
| Multi-factor authentication on GitHub, the hosting platform, npm and the database provider, for every person with access | The repository's controls are only as strong as the accounts that change them | SOC 2 CC6.1; ISO 27001 5.17, 8.5 |
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
