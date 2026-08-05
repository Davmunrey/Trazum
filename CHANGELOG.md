# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

`Unreleased` holds what is merged into `main` but not yet tagged. A change that
alters nothing installable — a test, a document — still lands there rather than
nowhere: the changelog is the record of what happened to this repository, and a
merged commit with no entry is a change only `git log` remembers.

## Unreleased

**Reordering for the cache is on the web.** It is the largest saving Trazum can
make — a $0 caching saving against a $184 one on a 1,178-token support prompt —
and it was reaching only people who had cloned the repository and built the CLI.
The web is the front door; the biggest thing the product does should not require
a terminal to find.

Opt-in over HTTP for the same reason it is opt-in on the command line, and the
reason is stated in the route rather than left in the diff: every other
transformation the endpoint performs deletes text whose absence is local, and this
one *moves* text, where order carries meaning. Nothing about it is less safe here
— the same deterministic core, nothing sent anywhere, the prompt returned
byte-identical when it cannot act — but "the browser did it quietly" is not
something this endpoint should be able to do.

- **Honoured only on a literal `true`.** A string, a number and `null` are all
  ignored: the body is untrusted, and a truthy check would let `"false"` rearrange
  somebody's prompt.
- **`original` stays what the caller sent**, so the diff the browser draws shows
  the move instead of hiding it behind the deletions.
- **Refusals come back in the response** and render whether or not anything moved.
  The panel is deliberately not styled like the green savings box — that is a
  saving to enjoy, this is a change to review — and it sits above the money so the
  number is read after the caveat rather than instead of it.

Verified against the running server rather than the module underneath it: the
endpoint moves and reports, omits `reorder` entirely when it was not asked for,
returns the prompt byte-identical with both refusals named when it declines, and
ignores a non-`true` value three ways. The checkbox and its warning render in both
locales.

`ROADMAP.md` records what is deliberately **not** coming to the web — the pricing
overlay, config-aware defaults and budgets — with the reasoning, rather than
leaving three unexplained gaps. A textarea for pasting prices into somebody else's
server is not the overlay feature wearing a different hat; it is a worse one, with
no review and no provenance.

The queue was renumbered so `Released` runs unbroken: embedded prompts became
1.3.0 and the web 1.4.0, and **the error band moved to last**. Its corpus, harness
and test all shipped; the measurement needs the official counting endpoint and a
key, so it is the only entry whose completion is not ours to schedule. Holding two
releases that could ship behind one that cannot would have been the wrong trade,
and the file says so rather than renumbering quietly.


**`check` now reads prompts embedded in source files.** It read `.txt`, `.md`,
`.prompt` and `.tmpl`; real prompts live in TypeScript template literals and
Python strings, so adopting Trazum meant refactoring them into standalone files
first — the largest barrier to adoption the tool had.

```ts
// trazum:prompt support-system
export const SUPPORT = `You are a support agent.

Customer message: ${message}`;
```

**It reads a marker rather than guessing.** Inferring which string in a file is a
prompt is a heuristic, and a heuristic inside a CI gate fails builds over log
lines and SQL queries. `//`, `#`, `--` and `<!-- -->` cover the languages prompts
live in.

`${x}` needed no handling at all: it is exactly the shape `segment.ts` already
protects, so an embedded prompt gets the same cache-prefix analysis, rule
protection and `--reorder` treatment as a `{{x}}` template, with no second code
path to drift.

- **Each prompt is budgeted on its own**, not summed into the file. Four prompts
  in a file are four things to govern, and the imports around them are not tokens
  the model will see.
- **The id is path-prefixed** — `src/prompts.ts#support-system`, or
  `src/prompts.ts:12` for a bare marker — so existing `budgets` globs cover
  embedded prompts without new syntax.
- **Source files are scanned without being opted into.** Requiring config to
  discover a marker somebody just wrote is how `eval` came to be fully implemented
  and completely undiscoverable. An unmarked source file is dropped silently.

**A marker Trazum cannot read fails the build.** A prompt assembled by
concatenation has no text until it runs; Trazum declines it and names the line
rather than governing the fragment it can see. The author marked that prompt to
have it governed, and a green build saying otherwise is the same lie as "0
failures" from a run that measured nothing.

Scanned character by character rather than with a regex, and the hostile-input
tests earned their place immediately: the obvious line-number lookup was quadratic
in the number of markers — 15.5 seconds on a file holding 20,000. Caught before it
shipped rather than after.

One more found in review, by CodeQL: `<!-- trazum:prompt greeting--!>` produced the
name `greeting--!>`, because `--!>` is the *comment end bang* the HTML parser also
accepts and only `-->` was being stripped. Fixed for both terminators, and the
class closed behind it — a name is now constrained to an identifier charset rather
than "whatever is left on the line", falling back to the `file:line` id when it is
not one. The name is printed in reports and matched against budget patterns; it
should never have been arbitrary text.

`diff` for embedded prompts is still to come; `check` is the gate and came first.


**The ±15% error band now has a corpus, a harness and a test.** It is printed on
every report, appears in both READMEs, in the estimator's own doc comment and in
`VERSIONING.md` as part of the frozen API — and `estimateTokens` was tested for
exactly three things: zero on empty input, monotonic growth, and never returning
`NaN`. Nothing measured its accuracy, and every dollar figure Trazum prints
descends from it.

Eight corpus samples, chosen to exercise the branches the estimator actually has:
prose in English and Spanish, Japanese and Chinese, code with fenced blocks,
few-shot Input/Output pairs, a punctuation-heavy Markdown table, and dense
numerics. `scripts/measure-token-band.mjs` (`npm run measure:tokens`) counts them
against the official endpoint and subtracts the message envelope, so the figures
describe the text rather than the request around it.

`token-band.test.js` asserts the band per sample. Three deliberate choices in it:

- **It does not pass quietly while unmeasured** — it skips out loud and names the
  command. "0 failures" from a check that measured nothing is the most misleading
  thing this suite could report, which is the same reasoning that makes `check`
  treat an unbudgeted run as an error rather than a pass.
- **It requires the docs to admit the band is unverified** until ground truth
  exists, so `±15%` cannot harden from a design target into a fact nobody
  established. `tokenizer.ts` and the README now say so.
- **It carries a digest of the corpus**, because a fixture describing text that
  has since been edited passes while describing something else.

