# The interchange format

Trazum emits **seventeen** documents as data, and defines an eighteenth it does not
emit. All eighteen are contracts, enforced in both directions by parity tests in
this repository, and this page is what makes them something another tool can
build against rather than something to reverse engineer from output.

Two distinctions are drawn in the table rather than blurred, because each one
changes what you can actually do:

- **`--contract` names eighteen of them.** Every documented contract — the
  defined-but-not-emitted outcome report included — can be checked against a
  document *you* produced with a single command. The distinction between named
  and merely documented existed for releases and closed in the 1.65 arc: a
  format is adoptable when checking a document requires nothing but the
  document.
- **The outcome report is defined but not emitted.** `trazum profile` renders it
  as terminal text and `@trazum/core` computes it; no command writes it as JSON.
  It is a contract so that a tool of yours can produce one and have it checked —
  not a claim that Trazum will hand you one.

| Contract | Written by | `--contract` | Documented in |
| --- | --- | --- | --- |
| **usage log** | you, or `trazum connect` | `usage-log` | [usage-logs.md](usage-logs.md) |
| **profile** | `trazum profile --json` | `profile` | [json-output.md](json-output.md#top-level-fields) |
| **fleet** | `trazum profile --by-source --json` | `fleet` | [json-output.md](json-output.md#the---by-source-document) |
| **plan** | `trazum plan -o`, and the web app | `plan` | [plan-format.md](plan-format.md) |
| **verification** | `trazum verify --json` | `verification` | [json-output.md](json-output.md#the-verification-document) |
| **history** | `trazum history --json` | `history` | [json-output.md](json-output.md#the-history-document) |
| **connected report** | `trazum connect --json` | `connected` | [json-output.md](json-output.md#the-connected-report-document) |
| **cost answer** | `trazum serve`'s `POST /cost` | `cost-answer` | [json-output.md](json-output.md#the-cost-answer-document) |
| **outcome report** | nothing — rendered by `trazum profile`, never written as JSON | `outcome-report` | [json-output.md](json-output.md#the-outcome-report-document) |
| **annual record** | `trazum report --year --json` | `annual-record` | [json-output.md](json-output.md#the-annual-record-document) |
| **spend guard** | the `spend_guard` MCP tool | `spend-guard` | [json-output.md](json-output.md#the-spend-guard-document) |
| **roll-up** | `trazum rollup --json` | `roll-up` | [json-output.md](json-output.md#the-roll-up-document) |
| **first run** | `trazum init --json` | `first-run` | [json-output.md](json-output.md#the-first-run-document) |
| **pulse** | `trazum pulse --json` | `pulse` | [json-output.md](json-output.md#the-pulse-document) |
| **bench** | `trazum bench --json` | `bench` | [json-output.md](json-output.md#the-bench-document) |
| **rule yield** | `trazum rules --measure --json` | `rule-yield` | [json-output.md](json-output.md#the-rule-yield-document) |
| **gateway refusal** | `trazum gateway`, as the HTTP 402 body | `gateway-refusal` | [json-output.md](json-output.md#the-gateway-refusal-document) |
| **prompt draft** | `trazum write --json`, and `@trazum/core`'s `assemble()` | `prompt-draft` | [json-output.md](json-output.md#the-prompt-draft-document) |

The count above said **seven** for as long as the table had ten rows in it, and
it was still saying seven after the outcome report and the annual record were
added. A page whose whole job is telling another tool what it can build against
was, on its first sentence, wrong about how many things that is.

**Then it happened again, with a guard watching.** The page said twelve while
`pulse`, `rules --measure` and the gateway's 402 body each had a contract table,
a `schemaVersion` and something that emits them — three documents in neither the
list nor the count, and a connector author working from this page would not have
known they exist. The count had been checked against the table since the day it
said seven with ten rows, and **both halves of that comparison are written by
hand**: a document missing from the table and missing from the sentence leaves
the two agreeing.

So the table is no longer read by hand either. The list is derived from the
contract tables that exist, matched by the anchors these rows link to, and
`packages/cli/test/contract-coverage.test.js` fails on a table this page omits
*and* on a row pointing at a section that carries no table.

## Emitting the minimum

Two contracts in the table exist to be written by tools that are not Trazum:
the **usage log**, which anything that calls a model can append, and the
**outcome report**, which is defined here precisely so that a tool of yours
can produce one. The examples below are not illustrations — each is extracted
from this page by `packages/cli/test/producer-page.test.js` and run through
`trazum conform`, and the same test guts a required field from each and
requires the gutted copy to fail. An example that drifted from the contract
breaks the build instead of misleading the first person to copy it.

A usage-log record is one JSON object per line, and the only field `conform`
*requires* is `model`:

```json usage-log
{"model": "claude-opus-5", "usage": {"input_tokens": 1200, "output_tokens": 300}}
```

Everything else — `label`, `session`, `ts`, `stop_reason`, cache token counts
— is a measurement you either took or did not. `conform` lists what each
absence costs you and gates on none of it; the fields are documented in
[usage-logs.md](usage-logs.md).

An outcome report, exactly as `@trazum/core` computes one:

```json outcome-report
{
  "schemaVersion": 1,
  "slices": [
    { "value": "ok", "verdict": "success", "calls": 3, "usd": 1.5 },
    { "value": "fail", "verdict": "other", "calls": 1, "usd": 0.5 }
  ],
  "coverage": { "recorded": 4, "parsed": 6, "unrecordedUsd": 2 },
  "undeclared": [],
  "successShareOfRecordedUsd": 0.75,
  "noRate": null
}
```

The producer's side of the additive promise is short: **add anything, redefine
nothing, and never write `0` for a measurement nobody took**. A field of your
own rides along untouched — every consumer here ignores unknown keys, so
nothing you add needs permission. What you may not do is reuse a documented
name with a different meaning or type, because that is the one change no
consumer can detect; and absence is `null` or an empty array, never zero,
because `successShareOfRecordedUsd: 0` claims every recorded dollar failed —
a wrong report, where `null` with its `noRate` reason is an honest one.

## Checking your own emitter

```bash
trazum conform your-log.jsonl
trazum conform report.json --contract profile
trazum conform - --json < whatever-you-just-wrote
```

It answers **two separate questions**, and the second is the one worth having:

1. **Does this conform?** Required fields, present and the right type. Exits 1
   when they are not, so it gates in CI.
2. **What can a valid document of this shape not answer?** A usage log with no
   `session` is perfectly conformant and simply has no conversation growth in
   it. Each gap comes with the field that would unlock it.

**The second never gates.** Choosing not to log sessions is a decision, not a
defect, and a check that failed on it would be Trazum telling you what to
record.

Unknown fields are never a problem. These documents gain fields without a
version bump, so a checker that rejected tomorrow's field would be a checker
nobody upgrades.

## Where the schemas live

`trazum schema <contract>` prints an authored **JSON Schema (draft 2020-12)**
for any name in the table's `--contract` column, so a document can be checked
by a tool that has never installed Trazum:

```bash
trazum schema usage-log > usage-log.schema.json
npx ajv validate -s usage-log.schema.json -d record.json
```

Each schema's `$id` — the usage log's is
`https://github.com/Davmunrey/Trazum/schema/usage-log/v1.json`, and the test
that holds this page requires that sentence to match the schema — is an
**identifier, never fetched**: it exists so two tools can agree they mean the
same contract, and nothing in any build should resolve it.

The schemas state required fields and their types and stop there.
`additionalProperties` is never `false` — that is the additive promise in
schema form — and documented unions stay open for the same reason. `conform`
remains the stricter check: the relational rules, like a rate and its refusal
never both carrying a value, or a zero standing in for absence, live there,
because a schema cannot hold them.

## What `schemaVersion` promises

Every document carries `schemaVersion`, currently `1`. It is the **only** thing
a consumer must branch on.

| Change | Allowed in | Why |
| --- | --- | --- |
| A new field appears | any release | A consumer that ignores unknown keys keeps working. This is the normal way findings arrive. |
| A field's **meaning** changes | a `schemaVersion` bump | Same name, different semantics, is the one change no consumer can detect. |
| A field is **removed** | a `schemaVersion` bump | A consumer reading it gets `undefined` and cannot tell that from absence-as-data. |
| A field's **type** changes | a `schemaVersion` bump | Including narrowing: `number \| null` becoming `number` breaks anybody handling the null. |
| A new value appears in a documented union | a minor release | Unions here are open by construction — `cannot-tell` reasons and lever kinds both grew. Handle the default case. |
| Rounding or precision changes | a minor release | Dollars are never rounded for display in JSON. If that ever changes it is a version bump. |

**Absence is `null` or an empty array, never zero.** That is a guarantee, not a
convention: `span: null` means the log carried no clock, and `0` would mean it
covered the epoch. Every document here holds it, and `conform` reports a zero
standing in for absence as its own kind of problem, because it is the mistake
that produces a wrong report rather than a rejected one.

## What is deliberately not in any of them

**No prompt text, no completion text, no session keys, no credentials.** Session
identifiers group turns inside Trazum and never reach any output. A usage log
handed to Trazum carries no content, and nothing identifying comes back out.

That is enforced, not promised: the security suite fails the build if a session
key reaches any rendering, and the store's documentation states exactly what a
stored file holds so nobody has to guess about their own backup.

## Writing a connector

A provider connector turns a usage API into records Trazum can store. The seam
is `ConnectorDescriptor` in `@trazum/core`, and the rules a connector must
follow are the interesting part:

- **It declares what it cannot serve.** A bucketed usage API that reports token
  sums per window and no request count must list `calls` as unavailable, with
  the reason and what would unlock it. It must never report a call count of
  zero — that is a measurement nobody took.
- **It reports gaps.** A window the API returned nothing for is a `PullGap`
  with its kind, not a silent absence. A connector that quietly drops a day
  produces a total that is wrong by an unknown amount, in the flattering
  direction.
- **It borrows the credential.** The key is read from a named environment
  variable, used for the request, and never stored, logged, returned to a
  caller or put in a URL. What travels is the **name** of the variable.
- **The transformation is pure and the fetch is not.** Normalising a provider's
  payload into records belongs in `@trazum/core` where it is tested without a
  network; the request belongs in the CLI. Every connector here is split that
  way, and the split is why the awkward payloads have tests.

Check what you emit with `trazum conform --contract connected`.

## Versioning of the packages themselves

Separate from `schemaVersion` and documented in
[VERSIONING.md](../VERSIONING.md). The short version: the three packages share
one version number and are released together, so `@trazum/cli@1.49.0` depends on
exactly `@trazum/core@1.49.0`.

## The reasoning behind all of it

[doctrine.md](doctrine.md) — the rules these contracts exist to hold, each with
the release that learned it the hard way. If you are building something that
reports money from measurements and you read only one page here, read that one.
