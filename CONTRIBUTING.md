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
naming the SHA.

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
check green — once, covering everything you contribute afterwards. What you
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

`verify` is the one command worth remembering — it is build, tests, typecheck
across all four workspaces, and the web build. **Run it before pushing, and
read its exit code rather than its output.** The web build in particular fails on
things nothing else notices: `@trazum/core` is bundled for the browser, so one
`node:fs` import anywhere in its import graph breaks it, and neither the tests
nor `tsc` will tell you.

The pieces individually, if you want a faster loop:

```bash
npm run build      # core, the CLI, the MCP server and the OpenAI tokenizer
npm test           # core, the CLI, MCP, the tokenizer, the web app and the Action
npm run typecheck  # all five workspaces
npm run build:web  # the Next.js app
npm run test:action  # the packaged Action on its own, without the rest
```

Two that write files rather than check them:

```bash
npm run draw:architecture  # redraws docs/assets/boundary.svg from the code
npm run measure:tokens     # re-measures the estimator against a real counter
```

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
   break code, URLs or placeholders.
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
vulnerability privately.

## Pull requests

Say what changed and why, and be explicit about anything you did not do.

Add a `CHANGELOG.md` entry under `Unreleased`. Not only for user-visible
changes — for a test or a document too. This paragraph used to say "if a change
is user-visible", and the result was a fix to a broken security guardrail
sitting in `main` recorded nowhere but the commit history. If a change was worth
merging it was worth a line.

If it breaks the API, that entry goes first in its version and carries the
migration.

Run `npm run verify` before pushing and read its exit code, not its output.

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
