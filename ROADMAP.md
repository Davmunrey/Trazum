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
- Dependency-free heuristic token estimator (±15% on ordinary prose).
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

## Next

Nothing scheduled. 1.0 is a floor, not a finish line — see **Under
consideration** below for what is on the list and why none of it is dated.

---

---

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
- **Editor extension.** Live token cost while writing a prompt is the right
  place for this to live. Unblocked as of 0.10.0 — it now has a config file and
  a budget per path to read — and still unscheduled, because an extension is a
  distribution commitment (a marketplace listing, an update cadence) rather than
  a feature.
- **Tokenizer per model family.** The heuristic compares two versions of the
  same prompt well, which is what it is for. A real tokenizer would improve
  absolute figures at the cost of the dependency-free promise — worth doing
  only as an optional package.
- **Prompt library.** Storing prompts is a different product, and one that
  would mean sending them to a server. Trazum's privacy story is that it never
  does.

---

## How versions are decided

See [VERSIONING.md](VERSIONING.md). Briefly: while below 1.0, minor versions
may contain breaking API changes and always say so at the top of their
changelog entry.
