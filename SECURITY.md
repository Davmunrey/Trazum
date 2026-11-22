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
that accepts arbitrary text and, until recently, **a URL it would then fetch**.
That last part is a server-side request forgery primitive, and it was the single
most dangerous thing in this repository.

It no longer accepts one. A request can select an endpoint from
`TRAZUM_ALLOWED_LLM_ENDPOINTS` — a list the operator writes — and the value that
reaches `fetch` is the entry from that list, not the string that arrived over
HTTP. The list is empty unless you set it, so a deployment that has not thought
about this cannot be pointed anywhere at all. Anyone running Trazum for
themselves still points it wherever they like, through `TRAZUM_LLM_BASE_URL` or
the CLI; what changed is who is allowed to choose. On that operator endpoint the
model is the operator's too: a caller's `llm.model` is used only if it is in
`TRAZUM_ALLOWED_LLM_MODELS`, empty by default. The caller's key is still
required, but a server that checks no key (Ollama) accepts any string, so a
public deployment that sets `TRAZUM_LLM_BASE_URL` to one is open to anyone
within the rate limit, with the operator's model. Do not do that.

### The controls, and what each is actually for

| Risk | Control | Enforced by |
|---|---|---|
| SSRF: a caller aiming this server at a host of their choosing | A request may **select** an endpoint the operator listed in `TRAZUM_ALLOWED_LLM_ENDPOINTS`, never name one. The list is empty by default | `packages/core/src/net.ts`, `security.test.js` |
| SSRF into the internal network or cloud metadata | Scheme, credential and private-host filter on every endpoint, wherever it came from | `packages/core/src/net.ts`, `security.test.js` |
| A validated endpoint redirecting the request somewhere else | `redirect: 'error'` on every server-side call, so a `302` to the metadata service fails instead of being followed | `packages/core/src/net.ts`, `security.test.js` |
| ReDoS from a crafted prompt | Time budget over pathological inputs on every pull request | `security.test.js` |
| A dependency that reads your prompts | All three published packages — core, CLI and the MCP server — carry **zero** runtime dependencies, asserted in CI. The MCP server hand-rolls its JSON-RPC layer for exactly this reason: it reads text a model chose | `security.test.js`, `publish.test.js` |
| `optimize()` quietly phoning home | `fetch` is only permitted in the two modules whose job is to make calls | `security.test.js` |
| A web page on the same machine reading what `trazum serve` or `trazum gateway` answers (DNS rebinding) | Both refuse, with `403`, a request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` on the port they are bound to, and refuse, with `415`, a POST that does not send `content-type: application/json`, which a page cannot send across origins without a preflight nothing answers. A Unix socket has no hostname to rebind and skips the first check | `packages/cli/src/loopback-guard.ts`, `packages/cli/test/loopback-guard.test.js` |
| A stranger using the operator's own model endpoint | On `TRAZUM_LLM_BASE_URL` a caller's `llm.model` is ignored unless the operator listed it in `TRAZUM_ALLOWED_LLM_MODELS`; `TRAZUM_LLM_MODEL` is what runs. A key checks nothing on a keyless server such as Ollama, so an operator who does not want strangers on it does not set the variable on a public deployment | `apps/web/app/api/optimize/route.ts`, `apps/web/test/api.test.mjs` |
| Memory exhaustion | 400 KB prompt cap, 30 requests/minute per IP | `apps/web/lib/body-schemas.ts`, `apps/web/app/api/optimize/route.ts` |
| A body the route did not expect: `null`, a string where a key goes, a field nobody declared | Every body the API accepts has a declarative schema; anything else is a `400` naming the field, before the route reads a byte of it | `apps/web/lib/body-schemas.ts`, `apps/web/test/body-schemas.test.mjs` |
| A vulnerable dependency arriving in a PR | Dependency review blocks moderate and above | `.github/workflows/security.yml` |
| Injected code in a contribution | CodeQL with `security-extended` | `.github/workflows/security.yml` |
| A workflow being used to exfiltrate secrets | `permissions: contents: read` by default, `--ignore-scripts` on install, no `pull_request_target` outside `cla.yml`, which checks nothing out. Every workflow declares a top-level `permissions:` block, none grants a write there (a write is on the job that needs it), and a workflow that pushes with its own secret (`mirror-to-n0.yml`) does not keep the checkout token | `.github/workflows/`, `security.test.js` |
| A dependency hook running on someone else's runner | The packaged Action installs with `--ignore-scripts` too | `action.yml`, asserted in `security.test.js` |
| A moved action tag changing what runs | Every third-party action is pinned to a commit SHA, with a `# vN` comment Dependabot bumps | `.github/workflows/`, asserted in `security.test.js` |
| A finding that goes green because it is not *new* | CodeQL's pull-request check only reports alerts in changed code, so a job fails the build while `main` carries an open critical or high alert | `.github/workflows/security.yml`, asserted in `security.test.js` |
| The wiki workflow's write permission reaching a pull request's code, or another job | `contents: write` is on the `publish` job only, which runs on a push to `main` and nothing else; the token never appears in a URL, a command line or a `run:` expression; the script it runs makes no network call | `.github/workflows/wiki.yml`, `scripts/publish-wiki.mjs`, `wiki-publish.test.js` |
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

