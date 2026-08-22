# Our own medicine

This project gates other people's promises, refuses to let them merge a measured
figure with an estimated one, and insists that a plan which did not arrive says
so out loud.

A tool that does that and never shows its own record has a double standard. So
here is Trazum's, kept the way it asks yours to be kept.

Everything below is drawn from `CHANGELOG.md`, `RELEASES.md` and `ROADMAP.md` in
this repository. Nothing here is computed; it is a reading of documents that
already exist, which is the same constraint `trazum report --year` operates
under.

## What we predicted, and what arrived

Three arcs have been planned in advance and written down before the code:
[`docs/plan-1.30-1.35.md`](plan-1.30-1.35.md),
[`docs/plan-1.36-1.40.md`](plan-1.36-1.40.md),
[`docs/plan-1.41-1.50.md`](plan-1.41-1.50.md) and
[`docs/plan-1.51.md`](plan-1.51.md).

**All four arcs delivered every chapter they named**, in the order they named
them. That is the good half of the record and it is the half worth trusting
least, because a plan written by the same hand that implements it is a plan that
can be quietly bent toward what was easy.

So the honest measure is not "did the chapters ship". It is **what each chapter
refused to ship**, which is recorded per release under *What stayed out, and
why*. A sample:

- **1.50.3** declined the rest of the command set over MCP, because those
  commands read files and the server had promised since it shipped that it reads
  nothing from disk.
- **1.50.5** declined per-outcome figures in `plan`, because `plan` ranks by
  money saved and an action that saves money while raising the cost per
  resolution would rank *higher* — the ranking needed rethinking, not a column.
- **1.50.7** declined splitting traffic in the gateway, because assigning arms
  there would mean the proxy choosing which model answers, which is the one
  behaviour 1.50.3 built its type system to prevent.
- **1.50.8** declined posting its sentence on a pull request, because the Action
  does not know when a deploy happened and would have judged a change against
  traffic that predates it.
- **1.50.11** declined recommending whether to sign a commitment, because that
  depends on how confident somebody is that next year resembles last year.

Each of those is a feature a roadmap would list as delivered if the standard
were "something shipped under that heading".

## What we got wrong, in public

Every release since 1.37 has carried a section called *What this release found
wrong in itself*. It exists because a tool that only reports other people's
misses is a tool nobody believes. A selection, and these are the real ones:

| Release | What was wrong | How long |
|---|---|---|
| 1.45 | `RELEASES.md` said the wrong published version | **17 releases** |
| 1.45 | The README command-count guard was blind to unknown number words | 5 releases |
| 1.50.3 | `serve`'s `POST /cost` shipped with no documented contract | 1 release |
| 1.50.3 | The gateway merged with **no changelog entry at all** | caught at release |
| 1.50.9 | The semantic pass discarded findings at 0.8 while a comment claimed it matched the rules engine's 0.92 | caught same day |
| 1.50.11 | The Action pins were advanced to the *feature* commit, not the release commit | caught by the pin guard |
| #265 | `ROADMAP.md`'s Released section ran in two directions | **24 releases** |
| #265 | A waiver record was written to the terminal's directory, and one reached `main` as a tracked file | 2 releases |
| #288 | `ROADMAP.md`'s `## Next` still called a delivered arc "in progress" | 2 releases |
| #289 | The README hero said "fourteen findings" while the paragraph under it said "Thirteen advisories" | **52 releases** |
| #290 | `outcome-report` was a contract whose only implementation failed it, missing `schemaVersion` | **9 releases** |
| #290 | `trazum report --year --json` printed prose before the document, so no machine could read it | caught same day |
| #294 | `CONTRIBUTING.md` said `npm test` ran two suites; it runs five, and CI's step names hid MCP too | unknown, since MCP shipped |
| #295 | `docs/releasing.md` said "both manifests" and "both publish steps" with three packages | unknown, since MCP shipped |
| #346 | Five of the seven phrase dictionaries were described as covering languages nobody here reads | **since they shipped** |

The long ones are the interesting ones, and the longest is the newest: **the
front page of this project contradicted itself about the number of advisories
for fifty-two releases.** All of them were **claims nothing checked** — a version
number in prose, an ordering nobody asserted, a count stated twice in two
different nouns with a guard reading only one. Each drifted the moment the
person maintaining it stopped hand-checking, and each has a guard now.

