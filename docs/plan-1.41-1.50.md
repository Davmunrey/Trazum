# The plan through 1.50

Ten releases, each large on purpose, as one arc. The ordering is a
commitment; the calendar is not, and no dates appear here for the reason
[ROADMAP.md](../ROADMAP.md) gives.

Every item is judged against the same sentence the roadmap uses: *Trazum
reduces what an AI call costs without changing what the prompt asks for.* And
against the two rules that have constrained everything since 0.1.0 — the
deterministic core stays free and offline, and a locale changes the report,
never the optimisation.

## The arc

Through 1.40 Trazum became complete and stayed inert.

The loop is finished: measure a bill, split it by service, rank what to do,
verify whether it happened, and watch the long run. Seventeen commands, four
surfaces, a doctrine that refuses to say more than it knows. And **every one
of them waits for a human to type something.**

Two facts follow from that, and they are the whole arc:

**Nobody runs it on the day it would have mattered.** Trazum reads files you
hand it, which means somebody must remember to export a log, remember to run
the command, and remember on the afternoon the loop burned a quarter of the
month — not three weeks later. A tool whose findings are real and whose
invocation is manual will report the fire after the building is gone.

**The thing spending the money cannot ask.** An agent decides to send a
200,000-token context to the most expensive model in the catalogue, and there
is no way for it to find out what that costs, or whether the budget it is
spending has anything left, before it spends it. The knowledge exists in this
repository; the caller cannot reach it in the moment the decision is made.

That is the arc: **Trazum stops being a tool you run and becomes something
that runs.** It connects to where the money actually is, stays connected,
answers in milliseconds, and gives the same measured answer to a person in a
terminal, a build in CI, a browser, and an agent about to spend.

| Version | Theme | The sentence it earns |
| --- | --- | --- |
| 1.41.0 | The connector | Your bill, read from the provider, without anybody exporting anything. |
| 1.42.0 | The store | A year of measured spend on disk, and not one prompt inside it. |
| 1.43.0 | The watch | The afternoon the loop burned a quarter of the month, said that afternoon. |
| 1.44.0 | The answer in milliseconds | "What will this call cost, and is there budget?" — answered before it is sent. |
| 1.45.0 | The agent's budget | The thing spending the money can finally ask, and be told no. |
| 1.46.0 | Five minutes | From `npx trazum` to a finding worth money, without reading anything. |
| 1.47.0 | The browser sees the bill | The whole loop on the web, with nothing leaving the machine. |
| 1.48.0 | Cost review | Spend becomes part of code review, on whatever CI the team already runs. |
| 1.49.0 | The live budget | One measured number that CI, the terminal and the agent all read. |
| 1.50.0 | The standard | The format, the guarantees, and the doctrine — written down for other tools. |

Patch releases (`X.Y.1`, `X.Y.2`) sit between these whenever a batch is thin.
A minor is earned by findings that change what somebody can decide, not by a
date — and each of these ten is scoped to be several such findings, not one.

---

## 1.41.0 — The connector

Trazum reads files somebody exported. Every provider that bills by the token
also serves that data over an API, and the export step is where adoption dies:
the person who would benefit most is the person least likely to have a
`usage.jsonl` lying around.

- **`trazum connect <provider>`** and **`--from-provider`** on every command
  that reads a log. Read-only pulls of usage over a window
  (`--since`/`--until`, the flags that already exist), normalised into the
  same `UsageRecord` shape the file path produces — so every finding in the
  product works on connected data the day it lands, with no second code path.
- **Credentials are borrowed, never held.** Keys come from the environment or
  from an OS keychain *reference* in the config; Trazum stores no secret, and
  a test fails the build if credential-shaped material can reach any output,
  the same guarantee session keys have carried since 1.12. The existing
  `checkedEndpoint` SSRF rules apply to every provider base URL, including a
  custom one.
