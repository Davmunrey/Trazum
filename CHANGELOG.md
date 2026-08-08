# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

`Unreleased` holds what is merged into `main` but not yet tagged. A change that
alters nothing installable — a test, a document — still lands there rather than
nowhere: the changelog is the record of what happened to this repository, and a
merged commit with no entry is a change only `git log` remembers.

## Unreleased

### Added

**A pre-commit hook, at `scripts/pre-commit`.** `ln -s ../../scripts/pre-commit
.git/hooks/pre-commit` and a commit whose own prompts are over budget is refused
before it reaches CI.

**It asks `trazum doctor --json` rather than running `trazum check prompts/`,** and
that is the design rather than an implementation detail. `check` exits 1 when
anything under a directory is over budget — right for CI, wrong for a hook, because
it would refuse a commit that touches one file over a different prompt somebody else
committed last month. A hook that fails for reasons outside the commit is a hook
people learn to pass `--no-verify` to, and then it is worse than no hook, because it
taught them the habit too. So the hook intersects `doctor`'s over-budget list with
the files actually staged.

It gets out of the way rather than guessing: nothing staged, no Trazum installed, no
prompts found, an unreadable config — none of those are a budget failure, so none of
them block a commit. Each says so once and exits 0.

Two defects found by running it, both of the same kind — a message that promises
something it does not deliver:

- **It announced a list of over-budget prompts and printed nothing under it.** The
  detail line matched path, tokens and budget on one line, and `doctor --json`
  pretty-prints. It blocked the right commit and said nothing useful about why. It
  names the paths now and points at the command for the figures, rather than parsing
  multi-line JSON in `sh`.
- **The scope guard latched open on an empty array.** `"overBudget": []` closes on
  the line that opens it, so `inside = 1` stayed set for the rest of the document and
  a `path` key in any later section blocked the commit — the exact bug the scoping was
  added to prevent. Ten tests, four mutants, including one that puts each defect back.

Stated in the README because it is real: Trazum reads the working tree, not the staged
blobs, so a prompt staged and then edited further is judged on the newer text.

### Added

**`trazum doctor [dir]` — the survey before the gate.** Which prompts nothing is
watching, which are already over budget, and what every advisory adds up to across
the whole workspace.

**There is no score, and that is the design.** A health check invites one, and a
number assembled from weights nobody can reproduce gets quietly tuned until the
output looks right — `rank` refused it for the same reason. So `doctor` invents no
judgement at all: every finding is an advisory `optimize` raises on that prompt on
its own, summed, so any figure can be checked against a single file. A test adds up
the individual runs and requires the total to match, which it does to the last
float. "16 prompts only need a cheaper model" is sixteen copies of one advisory,
each with a file name beside it.

Two things it reports that nothing else did: **prompts no budget pattern matches**,
because an unwatched prompt is how the cost got there, and **prompts already over
budget** — before a red build says so, which is too late to think about it.

**It exits 0 even when it finds things.** `trazum check` is the gate. The model
recommendation is a keyword heuristic, and gating a build on a keyword heuristic
teaches people to re-run until green, which costs more than the tool ever saves.

Offline and free, like the rules. It deliberately does not check prompts against
their own `--suggest` recommendations: that is an LLM call per prompt, and this is
the command you run over forty files before deciding to spend anything. Four
mutants, each killed — averaging instead of summing, dropping the advisories that
carry no figure, printing the whole unbudgeted list instead of capping and counting
it, and exiting 1 on a finding.

### Fixed

**The README described a tool that only shortens prompts, and two counts in the
docs had drifted.**

Nine commands have landed since that front page was written, and it had been
updated by inserting a paragraph into whichever section each one belonged to —
which is exactly how a summary goes stale while every detail below it stays
correct. "What it actually does" listed four things, all of them `optimize`. A
reader who stopped there never learned that `rank` says which of forty prompts is
worth an afternoon, that `blame` names the commit, or that four commands write
markdown for a pull request comment. There is a table now, and the architecture
diagram includes the Action, which it had never mentioned.

`Layout` was missing a whole workspace (`action/`), plus `scripts/` and the eleven
core modules added since it was written.

Two numbers were simply wrong. The README advertised **580 tests** where the real
figure had reached **798**. `RELEASES.md` claimed **thirteen** deterministic rules
where there are **twelve**, and listed "restated output formats" among what they
cut — an advisory that is deliberately never cut, so that sentence was wrong twice.

Both are now checked rather than corrected. `publish.test.js` compares the rule
count in prose against `RULES.length`, refuses to let an advisory be described as
something the rules cut, and fails if the README ever advertises a test total
again — because a total across four suites cannot be verified from one of them, and
a number nobody maintains is worse than no number. Three mutants, each killed by
reintroducing the exact error it replaces.

**A blame test threw away the evidence when it failed.** `shows the most recent N`
was the only test in `blame.test.js` that checked neither the exit code nor passed
the command's output into an assertion, so when it failed once on CI the entire
report was `0 !== 3` — which is what "the table has no rows" looks like whether the
history was short, the path was rejected, or git never answered. The output was
right there in the variable, unused.

It carries the output now, and asserts the exit code first. Verified by forcing the
failure: the report goes from `0 !== 3` to `Error: git has no commits touching
p.txt.`

**This is not a fix for that failure.** It has never reproduced here — 26 runs
including under 8× CPU load — and the identical commit passed in the same CI minute
on the other event, so it is intermittent and its cause is still unknown. What
changed is that the next occurrence will say something.

### Added

**`comparePrompts` reaches the web app, as a Compare tab and `POST /api/compare`.**
Two versions of a prompt, the token delta, what it costs, and which advisories and
rules the edit introduced or resolved.