Both paths were exercised before committing: a synthetic fixture confirmed the
band assertions fire per type with an actionable message, and that editing the
corpus afterwards fails on the digest. **The synthetic fixture was then deleted** —
fabricated numbers are exactly what this test exists to prevent, and committing
them to make a suite look green would be the same failure wearing a lab coat.

**Needs the maintainer once:** `ANTHROPIC_API_KEY=... npm run measure:tokens`. The
endpoint is free and does not run the model. Commit what it writes and the
assertions go live; if the bands differ materially by type, the reports stop
printing one number for all text.


**A tag now publishes the release.** Publishing is the one action in this
repository that cannot be undone — npm allows unpublishing for 72 hours and then
the version number is spent for good — and until now it was also entirely manual.
A tag matching `v*.*.*` runs full `verify`, reports exactly what each tarball
would contain, and then publishes both packages.

**Trusted publishing (OIDC), not a stored `NPM_TOKEN`.** That is the decision in
this change rather than an implementation detail. A long-lived publish token would
be the highest-value credential the project holds, sitting in secrets permanently
for something used a few times a year — and unlike every other secret here, a leak
is not recoverable by rotation alone, because whatever was published under it
stays published. OIDC needs `id-token: write` and stores nothing. Provenance comes
free with it, so a consumer can verify a tarball was built from this repository at
this commit.

Three refusals, each a mistake with no correction afterwards, and each with a test:

- **The tag and the manifests must agree.** `publish.test.js` already asserts
  every manifest carries the same version; the workflow checks that the shared
  version is the tagged one.
- **`verify` runs before anything is published**, and it is the same `verify` a
  pull request runs. A release gate that checks less than the pull-request gate
  lets through exactly what the tag was for.
- **`workflow_dispatch` is dry-run only** — every publish step is gated on a tag.

`@trazum/core` publishes first, because the CLI depends on it at an exact version
and the other order leaves a window where installing the CLI fails.

**Still needs the maintainer once:** the `@trazum` scope does not exist on npm, so
it has to be created and this repository configured as a trusted publisher.
[docs/releasing.md](docs/releasing.md) is new and has the exact fields, the
cutting-a-release checklist, and what to do when a release goes wrong — including
the field that is easy to get wrong: npm's *Environment* must read `release`, or
the OIDC claims do not match and the publish is rejected with an error about the
token rather than about the mismatch.

Until it is done a tag push runs every check and fails at the publish step — which
is the right failure, having published nothing.

**Issue templates, so a tester has somewhere to land.** `.github/` had CODEOWNERS,
Dependabot and workflows but no way for anyone to report anything. Two forms: a
bug report, and *"a rule changed what my prompt asks for"* — the second one
separate and labelled `correctness`, because Trazum's entire claim is one sentence
and a rule that saves tokens while quietly changing the meaning is the failure the
product exists to prevent, not a smaller version of a good outcome.

Both forms ask for a reproduction and both warn, before anything else, not to
paste a prompt containing anything private: Trazum runs entirely on your machine
and never sends a prompt anywhere, but an issue is a public web page. Security
reports are routed to a private advisory rather than an issue, and blank issues
stay enabled — the reports nobody anticipated are usually the interesting ones.


**Property tests for `reorderForCache`, over 400 generated prompts.** The
hand-written fixtures each ask one question about one prompt, and a fixture list
only asks the questions it encodes — which is how two quadratic patterns, a CRLF
bug and a leading-blank-line bug all shipped in the same module and were caught
one at a time afterwards.

Eight properties, checked across every generated case: content is conserved (no
word deleted or invented), a refusal returns the prompt byte-identical, a move
always grows the prefix and the figure reported matches what the advisories'
analyser computes, moved blocks keep their relative order, backward references
and placeholder blocks never move, the transformation is idempotent, the author's
line ending survives, and the prompt neither opens with a blank line nor ends
differently from how it was given.

Generation is seeded rather than random, so a failure names a case you can
reproduce by reading the seed out of the message.

All eight pass. Three failed on first run and all three were the *assertions*
being wrong rather than the code: `indexOf` from zero finds the first copy of a
repeated block, so a duplicate read as an out-of-order move; the generator emitted
mixed line endings and then asked whether endings were preserved; and a moved
block legitimately brings its own indentation to the front when the placeholder
sits on the first line. Each is now written to ask what it meant to ask.


**A piped `--reorder` said nothing about what it had done.** Redirecting the
output takes the "prompt and nothing else" path, which is right for every other
transformation — they delete, and the diff shows it. This one moves text, and
piping it made both the move and the refusals invisible. That is precisely what
the module promises not to do: *"a saving Trazum chose not to take is one the
author cannot evaluate."*

One line now goes to **stderr**, so stdout still carries the prompt and nothing
else:

```
trazum: moved 1 block (~1,001 tokens) into the cacheable prefix. Run without redirecting output for the reasons.
trazum: nothing could safely move; 2 blocks left in place. Run without redirecting output for the reasons.
```

**The version comment added yesterday named a version that does not exist.** The
README's SHA pin read `# 1.1.0` against manifests reading `1.0.0` — no such tag,
no such package. The test written to stop exactly this class of drift only
required `#\s*v?\d`, so it passed. It now compares the comment against
`package.json`, and fails on the string it was shipped with. A test that admits
only the shape of an answer will accept a wrong one.


**The README recommended a tag that did not exist.** `Davmunrey/Trazum@v1.0.0`
was the copy-pasteable Actions example for a whole release, and no such tag was
ever pushed — so anyone following the quickstart got a workflow that could not
resolve its own action.

It was also the wrong *shape*. [SECURITY.md](SECURITY.md) says every third-party
action is pinned to a commit SHA because a tag is a movable pointer, and
`security.test.js` enforces that on every workflow in this repository. The README
was telling readers to do the thing the project refuses to do itself.

Both examples now pin to a commit SHA with the `# 1.1.0` comment Dependabot reads,
and a new test extends the SHA-pin rule from *what this repository runs* to *what
it tells other people to run* — the docs had drifted for a release with nothing
checking. The test fails on the old README, which is the only evidence that it
checks anything.


