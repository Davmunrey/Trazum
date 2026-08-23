# The plan through 1.62 and 1.63 — held to its own standard, then measured

Two arcs, following [1.61](plan-1.61.md). Under the numbering adopted at 1.50.1
the chapters of an arc in progress are patches: **the 1.62 arc runs as 1.61.x
and closes at 1.62.0; the 1.63 arc runs as 1.62.x and closes at 1.63.0.** The
ordering is a commitment; the calendar is not.

This file is written **before the code**, and it exists because of a stress
session that found six real defects in an afternoon — every one of them the
same shape: **an input nobody had tried, taken quietly.** The list is in the
first chapter below, because a plan that hides its origin is a plan rewritten
in hindsight.

## The 1.62 arc — its own output, held to its own standard

### The thesis

1.61 closed on a claim: *a prompt this tool cannot improve*. The stress session
turned that lens around and asked whether **`optimize` holds itself to it** —
and it does not: on 1 input in 4,000, running `optimize` on its own output
saves more tokens. `emphasis` strips `IMPORTANT:` and leaves two lines equal
but for a space; `whitespace` has already run, so `duplicate-lines` never sees
the pair it would have caught. The tool that grades the writer's output does
not survive its own grading.

And money went negative. `spend_guard` — the one tool that changes what a model
does — accepts `outputTokens: -500`, prices the call at **−$0.0075**, and says
**yes** to a budget it should have refused. An agent that lies about its output
tokens buys itself an approval. The same hole, smaller, in three other doors.

The arc: **any input, and every promise still holds.** Not by reading the
parsers — by fuzzing them, permanently, in the suite.

### The chapters, in order

**1. Nothing is ever negative money, and no door disagrees with its sibling.**
The six defects fixed at the layer that owns each:

- `guardSpend` refuses a negative or non-finite `outputTokens` — the false
  "yes" dies in core, not in the MCP wrapper.
- `assemble`'s measurement treats a budget that is not a positive finite number
  as no budget, and refuses negative `callsPerMonth`/`avgOutputTokens` — a
  negative monthly cost is a number no bill ever had.
- The CLI's `--cache-hit-rate` refuses what `usage.cacheHitRate` in the config
  already refuses: a rate over 1. **Two doors to the same value cannot disagree
  about what fits through.**
- `prompt_writer` validates in `run()` what its schema merely states —
  a schema the runtime does not enforce is documentation wearing a guard's
  clothes.
- A property test pins all of it: **no document this package can build carries
  a negative dollar figure, whatever the input.**

**2. The fixed point.** `optimize` runs its pipeline until a pass changes
nothing (bounded, and the bound is a named constant with a test that shows two
passes converging). Rule hits aggregate across passes; the diff and the savings
are computed against the final text. The property — `optimize(optimize(x))`
is byte-identical to `optimize(x)` — joins the suite over the fuzz corpus, at
both levels.

**3. The fuzz harness becomes a fixture.** Seeded and deterministic — same
seed, same verdict, on any machine — over a corpus of hostile atoms: RTL text,
CJK, lone surrogates, zero-width characters, control bytes, CRLF, unclosed
fences, 1MB tokens. Three properties per input: never throws, never grows
tokens, idempotent. **Every defect this arc found becomes an atom**, and every
future crash joins the corpus as its regression test.

**4. What a mask promises.** Code blocks, inline code and URLs must survive
`optimize` byte-for-byte. Asserted over the whole corpus rather than three
fixtures, because the corpus is where the lone surrogate sitting *inside* a
code span lives.

**5. Total over strings.** `profileUsage`, `conform` and `rollUp` never throw
on any text — they name what they could not read. The fuzzer already believes
this; the chapter makes it a stated property with the malformed-log corpus in
the suite, and closes the gap between "the fuzzer did not find a crash" and
"a crash fails the build".

**— 1.62.0 closes the arc**: the fuzz suite is a permanent CI fixture, the six
defects are regression atoms, and the release notes state the properties now
held: never throws, never grows, idempotent, masks intact, money never
negative.

## The 1.63 arc — scale is measured, not assumed

### The thesis

The stress session timed the pathological cases and the numbers were good —
1MB of prose in ~1s, a 200,000-line log in ~1.3s — **and nothing holds them
there.** A quadratic regex was shipped once (the 17-second line of spaces this
repository's own comments remember) and was caught by hand. The arc: the
ceilings become measurements the build is held to, the way token budgets
already are.

### The chapters, in order

**1. The bench.** A `bench` command that measures this machine, honestly —
shown here without its invocation on purpose: this repository's own guard
refuses any page that displays a command a reader cannot type today, and this
plan is written before the code. The pages show the invocation when it exists: the
standard workloads (1MB prompt at both levels, a 200k-line profile, a
10k-file walk, a 20k-line roll-up), wall time and peak heap, as a table and as
`--json`. No comparison, no judgement — a measurement a person can run before
and after a change. Deterministic workloads, generated, never committed.

**2. The relative gate.** CI machines lie about wall time, so the gate is a
ratio, not a clock: each workload is timed against a calibration loop run in
the same process, and the build fails when the ratio regresses past a stated
factor against the committed baseline. The baseline is re-recorded with a
command, like `trazum baseline`. **The risk is named now**: if CI variance
drowns the signal at any workload, that workload's gate is dropped loudly
in the release notes rather than left flaking.

**3. The refusal ceiling.** Above a stated input size, commands refuse with
the size and the limit named rather than grinding — the cap the web route
already has (400,000 characters), applied to every door with the same number,
and the number documented once. A flag raises it deliberately; nothing raises
it by accident.

**4. Memory holds a line.** The 25MB log profiles within a stated heap
ceiling, asserted in the suite. If it cannot, the parse goes line-streaming
and the ceiling is asserted after — the chapter is the ceiling, not the
implementation.

**— 1.63.0 closes the arc**: the bench exists, the gate is live for whichever
workloads proved stable, the refusal ceiling is uniform, and the release
notes publish this machine's numbers next to the promises.

## What stays out, and why

- **A fuzzer that runs forever in CI.** The suite gets a seeded, bounded run —
  minutes, not hours. An unbounded fuzzer is a job, and this repository has no
  scheduler to own it. Named here so nobody mistakes the bounded run for one.
- **Absolute wall-clock budgets in CI.** A "must finish in 800ms" gate on
  shared runners fails on weather. Ratios against in-process calibration, or
  nothing.
- **A worker pool / parallel optimisation.** The measurements do not justify
  it: 1MB in a second is not the bottleneck of a CLI run. Parallelism without
  a measured need is complexity on credit.
- **Fixing 1.54.0, 1.57.0, 1.58.0, or the writer's model-assisted polish.**
  Still blocked on credentials and a distribution decision; still named; still
  not faked.

## What would make these arcs a failure

Shipping a fuzz suite that has never failed. A guard is proved by breaking it:
every property lands **with** the defect it caught, or with a deliberately
broken build shown failing in the pull request that adds it. A suite that was
born green stays green when the property stops holding — that is the recurring
trap, and both arcs exist because of it.
