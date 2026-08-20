# `trazum profile --json`

The machine-readable report, and what it promises.

Everything the terminal prints is derived from these fields, so a dashboard, a
CI step or a spreadsheet importer can read the same figures the human report
shows without parsing prose. This file is the contract, and
`packages/cli/test/json-contract.test.js` enforces it in both directions: a
key that disappears fails, and a key added without a line here fails too.

## The promise

- **`schemaVersion` is the only thing you must branch on.** It starts at `1`
  and changes only when a field's *meaning* changes or one is removed.
- **Fields are added without a version bump.** New findings arrive as new
  keys; a consumer that ignores unknown keys keeps working.
- **Dollars are numbers, not strings**, and never rounded for display — the
  terminal rounds, the JSON does not. Token counts are integers.
- **Nothing here carries a session key or prompt text.** Session identifiers
  group turns inside Trazum and never reach any output, which is the same
  promise the log format itself makes.
- **Absence is `null` or an empty array, never zero.** `span: null` means the
  log carried no clock; `spendByDay: []` means the same. Zero would be a
  claim, and the difference between "not measured" and "measured as none" is
  the one this tool refuses to lose.

## Top-level fields

| Field | What it holds |
| --- | --- |
| `schemaVersion` | The contract version. `1` today. |
| `total` | Every priced call, split by input, cache reads, cache writes and output, in tokens and dollars. |
| `byLabel` | The same breakdown per workload label, largest bill first. |
| `byModel` | The same per model, largest bill first. Unpriced models appear with tokens and zero dollars. |
| `byLabelAndModel` | The grain a routing decision is made at: one row per workload and model. |
| `unpricedModels` | Model ids the price catalogue does not know, named rather than silently costed at zero. |
| `unpriced` | What those calls used, kept entirely out of `total`. |
| `skippedLines` | 1-based positions of lines that could not be read. |
| `conversations` | What re-sending history costs per slice — a ceiling, never a saving. |
| `hasSessions` | Whether any record carried a session at all. Distinguishes "no growth" from "not measured". |
| `outputShapes` | Where output spend concentrates, with the `max_tokens` ceilings the measured answers fit within. |
| `inputShapes` | How big a slice's calls are: the ceilings half and 95% of them fit within, their ratio, and how much of the size was cache reads. Slices with too few calls for a percentile are absent, not zeroed. |
| `repeatedTurns` | Calls that re-sent the previous call's exact input size in the same conversation, seconds apart — the shape of a retry or a loop, with what they cost. Needs a session and a clock. |
| `truncationRetries` | Truncated answers followed within two minutes by another call in the same conversation — the "billed again" half of the truncation finding, priced on both sides, with the checkable denominator. Needs a session, a clock and a stop reason. |
| `span` | The period the log covers, or `null`. Stated, never extrapolated. |
| `spendByDay` | Exact dollars per UTC day, with the day's biggest label and the day's spend per model — the series `modelMixDrift` summarises, whole. |
| `duplicateLines` | Lines identical to an earlier one (timestamped records only), and what they added to the total — the shape a doubled export has. |
| `fieldCoverage` | How many parsed records carried each optional field — the counts behind "what this log cannot answer yet". |
| `outcomeTally` | What each recorded `outcome` value cost: `byValue` (value, calls, usd, dearest first), `recorded`, `parsed`, `unrecordedUsd`. **Measurement only, no judgement** — which values mean success is declared in the config, not decided here, so a consumer that wants a rate passes this through `outcomeReport`. An aggregate, never a list of calls. |
| `spendByHour` | Exact dollars per hour of the UTC day — the shape that says whether the Batch API applies. |
| `modelMixDrift` | Each model's share of spend in the first half of the log's days against the last half — the migration a total cannot show. `null` under four dated days: one day against one day is weather, not climate. |
| `cacheTtlFit` | Whether each slice's cache TTL fits how fast its turns arrive. |
| `timeWindow` | The `--since`/`--until` filter applied, with the clockless calls it excluded. `null` when unfiltered. |
| `singleTurnCacheWrites` | Cache writes by conversations that never came back — a ceiling, or a fact when the slice read nothing. |
| `sessionCosts` | What one conversation costs: median, p95 and maximum per slice. |
| `sessionSpend` | The whole log's conversations summarised for a per-conversation budget: how many, and what the single most expensive one cost. `null` when no record carried a session. |
| `cache` | Whether caching paid for itself over the whole log, with the worst case when the TTL was not recorded. |
| `cacheByLabel` | The same verdict per workload — where a total hides a loss. |
| `pricing` | Which price table produced these dollars, and how many days old it is. |
| `levers` | What would actually move the bill: routing, the Batch API, and the ceiling on prompt shortening. |
| `against` | Present only with `--against`: the previous total, the delta, and the drivers per label and per model. |
| `contextPressure` | Slices whose largest call is past half its model's context window: the call, the window, and the share. The failure a bill cannot show until the day it happens. |
| `whatIf` | Present only with `--what-if <model>`: the same tokens at that model's rates, the slices too large for its context window, and `sameTokensAssumed` — the caveat travels inside the object so a consumer cannot print the figure without it. `batchOnTarget` holds the moved bill with the target's Batch API on top (null when the target sells none — a different statement from a $0 saving). Each slice carries `cacheBeyondTarget` — null, or the target's cache minimum and the no-cache price when the slice's cache traffic could not exist there, because the standard figure would otherwise flatter the move. |

