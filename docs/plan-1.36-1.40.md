# The plan through 1.40 — delivered

**All five shipped, landing at 1.40.0.** This file is kept as it was written,
before the code, rather than rewritten in hindsight. It is history now, not a
forecast: nothing described below is still forthcoming. What the arc refused to
ship, and what it got wrong, is in [our own medicine](our-own-medicine.md).

Five releases, each large on purpose. The ordering is a commitment; the
calendar is not, and no dates appear here for the reason
[ROADMAP.md](../ROADMAP.md) gives.

Every item is judged against the same sentence the roadmap uses: *Trazum
reduces what an AI call costs without changing what the prompt asks for.* And
against the two rules that constrain everything — the deterministic core stays
free and offline, and a locale changes the report, never the optimisation.

## The arc

Through 1.35 Trazum built two halves that never meet.

**The estimating half** — `optimize`, `check`, `diff`, `rank` — reads prompt
files, counts tokens with a heuristic, and prices a saving using a call
volume, an average output size and a cache hit rate that *somebody typed into
a config file*. Every figure it produces is an estimate multiplied by a guess.

**The measuring half** — `profile` — reads usage logs and reports the
provider's own billed counts. Nothing it says is estimated. It knows exactly
how many calls that workload made, how long its answers ran, and what its
cache actually did.

The second half knows every number the first half is guessing. They have never
been introduced. That is the arc: **stop guessing what the log already
measured**, then scale the result up — from one prompt to a fleet, from a
finding to a plan, from a plan to a verified outcome, and from one report to a
history.

| Version | Theme | The sentence it earns |
| --- | --- | --- |
| 1.36.0 | The estimate stops guessing | What this prompt change is worth on *your* traffic, not on a typed guess. |
| 1.37.0 | The fleet | Twelve services, one rollup, and the one that is actually bleeding. |
| 1.38.0 | The plan | Not a list of findings — a ranked, costed, non-additive plan of what to do. |
| 1.39.0 | Did it work? | You made the change. The next log says whether the saving arrived. |
| 1.40.0 | The long run | Twenty reports, one series, and the drift no single comparison shows. |

Patch releases (`X.Y.1`, `X.Y.2`) sit between these whenever a batch is thin.
A minor is earned by findings that change what somebody can decide, not by a
date — and each of these five is scoped to be several such findings, not one.

---

## 1.36.0 — The estimate stops guessing

`optimize` says a prompt change saves `$47/month`. That figure is the token
delta (an estimate, ±10%) multiplied by `callsPerMonth`, `avgOutputTokens` and
`cacheHitRate` — three numbers a human typed, and the two most commonly typed
values are `1000` and whatever the README's example used. The log sitting next
to it in CI knows all three exactly.

- **`optimize --from-log <log> --label <label>`.** The usage block comes from
  measured traffic: the real call count over the period the log covers, the
  real average output size, the real cache read share, and the model the calls
  actually went to. What stays estimated is the token delta and only that —
  and every figure says which half it is, because "measured × estimated" and
  "estimated × guessed" are different claims about the same dollar sign.
- **No silent extrapolation.** The saving is stated over the period the log
  covers. A monthly figure appears only when the log covers enough days to
  make one without inventing a trend, and says how it was scaled; under that,
  the tool states the period figure and refuses the multiplication rather than
  performing it quietly.
- **`optimize --all-labels`.** Every label the config maps to a prompt file,
  optimised and priced against its own measured traffic, ranked by what the
  change is worth. The list a person actually wants: which prompt to edit
  first.
- **The reverse check, both directions.** A mapped prompt whose label has no
  traffic in the log is named (dead prompt, or a label that was renamed); a
  label carrying real spend with no prompt file mapped is named too (the
  workload nobody can optimise because nobody said where it lives).
- **The measured cache hit rate replaces the guessed one everywhere it
  appears**, including the caching advisories — an advisory that assumed 90%
  on a workload measuring 4% was arithmetic about somebody else's product.

## 1.37.0 — The fleet

`profile` reads a directory today and merges it into one bill. That is right
for one service and wrong for twelve: the merged report hides which service is
bleeding, and per-service budgets cannot exist at all.

- **`--by-source`: one report per source, plus the rollup.** Sources come from
  a config block naming globs, or from the directory layout. Each keeps its own
  totals, findings and levers; the rollup keeps the total and names the worst
  offender by share of the whole.
