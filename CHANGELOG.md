# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

`Unreleased` holds what is merged into `main` but not yet tagged. A change that
alters nothing installable — a test, a document — still lands there rather than
nowhere: the changelog is the record of what happened to this repository, and a
merged commit with no entry is a change only `git log` remembers.


## Unreleased

### Added

**A gate says when its figure is a floor.** A gate can only judge the money
it can see, and three things hide spend from it: unreadable lines, models the
price table does not know, and clockless calls dropped by a time window. When
any of them is present the gates now say so beside the verdict — a pass means
"the part I could read fits", never "the bill fits". Silent passes on partial
data were the flattering omission still left in the money gates.

**`--against` warns when the two logs cover the same days.** Comparing
overlapping periods puts the same calls on both sides of the subtraction, so
part of the reported growth is the same money counted twice. Warned between
the totals line and the drivers built from it, and only when both logs carry
a clock — unknown stays silent rather than reassuring.

**The comparison reaches `--markdown-out`.** The section the terminal has had
since 1.11: totals with the sign convention, the overlap warning, drivers per
label and per model, and a previous log with nothing priced reported as its
own answer. A CI summary that compared two logs was showing only one of them.

## 1.16.0 — "The worst case, on the record"

### Added

**The day series reaches the markdown.** The spend-per-day table the peak
sentence summarises — day, exact dollars, calls, and the biggest label of the
day — for the CI summary and PR comment readers who want to see the week.
Capped at the most recent 14 days with the earlier ones counted out loud
(silent truncation reads as "covered everything"), absent for a single day
because one row is the total again, and the full series still rides `--json`
as `spendByDay`.

**The price table's age, said out loud when it matters.** Every dollar a
profile prints uses the bundled price table, and the one fact that silently
invalidates all of them is a table the provider has re-priced since. Past 45
days — the threshold is in the sentence — the terminal, the markdown, the MCP
and the web all say so loudly: the review date, the age, and that the report
is wrong by exactly whatever changed, with `--pricing-live` as the fix.
`--json` carries `pricing.lastReviewed`/`pricing.ageDays` always, as
provenance. The tests pin the rule rather than the calendar: whether the line
appears is derived from the table's own date at run time, so a freshly
reviewed table asserts the opposite behaviour and passes the same suite.

**`--max-cache-loss-usd`, the third money gate — and it reads the worst case
on purpose.** Exit 1 when caching added more than the limit to the bill. When
the log did not record which write TTL was paid, the settled figure and the
1-hour worst case can straddle the limit, and a gate reading the flattering
half would pass exactly the bills it exists to catch — so the gate reads the
ceiling and its failure message says which claim fired: a settled loss
(exact, the same tokens at the published input rate), or a ceiling only the
missing `cache_creation` field can settle. Fires under `--json` too; wired
into the Action as `max-cache-loss-usd` and self-tested in CI on a +$1.25
loss ($6.25 of 5-minute writes nothing reads back, against $5.00 as plain
input). The read-the-worst-case guard is mutation-tested.

## 1.15.0 — "The same answer on every surface"

### Added

**The comparison is computed once, and reaches the MCP.** `driversBetween`
moves to `@trazum/core` — one implementation of the union-and-subtract whose
sign convention (positive means the bill grew) has flipped once already when
restated by hand — and the CLI, the web and now the MCP all import it. The
MCP's `profile_usage` gains `previous_log`: totals with the convention stated
first, drivers per label and per model with appeared and vanished workloads
named, `label`/`since`/`until` filtering both logs so the comparison stays one
workload and one period, and a previous log with nothing priced reported as
its own answer rather than zero growth. The web comparison gains the same
by-model split the CLI got, from the same shared code.

**The window reaches the browser.** Two date fields on the web Bill tab —
`--since`/`--until` under the CLI's exact rules: a bare date is that whole UTC
day, the same window applies to both logs of a comparison, clockless calls
are excluded and counted out loud, and the CLI's refusals are kept in step (a
window matching nothing names what the log covers instead of rendering a $0
report; a clockless log cannot be windowed; a window that starts after it
ends is an error). Verified in a real browser: $11.00 → $1.00 when windowed
to the cheap day, the refusal naming the span, clearing restoring the whole
log, zero network requests throughout.

**The change by model — where the mix moved.** A workload that keeps its name
and switches from Haiku to Opus reads as "chat grew" in the per-label drivers,
and the reason is the model. `--against` now splits the same change by model —
appeared and vanished models named, one model on both sides deliberately
silent because it would restate the totals line — and both driver sets ride
`--json` as `against.byLabel` / `against.byModel`, computed once beside the
gates so no rendering derives its own.

**The drill-downs reach the GitHub Action.** `label`, `since` and `until`
inputs on the spend gate — one workload's budget, or one period's, in a
workflow. The CLI owns the honesty rules, so a label or window matching
nothing fails the run naming what exists, and clockless calls under a window
are counted out loud in the report. Self-tested in CI with the same hand
arithmetic as the gates: a $5.00 workload passes a $9 budget the $15.00 log
would fail, one day passes it, the dear day fails it, and a window the log
does not cover is refused rather than passing a $0 gate.

## 1.14.0 — "Drill-downs and drive-bys"

### Added

**The window and the ledger reach every rendering.** `--markdown-out` states
the window as the user typed it — rendering the internal exclusive bound would
print the next day and disagree with the terminal — with the undated count as
a loud blockquote, and carries the never-came-back claims with the same
fact/ceiling split, decided by the slice's own reads. The MCP's
`profile_usage` gains `since`/`until` under the CLI's rules (a window matching
nothing is an error naming what the log covers; clockless calls counted out
loud) and speaks both single-turn claims. The web Bill tab renders them in the
cache card, loud only when the slice read nothing.

**Cache writes by conversations that never came back.** A one-turn session
pays the write premium for reuse its own conversation never makes, and it
hides inside healthy totals: long sessions' reads pay for the cache overall
while every drive-by bleeds. `singleTurnCacheWrites` names the slices, prices
those writes at the bill's own rates, and the rendering makes the honesty
split the provider's prefix-keyed cache forces: with cache reads anywhere in
the slice the figure is a **ceiling named as one** — another conversation
sharing the prefix may have read the write, and the log cannot see whose
write a read hit — and with zero reads the ceiling collapses into a loud
fact: those writes bought nothing. Session keys group turns and are never
printed, as everywhere. The guard is mutation-tested and every dollar is hand
arithmetic.

**`profile --since` / `--until`, the drill-down in time.** A UTC day or a full
ISO 8601 timestamp; a bare `--until` date includes that whole day, because a
window that excludes the day it names is a trap sprung on everyone who reads
dates the way humans do. Internally half-open `[since, until)`, so adjacent
windows share no record. The honesty rules carry the feature: a call with no
`ts` cannot be placed inside or outside a window, so it is excluded and
**counted out loud** — the window's figures are a floor on the period, and the
report says so; a window matching nothing is an error naming what the log does
cover, never a $0 report that would pass a `--max-usd` gate over a period the
log does not contain; a window over a clockless log is an error for the
`--max-growth-usd`-without-`--against` reason. With `--against`, both logs get
the same window, and the gates gate the window — profile yesterday against the
day before, with a budget, in one line of CI.

## 1.13.0 — "The bill learns to say no"

### Added

**The most expensive day, and the bill as a CI gate.** `spendByDay` buckets
exact per-record dollars per UTC day — the delta each record adds to the total,
so the day arithmetic can never drift from the bill's — with the top label
attached. The report names the peak day against the **median** day (a mean
would let the spike inflate its own yardstick), loud only past twice it. And
`--max-usd` exits 1 when the log spent more than its budget, `--max-growth-usd`
(with `--against`) when the bill grew past the limit — no period assumed, both
firing under `--json` because CI reads the exit code there. Alone,
`--max-growth-usd` is an error rather than a flag that silently gates nothing.

**The clock reaches every rendering.** `--markdown-out` gains the span line,
the peak day and the TTL verdicts with the failing ones loud; the gap, day and
median helpers live once, shared by both renderings, so they cannot drift. The
web Bill tab draws spend per day — a bar per UTC day, divs rather than a chart
library, the peak bar in the warning colour — verified in a real browser.

**The ceilings a max_tokens cap actually wants.** `OutputShape` gains
`medianWithinTokens` and `p95WithinTokens`: the bucket ceiling at least half
and 95% of the measured answers fit within. Exact over the histogram, `null`
for the open-ended last bucket rather than an invented ceiling, and said in one
line per slice: measured on these calls, promised for nothing.

**`profile --label`, the drill-down.** Once the full report has named a
suspect, the same command profiles that workload alone — every section, the
gates included, over one label's calls. A label that matches nothing is an
error naming the labels that exist, never a silent report over zero calls that
would read as "this workload is free". With `--against`, both logs are
filtered, so the comparison stays one workload.

**The spend gate, packaged into the GitHub Action.** Hand the action a
`usage-log` instead of a `target` and it runs `profile` with `max-usd`,
`against` and `max-growth-usd` — the money gates in a workflow, with the report
in the run summary and a failing gate still writing it. The two modes are
mutually exclusive: one run gates tokens before the money is spent or the
spend itself, and folding both verdicts into one exit code would leave nobody
knowing which gate fired. Self-tested in CI with hand-checkable arithmetic: a
$5.00 log passes a $9 budget, a $15.00 log fails it, +$10.00 growth fails a $5
limit, and naming both modes at once is refused.

**The comparison reaches the browser, and the drill-down reaches the MCP.**
The web Bill tab takes a second usage log and renders "against the previous
log" — the sign convention stated before the first figure, drivers derived over
the union of labels so appeared and vanished workloads are named, and a
previous log with nothing priced reported as its own answer rather than zero
growth. Verified in a real browser with exact arithmetic and zero network
requests. `profile_usage` on the MCP gains the optional `label`, with the
drill-down's rule riding along; the web output shapes gain the max_tokens
ceilings.

## 1.12.0 — "The log gets a clock"

### Added

**A `ts` field on the usage record, and the two findings only a clock can make.**
ISO 8601, epoch seconds or milliseconds, or OpenAI's `created`; parsed under the
same three-state rule as the counts — absent is null, present-and-unreadable
rejects the line into `skippedLines`, because a silently dropped timestamp would
mis-measure every gap it touches.

**The span.** The report states what period the log covers — `This log covers
2026-08-01 → 2026-08-14 (13.0 days)` — and deliberately stops there. Stated,
never extrapolated: the span makes the reader's own monthly arithmetic valid,
while a per-month figure from a partial month would be Trazum doing the guessing
it exists to end. Partial coverage is said in the same breath, and a test asserts
the span alone conjures no monthly figure anywhere.

**Does the cache TTL fit how fast the turns come?** A cache entry lives 5
minutes, or an hour at 2x the write price, and whether either fits depends on a
number the bill never shows: how long the workload waits between turns. Measured
as the median gap between consecutive turns of the same conversation, sorted by
the recorded clock so the answer is independent of the order of the log. Five
states: **expires before reuse** — the mechanism behind a losing cache, with
both honest ways out named; **overlong TTL** — turns seconds apart paying 2x for
an hour of endurance they never use, priced exactly as the same tokens at the
other published rate; **unsettled** when the unrecorded TTL decides it; **fits**
said out loud; and **could not be measured** over writes with no clock, rather
than silence. Rendered in the CLI (both locales), the MCP `profile_usage` tool
and the web Bill tab; `--json` carries `span` and `cacheTtlFit`.

The recording recipe gains `ts` in the README, the onboarding message and the
docs-pinned fixture, so following the documented recipe still produces a report
that asks for nothing more.

## 1.11.0 — "What actually moves the bill"

### Added

**`profile_usage` on the MCP server: an agent can read the bill.** The fourth
tool, and the surface's first with exact figures — they are the provider's own
billed counts, not ±10% estimates. The log is passed as text, never a path, so
the no-paths security design holds; the TTL-unsettled cache verdict, the levers
with the prompt ceiling named as a ceiling, all three truncation states and the
gaps carry over from the CLI; and a test feeds a customer-named session key
through three turns to assert no fragment of it comes back out.

**"Your bill" in the web app: the profile report, read where it was pasted.**
Drop or paste a usage log and the whole report renders — parsed entirely in the
browser against the bundled catalogue. Nothing is uploaded: there is no fetch in
the component, a source test fails if one appears, and the one analytics event
carries two booleans. Verified live by driving the built page in a browser and
counting network requests during analysis: zero.

### Fixed

**The web lever line glued the slice's spend to the saving's share.** "up to
$0.4669 (72%)" against a by-label table calling the same slice 100% of the bill
— `shareOfBill` describes the combined saving, and the render passed `spentUsd`
beside it. Caught on a screenshot, not by any source assertion; it now carries
`combinedUsd` as the CLI always has, and a test pins which field feeds which
line. The same screenshot surfaced "1 calls are not in these totals": every
counted web message now takes its count as a number and conjugates the singular
in both locales, pinned by a test that walks all seven counted messages in both
catalogues.


### Added

**The cache loop, closed: `labels` in the config maps a usage-log label to its
prompt file, and `profile` reads the file and says why a failing cache fails.**

The report could say "caching loses money on `support-rag`" and nothing more —
the log carries counts, not content. With the map it names the reason: a stable
prefix under the model's cache minimum (writes that can never become reads),
stable tokens stranded behind the first placeholder (`--reorder` moves them), or
a healthy file whose problem is byte-identity between calls. A mapped file that
does not exist is said out loud rather than skipped.

Every sentence carries *"as it is today — the log may predate it"*: the file is
whatever the repository holds now, which may not be what produced the log, and a
fresh file presented as the history's explanation would be a figure attributed to
something it does not describe.


### Added

**`profile` prices the answers that were cut off.** With `stop_reason`
(Anthropic) or `finish_reason` (OpenAI) in the log — the API returns both beside
`usage` — the report names the one category of a bill that is waste without a
counterpart: answers that hit the `max_tokens` ceiling were paid in full, are
frequently retried and billed again, and the truncated attempt bought nothing.
Three states, kept apart: waste found, none found on a log that measured, and a
log that never recorded a stop reason — which gets the missing-field message,
because silence there reads as a clean bill of health on a question the log
never asked.

**`profile --against <previous.jsonl>` — the bill as a watched metric.** Nobody
adds five thousand a month in one day; bills grow four percent a week while
every snapshot looks reasonable. The comparison prints the delta with the diff
convention — positive means the bill grew — and ranks the drivers by their
contribution to the change, not by bill size, because the second-biggest
workload can be the whole story of the growth. Appeared and vanished workloads
are named. No period is assumed: the call counts print beside the money so the
reader judges comparability first.

**`profile --markdown-out <file>`** writes the report as GitHub-flavoured
markdown for a job summary or a PR comment, rendered from the same message
catalogue as the terminal — two renderings of one finding drift the moment they
are worded twice, and the sign conventions here have each already produced a bug
when restated by hand.


### Fixed

**Cache billing noise was reported as conversation growth.** Found by adversarial
review, against a fix made the same day: the growth baseline was the cheapest
turn's billed *cost*, and per-turn cost varies with the cache multiplier even when
the input never grows — an identical 10,000-token turn costs 12.5x more as a cache
write than as a cache read. An ordinary 5-minute-TTL agent whose conversation
stayed completely flat reported **77.5% of its bill as "conversation growth"** and
was told to trim history that was not there, while the report's own min/max token
figures proved the claim false on the same screen. Growth is measured in
**tokens** now — exact, order-independent, immune to billing rates — and the
dollars are that token share of what the session actually spent.

**A numeric session id was dropped and then denied.** `session: 12345` — an
auto-incremented conversation id, which is what half the databases in existence
produce — was silently ignored by the string-only reader, and the report printed
"No call in this log carried a session": a false claim about a log that carried
one on every line. Finite numbers are identifiers now, for `label` and `session`
both; booleans and objects stay out, because `session: true` names nothing.

**`route --label` with a misspelt label asserted a verdict about calls it never
selected.** The fall-through answer was "no route on this log clears 1% of the
bill: these calls are already on the cheapest model of their family" — two
falsehoods at once when the log had a 60% route under a different name. A label
nothing carries now gets the typo answer: the labels that exist.


### Fixed

**A workload literally named `unlabelled` merged into the missing-label bucket.**
The sentinel was the string `'unlabelled'`, so 200 calls somebody had given that
name and 200 calls with no label at all reported as one row of 400 — a figure
attributed to something it does not describe — and the "none of these calls
carried a label" logic could fire over a log where half of them had. The sentinel
is the empty string now, the one value a parsed label can never be; the terminal
shows the missing bucket as `(no label)` so the two cannot read identically
either.

**A label containing a newline corrupted the structured keys.** Labels are half of
keys that split on `\n` — `byLabelAndModel`, the conversation tracker, the
output-shape tracker — so `label: "rag\nclaude-haiku-4-5"` truncated the label to
`rag` and mangled the model half. Whitespace inside a label is normalised to a
single space at the parse boundary, protecting every consumer at once.


### Fixed

**The conversation measurement depended on the order of the log.** Growth was
anchored on the first record seen per session — a fact about the log's ordering,
not about the conversation. The identical workload exported newest-first, an
ordinary shape for a warehouse export, computed a *negative* growth and the whole
section silently vanished: the largest line on an agent bill, gone because
somebody's log was sorted the other way.

The anchor is the **cheapest turn** now, which is order-independent, equals the
opening turn on any genuinely growing conversation, and keeps the figure an exact
ceiling — no truncation strategy can pay less than the cheapest turn per turn. A
test runs the same workload forward, reversed and re-sorted and requires identical
results up to floating-point associativity.

The wording followed: *smallest turn* and *largest turn*, never *opening* and
*closing*, because the report must not claim an order it cannot know. For the same
reason a shrinking conversation and its growing mirror — literally
indistinguishable once order is unknown — now produce the same report, which
replaces a test that demanded the impossible. `ConversationGrowth` renames
`firstTurnTokens`/`lastTurnTokens` to `minTurnTokens`/`maxTurnTokens` (unreleased
API).


### Fixed

**`profile --json` omitted the levers.** The flagship section — "What would
actually move this bill", the reason the command exists — was terminal-only, so
any pipeline, dashboard or CI step reading the JSON never saw it. A finding the
machine-readable output omits is a finding the reader's tooling will never
surface. The JSON now carries `levers` beside the cache verdict, the
conversations and the output shapes, and a test asserts every section the
terminal renders has a machine-readable counterpart.


### Added

**`trazum profile` now says where the output spend concentrates** — the actionable
half of "output dominates", which was the biggest line on the measured bill (87%)
and the one the report could only state as a total.

Two bills with identical output spend want opposite responses, and only the shape
tells them apart:

```
  chat on Claude Opus 5: 5.9% of calls hold 71.5% of the output spend — the
  ones answering with more than 8,000 tokens, out of $33.01 of output on
  this slice.
  That is a tail, and a tail has a cause: a path through the prompt that
  invites an essay, a call with no max_tokens, a retrieval that returned a
  book. Finding it is a morning; it is not "make everything shorter".
```

against:

```
  summaries on Claude Opus 5: the output spend sits where the calls are —
  100.0% of them hold 100.0% of $45.00. There is no tail to hunt.
```

The figure is **the smallest group of calls holding at least half the output
spend** — a median over money rather than a threshold somebody picked, found by
walking the distribution down from the longest answers. "At least half" is meant
literally: the walk stops on a bucket boundary, and claiming exactly half would be
a precision the histogram does not have. The threshold named is always a bucket
edge, so "calls answering with more than N tokens" is exact.

Counted in fixed buckets in the pass `profileUsage` already makes — 64-token
resolution where answers actually land, coarser in the tail — so memory is bounded
by slices × touched buckets, not by the log. Per label **and** model, because a
distribution mixed across two prices describes neither. `outputShapes` and
`createOutputShapeTracker` are exported from `@trazum/core`.



### Fixed

**`1 calls`, and `1 llamadas` in Spanish.** Reachable on ordinary input — a
one-call log, a label covering one call, a slice of one — on the totals line, the
breakdown rows and the levers.

Two messages in the English catalogue already did the agreement by hand while a
dozen did not, so the fault was never that somebody forgot: getting it right was a
choice made per message. Both catalogues have a `plural` helper now and the count
arrives already agreeing with its noun, so the next message written gets it for
free and neither language can get it right while the other does not.

The guard runs over both catalogues rather than over a list of strings, and checks
the plural as well as the singular — a fix that hard-coded `1 call` would have
passed every assertion about one and been wrong on every real log.


**Following this tool's own recording recipe produced a report that asked for two
more fields.** The onboarding message described a log with a `model` and a `usage`
object; the headline README snippet carried `label` marked "optional" and no
`session` at all. A reader who copied either was told on their first run that no
call carried a session, and — since #128 — that no call carried a label, so the two
largest findings the command makes could not be made.

There is one recipe now and it is complete. `label` says which workload and
`session` says which conversation; both are one line, neither can contain prompt
text, and the session key is grouped by and never printed. A test records the
documented snippet and fails if the report complains about anything, so the docs
and the tool cannot drift apart again.


**A log with no labels was reported as though `unlabelled` were a workload.** A
2,000-call classifier and a 400-call RAG pipeline with no label between them merge
into one slice, and the levers section then offered **a single route for both** —
two workloads that need different answers, priced as one.

Worse in `trazum route`, which measures exactly one prompt: it named
`unlabelled on Claude Opus 5 → Claude Sonnet 5, worth $14.88` and would have
attributed that verdict to a figure covering 2,400 calls the measurement never
touched. A number describing something other than what was measured, which is the
fault this repository keeps finding in itself.

Both say so now. The conversation-growth section already told the reader to add its
field when it was missing; labels got the same treatment, because the fix is one
line in their logger and it is what makes every figure below attributable.


**Three product faults, found by running the tool as a new user would rather than
by reading it.**

**`optimize` never said where the money was.** It is the first command anybody
runs, and it reports the smallest line item on the bill — measured, about 1%. On
the bundled example it prints `-0.4%` and `no rule found anything to trim`, and
then stopped. Everything that moves 40% to 80% lives in `profile`, which needs a
usage log a new reader does not have and has no reason to go looking for. A tool
that learned that and only said it in the command you reach last has not said it.
Every `optimize` run now closes with the four levers named and the command that
prices them.

**A named scenario was answered with a hint to name it.** Inside Claude Code the
report switches to tokens-only, and `--calls 50000` was met with "pass --cost if
this prompt is bound for a metered API" — telling somebody to do the thing they had
plainly just tried to do. It now says the scenario went unpriced and why.

The first attempt at this made `--calls` imply `--cost`, which was wrong and the
existing tests were right to fail it: `--calls` is a scenario parameter with a
default that several commands take purely to size a finding, so making it price
things would hand dollar figures to anybody who had put it in an alias precisely
because they had configured the tool not to show them. `--cost` stays the one way
to ask.

**A line that said nothing twice.** A 225-token prompt against a million-token
window reported `Context window: 0.0% → 0.0%` — the one line whose job is to say
what a saved token buys. It now distinguishes three cases, and the first attempt at
that was itself wrong: equal shares can mean "nothing against a million tokens" or
"10% of a Haiku window that one token did not move", and using the negligible
wording for both told a reader holding a tenth of the window they were under a
tenth of a percent. Caught by its own test.

### Added

**`trazum profile` now measures what re-sending the conversation costs.**

A chat or agent workload sends the whole conversation back on every turn: turn one
is a system prompt and a question, turn twenty is a system prompt, nineteen previous
exchanges and a question. On an agent bill that growth is routinely **the largest
single line**, and nothing in this package could see it — a prompt file shows the
system prompt and not the history, and a total shows the sum and not the shape.

```
What re-sending the conversation costs

  agent on Claude Opus 5: input goes from 600 tokens on the opening turn to
  5,000 on the closing one, over conversations of up to 12 turns.
  If every turn had cost what its own first turn cost, that input would have
  been $7.20 instead of $33.60 — so at most $26.40 of this bill is
  conversation growth (57.9%).
```

Reported as a **ceiling**: what the workload would have cost if every turn had cost
what its own first turn cost. That subtraction is exact; the split between re-sent
history and the user's own new messages is not knowable from counts, and inventing
one would be the flattering direction. Saying nothing because the split is unknowable
would be worse.

It needs one field — `session`, or `conversation_id`, whichever the log already has
— and **Trazum never prints it**. In a real log a session key is often an account id,
a ticket number or an email address, so it is used to group calls and count turns,
every figure comes out per label, and tests assert the value appears nowhere in the
report or in `--json`. A log with no session field says so rather than staying
quiet: "nothing recorded" and "nothing to report" are answers a reader would act on
differently.

Measured in the pass `profileUsage` already makes, so a megabyte log is never held
in memory: what the tracker keeps is bounded by the number of conversations.
`conversationGrowth` and `createConversationTracker` are exported from
`@trazum/core`.


**`trazum route` — the loop the levers section could only point at.**

`profile` prices a route exactly: the same tokens at a cheaper model's published
rate. It can say nothing whatever about whether that model still does the job, so
it printed a figure and a homework assignment — and homework does not get done.

```bash
trazum route usage.jsonl --prompt-file prompts/support.txt --cases cases.txt --yes
```

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).

  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.

  ✓ HOLDS — the difference is inside the original model's own noise.
```

It finds the slice worth the most on its own, so the reader does not have to know
which workload to point it at. **The yardstick is the expensive model's own
run-to-run variance**, measured on the same cases in the same run: a route is safe
when the cheaper model agrees with the original more closely than the original
agrees with itself, and any other bar would be a number somebody chose.

Three provider calls per case — two on the original, one on the candidate — and it
prints the count and stops unless `--yes` is given, exactly as `prune` does. It
reports `INCONCLUSIVE` rather than inventing a verdict, and says **agreement is not
correctness** on every verdict including the good one.

`evaluate` gains `candidateProvider`, which is the whole routing axis and needed no
new yardstick — the baseline still runs twice on the original model. `EvalReport`
gains `candidateModel`, because a report naming one model could not say what it had
compared.

### Fixed

**The levers section named a command that cannot test a route.** It printed
`trazum eval <prompt> --cases <cases> --model <candidate>`, and `eval` runs against
whatever `TRAZUM_LLM_MODEL` says — `--model` only prices the report. The
instruction sent the reader to a measurement that never touched the candidate
model. It names `trazum route` now, which does.


**`trazum profile` now prices what would actually move the bill** — the answer to
the fairest complaint this product has had.

> *"if it only saves €200 to a company spending €20k, it's rubbish"*

The €200 is right. The rules recover about **1%**: three tokens out of three
hundred and six, measured on an ordinary support prompt. The conclusion is not that
the number is wrong but that shortening the prompt was never where the money was.

| lever | what it moves |
|---|---|
| **which model the call goes to** | Opus 5 → Sonnet 5 is **40%** off; → Haiku 4.5 is **80%** |
| **the Batch API** | **50%** flat, on input and output |
| prompt caching | 3–4× the rules |
| shortening the prompt | **~1%** |

So the report prices the other rows, from the log the reader already has:

```
What would actually move this bill

  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50
    Whether that holds is an evaluation question, not an arithmetic one, and
    nothing here has seen a single answer. Measure it: trazum eval <prompt>
    --cases <cases> --model claude-sonnet-5

  For comparison: shortening the prompt text can touch $18.00 at the very
  most — 85.7% of this bill, and only if you deleted every input token.
```

On that estate the levers come to **80% of the bill**. Every figure is arithmetic
on tokens that were billed: the same counts at another model's published rate, the
same tokens at the provider's batch multiplier. Nothing modelled, nothing
extrapolated.

Four refusals, each of them a bug caught while building it:

- **The options are combined, never summed.** Batching a routed call discounts the
  *cheaper* model, so the pair is $16.80 — not the $23.10 an addition gives, which
  is more than the $21.00 that slice had ever cost.
- **A route is never called safe.** That is a quality question arithmetic cannot
  answer, and this has seen no prompt and no answer. It prints the `eval` command
  instead of a recommendation, and steps down **one** capability rung rather than
  to the cheapest model on the shelf — frontier to small is a bigger number and a
  different product.
- **No figure is "per month".** A log covers whatever period somebody recorded.
- **Nothing crosses a vendor.** A cheaper model at another provider is a migration.

The ceiling on prompt shortening prints underneath, on purpose: a 1% win reported
without saying 1% of *what* is not information. It counts retrieved context and
conversation history too, so it is generous — the real figure is far below it.

`profileUsage` gains `byLabelAndModel`, because a route is decided per model and a
label spanning two of them has no single answer. `billLevers` is exported from
`@trazum/core`.

### Fixed

**Four faults in the cache verdict, found by an adversarial review of the code
that had just been written.** Sixteen agents across four lenses, every finding
handed to an independent verifier told to refute it. Ten survived, and they
reduce to four.

**The verdict was computed from a total the code itself calls a floor.** A log
carrying only the flat `cache_creation_input_tokens` cannot say which TTL a write
used, so the cheaper 5-minute rate is assumed — and that assumption moves the
*verdict*, not only the total. Reported delta is `0.25w - 0.9r`; at the 1-hour
rate the truth is `w - 0.9r`, so the **sign** disagrees for any workload reading
back between 0.28 and 1.11 tokens per token written. Measured on a million written
against three hundred thousand read back: `Caching took $0.1000 off this bill`,
where the truth at 2x was a **$3.65 loss**. A $3.75 swing across the sign, taken
in the flattering direction, printed as a fact.

The economics now carry `worstCaseDeltaUsd` and `worstCaseVerdict`, priced per
model because the ratio between the two rates is 1.6 on Anthropic and 1.0 where a
write costs what input costs. When the two verdicts disagree, neither is reported
— and the confident sentence does not print at all, which is the second half of
the fix: the first attempt added a caveat and left the assertion above it.

**Losing labels were named by bill size and truncated at three in silence**, while
the money beside them was summed over every loser. Four bleeding labels printed
three names and a figure charging them with a fourth's loss, and the worst cache
in an estate — usually on a small workload — was the one dropped. Ranked by loss
now, with the remainder counted.

**"Caching pays off overall" printed under a total the line above had just called
level.** The sentence no longer restates a verdict it is not in a position to make.

**A pricing overlay could not declare `multipliers`,** so a model added through
`--pricing` inherited Anthropic's 1.25x/2x writes. Trazum computed a premium that
provider never charged, reported an impossible caching loss, and told the reader
to turn caching off — while three documents claimed that could not happen to a
provider whose writes cost what input costs. Overlays carry `multipliers` now,
validated like every other key: an unknown rate name is an error with a
suggestion, a zero multiplier is refused along with the negatives, and `batch:
null` stays distinct from leaving it out.

### Added

**`trazum profile` now says whether the caching actually paid for itself** — the
one finding in this repository that can contradict the advice the rest of it
gives.

Trazum tells people to cache. On Anthropic a cache **write** costs 1.25x plain
input, and **2x** at the one-hour TTL, so a prefix that changes faster than it is
reused pays that premium and gets nothing back: those calls are cheaper with
caching switched off. Nothing else on the report could say so. The cache hit rate
cannot — it reads **97.8%** on the log used to test this, while one of the two
workloads on it is burning money.

```
  Cache hit rate 97.8% of billable input.
  Caching took $0.2675 off this bill, against the same tokens uncached.
  ! Caching pays off overall, but it costs $0.1250 on: rag. The total hides that.
