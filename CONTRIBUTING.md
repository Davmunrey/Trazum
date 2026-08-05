# Contributing

## The repository is English

Source, comments, identifiers, tests, documentation, commit messages, issues
and pull requests: all English. This is not a style preference — it is what
makes the internationalisation work, because English is the source of truth
every other locale is translated from.

Two deliberate exceptions:

- **`packages/core/src/phrases.ts`** contains Spanish (and, in time, other)
  phrases. Those are *data* — the vocabulary Trazum looks for inside the
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
across all three workspaces, and the web build. **Run it before pushing, and
read its exit code rather than its output.** The web build in particular fails on
things nothing else notices: `@trazum/core` is bundled for the browser, so one
`node:fs` import anywhere in its import graph breaks it, and neither the tests
nor `tsc` will tell you.

The pieces individually, if you want a faster loop:

```bash
npm run build      # core + cli
npm test           # core + cli test suites
npm run typecheck  # all three workspaces
npm run build:web  # the Next.js app
```

## Adding a rule

1. Add its id to the `RuleId` union in `packages/core/src/i18n/types.ts`.
2. Implement it in `packages/core/src/rules.ts`. A rule takes masked text and
   returns `{ text, hits }`. It never sees protected content, so it cannot
   break code, URLs or placeholders.
3. Add its copy to **every** catalogue in `packages/core/src/i18n/`. The build
   fails until you do — that is the point of the typed union.
4. Add a test. The bar is a case that would have passed before your rule and
   now demonstrably does not, plus one that shows the rule leaving a
   lookalike alone.

Put a rule at `aggressive` if removing its target could change what the prompt
asks for. When unsure, `aggressive` is the right answer: `safe` is a promise.

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

`packages/core/src/pricing.ts` is the single source of truth. Update
`PRICING_LAST_REVIEWED` in the same commit, and cite where the numbers came
from in the commit message. Pricing changes ship as patch releases — see
[VERSIONING.md](VERSIONING.md).

## Tests

`node --test` against the built output, no framework. Tests assert on
**identifiers and numbers**, not on message text — copy changes without a
version bump, and a test that breaks when someone improves a sentence is a test
that will get deleted.

The one exception is asserting that a locale produces *different* text from
another, which is testing the mechanism rather than the wording.

## Security invariants

Four things are enforced by tests in `packages/core/test/security.test.js`. If
your change trips one, that is the test working — read the failure before
adjusting it.

1. **The core and the CLI have no runtime dependencies.** They process
   untrusted text; every dependency is unreviewed code running on someone's
   prompts. If you genuinely need one, argue for it in the pull request and
   change the test deliberately.
2. **`optimize()` never touches the network.** `fetch` is permitted only in
   `llm.ts` and `tokenizer.ts`, the two modules that exist to make calls.
3. **No catastrophic backtracking.** A rule is a regex pointed at attacker-
   controlled text on a public endpoint. Avoid nested unbounded quantifiers
   (`(\w+)+`, `(a|a)*`); bound your repetitions. The ReDoS suite runs
   pathological inputs against a time budget.
4. **The SSRF filter only loosens with an explicit flag.** `validateLlmEndpoint`
   fails closed. Never derive `allowInsecure` from anything in a request.

Two more that are conventions rather than tests:

- **Never use `pull_request_target`** in a workflow. It runs with a writable
  token and repository secrets against the contributor's code.
- **Never log a prompt or an API key.** Prompts are not stored anywhere, and
  keys are used once and dropped.

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
