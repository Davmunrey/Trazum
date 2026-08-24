# The plan for 1.69 — the agent's own bill

One arc, following [1.68](plan-1.68.md). Under the numbering adopted at
1.50.1 **the arc closes at 1.69.0**; like 1.68 it is small enough to land
in one release. The ordering is a commitment; the calendar is not.

## The thesis

Everything Trazum measures needs a usage log, and the standing advice has
been "it is three lines to record". But the largest new LLM bill many
people have is one they never instrumented: **the agent they talk to all
day.** Claude Code writes a transcript for every session —
`~/.claude/projects/<project>/<session>.jsonl` — and each assistant line
in it carries the API's own `usage` object: input, output, cache reads,
cache writes, **and the `cache_creation` TTL split** that the Bill tab and
`profile` beg users to record because it is the field that settles whether
caching paid off.

The arc: `trazum from-claude-code` turns those transcripts into a usage
log, so every existing door — `profile`, `position`, the web Bill tab, the
gates — prices the agent's sessions **without asking anyone to instrument
anything, and without ever reading what was said.**

## What the format actually is, measured before designing

Verified against a real session transcript rather than assumed:

- Assistant lines carry `message.model`, `message.usage` (the API shape,
  `cache_creation.ephemeral_5m/1h_input_tokens` included), a top-level
  `timestamp`, `sessionId` and `requestId`.
- **One API call is written as one line per content block, each repeating
  the same `usage` object.** In the measured session, 25,490 assistant
  lines collapsed to 16,079 distinct `requestId`s — a naïve line-by-line
  conversion overbills by a third. Deduplication keeps the **last** line —
  the call's final state — and counts what it collapsed out loud. A second
  finding arrived when the converter first ran against a whole project's
  195 transcripts: 311 calls whose lines *differ*, every one a response
  written while still streaming — the output count growing line by line,
  nothing else changing. The converter tells the two apart: monotone
  growth is `streamed`, counted without alarm; anything streaming cannot
  explain — a count shrinking, another field changing — is a
  `disagreement`, said loudly. The first draft alarmed on both, which was
  the message crying wolf about the norm.
- Transcripts also contain the full conversation: message text, file
  paths, the working directory, the git branch. **None of that crosses
  the conversion.** The output records carry exactly the fields the usage
  log format defines and nothing else.

## The chapters, in order

**1. The converter, in core.** `claudeCodeRecords(text)` parses transcript
JSONL and returns usage-log records: `model`, `ts`, `session` (the
session id — grouped by downstream, never printed, the standing rule),
and the `usage` object with the TTL split preserved. Deduplication by
`requestId` keeping one record per API call; lines without a `requestId`
kept as-is and counted; non-assistant lines are not drops to apologise
for — they are the transcript's other business — but their count is
available so the CLI can say what it read. Pure over its input, like
every other measuring function here.

**2. The command.** `trazum from-claude-code <path>` — the thirty-ninth
command. A file converts that session; a directory converts every
`*.jsonl` under it (a project directory, or the whole
`~/.claude/projects` tree — the path is always explicit, never a silent
default reach into somebody's home). Output is usage-log JSONL on stdout,
`-o <file>` to write it, so the whole product is one pipe away:
`trazum from-claude-code ~/.claude/projects -o usage.jsonl && trazum
profile usage.jsonl`. `--label <name>` stamps one label;
`--label-from-project` derives the label from each transcript's project
directory name — a workload name, not a path. What was collapsed,
skipped or unparseable is summarised on stderr, never silently.

**3. The privacy guard, by the three-doors method.** A fixture transcript
with a planted secret in its message content, a planted path in `cwd` and
a planted branch name; the suite greps the converter's entire output for
each and fails if any appears. Session ids pass through as the `session`
field and nothing else of the envelope survives — no `requestId`, no
`cwd`, no `gitBranch`, no text. The dedupe rule gets its own proof: the
fixture repeats a request across lines and the output prices it once.

**4. The documentation, where the readers already are.** The README's
profile section gains the one-pipe recipe; the project skill (and
therefore the plugin's derived skill, regenerated) teaches when to reach
for it — the plugin's users are Claude Code users, every one of them
sitting on transcripts. CHANGELOG, RELEASES, ROADMAP as always.

## What this deliberately does not ship

- **Other agents' transcript formats.** Cursor, Codex and the rest write
  different shapes; guessing them from documentation would be estimating.
  The command names the format it reads in its own name. A second format
  arrives when a real transcript of it does.
- **Watching the transcript directory.** `watch` exists for logs a
  gateway writes; pointing it at live transcripts is a plumbing decision
  the owner has not made.
- **Any reading of message content** — including "just to count tokens".
  The usage object already carries the counts; the text stays where it
  was written.