## What it deliberately does not contain

No prompt text, no session keys, no per-call rows. The report is aggregate by
construction: a usage log handed to Trazum carries no content, and nothing
identifying comes back out of it either.

## The `--by-source` document

`profile --by-source --json` emits a different top-level shape — a fleet is
not one report:

| Field | What it holds |
| --- | --- |
| `bySource[]` | One entry per configured source with traffic: its `name` and its full `report`, each identical in shape to the single-log document above. |
| `rollup.totalUsd`, `rollup.calls` | The sum over every source. A total is a total, whatever the spans. |
| `rollup.sources[]` | Every source, dearest first: `usd`, `calls`, `share` of the fleet, and `spanDays` (null when its logs carry no clock). |
| `rollup.worst` | The dearest source with its share, or null when the fleet spent nothing — "nothing is bleeding" and "the worst of nothing" are different statements. |
| `rollup.mismatchedSpans` | True when the sources' logs cover meaningfully different periods. Shares remain shares of a sum; reading them as rate comparisons is the mistake this flag names. |
| `rollup.splitBrains[]` | The same label on different models in different sources, judged on each source's dearest model for that label. |
| `rollup.cacheUnderwater[]` | Sources where caching lost money while the fleet's aggregate paid off. Empty when the aggregate itself lost — the whole-fleet report already says so. |
| `rollup.unmatchedFiles[]` | Log files matching no source pattern — in no report above, named rather than silently dropped. |

## The plan document

`trazum plan --json` (and the file `-o` writes) is its own contract — a plan
is not a report:

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. Same discipline as the profile document: renames and meaning changes bump it. |
| `createdAt` | When the plan was made (ISO 8601). A prediction nobody dated is a prediction nobody can be held to. |
| `span` | The period the figures cover, or null when the log carried no clock. |
| `pricingLastReviewed` | The price catalogue behind every dollar — the overlay's date when one was in effect, so a later check can tell "the prediction was wrong" from "the prices changed". |
| `actions[]` | Ranked, largest money first. Each has `kind` (`route`, `batch`, `route+batch`, `fix-truncation`, `fix-caching`), `label`, `model`, and exactly one of `savingUsd` (projected) or `stakeUsd` (already spent, measured) — never both, because a projection and a measurement in one field is a number that is neither. |
| `actions[].assumes[]` | What the log cannot confirm, as typed objects (`{"kind": "model-capability", "model": ...}`, `{"kind": "batch-window"}`, ...) rather than prose — renderers localize them, and a verification can match them structurally. |
| `actions[].check` | The Trazum command that can check the assumption, when one exists. |
| `actions[].detail` | `routeTo` for the moved calls; `measured` for the pieces behind a stake (the wasted and retry dollars, the cache counterfactual); `baseline` — the slice as the plan saw it (calls, dollars, tokens per call), the "before" a later verification attributes the world's movement against. |
| `projectedSavingUsd` | Projected savings summed. Additive by construction: same-slice compositions arrive pre-combined inside one action. With `--min-usd` it covers only the actions the document holds — the file never contradicts itself; what was dropped is stated on the terminal with its worth. |
| `measuredStakeUsd` | Measured stakes summed — money already paid to problems this plan names, kept apart from the projections. Filtered the same way. |
| `totalUsd` | The bill the plan was made against. |

## The verification document

`trazum verify --json` is the plan's reckoning — its own contract:

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `planCreatedAt` | When the plan was made, carried through — or null for an undated plan. |
| `planPricing` | The catalogue that priced the plan, and the one pricing this check. When they differ, `pricesChanged` is true and every dollar comparison is two price lists, not one measurement. |
| `currentPricing` | See above. |
| `pricesChanged` | See above. |
| `actions[]` | One verdict per plan action: the action verbatim, `outcome` (`arrived`, `not-arrived`, `cannot-tell` — three, never two), `reason` for the third (`workload-vanished`, `fields-stopped`, `tier-not-recorded`), `observed` (what this log measured: where the money sits, the new retry bill, the new cache delta), `attribution` (the world's movement from the plan's baseline — calls and tokens per call, before and after, never a verdict), and `gateFailing`. |
| `arrived` | The three counts. They always sum to `actions.length`. |
| `notArrived` | See above. |
| `cannotTell` | See above. |
| `gateFailures` | Actions that fail `--gate`: every `not-arrived`, plus `cannot-tell` with reason `fields-stopped` — a team must not pass on the strength of its own log's silence. A vanished workload and an unrecordable tier fail nothing. |

