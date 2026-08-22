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

**Oldest first, all the way down.** This section is a story rather than a
noticeboard: each entry explains what the previous one made possible, so it
only reads correctly forwards. `RELEASES.md` and `CHANGELOG.md` are the
newest-first documents, and either of those is what you want if the question
is "what changed recently".

That is worth stating because the order broke once and nobody noticed for
twenty-four releases: entries were being prepended at 1.26.0, so the file ran
0.1.0 upward to 1.25.0, jumped to the newest release, and then counted
*backwards* to 1.26.0 — a reader following it forwards went 1.25.0 → 1.50.2 →
1.50.1 and out the bottom at 1.26.0.

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

### 1.27.0 — The ceiling, the drift and the tab in step

`contextPressure` reports each slice's largest call against its own model's
context window — the failure a bill cannot show until the day the product
breaks — loud from 85% and never predicting the crossing. `modelMixDrift`
splits the log's days in half and states each model's exact share of each
half's spend: the migration day totals and per-model totals both hide. And
the web Bill tab caught up with all four of the CLI's newest findings, at
the CLI's own thresholds.

### 1.28.0 — The retry bill, the series and the standing word

`truncationRetries` measures the "billed again" half of truncation — cut
answers followed inside two minutes by another call in the same
conversation, priced on both sides, with the checkable denominator.
`--csv-shape model-day` ships the mix as a day-by-day series, and
`spend.maxDayUsd` moves the day budget into the repository's standing
config.

### 1.29.0 — The budget, the overlay and the small log

`--max-session-usd` (and `spend.maxSessionUsd`) judges the single most
expensive conversation — the unit an agent product blows up in — failing
loudly on a log with no sessions. The MCP's `profile_usage` gained
`pricing_overlay`, the CLI's `--pricing` document as text, pricing the
whole report including `what_if`. And where the session percentiles refuse
a small log, every surface now states the count and the single worst cost
instead of going silent.

### 1.30.0 — The report as a diff

`--against` gained the half the dollars cannot carry: coverage drift. A field
the log stopped recording is not a finding that got fixed, and the report now
names which findings went quiet with it. `--max-growth-usd` refuses the
comparison outright rather than passing on a bill nobody could measure. All
three surfaces render it at the same threshold.

### 1.31.0 — The gate that explains itself

Every spend gate failure names the slice holding the money and the largest
lever the report already priced, with whether it covers the overage stated
rather than inferred — pointing, never recommending. A pass within a tenth of
the budget says how much room was left. And the verdict leads the markdown
summary, so a red build in CI carries its reason where the reader actually is.

### 1.32.0 — The routing decision, priced whole

`--what-if` corrects the figure the target would refuse to bill — cache
traffic under the target's cache minimum priced at the rates it would
actually get — and states the move batched on the target's rates, never
summed. The output-ceiling check stays out: the catalogue carries no output
ceilings, and inventing them would be guessing.

### 1.33.0 — The log it could not read yet

Gemini's `usageMetadata` shape recognised — unambiguous, cached half
subtracted through the same mechanism as OpenAI's, `MAX_TOKENS` in the
truncation contract — and `--dry-run`, which states what the log could
answer per capability, produces no dollar figure, and refuses to coexist
with a gate. Bedrock's camelCase and OpenRouter's OpenAI shape were already
readable, stated for the record.

### 1.34.0 — Findings as policy

`waive` in the config records a gate failure the team decided to live with:
gate, reason in prose and expiry, all three required. Waived is shown as
waived and never hidden, and an expired waiver fails the gate it silenced —
the mechanism by which a waiver stays a decision rather than a habit. The
growth gate's coverage refusal is deliberately unwaivable.

### 1.35.0 — The reader who is not in the terminal

`--markdown-summary` gives a pull-request body or a weekly note the three
figures that changed and the one lever worth the most, as a view over the same
report rather than a second set of figures. The web comparison the plan listed
beside it was already shipped; the privacy promise above the drop zone was
widened to name the second file it has accepted all along.

### 1.36.0 — The estimate stops guessing

`optimize --from-log` measures the call count, output size, cache share and
model from a usage log instead of multiplying by typed guesses, names which
figures are measured, refuses typed flags beside it, and scales to a month
only past a full week of data. `--all-labels` ranks every mapped prompt by
what optimising it is worth on its own measured traffic, with both coverage
mismatches named. First of the five in docs/plan-1.36-1.40.md.

### 1.37.0 — The fleet

