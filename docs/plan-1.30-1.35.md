# The plan through 1.35

Six releases, in order, with the reasoning attached. The ordering is a
commitment; the calendar is not, and no dates appear here for the reason
[ROADMAP.md](../ROADMAP.md) gives.

Every item is judged against the same sentence the roadmap uses: *Trazum
reduces what an AI call costs without changing what the prompt asks for.* And
against the two rules that constrain everything — the deterministic core stays
free and offline, and a locale changes the report, never the optimisation.

## The arc

1.10.0 through 1.29.0 built **the bill**: where the money went, what it would
have cost elsewhere, and gates that fail a build. That work is close to
complete. What it does not yet do is close the loop — the report names a
finding and a human decides what to do about it, every time, from scratch.

The next six releases are about **the loop**: from a finding, to a decision,
to a decision that survives the next report.

| Version | Theme | The sentence it earns |
| --- | --- | --- |
| 1.30.0 | The report as a diff | What changed since the last report, and what it cost. |
| 1.31.0 | The gate that explains itself | A failing build says what to change, not only that it failed. |
| 1.32.0 | The routing decision, priced whole | What if this workload moved — including what would break. |
| 1.33.0 | The log Trazum cannot read yet | Every provider's shape, or an honest refusal per field. |
| 1.34.0 | The findings as policy | A finding accepted or waived, in the repository, with a reason. |
| 1.35.0 | The reader who is not in the terminal | The report where the decision is actually made. |

Patch releases (`X.Y.1`, `X.Y.2`) sit between these whenever a batch is thin —
a fix, one small finding, a documentation correction. A minor is earned by
roughly three findings that change what somebody can decide, not by a date.

---

## 1.30.0 — The report as a diff

`--against` compares two logs and names the drivers. It answers "did the bill
grow" but not "is this the same bill" — a report whose *shape* changed (a
workload appeared, a model vanished, coverage of a field collapsed) can hold a
flat total and still be a different product.

- **`--against` gains shape drift.** Beside the dollar drivers: workloads that
  appeared or vanished, models that entered or left, and fields whose coverage
  moved — "`session` was on 98% of calls and is now on 4%" is a bill that
  stopped being measurable, and no dollar figure says so.
- **A finding that resolved is stated, not silently dropped.** A truncation
  finding present last week and absent this week is either a fix or a log that
  stopped recording `stop_reason`. These are opposite facts and the report
  must not render them the same way — the coverage half decides which.
- **`--against` for the gates.** `--max-growth-usd` exists; the shape half
  gets its own refusal: a comparison where the previous log measured a field
  the current one does not fails rather than passing on an improvement it
  cannot see.

## 1.31.0 — The gate that explains itself

A gate today prints a verdict and an exit code. Somebody reading it in CI has
to open the report themselves to learn what to change — and CI is exactly the
place where nobody does.

- **Every failure names its largest contributor and its cheapest lever.**
  Not advice about the product; arithmetic already in the report: which slice
  carries the overage, and which of the existing levers (routing, Batch,
  caching, the ceiling on shortening) would cover it.
- **`--explain` on a passing gate.** The margin, and what would have to change
  for it to fail — a pass at 2% under budget and a pass at 60% under are
  different states of the world and only one of them is quiet news.
- **The GitHub Action posts the failure it caused**, once, as a job summary
  rather than a comment, so a red build carries its own reason without needing
  a token to write anywhere.

## 1.32.0 — The routing decision, priced whole

`--what-if` prices the same tokens at another model's rates and says so is
multiplication, not advice. That honesty is right and it is also incomplete:
the decision it feeds needs the *other* consequences on the same page.

- **What would break, next to what would be saved.** Context-window
  overflows are already named; add cache economics under the target (a model
  with a different cache minimum or multiplier changes the saving), and the
  slices whose `max_tokens` ceiling sits above the target's limits.
- **`--what-if` per slice, not only whole-log.** The routing decision is made
  per workload; a whole-log figure hides a workload that must not move.
- **The refusal stays load-bearing**: nothing here claims the target model can
  do the work, and the caveat keeps travelling inside the object.

## 1.33.0 — The log Trazum cannot read yet

`fieldCoverage` names what a log does not carry. The next step is reading more
of what logs actually do carry, without ever guessing.

- **More provider shapes, each explicit.** Anthropic and OpenAI field names
  are read today; add the shapes that are unambiguous (Bedrock, Vertex,
  OpenRouter) as *recognised* formats, and refuse the ambiguous ones by name
  rather than mapping them hopefully.
- **A `--dry-run` reader.** Point Trazum at a log and it reports what it would
  and would not be able to answer, without producing a bill — the question
  somebody has before they wire it into CI.
- **Never invent a field.** A shape that carries no cache split is reported as
  a log with no cache split. Filling one in from a ratio would be this tool
  doing the guessing it exists to end.

## 1.34.0 — The findings as policy

Trazum finds the same thing every run. A team that has looked at a finding and
decided to live with it currently has no way to say so, so the finding shouts
forever and the report loses authority.

- **`waive` in `trazum.config.json`**: a finding id, a reason (required, in
  prose), and an expiry (required, a date). No permanent waivers — a waiver
  with no end date is a finding deleted with extra steps.
- **Waived findings are shown as waived, never hidden**, with the reason and
  the days left. The bill still counts them; only the alarm is quiet.
- **An expired waiver fails the gate it silenced**, loudly, naming the date it
  expired and the reason somebody wrote. That is the entire mechanism by which
  a waiver stays a decision instead of becoming a habit.

## 1.35.0 — The reader who is not in the terminal

Everything above is decided by whoever runs the CLI. The person who owns the
budget usually does not.

- **`--markdown` grows a summary mode** aimed at a pull-request body or a
  weekly note: the three figures that changed, the one lever that would move
  the most money, and nothing else — with a link to the full report rather
  than an inline dump of it.
- **The web bill accepts a comparison**, so the same before/after story the
  CLI tells is readable without a terminal.
- **A shareable report stays local by construction.** The web app renders what
  is handed to it; nothing is uploaded, nothing stored, and the document says
  so where somebody about to paste a log will read it.

---

## What is deliberately not here

- **A tokenizer per model family.** Still gated on measuring the error band
  across families, exactly as the roadmap says. Deciding without that number
  is deciding without the one number that settles it.
- **Cost alerting as a service.** Needs somewhere to run and something to
  remember. `check --max-tokens` and the spend gates already cover the
  threshold case for anyone content to read the answer on a pull request.
- **More trimming locales.** Unchanged: a language needs a maintainer who
  reads it, and asserting a shorter prompt means the same thing is a judgement
  nobody here can make in a language they cannot read.
- **Anything that makes the optimiser require a network.** Rule 1.