The whole hazard of this surface is a **sign**. Everywhere else in Trazum a
positive number is money you get back; here every figure is `after - before`, so
positive means the edit made things worse. Getting that backwards throws nothing,
fails no typecheck, and tells somebody their prompt got cheaper on the commit that
doubled its cost. So the convention is stated **above** the figures rather than
beside them — a reader arriving from the Optimise tab has the opposite expectation
already loaded, and a caveat under the number is a caveat read after the
conclusion — and most of the new tests assert a direction rather than a value,
including the swapped-pair case that a `Math.abs` mutant walks straight through
otherwise.

`optimizeBoth` is off by default and the default is the interesting half: the edit
changed the text as written, so the text as written is what the reader is being
asked about. Trimming both sides first hides a prompt that doubled in length and
happened to double in courtesy. Honoured only on a literal `true`, like every other
boolean these routes take. A missing `before` and a missing `after` are told apart,
because one message for two fields leaves the caller guessing.

**The usage scenario is now owned once, by the page.** It sits beside the locale in
`App`, for the same reason and with the same shape: both tabs price their answers
through it, and setting 50,000 calls on one while reading 10,000 on the other would
make the two answers incomparable while looking like they were about one workload.
`Optimizer` reads it from a prop and writes back through it; the history panel
restores all five fields in one update rather than five, because five setters on
shared state is five renders and, in between, four scenarios that are nobody's.

**And `formatUsd` stops being defined twice.** The web app had a copy that was
byte-identical to the one `@trazum/core` exports, for as long as it existed. The
core also had the `formatSignedUsd` that Compare needed.

Nine mutants. Two are worth naming. One test asserted the *absence* of local
scenario state in `Optimizer`, and a mutant renaming the local to `callsPerMonth2`
satisfied every pattern looking for `const [callsPerMonth,` while the two tabs went
back to disagreeing — a test that enumerates ways to be wrong is always one rename
behind, so it asserts the positive property now: every field read from
`scenario.usage`, every setter delegating to `scenario.set`. The other is that the
sharing *behaviour* cannot be seen from source at all, and was verified by driving
the built page in a headless browser: set the calls on Compare, read them back on
Optimise, and the reverse.

**`rank` and `blame` take `--markdown-out`.** The flag existed on `check` and
`diff`, which meant the two commands that answer *which of these forty prompts is
worth an afternoon* and *who made this one expensive* could not put their answers
where those decisions get made. Both now render a table for a job summary or a
pull request comment, written before any exit code is set and independently of
`--json` — the file's job is to survive the run.

Every string but the heading comes from the same `t.rank` / `t.blame` objects the
terminal report reads. Not tidiness: a second copy of "there is no score" is a
second thing to keep true, and whoever eventually softens one of those sentences
will soften the copy they happened to be looking at. `blame`'s priced movement
moved into a shared `netCostOf` for the same reason — two copies of that
arithmetic is precisely how a comment and a job log start disagreeing about one
history.

**A third escaper, `mdTextCell`, for untrusted prose in a table cell.** `mdCell`
is safe and announces "this is code" by wrapping in `<code>`; the first draft of
the blame report used it for the author and the subject, so the table typeset a
person's name as a code span and an English sentence with it. Correct, and plainly
wrong the moment it was rendered. The new one keeps `mdCell`'s entity encoding —
no `|` in the output at all, so the row cannot split — and adds the inline-markdown
set, which `mdCell` never needed because backticks make its content literal.

This is the least trusted input in the repository: on a pull request from a fork,
the commit subject is written by whoever opened it, and it lands in a table
maintainers read. Verified by building a repository with `grow | </table><script>`
as a commit message and asserting every row still has five cells.

Five mutants, each killed. One of them was killed only by a fixture coincidence —
reverting to `mdCell` kept the table intact and failed just the hostile test,
because `&#124;` happened to differ — so a test that asks the actual typographic
question went in beside it.

**`--suggest` is on the web too**, as two switches: one asks the model for
phrase-level rewrites, the second takes them. Turning the first off clears the
second, and the request derives the pair rather than sending both — a switch out
of step would otherwise produce a `400` for a combination nobody chose.

The proposals sit **above the saving**, one line each, with a count of what the
checks threw out. Same placement and the same reason as the reordering notice: a
figure read before its caveat is a figure nobody agreed to.

**And the web suite calls the route handler for real.** Every test in `apps/web`
until now read source and asserted on the text of it, which was honest about the
two rendering bugs it was written for and could not have seen the one below.
`test/api.test.mjs` sends requests: `next/server` is redirected to the platform's
own `Response.json` through a stable `module.register` hook — not
`--experimental-test-module-mocks`, because a suite should not depend on a flag a
Node minor can rename — and the core, the rules and both catalogues are the real
modules. Eight tests, four mutants, each killed by the one test meant for it.

`apps/web/package.json` declares `"type": "module"` as part of this. Loading a
`.ts` route from plain Node otherwise warns on every run that the file "doesn't
parse as CommonJS" and is being reparsed — a fair warning, and one worth fixing
rather than muting with `--disable-warning`, since every config in that directory
was already `.mjs`. Build, typecheck and both suites verified after.

The CI step that runs them is renamed from **"Core and CLI tests" to "Tests (core,
CLI, web, Action)"**, which is what `npm test` at the root has been doing for a
while. A step labelled for two of the four suites invites a reader of a green build
to think the other two are unchecked, and invites somebody adding a suite to write
a step that already exists.

### Fixed

**`applySuggestions` on its own returned `200` and applied nothing.**

Found by sending it, not by reading the diff. The response came back with a
complete report, no `suggestions` key, and the prompt untouched — the one thing the
caller asked for silently did not happen. Nothing about the source looked wrong:
the field parsed, the literal-`true` guard around it was correct, and the branch
that would have used it was simply never entered.