**The #346 row is a different shape from the rest, and worse.** Every other row
is a claim nothing checked — a version number in prose, a count stated twice. That
one is a rule this project wrote for itself and then broke: *a dictionary is a
judgement about a language and this project will not make it in a language nobody
here reads*, held up for several arcs as the reason an eighth language was not
scheduled, while five dictionaries that had never been read by a speaker were
already shipping. A guard cannot catch that; only re-reading the rule against the
catalogue can, and nobody did for as long as both existed.

It is fixed the way this project fixes things rather than the way it would be
tempting to: the five stay, because a Dutch prompt is better served by a
dictionary that fires and says it was never reviewed than by silence, and the
report now says which five. What the role would actually involve is written down
in [maintaining a language](language-maintainer.md), so the sentence about it
being "not in my gift" costs something to say.

The #290 row is the one that should be uncomfortable. `outcome-report` was
declared a contract, given field rules and cross-rules, documented as something
another tool could build against — and the only implementation of it in this
repository did not conform to it. A format whose reference producer fails its
own check is worse than no format, because a tool mirroring it inherits the
defect and looks interoperable.

**Ten times** an assertion in this repository has been bounded by something
other than its subject. It is a doctrine rule now ([bound an assertion by its
subject](doctrine.md#bound-an-assertion-by-its-subject-never-by-its-neighbour)),
and the count kept going up after the rule was written, which is the honest part.

The seventh was caught by its own planted probe rather than by a later release —
the argument for always planting one. The eighth was the README's advisory count
above. **The ninth was the one that showed the earlier eight had been miscounted
and mis-fixed.**

The tally used to read "four contract harvests in `docs/json-output.md`". There
were **eight**, and every one ended its harvest by naming the section that came
after it. Each time one broke, the fix was to name the *new* neighbour — which
set the same trap one section further along. Documenting two contracts in the
middle of that file broke four suites in a single commit. A ninth harvest was
worse: it carried the comment *"Bounded to its own section, like every other
harvest in this repository"* above a slice that ran to the end of the file,
bounded by nothing and passing only because its section happened to be last.

**And the doctrine itself prescribed the fix that kept re-arming the trap.** The
rule said *"name the end as well as the start"* — which is exactly what each
repair did. The canonical document was telling every future reader to set the
trap one section further along.

They now share one helper that ends at the next heading, whatever it is, and a
test fails if any suite goes back to naming one. That is the difference between
fixing an instance and closing a class, and it took nine instances to make it.

**And then it happened again.** The tenth was a guard written to catch a
miscount in `docs/releasing.md`, three changes after the doctrine entry was
rewritten to warn about this exact shape. It matched every quantity word beside
the word "manifest" or "upload" anywhere in the file, and failed two sentences
that were correct — one counting a different set of manifests, one using "two"
to mean consecutive. It never merged, because it was run against the real
document and not only against the defect it was written for. That is the whole
defence, and it is a habit rather than an insight.

## What we cannot say about ourselves

The section this document would be dishonest without.

- **This project has no usage log of its own.** It optimises LLM spend and does
  not itself spend on LLMs in a way it measures. Every figure in the tables above
  is about *releases*, not about money, and the product's central claim — that it
  saves money — is not demonstrated here on its own traffic.
- **No outcome is recorded for any of it.** By the standard this product set in
  1.50.4, "the arc delivered" is a cost with no counterpart: nothing here says
  whether the features are used or whether they help.
- **The record is *almost* self-reported**, and the exception is counted below
  rather than waved at. A miss nobody noticed is still, by construction, not on
  this page, and there is no way to estimate how many of those there are without
  inventing a number.

That last one is the reason this document ends without a score.

## The tokens this project puts on your bill

The admission above says this project has no usage log of its own — it optimises
LLM spend and does not itself spend on LLMs in a way it measures. **That is still
true, and this section does not make that admission false.** It measures the
other side of the same sentence: not what this project spends, what it *causes
you to spend*.

Four system prompts ship inside `@trazum/core` and are sent to a model on every
`--llm`, `--suggest`, `--semantic` and examples-review run — on your key, on your
bill, before a single token of your own prompt is counted. A tool that reports
other people's prompt cost and had never counted its own is the self-report
problem in its most literal form.

Measured by running the optimiser on them, at the aggressive level:

| Prompt | Tokens | Recovered |
|---|---|---|
| `suggest` | 291 | 2 |
| `semantic` | 382 | 4 |
| `refiner` | 198 | 0 |
| `example-review` | 305 | 0 |

**1176 tokens**, and this project's own deterministic rules recover **6 of them**
— half a per cent. Eleven of the twelve rules are inert on all four; the six
tokens come entirely from `emphasis`, which lower-cases shouted words.

**The honest reading is not "the rules are bad".** These are prompts written to
be read by a model, edited repeatedly, with no politeness, no hedging and nothing
repeated — which is exactly the shape the dictionaries have nothing to say about.
It is the same result `rules --measure` produced on `examples/`, on a corpus
nobody could accuse of being adversarial: the deterministic side recovers close
to nothing from text that was already written carefully.

**What this establishes.** One outcome, recorded rather than inferred: on the only
corpus this project owns, the feature this product leads with recovers 0.5%. By
the standard set in 1.50.4 that is a real outcome measurement, and it is the first
one on this page that is about the product working rather than about the process
around it.

**What it does not establish**, written here rather than left to be assumed:

- **Nothing about whether users benefit.** Four prompts are not a corpus, and
  they are the least representative four imaginable — written by the person who
  wrote the rules, in the language the rules cover best.
- **Nothing about the model-side passes.** The 1176 tokens buy `--suggest` and
  `--semantic`, whose findings a dictionary cannot make. Whether that trade is
  worth it needs the measurement the 1.57 arc is blocked on, and this is not it.
- **It is still self-reported.** The optimiser measuring its own prompts is the
  same process marking its own work, one layer in. The CodeQL table above is the
  only thing on this page that is not.

**The uncomfortable arithmetic, stated because leaving it out would be the
omission this document exists to refuse:** if the deterministic rules recover
about one per cent of a prompt, then for any prompt under roughly thirty thousand
tokens, a single `--suggest` run spends more tokens carrying this project's own
instructions than the rules recover from yours. Those are different budgets —
one is a per-call cost you opt into, the other is a saving on every call forever
— and the comparison is not apples to apples. It is also the first thing a
sceptical reader would compute, so it is computed here.

## The one sentence that stopped being true

This page used to say every miss on it had been found and written down by the
same process that made it. That was the deepest of the three admissions, and it
is no longer accurate.

**Five defects on this record were found by CodeQL**, in 1.8.0, 1.46.0, 1.50.3,
1.53.4 and 1.55.0. Not one of them was caught by a test in this repository:

| Release | What it found |
| --- | --- |
| 1.8.0 | A validated URL and a fetched URL were two different expressions, so nothing on the path from option to `fetch` was a barrier. **It kept the alert open twice**, against this project's judgement, and was right both times. |
| 1.46.0 | A time-of-check/time-of-use race: a size bound taken with `stat` and the file then read by name. |
| 1.50.3 | Two unanchored host patterns in a credential guard — and it was right about more than the lint, because the same pattern passes on `api.anthropic.com.evil.com`. |
| 1.53.4 | A ReDoS in a guard this project had just written, **whose own proof would have passed against the vulnerable version**. |
| 1.55.0 | A file-system race in a new command, on the pull request that introduced it. |

**What that does and does not establish.** It is not an independent audit: CodeQL
runs because this project turned it on and keeps it on, and it would stop the day
somebody here removed a workflow file. What it is, is an **outside instrument
whose rules this project did not write and cannot argue with** — which is why the
1.8.0 entry is the important one. This project dismissed that alert, twice, and
the instrument was right and this project was wrong. A self-report cannot contain
that shape by definition.

**Every other line on this page is still self-found**, and the two other
admissions above are untouched: there is still no usage log of this project's
own, and still no outcome recorded for any of its work. One sentence of three
moved, which is what the arc asked for and not more.

**Counted rather than argued**, and reproducible: search `RELEASES.md` for
`CodeQL`, and read the release each mention sits in. `docs.test.js` fails if a
release named in the table above stops mentioning it, so the list cannot quietly
grow past its evidence.
