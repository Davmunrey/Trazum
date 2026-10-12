# @trazum/mcp

Trazum as an [MCP](https://modelcontextprotocol.io) server, so an agent can price
and budget a prompt **before** it sends it — and read a usage log to see where the
money already went.

Every other Trazum surface answers those questions for a human after the fact — a
CLI you run, a page you paste into, a check that fails a build. This answers them
for the thing actually composing the prompts.

## It runs on your machine and costs nothing to host

One process over stdio, spawned by whatever client wants it, exactly like the CLI.
No service, nothing to keep up, and **no prompt leaves the machine**. Worth stating
because "MCP server" reads like infrastructure and this is not.

```jsonc
// Claude Code: .mcp.json — or the equivalent in any MCP client
{
  "mcpServers": {
    "trazum": { "command": "npx", "args": ["-y", "@trazum/mcp"] }
  }
}
```

## The tools

| Tool | Answers |
| --- | --- |
| `check_prompt` | Does this prompt fit `maxTokens`? And if not, would optimising it fit? |
| `optimize_prompt` | The shorter text, the token counts either side, what the difference is worth per month, and any advisories. |
| `profile_usage` | Where the money went, from a usage log passed as text: the spend split, per label and per model, whether caching paid for itself, and the levers that would actually move the bill. `label`, `since`/`until` and `previous_log` drill down and compare; `what_if` prices the same calls on another model — arithmetic, not advice, and it says so. `pricing_overlay` takes the same JSON a `--pricing` overlay file holds, as text — models it adds or overrides price the whole report, and the report says the overlay is in effect. Uses recorded token counts priced with the selected catalogue; this is not a reconciled invoice. |
| `plan_savings` | Rank actions from normalized usage-log text, keeping projected savings, measured stakes, assumptions and evidence gaps separate. Returns a JSON plan compatible with the CLI. |
| `verify_savings` | Check saved plan JSON against newer log text. Returns arrived, not-arrived or cannot-tell per action, attribution and gate failures. |
| `list_models` | Prices, context windows and cacheable minimums, with the date the table was reviewed. |
| `spend_guard` | Whether the call you are about to make fits the budget — `yes`, `no`, or `cannot-tell`, with the cheaper ways to make the same call attached to a refusal. See below. |
| `position` | Where the month stands against every ceiling you pass, measured from the log text alone — the denominator on every figure, and no forecast anywhere. |
| `prompt_writer` | Interviews you, then writes the prompt. Fixed questions, your words, same answers same text — nothing is generated. |

`check_prompt` is the one worth wiring up. It has **three** outcomes rather than
two, and the third is the point:

```
OVER BUDGET — 2,140 tokens against 2,000, but the safe rules bring it to 1,870,
which fits. Optimise rather than cut.
```

"Over budget" and "over budget but the rules would fix it" are different
instructions. A boolean throws away the actionable half.

## Plan, change, verify

1. Call `plan_savings` with `{ "log": "<normalized JSONL text>" }`.
2. Parse the tool's text content as JSON. Keep its `plan` field; review each
   action's `assumes` before changing a model or enabling batching.
3. After the change, call `verify_savings` with
   `{ "plan": "<JSON.stringify(saved plan)>", "log": "<newer normalized JSONL text>" }`.
4. Read `verification.actions`, `cannotTell` and `gateFailures`. An action
   marked `arrived` does not prove equivalent answer quality or net savings.

Both accept optional `pricing_overlay`, the same pricing-overlay JSON text as
`profile_usage`. Use the same rates for both runs. `pricesChanged` compares
review dates; matching dates do not prove two custom rate cards are identical.
Logs and plans are limited to 2,000,000 characters each. These tools take
**text**, not paths, and refuse empty or wholly unreadable logs. Import provider
exports to normalized JSONL with the CLI before handing them to these tools.
Unknown arguments are rejected rather than ignored.

The JSON returned in MCP text content has this structure:

| Tool | Fields |
|---|---|
| `plan_savings` | `schemaVersion`, `plan`, `evidence`, `limitations` |
| `verify_savings` | `schemaVersion`, `verification`, `evidence`, `limitations` |

`plan` is a standard Trazum plan document: the CLI can verify it, and this tool
can verify a plan saved by the CLI. Save **the plan field**, not the surrounding
evidence envelope. [Plan contract](https://github.com/Davmunrey/Trazum/blob/main/docs/plan-format.md).

`evidence` names priced calls and USD, unpriced calls/models, skipped line
numbers, time coverage and the pricing review date. Its `complete` flag means
no rows were skipped or left unpriced; it does not certify that a log includes
all of your traffic. Logs with only unknown models produce no priced actions
and explicitly report that gap.

**Do not add projected savings to measured stakes.** The former is a scenario;
the latter is money already attributed to a problem. A vanished workload is
`cannot-tell`, not success. A combined routing/batching action can verify the
routing change, but token counts alone do not prove batch billing. Compare
matching workloads and periods, and keep quality evaluations separate.

## What it cannot do, which is the design

**No paths.** Every tool takes text — the prompt itself, the log itself. A tool
that accepted a filename would be a file-read primitive reachable by whatever the
model decided to ask for. This package imports `@trazum/core`, the browser-safe
entry point, and never `@trazum/core/node` — the capability is *absent* rather
than unused, and a test enforces it. The agent reads the file in its own sandbox,
where its own permissions apply, and hands over the content.

**No network.** Nothing here calls a model. `--suggest` and `eval` exist in the CLI
and are deliberately not exposed: they spend your money, and a tool an agent can
invoke in a loop must not be able to do that.

**No writes.** The tools return figures. Applying them is the agent's job, in its
own context, where you can see the diff.

**Zero runtime dependencies outside this repository**, which is why the JSON-RPC
layer is written by hand rather than taken from the official SDK. That is not
preference. An MCP server reads prompts handed to it by a model, in a process you
did not start yourself, and every dependency is somebody else's code on that path.
The invariant applies here with more force than anywhere else in Trazum, so
relaxing it here would have been backwards.

## Limits, stated

The protocol implementation covers what a tools-only server needs — `initialize`,
`notifications/initialized`, `tools/list`, `tools/call`, `ping` — and answers
anything else with `-32601 Method not found`. No resources, no prompts, no
sampling. An argument a tool's schema does not declare is refused as an
`isError` result naming it and the declared name it most likely meant
(`output_tokens` → `outputTokens`), never ignored: a dropped key read as its
default is how `spend_guard` once said yes to a call over budget. It is driven by a raw newline-delimited client in the tests; it has not
been driven by every MCP client in existence.

Token counts are estimates (±4% on CJK, ±6% on Latin prose, ±26% on code,
±33% on tabular numbers, measured against Claude's tokenizer over 47 samples in
ten languages). Prompt tools report this uncertainty; usage tools instead
price recorded token counts and identify missing evidence. A prompt
within a few percent of its budget should be treated as uncertain rather than as
passing. `--exact-tokens` settles it against the counting endpoint, which is free.

## `spend_guard`

Whether a call you are about to make fits the budget: `yes`, `no`, or
`cannot-tell`. A refusal carries the cheaper ways to make the same call — each
priced for this call, each naming what it assumes, and each already filtered to
models the prompt fits inside. The measured half (spend so far) and the
estimated half (the call you described) stay apart, and the verdict says which
it rests on. Nothing is called and nothing is spent to answer.

## Licence

MIT. Part of [Trazum](https://github.com/Davmunrey/Trazum).
