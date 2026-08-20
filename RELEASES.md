# Releases

Release notes for people. [CHANGELOG.md](CHANGELOG.md) is the record for
whoever maintains this — every decision, every reversal, every reason. This file
is what you read when somebody says "what's new" and you have forty seconds.

Same facts, different job. Nothing here is softened: if a release fixed
something embarrassing, it says what it was.

**All three packages are on npm at 1.28.0**: `@trazum/core`, `@trazum/cli` and
`@trazum/mcp` — published by the workflow itself, from the merge of the
release PR, authenticated by the token fallback and carrying an OIDC-signed
provenance attestation. 1.25.0 before it went out by hand on 2026-08-19, after
npm's trusted publishing rejected the workflow's OIDC token on four real
publish attempts against `v1.11.0` with every GitHub-side claim verified
correct — so 1.25.0, like 1.8.0, 1.9.0 and 1.10.0, **carries no provenance
attestation**. If the sentence above turns out to be premature — the fallback's
first live run is exactly this release — this paragraph is the first thing to
correct.

**1.11.0 through 1.24.0 were never published to npm.** They are real releases
of this repository — each has its notes below, its changelog entries and its
merge commit — but the registry went straight from 1.10.0 to 1.25.0, which
contains all of them. `v1.11.0` is the one tag in that range that exists, spent
on diagnosing the trusted-publisher refusal; it published nothing.

**1.9.1 was prepared and never published.** Its tag failed three times against a
trusted-publisher configuration npm kept refusing, nothing reached the registry, and
everything in it is contained in 1.10.0. Its notes are kept below because the work
happened; the version number is simply spent.

Everything under 1.8.0 is a milestone recorded in this repository and never
uploaded anywhere, 1.0.0 included. The numbering is kept because the ordering is
the useful part — 1.8.0 is the first version that exists outside this repository,
not the eighth release.

`RELEASES.md` is checked against the manifests by `publish.test.js`, so a version
cannot be tagged without its notes being written first. That is the point of the
file being here rather than pasted into a GitHub form at release time.

---

## 1.44.0 — "The answer in milliseconds"

The fourth of the ten planned in `docs/plan-1.41-1.50.md`, and the pivot the
rest of the arc rests on. Everything this tool knows sat behind a process
launch, a config walk and a log parse. That is fine for a report and useless
for a decision being made right now: by the time the report exists, the call
has been paid for.

### `trazum serve`

```bash
trazum serve                 # 127.0.0.1:7317, or --socket /tmp/trazum.sock
curl -s localhost:7317/cost -d '{"model":"claude-opus-5","inputTokens":200000}'
```

```json
{
  "call":   { "estimatedUsd": 1.00, "provenance": "estimated" },
  "budget": { "consumedUsd": 40.00, "limitUsd": 50.00, "provenance": "measured" },
  "verdict": "within",
  "restsOn": "measured+estimated",
  "afterCall": { "usd": 41.00, "halves": { "measuredUsd": 40, "estimatedUsd": 1 } }
}
```

Measured at about two milliseconds an answer, and the suite asserts a ceiling
rather than trusting the number in this paragraph.

### The shape is the release

This is where the temptation to merge halves is strongest, and the answer
refuses to:

- **The budget consumed is `measured`** — the provider billed those tokens.
- **The cost of the described call is `estimated`** — nobody has sent it, and
  the token count behind it is a count of something that has not happened.
- **The composed figure exists**, because a caller deciding one call genuinely
  needs it — and it never travels without both halves beside it, so nobody can
  mistake the composition for a measurement.
- **`restsOn` says whether the verdict needed the estimate at all.** `measured`
  means the budget is already past its limit and a caller can act with full
  confidence; `measured+estimated` means it takes this call to cross, and the
  verdict is only as good as the token count. A caller reading nothing but the
  verdict can still tell those apart.

### Three outcomes, and three reasons kept apart

`within`, `over`, `cannot-tell` — and the three ways of not being able to tell
are distinct because their fixes are: **no budget configured** (set
`spend.maxUsd`), **nothing measured** (connect a source), **model unpriced**
(add it with a pricing overlay). Answering "within" for a model the catalogue
cannot price would answer whether *current* spend fits, which is a different
question from the one asked.

### It degrades rather than failing

With no store and no budget the endpoint still prices the call and says the
budget half is unknown. Offline is a mode, not a failure — an oracle that
refuses to speak when half its inputs are missing is an oracle nobody wires
into a hot path.

The measured position is read **once at start**, because a file read in the
request path cannot promise milliseconds. That staleness is real, so every
answer carries the window its measurement covers rather than implying it is
current to the second.

### The first time Trazum listens

- **Loopback, compiled in, with no way to say otherwise.** Not a flag, not an
  environment variable, not a config key. This endpoint holds a company's
  spend, its model mix and its budgets, and answers whoever asks.
  `checkedEndpoint` has guarded *outbound* requests since 1.14 on the
  principle that a caller selects an endpoint rather than naming one; this is
  the inbound counterpart, enforced the same way — by there being no way to
  say otherwise.
- **No auth, on purpose.** A token checked over loopback is theatre: whoever
  can reach the socket can read it out of the process that holds it. The
  honest posture is a surface small enough not to need one.
- **Bodies over a megabyte are refused unread.** A prompt is text and text is
  unbounded; a hot-path oracle that buffers whatever it is handed is one
  request away from taking down the caller that was asking how to spend less.
- **Everything but `/health` and `/cost` is a 404.**

Three guards fail the build over it, each proven with a planted probe.

### Two failures this work found in itself

- **The answer carried a `null` window.** The copy promised that every answer
  says what period its measurement covers; the code passed a null through, so a
  figure from last month would have read as current. Fixed, and covered by a
  test that says why.
- **The README command-count guard had been blind since "sixteen".** Its word
  list stopped there, and an unknown number word is *skipped* rather than
  failed — so the count claim went unchecked for five releases, exactly while
  it changed in every one of them. Extended past thirty with hyphenated forms,
  and proven against a wrong count. A guard that quietly stops guarding is
  worse than no guard, because it still reads like one.

### What stayed out, and why

A remote mode, with or without a token. Every version of it trades a large new
attack surface — spend, model mix, budgets, answered over a network — for the
convenience of not running a process per machine. If a team needs one endpoint
for several machines, that is a hosted collector with an access-control story
somebody designed on purpose, which is a different product decision than a
flag on this one.

---

## 1.43.0 — "The watch"

The third of the ten planned in `docs/plan-1.41-1.50.md`. 1.41 made the bill
readable without an export and 1.42 made it stay. Both still wait for somebody
to type something — and the failures worth catching (a retry loop, a prompt
that grew, a model swapped in a deploy) happen at 3pm on a Tuesday, where a
report that arrives three weeks later is an obituary.

### `trazum watch`

```
CROSSED — Total spend is $50.00 against a limit of $25.00. Measured, not
  projected.
CROSSED — Spend on 2026-08-03 is $30.00 against a limit of $15.00. Measured,
  not projected.
```

**One cycle is the primitive.** `--once` measures, keeps, evaluates, emits and
remembers — that is what a cron entry runs, and what every test exercises.
`--interval 15m` is that same cycle in a timer. One code path, so there is no
daemon-only behaviour that nobody tests, and the thing that ships is the thing
the suite proves.

**The interval has a five-minute floor.** Usage APIs are rate limited, and a
tight loop is how a tool that exists to save somebody money gets their key
throttled instead.

### An alert fires on a measured crossing, never on a projection

"You have spent $412 of a $400 budget, measured over these calls" is a fact.
"You will exceed" is a forecast, and this product has refused those at every
window length since 1.27. That distinction is the only reason an alert at 3am
can be trusted.

Every crossing carries `provenance: 'measured'` **as a field**, even though it
can hold exactly one value today. A consumer that cannot see the provenance
will treat whatever arrives as fact, and a later version of that file must not
be able to smuggle an estimate past a reader by leaving the question unasked.

### A day still being measured is not judged, and not passed either

At noon, a threshold over that day is a threshold over half a day, so the gate
reports *not yet judgeable* with how much of the period is covered — three
states, never two, and a gate silently skipped for a week reads exactly like a
gate that has been passing for a week.

**A day already over budget fires whatever the hour**, because it does not
become less over budget at midnight. The coverage floor suppresses an unripe
verdict and never a real crossing. It sits below perfection deliberately: a
usage API's last bucket lags minutes behind, and a gate that waits for a whole
day never judges anything.

### A restart is not amnesia, and quiet is not clean

```
STILL OVER — Total spend is $50.00 against a limit of $25.00, and was already
  reported. Quiet is not clean.
```

**This is the failure the release found in itself.** The first version reported
*"Within every threshold"* on the cycle after an alert — it had suppressed the
alert and, in doing so, the fact. That is exactly the flattering reading this
repository refuses everywhere else. A crossing already reported now comes back
as `suppressed`, prints as STILL OVER, and **keeps the run failing**: "we
alerted about this" and "this is fine now" are different sentences.

The stretch between cycles that nobody watched is named once, because a
watcher that resumes in silence implies coverage it did not have.

### Three transports, all boring

A non-zero exit code so cron mails it, a JSON event on stdout for any pipeline,
and `--webhook` for wherever the alerts already go. No hosted service, no
account. **A receiver that is down is reported and swallowed** — the crossing
already went out through the other two, and losing them because somebody's
server fell over would make the quietest failure the loudest one.

### The webhook is a new outbound surface, and three guards fail the build

- **A URL carrying credentials is refused.** URLs end up in logs, shell history
  and error messages; the secret belongs in a header the receiver checks.
- **Plain http is refused off loopback.** An alert carries spend figures, and
  sending them in the clear across a network is a leak nobody asked for.
  Loopback is allowed, because pointing a watcher at your own alerting daemon
  is the ordinary case rather than the attack.
- **The payload's shape is pinned** to figures and gate names, and the delivery
  path may not throw.

This is deliberately **not** the SSRF case `checkedEndpoint` guards. That rule
exists because a *request body* must never name a host — an anonymous caller
pointing a shared server at an internal address. Here the URL is in the
operator's own config on their own machine, which is why loopback is allowed at
all, and the distinction is written down rather than left to be inferred. Each
guard was proven with a planted probe before being trusted: a guard that never
fires is a guard nobody should believe.

### Changed

**`spend.maxCacheLossUsd` is now a config key**, not only a flag. It has gated
since 1.21 and only from an invocation, which made it a policy `watch` could
not read — and a policy that lives in one command line is a policy nothing else
can act on.

### What stayed out, and why

Alerting on anything a usage API cannot serve. `spend.bySource` gates on log
paths, and a usage API has none; rather than quietly passing that gate on a
connected source, `watch` reports it as unjudgeable on this source. Making it
work needs per-call data with its origin attached, which arrives with the
gateway in 1.51.

---

## 1.42.0 — "The store"

The second of the ten planned in `docs/plan-1.41-1.50.md`. 1.41 made the bill
readable without an export; a connector that re-downloads a month every time it
runs is still a connector nobody leaves on. This is where what was pulled
stays.

### `connect --store` and `trazum store`

```
The store: 14 measurements · $47.95 · 2026-08-01 → 2026-08-08
  anthropic  14 measurements · 2026-08-01 → 2026-08-08 · 2 models

  Held in 1 files: token counts, billed dollars and the account's own
    workspace and key identifiers. Never prompt text, never completion text,
    never a credential — this is a file you can back up without a privacy
    review.
  No retention policy is configured, so nothing is ever deleted on its own.
    Set "store": {"keepDays": 90} when you want one.
```

Opt-in rather than automatic: a command that starts writing to a hidden
directory on its own is a command nobody trusts twice.

### Convergence, not accumulation

A record is identified by its **provider, window, model and grouping**.
Re-pulling an overlapping window is the *same fact restated*, so the later pull
wins — a window pulled again is at worst as complete as it was. Three identical
pulls of the same four days leave four measurements and the same $4.00, which
is what makes a scheduled hourly pull over a rolling day safe to leave running.

### Deduplication that cannot lie

- **Two records the store cannot tell apart are kept as two.** A window of no
  length, a record naming no model: there is no honest way to decide whether
  they are one measurement or two, so both are kept and reported as
  possibly-double. A total built on them may count the same spend twice, and
  saying so beats a smaller number nobody can check — quietly smaller is the
  flattering direction.
- **A line that will not parse costs that line**, named with its file and
  number. The store is a file a human may open, a backup may truncate and a
  merge may mangle; losing the month because one line broke would be the worst
  possible response, and so would pretending the month is complete.
- **A record from a newer schema is kept and counted**, left out of the figures
  rather than guessed at, with an upgrade named.
- **An unknown call count survives the trip to disk as null** and never becomes
  zero, because zero reads as "no traffic" against real spend.

### Append-only, with compaction as an explicit errand

A pull appends one block per month file and rewrites nothing. Two consequences
worth stating: a crash during a write loses the tail of one block rather than a
year of measurements, and two runs writing at once interleave whole blocks
rather than half-lines. Convergence resolves when the store is *read*, which
keeps a write cheap enough to run on a schedule.

Only `store --prune` rewrites, because collapsing a log is the one operation
that destroys something and it must never happen as a side effect of a pull.

### Retention refuses a policy nobody wrote down

```
A prune would delete 4 measurements older than 1 days, covering
2026-08-01 → 2026-08-05 and $4.00 of measured spend. Nothing was deleted —
this was --dry-run.
```

With neither `store.keepDays` in the config nor `--keep`, pruning **refuses**
and names both ways to set one. Deleting measurements on a guessed policy is
not a default anybody should get by accident. What went is reported with the
span it covered and the dollars it held; `--dry-run` says all of it before
anything goes. A bucket that *ends* inside the retained period is kept whole,
because half a bucket measures nothing.

### `history --store`

The series, built straight from what is kept — no directory for anybody to
curate. Bucketed sources carry no label, because a usage API groups by model
and workspace and never by workload, so **the label series is absent and said
to be** rather than empty and misread as "no workload moved". The model-share
and cache-share series are exactly what a series exists for, and both work in
full. Reading stored `--json` report files keeps working unchanged: a year of
JSON a team already has must not stop working because a store appeared.

### Two failures this work found in itself

- **An empty store was reported over records it could not resolve.** Records it
  cannot tell apart, unparseable lines and records from a newer schema are real
  measurements sitting on disk; "the store is empty" over them hid exactly what
  the reader needed to see. Empty now means *nothing at all*.
- **A series printed "0 calls" for a source that serves no request count.**
  The connected report had refused that reading since 1.41 and the series had
  not; period call counts are nullable now, and the row omits what it does not
  know.

### The module underneath

