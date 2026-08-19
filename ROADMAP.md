# Roadmap

What Trazum is for, what is already true, and what comes next — in order, with
the reasoning attached. Dates are deliberately absent: the ordering is a
commitment, the calendar is not.

**Product line.** Trazum reduces what an AI call costs without changing what
the prompt asks for. Every item below is judged against that sentence. A change
that saves tokens but risks the meaning does not ship; a change that saves
money without touching the prompt at all — caching, batching, model choice —
counts just as much as shortening it.

**Two rules that constrain everything here.**

1. *The deterministic core stays free and offline.* No feature may make a
   network call a prerequisite for optimising a prompt. Anything that needs a
   remote service is opt-in and degrades to the deterministic path.
2. *A locale changes the report, never the optimisation.* The same prompt in
   any language produces the same optimised prompt, the same token counts and
   the same advisory ids.

---

## Released

### 0.1.0 — Deterministic core

The bet: rules first, model second. Most prompt bloat is mechanical —
courtesy, filler, verbose phrasing, paragraphs pasted in twice — and a rules
engine removes it reproducibly, for free, with no API key and no round trip.

- 12 rules across two levels (`safe`, `aggressive`).
- Protection pass: code fences, inline code, URLs, template placeholders and
  XML/HTML tags are isolated *before* any rule runs, so no rule can
  structurally break a prompt.
- Dependency-free heuristic token estimator. Published at ±15% here, which was a
  design target and not true; measured and made true in 1.9.0.
- Pricing catalogue with promotional pricing and per-model cache minimums.
- Advisories: caching, Batch API, model tier, context window.
- Optional, pluggable LLM pass with safety checks — a candidate is only
  accepted when it is shorter and leaves protected content byte-identical.
- CLI (`optimize`, `check`, `models`, `rules`) and a Next.js web app.

### 0.2.0 — Caching measured honestly

Fixing a real imprecision: savings were computed over the whole prompt, but
prompt caching is a byte-for-byte prefix match, so a template only caches up to
its first placeholder. Reporting the full-prompt figure overstated the saving
on exactly the prompts people cache most.

- `analyzeCachePrefix` measures the true stable prefix.
- New `cache-prefix-reorder` advisory: finds stable instructions stranded
  *after* the first placeholder, which today never cache, and prices moving
  them in front.
- Packaged GitHub Action for `trazum check`, with a self-test in CI.

### 0.3.0 — English-first, with real internationalisation

The repository is English end to end: source, comments, tests, docs, CLI, web,
CI. Spanish did not get deleted — it got promoted from hardcoded prose to a
locale, which is the only version of "add a language" that survives contact
with a second one.