- **Least privilege, stated.** Each connector documents the narrowest scope
  or key type that works, and refuses to run with a key whose scope it can
  see is wider than it needs — a cost tool asking for write access to
  anything is a cost tool nobody should install.
- **What a provider cannot tell you is named, not estimated.** Some APIs
  report aggregate spend without per-call rows: those connectors produce the
  totals they actually serve and say which findings are unavailable on this
  source, rather than synthesising per-call data to keep the report looking
  complete.
- **Partial windows are named too.** A pull that hit a rate limit, a
  retention boundary, or a page cursor that expired returns what it got and
  says what it missed — a bill quietly short by an unknown amount is the
  failure this repository refuses everywhere.

## 1.42.0 — The store

A connector that re-downloads a month every time it runs is a connector nobody
leaves on. And `history` needs stored reports, which today means a human
curating a directory.

- **`.trazum/store`**: an append-only local store of measured usage, keyed by
  the provider's own call id, so pulling overlapping windows converges instead
  of double-counting. Retention is configured and enforced locally.
- **What it holds is the argument.** Aggregates and the billing fields, never
  prompt text, never completion text, never a session key in the clear — the
  report has been aggregate by construction since 1.12 and the store inherits
  that. A store a team can commit or back up without a privacy review is the
  only kind worth having.
- **Deduplication that cannot lie.** Two records the store cannot tell apart —
  a provider that serves no call id — are kept as two and *named as
  possibly-double*, never silently merged. Merging on a guess makes a bill
  quietly smaller, which is the flattering direction.
- **`history` reads the store**, so the long run stops depending on somebody
  keeping a folder tidy — and keeps reading stored report files too, because
  the year of JSON a team already has must not stop working.
- **`trazum store` errands**: what is in it, how far back, what it cost to
  keep, and `--prune` with the same "say what went" discipline the suggestion
  cache has.

## 1.43.0 — The watch

Every gate in Trazum fires when a human runs a command. The failures worth
catching — a retry loop, a prompt that grew, a model swapped in a deploy —
happen at 3pm on a Tuesday.

- **`trazum watch`**: a long-running mode that pulls on an interval (or tails
  an OpenTelemetry stream), updates the store, and evaluates the gates that
  already exist — `spend.maxUsd`, `maxDayUsd`, `maxSessionUsd`,
  `maxCacheLossUsd`, `bySource` — continuously.
- **Alerts go out the boring ways**: exit codes, a webhook, and a JSON event
  on stdout that any pipeline can consume. No hosted service, no account.
- **An alert fires on a measured crossing, never on a projection.** "You will
  exceed" is a forecast and this product does not make them; "you have spent
  $412 of a $400 budget, measured over these calls" is a fact. The distinction
  is the whole reason the alert can be trusted at 3am.
- **A window too short to mean anything says so** rather than firing: the
  first ten minutes of a day are not a day, and an alerting tool that cries
  at every dawn gets muted, which is how alerting tools fail.
- **Restart is not amnesia.** State lives in the store, so a restarted watcher
  does not re-alert on yesterday's crossing, and says what it missed while it
  was down instead of pretending the gap was quiet.

## 1.44.0 — The answer in milliseconds

Everything Trazum knows lives behind a process launch, a config walk, and a
log parse. That is fine for a report and useless for a decision being made
right now.

- **`trazum serve`**: a local endpoint (HTTP on loopback, plus a Unix socket)
  answering the two questions that matter at call time — *what will this cost*
  and *is there budget left* — from the store, in single-digit milliseconds.
- **Bound to loopback, no auth theatre, no remote mode.** A cost oracle
  listening on a network interface is an attack surface with a very small
  upside; the SSRF rules that guard outbound requests get their inbound
  counterpart here, written down in SECURITY.md.
- **Every answer carries its provenance**, because this is where the temptation
  to merge halves is strongest: the budget consumed is *measured*, the cost of
  the call being asked about is *estimated* from a heuristic token count, and
  the response states which is which in a machine-readable field, not only in
  prose a caller will drop.
