# The plan through 1.65, 1.66 and 1.67 — the paths, as far as code goes

Three arcs, following [1.64](plan-1.64.md). Under the numbering adopted at
1.50.1 the chapters of an arc in progress are patches: **the 1.65 arc runs as
1.64.x and closes at 1.65.0; the 1.66 arc runs as 1.65.x and closes at
1.66.0; the 1.67 arc runs as 1.66.x and closes at 1.67.0.** The ordering is a
commitment; the calendar is not.

This plan exists because the owner asked for the product's open-source paths
to be carried as far as they go. Two of those paths are partly **not code** —
a format becomes a standard when other tools adopt it, and adoption is
conversations — so this plan is explicit about the split: every chapter below
is buildable in this repository with no third party, and the halves that are
not code are named in "what stays out" rather than dressed up as chapters.

## The 1.65 arc — the format anyone can adopt

### The thesis

The interchange format is this product's best claim to being infrastructure:
eighteen documented contracts, parity-tested in both directions. But a tool
that wants to *emit* or *validate* the format today has two options — run
`trazum conform`, or reverse-engineer the prose — and only eleven of the
eighteen contracts can even be named to `conform`. A format is adoptable when
**checking a document requires nothing but the document**.

### The chapters, in order

**1. Every contract answers to its name.** The seven documented contracts
that `--contract` cannot name — the fleet document, the spend guard, the
first run, the pulse, the rule yield, the gateway refusal and the bench —
get names and detection, held to the same parity discipline as the eleven.
The claim "all eighteen are contracts" stops being narrower in the product
than it is on the page.

**2. The schema leaves the repository.** A `schema` command — shown without
its invocation on purpose; the pages show it when it exists — that emits a
JSON Schema for a named contract, so another tool can validate documents
with any off-the-shelf validator and **no Trazum at all**. The schemas are
authored, versioned with `schemaVersion`, and held honest the only way that
cannot rot: a two-direction test that every fixture `conform` accepts
validates against the schema, and every fixture `conform` rejects for a
*structural* reason fails it. A schema that disagrees with `conform` is the
two-doors defect wearing a file format.

**3. The producer's page.** `docs/format.md` grows the section a connector
author actually needs: emit-this-minimum, the additive-change promise
restated from the consumer's side, and where the schemas live. Derived
guards, not prose counts, same as the rest of that page.

**— 1.65.0 closes the arc**: eighteen names, exportable schemas, and the
release notes state the new claim plainly — a document can be checked
against this format by a tool that has never installed this product.

## The 1.66 arc — one policy, three doors

### The thesis

The product can already refuse: the gateway with an HTTP 402, `serve` with a
cost answer, `spend_guard` over MCP. But each door reads its own slice of
config, and the 1.62 arc's lesson was that **two doors to the same value
agreeing by coincidence is a defect waiting for its input**. An agent fleet
needs one policy — per label, per session, per day — stated once, enforced
identically at whichever door the call arrives.

### The chapters, in order

**1. The policy has one shape.** A `limits` block in `trazum.config.json` —
per-label, per-session and per-day USD ceilings — validated like every other
config key: a limit that is not a positive finite number is refused with the
reason, and an unknown key inside `limits` is named rather than ignored.

**2. The library judges it.** One function in `@trazum/core` takes the
policy, the measured position and a proposed call, and answers within-limit,
over-limit or cannot-tell — with the limit, the measured spend and the
denominator in the answer. The three doors call it; none of them re-derives
anything.

**3. The doors hold the line.** The gateway's 402, `serve`'s cost answer and
`spend_guard`'s verdict all carry the same judgement from chapter two, and
the suite proves the sibling-agreement property the hard way: the same
policy and the same call are pushed through all three doors and the verdicts
must match, field for field — then a door is deliberately broken to show the
property can fail.

**4. Refusal is legible.** Every over-limit answer names the limit, the
measured position and the period — a refusal an agent can log and a person
can audit. The waiver mechanism `check` already has applies here unchanged:
silencing a limit leaves a record.

**— 1.66.0 closes the arc**: one policy, three doors, and a test that would
go red the day any door starts agreeing by coincidence again.

## The 1.67 arc — the month ends on a measured position

### The thesis

The product refuses to forecast, and that refusal stays. But "refuses to
forecast" and "cannot say where the month stands" are different sentences:
the measured burn, the days measured, and the arithmetic distance to each
configured limit are all measurements — and today they are scattered across
`profile`, `budgetPositions` and `watch` rather than answerable as one
question.

### The chapters, in order

**1. The position, as one answer.** The measured month-to-date spend against
every configured budget and limit, with the denominator on every figure —
days measured, coverage, and the flat statement of what is *not* measured.
No projection anywhere: the number that says "at this measured rate the
limit is N days away" is division, labelled as division, and absent when the
rate has fewer measured days than the floor `measuredUsage` already
enforces.

**2. The position travels.** The same answer through the surfaces that
already exist — the JSON document (contract-checked, like everything), the
HTML door from 1.64, and the MCP server, so an agent can ask "how much room
is left" before it spends. No new daemon, no scheduler: `watch` remains the
thing that runs on yours.

**3. Shift-left ergonomics.** The pre-commit recipe in `docs/ci.md` becomes
runnable with less friction: `check` learns to read a list of files from
stdin — the shape `git diff --name-only` already produces — so a hook is one
pipe with no shell loop, refusals and budgets unchanged.

**— 1.67.0 closes the arc**: the month has a measured position, every
surface can state it, and a pre-commit hook is a one-liner.

## What stays out, and why

- **Adoption itself.** Getting gateways and proxies to emit this format is
  conversations with their maintainers, not code in this repository. The
  1.65 arc builds everything that makes those conversations cheap; it does
  not pretend to have them.
- **A forecast.** "At this rate, N days to the limit" is arithmetic on a
  measurement and says so. "You will spend X this month" is a guess, and the
  first doctrine rule forbids shipping guesses dressed as measurements.
- **A policy server.** The policy is a file in your repository, like the
  budgets and the baseline. A server that hands out policy is a deployment
  and an account — the product stays a tool.
- **The blocked arcs.** 1.54.0 and 1.57.0 (provider credentials), 1.58.0
  (a distribution decision), the writer's model-assisted polish — still
  named, still not faked.

## What would make these arcs a failure

A schema that drifts from `conform`, a door that agrees by coincidence, or a
position with a projection hiding in it. Each arc's closing chapter is the
guard against its own failure mode, and every property lands with the defect
it caught or with a deliberately broken build shown failing — the same
standard every arc since 1.62 has been held to.