**`trazum optimize --reorder` moves the stable instructions in front of the
placeholder.** Since 0.2.0 the `cache-prefix-reorder` advisory has pointed at the
largest saving Trazum knows about and no command could take it. Prompt caching is
a byte-for-byte prefix match, so everything after the first `{{placeholder}}` is
re-read at full price on every call. Measured on a 1,178-token support prompt: 14
tokens cacheable as written, 1,174 after rearranging the same content — the
difference between a $0 caching saving and a $184 one at 50,000 calls a month on
Opus.

**Opt-in, and deliberately not part of `aggressive`.** Every other transformation
deletes text whose absence is local. This one moves text, and order carries
meaning: "Summarise the text above" is correct where it sits and nonsense in front
of the text it points at. `aggressive` promises "read the diff"; this asks whether
the order mattered, which is a different question.

What it refuses, which is most of the module:

- A block containing a backward reference (`above`, `the following`, `anterior`, …)
  stays put — **and so does everything after it**, because moving a later block
  past a pinned one changes their order relative to each other. The phrase list is
  generous in both locales on purpose: a false positive costs a saving that was
  available, a false negative silently changes what the prompt asks for.
- Only whole blank-line-separated blocks move, so a sentence is never severed from
  the paragraph that qualifies it and the placeholder's own line travels with it.
- Nothing moves without a placeholder, or below the model's cacheable minimum.

A refusal returns the prompt **byte-identical** and names the phrase responsible:
"no saving here" and "there was a saving and it was not safe to take" are
different answers, and only the second one is actionable. `--diff` compares
against what you wrote rather than against the rearrangement, so the move is not
hidden behind the deletions; `--json` carries the whole decision under `reorder`,
refusals included. `check` rejects the flag — it is a gate, and a gate does not
rewrite. `reorderForCache` is exported from `@trazum/core` for callers who want
the decision without the CLI.

### Fixed

Two defects in the rejoined seams, both found by writing the fixtures that had
been missing rather than by a report:

- A placeholder on the **first line** left the rearranged prompt opening with a
  blank line. With no head for the moved blocks to sit after, the usual leading
  gap put whitespace at byte zero — which changes the cache prefix for nothing.
- A **CRLF** prompt came back with mixed line endings, because the seams were
  rejoined with bare newlines regardless of what the author used. In a
  byte-for-byte prefix match a changed byte is a changed price, and in a
  repository it is a diff on every line nobody asked for. The prompt's own line
  ending is now preserved, as is whatever it ended with — collapsing runs of blank
  lines remains the whitespace rule's job, not this one's.

- **Two quadratic patterns** in the new module, found by pointing the existing
  ReDoS suite at it rather than by reading it. `split(/(?<=\n)(?=\s*\n)/)`
  re-consumed a run of blank lines at every position inside it — 13.9s on 120 KB
  of newlines — and `/\s*$/` on a prompt holding a long whitespace run that does
  *not* end in one took **31 seconds at 200 KB**, inside the 400 KB the HTTP API
  accepts. Both are now a linear scan and a `trimEnd`.

  The suite drives `optimize`, which never reaches `reorderForCache`, so nothing
  covered it: a fixture list only asks the questions it encodes. `reorderForCache`
  now has ten fixtures of its own, each sized so the old pattern is well past the
  budget rather than near it.

The cacheable-minimum bar is on the **resulting prefix**, not on the amount moved
— `minPrefixTokens`, not `minTokens`. Those are different questions, and asking
the second one refused a real saving: a prompt whose 1,265-token head already
cached gained nothing from 359 stranded tokens, because 359 is below Opus's
512-token minimum. It reported "nothing could safely move", which is not what
happened.

The declined list in the report is capped at three lines and now says how many it
did not print. A report that shows three of nine reads as "three".

`--reorder` and `--markdown-out` were both **accepted and undocumented** — absent
from `--help` in either locale. The parity test named four *required* flags and
passed the whole time; it now derives the list from what the binary actually
accepts, by reading the allow-list the CLI prints when it rejects an unknown flag.
`--markdown-out` had been undocumented since 0.11.0.


**A post-1.0 roadmap.** `Next` was empty after 1.0.0 — honest, since every planned
item had shipped, but the file's stated purpose is that "the ordering is a
commitment", and it was committing to nothing.

Four entries, and two of them exist because writing the roadmap turned up things
worth saying out loud:

- **1.2.0 — Releasing without remembering.** A tag-triggered workflow, using npm
  trusted publishing rather than a stored `NPM_TOKEN`: a long-lived publish token
  would be the highest-value credential this project holds, sitting in secrets
  permanently for something used a few times a year. It must refuse to publish a
  version that does not match the tag.
- **1.3.0 — The error band, measured.** `±15%` is printed on every report and
  asserted nowhere. `estimateTokens` is tested for zero-on-empty, monotonic growth
  and not-`NaN`; nothing checks its accuracy, and every dollar figure descends from
  it. It is also one number for all text, which the CJK case suggests is not true.
- **1.4.0 — Prompts where they actually live.** Trazum reads `.txt`/`.md`/
  `.prompt`/`.tmpl`, so prompts embedded in TypeScript or Python require
  refactoring an application before Trazum can be adopted at all.
- **1.5.0 — The front door catches up.** The web app optimises and nothing else,
  five releases behind the CLI. Last on purpose: it changes how the product looks
  rather than whether its numbers are right.

Release automation was written as 1.1.0 and is now 1.2.0, because writing the entry
established that it **cannot ship**: publishing needs the `@trazum` scope to exist
on npm, which is the maintainer's to create. Holding the queue behind a
prerequisite outside the repository would have been worse than reordering it, and
`ROADMAP.md` says so in the file rather than only here — the ordering is a
commitment, so a change to it owes a reason.

The `Tokenizer per model family` entry under `Under consideration` now says it is
pending the error-band measurement rather than reading as a pure dependency-cost
decision. Measuring the band is what settles whether a real tokenizer is needed.

Also fixes a doubled `---` left in `ROADMAP.md` by the 1.0.0 edit.

## 1.0.0

**The public API is frozen.** A breaking change waits for 2.0. This is the last
release in which anything can change shape without a major.

[VERSIONING.md](VERSIONING.md) now states what that covers and, as importantly,
what it does not — and it states the **deprecation procedure** rather than leaving
it to be decided case by case:

- `@deprecated` in the JSDoc, naming the replacement. That is the strike-through
  in an editor, which is the only warning most people will ever see.
- A **Deprecated** section in that release's changelog, with the migration written
  out — the actual before-and-after, not "use the new thing".
