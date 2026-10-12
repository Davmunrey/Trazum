# Agent integrations

[Documentation index](README.md) · [Setup](setup.md) · [MCP reference](../packages/mcp/README.md) · [HTTP API](api.md)

Trazum separates the **harness** that executes an agent, the **model/provider**
that serves requests, and the **payment mode** that determines the invoice.
Use the same analysis and plan documents across integrations. A successful
MCP connection does not mean that Trazum can import that client's sessions or
intercept its requests.

## Choose an interface

| Interface | Use it for | Boundary |
|---|---|---|
| CLI | Read authorized files, generate reports and plans, run CI checks | Files and commands run with the caller's permissions |
| MCP | Inspect costs, propose savings, verify a saved plan | Tools receive text; no filesystem, network or model calls |
| Local HTTP | Check costs, plan savings and verify saved plans | Normalized text inputs; server catalogue; no spending reservation |
| Gateway | Apply policy to calls explicitly routed through it | Process-local accounting; external calls remain unseen |
| Agent skill | Teach an agent which interface and evidence to use | Instructions are not enforcement or spending authorization |

Start with the [setup instructions](setup.md). For MCP, inspect `tools/list`
on the running server before using a tool. Local development may include
tools not yet available in an older npm release.

## Native import versus generic access

The [capabilities endpoint](api.md#start-and-discover) reports native import
support independently from CLI, MCP and HTTP access. Claude Code and Codex
have native JSONL adapters; other clients can supply the normalized
[usage-log format](usage-logs.md). Do not treat Cursor or another MCP client's
transcripts as supported simply because that client can call Trazum tools.

With the CLI, use explicit authorized paths with `from-claude-code` or
`from-codex`. With MCP, call `import_usage` with explicit `format` (`claude-code`
or `codex`), transcript `text` and an optional approved `label`. The server never
opens a path and never derives labels from working directories. Native adapter
output excludes prompts, tool responses and paths, but retains session IDs.
Keep raw transcripts out of model context where the host can pass them directly
to the local tool.

The model ID comes from the source, not the harness name. Unknown models stay
unpriced unless the user supplies a [price card](usage-logs.md). Recorded token
usage priced at catalogue rates is an API-equivalent estimate. A subscription,
discounted invoice or provider credit requires separate evidence.

## Diagnose, propose, verify

```sh
trazum bill usage.jsonl --receipt
trazum plan usage.jsonl --json -o plan.json
trazum verify plan.json --against later.jsonl --json
```

For native transcripts, first call `import_usage` and pass its returned `log`
to `profile_usage` or `plan_savings`. Preserve its diagnostics alongside later
reports: empty output is not zero usage, conversion cannot establish source
completeness, and separate imports do not share deduplication state. Do not
concatenate overlapping imports. CLI normalization remains an alternative.
For already normalized JSONL, use `profile_usage`, `plan_savings`, and
`verify_savings` directly.
Save the `plan` field from `plan_savings` as the document; the surrounding
response holds additional evidence. Pass JSONL contents and serialized plan
text to MCP, never file paths. The same plan can be opened in the dashboard.

Keep priced/unpriced coverage, the observed period, pricing provenance and
assumptions with the result. Verification distinguishes `arrived`,
`not-arrived`, and `cannot-tell`. A workload disappearing from a log is not
evidence of savings. A cheaper model still needs a quality evaluation.

See the [agent workflow reference](../.claude/skills/trazum/references/agent-workflows.md)
for budget checks, unknown results, paid calls and gateway limitations.

## Evaluate the integration

```sh
npm run build
npm run test:agents
```

The evaluation launches the actual CLI and MCP stdio server with synthetic
logs. It exchanges plans in both directions, compares deterministic results,
checks that vanished workloads remain unknown, and refuses to turn a missing
budget into spending permission. It makes no paid calls and uses no customer
transcripts. This tests interface behavior, not an LLM's ability to follow the
skill or preserve task quality.

The evaluation approach takes inspiration from ECC's
[eval-harness](https://github.com/affaan-m/ECC/tree/main/skills/eval-harness)
and [verification-loop](https://github.com/affaan-m/ECC/tree/main/skills/verification-loop):
define observable outcomes and run regression checks. No external hooks,
agent pack, executable code or global configuration are installed. The
[Broch library](https://brochbuilds.com/skills#library) was reviewed as a
discovery source; its rankings are not a dependency or a security assessment.