That is the same failure as a misspelled field being accepted, which this endpoint
already refuses for `disableRules` and `usage.model`, and which the CLI already
refuses for the matching pair of flags — *"a flag that quietly does nothing is the
same failure as a typo'd flag being accepted"*. There was no reason for the HTTP
surface to be the lenient one. It is a `400` now, refused **before** any call to
the model, so a malformed request never costs one.

Only a literal `true` is refused, because only a literal `true` would have been
honoured: `applySuggestions: "false"` asks for nothing and gets nothing, which is
what it says.

### Security

**The trimming rules only trimmed in two languages, and the report did not say so.**

`--reorder` was fixed to refuse safely in nine languages. The rules that actually
cut tokens still had dictionaries for English and Spanish alone, so:

```
en   22 →  11   2 rules
es   25 →  14   2 rules
fr   25 →  25   0 rules     ← nothing
de   20 →  20   0 rules     ← nothing
```

A French or German author ran Trazum, read `No rule found anything to trim`, and
took it to mean their prompt was already efficient. It meant Trazum could not read
it. Same defect `--reorder` had, one layer over: the tool knew something it was
not telling anybody.

Two fixes, in that order. **The report now names its coverage** whenever no rule
fires — stated rather than detected, because guessing a prompt's language is one
more thing to get wrong and naming the coverage cannot be. And **French, German,
Portuguese, Italian and Dutch** join the six dictionaries, so the trimming and the
reordering finally cover the same set of Latin-script languages.

### Fixed

**A dictionary translated word by word changed meaning.** The first pass at those
five languages shipped `muito`, `molto` and `heel` as intensifiers. All three are
also quantifiers, and `INTENSIFIERS` is dropped outright at the aggressive level:

```
Hai molto tempo per rispondere.   →   Hai tempo per rispondere.
```

"You have much time" became "you have time". Spanish had this right all along —
`muy` is on the list and `mucho` deliberately is not — and translating word for
word instead of by role lost the distinction. Found by running the five languages
through the rules, not by reading the list.

Both halves are now tested. One suite keeps those three words out and asserts the
quantifier sentences come back byte-identical. The other counts entries per
language per dictionary, because the behavioural test passes on whatever the
fixture happens to contain — which is exactly how a two-language hole survived a
full suite for this long. Portuguese and Italian dropping to a single firing rule
the moment `molto` came off the list is what surfaced the need for it: the
fixtures had been carrying the claim.

### Added

**[RELEASES.md](RELEASES.md) — release notes for people**, and the workflow now
publishes a GitHub release from them.

Until now, tagging published to npm and created **no GitHub release at all**. The
tag existed, the page behind it was empty, and anyone following a "what changed?"
link arrived at a file list. This changelog is thorough and it is not what you
hand somebody who has forty seconds — it is the maintainer's record, written for
whoever has to understand a decision two years from now.

`scripts/release-notes.mjs` extracts one version's section, and the release job
pipes it into `gh release create`. Writing the notes in a pull request beats
typing them into a web form at the moment of releasing, which is the moment least
suited to writing anything carefully.

Five tests make the file load-bearing rather than decorative: the version in the
manifests must have a section, the newest section must be the pending release or
the current version, the file must say nothing is published while nothing is
published — the exact claim ROADMAP.md got wrong — and the extractor must return
one section and fail loudly for a version it has never heard of. All checked
against mutants, including one that makes the extractor swallow the next release's
notes.

The release job's `contents` permission widens from `read` to `write`, which
`gh release create` requires. Stated rather than slipped in: that job now holds a
token that can push to the repository. The checkout is still
`persist-credentials: false`, so the working tree's remote has no token to reuse,
and the only step touching the API creates a release from a file already in the
commit.

### Fixed

**ROADMAP.md filed five versions under "Released" that were never released.**

There is no git tag in this repository, the `@trazum` scope does not exist, and
this file — which states at the top that `Unreleased` means merged-but-untagged —
holds every one of 1.1.0 through 1.5.0 right here. Two documents, one of them
wrong, and nothing checking either against the other.

It matters beyond tidiness: "Released" is what somebody reads before deciding
whether they can install this. The discipline in this repository is not claiming
what has not been checked, and this was the least-checked claim in it.

Those milestones now sit under **Merged into `main`, not yet released**, which
says what is true: the ordering is a useful record, the numbers will not appear on
npm, and the first publish collapses all of it into one version. The two things
needed before any of it ships are named there, and both belong to the maintainer.

Three tests keep the record honest from here — every version the roadmap calls
released must have a changelog entry, nothing under "not yet released" may already
be released, and the manifests must carry the newest version the changelog has
actually cut. All three were checked against mutants; the first reproduces the
original bug by name.