`profile --by-source` splits a directory of logs by the config's `sources`
globs and names the service where the money is: split brains (one workload on
different models in different sources, judged on each source's dearest model),
caching underwater in a named source while the aggregate pays, mismatched
spans said in the copy, and per-service budgets in `spend.bySource` that fail
naming the service. Files matching no pattern are named, never dropped.
Second of the five in docs/plan-1.36-1.40.md.

### 1.38.0 — The plan

`trazum plan` turns the report's findings into a ranked plan: route and batch
on one slice pre-combined (never summed), projections and money already spent
totalled apart, typed assumptions per action with the command that can check
them, and the plan saved as a dated file with the catalogue that priced it —
what makes 1.39's verification possible. `--min-usd` names what it drops and
its worth, and the saved document never contradicts itself. Third of the five
in docs/plan-1.36-1.40.md.

### 1.39.0 — Did it work?

`trazum verify` holds a saved plan to the log that came after it, with three
outcomes and never two: arrived, did not arrive, or cannot be told — a
vanished workload, fields that stopped being recorded, or a tier tokens
cannot see. Differences carry the world's measured movement from the plan's
recorded baseline, a repricing is flagged instead of silently priced
through, and `--gate` fails CI on broken promises and on a log that degraded
itself. Fourth of the five in docs/plan-1.36-1.40.md.

### 1.40.0 — The long run

`trazum history` builds the series no pairwise comparison can see, from
stored `--json` reports rather than re-parsed logs: labels climbing for
consecutive periods since a named report, model shares rising under flat
totals, cache shares decaying too slowly for any single report to call, and
plan actions planned again and again with nobody executing them. Shapes
named, nothing forecast. Fifth and last of the five in
docs/plan-1.36-1.40.md — the arc is delivered.

### 1.41.0 — The connector

`trazum connect` reads the bill from Anthropic's and OpenAI's usage APIs, so
nothing has to be exported by hand. The credential is borrowed from the
environment and never stored, never printed and never committed — four guards
fail the build rather than promising it. A connected report is restricted on
purpose: usage APIs serve sums, so every per-call finding is listed as
unavailable with what would unlock it, in a document shape of its own so
nothing can read a zero the connector wrote. First of the ten in
docs/plan-1.41-1.50.md.

### 1.42.0 — The store

`connect --store` keeps what it pulled under `.trazum/store`, so a connector
is something you can leave on: re-pulling an overlapping window converges
instead of doubling, because a window pulled again is the same fact restated.
Records the store cannot tell apart are kept as two and named, a broken line
costs that line rather than the month, and pruning refuses without a written
retention policy and says what went. `history --store` builds the series from
what is kept, with the label series absent and said to be. Second of the ten
in docs/plan-1.41-1.50.md.

### 1.43.0 — The watch

`trazum watch` evaluates the spend gates as the money moves rather than when
somebody runs a command. One cycle is the primitive and the loop is that cycle
in a timer, so cron, a foreground watcher and every test run the same code.
Crossings are measured and never projected; a day half-measured is
not-yet-judgeable rather than passed, while a day already over budget fires at
any hour; and a restart neither re-alerts nor calls a blown budget clean —
quiet is not clean. Three transports, and three build-failing guards over the
new webhook surface. Third of the ten in docs/plan-1.41-1.50.md.

### 1.44.0 — The answer in milliseconds

`trazum serve` answers what a call will cost and whether there is budget, from
loopback, in single-digit milliseconds — so a decision being made right now can
consult what the reports know. The measured half and the estimated half stay
apart and the verdict says which it rests on; three outcomes with their three
distinct reasons; and it degrades to pricing the call alone when there is no
store or no budget. Bound to 127.0.0.1 with no flag to change it and no auth
theatre. Fourth of the ten in docs/plan-1.41-1.50.md.

### 1.45.0 — The agent's budget

`spend_guard` over MCP answers whether a call may be made — yes, no, or cannot
tell — and a refusal never arrives bare: it carries the cheaper ways to make
the same call, priced for that call rather than for a month, each naming what
it assumes and each filtered to models the prompt actually fits inside. Route
and batch combine rather than add. It never spends to answer and never says
yes to what it cannot judge. Fifth of the ten in docs/plan-1.41-1.50.md.

### 1.46.0 — Five minutes

`trazum init` takes somebody from `npx @trazum/cli` to a finding worth money
without a page of documentation: it walks for prompts, reads the code for which
provider it calls, finds a usage log or a credential for one, writes a config
out of what it can justify, and prints the single most valuable thing it found
with the arithmetic before the figure. The substance is what it refuses to
write — a budget (a policy no log answers), a monthly rate from a short window
or from undated calls, a cache hit rate from a log with no cache columns, and
`batchEligible` in either direction — each refusal naming what would settle it.
`proposeInit` is pure, so every rule is tested without a filesystem. Sixth of
the ten in docs/plan-1.41-1.50.md.

### 1.47.0 — The browser sees the bill

The plan and the verification join the bill in the tab, so the web app stops
being a demo of the smallest half of the product. Ranked actions with the money
as a projection or a measured stake and never both, each naming what it assumes
and how to check it; **Save plan.json** writes byte-for-byte what `trazum plan
-o` writes, so a decision made in a browser is committable, gateable in CI and
openable back here; and opening a saved plan turns the log in the tab into the
check on it, three outcomes with their reasons kept distinct. Saved as a file
rather than a link, because a link means storing somebody's bill. One shared
validator, `parsePlanDocument`, replaces two checks that were not the same.
Seventh of the ten in docs/plan-1.41-1.50.md.

### 1.48.0 — The cost review

Waivers get their history, closing the gap 1.40 named and refused to fill by
inference. A waiver that silences a gate writes down that it did — the gate, the
reason and expiry as they stood at that moment, the commit, the figures judged —
and `trazum history` reads those lines back into habits with a typed verdict
that separates an expiry pushed forward under an unchanged reason from a reason
somebody rethought. Nothing is back-filled, a waiver nobody's build has hit is
reported as dead config rather than habit, and a failure to write never fails
the build. Plus docs/ci.md: GitLab, Jenkins, CircleCI and a pre-commit hook, one
binary and two exit codes, no vendor plugin. Eighth of the ten in
docs/plan-1.41-1.50.md.

### 1.49.0 — The live budget

One measured number, wherever it is asked for. `budgetPositions` turns a budget
into a standing — a limit, a calendar month, the measured spend inside it, and
how much of that month was measured at all — and `store` and `serve` read the
same call, so a CI failure and an agent's refusal cannot disagree about what is
left. `spend.monthlyUsd` is a new key rather than a reuse of `maxUsd`, because
one gates whatever period a log covers and the other gates a month, and a
single key carrying both is how `serve` came to compare a year of store records
against a monthly limit. A period nobody measured is `cannot-tell`, never
`within`; the burn is a shape and never a date; and a floor can prove *ahead*
and can never prove *behind*. Ninth of the ten in docs/plan-1.41-1.50.md.

### 1.50.0 — The standard

The close of the arc `docs/plan-1.41-1.50.md` opened. `trazum conform` turns
the ten documents this project emits into contracts somebody else can build
against: does this conform (required fields, right types, gates in CI) and what
can a valid document of this shape not answer, with the field that unlocks each
— the second never gating, because choosing not to log sessions is a decision
and not a defect. docs/format.md gathers the contracts, what `schemaVersion`
promises and what only a version bump may change, and the rules a provider
connector must follow. And docs/doctrine.md writes down the twenty rules the
first fifty releases learned by getting each one wrong first, which is the
actual argument for trusting a cost figure from any tool. Tenth of ten.

### 1.50.1 — The numbering

A patch that changes what a patch means. The version number now carries the
narrative: a chapter of the arc in progress is a patch, and the minor is spent
only on the release that lands the arc's thesis — so the next arc runs 1.50.1
through 1.50.9 and finishes at 1.51.0. Major is unchanged and remains the only
number that carries risk. What it costs somebody pinning `~1.50.0` is stated in
its own section of VERSIONING.md rather than left to be found in a diff, and
the reason the field was free to reassign is that inside a frozen 1.x line
minor and patch are both additions-only, so the distinction was carrying
nothing.

### 1.50.2 — The feedback loop

Trazum has no telemetry and is not going to get any, which means the only signal
about whether any of this works is what somebody chooses to say. `trazum
feedback` makes saying it one word: where to report a wrong optimisation, a bug,
a question or a security problem, plus a blank issue already carrying the
version, runtime and platform — printed in full first, and never sent by the
command. Four guards prove the claim, including one on install hooks, which is
the route the other three would have missed. Plus `trazum --version`, which did
not exist through fifty releases in a tool whose bug reports need it above
everything, and SUPPORT.md, which GitHub surfaces in the issue flow and which
says out loud that there is no support contract.

### 1.50.3 — The gateway

The first thing this product can *do* rather than report on. `trazum gateway`
stands between the caller and the provider, speaking the provider's own wire
format so no SDK changes, measuring usage from the response as it comes back —
no export, no connector lag, no missing day. It refuses and never substitutes: a
call over budget gets HTTP 402 with the cheaper alternatives named, and that is
enforced in the type rather than in a comment, because `forward` carries nothing
the caller did not send and `refuse` carries no body. 402 and never 429, since
every provider SDK retries a 429 and would turn one refusal into a retry storm.
`--on-cannot-tell` is required with no default — fail-open and fail-closed are
both defensible and only the operator knows which failure their product
survives. The credential is forwarded untouched and never read; the upstream is
compiled in; nothing about the payload is written down, and the interfaces have
nowhere to put it. Chapter one of docs/plan-1.51.md.


### 1.50.4 — The outcome

The counterpart every figure in this product was missing. Everything here is a
cost: Trazum could say a workload got 40% cheaper and could not say whether it
stopped working. An `outcome` on the usage record — the caller's own word for
what happened — closes it, with the vocabulary declared in the config because
which words mean success is a judgement about somebody's product rather than
their bill. The rate is by spend and never by call, since the two diverge
exactly when the expensive half is the half that fails: the worked example is
73% by call and 48.2% by spend. Never inferred, and three guards prove it.
Nothing recorded is null and never zero, because a rate of zero is a real and
terrible measurement and "nobody told us" is a different sentence. An undeclared
value is named rather than counted as a failure. Chapter two of
docs/plan-1.51.md.


### 1.50.5 — Cost per outcome

The finding a total cannot make. With a numerator recorded, `profile` prints
what a success costs per workload — and prints **both** orders, because
cheapest per call and cheapest per outcome are different rankings and a
workload can move up one while moving down the other. The worked example has
one workload costing ten times more per call and half as much per resolution.
The numerator is recorded spend and never the whole bill: dividing everything
charges uninstrumented traffic to measured successes and reports a figure too
high by exactly the uncovered share, in the direction that gets a working
feature killed. Five reasons a figure is withheld instead of stated, each named
in the cell, and a withheld slice gets no rank at all. Chapter three of
docs/plan-1.51.md.


### 1.50.6 — The ladder

`trazum ladder`. "Cheap model first, escalate on failure" describes a policy
that saves money and a policy that costs money equally well; one number
separates them, and nobody computes it because an escalation pays **twice** —
the cheap attempt is not refunded. The command prints the break-even escalation
rate beside the measured one. Two identically configured ladders in the worked
example: one saves 70% a call, the other costs 10% more than never having built
it. No sign is claimed within two points of break-even. `escalateOn` is required
and never defaulted, because "anything that is not a success" would mean
documenting a new word silently starts sending traffic to a dearer model.
`validateLadder` catches escalating on a declared success — the most expensive
typo in the file — plus rungs that go down, ladders that never fire, duplicates
and unknown models. Trazum does not run the escalation and says so. Chapter four
of docs/plan-1.51.md.


### 1.50.7 — The experiment

`trazum experiment`. Two arms judged on recorded outcomes and cost together, on
real traffic rather than in a laboratory. Three-valued: A wins, B wins, or **not
separable** — and the third comes with the number of outcomes per arm that would
settle it, so "run it longer" is an instruction rather than a shrug. Identical
rates return null, because no sample size separates a difference of zero.
`--min-outcomes` is required: a stopping rule declared after looking at the
numbers is not one, and the report says whether it was honoured — printed even
when the arms separated, since a separable result read too early is still both.
And the figure the decision actually turns on: what one extra success costs,
per call so arms with different traffic shares compare. Wilson per arm,
Newcombe on the difference. Nothing is auto-promoted. Chapter five of
docs/plan-1.51.md.


### 1.50.8 — The quality gate

`trazum quality`. CI could fail a build for tokens since 1.4 and for dollars
since 1.21; a prompt edit that quietly made the product worse has never been
gateable, so every saving this tool recommended went into a repository with its
most important consequence unmeasured. Now it prints the sentence teams argue
about — "the resolution rate moved from 71% to 64% on 16,800 measured outcomes,
and this change saves $0.50 a call" — with both halves measured. It is a
before-and-after rather than an experiment, so most of the module is spent
looking for reasons **not** to blame the prompt: the model mix moving, the
volume moving, and outcome coverage moving, each forcing "cannot tell" with the
confounder named. A confounder outranks the statistics, so no build fails on a
difference something else could explain. "Not measurably worse" is never "held",
and cannot-tell exits 2. Shipped as `quality` rather than the plan's `check
--against-outcomes`, because check reads prompt files and has never opened a
usage log. Chapter six of docs/plan-1.51.md.


### 1.50.9 — The semantic pass

`trazum semantic`, and the oldest deferred item in the product. The rules engine
has skipped paraphrase-level findings since 0.1.0 because a dictionary cannot
see meaning and a hallucinated finding is worse than a missed one. What changed
is not the model — it is that this arc built a way to check. The price is
printed before anything is sent and `--yes` is required; without it the price is
the entire output. Every quoted passage is checked character for character, near
copies the rules engine already catches are dropped, a near-copy mislabelled a
contradiction is rejected, and every token figure is counted rather than
believed. A ceiling, never a saving — and a contradiction gets no figure at all.
Three guards prove the pass never becomes a prerequisite. Chapter seven of
docs/plan-1.51.md.


### 1.50.10 — Whose money

`trazum owners`. The fleet answered which service in 1.37; this answers whose
budget, which is the question that decides whether anything else gets acted on.
The unallocated is its own line and is **never** spread between the owners you
do know — that is the most common lie in cost reporting, and it makes every
team's figure wrong by an amount nobody can see, hardest on whoever instruments
best. Shared cost is declared by a rule somebody wrote, and the rule is printed
beside the numbers so the argument is about the rule. A split that does not sum
to 1 sends the workload to unallocated whole rather than applying 90% and losing
the rest. An owner with no measured data is "not measured", never "within" — the
1.37 refusal applied to people. Chapter eight of docs/plan-1.51.md.


### 1.50.11 — The commitment

`trazum commitment`. Providers sell committed-use deals and every team that
signs one is doing arithmetic in a spreadsheet against a guessed number — the
highest-stakes instance of the failure this product exists to end, because the
guess is annual and signed. It replays measured whole months against the deal's
terms and prices **both directions**: a commitment is a floor as well as a
discount, and the worked example is net positive with one month that cost
$2,520, kept as its own figure because netted into the saving it disappears. An
as-if calculation carrying `provenance: 'measured-past'` — nothing annualised or
extrapolated. Shortfall risk is a count of real months and their spread, never a
probability. Partial months dropped rather than scaled. Chapter nine of
docs/plan-1.51.md.


### 1.51.0 — The record, and the minor

The release that closes the arc. Its thesis was that every figure this product
printed was a denominator with no numerator — it could say a workload got 40%
cheaper and could not say whether it stopped working. Ten chapters later it
stands in the path of the call and refuses, records a numerator it never infers,
divides by it and prints both rankings, prices a ladder and a contract in both
directions, compares two arms without inventing a winner, fails a build for
quality without blaming what it cannot attribute, finds what a dictionary cannot
and discards most of it, and puts a name on the bill without ever spreading the
unallocated.

`trazum report --year` assembles the year from the store and the plans already
kept — no new data, missing months named rather than filled, three outcomes
never two, and a list of what the record cannot say. It deliberately has no
dollar figure for what arrived, because a verification has never carried one and
assembling a plausible number is the annual-report arithmetic this document
replaces. It reports the record and not the team, asserted by a test.

`docs/our-own-medicine.md` publishes this project's own record the way it asks
users to keep theirs, ending without a score because every miss on it was found
by the same process that made it. `conform` grows outcome and annual chapters
plus cross-field rules, because the refusals worth carrying turned out to be
relational. The doctrine reaches its second edition. Chapter ten of
docs/plan-1.51.md.

### 1.51.1 — A front door

The documentation gets an index. Twenty-three Markdown files had accumulated
with no way in: every one reachable from a link inside some other document, none
of them findable. `docs/README.md` is arranged by what a reader came to do —
deciding, using, extending, maintaining, reporting a problem — and closes with
the four planned arcs presented as the delivered history they are.

`CODE_OF_CONDUCT.md` and `.github/PULL_REQUEST_TEMPLATE.md` were both missing.
The first is explicit that enforcement here is one person rather than implying a
committee; the second asks what a change refuses to do and whether its guard was
proven by planting the violation. The three delivered plans now say so at the
top with their bodies unchanged, and `docs.test.js` asserts that every relative
link resolves and every file in `docs/` is named by the index.

**Nothing installable changed**, and nothing was deleted: every docs file was
counted for inbound links first and the loneliest has three. The disorder was
that there was no way in, not that there was junk. The guard's own probe found
it blind to untracked files — the moment a document is most likely to be wrong.


### 1.51.2 — The stream, and fourteen things nothing was checking

The first chapter of the 1.52 arc. `trazum gateway` relayed every response with
`await upstreamResponse.text()`, so for `"stream": true` — nearly all production
traffic — the caller waited for the whole answer and then received it at once,
and time to first token became the total generation time. The page had the
argument against itself already: it says reading a budget file per request would
put Trazum's latency between you and your provider. It now streams through while
counting, holding three numbers and a partial line rather than the text.

Two documents a machine could not read are fixed: `report --year --json` printed
prose before the document, and `@trazum/core` emitted an `outcome-report`
missing the `schemaVersion` its own contract requires — for nine releases.

And a sweep of every markdown file whose content no test read: fourteen of
thirty, a defect in every one opened but `docs/plan-format.md`, which is recorded
as clean. The README's money table said Anthropic's cache floor was 512 when it
spans 512 to 4,096; `docs/ci.md`'s Action example used an input that has never
existed; `SKILL.md` told agents about nine config keys of seventeen. Each fix
ships with a guard deriving its subject from the code rather than from a list
typed beside it.


### 1.52.0 — The gateway in a real path

The minor that closes the first arc of the 1.52–1.60 plan. `trazum gateway`
shipped at 1.50.3 with the right argument and an implementation nobody streaming
could use: it buffered the whole answer before writing a byte back, so time to
first token became the total generation time. It now relays as the answer
arrives, counting off the events while holding no text.

A refusal arrives before the first byte or not at all — on a refusal the
provider is not contacted at all, so the prompt never leaves the machine, and
once bytes flow the call is committed. The cost of that is stated rather than
discovered: a call beginning inside the budget can end outside it, by one
answer.

And it names the calls it could not measure, with the cause. The common one is
not a failure: on OpenAI a streamed call carries no counts unless the caller
passed `stream_options.include_usage`, so a gateway that stayed silent would
under-report most of a bill and look precise doing it.

It still fronts fewer of the providers Trazum prices than it does not, which is
what 1.53 is for — and how many is a question for `trazum gateway`, which
derives the answer, rather than for this sentence, which said *two* through a
release that made it three.


### 1.52.1 — Two more providers, from facts already here

Three chapters of the 1.53 arc. The gateway stood in front of two of the seven
providers Trazum prices and now stands in front of four, and neither addition
required anybody to type a hostname from memory: DeepSeek's endpoint was already
in the token-band harness, and Google's endpoint, credential header and response
shape were already in the Gemini provider and the Gemini importer.

A provider Trazum prices but cannot front is no longer refused as though it were
a typo — the refusal names the gap, offers `trazum profile` on an exported log,
and says what that does not give you. Both refusals derive their subject from
the catalogue and the upstream table, so a provider that gains support leaves
the gap with nothing edited.

Google's model lives in the URL, so the one forwarded path became an anchored
pattern with a restricted model segment, and the outgoing URL is rebuilt rather
than echoed. Eight hostile paths are refused by test, each proving the provider
was never contacted. The security allowlist learned to extract pattern paths as
exactly as literal ones — without that, the first pattern would have reached a
credential-forwarding proxy without appearing in the allowlist at all.

It also found the buffered path recording nothing and saying nothing where 1.52
had taught the streaming path to speak, a refusal message that would have told a
Gemini user about an OpenAI setting, and two documents carrying provider counts
that had gone stale in a release about that very number.


### 1.53.0 — Four of the seven, and why the other three are not here

The minor that closes the second arc of the 1.52–1.60 plan, on a number smaller
than the plan hoped for. Trazum prices seven providers. The gateway now fronts
four; two more can never be fronted by a proxy of this kind; and the last three
are missing one fact nobody here can supply honestly.

DeepSeek and Google were added without anybody typing a hostname: both
endpoints, Google's credential header and Google's response shape were already
committed in this repository, in the token-band harness and in the Gemini
provider and importer. Google's model lives in the URL, so the one forwarded
path became an anchored pattern with a restricted model segment, and the
outgoing URL is rebuilt rather than echoed — eight hostile paths are refused by
test, each proving the provider was never contacted.

A provider Trazum prices but cannot front is no longer refused as though it were
a typo; both refusals derive their subject from the catalogue and the upstream
table.

Every `https://` host this repository names is now decided about, from a fixed
vocabulary, checked against the compiled upstream table in both directions. A
new host fails by name, untracked files included. Nothing may carry *"model
call, not yet fronted"*, so the day a Mistral, xAI or Moonshot host arrives it
fails the build with the chapter to write.

Bedrock and Vertex are recorded as permanently unfrontable, for a reason proven
from `llm.ts` rather than assumed: both interpolate a region into the host,
SigV4 signs that host, and a per-caller origin is exactly what the compiled-in
upstreams exist to prevent.

It also found the buffered path recording nothing and saying nothing where 1.52
had taught the streaming path to speak, a refusal whose `else` would have told a
Gemini user about an OpenAI setting, and two documents carrying provider counts
that had gone stale in a release about that very number.


### 1.53.1 — The band stays inside the family it was measured in

Two chapters of the 1.54 arc, and the second is a fault that had been in the
product since the estimator learned to price more than one provider. The
published ±10% is measured against Claude's tokenizer and `--exact-tokens`
counts with Anthropic's endpoint; both facts were written down and neither was
enforced.

`optimize --exact-tokens` was handing the caller's own model id to Anthropic's
counter — right on a Claude model, and on `gpt-5` either an upstream error or a
number from the wrong tokenizer labelled *exact*. It refuses by name now, before
asking for a key. The context-overflow advisory has stopped telling other
families that a call **will** fail on a margin measured against Claude: where
the band was never measured, how far over the line a prompt really is cannot be
said, and saying so beats inventing a second band. The advice to run
`--exact-tokens` is bounded to the family it works for rather than deleted.

The band harness measures four families now — OpenAI and Google became
measurable when 1.53 made their endpoints committed facts — and is tied to the
gateway's allowlist, so adding a family needs the same security-test edit that
adding an upstream does. Nothing has been run against a real service: what
shipped is the shape, and every unmeasured family is named as unmeasured with
the command that would settle it.


### 1.53.2 — What the tool says about itself

Four faults with one shape, found by an angle nobody had tried: extracting every
documented `trazum` invocation and comparing it against what the tool actually
says. Every guard in this repository that watches for a stale list was pointed
at the documentation; the product's own help text was checked by nothing.

The USAGE block said the gateway fronts two providers while the gateway itself
answered four. `trazum profile` — the command almost every refusal points a
reader at — was absent from the command list entirely. `ladder` and `owners`
had no options section, so nothing said they take a window, which is the only
thing either command is for. `eval` had two sections under one heading, each
holding half the answer.

And an Action pin could name a commit that is not on `main`: the pre-squash head
of a feature branch says the right version, satisfies every existing check, and
is deleted when the pull request merges. Caught while preparing this release,
on this release's own pin.

Three new guards, each derived from the code and each proved against a planted
defect as well as against the corrected text. Two negative results recorded
rather than assumed: no documented flag is missing from the CLI, and the
"thirty-two commands" figure is right.


### 1.53.3 — Two surfaces, two formats

The doc-drift hunt continued into the two places it had not looked: the page npm
renders, and the transcripts that claim to be real output.

`packages/cli/README.md` showed twenty-one of the thirty-two commands as though
they were all of them, with `trazum gateway` — the only thing here that can
refuse a call before the money is spent — absent entirely. The fix is to say the
table is a selection, not to list them all on a page like that.

`trazum doctor`'s transcript wrote its money column `~$4,912` where the command
prints `~ $4,912`. A rule banning that sequence across the documentation would
have broken the correct surface: `optimize`'s advisory suffix has no space by
design, and two READMEs show it exactly as the tool prints it. The guard takes
the column's shape from running the command instead.

Three things this found in its own work: writing the disclaimer reproduced the
defect it was fixing twice in one paragraph; the check written to catch the
second was case-sensitive and did not catch it; and an existing guard caught
this work's own test bounding a section by its neighbour.


## 1.60.1 — "What else does this fail on" — released

**A patch, and nothing installable changed.** With the plan finished as far as it
can go, this is the shape of the work that follows one: a guard that had been
checking the wrong thing for four releases, the document it was supposed to be
checking, and the doctrine rule that would have caught both.

The guard compared the `~ ` before a money figure in the `trazum doctor`
transcript and called it format. That space is right-alignment — the command
prints `~ $10.59`, `~  $8.82` and `~$0.5300` in one column — so the check agreed
or disagreed on how wide this repository's own figures happened to be, and broke
on a config change that never touched the README. It now measures what the column
actually promises: the text starts at the same offset on every row, priced or
not, measured on both sides.

**And the defect it was written for was there**: the transcript's unpriced rows
sat one column left of the priced ones, on a page headed *Real output,
transcribed*.

**A rule joined the doctrine**: *and prove it does not fire on anything else* —
the half of the guard rule that keeps being skipped because the first half
passed. Two instances on this project's record, both a proxy that correlated with
the property until it did not.


## 1.60.0 — "Our own medicine, measured" — released

**The last arc the 1.52–1.60 plan named, and it does not close the plan.** Six of
the nine arcs are delivered. 1.54.0 and 1.57.0 are blocked on provider
credentials this repository does not have, and 1.58.0 is an editor extension — a
distribution commitment rather than a feature. Those three stay open and named,
which is the plan's own answer to an arc it cannot build.

**The arc committed to a scoreboard before the code and reports one of three.**
*The record is self-reported* is no longer true: five defects on the record were
found by CodeQL and by nothing here, and the 1.8.0 entry is the one that carries
the weight — CodeQL kept that alert open twice against this project's judgement
and was right both times. What that does not establish is written beside it: an
outside instrument this project turned on is narrower than an audit.

**The tokens this project puts on other people's bills are counted for the first
time.** Four system prompts ship inside `@trazum/core` and go to a model on every
model-side run: 1176 tokens, from which this project's own rules recover six. That
is one real outcome on the record — the feature this product leads with, measured
on the only corpus this project owns — and it is why the second admission is
weakened rather than untouched.

**And the loop this product sells was inert in the repository that sells it.**
`trazum init`, `trazum baseline` and `trazum check` shipped arcs ago and this
repository had no config and no baseline of its own. Both are committed, CI runs
the gate, and `ignore` is a new config key — the thing that had to exist first,
because directory mode decided what a prompt was from the extension alone and read
seventy-four documents and thirty-five fixtures as prompts.

**The third admission stands in full**, and the reason is written down rather than
worked around: this project would have to spend money on models and record it, and
it does not spend. The one instrument available for *whether it is used* was
refused on the record — npm download counts bound above and nothing bounds below.


## 1.59.0 — "A language needs a maintainer" — released

**The arc closes, out of order and deliberately.** 1.57.0 and 1.58.0 stay open —
1.57's remaining chapter needs a provider credential this repository does not
have, and 1.58 is an editor extension, a distribution commitment rather than a
feature. An arc that can be finished beats a slot left idle waiting for one; the
same call 1.55.0 made, and the gaps stay gaps rather than being renumbered away.

**What the arc asked for**: make the maintainer requirement a real, documented
role with a real bar, and then admit that whether it lands is not a scheduling
question. It explicitly did not ask for an eighth language, and does not deliver
one.

**Five of the seven dictionaries had never been read by anybody who speaks the
language.** `DICTIONARY_STANDING` records which is which. The report says so on
two branches that are different claims: when nothing fired, where silence reads
as *your prompt is already efficient*; and when a rule **did** fire on a prompt in
one of the five, where the tool has just applied an unverified judgement to
somebody's text. The second is gated on the prompt's own detected language and
stays silent when the language cannot be placed.

**[The role](docs/language-maintainer.md) is written down with its bar**, and
`scripts/dictionary-worklist.mjs` prints the entries a maintainer would be
judging — which corrected the page's own estimate from "a few hundred short
phrases" to thirty-to-thirty-eight, and surfaced that the five unreviewed
dictionaries are less than half the size of the two somebody read.

**A rule joined the doctrine and no test can enforce it**: *a rule you wrote for
yourself is a claim like any other.* This arc's own premise had been broken for as
long as the premise existed — the promise not to judge a language nobody here
reads sat in this roadmap while five such dictionaries shipped. No guard catches a
rule and a catalogue disagreeing; only re-reading one against the other does.


## 1.56.2 — "What this project was claiming about itself" — released

**A patch with no new command, and two arcs each opened rather than closed.**
1.59 — *a language needs a maintainer* — and 1.60 — *our own medicine, measured*
— gained their first chapters here. Both chapters are the same act done twice: a
sentence this project had been saying about itself turned out to be wrong, and
was measured rather than argued with.

**Five of the seven trimming dictionaries had never been read by anybody who
speaks the language.** The report named all seven in one sentence, which reads as
seven dictionaries of equal standing; two of them are languages Trazum reports
in, and that is the only evidence in this repository that anybody here reads
them. `DICTIONARY_STANDING` records which is which, the report says so on the
branch where an empty result would otherwise reassure, and
[docs/language-maintainer.md](docs/language-maintainer.md) makes the missing role
real: what a maintainer decides, what is asked, what is deliberately not asked,
and what happens when nobody holds it.

**This roadmap had been saying the opposite for several arcs**, which is the
uncomfortable half. An eighth language was held back on the stated grounds that a
dictionary is a judgement about a language and this project will not make it in a
language nobody here reads — while five such dictionaries were already shipping.
The five stay: a Dutch prompt is better served by a dictionary that fires and
says it was never reviewed than by silence. What stops is describing them as
though somebody had read them.

**And one of the three things this project could not say about itself stopped
being true.** Five defects on the record were found by CodeQL — 1.8.0, 1.46.0,
1.50.3, 1.53.4 and 1.55.0 — and not one by a test here. The 1.8.0 entry carries
the weight: CodeQL kept that alert open twice against this project's judgement
and was right both times, which is a shape a self-report cannot contain. What it
does not establish is written beside it — CodeQL runs because this project turned
it on, so it is an outside instrument rather than an independent audit. The other
two admissions are untouched.

**No promise of an eighth language.** Whether the maintainer role is ever filled
is not a scheduling question, and the page says so rather than implying a queue.


## 1.56.1 — "What the rules actually do" — released

**A patch, and the number is the honest one.** A minor closes an arc, and the
arc in progress is 1.57 — the optimiser earning its name again — whose thesis is
what belongs on the model's side of the line. Nothing in this release answers
that. What it does is make the other side legible enough to argue about.

`trazum rules --measure` runs the optimiser once per rule alone and once per
rule removed, keeps the two figures apart because they diverge wherever rules
overlap, and separates the normalisation floor from the rules' own work. Twelve
fixtures exercise every rule, so "inert" becomes a signal rather than the only
answer available. And the catalogue's order — which decides whether a repeated
stanza is reported as one paragraph or three lines, for the same saving — is
pinned, because nothing had ever said out loud that the order decides what the
reader is told.

**Three findings the measurement produced immediately.** The first version
credited the optimiser's normalisation to the rules and concluded that every
rule was redundant. `emphasis` fires and recovers nothing — it lowercases
shouted words, changing the instruction and not the count — which needed a field
of its own, because "never fired" and "fired and saved nothing" look identical
in a saving column and mean opposite things. And on the two sample prompts this
repository ships, the deterministic rules recover **nothing at all**.

**What the arc still owes is blocked, and named as such.** A model-side
candidate that has never been run against a model is the measure-by-reading this
repository refuses everywhere else. Same treatment as 1.54.0, same reason.


## 1.56.0 — "Something that runs" — released

**The arc that turned out not to need a runtime.** It asked whether alerting can
be given without becoming a hosted service holding other teams' metrics, and
committed in advance to publishing the reasoning if the answer was no.

The answer is **yes for the noticing, no for the last hop**. What shipped is
three ways of making the *absence* of a run visible, because a scheduled job
that stopped does not announce itself — it goes quiet, and quiet is also what a
healthy watcher with nothing to report produces.

`history` names the calendar stretches no report covers, and puts the count on
the run that spans them: "climbing for four periods" over an unmeasured
fortnight was a sentence this tool should never have let anybody form.
`trazum pulse` is the outside view of a scheduled job, because the file that
would tell you the watcher stopped is read only by the watcher.
`docs/running.md` is the argument, the recipes for four schedulers, and the
section naming what a tool without a host cannot do: page you, retry a delivery,
deduplicate across channels, or know you are on holiday.

**It infers no schedule anywhere.** No expected cadence, no "this run is late"
without a threshold somebody typed. A first-time reader gets ages and no
opinion, which is the same refusal every gate in this product has carried since
a budget was first called a policy.

CodeQL was quiet this time. The defect worth recording is that
`--max-stale-hours 36` built, ran, printed a full report and gated on nothing,
because a flag that takes a value and is not declared as taking one parses as a
boolean and its value becomes a positional argument. Found by running the
command; now a derived guard over the whole class.

**1.54.0 is still missing and still on purpose.**


## 1.55.0 — "More than one machine" — released

**The arc that had no answer at all.** Every command here operated on files one
person had. `--by-source` and `owners` divide a bill somebody already collected;
nothing combined bills nobody collected together, and the workaround was
emailing logs around, which is the one thing this tool exists not to make anybody
do.

`trazum rollup` merges profile documents several people produced separately. **A
format and a merge, not a service** — no upload, no account, and the transport is
whatever the team already uses, because a tool whose argument is that it reads
your bill without uploading it cannot also be where everybody's bill is uploaded.

**The merge was the easy half.** Most of a profile does not merge: percentile
shapes, conversation growth, repeated turns and truncation retries are all
computed from individual calls, so the deliverable is as much a list of refusals
as an arithmetic. A day drawn from two contributors has no dearest label. The
largest single call is a maximum, never a sum. Each contributor's gaps stay with
that contributor rather than being averaged into a figure that hides which
machine is blind.

**And one refusal no implementation can lift**: overlap between contributors is
unmeasurable, because the raw lines a duplicate check needs are in no document.
Every roll-up of more than one contributor says so, and `conform` fails one that
does not — a format that carried the fields and lost that refusal would hand
somebody a doubled total that looks audited.

**Two questions the arc found rather than started with.** A span is not a
period, so the window a contributor *claims* to cover travels beside the one it
observed and every silent day inside it is named. And a roll-up is a
contribution too, so three teams can roll up and an organisation can roll up the
three — with every refusal surviving the nesting, which is the whole difficulty:
a refusal that stops at a layer boundary is worse than one that never existed,
because the layer makes it look audited.

**1.54.0 is missing on purpose and stays missing.** The counter-per-family arc
needs provider API keys this work did not have, and the hole in the sequence is
the record that an arc was jumped rather than dropped. Renumbering the plan to
close it would rewrite a document whose whole value is having been written
before the code.

CodeQL found a file-system race in the new command on the pull request that
introduced it — `stat`, branch, then read — and the fix is to ask once rather
than to check first. Three enumerations that had been retyped and gone stale
were replaced by derivations, including the guard that was itself the stale
count.


## 1.53.4 — "What it says and what it does" — released

The web app got a shell — a sidebar rail with a drawer below `lg`, an account
menu at its foot, three waiting states in the shape of their own reports, and
two exact columns whose every number is derived from the row's own padding
rather than typed. Then two audits of that shell found fifteen defects in it,
and a pass over the README found thirty-one more.

**Every one is the same gap**: something said one thing and did another, and the
saying was never wrong enough to notice by reading. A class list that merged
correctly and computed to the primitive's value — three times, including an
active row with no surface at all in either theme. A page headed *"Real output,
transcribed"* whose transcripts stopped early, twenty of them, with the
convention for marking that already in the file and used once. A `--max-growth`
documented as a percentage that compares a token count. A headline figure six
times too high, contradicted by another block on the same page.

**Five of the nineteen defects were introduced while fixing the others**, and
not one was visible in the source: a focus trap that read its container once
while Escape kept working because it returns first; a retry that stopped at
finding a candidate rather than at moving focus; an `outline-none` and an
`outline-2` computing together to nothing; a comment written off a reading taken
three percent into a transition; and an `overflow-x: visible` control that was
not a control.

Five guards, each derived from the thing it guards. **Four cried wolf on their
first version** — a hover override that wins, an `_svg` rule that paints, a
child's prop name, a working override sharing a property family — so state and
element are each half the rule now. **And CodeQL found a ReDoS in one of them
whose own proof would have passed against the vulnerable version.**

What stayed out is written down: ten README figures that would have to be
reconstructed from logs this work does not have, four transcripts needing a
credential it does not have, and one sentence seen and deliberately not claimed.


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

**Nothing is planned above 1.60.0**, and that sentence is the honest state of
this roadmap rather than a flourish. Nine arcs were written down in advance
through 1.60.0 — [docs/plan-1.52-1.60.md](docs/plan-1.52-1.60.md) — and under the
numbering adopted at 1.50.1 a minor closes an arc, so each of 1.52.0 … 1.60.0
lands one thesis. Six landed. **The three that did not are numbered below the
last release**, which is an unusual shape and the reason it is stated first:

| Arc | Why it is open |
|---|---|
| 1.54.0 | Per-family counting bands need a key for each family's own counting endpoint |
| 1.57.0 | What belongs on the model's side of the line cannot be decided without running it against a model |
| 1.58.0 | An editor extension is a distribution commitment rather than a feature |

Two of those wait on a credential this repository does not have, and inventing
either answer is the estimating-and-measuring merge that 1.36–1.40 spent five
releases removing. The third waits on a decision nobody has made. **The gaps stay
gaps**: renumbering them away would rewrite a document whose whole value is having
been written before the code.

What comes after is not written down, because it is not decided. A tenth arc
announced here today would be a projection on the roadmap of a tool whose first
doctrine rule forbids exactly that.

**1.60.0 is delivered, and it is the last arc the plan named.** The plan is not
finished: six of nine arcs are done, and 1.54.0, 1.57.0 and 1.58.0 stay open with
their reasons on the record rather than renumbered away. What 1.60.0 delivered is
a scoreboard it committed to in advance and reported honestly at one of three —
including the admission that still stands, and the instrument it refused to quote
for the one it could not measure.

**1.59.0 is delivered, and closes its arc out of order.** The maintainer
requirement is a documented role with a bar, the five dictionaries nobody here
reads are named where a reader would otherwise draw the wrong conclusion, and the
worklist a volunteer would be handed can be printed. What it does not deliver is
an eighth language: whether the role is ever filled is not a scheduling question,
and the arc closes saying so rather than implying a queue.

**1.57.0 and 1.58.0 are now the open ones**, and neither is idle by accident.
1.57's remaining chapter — what belongs on the model's side of the line — needs a
provider credential this repository does not have, the same block 1.54.0 sits
behind. 1.58 is an editor extension, which this roadmap has called a distribution
commitment rather than a feature since 0.10.0.

**1.52.0, 1.53.0, 1.55.0 and 1.56.0 are delivered.** The gateway stopped buffering the whole
upstream reply before writing a byte back, and then learned who it can stand in
front of: which providers it fronts, which two it can never front and why, and
which are missing a fact this repository cannot supply without guessing. How
many of each is a question for `trazum gateway` and `trazum connect`, which
derive the answer, rather than for this page. What each arc still cannot do is
in [RELEASES.md](RELEASES.md).

**1.53.0 closed on less than its title asked for**, deliberately: a gap that is
named, proven and alarmed is finished work, and a gap papered over with a
half-remembered hostname is not. Three providers wait on somebody confirming an
endpoint; a guard fails the build the day one arrives.

**The next arc in the ordering answers something wrong or missing today**, and
the plan points at the line of code for it — but it is **blocked**, which is why
1.55.0 went first:

1. **1.54.0 — the counter, per family.** The estimator is calibrated on Claude
   and prices seven families. This roadmap has called the per-family error the
   one number that settles the real-tokenizer question, and nobody has measured
   it. Measuring it needs a key for each family's own counting endpoint, and
   inventing a band instead is the estimating-and-measuring merge 1.36–1.40
   spent five releases removing.

**1.56.0 asked a question and answered it.** Whether alerting can be given
without becoming a hosted service holding other teams' metrics: yes for the
noticing — `history` names the stretches nobody measured, `trazum pulse` gives
the outside view of a scheduled job, and the CI you already run is the thing
that notices — and no for the last hop, which is written down rather than left
to be discovered.

**1.55.0 is delivered, out of order and deliberately.** More than one machine
was an intention rather than a defect, and it sat behind 1.54.0 in the ordering —
but 1.54.0 needs provider keys this repository does not have, and an arc that can
be built is worth more than a slot left idle waiting for one. `trazum rollup`
merges profile documents several people produced separately: each contributor's
gaps preserved rather than averaged away, the window a contributor claims to
cover kept apart from the one it observed, a roll-up accepted as a contribution
to another roll-up, and the overlap between contributors named as unmeasurable
every time.

**1.54.0 is a hole in the sequence, not a renumbering.** The number stays with
the arc it names. Moving the plan's numbers to close the gap would rewrite a
document whose whole value is having been written before the code, and the gap
is the record that an arc was jumped rather than dropped.

**The remaining six are an ordering of intentions, not commitments about
content** — more than one machine (1.55.0), something that runs (1.56.0), the
optimiser earning its name again (1.57.0), where the prompt lives (1.58.0), a
language needs a maintainer (1.59.0), and our own medicine measured (1.60.0).

The plan says which kind each arc is, in the arc's own section. Presenting all
nine with equal confidence would be merging a measurement with a projection on
the roadmap of a tool whose first doctrine rule forbids exactly that.

**No dates, and no pace.** The ordering is the commitment. What would reorder
it is written down at the end of the plan rather than left to be inferred.

**The arc through 1.51.0 is delivered in full**, with its errata on the record:
[docs/plan-1.51.md](docs/plan-1.51.md). Its thesis was the gap this product had
carried since the beginning: **every figure it printed was a denominator with no
numerator.** It could say a workload got 40% cheaper and could not say whether it
stopped working. Ten chapters answered that — the gateway in the path of the call
(1.50.3), the outcome the caller records and nothing infers (1.50.4), cost per
resolved outcome (1.50.5), the escalation ladder priced in both directions
(1.50.6), two arms on real traffic (1.50.7), the quality gate that refuses to
blame what it cannot attribute (1.50.8), the semantic findings deferred since
0.1.0 (1.50.9), the bill with a name on it and nothing spread (1.50.10), the
commitment replayed against the measured past (1.50.11), and the year assembled
from what was already written down (1.51.0).

The plan document deliberately did **not** pin a patch number to each chapter.
The first draft did, and 1.50.1 (the numbering) and 1.50.2 (the feedback loop)
both arrived without being in it. Work outside a plan is not a failure of the
plan; a plan that pretends otherwise goes stale on contact with the first good
idea. The order is the commitment.

**The arc through 1.50.0 is delivered in full** as well:
[docs/plan-1.41-1.50.md](docs/plan-1.41-1.50.md). Its thesis was that the loop
was complete and inert — every command waited for a human to type something, so
nobody ran it on the afternoon it would have mattered, and the agent actually
spending the money had no way to ask. Ten releases answered that: the connector
(1.41), the store (1.42), the watch (1.43), the answer in milliseconds (1.44),
the agent's budget (1.45), five-minute onboarding (1.46), the bill in the
browser (1.47), cost review in CI (1.48), the live budget (1.49), and the
format, the guarantees and the doctrine other tools can build on (1.50).

The two arcs before those were also delivered in full:
[docs/plan-1.36-1.40.md](docs/plan-1.36-1.40.md) introduced Trazum's estimating
and measuring halves to each other, and
[docs/plan-1.30-1.35.md](docs/plan-1.30-1.35.md) precedes it.

Everything under *Under consideration* below stays where it is until something
moves it. An entry there is not a queue with the front of it hidden — it is the
reasoning for why the thing is not scheduled, and it is written down so that
deciding differently later is a visible act. **Three of those entries are now
scheduled**: the tokenizer question lands in 1.54.0, cost alerting is what
1.56.0 has to answer honestly, and the editor extension is 1.58.0.

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

  **What that role is was written down at 1.56.2**, with its bar, in
  [docs/language-maintainer.md](docs/language-maintainer.md) — along with the
  admission that five of the seven dictionaries already shipping had never been
  read by a speaker either. The page does not move this entry into the schedule.
  Whether somebody fills the role is not something this project can plan.

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
