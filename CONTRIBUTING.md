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
npm run build      # core + cli
npm test           # core test suite
npm run build:web  # the Next.js app
```

Node 22. No global installs needed.

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

## Pull requests

Say what changed and why, and be explicit about anything you did not do.
If a change is user-visible, add a `CHANGELOG.md` entry; if it breaks the API,
that entry goes first and carries the migration.
