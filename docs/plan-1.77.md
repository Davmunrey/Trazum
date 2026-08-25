# 1.77 — The agent's bill, told honestly

*Written before the code, like the seventeen plans before it.*

## The thesis

A real forty-day Claude Code profile ran through this tool and answered
well. It also said four things it should not have had to say.

Every one of its 10,393 calls arrived unlabelled, so the levers described a
mixture instead of a decision. 164 calls sat outside the totals because the
catalogue did not recognise their ids. Some of those ids were not models at
all. And three separate sections reported that no answer could be checked
for truncation, because a field the transcript carries never reached the
log.

None of that is the profiler being wrong. It is the converter handing the
profiler less than the transcript already knows, and then the profiler
being scrupulously honest about the gap. This arc closes the gap at its
source.

## Chapter 1 — A dated id is not an unknown model

`claude-haiku-4-5-20251001` is not a mystery: it is the canonical API id
for a model the catalogue already prices under its short alias. Yet it
lands in `unpriced`, and a total that quietly omits calls is wrong in the
flattering direction, so the report names it and stops.

`ModelPricing` gains `aliases`, and the catalogue indexes every alias
beside its id. **Declared one line at a time, never derived.** A rule that
stripped anything resembling a date from an id would be a machine guessing
that two ids bill alike, and this product's one unforgivable sin is
inventing a price. An alias is a statement — *this exact id bills at this
exact rate* — reviewed the same way a price is. `parsePricingOverlay`
accepts `aliases` too, so an operator can declare an id the bundled set has
never met without waiting for a release.

## Chapter 2 — `<synthetic>` is not a model

Claude Code writes `<synthetic>` in the model field for assistant turns it
produced locally: interrupts, error notices, messages that never reached an
API. They carry a usage object full of zeros and no provider ever billed
them.

Priced, they are noise. Dropped silently, they are a hole. So the converter
excludes them **by name** and counts them, and the command says how many it
left out and why. A skipped record nobody mentions is the same defect as an
unpriced one nobody mentions, wearing the other hat.

## Chapter 3 — The field that was there all along

The transcript records `stop_reason` on the assistant message. The
converter never read it, so every downstream report that depends on it —
truncation, the retry bill, the coverage gate — answered "cannot be
measured" on a log whose source knew the answer.

It is read and emitted now. Nothing is inferred: a turn without the field
still produces a record without it, and the profiler still says so.

## Chapter 4 — A folder of projects is a folder of workloads

`--label-from-project` already exists and nobody finds it, which is why a
real run produced `label` on 0 of 10,393 records and a report that could
only describe a mixture. The web app's folder drop has labelled by project
since 1.70; the two surfaces disagreed about the same gesture.

For a **directory** target, labelling by project folder becomes the
default, with `--no-label-from-project` to decline it. A single file is
untouched: one file is one workload only if the caller says so.

Claude Code names those folders by encoding the project's absolute path,
`/` becoming `-`. The label is the last segment of that encoding, which is
the project's own directory name — a documented decoding, and the raw
folder name whenever decoding would leave nothing.

## Chapter 5 — The guards

- An alias resolves to its model's price, and an id that is *not* declared
  still refuses. The mechanism must not become a fuzzy matcher.
- A `<synthetic>` line is excluded, counted, and reported; a real model
  whose name merely contains angle brackets is not.
- A transcript carrying `stop_reason` produces records carrying it, and one
  without still produces records without.
- A directory labels by project by default and `--no-label-from-project`
  turns it off; a single file still labels only on request.
- The end-to-end proof: a fixture shaped like a real `~/.claude/projects`
  tree converts, and the profile of its output has labels, prices every
  call, and can answer the truncation question — the four sentences the
  real run could not produce.

## What this refuses to do

- No id is priced by resemblance. Every alias is declared and reviewed.
- No `<synthetic>` line is priced at zero and counted as a call; it is not
  a call.
- No `stop_reason` is inferred from an output length that looks round.
- No new command. Four commands' worth of honesty was already latent in
  data the tool was throwing away.
