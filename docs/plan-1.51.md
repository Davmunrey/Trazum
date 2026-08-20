# The plan through 1.51 — delivered

**All ten shipped — nine patches and the minor — landing at 1.51.0.** This
file is kept as it was written, before the code, rather than rewritten in
hindsight. It is history now, not a forecast: nothing described below is still
forthcoming. What the arc refused to ship, and what it got wrong, is in [our own
medicine](our-own-medicine.md).

Ten releases, one arc, following the one through
[1.50](plan-1.41-1.50.md). The ordering is a commitment; the calendar is not,
and no dates appear here for the reason [ROADMAP.md](../ROADMAP.md) gives.

**Nine of them are patches and the tenth is the minor.** Since 1.50.1 the
version number carries the narrative: a chapter of an arc in progress is a
patch, and the minor is spent only on the release that lands the thesis. So
this arc runs as `1.50.x` and finishes at **1.51.0** — which is not "the
release after the last patch" but the one where the story ends. See
[VERSIONING.md](../VERSIONING.md#what-the-three-numbers-mean-here), including
what that costs somebody pinning with a tilde.

**The table below deliberately does not pin a patch number to each chapter.**
The first draft did, and 1.50.1 and 1.50.2 both arrived without being in it —
the numbering itself, and a way for people to report what is wrong. Work that
is not in a plan is not a failure of the plan; a plan that pretends otherwise
just goes stale on contact. The **order** is the commitment.

Every item is judged against the same sentence the roadmap uses: *Trazum
reduces what an AI call costs without changing what the prompt asks for.* And
against the rules that have constrained every arc — the deterministic core
stays free and offline, a locale changes the report never the optimisation,
and nothing may say more than it knows.

## The arc

By 1.50 Trazum is connected, continuous, consulted by agents, and standard.
It also has, in every figure it prints, **a denominator with no numerator.**

`profile` says the support workload cost $4,180 last month. `plan` says
routing it saves $1,600. `verify` says the saving arrived. Not one of those
sentences knows whether a single customer was helped. Trazum can tell you that
a workload got 40% cheaper and cannot tell you that it stopped working — and
the cheapest possible AI product is one that answers nothing at all.

This is not a gap in the reporting. It is the reason the advice has a ceiling.
"Route this to a cheaper model" has been, since 1.23, an arithmetic claim with
a quality question attached that only a human could answer, and `route`
measures agreement with the old answers rather than whether either answer was
any good. Agreement is not correctness; the product has said so in its own
output for eighteen releases without being able to do better.

Two things change that, and they arrive in the first two releases of this arc.
**A gateway** puts Trazum in the path of the call, where it can measure
perfectly and refuse rather than advise. **An outcome signal** — recorded by
the caller, never inferred — gives every figure a numerator at last.

That is the arc: **from what it cost to what it bought, and from advice to
enforcement.** Cost per resolved outcome, the escalation ladder that only
becomes safe once failure is measured, experiments with honest statistics,
quality gates in CI, and finally the semantic findings the rules engine has
deferred since 0.1.0 because it could not check them.

| # | Theme | The sentence it earns |
| --- | --- | --- |
| 1 | The gateway | Measured at the source, and able to say no — never to say something else. |
| 2 | The outcome | What the money bought, recorded by you and never inferred. |
| 3 | Cost per outcome | Every figure gets its numerator: dollars per resolved thing. |
| 4 | The ladder | Cheap first, escalate on measured failure, priced with the double spend. |
| 5 | The experiment | Two prompts, real traffic, and a winner only when there is one. |
| 6 | The quality gate | CI fails when a change moved outcomes, not just tokens. |
| 7 | The semantic pass | The findings a dictionary cannot make, each checked before you see it. |
| 8 | Whose money | Chargeback across teams, with the unallocated named loudly. |
| 9 | The commitment | What a committed-use deal would have been worth on measured traffic. |
| **10 — 1.51.0** | The record | A year of this product's own arithmetic, and the doctrine that survived it. |

There is no rule about how many chapters an arc has. There is a rule that the
minor is not spent on anything less than a finished story, and that each
chapter is earned by findings that change what somebody can decide rather than
by a date.

---

## Chapter 1 — The gateway

1.44 gave a local service that *answers* questions and 1.45 gave agents a
guard they may consult and ignore. Advice an implementation can skip is advice
a budget cannot rely on — and a connector that pulls usage after the fact
always reports the runaway after it ran.

- **`trazum gateway`**: an opt-in local proxy in front of the provider,
  speaking the provider's own wire format so no SDK changes. Usage is measured
  at the moment of the call — no export, no connector lag, no missing day.
- **It refuses; it does not substitute.** A call over budget is rejected with
  a machine-readable reason and the cheaper alternative named. Silently
  swapping the model, trimming the prompt, or downgrading a request in flight
  is the one behaviour this product must never have: the caller asked for
  something specific, and a proxy that quietly answers a different question is
  worse than one that fails.
- **Substitution exists only as a configured, logged decision** — never a
  default, never inferred — and every substituted call is marked in the store
  so no later report treats it as the call the caller made.
- **Failure is a decision the operator makes in advance**: fail-open (bill
  keeps flowing, alert fires) or fail-closed (calls stop). Both are defensible
  and the product refuses to pick one silently for you.
- **Nothing about the payload is stored.** Prompt and completion pass through
  and are not written down — the store's contents have been aggregates since
  1.42 and being in the path changes nothing about that promise.

## Chapter 2 — The outcome

Every finding in this product is a cost with no counterpart. The missing field
is not something Trazum can compute: it is something only the caller knows.

- **An `outcome` field on the usage record** — resolved, escalated, retried by
  the user, thumbs-down, whatever the product's own vocabulary is — recorded
  by the caller, in the log or through the gateway, exactly as `label` and
  `session` were adopted.
- **Never inferred.** No absence of complaint counts as success; no short
  conversation counts as resolution; no retry counts as failure on its own.
  The report says "no outcome recorded" and names what recording one would
  unlock — the `fieldCoverage` discipline from 1.19, applied to the question
  that matters most.
- **Outcome vocabularies are declared, not guessed**: the config names the
  values and which of them count as success, because a tool that decides
  `escalated` is a failure has just made a product judgement it has no
  standing to make.
- **The privacy line does not move.** An outcome is a small enumerated value,
  and the store keeps it the way it keeps everything: aggregated, never
  alongside content.

## Chapter 3 — Cost per outcome

With a numerator recorded, every figure in the product can finally be divided
— and a whole class of finding becomes possible that no cost total can show.

- **Dollars per resolved outcome**, per label, per model, per source, per
  period — through `profile`, the fleet, `plan`, `verify` and `history`, using
  the machinery each of those already has.
- **The finding a total cannot make**: the workload that got 30% cheaper and
  40% worse, the model that costs less per call and more per resolution, the
  prompt whose shortening moved the answers. Cheaper-per-call and
  cheaper-per-outcome are different rankings and the product will print both
  rather than pick.
- **A rate with too few outcomes is not a rate.** Below a floor of recorded
  outcomes the figure is withheld and the count is shown instead — the same
  refusal `route` makes about small case sets and `history` makes about short
  runs.
- **Slices with partial coverage say so.** Half the calls carrying an outcome
  makes a ratio over an unknown denominator; the report states the coverage
  beside the rate or does not print the rate.

## Chapter 4 — The ladder

"Route it to the cheaper model" has been a recommendation with a quality
question attached since 1.23. With the gateway in the path and outcomes
recorded, it becomes an executable policy that measures its own damage.

- **Cheap first, escalate on measured failure**: a per-label ladder the
  gateway executes — the small model answers, and a recorded failure signal
  sends the same work up a tier.
- **Priced with the double spend, honestly.** An escalation pays twice, and
  the arithmetic states the break-even escalation rate: below it the ladder
  saves money, above it the ladder *costs* money, and the measured rate says
  which side you are on. A ladder sold as a saving without that number is the
  same head-arithmetic error `plan` was built to kill.
- **The escalation signal is the caller's**, never inferred from length,
  latency or refusal text. No signal, no ladder — the product declines to
  build a control loop on a guess.
- **It is reversible in one flag and one line of config**, and the store keeps
  the before and after so `verify` can judge the ladder the same way it judges
  every other prediction: arrived, did not arrive, or cannot be told.

## Chapter 5 — The experiment

`eval` compares two prompts on cases you wrote; `route` compares two models on
the same. Both measure agreement in a laboratory. The traffic is the only
place the real question gets answered.

- **`trazum experiment`**: two prompts (or two models, or two ladders) split
  across real traffic through the gateway, judged on recorded outcomes and
  cost together.
- **A winner only when there is one.** The verdict is three-valued the way
  `verify` is: A wins, B wins, or *not separable on this traffic* — with the
  number of outcomes that would separate them stated, so "run it longer" is a
  quantified instruction rather than a shrug.
- **The statistics are shown, not asserted.** Interval, sample size, the
  variance the metric already has — the same discipline `eval` established by
  running the original twice before judging anything against it.
- **Peeking is refused by design**: the stopping rule is declared before the
  experiment starts and the report says whether it was honoured, because a
  test stopped the first afternoon it looked good is a coin flip with a
  dashboard.
- **Nothing is auto-promoted.** The winner is a finding; taking it is a
  decision with a name attached, and it lands in the plan like everything
  else.

## Chapter 6 — The quality gate

CI has been able to fail a build for tokens since 1.4 and for dollars since
1.21. The failure that actually matters — a prompt edit that quietly made the
product worse — has never been gateable.

- **`check --against-outcomes`**: a gate that fails when a merged prompt
  change is followed by a measured drop in the outcome rate for that label,
  with the confidence and the window stated.
- **A gate that says why it cannot judge yet.** Not enough outcomes since the
  change, traffic that moved, a model swapped underneath — all `cannot tell`,
  and `cannot tell` does not pass silently; it holds the claim open and says
  what would settle it, exactly as `verify --gate` does.
- **Attribution is stated, never assumed.** A drop that coincides with a
  deploy of something else is a coincidence the tool cannot resolve, and it
  says so instead of blaming the prompt because the prompt is the thing it
  can see.
- **The pull request gets the sentence teams actually argue about**: this
  change saves $220 a month and moved the resolution rate from 71% to 64% on
  8,400 measured outcomes. Both halves, both provenances, one comment.

## Chapter 7 — The semantic pass

The rules engine has deferred the same findings since 0.1.0 for one honest
reason: a dictionary cannot see meaning, and a model that hallucinates a
finding is worse than a rule that misses one. Everything this arc built —
outcomes, experiments, a way to check — makes the check possible at last.

- **Paraphrase-level findings**: two few-shot examples teaching the same
  boundary in different words, an instruction restated in a distant paragraph,
  a policy contradicted by a later clarification — the cases the near-copy
  detector deliberately does not flag.
- **Every proposal is verified before it is shown**, the discipline `--suggest`
  has had since 1.6: a finding that does not survive a check against the
  prompt itself never reaches the reader. The model proposes; the deterministic
  layer disposes.
- **It stays opt-in and offline-degradable.** The core keeps working with no
  key, no network and no model — this is a pass on top, never a prerequisite,
  and the rule from 0.1.0 stands unchanged.
- **What it costs to run is printed before it runs**, because a tool that
  spends your money to tell you how to spend less must be the first thing
  audited by its own arithmetic.

## Chapter 8 — Whose money

The fleet answered *which service*. Nobody has yet answered *whose budget*,
which is the question that decides whether anything on this list gets done.

- **Chargeback and allocation**: measured spend attributed to teams, products
  or cost centres by the same most-specific-pattern rule sources use, with
  per-owner budgets, per-owner reports and per-owner gates.
- **The unallocated is named loudly and never spread.** Splitting unattributed
  spend proportionally is the single most common lie in cost reporting: it
  makes every team's number wrong in a way that looks tidy. Trazum shows the
  unallocated as its own line until somebody claims it.
- **Shared cost is declared, not invented**: a workload two teams use is split
  by a rule a human wrote down, and the rule travels with the report so the
  argument is about the rule rather than about the number.
- **An owner with no measured data is not an owner under budget** — the
  `fleetBudgetMissing` refusal from 1.37, applied to people.

## Chapter 9 — The commitment

Providers sell committed-use and reserved-capacity deals. Every team that
signs one is doing arithmetic in a spreadsheet against a number they guessed,
which is exactly the failure mode this product exists to end.

- **What a commitment would have been worth on *measured* traffic**: the last
  N months replayed against the deal's terms, with the break-even utilisation
  and the shortfall risk stated as measured variance rather than a projection.
- **It is an as-if calculation, not a forecast, and the wording never blurs
  it.** "On the traffic you actually had, this commitment would have saved
  $X" is a measurement of the past; "you will save $X" is a claim about the
  future this product has refused at every scale since 1.27.
- **The refusal that matters**: too little history, or history too unlike a
  commitment period, and the answer is that this cannot be judged from what
  exists — with how much history would settle it.
- **Both directions priced.** A commitment is a floor as well as a discount;
  the months the traffic would have fallen short are shown with what the
  unused floor would have cost, because a saving quoted without its downside
  is the sales pitch, not the analysis.

## Chapter 10 — The record, and the minor

Sixty minor releases of a product whose entire argument is that it refuses to
flatter. The last release of the arc turns that argument into something a
stranger can audit.

- **The annual record**: `trazum report --year` — everything measured, what
  was planned, what arrived, what did not, and what could not be told, from
  the store and the plans a team already keeps. One document, no new data.
- **Its own medicine, in public**: this repository's own cost figures, its own
  predictions and its own misses, published the way it asks its users to
  publish theirs. A tool that gates other people's promises and never shows
  its own is a tool with a double standard.
- **The doctrine, second edition**: the rules from three arcs in one document
  — measured never merges with estimated, not-recorded is not not-happened,
  three outcomes never two, no series becomes a forecast, a credential is
  borrowed never held, nothing continuous invents a number, an agent gets the
  provenance too, and cheaper-per-call is not cheaper-per-outcome.
- **The conformance suite grows an outcome chapter**, so another tool emitting
  this format has to handle a missing numerator the same way — the standard is
  only worth something if its refusals travel with it.

---

## The rules that constrain all ten

This arc puts Trazum in the path of the call and gives it an opinion about
quality. Both are new ways to do harm, and two rules join the doctrine.

1. **A proxy refuses; it never answers something else.** Substitution is a
   configured, logged decision or it does not happen. The caller's request is
   theirs.
2. **Quality is recorded, never inferred.** Trazum does not decide what
   success means, does not read it from silence, and does not print a rate
   whose denominator it cannot see.

And the two that predate everything and constrain this arc hardest, because a
numerator makes them easy to break: *a measured figure and an estimated one
never merge into a single number without saying which half is which*, and
*cheaper is not better — the product prints both rankings and picks neither.*
