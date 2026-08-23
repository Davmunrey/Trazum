# The plan through 1.61 — the prompt writer — delivered

**All seven shipped — six chapters and the minor — landing at 1.61.0.** This
file is kept as it was written, before the code, rather than rewritten in
hindsight. It is history now, not a forecast: nothing described below is still
forthcoming, **except the one thing it said it would not build.** The optional
model-assisted polish needs a credential this repository does not have, and it
is still named rather than faked.

What the arc refused to ship, and what it got wrong, is in [our own
medicine](our-own-medicine.md).

Seven releases, one arc, following the one through
[1.60](plan-1.52-1.60.md). Six patches and the minor. The ordering was a
commitment; the calendar was not, and no dates appear here for the reason
[ROADMAP.md](../ROADMAP.md) gives.

This file was written **before the code**, which is the only version of a plan
this project keeps. What the arc refuses to ship is in it from the first draft,
under its own heading, because [what stays out gets its reason on the
record](doctrine.md#what-stays-out-gets-its-reason-on-the-record).

## The arc

Trazum has only ever read prompts somebody else wrote.

`optimize` finds the waste in one. `check` holds it to a budget. `rules
--measure` says what each rule recovers over a corpus. Every one of those
starts from a prompt that already exists, written by somebody who was guessing
at what to include — and the most expensive waste in a prompt is not the filler
the rules remove, it is **the paragraph that should never have been written and
the constraint that was never stated at all**.

This arc is the other direction: **you say what you want, the tool asks you
what it needs, and what comes out is a prompt whose cost and cleanliness are
known before it is ever sent.**

That is the first prompt in this product's history with those two properties.

## The tension, stated first

A prompt writer is a generative feature in a deterministic product, and the
first rule this repository has kept since 0.1.0 is that **the deterministic
core stays free and offline — no feature may make a network call a prerequisite
for optimising a prompt.**

The resolution is the same shape as `--pricing-live`:

- **The interview is deterministic.** A fixed catalogue of questions, chosen by
  rules over the answers so far. No model decides what to ask.
- **The assembly is deterministic.** Sections in a fixed order, filled from the
  answers. The same answers produce the same prompt, byte for byte, on any
  machine and in any locale.
- **The only generative step is optional and never a prerequisite**, and while
  this repository has no credential for one it stays **named and not built** —
  the same treatment 1.54.0 and 1.57.0 get, and for the same reason.

A writer that needs a key to write anything would make the offline rule a
footnote. This one produces its whole output with the network unplugged, and a
test proves it the way [#359](../RELEASES.md) proved it for `optimize`: `fetch`
replaced by a thrower before the CLI loads, and the draft has to come back
byte-identical.

## What it refuses to claim

**Not "the perfect prompt".** Perfect is a quality judgement about text nobody
has run yet, and [quality is recorded, never
inferred](doctrine.md#quality-is-recorded-never-inferred). A tool that graded
its own output would be doing the thing this product spent an entire arc
removing from its own advice.

Three measurable claims replace it, and each is printed rather than promised:

| Claim | How it is measured | What a failure looks like |
|---|---|---|
| **Complete** | Every required slot is answered, or explicitly declined and named in the output | A named gap, with what it would have unlocked |
| **Cheap** | The draft is priced against the configured model and budget | An estimate, marked as an estimate, next to the budget it does or does not fit |
| **Clean** | Trazum's own optimiser is run on the draft and the rules that fired are listed | A non-zero rule yield, printed rather than quietly fixed |

The third is the one worth having. **The product's own rules become the
acceptance test for its own output**: if `optimize` can still recover tokens
from a prompt this tool just wrote, the templates are wrong and the number says
so. A guard holds the shipped templates to a yield of zero, and it is proved by
breaking it — a template with a planted redundancy has to fail.

## The interview

A **slot** is one thing the assembly needs. Each carries an id, the question,
what it changes about the output, whether it is required, and which slots its
answer opens.

Three rules govern the asking, and all three are testable:

1. **A question is only asked when its answer can change the output.** Asking
   for a JSON schema when the output is prose is waste, and waste is this
   product's whole subject. Measured directly: for every slot, there is an
   answer set where including it changes the assembled prompt.
2. **The interview stops when no unanswered slot would change anything.** It
   says it is done rather than continuing to be thorough at somebody's expense.
3. **[A refusal never arrives bare.](doctrine.md#a-refusal-never-arrives-bare)**
   If required slots are unanswered it names each one and what it unlocks — the
   same `because` / `unlockedBy` shape the connected report has carried since
   1.53.

The slot catalogue is the design work of the first chapter, and it is prose in
a document before it is code, because the questions *are* the product here.

## The assembly

Sections in a fixed order: role, task, inputs, output contract, constraints,
examples, failure modes.

**The order is fixed for a reason this tool can price.** Prompt caching is a
byte-for-byte prefix match, so everything stable goes first and everything that
varies per call goes last — which makes the cacheable prefix as long as the
prompt allows. Trazum has been reporting the cost of getting that wrong since
1.20; writing it right by construction is the same finding from the other end.

## The document

`prompt-draft` joins the interchange format: `schemaVersion`, the slots
answered and declined, the assembled sections, the token count, the estimated
monthly cost with its basis, the rules that fired, and what was left unanswered.

It costs nothing to add correctly now. Since
[#363](../RELEASES.md) the contract tables are derived and every one must be
claimed by a guard, and since [#364](../RELEASES.md) the interchange index is
derived from the tables that exist — so a new contract that arrives undocumented
or unguarded fails the build rather than shipping quietly. **This is the first
contract added since those two landed, and it is the test of whether they
work.**

## The chapters

The order is the commitment. No patch number is pinned to a chapter, for the
reason [the 1.51 plan gives](plan-1.51.md).

| # | Chapter | What lands |
|---|---|---|
| 1 | **The questions** | The slot catalogue as a document, the interview policy, the three asking rules and the bare-refusal ban |
| 2 | **The assembly** | Fixed section order, the templates, the `prompt-draft` contract, byte-identical output for identical answers |
| 3 | **Measured, not asserted** | The draft priced and run through Trazum's own rules; the zero-yield guard on the shipped templates |
| 4 | **`trazum write`** | The terminal interview, both locales, and `--answers <file> --json` for a script that has the answers already |
| 5 | **The web surface** | The guided form, the cost updating as you answer, the same document underneath |
| 6 | **`prompt_writer` over MCP** | An agent gets interviewed too, and gets the draft back as the contract rather than as prose |
| — | **1.61.0** | The arc closes: you describe it, it asks, and what comes back is a prompt this tool cannot improve — measured, not claimed |

## What stays out, and why

- **Any claim that the new prompt is better than the one you had.** That is a
  comparison of quality between two texts nobody has run. The tool can say the
  new one is cheaper and that no rule fires on it; it cannot say it works
  better, and [a proxy refuses and never answers something
  else](doctrine.md#a-proxy-refuses-and-never-answers-something-else).
- **A score out of ten.** [Nothing continuous invents a
  number](doctrine.md#nothing-continuous-invents-a-number). A checklist with
  named gaps is the honest form of the same information.
- **Model-assisted rewriting as a prerequisite.** Optional, credential-gated,
  and not built while no credential exists here. Inventing the output of a
  model this repository cannot call is the estimating-and-measuring merge that
  1.36–1.40 spent five releases removing.
- **A library of somebody else's prompts.** Shipping a "best practices" corpus
  would mean asserting that prompts written for other people's tasks are good
  for yours, with no measurement behind it.

## What would make this arc a failure

Not slipping a chapter. **Shipping a writer whose output `trazum optimize`
still improves** — because then the product would be selling a cure for a
disease it had just caused, and the number proving it would be printed by the
tool itself.