- Continues working for **at least two minors and six months**, whichever is
  longer. Deprecating and removing in consecutive releases is a breaking change
  wearing a notice.
- Removed only in a major, whose changelog repeats the migration.

A deprecated export **never starts warning at runtime**. A library that prints to
somebody else's stderr because *we* changed our mind is a library people vendor to
make quiet.

Newly named as covered, because they were being depended on either way: the
`--json` shape and units, the CLI's **exit codes**, `@trazum/core/node` as a real
entry point, and the `trazum.config.json` and pricing-overlay schemas. Newly named
as *not* covered: the prose and layout of the human reports — parse `--json`, not
the table.

### Publishable

Both packages would previously have shipped something wrong. Now asserted by
tests in `publish.test.js`, because a published package is the one artefact this
repository cannot take back:

- **A `LICENSE` file**, not just a `"license"` field. The field is metadata; the
  tarball has to carry the terms or nobody who installs it has been given them.
- **A README.** The npm page *is* the README, and both were empty.
- **`engines`.** Without it npm installs silently on a Node too old to run the
  code, and the failure surfaces as a syntax error in somebody else's build.
- **`prepublishOnly`**, which builds and tests. `files: ["dist"]` means the
  tarball is whatever happens to be on disk, so publishing without building would
  have shipped the previous version's code under the new version's number —
  completely silently, and the worst possible outcome.
- **`src`.** Every emitted source map references `../src/*.ts` and carries no
  inlined content, so shipping the maps without the sources gave a debugger a file
  it could not load. That is worse than no map, which would simply step through
  the compiled output. It also means you can read exactly what runs on your
  prompts, which for a zero-dependency library is rather the point.

Publishing itself stays manual. It is the one action here that cannot be undone
after 72 hours.

### A rule can be contributed without reading the engine

New [docs/authoring-rules.md](docs/authoring-rules.md): the four-line rule
contract, what the masking pass already guarantees (a rule cannot break code,
URLs or placeholders because those characters are not in the string it receives),
why **`safe` is a promise** rather than a default, and the three tests a rule
needs — the third being the false-positive case nearly everyone skips.

It also documents the ReDoS fixture **shape** that finds real bugs. Repeated
tokens do not: both bugs found in this repository needed a prefix plus a long
non-terminating run, and the fixtures that missed them were all repeated words.

`CONTRIBUTING.md`'s security-invariant list said "four things" and had drifted to
eight. Corrected, with the import-graph invariant and the two Actions ones added.

### Pricing came off the release cycle

Prices change on someone else's schedule, and until now correcting one meant
upgrading the library — which is backwards: a stale price is a wrong number in a
budget decision.

A **pricing overlay** is a JSON file layered over the bundled catalogue:

```json
{ "lastReviewed": "2027-01-15",
  "models": { "claude-opus-5": { "inputPerMTok": 6 } } }
```

Point at it with `pricing` in `trazum.config.json` or `--pricing <file>`. The
bundled catalogue stays the default, so Trazum is still correct out of the box
and needs no setup.

- **A separate `@trazum/pricing` package would not have solved this.** You would
  still need to install something to get current numbers. A JSON file in your own
  repository actually decouples it, and keeps both properties that matter: the
  core still makes no network call, and it still has no dependencies.
- **The catalogue is a value, not module state.** `applyPricingOverlay` returns a
  *new* catalogue; nothing mutates. A caller who overlays prices does not change
  what any other caller sees, which is what stops one consumer's local prices
  leaking into another's report — and what makes it testable at all.
- **Every report says when overlaid prices were used, and for which models.**
  Without that, a figure from the bundled catalogue and a figure from somebody's
  JSON file look identical. `OptimizationResult` gains `pricingSource`.
- `lastReviewed` is **required** in an overlay, and becomes the catalogue's date.
  An overlay of unknown age is worse than the bundled catalogue, whose age is
  printed on every report; and claiming the bundled date over corrected prices
  would be a lie about provenance.
- Overriding a known model needs only the fields that changed. **Introducing a
  model needs all of them**, because a half-defined model would price at nothing
  and report a saving that does not exist. `"promo": null` withdraws a promotion
  that ended early.
- `withExactTokenCounts` **throws** if a result was priced against an overlay and
  the same catalogue is not passed back. Silently reverting to bundled prices
  would make the token counts and the money come from different sources, with
  nothing in the report to show why.
- `cheapestOfTierIn` ranks a tier on the **effective** price, so a model inside a
  promotional window is compared at what it actually costs today.
- Validation is as strict as the config parser's, same reasoning: a typo'd
  `inputPerMtok` would silently price against the bundled number, and a budget
  decision made on a price nobody applied is the whole failure being prevented.
- `usage.model` validation **moved** from `parseConfig` to `loadConfig`. An
  overlay can introduce a model, and the path to the overlay is a key of the very
  document being parsed — so the parser cannot know the catalogue yet. The check
  is still loud, just raised where "unknown model" can be answered truthfully.
- Tests grow from 390 to 406, including a new `publish.test.js` suite.

**Every third-party GitHub Action is now pinned to a commit SHA.** `SECURITY.md`
listed this as a known limit; it no longer is. A tag can be moved and a branch
moves by design, so `@v3` means "whatever that publisher pushes there next", with
the caller's token and secrets in scope.

- The sharpest case was `actions/dependency-review-action@v5`, whose majors are
  published as **branches** rather than tags — a reference that is *designed* to
  move. (Worth recording: I first read the tag list and concluded `@v5` did not
  resolve at all. It does — `refs/heads/v5` — and the branch is the point.)
- Pinning only freezes a version if nothing bumps it. `.github/dependabot.yml`
  already has a `github-actions` entry, and the trailing `# vN` comment is what
  it matches on.
- Two new invariants: every `uses:` outside this repository must be a 40-character
  commit SHA, and every pin must carry a version comment. A pin with no comment
  is a line nobody can review and nothing will ever update.

## 0.11.0

**Breaking, for the GitHub Action only:** `file` and `max-tokens` are no longer
required inputs. `file` still works and is now a deprecated alias for `target`;
rename it when convenient, and the Action warns when it sees the old name.
Nothing in the library or CLI changed shape. Migration: `file:` → `target:`.

