# Contributing

Two things before the detail. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies
to everyone taking part here, maintainer included, and it is explicit about what
a single-maintainer project can and cannot promise about enforcement.
[docs/README.md](docs/README.md) is the documentation index — if you are looking
for how something works rather than how to change it, start there.

## The repository is English

Source, comments, identifiers, tests, documentation, commit messages, issues
and pull requests: all English. This is not a style preference — it is what
makes the internationalisation work, because English is the source of truth
every other locale is translated from.

Two deliberate exceptions:

- **`packages/core/src/phrases.ts`** contains the phrase dictionaries in the
  seven covered languages — English, Spanish, French, German, Portuguese,
  Italian and Dutch — including `OUTPUT_CUES_BY_LANGUAGE`, the phrases that mark
  a fenced block as an output contract. Those are *data* — the vocabulary Trazum looks for inside the
  prompts it optimises — not interface. Adding a language there is unrelated to
  the language of the report.
- **`packages/*/src/i18n/es.ts`, `apps/web/lib/i18n/es.ts`** and the Spanish
  sample prompt are Spanish by definition.

## Signing off

Every commit in a pull request must carry a `Signed-off-by:` line. The `DCO`
check reads the range your branch adds and fails on any commit that does not,
naming the SHA. It is a required check: a pull request with an unsigned commit
cannot be merged.

```bash
git commit -s                     # for work you have not committed yet
git rebase --signoff <base>       # for commits that already exist
```

Your git identity supplies the name and email, so `git config user.name` and
`git config user.email` have to be set. Merge commits are skipped: GitHub
writes those itself when you update a branch from the web, and failing you for
a commit you never opened an editor for would teach nothing except how to
route around this.

