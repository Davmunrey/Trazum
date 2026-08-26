#!/usr/bin/env bash
#
# Trazum in the Claude Code status line, at zero token cost.
#
# Two modes, one file:
#
#   trazum-statusline.sh              the status line itself: prints a cached
#                                     line, never computes
#   trazum-statusline.sh --refresh    the Stop hook: computes the line and
#                                     writes the cache, once per turn
#
# **Why this costs nothing.** Claude Code renders the status line's stdout in
# the terminal, and writes a Stop hook's stdout to the debug log. Neither
# reaches the model, so neither is tokens. `SessionStart` is the hook whose
# stdout *is* handed to the model as context, which is exactly why the refresh
# is not wired to it: that version of this script would charge you for the
# privilege of being told what you are spending.
#
# **Why the work is not in the status line.** Claude Code runs the status line
# on every assistant message, debounced 300ms, and cancels the script if
# another update arrives while it is running. Reading a whole transcript there
# is fine on a normal session and not fine on a long one: measured on 208 real
# transcripts, the median took 0.50s and the largest, at 212 MB, took 6.5s,
# which is long enough to be cancelled every time and show nothing. So the
# status line only reads a file, and the Stop hook pays the cost once per turn,
# after the turn, where taking a second does not matter.
#
# **And the hook does not re-read the transcript either.** `--state` records
# where the last conversion stopped and the next one resumes there, re-deriving
# only the call that was still streaming. On that same 212 MB session the hook's
# conversion drops from 2.6s to 0.19s, and the records it appends are byte for
# byte what a full read would have produced.
#
# Install (both lines, in ~/.claude/settings.json):
#
#   "statusLine": { "type": "command", "command": "/path/to/trazum-statusline.sh" },
#   "hooks": { "Stop": [{ "matcher": "*", "hooks": [
#     { "type": "command", "command": "/path/to/trazum-statusline.sh --refresh" }
#   ]}]}
#
# The status line alone works without the hook: it just never has a cache to
# read, and falls back to the number Claude Code computes itself, saying so.
set -uo pipefail

trazum_bin="${TRAZUM_BIN:-trazum}"
cache_dir="${TRAZUM_STATUSLINE_CACHE:-${TMPDIR:-/tmp}/trazum-statusline}"

json="$(cat)"
field() { printf '%s' "$json" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => { raw += c; });
  process.stdin.on("end", () => {
    let value;
    try { value = process.argv[1].split(".").reduce((o, k) => o?.[k], JSON.parse(raw)); }
    catch { value = undefined; }
    process.stdout.write(String(value ?? process.argv[2] ?? ""));
  });' "$1" "${2-}"; }

session="$(field session_id)"
model="$(field model.display_name '?')"
cache="$cache_dir/${session:-unknown}.txt"

if [ "${1-}" != "--refresh" ]; then
  # The status line. Reads, never computes. A missing cache is the normal
  # state of the first turn and of an install without the hook, so it is not
  # an error: Claude Code's own figure stands in, labelled, because a number
  # from somewhere else presented as Trazum's is the one thing this product
  # does not do.
  if [ -s "$cache" ]; then
    printf '%s  %s' "$model" "$(cat "$cache")"
  else
    printf '%s  $%s (Claude Code)' "$model" "$(field cost.total_cost_usd 0)"
  fi
  exit 0
fi

# The Stop hook. Everything below runs once per turn, after the turn.
path="$(field transcript_path)"
[ -s "$path" ] || exit 0

mkdir -p "$cache_dir" || exit 0

# The converted log and its resume point live beside the cached line, so a
# session that ends takes its working files with it when $TMPDIR is cleared.
log="$cache.log"
"$trazum_bin" from-claude-code "$path" -o "$log" --state "$cache.state" >/dev/null 2>&1 || exit 0
[ -s "$log" ] || exit 0

line="$(
  "$trazum_bin" profile "$log" --json 2>/dev/null | node -e '
    let raw = "";
    process.stdin.on("data", (c) => { raw += c; });
    process.stdin.on("end", () => {
      let total;
      try { total = JSON.parse(raw).total; } catch { total = null; }
      if (!total) process.exit(1);
      const read = total.cacheReadTokens ?? 0;
      const billed = read + (total.inputTokens ?? 0) + (total.cacheWriteTokens ?? 0);
      const hit = billed ? Math.round((read / billed) * 100) : 0;
      const saved = (total.cachedTokensAtInputRateUsd ?? 0) - (total.cacheReadUsd ?? 0);
      const parts = [`$${total.totalUsd.toFixed(4)}`, `${total.calls} calls`, `cache ${hit}%`];
      if (saved > 0) parts.push(`saved $${saved.toFixed(2)}`);
      process.stdout.write(parts.join(" · "));
    });'
)" || exit 0

# Written whole or not at all: the status line reads this file at an arbitrary
# moment, and half a line is worse than a stale one.
[ -n "$line" ] || exit 0
printf '%s' "$line" > "$cache.tmp" && mv "$cache.tmp" "$cache"
exit 0
