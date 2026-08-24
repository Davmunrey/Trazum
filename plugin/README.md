# Trazum — Claude Code plugin

Price a prompt before it costs money, and read the bill after.

Installing this plugin gives Claude Code two things:

- **The `trazum` skill** — when to optimise a prompt, how to check a token
  budget in CI, how to read a usage-log profile without misquoting it, and
  every caveat the reports themselves carry. The skill is the same document
  this repository's own agents work from, with the invocation swapped to the
  published CLI (`npx -y @trazum/cli`).
- **The Trazum MCP server** (`npx -y @trazum/mcp`) — seven tools, including
  `spend_guard`, which judges a call against the USD ceilings in your
  `trazum.config.json` *before* the call is made, and `position`, which
  states where the month stands against those ceilings from a usage log.

Nothing here needs an API key or makes a network call: the optimiser is
deterministic, and the profiler reads a log you already have. The one
exception is `--exact-tokens` and the eval commands, which say so before
they spend anything.

## Install

```bash
claude plugin marketplace add Davmunrey/Trazum
claude plugin install trazum@trazum
```

## The rest of the product

The CLI (40 commands), the HTTP gateway, the GitHub Action and the web app
are documented in the [repository](https://github.com/Davmunrey/Trazum).
Everything installable is on npm under `@trazum/*`.