**What you are signing is a certification of origin, not a copyright
assignment.** The text is the [Developer Certificate of Origin
1.1](https://developercertificate.org/): you are stating that you wrote the
patch, or that you have the right to submit it under this project's licence.
You keep your copyright. Nothing about the line transfers anything.

The reason a project this small bothers: a repository that cannot account for
the provenance of its own history cannot answer a corporate legal review, and
cannot change its own licence. Right now there is one copyright holder and the
answer to both questions is trivial. The first merged commit whose origin
nobody recorded is the one that makes it permanent, and no amount of care
afterwards recovers it. This is cheap now and impossible later, which is the
whole argument.

## The CLA

Your first pull request will be greeted by the CLA workflow: it asks you to
post one sentence, records the signature in the repository, and turns its
check green — once, covering everything you contribute afterwards. That check
is required too, so a pull request cannot be merged before its author has
signed. What you
sign is [docs/cla/CLA.md](docs/cla/CLA.md), and its preamble says plainly
what it is for: Trazum stays MIT, you keep your copyright, and the
maintainer gets a licence broad enough that no future relicensing of new
modules needs a per-contributor hunt. If you cannot sign, say so in the pull
request — the code can still be discussed; it just cannot be merged.

## Setup

```bash
npm install
npm run verify     # everything CI runs, in the order CI runs it
```

Node 22. No global installs needed.

`verify` is the one command worth remembering — it is the linter, build, tests,
typecheck across all six workspaces, and the web build. **Run it before pushing, and
read its exit code rather than its output.** The web build in particular fails on
things nothing else notices: `@trazum/core` is bundled for the browser, so one
`node:fs` import anywhere in its import graph breaks it, and neither the tests
nor `tsc` will tell you.

The pieces individually, if you want a faster loop:

```bash
npm run lint       # the whole repository, in under a second; needs no build
npm run build      # core, the CLI, the MCP server, the OpenAI tokenizer and the editor extension
npm test           # core, the CLI, MCP, the tokenizer, the editor extension, the web app, the Action, agent workflows and the release's bill of materials
npm run typecheck  # all six workspaces
npm run build:web  # the Next.js app
npm run test:action  # the packaged Action on its own, without the rest
npm run test:agents  # real CLI/MCP workflows on synthetic logs; run build first
npm run test:release # the bill of materials each release attaches, checked against npm's own view of the tree
```

### The linter

`npm run lint` runs Biome over every tracked file and passes only when it has
nothing to say: no warnings left standing, so a new one is seen. It lints and
does not format. `biome.jsonc` is the whole configuration, and every rule it
switches off has its reason on the lines above it.

When it reports something in a place that means it, say so next to the line
and nowhere else:

```ts
// biome-ignore lint/a11y/noStaticElementInteractions: a drop target, and dropping is a pointer gesture
```

The reason is for the next reader and `lint.test.js` requires one. Do not
switch a rule off in `biome.jsonc` for one place: that file is for what this
code does on purpose everywhere.

The ones that write files rather than check them:

```bash
npm run draw:architecture  # redraws docs/assets/boundary.svg from the code
npm run draw:bill          # redraws docs/assets/bill.svg from what `trazum bill` prints
npm run draw:demo          # redraws docs/assets/demo.svg from what `trazum optimize` prints
npm run draw:icon          # rewrites the extension's icon and the web app's favicon, touch icon and manifest icons
npm run measure:tokens     # re-measures the estimator against a real counter
```

Every picture and icon in this repository comes out of one of those, in the
colours and the mark `scripts/brand.mjs` names, which `brand.test.js` holds to
the web app's `globals.css` and `icon.svg`. Build first (`npm run build`): the
two transcripts are drawn from the built CLI. **A price change, or a reworded
line in either report, fails `bill-image.test.js` or `demo-image.test.js` until
the picture is redrawn**, and the README restates figures from both, so the same
tests then fail until its prose agrees.

And one that produces something to hand to a marketplace:

```bash
npm run package:vscode     # builds the editor extension and writes a .vsix
```

`vsce` is fetched by `npx` for that one run rather than installed. It exists to
produce a zip on demand, and a repository does not need a tool in its tree to
find out whether its own manifest is valid — `apps/vscode/test/packaging.test.js`
checks the rules the packager enforces, so the manifest cannot drift between
releases without a test saying so.

**Run `draw:architecture` after adding or removing a published package.** The
picture on the front page is generated from the workspace globs and from the
allowlist of modules permitted to reach a network, and
`architecture-image.test.js` fails the build while it disagrees with them —
which is the point, but it is a confusing failure if you do not know the
command exists.

## Adding a rule

Full walkthrough: **[docs/authoring-rules.md](docs/authoring-rules.md)**. It is
written so you do not have to read the engine.

The short version:

1. Add its id to the `RuleId` union in `packages/core/src/i18n/types.ts`.
2. Implement it in `packages/core/src/rules.ts`. A rule takes masked text and
   returns `{ text, hits }`. It never sees protected content, so it cannot
   break code, URLs, email addresses or placeholders.
3. Add its copy to **every** catalogue in `packages/core/src/i18n/`. The build
   fails until you do — that is the point of the typed union.
4. Add three tests: it fires; it leaves a lookalike alone; `hits` is right.

Two things the guide argues at length and are worth knowing up front:

- Put a rule at `aggressive` if removing its target could change what the prompt
  asks for. When unsure, `aggressive` is the right answer: **`safe` is a
  promise**, and it is the level people run unattended in CI.
- **No two adjacent unbounded quantifiers.** Trazum is a regex engine pointed at
  someone else's text and reachable over HTTP, so catastrophic backtracking is a
  denial-of-service bug. Two shipped in 0.1.0, one in a `safe` rule.

## Adding a locale

1. Add the tag to `LOCALES` in `packages/core/src/i18n/types.ts`.
2. Create `packages/core/src/i18n/<tag>.ts`, `packages/cli/src/i18n/<tag>.ts`
   and `apps/web/lib/i18n/<tag>.ts`. TypeScript will list what is missing.
3. `npm test` — the catalogue-parity tests check every rule, advisory and
   rejection reason renders non-empty in every locale.

Nothing else needs touching: the CLI flag, the web switcher and the
`Accept-Language` negotiation all read `LOCALES`.

Please only add a language you actually read. An out-of-date translation is
worse than an honest fallback to English, and the parity tests can prove a
string exists but not that it is right.

## Changing prices

`packages/core/src/pricing.ts` is the bundled catalogue. Update
`PRICING_LAST_REVIEWED` in the same commit, and cite where the numbers came from
in the commit message. Pricing changes ship as patch releases — see
[VERSIONING.md](VERSIONING.md).

**Nobody has to wait for that release.** A user can correct a price from their own
repository with a pricing overlay, which is why the bundled numbers are not part
of the frozen API and the overlay schema is. If you are fixing a price because
somebody reported a wrong figure, tell them about `--pricing` as well — it
unblocks them today.

## Tests

`node --test` against the built output, no framework. Tests assert on
**identifiers and numbers**, not on message text — copy changes without a
version bump, and a test that breaks when someone improves a sentence is a test
that will get deleted.

The one exception is asserting that a locale produces *different* text from
another, which is testing the mechanism rather than the wording.

**A spawn of anything this repository built takes `SPAWN_ENV`.** It lives in
`packages/cli/test/env.mjs` and is imported, never copied — it blanks every
variable the locale detector reads, so the run answers in the project's language
rather than the language of whoever started it. Without it a test asserting on
English output passes on a runner with `LANG` unset and fails on a laptop that
has a locale set, which has now happened twice. `i18n.test.js` holds the rule
across every tracked suite in the repository, and it will name your file.

Blanked, not pinned: setting `TRAZUM_LOCALE: 'en'` outranks `trazum.config.json`,
so a test that gets its language from the config would silently assert against
the wrong catalogue. A test that wants a language asks for it, by flag or config.

Colour works the other way round. `FORCE_COLOR` is **removed** from the
environment rather than blanked, because an empty value still turns Node's own
colour on and still makes it print a warning about `NO_COLOR` into the output
these tests parse. Both lists are read out of the modules that consume them, so
a variable added to `i18n/index.ts` or `style.ts` is neutralised in the same
commit or in neither.

Two more things a test must not read: the length of `os.tmpdir()`, which decides
where wrapped prose breaks across lines — collapse the whitespace before matching
a sentence — and the layout of `PATH`, which differs between a Homebrew machine
and a CI runner.

### Properties, beside the examples

Four suites in `packages/core/test/properties-*.test.js` draw their inputs from
a seeded generator rather than from a fixture, and assert the claims that are
statements about *every* input: a locale never changes the optimisation, a
credential never crosses a converter, a bill never shrinks when a record is
added, a refusal never arrives without saying what is missing.

```bash
npm test -w @trazum/core                                  # the default seed, 250 cases each
TRAZUM_QA_CASES=5000 npm test -w @trazum/core             # a soak
TRAZUM_QA_SEED=77 TRAZUM_QA_CASES=2000 npm test -w @trazum/core
```

Every failure prints the command that reproduces it, so a red CI log carries
its own incantation. **The default seed does not move**: CI has to be
deterministic, and raising `TRAZUM_QA_CASES` locally is how you go looking.

Two rules if you add one. It must **count what it inspected** and fail when
that count is zero — a property whose every drawn case hit a `continue` passes
in silence and guards nothing. And when it fails, read the property before you
touch the code: three of the first thirty were wrong before the code was, and
each records why in its own file.

The generators live in `test/support/random.mjs` and are written rather than
installed, which is a deliberate trade explained at the top of that file. Write
awkward characters as `\uXXXX` escapes rather than typing them in — two modules
in a sibling repository once held raw NULs and git called them binary.

### Mutation testing, beside both

Examples and properties say what the code should do. Mutation testing says
whether they would notice if it stopped: `scripts/mutate.mjs` changes the built
code of the files where a wrong line costs most, one small thing at a time, and
reports every change no test caught. [docs/mutation-testing.md](docs/mutation-testing.md)
has what it changes, what it does not, the current score and how to read a
survivor.

```bash
npm run mutate -- --acorn "$ACORN" --since origin/main --check   # the lines you changed
TRAZUM_ACORN="$ACORN" npm run test:mutation                      # the tool, against the real parser
```

`$ACORN` is a parser installed outside the workspace; that page has the two
lines that install it.

If your pull request changes one of those files, the `Mutation testing` check
asks about the lines you changed, and fails on a mutant that lives there and is
not on record in `mutation.baseline.json`. The answer is nearly always a test.
Planting a fault by hand and naming the test that caught it is still asked of
every new guard: the tool covers five files, and a guard can be anywhere.

### Coverage, before any of them

Which lines the tests run at all. `npm run coverage` measures it with Node's
own runner, mapped back to the TypeScript, and the `Coverage` workflow sends
it to Codecov on every pull request. It is not a required check and has no
target: it shows the code no test reaches, and on a pull request whether the
lines being added are run by anything. [docs/coverage.md](docs/coverage.md)
has the figures as measured, what a covered line does not mean, and why two
trees are left out.

```bash
npm run build
npm run coverage
```

### End to end, in a browser

The web app's own tests read modules and rendered components. `scripts/e2e.mjs`
opens the built page in a real browser and does what a visitor does: pastes a
log and reads the bill to the cent, optimises and compares a prompt, loads a
recorded run, changes the theme and the language, and reaches the tabs on a
phone. [docs/end-to-end-tests.md](docs/end-to-end-tests.md) has the thirteen
flows, what they do not check, and the lines that install the browser driver
outside the workspace.

```bash
npm run e2e -- --url http://127.0.0.1:3124 --chrome "$CHROME" --playwright "$PW"
npm run e2e -- --list
```

They run in CI as a step of the required check. Two rules if you touch the web
app. **A new tab arrives with a flow**: `e2e.test.mjs` fails on a tab a visitor
can open that has no flow named for it. And **an expected figure is worked out by hand**,
in a comment beside it, never copied from what the page printed: a test that
asks the product for the answer agrees with any answer.

**A comment that names a guard must name one that exists.** These
cross-references carry weight — *"`security.test.js` permits `fetch` only in the
two modules that exist to make calls"* is how a reader learns a rule is held
rather than intended — so a name that is not a file reports a check where there
is none and stops the reader looking. `named-guards.test.js` scans every source
file and document in the repository and fails on one. Four were wrong when it
was written: two guards promised in a shipped release and never written, one
rename that took the file and left the sentence, and one name that had never
existed under any spelling.

## Security invariants

These are enforced by tests in `packages/core/test/security.test.js`. If your
change trips one, that is the test working — read the failure before adjusting it.

1. **Every published package has no runtime dependencies** — the core, the CLI
   and the MCP server. They process untrusted text; every dependency is
   unreviewed code running on someone's prompts. If you genuinely need one,
   argue for it in the pull request and change the test deliberately. The list
   is derived from the root `workspaces` globs rather than typed, because it was
   typed once and did not mention `packages/mcp` for the whole day that package
   existed. `apps/web` is exempt only because it is `private: true` and is
   deployed rather than published.
2. **`optimize()` never touches the network.** `fetch` is permitted only in
   `llm.ts` and `tokenizer.ts`, the two modules that exist to make calls.
3. **`@trazum/core` imports no Node builtins.** Enforced by walking the import
   graph from the entry point, not by an allow-list of files — a file allow-list
   passed while the same file was re-exported from `index.ts` and the web build
   broke. Filesystem code belongs on `@trazum/core/node`.
4. **No catastrophic backtracking.** A rule is a regex pointed at
   attacker-controlled text on a public endpoint. Avoid nested unbounded
   quantifiers (`(\w+)+`, `(a|a)*`); bound your repetitions. The ReDoS suite runs
   pathological inputs against a time budget — and see
   [docs/authoring-rules.md](docs/authoring-rules.md) for the fixture *shape*
   that actually finds these, because repeated tokens do not.
5. **The SSRF filter only loosens with an explicit flag.** `validateLlmEndpoint`
   fails closed. Never derive `allowInsecure` from anything in a request.
6. **Nothing is interpolated into a `run:` body in `action.yml`** — no input, no
   `github.*` value, no step output. Values reach the shell through `env:`. The
   scanner ships with five positive controls, because the version before it
   reported green on two of the three shapes that matter.
7. **Every third-party action is pinned to a commit SHA** with a `# vN` comment
   Dependabot bumps. A tag can be moved and a branch moves by design.
8. **No workflow uses `pull_request_target`.** It runs with a writable token and
   repository secrets against the contributor's code, and it is the natural wrong
   turn the moment somebody finds a fork PR cannot comment.

One more that is a convention rather than a test: **never log a prompt or an API
key.** Prompts are not stored anywhere, and keys are used once and dropped.

See [SECURITY.md](SECURITY.md) for the reasoning, and for how to report a
vulnerability privately. The [secure coding checklist](docs/compliance/secure-coding.md)
gathers these with the web app's rules in one table, each naming the test that
holds it.

## Issues

Open one with the form that fits. Each form asks for the facts that case needs,
and each starts the issue with its labels:

| You found | Form | Starts with |
| --- | --- | --- |
| Something Trazum did wrong | Bug report | `bug`, `needs-triage` |
| A rule that moved what a prompt asks for | A rule changed what my prompt asks for | `bug`, `correctness`, `needs-triage` |
| A wrong or dated price, or a model read as unpriced | A price is wrong, or a model is missing | `pricing`, `needs-triage` |
| Something Trazum should do and does not | Feature request | `enhancement`, `needs-triage` |
| A page that is wrong, missing or cannot be followed | Documentation is wrong or missing | `documentation`, `needs-triage` |

A security problem is never an issue: report it privately, as
[SECURITY.md](SECURITY.md) says. A question goes to
[Discussions](https://github.com/Davmunrey/Trazum/discussions), where the
Q&A, Ideas and Show and tell categories each have a form in
`.github/DISCUSSION_TEMPLATE/`. Blank issues stay on for the report no form
anticipated.

**An issue gets `needs-triage` whatever opened it.** The forms apply it, and
the `Triage` workflow applies it to an issue that came in without a form: a
blank one, or one opened through the API. That second half was missing until
2026-11-17, when eleven issues were open and none carried a label; none of
them had come through a form.

### Triage

Every new issue carries `needs-triage`, meaning nobody has decided anything
about it yet. Triage replaces it with one state:

| State | Means | Then |
| --- | --- | --- |
| `accepted` | It will be done | Anyone may pick it up. `good first issue` marks the small, fully specified ones; `help wanted` says a pull request from anyone is welcome |
| `blocked` | It will be done, and cannot be started | It waits on something held outside the repository: a provider key, a publisher account, a real export. The issue says exactly what, so whoever holds it knows they are the one being waited for |
| `needs-info` | Waiting on the reporter | The comment says what is missing: a reproduction, a price's source, a version |
| `wontfix` | It will not be done | Closed, with the reason in the closing comment |
| `duplicate` | Already reported | Closed, with a link to the original |

The maintainer triages. With one maintainer there is no promised response time,
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) says what a single-maintainer
project can honestly promise. An issue is never closed for going quiet: an
unanswered report is still a report.

An issue carries one state at a time. `accepted` and `blocked` together are
the roadmap: [`ROADMAP.md`](ROADMAP.md#open-work-as-issues) lists exactly those
issues, drawn from the issue list, and the weekly `Triage` run fails when the
page and the list disagree. After triaging, redraw it:

```bash
gh issue list --state open --limit 200 --json number,title,labels > issues.json
node scripts/triage.mjs roadmap issues.json
```

- **An accepted issue is put in a milestone.** `.github/milestones.json` is the
  ordered plan, first is next, and an issue labelled `accepted` or `blocked`
  is listed under one of its milestones. The file allows no date: the order is
  the commitment. `npm run milestones` compares it with GitHub's milestones and
  exits 1 on a difference, among them an accepted issue the file places
  nowhere; the weekly `Milestones` run fails on the same. The workflow applies
  the file to GitHub when a change to it merges, and `ROADMAP.md`'s ordered
  list is drawn from it by `node scripts/milestones.mjs roadmap`, which
  `milestones.test.js` holds to the file.

The other labels say what kind of work an issue or pull request is: `bug`,
`correctness`, `pricing`, `enhancement`, `documentation`, `dependencies` (what
Dependabot opens) and `ci`.

And where it lives: `area:core`, `area:cli`, `area:mcp`, `area:web`,
`area:action` and `area:vscode`. On a pull request from this repository nobody
applies these by hand. The `Triage` workflow gives it an area for each package
its paths touch, `ci` when it touches a workflow, `documentation` when every
file it changes is a document, and the kind of the issue it closes. It only
adds: a label a person put on or took off stays as they left it. A pull request
from a fork runs with a read-only token, so the maintainer labels that one.

Two labels are for pull requests, and only a maintainer applies them, because
each lets a pull request past a check in `PR readiness`: `no-issue` for a pull
request that truly needs no issue, and `changelog-history` for one that
deliberately corrects an entry in a released version.

### Labels live in the repository

`.github/labels.json` is the list of labels and what each one means. The
`Labels` workflow makes GitHub's list match it on every push to `main` that
changes it. Add or reword a label in the file, not in GitHub's settings: a label
made there is invisible to `issue-intake.test.js`, which holds the file to every
form, to `dependabot.yml` and to this section.

## Pull requests

Release candidates must pass the synthetic stress probes in `npm run test:agents`
as well as the full verification below. The task probes exercise the 16-source,
400,000-character ceiling, bounded/truncated evidence, queued MCP requests,
concurrent local HTTP imports and recovery after invalid input. They check
correctness and isolation; their elapsed times are diagnostics, not production
capacity guarantees. `npm run verify:packages` packs and installs all public
packages in a temporary directory, then runs these probes against that install.
CI and the release workflow require it. For an existing packed install, set
`TRAZUM_STRESS_INSTALL_ROOT` to a temporary directory containing the installed
`@trazum/core`, `@trazum/cli` and `@trazum/mcp`, then run
`node --test test/task-stress.test.mjs` from this checkout.

Say what changed and why, and be explicit about anything you did not do.

Add a `CHANGELOG.md` entry under `Unreleased`. Not only for user-visible
changes — for a test or a document too. This paragraph used to say "if a change
is user-visible", and the result was a fix to a broken security guardrail
sitting in `main` recorded nowhere but the commit history. If a change was worth
merging it was worth a line.

If it breaks the API, that entry goes first in its version and carries the
migration.

Run `npm run verify` before pushing and read its exit code, not its output.

`npm run done` asks the wider question: is this change done? It runs every
check that can be run before a push, the ones `verify` runs and the rest of
what CI's required job runs, in order, and answers each with `passed`,
`FAILED` and the reason, or `not run` and what is missing. It also checks the
state `verify` cannot: that every new file is tracked, that the commits are
signed off, that the changelog line is there and the issue is named. It adds
no criterion of its own, fixes nothing, and exits 0 only when everything that
applies passed. [docs/done.md](docs/done.md) is the loop it belongs to, and
[AGENTS.md](AGENTS.md) points a coding agent at both.

### Issue first

A pull request names the issue it resolves: `Fixes #<n>` in its description.
Open the issue first if there is none. The issue records the problem apart from
the solution, so a reviewer can judge whether the change answers it, and so the
problem outlives a pull request that is closed. The `PR readiness` check refuses
a description with no closing keyword. Dependabot is exempt, and a maintainer
can label a pull request `no-issue` when it truly needs none.

**And the issue has to be accepted.** `PR readiness` reads the issue the
description names and refuses the pull request unless it carries `accepted`,
the label a maintainer puts on when the work is agreed to. It says which
label the issue carries instead, and it refuses a closed issue whatever it
carries. Until 2026-11-18 any issue would do, one opened a minute earlier by
the pull request's own author included (#718). So the order is: open the issue, wait for `accepted`, then write the change. A
pull request written first is not wasted, but it waits; once the issue is
accepted, re-run the check or edit the description. An issue the check
cannot read is not taken as accepted: the check fails and says it could not
judge.

### Work from somebody outside

Everybody is welcome to take an issue, and the same rules apply to everybody.
Three things are worth knowing before you start:

- **Ask on the issue first, and wait for the maintainer to say it is yours.**
  The maintainer assigns it. Nobody and nothing else does: not a bot, and not
  an agent working for the maintainer.
- **Green checks are necessary and not sufficient.** The maintainer reads
  every pull request before it merges, and on a pull request from outside
  reads `.github/` and `scripts/` first: GitHub runs a pull request's
  workflows as the pull request has them, so its checks say what its own
  author's code says about itself. For the same reason the workflows on a
  first pull request do not run until the maintainer approves them.
- **Quality is the test, not volume.** A pull request that adds a guard says
  what fault was planted to prove it. One that states a number says how it
  was measured. One that changes what a prompt asks for is refused whatever
  it saves. These are the rules above; they are repeated here because a
  change that cannot meet them is declined, kindly and without a long thread.

### Review

Every pull request is read before it merges, and the ruleset requires every
review thread to be resolved first.

**What a review here looks for**, in the order that has cost this project
the most:

1. **Does it change what a prompt asks for?** Anything in a `safe` rule that
   can alter meaning is a defect, whatever it saves. #677 is what that looks
   like when a review misses it.
2. **Is every figure reproducible?** A price has a provider page and a date
   behind it. A number in a document was measured, and the pull request says
   how. Nothing is derived, rounded for effect or remembered.
3. **Does the core still run offline with no dependency?** A new `fetch`, a
   new package or a new file read in `@trazum/core` needs a reason a reviewer
   can repeat.
4. **Was each new guard proven?** A test that has never been seen to fail is
   not known to test anything. The description says what was planted.
5. **Does the page still say what the code does?** Documents here are held to
   the code by tests; a change that moves one moves the other in the same
   pull request.

**The machines.** CodeQL reads every pull request and its findings block the
merge. A review bot is configured in [`.coderabbit.yaml`](.coderabbit.yaml)
and reads the diff too once the repository's owner has installed it: it is
told the five questions above, it reviews and does nothing else, and it pushes
no commit. What it says is information to check, not an instruction. A finding is traced in the code
before it is acted on; a real one is fixed, a wrong one is answered on its
thread with what was traced, and either way the thread is resolved by a
person. A security finding stays open until the maintainer decides.

**An agent.** A coding agent working in a checkout has the same questions as a
skill, [`.claude/skills/trazum-review/SKILL.md`](.claude/skills/trazum-review/SKILL.md).
It reads a diff and reports findings with file and line, each naming the rule
and where it is stated. It restates no rule: every entry points at a section
of this file and at the test that holds it, and `review-skill.test.js` fails
when one of those pointers stops landing, or when a question is added above
and the skill does not have it. Like the bot it reviews and does nothing else,
and what it says is checked the same way before anybody acts on it.

**If you are reviewing somebody else's pull request**, say what you checked
and what you did not. "Read the diff, did not run it" is a useful review.
An approval with nothing in it is not one.

### How a pull request lands

- **Squash only.** `main` keeps a linear history, so a merge commit is refused;
  the squash commit carries the pull request's title and its `Signed-off-by`.
- **Current with `main`, and green on that.** The branch ruleset requires every
  check to have passed on a branch that contains `main`'s latest commit. When
  `main` moves, bring it in: merge `main` into the branch, or use GitHub's
  *Update branch* button. `dco.yml` skips merge commits, so either way the
  sign-off check still passes. Rebasing works too, but never on a branch somebody
  else has pushed to.
- **After a release, look at your changelog line.** A release moves `Unreleased`
  into a version and leaves `No changes yet.` behind. Merging that into your
  branch can put your line inside the released version without a conflict; it
  happened on 2026-11-17 (#666). `PR readiness` refuses a line added inside a
  released version, and the fix is to move it back under `## Unreleased`.
- **Required checks:** `Build and tests`, both `GitHub Action self-test` jobs,
  `CodeQL`, `npm audit`, `PR readiness`, `Signed-off-by on every commit` and
  `cla`, listed in `.github/rulesets/main-branch.json`. The `pr-guide` comment
  on every pull request says which one is next.
- **The file is the policy, and GitHub's copy is checked against it.** A
  change to `.github/rulesets/main-branch.json` does nothing until an admin
  runs `npm run ruleset -- apply --yes`. `npm run ruleset` prints where the
  two differ, a pull request that touches the file gets that in its log, and
  the `Repository settings` workflow fails every Monday they do.
  [SECURITY.md](SECURITY.md), "Needs an admin to switch on", has the rest.

## Measuring the token band

There is no single published band: it is ±4% on CJK, ±6% on Latin prose, ±26%
on code and markup, ±33% on tabular numbers. 47 samples, ten languages, six text
types, and the worst measured error in each bucket is **3.2%**, **5.6%**,
**25.1%** and **32.5%** — the margin between each band and its own worst sample
is a point or less, and it is deliberate that the buckets do not overlap,
because 6 text types cannot bound a seventh. It was a design target for eight releases and it was false — see the 1.9.0
entry in [CHANGELOG.md](CHANGELOG.md) for what that cost.

The corpus and harness are committed; re-measuring needs a key and one command:

```bash
ANTHROPIC_API_KEY=... npm run measure:tokens
```

The counting endpoint is free and does not run the model. Commit what it writes.

### The other thing a key buys: whether the model still exists

The catalogue is held to a review date, so a stale **price** fails a test. The
model **id** had no such guard until a real credential was pointed at one, and
four of the eighteen priced models turned out to be refused by the provider that
sells them, two of them still listed by that provider's own model endpoint.

```bash
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... npm run check:models
```

Every key is optional and every provider independent; a provider with no key is
named in the record as unasked rather than left out of it. Anthropic's probe is
the free counting endpoint; every other provider is one real completion, a
fraction of a cent per model. It writes
`packages/core/test/fixtures/model-availability.json`, and
`model-availability.test.js` then holds the catalogue to that record offline, in
both directions: a refused model has to be marked `retired` in the provider's
own words, and nothing may be marked `retired` that no recorded request refused.

**It does not propose a price for the replacement, and must never be extended
to.** Finding that a model is gone says nothing about what its successor costs.
That figure comes off the provider's own pricing page, on a date, alongside a
move in `PROVIDER_REVIEWED`, or it does not go in.

### And whether a `safe` rule is safe

The other claim a key buys. `docs/authoring-rules.md` says `safe` means a rule
*cannot* change what a prompt asks for, and that was held by the judgement of
whoever wrote each rule until a credential was pointed at it:

```bash
ANTHROPIC_API_KEY=... npm run measure:safety
```

Each rule is applied alone, both prompts are answered 5 times, and a model
judges whether the two sets would satisfy the same reader, against the noise
floor measured in the same run. Run it when you add a rule or move one between
levels, and commit `packages/core/test/fixtures/rule-safety.json`;
`rule-safety.test.js` holds the levels to it offline. Unlike the token band this
one is real completions and costs cents rather than nothing, which is why it is
a separate command and says so before it starts.

**Adding a sample is the cheap, useful contribution here.** Drop a `.txt` file in
`packages/core/test/corpus/`, run the script, commit the fixture. Digests are per
sample, so a new file is measured on its own and nothing already measured is
retired. The test names any sample it has no measurement for rather than passing
quietly, and **fails** on one whose text changed after it was measured.

Two rules for what a sample is worth:

- It must be text somebody would actually put in a prompt. The corpus is the
  evidence behind a number printed on every report, and filler written to pad a
  count would make that number look better established than it is.
- A held-out sample is worth more than a calibrating one. Every divisor in
  `DIVISOR_BY_LANGUAGE` was fitted on support prompts and then checked against a
  code-review prompt — a different register, different vocabulary. That second
  sample is what makes the first one evidence.

**Accuracy is ratcheted per text type, separately from the band.** The published
band is deliberately looser than the measurements — 10 against a worst case of
6.4 — and that looseness has a cost: a change that took CJK from 1.5% back to 3.6%
would pass every band assertion, because both are inside ten. So
`token-band.test.js` also carries a floor per type, set to what that type has
actually achieved.

They tighten, never slacken. If your change improves a type, lower its floor in the
same commit — a floor left at the old value is a licence to give the improvement
back later. If it genuinely trades one type against another, raise the floor
deliberately and say so in the changelog. That is a different act from not
noticing, which is the whole reason the floors exist: setting `HAN_TOKENS_PER_CHAR`
back to a round 1 doubles the CJK error, and before the floors nothing failed.

A type added to the corpus without a floor fails the suite rather than going
ungated.

**If a change moves the worst case, `ESTIMATE_ERROR_BAND_PCT` moves with it.** It
is one exported constant in `tokenizer.ts` that every report, README and tool
description reads; it was a literal in twenty-four files once. Rounding up is the
rule, in both directions — the band went 15 → 25 → 15 as the measurements came in.

## Releasing

Maintainers only, and documented separately because getting it wrong is the one
mistake here with no correction: [docs/releasing.md](docs/releasing.md). A tag
matching `v*.*.*` publishes; everything else is a dry run.