- **It degrades to the deterministic path.** No store, no connector, no
  network: the endpoint still prices the prompt from the bundled catalogue and
  says the budget half is unknown. Offline is a mode, not a failure.

## 1.45.0 — The agent's budget

The MCP server exposes four tools out of seventeen commands. An agent can ask
what a prompt costs; it cannot ask whether it is allowed to spend it, which is
the question that would actually change its behaviour.

- **The full command set over MCP**: `profile`, `plan`, `verify`, `history`
  and the fleet, on top of the four that exist — so an agent can investigate a
  bill, not just price a string.
- **`spend_guard`**: the tool that makes the arc pay off. An agent describes
  the call it is about to make; Trazum answers *yes*, *no*, or *cannot tell*
  — the three outcomes `verify` established — with the measured reason, the
  budget consulted, and the cheaper alternative when one exists.
- **A refusal an agent can act on.** "No" arrives with the lever: this label
  is over budget, the same work routes to a model that fits, the batch window
  would halve it. A guard that only says no teaches a caller to stop asking.
- **The guard never spends to answer.** No provider call, no LLM pass: the
  answer comes from the store and the catalogue, or it says it cannot tell.
- **Written for a machine reader.** Every field a decision depends on is
  structured — the prose stays for humans, and the agent reads typed values,
  the same discipline `PlanAssumption` established in 1.38.

## 1.46.0 — Five minutes

Everything above raises the ceiling. This release lowers the floor: from
`npx @trazum/cli` to a finding worth money, without reading a page of
documentation.

- **`trazum init`**: detects the provider from the code (the `where` machinery,
  already written and already refusing to guess), finds the prompts, finds or
  connects the usage source, writes a config with the budgets it can justify,
  and prints the single most valuable thing it found.
- **It refuses to invent what it cannot see**, exactly as `where` does today:
  a provider it cannot prove from an import, a base URL or a quoted model id
  is asked about, not assumed, and every answer names the line it came from.
- **Provider recipes** for the shapes people actually have — an Anthropic
  console export, an OpenAI usage endpoint, a Vercel AI SDK log, an OTel
  collector — each a worked example with real numbers, not a schema dump.
- **The first run explains its own arithmetic.** A tool that opens with a
  dollar figure nobody can check gets closed; the first report shows where the
  number came from before it shows how big it is.
- **`--dry-run` everywhere it writes**, and nothing is ever written outside
  the working directory without saying so.

## 1.47.0 — The browser sees the bill

The web app optimises prompts and cannot see a bill, which makes it a demo of
the smallest half of the product. The core has been browser-safe since the
beginning precisely so this could happen.

- **Drop a log (or connect) and get the whole loop in the browser**: the
  profile, the fleet, the plan, the verification, the series — computed
  client-side by the same `@trazum/core` the CLI runs.
- **The privacy promise is kept by construction, not by policy.** Nothing
  uploaded, no server round trip, no telemetry on content — the same promise
  the optimiser has carried, now stated above a file drop that could hold a
  month of a company's traffic. If a feature cannot run client-side, it is not
  there, and the page says why rather than quietly shipping data.
- **The one screen the terminal cannot give you**: the series and the fleet as
  charts, with the same refusals rendered — spans that cannot be compared as
  rates, shapes that are not forecasts, figures that are estimates.
- **Shareable without a server**: a report exports to a self-contained file the
  recipient opens locally. A link that requires us to store somebody's bill is
  a product decision this release declines to make.

## 1.48.0 — Cost review

The Action comments on a pull request. The loop built in 1.38–1.40 — plan,
verify, history — never reached the place where changes are actually reviewed.

- **The full loop in CI, on whatever runs it**: the Action, plus first-class
  recipes for GitLab CI, Jenkins, CircleCI and a pre-commit hook — the same
  binary, the same exit codes, no vendor-shaped features.