Also on the roadmap: an entry for the five commands merged today, and **cost
alerting** added to `Under consideration` with the reason it is not scheduled — it
needs a service holding other teams' prompt metrics on a schedule, and `check
--max-tokens` in CI already covers the threshold case for anyone content to have
the answer arrive on a pull request instead of in Slack.

### Added

**`trazum eval --export promptfoo` — hand the run to your own harness.**

Agreement is the question Trazum is qualified to ask, and it is not the question
a team needs answered before shipping. Theirs is whether the classifier still
hits 94%, whether the JSON still parses, whether the refusal rate moved — and
those are assertions about their task, which this tool has no business
inventing.

So it builds the part it *can* get right: a suite in which the only variable is
the prompt, with both versions, every case bound to the correct template
variable, and the same provider on both sides. `defaultTest.assert` is left for
the team.

It makes **no API call and needs no key** — the whole point is to hand the run
over — and it warns about the things that would quietly make a run meaningless:
a `${x}` placeholder promptfoo will not substitute, a prompt with three
placeholders and one value per case, a provider whose id had to be guessed.

The only assertion seeded is `is-json`, and only when the prompt shows a fenced
JSON block. That is not an opinion about the task; the prompt already demands it.

JSON rather than YAML, which promptfoo reads just as happily. This package has
no dependencies and is not acquiring a YAML emitter, and a hand-rolled one is a
quoting bug waiting for the first prompt with a colon, a tab, or a line ending
in a space.

### Fixed

The JSON detection used `findRestatedFormat`, which was the wrong question
wearing a convenient shape: that function answers "is this prompt wasting tokens
restating its own schema?", so a prompt demanding JSON *cleanly* got no
assertion while a wasteful one did — exactly backwards. It now looks for a
fenced block tagged `json`, or an untagged one that parses as JSON, and the
report says how many assertions were seeded rather than claiming "no assertions"
unconditionally.

### Added

**`trazum rank <dir>` — which of these prompts to fix first.**

The obvious shape for this was a complexity score out of a hundred, and it is
the wrong shape. A number nobody can reproduce by hand cannot be argued with,
and the weights that turn four measurements into one get tuned until the ranking
looks right — which is fitting the metric to the answer.

So the ordering is the one quantity that is not a matter of opinion: **what
optimising each prompt would actually recover**, obtained by running the
deterministic rules rather than evaluating a formula. The structural
measurements are printed beside it as the *explanation* — tokens per sentence
(verbosity independent of length), few-shot examples and what they cost, a
restated output format, and the share of the prompt that is protected content.

That last one earns its place: a prompt that is 83% code has far less headroom
than its size suggests, and a ranking that hid it would send somebody to spend
an afternoon on a file that cannot move.

Source files contribute their marked prompt, never the code around them. One
with no marker is skipped **and counted**, so a repository whose prompts mostly
live in code does not show a short list and look complete.

Two tests hold the line against a score reappearing: `PromptProfile` may not
grow a field whose name contains "score", "rating", "grade", "index" or
"complexity", and neither may the ranking's JSON.

### Fixed

Two problems in that work, both visible only by running it:

- **A single unmarked source file aborted the whole ranking.** `sourceFileOf`
  throws for a source file with no `// trazum:prompt` marker, which is right for
  `optimize` — you named that file, and optimising it would rewrite your code —
  and wrong for a command walking a directory. One stray `.ts` killed the other
  thirty-nine.
- **Four prompts showed `$0.25` and looked like four equivalent jobs.** Three of
  them recovered a single token, which at 50,000 calls is twenty-five cents. The
  arithmetic was right and the presentation was not. Rather than invent a
  threshold nobody could check, the token count is printed beside the money.

### Added

**`optimize --suggest` — rewrites proposed one phrase at a time.**

`--llm` hands the model the whole prompt and takes the whole answer back, which
is all-or-nothing in both directions: a result that fails one safety check
leaves the author with nothing, and one that passes is a wholesale rewrite they
must read end to end before trusting. `--suggest` asks which exact phrases say
something in more words than they need, and returns a list small enough to judge
on sight — `You should always make sure to → Always`.

The model proposes; the prompt decides. Every suggestion is checked against the
text before it is shown and dropped rather than reconciled: `before` must appear
byte for byte (a model asked to quote will tidy the punctuation as it goes), it
must not touch code, URLs, placeholders or tags, `after` must not introduce any,
it must actually save tokens, and overlapping suggestions are refused because
applying both produces text neither described. A phrase occurring several times
is rewritten everywhere it appears *outside* protected content rather than the
whole suggestion being refused for one occurrence in a code block.

Nothing is applied unless asked. `--apply-suggestions` takes them and the
headline figures move with the change; on its own it is an error rather than a
no-op, for the same reason a misspelled flag is.

The model is asked about the **optimised** prompt, not the one as written —
re-finding what the rules already took spends a call to be told what Trazum knew
for free.

### Fixed

The first version of the CLI test for this deadlocked and had to be killed by
the timeout. It drove the binary with `spawnSync`, which blocks the test
process's event loop, so the fake LLM server living in that process could never
answer the child it was waiting on. A fake server in the test process only works
if the test process is free to run.

### Added

**`trazum blame <file>` — when this prompt got expensive, and what change did it.**

Git already knows who edited a prompt and when. What it does not know is that
three lines added to a system prompt at 50,000 calls a month is a bill rather
than a diff. `blame` walks the file's history, counts the tokens at each commit,
and puts both facts on one line — with the net movement priced through the same
usage profile `optimize` uses, and the single worst commit named.

`--prompt` tracks one marked prompt inside a source file, so refactoring the
imports is not read as the prompt growing. Renames are followed. `--limit`,
`--json`, and the pricing flags behave as everywhere else.

This is the first thing in the repository that runs another program, so it
happens in one module written as though it were the whole attack surface: no
shell, every path after a `--` separator, object names validated as 40 hex
digits before being glued to anything, bounded timeout and buffer, and no
credential prompting. Six invariants in `security.test.js` assert all of that,
each checked against a mutant — including that `git.ts` stays the *only* file
importing `node:child_process`.

**Every command now honours `--` as the end of options.** Without it there was
no way to name a file called `-x.txt` or `--output=…` on the command line at
all; the parser saw a flag and refused before the path reached anything.

### Fixed

Two bugs found while building the above, both by running it:

- **A renamed prompt reported no history before the rename.** `nameAt` asked
  `git log --follow --max-count=1 <sha> -- <today's name>`, which returns nothing
  for commits where that name did not exist — so every revision before a move
  showed "not present" while the data sat there under the old name. One `git log`
  for the whole history now pairs each commit with the path it touched.
- **`--limit` was ignored.** It was accepted by the command's flag list but never
  added to `VALUE_FLAGS`, so `--limit 6` parsed as a boolean and the count was
  the next positional argument. It silently walked the default 20 every time.