The reports now land where the review happens. `trazum check` and `trazum diff`
grow a `--markdown-out <file>`, and the Action writes that file to
`$GITHUB_STEP_SUMMARY` and — optionally — posts it as a pull request comment
that **replaces its own previous one** rather than adding another.

**Three bugs 0.10.0 introduced in the Action, all the same shape.** Config
support shipped in the CLI while `action.yml` kept passing `--level safe` and
`--locale en` unconditionally. The CLI layers flags over config over defaults,
so an always-present flag meant a project's own `level` and `locale` were never
read; `max-tokens: required: true` meant config budgets were unreachable; and
`file: required: true` meant neither directory mode nor `diff` was exposed at
all. Every optional flag is now added only when it was actually given. **A
default that silently overrides a project's own setting is worse than no
default.**

- **`--markdown-out`** on `check` and `diff`. Written before anything sets an
  exit code, so a report exists precisely when it is needed. A failure to write
  is reported and swallowed: a full disk must not turn a passing check into a
  failing build.
- **The step summary is not behind an input.** It needs no token, no permission
  and no pull request, and has no failure mode worth a switch.
- **The reporting steps carry `if: always()`.** A composite action skips the rest
  of its steps once one fails, so without it the summary would appear only on
  runs nobody needs a report for. The budget verdict is re-raised in a final
  step, and a *missing* outcome counts as failure — a check that never reached
  its own last line is not a green build.
- **`comment: true`** posts the report, found by an invisible marker in the body
  rather than by author. `gh pr comment --edit-last` matches by author, so any
  other step in the job commenting as `github-actions[bot]` would have had its
  comment overwritten. `comment-key` separates two runs that report on different
  things in the same pull request.
- **A green report is collapsed inside `<details>`; a failing one is not.** A
  green table that stays green on every push is the thing a maintainer learns to
  skip — and once they skip it, they skip the red one too.
- **Commenting can never fail the build.** No pull request, a read-only token on
  a fork, comments disabled, an unreachable API: each records a notice and
  carries on, because the report already reached the step summary. A tool that
  turns "could not comment" into a red build gets deleted from the pipeline
  rather than configured. A 401/403 says so in one line and says explicitly *not*
  to reach for `pull_request_target`, which runs a writable token against code
  the contributor controls.
- The poster lives in `action/post-comment.mjs`, outside the workspaces and in
  plain ESM with no dependencies. It needed no security invariant relaxed —
  editing one for convenience is not a reason.
- **Table cells are `<code>` with HTML entities, not backtick spans.** The
  obvious version — wrap in backticks, escape `|` as `\|`, widen the fence past
  the longest backtick run — did not handle a backslash, which CodeQL caught:
  given `a\|b.txt` it emitted `` `a\\|b.txt` ``, and whether that survives
  depends on whether the row splitter reads `\\|` as an escaped pipe or as an
  escaped backslash followed by a live one. It happens to work in cmark-gfm.
  An escaper whose correctness rests on that is not an escaper. With entities
  there is **no `|` in the output at all**, so no scanner can split the row;
  backticks inside `<code>` are literal, so the fence arithmetic disappears; and
  a backslash needs no treatment. Three hazard classes collapse into one rule.
  Paths come from a repository, and on a pull request from whoever opened it.
- The check verdict counts **only what was measured**. "All 3 prompts are within
  budget" over a set where one had no budget claims something nobody
  established.
- New security invariants: every `${{ }}` in `action.yml` must be a *bare* env
  assignment or a condition; the reporting steps must carry `if: always()`; the
  comment step must be unable to fail the job; and a missing outcome must default
  to failure. The old "every input reaches the CLI" assertion was a usefulness
  check dressed as a security one, and it broke the moment an input legitimately
  gated a step instead of being forwarded — replaced by the positional rule,
  which is what actually matters.
- Tests grow from 303 to 359, including a new `action/test` suite wired into
  `npm test`.

**A security guardrail was ineffective, and is now enforced with positive
controls.** Carried over from the previous unreleased entry.

The test asserting *"inputs reach the Action's shell through the environment,
never interpolated into `run:`"* did not do that. Two independent causes: its
`run:` body pattern required a newline after the optional block indicator, so a
single-line `run:` was never recognised as a run block at all; and it searched
that body only for `${{ inputs.* }}`, which is the *safest* value in the set
because it is workflow-authored. The dangerous ones were outside what it looked
at entirely — `github.event.pull_request.title`, `...body` and
`github.head_ref` are written by whoever opened the pull request.

- `action.yml` itself was never vulnerable, and still is not: every input goes
  through `env:`, no `run:` body interpolates anything. What was broken was the
  guardrail meant to keep it that way, and `SECURITY.md` claimed more than the
  test asserted. Both are corrected.
- The rule is now **positional and source-blind**: nothing may be interpolated
  into a `run:` body, ever. Provenance is not something a regex can judge, and a
  step that derives an input from a PR title turns a "safe" source unsafe
  without touching the file the test inspects.
- The harm never depended on the token being writable. Substitution happens
  before bash parses, so the payload runs on the caller's runner with whatever
  secrets that job has in scope.
- **Five positive controls** the scanner must flag, plus a negative control:
  `action.yml` quotes an expression inside a prose comment explaining the rule,
  and a test that fails when you document the reasoning teaches people to stop
  documenting it. The version this replaced had no positive control, which is
  exactly why it passed for every shape it could not see.
- Also asserts that no workflow and not `action.yml` uses
  `pull_request_target` — the event a reviewer reaches for the moment they find
  a fork PR cannot post a comment, and the one that runs a writable token
  against contributor-controlled code. 0.11.0's natural wrong turn now needs
  arguing in a pull request rather than arriving quietly.
- Found while designing 0.11.0, which would have been written in exactly the two
  shapes the test could not see.
- Tests grow from 301 to 303.

## 0.10.0

`trazum.config.json` and directory mode. Two of the three items left over from
0.9.0; PR comment mode for the Action is still open.

**`trazum check prompts/`** checks every prompt under a directory against
per-pattern budgets from the config file — one CI step for a repository of
prompts rather than one step per file.

**The config parser refuses anything it cannot validate, including an unknown
key.** That is the design, not strictness for its own sake: a lenient parser
restores defaults silently, and for a budget the default is *no budget* — a
green build for a prompt nobody measured. Same reasoning as `--max-growh` being
rejected rather than ignored in 0.9.0.

