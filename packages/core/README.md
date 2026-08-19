# @trazum/core

Prompt optimiser. Shortens what you send to a model without changing what you
ask for, and tells you what that is worth per month.

**Zero runtime dependencies**, and that is asserted in CI rather than promised.
This library reads your prompts; every dependency would be someone else's code
reading them too.

Part of [Trazum](https://github.com/Davmunrey/Trazum). For the terminal, see
[`@trazum/cli`](https://www.npmjs.com/package/@trazum/cli).

```bash
npm install @trazum/core
```

## Use

```ts
import { optimize } from '@trazum/core';

const result = optimize(prompt, {
  level: 'safe',                       // or 'aggressive' — read the diff
  usage: {
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 500,
    cacheHitRate: 0.9,
    batchEligible: false,
  },
});

result.optimized;                    // the shortened prompt
result.savings.monthlySavingsUsd;    // what that is worth
result.advisories;                   // usually where the real money is
result.rules;                        // what each rule changed, with samples
```

The optimisation is **deterministic**: same input, same output, no API key, no
network call, nothing to pay.

## What it does

**Trims with deterministic rules** — courtesy, filler, verbose phrasing,
duplicated paragraphs, decorative separators, shouting in capitals.

**Never touches what would break the prompt.** Code fences, inline code, URLs,
template placeholders (`{{x}}`, `${x}`, `{x}`, `{% %}`) and XML/HTML tags are
isolated *before* any rule runs. If a rule ever did make one of those disappear,
that rule is discarded and the rest carry on.

**Tells you where the money actually is.** Trimming is usually not it. Read
`result.advisories` first — they are sorted warnings-first, then by monthly
saving:

| Advisory | What it finds |
|---|---|
| `prompt-caching` | Caching is a byte-for-byte prefix match, so a template only caches up to its first placeholder. The saving is computed over the **real** stable prefix. |
| `cache-prefix-reorder` | Stable instructions stranded *after* the first placeholder never cache. Often the single largest saving available. |
| `contradictory-instructions` | "Answer in English" three paragraphs above "reply in the customer's own language". A correctness bug that also costs tokens twice. |
| `redundant-examples` | Few-shot examples that are near-copies of an earlier one. |
| `restated-output-format` | A schema shown in a code block and then walked again in prose. |
| `movable-output-schema` | A schema the request could carry as a parameter instead — cheaper *and* stricter, and the one finding that is not a trade-off. Reported, never edited: it changes the call, not the prompt. |
| `model-downgrade` | A keyword heuristic, not a quality judgement — validate with evaluations before acting on it. |
| `output-dominated` | You pay more for the answer than the prompt, so shortening it has a ceiling. |
| `batch-api`, `below-cache-minimum`, `context-window`, `promotional-pricing` | |

The last three structural findings are **advisory only**. A contradiction has a
right answer only you know, and an example that looks redundant may be
demonstrating a boundary case on purpose. Trazum points; it does not cut.

## Measured usage

`measuredUsage(report, label)` turns one label's slice of a `profileUsage()`
report into the `UsageProfile` that `optimize()` multiplies by — the real call
count, output size and cache-read share instead of typed guesses — with the
provenance attached: the span, the scaling factor when a month was derived
(never under seven days of data), the chosen model's share when the label ran
on several, and whether output was ever recorded. `labelCoverage(report,
labels)` names both mismatches between a config's label→prompt map and the
log: prompts mapped to labels with no traffic, and labels carrying money with
no prompt mapped.

## Comparing two versions

```ts
import { comparePrompts, formatSignedUsd } from '@trazum/core';

const change = comparePrompts(before, after, { usage });

change.tokenDelta;                       //  +37  (grew)
formatSignedUsd(change.monthlyDeltaUsd); //  "+$9.25"
change.advisories.appeared;              //  what the edit broke
```

**Note the sign.** Everything `comparePrompts` returns is `after - before`, so
**positive means worse** — the opposite of `result.savings`. That is why it lives
in its own module and why nothing in it is called a saving.

## Prices

The bundled catalogue is correct as of `PRICING_LAST_REVIEWED` and needs no
setup. When a published price moves, correct it without upgrading this package:

```ts
import { catalogueFromOverlay, optimize } from '@trazum/core';

const pricing = catalogueFromOverlay(`{
  "lastReviewed": "2027-01-15",
  "models": { "claude-opus-5": { "inputPerMTok": 6 } }
}`);

const result = optimize(prompt, { usage, pricing });
result.pricingSource; // says which models came from the overlay, and its date
```

A catalogue is a **value**: applying an overlay returns a new one and mutates
nothing, so your prices never leak into another caller's report.

## Two entry points

`@trazum/core` imports **no Node builtins** — enforced by a test that walks the
import graph, because the browser bundles it. Anything that reads the filesystem
lives on `@trazum/core/node`:

```ts
import { loadConfig, walkPrompts } from '@trazum/core/node';
```

## Optional LLM pass

For the compression rules cannot do. The result is only accepted if it is
shorter **and** leaves protected content byte-identical — it never returns
something worse than where it started.

```ts
import { openAiCompatible, refineWithLlm } from '@trazum/core';

const refined = await refineWithLlm(result, openAiCompatible({
  baseUrl: 'https://your-llm/v1',
  apiKey: process.env.LLM_KEY,
  model: 'your-model',
}));
```

## Token counts

The bundled estimator is a dependency-free heuristic, and it compares two versions
of the same prompt well — which is what it is for. Its error band is **±10%**,
exported as `ESTIMATE_ERROR_BAND_PCT` so you can print the same number the report
prints rather than hard-coding it.

That band is measured, against the official counting endpoint, over 21 samples in
seven languages and six text types. **The worst error in the corpus is 6.4%** and
the published band is 10 — the margin is deliberate, because 21 samples across six
types cannot bound a seventh, and a band that becomes false the first time somebody
measures something new is the fault this whole exercise was fixing.

It was an unchecked design target for eight releases and it was false; the 1.9.0
entry in the changelog says what was wrong.

Three things follow from how it was measured, and they matter if you depend on the
number:

- **The band is a Claude number.** The estimator is tuned against Claude's
  tokenizer. Other families tokenize differently and nothing here bounds the error
  for them.
- **It detects the language and divides accordingly**, because one divisor
  calibrated on English measured −37.3% on German. `detectTextLanguage` answers
  `null` when it cannot tell, which falls back to the English behaviour.
- **Kana and han cost different amounts.** Charging one token per CJK character put
  Japanese at +11.2% and Chinese at −3.2% under the same rule; kana measure 0.75
  tokens per character and han 1.05, which takes both inside 1.5%.

For exact figures, pass a real counter — the counting endpoint is free:

```ts
import { countTokensAnthropic, withExactTokenCounts } from '@trazum/core';

const exact = await withExactTokenCounts(result, countTokensAnthropic({ apiKey }));
```

## Locales

English and Spanish. **A locale changes the report, never the optimisation** —
the same prompt in any locale produces the same optimised text, the same token
counts and the same advisory ids. Match on ids, not on prose.

## Versioning

See [VERSIONING.md](https://github.com/Davmunrey/Trazum/blob/main/VERSIONING.md).
Rule and advisory **identifiers** are stable across locales and versions on
purpose; message **text** is copy and gets improved.

MIT.
