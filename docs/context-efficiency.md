# Instructions for efficient agent context

[Documentation](README.md) / [Agent integrations](agents.md)

Trazum's plugin already gives an agent a skill and MCP tools for prompt checks,
optimization, usage analysis and budget decisions. It does not intercept every
host-model turn or control a subscription's quota. Loading a skill or tool
schema can itself consume context; measure the net effect.

The following is an **optional instruction template**, not an automatically
installed feature. Add it once to the instruction mechanism your host already
supports, after reviewing it against your existing project rules. Do not copy
it into several files that the agent loads together. Higher-priority host,
user and project requirements still apply.

For the implemented local log filter and its Claude Code skill workflow, see
[tool-output filter](tool-output-filter.md). It is opt-in and preserves originals.

## Compact instruction template

> Work efficiently without reducing correctness. Search before reading; load
> only relevant file ranges and expand when evidence is missing. Reuse available
> context, but re-read changed files. Filter large tool results and summarize
> them while preserving errors and relevant evidence. Make the smallest complete
> change and run checks proportionate to its risk; obey required validation.
> Avoid repeating the request, long unchanged code and redundant explanations.
> Match output detail to the user's needs. Before changing tasks or handing off,
> preserve the goal, decisions, constraints, modified files, checks and next step
> in a concise summary. Use Trazum for a concrete prompt or usage question; do
> not call it on every turn. Never drop necessary evidence, skip required checks
> or claim that reduced tokens increase a provider's quota.

## What each layer can do

| Layer | Practical role | Boundary |
|---|---|---|
| Host instructions | Encourage selective reads, bounded output and concise answers | Model compliance is not a hard guarantee. |
| Trazum CLI/MCP | Analyse usage and propose edits to supplied prompts | It needs the relevant input; it does not see the host's entire context automatically. |
| Trazum token check | Check a supplied file or prompt against an explicit token budget | This is not the remaining context window or subscription allowance. |
| Integrated gateway | Enforce configured policy on calls routed through it | Unrouted host calls are not covered. |
| User/host session controls | Start a new conversation or compact context when supported | Trazum does not add these controls to the host. |

Prefer local CLI processing of large transcripts where shell access exists.
Do not paste an entire session into a model just to ask how many tokens it used.
For MCP, pass the necessary bounded input and keep the returned evidence
focused; see [agent workflows](agents.md).

## Evaluate before making it a default

Use comparable tasks with the same model and relevant settings. Compare total
input and output tokens across the whole task where the host exposes them,
including added instructions, tool exchanges, repeated calls and retries.
Record completion quality, elapsed time and failures alongside token counts.
Separate cached and uncached usage where available. Repeat tasks because agent
behaviour varies; a single short answer proves little.

Keep the template only if it improves the trade-off for your workload. A
successful context strategy might preserve more useful input while cutting
irrelevant tool output, rather than minimizing every message independently.

A smaller task footprint may help you use included capacity more efficiently,
but do not convert token reductions into promised extra messages or hours.
Provider limit rules and hidden host context may not be observable to Trazum.
