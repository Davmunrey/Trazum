# Building on the JSON

[Documentation](README.md) / [JSON output](json-output.md) · [Format contracts](format.md) · [Local HTTP API](api.md)

For people writing a dashboard, a CI step or an importer against what Trazum prints with `--json`.

This page is a map. It says where each command's contract is, what a contract
promises and what it does not, and what never leaves the machine. The contract
itself is [JSON output](json-output.md): every field is described there, and
nothing on this page restates one.

## Each command's contract

Each link goes to the section of [JSON output](json-output.md) that holds the
field table for that command's document.

| Command | Contract |
| --- | --- |
| `trazum profile --json` | [Top-level fields](json-output.md#top-level-fields) |
| `trazum profile --by-source --json` | [The `--by-source` document](json-output.md#the---by-source-document) |
| `trazum plan --json` | [The plan document](json-output.md#the-plan-document) |
| `trazum verify --json` | [The verification document](json-output.md#the-verification-document) |
| `trazum history --json` | [The history document](json-output.md#the-history-document) |
| `trazum connect --json` | [The connected report document](json-output.md#the-connected-report-document) |
| `trazum serve`, `POST /cost` | [The cost answer document](json-output.md#the-cost-answer-document) |
| `spend_guard` over MCP | [The spend-guard document](json-output.md#the-spend-guard-document) |
| `trazum init --json` | [The first-run document](json-output.md#the-first-run-document) |
| `trazum report --year <yyyy> --json` | [The annual record document](json-output.md#the-annual-record-document) |
| `trazum rollup <document...> --json` | [The roll-up document](json-output.md#the-roll-up-document) |
| `trazum pulse --json` | [The pulse document](json-output.md#the-pulse-document) |
| `trazum proactive --json` | [The proactive document](json-output.md#the-proactive-document) |
| `trazum waste --json` | [The waste document](json-output.md#the-waste-document) |
| `trazum bench --json` | [The bench document](json-output.md#the-bench-document) |
| `trazum rules --measure <dir> --json` | [The rule-yield document](json-output.md#the-rule-yield-document) |
| `trazum write --json` | [The prompt-draft document](json-output.md#the-prompt-draft-document) |
| `trazum gateway`, HTTP 402 | [The gateway refusal document](json-output.md#the-gateway-refusal-document) |
| `trazum position <usage.jsonl> --json` | [The position document](json-output.md#the-position-document) |
| `trazum route ... --json --yes` | [The routing-measurement document](json-output.md#the-routing-measurement-document) |
| `trazum prune ... --json --yes` | [The example-pruning document](json-output.md#the-example-pruning-document) |
| `trazum store --json` | [The store inventory document](json-output.md#the-store-inventory-document) |
| `trazum conform <file> --json` | [The conformance document](json-output.md#the-conformance-document) |
| `trazum watch --json` | [The watch cycle document](json-output.md#the-watch-cycle-document) |
| Task reports, comparisons and policy receipts (2.6.0 and later) | [The task document](json-output.md#the-task-document) |

The outcome report document has no command that prints it: it is
[documented](json-output.md#the-outcome-report-document) for a tool that
computes it with `@trazum/core`.

## The contracts are versioned and held by tests

- **Versioned.** A document that follows the `schemaVersion` promise carries
  `schemaVersion`, which starts at `1`. The task family uses `version` and
  `kind` instead, and you branch on those. Which of the two a document uses is
  stated in its section.
- **Held by tests, in both directions.** A key that disappears fails a test,
  and a key added without a line in [JSON output](json-output.md) fails one too.
  [`contract-coverage.test.js`](../packages/cli/test/contract-coverage.test.js)
  takes every table out of that file and fails on one that no test claims, and
  on a claim for a table that no longer exists.
- **The promises are tested as well as the tables.**
  [`format-promises.test.js`](../packages/core/test/format-promises.test.js)
  runs the promises of the next section over the documents the core can build.
- **You can validate without Trazum.** `trazum schema <name>` prints a contract
  as JSON Schema, and it lists the fields a reader may rely on, which is fewer
  than a document carries. The task family is the exception: `schema` and
  `conform` do not support it. See
  [the contracts as JSON Schema](commands.md#the-contracts-as-json-schema-trazum-schema)
  and [`trazum conform`](commands.md#building-on-the-format-trazum-conform).

## What is stable and what is not

**Stable**, from [the promise](json-output.md#the-promise):

- `schemaVersion` is the only thing to branch on. It changes only when a
  field's meaning changes or a field is removed.
- Fields are added without a version bump. Ignore keys you do not know and your
  reader keeps working.
- Dollars are numbers, never strings and never rounded for display. Token
  counts are integers.
- No document carries a session key or prompt text.
- Absence is `null` or an empty array, never zero. `null` means not measured.

**Not stable, and not a promise:**

- **Which keys exist beyond the ones a table names.** New keys arrive without
  notice, which is why an unknown key must not break you.
- **The wording of any sentence.** An advisory's `detail` is for a person: read
  it for display and never parse it. The id, the severity and
  `estimatedMonthlyUsd` are the fields
  ([the capability an advisory names](json-output.md#the-capability-an-advisory-names)).
- **The bundled prices.** A figure depends on the catalogue the version you ran
  carried. A price can change in a patch release, so the same log can price
  differently on two versions, and a `--pricing` overlay corrects one
  today ([Changing prices](../CONTRIBUTING.md#changing-prices)).
- **A roll-up is not a measurement made here.** It merges documents other
  machines measured, and what matters in it is its refusals. Read them before
  you quote a total.

## Nothing is uploaded

Reading these documents sends nothing anywhere. Trazum does not collect them,
there is no account, and no hosted service receives usage, so there is no
leaderboard and nothing to rank. A roll-up is
[a format and a merge, not a service](json-output.md#the-roll-up-document): the
documents travel however your team already moves files. What you build on the
JSON stays where you put it.

## Where to go next

- [JSON output](json-output.md) for every field.
- [The format](format.md) for what another tool must do to emit or read a
  usage log.
- [The pricing dataset](pricing-dataset.md) if you want prices as data rather
  than priced usage.
- [Local HTTP API](api.md) and [Agent integrations](agents.md) for the
  surfaces that return these documents over a call.