`@trazum/core` gains `store.ts` (`resolveStore`, `recordsFromBuckets`,
`bucketsFromRecords`, `storeInventory`, `pruneRecords`), browser-safe: it
decides what a record is and when two are the same, and the filesystem half
lives in the CLI. New config block `store.keepDays`, deliberately with no
default.

### What stayed out, and why

A store shared over a network, or committed as a team artefact. Both are real
wants, and both need a decision about who may read another team's spend that
this release has no basis to make. The store is local, per-checkout, and says
so; the shared version belongs with the team work in 1.48.

---

## 1.41.0 — "The connector"

The first of the ten planned in `docs/plan-1.41-1.50.md`, and the first
release whose subject is not a finding but an *invocation*. Through 1.40 the
loop became complete and stayed inert: seventeen commands, all of them reading
a file somebody produced by hand. The export step is where adoption dies — the
person who would benefit most from a cost report is the person least likely to
have a `usage.jsonl` lying around.

### `trazum connect <provider>` — the bill, read from the provider

```
Anthropic · 2026-08-01 → 2026-08-06 · $136.00
  claude-opus-5       $106.00   77.9%
  claude-haiku-4-5     $30.00   22.1%

  Caching added $11.00 to this bill against what the same tokens would have
    cost as ordinary input.

  Anthropic's usage report serves token sums and no request count, so there
    is no call count here and no per-call average. A zero would read as "no
    traffic", so nothing is printed instead.

  ! some-private-model is not in the price catalogue, so its 4,505,000
    tokens are counted and its money is not. Add it with --pricing rather than
    reading the total as complete.

  Findings this source cannot support: inputShapes, truncationRetries,
    repeatedTurns, sessionCosts, contextPressure, duplicateLines, calls. They
    need one row per call, and a sum has lost the rows — a per-call log still
    answers them.
```

Anthropic and OpenAI in this release, over a window `--since`/`--until` name
with the grammar `profile` already had — a UTC day, an ISO timestamp, `7d`,
`24h`, `now` — defaulting to the last thirty days.

### The credential is borrowed, never held

This is the first credential Trazum handles that belongs to somebody else's
*account*, and the discipline is the whole point of the release:

- **Read from the environment at the moment of the call.**
  `TRAZUM_ANTHROPIC_ADMIN_KEY` and `TRAZUM_OPENAI_ADMIN_KEY`, with each
  provider's own variable as a fallback. Never written to a config, a cache, a
  report or an error message; the caller of the credential lookup gets back the
  *name of the variable*, never the value, so an error handler that prints its
  source cannot leak a key.
- **Redaction covers the key we hold and the ones we do not.** A provider that
  quotes a key back inside its own error body — the mistyped one, one from a
  proxy's log line — would leak it through Trazum's output; every response body
  that reaches an error passes through redaction on the way, and the key
  *shapes* are redacted alongside the exact string.
- **The narrowest key that works, named in the refusal.** A usage report needs
  read access and nothing that could spend money. A key the endpoint rejects
  produces an error naming the key *kind* required, never the key.
- **The endpoint is compiled in, not accepted from a flag.** Trazum's SSRF
  posture since 1.14 is that a caller *selects* an endpoint rather than naming
  one; a usage connector taking `--base-url` would hand that property back for
  the convenience of a self-hosted proxy nobody has asked for.

**Four guards fail the build rather than promising any of it.** No real-shaped
key material may be committed anywhere in the repository — the pattern is
calibrated against what a real key looks like, so an obviously fake fixture in
a test stays legal and a leak does not. The module that holds a key may not
call `console` or write a file at all. Every provider response body reaching an
error must pass through `redact`. And the endpoints must stay compiled in, with
no flag naming a URL. Each was checked against a planted probe before being
trusted: a guard that never fires is a guard nobody should believe.

### A connected report is a restricted report, and says so

Usage APIs serve **sums over a window**, not one row per call. The totals, the
model split, the day series and the cache verdict all work on a sum. Six
findings do not, and each is listed with why and what would unlock it:
`inputShapes` (the spread of call sizes is not in a sum), `truncationRetries`
(pairing needs both calls, their order and their stop reasons), `repeatedTurns`
(the same request twice is invisible once added together), `sessionCosts`
(conversations are not a dimension any usage API groups by), `contextPressure`
(it reads the largest single call, and a total has lost the maximum) and
`duplicateLines` (a doubled bill is caught by finding identical rows).

**It carries its own document shape**, rather than a `UsageProfileReport` with
holes in it. That is the load-bearing design decision of the release: with a
shared shape, a per-call finding would eventually read a zero this code wrote
and report "nothing found" about something nobody measured. Not recorded is not
not-happened — here enforced by the type system rather than by care.

### The asymmetry between providers is kept, not papered over

- **OpenAI serves a request count and Anthropic does not.** So a connected
  OpenAI report carries per-call averages and a connected Anthropic report says
  why it carries none: `calls` is `null`, never `0`, because zero reads as "no
  traffic" against real spend. Merged buckets follow the same rule — a known
  count added to an unknown one is unknown, not a number describing half the
  traffic.
- **OpenAI reports cached tokens *inside* the input total.** Read at face
  value, the same tokens would be billed twice — once at the full input rate
  and again at the cache rate. The uncached half is the subtraction.
- **Anthropic's two cache-write TTLs are kept apart**, as everywhere else in
  this product, because they bill at 1.25x and 2x and a total that has lost the
  split cannot be repriced. When only the flat legacy field is served, the
  cheaper rate is assumed for the headline and the worst case is carried, so
  the cache verdict says *unsettled* rather than settling in your favour.

### A partial pull is a partial pull, out loud

Six gap kinds, each returned with what did arrive rather than thrown away:
`rate-limited` (the provider stopped us, and the rest of the window was not
measured), `cursor-expired` (it said there was more and served no cursor to
reach it), `page-limit` (fifty pages, so the window is incomplete — narrow it),
`unreadable-entry` (a bucket with no readable window, or a result naming no
model, is left out and named), `unreadable-field` and `retention-boundary`. A
bill quietly short by an unknown amount is the failure this repository refuses
everywhere it can occur, and a paginated API behind a rate limit is exactly
where it occurs.

### Two ways to run it without spending anything

- **`--dry-run`** prints exactly what would be called and which environment
  variable the key would come from. It sends nothing and needs no credential —
  the way to find out what this command wants before giving it anything.
- **`--payload <file>`** prices a response you already have, with no credential
  and no network. People save API responses: from a support thread, from a curl
  in a runbook, from a colleague who has the admin key when they do not.

### The module underneath

`@trazum/core` gains `connector.ts` (`CONNECTORS`, `normalizeAnthropicUsage`,
`normalizeOpenAIUsage`, `bucketedProfile`, `bucketedCacheEconomics`),
browser-safe and pure: the fetch, the credentials and the pagination live in
the CLI, the same split `openrouterOverlay` has had since 1.13. The connected
document is contracted in docs/json-output.md and enforced in both directions
by a parity test. `--since`/`--until` parsing moved to one shared parser: two
parsers for one flag pair is one too many.

### What changed from the plan, on the record

The plan said `--from-provider` on every command that reads a log. **It is not
in this release**, and the reason is the release's own argument: these sources
serve aggregates, and wiring an aggregate into a per-call report means
synthesising rows — inventing the very per-call data the module spends its
length refusing to invent. Those commands get connected data when a per-call
source exists, which is the gateway in 1.51. Shipping the flag over synthesised
rows would have been the flattering version of this release.

---

## 1.40.0 — "The long run"

The fifth and last of the five planned in `docs/plan-1.36-1.40.md` — the
arc is delivered. Every comparison in Trazum is between two logs, and a
product's cost problem is rarely visible in two: it is visible in twenty.
This release is the twenty.

### `trazum history <dir>` — many reports, one series

```
The long run: 4 periods, 2026-07-01 → 2026-07-27
  w0.report.json  $9.40 · 5 calls · 5.0 days
  w1.report.json  $13.42 · 7 calls · 5.0 days
  w2.report.json  $17.32 · 9 calls · 5.0 days
  w3.report.json  $21.10 · 11 calls · 5.0 days

  ! support has climbed for 3 consecutive periods since w0.report.json:
    $8.40 → $20.10. A shape, not a forecast.
  ! claude-opus-5's share of the bill has climbed for 3 consecutive periods
    since w0.report.json: 89.4% → 95.3%. The totals can look flat while the
    mix moves under them.
  ! The cache share has decayed for 3 consecutive periods since
    w0.report.json: 23.5% → 3.8% — slowly enough that no single report
    called it a finding, which is exactly why a series exists.

  ! Routing and batching support (claude-opus-5) has been planned 2 times
    and is still in the newest plan — a decision nobody is revisiting.
```

**Derived from stored reports, never re-parsed logs.** The input is a
directory of the `--json` documents `profile` already writes, plus any saved
plans beside them. A team can keep a year of reports and throw the raw logs
away — which is what the privacy story requires anyway: the stored documents
carry no prompt text, no session keys and no per-call rows, so the long run
is built from data that was already safe to keep.

**The consecutive-movement rule.** A finding needs at least `MIN_RUN` (3)
consecutive rises or falls — a run of 3 spans four reports. Two rises is
what `profile --against` already shows, and one is noise wearing a trend's
clothes. The run is named with where it started (*since w0.report.json*) and
its first and last values, so the reader judges the size — never a
percentage per period, which would be a fitted line in disguise.

**The findings only a series can make:**

- **A label climbing.** 4% a week for eleven weeks never trips a weekly
  gate; eleven consecutive rises in a series is unmissable.
- **A model share climbing under flat totals.** The bill holds steady while
  the mix underneath moves toward the expensive model — invisible to every
  total, visible to a share series.
- **The cache share decaying.** Slowly enough that no single week's report
  called it a finding, which is exactly why a series exists.
- **The same action planned again and again.** Saved plans in the directory
  are held against each other: an action appearing in two or more plans is
  named as *a decision nobody is revisiting*, with first and last planned
  dates. 1.38 made plans files and 1.39 made them checkable; this makes
  ignoring them visible.

**Still no forecasts.** Twenty points make a trend visible; they do not make
next month knowable. The series is stated, the shape is named, and where it
goes next remains the reader's to judge — the same refusal `modelMixDrift`
has carried since 1.27, now at series length. The refusal is printed in the
report's own footer.

**The refusals, each with its reason:**

- **A report with no span is on no timeline** — named, never silently
  absorbed, because a period that cannot be placed would have to be guessed
  into position.
- **A JSON file that is neither a stored report nor a saved plan is named**
  rather than skipped: a directory of "all my reports" that quietly ignored
  one file would be a series wrong by an unknown amount.
- **Fewer than three dated reports is an error naming the right tool**: two
  reports is a comparison, and `profile --against` already does that better,
  with drivers attributed.

### The document

`history --json` emits the history document — the ordered periods, the three
series (label dollars, model shares, cache share, with null for absence
because absence is not zero), the runs, the repeated plan actions, and both
named exclusion lists — contracted in docs/json-output.md and enforced in
both directions by a parity test. `--markdown-out` writes the series for a
CI summary.

### The module underneath

`@trazum/core` gains `history.ts` (`buildHistory`, `storedReportFrom`,
`MIN_RUN`), browser-safe: documents in, series out. `storedReportFrom`
returns null for anything that is not a profile document, so the caller
names the file instead of absorbing it.

### What stayed out, and why

**Waiver history.** The plan called for "a finding waived three times in a
row is a decision nobody is revisiting" — but no document stores *past*
waivers: the config holds only the waivers currently in force, and a history
invented from the current config would be a guess presented as a record.
The shape of the feature is right and the data for it does not exist yet;
when waivers are recorded somewhere with dates, the series can be built the
same way the plan series is. Plan history shipped instead, because plans
*are* dated documents already.

---

## 1.39.0 — "Did it work?"

The fourth of the five planned in `docs/plan-1.36-1.40.md`, and the release
that makes Trazum accountable to its own predictions. Every optimisation
tool says what you *would* save; almost none says what you *did*. From this
release, a plan saved with `trazum plan -o` is a promise the repository can
be held to.

### `trazum verify <plan.json> --against <newer.jsonl|dir>` — the reckoning

```
Did it work? 5 actions from the plan of 2026-08-19, against this log
  1 arrived · 2 did not arrive · 2 cannot be told. The third is not a soft
    version of the second: it means this log cannot answer, which is its own
    finding.

  → Route and batch support (claude-opus-5) — ARRIVED
  · the label's dearest model is now claude-sonnet-5 · $8.12 on the target,
    $0 still on the old model
  · the batch half of this action cannot be seen in token counts; the
    verdict above is the route half alone
  · the world moved too: calls 5 → 10, output/call 1,000 → 1,200 tokens —
    stated so the verdict is not read as the whole story

  → Fix the truncation retries on digest (claude-opus-5) — DID NOT ARRIVE
  · this log still shows $8.00 of truncation waste and retries

  → Fix the cache on rag (claude-opus-5) — CANNOT BE TOLD
  · the label carries no priced traffic in this log — a vanished workload is
    not a fixed one, and not a broken one either
```

**Three outcomes, never two.** Arrived and did-not-arrive are measurements;
*cannot be told* is the log refusing to guess — the workload vanished, the
fields the detection needs stopped being recorded, or the thing is invisible
to token counts. The third outcome is the honest one, and the one every
other tool renders as the first: a dashboard that shows a vanished workload
as "saving achieved" is congratulating a team for turning a feature off.

**The verification rules, per action kind:**

- **A route is judged on the label's dearest model in the newer log** — the
  same rule the fleet's split-brain detection uses, so one stray call on the
  old model does not un-verify a completed migration, and one experiment on
  the target does not verify an incomplete one. The money still sitting on
  the old model is printed either way.
- **A truncation fix is judged on the measured retry bill** — zero pairs is
  arrived, a persisting bill is not-arrived with the new figure. The
  detection needs sessions and timestamps: a newer log that dropped them
  reads "no retries" for the wrong reason, so it is *cannot be told* — and
  it fails the gate, because a team must not pass on the strength of its own
  log's silence.
- **A cache fix is judged on the settled verdict only.** Paid-off is
  arrived; a settled loss is not-arrived with the new delta; a verdict that
  can no longer settle (the TTL field is gone) is cannot-be-told and fails
  the gate for the same reason.
- **A pure batch action is always *cannot be told*: tokens do not say which
  tier billed them.** The Batch API is invisible in usage logs, and saying
  so beats assuming the discount happened. It fails no gate — the silence is
  the provider's log format, not the team's. On a route+batch action the
  route half is judged and the batch half is named as unobservable, never
  counted as arrived.