### Security

**`--reorder` had no safety at all outside English and Spanish.** Not a missing
feature — a silent failure.

`BACKWARD_REFERENCES` was one flat list of English and Spanish phrases, applied
to every prompt. The module's own documentation says its entire design is about
what it refuses; for a French, German, Portuguese, Italian, Dutch, Japanese or
Chinese author it refused nothing. "Résumez le texte ci-dessus" was hoisted above
the text it points at and reported as a saving. Every test in the suite passed,
because every test asked the question in the two languages that worked.

Seven more languages now, grouped per language so the coverage is a thing you can
look at rather than infer. Japanese and Chinese match without word boundaries —
the boundary test asks whether the neighbouring character is a letter, and in
上記のテキスト it always is, so a boundary-matched CJK list would have read like
cover and provided none.

**And a fourth refusal, for the scripts still missing.** Cyrillic, Arabic,
Hebrew, Hangul, Devanagari, Thai and Greek: nothing moves, and the report names
the script and says why. A single such instruction inside an otherwise English
prompt is enough to stop it — that is the case where a missed reference does
damage, and the cost of being wrong is a saving the author can still take by
hand. Adding a language is adding an array.

Three tests keep this honest rather than trusting it: the README's list of
languages must match the table, no phrase may be capitalised (it could never
match), and no covered language's phrases may use an uncovered script. All were
checked against mutants.

### Fixed

Two pluralisation slips in the reorder report, both visible in the output above:
"1 tokens back, every call" and "Left 1 block where they were".

### Changed

**The web app is rebuilt on shadcn/ui, wearing Trazum's own palette.**

The components are shadcn's — Radix underneath, so the model and level pickers
are properly keyboard-navigable and the toggles announce themselves, which the
bare `<select>` and `<input type="checkbox">` never did. The colours are the ones
that were already here: `--primary` derives from `--terracotta`, `--background`
from `--paper`, and so on down. Taking shadcn's neutrals would have made this
look like every other application assembled from the same registry, and the
whole point of theming through CSS variables is that you do not have to.

Two changes are not cosmetic. The result and the diff are **tabs** rather than a
toggle button whose label named the state you were not in — that button was read
backwards about half the time. And the endpoint field is the picker the previous
release made it, now rendered as one.

Animation comes from react-bits' `CountUp`, `AnimatedContent` and `ShinyText`,
rebuilt on `requestAnimationFrame` and CSS keyframes: upstream builds them on
`motion`, and one animated integer is not worth a 50 KB dependency in a project
whose published packages have none. `prefers-reduced-motion` switches all of it
off in one rule rather than component by component.

### Fixed

**Two bugs in that rework that compiled, typechecked, and were wrong.** Both were
found by opening the page, not by reading the diff.

The results summary rendered *blank*. `AnimatedContent` waited for an
`IntersectionObserver`, and a reader who scrolls down to reach the Optimise
button gets their result mounted above the viewport — so the observer reported
"not intersecting" and a 214px card sat there at zero opacity. Content that
appears in response to an action is not scroll-triggered content; it animates on
mount now, and waiting for the viewport is opt-in.

The Copy and Clear buttons each fell onto their own row. `CardHeader` is a grid,
so the `flex-row justify-between` on it merged in and did nothing — the two
utilities are in different groups, so nothing overrode anything and the class
list read as though it should have worked. They use shadcn's `CardAction` slot,
which is what the grid has a rule for.

`apps/web` has tests for the first time, and they encode exactly these two: a
component whose default hides content, and a layout override that is silently
ignored. Both were checked against a mutant that reintroduces the bug.

### Fixed

**The alert gate raced the analysis it reads, and failed the merge that fixed
both alerts.** `open-alerts` and `codeql` started together: the gate finished one
second in, CodeQL uploaded a minute later, so the gate judged the merge against
the state of the commit before it and reported two findings at line numbers that
no longer existed. A red build for a fix that worked is how people learn to
re-run until green.

It now runs `needs: codeql`, and — because the alert index settles after the
upload returns — checks that every row it is about to report carries the SHA
being built, retrying for up to 90 seconds and failing rather than passing if it
cannot read current state. A gate that cannot see the present has no business
reporting green.

The test for it caught nothing at first: `/needs:\s*codeql/` matched the comment
explaining the dependency. Fourth time in this repository. It strips YAML
comments now and asserts against a mutant with the line deleted, so "can this
assertion fail?" is answered rather than assumed.

### Security

**CodeQL reopened the SSRF alert on the fix below, and it was right a third
time.** Both earlier attempts hardened the wrong layer. The taint does not start
at `TRAZUM_LLM_BASE_URL`, which an operator sets on their own machine — it starts
at `POST /api/optimize`, whose body carried a `baseUrl` that the deployed server
would then fetch. That is server-side request forgery by construction, and no
amount of validating the string fixes it: the host filter reads a *name*, and a
name an attacker registered resolves wherever they choose.

**So the request body no longer names an endpoint. It selects one.**
`TRAZUM_ALLOWED_LLM_ENDPOINTS` is a comma-separated list the operator writes, and
the value that reaches `fetch` is the entry from that list — the string that
arrived over HTTP is compared and then dropped. The list is empty by default, so
a deployment that has not thought about this cannot be pointed anywhere at all.
Nobody loses the capability: `TRAZUM_LLM_BASE_URL` and the CLI still go anywhere
you like. What changed is who is allowed to choose. The web UI's free-text field
is now a picker over what the server actually accepts, because offering a text
box that always answers 400 is worse than offering nothing.