**A prompt never reaches a server that keeps it.** Optimisation is synchronous;
the web app's history lives in the browser's `localStorage`. Nothing about a
prompt is written on any machine but the one it was already on.

This paragraph used to say "prompts are never stored", flatly, and that stopped
being true when `--suggest --cache` shipped. **The CLI can write prompt text to
disk, on your own machine, and only if you ask it to.** The cache lives under
your home directory, holds the model's raw response keyed by the prompt, and
exists so a re-run over forty files does not ask thirty-eight questions it
already has answers to. It is opt-in for a reason unrelated to secrecy — a model
is not a pure function and a silent week-old answer would be a surprise — but the
storage is the part that belongs in this document.

The files are `0600` in a `0700` directory. A prompt is the most sensitive thing
this tool touches; a world-readable cache in a shared home directory would
publish somebody's unreleased product behaviour to every account on the machine.
Delete it whenever you like — it is a cache, and a miss costs a call.

**LLM keys are used once and dropped.** A key supplied through the UI is used
for that single request and never logged or persisted. If you would rather not
send one at all, configure `TRAZUM_LLM_*` on the server and leave the field
empty.

**Analytics is off unless you switch it on**, and never receives prompt content
— only aggregate numbers (reduction percentage, level, model, locale).
Vercel Speed Insights is a second switch, also off by default
(`NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=1` at build time). It sends page
performance measurements, not those numbers, and the script that sends them is
served by Vercel and was not read. Every URL the app lets it send has its share
token replaced and its query dropped first, and the Content-Security-Policy is
the same with it on and off.

**`pull_request`, never `pull_request_target`.** The latter runs with a
writable token and repository secrets *against the contributor's code*, which
is how public repositories get their secrets stolen. Nothing here uses it, and
nothing should.

**The `Wiki` workflow can push, and what limits it.** GitHub's wiki is a second
git repository, pushed with the repository's own token, and that needs
`contents: write`: there is no narrower permission for it. So
`.github/workflows/wiki.yml` gives that one permission to one job, `publish`,
and to nothing else. The workflow's default is `contents: read` and its weekly
`compare` job only reads. What limits the job:

- It runs on a push to `main` only, which is after review, and never from a
  pull request: the workflow has no pull request trigger of either kind, and a
  manual run from any branch only compares.
- It runs the scripts as they are on `main`. `scripts/publish-wiki.mjs`
  refuses to publish unless `wiki/` is what `scripts/build-wiki.mjs --check`
  accepts, so a page edited by hand in the repository is not published.
- The script makes no network call, reads no environment variable and holds no
  credential. Only the workflow's git steps touch the network, and only the
  wiki's repository.
- The checkout keeps no credential in the working tree. The token reaches git
  as an Authorization header in the environment of the one step that clones and
  the one that pushes, so it is in no URL, in no `.git/config` and in no
  command's arguments, and its encoded form is masked in the log.
- It deletes nothing. A page that exists only on the wiki is reported and left
  alone.

`wiki-publish.test.js` holds each of these. **Not shown:** the session that
wrote the workflow could not reach the wiki's repository, so the push itself
has never run, and the first run of the `publish` job on `main` is the first
real one.

### Known limits, stated rather than implied

- **The SSRF filter matches hostnames, not resolved addresses.** It blocks the
  literal forms an attacker types, but a hostname that resolves to a private
  address (DNS rebinding) is not caught. Resolving would add a TOCTOU window
  and a network call to a validation path, so the honest mitigation is at the
  egress layer: if you deploy this somewhere with an internal network worth
  reaching, put it behind an egress allowlist and do not rely on this filter
  alone.

  This limit is the reason the endpoint allowlist exists. A filter that reads a
  name cannot be made sufficient against an attacker who owns the name, so on
  the one path where the attacker supplies the string — an HTTP request body —
  the string is no longer what gets fetched. For `TRAZUM_LLM_BASE_URL` and the
  CLI the filter is still all there is, and there it is enough: the person who
  typed the URL is the person being protected.