**Differences are attributed, not just stated.** Every plan action records
its baseline since this release — calls, dollars, tokens per call at plan
time — and the verification prints the world's movement beside each verdict:
`calls 5 → 10, output/call 1,000 → 1,200`. "The prediction was wrong" and
"the traffic doubled" are different sentences, and a verdict without the
second is read as the first.

**A repricing is named, not priced through.** A plan made under one
catalogue and verified under another sets `pricesChanged`, and the rendering
says every dollar comparison is two price lists rather than one measurement
— the tool must not blame a team for a saving that arithmetic revoked.

### `--gate` — promises, checkable in CI

```
GATE FAILED — 2 of 5 actions did not produce what the plan promised, or
stopped being measurable by the team's own log.
```

Exit 1 on any `not-arrived`, and on `cannot-tell` when the reason is
`fields-stopped` — "not recorded" must not read as "fixed". A vanished
workload and an unrecordable tier fail nothing: the first is the world's
doing, the second is the log format's. This is a different and more useful
gate than "spend went up": it fails when a change a team committed to did
not produce what it promised.

**The refusals, each with its reason:**

- **A missing `--against` is an error naming why**: a plan can only be
  verified against a log that came after it — without one there is nothing
  to hold the prediction to.
- **A file that is not a plan document is refused by shape** (`schemaVersion
  1` with an `actions` array), naming what `trazum plan -o` writes — not
  parsed optimistically into empty verdicts.

### The document

`verify --json` emits the verification document — the three counts (always
summing to the action count), the verdicts with `observed` and
`attribution`, the `pricesChanged` flag, and `gateFailures` — contracted in
docs/json-output.md and enforced in both directions by a parity test.
`--markdown-out` writes the verdicts for a CI summary.

### The module underneath

`@trazum/core` gains `verify.ts` (`verifyPlan`, typed `VerifyOutcome` and
`CannotTellReason`), browser-safe: two documents in, one verdict out. The
plan module's actions now carry `detail.baseline`, which is what makes
attribution possible — a prediction with no record of the world it was made
in could never separate its own error from the world's movement.

---

## 1.38.0 — "The plan"

The third of the five planned in `docs/plan-1.36-1.40.md`. The report names
findings; a person then decides what to do first by doing arithmetic in
their head — and head-arithmetic on savings gets done by *adding* them,
which the levers module has documented as wrong since it shipped: $12.60 for
the route plus $10.50 for the batch, against a slice that costs $21.00 in
total. This release does the composition once, correctly, and writes the
result down where it can later be held to account.

### `trazum plan <log|dir>` — what to do first, costed and ranked

```
The plan: 5 actions against a $53.56 bill
  $41.60 projected savings, on assumptions listed below. $20.50 already
  spent on problems this plan names — measured, not projected.

  → Route and batch rag (claude-opus-5)  $19.00 projected
    to Claude Sonnet 5 — combined with batching where both apply, never summed
    ? assumes Claude Sonnet 5 can do this work — the log prices the move, it
      cannot judge the answers
    ? assumes these calls can wait for a batch window
    check it: trazum route <log> --prompt-file <prompt> --cases <cases>

  → Look at the cache on rag (claude-opus-5)  $12.50 already spent
    ? assumes the traffic pattern holds — a cache that lost money on this log
      may pay on different traffic

  → Fix the truncation retries on digest (claude-opus-5)  $8.00 already spent
    ? assumes the retry pattern is real — the log sees shapes, not content
    ? assumes a max_tokens the answers fit in removes the pair

  Ranked by money, projected or already spent alike. The assumptions are
  yours to answer: this plan is arithmetic over the log, not knowledge of
  your product.
```

**Non-additive by construction.** Route and batch on the same slice arrive
as a single pre-combined action carrying the levers module's `combinedUsd` —
batch applies to the *cheaper* model's price after the route, not to the one
you left. Actions on different slices add cleanly, so the plan's totals are
sums of non-overlapping figures by construction rather than by hope.

**Projections and stakes never merge.** Every action carries exactly one of
`savingUsd` (projected — the route, the batch) or `stakeUsd` (already spent,
measured — the truncation retry bill, a settled cache loss), and the two are
totalled apart. "What you would save" and "what you already paid" folded
into one figure is a number that is neither.

**Every action names what the log cannot confirm.** The cheaper model's
competence, the batch window's tolerability, the retry pattern being real —
typed assumptions attached per action, with the Trazum command that can
check one where a command exists (`trazum route` for the route's competence
question). A plan that hides its assumptions is advice pretending to be
arithmetic. The assumptions travel as data, not prose — `{"kind":
"model-capability", "model": "Claude Sonnet 5"}` — so the terminal localizes
them and 1.39's verification will match them structurally.

**The plan is a dated file.** `-o plan.json` writes the document with
`createdAt` and `pricingLastReviewed` on record — the catalogue that
actually priced it, an overlay's date when one was in effect — which is what
lets a later check tell "the prediction was wrong" from "the prices
changed". A prediction nobody wrote down is a prediction nobody can be held
to, and 1.39 exists to hold them. `--markdown-out` writes the same plan for
a CI summary or a pull-request comment; `--json` prints the document.

**`--min-usd <n>` cuts the noise floor honestly.** How many actions were
dropped and what they were worth *together* is stated, never silent — and
the saved document recomputes its totals over the actions it actually holds,
so a filtered plan never contradicts itself. Dropped is dropped, not
disproved, and the copy says so.

**The refusals, each with its reason:**

- **A cache action exists only for a settled loss.** When the log did not
  record the write TTL, the verdict is unsettled — and "add the field" is
  the report's advice, not a plan's. An action built on an unsettled verdict
  would be a recommendation resting on a guess about which rate applied.
- **A log that priced nothing is an error naming the next step** (`trazum
  profile`), not an empty plan — a plan over zero dollars is advice about
  nothing.
- **No target names the usage in full**, including that the argument can be
  a directory of rotated logs.

### The document

`docs/json-output.md` gains the plan document as its own contract —
`schemaVersion`, the dated stamp, the span or its honest null, the ranked
actions with their typed assumptions, the two totals kept apart, and the
bill the plan was made against. Enforced in both directions by a parity
test: a documented field that vanishes fails, and a field added without a
line in the doc fails too. The profile document's own contract test is now
scoped to its own table, since the file describes three shapes.

### The module underneath

`@trazum/core` gains `plan.ts`: `buildPlan(report, levers,
pricingLastReviewed)` and `planLabelName`, browser-safe — everything is
derived from figures the report and the levers already computed. Nothing is
invented: route and batch come from `billLevers` (combined, never summed),
the truncation stake is the measured retry bill, the cache stake is
`cacheEconomics`' own delta.

### What stayed out, and why

The plan document deliberately spans one log. Comparing a plan against a
*newer* log — did the routed slice actually shrink, did the retries stop —
is 1.39.0's verification, and building half of it here would have shipped a
comparison with no attribution rules.

The spec's "actions needing no human judgement" filter for `--effort`. In
this design every action carries at least one assumption — that is the
point of the plan — so a filter for assumption-free actions would return an
empty plan on every log, a flag that always says nothing. The effort dial
that exists is `--min-usd`, named for what it actually filters by.

---

## 1.37.0 — "The fleet"

The second of the five planned in `docs/plan-1.36-1.40.md`. `profile` merges
a directory of logs into one honest bill, which is right for one service and
wrong for twelve: the merged report hides which service the money is coming
from, per-service budgets cannot exist at all, and the findings a comparison
*between* services could make are invisible. This release is the comparison.

### `profile <dir> --by-source` — one summary per service, and the bleeder named

The config gains a `sources` block — a name per service, each with glob
patterns over log paths — and `--by-source` walks the directory recursively
(the fleet's whole point is one directory per service, so this is the one
mode where the walk descends), assigns each file to the most specific
matching pattern, and renders the fleet:

```
The fleet: 2 sources · $21.00 · 3 calls
  api  $20.00  95.2% of the fleet · 2 calls · 9.0 days
  web  $1.00  4.8% of the fleet · 1 call · 0.0 days

  ! api is where the money is: $20.00, 95.2% of the fleet's total.
  These sources cover different periods, so the shares above compare totals,
  not rates — a 3-day log looks cheap next to a 30-day one for reasons that
  have nothing to do with cost. Each row states its own span.

  ! The same workload runs on different models in different sources — support:
    api → claude-opus-5 ($20.00), web → claude-haiku-4-5 ($1.00). Same job,
    different rate cards; whether that is a decision or an accident is not in
    the logs.
  ! logs/stray.jsonl matched no source pattern, so it is in no report above —
    spend missing from every bill until a pattern covers it.
```

Pattern precedence is the budget patterns' own most-specific-wins rule,
applied across sources — two rules for pattern precedence in one tool is one
rule too many. `services/api/**` beats `services/**` on the same file, whoever
owns each pattern.

**The findings are the ones a merged bill cannot make:**

- **Split brains.** The same workload label running on different models in
  different sources — one team on Opus, another on Haiku, same job. Judged on
  each source's *dearest* model for the label, so a single stray experiment
  call does not report a team as migrated. Only splits where both sides carry
  real spend are reported, dearest gap first. Whether the split is a decision
  or an accident is not in the logs, and the copy says so instead of guessing.
- **Cache underwater in a named source.** Caching that pays for the fleet in
  aggregate while losing money in one service — the aggregate verdict is the
  flattering rendering when a source is quietly underwater, so each one is
  named with its own delta. Reported *only when the aggregate pays off*: when
  the aggregate itself loses money, the whole-fleet report already shouts,
  and repeating it per source would be the same alarm in pieces.
- **Mismatched spans, in the copy.** Shares of the fleet's total are shares
  of a sum, and stay valid — but reading them as *rate* comparisons is the
  mistake the flag exists to stop. When sources' logs cover meaningfully
  different periods (spans more than a day apart, or some with no clock at
  all), the report says so and each row states its own span.

### `spend.bySource` — a budget per service, failing by name

```
FAILED — api spent $20.00 against its budget of $5.00 in spend.bySource. The
fleet total can be fine while one service bleeds; this gate names which.
Within budget: web spent $1.00 against its $10.00 in spend.bySource.
```

The fleet total can be fine while one service bleeds — that is the whole
reason per-service budgets exist. Each source is gated against its own figure
in the same run, exit 1 naming the failing service.

**The refusals, each with its reason:**

- **A budgeted source with no logs is named, not passed.** "Did not appear"
  is not "under budget" — a service whose logs stopped arriving would
  otherwise pass forever on the strength of the silence.
- **Files matching no source pattern are named loudly.** A log in no report
  is spend missing from every bill, which is the flattering omission this
  repository refuses everywhere it can occur.
- **`--by-source` without a `sources` block is an error naming the fix**,
  not an empty fleet — a report over zero sources would be "nothing is
  bleeding" said about nothing being measured.

### The JSON document

`profile <dir> --by-source --json` emits the fleet document: the full
per-source reports (each one exactly what `profile` would say about that
service alone), the rollup — totals, shares, the worst source, split brains,
cache-underwater sources, the mismatched-spans flag — and the unmatched
files. Documented field by field in docs/json-output.md.

### The module underneath

`@trazum/core` gains `fleet.ts`: `assignSources()` (file-to-source assignment
by most specific glob, unmatched files returned rather than dropped) and
`fleetRollup()` (the rollup with every finding above). Browser-safe — it
reads no files and runs no globs against a filesystem; the caller hands it
file names and per-source reports, so the CLI keeps its monopoly on I/O.
`sources` and `spend.bySource` validate in the config schema with the same
discipline as everything else there: non-empty pattern lists, no empty names,
and no filesystem checks — which files exist is the CLI's question.

### What stayed out, and why

A `source` column on `--csv-out`. The CSV contract is one row shape per file
so nothing has to be filtered before it can be summed; a source column would
make the slice shape mean different things with and without `--by-source`,
and a chart summing across it would double-count the fleet. Per-source CSV is
a run of `profile` per source directory, which needs no new contract.

---

## 1.36.0 — "The estimate stops guessing"

The first of the five planned in `docs/plan-1.36-1.40.md`, and the one that
introduces Trazum's two halves to each other. The estimating half (`optimize`,
`check`, `diff`, `rank`) multiplies a token delta by a call volume, an output
size and a cache hit rate that somebody typed into a config file. The
measuring half (`profile`) reads the provider's own billed counts and knows
all three exactly. Until this release they had never met.

### `optimize --from-log <usage.jsonl>` — the multiplication measured

```
Cost with Claude Opus 5
  1,043 calls measured over 12.0 days — 2,608/month at that rate · 512 output
  tokens per call, measured
  $161.20 → $103.40   saving $57.80/month (35.9%)
```

The token delta stays an estimate with its ±10% band; everything it is
multiplied by stops being a guess. The rendering names which figures are
measured on every line, because "measured × estimated" and "estimated ×
guessed" are different claims about the same dollar sign, and the reader
budgeting on the result must know which one they are holding.

Which workload the prompt is comes from `--label`, or from the config's
`labels` map read in reverse — the file on the command line looked up among
its values, with two labels mapped to one file refused by name rather than
resolved by silent first match.

**The refusals, each with its reason:**

- **Typed flags are refused beside it.** `--from-log --calls 5000` is a
  contradiction, not a preference order: measuring and typing the same figure
  cannot both be the answer. The same for `--output-tokens`,
  `--cache-hit-rate` and `--model`.
- **Nothing scales to a month under a week of data.** The week is the cycle
  traffic actually has, and a span shorter than one cycle scaled up
  multiplies whichever part of the cycle it caught — three weekdays scaled to
  a month is a Tuesday with a multiplier. Under the floor, the saving is
  stated over the exact period measured, every "month" disappears from the
  wording, and the refusal explains itself in the output.
- **A label with no priced traffic is an error naming the labels that have
  some.** A zero-call profile would price the change as *worthless* when the
  truth is *unmeasured*, and those read very differently in a review.
- **A label that ran on several models says so**: the figures use the model
  that carried the most spend, and the report states which share of the
  label's money that model covered.
- **Output never recorded renders as $0 measured, not $0 assumed** — the
  difference between "these calls produced nothing billable" and "nobody
  wrote the field down".

`--from-log` implies `--cost`: a log with billed token counts is proof the
prompt's traffic goes to a metered API, whatever the terminal running the
command bills like — without this, a subscription-billed host would suppress
exactly the figures the person measured in order to see.

### `optimize --all-labels` — which prompt to edit first

```
Every mapped prompt against its own measured traffic — 2 ranked by what the
change is worth
  → support  $57.80/month if optimised   prompts/support.txt · 1,178 → 742 tokens · $402.11 measured
  → chat     $3.20/month if optimised    prompts/chat.txt · 310 → 296 tokens · $12.40 measured
  ! orphan carries $250.10 of measured spend and no prompt file is mapped to
    it — the workload nobody can optimise because nobody said where it lives.
  retired is mapped to prompts/old.txt and has no traffic in this log.
```