## The history document

`trazum history --json` — the long run as data, its own contract:

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `periods[]` | The stored reports that carry a span, oldest first: name, `fromMs`/`toMs`, `totalUsd`, `calls`. |
| `labelSeries[]` | Per label, dollars per period — null where the label had no traffic that period, which is absence and not zero. |
| `modelShareSeries[]` | Per model, its share of that period's total — null where absent. The totals can look flat while the mix moves under them. |
| `cacheShareSeries[]` | The share of input tokens served from cache, per period — null where unknowable. |
| `runs[]` | The findings only a series can make: consecutive movement, named — `label-spend-climbing`, `model-share-climbing`, `cache-share-decaying` — each with how many consecutive periods, since which report, and the first and last values. Shapes, never forecasts: nothing here extrapolates. |
| `repeatedPlanActions[]` | The same action (kind, label, model) in two or more saved plans, with first and last planned dates — a decision nobody is executing. |
| `undatedReports[]` | Reports with no span: on no timeline above, named rather than silently absorbed. |
| `unrecognizedFiles[]` | JSON files that are neither a stored report nor a saved plan — in no series, named. |
| `waivers` | The waiver record: `since` (the day recording started, or null), `totalUses`, `habits[]` and `neverUsed[]`. A `habit` carries the gate, `uses`, distinct `days`, `firstDay`/`lastDay`, every `reason` and `expiry` in the order first seen, a `verdict` (`used-once`, `recurring`, `renewed-without-revisiting`, `reason-changed`) and `stillConfigured`. Nothing here is derived from the config: a waiver written down and never hit appears in `neverUsed` with no count, because dead config is not a habit. |

## The connected report document

`trazum connect --json` (and the file `-o` writes) is the restricted report a
usage API can support — its own contract, deliberately not the profile
document:

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `provider` | Which connector produced it. |
| `granularity` | `bucketed` for a usage API that serves sums; `per-call` for a source that serves rows. |
| `span` | The window the buckets actually cover, or null when none parsed. |
| `total` | `totalUsd`, token counts, and `calls` — **null** when the provider serves no request count, never zero, because zero reads as "no traffic" against real spend. |
| `byModel[]` | Per model: token counts, the four dollar figures, `cachedTokensAtInputRateUsd` and `cacheWriteUsdIfAssumed1h` for the cache counterfactual, and `writeTtlKnown`. |
| `byDay[]` | Spend per UTC day, oldest first, with the same nullable `calls`. |
| `unpricedModels[]` | Models the catalogue could not price: named, with their tokens kept and their money absent. |
| `gaps[]` | What the pull did not get — `rate-limited`, `retention-boundary`, `cursor-expired`, `page-limit`, `unreadable-entry`, `unreadable-field` — each with the detail. A window short by an unknown amount says so here. |
| `unavailable[]` | Findings this source cannot support, each with `because` and `unlockedBy`. A restricted report that merely omitted them would read as a report that found nothing. |

## The cost answer document

`trazum serve`'s `POST /cost` response, and the `cost` half of `spend_guard`'s
answer. Contracted here since consumers build against it hardest — an agent
reads it on every call. It should have shipped with 1.44 and did not; the
omission is on the record in that release's notes.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `call` | The call the caller described, priced: `model`, `inputTokens`, `outputTokens`, `estimatedUsd`, `provenance` (always `estimated` — nobody has sent it) and `basis` (`token-count` when the caller counted, `heuristic` when Trazum did). Null when no call was described or the model could not be priced. |
| `budget` | Where the budget stands: `limitUsd`, `consumedUsd`, `remainingUsd`, `provenance` (always `measured`) and the `window` that figure covers, so staleness is visible rather than implied away. Null when there is no budget or nothing measured. |
| `verdict` | `within`, `over`, or `cannot-tell`. Three, never two. |
| `restsOn` | What the verdict rests on: `measured` when the budget is already past its limit and no estimate was needed, `measured+estimated` when it takes the described call to cross. Null on `cannot-tell`. |
| `reason` | Why it cannot tell, kept apart because the fixes differ: `no-budget-configured`, `nothing-measured`, `model-unpriced`. |
| `afterCall` | Where the budget would stand after this call — `usd`, with `halves.measuredUsd` and `halves.estimatedUsd` beside it. The composed figure never travels without its two halves, so it cannot be mistaken for a measurement. |