**A redirect walked past the entire host filter, and had all along.** Every check
in `net.ts` reads the URL the caller named, and `fetch` follows redirects by
default — so an endpoint that passed validation could answer
`302 Location: http://169.254.169.254/latest/meta-data/` and the request went
there anyway, `authorization` header included. One HTTP response, and the whole
filter was decorative. Every server-side call now carries `redirect: 'error'`,
plus `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. This one mattered
for the CLI as much as for the deployed app, which is why it is fixed in the
provider rather than in the route.

**And a third door nobody had looked at.** `countTokensAnthropic` takes a
`baseUrl` and sends an `x-api-key` to it, with no validation whatsoever. Both
providers had been hardened twice over while this sat open, because it is called
a counter rather than a provider. It goes through the same gate now.

### Security

**The alert gate found two things on its first real run**, which is the argument
for it in one sentence. Both were invisible to every pull-request check.

**The SSRF fix did not close the alert, and CodeQL was right.** Validating at
construction checked `baseUrl` and then fetched
`` `${baseUrl.replace(/\/$/, '')}/chat/completions` `` — two different
expressions, so the thing checked was never the thing used and nothing on the
path from option to fetch was a barrier. A later edit could have moved the check
without anything noticing.

The validator now **returns the value to use** rather than approving one, and the
fetch uses what it returned. Re-parsing normalises it too:
`https://host/v1/../../admin` passed as a string and resolved to `/admin` on the
wire; it is resolved before the request now.

**And a time-of-check to time-of-use race I introduced an hour earlier.** The
symlink guard was `lstat` then `readFile`, which resolves the name twice — CodeQL
opened it as high severity. It is now a single `open` with `O_NOFOLLOW`: one
syscall, and the handle is the file that was checked.

This repository had already been caught by the identical `stat`-then-read pattern
in the config reader and fixed it the same way. I wrote it again anyway, which is
the more useful half of the finding: the guard against a class does not live in
anybody's memory.

**A third thing turned up while fixing those two: one file had no diff.**
`scripts/measure-token-band.mjs` used a raw NUL byte as a hash field separator,
which is enough for git to call the file binary. Its three commits — including
the one that fixed the SSRF finding above — rendered as
`Bin 7652 -> 7654 bytes`, and nothing anywhere warned that a security fix had
gone through unreadable. The byte is now written `\0`, which produces the same
digest, and a test refuses a raw NUL in any source file: the other invariants
here all assume somebody can read the code.

### Security

**A job now fails the build when `main` carries an open critical or high alert.**

CodeQL's pull-request check reports *new alerts in the code that pull request
changed*. A finding already open on `main` is not new, so every later pull
request goes green beside it — which is exactly what happened: **eleven
consecutive green runs with a critical SSRF alert open the whole time**, found
only because somebody opened the Code scanning page and looked.

Green on a pull request is not green on the repository, and nobody should have to
remember the difference.

Four decisions in the job worth stating:

- **It reads `security_severity_level`, not `severity`.** The first is the
  CVSS-style rating the UI shows as "Critical"; the second is the query's own,
  where today's critical was merely `error`. Reading only the second would have
  let it through.
- **`security-events: read`.** A job that could dismiss an alert is a job that
  could dismiss the alert it was written to surface.
- **Skipped on pull requests.** There it would report the base branch's state and
  fail somebody's unrelated work for a finding they cannot fix from their branch.
- **It can actually fail.** The `jq` filter was checked against a realistic
  payload — one critical, one medium, one with no severity field at all — before
  it was committed. A gate that cannot fail is worse than no gate, because it
  looks like coverage.

`SECURITY.md` gains the row, and two tests assert the job still asks the right
question and stays read-only.


**`optimize` pointed at a source file used to rewrite your code.** Handed
`src/prompts.ts` it optimised the *whole file* — imports, `const client = new
OpenAI();`, all of it — counted 83 tokens of code the model would never see, and
priced it against Claude Opus 5 on a file that plainly imports `openai`.

Then the capitalisation rule turned `import OpenAI` into **`Import OpenAI`**,
which does not compile, and `-o` wrote it back over the file. That is the worst
behaviour this repository has shipped, and it was the default.

It now reads the marked prompt and leaves the file alone — 43 tokens instead of
83, and the output is the prompt rather than mangled TypeScript.

**It refuses rather than guessing**, in three places:

- **An unmarked source file.** Optimising TypeScript as prose does not produce a
  worse prompt, it produces broken code. The refusal names the marker syntax, so
  it costs the reader one comment.
- **A file holding several marked prompts** — it lists them and asks for
  `--prompt`. Optimising "the first one" silently is how the wrong prompt gets
  rewritten.
- **A marker it cannot read**, naming the line and the reason.

**Detection now feeds the price**, closing the gap `trazum where` opened: an
import names who and never which, so the provider's stand-in model is used and
the report says GPT-5 rather than Claude. The layering is unchanged and now has
one more rung — a flag beats config, config beats detection, detection beats the
built-in default. Reading the code is better than assuming, and worse than being
told.

`--prompt <name>` is new. A plain `.txt` prompt and stdin go through exactly as
before, which is asserted rather than assumed.


### Security

**The SSRF filter was one level too far out.** `openAiCompatible` fetches whatever
`baseUrl` it is handed, with no validation of its own. The web route validated a
body-supplied URL before calling it, and that was the only thing standing between
a public deployment and the internal network — which `SECURITY.md` claims as a
property of the filter, not of one caller remembering to use it.

`openAiCompatible` and `anthropicProvider` now validate their own endpoint at
construction, so a provider that can never safely work does not exist to be
handed around. `openAiCompatible` is an exported library function: "the caller
checks" is a promise about every future caller, including ones outside this
repository.

The distinction that makes this safe without breaking anything is **who chose the
URL**:

