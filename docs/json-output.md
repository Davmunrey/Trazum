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
| `outcomeTallyByLabel` | The same tally per label, each with the slice's own `calls` and `totalUsd` — so a coverage share describes the workload and not the file it came from. The grouping a decision is made at. |
| `outcomeTallyByModel` | The same, per model. |
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

## The outcome report document

**Nothing emits this one, and that is the point of documenting it.**
`trazum profile` renders it as terminal text over a log that carries outcomes;
`@trazum/core`'s `outcomeReport()` computes it. It is a contract so that a tool
of *yours* can produce one and have `trazum conform --contract outcome-report`
check it — not a promise that Trazum will hand you the JSON.

The refusals are the part worth copying. A format that carried these fields and
dropped the refusals would be worse than no format, because it would look
interoperable.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. Absent from this document from 1.50.4 until it was noticed — the contract required it and the reference producer did not emit it, so the only implementation of this format failed it. |
| `slices` | One entry per **declared** outcome value, dearest first: `value`, `verdict` (`success` or `other`), `calls`, `usd`. |
| `undeclared` | Values found in the log that the config never declared, each with `verdict: "undeclared"` and what it cost. **Named, never folded into the failures** — a typo in an exporter must surface as a typo and not as a shift in the success rate. |
| `coverage` | `recorded`, `parsed` and `unrecordedUsd`. The denominator, stated: "eleven of forty thousand calls recorded an outcome" is a different document from "eleven succeeded". |
| `successShareOfRecordedUsd` | The success rate **by spend**, or `null`. By spend rather than by call because this product's subject is money, and the two figures diverge exactly when the expensive half is the half that fails. **Null is not zero**: zero is a real and terrible measurement, and spelling "nobody told me" the same way destroys the difference. |
| `noRate` | Why there is no rate, when there is none: `nothing-recorded`, or `no-success-values-declared`. Null when there is one. A refusal never arrives bare. |

## The annual record document

`trazum report --year <yyyy> --json`. The year assembled from the store and the
plans already kept — **no new data**, and nothing computed that cannot be checked
against a document that already exists.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `year` | The four-digit year, as a string. |
| `months` | One entry per month that has a record, oldest first: `month` (`YYYY-MM`), `usd`, `calls`. A month with nothing in it is not here. |
| `missingMonths` | Every month of the year with no record at all, **named rather than interpolated**. A year report that quietly covers nine months and prints an annual total is wrong by a quarter and says nothing about it. |
| `totalUsd`, `totalCalls` | Over the months present, and only those. |
| `promises` | `planned`, `arrived`, `notArrived`, `cannotTell`, `projectedUsd`. **Three outcomes, never two** — the third is the one an ordinary annual report folds into the flattering one. |
| `promises.arrivedUsd` | **Deliberately absent.** A verification says *whether* each action landed; it has never carried a per-action dollar figure for the saving that arrived. Summing one out of the observations would mean deciding which of them to believe, which is the annual-report arithmetic this document exists to replace. |
| `outcomes` | The outcome coverage for the year — `recorded`, `parsed`, `unrecordedUsd` — or **null when nothing recorded one**. Attached when something was *recorded*, not merely parsed: keying on "calls were parsed" made the honest "no outcome was recorded this year" sentence unreachable. |
| `cannotSay` | Typed reasons this record cannot answer something: `months-missing`, `nothing-was-planned`, and the rest. The list is part of the document, not a footnote in the terminal rendering. |

## The roll-up document

`trazum rollup <document...> --json`. Several people's **profile documents**
merged into one bill — the only document here assembled from measurements this
machine did not take.