- `trazum.config.json`: `level`, `locale`, `disable`, `usage`, `budgets`,
  `maxGrowth`, `extensions`. Found by walking up from the working directory and
  stopping at the repository root, so a subdirectory inherits the project's
  settings and nothing above the checkout is ever read. `--config <file>` skips
  the search.
- **Flags beat the config; the config beats the defaults.** A config able to
  override an explicit flag would make every flag a suggestion.
- New `--no-<flag>` for booleans, so a setting the config switched on is not one
  you have to edit the repository to escape. `--no-max-tokens` is refused rather
  than silently accepted, and an unknown `--no-x` is quoted the way it was typed
  instead of as `--x`.
- Budgets resolve to the most specific matching pattern, with "specific" given a
  stated definition — most literal characters wins, longest pattern breaks a
  tie. Pattern order in the file never matters. The JSON report names the
  pattern each budget came from.
- A file no pattern covers is listed as `(no budget)`, not skipped; and a run
  where nothing at all was budgeted is an error. "Checked 40 files, 0 failures"
  from a run that measured nothing is the most misleading output this tool could
  produce.
- `maxGrowth` in the config arms the `diff` gate exactly as the flag does.
  Absent both, growth alone still exits 0.
- `locale` in the config is outranked by the environment — the only setting
  where that is true. A repository choosing the language of its CI logs should
  not choose the language of a contributor's terminal.
- New glob matcher, written as a segment-wise dynamic program rather than a
  regex translation. `**` compiled to `(?:[^/]*\/)*` is the nested-quantifier
  shape that backtracks exponentially, and these patterns come from a file in
  the repository — on a pull request, from whoever opened it. Bounded in pattern
  and path length, with a time-budget test over the shapes that break the regex
  version.
- The directory walk **does not follow symlinks**, caps depth and file count,
  and reports when a cap stopped it early. A link to `/etc` would turn "check
  the prompts folder" into printing token counts for files outside the project;
  a link loop would turn it into a hang.
- **New entry point, `@trazum/core/node`**, holding everything that reads the
  filesystem: `loadConfig` and `walkPrompts`. The main entry point stays free of
  Node builtins, which it has to be — `apps/web` bundles it for the browser, and
  a single `node:fs` import anywhere in that graph fails the build outright. The
  pure halves (`parseConfig`, `budgetFor`, the types and key lists) are on both.
- Two new security invariants. The first names which modules may read the disk;
  the second **walks the import graph from the main entry point** and fails if
  any Node builtin is reachable from it. The first version of this change shipped
  with only the module allow-list, which passed while `config.ts` was also
  re-exported from `index.ts` — a file allow-list is not a boundary, the import
  graph is. That matters beyond the build: the web app hands `optimize()` a
  prompt straight from a request body, so a file read reachable from that entry
  point would be path traversal available to anyone who can reach the API.
- The config file is measured and read through **one file handle**. Calling
  `stat(path)` and then `readFile(path)` resolves the name twice, so what gets
  read is not necessarily what got measured, and a symlink swapped in between
  defeats the size limit. Found by CodeQL.
- Budget patterns are checked for absoluteness with an explicit pattern rather
  than `path.isAbsolute`, which is platform-dependent: on Linux it reads
  `C:\prompts` as relative, so a Windows-shaped pattern would pass validation on
  a Linux CI runner and then match nothing.
- `editDistance` moves into core as `nearestName` and is now shared between the
  unknown-flag and unknown-key suggestions rather than duplicated.
- Tests grow from 228 to 301.

## 0.9.0

New `trazum diff` command and `comparePrompts()` API: compare two versions of a
prompt and report what the edit cost. `optimize()` answers "how much fat is in
this prompt"; this answers the question a pull request actually raises —
somebody edited this, did it get worse?

**The design decision that keeps it honest.** Every other figure Trazum prints
is a *saving*: before minus after, positive is good. Every figure here is a
*delta*: after minus before, positive is **bad**. Mixing those two conventions
in one report is the easiest way to make a cost tool lie, so the comparison
lives in its own module, nothing in it is named a saving, and the negation
happens exactly once, at the boundary.

- Reports what the edit broke, not only what it cost: advisories that appeared
  and rules that started firing, plus the same in reverse when the edit
  improved things.
- Measures the text **as written** by default, not what the rules would leave.
  A pull request changed the file on disk, so the file on disk is what the
  reviewer is being asked about — otherwise a prompt that doubled in length but
  happened to double in courtesy would report no change. `--optimized` switches
  the figures to the post-rules text.
- **The gate is opt-in.** Growth alone exits 0; `--max-growth 10` is what makes
  it exit 1. A tool that fails a build nobody armed gets removed from the
  pipeline rather than fixed.
- `--max-growh` is rejected with "Did you mean --max-growth?" rather than
  ignored — a silently-swallowed gate flag means CI green while the author
  believes a limit is set.
- New `formatSignedUsd()`: `+$9.25` and `-$9.25`, because `formatUsd` renders a
  negative as `$-9.25`, which reads as a typo. Negative zero is collapsed, so a
  change that did not happen is never shown with a direction.
- `deltaPct` is 0 rather than `Infinity` when the original was empty.
- Tests grow from 196 to 228.

## 0.8.0

New `trazum eval` command and `evaluate()` API: run both prompt versions over a
set of inputs and report whether the optimisation changed the answers. Every
other number Trazum reports is arithmetic; this is the one question arithmetic
cannot answer.

**The design decision that makes it worth anything.** A model asked the same
question twice does not answer identically, so "the optimised prompt diverged
on 3 of 10 cases" means nothing on its own — it might be better than the
original manages against itself. The original therefore runs **twice** per case
first, and that self-agreement is the yardstick the rewrite is judged against.
It costs a third call per case and it is the only reason the verdict means
anything.

- Four verdicts: `indistinguishable`, `within-noise`, `diverges`, and
  `inconclusive` — the last for when the original cannot agree with itself
  often enough to judge anything against. A confident verdict off an
  inconsistent baseline would be worse than admitting the test does not work.
- Exits 1 on `diverges`, so it can gate a pull request the same way
  `trazum check` gates a token budget.
- Prints the call count before spending anything.
- A template gets its first placeholder filled rather than the input appended:
  appending would test a prompt nobody runs.
