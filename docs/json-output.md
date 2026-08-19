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
| `span` | The period the log covers, or `null`. Stated, never extrapolated. |
| `spendByDay` | Exact dollars per UTC day, with the day's biggest label. |
| `duplicateLines` | Lines identical to an earlier one (timestamped records only), and what they added to the total — the shape a doubled export has. |
| `fieldCoverage` | How many parsed records carried each optional field — the counts behind "what this log cannot answer yet". |
| `spendByHour` | Exact dollars per hour of the UTC day — the shape that says whether the Batch API applies. |
| `cacheTtlFit` | Whether each slice's cache TTL fits how fast its turns arrive. |
| `timeWindow` | The `--since`/`--until` filter applied, with the clockless calls it excluded. `null` when unfiltered. |
| `singleTurnCacheWrites` | Cache writes by conversations that never came back — a ceiling, or a fact when the slice read nothing. |
| `sessionCosts` | What one conversation costs: median, p95 and maximum per slice. |
| `cache` | Whether caching paid for itself over the whole log, with the worst case when the TTL was not recorded. |
| `cacheByLabel` | The same verdict per workload — where a total hides a loss. |
| `pricing` | Which price table produced these dollars, and how many days old it is. |
| `levers` | What would actually move the bill: routing, the Batch API, and the ceiling on prompt shortening. |
| `against` | Present only with `--against`: the previous total, the delta, and the drivers per label and per model. |
| `contextPressure` | Slices whose largest call is past half its model's context window: the call, the window, and the share. The failure a bill cannot show until the day it happens. |
| `whatIf` | Present only with `--what-if <model>`: the same tokens at that model's rates, the slices too large for its context window, and `sameTokensAssumed` — the caveat travels inside the object so a consumer cannot print the figure without it. |

## What it deliberately does not contain

No prompt text, no session keys, no per-call rows. The report is aggregate by
construction: a usage log handed to Trazum carries no content, and nothing
identifying comes back out of it either.