Every prompt in the config's `labels` map, optimised and priced against its
own measured traffic, ranked by what the change is worth. Ranked by traffic
and never by prompt length — a big prompt on a dead workload is worth less
than a small one on a busy one — which is also why it requires `--from-log`:
ranking savings that were all multiplied by the same typed guess ranks the
prompts by length and calls it a priority.

Both coverage mismatches are named at the end, because neither side can see
them alone: a label carrying measured spend with no prompt mapped, and a
mapped prompt whose label has no traffic (retired, renamed, or a typo that
has been silently doing nothing). A mapped file that cannot be read is named
too — the mapping exists; the file does not.

### The module underneath

`@trazum/core` gains `measured-profile.ts`: `measuredUsage()` returns the
profile with its provenance attached — the span, the scaling factor when one
was applied, the chosen model's share, whether output was ever recorded — and
`labelCoverage()` returns both mismatch lists. The cache figure is documented
as what it is: a share of input *tokens* served from cache, not the share of
*calls* the config field was defined as. A measured token share beats a typed
call share, and the module says so rather than renaming one into the other.

---

## 1.35.0 — "The reader who is not in the terminal"

The last of the six planned in `docs/plan-1.30-1.35.md`, and the one aimed at
the person who owns the budget and does not run the CLI.

### The short form

`--markdown-summary` states the gate verdict, the bill, what changed against a
previous log with its largest driver, and the single lever worth the most —
then stops. Twelve lines against ninety, for a pull-request body or a weekly
note.

It is a **view over the same report, never a different set of figures**: a
reader who opens both cannot find them disagreeing. It returns before the full
rendering rather than filtering it, so a section added later cannot leak into
the short form by forgetting to opt out. One driver and one lever, because a
summary that lists everything is the report with a shorter heading. With no
previous log it says so, rather than implying a stability nobody measured.

### The comparison in the browser was already there

The plan's second item for this release was "the web bill accepts a
comparison". It has since 1.11, and coverage drift and the what-if
corrections reached it with their own releases — so the honest answer is that
nothing was missing, and no work was invented to look busy.

One real gap turned up while checking: the privacy sentence above the drop
zone said "the log", singular, on a page that has accepted two files for
twenty releases. The second was always read in the tab like the first; now the
promise says so where somebody about to open it will read it.

---

## 1.34.0 — "Findings as policy"

### A finding decided about, on the record

Trazum finds the same thing every run, and a team that has looked at a failure
and chosen to live with it had no way to say so — so the finding shouted
forever and the report lost authority. `waive` in `trazum.config.json` fixes
that, and its refusals are the design:

```json
"waive": [{ "gate": "maxUsd", "reason": "August migration doubles traffic", "until": "2026-09-15" }]
```

```
FAILED — this log spent $12.00 against a --max-usd of $8.00.
WAIVED — the maxUsd failure above is on the record and silenced until
2026-09-15 (28 days left): "August migration doubles traffic". The bill still
counts it; only the exit code is quiet.
```

**All three fields are required.** A waiver with no end date is a finding
deleted with extra steps; a reasonless one is a silence nobody can audit; one
naming an unknown gate is a decision about nothing, refused with the list of
what is waivable.

**Waived is shown as waived, never hidden.** The failure prints in full, its
explanation prints, the bill still counts it. Only the exit code goes quiet.

**An expired waiver fails the gate it silenced**, naming the date it expired
and the reason somebody wrote. That expiry is the entire mechanism by which a
waiver stays a decision rather than becoming a habit.

### What cannot be waived, and why

`maxUsd`, `maxDayUsd`, `maxSessionUsd`, `maxCacheLossUsd`, `maxGrowthUsd` and
`byLabel:<label>` are waivable. The growth gate's **coverage refusal** is not:
that failure says the comparison cannot be made, and waiving unmeasurability
would be a decision to stop measuring rather than a budget decision with an
end date.

---

## 1.33.0 — "The log it could not read yet"

### Gemini's shape, recognised because it is unambiguous

`usageMetadata` appears in no other provider's response — that is the
recognition bar, and ambiguous shapes stay refused rather than mapped
hopefully. `promptTokenCount` and `candidatesTokenCount` read as input and
output; `cachedContentTokenCount` is subtracted from the prompt count through
the same mechanism as OpenAI's `cached_tokens`, because Gemini sets the same
double-charge trap; `finishReason: "MAX_TOKENS"` joins the truncation
contract. The catalogue has priced `gemini-2.5-pro` and `-flash` since the
seven-provider work — what was missing was reading the log their SDK writes.

Already true, stated for the record: Bedrock's camelCase counts
(`inputTokens`/`outputTokens`) and OpenRouter's OpenAI-shaped usage were
readable before this release. Nothing new shipped for them; the sentence is
here so nobody discovers it by experiment.

### `--dry-run`: what the log could answer, before you wire it in

```
What this log can answer — no bill was produced
  ✓ The bill itself: totals, per-model split, cache economics, the levers.
  ✓ Per-workload findings and label budgets — "label" on 100.0% of records.
  ✗ Truncated answers and their retry bill — a stop reason on 0.0% of records.
```

Readiness per capability and no dollar figure at all, so nothing in it can be
mistaken for spend. It refuses to run beside a gate — a gate over a report
that was never produced would exit green having judged nothing — and it
distinguishes "nothing wrote to the cache" from a missing split, because
absent traffic and an absent field are different facts. Nothing parsing exits
non-zero: an unreadable log is not a ready one.

---

## 1.32.0 — "The routing decision, priced whole"

### The figure the target would refuse to bill, corrected in place

A cache entry only forms above a model's minimum prompt size, and a slice
whose largest call sits under the target's minimum could not create one — so
`--what-if`'s standard figure granted cache traffic discounted rates the
target would never concede, an error in exactly the flattering direction:

```
· tiny on claude-opus-5: $0.00380 → $0.00076
! Its cache traffic could not exist there: the largest call is 400 tokens
  against the target's 4,096-token cache minimum, so no call in this slice
  could create an entry. Without the cache the same tokens cost $0.00130 —
  the figure the target would actually bill.
```

The correction travels inside the slice (`cacheBeyondTarget` in the JSON), so
a consumer cannot print the discounted figure without it. Silent when the
calls clear the minimum, when nothing cached, or when the target's minimum is
unknown — nothing is claimed against a threshold nobody stated.

### The move, batched

The decision usually pairs the move with the Batch API, and the arithmetic in
a reader's head gets done by adding two savings — the mistake the levers
module documents. `--what-if` now states the moved bill with the target's
batch discount on top, computed on the target's rates with over-context money
excluded, and hedged: whether these calls can wait is not in the log.
`whatIf.batchOnTarget` in the JSON, null when the target sells no batch
discount — a different statement from a $0 saving.

### What stays out, and why

The plan named a check for `max_tokens` ceilings above the target's output
limits. The catalogue carries no output ceilings, and inventing them would be
this tool doing the guessing it exists to end — the check waits for the data.

---

## 1.31.0 — "The gate that explains itself"

### A failing gate says what to change

A gate printed a verdict and an exit code, and the person reading it is in
CI — the one place nobody opens the full report. Every spend gate failure now
carries its own next step:

```
FAILED — this log spent $12.00 against a --max-usd of $8.00.
  Most of it is rag on claude-opus-5: $10.00, 83.3% of the bill. That is
  where the money is, not necessarily where the fix is.
  The largest lever the report priced would save $5.00 on rag by sending it
  through the Batch API — enough to cover the $4.00 this is over by.
```

Nothing is invented: the overage is subtraction, the contributor is the
biggest slice already in the report, the lever is the report's own
arithmetic. Whether the lever covers the overage is stated rather than
inferred, and nothing recommends — whether that model can do the work is the
reader's to judge, and the copy says so. Written once, called by all four
gates.

### A tight pass says so

`Passed with 4.0% of the budget left`. A pass 2% under budget and a pass 60%
under are different states of the world, and only one of them is quiet news.
Said under a tenth of the budget, with the threshold in the sentence.

### The verdict reaches the CI summary

The gates spoke on stderr and stopped there, so a run summary carried the
whole report and not the one sentence explaining why the build was red.
`--markdown-out` now leads with the verdict — a failure quoted and bold, its
explanation beneath it, a pass stated plainly — and the GitHub Action already
pipes that file into the step summary, so red builds carry their reason with
no workflow change.

---

## 1.30.0 — "The report as a diff"

### What the comparison stopped being able to see

`--against` names the dollars that moved. Nothing named the findings that
stopped being *measurable* — and those look exactly like good news:

```
$4.00 → $4.00 · +0.0%
! Coverage moved: session was on 100.0% of records and is now on 0.0%.
  Gone quiet with it: conversation growth, per-conversation cost, repeated
  turns, truncation retries and the cache-TTL fit.
```

The bill is identical on both sides, which is exactly why this exists: a log
that stopped recording `session` has not fixed its conversation growth, it
went blind to it. A fixed finding and a blinded log are opposite facts the
dollars render identically, and coverage is the only thing that tells them
apart. Shares rather than counts, so two logs of different sizes compare;
20 points in either direction, stated in the copy; loud on a collapse, quiet
on a gain, because seeing more is not a regression.

### The gate refuses a comparison it cannot make

`--max-growth-usd` now fails when this log stopped recording a field the
previous one carried, before it judges the dollars at all:

```
FAILED — this log stopped recording session (100.0% of records before, 0.0%
now), so the comparison cannot be made. That is not a pass: a bill whose
growth nobody could measure is not a bill that stayed flat.
```

The same refusal `--max-day-usd` makes on a clockless log and
`--max-session-usd` on a sessionless one. A field that *appeared* never
refuses.

### The same finding on all three surfaces

The CLI, the MCP's `profile_usage` and the web bill render the drift at the
same threshold with the same split, so an agent relaying "spend flat, all
clear" cannot do it off a log that stopped measuring.

---

## 1.29.0 — "The budget, the overlay and the small log"

### The unit an agent product blows up in

A month's budget and a day's budget both pass while one conversation loops
its way through $400. `--max-session-usd` — or `spend.maxSessionUsd` in
`trazum.config.json`, flag winning — judges the single most expensive
conversation in the log:

```
FAILED — the most expensive of 3 conversations cost $8.00, over the
--max-session-usd limit of $5.00.
```

The report gained `sessionSpend` (`sessions` and `maxUsd`, no minimum)
alongside the percentile-gated `sessionCosts`, because a maximum is a fact
at any count. The refusals travel with it: a log with no sessions fails
rather than passes, a conversation that started before the log makes the
pass a floor and the message says so, and the session key never appears in
any output — pinned by tests on both the text and `--json` paths.

### The CLI's price table, in the MCP, as text

`profile_usage` gained `pricing_overlay`: the same JSON document a
`--pricing` overlay file holds, passed as text because this server takes
no paths — that absence is the security design, and it stays. Models the
overlay adds or overrides price the whole report, `what_if` included, and
the report says the overlay is in effect with the overlay's own
`lastReviewed` date. A malformed overlay is refused with the parser's own
reason, never a report quietly priced from the bundled table.

### The figure that survives a small log

`sessionCosts` refuses slices under five conversations — a percentile over
four is the largest of four wearing a percentile's name. Now, where the
percentiles refused and the log still carries sessions, the CLI, the MCP
report and the web bill state the count and the single worst cost — the
same figure `--max-session-usd` judges — and stand the line down the
moment the percentiles can speak.

---

## 1.28.0 — "The retry bill, the series and the standing word"

### The billed-again half, measured

The truncation finding has always said cut-off answers are *frequently
retried — billed again*, and that half was an assertion. Now it is a count
and two dollar figures:

```
  ! draft on Claude Opus 5: 2 of 3 truncated answers were followed within
    120 seconds by another call in the same conversation — $4.00 spent on
    the cut attempts, plus $4.00 on the follow-ups.
```

Attributed to the truncated call's slice — where the `max_tokens` ceiling
that caused the pair lives — with the checkable denominator, a two-minute
window, and the hedge in every rendering: the log cannot see content, so
the pair is a shape, not a certainty. A single pair is not reported.

### The drift, day by day

`--csv-shape model-day` writes one row per UTC day *and* model — the long
format a pivot table or a chart takes as-is — and `spendByDay` in `--json`
carries the same per-model split, so `modelMixDrift` stays the summary and
the raw series is available whole. No total row, model ids formula-defused,
unpriced models absent.

### The standing word

`spend.maxDayUsd` in `trazum.config.json` arms the per-day gate from the
repository instead of one CI invocation. The flag still wins when both are
present, and the config path inherits the refusal: a log with no timestamps
fails the day budget, because "not measured" is not "under budget".

---

## 1.27.0 — "The ceiling, the drift and the tab in step"

### The ceiling, seen coming

Input grows turn by turn or document by document, costs nothing extra to
grow — and then one call crosses the model's context window and the API
refuses it outright. The bill looks fine right up to the day the product
breaks.

```
  ! chat on Claude Haiku 4.5: the largest call carried 190,000 input tokens
    against a 200,000-token window — 95.0% of the ceiling.
```

Each slice's largest call (input, cache reads and writes — the model read
all of it) against **its own model's** window: the same 170k-token call is
an emergency on Haiku and irrelevant on Opus. Silent below half the window,
quiet from 50%, loud from 85%. Never a date for the crossing: a straight
line through two points is a guess wearing arithmetic's clothes.

### The migration a total cannot show

A bill can grow with no workload growing — traffic quietly moving from the
cheap model to the expensive one, a deploy that flipped a default, a
fallback that became the main path.

```
  ! claude-opus-5 went from 0.0% of the spend in the first 2 days to 100.0%
    in the last 2 — $2.00 of the recent half.
```

The log's days are split chronologically in half and each model's exact
share of each half's spend is stated. `null` under four dated days — one
day against one day is weather presented as climate. The renderings speak
past fifteen points of movement; `--json` carries every share either way.
And never a forecast: where the mix goes next is not in the log.

### The tab in step

The browser Bill tab picked up the four findings it lacked — the
doubled-bill warning, the same request sent again, the ceiling and the
drift — with the CLI's own thresholds, computed in the page, verified in
Chromium with zero network requests.

---

## 1.26.0 — "The release that releases itself"

### Merging the release PR is now the release

This version contains no product change. It changes what a version *is*: from
here on, merging the release PR publishes the packages, creates the
`v<version>` tag on the merge commit, and publishes the GitHub release from
this file — no tag to type, no second step to remember, no laptop involved.

A `decide` job fronts it: every push to main runs a seconds-long registry
preflight, and only the one push whose manifests name a version the registry
does not have goes on to release. Ordinary merges skip in nine seconds
(measured, on the first live run). A pushed tag remains the manual override,
and the Actions-tab dry run stays a dry run.

