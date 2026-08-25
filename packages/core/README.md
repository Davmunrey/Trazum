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

## The fleet

`assignSources(files, sources)` assigns log files to named services by the
most specific matching glob — the budget patterns' own precedence rule — and
returns the files matching no source rather than dropping them.
`fleetRollup(sources)` sums the fleet, names the dearest source with its
share, flags spans too different to compare as rates, finds the same label
running on different models in different sources (judged on each source's
dearest model, so a stray experiment is not a migration), and names sources
where caching loses money while the aggregate pays off.

## The plan

`buildPlan(report, levers, pricingLastReviewed)` turns a report and its
levers into a ranked `PlanDocument`: route and batch on one slice arrive as a
single pre-combined action (`combinedUsd`, never a sum), the truncation
action's stake is the measured retry bill, and a cache action exists only for
a settled loss — an unsettled verdict is a missing field, and "add the field"
is the report's advice, not a plan's. Projected savings and measured stakes
are totalled separately; every action carries typed assumptions
(`PlanAssumption`) the log cannot confirm, as data rather than prose, so the
renderer localizes them and a later verification can match them
structurally. `planLabelName` renders the unlabelled bucket without leaking
the sentinel.

## Did it work?

`verifyPlan(plan, newerReport, { currentPricingLastReviewed })` holds a saved
plan to the report of a later log, with three outcomes and never two:
`arrived`, `not-arrived`, or `cannot-tell` — the workload vanished, the
fields the detection needs stopped being recorded, or tokens cannot say
which tier billed them. Differences carry the world's measured movement from
the plan's recorded baseline (calls, tokens per call, both numbers and never
a verdict), a repricing between the two documents is flagged rather than
silently priced through, and each verdict says whether it fails a gate:
`not-arrived` always, `fields-stopped` too — a team must not pass on the
strength of its own log's silence — and a vanished workload never.

## The long run

`buildHistory(reports, plans)` turns stored reports into the series no
pairwise comparison can see: per-label spend, per-model share and cache
share per period, with consecutive movement named as runs (`MIN_RUN` rises
or falls at least — two is a comparison, one is noise) and the same plan
action appearing in two or more plans reported as a decision nobody is
executing. `storedReportFrom(name, parsed)` reads one stored `profile`
document into the slice history needs, returning null for anything else so
the caller names the file instead of absorbing it. No forecasts anywhere:
shapes are stated with their first and last values, and where they go next
is the reader's.

## The bill, from the provider

`normalizeAnthropicUsage(payload)` and `normalizeOpenAIUsage(payload)` turn a
usage API response into `UsageBucket`s — token sums per window and model, with
the two cache-write TTLs kept apart and a request count only where the
provider actually serves one (`null` otherwise, never zero).
`bucketedProfile(pull, { catalogue })` prices them, and
`bucketedCacheEconomics(report)` runs the same counterfactual `cacheEconomics`
runs per call. The result is deliberately its own shape rather than a
`UsageProfileReport` with holes in it, so no per-call finding can read a zero
this module wrote: every finding a sum cannot support is listed in
`unavailable` with why and what would unlock it. Anything unreadable in the
payload becomes a named `PullGap`, never a default of zero. Pure and
browser-safe — the fetch, the credentials and the pagination live in the CLI.

## The bill, from what is already on disk

`claudeCodeRecords(text, { label })` converts a Claude Code transcript into
usage-log records — the token counts and the model cross, the words never do,
and that absence is asserted by test rather than promised.
`looksLikeClaudeCodeTranscript(text)` detects one, so a mixed folder routes
itself. `otelRecords(text)` does the same for an OpenTelemetry export's GenAI
spans, and returns what it skipped beside what it converted — "1 LLM span
priced, 1 other ignored" is a different sentence from a bare total. Both are
pure and browser-safe; the web app's Bill tab runs them on a dropped folder.

## Should we switch models?

`switchAnalysis(report, targetId, { catalogue, on, migrationUsd, evalCases })`
prices the decision a what-if only gestures at: the saving on the same tokens
(the sign is proven in both directions — a switch that costs money says so),
the break-even of a **declared** migration cost as division over the measured
days — refused by name (`no-saving`, `no-clock`) rather than approximated —
and the cost of the evaluation itself, three provider calls per case. Quality
is never in the result: the analysis defers to `route`, every time.
`ownRate({ gpuUsdPerHour, tokensPerSecond, utilization })` derives a
self-hosted $/MTok from your declared numbers — the one price source here
that is neither published nor bundled: it is your own measurement, and the
function refuses rather than defaults when a number is missing or out of
range.

## The store

`resolveStore(records)` collapses an append-only log into the current truth:
one record per identity — provider, window, model, grouping — with the later
pull winning, so overlapping pulls converge instead of double-counting.
Records it cannot tell apart are returned as `possiblyDouble` rather than
merged, and lines from a newer schema are counted rather than dropped.
`recordsFromBuckets` and `bucketsFromRecords` round-trip a pull through disk
so a stored month prices exactly as a fresh one does; `storeInventory`
summarises what is held; `pruneRecords` returns what a retention cutoff would
remove, with its span, because silence about deleted measurements is the one
thing a store must not do.

## Watching

`evaluateWatch({ report, thresholds, nowMs, ... })` decides what has crossed.
Crossings are measured and carry `provenance` as a field, so a later change
cannot smuggle an estimate past a consumer by staying silent. A period too
short to judge becomes an abstention rather than a pass — three states, never
two — and a crossing already reported comes back as `suppressed` rather than
vanishing, because "we alerted about this" and "this is fine now" are
different sentences. The unwatched stretch between cycles is returned as
`gap`.

## Answering before the call

`answerCost(request, { catalogue })` answers the two questions asked at call
time. The budget consumed is `measured`, the cost of the described call is
`estimated`, and the two never merge: the composed `afterCall.usd` carries its
halves beside it, and `restsOn` says whether the verdict needed the estimate
(`measured` when the budget is already past its limit, `measured+estimated`
when it takes this call to cross). Three outcomes rather than two — `within`,
`over`, `cannot-tell` — and the reasons are kept apart because their fixes
differ: no budget configured, nothing measured, or a model the catalogue
cannot price. Pure and synchronous, because a function that reads a file
cannot promise an answer in milliseconds.

## The guard

`guardSpend(request, { catalogue })` wraps `answerCost` with what to do
instead. A refusal carries alternatives — route, batch, or both combined the
way `billLevers` combines them rather than summed — each priced for the single
call being decided, each carrying its typed assumption, and each filtered to
models whose context window the prompt actually fits. `cannot-tell` never
becomes `yes`: a guard that permits whatever it cannot judge permits
everything the moment its inputs go missing.

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

`openrouterOverlay(payload, { knownIds, lastReviewed })` turns an OpenRouter
`/models` response into that same overlay shape — models you already price are
left alone, and anything unreadable comes back in `skipped` with a reason
rather than vanishing. It is pure, so the browser can run it on a pasted
response; the CLI's `--pricing-live` is this function behind a fetch.

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