## The spend-guard document

`spend_guard` over MCP wraps the answer above with what to do instead:

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `verdict` | `yes`, `no`, `cannot-tell` — mapped from the cost answer. `cannot-tell` never becomes `yes`: a guard that permits whatever it cannot judge permits everything the moment its inputs go missing. |
| `cost` | The full cost answer above, halves and provenance intact. |
| `alternatives` | Cheaper ways to make the same call, dearest saving first. Each carries `kind` (`route`, `batch`, `route+batch`), the `model` it moves to, `savingUsd` **for this call** rather than for a month, the typed `assumes` it rests on, and `fits` — only alternatives the prompt fits inside are ever offered. Present on a `yes` as well, since an agent allowed to spend that could spend less should be told. |
| `because` | One line for a human reading a log. Never the only place a fact appears. |

## The first-run document

`trazum init --json`. The proposal `init` would write, plus what it declined
and why — the same value the human-readable run renders, so a script and a
person are looking at one document rather than two renderings that can drift.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `config` | Exactly the keys `init` could justify, and nothing else. Serialises to a valid `trazum.config.json`; a key with no evidence behind it never appears, because a guessed threshold in a generated file reads as somebody's decision six weeks later. |
| `justified` | One entry per key written, each with the observation behind it: `key`, the `value`, `from` (`measured`, `source`, `walk`, `environment`) and the arithmetic — call counts and day spans, token totals, the file and line a model literal came from. |
| `declined` | One entry per key left out, each with `key` and a typed `why`, plus whatever would settle it. `nothing-measured`, `window-too-short` (with `days`), `undated-calls` (with how many), `not-recorded`, `only-you-know`, `unprovable`, `provider-only`, `conflicting-evidence` (with the files), `a-budget-is-a-policy` (with the measured figure, so the number is in hand even though the threshold is not written). A refusal never arrives bare. |
| `headline` | The single most valuable finding, or null. Carries the `slice` from `billLevers` whole — label, model, calls, what it spent, its route and batch levers — plus `lever`, `savingUsd` (the slice's `combinedUsd`, computed and never summed), `provenance` (always `measured`) and the `days` behind it. |
| `noHeadline` | Why there is none, when `headline` is null: `nothing-measured`, `nothing-could-be-priced`, `no-lever-clears-the-floor`. Three situations a reader would act on differently. |
| `overwrites` | The config already present and which of its keys this proposal would replace, or null when there is no file. An empty `keys` array is a different statement from null: the file exists and nothing collides. |
| `unreadable` | A usage source that is there and could not be read, with `where` and `because`. Null otherwise — and never folded into "no usage found", because the fixes are opposite. |
| `truncated` | Whether the source-file walk hit its cap, so "no provider found" can be told apart from "stopped looking". |

## The gateway refusal document

The body `trazum gateway` returns with **HTTP 402** when a call is over budget.
402 rather than 429 on purpose: every provider SDK retries a 429 automatically,
which would turn one refusal into a retry storm against a gateway that refuses
every time.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `error` | `{type: "trazum_budget_refusal", message}` — shaped like a provider error so an SDK's own error path handles it, and typed so it cannot be mistaken for one. |
| `reason` | `budget-exhausted` (already past, measured), `call-would-cross` (this call takes it past), or `cannot-tell-and-closed` (nothing could be judged and the operator chose fail-closed). |
| `cause` | Why it could not be judged, when that is the reason: `no-budget`, `nothing-measured`, `model-unpriced`. Null otherwise. |
| `restsOn` | `measured` when the budget was already spent and nothing was estimated to reach the verdict; `measured+estimated` when it takes an estimate of *this* call to cross. Null on `cannot-tell-and-closed`. The two halves never merge. |
| `standing` | The budget position the refusal rested on — `limitUsd`, `consumedUsd`, `provenance` (always `measured`) and `asOfMs`, so a caller can see how stale the figure is rather than assume it is current to the second. |
| `estimatedUsd` | What this call was priced at, or null when the model could not be priced. |
| `alternatives` | Cheaper ways to make the same call, dearest saving first: `kind` (`route` or `batch`), the `model` it moves to, `savingUsd` for **this call**, and the typed `assumes` it rests on. A refusal never arrives bare. Only models the call fits inside are ever offered. |

**No prompt, no completion, no credential.** The body passed through the
process and does not come back out of it — a test asserts a refusal carries no
trace of the request text.

A **502** with `error.type: "trazum_upstream_unreachable"` is a different thing
entirely: the provider could not be reached. A caller needs to tell "your
provider is down" from "you are out of money", and a proxy that blurred them
would send somebody to fix the wrong thing at the worst possible moment.
