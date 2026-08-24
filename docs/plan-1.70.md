# The plan for 1.70 — one drag

One arc, following [1.69](plan-1.69.md). **The arc closes at 1.70.0.** The
ordering is a commitment; the calendar is not.

## The thesis

1.69 taught the product to price Claude Code's transcripts, and the pipe it
shipped is honest and works — and still asks for a terminal: install the
CLI, run `from-claude-code`, carry the output to wherever the questions
are. The people with the largest unpriced agent bills are exactly the
people who will not do three steps to see it.

The arc: **drag the `~/.claude/projects` folder onto the web app and read
your own agent bill in seconds** — no install, no upload, no third step.
The converter is `claudeCodeRecords`, pure and already in the browser
bundle; the profiler and the position card already run in the tab; the
only thing missing is the tab knowing a transcript when it sees one and a
drop zone that accepts a folder. Every hard promise this product makes
gets sharper here, not weaker: the transcripts are read in the reader's
own tab, the conversion keeps the numbers and drops the words, and the
summary says out loud what was collapsed and what was passed over —
exactly what the CLI says on stderr, in the same sentences.

## The chapters, in order

**1. The tab knows a transcript when it sees one.** A core function,
`looksLikeClaudeCodeTranscript(text)`: true when the text is transcript
JSONL — lines whose `type` is the transcript's vocabulary and at least one
assistant line carrying `message.usage` — and false for a usage log, whose
lines are the records themselves. Deliberately per-file and deliberately
dumb: no scoring, no thresholds to tune, and a fixture suite that feeds it
both formats plus the near-misses (an empty file, prose, a usage log that
mentions the word "assistant" in a label).

**2. The folder, dropped.** The Bill tab's drop zone accepts directories:
`webkitGetAsEntry` walking for `*.jsonl` on drop, plus a folder-picker
button (`webkitdirectory`) for browsers and readers who prefer choosing to
dragging. Each file that looks like a transcript is converted in the page
with `claudeCodeRecords`, labelled with its project directory's name — the
per-project bill appears by itself; each file that is already a usage log
is taken as it is. One mixed stream feeds the same `analyze` path
everything else uses.

**3. The conversion says what it did, where the reader is looking.** A
banner above the report: how many transcripts, how many priced calls, how
many lines collapsed (one API call arrives as one line per content block —
the norm, not an anomaly), how many calls kept their final streamed
counts, and the sentence that earns the whole feature: *the transcripts
were read in this tab; the numbers were kept and the words were not.* Both
locales, the CLI's own phrasing wherever the CLI already has one.

**4. The guards.** Core: the detection fixtures, both directions. Web: the
no-fetch invariant untouched with the new code inside it; a planted secret
in a fixture transcript's message text that must not survive into any
state the component keeps after conversion; and the existing suites still
green — the drop zone grew, nothing else moved.

## What this deliberately does not ship

- **Watching the folder live.** The File System Access API could re-read
  on an interval; a page that keeps reading your disk after the drag is a
  different privacy conversation, and it is not had in a patch.
- **Other agents' transcript formats** — same refusal as 1.69, same
  reason: the command and the drop zone read the format they name; a
  second format arrives when a real transcript of it does.
- **Persisting the converted log anywhere.** It exists in the tab, like
  everything else the tab reads.