### npm can no longer fail the publish

Trusted publishing rejected this workflow's OIDC token on six real publish
attempts across three versions, and four releases went out from a laptop
because of it — which protects nothing and audits worse. The publish steps now
accept an environment-scoped npm token as the authentication fallback: absent,
OIDC is the auth exactly as before; present, the release goes out either way.

**Provenance survives both paths.** The attestation is signed with the job's
OIDC identity, which is independent of how the upload authenticates — so this
release, unlike every one before it, carries a verifiable provenance
statement. The security suite pins the containment: only `release.yml` may
reference the secret, only in one exact shape, and npm token material
committed anywhere fails the build.

### The documentation sweep is enforced, not remembered

A release is not cut until all the documentation says so. `verify` now fails
when the manifest version is missing from `CHANGELOG.md` (as a heading),
`ROADMAP.md` (by name) or this file (as a section) — so a release prep that
skips the docs cannot merge. The checklist in `docs/releasing.md` adds the
grep sweep for the stale references no test can know about.

Also in this version: every repository document caught up with the registry —
the README's action pins advanced to the 1.25.0 commit, the roadmap's Released
section no longer stops at 1.9.0, and `docs/releasing.md` tells the truth
about the trusted-publisher fight, including the by-hand procedure 1.25.0
used.

---

## 1.25.0 — "The retry, the archive and the shape in the tab"

### The same request, sent again

A conversation's input grows with every turn. So two consecutive calls in one
conversation carrying *exactly* the same input size, seconds apart, is the
shape of something going wrong:

```
  ! agent on Claude Opus 5: 5 of 6 calls re-sent the previous call's exact
    input size within 60 seconds, in the same conversation, costing $5.00.
```

A retry after a timeout, an agent step repeating because a tool call failed, a
loop that re-sends the whole context and gets nowhere — the call is billed in
full, and on an agent workload the input *is* the bill. 1.23's
`duplicateLines` catches the same line recorded twice; this catches two
different calls that sent the same thing.

Each call is compared only to the one immediately before it in the same
session, inside a one-minute window, and only where the log carries both a
session and a clock. It cannot see content, so it names the pattern and stops:
every rendering says *usually* a retry or a loop, never that it is one. A lone
repeat is not reported at all — a single retry after a timeout is ordinary.

### Rotated logs are read as they are

`logrotate`, Docker's json-file driver and every cloud log export compress
yesterday's file, so a directory of a month's logs is one plain file and
twenty-nine gzipped ones. Directory mode read the plain one and said nothing:
a month's bill reported from a day of it.

```bash
trazum profile /var/log/llm/    # today.jsonl + 2026-08-*.jsonl.gz, one bill
```

Decided by extension rather than by sniffing the first two bytes — a `.jsonl`
starting with `0x1f8b` is far more likely a corrupt log than a mislabelled
archive — and a `.gz` that will not decompress is an error naming the file,
never a bill quietly missing a day. `--against` accepts them too.

### The input shape, in the browser

The Bill tab gained the card the terminal and the CI summary already had: how
big a slice's calls are, whether the large ones dwarf the ordinary one, and
how much of that size was billed at the cache-read rate. Same threshold, same
sentences — two surfaces summarising one log differently is a second opinion
nobody asked for. Measured in your own tab, like everything else there.

---

## 1.24.0 — "How big, how uneven, and the day it spiked"

### How big these calls actually are

`profile` could say "input is 63% of this bill" and stop there. True, and
nothing follows from it. The question somebody can act on is whether *every*
call carries a large prompt or a few calls carry an enormous one — and those
two want opposite responses:

```
  rag on Claude Opus 5 is uneven: half its calls fit within 1,024 input
  tokens and 95% within 106,496 — about 104.0x the ordinary call, over $2.70
  of input spend.
  Past four times the median, the ordinary call is fine and something is
  growing on top of it: a conversation nobody truncates, a retrieval with no
  cap, a tool result pasted in whole. The fix is a limit on the large calls,
  not a rewrite of the prompt every call sends.
  Almost none of that was a cache read, so every one of those tokens was
  billed at the full input rate.
```

An even slice gets the other sentence, pointing at the prompt instead. Every
figure is a **bucket ceiling** rather than an interpolated percentile — "half
the calls fit within 1,024 input tokens" is exact for the number named — and a
slice with fewer than twenty calls is left out entirely rather than reported at
a precision it does not have.

### `--max-day-usd`, the gate a total cannot arm

A month at $3,000 against a $4,000 budget passes while one afternoon's runaway
loop burned $900 of it.

```bash
trazum profile month.jsonl --max-usd 4000 --max-day-usd 300
```

```
FAILED — 2026-08-14 spent $412.00, over the --max-day-usd limit of $300.00. A total
under budget can hide a single runaway day, which is what this gate exists to catch.
agent was the biggest label that day, at $380.00.
```

A log with **no timestamps fails this gate** rather than passing it: a bill
nobody could measure by day is not a bill that stayed under a daily budget.
Calls with no clock are in the total and in none of the days, so a *pass* says
how many were left out — a failure stands regardless.

### The CI summary says what the terminal says

`--markdown-out` is where most people will ever read this report, and three
findings were missing from it: the doubled-bill warning (above the figures it
would inflate, not below them), the input shape, and the `--what-if`
repricing — with its assumption above the figure there too, because a pull
request comment is exactly where a dollar amount with the caveat underneath
gets read as a recommendation and merged.

### Fixed

"1 lines are exact duplicates" could not agree with its own verb. It takes a
number now and reads "1 line is an exact duplicate", in both languages.

---

## 1.23.0 — "What if it were the other model?"

### `--what-if <model>`: these exact calls at another rate card

The levers section picks its own candidate. This answers the question you
arrived with — *`classify` spent $4,000 on the frontier model, what would
those calls have cost on the small one?*

```
trazum profile usage.jsonl --what-if claude-haiku-4-5
```

```
  These exact calls on Claude Haiku 4.5
  This is multiplication, not advice: the same token counts at another rate
  card. It says nothing about whether that model could do the work, and a
  model that answers at greater length or gets retried would not send these
  counts at all.

  → $1.00 of movable spend would have been $0.2000 — a difference of $0.8000.
    · chat on claude-opus-5: $1.00 → $0.2000
  ! huge cannot move: its largest call carries 250,000 input tokens and that
    model's window is 200,000. Those calls would fail, not cost less, so
    their $1.25 is excluded from the figures above.
```

Every token in that answer was actually billed — only the rate card changed —
so it is arithmetic rather than the guess about content `profile` refuses to
make. What makes it usable is what it declines to say:

- **A call the target could not have accepted is named, not priced.** It would
  fail, not cost less, and its money is in none of the totals. The ceiling is
  judged on the largest single call: one call over the line is a failed call,
  and an average hides it.
- **Spend already on that model stays out of the difference**, so a bill that
  is mostly already cheap does not report a 1% change and read as "not worth
  doing".
- **Models with no price here are named.** Their cost on the target is
  knowable; the difference is not.

The same comparison is in `--json` as `whatIf` — with `sameTokensAssumed`
inside the object, so a dashboard cannot print the figure without the caveat —
in the MCP `profile_usage` tool as `what_if`, and in the web Bill tab as a
model picker that reprices in your own browser tab. A model id nothing can
price is an error on all three, never a section that quietly says nothing.

### A doubled bill, caught

Reading a directory of rotated logs makes double-counting easy: a log exported
twice, an overlapping export, a copy left in the folder. The total then reads
high and nothing else in the report can see it.

```
  ! 2 lines are exact duplicates of an earlier line — same counts, same label
    and session, same millisecond — and they add $2.00 to the total above.
```

Counted only over records carrying a clock, comparing the raw line rather than
a hash, because a hash collision would report a duplicate that is not one and
this figure exists to make you distrust a total. It states the count and the
money and stops: whether it is a double export or a genuinely busy millisecond
is yours to know.

---

## 1.22.0 — "The gate, the window and the spreadsheet"

### The bridge between the two halves of the product

`check` gates what you **wrote**; `profile` measures what you **sent**.
Nothing told a reader those are different quantities — so when `labels` maps a
workload to a prompt file and a budget covers that file, the report now says
how much of the call that gate can actually see:

```
! The budget on prompts/support.txt is 2,000 tokens, and calls labelled support
  carry about 50,000 input tokens each — so that gate governs roughly 4.0% of
  what actually goes up the wire. The budget is not wrong; it is just smaller
  than the bill.
```

Only when the budget covers less than half the call — a budget doing its job
is not news — with the share named as approximate, because a file is counted
by the estimator and a call by the provider. Cached tokens count towards the
call: a cached token was still sent and still filled the window.

### `--since 7d`

"The last week" is what a nightly job asks for, and computing a date in a
shell to say it is the step that gets skipped. Days and hours on either bound,
plus `now`. Measured against **this machine's clock, not the log's** — said
out loud beside the window line, and named as the likely reason when a
relative window finds nothing.

### `--csv-shape day|hour`

The CSV wrote one table: label and model. The time series is what somebody
pastes into a chart, so it is a choice now rather than extra columns — one row
shape per file, because a spreadsheet that has to filter before it can sum is
a spreadsheet somebody sums wrong. The day table carries each day's biggest
label; a day whose calls carried no label leaves those cells empty rather than
inventing a name.

---

## 1.21.0 — "What the log does not say"

**A report that quietly omits half of itself is worse than one that admits
what it is missing.**

Every finding past the totals needs a field the log format does not require —
`label`, `session`, `ts`, `stop_reason`, the `cache_creation` object. A reader
who never adds them sees a shorter report and has no way to tell "nothing to
report" from "nothing recorded". The report now ends by naming each missing
field with what it would unlock:

```
What this log cannot answer yet
  "session" on 12/40,000 records: without it there is no conversation growth,
  no per-conversation cost, and no cache-TTL fit. It is grouped by and never
  printed.
```

**Counts, never booleans.** Twelve labelled records out of forty thousand is
not a labelled log — a boolean would call it one, and the other 39,988 would
never be found. Coverage is counted over records that *parsed*, priced or not,
because whether a field is present is a property of the log rather than of the
price catalogue; the cache-TTL line is counted only over records that actually
wrote to the cache, the one place its absence means anything.

A complete log gets **no section at all**: a paragraph of things that are fine
is the paragraph readers learn to skip. The same section, from the same
counts, reaches the MCP — where an agent told "labelled" by a boolean would
stop asking — and the browser.

**And the README caught up with eight releases**, so the first file anybody
reads finally describes the tool that exists: the conversation cost, the shape
of the day, the never-came-back ceiling, the third money gate, `spend` budgets
in the config, `--csv-out`, directory mode and the documented `--json`
contract.

---

## 1.20.0 — "When, and what you can build on"

### The shape of the day

```
80% of this spend lands in 2 hours of the UTC day (09:00, 10:00) — interactive
traffic somebody is waiting on, where the Batch API's 24-hour turnaround does
not fit.
```

The total says how much and the per-day series says which days. Neither says
*when in the day*, and that is what decides whether the Batch API — a flat 50%
— applies at all. `spendByHour` buckets exact per-record dollars by hour of
the UTC day, and the report states the measure that needs no threshold to
explain: **the fewest hours holding 80% of the spend**. Two hours is
interactive; twenty is background work, which is what the Batch API halves.

It names the lever and never claims the saving: whether a workload can wait a
day is a product decision counts cannot make. The browser draws the same
thing as twenty-four bars — with empty hours drawn empty, because a chart that
closed the gaps would make every workload look flat.

### `--json` becomes a contract

`docs/json-output.md` documents every top-level field, the output carries a
`schemaVersion`, and a test enforces the promise **in both directions**: a
documented field that disappears fails the build, and a field emitted without
a line in the doc fails it too.

The promises are the ones a dashboard needs: fields are added without a
version bump, so ignoring unknown keys keeps working; dollars are unrounded
numbers — the terminal rounds, the JSON does not; **absence is `null` or `[]`
and never zero**, because "not measured" and "measured as none" are different
answers; and nothing in the document carries a session key or prompt text.

---

## 1.19.0 — "Which workload, and at what rate"

**A total tells you something is wrong; this release tells you whose it is.**

### Truncation, with suspects

```
! 3 calls hit the max_tokens ceiling: $3.00 of output (12%) bought answers cut
  off mid-generation — paid in full and frequently retried.
    chat: 1 of 2 calls that recorded a stop reason were cut off (50.0%), $1.00
    of output. The denominator is the calls that measured, not every call.
    95% of the answers that finished fit within 4,096 output tokens.
```

The report could say a bill paid for cut-off answers and not which workload
was paying. It names them now, ranked by wasted output — and the **rate** is
the finding: 40% is a `max_tokens` setting that is simply wrong, 1% is a long
tail, and the two call for opposite responses.

The denominator is stated because it is the honest part: calls that *recorded
a stop reason*, never every call, since a workload logging the field half the
time is not a workload whose other half completed. Beside it, the ceiling the
finished answers actually needed — the number a cap wants, next to the
evidence that the current cap is too low.

### Click a workload, see it alone

The web Bill tab's per-label table became clickable: the CLI's `--label`
without retyping the command. The banner carries the awkward half out loud —
every share below is a share of *that workload's* bill, not of the log — and a
drill-down inside a drill-down is not offered, because it would filter an
already-filtered report and quietly produce an empty one. Verified in a real
browser, zero network requests.

Every finding in this release renders the same way in the terminal, in
`--markdown-out`, in the MCP and in the browser.

---

## 1.18.0 — "The bill, where the decisions are made"

**Three additions about where a cost report actually gets used: in a repository,
in a spreadsheet, and over the month of logs you already have.**

### Budgets that live in the repository

```json
{ "spend": { "maxUsd": 200, "byLabel": { "chat": 40, "batch": 120 } } }
```

```bash
trazum profile logs/yesterday.jsonl     # no flags — the policy is in the repo
```

`budgets` gates the tokens a prompt file may hold; `spend` gates the dollars a
usage log records. A per-workload budget is a policy several people agree on,
and a policy that lives in one CI invocation is a policy nobody can read.
Flags still beat the config, as everywhere.

Two refusals keep it honest. A budgeted label with **no calls in the log** is
reported as *not measured*, never as a pass — a workload that did not appear
is not one that came in under budget. And per-label budgets are **not applied
under `--since`/`--until`**, because a window makes "what this label spent"
mean a slice, and a budget written for the whole period would gate against
something it does not describe.

### The report as a spreadsheet

```bash
trazum profile usage.jsonl --csv-out spend.csv
```

