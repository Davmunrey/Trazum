# 1.75 — The readable terminal

*Written before the code, like the fifteen plans before it.*

## The thesis

The CLI's reports are honest and dense, and dense won the fight. A forty-day
profile prints twelve sections of correct prose with the same visual weight on
every line: a $1,762 lever, a caveat about milliseconds, and the licence of a
number all arrive in the same grey. The reader the reports were written for —
somebody with forty seconds and a bill — gets a wall.

The fix is not new sentences. Every sentence stays; every figure stays; the
locale machinery stays. What changes is that the terminal output finally gets
what the HTML report and the markdown export already have: a hierarchy you can
see from a metre away. This arc is presentation only, and the guard in chapter
four is what makes "only" enforceable.

## Chapter 1 — The style module

`packages/cli/src/style.ts`. The six painters move out of `index.ts` unchanged;
around them, what eleven hand-built tables have each rebuilt badly:

- `visibleWidth(s)` — a string's width with its ANSI codes not counted. Every
  `padStart` in the file today miscounts the moment a painted cell reaches it,
  which is why nothing painted sits in a column. Measurement first.
- `padCell(s, width, align)` — padding that measures with `visibleWidth`.
- `table(columns, rows)` — one renderer: per-column alignment, widths taken
  from the content, header row dimmed. Eleven local layouts become one.
- `bar(share, width)` — a proportion as `█████░░░░░`, for a share the line
  already states as a percentage. The bar never carries information the text
  does not; it is the same number, readable from further away.
- `sectionHeading(text)` — the heading bold, completed to the report's width
  with a dim rule: an anchor line a scrolling eye can stop on.
- Colour detection grows one door: `FORCE_COLOR=1` turns the painters on with
  no TTY, because a guard that wants to assert what colour does needs to see
  it under a pipe. `NO_COLOR` still wins in a terminal; a pipe still defaults
  to plain.

## Chapter 2 — The profile, repainted

The flagship report, and the one a first `trazum init` points at. Sections get
the heading rule. The spend split, the per-label and per-model rows get the
proportion bar. The columns that were hand-padded go through `table`. Warnings
keep their `!`, levers their `→`, and both keep their tints — this chapter
moves paint, not prose.

## Chapter 3 — The same system at the other doors

`models`, `optimize`, `check`, `init`, `switch`, `diff` — the surfaces a new
reader actually meets — adopt the same three devices: heading rule, shared
table, proportion bar where a share is already printed. No command gains a
sentence it did not have. A door not repainted in this arc is listed in the
release notes rather than left to be discovered.

## Chapter 4 — The guard: colour adds nothing

A test runs a command twice over the same fixture — `FORCE_COLOR=1` and
`NO_COLOR=1` — strips the ANSI codes from the first, and asserts the two are
byte-identical. Decoration that survives the strip is content; content that
appears only when painted is information hiding in a channel a pipe cannot
see. Both directions are the defect, and one assertion catches both. A second
assertion keeps the pipe plain: no ANSI ever reaches a non-TTY without
`FORCE_COLOR`, because every consumer of `trazum ... | grep` is owed the
output the tests were written against.

## What this refuses to do

- No new figures, no reworded sentences, no reordered sections. A reader who
  memorised the plain report reads the painted one with the same memory.
- No dependency. The painters are six escape codes; a colour library is
  someone else's code on the path that reads prompts.
- No themes, no config keys. `NO_COLOR`, a pipe, or `FORCE_COLOR` — the three
  switches that already exist in the ecosystem, and nothing of ours beside
  them.