```

Computed **per label as well as over the whole log**, because that is the case
worth having it for: a profitable cache on one workload and a bleeding one on
another net out to a comfortable total, and an aggregate is exactly where a loss
like that hides. Both sides are priced **per model**, so a provider whose writes
cost the same as plain input — OpenAI, Gemini — is never accused of a loss it
cannot have and could not switch off if it did.

This is the only counterfactual in `profile`, and it is not an exception to the
module's no-savings rule so much as the line that rule draws. A saving means
imagining a prompt nobody wrote. This means imagining the *same tokens at a
different rate*, which is arithmetic: caching changes the multiplier on a token,
never the token.

`--json` carries the verdict as `cache` and `cacheByLabel` rather than leaving a
consumer to re-derive it — **positive `deltaUsd` means worse**, the opposite of
every other figure Trazum emits, and two implementations of that convention would
eventually disagree. `cacheEconomics` is exported from `@trazum/core`.

### Fixed

**`profile` claimed caching had never been used on a bill made of cache writes.**
The message was keyed off a null cache hit rate, and the rate is undefined — zero
reads over zero attempts — on a log whose calls are entirely cache writes with no
plain input. So "Caching was never used on these calls" printed above a bill that
was 96% cache writes. It is keyed off whether caching was used now, which is a
different question and the one the sentence asks.

**Three faults in `profile`, found by an adversarial review of the code that had
just been written, and all three understated the bill.** Twenty-four agents across
four lenses — money honesty, the parser, the report's claims, security — each
finding then handed to an independent verifier told to refute it. Everything that
survived was in the flattering direction, which is the one direction this tool
exists not to take.

**A 1-hour cache write was priced at the 5-minute rate.** Anthropic charges 1.25x
input for a 5-minute entry and **2x** for a 1-hour one. `cacheWrite1h` was computed
in `pricing.ts` and never used by anything. Ten million tokens of 1-hour writes on
Opus 5 reported **$62.50** against a real **$100.00** — 37.5% under, on the largest
line of that bill, silently.

Worse, the information needed was in the log and was being thrown away: the API
returns a `cache_creation` object splitting the two, and the parser read only the
flat total. It reads the split now. When a log carries only the flat count the
cheaper rate is used **and the report says so** — the total is a floor for those
calls, and it uses the word.

**A count that was present but unreadable became a silent zero.** The guard was
`if (input < 0 && output < 0)` — an AND — so a record survived when only one of the
two failed to parse. A stringified `"200000"` out of `jq`, or a `null` out of a
Postgres JSON round-trip, produced a clean zero indistinguishable from a real one,
and the line never reached `skippedLines`, so nothing on screen said a number had
been dropped.

Measured: **$0.0150 against a true $2.015**, and the headline flipped to "output is
100% of this bill, so shortening prompts has a low ceiling" on a workload that was
almost entirely prompt. The one piece of advice the command exists to give, exactly
inverted.

Absent and corrupt are different things now. An absent field is a zero somebody may
legitimately mean — a log recording only what its author cared about is not
corrupt. A field that is *there* and unusable rejects the line, which puts it in
`skippedLines` where the report names it.

**A wholly unpriced log printed a report of zero rather than no report.** The empty
guard required both the priced and unpriced counts to be zero, so a log whose every
model was unknown fell through and printed a full report built from a zeroed total:
`0 calls · $0`, four zero rows, a meaningless "Input is 0.0% of this bill", and — on
a log holding a hundred thousand cache-read tokens — the flatly false **"Caching was
never used on these calls."** Two affirmatively wrong claims, and the only correct
line on screen was the quietest one.

### Added

**`trazum profile <log.jsonl>` — the command on top of the usage reader.** Reads a
usage log and prints where the money went: the bill, the split across input, cache
reads, cache writes and output with each one's share, the cache hit rate that
actually happened, and a breakdown by label and by model.

It leads with the part of the bill worth arguing with. When output is over half it
says so and names the two controls that move it — shorter answers and
`max_tokens` — because at that point shortening prompts has a low ceiling and the
rest of this tool is about shortening prompts.

**Money is never suppressed here, unlike every other report.** The rest of the CLI
hides dollar figures on a subscription host, because a saving quoted to somebody on
a flat plan is money that does not exist. This log records metered API calls
somebody was already billed for: the bill exists wherever Trazum happens to be
running, so the host has no bearing on it. A test pins that, since the general rule
is the opposite.

**Every part prints, including the zero rows.** A row missing because it was zero
reads as a row somebody forgot, and "your cache writes are zero" is a finding — it
is how you see at a glance that caching is off.

### Fixed

**The headline claim printed twice.** When output was both the largest part and
over half, the report said "Output is 61.8% of this bill" and then "Output is 61.8%
of this bill, so shortening prompts has a low ceiling here" on the next line. The
same fact in adjacent lines reads as a bug because it was one; only the sentence
that says more prints now.

**The command-count guard could not tell a live claim from a record.** It covers
`RELEASES.md`, which was right — the count drifted there once and went unnoticed
for two merges — but it read the whole file, so "Twelve commands now, up from four"
in the **1.8.0 notes** failed against a thirteenth command. That sentence is true
about 1.8.0.

Below the first version heading `RELEASES.md` is a record, and rewriting it to
match the present is falsifying history to satisfy a test. The standing header is
still checked, which is where the drift it was written for actually lived — proven
by reintroducing that drift and watching it fail.

**The second guard in this release to need that distinction**, after the one on the
published error band. Worth noticing as a pattern: a file that mixes current claims
with dated ones needs a guard that knows which half it is reading.

### Added

**`profileUsage` — reading what the provider actually charged, rather than
estimating what a file would cost.** The first piece of the answer to the thing
this release measured and could not fix: on an ordinary support prompt the
deterministic rules recover about **1%** of the monthly figure, while output
tokens alone were **87%** of it. A tool that reads `prompts/*.txt` cannot see
retrieved context, conversation history, tool results or answers, and on a RAG or
agent workload those are nearly the whole invoice.

It takes a JSON Lines usage log and says where the money went — by label, by model,
split across input, cache reads, cache writes and output — plus the cache hit rate
that actually happened.

**It reads a file, and that is the design.** Not a proxy, not an SDK wrapper.
Trazum's security position is that prompts do not leave the machine they are on,
asserted by tests rather than promised, and sitting in the request path trades that
away for convenience.

**The format is the one the API already returns.** `model` plus the `usage` object
from any Anthropic response, flattened or nested. OpenAI's shape is accepted too,
with the one real difference handled: OpenAI counts cached tokens **inside**
`prompt_tokens` while Anthropic reports them beside `input_tokens`, so treating
them alike bills the cached half at the full rate as well as the cached rate.

**There is nowhere to put prompt text.** The record shape has no content field, so
a usage log handed to Trazum cannot contain a prompt even by accident — a stronger
promise than "we do not look at it".

**And it reports no saving**, deliberately. Attributing "you could have saved X" to
a call that already happened means guessing what the call should have been, which
is exactly what this exists to stop doing.

### Fixed

**A model the catalogue does not know was making the total too low.** Found in the
first smoke run of the module above, and it is the same fault as the three
advisories fixed earlier in this release: counts were accumulated **before** the
price lookup could fail, so an unpriced call contributed its tokens to the totals
and its dollars to nothing. `total.inputTokens` included it, `total.inputUsd` did
not, and a cost-per-token taken from that report was wrong by however much of the
log was unpriced — silently, and in the flattering direction.

A production log will contain models this catalogue has never heard of: a
fine-tune, a preview, a competitor. They are now kept entirely separate, so every
token in the priced total is a token the dollars describe, and the size of what
could not be priced is visible rather than folded into a number that looks
complete.

### Fixed

**A high-severity advisory in `nanoid`, reachable only from the web app's build.**
`GHSA-2v37-7h3g-55p8` — a custom generator can loop indefinitely when size is zero.
It arrives transitively: `@tailwindcss/postcss` → `postcss` → `nanoid`, in
`apps/web`, which is `private: true` and deployed rather than published.

**No published package is affected, and that is asserted rather than assumed.**
`@trazum/core` carries zero dependencies and the CLI and MCP server carry only each
other, which `security.test.js` enforces from the root `workspaces` globs. The
exposure was a build-time tool in a private app.

Fixed in the lockfile, 3.3.17 → 3.3.18, and **verified transitively** rather than by
reading `npm audit` once. That distinction is in `SECURITY.md` for a reason: the last
time this repository cleared an advisory, Dependabot raised the direct dependency to
`next@16` and left the vulnerable `postcss` and `sharp` pinned in the lockfile, so
the advisories survived the upgrade meant to fix them. Reinstalled from the lockfile
and re-audited: 0 vulnerabilities.

### Changed

**The README's action pin advanced to the 1.10.0 commit.** It can only move after
the merge it names exists — `security.test.js` asks git what version the pinned
commit declares in its own manifest, so a pin cannot be advanced inside the commit
it points at and cannot carry a label its target does not have.

## 1.10.0 — "Every hard edge, both sides"

**A minor rather than a patch, because it changes every report.** The published
error band drops from `±15%` to `±10%`, which moves the number printed beside every
token count Trazum has ever shown, and a fourteenth finding joins the list.

The band moved because **kana and han do not cost the same**. Charging one token per
CJK character put Japanese at +11.2%, the worst error in the corpus, while Chinese
sat at -3.2% under the identical rule. No new measurements were needed — the finding
was in the twenty-one samples already committed.

Then three advisories turned out to share one fault: an estimate with a ±10% band
compared against an absolute threshold, and the answer stated as a fact. One offered
$48.67 a month that could not be collected. One promised money on a prefix that
might not clear the cache minimum. One said "the call will fail" as a certainty, and
said nothing at all in the case where a prompt that seemed to fit really might not.
All three are fixed, and a guard derived from the pricing catalogue now covers the
pattern across eighteen models so it cannot ship a fourth time.

**1.9.1 was prepared and never published.** Its tag failed three times against a
trusted-publisher configuration that npm kept refusing, and everything in it is
contained here. This release supersedes it.

### Added

**A guard so the threshold fault cannot be shipped a fourth time.** The same
mistake was found and fixed three times this release — an estimate with a ±10% band
compared against an absolute threshold, and the answer stated as a fact.
`threshold-honesty.test.js` asserts the property instead of the three instances.

It is **derived from the pricing catalogue**, not from a list of thresholds typed
into a test: eighteen models, four distinct cacheable minimums, six distinct context
windows, and a model added later with a new window is covered without anybody
remembering to. Weak about wording, strong about presence — it does not care what
the caveat says, only that a report facing a line its own error band straddles
admits it somewhere. Pinning the phrasing would make it a copy test.

**Silence is a failure, not a skip**, and getting that wrong is how the first
version missed the bug it was written for. It skipped when no relevant finding
existed — which is precisely the quiet failure mode — so deleting `context-near-limit`
left it green. The one legitimate silence is a threshold the model does not have.

Coverage stated exactly in the file: reintroducing faults 2 and 3 fails it, both
halves of 3 included. Fault 1 does not, because its property is different — "offers
a saving the tool would refuse to deliver" rather than "admits uncertainty" — and
that one is guarded by the advice-matches-action sweep in `cache-minimum.test.js`.
Two properties, two tests, said out loud rather than implied.

The first version also fed the cache advisories a bare token count with a
placeholder prompt, and those advisories reason about the stable prefix of the real
text. A two-token prompt labelled 486 tokens is nowhere near any minimum, so it
reported eighteen failures against correct code — a test measuring its own fixture.

### Added

**`context-near-limit`, for the prompt that fits by estimate and might not fit at
all.** The third place a ±10% number was compared against a hard threshold and the
answer stated as fact, after `cache-prefix-reorder` and `prompt-caching`. This one
carries no dollar figure and was the most absolute of the three: **"The call will
fail."**

It was wrong in both directions. An estimated 205,000 tokens against a 200,000
window can truly be 184,500 — the call succeeds, and the reader was sent to split a
prompt that fitted. An estimated 199,000 can truly be 218,900, which does not fit,
and **nothing warned at all**.

The silent direction is the worse one and it is the new advisory. A prompt over the
window fails outright rather than degrading, so there is no partial result to
notice and no other finding covers it.

### Fixed

**`context-overflow` no longer states a prediction as a fact.** Barely over the
line it says the call will *probably* fail and names `--exact-tokens`; far over, it
still says the call will fail, because it does. Hedging there would be its own
dishonesty.

Neither fires on a number the caller measured. An exact count near the edge is not
uncertain, and telling somebody their measurement might be wrong pushes them toward
a check they have already done — the same rule the other two advisories follow.

**Three advisories, one fault, found by asking twice whether it had a twin.** The
pattern is worth naming because it will recur: any comparison of an estimate
against a hard threshold has two failure modes, and the quiet one is usually worse
than the loud one. The sweep tests now cover the seam around each threshold rather
than sampling either side of it.

Adding the id made the typed union fail the web app's catalogues and a derived
guard fail the README's count of findings. Both are the mechanisms working.

### Fixed

**`prompt-caching` hedged in one direction and promised money in the other.** Found
by asking whether the bug just fixed in `cache-prefix-reorder` had a twin. It did.

`below-cache-minimum` hedges when an estimated prefix lands just *under* the
threshold — the real one may already be over, and withholding the largest saving
Trazum offers on the strength of a ±10% figure is wrong advice. `prompt-caching`
did **not** hedge when an estimate landed just *over* it. With a ±10% band an
estimated 528-token prefix can truly be 475, and then nothing caches at all and the
dollar figure printed beside the advisory is uncollectable.

Same fault as the reorder advisory, opposite direction, and this is the direction
with money attached. The hedge qualifies the figure rather than withdrawing it —
the prefix probably does clear the line — and names `--exact-tokens`, which settles
it for free.

Only on an estimate. A caller who supplied their own counter has an authoritative
prefix, and telling them it might be wrong pushes them toward a check they have
already done.

### Added

**A test that no size around the threshold makes an unqualified claim.** Whichever
advisory fires, if the band around the estimated prefix straddles the minimum, the
text has to say so. Swept across the window rather than asserted on two samples,
because the fault was an asymmetry between two code paths and only a sweep can show
the seam between them is closed.

It reads the prefix from `analyzeCachePrefix` rather than scraping `~528` out of the
sentence. The first version did scrape it, defaulted to "straddles" when the regex
missed, and reported two failures against correct behaviour — a test asserting its
own parsing instead of the property.

### Fixed

**`cache-prefix-reorder` was offering money that could not be collected.** It fired
whenever enough stable content sat after the first placeholder and priced moving it
forward at 90% off — without asking whether the prefix that rearrangement would
build actually clears the model's cacheable minimum.

On a 306-token support prompt against Claude Opus 5's 512-token minimum, the best
prefix any ordering can produce is 302. Nothing caches at any ordering. The
advisory offered **$48.67 a month**, in the same report as `below-cache-minimum`
telling the reader caching would not work here at all — two findings contradicting
each other, with the dollar sign winning the argument.

`reorderForCache` had refused these prompts from the start, for precisely this
reason, so Trazum's advice and Trazum's action disagreed: take the advice, run
`--reorder`, watch nothing happen. A money figure in the flattering direction is
the one fault this file exists to catch.

The gate is a strict comparison against the minimum. **No band hedge, and that was
tried first** — widening it by ±10%, on the reasoning that makes
`below-cache-minimum` hedge near the line, opened a window between 466 and 512
tokens where the advisory offered and the command refused. The same fault one layer
up, and the test caught it. The near-the-line case is already handled in the right
place: `below-cache-minimum` names `--exact-tokens`, and once the number is certain
both work from the same certainty.

### Changed

**The advisory names the command that does it.** It described the rearrangement in
prose and left the reader to perform it by hand, while `reorderForCache` sat in the
same package able to attempt it — whole blocks only, refusing any block that refers
back to earlier text, and everything after one. It now prints
`trazum optimize <file> --reorder` and still says to read the diff, because this is
the one transformation that moves text rather than deleting it.

An advisory that withholds the command is the shape of the whole product problem:
Trazum knowing something worth more than what it does about it. On a 1,355-token
prompt the command takes the cacheable prefix from **13 tokens to 1,350**.

### Added

**A test that the advice and the action cannot disagree.** For every size in a
sweep: if the report offers the saving, `reorderForCache` must deliver movement.

One-directional on purpose, and the direction took two attempts to get right. The
first version asserted that `cache-prefix-reorder` and `below-cache-minimum` never
appear together — wrong about the product, not the code: on a prompt with plenty of
movable content both are true and both useful, a diagnosis followed by its fix. The
second asserted the converse as well, and failed against working code because below
200 movable tokens the advisory stays deliberately quiet while the command remains
available. Silence about a small win is not the same fault as a promise about an
impossible one.

### Changed

**The published error band drops from ±15% to ±10%, and the worst measured error
from 11.2% to 6.4%.** No new API calls were needed for this — the finding was
sitting in the twenty-one measurements already committed.

**Kana and han do not cost the same.** Every CJK character was charged one token,
and measured against the counting endpoint that put Japanese at **+11.2%** — the
worst figure anywhere in the corpus — while Chinese sat at **−3.2%** under the
identical rule. One constant cannot be right for both, and the samples say why: the
Japanese file is 58% kana and the Chinese one is 0%.

Kana are a small syllabary that appears in every sentence, so a merge table covers
runs of them and several characters share a token. Han are tens of thousands of
rare characters a merge table cannot cover, and they cost about one each. Measured:
kana 0.75 tokens per character, han 1.05.

```
cjk-japanese   +11.2%  →  -1.5%
cjk-chinese     -3.2%  →  +1.3%
worst in corpus 11.2%  →   6.4%   (code-heavy, which nothing is fitted to)
```

**The signal needs no detector**, which is what separates this from `language.ts`.
A character is kana or it is not; the two samples separate perfectly at 58.3%
against 0.00%. No refusal case, no margin rule, nothing to get wrong on a
three-line prompt.

**Rounding up per run was the first attempt and it was wrong by five points.**
Ordinary Japanese alternates kana and han inside every sentence, so the runs are
short and numerous, and a `Math.ceil` per run charges most of a token for each
boundary — an artefact of where the loop breaks rather than of what the text costs.
CJK accumulates as a fraction now and is rounded once, over the whole document. A
test builds the same characters blocked and alternating and requires the two
estimates to agree within one token.

**The band is 10 rather than 7, and the margin is deliberate.** 6.4 rounded up is
7, and publishing 7 would be a tighter claim than twenty-one samples across six
text types can support: there is no Korean here, no Cyrillic prose, no mixed-script
document, and a seventh type could easily land at eight. A band that becomes false
the first time somebody measures something new is the exact fault this whole
exercise was fixing, so the uncertainty is overstated rather than understated.

### Added

**Accuracy is ratcheted per text type, separately from the published band.** The
band is deliberately loose and that has a cost: a change taking CJK from 1.5% back
to 3.6% passes every band assertion, because both are inside ten. Found while
mutation-testing this very change — setting `HAN_TOKENS_PER_CHAR` back to a round 1
doubles the CJK error and nothing failed.

Each type now carries a floor set to what it has actually reached. They tighten,
never slacken: an improvement lowers its floor in the same commit, and a deliberate
trade raises it with a changelog line, which is a different act from not noticing.
A type added to the corpus without a floor fails the suite rather than going
ungated.

Same idea as `trazum baseline` turned on this repository's own numbers — publish a
ceiling, gate on drift away from what you had.

**`RELEASES.md` and `ROADMAP.md` join `CHANGELOG.md` as records exempt from the
band-consistency guard.** The guard requires every file stating a band to match the
code, which is right for a README and wrong for a release note: "the band is still
±15%" is a true statement about 1.9.0, and rewriting it to say 10 would be
falsifying a record to satisfy a test. The other twenty files it flagged were live
claims and were updated.

### Fixed

**The preflight told the reader to disbelieve it, and it was right.** The caveat
closed with "believe your settings over this check", on the reasoning that the
exchange endpoint is undocumented and a refusal could be the request being wrong.

Then it was tested. `v1.9.1` was tagged against settings that had just been filled
in on all three packages; the check said `rejected`; the publish failed with the
same `E404` it predicted, twice. The check has been right in the only case that
has ever tested it, and the caveat argued the reader out of a true finding — which
is worse than no caveat.

It still says the endpoint is undocumented, because that is true and matters. It
now also says it has been right once, and asks to be believed until it is not.

**And the diagnosis was unreachable for a third time.** The auth check runs before
`verify`, which then prints thousands of lines, and GitHub's logs API returns the
*tail* of a job — so the block naming what npm must match could not be retrieved
while a release was actually failing, twice during v1.9.1. Writing it to the job
summary fixed that for anyone on the run page and not for anyone reading the log,
which is where a failure gets read.

The failure step repeats it now, at the end, where the tail always reaches. Four
lines, and it is the difference between an error and a diagnosis.

### Changed

**The report was leading with its smallest number.** Measured rather than
assumed: on an ordinary customer-support prompt — already reasonably written,
which is what a real one is — the rules recover **three tokens of 306**, worth
$0.75 a month. The advisories listed below them on the same prompt are worth
$345 and $48. The report opened with `-1.0%` and closed with the comparison.

`Start here:` is the first thing in the report now:

```
Start here:
  "This task may not need Claude Opus 5" — $345.45/month, 461× what the
  rules saved.

Input tokens
  306 → 303   -1.0% (estimated, ±15%)
```

That ordering was not a presentation quibble. It taught the reader that
shortening the prompt is what this tool is for, and on any prompt somebody
competent wrote, shortening it is the smallest thing available. The rules earn
their keep on genuine bloat — a duplicated paragraph, "due to the fact that",
where they measure **-23.5%** — and recover close to nothing once it is gone,
because they recover waste rather than creating savings. Both figures are from
the same build, minutes apart, on two prompts.

Nothing about what Trazum computes changed. It already knew the advisory was
worth 461 times more and said so at the bottom of the screen.

One thing got simpler on the way. The line's guard was duplicated — an early
return *and* a filter, both keyed on the same condition — which made it
untestable: removing the guard left the filter still suppressing the line, so a
mutation that priced a flat plan passed. Two checks for one condition is one
check and one place for a bug.

## 1.9.1 — "The preflight"

**A release whose point is that the next one publishes itself.** 1.8.0 and 1.9.0
both went out by hand — the first because the packages did not exist yet, the
second because the trusted publisher had not been configured — so neither carries
provenance. Nothing in the repository could tell you in advance which way a tag
would go.

It can now, with one caveat stated in the entry below: the endpoint it asks is
undocumented, so a refusal can be the check being wrong rather than the settings.
It says so, and it never gates.

### Fixed

**A token claim could have rearranged the summary it was written into.** CodeQL's
third finding on this script, and the same class as the first two: a value that
arrives over the network reaching somewhere it can do more than be read. The job
summary is *rendered markdown*, and the claims are decoded from a JWT fetched from
the runner's token endpoint — so a claim carrying a backtick fence would close the
code block it was meant to sit inside, and everything after it would render as
page rather than as data.

A garbled summary is the mild version. One that reads as though it says something
it does not is the reason to bother.

**The first fix was the shallow one.** Sanitising the claim strings addressed how
they could rearrange a rendered document and left the plainer fact underneath: a
value fetched over HTTP was being written to a file, and CodeQL said so again.

So the block does not quote the token any more. The values printed come from
**this run's own environment** — `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_REF` — which
is the authority on what this job is, while the token is a statement about it made
elsewhere. The token is reduced to one computed word per field: `agrees`,
`DIFFERS`, `absent`. A disagreement is still visible, which was the whole point,
and nothing this process did not author reaches the file. The HTTP status in each
verdict is narrowed to a known integer for the same reason.

It is also a better diagnosis. It prints what to type into npm rather than what
the token happened to say, which is the question somebody reading a refusal
actually has.

**One value still slipped through: the HTTP status.** `rejected (${res.status})`
put a number npm invented into a string that ends up in the file, and narrowing it
to an integer was not enough — the flow is the finding, not the shape of the
value. The status selects one of five labels this file chose, and the unknown case
keeps its number on **stdout only**, because a status nobody can see is a dead end
for whoever has to work out what happened, and a log is not a document this script
is composing.

**And a test was asserting one spelling of one payload.** It checked the summary
did not contain `<script>`, which CodeQL correctly called a bad filter: it would
pass against `<SCRIPT>` and against everything else a hostile value could open. It
asserts the property now — no markup characters in the summary at all — which is
what the code guarantees.

**The auth preflight asked about one package and reported on one package, and
the first real run showed why that is not enough.** It checked the first name
alphabetically — `@trazum/cli` — on the reasoning that a misconfiguration is
all-or-nothing. It is not. The trusted publisher is a setting on three separate
pages, one per package, so configuring two of them is the easiest mistake
available. And the release publishes `@trazum/core` first, so the package that
actually stops a release need not be the one that was asked about.

It asks about every published package now and prints a line for each, so a
partial configuration reads as one:

```
  configured            @trazum/cli
  rejected (404)        @trazum/core
  configured            @trazum/mcp
```

**And "a claim does not match" now says which claim.** That sentence names a
category rather than a field and leaves the reader comparing four settings
against nothing. On a refusal the step prints the four claims npm matches on —
repository, workflow ref, environment, ref — beside the failure. `environment:
(absent)` is the answer whenever it appears: the claim exists only when the job
declares an environment, so an npm rule requiring `release` can never match a
token without it.

The claims are an allow-list and **the token itself is never printed**. Those
values are public metadata about the run; the token beside them is a bearer
credential npm would accept, and a public log is forever. Two tests hold that
line — one fails if the payload is dumped wholesale, one fails if the token is
printed at all.

### Added

**The release workflow can now tell you whether a tag will publish, before you
push the tag.** 1.9.0 was tagged, passed every check, and failed on the last step
with `E404 Not Found - PUT` because the trusted publisher had not been
configured. Nothing was published — but the tag was spent and the release went
out by hand for the second time running, which means no provenance for the second
time running.

Both of the things that went wrong were knowable in advance, and neither was
checked. `scripts/npm-publish-preflight.mjs` asks them now.

**Can this workflow authenticate?** It puts a GitHub-signed OIDC token to npm's
token-exchange endpoint — the same question the upload steps ask — and answers
`configured`, `rejected` or `could not verify`. It runs on `workflow_dispatch`
too, so a dry run finally settles this: before, a dry run proved the environment
gate existed and nothing at all about npm, and the only way to test a trusted
publisher was to spend a version number on it.

**This one never fails the job, deliberately.** The exchange endpoint is npm's
own plumbing rather than a documented API, and a gate built on it would one day
block a release that would have worked — worse than the failure it prevents. It
reports; the upload is still the authority. A test pins that, because "it only
warns" is the kind of property that quietly becomes "it fails on Tuesdays".

**Is any of these versions already spent?** npm never reuses a version, and the
packages publish in dependency order, so the expensive shape is core uploading,
the CLI failing, and core's number being gone. Checking all three against the
public registry before the first upload turns that into a clean abort. This one
**does** fail the job — it reads a documented API, and a version that already
exists is not a maybe. An unreachable registry fails it too: not answering is not
evidence a version is free.

**And npm's 404 no longer names the wrong problem.** Any publish failure now
prints what `E404 Not Found - PUT` actually means, with the four fields to check
and which one people leave blank. That diagnosis existed in `docs/releasing.md`
and was no use to anyone who did not already know to look there.

All five guards are mutation-tested: reporting a taken version as free, treating
an unreachable registry as free, making the auth check fail the job, dropping the
version preflight from the workflow, and tag-gating the auth check so a dry run
cannot answer it. Each one fails the suite.

**CodeQL raised three alerts on the first version of it, and all three were
right.** Both halves of every URL here come out of a file, and a manifest is
trusted by convention rather than by anything enforced — it is whatever is on
disk when the release runs, and this script turns it into a request to a host
that holds publish rights.

So the values are checked at the boundary now, on the same principle as
`checkedEndpoint` in `net.ts`: a name that is not a package name and a version
that is not a version stop the release rather than being sent to a registry to
find out. Every URL is built through one helper that encodes its segments and
then asserts the result is still on the registry's own origin — if a value ever
did reach the path structure, the request does not leave rather than leaving for
somewhere else.

The high-severity one was `name.replace('/', '%2f')`, which encodes the *first*
slash and leaves any others. A scoped name has exactly one, so it worked; it is
the same shape as the regex `release-notes.mjs` built out of a version string,
and hand-rolled encoding that happens to be right is still hand-rolled encoding.
`encodeURIComponent` now, verified against the live registry to accept the
encoded `@`.

Putting the incomplete escape back fails no test, which is the honest outcome
rather than a gap: the name validation makes the two forms equivalent for
anything that reaches them, so a test failing on one would enforce a preference
instead of a requirement. CodeQL is what guards it, and it runs on every pull
request.

### Changed

**The README's action pin advanced to the 1.9.0 commit**, from a 1.0.0 commit it
had been sitting on since that release. The pin can only move after the merge it
names exists, which is why this is a separate change from the release that made
it correct — `security.test.js` asks git what version the pinned commit declares
in its own manifest, so a pin cannot be advanced in the commit it points at, and
cannot be labelled with a version that commit does not carry.

## 1.9.0 — "The error band, measured"

**The release that found out the central claim was false, and fixed it.**

`±15%` had been printed on every report for eight releases, with every dollar
figure descending from it, and nothing in this repository established that it
held. The first run of `measure-token-band.mjs` against the official counting
endpoint found it did not: the numeric sample was 30.6% under, Spanish prose
22.1% under. Nine of eleven samples underestimated, always in the direction that
under-reports cost.

Two things were wrong. Digits were counted at three per token where Claude splits
them far more finely — corrected in isolation, that sample went to -5.0%. And the
estimator turned out to be calibrated **for English specifically**, not for prose:
German measured -37.3% under one divisor that served every language.

The band is measured now, at ±15%, and it landing back on the old number is a
coincidence rather than a restoration: that 15 bounded nothing, and this one
bounds **twenty-one samples across seven languages and six text types**, worst
case 11.2%. Every language divisor has a held-out test in a different register.

Also here: `trazum baseline` and a `check` that gates on drift rather than only on
a ceiling; a pull-request comment that leads with what the branch costs; and
`below-cache-minimum` no longer asserting from an estimate near a hard threshold,
which was wrong advice rather than an imprecise figure.

The sections below are as they accumulated, entry by entry, and were not
consolidated: they are the record of what happened in the order it happened.

### Fixed

**`SECURITY.md` claimed prompts are never stored, and that stopped being true
when `--suggest --cache` shipped.** The sentence was written when it was
unqualified and correct; the cache arrived later and nobody went back to the
security document. It writes the model's raw response, keyed by the prompt, to a
file under the user's home directory.

Nothing about the feature is wrong — it is opt-in, it is local, and the files
are `0600` in a `0700` directory precisely because a prompt is the most sensitive
thing this tool touches. What was wrong is a security document telling a reader
that no such file exists, which is the kind of error that survives review because
it reads as reassurance.

The paragraph now says what is guaranteed (nothing about a prompt reaches a
server that keeps it) separately from what the CLI can be asked to do on the
machine it already runs on, and names where to delete it.

**The repository-hardening checklist listed a step that is done and enforced.**
Pinning every third-party action to a commit SHA was item 6, phrased as
something to run once there is network access. It has been done for several
releases and `security.test.js` fails any `uses:` naming a tag or a branch — so
it is not a checklist item, it is an invariant, and it moved to a section that
says so. The list also had two items numbered `3` and a closing line counting
five of six.

### Changed

**The corpus went from eleven samples to twenty-one, and every divisor now has a
held-out test.** The eleven that set the band left three languages calibrated on a
single sample each, which is a fit rather than a measurement: a divisor chosen to
minimise the error on one file will always look good on that file.

Ten samples were added, in two rounds. The first round gave Italian, Portuguese
and Dutch a sample each — three languages that had a divisor by inheritance and no
evidence — and the second gave every calibrated language a **second** sample in a
different register: the first set are support prompts, the second are code-review
prompts, different vocabulary and different length. That second sample is what
turns the first from a fit into a finding, and all seven held:

```
                calibrated on   held out on
english             +1.0%          +0.4%
german              -9.2%          -8.5%
french              -1.2%          -5.8%
spanish             -6.2%          -9.7%
```

The divisors moved as a result — Italian and Dutch had been taking English's 4 —
and the corpus-wide worst case is unchanged at 11.2%, on Japanese, which no
divisor touches. Nothing in twenty-one samples is outside `±15%`.

**Italian had to be rebuilt, and the reason is worth recording.** Its first
function-word list was half Spanish: `per con del una sempre` are as common in one
as the other, so they earned nothing, the margin rule tied, and an Italian
code-review prompt came back `null`, fell through to the English divisor and
measured -21.9%. The detector was working exactly as designed — it refuses rather
than guesses — and the fault was a word list that could not tell the two apart.
The replacement is words Italian has and Spanish does not. Over-correcting it
broke the prose sample instead, which is the shape of this whole file: a list
tuned on one register is a list tuned on one register.

**What a hundred samples per language would have bought, and why they were not
written.** The counting endpoint is free, so the constraint was never money. It is
that every sample here was written by the same hand, and ninety more of those is
ninety more of the same bias — a tighter-looking number resting on nothing new.
Twenty-one real prompts bound the band honestly; a hundred invented ones would
bound it decoratively. The corpus grows one sample at a time now, and the samples
worth adding are the ones that came from somebody's actual work.

### Fixed

**`below-cache-minimum` was asserting from an estimate, and near the threshold
that made it wrong advice.** It compares the stable prefix against a hard limit —
512 tokens on Claude Opus 5 — and then tells the reader caching will not work
here. The prefix is estimated, so a prompt measured at 505 tokens could really be
at 540 and cache perfectly well. Not an imprecise figure: a reader told to stop
looking at the single largest saving Trazum offers.

Near the line it now says so, and names the way to settle it — `--exact-tokens`,
against an endpoint that is free. Far below the line it stays quiet, because a
hedge on every case is a hedge nobody reads.

**And it does not hedge a number the caller measured.** `count` defaults to
`estimateTokens`; a caller who supplied their own counter has an authoritative
figure, and telling them it might be wrong is its own kind of dishonesty — it
pushes them toward a check they have already done.

Both directions mutation-tested: hedging always fails the exact-counter test,
hedging never fails the near-threshold ones.

This was listed as *known, not fixed* one release ago. The window shrank when
language detection took the worst estimate from −37.3% to −9.2%; it did not close,
which is why this is a fix rather than a note.


### Fixed

**The estimator was calibrated for English and silently wrong for every other
Latin language.** Measured across eleven samples: German −37.3%, Spanish −22.9%
and −22.1%, French −15.1%, English +1.0%. Nine of eleven underestimated, always in
the direction that under-reports cost. Characters per token says why — English
3.44, French 2.66, Spanish 2.53, German 2.02 — while one divisor of 4 served all
of them.

`estimateTokens` now detects the language and divides accordingly:

```
german-prose        -37.3%  →   -9.2%
spanish-unaccented  -22.9%  →   -6.5%
spanish-prose       -22.1%  →   -6.2%
french-prose        -15.1%  →   -1.2%
worst in corpus      37.3%  →   11.2%   (Japanese, untouched)
```

The published band drops to **±15%** — the measured worst case rounded up, the
same rule that briefly made it 25. Landing back on the number that was a guess for
eight releases is a coincidence, not a restoration: that 15 bounded nothing, and
this one bounds eleven samples across four languages and six text types.

**The signal is not accents, and that was tested rather than assumed.** A Spanish
sample with zero diacritics measured −22.9% against −22.1% for accented Spanish,
which killed the hypothesis the previous release recorded. What separates these
languages is which words they are made of, so `language.ts` counts function words
— `the of and to` against `der die und ist` against `que los las del`.

**It answers `null` when unsure, and most of its tests are about earning that.**
A three-line prompt, a JSON schema, English instructions wrapped around a Spanish
example: no answer is safe for any of them, and a wrong language applies another
language's divisor to text that does not want it. `null` falls back to the English
divisor, which is what the estimator always did. Two bars guard it — four distinct
function words minimum, and a 1.6× margin over the runner-up — and removing either
one fails the suite.

One caveat stated plainly rather than buried: the four Latin divisors are
calibrated on one or two samples each, so their residuals are in-sample and
optimistic by construction. The band is set by the seven samples nothing was
fitted to. The honest test is the next held-out sample in Spanish, French or
German, and the corpus grows one sample at a time now.

### Known, not fixed

`below-cache-minimum` compares an *estimated* prefix against a hard 512-token
threshold, so an underestimate can report "caching will not work here" when it
would — wrong advice, not just an imprecise figure, and it costs the reader the
largest saving Trazum offers. The worst estimate on measured text is now −9.2%
rather than −37.3%, which shrinks the window considerably but does not close it.
The advisory should hedge near the threshold; that is its own change.


### Added

**The corpus can grow now, and three samples were added to falsify a
hypothesis.** Measuring the band left one finding unexplained: Spanish prose
comes out 22.1% under while English comes out 1.0% over, and accents are not the
cause — weighting them from 2 to 5 moves the figure three points. The candidate
explanation is merge-table coverage: text that is not English costs more tokens
per character whatever its diacritics.

`spanish-unaccented.txt` is the test that can prove that wrong. It is Spanish with
**zero** accented characters, so if accent density were a usable detector for "this
is not English" — and on the old corpus it separated perfectly, 0.00% against
1.71% — this sample would slip past it and stay underestimated. If instead it
lands where accented Spanish lands, the phenomenon is the language and the accents
were a coincidence of one file. `french-prose.txt` (1.83% accented) and
`german-prose.txt` (1.64%) say whether other Latin languages behave like Spanish
or like English.

Adding them required fixing something first. **The freshness digest covered the
whole corpus, so it could not tell an edited file from an added one** and answered
both with "re-run the script" — correct for an edit, wrong for an addition,
because it retires eight measurements that cost an API call each to admit one new
sample. The corpus was effectively frozen: growing it was gated on a key nobody
wanted to spend.

Digests are per sample now, via `digestOfOne`, and the two cases get what each
deserves. A file that changed since it was measured **fails** — its measurement
describes different text, which is the dangerous case because it passes while
being wrong. A file with no measurement **skips out loud** and is named, with the
command to run, because a gap in coverage is something to report rather than a
reason to distrust what has been measured. The existing fixture was migrated
without new API calls, which is sound only because the whole-corpus digest still
matched: that match is the proof those eight files are the ones that were
measured.

One guard had to be loosened to its intent rather than its letter: it asserted
`import { digestOf }` literally and failed the moment `digestOfOne` was imported
alongside it — a guard that breaks when you use more of the thing it protects.

**A global correction factor was tried and rejected.** The best available (×1.05)
takes the worst case from 22.1% to 18.2%, and does it by pushing Japanese from
+11% to +17% and English from +1% to +6%. That is redistributing error, not
reducing it, and it damages the two samples the estimator gets right.


### Fixed

**The ±15% error band was never true, and now it is measured.** Eight releases
printed it on every report and every dollar figure descended from it, while
nothing in this repository established that it held. The first run of
`scripts/measure-token-band.mjs` against the official counting endpoint found two
of eight samples outside it, **both underestimating**:

```
numeric-heavy    estimated 277, actual 399   -30.6%
spanish-prose    estimated 352, actual 452   -22.1%
```

Underestimating tokens means under-reporting cost. Trazum was telling people
their prompts were cheaper than they are — the flattering direction, and the worst
one for a tool whose whole argument is honest cost accounting.

**One constant was simply wrong.** Digits were counted at three per token; Claude
splits long runs far more finely, because a merge table cannot cover every number.
Correcting it in isolation — nothing else touched — takes the numeric sample from
−30.6% to **−5.0%** and moves no other sample more than four points.

**The Spanish error is not about accents, and that matters.** Weighting accented
characters from 2 to 5 moves that sample by three points. Spanish words tokenize
into more tokens than English words of the same length *even when they are pure
ASCII*, because Spanish is thinner in the merge table — so no per-character-class
constant can fix it, and one Spanish sample cannot calibrate a signal that would.
English prose lands at +1.0%, which says the estimator's structure is sound and
its coverage of non-English text is not.

So the published band is now **±25%**: the measured worst case (22.1%) rounded up,
because eight samples cannot bound a worst case tightly and the honest direction
to be wrong in is the pessimistic one. It is `ESTIMATE_ERROR_BAND_PCT`, exported
from the core — it had been a literal in twenty-three files with its only
machine-readable copy in a test, which is why correcting it meant a hand sweep
across three locale catalogues, four READMEs, the MCP tool descriptions, the web
app and the demo. A guard now fails when any file states a band the code does not
publish, with `CHANGELOG.md` excluded because rewriting history to match the
present is the opposite of a changelog.

The roadmap predicted CJK would be the problem. CJK is fine at −3.2% and +11.2%.
It was wrong about which text type and right that one number cannot cover all of
them.


### Changed

**1.8.0 is on npm.** `@trazum/core`, `@trazum/cli` and `@trazum/mcp` were
published by hand on 2026-08-13. The first publish had to be manual — a trusted
publisher is configured on a package's settings page, and that page does not
exist until the package does — so every release after this one goes through a tag
with no credential anywhere.

The documentation caught up: the "not published yet" notes are gone from
`RELEASES.md`, the front page and both package READMEs, and `Getting started`
leads with `npx @trazum/cli` instead of instructions for building from source,
which are now folded away for people working on Trazum itself.

**The guard that watched those notes was keying on the wrong thing, and the
publish proved it.** It asked whether `v1.8.0` was tagged, on the reasoning that
`release.yml` publishes on a tag and nothing else — checkable offline, which a
test in CI should be. But the first publish could never go through a tag, so no
tag was pushed, and the repository went on telling every visitor that nothing was
installable while three packages sat on the registry. That is the second signal
this claim has outlived; the first asked whether the changelog had a heading for
the manifest version, which is a release cut here rather than a package on npm.

There is no third proxy. Publication does not reverse, so the assertion is
one-directional now: no file may claim nothing is published. `docs/releasing.md`
records both traps the real publish hit — a `404 Not Found - PUT` is npm hiding
an auth failure behind a missing-scope error, and `npm view` 404s for minutes
after a successful publish because the packument propagates behind the tarball.


### Fixed

**npm was silently rewriting the manifest of both published binaries.** Every
`npm publish` answered `"bin[trazum]" script name was cleaned` — npm stripping
the `./` from `"./dist/index.js"` and uploading a manifest that differs from the
one in this repository. On npm 12 the same correction reads *"was invalid and
removed"*, which would put a package declaring a `bin` and carrying no executable
on the registry: `npx @trazum/cli` would resolve and then do nothing.

Caught on the first real publish attempt, in the wall of `npm notice` lines
nobody reads during the one command this repository cannot take back. Both
manifests now say `dist/index.js`, which npm has nothing to correct, and a guard
asserts it for every publishable workspace — plus that the target actually
travels in the tarball, since a `bin` pointing outside `files` is the same defect
arriving by a different route.

### Fixed

**The CLI test suite passed in CI and failed on a contributor's laptop.** Seven
tests, the first time anybody ran `npm run verify` on a machine whose locale is
not English — which was during a release, on the maintainer's Mac, with `LANG`
set to `es_ES.UTF-8`. Three spawns in `i18n.test.js` built their environment
inline from `process.env` and asserted on English output, so they inherited
whatever the machine said. A CI runner leaves `LANG` unset, so the bug was
invisible to the only place that was looking.

Five variants of that environment object had grown across the test files by then.
Three of them cleared `LANG`, `LC_ALL` and `TRAZUM_LOCALE`; **none** cleared
`LC_MESSAGES`, which `detectLocale` also reads — so even the files following the
"correct" pattern were one variable away from the same failure.

There is one environment now, in `packages/cli/test/env.mjs`, and it clears the
list of variables **imported from the detector** rather than a copy of it.
`LOCALE_ENV_VARS` is exported from `packages/cli/src/i18n/index.ts` and the
detector maps over it, so the list is the implementation: a variable added there
is read by the detector and cleared by the tests in the same commit, or in
neither.

It clears rather than pinning `TRAZUM_LOCALE: 'en'`, which was the first attempt
and was wrong — that outranks the project config, so every test taking its
language from `"locale": "es"` in `trazum.config.json` would have reported in
English and asserted against the wrong catalogue. Clearing the environment leaves
the precedence chain intact and only removes the machine from it.

Two guards keep it: one fails when any test file builds a spawn environment
inline, naming the file, and one asserts the shared environment clears every
variable the detector reads. Both mutation-tested, including reverting a file to
the exact shape that carried the bug.


### Added

**The pull-request comment leads with what the branch costs.** The Action has
been posting a budget table since it shipped: a list of files and whether each
one fits its ceiling. Useful, and not the question a reviewer is holding. What a
pull request proposes is a change, so the comment now opens with the change —
against the baseline recorded on the base branch — and puts the ceiling check
underneath it.

```
> [!CAUTION]
> **This branch adds 64 tokens (+67.4%) to the prompts here** — over the limit of 0 tokens, 5%.

| | Prompt | Baseline | Now | Change |
|:--:|---|--:|--:|--:|
| 🆕 | prompts/triage.md | – | 64 | +64 |

Monthly cost **$129.75 → $132.95** (+$3.20)
```

Only the directions that cost money are itemised. A list of every file that
shrank buries the two rows somebody has to act on — though a branch that made
things cheaper still gets its headline, because that is worth saying.

The rendered block comes from the same outcome the exit code was computed from,
so a green comment and a red build cannot disagree. It shouts only when a
threshold was actually crossed, names every limit that was crossed rather than
the first, and refuses to print a monthly delta when the scenario or the price
list moved — a figure in a pull-request comment gets quoted in a meeting, and two
different measurements subtracted is not a saving.

**No change to the Action was needed.** It already posts whatever
`check --markdown-out` writes, so the report carrying the cost diff is the whole
mechanism.

### Added

**`trazum baseline`, and a `check` that fails on drift rather than only on a
ceiling.** `budgets` answers "does this file fit". That is a ceiling, and a
ceiling has a blind spot: a repository sitting at 95% of every budget passes
forever while a pull request adds four hundred tokens across a dozen files.
Nothing busted, bill up. A baseline answers the other question — did this get
worse than the commit we agreed on — and it is the twelfth command.

`trazum baseline [dir]` records what the estate costs now to a file you commit.
With a `baseline` block in `trazum.config.json`, `trazum check` on a directory
reads it and gates on it **with no flag**, because a gate you have to remember to
pass an argument to runs in the author's terminal and not in CI. `--no-baseline`
skips it for one run.

The behaviour the whole thing turns on: a prompt that is *new* counts. Comparing
only the paths present in both documents would let a five-thousand-token addition
through every threshold — it is in neither the grown list nor the baseline total
— so the demonstration case is a run where every budget is green, no existing
file grew, and the build fails anyway because somebody added a file.

**The threshold is in tokens, and the money is only reported.** A dollar figure
comes from the token count, the usage scenario and the price list, and two of
those move for reasons that have nothing to do with the prompts. A baseline
holding dollars would fail a build the day a model was repriced, calling a price
change a regression, and a gate that cries wolf is a gate somebody deletes. When
the scenario or the price list has moved, the report says which one instead of
subtracting two different measurements and presenting the difference as a saving.

**A declared-but-missing or corrupt baseline fails the run.** A gate the config
asked for and could not execute is not a pass; otherwise deleting one file
silently switches CI off. That includes a hand-edited `totals.tokens` that
disagrees with its own per-file counts — the corruption that otherwise looks
completely normal. Neither threshold has a default and omitting both is a config
error, because every default here is silently wrong: zero tolerance gets the
block deleted within a week, and a generous one is a gate passing things nobody
agreed to.

`trazum.baseline.json`'s format joins the frozen API in `VERSIONING.md`, and it
is the strongest of those promises because the file is committed: it outlives the
Trazum that wrote it, so the document carries a `version` and an unknown one is a
loud error rather than a best-effort read.

Internally, the directory walk that decides what counts as a prompt was extracted
from `checkDirectory` so both commands share it. Two walks would be two
definitions of the estate, and the baseline would end up recording files the gate
never checks.

### Changed

**Trazum was selling the weakest half of itself.** The front page led with "cut
what your prompts cost", and directly underneath it the demo — real output, not
a mock-up — showed the rules recovering $24.00 a month while a single advisory
sitting above them was worth $528.40. Twenty-two times more. The tool has been
telling the truth about that gap for several releases; the pitch had not caught
up.

The framing now leads with the finding rather than the trim. The headline is
that most of an LLM bill is not the prompt, the advisories come first in *What
it actually does* with the trimming after them, and the caption under the demo
points at the two lines that make the argument instead of hoping the reader
notices. The package descriptions, the web app's title, tagline and lede all say
the same thing in both locales.

Nothing about the product changed — no rule, no advisory, no number. This is the
description catching up with what was already being measured.

The two counts the pitch now rests on — thirteen advisories, twelve rules — are
asserted against `RULES` and the `AdvisoryId` union, so a fourteenth advisory
cannot ship while the front page still says thirteen.

### Fixed

**The zero-dependency invariant was documented for three packages and enforced
for two.** `security.test.js` looped over a typed list — `packages/core` and
`packages/cli` — while `SECURITY.md` credited the invariant to all three
published packages. `packages/mcp` hand-rolls its JSON-RPC layer for exactly
this reason, and the test named as the reason had never heard of it. The list is
derived from the root `workspaces` globs now, with an assertion that the
derivation found the MCP server at all, so a suite that quietly resolves to
nothing cannot report "0 failures" from having checked nothing.
`CONTRIBUTING.md`'s first rule said "the core and the CLI" and now says what is
actually enforced, including why `apps/web` is exempt.

**Nothing checked that the README's images exist.** A moved or renamed asset
renders a broken-image placeholder to every visitor on the front page and tells
the person who moved it nothing. Local `src` and `srcset` paths are now asserted
to exist, absolute URLs deliberately excluded — somebody else's uptime is not
something a test here can hold.

The README's layout diagram also described `apps/web` as "Optimise and Compare",
one tab short since the prompt library shipped.

### Added

**A real screenshot of the web app on the README**, light and dark, swapped by
`prefers-color-scheme` so it matches the theme the reader is already in. Captured
from the production build rather than drawn, on the same wordy support prompt the
CLI demo uses.

### Changed

**The web app got a display voice, two tiers of depth, and browser surfaces that
belong to its own palette.** It had been correct and characterless: shadcn's
shapes wearing Trazum's colours, one system sans doing every job from the
wordmark to the percentage that is the entire point of the page, and a dark
theme in violet-grey borrowed from every other dashboard. Nothing about the
identity changed — paper, terracotta and ink are exactly what they were — but
the page now looks like it was built rather than assembled.

Fraunces Variable is self-hosted from npm and carries the wordmark and the
figures; the CSP's `font-src 'self'` holds, so no font is fetched from a foreign
host at runtime. Elevation is now two tiers and only two: working surfaces get a
hairline and a breath of shadow, and the result panel — the page's one focal
moment — drops its border rather than drawing the same edge twice. The dark
palette was warmed to the same umber cast as the light one so the terracotta
sits on Trazum's paper in both schemes. Selection, caret, focus ring and
scrollbars are themed from the palette, and the body sets tabular figures,
because every number on this page is a measurement and measurements align or
they wobble.

Two defects went with it. The reorder callouts were drawing a 3px coloured rule
down one side — a border doing a highlight's job — and are now a terracotta
wash. And on a narrow screen the history card sat between the Optimise button
and the answer the reader had just pressed it for; the two column wrappers
collapse to `display: contents` below `lg`, which makes every card a grid item
and lets history take `order-last` without moving a line of markup.

### Added

**The README leads with the receipts, and every markdown file caught up with the
code.** The front page now opens with a transcribed — not mocked — `optimize` run
as an SVG terminal, down to the closing line where Trazum admits the advisory is
worth 22× what the rules saved. The first draft of that SVG contained exactly one
invented figure, which its own header comment forbids; it was caught and replaced
with the real third advisory. A new guard derives the front page from the
workspace manifests: the architecture diagram had silently omitted `@trazum/mcp`
for the whole day that package existed, and now the next package added has to
appear in the README or `publish.test.js` fails.

The sweep also caught: `SECURITY.md` crediting zero dependencies to "the core and
the CLI" when three packages now carry the invariant; `CONTRIBUTING.md` counting
three workspaces and describing `phrases.ts` as "Spanish (and, in time, other)"
seven languages later; `docs/releasing.md` publishing two packages when the
workflow publishes three; the CLI README's command table listing five commands of
eleven; and `VERSIONING.md` freezing every API surface except the newest one —
the MCP server's tool names and input schemas are now part of the promise.
`RELEASES.md` and `ROADMAP.md` gained the account of everything that shipped
under 1.8.0's banner since their last update, provider layer and measurement
layer both.


**Automatic recovery from container rollbacks, at `scripts/recover-workspace.sh`
and a Claude Code SessionStart hook.** The remote environment this repository is
developed in restored its container disk to a stale snapshot more than twenty
times across two working sessions — every tracked file reverted, mid-work,
silently, always to the same commit. The first draft of this very script was
destroyed by the failure it exists to repair, one commit short of being safe.

**A script inside the repository cannot prevent that**, and this one does not
claim to: it reverts along with everything else. What survives a rollback is the
remote, so recovery is always fetch, reset to origin/main, reinstall — and the
script makes those one safe move. The rollback signature is precise (HEAD strictly
*behind* origin/main) and everything else is refused: a tree that is ahead is work
in progress, a diverged tree is a choice no script should make (exit 1), and
uncommitted changes are stashed by name before any reset rather than discarded.

`.claude/hooks/session-start.sh` runs it at the start of every Claude Code on the
web session — and only there, guarded on `CLAUDE_CODE_REMOTE`, because on a local
machine the tree is the developer's own and resets are not a hook's call.

Eleven behavioural tests drive the real script against real git repositories in
temp directories, including the one that matters most: the rollback also reverts
`.git`'s remote-tracking refs, so a script that compared HEAD to `origin/main`'s
*ref* would see them equal and announce nothing to recover. The fixture builds
exactly that state, and only a real fetch passes it. Thirteen mutants, thirteen
killed — among them "the stash disappears", "an ahead tree also gets reset" and
"a push appears", each the difference between a recovery script and a data-loss
tool with a reassuring name.

The definitive fix is platform-side — recreating the environment so it stops
restoring a stale snapshot — and is not something a repository can do to itself.

### Added

**`trazum prune <file> --cases <file>` — which few-shot examples earn their tokens,
measured rather than guessed.** The eleventh command.

The `redundant-examples` advisory asks a textual question: does this example look like
an earlier one? This asks a stronger one: does removing it change any answer? Two
examples can be textually unalike and teach the same thing, and the few-shot section
is routinely most of a prompt.

Leave-one-out against the prompt's own noise floor. Ask the full prompt twice to
learn how much the model disagrees with *itself*, then remove one example and ask
again; a removal that moves the answer less than that did no observable work. The
thresholds come from `evaluate`'s `verdictFor` rather than a second set.

**The only command that asks before spending.** The bill is `(2 + examples) × cases`
— 220 calls for a nine-example prompt over twenty cases. Without `--yes` it prints the
figure and stops, and it prints it *before* looking for a provider, so the cost is
visible without a key configured. `plannedCalls` is exported and pure, and a test
asserts the number it promises is the number spent.

**It reports "no effect on these inputs" and never "delete this."** An example may
exist for a case the given inputs do not contain. Nothing is edited, and the strength
of the claim is bounded by the inputs — which only the caller can judge.

`withoutExample` locates blocks by position rather than by
`prompt.replace(text, '')`: a copy-pasted few-shot section contains identical blocks,
and a text replace would match the first occurrence for both, so measuring the
removal of the second would describe the removal of the first.

Twelve mutants, twelve killed. Two defects came out of it that no test would have
found, because both were about *reading* the output:

- The first draft duplicated `agreement` from `evaluate.ts` as a bag-of-words F1
  while that one is Jaccard over normalised text — two different numbers under one
  name, with a comment in the copy claiming they were the same measure. `agreement`
  and `pooled` are now exported and shared, which makes the comment true.
- The report put a green tick beside "0% agreement without it", which reads as
  approval next to the one line meaning "leave this alone", and printed `Example:` as
  every block's identifying line. Both only visible by running it against a local
  stand-in provider, which is how they were found.

**`@trazum/mcp` — Trazum as an MCP server, so an agent can price and budget a
prompt before it sends it.** Three tools over stdio: `check_prompt`,
`optimize_prompt`, `list_models`. It runs on the caller's machine, one process
spawned by the client exactly like the CLI — no service to host, and no prompt
leaves the machine.

`check_prompt` has three outcomes rather than two, which is the reason it exists:
inside budget, over budget but the rules would fix it, or over budget with content
that has to be cut. A boolean throws away the actionable half.

**What it cannot do is the design.** No paths — every tool takes text, and the
package imports `@trazum/core` rather than `@trazum/core/node`, so the file-reading
capability is *absent* rather than unused. No network: `--suggest` and `eval` are
deliberately not exposed, because a tool an agent can invoke in a loop must not be
able to spend the caller's money. No writes.

**The JSON-RPC layer is written by hand, and that was not the first attempt.** It
used `@modelcontextprotocol/sdk` and thirteen tests passed against a real process.
Then `publish.test.js` refused it: every publishable package here carries no runtime
dependencies outside the repository, and the reason `security.test.js` gives — every
dependency is somebody else's code running on untrusted text — applies to an MCP
server with *more* force than anywhere else in Trazum. Relaxing the invariant at the
point it matters most would have been backwards, so the invariant won.

What that costs is stated in the module: the implementation covers `initialize`,
`notifications/initialized`, `tools/list`, `tools/call` and `ping`, and answers
anything else with `-32601`. It has been driven by a raw newline-delimited client in
the tests, not by every MCP client in existence.

Writing it by hand immediately produced the bug that justifies testing it: the
notification check sat *inside* the method switch, listing the two `notifications/*`
methods by name. A notification is defined by the **absence of an id**, not by its
method, so `{"jsonrpc":"2.0","method":"initialize"}` with no id got a reply —
a protocol violation some clients tolerate and others hang on, which is the worst
kind because it works in testing. A test that asked for the rule rather than for the
two names found it.

Seventeen mutants: fifteen killed by tests, two by the compiler. Four new guards in
`publish.test.js` and the release workflow had to be updated too — a third
publishable package needs a README, a LICENSE, provenance, and a publish step
ordered after `@trazum/core`, and every one of those was a test failure rather than
something anybody remembered.

**A `.pre-commit-hooks.yaml`, for teams who manage hooks with pre-commit.**
`scripts/pre-commit` stays the recommended path; this is for the repositories that
already have a `.pre-commit-config.yaml`, which in practice means Python shops whose
prompts live in `.py` string literals.

Two hooks rather than one with a flag: `trazum-check` is a gate and fails the
commit, `trazum-doctor` never does. Collapsing them would let a `--survey` argument
silently turn a gate into a report.

**It needs the first npm publish to work, and says so.** The `trazum` executable
comes from `additional_dependencies` rather than from installing this repository,
and the two alternatives were tried rather than reasoned about: installing the repo
root gives `Executable trazum not found`, because the root is a private workspace
root with no `bin`; adding a `bin` plus a `prepare` that builds gives
`Workspaces not supported for global packages`, because pre-commit installs with
`npm install -g`.

The mechanism is verified with locally packed tarballs standing in for the registry
— the gate fails a prompt over budget, passes one inside it, and the survey hook
exits 0. The registry lookup is the only untested part.

**An advisory for a schema the request could carry instead of the prompt.** The
one finding here that is not a trade-off.

A prompt that spells out its output shape in a fenced block pays for it in input
tokens on every call, and gets the weaker of the two available guarantees for the
money: prose asks the model to comply, a response schema makes the decoder comply.
`output_config.format`, `response_format`, `responseSchema` — every major API takes
the same shape as a request parameter. Moving it is cheaper *and* stricter.

**Reported, never done.** It is not a change to the prompt but to the code that
sends the prompt, and a rule that deleted the schema would leave a prompt asking
for a shape it no longer describes, sent by a client nobody updated — strictly
worse than the prompt it started from. A test asserts the schema and its fences
survive `--level aggressive`.

**The one way it could do harm, and what stops it.** A fenced JSON block is either
an output contract, which moves for free, or data a few-shot example needs, which
breaks the prompt if moved. Nothing guesses: a block counts only when a phrase from
the new `OUTPUT_CUES_BY_LANGUAGE` appears in the 240 characters before it. A schema
with no cue is left alone; a prompt in a language the dictionaries do not cover
raises nothing at all — a false negative, which is the right direction to be wrong
in, and stated as one rather than papered over.

The cue is matched through `normalizeForCompare`, so `FORMATO DE SALIDA —` and
`formato de salida:` are the same phrase, and it is quoted back **verbatim from the
prompt** rather than translated: it is the author's text, not the report's.

**The figure is attached and the uncertainty is in the words.** Trazum knows how
many tokens the block holds, which is reproducible; it cannot know from here
whether a given provider offers the parameter. Withholding the number for that
reason would be the wrong trade — it is right *if* the move is available — so the
advisory says plainly that it does not check. The same posture as
`model-downgrade`, which carries a figure and admits to being a keyword heuristic.

Thirteen mutants, thirteen killed. One found a real defect: the first draft
filtered out keys shorter than three characters, copied from the restated-format
detector where it stops a two-letter key matching a word in prose. Nothing is
matched against prose here, so all it did was undercount schemas whose fields are
called `id` or `ok`. Deleting it changed no test, which is what a line with no
reason looks like; it is gone, with a test for short field names in its place.

### Added

**`trazum doctor` finds preambles that could share a cache entry and do not.** The
first finding in this repository that no single prompt can produce.

Prompt caching is a byte-for-byte prefix match, so twelve prompts assembled from
the same system preamble — identical except that one has a trailing tab, another
reordered two bullets, and a third writes `E-Commerce` where the rest write
`e-commerce` — occupy twelve cache entries and share nothing. Every one of those
files is individually fine, which is exactly why no per-prompt analysis finds it.

`drift` says which kind of work it is: `whitespace` means the text already agrees
and a formatter fixes it; `wording` means somebody has to pick one.

Three refusals, and they are the design:

- **Grouped by the *first* block.** Caching matches from the start of the request,
  so prompts whose opening paragraphs differ share nothing however identical the
  rest is. Grouping on a later block would name prompts that can only be made to
  share a prefix by reordering their instructions — the one transformation this
  repository keeps out of `aggressive` for being dangerous.
- **Gated on the model's own cacheable minimum**, via a new exported
  `cacheableMinimum`. A model whose caching is `unknown` — what the live pricing
  overlay assigns to one it has never seen — yields `Infinity`, so nothing is
  reported. Telling somebody to unify a preamble across twelve files to enable
  caching their provider may not offer spends their afternoon, and unlike a wrong
  number on a report nothing later corrects it. The same directory against Haiku
  4.5, minimum 4,096, produces nothing for a 1,398-token preamble.
- **Prompts already byte-identical are not reported.** They share an entry today.

**No dollar figure, and that is a finding rather than a gap.** The saving lives in
the cache hit rate, and `cacheHitRate` is an *input* to the cost model rather than
something it derives — `--cache-hit-rate` applies one value to every prompt, so the
model has no term for how many distinct cache entries exist. Pricing this would
mean inventing how the calls are spread across the group, which is the one thing
here only the operator knows. A test asserts structurally that no field on the
result looks like money.

Thirteen mutants, eleven killed. The two survivors are equivalent rather than
uncovered — two independent guards cover the same case, so no test can distinguish
them — and both are documented in the test file so nobody removes one believing the
other carries the weight.

### Fixed

**A suite crashed on every clean checkout and exited 0.** `token-band.test.js` read
`fixtures/` with an unguarded `readdirSync`, and that directory does not exist until
somebody runs `scripts/measure-token-band.mjs`. So it threw ENOENT during suite
construction, node's runner printed the stack as a diagnostic, reported `fail 0` and
exited 0 — which is precisely what the top of that file forbids: *"'0 failures' from
a check that measured nothing is the most misleading thing a suite can report."* The
skip beneath it was written for a directory that exists and holds no per-provider
file; it never covered the directory being absent, which is this repository's normal
state. Found while diagnosing an unrelated `verify` failure.

### Fixed

**The README claimed prompts are never stored on any server.** They are, once the
prompt library is switched on: `trazum_prompt_versions.text` holds the text of
every saved version, and has since the library shipped. The library is off by
default, so the sentence was true in the configuration everybody develops in and
false in the one an operator opts into.

That is the same shape as the Content-Security-Policy that blocked analytics
nobody had enabled, found the same day — and worse in one respect. A broken policy
eventually breaks visibly for the operator who enabled it. A privacy sentence is
read once, by somebody deciding whether to trust the thing, and nothing ever tells
them it was wrong.

The section now states both configurations and names the column. Three tests keep
it honest: the schema is asserted still to store prompt text, so if that ever
stops being true the claim can go back to being absolute and a failing test says
so rather than the guard going quiet; the exact sentence that was wrong may not
reappear; and both configurations have to be identified by the thing that selects
them. `docs/accounts.md` was already accurate and is now linked from here.

Five mutants, five killed, the first of them the original defect put back verbatim.

**The new Content-Security-Policy blocked analytics, silently.** `connect-src
'self'` shipped in the same change as the nonce, and `Analytics.tsx` posts to
`https://eu.i.posthog.com`. An operator setting `NEXT_PUBLIC_POSTHOG_KEY` got a
page that rendered perfectly and sent nothing, with the reason visible only in a
browser console nobody was reading.

Nothing caught it because the key is unset in CI and in development: the
configuration where it breaks is the one no test exercises. Found by reading the
policy next to the component while reviewing an unrelated `posthog-js` bump —
not by any check in this repository.

The host now comes from `lib/analytics`, which both files read, so the policy
and the request cannot name different hosts again. With no key the policy is
byte-for-byte what it was; with one, `connect-src` gains exactly one origin.

It is an **origin**, never the configured string. A policy is built by joining
text with `;`, so a host of `evil.test; script-src *` would not have widened
`connect-src` — it would have appended a directive of somebody else's choosing.
`new URL().origin` discards everything a host source may not contain, and a
value that will not parse, or is not https, widens nothing at all.

Verified against a built server in both configurations: with the key set,
`connect-src 'self' https://eu.i.posthog.com` and nine of nine script tags still
nonced; without it, the previous policy unchanged. The badge keeps its own
`default-src 'none'; sandbox` either way. Nine mutants, nine killed.

**CodeQL was one merge away from being permanently broken.** Dependabot raised
`github/codeql-action/init` and `github/codeql-action/analyze` 3.37.6 → 4.37.6 as
two pull requests, because they are two sub-paths of one action and it treats
sub-paths independently. They are not independent: `analyze` reads the
configuration `init` wrote and refuses one written by a different version —
`Loaded a configuration file for version '4.37.6', but running version
'3.37.6'`. Each pull request was red on its own for that reason, which is the
harmless failure. The harmful one is merging both halves in either order and
stopping halfway: the security job goes red and stays red, while every other
check on every later pull request is green.

Both are now bumped in one commit, and a test keeps them together — grouped by
`owner/repo` rather than by a list naming `codeql-action`, because the next
action split this way will not be that one. Verified against the real thing: the
test was run with the workflow put into each of the two pull requests' exact
states, and failed on both.

The bump was not optional maintenance either. v3 targets Node 20, which Actions
has deprecated and is already force-running on Node 24.

### Added

**A Content-Security-Policy with a real `script-src`.** The web app had
`frame-ancestors 'none'` and nothing else — enough to stop clickjacking, and
nothing at all against script injection, so React's escaping was the only thing
between an XSS and full exploitation. It was documented as a limitation rather
than dressed up as a policy, and this is the limitation removed.

It needed middleware, because it needed a nonce. A policy worth having excludes
inline script, the App Router serves its flight data in inline `<script>` tags,
and a static header must therefore either allow `'unsafe-inline'` — permitting
exactly the attack the policy exists to stop — or break the app. The value has
to differ per response, and a config header is one string for every response.

`default-src 'self'`, `script-src` with a per-request nonce plus
`strict-dynamic`, `connect-src 'self'` to close the exfiltration channel,
`base-uri`, `object-src`, `form-action`. `'unsafe-eval'` only outside
production. `style-src` keeps `'unsafe-inline'`, which is the one concession and
the cheap one: a stylesheet cannot execute.

**Verified against a built server rather than asserted.** Nine of nine script
tags carrying the nonce from the header, a different nonce on every request, the
page rendering, and `/badge/<token>` keeping its own `default-src 'none';
sandbox` — tighter than the site policy, and excluded from the matcher rather
than trusted to win, because this repository already shipped one change that
silently replaced it with something looser.

Thirteen mutants, all killed — the last one only after the test was fixed. It
asserted `headers.set('content-security-policy'`, which
`response.headers.set(…)` two lines below also satisfies, so deleting the
**request** header left it green. Deleting it is not cosmetic: measured on a
built server, nine script tags and *zero* nonces. Next reads the policy off the
request to learn which nonce to stamp, so without that line the header is
perfect and the page is dead.

Two of the new tests were also caught matching their own comments — once on
`default-src 'none'` from the paragraph about the badge, once on `randomUUID`
from the sentence explaining why it is not used. Both now read the source with
comments stripped, which is the third time this repository has needed that.

### Added

**Bedrock and Vertex, with their credentials signed by hand.** The last two
providers whose auth is not a bearer token, and the reason there is no SDK here:
`@trazum/core` has zero runtime dependencies and a test that fails the build if
one appears, because every dependency is somebody else's code reading your
prompts. The AWS and Google SDKs are two hundred packages between them to
authenticate one request. SigV4 and the service-account JWT are about three
hundred lines, on WebCrypto so the browser-safe entry point stays browser-safe.

**Bedrock goes through Converse, not `InvokeModel`.** That is what makes it one
provider instead of six: `InvokeModel` takes each model family's own body shape —
Anthropic's `messages`, Meta's `prompt`, Amazon's `inputText` — so supporting
"Bedrock" through it means a 400 for every model nobody thought about.

**Vertex caches its access token.** A token lasts an hour and `--suggest` over a
directory makes one call per prompt; without the cache, forty prompts are eighty
requests, half of them to an endpoint that rate-limits. One cache per provider
instance, so two providers in one process cannot leak a token into each other's
requests.

Google's three HTTP-200 failures are now read by one shared function rather than
two copies. Two copies of "is this answer complete" is one copy too many when the
whole point is that a truncated rewrite reads like a finished one — and the error
names Vertex or Gemini, because those are different consoles.

**Neither has been exercised against the real service**, and neither has the
OpenRouter feed or the Gemini endpoint. This environment's network policy denies
all of them. What the tests prove is stated in the files themselves: the shape is
right, and the first real call is what proves it works.

**CodeQL caught a weak assertion, and the weak assertion was hiding a bug.**
Three host checks in the new tests used unanchored regexes, so
`/oauth2\.googleapis\.com/` would also have matched
`https://evil.example/?x=oauth2.googleapis.com`. Not a vulnerability — the URL is
one this code built — but an assertion that would pass against a request to the
wrong host is not testing what it names. Rewritten to compare parsed hosts and
paths.

Asserting the path exactly is what then surfaced the real defect: Bedrock model
ids contain a colon, AWS's own URLs carry it unencoded, and the comment in the
provider claimed `encodeURIComponent` leaves it alone. It does not — it produces
`%3A`. The signature matched either way, because the same string is signed and
sent, so nothing else in the suite could have noticed; the request would simply
have gone to a path AWS does not document. The colon is preserved now and the
slash is not, because a slash in a path is a new segment and a provisioned-model
ARN contains both.

Twenty-eight mutants: twenty-six killed, two documented equivalents. Three of the
kills only became possible after the tests got better — deleting the region from
the SigV4 key chain, deleting the service, and dropping the `AWS4` prefix from the
secret all left every test green, because the region and service *also* appear in
the credential scope inside the string to sign. "Different region, different
signature" is true of a signer whose key derivation is entirely wrong. The chain
is now derived a second time from the specification and compared.

The two equivalents are the header sort: removing it changes nothing while the
literal list is already in order, and reordering the literal changes nothing
while the sort is there. Doing both at once is killed, which is what shows the
ordering is actually asserted.

### Added

**A native Gemini provider**, and the reason it needs one while eleven other
providers do not.

`openai` in `TRAZUM_LLM_PROVIDER` is not "OpenAI", it is the wire format — so
OpenRouter, LiteLLM, Groq, Together, Fireworks, DeepInfra, DeepSeek, Mistral,
Cerebras, SiliconFlow, Ollama and vLLM are all a base URL away and always were.
The README now names each one with its exact URL, because true and undocumented
is not much better than false.

Google's API is a different document: the system prompt is `systemInstruction`
rather than a turn, and the answer is a candidate's parts. What actually earns
it a function is that **three of its failure modes arrive as HTTP 200** — a
blocked prompt (`promptFeedback.blockReason`, with no candidates at all), a
truncated answer (`finishReason: MAX_TOKENS`), and a candidate with no text. A
client that checks `res.ok` treats all three as success, and the second is the
worst thing that can happen to a rewrite pass: half an answer reads exactly like
a whole one. All three throw.

The key goes in `x-goog-api-key`, not the `?key=` that Google's own examples
use, which writes a live credential into every proxy log and `Referer` between
here and there. The model name is escaped into the path, and the endpoint goes
through the same gate as every other outbound call.

Eleven mutants, all killed — one of them by the type checker, which is a real
kill: removing the empty-text guard stops the function compiling because the
return type stops being a string.

### Added

**`--pricing-live`: prices from OpenRouter instead of a table somebody typed.**
The bundled catalogue is stale the day after it is written and only ever covered
the providers whoever wrote it reached for — so a user on Groq or Together got no
figure at all, from a tool whose entire output is figures. OpenRouter publishes
price and context window for hundreds of models across dozens of providers, as
data, at a URL.

Opt-in, because it is a network call: rule 1 is that no feature makes one a
prerequisite for optimising a prompt. The CLI fetches and hands the core a
value; `openrouterOverlay` is a pure transformation, so it is testable without a
network. Through `checkedEndpoint` and `SAFE_FETCH_INIT` like every other
outbound call here, so redirects are refused rather than followed to the
metadata network. A `--pricing` file still wins: somebody who wrote prices down
meant them.

**What that feed does not publish, and what is done about it.** It has no
opinion on whether a model has prompt caching or the minimum prefix it caches
at — and that is the input to the largest saving Trazum reports, an order of
magnitude above what the trimming rules recover.

So `CachingMode` gains `unknown` and `cacheMinTokens` becomes nullable, and a
model that arrives from the feed carries both. The caching advisory declines,
and `trazum models` prints a dash rather than a zero. The two available lies are
symmetrical and both worse than silence: claim caching works and Trazum offers a
saving nobody can buy at any price — the Mistral bug in a new costume — and
claim it does not and Trazum hides the biggest saving there is.

`Capability` and `tier` gain `unknown` for the same reason, so a model whose
capability nobody recorded is neither recommended to somebody else nor told it
is overpowered. For a model the bundled catalogue already has, only price in,
price out and context window are refreshed: the rest was written by somebody who
looked it up, and replacing a researched fact with a blank is not a refresh.

### Fixed

**An added model could carry no `capability` at all.** `applyPricingOverlay`
required six fields for a model the bundled catalogue does not have, and
`capability` — a required field of `ModelPricing` — was not among them, so
`as ModelPricing` produced an object the type says cannot exist. Now required,
which is why two overlay fixtures needed a line.

Ten mutants over the new code; nine killed and one documented equivalent. Two of
the kills were bugs of mine rather than of the tests:

- The unknown-capability guard was written as an early `return`, which skipped
  every advisory *after* the model check — output-dominated, contradictory
  instructions — none of which has anything to do with a model's tier.
- `TIER_ORDER.unknown` was set above every real tier, which makes the downgrade
  comparison *true* for every prompt; the only thing then standing between that
  and a recommendation was an unrelated provider filter. Two accidents covering
  for each other is not a design. It is `-Infinity` now, so the ordering carries
  the rule and the guard beside it is deliberate redundancy — that is the
  equivalent mutant.

### Fixed

**The token-band measurement could never have passed, and nobody could know.**
`measure-token-band.mjs` hashed the corpus with NUL separators and
`token-band.test.js` hashed it with spaces, so the two digests could not match.
The first real measurement would have failed its freshness check with *"the
corpus changed since it was measured — re-run scripts/measure-token-band.mjs"*
— advice that produces the same failure however many times it is followed.

It went unnoticed because running the script costs an API key nobody had spent.
The one workflow that discharges this project's central claim had never been
executed end to end, and the check guarding it was broken in the way that
surfaces only the first time it matters.

Fixed structurally rather than by making the copies agree, since two copies
agreeing is the state it was in when it broke: `scripts/corpus-digest.mjs` is
the single implementation and both sides import it. A guard asserts neither has
grown a second one — and it builds its own needle at runtime, because written as
a literal the assertion matches its own source and fails on the file it defends.

**And a fourth raw control byte in a source file.** Writing that shared module
put a real NUL into it on the first attempt, exactly as happened in
`reorder-properties.test.js`, `github.ts` and `measure-token-band.mjs` before
it. Caught this time by checking the bytes rather than the diff. The separator
is written as an escape.

### Added

**`measure-token-band.mjs --provider deepseek`**, and the distinction that makes
it safe to have.

`±15%` is the estimator's accuracy against *Claude's* tokenizer — the family it
was calibrated on, and the one every published claim refers to. Trazum prices
seven providers with that one estimator, and how far off it is on the others is
a question [ROADMAP.md](ROADMAP.md) has open with a decision resting on it:
*within 5% across families and a real tokenizer dependency is not worth taking;
40% out and it is.*

So each provider writes its own fixture and only Anthropic's governs the
published band. A cross-family fixture asserts corpus freshness and coverage,
prints the error per text type, and asserts nothing about a band it was never
calibrated for — with a guard that it cannot claim otherwise. Reading a DeepSeek
number as the published band would be the same class of error as calling a
release published because a changelog heading exists.

Two things the script now says out loud before sending anything: DeepSeek has no
free counting endpoint, so every sample is a real completion with
`max_tokens: 1` and the prompt half is billed; and a run against it does not
discharge the ±15%.

### Fixed

**`blame` reported a git it could not run as a repository with no history.**
`git()` collapsed every failure into `null` — git missing, git exiting non-zero,
and *the process failing to start at all* — and `revisionsFor` turned `null`
into `[]`. So a fork the kernel refused with `EAGAIN`, which is a fact about the
machine for one instant, reached the author as `git has no commits touching
p.txt`: a confident claim about their repository, made without having asked it
anything.

That is the shape of [#58](https://github.com/Davmunrey/Trazum/issues/58) — zero
rows, exit 0, once on CI, never reproducible — and it is the shape that cannot
be diagnosed afterwards, because its output is identical to the true answer.
Failing to run git now throws `GitUnavailableError`; an empty history still
returns an empty list. Transient spawn failures (`EAGAIN`, `ENOMEM`) are retried
once, bounded by the loop rather than by a condition inside it.

**This does not prove `EAGAIN` caused that CI failure.** Nobody knows, and the
issue was honest about it. What changed is that this failure can no longer
disguise itself as an empty history.

Eight mutants, all killed, and two of them were the tests being wrong rather
than the code. The first version of the regression test drove the CLI with
`PATH` stripped and passed against every mutant including the bug restored,
because `blame` checks `gitAvailable` before asking for revisions — the process
never reached the code under test. The second was worse: mutating the retry into
an unbounded loop did not surface as a surviving mutant, it surfaced as the
suite hanging until the runner killed it, which in CI is a job that burns its
whole timeout instead of failing in a second. The loop is now bounded by
construction.

**A broken anchor in the README, and nothing looking for one.**
`#reordering-for-the-cache-reorder` pointed at a heading whose real slug has
three hyphens, because GitHub turns `cache: --reorder` into `cache---reorder`. A
dead anchor renders as ordinary text and silently does nothing, so no other
check could see it. All 25 in-page links are now verified.

**Documents that had gone out of date with the release.** `RELEASES.md` claimed
1.8.0 was on npm and installable; nothing is published, there is no tag, and
`npm view @trazum/core` returns 404. The guard that exists to catch exactly this
missed it because it read "is there a `## X.Y.Z` heading in the changelog",
which is *a release cut in this repository*, not *a package on a registry*.
Preparing 1.8.0 satisfied it and switched the assertion off. It now asks git for
a tag, which is what `release.yml` actually triggers on.

The same claim is now checked in both directions across `RELEASES.md` and both
package READMEs — the ones that open with `npm install @trazum/…` and *are* the
npm page. Untagged, the notice is required; tagged, it is forbidden. A note that
has to be removed by hand at release time is a note that survives three
releases.

`ROADMAP.md` and `docs/releasing.md` follow: the `release` environment exists
and has been exercised by a dry run, the first publish has to be made by hand
because a trusted publisher is configured on a package page that does not exist
until the package does, the manifest count is four rather than three, and the
action-pin step describes the guard as it now works.

### Changed

**The README is navigable.** 1,431 lines with no way in: five badges, a table of
the ten commands and what each answers, and a contents list. Nothing was
removed.

## 1.8.0

**The first version published to npm**, and it collapses everything since the
1.0.0 milestone into one release. Those milestones are numbered 1.1.0 to 1.8.0
in [ROADMAP.md](ROADMAP.md) and none of them was ever tagged or uploaded — the
scope did not exist. Publishing as 1.8.0 rather than 1.1.0 makes the version on
npm agree with the record in this repository, which is the only thing the number
has to do. 1.1.0 through 1.7.0 will never appear on the registry, because they
never existed anywhere a consumer could reach.

### Added

**`--cache-suggestions`: `--suggest` answers from disk when the question has not
changed.** A content-addressed cache under `$XDG_CACHE_HOME/trazum/suggestions`,
keyed on provider, model, system prompt and the author's prompt, kept for seven
days. Re-running `--suggest` over a directory after editing two files out of
forty makes thirty-eight fewer requests. `trazum --clear-suggestion-cache`
empties it, with no command and no config read.

Opt-in, and printed on stderr every time it answers: a hit is a week-old
response from something that is not a pure function, and the other three
model-touching flags all make you ask twice.

The **raw response** is stored, not the checked suggestions. All five checks in
`suggestRewrites` — `before` appears byte for byte, nothing touches protected
content, `after` introduces none, it actually saves tokens, overlaps are dropped
— re-run on a hit, so an answer from last week is judged by this week's rules
instead of replaying an older version's verdict. Same reasoning as recomputing
token counts on read rather than storing them.

Files are 0600 in a 0700 directory that this code creates. The cache holds
prompt text, which is the most sensitive thing the tool touches.

**This is not the API's prompt caching, and the reason is a number.** The
roadmap item asked for `cache_control` on the stable prefix. The minimum
cacheable prefix is 512 tokens on the most generous model and 4,096 on others;
Trazum's suggest system prompt is 291 tokens; and a prefix below the minimum is
*silently* not cached — no error, `cache_creation_input_tokens: 0`. Everything
after the system prompt is the author's text, which differs on every call, so no
placement of `cache_control` helps. Marking it would have looked like an
optimisation, cost one line, changed nothing, and been undetectable.
`suggest-cache.test.js` measures the prompt against the published minima per
model, so if a model ever lowers its floor below 291 the claim fails loudly
rather than staying in a comment that has quietly stopped being true.

**A README badge at `/badge/<token>.svg`.** The share link, as a picture.

It rides on the share token rather than inventing one. A badge is strictly less
information than the page at `/c/<token>`, and a second capability for a smaller
disclosure would have been two things to revoke instead of one.

**It is recomputed on every load**, like the page. A badge is the single most
likely artefact to be looked at a year from now, and a stored number is the most
likely thing to have quietly stopped being true — which is the failure mode of
every hand-written "saves 30%" line in every README.

**It always answers 200.** Unknown, expired and malformed tokens all render the
same neutral badge. A non-2xx makes GitHub's image proxy show a broken image,
telling every reader of the page that something is wrong without saying what; the
three cases have to be indistinguishable anyway; and a revoked link should stop
reporting rather than announce that it used to exist.

The document is inert — no script, no `foreignObject`, no external font or
stylesheet — and served with `nosniff` and `default-src 'none'; sandbox`, because
an SVG from your own origin is a *page* when navigated to rather than embedded in
an `<img>`. Everything interpolated is XML-escaped even though the only inputs
are numbers this route computed: "no untrusted text reaches here" is a property
one commit can break.

Cached for five minutes, unlike everything else behind a share token. Safe
because the token is in the URL, and necessary because a README badge is fetched
by every reader of the page through an image proxy.

Nineteen mutants, nineteen killed, after three survived a first pass and each
was a test that had only asked the easy half:

- **Only the label was tested for escaping**, never the message — so deleting
  the message's escape changed nothing any assertion could see. Both are
  constants or numbers today, which is exactly why one of them went untested.
- **`textWidth('WWWW') > textWidth('iiii')`** holds whether or not capitals get
  their own width, because `i` is narrow either way. Compared against `wwww` now.
- **The UUID-guard problem again**, one route over: a malformed token produces
  the same neutral badge whether or not it is refused before the lookup, so the
  test watches whether the store was asked rather than what came back.

Also two assertions that were wrong rather than the code: one required the SVG to
contain no `http` at all, which its own XML namespace fails, and one required no
`"/>` anywhere, which every `<rect>` ends with.

**A deployment overview at `/admin`.** The last of the team features, and the one
whose hardest part was deciding what it is allowed to claim.

The request was "aggregate spending across the org", and neither half of that
phrase survives contact with what Trazum knows. **It has never seen a bill, an
API call or a token counter** — it reads prompt text and measures it. A dashboard
headed "spend" would print a figure nobody can reconcile against an invoice, and
the rule here is that a number a reader cannot reproduce by hand does not get
printed. So the headline is input tokens, which is a property of a prompt alone,
and the second figure is what running the rules would remove — measured by
running them, the standard `trazum rank` is already held to. No score. The
disclaimer sits above the first number rather than in a footnote, because a
footnote is read second.

**And there is no organisation model**, which is also a decision rather than an
omission: a self-hosted instance *is* the team. The alternative was reading
GitHub organisation membership, which would mean asking for `read:org` on every
sign-in so that some deployments could skip an environment variable. Sign-in asks
for `read:user` and nothing else, and keeping that true is worth more than the
convenience.

`TRAZUM_ADMINS` is unset by default and unset means the page **does not exist** —
`404`, identical to the `404` a signed-in non-admin gets, because a `403` would
confirm a dashboard is here and that they are outside it.

It reports counts, prompt names and logins, and never a line of anybody's prompt.
An admin is an operator, not an auditor of what their colleagues wrote, and
"which prompt is expensive" is answerable from a name. One overview reads at most
500 prompts; past that the page states both numbers instead of reporting a total
that quietly covers part of the deployment.

**A guard caught its own author.** `census` was first written as a method on
`PromptStore`, with a comment calling itself "the documented hole" in the rule
that every lookup binds an owner — and the guard written to enforce that rule
failed on it immediately, which was the guard being right. A rule with an
exception written inside it is a rule somebody adds a second exception beside. It
moved to its own `AdminStore` interface, the way `ShareStore.findShare` already
had, so "every `PromptStore` lookup binds an owner" stays a true sentence rather
than a mostly-true one.

Fixing that surfaced one more: the guard read `PromptStore` by slicing from its
declaration **to the end of the file**, which was fine while it was the last
interface there and reported `AdminStore.census` as a hole the moment it was not.
Third unbounded slice in this repository to read past the thing it meant — the
previous one read a `returning` list into an `on conflict` clause.

Sixteen mutants, sixteen killed — but only after three of them survived the first
pass, and all three were tests that had encoded the easy case:

- **A GitHub username may be entirely digits.** A version of `adminSource` that
  checked the numeric-id list against the login as well passed everything,
  because no fixture had an account whose username collided with somebody's id.
  It does now: listing `1001` means boss's account and must not admit whoever
  registered the *username* `1001`.
- **Ranking by size and ranking by waste give the same answer** whenever the
  biggest prompt is also the most wasteful, which was the only case the fixture
  had. A long prompt of unique prose against a short one full of known filler
  tells them apart — and telling them apart is the whole value of the ranking,
  because the long one is what an admin would have guessed.
- **"Some `notFound()` precedes the census call"** stayed true when the admin
  guard was deleted, because the signed-out guard above it kept the ordering.
  Each of the four guards is now required by name.

One more fixture lesson, the same one as always: the prompt this suite used to
represent "wordy" was *"You should always make sure to carefully read the entire
text below"*, which reads bloated and which no rule touches. Every savings
assertion was comparing zero to zero.

**Share links for comparisons.** `POST /api/shares` publishes a comparison at
`/c/<token>`, readable by anyone holding the URL with no account at all.

This is the first thing in Trazum with a bearer-capability security model, and
almost every decision follows from naming that honestly rather than treating it
as "the prompt library but public".

**The token is the secret**, 32 bytes from the same CSPRNG that mints session
cookies — not a slug, not a short id, not derived from the content. Stored in the
clear, and the asymmetry with sessions is deliberate: hashing a session token
means a leaked table is hashes rather than live logins; hashing this one would
protect nothing, because the row it points at *is* the secret.

**Reading writes nothing.** No view counter, no last-seen column, and the schema
says why it does not have one. An unauthenticated request that can cause a write
is a lever, and "how many people opened this" is not worth being one.

**Expiry is a default, not an option.** Thirty days unless you choose 7, 90 or
never. A link that never expires is a permanent publication made by somebody
thinking about the next ten minutes, so `never` exists and has to be asked for.
Expired is indistinguishable from never-existed — "this link has expired" tells a
stranger the token was real, which is one bit more than they had.

**Kept out of search twice**, by two defences that fail differently: `noindex` in
the page metadata stops indexing, `robots.txt` stops the fetch. Plus
`no-referrer`, because the token is in the path and one outbound navigation would
otherwise put the whole capability in someone else's access log.

**The settings are canonicalised from a whitelist.** They are replayed into the
core on every future view, by a reader who did not choose them and cannot see
them, so the parser builds a fully-populated object from known keys rather than
merging over what arrived. Numbers are clamped — refusing a whole publication
over a call volume of −1 helps nobody — but the model id and rule ids are
rejected outright, because a silent fallback would price the comparison against
something the sharer did not pick.

The warning lives **above** the button and is always visible. A confirm dialog is
a thing people dismiss; a sentence above the control is a thing they read while
deciding.

Eighteen mutants, eighteen killed — but only after the pass found the one that
mattered most:

**The share URL could have been built from the `Host` header and no test would
have noticed.** Every request in the suite was constructed on the same origin as
`TRAZUM_PUBLIC_URL`, so a header-derived URL came out byte-identical and the
assertion passed either way. The failure it was hiding is not cosmetic: a link
built from a client-supplied host points wherever the client said, and is then
handed to a colleague by somebody who trusted it. There is now a request whose
`Host` deliberately disagrees with the configuration.

Also: a test asserting the shared page never reaches for
`dangerouslySetInnerHTML` failed on the page's own comment saying exactly that —
the second time this repository has made that mistake, after a schema comment
about `force row level security`. Both tests now strip comments before reading
the source.

**A prompt library with version history.** The first thing accounts were for.

Everything about it follows from one question: *what did last month's edit do to
this prompt?* A store that answers that has to be append-only, has to price every
version the same way, and has to be unable to show one person another person's
work. Each of those is a decision that was cheaper to make now than to migrate to.

**Append-only.** Saving over a prompt writes a new row; nothing updates one. A
history you can edit is not a history.

**A save that changed nothing writes nothing** and answers `200` with
`saved: false` — not an error, because pressing Save on unedited text is a
reasonable thing to do, and not a duplicate row, because the history's only job
is showing what moved. The UI turns that flag into "no changes to save"; a screen
that says "Saved" when nothing was written is training its reader to distrust it.

**Token counts are recomputed on read, never stored.** This is the decision that
looks wrong from a caching point of view and is not. The history is a chart. Two
versions saved a year apart, each priced by the estimator of its day, produce a
line that moves when the estimator changed and the prompts did not. Recomputing
every version with today's costs a little and is the only way any two of them are
comparable to each other.

**Somebody else's prompt is 404, not 403.** A 403 confirms the id is real, which
turns the route into an oracle for enumerating other people's libraries, and a
legitimate caller can do nothing with the distinction because they were never
getting in. Enforced in the query rather than after it: every store method takes
an owner id and puts it in the `where` clause. `PromptStore` has no lookup that
takes an id without an owner at all, so a handler *cannot* tell "not yours" from
"not there" — the mistake is unrepresentable rather than untested, and a guard
pins that shape because the way it comes back is somebody adding a convenience
method.

Ceilings — 200 prompts, 500 versions, 100k characters — are refused loudly rather
than trimmed silently. Evicting the oldest version to make room deletes the record
the prompt was kept for.

Seventeen of eighteen mutants killed, including every ownership predicate in both
drivers. Three findings from the pass, all of which had passed the suite first:

- **The Postgres prompt driver had no tests at all.** The route suite runs
  entirely on the memory driver, so every ownership assertion in it passed
  against SQL that selected by id alone. `prompts-postgres.test.mjs` now drives
  all six methods and sweeps the recorded statements mechanically: anything that
  names a prompt must also bind an owner, and anything that binds one must
  compare it.
- **The UUID check on the path segment looked decorative and is not.** Every
  test around it asserted the outcome — 404 — which holds with the check removed,
  because the memory driver answers `null` for any key it does not hold. Bind
  `'../../etc/passwd'` to a `uuid` column and Postgres raises, which is a 500
  where the caller should have had a 404. What distinguishes the two is not the
  answer but whether the store was asked, so that is what the test now watches.
- **One mutant survives and is documented on the line it survives.** The memory
  driver's version sweep on delete changes nothing observable: the prompt is
  gone, ids are UUIDs, nothing will ask again. What it costs is memory — which is
  exactly the kind of line somebody deletes during a cleanup because no test
  complained.

### Changed

**The prompt lives at page level now, next to the scenario.** The Library tab has
to save the prompt that is on screen and put a restored version back on it, and
neither is possible for a sibling holding its own copy — two components with two
copies of "the prompt" is how a library quietly stores something else. Same
reasoning that moved the usage scenario, same shape: a hook the page owns.

**A tab test counted tabs when it meant to check a property.** "Keeps both tabs
mounted" asserted there were exactly two `TabsContent` and that both were
`forceMount`, and it failed the moment a third arrived — on a tab that
deliberately is not one, because the library holds nothing the server does not
already have and is better re-read on return. Rewritten to assert the actual
invariant: a tab holding state the server does not have must stay mounted, and
anything opting out has to be named. Mutation-tested both ways.

**Sign in with GitHub.** Optional, off by default, and the first thing in this
repository that stores anything about a person.

The reason it exists is that everything a team wants — a prompt library with
history, a budget somebody else set, an organisation's spend in one place —
needs an answer to "who is asking", and there wasn't one. So this change is the
foundation and deliberately not the features: identity, a session, and a store
those can be built on.

Off by default is load-bearing rather than polite. Most people running Trazum
run it for themselves, and a tool that suddenly requires a database to start is a
tool they stop running. With no `TRAZUM_GITHUB_CLIENT_ID`, `authConfig` reports
disabled with a reason, `/api/auth/*` answers 503 naming the variable to set, and
the header renders nothing at all. Not a disabled button: a disabled button is a
promise, and the endpoint behind it is a 503.

**No framework.** The OAuth flow is about two hundred lines — authorize,
exchange, read the profile — and hand-writing it keeps `apps/web` at one new
dependency (`postgres`, which has none of its own) instead of a tree. The three
things a framework would have gotten right are gotten right here, and each is
worth naming because each looks like a detail:

- The redirect URI is built from `TRAZUM_PUBLIC_URL` and never from a request
  header. `Host` is client-supplied; a callback built from it lets an attacker
  send a victim to `/api/auth/github` with `Host: evil.example` and collect the
  authorisation code. GitHub's own callback allowlist would catch that one case,
  which is not a reason to depend on one checkbox in someone else's console.
- `state` is verified **before** the code is exchanged. Verifying it afterwards
  passes every functional test and defends against nothing, so the order is
  asserted directly: the test counts calls to a recording `fetch` and requires
  zero.
- The `__Host-` cookie is cleared as `Secure` even when the deployment is not.
  A `__Host-` cookie without `Secure` is rejected outright — including the one
  meant to delete it — so getting this wrong makes sign-out appear to work and
  do nothing.

Sessions are opaque 256-bit tokens rather than signed claims, stored as SHA-256.
Revoking one is a `DELETE`, which is the property a JWT does not have, and a
leaked table is hashes rather than cookies. Sign-out deletes the row before
clearing the cookie; the other order leaves a live session the browser has
forgotten — invisible, unrevokable, valid for a month.

Two store drivers behind one interface. Memory is the default and reports
`ephemeral: true`, which `/api/auth/session` passes to the browser and the header
draws as "temporary session" — because on a platform that runs several instances
the alternative is being signed out at random with no explanation. Postgres is
the other, and its schema enables row level security with no policies: that
blocks the REST layer platforms like Supabase put in front of `public`, while
Trazum, connecting as the table owner, is exempt. `ENABLE` and not `FORCE` —
`FORCE` applies the policies to the owner too and locks the app out of its own
tables, which is the stricter-looking word and the one that takes the site down.

Twelve mutants, twelve killed: state checked after the exchange, the `__Host-`
delete without `Secure`, the redirect filter without `//`, the expiry boundary at
`<` instead of `<=`, the sweep that could delete a live session, an upsert that
resets `created_at`, a token exchange that trusts the HTTP status (GitHub answers
a bad code with 200 and an `error` field), storing the raw token, accepting HTTP
off localhost, a cacheable session response, and a cross-origin sign-out.

Honest about the gap: the Postgres driver has never run against Postgres. Its SQL
is checked against a recording tagged template, which catches a mistyped column, a
value bound in the wrong position and a `DELETE` whose predicate is too wide, and
cannot catch SQL that Postgres would reject. `docs/accounts.md` says so, and lists
the rest of what is not covered.

### Added

**Guards that the published packages are actually public.** A scoped package is
*restricted* by default, and this project is open source — so the two manifests
carry `publishConfig.access: "public"` and both release steps pass
`--access public`. Both were already correct; nothing checked either.

The failure that would have gone unnoticed is the quiet one. On a free account a
missing `--access public` fails the publish, which is fine. On a paid one it
**succeeds** and uploads a package nobody outside the org can install — a
release that looks entirely normal, and unpublishable after 72 hours.

Three assertions: every publishable manifest declares public access; the release
workflow publishes exactly the publishable set, each with `--access public` and
`--provenance`; and nothing is publishable by accident, with `apps/web` staying
`private: true` so a Next application never reaches a registry as though it were
a library.

The set of workspaces is now derived from the root `workspaces` globs rather
than listed. It had been a hardcoded pair, which made the whole file blind to
any workspace added after it was written — a new publishable workspace now
fails the suite until somebody decides what it is. Eight mutants, all killed.

**Route invariants, checked against every route rather than the ones with
tests.** Five API subsystems landed in five consecutive merges — auth, share
links, the library, the admin overview, the badge — each getting its rules
right because the author remembered them. Nothing was checking, and "remembered
five times" is not a property.

Two invariants, read from source: every state-changing handler in a route that
reads credentials reaches a same-origin check, and any response a route builds
by hand carries `no-store`. Routes are walked from `app/api`; the exemption for
`/api/optimize` and `/api/compare` is derived from their reading no cookie and
no session, not from a list, so either one stops being exempt the moment it
reads one.

**The gap this closes is measured, not asserted.** Deleting the same-origin
check from `DELETE /api/prompts/[id]` passes the entire pre-existing web suite:
every write funnels through one `requireCaller`, so the behavioural tests prove
*that function* refuses a hostile `Origin` and prove nothing about whether a
given handler asked it to. Five such mutants survive everything except the new
file. Going the other way, changing `requireCaller`'s condition to `if (false)`
survives the new file — `sameOrigin(` is still there to match — and is killed by
the behavioural tests. Neither layer is redundant; neither covers the other's
mutant. Ten mutants, all killed once both layers run.

Both guards were wrong before they were right. The cache-control one originally
asked whether a route *used the response helpers*, which is a proxy for the
property rather than the property, and failed against `/api/auth/session` — a
route that sets `no-store` correctly on both branches without them. Its stated
premise was false too: `jsonError` and `redirect` set no cache-control at all,
and the comment claimed they did. They carry no session data, so that is fine;
asserting it without checking was not.

### Fixed

**A rate limiter that could be turned into a way to take the deployment down.**
The expired-entry sweep ran on *every* miss once the map passed `sweepAbove`,
and a miss is any key not seen before. `clientKey` reads `x-forwarded-for`,
which this module already documented as freely spoofable — so an attacker
rotating that header made every request a miss, and every request an O(n) walk
of a map their earlier requests had grown. Almost nothing was reclaimed while
they did it, because entries in the current window have not expired yet.

Measured rather than reasoned about:

```
                 before                            after
N= 20000    1,410ms   149,985,000 compares      14ms   10,001
N= 40000    7,576ms   749,975,000 compares      19ms   10,001
N= 80000   46,759ms 3,149,955,000 compares      79ms   10,001
```

Doubling the requests multiplied the work by 4.4, then 7.6. Eighty thousand
requests — not an interesting number of requests — was 46 seconds of a
single-threaded event loop during which the deployment serves nobody. The
limiter answered every one of them correctly; it just answered quadratically.

Sweeping at most once per window makes the total linear. Memory is unchanged
and worth stating: a window's worth of distinct keys is held until the next
sweep, which is inherent to counting per key rather than a consequence of the
fix, and it does not accumulate across windows.

The limiter now exposes a `sweeps` count, so the test asserts the sweep's
frequency instead of trusting a comment about it — the bug was invisible from
outside, since every verdict it gave was right. Eight mutants, all killed.
Asserted on the count and not on elapsed time: a timing assertion on shared CI
hardware is a flake generator, and the count is the thing that changed.

**The roadmap said the web app's features would deliberately never be built.**
`ROADMAP.md` listed **Prompt library** under "Under consideration" with the
reasoning *"storing prompts is a different product, and one that would mean
sending them to a server. Trazum's privacy story is that it never does"* — while
the app shipped a prompt library with version history, share links, an admin
overview and a badge. Seven user-visible surfaces existed and the document
mentioned none of them, one of them by explicitly explaining why it never would.

That reasoning was also a conflation worth naming rather than deleting. Rule 1
binds the *optimiser*: the CLI sends nothing, needs no account and works with the
network unplugged, and none of that changed. It never said nobody may run a
service that stores what they chose to save to it. The entry is struck through
and kept, because a roadmap that silently removes what it went back on has no
record of having gone back on anything.

Added: milestone sections for the account-and-sharing work and for
`--cache-suggestions`, and a guard deriving every route from `apps/web/app` and
requiring the roadmap to name it. The guard is deliberately narrow — it proves
the document knows a surface exists, not that what it says about it is true —
and it caught two of its own defects first: a substring match let `/api/admin`
satisfy `/admin`, and `/c` counted as documented by accident because two
characters occur inside almost any path.

**Japanese is now stated as a deliberate absence rather than a gap.** There is no
Japanese trimming dictionary and one is not planned — deciding a phrase says
something in more words than it needs is a judgement about the language. But
`--reorder`'s backward-reference list *does* cover Japanese and Chinese, matched
without word boundaries. Those are different claims: refusing to rearrange needs
only enough of a language to spot a phrase pointing backwards, while offering to
shorten means asserting the shorter version still asks for the same thing.

**The help-text guard could not see a flag that belongs to no command.** It
derives its list from the unknown-flag rejection message, which is printed
per-command — so `--clear-suggestion-cache`, an errand that runs with no command
named, was documented nowhere in either locale and the suite stayed green. A
second guard now reads `main()` for flags handled before dispatch and requires
each in the help. Both are derived rather than listed, which is the reason the
first one exists: a hardcoded list is how `--reorder` shipped fully implemented
and absent from `--help`.

That flag also did not work. It was handled below the branch that prints usage
when no command is given, so `trazum --clear-suggestion-cache` printed the help
and cleared nothing — silently, which is the failure mode the flag list is there
to prevent. Found by an end-to-end test counting requests at a socket rather
than by reading the code.

**A control-character filter written with control characters.** The first draft of
the `?next=` guard spelled its character class literally, which put a NUL and a
run of C0 bytes into `github.ts` and made the source file binary — the same defect
this repository shipped once before in `reorder-properties.test.js` and had to be
told about by a guard. Replaced with a code-point comparison, which cannot carry
the bytes it is checking for. An intermediate repair was worse: a class written as
`[ -]` matched space through hyphen, so every path with a hyphen in it — which is
most of them — was silently redirected to `/`. Both are pinned by tests.

**`RELEASES.md` said "Nine commands" for two merges after there were ten.** The
guard written to catch exactly this drift read `README.md` only, so correcting the
README was mistaken for correcting the count. Widened to both files — and then
found to be blind anyway: the pattern was lowercase-only and the sentence starts
with a capital, so `Nine commands` had never been visible to it. Both fixed, and
the guard mutation-tested in both files and both cases rather than trusted.

Widening it also made it cry wolf on "the two commands that answer *which prompt
is worth an afternoon* and *who made this one expensive*", which is correct prose
counting a subset. A restrictive `that` or `which` now marks a subset the way
`other` already did — a guard that fails on true sentences gets deleted.

### Changed

**Rate limiting is one function with private buckets.** Both API routes carried a
copy of the same sliding window, with a comment on one saying the duplication was
deliberate because a shared `Map` would let comparisons spend the optimise budget.
That is right about the state and wrong about the code: `createRateLimiter` hands
each caller its own `Map`. The sign-in routes were going to be the third and
fourth copy.

Its limit is thirty a minute per address rather than the ten a sign-in route
appears to need, because the limiter keys on an address and not on a person: ten
is generous for an individual and refuses the eleventh person behind a corporate
NAT.

**The price list says how old it is, not just when it was checked.** `doctor` and
`models` print `Prices reviewed 2026-06-24 (46 days ago)`.

Every dollar figure Trazum prints descends from that list. The date alone makes the
reader subtract against today to learn the one thing they wanted — whether to trust
the figures — and a reader who is not already suspicious will not bother, which is
exactly the reader the line is for.

No threshold and no warning: "stale" would be a number nobody could check, and the
age is the fact. `reviewAgeDays` takes `now` as a parameter, for the reason
`computeSavings` takes a `Date`. Compared at UTC midnight on both sides, so the
answer does not shift by one depending on what time of day the command runs, and so
a daylight-saving gap cannot turn two days into one.

A future date reports unknown rather than negative days — that is a typo or a wrong
clock, and "reviewed in −12 days" reads as a bug either way.

**A guard that no test could distinguish, until one could.** Deleting the
`YYYY-MM-DD` format check failed nothing: every malformed value it had been checked
against is `NaN` to `Date.parse` regardless. The input that separates them is
`"2026-06"` — `Date.parse("2026-06T00:00:00Z")` is **2026-06-01**, a day nobody
wrote, and without the guard an overlay carrying that string gets an age computed
from an invented day of the month and printed as confidently as a real one. Found by
mutation, and now pinned.

### Added

**`suggest-fixes: true` on the Action — the optimised prompt as a GitHub suggested
change**, applied with one button.

**A suggestion, not a commit.** The obvious build commits the fix to the pull request
branch, which needs `contents: write` on the workflow of everybody who installs this
action, against a `SECURITY.md` that documents `contents: read`, no
`pull_request_target`, and has a test asserting it. Widening that is a decision for the
people running the workflow. A `suggestion` block needs only the `pull-requests: write`
the comment mode already requires, lands in the same place with the same one click, and
leaves the maintainer as the one who commits.

Safe level only — the aggressive level is defensible when a human reads the diff it
produced, and a one-click apply is not that moment; asserted by a test that also refuses
to let the level come from the environment. Never fails the build: no pull request, a
read-only fork token, an oversized prompt or a partly-changed file are all notices.

Two defects found by running it, both invisible to reading:

- **It would have suggested deleting the trailing newline of every prompt in the pull
  request.** `optimize` returns text with no trailing newline *even when no rule fires*
  — `"Classify {{t}}.\n"` comes back as `"Classify {{t}}."` with `rules: []` — so a
  plain `optimized !== original` is true for virtually every file on disk. The
  comparison now ignores the terminator, and the suggestion omits it, because inside a
  fence the lines *are* the replacement lines.
- **Every anchor was one line past the end of the file.** `"abc\n".split("\n")` has
  length 2, so `line` pointed at a phantom last line and GitHub would have answered 422
  — on essentially every file, quietly, as a declined API call.

One test fixture was wrong too: 600 identical padded paragraphs collapse to 42
characters, because the duplicate-blocks rule removes them all, so the size guard never
fired. Distinct paragraphs now.

23 tests, five mutants — both defects above, a hunk parser that requires the optional
comma, suggesting on a partial diff, and the aggressive level.

### Added

**`trazum doctor --otlp-out <file>` — the survey as OpenTelemetry metrics.** Five
gauges: tokens per prompt, over-budget per prompt, the unbudgeted count, and each
advisory's monthly figure and prompt count. The model and call volume are resource
attributes, because a dollar figure whose scenario is not recorded beside it is a
number nobody can check later.

**Trazum writes the payload; it does not send it.** Pushing to a collector means
holding an endpoint and a credential, and this project has twice shipped an SSRF where
a URL reached `fetch` without being the URL that was checked. A file has no such
failure mode, and the pipeline that already holds the credential can post it.

No `@opentelemetry/*` dependency: the JSON encoding is a documented wire format and
this package has none. Two of its rules fail *silently* — a collector does not reject a
malformed payload, it charts it wrong — so both are pinned:

- **64-bit integers are JSON strings.** `timeUnixNano` and `asInt` are `int64`; a
  collector reading `1786000000000000000` as a double loses the last digits of every
  timestamp it stores.
- **Money is `asDouble`.** `asInt` would report `$4,912.40` as `4912`, and nothing
  downstream would look wrong.

`toOtlpMetrics` takes the timestamp as a parameter rather than calling `Date.now()`,
for the reason `computeSavings` takes a `Date`: a function that reads the clock can
only be asserted for shape, and here the timestamps are half the payload. Eleven core
tests, four CLI tests, five mutants — each of the two encoding rules, the millisecond
conversion, empty series, and unbudgeted prompts reported as within budget.

### Fixed

**A test file was binary, and the guard against exactly that did not look in test
directories.**

`packages/core/test/reorder-properties.test.js` joined a token bag on a **raw NUL**:

```js
const bag = (text) => text.split(/\s+/).filter(Boolean).sort().join('<NUL>');
```

One byte, typed as a literal instead of `\0`. git calls such a file binary, so every
change to those 400-prompt property tests rendered as `Bin 8385 -> 8386 bytes` and no
reviewer could read a line of it.

This is the same defect as `scripts/measure-token-band.mjs`, which spent three commits
unreviewable — one of them fixing a security finding *in that file*. The guard written
afterwards, `every source file is reviewable as a diff`, walked
`packages/core/src`, `packages/cli/src` and `scripts`. The relapse landed in
`packages/core/test`, one directory outside its reach, and the guard sat green beside
it for as long as it existed.

**A test directory is where it matters most.** Tests are the argument that the code is
right; a test nobody can read in a diff is an assertion taken on trust, which is the
thing this repository spends its effort refusing to do.

The walk now covers both packages' `src` and `test`, `apps/web`, `action`, `scripts`
and `.github`, and the staleness floor rises from 40 files to 100 so a future
re-narrowing fails loudly instead of passing over less. Verified by putting the byte
back: the widened guard names the file, the old roots do not.

Repo-wide scan afterwards: 341 text files, one NUL, now zero.

### Added

**`trazum diff --all <before> <after>` — a whole prompt library at once.** `diff`
answered the question for one prompt; a team refactoring forty of them wants it
answered forty times and totalled, and running the command by hand loses the total,
which is the figure the decision turns on.

**A prompt on only one side is named, never counted.** A refactor that deletes a
prompt and one that renames it look identical from a token count, so folding the
deletion into the total would report a library getting cheaper when a file went
missing. They are listed under `only before` / `only after` and excluded from the
totals, with a line saying why.

**`--max-growth` applies per prompt, not to the total** — the rule `check` already
states about budgets. In the worked example the total is `+3` and `--max-growth 10`
still fails, because one prompt grew 14 while another shrank 11. A gate on the total
would pass that, and the prompt that doubled is the one somebody has to look at.

Sorted worst first, the sign convention stated above the first figure, and the totals
asserted to equal the sum of the per-prompt figures they claim to total. Four mutants,
each killed: deletions folded into the totals, the gate moved to the total, the
convention moved below the figures, and the list sorted best-first.

**The command count in the README drifted again while this was being written.** Adding
`doctor` made "nine commands" wrong in two places, in a file corrected two commits
earlier for exactly this. `publish.test.js` now checks it against `COMMAND_FLAGS`, and
checks that every command is mentioned in the README at all — a command nobody
documented is a command nobody runs. The guard distinguishes "ten commands" from "the
other nine commands", because the second is correct prose and a guard that cries wolf
gets deleted.

### Added

**A pre-commit hook, at `scripts/pre-commit`.** `ln -s ../../scripts/pre-commit
.git/hooks/pre-commit` and a commit whose own prompts are over budget is refused
before it reaches CI.

**It asks `trazum doctor --json` rather than running `trazum check prompts/`,** and
that is the design rather than an implementation detail. `check` exits 1 when
anything under a directory is over budget — right for CI, wrong for a hook, because
it would refuse a commit that touches one file over a different prompt somebody else
committed last month. A hook that fails for reasons outside the commit is a hook
people learn to pass `--no-verify` to, and then it is worse than no hook, because it
taught them the habit too. So the hook intersects `doctor`'s over-budget list with
the files actually staged.

It gets out of the way rather than guessing: nothing staged, no Trazum installed, no
prompts found, an unreadable config — none of those are a budget failure, so none of
them block a commit. Each says so once and exits 0.

Two defects found by running it, both of the same kind — a message that promises
something it does not deliver:

- **It announced a list of over-budget prompts and printed nothing under it.** The
  detail line matched path, tokens and budget on one line, and `doctor --json`
  pretty-prints. It blocked the right commit and said nothing useful about why. It
  names the paths now and points at the command for the figures, rather than parsing
  multi-line JSON in `sh`.
- **The scope guard latched open on an empty array.** `"overBudget": []` closes on
  the line that opens it, so `inside = 1` stayed set for the rest of the document and
  a `path` key in any later section blocked the commit — the exact bug the scoping was
  added to prevent. Ten tests, four mutants, including one that puts each defect back.

Stated in the README because it is real: Trazum reads the working tree, not the staged
blobs, so a prompt staged and then edited further is judged on the newer text.

### Added

**`trazum doctor [dir]` — the survey before the gate.** Which prompts nothing is
watching, which are already over budget, and what every advisory adds up to across
the whole workspace.

**There is no score, and that is the design.** A health check invites one, and a
number assembled from weights nobody can reproduce gets quietly tuned until the
output looks right — `rank` refused it for the same reason. So `doctor` invents no
judgement at all: every finding is an advisory `optimize` raises on that prompt on
its own, summed, so any figure can be checked against a single file. A test adds up
the individual runs and requires the total to match, which it does to the last
float. "16 prompts only need a cheaper model" is sixteen copies of one advisory,
each with a file name beside it.

Two things it reports that nothing else did: **prompts no budget pattern matches**,
because an unwatched prompt is how the cost got there, and **prompts already over
budget** — before a red build says so, which is too late to think about it.

**It exits 0 even when it finds things.** `trazum check` is the gate. The model
recommendation is a keyword heuristic, and gating a build on a keyword heuristic
teaches people to re-run until green, which costs more than the tool ever saves.

Offline and free, like the rules. It deliberately does not check prompts against
their own `--suggest` recommendations: that is an LLM call per prompt, and this is
the command you run over forty files before deciding to spend anything. Four
mutants, each killed — averaging instead of summing, dropping the advisories that
carry no figure, printing the whole unbudgeted list instead of capping and counting
it, and exiting 1 on a finding.

### Fixed

**The README described a tool that only shortens prompts, and two counts in the
docs had drifted.**

Nine commands have landed since that front page was written, and it had been
updated by inserting a paragraph into whichever section each one belonged to —
which is exactly how a summary goes stale while every detail below it stays
correct. "What it actually does" listed four things, all of them `optimize`. A
reader who stopped there never learned that `rank` says which of forty prompts is
worth an afternoon, that `blame` names the commit, or that four commands write
markdown for a pull request comment. There is a table now, and the architecture
diagram includes the Action, which it had never mentioned.

`Layout` was missing a whole workspace (`action/`), plus `scripts/` and the eleven
core modules added since it was written.

Two numbers were simply wrong. The README advertised **580 tests** where the real
figure had reached **798**. `RELEASES.md` claimed **thirteen** deterministic rules
where there are **twelve**, and listed "restated output formats" among what they
cut — an advisory that is deliberately never cut, so that sentence was wrong twice.

Both are now checked rather than corrected. `publish.test.js` compares the rule
count in prose against `RULES.length`, refuses to let an advisory be described as
something the rules cut, and fails if the README ever advertises a test total
again — because a total across four suites cannot be verified from one of them, and
a number nobody maintains is worse than no number. Three mutants, each killed by
reintroducing the exact error it replaces.

**A blame test threw away the evidence when it failed.** `shows the most recent N`
was the only test in `blame.test.js` that checked neither the exit code nor passed
the command's output into an assertion, so when it failed once on CI the entire
report was `0 !== 3` — which is what "the table has no rows" looks like whether the
history was short, the path was rejected, or git never answered. The output was
right there in the variable, unused.

It carries the output now, and asserts the exit code first. Verified by forcing the
failure: the report goes from `0 !== 3` to `Error: git has no commits touching
p.txt.`

**This is not a fix for that failure.** It has never reproduced here — 26 runs
including under 8× CPU load — and the identical commit passed in the same CI minute
on the other event, so it is intermittent and its cause is still unknown. What
changed is that the next occurrence will say something.

### Added

**`comparePrompts` reaches the web app, as a Compare tab and `POST /api/compare`.**
Two versions of a prompt, the token delta, what it costs, and which advisories and
rules the edit introduced or resolved.

The whole hazard of this surface is a **sign**. Everywhere else in Trazum a
positive number is money you get back; here every figure is `after - before`, so
positive means the edit made things worse. Getting that backwards throws nothing,
fails no typecheck, and tells somebody their prompt got cheaper on the commit that
doubled its cost. So the convention is stated **above** the figures rather than
beside them — a reader arriving from the Optimise tab has the opposite expectation
already loaded, and a caveat under the number is a caveat read after the
conclusion — and most of the new tests assert a direction rather than a value,
including the swapped-pair case that a `Math.abs` mutant walks straight through
otherwise.

`optimizeBoth` is off by default and the default is the interesting half: the edit
changed the text as written, so the text as written is what the reader is being
asked about. Trimming both sides first hides a prompt that doubled in length and
happened to double in courtesy. Honoured only on a literal `true`, like every other
boolean these routes take. A missing `before` and a missing `after` are told apart,
because one message for two fields leaves the caller guessing.

**The usage scenario is now owned once, by the page.** It sits beside the locale in
`App`, for the same reason and with the same shape: both tabs price their answers
through it, and setting 50,000 calls on one while reading 10,000 on the other would
make the two answers incomparable while looking like they were about one workload.
`Optimizer` reads it from a prop and writes back through it; the history panel
restores all five fields in one update rather than five, because five setters on
shared state is five renders and, in between, four scenarios that are nobody's.

**And `formatUsd` stops being defined twice.** The web app had a copy that was
byte-identical to the one `@trazum/core` exports, for as long as it existed. The
core also had the `formatSignedUsd` that Compare needed.

Nine mutants. Two are worth naming. One test asserted the *absence* of local
scenario state in `Optimizer`, and a mutant renaming the local to `callsPerMonth2`
satisfied every pattern looking for `const [callsPerMonth,` while the two tabs went
back to disagreeing — a test that enumerates ways to be wrong is always one rename
behind, so it asserts the positive property now: every field read from
`scenario.usage`, every setter delegating to `scenario.set`. The other is that the
sharing *behaviour* cannot be seen from source at all, and was verified by driving
the built page in a headless browser: set the calls on Compare, read them back on
Optimise, and the reverse.

**`rank` and `blame` take `--markdown-out`.** The flag existed on `check` and
`diff`, which meant the two commands that answer *which of these forty prompts is
worth an afternoon* and *who made this one expensive* could not put their answers
where those decisions get made. Both now render a table for a job summary or a
pull request comment, written before any exit code is set and independently of
`--json` — the file's job is to survive the run.

Every string but the heading comes from the same `t.rank` / `t.blame` objects the
terminal report reads. Not tidiness: a second copy of "there is no score" is a
second thing to keep true, and whoever eventually softens one of those sentences
will soften the copy they happened to be looking at. `blame`'s priced movement
moved into a shared `netCostOf` for the same reason — two copies of that
arithmetic is precisely how a comment and a job log start disagreeing about one
history.

**A third escaper, `mdTextCell`, for untrusted prose in a table cell.** `mdCell`
is safe and announces "this is code" by wrapping in `<code>`; the first draft of
the blame report used it for the author and the subject, so the table typeset a
person's name as a code span and an English sentence with it. Correct, and plainly
wrong the moment it was rendered. The new one keeps `mdCell`'s entity encoding —
no `|` in the output at all, so the row cannot split — and adds the inline-markdown
set, which `mdCell` never needed because backticks make its content literal.

This is the least trusted input in the repository: on a pull request from a fork,
the commit subject is written by whoever opened it, and it lands in a table
maintainers read. Verified by building a repository with `grow | </table><script>`
as a commit message and asserting every row still has five cells.

Five mutants, each killed. One of them was killed only by a fixture coincidence —
reverting to `mdCell` kept the table intact and failed just the hostile test,
because `&#124;` happened to differ — so a test that asks the actual typographic
question went in beside it.

**`--suggest` is on the web too**, as two switches: one asks the model for
phrase-level rewrites, the second takes them. Turning the first off clears the
second, and the request derives the pair rather than sending both — a switch out
of step would otherwise produce a `400` for a combination nobody chose.

The proposals sit **above the saving**, one line each, with a count of what the
checks threw out. Same placement and the same reason as the reordering notice: a
figure read before its caveat is a figure nobody agreed to.

**And the web suite calls the route handler for real.** Every test in `apps/web`
until now read source and asserted on the text of it, which was honest about the
two rendering bugs it was written for and could not have seen the one below.
`test/api.test.mjs` sends requests: `next/server` is redirected to the platform's
own `Response.json` through a stable `module.register` hook — not
`--experimental-test-module-mocks`, because a suite should not depend on a flag a
Node minor can rename — and the core, the rules and both catalogues are the real
modules. Eight tests, four mutants, each killed by the one test meant for it.

`apps/web/package.json` declares `"type": "module"` as part of this. Loading a
`.ts` route from plain Node otherwise warns on every run that the file "doesn't
parse as CommonJS" and is being reparsed — a fair warning, and one worth fixing
rather than muting with `--disable-warning`, since every config in that directory
was already `.mjs`. Build, typecheck and both suites verified after.

The CI step that runs them is renamed from **"Core and CLI tests" to "Tests (core,
CLI, web, Action)"**, which is what `npm test` at the root has been doing for a
while. A step labelled for two of the four suites invites a reader of a green build
to think the other two are unchecked, and invites somebody adding a suite to write
a step that already exists.

### Fixed

**`applySuggestions` on its own returned `200` and applied nothing.**

Found by sending it, not by reading the diff. The response came back with a
complete report, no `suggestions` key, and the prompt untouched — the one thing the
caller asked for silently did not happen. Nothing about the source looked wrong:
the field parsed, the literal-`true` guard around it was correct, and the branch
that would have used it was simply never entered.

That is the same failure as a misspelled field being accepted, which this endpoint
already refuses for `disableRules` and `usage.model`, and which the CLI already
refuses for the matching pair of flags — *"a flag that quietly does nothing is the
same failure as a typo'd flag being accepted"*. There was no reason for the HTTP
surface to be the lenient one. It is a `400` now, refused **before** any call to
the model, so a malformed request never costs one.

Only a literal `true` is refused, because only a literal `true` would have been
honoured: `applySuggestions: "false"` asks for nothing and gets nothing, which is
what it says.

### Security

**The trimming rules only trimmed in two languages, and the report did not say so.**

`--reorder` was fixed to refuse safely in nine languages. The rules that actually
cut tokens still had dictionaries for English and Spanish alone, so:

```
en   22 →  11   2 rules
es   25 →  14   2 rules
fr   25 →  25   0 rules     ← nothing
de   20 →  20   0 rules     ← nothing
```

A French or German author ran Trazum, read `No rule found anything to trim`, and
took it to mean their prompt was already efficient. It meant Trazum could not read
it. Same defect `--reorder` had, one layer over: the tool knew something it was
not telling anybody.

Two fixes, in that order. **The report now names its coverage** whenever no rule
fires — stated rather than detected, because guessing a prompt's language is one
more thing to get wrong and naming the coverage cannot be. And **French, German,
Portuguese, Italian and Dutch** join the six dictionaries, so the trimming and the
reordering finally cover the same set of Latin-script languages.

### Fixed

**A dictionary translated word by word changed meaning.** The first pass at those
five languages shipped `muito`, `molto` and `heel` as intensifiers. All three are
also quantifiers, and `INTENSIFIERS` is dropped outright at the aggressive level:

```
Hai molto tempo per rispondere.   →   Hai tempo per rispondere.
```

"You have much time" became "you have time". Spanish had this right all along —
`muy` is on the list and `mucho` deliberately is not — and translating word for
word instead of by role lost the distinction. Found by running the five languages
through the rules, not by reading the list.

Both halves are now tested. One suite keeps those three words out and asserts the
quantifier sentences come back byte-identical. The other counts entries per
language per dictionary, because the behavioural test passes on whatever the
fixture happens to contain — which is exactly how a two-language hole survived a
full suite for this long. Portuguese and Italian dropping to a single firing rule
the moment `molto` came off the list is what surfaced the need for it: the
fixtures had been carrying the claim.

### Added

**[RELEASES.md](RELEASES.md) — release notes for people**, and the workflow now
publishes a GitHub release from them.

Until now, tagging published to npm and created **no GitHub release at all**. The
tag existed, the page behind it was empty, and anyone following a "what changed?"
link arrived at a file list. This changelog is thorough and it is not what you
hand somebody who has forty seconds — it is the maintainer's record, written for
whoever has to understand a decision two years from now.

`scripts/release-notes.mjs` extracts one version's section, and the release job
pipes it into `gh release create`. Writing the notes in a pull request beats
typing them into a web form at the moment of releasing, which is the moment least
suited to writing anything carefully.

Five tests make the file load-bearing rather than decorative: the version in the
manifests must have a section, the newest section must be the pending release or
the current version, the file must say nothing is published while nothing is
published — the exact claim ROADMAP.md got wrong — and the extractor must return
one section and fail loudly for a version it has never heard of. All checked
against mutants, including one that makes the extractor swallow the next release's
notes.

The release job's `contents` permission widens from `read` to `write`, which
`gh release create` requires. Stated rather than slipped in: that job now holds a
token that can push to the repository. The checkout is still
`persist-credentials: false`, so the working tree's remote has no token to reuse,
and the only step touching the API creates a release from a file already in the
commit.

### Fixed

**ROADMAP.md filed five versions under "Released" that were never released.**

There is no git tag in this repository, the `@trazum` scope does not exist, and
this file — which states at the top that `Unreleased` means merged-but-untagged —
holds every one of 1.1.0 through 1.5.0 right here. Two documents, one of them
wrong, and nothing checking either against the other.

It matters beyond tidiness: "Released" is what somebody reads before deciding
whether they can install this. The discipline in this repository is not claiming
what has not been checked, and this was the least-checked claim in it.

Those milestones now sit under **Merged into `main`, not yet released**, which
says what is true: the ordering is a useful record, the numbers will not appear on
npm, and the first publish collapses all of it into one version. The two things
needed before any of it ships are named there, and both belong to the maintainer.

Three tests keep the record honest from here — every version the roadmap calls
released must have a changelog entry, nothing under "not yet released" may already
be released, and the manifests must carry the newest version the changelog has
actually cut. All three were checked against mutants; the first reproduces the
original bug by name.

Also on the roadmap: an entry for the five commands merged today, and **cost
alerting** added to `Under consideration` with the reason it is not scheduled — it
needs a service holding other teams' prompt metrics on a schedule, and `check
--max-tokens` in CI already covers the threshold case for anyone content to have
the answer arrive on a pull request instead of in Slack.

### Added

**`trazum eval --export promptfoo` — hand the run to your own harness.**

Agreement is the question Trazum is qualified to ask, and it is not the question
a team needs answered before shipping. Theirs is whether the classifier still
hits 94%, whether the JSON still parses, whether the refusal rate moved — and
those are assertions about their task, which this tool has no business
inventing.

So it builds the part it *can* get right: a suite in which the only variable is
the prompt, with both versions, every case bound to the correct template
variable, and the same provider on both sides. `defaultTest.assert` is left for
the team.

It makes **no API call and needs no key** — the whole point is to hand the run
over — and it warns about the things that would quietly make a run meaningless:
a `${x}` placeholder promptfoo will not substitute, a prompt with three
placeholders and one value per case, a provider whose id had to be guessed.

The only assertion seeded is `is-json`, and only when the prompt shows a fenced
JSON block. That is not an opinion about the task; the prompt already demands it.

JSON rather than YAML, which promptfoo reads just as happily. This package has
no dependencies and is not acquiring a YAML emitter, and a hand-rolled one is a
quoting bug waiting for the first prompt with a colon, a tab, or a line ending
in a space.

### Fixed

The JSON detection used `findRestatedFormat`, which was the wrong question
wearing a convenient shape: that function answers "is this prompt wasting tokens
restating its own schema?", so a prompt demanding JSON *cleanly* got no
assertion while a wasteful one did — exactly backwards. It now looks for a
fenced block tagged `json`, or an untagged one that parses as JSON, and the
report says how many assertions were seeded rather than claiming "no assertions"
unconditionally.

### Added

**`trazum rank <dir>` — which of these prompts to fix first.**

The obvious shape for this was a complexity score out of a hundred, and it is
the wrong shape. A number nobody can reproduce by hand cannot be argued with,
and the weights that turn four measurements into one get tuned until the ranking
looks right — which is fitting the metric to the answer.

So the ordering is the one quantity that is not a matter of opinion: **what
optimising each prompt would actually recover**, obtained by running the
deterministic rules rather than evaluating a formula. The structural
measurements are printed beside it as the *explanation* — tokens per sentence
(verbosity independent of length), few-shot examples and what they cost, a
restated output format, and the share of the prompt that is protected content.

That last one earns its place: a prompt that is 83% code has far less headroom
than its size suggests, and a ranking that hid it would send somebody to spend
an afternoon on a file that cannot move.

Source files contribute their marked prompt, never the code around them. One
with no marker is skipped **and counted**, so a repository whose prompts mostly
live in code does not show a short list and look complete.

Two tests hold the line against a score reappearing: `PromptProfile` may not
grow a field whose name contains "score", "rating", "grade", "index" or
"complexity", and neither may the ranking's JSON.

### Fixed

Two problems in that work, both visible only by running it:

- **A single unmarked source file aborted the whole ranking.** `sourceFileOf`
  throws for a source file with no `// trazum:prompt` marker, which is right for
  `optimize` — you named that file, and optimising it would rewrite your code —
  and wrong for a command walking a directory. One stray `.ts` killed the other
  thirty-nine.
- **Four prompts showed `$0.25` and looked like four equivalent jobs.** Three of
  them recovered a single token, which at 50,000 calls is twenty-five cents. The
  arithmetic was right and the presentation was not. Rather than invent a
  threshold nobody could check, the token count is printed beside the money.

### Added

**`optimize --suggest` — rewrites proposed one phrase at a time.**

`--llm` hands the model the whole prompt and takes the whole answer back, which
is all-or-nothing in both directions: a result that fails one safety check
leaves the author with nothing, and one that passes is a wholesale rewrite they
must read end to end before trusting. `--suggest` asks which exact phrases say
something in more words than they need, and returns a list small enough to judge
on sight — `You should always make sure to → Always`.

The model proposes; the prompt decides. Every suggestion is checked against the
text before it is shown and dropped rather than reconciled: `before` must appear
byte for byte (a model asked to quote will tidy the punctuation as it goes), it
must not touch code, URLs, placeholders or tags, `after` must not introduce any,
it must actually save tokens, and overlapping suggestions are refused because
applying both produces text neither described. A phrase occurring several times
is rewritten everywhere it appears *outside* protected content rather than the
whole suggestion being refused for one occurrence in a code block.

Nothing is applied unless asked. `--apply-suggestions` takes them and the
headline figures move with the change; on its own it is an error rather than a
no-op, for the same reason a misspelled flag is.

The model is asked about the **optimised** prompt, not the one as written —
re-finding what the rules already took spends a call to be told what Trazum knew
for free.

### Fixed

The first version of the CLI test for this deadlocked and had to be killed by
the timeout. It drove the binary with `spawnSync`, which blocks the test
process's event loop, so the fake LLM server living in that process could never
answer the child it was waiting on. A fake server in the test process only works
if the test process is free to run.

### Added

**`trazum blame <file>` — when this prompt got expensive, and what change did it.**

Git already knows who edited a prompt and when. What it does not know is that
three lines added to a system prompt at 50,000 calls a month is a bill rather
than a diff. `blame` walks the file's history, counts the tokens at each commit,
and puts both facts on one line — with the net movement priced through the same
usage profile `optimize` uses, and the single worst commit named.

`--prompt` tracks one marked prompt inside a source file, so refactoring the
imports is not read as the prompt growing. Renames are followed. `--limit`,
`--json`, and the pricing flags behave as everywhere else.

This is the first thing in the repository that runs another program, so it
happens in one module written as though it were the whole attack surface: no
shell, every path after a `--` separator, object names validated as 40 hex
digits before being glued to anything, bounded timeout and buffer, and no
credential prompting. Six invariants in `security.test.js` assert all of that,
each checked against a mutant — including that `git.ts` stays the *only* file
importing `node:child_process`.

**Every command now honours `--` as the end of options.** Without it there was
no way to name a file called `-x.txt` or `--output=…` on the command line at
all; the parser saw a flag and refused before the path reached anything.

### Fixed

Two bugs found while building the above, both by running it:

- **A renamed prompt reported no history before the rename.** `nameAt` asked
  `git log --follow --max-count=1 <sha> -- <today's name>`, which returns nothing
  for commits where that name did not exist — so every revision before a move
  showed "not present" while the data sat there under the old name. One `git log`
  for the whole history now pairs each commit with the path it touched.
- **`--limit` was ignored.** It was accepted by the command's flag list but never
  added to `VALUE_FLAGS`, so `--limit 6` parsed as a boolean and the count was
  the next positional argument. It silently walked the default 20 every time.

### Security

**`--reorder` had no safety at all outside English and Spanish.** Not a missing
feature — a silent failure.

`BACKWARD_REFERENCES` was one flat list of English and Spanish phrases, applied
to every prompt. The module's own documentation says its entire design is about
what it refuses; for a French, German, Portuguese, Italian, Dutch, Japanese or
Chinese author it refused nothing. "Résumez le texte ci-dessus" was hoisted above
the text it points at and reported as a saving. Every test in the suite passed,
because every test asked the question in the two languages that worked.

Seven more languages now, grouped per language so the coverage is a thing you can
look at rather than infer. Japanese and Chinese match without word boundaries —
the boundary test asks whether the neighbouring character is a letter, and in
上記のテキスト it always is, so a boundary-matched CJK list would have read like
cover and provided none.

**And a fourth refusal, for the scripts still missing.** Cyrillic, Arabic,
Hebrew, Hangul, Devanagari, Thai and Greek: nothing moves, and the report names
the script and says why. A single such instruction inside an otherwise English
prompt is enough to stop it — that is the case where a missed reference does
damage, and the cost of being wrong is a saving the author can still take by
hand. Adding a language is adding an array.

Three tests keep this honest rather than trusting it: the README's list of
languages must match the table, no phrase may be capitalised (it could never
match), and no covered language's phrases may use an uncovered script. All were
checked against mutants.

### Fixed

Two pluralisation slips in the reorder report, both visible in the output above:
"1 tokens back, every call" and "Left 1 block where they were".

### Changed

**The web app is rebuilt on shadcn/ui, wearing Trazum's own palette.**

The components are shadcn's — Radix underneath, so the model and level pickers
are properly keyboard-navigable and the toggles announce themselves, which the
bare `<select>` and `<input type="checkbox">` never did. The colours are the ones
that were already here: `--primary` derives from `--terracotta`, `--background`
from `--paper`, and so on down. Taking shadcn's neutrals would have made this
look like every other application assembled from the same registry, and the
whole point of theming through CSS variables is that you do not have to.

Two changes are not cosmetic. The result and the diff are **tabs** rather than a
toggle button whose label named the state you were not in — that button was read
backwards about half the time. And the endpoint field is the picker the previous
release made it, now rendered as one.

Animation comes from react-bits' `CountUp`, `AnimatedContent` and `ShinyText`,
rebuilt on `requestAnimationFrame` and CSS keyframes: upstream builds them on
`motion`, and one animated integer is not worth a 50 KB dependency in a project
whose published packages have none. `prefers-reduced-motion` switches all of it
off in one rule rather than component by component.

### Fixed

**Two bugs in that rework that compiled, typechecked, and were wrong.** Both were
found by opening the page, not by reading the diff.

The results summary rendered *blank*. `AnimatedContent` waited for an
`IntersectionObserver`, and a reader who scrolls down to reach the Optimise
button gets their result mounted above the viewport — so the observer reported
"not intersecting" and a 214px card sat there at zero opacity. Content that
appears in response to an action is not scroll-triggered content; it animates on
mount now, and waiting for the viewport is opt-in.

The Copy and Clear buttons each fell onto their own row. `CardHeader` is a grid,
so the `flex-row justify-between` on it merged in and did nothing — the two
utilities are in different groups, so nothing overrode anything and the class
list read as though it should have worked. They use shadcn's `CardAction` slot,
which is what the grid has a rule for.

`apps/web` has tests for the first time, and they encode exactly these two: a
component whose default hides content, and a layout override that is silently
ignored. Both were checked against a mutant that reintroduces the bug.

### Fixed

**The alert gate raced the analysis it reads, and failed the merge that fixed
both alerts.** `open-alerts` and `codeql` started together: the gate finished one
second in, CodeQL uploaded a minute later, so the gate judged the merge against
the state of the commit before it and reported two findings at line numbers that
no longer existed. A red build for a fix that worked is how people learn to
re-run until green.

It now runs `needs: codeql`, and — because the alert index settles after the
upload returns — checks that every row it is about to report carries the SHA
being built, retrying for up to 90 seconds and failing rather than passing if it
cannot read current state. A gate that cannot see the present has no business
reporting green.

The test for it caught nothing at first: `/needs:\s*codeql/` matched the comment
explaining the dependency. Fourth time in this repository. It strips YAML
comments now and asserts against a mutant with the line deleted, so "can this
assertion fail?" is answered rather than assumed.

### Security

**CodeQL reopened the SSRF alert on the fix below, and it was right a third
time.** Both earlier attempts hardened the wrong layer. The taint does not start
at `TRAZUM_LLM_BASE_URL`, which an operator sets on their own machine — it starts
at `POST /api/optimize`, whose body carried a `baseUrl` that the deployed server
would then fetch. That is server-side request forgery by construction, and no
amount of validating the string fixes it: the host filter reads a *name*, and a
name an attacker registered resolves wherever they choose.

**So the request body no longer names an endpoint. It selects one.**
`TRAZUM_ALLOWED_LLM_ENDPOINTS` is a comma-separated list the operator writes, and
the value that reaches `fetch` is the entry from that list — the string that
arrived over HTTP is compared and then dropped. The list is empty by default, so
a deployment that has not thought about this cannot be pointed anywhere at all.
Nobody loses the capability: `TRAZUM_LLM_BASE_URL` and the CLI still go anywhere
you like. What changed is who is allowed to choose. The web UI's free-text field
is now a picker over what the server actually accepts, because offering a text
box that always answers 400 is worse than offering nothing.

**A redirect walked past the entire host filter, and had all along.** Every check
in `net.ts` reads the URL the caller named, and `fetch` follows redirects by
default — so an endpoint that passed validation could answer
`302 Location: http://169.254.169.254/latest/meta-data/` and the request went
there anyway, `authorization` header included. One HTTP response, and the whole
filter was decorative. Every server-side call now carries `redirect: 'error'`,
plus `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. This one mattered
for the CLI as much as for the deployed app, which is why it is fixed in the
provider rather than in the route.

**And a third door nobody had looked at.** `countTokensAnthropic` takes a
`baseUrl` and sends an `x-api-key` to it, with no validation whatsoever. Both
providers had been hardened twice over while this sat open, because it is called
a counter rather than a provider. It goes through the same gate now.

### Security

**The alert gate found two things on its first real run**, which is the argument
for it in one sentence. Both were invisible to every pull-request check.

**The SSRF fix did not close the alert, and CodeQL was right.** Validating at
construction checked `baseUrl` and then fetched
`` `${baseUrl.replace(/\/$/, '')}/chat/completions` `` — two different
expressions, so the thing checked was never the thing used and nothing on the
path from option to fetch was a barrier. A later edit could have moved the check
without anything noticing.

The validator now **returns the value to use** rather than approving one, and the
fetch uses what it returned. Re-parsing normalises it too:
`https://host/v1/../../admin` passed as a string and resolved to `/admin` on the
wire; it is resolved before the request now.

**And a time-of-check to time-of-use race I introduced an hour earlier.** The
symlink guard was `lstat` then `readFile`, which resolves the name twice — CodeQL
opened it as high severity. It is now a single `open` with `O_NOFOLLOW`: one
syscall, and the handle is the file that was checked.

This repository had already been caught by the identical `stat`-then-read pattern
in the config reader and fixed it the same way. I wrote it again anyway, which is
the more useful half of the finding: the guard against a class does not live in
anybody's memory.

**A third thing turned up while fixing those two: one file had no diff.**
`scripts/measure-token-band.mjs` used a raw NUL byte as a hash field separator,
which is enough for git to call the file binary. Its three commits — including
the one that fixed the SSRF finding above — rendered as
`Bin 7652 -> 7654 bytes`, and nothing anywhere warned that a security fix had
gone through unreadable. The byte is now written `\0`, which produces the same
digest, and a test refuses a raw NUL in any source file: the other invariants
here all assume somebody can read the code.

### Security

**A job now fails the build when `main` carries an open critical or high alert.**

CodeQL's pull-request check reports *new alerts in the code that pull request
changed*. A finding already open on `main` is not new, so every later pull
request goes green beside it — which is exactly what happened: **eleven
consecutive green runs with a critical SSRF alert open the whole time**, found
only because somebody opened the Code scanning page and looked.

Green on a pull request is not green on the repository, and nobody should have to
remember the difference.

Four decisions in the job worth stating:

- **It reads `security_severity_level`, not `severity`.** The first is the
  CVSS-style rating the UI shows as "Critical"; the second is the query's own,
  where today's critical was merely `error`. Reading only the second would have
  let it through.
- **`security-events: read`.** A job that could dismiss an alert is a job that
  could dismiss the alert it was written to surface.
- **Skipped on pull requests.** There it would report the base branch's state and
  fail somebody's unrelated work for a finding they cannot fix from their branch.
- **It can actually fail.** The `jq` filter was checked against a realistic
  payload — one critical, one medium, one with no severity field at all — before
  it was committed. A gate that cannot fail is worse than no gate, because it
  looks like coverage.

`SECURITY.md` gains the row, and two tests assert the job still asks the right
question and stays read-only.


**`optimize` pointed at a source file used to rewrite your code.** Handed
`src/prompts.ts` it optimised the *whole file* — imports, `const client = new
OpenAI();`, all of it — counted 83 tokens of code the model would never see, and
priced it against Claude Opus 5 on a file that plainly imports `openai`.

Then the capitalisation rule turned `import OpenAI` into **`Import OpenAI`**,
which does not compile, and `-o` wrote it back over the file. That is the worst
behaviour this repository has shipped, and it was the default.

It now reads the marked prompt and leaves the file alone — 43 tokens instead of
83, and the output is the prompt rather than mangled TypeScript.

**It refuses rather than guessing**, in three places:

- **An unmarked source file.** Optimising TypeScript as prose does not produce a
  worse prompt, it produces broken code. The refusal names the marker syntax, so
  it costs the reader one comment.
- **A file holding several marked prompts** — it lists them and asks for
  `--prompt`. Optimising "the first one" silently is how the wrong prompt gets
  rewritten.
- **A marker it cannot read**, naming the line and the reason.

**Detection now feeds the price**, closing the gap `trazum where` opened: an
import names who and never which, so the provider's stand-in model is used and
the report says GPT-5 rather than Claude. The layering is unchanged and now has
one more rung — a flag beats config, config beats detection, detection beats the
built-in default. Reading the code is better than assuming, and worse than being
told.

`--prompt <name>` is new. A plain `.txt` prompt and stdin go through exactly as
before, which is asserted rather than assumed.


### Security

**The SSRF filter was one level too far out.** `openAiCompatible` fetches whatever
`baseUrl` it is handed, with no validation of its own. The web route validated a
body-supplied URL before calling it, and that was the only thing standing between
a public deployment and the internal network — which `SECURITY.md` claims as a
property of the filter, not of one caller remembering to use it.

`openAiCompatible` and `anthropicProvider` now validate their own endpoint at
construction, so a provider that can never safely work does not exist to be
handed around. `openAiCompatible` is an exported library function: "the caller
checks" is a promise about every future caller, including ones outside this
repository.

The distinction that makes this safe without breaking anything is **who chose the
URL**:

- From `TRAZUM_LLM_BASE_URL` — the operator configuring their own machine.
  `providerFromEnv` passes `allowInsecure: true`, because `http://localhost:11434`
  for Ollama is the documented normal case and refusing it would break every
  local setup.
- From an HTTP request body — a stranger naming a host for this server to fetch.
  Validated, and now twice: the route still turns the reason code into a sentence
  in the reader's language.

Verified by hand across the shapes that matter: the cloud metadata address, plain
localhost, an RFC1918 address and credentials in the URL are all refused; a public
https endpoint and an operator-configured Ollama both work.

**`measure-token-band.mjs` followed symlinks.** The script posts corpus file
contents to the counting endpoint — that is its job, and CodeQL flagging the
file-to-network flow describes the job rather than a bug. What it made worth
checking was the edge: `readdir` plus `readFile` follows a symlink, and the corpus
is a test-fixture folder people drop things into. One named
`few-shot.txt -> ~/.aws/credentials` would have been posted to an API without a
word. `walkPrompts` has skipped symlinks since it was written; this script had
simply never been held to the same rule.

It now refuses a symlink by name and prints every file it is about to send before
sending any of them. The repository tells people not to paste a private prompt
into a public issue; posting one to an API deserves the same warning, and consent
has to be informed to be consent.

**Both alerts had been open on `main` for hours** without appearing on any pull
request. The CodeQL check on a PR reports *new* alerts in the changed code, so a
finding on `main` stays green on every subsequent PR — worth knowing about the
tooling, not just about these two.


**The report reads like a report.** Twelve releases added sections to it and
nobody had looked at the whole thing at once. Printed end to end, three problems
were obvious:

- **The amounts were unreadable as a set.** Four advisories worth $506, $422,
  $170 and nothing, each with its figure trailing the end of a different-length
  title. They exist to be compared, and comparing them meant hunting for four
  numbers in four sentences. The amount now has a column of its own, right
  aligned, with the detail indented to the title so the prose forms one block
  instead of stepping around the numbers.
- **Nothing said what to do first.** The rules saved $1.25 and the top advisory
  was worth $506 — a 405× difference the reader had to notice for themselves. A
  closing line names it: `Start here: "This task may not need Claude Opus 5" —
  $505.80/month, 405× what the rules saved.`
- **`--reorder` printed a heading, a blank line and a shrug** when there was
  nothing to move and nothing refused. The token count above had already said
  nothing changed. That block now appears only when there is a move or a refusal
  to report.

Two things caught by looking at the output rather than the diff: the closing line
lowercased the advisory title, turning "Claude Opus 5" into "claude opus 5" — a
product name mangled to fit a sentence — and it was the one line in the report
not wrapped to the common width, so it ran off a narrow terminal.

A test that matched `Nothing could safely move.` was rewritten to assert the
behaviour instead: that the prompt came back unrearranged. A test pinned to a
line that says nothing is what keeps that line alive.


**On a subscription, Trazum stops printing money.** Inside Claude Code, Codex or
Cursor you pay the same whatever your prompt costs, so a monthly figure is
arithmetic about tokens dressed as cash — and "$184/month" told to somebody on a
flat plan is not a rounding error, it is money that does not exist.

The report now says what the saving actually buys there: tokens back per call,
and the share of the context window they free. The window is the real currency
inside an agent — every token the system prompt holds is one the conversation
cannot.

**Advisories whose only pitch is money are dropped too**, which the first version
got wrong. Suppressing the price beside each title left `model-downgrade`'s detail
reading "you would go from $843.00 to $337.20 per month" in prose underneath.
`model-downgrade`, `batch-api`, `output-dominated` and `promo-pricing` now go
entirely; caching, context overflow, contradictions and redundant examples stay,
because latency, headroom and correctness are still real on a plan.

The test for this is blunt on purpose — **no dollar sign anywhere in the output**.
A softer assertion would have passed the version with money in the prose.

Two escape hatches, and the reasoning behind them matters more than the flags:
the host says where *Trazum* runs, not where the prompt goes. Somebody editing a
production prompt inside Cursor wants the dollars, so `--cost` brings them back
without leaving the editor, and `--tokens-only` forces the other direction
anywhere. `--cost` wins when both are given.

Also fixed before it shipped: forced with `--tokens-only` on GitHub Actions, the
report announced that "GitHub Actions bills by subscription", which is simply
false. It now distinguishes being told from having detected. And `unknown` billing
is treated as `unknown` rather than as a subscription — guessing wrong there would
hide the product's main output from most of the people using it.


**`trazum where` — which provider a prompt is actually sent to.** Pricing seven
providers turned the Claude default into a wrong number: a file calling OpenAI was
billed against Claude Opus 5 without comment. This reads what the code already
says instead of assuming.

Four kinds of evidence, strongest first: `model=` on a `trazum:prompt` marker, a
quoted model id, a base URL, an SDK import. Every answer names the line it came
from — a detection that cannot be checked is a guess, and the dollar figure that
follows from it would be a guess too.

Three things it gets right that the first version got wrong, each caught by
running it rather than reading it:

- **A base URL beats the SDK it was pointed at.** Moonshot, DeepSeek, xAI and
  Groq are all called through the OpenAI SDK with a different `base_url` — their
  documented usage. Treating that as a contradiction refused to price a perfectly
  ordinary client; pricing it as OpenAI would have been wrong for a large slice of
  everyone using this.
- **It priced an OpenAI file as Claude.** Detection found the provider, found no
  model, and fell through to the global default — printing "goes to openai" and
  "priced as Claude Opus 5" three lines apart. It now uses that provider's own
  model and says that is what happened.
- **Nearest capability, not an exact match.** Neither OpenAI nor DeepSeek has a
  `large` model, so matching the default's capability exactly found nothing and
  the fallback fired anyway. A ladder with different rungs is the normal case.

**It refuses when a file names two providers**, names both, and assumes nothing.
Detection sits between config and defaults: a flag beats config, config beats
detection, detection beats the built-in default.

With no file it reports the host — Claude Code, Codex, Cursor, GitHub Actions, CI
or a plain terminal — and **warns when that host bills by subscription**, because
a monthly saving is arithmetic about tokens there rather than money anybody gets
back. That is the first half of the Cursor/Claude Code question the roadmap has
been holding: not a full report in a different unit, but no longer quoting a
dollar figure to someone on a flat plan without saying what it is.

A third quadratic line-number lookup, found by the hostile-input tests before it
shipped — 36 seconds on a file repeating a model id. Same shape as `extract.ts`,
written again after fixing it there; a binary-searched line index this time,
because the matches arrive out of order and a forward-only counter cannot work.


**The report no longer claims a Claude number for a model that is not Claude.**
Pricing seven providers left the token estimator where it was — tuned against
Claude's tokenizer — while `±15%` kept printing beside GPT and Kimi figures. That
band was never measured for those families, and stating it was a precision claim
nobody had earned:

```
1,021 → 1,020   -0.1% (estimated — the counter is calibrated on Claude, not GPT-5)
```

Anthropic models still show `±15%`, where the band is at least the claim it was
written for. `--exact-tokens` remains the answer for figures you can budget from.

Documents the multi-provider work that shipped alongside it: a table in the README
of what actually differs between providers — cache read rates, cache minimums,
whether caching starts automatically, and which providers have no batch API or no
caching at all — plus the two things deliberately left out and why.

The `Tokenizer per model family` entry under `Under consideration` is heavier than
it was, and says so. And the error-band entry now explains **once** that it will
keep being renumbered by anything that ships before it, rather than re-justifying
the move each time: it is the only item on the roadmap whose completion is not
ours to schedule, and holding shippable work behind it would be the wrong trade
every time.


**Trazum prices models from seven providers, not one.** OpenAI, Google, Moonshot,
DeepSeek, xAI and Mistral join Anthropic in the bundled catalogue.

The data was the easy half. The hard half was that **the cost multipliers were
global constants** — one cache-read rate, one cache-write rate, one batch
discount for everything — and global made them quietly wrong the moment a second
provider existed. They now live on the model, defaulting to Anthropic's values so
nothing that worked before changes.

Three of them were not inaccuracies but **savings that do not exist**, and all
three were found by running the catalogue rather than by reading it:

- **Kimi, DeepSeek and Grok have no batch API.** The global constant offered them
  a 50% discount that cannot be bought — $139 a month in the test that caught it.
  `batch: null` now means "there is no batch API", which is deliberately different
  from not having said.
- **Mistral has no prompt caching.** A zero cache minimum satisfied `0 >= 0`, so
  the caching advisory fired and offered $100 a month of a feature that does not
  exist. Introduced by this very change and caught before it left the branch.
- **The batch saving was computed as `cost × discount`**, which equals the saving
  only when the discount is exactly 0.5. Latent on Anthropic, wrong on the first
  provider with any other rate.

Gemini and Grok read cache at 25% of input against Anthropic's 10%, so the same
prompt cannot be worth the same fraction on both. The advisory now quotes each
provider's real rates — and **stops naming `cache_control` to people who do not
have it**: OpenAI, Moonshot and DeepSeek cache automatically above a threshold,
and the report says so instead of naming a parameter that does not exist for them.
The advice to move stable content forward is identical either way, because a
prefix is a prefix.

**A cheaper model means a cheaper model, not a different supplier.** Recommendations
are now scoped to the current provider. Dropping from Opus to Sonnet is a one-line
change; moving to another vendor is a different API, different behaviour and a
migration — and this advisory is already caveated as a keyword heuristic rather
than a judgement about answer quality. Unscoped, it was telling Claude users to
switch to `gpt-5-nano`.

### Deprecated

- **`ModelPricing.tier`** — replaced by **`capability`**, on a vendor-neutral scale
  of `small | mid | large | frontier`. Anthropic's ladder used as the generic axis
  reads as nonsense the moment the model is not Anthropic's: telling somebody on
  Kimi that their task "looks like haiku complexity" is a label meaning something
  other than what it says.

  **Migration:** replace `model.tier` with `model.capability`, mapping
  `haiku → small`, `sonnet → mid`, `opus → large`, `frontier → frontier`.
  `cheapestOfTier` and `cheapestOfTierIn` still take the old names.

  Per [VERSIONING.md](VERSIONING.md), `tier` keeps working unchanged for the whole
  of 1.x and is removed in 2.0. Both fields are populated on every model and a test
  asserts they never disagree — if they drift, half the code ranks one way and half
  the other, and the difference is invisible until a recommendation is wrong.

### Added

- `multipliersFor(model)` — the cache and batch rates that apply to one model,
  defaults filled in. Anything computing a cost should go through it rather than
  reading `COST_MULTIPLIERS`, which remains exported and remains correct for
  Anthropic.
- `ModelPricing.provider`, `.caching`, `.multipliers` and `.recommendable`. The
  last replaces a hardcoded model id inside `cheapestInTier` — a model behind a
  private programme is real and worth pricing, but recommending a switch to
  something the reader cannot buy wastes their time.
- An optional `provider` argument on `cheapestOfTierIn`, so a caller who genuinely
  wants "cheapest anywhere" can still ask.

**On the prices themselves:** they are written from what was known when this
landed, not read off each provider's page today, and `PRICING_LAST_REVIEWED` says
when. The tests check them for coherence — output dearer than input, a plausible
window, a cache minimum only where there is a cache — never for accuracy, which no
test here can do. The local pricing overlay corrects any of them without upgrading
the library.


**Reordering for the cache is on the web.** It is the largest saving Trazum can
make — a $0 caching saving against a $184 one on a 1,178-token support prompt —
and it was reaching only people who had cloned the repository and built the CLI.
The web is the front door; the biggest thing the product does should not require
a terminal to find.

Opt-in over HTTP for the same reason it is opt-in on the command line, and the
reason is stated in the route rather than left in the diff: every other
transformation the endpoint performs deletes text whose absence is local, and this
one *moves* text, where order carries meaning. Nothing about it is less safe here
— the same deterministic core, nothing sent anywhere, the prompt returned
byte-identical when it cannot act — but "the browser did it quietly" is not
something this endpoint should be able to do.

- **Honoured only on a literal `true`.** A string, a number and `null` are all
  ignored: the body is untrusted, and a truthy check would let `"false"` rearrange
  somebody's prompt.
- **`original` stays what the caller sent**, so the diff the browser draws shows
  the move instead of hiding it behind the deletions.
- **Refusals come back in the response** and render whether or not anything moved.
  The panel is deliberately not styled like the green savings box — that is a
  saving to enjoy, this is a change to review — and it sits above the money so the
  number is read after the caveat rather than instead of it.

Verified against the running server rather than the module underneath it: the
endpoint moves and reports, omits `reorder` entirely when it was not asked for,
returns the prompt byte-identical with both refusals named when it declines, and
ignores a non-`true` value three ways. The checkbox and its warning render in both
locales.

`ROADMAP.md` records what is deliberately **not** coming to the web — the pricing
overlay, config-aware defaults and budgets — with the reasoning, rather than
leaving three unexplained gaps. A textarea for pasting prices into somebody else's
server is not the overlay feature wearing a different hat; it is a worse one, with
no review and no provenance.

The queue was renumbered so `Released` runs unbroken: embedded prompts became
1.3.0 and the web 1.4.0, and **the error band moved to last**. Its corpus, harness
and test all shipped; the measurement needs the official counting endpoint and a
key, so it is the only entry whose completion is not ours to schedule. Holding two
releases that could ship behind one that cannot would have been the wrong trade,
and the file says so rather than renumbering quietly.


**`check` now reads prompts embedded in source files.** It read `.txt`, `.md`,
`.prompt` and `.tmpl`; real prompts live in TypeScript template literals and
Python strings, so adopting Trazum meant refactoring them into standalone files
first — the largest barrier to adoption the tool had.

```ts
// trazum:prompt support-system
export const SUPPORT = `You are a support agent.

Customer message: ${message}`;
```

**It reads a marker rather than guessing.** Inferring which string in a file is a
prompt is a heuristic, and a heuristic inside a CI gate fails builds over log
lines and SQL queries. `//`, `#`, `--` and `<!-- -->` cover the languages prompts
live in.

`${x}` needed no handling at all: it is exactly the shape `segment.ts` already
protects, so an embedded prompt gets the same cache-prefix analysis, rule
protection and `--reorder` treatment as a `{{x}}` template, with no second code
path to drift.

- **Each prompt is budgeted on its own**, not summed into the file. Four prompts
  in a file are four things to govern, and the imports around them are not tokens
  the model will see.
- **The id is path-prefixed** — `src/prompts.ts#support-system`, or
  `src/prompts.ts:12` for a bare marker — so existing `budgets` globs cover
  embedded prompts without new syntax.
- **Source files are scanned without being opted into.** Requiring config to
  discover a marker somebody just wrote is how `eval` came to be fully implemented
  and completely undiscoverable. An unmarked source file is dropped silently.

**A marker Trazum cannot read fails the build.** A prompt assembled by
concatenation has no text until it runs; Trazum declines it and names the line
rather than governing the fragment it can see. The author marked that prompt to
have it governed, and a green build saying otherwise is the same lie as "0
failures" from a run that measured nothing.

Scanned character by character rather than with a regex, and the hostile-input
tests earned their place immediately: the obvious line-number lookup was quadratic
in the number of markers — 15.5 seconds on a file holding 20,000. Caught before it
shipped rather than after.

One more found in review, by CodeQL: `<!-- trazum:prompt greeting--!>` produced the
name `greeting--!>`, because `--!>` is the *comment end bang* the HTML parser also
accepts and only `-->` was being stripped. Fixed for both terminators, and the
class closed behind it — a name is now constrained to an identifier charset rather
than "whatever is left on the line", falling back to the `file:line` id when it is
not one. The name is printed in reports and matched against budget patterns; it
should never have been arbitrary text.

`diff` for embedded prompts is still to come; `check` is the gate and came first.


**The ±15% error band now has a corpus, a harness and a test.** It is printed on
every report, appears in both READMEs, in the estimator's own doc comment and in
`VERSIONING.md` as part of the frozen API — and `estimateTokens` was tested for
exactly three things: zero on empty input, monotonic growth, and never returning
`NaN`. Nothing measured its accuracy, and every dollar figure Trazum prints
descends from it.

Eight corpus samples, chosen to exercise the branches the estimator actually has:
prose in English and Spanish, Japanese and Chinese, code with fenced blocks,
few-shot Input/Output pairs, a punctuation-heavy Markdown table, and dense
numerics. `scripts/measure-token-band.mjs` (`npm run measure:tokens`) counts them
against the official endpoint and subtracts the message envelope, so the figures
describe the text rather than the request around it.

`token-band.test.js` asserts the band per sample. Three deliberate choices in it:

- **It does not pass quietly while unmeasured** — it skips out loud and names the
  command. "0 failures" from a check that measured nothing is the most misleading
  thing this suite could report, which is the same reasoning that makes `check`
  treat an unbudgeted run as an error rather than a pass.
- **It requires the docs to admit the band is unverified** until ground truth
  exists, so `±15%` cannot harden from a design target into a fact nobody
  established. `tokenizer.ts` and the README now say so.
- **It carries a digest of the corpus**, because a fixture describing text that
  has since been edited passes while describing something else.

Both paths were exercised before committing: a synthetic fixture confirmed the
band assertions fire per type with an actionable message, and that editing the
corpus afterwards fails on the digest. **The synthetic fixture was then deleted** —
fabricated numbers are exactly what this test exists to prevent, and committing
them to make a suite look green would be the same failure wearing a lab coat.

**Needs the maintainer once:** `ANTHROPIC_API_KEY=... npm run measure:tokens`. The
endpoint is free and does not run the model. Commit what it writes and the
assertions go live; if the bands differ materially by type, the reports stop
printing one number for all text.


**A tag now publishes the release.** Publishing is the one action in this
repository that cannot be undone — npm allows unpublishing for 72 hours and then
the version number is spent for good — and until now it was also entirely manual.
A tag matching `v*.*.*` runs full `verify`, reports exactly what each tarball
would contain, and then publishes both packages.

**Trusted publishing (OIDC), not a stored `NPM_TOKEN`.** That is the decision in
this change rather than an implementation detail. A long-lived publish token would
be the highest-value credential the project holds, sitting in secrets permanently
for something used a few times a year — and unlike every other secret here, a leak
is not recoverable by rotation alone, because whatever was published under it
stays published. OIDC needs `id-token: write` and stores nothing. Provenance comes
free with it, so a consumer can verify a tarball was built from this repository at
this commit.

Three refusals, each a mistake with no correction afterwards, and each with a test:

- **The tag and the manifests must agree.** `publish.test.js` already asserts
  every manifest carries the same version; the workflow checks that the shared
  version is the tagged one.
- **`verify` runs before anything is published**, and it is the same `verify` a
  pull request runs. A release gate that checks less than the pull-request gate
  lets through exactly what the tag was for.
- **`workflow_dispatch` is dry-run only** — every publish step is gated on a tag.

`@trazum/core` publishes first, because the CLI depends on it at an exact version
and the other order leaves a window where installing the CLI fails.

**Still needs the maintainer once:** the `@trazum` scope does not exist on npm, so
it has to be created and this repository configured as a trusted publisher.
[docs/releasing.md](docs/releasing.md) is new and has the exact fields, the
cutting-a-release checklist, and what to do when a release goes wrong — including
the field that is easy to get wrong: npm's *Environment* must read `release`, or
the OIDC claims do not match and the publish is rejected with an error about the
token rather than about the mismatch.

Until it is done a tag push runs every check and fails at the publish step — which
is the right failure, having published nothing.

**Issue templates, so a tester has somewhere to land.** `.github/` had CODEOWNERS,
Dependabot and workflows but no way for anyone to report anything. Two forms: a
bug report, and *"a rule changed what my prompt asks for"* — the second one
separate and labelled `correctness`, because Trazum's entire claim is one sentence
and a rule that saves tokens while quietly changing the meaning is the failure the
product exists to prevent, not a smaller version of a good outcome.

Both forms ask for a reproduction and both warn, before anything else, not to
paste a prompt containing anything private: Trazum runs entirely on your machine
and never sends a prompt anywhere, but an issue is a public web page. Security
reports are routed to a private advisory rather than an issue, and blank issues
stay enabled — the reports nobody anticipated are usually the interesting ones.


**Property tests for `reorderForCache`, over 400 generated prompts.** The
hand-written fixtures each ask one question about one prompt, and a fixture list
only asks the questions it encodes — which is how two quadratic patterns, a CRLF
bug and a leading-blank-line bug all shipped in the same module and were caught
one at a time afterwards.

Eight properties, checked across every generated case: content is conserved (no
word deleted or invented), a refusal returns the prompt byte-identical, a move
always grows the prefix and the figure reported matches what the advisories'
analyser computes, moved blocks keep their relative order, backward references
and placeholder blocks never move, the transformation is idempotent, the author's
line ending survives, and the prompt neither opens with a blank line nor ends
differently from how it was given.

Generation is seeded rather than random, so a failure names a case you can
reproduce by reading the seed out of the message.

All eight pass. Three failed on first run and all three were the *assertions*
being wrong rather than the code: `indexOf` from zero finds the first copy of a
repeated block, so a duplicate read as an out-of-order move; the generator emitted
mixed line endings and then asked whether endings were preserved; and a moved
block legitimately brings its own indentation to the front when the placeholder
sits on the first line. Each is now written to ask what it meant to ask.


**A piped `--reorder` said nothing about what it had done.** Redirecting the
output takes the "prompt and nothing else" path, which is right for every other
transformation — they delete, and the diff shows it. This one moves text, and
piping it made both the move and the refusals invisible. That is precisely what
the module promises not to do: *"a saving Trazum chose not to take is one the
author cannot evaluate."*

One line now goes to **stderr**, so stdout still carries the prompt and nothing
else:

```
trazum: moved 1 block (~1,001 tokens) into the cacheable prefix. Run without redirecting output for the reasons.
trazum: nothing could safely move; 2 blocks left in place. Run without redirecting output for the reasons.
```

**The version comment added yesterday named a version that does not exist.** The
README's SHA pin read `# 1.1.0` against manifests reading `1.0.0` — no such tag,
no such package. The test written to stop exactly this class of drift only
required `#\s*v?\d`, so it passed. It now compares the comment against
`package.json`, and fails on the string it was shipped with. A test that admits
only the shape of an answer will accept a wrong one.


**The README recommended a tag that did not exist.** `Davmunrey/Trazum@v1.0.0`
was the copy-pasteable Actions example for a whole release, and no such tag was
ever pushed — so anyone following the quickstart got a workflow that could not
resolve its own action.

It was also the wrong *shape*. [SECURITY.md](SECURITY.md) says every third-party
action is pinned to a commit SHA because a tag is a movable pointer, and
`security.test.js` enforces that on every workflow in this repository. The README
was telling readers to do the thing the project refuses to do itself.

Both examples now pin to a commit SHA with the `# 1.1.0` comment Dependabot reads,
and a new test extends the SHA-pin rule from *what this repository runs* to *what
it tells other people to run* — the docs had drifted for a release with nothing
checking. The test fails on the old README, which is the only evidence that it
checks anything.


**`trazum optimize --reorder` moves the stable instructions in front of the
placeholder.** Since 0.2.0 the `cache-prefix-reorder` advisory has pointed at the
largest saving Trazum knows about and no command could take it. Prompt caching is
a byte-for-byte prefix match, so everything after the first `{{placeholder}}` is
re-read at full price on every call. Measured on a 1,178-token support prompt: 14
tokens cacheable as written, 1,174 after rearranging the same content — the
difference between a $0 caching saving and a $184 one at 50,000 calls a month on
Opus.

**Opt-in, and deliberately not part of `aggressive`.** Every other transformation
deletes text whose absence is local. This one moves text, and order carries
meaning: "Summarise the text above" is correct where it sits and nonsense in front
of the text it points at. `aggressive` promises "read the diff"; this asks whether
the order mattered, which is a different question.

What it refuses, which is most of the module:

- A block containing a backward reference (`above`, `the following`, `anterior`, …)
  stays put — **and so does everything after it**, because moving a later block
  past a pinned one changes their order relative to each other. The phrase list is
  generous in both locales on purpose: a false positive costs a saving that was
  available, a false negative silently changes what the prompt asks for.
- Only whole blank-line-separated blocks move, so a sentence is never severed from
  the paragraph that qualifies it and the placeholder's own line travels with it.
- Nothing moves without a placeholder, or below the model's cacheable minimum.

A refusal returns the prompt **byte-identical** and names the phrase responsible:
"no saving here" and "there was a saving and it was not safe to take" are
different answers, and only the second one is actionable. `--diff` compares
against what you wrote rather than against the rearrangement, so the move is not
hidden behind the deletions; `--json` carries the whole decision under `reorder`,
refusals included. `check` rejects the flag — it is a gate, and a gate does not
rewrite. `reorderForCache` is exported from `@trazum/core` for callers who want
the decision without the CLI.

### Fixed

Two defects in the rejoined seams, both found by writing the fixtures that had
been missing rather than by a report:

- A placeholder on the **first line** left the rearranged prompt opening with a
  blank line. With no head for the moved blocks to sit after, the usual leading
  gap put whitespace at byte zero — which changes the cache prefix for nothing.
- A **CRLF** prompt came back with mixed line endings, because the seams were
  rejoined with bare newlines regardless of what the author used. In a
  byte-for-byte prefix match a changed byte is a changed price, and in a
  repository it is a diff on every line nobody asked for. The prompt's own line
  ending is now preserved, as is whatever it ended with — collapsing runs of blank
  lines remains the whitespace rule's job, not this one's.

- **Two quadratic patterns** in the new module, found by pointing the existing
  ReDoS suite at it rather than by reading it. `split(/(?<=\n)(?=\s*\n)/)`
  re-consumed a run of blank lines at every position inside it — 13.9s on 120 KB
  of newlines — and `/\s*$/` on a prompt holding a long whitespace run that does
  *not* end in one took **31 seconds at 200 KB**, inside the 400 KB the HTTP API
  accepts. Both are now a linear scan and a `trimEnd`.

  The suite drives `optimize`, which never reaches `reorderForCache`, so nothing
  covered it: a fixture list only asks the questions it encodes. `reorderForCache`
  now has ten fixtures of its own, each sized so the old pattern is well past the
  budget rather than near it.

The cacheable-minimum bar is on the **resulting prefix**, not on the amount moved
— `minPrefixTokens`, not `minTokens`. Those are different questions, and asking
the second one refused a real saving: a prompt whose 1,265-token head already
cached gained nothing from 359 stranded tokens, because 359 is below Opus's
512-token minimum. It reported "nothing could safely move", which is not what
happened.

The declined list in the report is capped at three lines and now says how many it
did not print. A report that shows three of nine reads as "three".

`--reorder` and `--markdown-out` were both **accepted and undocumented** — absent
from `--help` in either locale. The parity test named four *required* flags and
passed the whole time; it now derives the list from what the binary actually
accepts, by reading the allow-list the CLI prints when it rejects an unknown flag.
`--markdown-out` had been undocumented since 0.11.0.


**A post-1.0 roadmap.** `Next` was empty after 1.0.0 — honest, since every planned
item had shipped, but the file's stated purpose is that "the ordering is a
commitment", and it was committing to nothing.

Four entries, and two of them exist because writing the roadmap turned up things
worth saying out loud:

- **1.2.0 — Releasing without remembering.** A tag-triggered workflow, using npm
  trusted publishing rather than a stored `NPM_TOKEN`: a long-lived publish token
  would be the highest-value credential this project holds, sitting in secrets
  permanently for something used a few times a year. It must refuse to publish a
  version that does not match the tag.
- **1.3.0 — The error band, measured.** `±15%` is printed on every report and
  asserted nowhere. `estimateTokens` is tested for zero-on-empty, monotonic growth
  and not-`NaN`; nothing checks its accuracy, and every dollar figure descends from
  it. It is also one number for all text, which the CJK case suggests is not true.
- **1.4.0 — Prompts where they actually live.** Trazum reads `.txt`/`.md`/
  `.prompt`/`.tmpl`, so prompts embedded in TypeScript or Python require
  refactoring an application before Trazum can be adopted at all.
- **1.5.0 — The front door catches up.** The web app optimises and nothing else,
  five releases behind the CLI. Last on purpose: it changes how the product looks
  rather than whether its numbers are right.

Release automation was written as 1.1.0 and is now 1.2.0, because writing the entry
established that it **cannot ship**: publishing needs the `@trazum` scope to exist
on npm, which is the maintainer's to create. Holding the queue behind a
prerequisite outside the repository would have been worse than reordering it, and
`ROADMAP.md` says so in the file rather than only here — the ordering is a
commitment, so a change to it owes a reason.

The `Tokenizer per model family` entry under `Under consideration` now says it is
pending the error-band measurement rather than reading as a pure dependency-cost
decision. Measuring the band is what settles whether a real tokenizer is needed.

Also fixes a doubled `---` left in `ROADMAP.md` by the 1.0.0 edit.

## 1.0.0

**The public API is frozen.** A breaking change waits for 2.0. This is the last
release in which anything can change shape without a major.

[VERSIONING.md](VERSIONING.md) now states what that covers and, as importantly,
what it does not — and it states the **deprecation procedure** rather than leaving
it to be decided case by case:

- `@deprecated` in the JSDoc, naming the replacement. That is the strike-through
  in an editor, which is the only warning most people will ever see.
- A **Deprecated** section in that release's changelog, with the migration written
  out — the actual before-and-after, not "use the new thing".
- Continues working for **at least two minors and six months**, whichever is
  longer. Deprecating and removing in consecutive releases is a breaking change
  wearing a notice.
- Removed only in a major, whose changelog repeats the migration.

A deprecated export **never starts warning at runtime**. A library that prints to
somebody else's stderr because *we* changed our mind is a library people vendor to
make quiet.

Newly named as covered, because they were being depended on either way: the
`--json` shape and units, the CLI's **exit codes**, `@trazum/core/node` as a real
entry point, and the `trazum.config.json` and pricing-overlay schemas. Newly named
as *not* covered: the prose and layout of the human reports — parse `--json`, not
the table.

### Publishable

Both packages would previously have shipped something wrong. Now asserted by
tests in `publish.test.js`, because a published package is the one artefact this
repository cannot take back:

- **A `LICENSE` file**, not just a `"license"` field. The field is metadata; the
  tarball has to carry the terms or nobody who installs it has been given them.
- **A README.** The npm page *is* the README, and both were empty.
- **`engines`.** Without it npm installs silently on a Node too old to run the
  code, and the failure surfaces as a syntax error in somebody else's build.
- **`prepublishOnly`**, which builds and tests. `files: ["dist"]` means the
  tarball is whatever happens to be on disk, so publishing without building would
  have shipped the previous version's code under the new version's number —
  completely silently, and the worst possible outcome.
- **`src`.** Every emitted source map references `../src/*.ts` and carries no
  inlined content, so shipping the maps without the sources gave a debugger a file
  it could not load. That is worse than no map, which would simply step through
  the compiled output. It also means you can read exactly what runs on your
  prompts, which for a zero-dependency library is rather the point.

Publishing itself stays manual. It is the one action here that cannot be undone
after 72 hours.

### A rule can be contributed without reading the engine

New [docs/authoring-rules.md](docs/authoring-rules.md): the four-line rule
contract, what the masking pass already guarantees (a rule cannot break code,
URLs or placeholders because those characters are not in the string it receives),
why **`safe` is a promise** rather than a default, and the three tests a rule
needs — the third being the false-positive case nearly everyone skips.

It also documents the ReDoS fixture **shape** that finds real bugs. Repeated
tokens do not: both bugs found in this repository needed a prefix plus a long
non-terminating run, and the fixtures that missed them were all repeated words.

`CONTRIBUTING.md`'s security-invariant list said "four things" and had drifted to
eight. Corrected, with the import-graph invariant and the two Actions ones added.

### Pricing came off the release cycle

Prices change on someone else's schedule, and until now correcting one meant
upgrading the library — which is backwards: a stale price is a wrong number in a
budget decision.

A **pricing overlay** is a JSON file layered over the bundled catalogue:

```json
{ "lastReviewed": "2027-01-15",
  "models": { "claude-opus-5": { "inputPerMTok": 6 } } }
```

Point at it with `pricing` in `trazum.config.json` or `--pricing <file>`. The
bundled catalogue stays the default, so Trazum is still correct out of the box
and needs no setup.

- **A separate `@trazum/pricing` package would not have solved this.** You would
  still need to install something to get current numbers. A JSON file in your own
  repository actually decouples it, and keeps both properties that matter: the
  core still makes no network call, and it still has no dependencies.
- **The catalogue is a value, not module state.** `applyPricingOverlay` returns a
  *new* catalogue; nothing mutates. A caller who overlays prices does not change
  what any other caller sees, which is what stops one consumer's local prices
  leaking into another's report — and what makes it testable at all.
- **Every report says when overlaid prices were used, and for which models.**
  Without that, a figure from the bundled catalogue and a figure from somebody's
  JSON file look identical. `OptimizationResult` gains `pricingSource`.
- `lastReviewed` is **required** in an overlay, and becomes the catalogue's date.
  An overlay of unknown age is worse than the bundled catalogue, whose age is
  printed on every report; and claiming the bundled date over corrected prices
  would be a lie about provenance.
- Overriding a known model needs only the fields that changed. **Introducing a
  model needs all of them**, because a half-defined model would price at nothing
  and report a saving that does not exist. `"promo": null` withdraws a promotion
  that ended early.
- `withExactTokenCounts` **throws** if a result was priced against an overlay and
  the same catalogue is not passed back. Silently reverting to bundled prices
  would make the token counts and the money come from different sources, with
  nothing in the report to show why.
- `cheapestOfTierIn` ranks a tier on the **effective** price, so a model inside a
  promotional window is compared at what it actually costs today.
- Validation is as strict as the config parser's, same reasoning: a typo'd
  `inputPerMtok` would silently price against the bundled number, and a budget
  decision made on a price nobody applied is the whole failure being prevented.
- `usage.model` validation **moved** from `parseConfig` to `loadConfig`. An
  overlay can introduce a model, and the path to the overlay is a key of the very
  document being parsed — so the parser cannot know the catalogue yet. The check
  is still loud, just raised where "unknown model" can be answered truthfully.
- Tests grow from 390 to 406, including a new `publish.test.js` suite.

**Every third-party GitHub Action is now pinned to a commit SHA.** `SECURITY.md`
listed this as a known limit; it no longer is. A tag can be moved and a branch
moves by design, so `@v3` means "whatever that publisher pushes there next", with
the caller's token and secrets in scope.

- The sharpest case was `actions/dependency-review-action@v5`, whose majors are
  published as **branches** rather than tags — a reference that is *designed* to
  move. (Worth recording: I first read the tag list and concluded `@v5` did not
  resolve at all. It does — `refs/heads/v5` — and the branch is the point.)
- Pinning only freezes a version if nothing bumps it. `.github/dependabot.yml`
  already has a `github-actions` entry, and the trailing `# vN` comment is what
  it matches on.
- Two new invariants: every `uses:` outside this repository must be a 40-character
  commit SHA, and every pin must carry a version comment. A pin with no comment
  is a line nobody can review and nothing will ever update.

## 0.11.0

**Breaking, for the GitHub Action only:** `file` and `max-tokens` are no longer
required inputs. `file` still works and is now a deprecated alias for `target`;
rename it when convenient, and the Action warns when it sees the old name.
Nothing in the library or CLI changed shape. Migration: `file:` → `target:`.

The reports now land where the review happens. `trazum check` and `trazum diff`
grow a `--markdown-out <file>`, and the Action writes that file to
`$GITHUB_STEP_SUMMARY` and — optionally — posts it as a pull request comment
that **replaces its own previous one** rather than adding another.

**Three bugs 0.10.0 introduced in the Action, all the same shape.** Config
support shipped in the CLI while `action.yml` kept passing `--level safe` and
`--locale en` unconditionally. The CLI layers flags over config over defaults,
so an always-present flag meant a project's own `level` and `locale` were never
read; `max-tokens: required: true` meant config budgets were unreachable; and
`file: required: true` meant neither directory mode nor `diff` was exposed at
all. Every optional flag is now added only when it was actually given. **A
default that silently overrides a project's own setting is worse than no
default.**

- **`--markdown-out`** on `check` and `diff`. Written before anything sets an
  exit code, so a report exists precisely when it is needed. A failure to write
  is reported and swallowed: a full disk must not turn a passing check into a
  failing build.
- **The step summary is not behind an input.** It needs no token, no permission
  and no pull request, and has no failure mode worth a switch.
- **The reporting steps carry `if: always()`.** A composite action skips the rest
  of its steps once one fails, so without it the summary would appear only on
  runs nobody needs a report for. The budget verdict is re-raised in a final
  step, and a *missing* outcome counts as failure — a check that never reached
  its own last line is not a green build.
- **`comment: true`** posts the report, found by an invisible marker in the body
  rather than by author. `gh pr comment --edit-last` matches by author, so any
  other step in the job commenting as `github-actions[bot]` would have had its
  comment overwritten. `comment-key` separates two runs that report on different
  things in the same pull request.
- **A green report is collapsed inside `<details>`; a failing one is not.** A
  green table that stays green on every push is the thing a maintainer learns to
  skip — and once they skip it, they skip the red one too.
- **Commenting can never fail the build.** No pull request, a read-only token on
  a fork, comments disabled, an unreachable API: each records a notice and
  carries on, because the report already reached the step summary. A tool that
  turns "could not comment" into a red build gets deleted from the pipeline
  rather than configured. A 401/403 says so in one line and says explicitly *not*
  to reach for `pull_request_target`, which runs a writable token against code
  the contributor controls.
- The poster lives in `action/post-comment.mjs`, outside the workspaces and in
  plain ESM with no dependencies. It needed no security invariant relaxed —
  editing one for convenience is not a reason.
- **Table cells are `<code>` with HTML entities, not backtick spans.** The
  obvious version — wrap in backticks, escape `|` as `\|`, widen the fence past
  the longest backtick run — did not handle a backslash, which CodeQL caught:
  given `a\|b.txt` it emitted `` `a\\|b.txt` ``, and whether that survives
  depends on whether the row splitter reads `\\|` as an escaped pipe or as an
  escaped backslash followed by a live one. It happens to work in cmark-gfm.
  An escaper whose correctness rests on that is not an escaper. With entities
  there is **no `|` in the output at all**, so no scanner can split the row;
  backticks inside `<code>` are literal, so the fence arithmetic disappears; and
  a backslash needs no treatment. Three hazard classes collapse into one rule.
  Paths come from a repository, and on a pull request from whoever opened it.
- The check verdict counts **only what was measured**. "All 3 prompts are within
  budget" over a set where one had no budget claims something nobody
  established.
- New security invariants: every `${{ }}` in `action.yml` must be a *bare* env
  assignment or a condition; the reporting steps must carry `if: always()`; the
  comment step must be unable to fail the job; and a missing outcome must default
  to failure. The old "every input reaches the CLI" assertion was a usefulness
  check dressed as a security one, and it broke the moment an input legitimately
  gated a step instead of being forwarded — replaced by the positional rule,
  which is what actually matters.
- Tests grow from 303 to 359, including a new `action/test` suite wired into
  `npm test`.

**A security guardrail was ineffective, and is now enforced with positive
controls.** Carried over from the previous unreleased entry.

The test asserting *"inputs reach the Action's shell through the environment,
never interpolated into `run:`"* did not do that. Two independent causes: its
`run:` body pattern required a newline after the optional block indicator, so a
single-line `run:` was never recognised as a run block at all; and it searched
that body only for `${{ inputs.* }}`, which is the *safest* value in the set
because it is workflow-authored. The dangerous ones were outside what it looked
at entirely — `github.event.pull_request.title`, `...body` and
`github.head_ref` are written by whoever opened the pull request.

- `action.yml` itself was never vulnerable, and still is not: every input goes
  through `env:`, no `run:` body interpolates anything. What was broken was the
  guardrail meant to keep it that way, and `SECURITY.md` claimed more than the
  test asserted. Both are corrected.
- The rule is now **positional and source-blind**: nothing may be interpolated
  into a `run:` body, ever. Provenance is not something a regex can judge, and a
  step that derives an input from a PR title turns a "safe" source unsafe
  without touching the file the test inspects.
- The harm never depended on the token being writable. Substitution happens
  before bash parses, so the payload runs on the caller's runner with whatever
  secrets that job has in scope.
- **Five positive controls** the scanner must flag, plus a negative control:
  `action.yml` quotes an expression inside a prose comment explaining the rule,
  and a test that fails when you document the reasoning teaches people to stop
  documenting it. The version this replaced had no positive control, which is
  exactly why it passed for every shape it could not see.
- Also asserts that no workflow and not `action.yml` uses
  `pull_request_target` — the event a reviewer reaches for the moment they find
  a fork PR cannot post a comment, and the one that runs a writable token
  against contributor-controlled code. 0.11.0's natural wrong turn now needs
  arguing in a pull request rather than arriving quietly.
- Found while designing 0.11.0, which would have been written in exactly the two
  shapes the test could not see.
- Tests grow from 301 to 303.

## 0.10.0

`trazum.config.json` and directory mode. Two of the three items left over from
0.9.0; PR comment mode for the Action is still open.

**`trazum check prompts/`** checks every prompt under a directory against
per-pattern budgets from the config file — one CI step for a repository of
prompts rather than one step per file.

**The config parser refuses anything it cannot validate, including an unknown
key.** That is the design, not strictness for its own sake: a lenient parser
restores defaults silently, and for a budget the default is *no budget* — a
green build for a prompt nobody measured. Same reasoning as `--max-growh` being
rejected rather than ignored in 0.9.0.

- `trazum.config.json`: `level`, `locale`, `disable`, `usage`, `budgets`,
  `maxGrowth`, `extensions`. Found by walking up from the working directory and
  stopping at the repository root, so a subdirectory inherits the project's
  settings and nothing above the checkout is ever read. `--config <file>` skips
  the search.
- **Flags beat the config; the config beats the defaults.** A config able to
  override an explicit flag would make every flag a suggestion.
- New `--no-<flag>` for booleans, so a setting the config switched on is not one
  you have to edit the repository to escape. `--no-max-tokens` is refused rather
  than silently accepted, and an unknown `--no-x` is quoted the way it was typed
  instead of as `--x`.
- Budgets resolve to the most specific matching pattern, with "specific" given a
  stated definition — most literal characters wins, longest pattern breaks a
  tie. Pattern order in the file never matters. The JSON report names the
  pattern each budget came from.
- A file no pattern covers is listed as `(no budget)`, not skipped; and a run
  where nothing at all was budgeted is an error. "Checked 40 files, 0 failures"
  from a run that measured nothing is the most misleading output this tool could
  produce.
- `maxGrowth` in the config arms the `diff` gate exactly as the flag does.
  Absent both, growth alone still exits 0.
- `locale` in the config is outranked by the environment — the only setting
  where that is true. A repository choosing the language of its CI logs should
  not choose the language of a contributor's terminal.
- New glob matcher, written as a segment-wise dynamic program rather than a
  regex translation. `**` compiled to `(?:[^/]*\/)*` is the nested-quantifier
  shape that backtracks exponentially, and these patterns come from a file in
  the repository — on a pull request, from whoever opened it. Bounded in pattern
  and path length, with a time-budget test over the shapes that break the regex
  version.
- The directory walk **does not follow symlinks**, caps depth and file count,
  and reports when a cap stopped it early. A link to `/etc` would turn "check
  the prompts folder" into printing token counts for files outside the project;
  a link loop would turn it into a hang.
- **New entry point, `@trazum/core/node`**, holding everything that reads the
  filesystem: `loadConfig` and `walkPrompts`. The main entry point stays free of
  Node builtins, which it has to be — `apps/web` bundles it for the browser, and
  a single `node:fs` import anywhere in that graph fails the build outright. The
  pure halves (`parseConfig`, `budgetFor`, the types and key lists) are on both.
- Two new security invariants. The first names which modules may read the disk;
  the second **walks the import graph from the main entry point** and fails if
  any Node builtin is reachable from it. The first version of this change shipped
  with only the module allow-list, which passed while `config.ts` was also
  re-exported from `index.ts` — a file allow-list is not a boundary, the import
  graph is. That matters beyond the build: the web app hands `optimize()` a
  prompt straight from a request body, so a file read reachable from that entry
  point would be path traversal available to anyone who can reach the API.
- The config file is measured and read through **one file handle**. Calling
  `stat(path)` and then `readFile(path)` resolves the name twice, so what gets
  read is not necessarily what got measured, and a symlink swapped in between
  defeats the size limit. Found by CodeQL.
- Budget patterns are checked for absoluteness with an explicit pattern rather
  than `path.isAbsolute`, which is platform-dependent: on Linux it reads
  `C:\prompts` as relative, so a Windows-shaped pattern would pass validation on
  a Linux CI runner and then match nothing.
- `editDistance` moves into core as `nearestName` and is now shared between the
  unknown-flag and unknown-key suggestions rather than duplicated.
- Tests grow from 228 to 301.

## 0.9.0

New `trazum diff` command and `comparePrompts()` API: compare two versions of a
prompt and report what the edit cost. `optimize()` answers "how much fat is in
this prompt"; this answers the question a pull request actually raises —
somebody edited this, did it get worse?

**The design decision that keeps it honest.** Every other figure Trazum prints
is a *saving*: before minus after, positive is good. Every figure here is a
*delta*: after minus before, positive is **bad**. Mixing those two conventions
in one report is the easiest way to make a cost tool lie, so the comparison
lives in its own module, nothing in it is named a saving, and the negation
happens exactly once, at the boundary.

- Reports what the edit broke, not only what it cost: advisories that appeared
  and rules that started firing, plus the same in reverse when the edit
  improved things.
- Measures the text **as written** by default, not what the rules would leave.
  A pull request changed the file on disk, so the file on disk is what the
  reviewer is being asked about — otherwise a prompt that doubled in length but
  happened to double in courtesy would report no change. `--optimized` switches
  the figures to the post-rules text.
- **The gate is opt-in.** Growth alone exits 0; `--max-growth 10` is what makes
  it exit 1. A tool that fails a build nobody armed gets removed from the
  pipeline rather than fixed.
- `--max-growh` is rejected with "Did you mean --max-growth?" rather than
  ignored — a silently-swallowed gate flag means CI green while the author
  believes a limit is set.
- New `formatSignedUsd()`: `+$9.25` and `-$9.25`, because `formatUsd` renders a
  negative as `$-9.25`, which reads as a typo. Negative zero is collapsed, so a
  change that did not happen is never shown with a direction.
- `deltaPct` is 0 rather than `Infinity` when the original was empty.
- Tests grow from 196 to 228.

## 0.8.0

New `trazum eval` command and `evaluate()` API: run both prompt versions over a
set of inputs and report whether the optimisation changed the answers. Every
other number Trazum reports is arithmetic; this is the one question arithmetic
cannot answer.

**The design decision that makes it worth anything.** A model asked the same
question twice does not answer identically, so "the optimised prompt diverged
on 3 of 10 cases" means nothing on its own — it might be better than the
original manages against itself. The original therefore runs **twice** per case
first, and that self-agreement is the yardstick the rewrite is judged against.
It costs a third call per case and it is the only reason the verdict means
anything.

- Four verdicts: `indistinguishable`, `within-noise`, `diverges`, and
  `inconclusive` — the last for when the original cannot agree with itself
  often enough to judge anything against. A confident verdict off an
  inconsistent baseline would be worse than admitting the test does not work.
- Exits 1 on `diverges`, so it can gate a pull request the same way
  `trazum check` gates a token budget.
- Prints the call count before spending anything.
- A template gets its first placeholder filled rather than the input appended:
  appending would test a prompt nobody runs.
- Cases come from a file, one per line (`#` comments and blanks ignored) or a
  JSON array. A file that merely starts with `[` falls back to line mode rather
  than erroring.
- Bounded concurrency, default 3. The baseline pair stays sequential within a
  case: issuing both at once invites a provider to serve one from cache and
  report a variance of zero.
- Tests grow from 179 to 196.

## 0.7.0

- New `reviewExamples`: the paraphrase case the deterministic detector refuses
  to guess at. Two examples teaching the same lesson in different words score
  around 0.54 on word overlap — close enough to two genuinely distinct examples
  (~0.20) that catching them by similarity would mean flagging examples that
  teach different things. Deciding that "arrived quickly" and "arrived fast"
  demonstrate the same pattern needs a model, so this sits behind the optional
  LLM layer, costs a call, and never runs during an ordinary `optimize()`.
- Returns `null` below two examples, so the caller does not pay for a foregone
  answer.
- **The response is treated as untrusted input, because it is.** Indices are
  range-checked against the examples that exist, self-references dropped,
  overlapping groups collapsed so the same tokens are never counted twice, and
  the model's stated reason truncated. A model answering with prose produces an
  empty review — not a crash, and not a saving the prompt could not deliver.
- A provider **error** still throws. A bad answer is the model's problem and
  gets absorbed; a broken endpoint is the caller's configuration and hiding it
  would waste their afternoon.
- The CLI runs it under `--llm`, reports it as a suggestion to read rather than
  a change made, and includes it in `--json`.
- Shortens the GitHub Action's description to 113 characters: the Marketplace
  rejects anything over 125, which blocked publishing.
- Tests grow from 164 to 179.

## 0.6.0

**Fixes a rule that left a broken sentence behind.** `self-check` matched
"double-check your answer before responding" but not the subject and modal in
front of it, so `"You MUST double-check your answer before responding."` became
`"You must."` — a sentence that says nothing, in place of one that said
something. Whatever can open one of these instructions is now listed ahead of
the bare form, in both languages.

That bug had been there since the rule shipped. It surfaced within a minute of
the feature below existing, which is the argument for the feature.

- `RuleResult.changes`: each rule now reports a short list of what it actually
  changed, as before/after pairs. `hits` still carries the true total.
  `aggressive` has always come with the advice "read the diff", and the diff
  was one undifferentiated block for every rule at once — not review, a wall of
  text with a warning attached. Now an aggressive run is judged rule by rule,
  and a single rule you disagree with is disabled with `--disable` instead of
  abandoning the level that saves the most.
- Empty rather than truncated when a change is too large to summarise. An empty
  list reads as "nothing to show here"; a truncated one would read as "this is
  all that happened", which would be a lie.
- Bounded by construction, like everything else that touches untrusted text:
  the common prefix and suffix are trimmed in linear time, and anything still
  too large is skipped rather than diffed. Covered by the same adversarial
  fixtures as the ReDoS suite.
- Shown in the CLI and the web app for aggressive rules, and for every rule
  under `--diff`.
- New public API: `extractChanges`, `DEFAULT_CHANGE_LIMIT`, and the
  `RuleChange` type.
- Tests grow from 145 to 164.

## 0.5.0

A third structural finding, same posture as the first two: it reports, it does
not cut.

- New `restated-output-format` advisory. A prompt that shows its schema in a
  code block and then walks the same fields in prose is paying for the schema
  twice; the block is the version worth keeping, since it is unambiguous and
  the protection pass guarantees Trazum never edits it. Priced per month.
- Reads *illustrative* schemas, not only valid JSON. Prompts routinely contain
  trailing commas, `...` and `<placeholders>`, and refusing to parse those
  would skip exactly the prompts worth checking — so key extraction is a
  depth-aware scan rather than `JSON.parse`.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification ("set `escalate` to true when the customer asks for a human")
  and flagging it would turn the advisory into noise.
- New public API: `findRestatedFormat`, and the `RestatedFormat` type.
- Tests grow from 138 to 145.

### Dependencies

- `next` 15 → 16, which is what finally cleared the three high-severity
  `postcss` and `sharp` advisories. Bumping the direct dependency was not
  enough on its own: the lockfile kept the vulnerable transitives, and the
  blocking audit is scoped to the published packages so it never saw them.
  `npm audit` over the whole tree now reports 0 vulnerabilities. The lesson is
  recorded in `SECURITY.md`.
- `actions/checkout` and `actions/setup-node` 4 → 7, clearing the Node 20
  deprecation warning every run was printing.
- `actions/dependency-review-action` 4 → 5.

## 0.4.0

Structural analysis: findings that live in the *relationship* between two
places in a prompt, which no phrase dictionary can see because neither place is
wrong on its own. Both are advisory — Trazum points, it does not cut.

- **Fixes a corruption bug in `duplicate-lines`.** The rule was deleting the
  shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often exactly why both are there. Labelled example fields (`Input:`,
  `Output:`, `Q:`, `A:`, and Spanish equivalents) are now exempt from
  line deduplication. This affected the `safe` level, so it could silently
  damage a prompt anyone ran through Trazum.
- New `contradictory-instructions` advisory across four axes: response
  language, output format, response length, and whether to show the reasoning.
  Reported as a **warning** with both conflicting sentences quoted. It carries
  no dollar figure — being wrong has no price tag.
- New `redundant-examples` advisory: few-shot examples that are near-copies of
  an earlier one, with the tokens they cost per month. It detects copy-paste
  accumulation (~0.89 similarity for a copied example with one field changed),
  and deliberately **not** paraphrases (~0.54), which sit too close to
  genuinely distinct examples (~0.20) to separate without a model.
- **Advisories now sort by severity before money.** Sorting purely on the
  dollar figure buried an overflowing context window — and now a contradiction
  — underneath a saving of a few dollars.
- New public API: `findContradictions`, `analyzeExamples`, `findExamples`, and
  the `jaccard` / `normalizeForCompare` similarity helpers, which moved to a
  shared module so the duplicate rules and the structural analysis cannot
  disagree about what "near-duplicate" means.
- Adding a contradiction axis now fails to compile until every catalogue names
  it, the same guarantee `RuleId` gives rules.
- Tests grow from 75 to 94.

### Security

Hardening for an open repository taking outside contributions. Full reasoning
in [SECURITY.md](SECURITY.md).

- **Fixes four SSRF filter bypasses.** The web app's private-host blocklist
  allowed `https://[::ffff:169.254.169.254]` — the IPv4-mapped IPv6 form of the
  cloud metadata address, which Node normalises to `[::ffff:a9fe:a9fe]` and the
  old patterns did not match. Also allowed: a trailing-dot hostname
  (`localhost.`), the carrier-grade NAT range (`100.64.0.0/10`), and
  credentials embedded in the URL, which would have been forwarded to whatever
  the host resolved to and written into any log recording the endpoint.
- The filter moved from the Next.js route into `@trazum/core` as
  `validateLlmEndpoint` / `isPrivateHost`, so the most security-sensitive code
  in the project is unit-tested instead of living untested in an API handler.
  It returns a reason code rather than a message, so callers localise it and
  tests assert on the decision.
- **Fixes two ReDoS denial-of-service bugs**, both reachable from the public
  HTTP endpoint, both found by CodeQL after the first round of ReDoS tests had
  passed:
  - `whitespace` — a **`safe`-level rule present since 0.1.0**. Its
    trailing-whitespace pattern restarted at every position inside a whitespace
    run and failed from each one when the run did not end the line: 17 seconds
    on a 100 KB line of spaces, well inside the 400 KB the API accepts.
    Anchored to the start of a run, it is now 3 ms at 400 KB.
  - The few-shot label patterns added in this release ended in three adjacent
    unbounded quantifiers, measured at O(n²) — 651 ms at 40 000 spaces, about a
    minute at the size cap. Their quantifiers are now bounded.
  - The ReDoS suite gained the fixture shape it was missing. The original
    fixtures were all *repeated tokens*, which exercise the happy path over and
    over; neither bug needed that, they needed a plausible prefix followed by a
    long run that never completes the match.
- New `security.test.js` enforcing four invariants on every pull request: the
  SSRF filter fails closed, the core and CLI carry zero runtime dependencies,
  `fetch` appears only in the two modules that exist to make calls, and no
  regex exhibits catastrophic backtracking under pathological input.
- Workflows run with `permissions: contents: read` by default,
  `npm ci --ignore-scripts`, and `persist-credentials: false`.
- Added CodeQL (`security-extended`), dependency review, a weekly `npm audit`,
  Dependabot, `CODEOWNERS`, and an importable branch ruleset at
  `.github/rulesets/main-branch.json`.
- `SECURITY.md` documents the threat model, private reporting, the settings an
  admin still has to switch on, and the limits that are not covered — DNS
  rebinding, per-instance rate limiting, and actions pinned to tags.

## 0.3.0

**Breaking.** `buildAdvisories()` takes an options object instead of trailing
positional arguments: `buildAdvisories(prompt, tokens, usage, { on, count, locale })`
replaces `buildAdvisories(prompt, tokens, usage, on, count)`. The `Rule`
interface no longer carries `title` or `rationale` — rules carry an `id`, and
copy is resolved from the message catalogue with `getMessages(locale).rules[id]`.
`OptimizationResult.rules` is unchanged, so consumers of the report need no
migration.

The repository is now English end to end — source, comments, tests,
documentation, CLI, web and CI. Spanish was not removed; it was moved out of
hardcoded prose into a locale, which is the only version of "add a language"
that survives a second one.

- Per-locale message catalogues in `@trazum/core`, `@trazum/cli` and
  `@trazum/web`, with English as the declared source of truth.
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` accept a `locale`, and the result carries
  the locale it was produced in.
- New `matchLocale()`, which returns `null` when its input names no locale we
  ship — that is what lets a caller fall through to the next configuration
  source instead of mistaking a fallback for a choice. `resolveLocale()` now
  walks a whole `Accept-Language` list, so `fr-FR,es;q=0.9` resolves to Spanish
  rather than defaulting to English.
- CLI: `--locale`, then `TRAZUM_LOCALE`, then the POSIX locale variables. The
  flag is read straight from argv, so even a bad-argument error is reported in
  the requested language. `trazum rules` now reads its copy from the core
  catalogue, so it can no longer drift from the report.
- Web: `Accept-Language` is negotiated on the server, so first paint already
  matches the reader; a switcher in the masthead overrides it and the choice is
  remembered. `generateMetadata` negotiates too, so link previews follow.
  The API route localises its own errors as well as the report.
- The web starter prompt now exists per language, since the phrase
  dictionaries are per-language and the example exists to show rules firing.
  Switching language never overwrites a prompt you wrote.
- `GET /api/optimize` no longer returns rule copy: it was locale-blind, and the
  report carries its own.
- Sample prompts are `examples/sample-prompt.en.txt` and
  `examples/sample-prompt.es.txt`; the action self-test runs against both.
- The GitHub Action takes a `locale` input.
- Tests grow from 47 to 75, adding catalogue-parity coverage so a locale cannot
  silently go stale, plus a CLI suite covering locale resolution. `npm test` now
  runs both packages.
- New `ROADMAP.md`, `VERSIONING.md` and `CONTRIBUTING.md`.

## 0.2.0

- Cacheable-prefix analysis (`analyzeCachePrefix`): the prompt-caching advisory
  computes its saving over the real stable prefix — everything before the first
  template placeholder — instead of over the whole prompt, which in a template
  never caches in full.
- New `cache-prefix-reorder` advisory: detects stable instructions sitting
  after the first placeholder, which today never cache, and prices moving them
  in front.
- Packaged GitHub Action (`Davmunrey/Trazum@main`) for `trazum check`: token
  budgets in CI with nothing to install, with a self-test in the repository's
  own CI.

## 0.1.0

First release.

- Deterministic core (`@trazum/core`): 12 rules across two levels, isolation of
  code/URLs/templates/XML, dependency-free token estimator, pricing catalogue
  with promotions, and savings advisories (caching, Batch API, model tier,
  context window).
- Optional, pluggable LLM layer (OpenAI-compatible endpoints, the Claude API,
  or a custom provider) with safety checks: a candidate is only accepted when
  it is shorter and preserves the protected content.
- CLI (`@trazum/cli`): `optimize`, `check` (token budgets for CI), `models` and
  `rules`; clean output when redirected, plus `--json`, `--diff` and
  `--exact-tokens`.
- Web (`@trazum/web`): Next.js interface with a word-by-word diff, local
  history, an editable cost scenario and a configurable LLM pass.
