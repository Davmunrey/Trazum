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

The two long ones are the interesting ones. Both were **claims nothing checked**
— a version number in prose, and an ordering nobody asserted — and both drifted
the moment the person maintaining them stopped hand-checking. Both now have
guards.

**Seven times** an assertion in this repository has been bounded by something
other than its subject: four contract harvests in `docs/json-output.md`, two
source harvests in `security.test.js`, and one phrase match in `profile.test.js`.
It is a doctrine rule now ([bound an assertion by its
subject](doctrine.md#bound-an-assertion-by-its-subject-never-by-its-neighbour)),
and the seventh was caught by its own planted probe rather than by a later
release — which is the argument for always planting one.

## What we cannot say about ourselves

The section this document would be dishonest without.

- **This project has no usage log of its own.** It optimises LLM spend and does
  not itself spend on LLMs in a way it measures. Every figure in the tables above
  is about *releases*, not about money, and the product's central claim — that it
  saves money — is not demonstrated here on its own traffic.
- **No outcome is recorded for any of it.** By the standard this product set in
  1.50.4, "the arc delivered" is a cost with no counterpart: nothing here says
  whether the features are used or whether they help.
- **The record is self-reported.** Every miss above was found and written down by
  the same process that made it. A miss nobody noticed is, by construction, not
  on this page, and there is no way to estimate how many of those there are
  without inventing a number.

That last one is the reason this document ends without a score.
