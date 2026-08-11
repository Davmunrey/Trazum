# Contributing

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
npm run build      # core + cli
npm test           # core + cli test suites
npm run typecheck  # all four workspaces
npm run build:web  # the Next.js app
```

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

## Security invariants

These are enforced by tests in `packages/core/test/security.test.js`. If your
change trips one, that is the test working — read the failure before adjusting it.

1. **The core and the CLI have no runtime dependencies.** They process untrusted
   text; every dependency is unreviewed code running on someone's prompts. If you
   genuinely need one, argue for it in the pull request and change the test
   deliberately.
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

`±15%` is a design target that nothing establishes. The corpus and harness are
committed; the measurement needs a key and one command:

```bash
ANTHROPIC_API_KEY=... npm run measure:tokens
```

The counting endpoint is free and does not run the model. Commit what it writes.
Re-run it whenever `packages/core/test/corpus/` changes — the fixture carries a
digest and the test fails rather than describing text that has moved on.

## Releasing

Maintainers only, and documented separately because getting it wrong is the one
mistake here with no correction: [docs/releasing.md](docs/releasing.md). A tag
matching `v*.*.*` publishes; everything else is a dry run.