- **The pull request gets the three questions**: what this change costs, what
  the plan says to do about it, and whether the last plan's promises arrived.
  A `verify --gate` status check makes a broken promise as visible as a broken
  test.
- **The plan as a reviewable artefact**: committed, diffable, and re-verified
  on every push, so "we decided not to do this" is a line in a file with a
  date rather than a memory.
- **Waivers get their history**, closing the one thing 1.40 named and could
  not build: once a waiver is a dated record in the repository rather than
  only a line in the current config, "this finding has been waived three times
  in a row" becomes a sentence the tool can say — and 1.40's refusal explained
  exactly why it could not say it yet.

## 1.49.0 — The live budget

By here there are four ways to ask Trazum about money and no guarantee they
agree. This release makes them one number.

- **A budget that is a live object**: set monthly (or per label, per service),
  consumed against measured spend from the store, and readable by the
  terminal, CI, the browser and the agent — the same figure, the same
  provenance, at the same instant.
- **Burn-down is measured, and the shape is named — nothing is forecast.**
  "Sixty-one percent of the budget, consumed over eleven of thirty days" is a
  measurement; "you will run out on the 24th" is a prediction, and this
  product has refused those since 1.27 at every scale it has operated on.
- **A budget nobody has measured against is not a budget under control**, and
  says so — the `fleetBudgetMissing` rule from 1.37, applied to time: a period
  with no measured data is named, never rendered as a period under budget.
- **Reservations, so agents cannot race.** Two agents asking `spend_guard` in
  the same second must not both be told yes against the last dollar; the guard
  holds a short-lived reservation, and a reservation that expires unspent is
  returned rather than quietly burned.
- **Every gate in the product reads this one number**, so a CI failure and an
  agent's refusal can never disagree about what was left.

## 1.50.0 — The standard

Ten releases of arithmetic that refuses to flatter are worth more if other
tools can emit and read it. This release makes Trazum something to build on.

- **The interchange format, documented and versioned**: the usage record, the
  profile document, the plan, the verification, the history — the five
  contracts already enforced in both directions by parity tests, published
  with a conformance suite anybody can run against their own emitter.
- **Stability guarantees written down**: what `schemaVersion` promises, what a
  minor may change, what only a major may. The tests that enforce it ship with
  the suite, so the promise is executable rather than editorial.
- **The doctrine as a public document.** Measured never merges with estimated;
  not-recorded is not not-happened; three outcomes, never two; no series
  becomes a forecast; what stays out gets its reason on the record. These have
  been discovered one release at a time inside a changelog — written down
  together, they are the argument for why anybody should trust a cost figure
  from any tool.
- **The plugin seam**: a provider connector and a rule are the two things
  people will want to add, and both become documented extension points with
  their own conformance tests — so a connector nobody in this repository wrote
  still cannot silently drop a day.

---

## The rules that constrain all ten

The first arc made Trazum say more. This one makes it *act* — on a schedule,
over a network, holding credentials, answering a machine that will believe it.
Everything the first arc established still holds, and four rules are added
because the new territory has new ways to lie.

1. **The deterministic core stays free and offline.** Every connector, every
   watcher, every service is opt-in and degrades to the deterministic path.
   Nothing here may make a network call a prerequisite for optimising a
   prompt.
2. **A credential is borrowed, never held.** Trazum stores no secret, prints
   no secret, and asks for the narrowest scope that works. A cost tool is not
   worth a key that could do damage.
3. **Nothing continuous invents a number.** An alert fires on a measured
   crossing. A budget burns down on measured spend. A shape may be named; a
   future may not be predicted, at any window length.
4. **A machine reader gets the provenance too.** When an agent is told what
   something costs, the measured half and the estimated half arrive as
   separate typed fields — a caller that cannot see which is which will
   act on the number as if it were all one, and it never is.

And the rule from the first arc, unchanged, because it is the one that makes
the rest matter: *a measured figure and an estimated one never merge into a
single number without the report stating which half is which.*