One row per label and model — the grain a routing or budget decision is made
at. **No total row**, because a total inside a data file gets summed with the
data and doubles every figure downstream. **Empty dollar cells for unpriced
models**, never zeros, because their tokens are real and a `0` would claim the
calls were free. And a label starting with `=`, `+`, `-` or `@` gets an
apostrophe: a usage log is data, and a spreadsheet would otherwise run it.

Writing that flag found two real defects, both fixed: under `--json` neither
`--csv-out` nor `--markdown-out` wrote anything at all, and the "wrote to"
notice went to stdout and turned a parseable JSON document into a parse error.

### A month of rotated logs, read as one bill

```bash
trazum profile logs/ --max-usd 500
```

Logs rotate one file per day; `cat`-ing them together before a profile will
read them is the kind of setup cost that gets a tool skipped. A directory is
read in name order as one bill, the number of files stated — a report over
"the logs" that silently skipped one is a total wrong by an unknown amount —
and a directory with nothing readable is an error naming the extensions it
looked for, never an empty report that reads as "you spent nothing".

---

## 1.17.0 — "What the report cannot see"

**A report is only as good as what it admits it missed.** This release closes
the last places where Trazum could hand back a confident number over partial
data — and adds the per-conversation figure a price is actually set from.

### A gate that judges part of a bill says so

```
Note: the gated figure is a floor, not the bill — 1 line was unreadable and
left out. Whatever those calls cost is not in the number the gate just judged.
Within budget: $5.00 spent against --max-usd $9.00.
```

Three things hide spend from a gate: unreadable lines, models the price table
does not know, and clockless calls dropped by a `--since`/`--until` window.
The pass still prints — a floor is a legitimate thing to gate on — but it now
means "the part I could read fits", never "the bill fits".

### `--against` warns when the two logs overlap

Two logs that both cover the same day put the same calls on both sides of the
subtraction, so part of the reported growth is the same money counted twice.
Warned between the totals line and the drivers built from it, and only when
both logs carry a clock: unknown stays silent rather than reassuring. The
whole comparison — totals, warning, drivers per label and per model — also
reaches `--markdown-out`, which had been showing one log out of two.

### What one conversation costs

```
chat on Claude Opus 5: across 4,812 conversations, the median one costs $0.02
over 6 turns, 95% come in under $1.80, and the most expensive was $46.10.
```

"Support cost $4,000" does not say whether that is forty thousand cheap
conversations or four hundred expensive ones, and a per-seat price, a quota or
a runaway-loop alarm all need the answer. The **median** is what a typical
conversation costs; the **p95** is what a quota has to survive; a mean is
refused, because one runaway loop drags it up and hides the ordinary case. A
p95 past ten times the median is called out as a tail a quota can catch — and
a p95 beside the median gets the opposite advice, because there is no tail to
hunt. Exact billed counts, on the terminal, in `--json`, in the MCP and in the
browser. Session keys group turns and never appear.

---

## 1.16.0 — "The worst case, on the record"

**Three additions, one posture: when the report cannot be certain, it says
the uncomfortable half out loud — and gates on it.**

### `--max-cache-loss-usd`, the third money gate

```
trazum profile usage.jsonl --max-cache-loss-usd 5
```

Exit 1 when caching **added** more than the limit to this bill — the
`cacheEconomics` counterfactual as a CI gate; exact, the same tokens at the
published input rate. And it reads the **worst case** on purpose: a log
carrying only the flat cache-write count cannot say which TTL was paid, the
settled figure and the 1-hour worst case can straddle the limit, and a gate
reading the flattering half would pass exactly the bills it exists to catch.
The failure message says which claim fired — a settled loss, or a ceiling
only the missing `cache_creation` field can settle. In the Action as
`max-cache-loss-usd`, self-tested in CI on a +$1.25 loss.

### The price table's age, said out loud

Every dollar a profile prints uses the bundled price table, and the one fact
that silently invalidates all of them is a table the provider has re-priced
since — an error that does not name its own size. Past 45 days, the terminal,
the markdown, the MCP and the web all say so loudly, with `--pricing-live` as
the fix; `--json` always carries `pricing.lastReviewed` / `pricing.ageDays`
as provenance. The tests pin the rule, not the calendar: a freshly reviewed
table asserts the opposite behaviour and passes the same suite.

### The day series in the markdown

The spend-per-day table the peak sentence summarises — day, exact dollars,
calls, biggest label — capped at the most recent 14 days with the earlier
ones counted out loud, absent for a single day because one row is the total
again. The full series still rides `--json` as `spendByDay`.

---

## 1.15.0 — "The same answer on every surface"

**1.14.0 added the drill-downs and the drive-by finding; this release makes
every surface give the same answer about them — and adds the one question the
per-workload rows cannot answer.**

### The change by model — where the mix moved

```
  +$4.00  chat  ($1.00 → $5.00)

  The same change, by model — where the mix moved:
  +$5.00  claude-opus-5  (new since the previous log)
  -$1.00  claude-haiku-4-5  (gone since the previous log)
```

A workload that keeps its name and switches from Haiku to Opus reads as "chat
grew" in the per-label drivers — true, and not the reason. `--against` now
splits the same change by model, appeared and vanished models named; one model
on both sides stays silent, because it would restate the totals line. Both
driver sets ride `--json` as `against.byLabel` / `against.byModel`.

Underneath, the union-and-subtract is now **one implementation in
`@trazum/core`** (`driversBetween`), imported by the CLI, the web and the MCP
— its sign convention (positive means the bill grew) flipped once in this
repository's history when restated by hand, and that class of bug dies with
the duplication.

### The comparison reaches the MCP

`profile_usage` gains `previous_log` — the totals with the convention stated
before the first figure, the drivers per label and per model, and a previous
log with nothing priced reported as its own answer rather than zero growth.
`label`, `since` and `until` filter **both** logs, so the comparison stays one
workload and one period.

### The drill-downs reach the Action and the browser

The spend gate takes `label`, `since` and `until` — one workload's budget, or
one period's, in a workflow — with the CLI's refusals intact and self-tested
in CI on hand-checkable arithmetic. The web Bill tab grows two date fields
with the same reading (a bare date is that whole UTC day; the same window on
both logs of a comparison; clockless calls counted out loud), verified in a
real browser with zero network requests.

---

## 1.14.0 — "Drill-downs and drive-bys"

**Two new questions the profile can answer: "what did *this week* cost?" and
"what do the conversations that never come back cost?"**

### One period, honestly

```
trazum profile usage.jsonl --since 2026-08-11 --until 2026-08-17 --max-usd 200
```

`--label` drilled into one workload; `--since`/`--until` drill into one
period. A UTC day or a full ISO 8601 timestamp — and a bare `--until` date
includes the whole day it names, because a window that excludes the day it
names is a trap for everyone who reads dates the way humans do.

The honesty rules carry the feature. A call with no `ts` cannot be placed
inside or outside a window, so it is excluded and **counted out loud**: the
window's figures are a floor on the period, and the report says so. A window
matching nothing is an error naming what the log does cover — never a $0
report, which under `--max-usd` would pass a budget gate over a period the log
does not contain. With `--against`, both logs get the same window, and the
money gates gate the window: yesterday against the day before, with a budget,
in one line of CI.

### The drive-bys

A cache write is a bet: pay 1.25x input now (2x at the 1-hour TTL) so the next
turn reads the prefix at 0.1x. A conversation that ends after its first turn
never places that next call — and on a workload with many short sessions this
leaks steadily while the totals look healthy, because the long sessions' reads
pay for the cache overall.

```
  ! chat on Claude Opus 5: 12 of 42 conversations ended after their first
    turn and spent $6.25 writing a cache that nothing in this log ever read.
```

The figure is stated with the precision the provider's cache actually allows:
it is keyed by **prefix**, not by conversation, so another session sharing the
prefix within the TTL could have read those writes and the log cannot see
whose write a read hit. With reads anywhere in the slice, the figure is a
**ceiling, named as one**. With zero reads, the ceiling collapses into a fact,
said loudly: those writes bought nothing. Needs only `session` on the records
— no clock — and the session key is grouped by and never shown, as everywhere.

Both findings reach every rendering: terminal, `--markdown-out` (the window
stated as you typed it, the undated count as a loud blockquote), `--json`,
the MCP's `profile_usage` (which gains `since`/`until` under the same rules),
and the web Bill tab.

---

## 1.13.0 — "The bill learns to say no"

**The profile stops being a report you read and becomes a check that can fail
your build.** Two flags, two exit codes:

```
trazum profile usage.jsonl --max-usd 50
trazum profile usage.jsonl --against last-week.jsonl --max-growth-usd 10
```

`--max-usd` exits 1 when the log spent more than its budget. `--max-growth-usd`
exits 1 when the bill grew past the limit against the previous log — and used
alone it is an error, because a growth gate with nothing to grow *from* would be
a flag that silently gates nothing. Both fire under `--json` too: CI reads the
exit code there, and a gate that only worked in the human rendering would be a
gate that CI never sees. No period is assumed by either — the gate is over what
the log records, and the span line says what that was.

**The same gates run in the GitHub Action.** Hand it a `usage-log` instead of a
`target` and it gates the spend itself rather than the tokens about to be spent
— report in the run summary, a failing gate still writing it. Self-tested in CI
with hand-checkable arithmetic: a $5.00 log passes a $9 budget, a $15.00 log
fails it, +$10.00 growth fails a $5 limit.

### The most expensive day

The report names the peak day against the **median** day — a mean would let the
spike inflate its own yardstick — loud only past twice it, with the label that
drove it when there is more than one:

```
  ! 2026-08-09 spent $31.20 across 41 calls — 4.2x the median day ($7.41).
    Biggest that day: batch-eval ($24.80).
```

Exact per-record dollars per UTC day: each day's figure is the delta that day's
records added to the total, so the day arithmetic can never drift from the bill.

### `--label`, the drill-down

Once the full report has named a suspect, the same command profiles that
workload alone — every section, the gates included, over one label's calls.
A label that matches nothing is an error naming the labels that exist, never a
silent report over zero calls that would read as "this workload is free". With
`--against`, both logs are filtered, so the comparison stays one workload. The
MCP's `profile_usage` gains the same `label` under the same rule.

### Everywhere the bill renders

The clock reached `--markdown-out` (span, peak day, TTL verdicts, failing ones
loud) with the gap and day helpers shared between renderings so they cannot
drift. The web Bill tab draws spend per day — a bar per UTC day, plain divs,
the peak in the warning colour — and takes a **second log** to render the
comparison in the browser: sign convention stated before the first figure,
drivers over the union of labels so appeared and vanished workloads are named,
zero network requests, verified in a real browser. Output shapes gain the
max_tokens ceilings (`medianWithinTokens`, `p95WithinTokens`): the histogram
ceiling at least half and 95% of measured answers fit within, `null` for the
open-ended bucket rather than an invented number.

---

## 1.12.0 — "The log gets a clock"

**One field, and the single most common reason a cache loses money becomes
visible.** Add `ts` to the usage record — ISO 8601, an epoch number, or the
`created` OpenAI already returns — and `trazum profile` reads the clock.

### Does the cache TTL fit how fast the turns come?

```
  ! chat on Claude Opus 5: turns arrive a median of 9m apart and the 5-minute
    entry is gone by then — writes expire before the next turn reads them,
    which from the bill is a cache that only writes.
```

A cache entry lives 5 minutes, or an hour at 2x the write price. Whether either
is right depends on how long the workload waits between turns — and a support
flow whose users answer in nine minutes writes a 5-minute entry on every turn
and reads it back on none. `cacheEconomics` could say *that* money was lost;
the clock says *why*, and the why decides the fix: the 1-hour TTL, or caching
switched off.

The opposite mistake is quieter and visible nowhere else: turns seconds apart
paying the 1-hour rate. Those writes work — the cache verdict reads `paid-off` —
and every one pays 2x input for endurance the gaps never use. **Switching them
to the 5-minute TTL is priced exactly**: the same tokens at the other published
rate, the same counterfactual line `cacheEconomics` draws.

The gap is the **median between consecutive turns of the same conversation**,
sorted by the recorded clock so the answer is independent of the order of the
log. Five states — expires, overlong, unsettled when the unrecorded TTL decides
it, fits said out loud, and could-not-be-measured over writes with no clock —
because "no data" and "fine" are different answers.

### The span, stated and never extrapolated

`This log covers 2026-08-01 → 2026-08-14 (13.0 days).` The span makes your own
monthly arithmetic valid; a per-month figure from a partial month would be
Trazum doing the guessing it exists to end. When only some calls carry a clock
it says how many, so a span over a slice is never presented as the period.

Everything renders in the CLI (English and Spanish), the MCP `profile_usage`
tool and the web app's Your bill tab, and rides `--json` as `span` and
`cacheTtlFit`. The recording recipe gains `ts` everywhere it is written, and
the fixture that pins the docs against the tool now proves that following the
recipe produces a report that asks for nothing more.

## 1.11.0 — "What actually moves the bill"

**This release exists because the fairest complaint anybody has made about Trazum
was right.** On a company spending €20,000 a month, the rules recovered about €200 —
1%, measured: three tokens out of three hundred and six on an ordinary support
prompt. Nobody installs a tool for €200.

The number was never wrong. **Shortening the prompt was never where the money was**,
and the tool that only did that had no figure anywhere for the places it is.

| lever | what it moves | before |
|---|---|---|
| which model the call goes to | Opus 5 → Sonnet 5 is **40%** off; → Haiku 4.5 is **80%** | unpriced |
| the Batch API | **50%** flat | unpriced |
| what re-sending the conversation costs | **58%** of a modelled agent bill | invisible |
| whether caching paid for itself | can be **negative** | unanswerable |
| shortening the prompt | **~1%** | the whole product |

### `trazum profile` now prices the levers that are not the prompt

```
What would actually move this bill

  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50

  For comparison: shortening the prompt text can touch $22.80 at the very
  most — 70.9% of this bill, and only if you deleted every input token.
```

On a modelled estate — a classifier, a chat and a RAG workload — the levers came to
**80% of the bill**. Every figure is arithmetic on tokens that were billed: the same
counts at another model's published rate, the same tokens at the provider's batch
multiplier. Nothing modelled, nothing extrapolated.

The options on a slice are **combined and never summed**: batching a routed call
discounts the cheaper model, so the pair is $16.80 and not the $23.10 an addition
gives — against $21.00 that slice had ever spent. A route prints the command that
tests it rather than a recommendation, and steps down **one** capability rung rather
than to the cheapest model on the shelf.

### `trazum route` measures whether the cheaper model still does the job

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).
  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.
  ✓ HOLDS — the difference is inside the original model's own noise.
