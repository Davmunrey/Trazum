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

## The status line, which costs nothing

`statusline/trazum-statusline.sh` puts what the session has cost at the bottom
of Claude Code:

```
Sonnet  $0.7761 · 10 calls · cache 88% · saved $2.91
```

**Nothing there is tokens.** Claude Code draws the status line's stdout in the
terminal, and writes a `Stop` hook's stdout to the debug log. Neither is
context, so neither is billed. The one hook whose stdout *is* handed to the
model is `SessionStart`, which is why the refresh is not wired to it and why a
test refuses it by name.

Two lines in `~/.claude/settings.json`:

```json
{
  "statusLine": { "type": "command", "command": "/path/to/trazum-statusline.sh" },
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "/path/to/trazum-statusline.sh --refresh" }]
      }
    ]
  }
}
```

The hook does not re-read the transcript either: it converts with `--state`, so
each turn reads only what that turn appended. On the 212 MB session the hook's
conversion is 2.6s the first time and 0.19s after, and what it appends is byte
for byte what a full read would have produced.

**The split is the design, not tidiness.** Claude Code runs the status line on
every assistant message and cancels the script if another update arrives while
it is still running, so a status line that reads the whole transcript does not
show a stale number, it shows nothing. Measured on 208 real transcripts: the
median took 0.50s, and the largest, 212 MB, took 6.5s. With the work moved into
the hook, the status line reads one small file and returns in 0.08s on that same
212 MB session, while the hook pays the cost once per turn, after the turn.

The status line works without the hook. It just has no cache to read, so it
shows the figure Claude Code computes itself, labelled `(Claude Code)` rather
than passed off as Trazum's.

Set `TRAZUM_BIN` if `trazum` is not on `PATH`, and `TRAZUM_STATUSLINE_CACHE` to
move the cache off `$TMPDIR`.

## The rest of the product

The CLI (42 commands), the HTTP gateway, the GitHub Action and the web app
are documented in the [repository](https://github.com/Davmunrey/Trazum).
Everything installable is on npm under `@trazum/*`.
