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
| `profile_usage` | Where the money went, from a usage log passed as text: the spend split, per label and per model, whether caching paid for itself, and the levers that would actually move the bill. `label`, `since`/`until` and `previous_log` drill down and compare; `what_if` prices the same calls on another model — arithmetic, not advice, and it says so. The one tool whose figures are exact — they are the provider's own billed counts. |
| `list_models` | Prices, context windows and cacheable minimums, with the date the table was reviewed. |

`check_prompt` is the one worth wiring up. It has **three** outcomes rather than
two, and the third is the point:

```
OVER BUDGET — 2,140 tokens against 2,000, but the safe rules bring it to 1,870,
which fits. Optimise rather than cut.
```

"Over budget" and "over budget but the rules would fix it" are different
instructions. A boolean throws away the actionable half.

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
sampling. It is driven by a raw newline-delimited client in the tests; it has not
been driven by every MCP client in existence.

Token counts are estimates (±10%, measured against Claude's tokenizer over 21
samples in seven languages), and every tool says so in its own output. A prompt
within a few percent of its budget should be treated as uncertain rather than as
passing. `--exact-tokens` settles it against the counting endpoint, which is free.

## Licence

MIT. Part of [Trazum](https://github.com/Davmunrey/Trazum).