- From `TRAZUM_LLM_BASE_URL` — the operator configuring their own machine.
  `providerFromEnv` passes `allowInsecure: true`, because `http://localhost:11434`
  for Ollama is the documented normal case and refusing it would break every
  local setup.
- From an HTTP request body — a stranger naming a host for this server to fetch.
  Validated, and now twice: the route still turns the reason code into a sentence
  in the reader's language.

Verified by hand across the shapes that matter: the cloud metadata address, plain
localhost, an RFC1918 address and credentials in the URL are all refused; a public
https endpoint and an operator-configured Ollama both work.

**`measure-token-band.mjs` followed symlinks.** The script posts corpus file
contents to the counting endpoint — that is its job, and CodeQL flagging the
file-to-network flow describes the job rather than a bug. What it made worth
checking was the edge: `readdir` plus `readFile` follows a symlink, and the corpus
is a test-fixture folder people drop things into. One named
`few-shot.txt -> ~/.aws/credentials` would have been posted to an API without a
word. `walkPrompts` has skipped symlinks since it was written; this script had
simply never been held to the same rule.

It now refuses a symlink by name and prints every file it is about to send before
sending any of them. The repository tells people not to paste a private prompt
into a public issue; posting one to an API deserves the same warning, and consent
has to be informed to be consent.

**Both alerts had been open on `main` for hours** without appearing on any pull
request. The CodeQL check on a PR reports *new* alerts in the changed code, so a
finding on `main` stays green on every subsequent PR — worth knowing about the
tooling, not just about these two.


**The report reads like a report.** Twelve releases added sections to it and
nobody had looked at the whole thing at once. Printed end to end, three problems
were obvious:

- **The amounts were unreadable as a set.** Four advisories worth $506, $422,
  $170 and nothing, each with its figure trailing the end of a different-length
  title. They exist to be compared, and comparing them meant hunting for four
  numbers in four sentences. The amount now has a column of its own, right
  aligned, with the detail indented to the title so the prose forms one block
  instead of stepping around the numbers.
- **Nothing said what to do first.** The rules saved $1.25 and the top advisory
  was worth $506 — a 405× difference the reader had to notice for themselves. A
  closing line names it: `Start here: "This task may not need Claude Opus 5" —
  $505.80/month, 405× what the rules saved.`
- **`--reorder` printed a heading, a blank line and a shrug** when there was
  nothing to move and nothing refused. The token count above had already said
  nothing changed. That block now appears only when there is a move or a refusal
  to report.

Two things caught by looking at the output rather than the diff: the closing line
lowercased the advisory title, turning "Claude Opus 5" into "claude opus 5" — a
product name mangled to fit a sentence — and it was the one line in the report
not wrapped to the common width, so it ran off a narrow terminal.

A test that matched `Nothing could safely move.` was rewritten to assert the
behaviour instead: that the prompt came back unrearranged. A test pinned to a
line that says nothing is what keeps that line alive.


**On a subscription, Trazum stops printing money.** Inside Claude Code, Codex or
Cursor you pay the same whatever your prompt costs, so a monthly figure is
arithmetic about tokens dressed as cash — and "$184/month" told to somebody on a
flat plan is not a rounding error, it is money that does not exist.

The report now says what the saving actually buys there: tokens back per call,
and the share of the context window they free. The window is the real currency
inside an agent — every token the system prompt holds is one the conversation
cannot.

**Advisories whose only pitch is money are dropped too**, which the first version
got wrong. Suppressing the price beside each title left `model-downgrade`'s detail
reading "you would go from $843.00 to $337.20 per month" in prose underneath.
`model-downgrade`, `batch-api`, `output-dominated` and `promo-pricing` now go
entirely; caching, context overflow, contradictions and redundant examples stay,
because latency, headroom and correctness are still real on a plan.

The test for this is blunt on purpose — **no dollar sign anywhere in the output**.
A softer assertion would have passed the version with money in the prose.

Two escape hatches, and the reasoning behind them matters more than the flags:
the host says where *Trazum* runs, not where the prompt goes. Somebody editing a
production prompt inside Cursor wants the dollars, so `--cost` brings them back
without leaving the editor, and `--tokens-only` forces the other direction
anywhere. `--cost` wins when both are given.

Also fixed before it shipped: forced with `--tokens-only` on GitHub Actions, the
report announced that "GitHub Actions bills by subscription", which is simply
false. It now distinguishes being told from having detected. And `unknown` billing
is treated as `unknown` rather than as a subscription — guessing wrong there would
hide the product's main output from most of the people using it.


**`trazum where` — which provider a prompt is actually sent to.** Pricing seven
providers turned the Claude default into a wrong number: a file calling OpenAI was
billed against Claude Opus 5 without comment. This reads what the code already
says instead of assuming.

Four kinds of evidence, strongest first: `model=` on a `trazum:prompt` marker, a
quoted model id, a base URL, an SDK import. Every answer names the line it came
from — a detection that cannot be checked is a guess, and the dollar figure that
follows from it would be a guess too.

Three things it gets right that the first version got wrong, each caught by
running it rather than reading it:

- **A base URL beats the SDK it was pointed at.** Moonshot, DeepSeek, xAI and
  Groq are all called through the OpenAI SDK with a different `base_url` — their
  documented usage. Treating that as a contradiction refused to price a perfectly
  ordinary client; pricing it as OpenAI would have been wrong for a large slice of
  everyone using this.
- **It priced an OpenAI file as Claude.** Detection found the provider, found no
  model, and fell through to the global default — printing "goes to openai" and
  "priced as Claude Opus 5" three lines apart. It now uses that provider's own
  model and says that is what happened.
- **Nearest capability, not an exact match.** Neither OpenAI nor DeepSeek has a
  `large` model, so matching the default's capability exactly found nothing and
  the fallback fired anyway. A ladder with different rungs is the normal case.

