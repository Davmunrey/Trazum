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
| `actions[].detail` | `routeTo` for the moved calls; `measured` for the pieces behind a stake (the wasted and retry dollars, the cache counterfactual). |
| `projectedSavingUsd` | Projected savings summed. Additive by construction: same-slice compositions arrive pre-combined inside one action. With `--min-usd` it covers only the actions the document holds — the file never contradicts itself; what was dropped is stated on the terminal with its worth. |
| `measuredStakeUsd` | Measured stakes summed — money already paid to problems this plan names, kept apart from the projections. Filtered the same way. |
| `totalUsd` | The bill the plan was made against. |