- **Gates per source, and a rollup gate.** `spend.bySource` gates each service
  against its own limit in the same run, and the run fails if any source fails
  — with the failing source named, not a total that hides which.
- **Cross-source findings that a merged bill cannot make**: the same workload
  label priced differently across services (one team on Opus, another on
  Haiku, same job), a model in use by one service and nowhere else, and cache
  economics that pay off in aggregate while losing money in three sources.
- **The rollup refuses to average what it cannot compare.** Sources whose logs
  cover different periods are named as such; a rollup over mismatched spans is
  a total, not a rate, and the copy says which.
- **CSV and JSON carry the source dimension**, so the spreadsheet somebody
  actually pivots on has the column it needs.

## 1.38.0 — The plan

The report names findings. A person then does arithmetic in their head to
decide what to do first — and does it by adding savings, which the levers
module has documented as wrong since it shipped.

- **`trazum plan <log>`**: a ranked list of actions, each with what it saves
  (computed, never summed), what it costs to do, what it requires that the log
  cannot confirm, and what it risks. Ordered by value, not by finding type.
- **Non-additive by construction.** Two actions on the same slice combine the
  way the arithmetic says they combine; two actions on different slices add
  cleanly. The plan states its own total honestly and shows which actions
  overlap.
- **What each action needs from a human** travels with it: "this assumes
  Haiku can do the work — measure it with `trazum route`", "this assumes these
  calls can wait 24 hours". A plan that hides its assumptions is advice
  pretending to be arithmetic.
- **The plan is a file**, in the repository, in JSON and markdown. That is what
  makes 1.39.0 possible at all.
- **`--effort`**: only actions above a saving threshold, or only ones needing
  no human judgement — because the plan a person will actually execute this
  week is shorter than the complete one.

## 1.39.0 — Did it work?

Every optimisation tool tells you what you *would* save. Almost none tell you
what you *did*. This is the release that makes Trazum accountable to its own
predictions.

- **`trazum verify <plan.json> --against <newer.jsonl>`**: for each action in
  a saved plan, what it predicted and what the newer log actually shows.
- **Three outcomes, never two**: the saving arrived, the saving did not
  arrive, or *it cannot be told* — because the traffic changed, the workload
  vanished, or the field the prediction depended on stopped being recorded.
  The third is the honest one and the one every other tool renders as the
  first.
- **The difference is attributed, not just stated.** A predicted $40 that
  became $12 is decomposed into what the prediction got wrong (the token delta
  estimate) and what the world did (calls doubled, the mix moved, output grew).
- **Predictions are dated and versioned.** A plan made against a 1.36.0
  catalogue and verified after a provider price change says so — the tool must
  not blame a team for a saving that arithmetic revoked.
- **The verification is gateable.** A CI step can fail when a change a team
  committed to did not produce what it promised, which is a different and more
  useful gate than "spend went up".

## 1.40.0 — The long run

Every comparison in Trazum is between two logs. A product's cost problem is
rarely visible in two — it is visible in twenty.

- **`trazum history <dir>`**: many reports over many periods, as one series.
  Spend per period, per label, per model, with the shape of the change stated
  rather than a line fitted through it.
- **Regressions no pairwise comparison finds**: a workload that grew 4% every
  week for eleven weeks, a model share that has been climbing since a date, a
  cache hit rate decaying slowly enough that no single week's report called it
  a finding.
- **Still no forecasts.** Twenty points make a trend visible; they do not make
  next month knowable. The series is stated, the shape is named, and where it
  goes next remains the reader's to judge — the same refusal `modelMixDrift`
  has carried since 1.27.
- **The history is derived from stored reports**, not re-parsed logs, so a
  team can keep a year of `--json` output and throw the raw logs away — which
  is what the privacy story requires anyway.
- **Waivers and plans get their history too**: a finding waived three times in
  a row is a decision nobody is revisiting, and the tool should say so.

---

## The rule that constrains all five

Every one of these releases makes Trazum say more. None of them may make it
say more than it knows. A measured figure and an estimated one never merge
into a single number without the report stating which half is which; a
prediction that cannot be checked is reported as uncheckable rather than as
met; and no series, however long, becomes a forecast.