- Cases come from a file, one per line (`#` comments and blanks ignored) or a
  JSON array. A file that merely starts with `[` falls back to line mode rather
  than erroring.
- Bounded concurrency, default 3. The baseline pair stays sequential within a
  case: issuing both at once invites a provider to serve one from cache and
  report a variance of zero.
- Tests grow from 179 to 196.

## 0.7.0

- New `reviewExamples`: the paraphrase case the deterministic detector refuses
  to guess at. Two examples teaching the same lesson in different words score
  around 0.54 on word overlap — close enough to two genuinely distinct examples
  (~0.20) that catching them by similarity would mean flagging examples that
  teach different things. Deciding that "arrived quickly" and "arrived fast"
  demonstrate the same pattern needs a model, so this sits behind the optional
  LLM layer, costs a call, and never runs during an ordinary `optimize()`.
- Returns `null` below two examples, so the caller does not pay for a foregone
  answer.
- **The response is treated as untrusted input, because it is.** Indices are
  range-checked against the examples that exist, self-references dropped,
  overlapping groups collapsed so the same tokens are never counted twice, and
  the model's stated reason truncated. A model answering with prose produces an
  empty review — not a crash, and not a saving the prompt could not deliver.
- A provider **error** still throws. A bad answer is the model's problem and
  gets absorbed; a broken endpoint is the caller's configuration and hiding it
  would waste their afternoon.
- The CLI runs it under `--llm`, reports it as a suggestion to read rather than
  a change made, and includes it in `--json`.
- Shortens the GitHub Action's description to 113 characters: the Marketplace
  rejects anything over 125, which blocked publishing.
- Tests grow from 164 to 179.

## 0.6.0

**Fixes a rule that left a broken sentence behind.** `self-check` matched
"double-check your answer before responding" but not the subject and modal in
front of it, so `"You MUST double-check your answer before responding."` became
`"You must."` — a sentence that says nothing, in place of one that said
something. Whatever can open one of these instructions is now listed ahead of
the bare form, in both languages.

That bug had been there since the rule shipped. It surfaced within a minute of
the feature below existing, which is the argument for the feature.

- `RuleResult.changes`: each rule now reports a short list of what it actually
  changed, as before/after pairs. `hits` still carries the true total.
  `aggressive` has always come with the advice "read the diff", and the diff
  was one undifferentiated block for every rule at once — not review, a wall of
  text with a warning attached. Now an aggressive run is judged rule by rule,
  and a single rule you disagree with is disabled with `--disable` instead of
  abandoning the level that saves the most.
- Empty rather than truncated when a change is too large to summarise. An empty
  list reads as "nothing to show here"; a truncated one would read as "this is
  all that happened", which would be a lie.
- Bounded by construction, like everything else that touches untrusted text:
  the common prefix and suffix are trimmed in linear time, and anything still
  too large is skipped rather than diffed. Covered by the same adversarial
  fixtures as the ReDoS suite.
- Shown in the CLI and the web app for aggressive rules, and for every rule
  under `--diff`.
- New public API: `extractChanges`, `DEFAULT_CHANGE_LIMIT`, and the
  `RuleChange` type.
- Tests grow from 145 to 164.

## 0.5.0

A third structural finding, same posture as the first two: it reports, it does
not cut.

- New `restated-output-format` advisory. A prompt that shows its schema in a
  code block and then walks the same fields in prose is paying for the schema
  twice; the block is the version worth keeping, since it is unambiguous and
  the protection pass guarantees Trazum never edits it. Priced per month.
- Reads *illustrative* schemas, not only valid JSON. Prompts routinely contain
  trailing commas, `...` and `<placeholders>`, and refusing to parse those
  would skip exactly the prompts worth checking — so key extraction is a
  depth-aware scan rather than `JSON.parse`.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification ("set `escalate` to true when the customer asks for a human")
  and flagging it would turn the advisory into noise.
- New public API: `findRestatedFormat`, and the `RestatedFormat` type.
- Tests grow from 138 to 145.

### Dependencies

- `next` 15 → 16, which is what finally cleared the three high-severity
  `postcss` and `sharp` advisories. Bumping the direct dependency was not
  enough on its own: the lockfile kept the vulnerable transitives, and the
  blocking audit is scoped to the published packages so it never saw them.
  `npm audit` over the whole tree now reports 0 vulnerabilities. The lesson is
  recorded in `SECURITY.md`.
- `actions/checkout` and `actions/setup-node` 4 → 7, clearing the Node 20
  deprecation warning every run was printing.
- `actions/dependency-review-action` 4 → 5.

## 0.4.0

Structural analysis: findings that live in the *relationship* between two
places in a prompt, which no phrase dictionary can see because neither place is
wrong on its own. Both are advisory — Trazum points, it does not cut.

- **Fixes a corruption bug in `duplicate-lines`.** The rule was deleting the
  shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often exactly why both are there. Labelled example fields (`Input:`,
  `Output:`, `Q:`, `A:`, and Spanish equivalents) are now exempt from
  line deduplication. This affected the `safe` level, so it could silently
  damage a prompt anyone ran through Trazum.
- New `contradictory-instructions` advisory across four axes: response
  language, output format, response length, and whether to show the reasoning.
  Reported as a **warning** with both conflicting sentences quoted. It carries
  no dollar figure — being wrong has no price tag.
- New `redundant-examples` advisory: few-shot examples that are near-copies of
  an earlier one, with the tokens they cost per month. It detects copy-paste
  accumulation (~0.89 similarity for a copied example with one field changed),
  and deliberately **not** paraphrases (~0.54), which sit too close to
  genuinely distinct examples (~0.20) to separate without a model.
- **Advisories now sort by severity before money.** Sorting purely on the
  dollar figure buried an overflowing context window — and now a contradiction
  — underneath a saving of a few dollars.
- New public API: `findContradictions`, `analyzeExamples`, `findExamples`, and
  the `jaccard` / `normalizeForCompare` similarity helpers, which moved to a
  shared module so the duplicate rules and the structural analysis cannot
  disagree about what "near-duplicate" means.
- Adding a contradiction axis now fails to compile until every catalogue names
  it, the same guarantee `RuleId` gives rules.
- Tests grow from 75 to 94.

### Security

Hardening for an open repository taking outside contributions. Full reasoning
in [SECURITY.md](SECURITY.md).