```

**The yardstick needed no inventing.** `eval` already ran a prompt twice to measure
the model's own run-to-run variance; routing is the same measurement on a different
axis. A route is safe when the cheaper model agrees with the original *more closely
than the original agrees with itself*, and any other bar would be a number somebody
chose. Three calls per case, and it calls nothing without `--yes`.

### What re-sending the conversation costs

A chat or agent workload sends the whole conversation back every turn, and on an
agent bill that growth is routinely the largest single line. Nothing here could see
it — a prompt file shows the system prompt, not the history.

Add `session` (or `conversation_id`) and it is measured as a **ceiling**: what the
workload would have cost if every turn had cost what its own first turn cost. The
subtraction is exact; the split between re-sent history and the user's own new
messages is not knowable from counts, and inventing one would be the flattering
direction.

**Trazum never prints the session key.** In a real log it is an account id, a ticket
number or an email address. It groups calls and counts turns; tests assert the value
appears nowhere in the report or in `--json`.

### Did the caching pay for itself?

The rest of Trazum tells you to cache. This is the one report that can say the
advice was wrong for a workload — a cache write is 1.25x plain input, or 2x at the
one-hour TTL, so a prefix that changes faster than it is reused pays a premium and
returns nothing. **The cache hit rate cannot tell you**: it reads 97.8% on a log
where one of two workloads is burning money.

When the log did not record which TTL a write used, the report says the question
cannot be settled and gives both figures rather than the flattering one. That
assumption moves the verdict, not just the total: between 0.28 and 1.11 reads per
write the same calls pay for themselves at 1.25x and lose money at 2x.

### The bill as a watched metric

`trazum profile --against previous.jsonl` compares two logs and ranks what drove
the difference, with the convention stated before the first figure: positive
means the bill grew, both files are exactly what they hold, and no period is
assumed. `--markdown-out` writes the whole profile as markdown for a PR comment
or a dashboard.

Three more findings from the same log. **Answers cut off mid-generation** are the
one slice of a bill that is waste without a counterpart — paid in full,
frequently retried, billed again — and the report prices them from `stop_reason`,
with "not recorded" kept distinct from "none truncated". **Where the output spend
concentrates**: six per cent of calls holding half the output spend is a tail
with a cause; forty-five per cent is a task whose answers are long — and the
total cannot tell them apart. And **conversation growth** now anchors on the
smallest turn by tokens, after billing noise at cache rates was caught reporting
77.5% fake growth on a flat conversation.

### `labels` in the config close the cache loop

Map a usage-log label to the prompt file it sends —
`{ "labels": { "support-rag": "prompts/support.txt" } }` — and `profile` reads
the file when that label's cache lost money, and says *why* it fails: a stable
prefix below the model's cache minimum (setting `cache_control` there does not
error, it simply never caches), stable tokens stranded behind the first
placeholder (`trazum optimize --reorder` moves them), or a healthy prefix, which
points at byte-identity instead. Every diagnosis carries "as it is today — the
log may predate it".

### The bill in the browser, and for agents

The web app grew a **Your bill** tab: drop or paste a usage log and read the
whole profile — parsed entirely in the browser against the bundled catalogue.
**Nothing is uploaded**: there is no fetch in that component, a test fails if one
appears, and the analytics event carries two booleans. And `@trazum/mcp` grew
`profile_usage`, the same report for an agent — the log passed as text, never a
path, with a test feeding a customer-named session key through to assert no
fragment of it comes back out.

### Ten faults found by adversarial review, and five by using the tool

Sixteen agents over four lenses, every finding handed to an independent verifier
told to refute it. Everything that survived flattered the bill. The worst inverted a
verdict — `Caching took $0.1000 off this bill` where the truth was a **$3.65 loss**.

And five more found by running the thing as a new user would rather than reading it:
`optimize` reported 1% and never said where the rest was; `Context window: 0.0% →
0.0%`; a named scenario answered with a hint to name it; `unlabelled` reported as
though it were a workload; and `1 calls`.

Twice in that pass the existing code or an existing test was right and the change
was not, and the change was reverted. That is the system working.

### Note on provenance

Like 1.8.0, 1.9.0 and 1.10.0, check `docs/releasing.md` before tagging: the trusted
publisher refused this workflow on three separate tags, and a release that goes out
by hand carries **no provenance attestation**. The workflow now tells a shipped
release apart from a version collision, so tagging one no longer fails and no longer
blames authentication for it.

## 1.10.0 — "Every hard edge, both sides"

> **This release has no provenance attestation.** It went out by hand, like 1.8.0
> and 1.9.0 before it — the trusted publisher refused this workflow on three
> separate tags, and the diagnosis in 1.9.1 turned out to be right about *that it
> was refusing* and unable to say why. So these tarballs are not signed by the
> workflow, and you cannot verify from npm alone that they were built from this
> commit. The release workflow now tells a shipped release apart from a version
> collision, so tagging one of these no longer fails and no longer blames
> authentication for it.

**If you use Trazum, this release changes the number beside every token count.**
The published error band is `±10%`, down from `±15%`, and it is the fourth value that
figure has had — the first three were a guess, a measurement, and a fix. This one is
a measured worst case with deliberate room left over.

### The estimator got more accurate on CJK, for free

Every CJK character was charged one token. Measured against Anthropic's counting
endpoint that put Japanese at **+11.2%** — the worst error in the whole corpus —
while Chinese sat at **−3.2%** under exactly the same rule.

One constant could not be right for both, and the samples say why: the Japanese file
is 58% kana, the Chinese one is 0%. Kana are a small syllabary in every sentence, so
the merge table covers runs of them. Han are tens of thousands of rare characters it
cannot cover.

| | before | now |
|---|---:|---:|
| Japanese | +11.2% | −1.5% |
| Chinese | −3.2% | +1.3% |
| **worst in the corpus** | **11.2%** | **6.4%** |

No new API calls were needed. The finding was sitting in the twenty-one measurements
already committed, which is worth saying because the previous two band changes both
cost a key.

**The band is 10 and the worst measurement is 6.4, on purpose.** Twenty-one samples
across six text types cannot bound a seventh — there is no Korean here, no Cyrillic
prose, no mixed-script document. A band that becomes false the first time somebody
measures something new is the fault this whole exercise was fixing.

### Three advisories were stating predictions as facts

Trazum compares token counts against thresholds that are absolute — a model's
cacheable minimum, its context window — while the counts carry a ±10% band. Three
findings got that wrong, in both available directions:

- **`cache-prefix-reorder` offered money that could not be collected.** It priced
  moving stable content into the cacheable prefix without checking the prefix that
  would build clears the minimum. On a 306-token prompt against a 512-token minimum
  the best possible prefix is 302 — nothing caches at any ordering — and it offered
  **$48.67 a month**, in the same report as another finding saying caching would not
  work here at all.
- **`prompt-caching` hedged below the line and promised money above it.** An
  estimated 528-token prefix can truly be 475, and then nothing caches and the figure
  beside the advisory is not there.
- **`context-overflow` said "the call will fail" as a certainty** — and said nothing
  at all when an estimate that fitted might really not. That silent case is now
  `context-near-limit`, the fourteenth finding, and it is the more dangerous of the
  two: a prompt over the window fails outright rather than degrading, so there is no
  partial result to notice.

### And the advisory tells you the command now

`cache-prefix-reorder` described the rearrangement in prose and left you to do it by
hand, while Trazum had `--reorder` all along — whole blocks only, refusing anything
that refers back to earlier text. On a 1,355-token prompt it takes the cacheable
prefix from **13 tokens to 1,350**.

### What stops it happening again

Fixing one fault three times is evidence it will recur, so there is now a guard that
asserts the property rather than the instances: for every model in the pricing
catalogue, no token count near a threshold may produce an unqualified claim, and
**silence counts as a failure** rather than a pass. Eighteen models, four cacheable
minimums, six context windows, all derived — a model added later is covered without
anybody remembering to.

---

## 1.9.1 — "The preflight"

**Maintenance, and the point of it is that the next release publishes itself.**

1.8.0 and 1.9.0 both went out by hand — the first because the packages did not
exist yet, the second because the trusted publisher had not been configured — so
neither tarball carries provenance. Nothing in the repository could tell you in
advance which way a tag would go, so 1.9.0 found out by spending the tag.

Two questions get asked before anything is at stake now, and a dry run from the
Actions tab can answer them without spending a version:

- **Will npm accept this workflow's identity?** Asked against npm's token
  exchange, once per package, because the setting lives on three separate pages
  and doing two of them is the easiest mistake available.
- **Is any of these version numbers already spent?** npm never reuses one, and
  the packages publish in dependency order — so without this, core uploading and
  the CLI failing costs the whole set a version.

**One honest caveat.** The endpoint behind the first question is not documented;
how to call it was worked out by probing. A refusal can therefore be the check
being wrong rather than your settings, and it cannot tell those apart — so it
says so and never blocks a release. Only a tag settles it.

Also: `E404 Not Found - PUT` from npm is an authentication failure, not a missing
package. The workflow explains that itself now instead of leaving it in a
document you would have to already know to read.

**Nothing in the library, the CLI or the reports changed.** If you are not
releasing Trazum, this version is identical to 1.9.0 for you.

---

## 1.9.0 — "The error band, measured"

**Trazum was under-reporting what your prompts cost, and now it does not.**

Every report printed `±15%`, every dollar figure descended from it, and nothing
had ever checked it. Measured against Anthropic's official counting endpoint, it
was false: nine of eleven samples underestimated, the worst by 30.6%.
Underestimating tokens under-reports cost — the flattering direction, and the
worst one for a tool whose whole argument is honest cost accounting.

**If you use Trazum on anything other than English, this release changes your
numbers.** The estimator turned out to be calibrated for English specifically:
German came out 37.3% under, Dutch 28.3%, Italian 23.8%, Spanish 22.9%,
Portuguese 18.1%, French 15.1% — against English at +1.0%. It now detects the
language and counts accordingly, and the figures it gives you go **up**, because
they were too low.

| language | before | now |
|---|---:|---:|
| German | −37.3% | +1.3% |
| Dutch | −28.3% | −2.1% |
| Italian | −23.8% | +2.0% |
| Spanish | −22.1% | +3.1% |
| Portuguese | −18.1% | −5.7% |
| French | −15.1% | +0.4% |
| Numeric-heavy text | −30.6% | −5.0% |

The band is still `±15%`, and that is a coincidence rather than a restoration:
the old one bounded nothing, and this one bounds **twenty-one measured samples
across seven languages and six text types**, worst case 11.2%. Every language has
a held-out sample in a different register, so the calibration fits a language
rather than a template.

**`trazum baseline`** records what a repository's prompts cost, to a file you
commit. `trazum check` then fails the build when the estate drifts past it — the
question a per-file budget cannot answer, because a repository at 95% of every
budget passes forever while a pull request adds four hundred tokens across a
dozen files. Thresholds are in tokens, never dollars: a repriced model would
otherwise fail a build for a change nobody made.

**The pull-request comment leads with what the branch costs**, not with a table of
which files fit their ceilings. No change to the Action was needed.

**One advisory was giving wrong advice.** `below-cache-minimum` compared an
*estimated* prefix against a hard 512-token threshold and told you caching would
not work. Near the line an underestimate made that false, and it cost the reader
the largest saving Trazum offers. It hedges there now and names `--exact-tokens`,
which is free.

**If you want exact numbers, they are free.** `--exact-tokens` uses the official
counting endpoint, which does not run the model. On non-English prompts it remains
the honest choice; the band above is what the heuristic gets you without a key.

## 1.8.0 — "Everything it had only been pricing" (the first publish)

Trazum 1.0.0 could tell you what a prompt cost. It could not tell you **which**
prompt, **who** made it expensive, whether the shorter version still worked, or
what to do about any of it. That is what everything since has been about.

Twelve commands now, up from four.

### What's new

- **`trazum prune` — which few-shot examples earn their tokens, measured.** Removes
  each example in turn and checks whether any answer moves further than the model
  already moves on its own. It is the only command that asks before spending — the
  bill is `(2 + examples) × cases`, printed before a provider is even looked up —
  and it reports "no effect on these inputs", never "delete this". Nothing is
  edited.

- **`@trazum/mcp` — Trazum as an MCP server, so an agent can budget its own
  prompts.** Three tools over stdio (`check_prompt`, `optimize_prompt`,
  `list_models`), running on your machine like the CLI: no service, no prompt
  leaving the box. The JSON-RPC layer is written by hand because every published
  package here carries zero runtime dependencies — and an MCP server reading
  model-supplied text is the last place to relax that.

- **`trazum doctor` finds preambles that could share a cache entry and do not.**
  Prompt caching matches bytes, so twelve prompts assembled from the same preamble
  — identical except a trailing tab and a stray capital — occupy twelve cache
  entries and share nothing. Each file is individually fine, which is why no
  per-prompt analysis can see it. No dollar figure, deliberately: pricing it would
  mean inventing how your calls spread across the group.

- **An advisory for a schema the request could carry instead of the prompt.**
  `Output format:` followed by a fenced JSON block costs those tokens on every
  call; every major API now takes the same shape as a request parameter, where the
  decoder is constrained rather than persuaded. Cheaper and stricter both — the
  rare finding that is not a trade-off. Trazum reports it and never edits it,
  because it is a change to the call, not the prompt.

- **LLM-agnostic, for real.** `openai` in `TRAZUM_LLM_PROVIDER` is a wire format,
  not a company — point a base URL at OpenRouter, LiteLLM, Groq, Together,
  Fireworks, DeepInfra, DeepSeek, Mistral, Ollama, vLLM or LM Studio and it works.
  Native providers for Anthropic and Gemini, and `bedrockProvider` /
  `vertexProvider` with SigV4 and the service-account JWT signed by hand on
  WebCrypto, because the AWS and Google SDKs are two hundred packages between them
  to authenticate one request. Live prices via an OpenRouter overlay, with every
  fact the feed does not carry marked `unknown` rather than guessed.

- **A real Content-Security-Policy on the web app.** A 128-bit nonce per request,
  `strict-dynamic`, no `unsafe-inline` in `script-src` — verified against a built
  server: nine of nine script tags carry the nonce, and deleting the one
  easy-to-miss line (the policy must ride the *request* headers too) gives nine
  tags and zero nonces.

- **A `.pre-commit-hooks.yaml`** for teams who manage hooks with the pre-commit
  framework, and **automatic recovery from container rollbacks** for anyone
  developing this repository in an environment that restores stale disk snapshots
  — which this one did, more than twenty times.

- **`--suggest` stops paying for answers it already has.** Add
  `--cache-suggestions` and a prompt that has not changed since the last run is
  answered from disk instead of from the model — re-run over forty prompts after
  editing two, and thirty-eight requests do not happen. It is off unless you ask,
  and it says out loud every time it uses a cached answer, because a cached
  answer is what the model said last week and a model is not a calculator. What
  gets stored is the model's raw reply, so every safety check runs again on the
  way out: a suggestion cached in March is still checked against your prompt in
  April by April's rules. Seven days, files nobody else on the machine can read,
  and `trazum --clear-suggestion-cache` when you want it gone.

  The honest footnote: this was meant to be the API's own prompt caching, and
  that turned out to be impossible rather than difficult. The API will not cache
  a prefix shorter than 512 tokens, our suggest instructions are 291, and a
  prefix that is too short is not cached *and does not tell you* — it just
  quietly costs full price. One line of code, zero saving, no way to notice.
  There is now a test that measures the prompt against every model's published
  floor, so if that ever changes we find out from a red build rather than from a
  comment nobody re-checked.

- **A badge for your README.** Every share link is also `/badge/<token>.svg`:
  the token change, in an image you can paste into a repository's front page. It
  is **recomputed every time it loads**, so it follows the prompts instead of
  freezing a number from the day somebody made it — which is the failure mode of
  every hand-written "saves 30%" line in every README. Revoking the link revokes
  the badge, because there is only one thing to revoke. An unknown, expired or
  revoked token renders the same neutral badge rather than a broken image, and
  no character of anybody's prompt ever reaches the picture.

- **A deployment overview for whoever runs it.** `/admin` adds up every prompt
  saved on the instance and says which ones are worth an afternoon — and it is
  careful about what it claims. It is **not** a spend report: Trazum has never
  seen a bill or an API call, so the headline is input tokens, the second figure
  is what running the rules would remove, and there is no score anywhere,
  because a number nobody can reproduce by hand is a number nobody can argue
  with. It shows prompt names and never prompt text: an admin is an operator,
  not an auditor of what their colleagues wrote. Off unless `TRAZUM_ADMINS` is
  set, and off means the page does not exist rather than refuses.

- **Share links: send a colleague what the edit cost.** A comparison published
  at an unguessable URL that anyone can open without an account, which is what
  "share" has to mean and is also the only thing in Trazum that serves one
  person's prompt to a stranger. So it says what it does **before** the button,
  not after: *this publishes both prompts to anyone who has the URL.* Links
  expire in thirty days unless you pick otherwise, can be revoked, and are kept
  out of search engines two independent ways. Reading one writes nothing —
  no view counter, because an unauthenticated request that can cause a write is
  a lever and a view count is not worth being one. And nothing derived is
  stored, so a link opened next year is priced by next year's rules.

- **A prompt library, with every version you ever saved.** Signed in, Trazum
  keeps your prompts and the whole history of each — because the question worth
  asking about a prompt is not what it costs today, it is what last month's edit
  did to it. History is append-only: saving over a prompt writes a new version
  and never rewrites one, and a save that changed nothing writes nothing and
  says so rather than filling the record with identical rows. Token counts are
  recomputed on read rather than stored, so two versions saved a year apart are
  actually comparable instead of being priced by two different estimators.
  Somebody else's prompt answers **404, never 403** — a 403 confirms the id
  exists — and the store has no lookup that takes an id without an owner, so
  that mistake cannot be written rather than merely not being written.

- **Sign in with GitHub — and the app is unchanged if you don't.** Accounts are
  off by default; a deployment with no GitHub app configured is the anonymous
  tool it always was, with no button and no database. Turn it on and Trazum
  remembers who you are, which is what a saved prompt library and a shared
  budget need to exist at all. It asks GitHub for `read:user` and nothing else
  — no repositories, no email, no write anywhere — and **never stores the
  access token**: it is exchanged, used once to read your login, and dropped.
  Session cookies are 256 random bits stored only as their SHA-256, so a
  database dump is a list of hashes rather than a list of live logins. Any
  Postgres will do; without one, sessions live in memory and the header says
  "temporary session" instead of letting you discover it.

- **`--reorder` — the saving Trazum had been pointing at for months.** Prompt
  caching is a byte-for-byte prefix match, so a stable instruction sitting
  *after* your first placeholder is re-read at full price on every single call.
  The advisory had been saying so since 0.2.0 and no command could act on it.
  Measured on a real 1,178-token support prompt: **14 tokens cacheable as
  written, 1,046 after.** It moves whole blocks, never sentences, and refuses
  the moment a block points backwards — because "summarise the text above" is
  correct where it sits and nonsense in front of the text.
- **`trazum rank <dir>` — which of your forty prompts to fix first.** Sorted by
  what optimising each one would actually recover, measured by running the rules
  rather than evaluating a formula. There is deliberately **no complexity score
  out of a hundred**: a number nobody can reproduce by hand cannot be argued
  with, and the weights that produce it get quietly tuned until the ranking
  looks right, which is fitting the metric to the answer. You get the
  measurements and a definition for each.
- **`trazum blame <file>` — who made this prompt expensive.** Git blame for
  tokens. Git already knows who edited a prompt and when; it does not know that
  three lines added to a system prompt at 50,000 calls a month is a bill rather
  than a diff. Now both facts are on the same line, with the single worst commit
  named.
- **Both of them post to pull requests.** `--markdown-out` was on `check` and
  `diff` only, so the two commands that answer *which prompt is worth an
  afternoon* and *who made this one expensive* could not put their answers where
  those decisions get made. They can now.
- **`optimize --suggest` — rewrites you can judge one at a time.** The LLM pass
  used to be all-or-nothing in both directions: fail one safety check and you got
  nothing, pass it and you got a wholesale rewrite to read end to end. Now it
  proposes phrases — `You should always make sure to → Always` — and each one is
  checked against your prompt before you see it. Eight surviving out of ten is a
  useful morning. A wholesale rewrite that failed one check never was. On the web
  as two switches, with the proposals listed above the saving rather than under
  it.
- **`eval --export promptfoo` — your assertions, not ours.** `trazum eval`
  measures whether the model still says the same thing, which is the question
  Trazum is qualified to ask and emphatically not the one you need answered
  before shipping. Yours is whether the classifier still hits 94%. So this builds
  the suite where the only variable is the prompt and leaves `assert` blank on
  purpose. Needs no API key and makes no call — the entire point is handing the
  run over.
- **`trazum where` — which model is this prompt actually going to?** Reads the
  code instead of guessing: a marker beats a quoted model id beats a base URL
  beats an SDK import, and it shows you the evidence with line numbers. A base
  URL beats the SDK it was pointed at, because DeepSeek, Moonshot, xAI and Groq
  all speak to the OpenAI client.
- **Prompts where they actually live.** `// trazum:prompt name` above a template
  literal, and `check`, `optimize`, `rank` and `blame` all read it out of your
  TypeScript instead of asking you to keep a copy in a `.txt` file that drifts.
