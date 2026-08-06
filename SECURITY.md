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
| A workflow being used to exfiltrate secrets | `permissions: contents: read` by default, `--ignore-scripts` on install, no `pull_request_target` — the last one now asserted | `.github/workflows/`, `security.test.js` |
| A dependency hook running on someone else's runner | The packaged Action installs with `--ignore-scripts` too | `action.yml`, asserted in `security.test.js` |
| A moved action tag changing what runs | Every third-party action is pinned to a commit SHA, with a `# vN` comment Dependabot bumps | `.github/workflows/`, asserted in `security.test.js` |
| A finding that goes green because it is not *new* | CodeQL's pull-request check only reports alerts in changed code, so a job fails the build while `main` carries an open critical or high alert | `.github/workflows/security.yml`, asserted in `security.test.js` |
| Actions template injection | **Nothing** is interpolated into a `run:` body — no input, no `github.*` value, no step output. Values reach the shell through `env:` | `action.yml`, asserted in `security.test.js` |

**Known limit: marker squatting.** The Action finds its own pull-request comment
by an invisible marker in the body. A contributor can post a comment starting
with that marker, and a later run will edit it — under their name. No privilege
is gained and the numbers shown are still Trazum's, so this is documented rather
than closed. A Bot author is preferred when several comments carry the marker,
which makes the planted one lose whenever a genuine Trazum comment exists.

**Known limit: no coverage of the real GitHub API.** The comment poster is tested
in-process against a fake `fetch`, which covers the logic and every refusal path
but never proves a request GitHub would accept. A pull request from a fork could
not exercise the real API anyway — `GITHUB_TOKEN` is read-only there by design.

**An assertion is only worth what it can catch.** The template-injection row
above used to be enforced by a test that recognised `${{ inputs.* }}` inside a
`run:` block, and it turned out to see neither a single-line `run:` nor any value
other than an input — which meant it was blind to `github.event.pull_request.title`,
the one an outside contributor actually controls. It reported green on both. The
scanner now refuses **any** interpolation into a `run:` body regardless of source,
and it ships with positive controls: five mutated copies of `action.yml` that the
test asserts it flags. A security test with no proof it can fail is a test that
passes.

Where a control is a source-text assertion rather than a behavioural one, it says
so in the test. Those catch a regression in this repository; they do not prove a
property of a fork.

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

- **The web app's dependency tree is clean, but note how it got there.** Next
  15 carried three high-severity advisories in `postcss` and `sharp`. The fix
  was `next@16`, a major, and it was deliberately kept out of the security
  release rather than folded in because a scanner went red.

  Two things are worth remembering from that episode:

  npm `overrides` did not work. npm 10 does not apply root overrides to a
  workspace's transitive dependencies, so the major really was the only route.

  More importantly: **bumping the direct dependency was not enough.** Dependabot
  raised `next` to 16 but left the vulnerable `postcss` and `sharp` pinned in
  the lockfile, so the advisories survived the upgrade that was supposed to fix
  them. The blocking audit did not catch it, because that gate is scoped to the
  published packages. If you upgrade a framework to clear an advisory, re-run
  `npm audit` over the whole tree afterwards and confirm the *transitive*
  versions moved — a green direct dependency proves nothing about them.

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
   with passing checks and linear history, and blocks force-pushes and deletion
   of the default branch.

   **It asks for zero approvals, deliberately.** The first version required
   one, and that deadlocked the repository: GitHub does not let you approve
   your own pull request, and with a single maintainer there is nobody else to
   ask. Worth being clear about what was lost — nothing. An outside
   contributor cannot merge regardless, because merging needs write access; the
   approval rule only ever constrained the maintainers, and an approval you
   give yourself is not review. The gate that does real work here is the
   required status checks, which no one can talk their way past.

   Raise it back to `1` the day a second maintainer has write access. Until
   then it would be theatre with a deadlock attached.
2. **Code security → Dependency graph**, then add an Actions **variable**
   `DEPENDENCY_REVIEW = enabled` (Settings → Secrets and variables → Actions →
   Variables).

   The dependency-review job is skipped until both are done, on purpose.
   Without the setting the action errors with "not supported on this
   repository" rather than reporting no findings, and the alternatives were a
   check that is permanently red — which teaches people to ignore red — or one
   that is permanently green while doing nothing. Once the variable is set it
   gates for real, with nothing softening it.
3. **Actions → General → Fork pull request workflows**: set approval to
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
