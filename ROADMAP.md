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

**Still needs the maintainer, once.** The `@trazum` scope does not exist on npm
(`@trazum/core` returns 404), so it has to be created and this repository
configured as a trusted publisher for both packages.
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

## Next

### 1.5.0 — The error band, measured

**Why this slipped from 1.3.0 to last.** The corpus, the harness and the test all
shipped in that release; the *measurement* cannot happen inside this repository,
because ground truth needs the official counting endpoint and a key. Rather than
hold two releases that could ship behind one that cannot, the queue moved and this
entry stayed open. It is the only item here whose completion is not ours to
schedule, and the file owes that explanation rather than a silent renumber.

`±15%` is printed on every report, appears in both READMEs, in the estimator's own
doc comment and in `VERSIONING.md` as part of the frozen API. Every dollar figure
Trazum prints descends from it — and `estimateTokens` was tested for exactly three
things: zero on empty input, monotonic growth, and never returning `NaN`. Nothing
measured its accuracy.

It is also **one number for all text**, which is a second assumption. The
estimator is calibrated per character class and treats CJK, digits and punctuation
quite differently from words; there is no reason those should land on the same
accuracy. If the real error on Japanese is 40%, every figure for a Japanese prompt
is wrong while the report says ±15%.

**In place now:** a committed corpus of eight samples covering prose (English and
Spanish), CJK (Japanese and Chinese), code, few-shot blocks, punctuation-heavy
tables and dense numerics; `scripts/measure-token-band.mjs`, which measures them
against the official counting endpoint and subtracts the message envelope so the
figures describe the text; and `token-band.test.js`, which asserts the band per
sample as soon as the ground truth exists.

Three things that test does deliberately:

- **It does not pass quietly while unmeasured.** "0 failures" from a check that
  measured nothing is the most misleading thing a suite can report — the same
  reasoning that makes `trazum check` treat an unbudgeted run as an error. It
  skips out loud and names the command.
- **It requires the documentation to admit the band is unverified** until ground
  truth exists, so `±15%` cannot quietly harden from an estimate into a fact
  nobody established.
- **It carries a digest of the corpus.** Numbers describing text that has since
  been edited pass while describing something else, which is worse than no
  numbers at all.

**Needs the maintainer once:** `ANTHROPIC_API_KEY=... npm run measure:tokens`.
The counting endpoint is free and does not run the model, so it costs nothing
beyond the round trips. Commit what it writes and the assertions go live.

**Then, and only then, the decision this release exists for:** if the bands differ
materially by type — which the CJK case suggests they will — the report stops
printing one number for all text and says the band that applies to the prompt in
front of it.

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

  **Unscheduled pending 1.3.0, and that ordering is the point.** Measuring the
  error band is what decides whether this is needed at all: within 5% on prose and
  the dependency is not worth taking; 40% out on CJK and it is. Deciding now would
  be deciding without the one number that settles it.
- **Prompt library.** Storing prompts is a different product, and one that
  would mean sending them to a server. Trazum's privacy story is that it never
  does.

---

## How versions are decided

See [VERSIONING.md](VERSIONING.md). Briefly: while below 1.0, minor versions
may contain breaking API changes and always say so at the top of their
changelog entry.