- Per-locale message catalogues in every package (`core`, `cli`, `web`).
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` take a locale; the report carries it.
- CLI `--locale`, then `TRAZUM_LOCALE`, then the POSIX variables.
- Web negotiates `Accept-Language` server-side and offers a switcher whose
  choice is remembered.
- Catalogue-parity tests, so a locale cannot silently go stale.
- Sample prompts per language, both exercised by the action self-test.

### 0.4.0 — Reading structure, not just phrases

Every rule until now matched a phrase. The waste this release goes after is a
*relationship* between two places in the prompt — neither of which is wrong on
its own, which is exactly why a dictionary cannot see it.

Both findings are advisory. A contradiction has a right answer only the author
knows, and an example that looks redundant may be demonstrating a boundary case
on purpose. Trazum points; it does not cut.

- **Contradictory instructions.** "Answer in English" three paragraphs above
  "reply in the customer's own language" is a correctness bug that also costs
  tokens twice. Four axes are checked: response language, output format,
  response length, and whether to show the reasoning. Reported as a *warning*,
  not an opportunity — it carries no dollar figure because being wrong has no
  price tag.
- **Redundant few-shot examples.** Examples that are near-copies of an earlier
  one, priced per month. See the honest limit below.
- **Advisory ordering by severity.** Sorting purely on money buried an
  overflowing context window underneath a $2 saving. Warnings now come first.
- **Bug found while building this:** the `duplicate-lines` rule was deleting
  the shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often the reason both are there. Labelled example fields are now exempt
  from deduplication.

**What the example detector does not do.** It finds near-copies — measured at
~0.89 similarity for a copy-paste with one field changed, ~0.80 for a lightly
edited one — and deliberately stops short of paraphrases, which score ~0.54,
close enough to two genuinely distinct examples (~0.20) that catching them
would mean flagging examples that teach different things. Recognising that
"arrived quickly" and "arrived fast" teach the same lesson needs a model, not
word-set overlap. That belongs to the optional LLM pass, and is listed under
0.7.0 rather than pretended to here.

**Shipped alongside it:** the security pass that took the repository open
source — four SSRF filter bypasses, two ReDoS denial-of-service bugs (one in a
`safe`-level rule since 0.1.0), enforced invariants in CI, and the Next 16
upgrade that finally cleared the `postcss`/`sharp` advisories. See
[SECURITY.md](SECURITY.md).

### 0.5.0 — Output formats stated twice

Third structural finding, same posture as the first two: it reports, it does
not cut. A prompt that shows its schema in a code block and then walks the same
fields in prose is paying for the schema twice, and the block is the version
worth keeping — it is unambiguous, and the protection pass already guarantees
Trazum will never edit it.

- New `restated-output-format` advisory, priced per month.
- Reads illustrative schemas, not just valid JSON. Prompts routinely show
  trailing commas, `...` and `<placeholders>`; refusing to parse those would
  skip exactly the prompts worth checking.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification — "set `escalate` to true when the customer asks for a human" —
  and flagging it would turn the advisory into noise.

### 0.6.0 — The aggressive level, made reviewable

`aggressive` has always come with the advice "read the diff", and the diff was
one undifferentiated block for every rule at once. That is not review, it is a
wall of text with a warning attached — so in practice nobody ran the level that
saves the most.

Each rule now carries a short list of what it actually changed, so an
aggressive run is judged rule by rule and a single rule you disagree with is
disabled with `--disable`, instead of abandoning the whole level.

- `RuleResult.changes`: capped before/after pairs, with `hits` carrying the
  true total. Empty rather than truncated when the change is too large to
  summarise — an empty list reads as "nothing to show", a truncated one would
  read as "this is all that happened".
- Bounded by construction, like everything else that touches untrusted text:
  common prefix and suffix are trimmed in linear time, and anything still too
  large is skipped rather than diffed.
- Shown in the CLI and the web app for aggressive rules, and for every rule
  under `--diff`.

**It earned its keep immediately.** The first run surfaced a rule leaving
`"You MUST double-check your answer before responding."` as `"You must."` — the
phrase matched, the subject and modal in front of it did not, and the sentence
that survived said nothing. Fixed by listing what can open one of these
instructions ahead of the bare form. Two display bugs in the diff itself went
the same way, both found by reading its own output.

---

### 0.7.0 — The paraphrase case, handed to a model

The one finding the deterministic detector refuses to guess at. Two examples
teaching the same lesson in different words score around 0.54 on word overlap,
close enough to two genuinely distinct examples (~0.20) that catching them by
similarity would mean flagging examples that teach different things.

Deciding that "arrived quickly" and "arrived fast" demonstrate the same pattern
needs a model, so `reviewExamples` lives behind the optional LLM layer, costs a
call, and never runs during an ordinary `optimize()`.

- Returns `null` below two examples rather than paying for a foregone answer.
- Treats the response as untrusted input, because it is: indices are
  range-checked against the examples that exist, self-references dropped,
  overlapping groups collapsed so the same tokens are never counted twice, and
  the model's reason truncated. A model answering with prose produces an empty
  review, not a crash and not a saving the prompt could not deliver.
- A provider **error** still throws. A bad answer is the model's problem and
  gets absorbed; a broken endpoint is the caller's configuration and must not
  be hidden.
- Reports only. Nothing here edits a prompt, which is what makes it safe to be
  relaxed about a model that answers badly — the worst outcome is a suggestion
  you ignore.

---

### 0.8.0 — Measurement instead of estimation

Every other number Trazum reports is arithmetic. This is the one question
arithmetic cannot answer — does the shorter prompt still do the job? — and the
README had been answering it with a caveat, because a rules engine genuinely
cannot know.

`trazum eval` runs both versions over a set of inputs and reports whether the
optimisation changed the answers.

**The part that makes it worth anything:** a model asked the same question
twice does not answer identically, so "the optimised prompt diverged on 3 of 10
cases" means nothing on its own — it might be *better* than the original
manages against itself. So the original runs twice per case first, and that
self-agreement is the yardstick. The rewrite is judged against the model's own
variance, not against a determinism it never had.

- Four verdicts, including `inconclusive` when the original cannot agree with
  itself often enough to judge anything against. A confident verdict off an
  inconsistent baseline would be worse than admitting the test does not work.
- Three calls per case, and the count is printed before any of them goes out.
- Exits 1 on `diverges`, so it can gate a pull request.
- A template gets its first placeholder filled rather than the input appended:
  appending would test a prompt nobody runs.

Still open from the original entry: exact counts by default where a key is
present, and real cache simulation from a call log.

---

### 0.9.0 — Fits into a workflow

Optimising once is a demo. The value is in a prompt staying lean as it is
edited over months, by people who never read this README.

`trazum diff old.txt new.txt` answers the question a pull request actually
raises — *somebody edited this; did it get worse?* — in tokens, in dollars per
month, and in what the edit broke.

**The sign convention is the design decision here.** Every other figure Trazum
prints is a *saving*: before minus after, positive is good. Every figure `diff`
prints is a *delta*: after minus before, positive is **bad**. Mixing those two
conventions in one report is the easiest way to make a cost tool lie, so the
comparison lives in its own module, nothing in it is called a saving, and the
negation happens exactly once, at the boundary.

- Reports what the edit *broke*, not only what it cost: advisories that
  appeared, rules that started firing, and the same in reverse when the edit
  improved things.
- Measures the text **as written** by default, not what the rules would leave.
  A pull request changed the file on disk, so the file on disk is what the
  reviewer is being asked about — otherwise a prompt that doubled in length but
  happened to double in courtesy would show as no change at all.
  `--optimized` switches the figures to the post-rules text for a team that
  already runs Trazum in its pipeline.
- **The gate is opt-in.** Growth alone never fails a build; `--max-growth 10`
  does. A tool that fails a build nobody armed gets removed from the pipeline
  rather than fixed.
- `--max-growh` is rejected with *"Did you mean --max-growth?"* rather than
  ignored. A silently-swallowed gate flag means CI green while the author
  believes a limit is set — which is the failure mode this whole command
  exists to prevent.
- Signed currency throughout: `+$9.25`, not `$-9.25`, and never `-$0`.

Still open from the entry as originally written, and moved to 0.10.0 rather
than dropped: PR comment mode, directory mode, and `trazum.config.json`.

---

### 0.10.0 — Governed as a repository

`diff` made a single prompt reviewable. This makes a directory of them
governable, and stops every project from re-typing the same four flags in every
CI step — the one place they get out of step is the place the numbers stop
meaning anything.

`trazum.config.json` carries the project's defaults; `trazum check prompts/`
checks every prompt under a directory against per-pattern budgets from it.

**The config parser refuses anything it cannot validate, including an unknown
key.** A lenient parser restores defaults silently, and for a budget the default
is *no budget* — a green build for a prompt nobody measured. This is the same
argument as 0.8.0's unknown-flag check and 0.9.0's `--max-growh`, and it is the
third time it has been the right call.

- Flags beat the config; the config beats the defaults. A config able to
  override an explicit flag would make every flag a suggestion. `--no-<flag>`
  exists so a boolean the config switched on is not one you have to edit the
  repository to escape.
- Budgets resolve to the most specific matching pattern, and "specific" is
  *defined* — most literal characters wins — rather than left to be inferred. A
  budget resolved from the wrong pattern is a number nobody can debug, so the
  report names the pattern it came from.
- A file no pattern covers is listed, not skipped. A run where nothing at all
  was budgeted is an error. "Checked 40 files, 0 failures" from a run that
  measured nothing is the most misleading thing this tool could say.
- The glob matcher is a segment-wise dynamic program, not a regex translation:
  `**` compiled to `(?:[^/]*\/)*` is exactly the nested quantifier that
  backtracks exponentially, and on a pull request these patterns come from
  whoever opened it.
- The directory walk does not follow symlinks, bounds depth and width, and says
  when a bound stopped it early. The config file is measured and read through a
  single handle, so the size limit cannot be defeated by swapping the file
  between the check and the read.
- **`@trazum/core` gains a second entry point.** Everything that reads the
  filesystem moved to `@trazum/core/node`, and a test now walks the import graph
  to prove no Node builtin is reachable from the browser-safe one. The first
  attempt at this had only a file allow-list, which passed while the same file
  was re-exported from the main entry point — a file allow-list is not a
  boundary. It matters past the build: the web app hands `optimize()` a prompt
  from a request body, so a file read reachable from there is path traversal.
- `locale` is the one config key the environment outranks: a repository choosing
  the language of its CI logs should not choose the language of a contributor's
  terminal.

Still open, and moved to 0.11.0 rather than dropped: PR comment mode.

---

### 0.11.0 — Reporting where the review happens

The gate worked. What it could not do was put the answer where the conversation
is: a reviewer had to open the job log to find out what an edit cost.

`trazum check` and `trazum diff` grow `--markdown-out <file>`; the Action writes
that file to the run summary and, optionally, posts it as a pull request comment
that replaces its own previous one.

**Three bugs 0.10.0 left in the Action, all the same shape.** Config support
shipped in the CLI while `action.yml` kept passing `--level safe` and
`--locale en` unconditionally — and since the CLI layers flags over config over
defaults, an always-present flag meant the project's own values were never read.
`max-tokens` being required meant config budgets were unreachable through the
Action; `file` being required meant neither directory mode nor `diff` was
exposed. Every optional flag is now passed only when given. **A default that
silently overrides a project's own setting is worse than no default.**

- **The step summary is not behind an input.** It needs no token, no permission
  and no pull request. The comment is opt-in because it needs all three.
- **Commenting can never fail the build.** No pull request, a read-only token on
  a fork, an unreachable API: each records a notice and carries on, because the
  report already reached the summary. A tool that turns "could not comment" into
  a red build gets deleted rather than configured.
- **Found by the marker, not the author.** `gh pr comment --edit-last` matches by
  author, so any other step commenting as the same bot would have had its comment
  overwritten.
- **Green collapses, red does not.** A green table that stays green on every push
  is the thing a maintainer learns to skip — and then they skip the red one too.
- **`pull_request_target` is asserted absent.** It is the natural wrong turn the
  moment somebody discovers a fork PR cannot comment, and it runs a writable
  token against code the contributor controls.
- The verdict counts only what was measured, not what was listed.

Deferred rather than dropped: a `diff` against the base branch needs
`fetch-depth: 0` and a second checkout, which is a documented recipe rather than
an input.

---

### 1.0.0 — A stable contract

1.0 means the API stops moving, not that the feature list is finished.

**The public API is frozen** and a breaking change waits for 2.0 —
[VERSIONING.md](VERSIONING.md) now says exactly what that covers, including the
`--json` shape, the exit codes, and the config and overlay schemas. It also
states the deprecation procedure rather than leaving it to be decided case by
case: `@deprecated` in the JSDoc, a **Deprecated** changelog section with the
migration written out, at least two minors and six months of continued working,
removal only in a major. A deprecated export never starts warning at runtime — a
library that prints to somebody else's stderr because *we* changed our mind is a
library people vendor to make quiet.

**Pricing came off the release cycle.** A price is correctable from your own
repository with a JSON overlay, so a stale bundled price is an inconvenience
rather than a wrong budget. A separate `@trazum/pricing` package would not have
achieved that — you would still have to install something. Every report says
which models came from an overlay and when it was reviewed, because otherwise a
bundled figure and one from your file are indistinguishable.

**A rule can be contributed without reading the engine.**
[docs/authoring-rules.md](docs/authoring-rules.md) is the walkthrough: the
contract, what the masking pass already guarantees, why `safe` is a promise
rather than a default, and the ReDoS fixture *shape* that finds real bugs —
repeated tokens do not, which is how two shipped in 0.1.0.

**The packages are publishable, and what would ship is asserted.** Both carry a
`LICENSE` file rather than only a licence field, a real README (the npm page *is*
the README), `engines`, and `prepublishOnly` — without which `npm publish` would
happily ship the previous version's `dist` under the new version's number,
silently. `src` is shipped too, because every source map points at `../src/*.ts`
with no inlined content: shipping maps without the sources gives a debugger a
file it cannot load, which is worse than no map at all.

Still open, and deliberately so: publishing to npm is a manual step. It is the
one action in this repository that cannot be undone after 72 hours.

---

### 1.8.0 — Prepared for the first publish

**The version that will be the first thing anybody can `npm install`** — and is
not yet. The manifests carry it and the notes are written; there is no tag and
`npm view @trazum/core` returns 404. Publishing is a decision, and it is the
maintainer's.

It collapses the seven milestones below — 1.1.0 through 1.7.0 — into one
version, because none of them was ever tagged or uploaded either. Those seven
will never appear on the registry.

What it adds over the last of those milestones is the entry that gave it its
number:

#### Not asking the model twice

`optimize --suggest --cache-suggestions` answers from a local cache when the
same prompt was asked about before. Re-run over forty prompts after editing
two, and thirty-eight requests do not happen.

**The roadmap item behind it was the API's prompt caching, and that turned out
to be impossible rather than merely hard.** The minimum cacheable prefix is 512
tokens on the most generous model and 4,096 on others; the suggest system prompt
is 291 tokens; and a prefix below the minimum is *silently* not cached — no
error, `cache_creation_input_tokens: 0`. Everything after it is the author's
text, which differs every call. Marking it would have cost one line, saved
nothing, and been undetectable. A test measures the prompt against the published
per-model minima so the claim fails loudly if a model ever lowers its floor.

Opt-in and never silent, because a hit is a week-old answer from something that
is not a pure function. The **raw** response is stored rather than the checked
suggestions, so every safety rule re-runs on a hit and an answer from March is
judged by April's rules. 0600 files in a 0700 directory: the cache holds prompt
text, which is the most sensitive thing this tool touches.

---

### 1.9.0 — The error band, measured

**The entry that kept moving, and what it found when it finally ran.** The corpus,
the harness and the test shipped in what was then 1.3.0; the measurement needed
the official counting endpoint and a key, which is not something this repository
could schedule. The maintainer supplied one on 2026-08-13 and the answer arrived
in about a minute.

**The band was false.** Two of eight samples were outside `±15%` and both
underestimated — the numeric sample by 30.6%, Spanish prose by 22.1%.
Underestimating tokens under-reports cost, which is the flattering direction and
the worst one for this tool.

Two separate faults, found in that order:

- **Digits were counted at three per token.** Claude splits long runs far more
  finely, because a merge table cannot cover every number. Corrected in isolation:
  that sample went from -30.6% to -5.0% and nothing else moved four points.
- **The estimator was calibrated for English, not for prose.** One divisor served
  every language, and German measured -37.3%, Dutch -28.3%, Italian -23.8%,
  Spanish -22.9%, Portuguese -18.1%, French -15.1% — against English at +1.0%.

**This roadmap predicted the wrong culprit.** It said CJK would break the band, on
the reasoning that the estimator treats CJK quite differently from words. CJK was
fine: -3.2% and +11.2%. What broke it was every Latin language that is not
English, which nothing here had thought to doubt.

**And the first hypothesis about *why* was tested and killed.** Accent density
separated the corpus perfectly — every non-Spanish Latin sample at 0.00%, Spanish
at 1.71% — so a Spanish sample with zero diacritics was written specifically to
falsify it. It measured -22.9% against -22.1% for accented Spanish. The signal is
the language, not its marks, so `language.ts` counts function words and answers
`null` when no answer is safe.

**What shipped:** per-language divisors for seven languages, each with a held-out
sample in a different register; a corpus of twenty-one measured samples that can
grow one at a time, because the freshness digest is per sample rather than per
corpus; a band of `±15%` that is measured, exported as one constant, and guarded
so no file can state a different one; and `below-cache-minimum` no longer
asserting from an estimate near a hard threshold.

Worst error across the corpus: **11.2%**, on Japanese, which does not use the word
branch at all.

**What it did not settle.** The seven divisors rest on two or three samples each.
That is enough for a held-out test to mean something and not enough for a
distribution, so the band is still a worst case rather than a percentile. Going
further needs samples from real prompts rather than written for the purpose —
more of the same hand is more of the same bias, however many files it fills.

### 1.10.0 through 1.25.0 — The other half of the product

Sixteen releases in six days, and one sentence explains all of them: `optimize`
recovers about **1%** of a real bill, and everything that moves 40–80% —
which model, the Batch API, caching, re-sent conversation history — is only
visible in what the provider actually charged. So the product grew a second
half: `trazum profile` reads a usage log (counts, never content — the record
shape has no field for prompt text) and says where the money went and which
lever would actually move it.

The full account of each release is in [RELEASES.md](RELEASES.md) and
[CHANGELOG.md](CHANGELOG.md); the arc, compressed:

- **1.10.0 — every hard edge, both sides.** The groundwork release.
- **1.11.0–1.13.0 — the bill itself.** `profile` with exact billed splits,
  per-workload labels, cache economics with the verdict read at its worst case,
  the levers section, and the first money gates (`--max-usd`,
  `--max-growth-usd`, `--max-cache-loss-usd`).
- **1.14.0–1.17.0 — drill-downs and the same answer on every surface.**
  `--label`, `--against` with drivers per label and per model, truncation
  waste, conversation growth as a ceiling, and the web Bill tab reading the
  log entirely in the browser — no fetch in the file, asserted by test.
- **1.18.0–1.20.0 — where the decisions are made.** Directory mode for rotated
  logs, `--since`/`--until` windows with clockless calls counted out loud,
  per-day and per-hour spend shapes, session ledgers, and the `--json`
  contract documented and enforced in both directions.
- **1.21.0–1.22.0 — what the log does not say.** Field coverage counted rather
  than boolean, per-conversation cost (median/p95/max), single-turn cache
  writes as ceiling-or-fact, budget-vs-wire, CSV exports with no total row and
  formula defusal, per-label spend budgets in `trazum.config.json`.
- **1.23.0 — "What if it were the other model?"** `--what-if` reprices the
  same tokens at another rate card — multiplication, not advice, with the
  caveat printed above the figure and calls too large for the target's context
  window named as impossible rather than priced as cheap. Plus
  `duplicateLines`: a doubled bill, caught.
- **1.24.0 — how big, how uneven, and the day it spiked.** `inputShapes`
  (bucket ceilings, never interpolated percentiles), `--max-day-usd` — the
  gate a total cannot arm — and the CI summary saying what the terminal says.
- **1.25.0 — the retry, the archive and the shape in the tab.**
  `repeatedTurns` (the same request sent again, named as a pattern and never a
  cause), gzipped rotated logs read as they are, and the input shape in the
  browser.

### 1.38.0 — The plan

`trazum plan` turns the report's findings into a ranked plan: route and batch
on one slice pre-combined (never summed), projections and money already spent
totalled apart, typed assumptions per action with the command that can check
them, and the plan saved as a dated file with the catalogue that priced it —
what makes 1.39's verification possible. `--min-usd` names what it drops and
its worth, and the saved document never contradicts itself. Third of the five
in docs/plan-1.36-1.40.md.

### 1.37.0 — The fleet

`profile --by-source` splits a directory of logs by the config's `sources`
globs and names the service where the money is: split brains (one workload on
different models in different sources, judged on each source's dearest model),
caching underwater in a named source while the aggregate pays, mismatched
spans said in the copy, and per-service budgets in `spend.bySource` that fail
naming the service. Files matching no pattern are named, never dropped.
Second of the five in docs/plan-1.36-1.40.md.

### 1.36.0 — The estimate stops guessing

`optimize --from-log` measures the call count, output size, cache share and
model from a usage log instead of multiplying by typed guesses, names which
figures are measured, refuses typed flags beside it, and scales to a month
only past a full week of data. `--all-labels` ranks every mapped prompt by
what optimising it is worth on its own measured traffic, with both coverage
mismatches named. First of the five in docs/plan-1.36-1.40.md.

### 1.35.0 — The reader who is not in the terminal

`--markdown-summary` gives a pull-request body or a weekly note the three
figures that changed and the one lever worth the most, as a view over the same
report rather than a second set of figures. The web comparison the plan listed
beside it was already shipped; the privacy promise above the drop zone was
widened to name the second file it has accepted all along.

### 1.34.0 — Findings as policy

`waive` in the config records a gate failure the team decided to live with:
gate, reason in prose and expiry, all three required. Waived is shown as
waived and never hidden, and an expired waiver fails the gate it silenced —
the mechanism by which a waiver stays a decision rather than a habit. The
growth gate's coverage refusal is deliberately unwaivable.

### 1.33.0 — The log it could not read yet

Gemini's `usageMetadata` shape recognised — unambiguous, cached half
subtracted through the same mechanism as OpenAI's, `MAX_TOKENS` in the
truncation contract — and `--dry-run`, which states what the log could
answer per capability, produces no dollar figure, and refuses to coexist
with a gate. Bedrock's camelCase and OpenRouter's OpenAI shape were already
readable, stated for the record.

### 1.32.0 — The routing decision, priced whole

`--what-if` corrects the figure the target would refuse to bill — cache
traffic under the target's cache minimum priced at the rates it would
actually get — and states the move batched on the target's rates, never
summed. The output-ceiling check stays out: the catalogue carries no output
ceilings, and inventing them would be guessing.

### 1.31.0 — The gate that explains itself

Every spend gate failure names the slice holding the money and the largest
lever the report already priced, with whether it covers the overage stated
rather than inferred — pointing, never recommending. A pass within a tenth of
the budget says how much room was left. And the verdict leads the markdown
summary, so a red build in CI carries its reason where the reader actually is.

### 1.30.0 — The report as a diff

`--against` gained the half the dollars cannot carry: coverage drift. A field
the log stopped recording is not a finding that got fixed, and the report now
names which findings went quiet with it. `--max-growth-usd` refuses the
comparison outright rather than passing on a bill nobody could measure. All
three surfaces render it at the same threshold.

### 1.29.0 — The budget, the overlay and the small log

`--max-session-usd` (and `spend.maxSessionUsd`) judges the single most
expensive conversation — the unit an agent product blows up in — failing
loudly on a log with no sessions. The MCP's `profile_usage` gained
`pricing_overlay`, the CLI's `--pricing` document as text, pricing the
whole report including `what_if`. And where the session percentiles refuse
a small log, every surface now states the count and the single worst cost
instead of going silent.

### 1.28.0 — The retry bill, the series and the standing word

`truncationRetries` measures the "billed again" half of truncation — cut
answers followed inside two minutes by another call in the same
conversation, priced on both sides, with the checkable denominator.
`--csv-shape model-day` ships the mix as a day-by-day series, and
`spend.maxDayUsd` moves the day budget into the repository's standing
config.

### 1.27.0 — The ceiling, the drift and the tab in step

`contextPressure` reports each slice's largest call against its own model's
context window — the failure a bill cannot show until the day the product
breaks — loud from 85% and never predicting the crossing. `modelMixDrift`
splits the log's days in half and states each model's exact share of each
half's spend: the migration day totals and per-model totals both hide. And
the web Bill tab caught up with all four of the CLI's newest findings, at
the CLI's own thresholds.

### 1.26.0 — The release that releases itself

No product change; a process one. Merging the release PR now publishes the
packages, tags the merge commit and creates the GitHub release — with a
registry preflight in front so ordinary merges skip in seconds, a token
fallback so npm's broken trusted publishing cannot fail the publish, and
OIDC-signed provenance on the tarballs either way. The documentation sweep
became a test: a release whose version is missing from the changelog, the
release notes or this file fails `verify`.

**On npm, the registry went straight from 1.10.0 to 1.25.0.** The versions
between are real releases of this repository — notes, changelog, merge commits
— but npm's trusted publishing rejected the workflow on every attempt, so
nothing shipped until 1.25.0 went out by hand. See
[docs/releasing.md](docs/releasing.md) for the state of that fight.

## Collapsed into 1.8.0

**Everything below shipped as 1.8.0, and none of these numbers is on npm.** They
were written as release milestones and filed under "Released", which was not true
of any of them at the time: there was no git tag, the `@trazum` scope did not
exist, and [CHANGELOG.md](CHANGELOG.md) — the truthful record — held all of them
under a single `Unreleased`.

That is what this section was always going to become. Its previous heading said
"the first publish collapses all of it into one version", and 1.8.0 is that
publish. The numbering is kept because the ordering is the useful part: it says
what landed in what sequence and why. A consumer will never see 1.1.0 through
1.7.0, because they never existed anywhere one could reach.

`## Released` above holds the versions with their own entry in the changelog.
This section holds the ones that do not, and `publish.test.js` asserts the
difference in both directions — so a milestone cannot be promoted to a release
by moving a heading.

### 1.1.0 — Doing the thing it had only been pricing

Every rule in Trazum trims a few percent of a prompt's tokens. Since 0.2.0 the
`cache-prefix-reorder` advisory has pointed at something an order of magnitude
larger — stable instructions sitting *after* the first placeholder, which prompt
caching therefore re-reads at full price on every call — and no command could act
on it. Measured on a 1,178-token support prompt: **14 tokens cacheable as written,
1,174 after rearranging the same content**, which at 50,000 calls a month on Opus
is the difference between a $0 caching saving and a $184 one.

`trazum optimize --reorder` now performs the rearrangement, and
`reorderForCache` is exported for callers who want the decision without the CLI.

**It is opt-in, and not part of `aggressive`** — the design decision in this
release. Every other transformation here deletes text whose absence is local.
This one *moves* text, and order carries meaning: "Summarise the text above" is
correct where it sits and nonsense in front of the text it points at. `aggressive`
promises "read the diff"; this asks whether the order mattered, which is a
different question and cannot ride in on a level.

So most of the module is about what it refuses:

- **A block containing a backward reference stays put, and so does everything
  after it.** Moving a later block past a pinned one changes their order relative
  to each other, which is the same class of harm. The phrase list is deliberately
  generous in both locales: a false positive costs a saving that was available, a
  false negative silently changes what the prompt asks for.
- **Only whole blank-line-separated blocks move**, so a sentence is never severed
  from the paragraph that qualifies it, and the placeholder's own line travels
  with it.
- **Nothing moves without a placeholder**, or unless the resulting prefix clears
  the model's cacheable minimum. A rearrangement that buys nothing is a diff for
  its own sake — and the bar is on the prefix rather than on the amount moved,
  because a head that already caches gains from any block that joins it.

A refusal returns the prompt **byte-identical** and says which phrase caused it,
because "no saving here" and "there was a saving and it was not safe to take" are
different answers and only the second is actionable. `--diff` compares against
what the author wrote rather than against the rearrangement, so the move is not
hidden behind the deletions. `check` does not accept the flag: it is a gate, and a
gate does not rewrite.

Three things found by testing rather than by reading, all fixed here. A
placeholder on the first line produced a leading blank line. A CRLF prompt came
back with mixed line endings — which in a byte-for-byte prefix match is a changed
price, and in a repository is a diff on every line nobody asked for. And two of
the new module's own patterns were **quadratic**: 31 seconds on a 200 KB prompt,
inside what the HTTP API accepts. The ReDoS suite drives `optimize`, which never
reaches this code, so nothing covered it — a fixture list only asks the questions
it encodes. It has ten fixtures of its own now.

The same lesson applied to the help: `--reorder` shipped accepted and absent from
`--help`, and so had `--markdown-out` since 0.11.0. The parity test named four
*required* flags by hand; it now derives the list from what the binary accepts.

---

### 1.2.0 — Releasing without remembering

Publishing is the one action in this repository that cannot be undone: npm allows
unpublishing for 72 hours and then the version number is spent for good. Until now
it was also entirely manual — build, tag, check the tarball, publish, remember all
of it in the right order.

A tag matching `v*.*.*` now runs the release: full `verify`, a report of exactly
what each tarball would contain, then both packages.

**Trusted publishing over a stored token**, which is the decision in this release
rather than an implementation detail. A long-lived `NPM_TOKEN` would be the
highest-value credential this project holds, sitting in repository secrets
permanently for something used a few times a year — and unlike every other secret
here, a leak is not recoverable by rotation alone, because whatever was published
under it stays published. OIDC needs `id-token: write` on the job and stores
nothing. A test asserts no workflow reaches for a publish token at all.

**Provenance comes free with OIDC**, so a consumer can verify a tarball was built
from this repository, at this commit, by this workflow.

Three refusals, each one a mistake that cannot be corrected afterwards:

- **The tag and the manifests must agree.** A tag reading `v1.4.0` against
  manifests reading `1.3.0` publishes 1.3.0 under a release note for 1.4.0.
  `publish.test.js` already asserts every manifest carries the *same* version;
  the workflow checks that the shared version is the tagged one.
- **`verify` runs before anything is published**, and it is the same `verify` a
  pull request runs. A release gate that checks less than the pull-request gate
  lets through exactly what the tag was for. A test asserts the ordering.
- **`workflow_dispatch` is dry-run only.** Every publish step is gated on a tag,
  because a publish reachable without one is a release with no version to check
  against. A test asserts the gate on each step.

`@trazum/core` publishes first: the CLI depends on it at an exact version, so the
other order leaves a window where installing the CLI fails on a dependency that
does not exist yet.

**Still needs the maintainer, once.** The `release` environment now exists, and
a `workflow_dispatch` dry run has gone green through `verify` and
`npm pack --dry-run` with every publish step correctly skipped. What is left is
npm's side: `@trazum/core` returns 404, so the first publish has to be made by
hand — a trusted publisher is configured on a package's settings page, and that
page does not exist until the package does. From the second release onward the
tag workflow does it with no credential anywhere.
[docs/releasing.md](docs/releasing.md) has the exact fields, including the one
that is easy to get wrong: npm's *Environment* must read `release`, because the
workflow declares it and the OIDC token carries the claim — leave it blank and
the publish is rejected with an error about the token rather than about the
mismatch.

Nothing to paste into secrets and nothing to rotate. Until it is done a tag push
runs every check and then fails at the publish step, which is the right failure:
loudly, having published nothing.

---

### 1.3.0 — Prompts where they actually live

`check` read `.txt`, `.md`, `.prompt` and `.tmpl`. Real prompts live in TypeScript
template literals, Python strings and YAML, so adopting Trazum meant first
refactoring them out into standalone files — a change to somebody's application as
the price of admission, and the largest barrier to adoption the tool had.

A marker comment is now enough:

```ts
// trazum:prompt support-system
export const SUPPORT = `You are a support agent.

Customer message: ${message}`;
```

**It reads a marker rather than guessing**, which is the decision in this release.
Inferring which string in a file is a prompt is a heuristic, and a heuristic
inside a command used as a CI gate fails builds over log lines and SQL. One line
of comment buys never being wrong about what was picked up. `//`, `#`, `--` and
`<!-- -->` cover the languages prompts live in.

**Interpolation was not a special case to build — it was one that already worked.**
`${x}` is exactly the shape `segment.ts` protects, so an embedded prompt gets the
same cache-prefix analysis, the same rule protection and the same `--reorder`
treatment as a `{{x}}` template, with no second code path to drift.

Three decisions worth recording:

- **Each prompt is budgeted on its own.** A file holding four prompts is four
  things to govern, and summing them would fail a build because somebody added a
  fifth short one — while counting imports and export keywords as tokens the
  model never sees.
- **The id is path-prefixed** (`src/prompts.ts#support-system`, or
  `src/prompts.ts:12` for a bare marker), so the existing `budgets` globs cover
  embedded prompts without the config learning a new syntax.
- **Source files are scanned without being opted into.** Requiring config to
  discover a marker somebody just wrote is how `eval` came to be fully implemented
  and completely undiscoverable. An unmarked source file costs one `includes()`
  and is dropped silently — it was never something the author asked to govern, and
  listing it as unbudgeted would bury the files that are.

**The honest limit, documented rather than papered over:** a prompt assembled by
concatenation cannot be read this way, because its text does not exist until it
runs. Trazum declines it, names the line, and **fails the build** — the author
marked that prompt to have it governed, and it is not being governed. A green
build alongside would be the same lie as "0 failures" from a run that measured
nothing.

Scanned character by character rather than with a regex, and the hostile-input
tests earned their place immediately: the obvious line-number lookup was quadratic
in the number of markers, 15.5 seconds on a file holding 20,000 of them. Caught
before it shipped rather than after, which is a first this week.

**Still to come in this line:** `diff` against the base branch for an embedded
prompt, which was deferred from 0.11.0 and is the reviewer workflow this unlocks.
`check` is the gate and came first.

### 1.4.0 — The front door catches up

Anyone arriving through the web judged the whole product on a page that could
optimise and little else. That gap cost adoption even though it cost nobody money
directly, which is why it was scheduled rather than parked — and why it came last
of the four: it changes how the product *looks* rather than whether its numbers
are *right*.

**`--reorder` is now on the web**, which is the substance of this release. It is
the largest saving Trazum can make and it was reaching only people who had cloned
a repository and built a CLI. On a 1,178-token support prompt the difference is
between a $0 caching saving and a $184 one.

Opt-in over HTTP for the same reason it is opt-in on the command line, and the
reason is stated in the route rather than left in the diff: every other
transformation this endpoint performs deletes text whose absence is local, and
this one *moves* text, where order carries meaning. Nothing about it is less safe
here — the same deterministic core, nothing sent anywhere, the prompt returned
byte-identical when it cannot act — but *"the browser did it quietly"* is not
something this endpoint should ever be able to do.

Three details that follow from that:

- **The flag is honoured only on a literal `true`.** A string, a number and
  `null` are all ignored, because the body is untrusted and a truthy check would
  let `"false"` rearrange somebody's prompt.
- **`original` stays what the caller sent**, so the diff the browser draws shows
  the move instead of hiding it behind the deletions.
- **Refusals ride back in the response** and render whether or not anything moved.
  The panel is deliberately not styled like the green savings box: that one is a
  saving to enjoy, this is a change to review. It sits above the money so the
  number is read after the caveat rather than instead of it.

**What is deliberately not coming to the web**, recorded here rather than left as
an unexplained gap:

- **The pricing overlay** is a JSON file in your repository, corrected by you and
  reviewed in your pull requests. A textarea for pasting prices into somebody
  else's server is not that feature wearing a different hat — it is a worse one,
  with no review and no provenance. The web already says which prices it used and
  when they were reviewed; that is the honest version.
- **Config-aware defaults** need a `trazum.config.json`, and a browser has no
  repository to find one in.
- **Budgets** are a gate, and a gate belongs where it can fail a build. A
  pass/fail badge in a browser says nothing the token count beside it does not.

**Still open:** `comparePrompts` — paste two versions of a prompt and see the
delta — is the one CLI capability with a real browser shape that is not here yet.

---

### 1.5.0 — Every model you pay for by the token

Trazum priced one vendor. Everything that reads a prompt was already
provider-agnostic — the rules, the protection pass, `--reorder`, the structural
detectors all operate on text — so the gap was never the analysis. It was the
money, and the money was written as if there were one supplier.

OpenAI, Google, Moonshot, DeepSeek, xAI and Mistral join the catalogue. **The
data was the easy half.**

The cost multipliers were global constants, and global made them quietly wrong
the moment a second provider existed. Moved onto the model, defaulting to
Anthropic's values so nothing that worked before changes. Three of them were not
inaccuracies but **savings that do not exist**, and all three were found by
running the catalogue rather than reading it:

- **Kimi, DeepSeek and Grok have no batch API**, and were being offered a 50%
  discount nobody sells them. `batch: null` now means "there is none", which is
  deliberately different from not having said.
- **Mistral has no prompt caching.** A zero minimum satisfied `0 >= 0`, so the
  advisory offered $100 a month of a feature that does not exist — a bug this
  release introduced and caught before it left the branch.
- **The batch saving was `cost × discount`**, which equals the saving only when
  the discount is exactly 0.5. Latent on Anthropic, wrong on the first provider
  with any other rate.

The caching advisory now quotes each provider's rates and **stops naming
`cache_control` to people who do not have it** — OpenAI, Moonshot and DeepSeek
cache automatically above a threshold. The advice to move stable content forward
is identical either way, because a prefix is a prefix; the instruction after it is
not.

**A cheaper model means a cheaper model, not a different supplier.** Downgrade
recommendations are scoped to the current provider. Unscoped they told Claude
users to switch to `gpt-5-nano` — on a keyword heuristic already caveated as no
judgement about answer quality, which has no business recommending a change of
vendor.

`tier` is deprecated in favour of `capability`, on a vendor-neutral scale.
Anthropic's ladder as the generic axis stops making sense the moment the model is
not Anthropic's. Full procedure per [VERSIONING.md](VERSIONING.md); both fields
stay populated for all of 1.x and a test asserts they never disagree.

**The estimator is still a Claude estimator**, and the report now says so rather
than printing a Claude-calibrated band nobody measured for GPT or Kimi. Which makes the
tokenizer question under `Under consideration` heavier than it was.

---

### 1.6.0 — Which prompt, whose change, and whose assertions

Five commands from one observation: Trazum could tell you a prompt was expensive
and could not tell you *which* prompt, *who* made it expensive, or whether the
shorter one still did your job.

**`trazum rank <dir>`** orders a directory by what optimising each prompt would
actually recover — measured by running the rules, not by evaluating a formula.
The obvious design was a complexity score out of a hundred, and it was rejected
on purpose: a number nobody can reproduce by hand cannot be argued with, and the
weights that combine four measurements into one get tuned until the ranking looks
right, which is fitting the metric to the answer. The measurements are printed
beside the ordering as its explanation, each with a definition you can check
against the file. Two tests forbid a `score`, `rating`, `grade`, `index` or
`complexity` field appearing later.

**`trazum blame <file>`** walks a prompt's git history and puts two facts on one
line: who changed it, and what that change cost. Git knows the first; it does not
know that three lines added to a system prompt at 50,000 calls a month is a bill
rather than a diff. This is the first thing here that runs another program, so it
happens in one module written as if it were the whole attack surface — no shell,
every path after a `--` separator, object names validated as 40 hex digits before
being glued to one, bounded time and memory. Six invariants assert that, and one
of them asserts that module stays the only importer of `node:child_process`.

**`optimize --suggest`** replaces an all-or-nothing LLM pass with phrase-level
proposals. `--llm` hands the model the whole prompt and takes the whole answer
back, so a result failing one safety check leaves the author with nothing.
Suggestions degrade instead: eight surviving out of ten is useful. The model
proposes and the prompt decides — `before` must appear byte for byte, must not
touch protected content, must actually save tokens, and overlapping edits are
refused because applying both produces text neither described.

**`eval --export promptfoo`** hands the run to somebody else's harness. Agreement
is the question Trazum is qualified to ask and not the one a team needs answered
before shipping; theirs is whether the classifier still hits 94%. So the suite is
built with both prompts, every case bound to the right variable and the same
provider on both sides — and the assertions are left blank, because they are
assertions about a task this tool knows nothing about.

**And `--reorder` had no safety at all outside English and Spanish.** Not a
missing feature: the phrase list was one flat English/Spanish array applied to
every prompt, so a French, German, Portuguese, Italian, Dutch, Japanese or
Chinese author ran it with none of the refusals the module is built out of.
"Résumez le texte ci-dessus" was hoisted above the text it points at and reported
as a saving — and every test passed throughout, because every test asked the
question in the two languages that worked. Seven languages added; CJK matches
without word boundaries, since the boundary test can never fire there. A fourth
refusal covers the scripts still missing — Cyrillic, Arabic, Hebrew, Hangul,
Devanagari, Thai, Greek — where nothing moves and the report names the script.

Alongside: the web app rebuilt on shadcn/ui keeping Trazum's own palette, the
SSRF closed at its real source (the request body now *selects* an endpoint the
operator listed rather than naming one), and the alert gate fixed after it was
caught racing the analysis it reads.

### 1.7.0 — An account, and what an account makes possible

Everything before this ran on one machine and remembered nothing. That is the
right default and it is still the default — but "what did last month's edit do
to this prompt?" is not a question a stateless tool can answer, and neither is
"which of our forty prompts is worth an afternoon?" when the forty belong to
six people.

**Sign-in through GitHub** (`/api/auth`), and nothing else. Sessions are opaque tokens stored
as a SHA-256 hash, in a `__Host-` prefixed cookie; the server keeps no password
to leak and no OAuth token beyond the exchange. Signing out deletes the session
row rather than clearing a cookie and hoping.

**Share links** (`/api/shares`) publish a comparison at `/c/<token>` — an
unguessable URL anyone can open
without an account — the only thing in Trazum that serves one person's prompt to
a stranger, so the interface says exactly that *before* the button rather than
after. Thirty-day default expiry, revocable, kept out of search engines two
independent ways. Reading one writes nothing: an unauthenticated request that
can cause a write is a lever, and a view counter is not worth being one.

**A prompt library with full version history** (`/api/prompts`). Append-only — saving over a
prompt writes a new version and never rewrites one, and a save that changed
nothing writes nothing and says so. Token counts are recomputed on read rather
than stored, so two versions saved a year apart are comparable instead of being
priced by two different estimators. Somebody else's prompt answers **404, never
403**, and the store has no lookup that takes an id without an owner, so that
mistake cannot be written rather than merely not being written.

**A deployment overview at `/admin`** (`/api/admin`) for whoever runs the instance, off unless
`TRAZUM_ADMINS` is set — and off means the page does not exist rather than
refuses. It is careful about what it claims: Trazum has never seen a bill or an
API call, so the headline is input tokens and the second figure is what the
rules would remove. Prompt names, never prompt text: an admin is an operator,
not an auditor of what their colleagues wrote.

**A badge at `/badge/<token>.svg`**, riding the share token rather than
inventing a second capability for a smaller disclosure. Recomputed on every
load, because a stored number is the most likely thing to have quietly stopped
being true — which is the failure mode of every hand-written "saves 30%" line
in every README.

**Rule 1 is intact and is the reason this is a separate application.** The CLI
still sends nothing anywhere, still needs no account, and still optimises a
prompt with the network unplugged. The web app is opt-in, self-hosted, and
holds only what somebody deliberately saved to it.

### The publish itself — what shipped under 1.8.0's own banner

The version the collapse ships under, and the only one a consumer will ever
install. Beyond carrying 1.1.0–1.7.0, it added its own layer, in two waves.

**The provider wave.** Pricing seven providers (1.5.0) made the next gap obvious:
Trazum could *price* every model and *call* almost none of them. Now `openai` in
`TRAZUM_LLM_PROVIDER` is documented as what it always was — a wire format, not a
company — and one base URL covers OpenRouter, LiteLLM, Groq, Together, Fireworks,
DeepInfra, DeepSeek, Mistral, Ollama, vLLM and LM Studio. Native providers exist
where the wire format genuinely differs: Anthropic, Gemini (whose blocked prompts,
truncated answers and empty candidates all arrive as HTTP 200, and are all
refused), and Bedrock and Vertex, whose credentials are not bearer tokens — SigV4
and the service-account JWT are signed by hand on WebCrypto, keeping the
zero-dependency invariant. Live prices arrive through an OpenRouter overlay that
marks everything the feed does not carry `unknown` rather than guessing. None of
these paths has been run against the real service from this environment, and each
says so where it is documented.

**The measurement wave.** `trazum prune` measures which few-shot examples earn
their tokens — leave-one-out against the prompt's own noise floor, the only
command that asks before spending. `doctor` reports preambles that could share a
cache entry and do not, the first finding no single prompt can produce. An
advisory catches output schemas the request could carry as a parameter instead —
the rare change that is cheaper *and* stricter. `@trazum/mcp` exposes
`check_prompt`, `optimize_prompt` and `list_models` over stdio so an agent can
budget its own prompts before sending them. A `.pre-commit-hooks.yaml` covers
teams who manage hooks with the pre-commit framework. And the web app's
Content-Security-Policy stopped being `frame-ancestors` plus an admission: a
nonce per request, `strict-dynamic`, and no `unsafe-inline` for script.

Two entries here exist because their absence was found to be a live defect while
writing them: the README's privacy section claimed prompts are never stored on
any server for several releases after the prompt library made that conditional,
and the CSP shipped blocking the analytics the operator could switch on. Both
carry tests now that derive the claim from the code rather than trusting prose.

## Next

Five releases are planned in order through 1.40.0, with the reasoning
attached: [docs/plan-1.36-1.40.md](docs/plan-1.36-1.40.md). The short version
— Trazum's estimating half and measuring half had never met, and this arc
introduces them: measured usage under every estimate (1.36), the fleet
(1.37), the plan (1.38), verification against predictions (1.39), and the
long series (1.40). The previous arc, delivered in full with its errata on
the record, is in [docs/plan-1.30-1.35.md](docs/plan-1.30-1.35.md).

The ordering is a commitment and the calendar is not. What users report
reorders it; that is the one input allowed to.

## Under consideration

Not scheduled. Listed so the reasoning is on the record.

- **More contradiction axes** — tone, persona, refusal policy. Unscheduled
  rather than planned, because each new axis has to earn its place against
  false positives and I have not seen enough real prompts to know which ones
  do. An advisory people learn to ignore is worse than no advisory, and four
  axes that fire correctly beat seven that mostly do not.

- **More locales.** The architecture supports it as of 0.3.0, and adding one is
  now a catalogue plus dictionary entries. Held back on purpose: a language
  needs a maintainer who actually reads it, and a stale translation is worse
  than an honest fallback to English.

  **Japanese is deliberately not on this list, and the split is the point.**
  There is no Japanese trimming dictionary and one is not planned: deciding that
  a phrase says something in more words than it needs is a judgement about the
  language, and nobody here can make it in Japanese. But `--reorder`'s
  backward-reference list *does* cover Japanese and Chinese, matched without
  word boundaries because 上記のテキスト has none. Those two are not the same
  claim. Refusing to rearrange somebody's prompt needs only enough of the
  language to recognise a phrase pointing backwards; offering to shorten it
  means asserting the shorter version still asks for the same thing. Trazum will
  do the first in a language it cannot read and will not do the second.

  So a Japanese prompt gets `--reorder`'s protections in full, no trimming, and
  a report that names the seven languages the dictionaries cover rather than
  implying the prompt was already efficient.
- **Editor extension.** Live token cost while writing a prompt is the right
  place for this to live. Unblocked as of 0.10.0 — it now has a config file and
  a budget per path to read — and still unscheduled, because an extension is a
  distribution commitment (a marketplace listing, an update cadence) rather than
  a feature.
- **Tokenizer per model family.** The heuristic compares two versions of the
  same prompt well, which is what it is for. A real tokenizer would improve
  absolute figures at the cost of the dependency-free promise — worth doing
  only as an optional package.

  **Still unscheduled, still pending the error band, and now weightier.** Pricing
  seven providers made this the question it always was in miniature: the estimator
  is tuned against Claude's tokenizer, and a GPT or Kimi figure carries whatever
  error that mismatch produces. Nobody has measured it, so the report stops
  claiming a Claude band for those models and says which tokenizer it was calibrated on
  instead — honest, and no substitute for knowing.

  Measuring the band is what decides whether the dependency is worth taking:
  within 5% across families and it is not; 40% out and it is. Deciding now would
  be deciding without the one number that settles it.
- ~~**Prompt library.**~~ **Shipped in 1.7.0, and the reasoning here was
  wrong in an instructive way.** This entry said storing prompts "would mean
  sending them to a server. Trazum's privacy story is that it never does" — and
  it read as a principle when it was really a conflation of two things. Rule 1
  binds the *optimiser*: the CLI sends nothing, needs no account, and works with
  the network unplugged, and none of that changed. It never said nobody may run
  a service that stores what they chose to save to it. Left visible rather than
  deleted, because a roadmap that quietly removes the entries it went back on is
  a roadmap with no record of having gone back on anything.
- **Cost alerting.** A bot that watches a prompt's monthly estimate and speaks up
  when it crosses a threshold, or when caching effectiveness drops. Attractive,
  and unscheduled for the same reason as the two above: it needs somewhere to run
  and something to remember — a service holding other teams' prompt metrics on a
  schedule. `check --max-tokens` in CI already covers the threshold case for
  anyone content to have the answer arrive on a pull request instead of in Slack,
  which is most of the value for none of the surface area.

---

## How versions are decided

See [VERSIONING.md](VERSIONING.md). Briefly: while below 1.0, minor versions
may contain breaking API changes and always say so at the top of their
changelog entry.