- **Nine providers' prices, not one.** OpenAI, Google, Moonshot, DeepSeek, xAI
  and Mistral join Anthropic. The data was the easy half — see Fixed.
- **A Compare tab on the web — "what did this edit cost?"** Paste the old version
  and the new one and get the token delta, the monthly figure, and which problems
  the edit introduced or resolved. Every number is *after minus before*, so
  **positive means worse**, which is the opposite of everywhere else in Trazum —
  and the page says so above the figures rather than beside them, because somebody
  arriving from the other tab has the opposite convention already loaded.
- **`trazum diff`, `trazum eval`, directory mode, `trazum.config.json`, a GitHub
  Action** that comments on pull requests, and a **web app** rebuilt on
  shadcn/ui that kept its own palette rather than adopting the one every other
  application built from that registry is wearing.
- **On a subscription, no dollar figures.** Running inside Claude Code or Cursor,
  Trazum reports tokens and context-window headroom and says nothing about money,
  because there is no per-call bill to reduce and arithmetic about tokens dressed
  as dollars is just a wrong number with a currency symbol.

### Fixed

- **`optimize src/prompts.ts` rewrote your source code.** The capitalisation rule
  turned `import OpenAI` into `Import OpenAI`, which does not compile, and with
  `-o` it wrote that back over the file. It also counted your imports as tokens
  you pay a model for, and priced a file that plainly calls OpenAI against Claude
  Opus 5. This was the **default** behaviour. It refuses now, and tells you how
  to mark the prompt.
- **`--reorder` had no safety at all outside English and Spanish.** Not a missing
  feature — a silent failure. The backward-reference list was one flat
  English/Spanish array applied to every prompt, so a French, German,
  Portuguese, Italian, Dutch, Japanese or Chinese author got **none** of the
  refusals the whole design rests on. `Résumez le texte ci-dessus` was cheerfully
  hoisted above the text it points at and reported as a saving. Every test passed
  throughout, because every test asked the question in the two languages that
  worked. Seven languages added, plus a fourth refusal for the scripts still
  missing: a prompt with Cyrillic, Arabic, Hebrew, Hangul, Devanagari, Thai or
  Greek in it is not rearranged at all, and the report says which script stopped
  it.
- **Three providers were offered a batch discount that cannot be bought.** Kimi,
  DeepSeek and Grok have no batch API. The cost multipliers were global
  constants, so all three were quoted 50% off — **$139 a month** in the test that
  caught it. And Mistral, which has no prompt caching, was offered **$100 a
  month** of caching, because a zero cache minimum satisfies `0 >= 0`.
- **The batch saving was computed as `cost × discount`**, which is the saving only
  when the discount is exactly 0.5. Correct on Anthropic by coincidence, wrong on
  the first provider with any other rate.
- **It told Claude users to switch to `gpt-5-nano`.** The cheaper-model advisory
  searched every provider. Dropping from Opus to Sonnet is one line; changing
  vendor is a migration. Scoped to your own provider now.
- **A validated URL and a fetched URL were two different expressions.** The SSRF
  filter checked `baseUrl` and then fetched `` `${baseUrl.replace(/\/$/, '')}` ``
  — so nothing on the path from option to `fetch` was actually a barrier. CodeQL
  kept the alert open and was right to, twice. The check returns the value to use
  now, and the real fix went further: the web app's request body no longer
  **names** an endpoint at all, it **selects** one the operator listed. A host
  filter reads a name, and a name an attacker registered resolves wherever they
  like.
- **`fetch` follows redirects, which quietly voided the entire host filter.** A
  perfectly valid endpoint could answer `302 Location: http://169.254.169.254/`
  and the request went there anyway, `authorization` header included. One HTTP
  response. Every server-side call now refuses redirects.
- **The token counter sent your API key to an unvalidated URL.** Both providers
  had been hardened twice over while `countTokensAnthropic` sat wide open,
  because it is called a counter rather than a provider.
- **A security fix shipped with no reviewable diff.** `measure-token-band.mjs`
  used a raw NUL byte as a hash separator, which is enough for git to call the
  file binary. Three commits rendered as `Bin 7652 -> 7654 bytes` — including the
  one that fixed an SSRF finding **in that file**. It built, it ran, it passed
  every test, and nothing anywhere mentioned that a security fix had gone through
  unread.
- **The alert gate failed the merge that fixed both alerts.** It ran one second
  after starting, a full minute before the CodeQL analysis it reads had uploaded
  anything, and reported two findings at line numbers that no longer existed. A
  red build for a fix that worked is how people learn to re-run until green.
- **`--tokens-only` on GitHub Actions announced that "GitHub Actions bills by
  subscription".** It does not. It bills by the minute.
- **The README recommended `@v1.0.0`, a tag that never existed.** The test written
  in that same pull request only required `#\s*v?\d`, so it passed.
- **A renamed prompt reported no history before the rename** in `blame`. The data
  was there under the old name; the report said there was none.
- **`--limit` was silently ignored** — accepted by the command, never registered
  as taking a value, so every run walked the default 20 and said nothing.
- **`applySuggestions` on its own returned a `200` and applied nothing.** A full
  report, no error, the prompt untouched, and the one thing the caller asked for
  had quietly not happened. The source looked right — the field parsed, the guard
  around it was correct, and the branch that would have used it was never
  entered. It took sending the request. A `400` now, refused before any call to
  the model, so a malformed request never costs one.
- **Two quadratic passes.** One took 13.9 seconds on a large prompt; the other
  took **31**. Both found by hostile-input tests rather than by reading.
- **The results panel in the web app rendered blank.** It waited for an
  `IntersectionObserver`, and anyone who scrolls down to reach the button gets
  their result mounted above the viewport. A 214px card at zero opacity, showing
  nothing, on the page whose job is showing you the answer.

### Changed

- **`ModelPricing.tier` is deprecated in favour of `capability`** — `small | mid |
  large | frontier`. Telling somebody on Kimi that their task "looks like haiku
  complexity" is a label meaning something other than what it says. `tier` keeps
  working for all of 1.x.
- **The report stops claiming a Claude-calibrated band for models it was not calibrated on.** The
  estimator is tuned against Claude's tokenizer, and printing a Claude band beside
  a GPT figure was a precision claim nobody had earned.
- **Money-only advisories are gone from `--tokens-only`.** Suppressing the price
  in the heading and leaving dollars in the prose underneath is not suppressing
  the price.

### Still honest about

The **band was a design target that had not been measured** when this shipped. It is printed on
every report and every dollar figure descends from it. The corpus, the harness and
the test are all written and waiting; the measurement needs the official counting
endpoint and a key, so it cannot happen inside this repository. Until somebody
runs it, the code says so out loud rather than passing quietly — which is the
whole disposition of this project in one sentence.

*Somebody ran it in 1.9.0, and it was false. See the notes at the top of this
file. This paragraph is left as it was written.*

---

## 1.0.0 — "A stable contract"

The API froze. What `optimize` returns, what the rules are called, what counts as
a breaking change — all of it written down in [VERSIONING.md](VERSIONING.md) and
tested rather than intended.

### What's new

- **Twelve deterministic rules**, offline and free, that cut politeness formulas,
  filler, hedges, shouted emphasis, decorative separators and repeated paragraphs
  — without touching code, URLs, template placeholders or XML tags, which are
  copied character for character. A restated output format is *reported* and never
  cut: the schema and the prose walking through it are both defensible, and which
  to keep is the author's call.
- **Two levels.** `safe` has no semantic risk. `aggressive` shows you exactly
  what it changed, phrase by phrase, because "read the diff" is not advice you
  can follow on a diff of everything at once.
- **Advisories for the savings that dwarf trimming** — prompt caching, the batch
  API, whether the task needs the model you picked, and the one nobody wants to
  hear: that your cost is usually in the *output*, and shortening the prompt has
  a low ceiling.
- **`check --max-tokens`** as a CI gate, and **`--exact-tokens`** against the
  official counting endpoint for figures you can actually budget from.
- **English and Spanish**, where a locale changes the report and never the
  optimisation. Same prompt, same output, same advisory ids, whatever language
  you read them in.
