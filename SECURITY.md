# Security

## Reporting a vulnerability

Report privately through **GitHub Security Advisories**:
[Report a vulnerability](https://github.com/Davmunrey/Trazum/security/advisories/new).

Please do not open a public issue for something exploitable. There is no bounty
programme; there is an acknowledgement in the release notes unless you would
rather not be named.

Useful in a report: what an attacker gains, the smallest input that shows it,
and which component — the library, the CLI, or a deployed web instance. A
proof-of-concept prompt is worth more than a description.

Expect a first response within a week.

---

## What Trazum is exposed to

Being honest about the shape of the risk is what makes the controls below make
sense.

**The library and the CLI** run on text you already have, on your own machine.
The interesting failure is not data theft — it is a malicious *prompt* causing
a denial of service in the regex engine, or a future contribution quietly
adding a dependency that reads the prompts it is handed.

**A deployed web instance** is a different matter. It is a public HTTP endpoint
that accepts arbitrary text and, optionally, **a URL it will then fetch**. That
last part is a server-side request forgery primitive, and it is the single most
dangerous thing in this repository.

### The controls, and what each is actually for

| Risk | Control | Enforced by |
|---|---|---|
| SSRF into the internal network or cloud metadata | Scheme, credential and private-host filter on any caller-supplied endpoint | `packages/core/src/net.ts`, 20 tests in `security.test.js` |
| ReDoS from a crafted prompt | Time budget over pathological inputs on every pull request | `security.test.js` |
| A dependency that reads your prompts | The core and the CLI carry **zero** runtime dependencies, asserted in CI | `security.test.js` |
| `optimize()` quietly phoning home | `fetch` is only permitted in the two modules whose job is to make calls | `security.test.js` |
| Memory exhaustion | 400 KB prompt cap, 30 requests/minute per IP | `apps/web/app/api/optimize/route.ts` |
| A vulnerable dependency arriving in a PR | Dependency review blocks moderate and above | `.github/workflows/security.yml` |
| Injected code in a contribution | CodeQL with `security-extended` | `.github/workflows/security.yml` |
| A workflow being used to exfiltrate secrets | `permissions: contents: read` by default, `--ignore-scripts` on install, no `pull_request_target` | `.github/workflows/` |

### Deliberate design decisions

**Prompts are never stored.** Optimisation is synchronous; the web app's
history lives in the browser's `localStorage` and never reaches a server.

**LLM keys are used once and dropped.** A key supplied through the UI is used
for that single request and never logged or persisted. If you would rather not
send one at all, configure `TRAZUM_LLM_*` on the server and leave the field
empty.

**Analytics is off unless you switch it on**, and never receives prompt content
— only aggregate numbers (reduction percentage, level, model, locale).

**`pull_request`, never `pull_request_target`.** The latter runs with a
writable token and repository secrets *against the contributor's code*, which
is how public repositories get their secrets stolen. Nothing here uses it, and
nothing should.

### Known limits, stated rather than implied

- **The SSRF filter matches hostnames, not resolved addresses.** It blocks the
  literal forms an attacker types, but a hostname that resolves to a private
  address (DNS rebinding) is not caught. Resolving would add a TOCTOU window
  and a network call to a validation path, so the honest mitigation is at the
  egress layer: if you deploy this somewhere with an internal network worth
  reaching, put it behind an egress allowlist and do not rely on this filter
  alone.
- **Rate limiting is per instance, in memory.** On serverless each instance
  keeps its own counter, so the real limit is looser than 30/minute. It is a
  barrier against accidental abuse, not a quota.
- **GitHub Actions are pinned to tags, not commit SHAs.** A tag can be moved,
  so a compromised action publisher could change what runs. Pinning is the
  stronger position; see the checklist below.

- **Three open high-severity advisories in the web app's dependency tree**, in
  `postcss` and `sharp`, both transitive through Next.js 15. They do not block
  CI, and here is the reasoning rather than a shrug:

  | | |
  |---|---|
  | What people install | `@trazum/core` and `@trazum/cli`, which have **zero** dependencies and are audited at `--audit-level=low`. Neither is affected. |
  | `postcss` | Runs at **build time** over CSS written in this repository. The advisories need attacker-controlled CSS input; supplying that requires write access, at which point postcss is not the problem. |
  | `sharp` | Next's image optimiser. This app has no `next/image` usage and accepts no uploads, so it is never invoked. |
  | The fix | `next@16`, a major upgrade. |

  A major framework upgrade belongs in its own pull request with its own
  testing, not folded into an unrelated change because a scanner went red. It
  is tracked on the roadmap. `npm audit` still runs on every pull request and
  prints the full report — the advisories are visible, just not gating.

  We tried forcing patched versions with npm `overrides` first; npm 10 does not
  apply root overrides to a workspace's transitive dependencies, and leaving
  config that silently does nothing is worse than not having it.

---

## Repository hardening

Some of this cannot be committed to a file — it lives in repository settings.

### Committed here

- `.github/CODEOWNERS` — review required on every path, with the
  security-critical files called out.
- `.github/workflows/` — least-privilege permissions, `--ignore-scripts`
  installs, CodeQL, dependency review, scheduled audit.
- `.github/dependabot.yml` — weekly updates, routine patches grouped so real
  security bumps stay visible.
- `.github/rulesets/main-branch.json` — an importable branch ruleset.

### Needs an admin to switch on

1. **Import the ruleset.** Settings → Rules → Rulesets → New ruleset → Import,
   and select `.github/rulesets/main-branch.json`. It requires a pull request
   with one code-owner approval, passing checks, linear history, and blocks
   force-pushes and deletion of the default branch.
2. **Actions → General → Fork pull request workflows**: set approval to
   *Require approval for all external contributors*. Without it, a first-time
   contributor's workflow changes run automatically.
3. **Actions → General → Workflow permissions**: *Read repository contents
   permission* by default.
4. **Code security → Secret scanning**, including **push protection**. This is
   what stops a key from reaching the history in the first place.
5. **Code security → Private vulnerability reporting**, so the link at the top
   of this file works.
6. **Pin the actions to commit SHAs.** Once you have network access to the
   GitHub API:
   ```bash
   npx pin-github-action .github/workflows/*.yml
   ```
   Dependabot will keep the pins updated, since `github-actions` is already in
   its config.

Items 1–5 are settings toggles; none of them can be committed, which is why
they are a checklist and not a file.