- **Fixes four SSRF filter bypasses.** The web app's private-host blocklist
  allowed `https://[::ffff:169.254.169.254]` — the IPv4-mapped IPv6 form of the
  cloud metadata address, which Node normalises to `[::ffff:a9fe:a9fe]` and the
  old patterns did not match. Also allowed: a trailing-dot hostname
  (`localhost.`), the carrier-grade NAT range (`100.64.0.0/10`), and
  credentials embedded in the URL, which would have been forwarded to whatever
  the host resolved to and written into any log recording the endpoint.
- The filter moved from the Next.js route into `@trazum/core` as
  `validateLlmEndpoint` / `isPrivateHost`, so the most security-sensitive code
  in the project is unit-tested instead of living untested in an API handler.
  It returns a reason code rather than a message, so callers localise it and
  tests assert on the decision.
- **Fixes two ReDoS denial-of-service bugs**, both reachable from the public
  HTTP endpoint, both found by CodeQL after the first round of ReDoS tests had
  passed:
  - `whitespace` — a **`safe`-level rule present since 0.1.0**. Its
    trailing-whitespace pattern restarted at every position inside a whitespace
    run and failed from each one when the run did not end the line: 17 seconds
    on a 100 KB line of spaces, well inside the 400 KB the API accepts.
    Anchored to the start of a run, it is now 3 ms at 400 KB.
  - The few-shot label patterns added in this release ended in three adjacent
    unbounded quantifiers, measured at O(n²) — 651 ms at 40 000 spaces, about a
    minute at the size cap. Their quantifiers are now bounded.
  - The ReDoS suite gained the fixture shape it was missing. The original
    fixtures were all *repeated tokens*, which exercise the happy path over and
    over; neither bug needed that, they needed a plausible prefix followed by a
    long run that never completes the match.
- New `security.test.js` enforcing four invariants on every pull request: the
  SSRF filter fails closed, the core and CLI carry zero runtime dependencies,
  `fetch` appears only in the two modules that exist to make calls, and no
  regex exhibits catastrophic backtracking under pathological input.
- Workflows run with `permissions: contents: read` by default,
  `npm ci --ignore-scripts`, and `persist-credentials: false`.
- Added CodeQL (`security-extended`), dependency review, a weekly `npm audit`,
  Dependabot, `CODEOWNERS`, and an importable branch ruleset at
  `.github/rulesets/main-branch.json`.
- `SECURITY.md` documents the threat model, private reporting, the settings an
  admin still has to switch on, and the limits that are not covered — DNS
  rebinding, per-instance rate limiting, and actions pinned to tags.

## 0.3.0

**Breaking.** `buildAdvisories()` takes an options object instead of trailing
positional arguments: `buildAdvisories(prompt, tokens, usage, { on, count, locale })`
replaces `buildAdvisories(prompt, tokens, usage, on, count)`. The `Rule`
interface no longer carries `title` or `rationale` — rules carry an `id`, and
copy is resolved from the message catalogue with `getMessages(locale).rules[id]`.
`OptimizationResult.rules` is unchanged, so consumers of the report need no
migration.

The repository is now English end to end — source, comments, tests,
documentation, CLI, web and CI. Spanish was not removed; it was moved out of
hardcoded prose into a locale, which is the only version of "add a language"
that survives a second one.

- Per-locale message catalogues in `@trazum/core`, `@trazum/cli` and
  `@trazum/web`, with English as the declared source of truth.
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` accept a `locale`, and the result carries
  the locale it was produced in.
- New `matchLocale()`, which returns `null` when its input names no locale we
  ship — that is what lets a caller fall through to the next configuration
  source instead of mistaking a fallback for a choice. `resolveLocale()` now
  walks a whole `Accept-Language` list, so `fr-FR,es;q=0.9` resolves to Spanish
  rather than defaulting to English.
- CLI: `--locale`, then `TRAZUM_LOCALE`, then the POSIX locale variables. The
  flag is read straight from argv, so even a bad-argument error is reported in
  the requested language. `trazum rules` now reads its copy from the core
  catalogue, so it can no longer drift from the report.
- Web: `Accept-Language` is negotiated on the server, so first paint already
  matches the reader; a switcher in the masthead overrides it and the choice is
  remembered. `generateMetadata` negotiates too, so link previews follow.
  The API route localises its own errors as well as the report.
- The web starter prompt now exists per language, since the phrase
  dictionaries are per-language and the example exists to show rules firing.
  Switching language never overwrites a prompt you wrote.
- `GET /api/optimize` no longer returns rule copy: it was locale-blind, and the
  report carries its own.
- Sample prompts are `examples/sample-prompt.en.txt` and
  `examples/sample-prompt.es.txt`; the action self-test runs against both.
- The GitHub Action takes a `locale` input.
- Tests grow from 47 to 75, adding catalogue-parity coverage so a locale cannot
  silently go stale, plus a CLI suite covering locale resolution. `npm test` now
  runs both packages.
- New `ROADMAP.md`, `VERSIONING.md` and `CONTRIBUTING.md`.

## 0.2.0

- Cacheable-prefix analysis (`analyzeCachePrefix`): the prompt-caching advisory
  computes its saving over the real stable prefix — everything before the first
  template placeholder — instead of over the whole prompt, which in a template
  never caches in full.
- New `cache-prefix-reorder` advisory: detects stable instructions sitting
  after the first placeholder, which today never cache, and prices moving them
  in front.
- Packaged GitHub Action (`Davmunrey/Trazum@main`) for `trazum check`: token
  budgets in CI with nothing to install, with a self-test in the repository's
  own CI.

## 0.1.0

First release.

- Deterministic core (`@trazum/core`): 12 rules across two levels, isolation of
  code/URLs/templates/XML, dependency-free token estimator, pricing catalogue
  with promotions, and savings advisories (caching, Batch API, model tier,
  context window).
- Optional, pluggable LLM layer (OpenAI-compatible endpoints, the Claude API,
  or a custom provider) with safety checks: a candidate is only accepted when
  it is shorter and preserves the protected content.
- CLI (`@trazum/cli`): `optimize`, `check` (token budgets for CI), `models` and
  `rules`; clean output when redirected, plus `--json`, `--diff` and
  `--exact-tokens`.
- Web (`@trazum/web`): Next.js interface with a word-by-word diff, local
  history, an editable cost scenario and a configurable LLM pass.