**It refuses when a file names two providers**, names both, and assumes nothing.
Detection sits between config and defaults: a flag beats config, config beats
detection, detection beats the built-in default.

With no file it reports the host — Claude Code, Codex, Cursor, GitHub Actions, CI
or a plain terminal — and **warns when that host bills by subscription**, because
a monthly saving is arithmetic about tokens there rather than money anybody gets
back. That is the first half of the Cursor/Claude Code question the roadmap has
been holding: not a full report in a different unit, but no longer quoting a
dollar figure to someone on a flat plan without saying what it is.

A third quadratic line-number lookup, found by the hostile-input tests before it
shipped — 36 seconds on a file repeating a model id. Same shape as `extract.ts`,
written again after fixing it there; a binary-searched line index this time,
because the matches arrive out of order and a forward-only counter cannot work.


**The report no longer claims a Claude number for a model that is not Claude.**
Pricing seven providers left the token estimator where it was — tuned against
Claude's tokenizer — while `±15%` kept printing beside GPT and Kimi figures. That
band was never measured for those families, and stating it was a precision claim
nobody had earned:

```
1,021 → 1,020   -0.1% (estimated — the counter is calibrated on Claude, not GPT-5)
```

Anthropic models still show `±15%`, where the band is at least the claim it was
written for. `--exact-tokens` remains the answer for figures you can budget from.

Documents the multi-provider work that shipped alongside it: a table in the README
of what actually differs between providers — cache read rates, cache minimums,
whether caching starts automatically, and which providers have no batch API or no
caching at all — plus the two things deliberately left out and why.

The `Tokenizer per model family` entry under `Under consideration` is heavier than
it was, and says so. And the error-band entry now explains **once** that it will
keep being renumbered by anything that ships before it, rather than re-justifying
the move each time: it is the only item on the roadmap whose completion is not
ours to schedule, and holding shippable work behind it would be the wrong trade
every time.


**Trazum prices models from seven providers, not one.** OpenAI, Google, Moonshot,
DeepSeek, xAI and Mistral join Anthropic in the bundled catalogue.

The data was the easy half. The hard half was that **the cost multipliers were
global constants** — one cache-read rate, one cache-write rate, one batch
discount for everything — and global made them quietly wrong the moment a second
provider existed. They now live on the model, defaulting to Anthropic's values so
nothing that worked before changes.

Three of them were not inaccuracies but **savings that do not exist**, and all
three were found by running the catalogue rather than by reading it:

- **Kimi, DeepSeek and Grok have no batch API.** The global constant offered them
  a 50% discount that cannot be bought — $139 a month in the test that caught it.
  `batch: null` now means "there is no batch API", which is deliberately different
  from not having said.
- **Mistral has no prompt caching.** A zero cache minimum satisfied `0 >= 0`, so
  the caching advisory fired and offered $100 a month of a feature that does not
  exist. Introduced by this very change and caught before it left the branch.
- **The batch saving was computed as `cost × discount`**, which equals the saving
  only when the discount is exactly 0.5. Latent on Anthropic, wrong on the first
  provider with any other rate.

Gemini and Grok read cache at 25% of input against Anthropic's 10%, so the same
prompt cannot be worth the same fraction on both. The advisory now quotes each
provider's real rates — and **stops naming `cache_control` to people who do not
have it**: OpenAI, Moonshot and DeepSeek cache automatically above a threshold,
and the report says so instead of naming a parameter that does not exist for them.
The advice to move stable content forward is identical either way, because a
prefix is a prefix.

**A cheaper model means a cheaper model, not a different supplier.** Recommendations
are now scoped to the current provider. Dropping from Opus to Sonnet is a one-line
change; moving to another vendor is a different API, different behaviour and a
migration — and this advisory is already caveated as a keyword heuristic rather
than a judgement about answer quality. Unscoped, it was telling Claude users to
switch to `gpt-5-nano`.

### Deprecated

- **`ModelPricing.tier`** — replaced by **`capability`**, on a vendor-neutral scale
  of `small | mid | large | frontier`. Anthropic's ladder used as the generic axis
  reads as nonsense the moment the model is not Anthropic's: telling somebody on
  Kimi that their task "looks like haiku complexity" is a label meaning something
  other than what it says.

  **Migration:** replace `model.tier` with `model.capability`, mapping
  `haiku → small`, `sonnet → mid`, `opus → large`, `frontier → frontier`.
  `cheapestOfTier` and `cheapestOfTierIn` still take the old names.

  Per [VERSIONING.md](VERSIONING.md), `tier` keeps working unchanged for the whole
  of 1.x and is removed in 2.0. Both fields are populated on every model and a test
  asserts they never disagree — if they drift, half the code ranks one way and half
  the other, and the difference is invisible until a recommendation is wrong.

### Added

- `multipliersFor(model)` — the cache and batch rates that apply to one model,
  defaults filled in. Anything computing a cost should go through it rather than
  reading `COST_MULTIPLIERS`, which remains exported and remains correct for
  Anthropic.
- `ModelPricing.provider`, `.caching`, `.multipliers` and `.recommendable`. The
  last replaces a hardcoded model id inside `cheapestInTier` — a model behind a
  private programme is real and worth pricing, but recommending a switch to
  something the reader cannot buy wastes their time.
- An optional `provider` argument on `cheapestOfTierIn`, so a caller who genuinely
  wants "cheapest anywhere" can still ask.

**On the prices themselves:** they are written from what was known when this
landed, not read off each provider's page today, and `PRICING_LAST_REVIEWED` says
when. The tests check them for coherence — output dearer than input, a plausible
window, a cache minimum only where there is a cache — never for accuracy, which no
test here can do. The local pricing overlay corrects any of them without upgrading
the library.


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