**It is a format and a merge, not a service.** Nothing is uploaded and there is
no account: the documents arrive however the team already moves files. What a
consumer has to get right is not the arithmetic but the refusals, because a
roll-up is the document most likely to be quoted with its caveats one screen
away.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. |
| `contributors` | One entry per merged contribution: `name`, `totalUsd`, `calls`, `span`, `spanDays`, and `gaps`. |
| `contributors[].claimed` | The window this contributor **asked for** — `sinceMs`/`untilMs`, half-open — or `null` when it filtered by none. A claim, not a measurement: `span` says what the records showed and this says what was gone looking for, and only the second can tell a quiet week from an export that stopped. |
| `contributors[].silence` | `runs` of contiguous days inside a fully bounded claim that recorded nothing, each with `from`, `to` and `days`, plus the total. **Named rather than interpolated**, the way a year report names its missing months. Null when there is nothing to measure against: no claim, one end only, or a claim too long to enumerate. |
| `contributors[].undatedExcluded` | Records the contributor's own window could not place, because they carried no clock. **Null when there was no window**, never 0 — zero would say a window excluded nothing. |
| `contributors[].gaps` | That contributor's own blind spots — `unreadable-lines`, `unpriced-calls`, `no-clock`, `partial-clock`, `no-sessions`, `no-labels`, `duplicate-lines` — each with a `detail`, and `usd`/`calls` that are **`null` where the kind has none**. Kept per contributor and never summed: "3% of this roll-up is unpriced" is the sentence that hides "one of your four machines is 90% unpriced". |
| `rejected` | Every contribution handed over and **not** merged, with `name` and `because`. A machine that contributed nothing must not read like a machine that spent nothing, so this is a field rather than an absence — and the command exits 1 when it is non-empty. |
| `identicalContributions` | `groups` of contribution names that were the same document, and the `usd` the repeats added. **Merged and stated, never discarded** — the rule a single profile already applies to duplicate lines. |
| `total`, `unpriced`, `unpricedModels` | Summed across contributors, with `unpricedModels` a union. Every numeric field of a breakdown is summed **except `maxCallInputTokens`, which is a maximum**: four machines' largest calls added together is a call that never happened, in the direction that makes a context window look tight. |
| `byLabel`, `byModel`, `byLabelAndModel` | Merged by key, largest bill first. |
| `spendByDay` | Per UTC day, oldest first, with `contributors` — how many contributed to that day — and `byModel`. |
| `spendByDay[].topLabel` | The day's dearest label, or **`null` when more than one contributor covered the day**, with `topLabelUsd` null beside it. The merged answer needs per-label-per-day spend no document carries, and the larger of two contributors' answers is wrong whenever a runner-up in both adds up to more than either winner. |
| `span` | Earliest start to latest end over contributors that carried a clock, with `calls` summed. Null when none did. |
| `claimedSpan` | Earliest claimed start to latest claimed end, over contributors that stated a fully bounded window, with how many did. **Kept apart from `span` deliberately** — one is what the records showed and the other what somebody went looking for, and merging them answers "what period does this cover" with a figure that is half measurement and half intention. |
| `fieldCoverage`, `outcomeTally`, `duplicateLines` | Summed. `duplicateLines` is **within-contributor** only — overlap *between* contributors is in `cannotSay` and is not a number. |
| `notMerged` | Findings that do not roll up, each with `finding`, `because`, and `presentIn` — the contributors that have one, so the reader knows where to go and look. Percentile shapes, conversation growth, repeated turns and truncation retries are all computed from individual calls, and a summary of a summary cannot reproduce them. |
| `cannotSay` | Typed caveats: `overlap-invisible`, `mismatched-spans`, `contributor-without-clock`, `day-top-label-unknown`, `identical-contributions`, `contribution-rejected`, `unknown-fields-dropped`, `no-claimed-period`, `silence-inside-a-claim`, `claim-not-bounded`, `claim-too-long-to-enumerate`. Part of the document, not a footnote in the terminal rendering. |

**Two of those are enforced, not merely documented.**
`trazum conform --contract roll-up` fails a roll-up of more than one contributor
whose `cannotSay` omits `overlap-invisible`, and fails one that rejected a
contribution and does not say so. Two people exporting the same traffic double
the bill and no merge of summaries can see it — a format that carried the fields
and lost that refusal would hand somebody a doubled total that looks audited.

**A claim longer than ten years is kept and not walked.** These documents come
from elsewhere, and a contribution claiming `untilMs: 1e15` is a malformed
document rather than a team with a long memory — enumerating it would be thirty
million iterations inside a merge somebody ran on four files. The claim survives
into the roll-up; only its silence goes unmeasured, with
`claim-too-long-to-enumerate` saying so.

**A field this version cannot classify is dropped and named**, in `cannotSay`
and again in `notMerged` with the field's name. A number added after this
roll-up was written may be a sum, a maximum or a ratio, and combining it the
wrong way is worse than leaving it out.

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