- **Rate limiting is per address, and per instance where it guards the
  instance.** The anonymous tool routes count in each instance's memory, so on
  serverless the real limit is looser than 30/minute; what they protect is that
  instance's CPU. The sign-in, session and library limits are shared across
  instances when the deployment has accounts and a database, keyed by an HMAC
  of the address rather than the address (`apps/web/lib/shared-limit.ts`).
  Neither stops an attacker with many addresses. It is a barrier against
  scripts and accidental abuse, not a quota.

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

## Compliance readiness

Trazum is not certified against SOC 2, ISO 27001 or any other standard.
[docs/compliance/](docs/compliance/README.md) is the preparation for an audit:
the system in scope, 23 controls with their evidence and their SOC 2, ISO
27001 and OWASP ASVS references, and the organisational work that only an
owner can do. Beside it are the [threat model](docs/compliance/threat-model.md),
the [secure coding checklist](docs/compliance/secure-coding.md) and the
[procedure for rotating each secret](docs/compliance/secret-rotation.md).

## Independent audits

- **November 2026, with [REA](https://github.com/morluto/rea) 6.8.0:** the four
  npm packages at 2.7.7, as npm serves them, and the production web page,
  checked from the outside by a tool that has never seen this source. Nothing
  was found that sends a log, a prompt or a session key anywhere without being
  asked; one defect on the web page was fixed. The method, every network and
  process surface with its guard, what the audit does not establish, and how to
  reproduce it are in [docs/audit-rea-2026-11.md](docs/audit-rea-2026-11.md).
- **On every pull request since then:** the web half of that audit runs in CI
  as `scripts/privacy-probe.mjs`, against the build the pull request would
  deploy. A marker leaving the page, a request to another origin, a request
  while the bill is read, or a failed request fails the build.

## Repository hardening

Some of this cannot be committed to a file — it lives in repository settings.

### Committed here

- `.github/CODEOWNERS` — review required on every path, with the
  security-critical files called out.
- `.github/workflows/` — least-privilege permissions, `--ignore-scripts`
  installs, CodeQL, dependency review, scheduled audit.
- `.github/workflows/wiki.yml` and `scripts/publish-wiki.mjs`: the wiki is
  published from `wiki/` on every merge to `main`, and compared with it every
  Monday. It is the one workflow here whose job writes to something other than
  a release, and the paragraph on it above says why that is limited.
- `.github/workflows/scorecard.yml`: [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Davmunrey/Trazum)
  on every merge to `main` and weekly, its result published to the README's
  badge and the Security tab. It reads how the repository is kept, from
  outside: pinned actions, token permissions, branch protection, review,
  releases and the rest of the checks Scorecard documents. It does not read
  the code for flaws, does not check the packages npm serves against this
  source, and does not say a price is right; a high score is not an audit or a
  certification. It is not a check a merge waits for.
- [OpenSSF Best Practices](https://www.bestpractices.dev/projects/16992), the
  README's two badges after Scorecard's. The project meets every criterion of
  the Passing level (how it is built, tested, released and reported to, and
  how it uses cryptography) and every Level 1 control of the Open Source
  Project Security Baseline (branch protection, how CI treats untrusted input,
  HTTPS delivery, secrets kept out of the repository, the licence, a security
  contact). The project answers both itself, with a link for each answer;
  bestpractices.dev does not verify them. Like Scorecard, they read how the
  project is kept, not the code.
- `.github/dependabot.yml` — weekly updates, routine patches grouped so real
  security bumps stay visible.
- `.github/rulesets/main-branch.json` — the branch ruleset, and
  `scripts/ruleset.mjs`, which compares it with the one GitHub enforces and
  puts it there.
- `scripts/sbom.mjs` — the CycloneDX bill of materials attached to every
  GitHub release: each workspace and every package any of them needs at run
  time, from the lockfile, checked before anything is uploaded and made on
  every pull request by `test/sbom.test.mjs`.

### Needs an admin to switch on

1. **Put the ruleset on GitHub.** `npm run ruleset -- apply --yes`, run by an
   admin signed in to `gh` with their own token. It writes
   `.github/rulesets/main-branch.json` over the ruleset of the same name, or
   creates it, sets the merge settings below, then reads both back and says
   whether GitHub now enforces the file. Without `--yes` it prints what would
   change and changes nothing. The ruleset requires a pull request with
   passing checks, squash merges and linear history, and CodeQL results with
   no open alert. Three of the required checks are about the pull request
   and not its code: `PR readiness` (it names an issue a maintainer accepted,
   and has a changelog line), `Signed-off-by on every commit` and `cla`. It blocks force-pushes and
   deletion of the default branch.

   **GitHub enforces a copy, and the copy is checked.** `npm run ruleset`
   compares it with the file, rule by rule, and the `Repository settings`
   workflow runs that every Monday and fails when the two differ. It exists
   because they did: on 2026-11-18 the copy lacked `PR readiness`, which the
   file had required for weeks, and allowed merge commits, and every pull
   request that had changed the file was green. Apply again whenever the file
   changes. The workflow reads and never writes, and no token that could
   rewrite branch protection is stored anywhere: a workflow that can loosen
   the rules it is judged by is a worse problem than drift.

   The file is held exactly for what it states. A parameter GitHub reports
   and the file is silent about is printed and left alone, on reading and on
   writing. A whole rule GitHub enforces and the file does not state is a
   difference, and applying removes it.

   The merge settings the ruleset leans on, set by the same command:
   `allow_squash_merge` on, `allow_merge_commit` and `allow_rebase_merge` off
   (the ruleset refuses both, so the buttons only offer an error),
   `allow_update_branch` on (a branch must be current with `main` to merge),
   and `web_commit_signoff_required` on (the sign-off check reads every
   commit, the ones made in the browser too). `has_discussions` is checked
   and written with them, though it is not a merge setting: it is on because
   README.md, SUPPORT.md and the issue forms send questions to Discussions,
   and switched off they point nowhere.

   **What the weekly run cannot see.** GitHub leaves some of this out of its
   answer to a token that does not administer the repository. Measured on
   2026-11-18 on a runner, the workflow's token is shown every rule, the
   required checks and `web_commit_signoff_required`, and is not shown who may
   bypass the ruleset (`bypass_actors`) nor the four `allow_*` settings. Whether
   it is shown `has_discussions` was not measured. The
   run prints those five as "not read" and does not fail on them: not read is
   not fine, and it is not drift either. An admin's `npm run ruleset` reads
   all of it, so run it after anybody has been on the settings page.

   **It asks for one approval, from the other maintainer.** The first version
   required one, and that deadlocked the repository: GitHub does not let you
   approve your own pull request, and with a single maintainer there was nobody
   else to ask, so it asked for zero. It went back to one when a second
   maintainer had write access (#920, [GOVERNANCE.md](GOVERNANCE.md)). Now
   every change, Dependabot's included, waits for the maintainer who did not
   open it, beside the required status checks, which no one can talk their way
   past. The approval must be of the last push and come from somebody other
   than whoever made it (`require_last_push_approval`), so a maintainer cannot
   push to the other's pull request and approve their own commit; a later push
   dismisses it.
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
4. **Actions → General → Workflow permissions**: *Read repository contents
   permission* by default.
5. **Code security → Secret scanning**, including **push protection**. This is
   what stops a key from reaching the history in the first place.
6. **Code security → Private vulnerability reporting**, so the link at the top
   of this file works.
7. **Put the environments on GitHub.** `npm run environments -- apply --yes`,
   run by an admin signed in to `gh` with their own token, makes `staging`,
   `production` and `release` what `.github/environments.json` states: a
   required reviewer on each, main alone into `staging` and `production`. It
   never writes a secret. The secrets each environment needs are named in the
   file, and the run says which are missing; their values are added on the
   settings page by the owner. The weekly `Repository settings` run compares
   and never writes, as it does for the ruleset.

None of these can be committed, which is why they are a checklist and not a
file.

### Done, and kept done by a test

**Every third-party action is pinned to a commit SHA**, with a `# vN` comment
Dependabot bumps — `github-actions` is in its config, so the pins stay current
without going stale into a fork of an abandoned action.

This used to be an item on the list above, to run `npx pin-github-action` once
there was network access. It is not a checklist item any more because a
one-time fix to a thing that regresses is not a fix: `security.test.js` walks
every workflow and fails on a `uses:` that names a tag or a branch. A tag can be
moved by whoever owns it and a branch moves by design, so either one is a
third party who can change what runs against this repository's token, at a
moment of their choosing.
