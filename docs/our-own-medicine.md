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
| #361 | The profile document's `schemaVersion` was stamped by the CLI, so `@trazum/core` emitted a profile `trazum conform` refuses | unknown, since the contract | 
| #355 | A transcript guard compared column padding and called it format, so it agreed or disagreed on whichever figures this repository happened to produce | 4 releases |
| #363 | `docs/json-output.md` called itself the contract while six of its fifteen tables had no guard at all — the roll-up documented three of its nineteen fields | **since the roll-up shipped** |
| #364 | `docs/format.md` and `README.md` said the interchange format was twelve documents, and the guard on that count compared the sentence to the table — both written by hand, so three missing documents left the two agreeing | **a second time on the same page** |
| #366 | `docs/doctrine.md` had no guard at all — emptying the file broke no test, in the page whose subject is checking what enforces your own rules | **since it was written** |
| #377 | Six prose pages had no guard at all — emptying `SECURITY.md`, `VERSIONING.md`, `docs/ci.md`, `docs/running.md`, `docs/accounts.md` or `docs/authoring-rules.md` broke no test | **since they were written** |
| #380 | Text inside a code span came out rewritten with every mask believed on — the segmenter's overlap handling skipped the legitimate match after discarding an illegitimate one | **since the masker shipped** |
| #379 | `optimize` run on its own output saved more — one pass missed its own cascades, found by a fuzzer on 1 input in 4,000 | **since the rules shipped** |
| #379 | `spend_guard` accepted `outputTokens: -500`, priced the call at −$0.0075 and said **yes** — a lie about output tokens bought an approval | **since the guard shipped** |
| #379 | A negative budget was judged `over` and a negative volume billed −$1.26 a month; `--cache-hit-rate 2` passed the flag door while the config door refused it | since 1.61.0 / **since the flag shipped** |
| #376 | Four of the five promises `docs/json-output.md` opens with were enforced by nothing — dollars as numbers, never rounded, tokens as integers, and no prompt text | **since the format was written** |
| #370 | `optimize` took any string as a level and ran `safe` in silence; the CLI had refused `--level balanced` by name since forever, so only a library caller got the quiet downgrade | **since levels existed** |
| #371 | `-o` parsed and did nothing — the parser rewrites it to `out`, so the key the code read could never exist — in a new command and as a dead fallback in `baseline` | unknown, in `baseline` |
| #373 | The web route wrote answers to a property whose name came from the request; CodeQL called it what it was | caught before merge |

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

## The arc closes on the number it could not produce

[The 1.52–1.60 plan](plan-1.52-1.60.md) committed 1.60 to one thing, in advance
and in writing: *make at least one of those three sentences no longer true, with
a measurement rather than an argument* — and, if it could not, *the honest
deliverable is a longer version of that page saying so, and the arc closes on the
number it could not produce.*

Four chapters later, the scoreboard:

| Admission | After the arc |
|---|---|
| The record is self-reported | **No longer true.** Five defects were found by CodeQL and by nothing here — an outside instrument, narrower than an audit, and the qualification is written beside it |
| No outcome is recorded for any of it | **Weakened, not overturned.** One outcome is on the record: the deterministic rules recover 0.5% from the only corpus this project owns |
| This project has no usage log of its own | **Still true, in full** |

**Why the third one stands, and what would have made it fall.** This project
would have to spend money on models and record what it spent. It does not spend:
the deterministic path makes no calls at all, and the model-side passes run on the
user's key, on the user's bill. What could be counted was the cost this project
*imposes* — 1176 tokens of system prompt on every model-side run — and that is
counted, above, under a heading that says it is a different sentence. Merging the
two would have been this document's own first doctrine rule broken on its own
page.

**Why the second one is only weakened.** *Whether it helps* needs somebody it
helped, and there is no such person on this record. *Whether it is used* has one
available instrument and the instrument was refused: npm download counts are
fetches, not uses — mirrors, CI runners and bots are in the total, so the figure
bounds **above** and nothing bounds below. `A floor can prove "over" and can never
prove "under"` is on this project's doctrine list, and quoting a ceiling as
evidence of adoption is that rule inverted. A number that cannot be checked is
worse here than a gap that is named.

**So the arc closes at one of three**, which is what it asked for and less than it
hoped for. What it produced along the way is the part worth keeping: an outside
instrument's findings tabulated, the tokens this project puts on other people's
bills counted for the first time, its own gate finally running on itself, and four
defects in its own conduct written down — a rule it broke for as long as the rule
existed, a recipe that named two of three places, a page that overstated a
volunteer's work tenfold, and a gate flag that gated nothing.

**And the sentence the whole document ends on is unchanged.** A miss nobody
noticed is still, by construction, not on this page.

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

## The loop this product sells, inert in the repository that sells it

`trazum init` writes a config. `trazum baseline` records what a repository's
prompts cost. `trazum check` fails a build when they grow past the recorded
figure. All three shipped arcs ago, they are what
[docs/ci.md](ci.md) tells other people to run — and **this repository had no
config and no baseline of its own.** Every release since 1.41 argued that a
complete loop nobody runs is not a loop. This one was not run here.

It is now: `trazum.config.json` and `trazum.baseline.json` are committed, CI runs
the gate, and a pull request that grows the sample prompts past the recorded
figure fails — checked by growing them and watching it exit 1, not by reading the
flag.

**Two things that came out of taking it, and neither is flattering.**

**A gate flag that silently gates nothing.** `check --baseline` against a config
with no `baseline` block prints nothing about the baseline and exits 0. The flag
is read as `config.baseline !== undefined && boolFlag(...)`, so a missing block
*disables* the gate instead of failing the run — a green build that checked
nothing, from a command invoked with the flag that asks for the check. That is
`a guard that quietly stops guarding is worse than no guard`, in this project's
own CLI, found the first time it was pointed at this repository.

**And the reason nobody committed a baseline here before.** Run at the root with
the default extensions, `trazum baseline` records **74 prompts and 509,255
tokens** — the README, the changelog, the roadmap. Directory mode's defaults are
`.txt .md .prompt .tmpl`, which in a documentation-heavy repository reads prose
as prompts, and a baseline like that fails the build on every doc edit. The gate
here is scoped to `examples/` for exactly that reason, and the scoping is the
honest fix rather than a workaround: **the prompts this project actually ships to
models live inside `.ts`, where the baseline gate cannot see them at all.** Their
cost is measured in the section above and guarded by a test, because the
product's own mechanism cannot reach them.

**And the gap that had to be closed before any of it was possible.** Directory
mode decided what a prompt was from the extension alone, and there was no way for
a repository to say otherwise — no `ignore`, no include list, nothing. So the
first honest attempt at a config here made `trazum doctor` report *35 of 37
prompts have no budget* and list this project's own test fixtures. The feature
that fixes it is a real one other people need too: `ignore` takes globs, skips a
matched directory whole, and refuses a pattern that climbs out of the project.

**What this does not establish.** Two sample prompts are not an estate, the
record starts today, and a gate that has never fired in anger is a gate that has
been proved and not yet used. `Record, do not reconstruct` says to start
recording, say which day recording started, and let the record be short until it
is not. It started 2026-08-22.

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
