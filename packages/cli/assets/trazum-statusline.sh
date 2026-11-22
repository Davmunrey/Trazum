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
# In the user's own cache directory, never in a shared /tmp: another user on
# the machine could create a shared directory first, plant a link where this
# writes, or a line where this reads (GHSA-qrgc-pfrm-49qv). The directory is
# used only when it is a real directory this user owns, and is kept at 700.
cache_dir="${TRAZUM_STATUSLINE_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/trazum/statusline}"
own_cache_dir() { [ -d "$cache_dir" ] && [ ! -L "$cache_dir" ] && [ -O "$cache_dir" ]; }

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

# A file name, so only the characters a session id has: never a path.
session="$(field session_id | tr -cd 'A-Za-z0-9_.-')"
model="$(field model.display_name '?')"
cache="$cache_dir/${session:-unknown}.txt"

# The plan's own limits, as Claude Code hands them to the status line in
# `rate_limits`: how much of the five-hour and the seven-day window is used and
# when each resets, and a spend limit where a gateway sets one. Only a window
# Claude Code sent, with a percentage and a reset still ahead, is shown: there
# is no table of plan limits here and no counter worked out from tokens. On an
# API key, and before a session's first response, Claude Code sends none, and
# the line shows no plan figure at all.
# The program is JavaScript in single quotes on purpose: its ${...} are
# template literals, and the shell must leave them alone.
# shellcheck disable=SC2016
limits() { printf '%s' "$json" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => { raw += c; });
  process.stdin.on("end", () => {
    let r;
    try { r = JSON.parse(raw).rate_limits; } catch { r = undefined; }
    if (r === null || typeof r !== "object") return;
    const now = Date.now() / 1000;
    const live = (w) => w !== null && typeof w === "object" && Number.isFinite(w.used_percentage) && Number.isFinite(w.resets_at) && w.resets_at > now;
    const pad = (n) => String(n).padStart(2, "0");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const at = (s, how) => {
      const d = new Date(s * 1000);
      if (how === "time") return clock(d);
      if (how === "day") return `${days[d.getDay()]} ${clock(d)}`;
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };
    // Down, never up: a window at 99.6% is not shown as used up.
    const used = (w) => `${Math.floor(w.used_percentage)}%`;
    const parts = [];
    if (live(r.five_hour)) parts.push(`5h ${used(r.five_hour)}, resets ${at(r.five_hour.resets_at, "time")}`);
    if (live(r.seven_day)) parts.push(`7d ${used(r.seven_day)}, resets ${at(r.seven_day.resets_at, "day")}`);
    const s = r.spend_limit;
    if (live(s)) {
      const per = { daily: "/day", weekly: "/week", monthly: "/month" }[s.period] ?? "";
      const of = Number.isFinite(s.limit_usd) ? ` of $${s.limit_usd}${per}` : "";
      parts.push(`spend ${used(s)}${of}, resets ${at(s.resets_at, "date")}`);
    }
    process.stdout.write(parts.join(" · "));
  });'; }

if [ "${1-}" != "--refresh" ]; then
  # The status line. Reads, never computes. A missing cache is the normal
  # state of the first turn and of an install without the hook, so it is not
  # an error: Claude Code's own figure stands in, labelled, because a number
  # from somewhere else presented as Trazum's is the one thing this product
  # does not do.
  # Control characters are dropped: the line goes to a terminal.
  if own_cache_dir && [ ! -L "$cache" ] && [ -s "$cache" ]; then
    printf '%s  %s' "$model" "$(tr -d '\000-\037\177' < "$cache")"
  else
    printf '%s  $%s (Claude Code)' "$model" "$(field cost.total_cost_usd 0)"
  fi
  plan="$(limits)"
  [ -n "$plan" ] && printf '  |  %s' "$plan"
  exit 0
fi

# The Stop hook. Everything below runs once per turn, after the turn.
path="$(field transcript_path)"
[ -s "$path" ] || exit 0

(umask 077 && mkdir -p "$cache_dir") || exit 0
own_cache_dir || exit 0
chmod 700 "$cache_dir" || exit 0

# The converted log and its resume point live beside the cached line, so a
# session that ends takes its working files with it when $TMPDIR is cleared.
log="$cache.log"
"$trazum_bin" from-claude-code "$path" -o "$log" --state "$cache.state" >/dev/null 2>&1 || exit 0
[ -s "$log" ] || exit 0

# The session's subagents. Claude Code writes each one's transcript into a
# folder named after the session, `<session>/subagents/...`, and none of it is
# in `transcript_path`: without this the line left out every subagent the
# session ran, a quarter of the cost on this repository's own sessions. The
# folder is read whole each turn, because `--state` resumes one file and a
# folder of them grows by new files; on a 60 MB folder of 73 subagents that is
# 0.9s, after the turn, where the hook already lives.
whole="$log"
folder="${path%.jsonl}"
if [ -d "$folder/subagents" ]; then
  sublog="$cache.subagents.log"
  if "$trazum_bin" from-claude-code "$folder/subagents" -o "$sublog" >/dev/null 2>&1 && [ -s "$sublog" ]; then
    whole="$cache.whole.log"
    cat "$log" "$sublog" > "$whole" || whole="$log"
  fi
fi

# The program below is JavaScript, handed to node in single quotes on purpose:
# its ${...} are template literals, and the shell must leave them alone.
# shellcheck disable=SC2016
line="$(
  "$trazum_bin" profile "$whole" --json 2>/dev/null | node -e '
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
