# Assurance case

[Compliance readiness](README.md) · [Threat model](threat-model.md) · [Security](../../SECURITY.md)

**The claim:** Trazum meets the security requirements it states in
[SECURITY.md](../../SECURITY.md). This page is the argument for that claim and
where the evidence for each step is. It adds no new control. Each step points
at a document that a test holds to the code, so the argument stays as true as
the code. Like the rest of this pack, it is not a certification.

## 1. What is protected, and from whom

The [threat model](threat-model.md) names what is worth protecting (a user's
logs and prompts, a provider key, the accounts of the hosted web app, the
packages people install) and who might act against it. Both are in its first
two sections, "What is worth protecting" and "Who might act against it".

## 2. Where the trust boundaries are

Every place data crosses from one party's control to another's is listed in
[Where the lines run](threat-model.md#where-the-lines-run), each with the
control that answers it: browser to API routes, API routes to the database, to
GitHub, to a model endpoint, a pasted log to anywhere, and the repository to
production and npm.

## 3. The design applies secure design principles

| Principle | How it is applied | Evidence |
| --- | --- | --- |
| Least privilege | Every workflow declares its token permissions, none grants a write at the top level, and a job asks for exactly what it uses | `packages/core/test/security.test.js` ("every workflow declares its token permissions at the top level", "no workflow grants a write permission at the top level") |
| Fail-safe defaults | Outbound endpoints pass an allowlist that fails closed; redirects are refused; the web page connects to its own origin, plus one analytics host only when the operator sets one | `packages/core/src/net.ts`, `apps/web/middleware.ts`, [TRZ-02](controls.md) |
| Complete mediation | Every library, share and admin route resolves the caller from the session and looks records up by owner | [TRZ-06](controls.md) |
| Economy of mechanism | The core has no runtime dependency; three of the four published packages have none outside the project | [docs/architecture.md](../architecture.md) |
| Open design | The source, the threat model and this argument are public | This repository |
| Separation of privilege | Nothing reaches `main` but through a pull request with required checks, under a ruleset with no bypass actor | [TRZ-14](controls.md), [GOVERNANCE.md](../../GOVERNANCE.md) |

The design decisions behind these, and the ones deliberately not taken, are in
SECURITY.md's [Deliberate design decisions](../../SECURITY.md#deliberate-design-decisions).

## 4. Common implementation weaknesses are countered

- **The [secure coding checklist](secure-coding.md)** names, for a web route, a
  page, the packages, a workflow and every pull request, what is checked and the
  test that checks it.
- **[Every OWASP ASVS 4.0.3 level 2 requirement](asvs-l2.md)** is mapped to where
  Trazum stands on it.
- **Static analysis runs on every pull request**: CodeQL with the
  `security-extended` queries, and the ruleset blocks a merge on any alert.
- **Every parser of untrusted text is fed random input** by seeded
  property-based tests (`packages/core/test/property-input.test.js`), beside the
  hostile-input suite and its corpus.

## 5. What is accepted, and the limits

A claim is only as strong as what it leaves out. The risks accepted on purpose
are in the threat model's [Accepted, and why](threat-model.md#accepted-and-why),
and every limit the server sets, with the risk behind it, in
[The limits, and the risk behind each](threat-model.md#the-limits-and-the-risk-behind-each).
The ruleset asks for zero approvals, so no second person's approval is
required yet ([TRZ-14](controls.md), [GOVERNANCE.md](../../GOVERNANCE.md)).
