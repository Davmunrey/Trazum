# Trazum

[![CI](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-3c873a.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2f855a.svg)](#layout)

**Shortens what you send to the model without changing what you ask for — and
tells you what that is worth per month.**

The core is **deterministic**: same rules, same result, zero cost, no network.
On top of it sits an **optional LLM pass** for the compression rules cannot do,
through whichever provider you configure.

```
                    ┌──────────────┐
                    │ @trazum/core │   the library: rules, tokens, pricing
                    └──────┬───────┘   no dependencies, browser-safe
             ┌─────────────┼─────────────┐
       @trazum/cli    @trazum/web    action/
       ten commands   Next.js        comments on pull requests
```

> [!NOTE]
> **Not on npm yet.** 1.8.0 is prepared — manifests, notes and release workflow
> are all in place — but nothing has been published and there is no tag, so
> `npm install @trazum/cli` will not work today. Run it from source with the
> steps in [Getting started](#getting-started). See [RELEASES.md](RELEASES.md).

## The ten commands

| Command | What it answers |
|---|---|
| [`trazum optimize`](#cli) | What can come out of this prompt, and what is that worth a month? |
| [`trazum check`](#cli) | Does this prompt fit its token budget? *Exits 1 when it does not — this is the CI gate.* |
| [`trazum diff`](#did-this-edit-make-it-worse) | What did this edit cost? |
| [`trazum rank`](#which-prompt-to-fix-first-trazum-rank) | Of these forty prompts, which is worth an afternoon? |
| [`trazum doctor`](#the-whole-workspace-at-once-trazum-doctor) | What is wrong across the whole workspace? |
| [`trazum blame`](#who-made-this-prompt-expensive-trazum-blame) | Who made this prompt expensive, and when? |
| [`trazum eval`](#does-the-shorter-prompt-still-work) | Does the shorter prompt still do the job? |
| [`trazum where`](#prompts-where-they-actually-live) | Which prompts are hiding inside my source files? |
| [`trazum models`](#every-model-you-pay-for-by-the-token) | What does each model cost, and what is its cache minimum? |
| [`trazum rules`](#what-it-actually-does) | Which rules exist, and what does each one do? |

## Contents

- [What it actually does](#what-it-actually-does) — the five things, and what it refuses to touch
- [Getting started](#getting-started) — CLI, web, the GitHub Action
- [Languages](#languages) — what the dictionaries cover, and what they deliberately do not
- [Connecting your own LLM](#connecting-your-own-llm) — providers, and the SSRF rules
- [Every model you pay for by the token](#every-model-you-pay-for-by-the-token) — pricing across seven providers
- [Token counting](#token-counting) — the estimator, and the error band it prints
- [Limitations, stated plainly](#limitations-stated-plainly) — read this one
- [Layout](#layout) · [Updating prices](#updating-prices) · [Privacy](#analytics-and-privacy) · [Roadmap](#roadmap-and-contributing)

---

## What it actually does

**1. Trims the prompt with deterministic rules.** Courtesy, filler, verbose
phrasing, duplicated paragraphs, decorative separators, shouting in capitals.
Two levels: `safe` (no semantic risk) and `aggressive` (read the diff).

**2. Never touches what would break the prompt.** Code fences, inline code,
URLs, template placeholders (`{{x}}`, `${x}`, `{x}`, `{% %}`) and XML/HTML tags
are isolated before any rule runs. If a rule ever did make one of those
disappear, that rule is discarded and the rest carry on.

**3. Tells you where the money actually is.** Beyond the trimming, it flags
what usually saves more than shortening ever will:

| Advisory | Why it matters |
|---|---|
| Prompt caching | Reading from cache costs 10% of input. The saving is computed over the **real stable prefix**: in a template with `{{placeholders}}`, only what precedes the first one is cached — not the whole prompt. |
| Reorder the template | Stable instructions sitting *after* the first variable placeholder never cache today. Trazum prices moving them in front — and with `--reorder`, [does it](#reordering-for-the-cache---reorder). |
| Batch API | 50% off input and output when the work tolerates latency. |
| Cheaper model | Complexity heuristic: if the task looks simple, what dropping a tier would save. |
| Output-dominated cost | If you pay more for the answer than for the prompt, shortening the prompt has a ceiling. |
| Promotional pricing | Warns when you are budgeting with an introductory price that expires. |
| Context window | If the prompt does not fit, the call is going to fail. |
| Contradictory instructions | "Answer in English" three paragraphs above "reply in the customer's own language". The model has to pick one, and which one can change between calls — a correctness problem that also costs tokens twice. |
| Redundant examples | Few-shot examples that are near-copies of an earlier one, and what they cost per month. |
| Output format stated twice | A schema shown in a code block and then walked again in prose. The block is the version worth keeping. |

The last three are **advisory only**. A contradiction has a right answer that only
the author knows, and an example that looks redundant may be demonstrating a
boundary case on purpose. Trazum points; it does not cut.

The example detector finds near-copies — the way few-shot blocks actually grow,
by copy-paste-and-tweak. It deliberately does not flag *paraphrases*: the same
lesson in different words scores close enough to two genuinely distinct
examples that catching it would mean flagging examples that teach different
things. That case needs a model, and is on the roadmap for the LLM pass.

**Reviewing an aggressive run.** Every rule reports what it actually changed,
so the level that saves the most is judged rule by rule rather than as one wall
of diff — and a single rule you disagree with comes off with `--disable`:

```
  [aggressive] Intensifiers (3×, ~6 tokens)
      VERY → —
      extremely → —
      quite → —
  [aggressive] Self-verification instructions (1×, ~17 tokens)
      You should double-check your answer before re… → —
```

**4. Optionally, runs it past an LLM.** The result is only accepted if it is
shorter and leaves protected content byte-identical. Otherwise the deterministic
version stands. It never returns something worse than where it started. With
`--suggest` it proposes phrases one at a time — `You should always make sure to →
Always` — each checked against your prompt before you see it, so eight surviving
out of ten is a useful morning rather than a rewrite to read end to end.

**5. Answers the questions that come before "shorten this".** Trimming one file
is the smallest thing here. `optimize` is one of ten commands, and the others
exist because knowing a prompt is wasteful is not the same as knowing *which*
prompt, *whose* change made it so, or whether the shorter version still works:

| Command | Answers |
|---|---|
| `optimize` | what can come out of this prompt, and what that is worth per month |
| `rank <dir>` | which of these forty prompts is worth an afternoon |
| `doctor [dir]` | what is wrong with this whole workspace, and what fixing it is worth |
| `blame <file>` | who made this prompt expensive, and in which commit |
| `diff <a> <b>` | did this edit make it worse — every figure `after - before` |
| `diff --all <d> <d>` | the same question across a whole prompt library |
| `check --max-tokens` | does it fit a budget; exits 1 when it does not, so CI catches it |
| `eval --cases` | does the shorter prompt still get the same answers |
| `where [file]` | which provider this file's prompts are actually sent to, and how it knows |
| `models`, `rules` | the pricing table; what each rule does and its id |

`check`, `diff`, `rank` and `blame` all take `--markdown-out`, so the answer can
land in a pull request comment rather than a terminal nobody is looking at.

---

## Getting started

```bash
npm install
npm run build      # core + cli
npm test           # every suite: core, CLI, web, Action
npm run verify     # the above plus typecheck and the web build
```

<sub>The test count used to be written here as a number. It said 580 while the real
figure had reached 798, because nothing checked it — so it now says what the command
covers instead. A number nobody maintains is worse than no number.</sub>

### CLI

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

```
Input tokens
  190 → 137   -27.9% (estimated, ±15%)

Rules applied
  [safe] Repeated paragraphs (1×, ~19 tokens)
  [safe] Wordy phrasing (1×, ~3 tokens)
  [safe] Politeness formulas (4×, ~19 tokens)
  [safe] Filler and throat-clearing (2×, ~11 tokens)

Cost with Claude Opus 5
  50,000 calls/month · 300 output tokens per call
  $422.50 → $409.25   saving $13.25/month (3.1%)

Beyond shortening the prompt
  → This task may not need Claude Opus 5 ~$327.40/month
  → If the work tolerates latency, use the Batch API ~$204.62/month
```

The other nine commands, each with its own section below:

```bash
trazum doctor                        # survey the whole workspace
trazum rank prompts/                 # which one to fix first
trazum blame prompts/system.txt      # who made it expensive, and when
trazum diff old.txt new.txt          # what this edit cost
trazum check prompts/ --max-tokens 2000
trazum eval prompts/system.txt --cases cases.json
trazum where src/agent.ts            # which provider this actually calls
trazum models                        # pricing table and cache minimums
trazum rules                         # what each rule does, and its id
trazum --help
```

When redirected it writes only the optimised prompt, so it pipes cleanly:

```bash
cat prompt.md | node packages/cli/dist/index.js optimize - > prompt.optimised.md
```

To install it as a `trazum` command:

```bash
npm link -w @trazum/cli
```

**Token budgets in CI.** `trazum check` exits 1 when the prompt busts its
budget, so a template that grows unchecked breaks the build instead of the bill:

```bash
trazum check prompts/system.txt --max-tokens 2000
# FAILED 2,481 tokens busts the budget of 2,000.
#   Optimised with "trazum optimize --level safe" it would land at ~1,913 tokens and fit.
```

**Before it reaches CI: a pre-commit hook.**

```bash
ln -s ../../scripts/pre-commit .git/hooks/pre-commit
```

```
trazum: these prompts are over their token budget:
  prompts/system.txt

  trazum doctor .          shows how far over, and what it costs
  Shorten them, raise the budget in trazum.config.json, or commit with --no-verify.
```

**It blocks only on prompts your commit actually touches**, and that is the whole
reason it asks `trazum doctor --json` rather than running `trazum check prompts/`.
`check` exits 1 when anything under that directory is over budget — right for CI,
wrong for a hook, because it would refuse a commit that touches one file over a
*different* prompt somebody else committed last month. A hook that fails for
reasons outside the commit is a hook people learn to pass `--no-verify` to, and
then it is worse than no hook at all, because it also taught them the habit.

`TRAZUM_HOOK=0` disables it; `TRAZUM` overrides the command it runs. It gets out of
the way rather than guessing: nothing staged, no Trazum installed, no prompts, an
unreadable config — none of those are a budget failure, so none of them block a
commit. Each one says so once and exits 0.

**One limitation, because it is real:** Trazum reads the working tree, not the
staged blobs. `git add` a prompt and then edit it further and the hook judges the
newer text. It cannot let through a commit whose staged prompt is over budget, but
it can stop one whose staged prompt is fine and whose unstaged edit is not.

In GitHub Actions, use the packaged action — nothing to install:

```yaml
- uses: actions/checkout@v7
- uses: Davmunrey/Trazum@588f9e7d8658fc0aa061800ed59f779987bfb5c7  # 1.0.0
  with:
    target: prompts/system.txt
    max-tokens: 2000
```

**One-click fixes, as suggestions.** `suggest-fixes: true` posts the optimised
prompt as a GitHub *suggested change*, which a reviewer applies with one button:

```yaml
permissions:
  contents: read
  pull-requests: write
with:
  target: prompts/
  suggest-fixes: true
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

**A suggestion, not a commit, and that is deliberate.** Committing the fix would need
`contents: write` on your workflow, and [SECURITY.md](SECURITY.md) documents
`contents: read` with no `pull_request_target`. Widening that is your decision, not
something an action should help itself to for convenience — and a suggestion lands in
the same place with the same one click, needing only the `pull-requests: write` the
comment mode already uses. You stay the one who commits.

Two limits, stated because both are real. It uses the **safe** level only: the
aggressive level is defensible when a human is reading the diff it produced, and a
one-click apply is not that moment. And a suggestion can only anchor to lines **in the
pull request's diff**, while the rules operate on a whole prompt — so a pull request
that edits three lines of a forty-line prompt gets a notice explaining why there is no
suggestion, rather than a partial rewrite that means something different from what the
rules produced.

**Pinned to a commit SHA, not a tag** — the same rule
[SECURITY.md](SECURITY.md) states and `security.test.js` enforces on every
third-party action in this repository. A tag is a mutable pointer: whoever can
move `v1` can change what runs in your workflow with your token. The `# 1.0.0`
comment names the version at that commit, and is what Dependabot reads to offer
you the bump.

**The report lands in the run summary automatically** — every run, pass or fail,
with no token and no permissions. To also post it as a pull request comment that
replaces its own previous one:

```yaml
permissions:
  contents: read
  pull-requests: write     # the action cannot grant itself this

steps:
  - uses: actions/checkout@v7
  - uses: Davmunrey/Trazum@588f9e7d8658fc0aa061800ed59f779987bfb5c7  # 1.0.0
    with:
      target: prompts/            # a directory uses trazum.config.json budgets
      comment: true
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Commenting can never fail your build.** No pull request, comments disabled, or
a read-only token — each prints a notice and carries on, because the report has
already reached the run summary. That matters on **pull requests from forks**,
where `GITHUB_TOKEN` is read-only by design and the comment simply will not post.

If you go looking for a way around that, the answer you will find is
`pull_request_target`. **Don't.** It runs with a writable token against the base
repository while checking out code the contributor controls, which turns "we
wanted to comment on a PR" into arbitrary code execution with your secrets. The
run summary is there precisely so you do not need it. Trazum asserts in CI that
it uses `pull_request_target` nowhere.

A passing report is collapsed; a failing one is not. A green table that stays
green on every push is the thing you learn to skip — and then you skip the red
one too.

Or by hand, if you already have the repo checked out:

```yaml
- run: npm ci && npm run build
- run: node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

### Reordering for the cache: `--reorder`

Trimming a prompt saves a few percent of its tokens. Moving its stable
instructions in front of the first placeholder changes the price of nearly all of
them, because prompt caching is a **byte-for-byte prefix match** — everything
after the first `{{placeholder}}` is re-read at full price on every call.

On a 1,178-token support prompt: **14 tokens cacheable as written, 1,174 after
rearranging the same content.** At 50,000 calls a month on Opus, that is the
difference between a $0 caching saving and a $184 one. No rule can compete with
it, and until now Trazum could only point at it.

```bash
trazum optimize prompts/support.txt --reorder --diff --calls 50000
```

```
Reordered for caching
  Moved 1 block (~1,001 tokens) ahead of the first placeholder.
  Cacheable prefix 11 → 1,016 tokens.
  Read the diff: this moved text rather than deleting it, so the question is
  whether the order mattered.
```

**It is opt-in, and deliberately not part of `aggressive`.** Every other
transformation here deletes text whose absence is local. This one moves text, and
order carries meaning: *"Summarise the text above"* is correct where it sits and
nonsense in front of the text it points at. `aggressive` promises "read the diff";
this asks a different question, so it cannot ride in on a level.

So the design is mostly about what it **refuses**:

- **A block that refers backwards stays put — and so does everything after it.**
  `above`, `below`, `the following`, `previous`, `earlier` and their equivalents
  in **English, Spanish, French, German, Portuguese, Italian, Dutch, Japanese and
  Chinese** pin a block. Moving a later block past a pinned one would change
  their order relative to each other, which is the same class of harm.
- **A prompt in a script with no phrase list is not rearranged at all.** Cyrillic,
  Arabic, Hebrew, Hangul, Devanagari, Thai and Greek: nothing moves, and the
  report says which script and why. Every refusal here rests on recognising a
  backward reference, and where Trazum cannot recognise one it has no business
  guessing — a single such instruction inside an otherwise English prompt is
  enough to stop it. Adding a language is adding an array to
  [`phrases.ts`](packages/core/src/phrases.ts).
- **Only whole blocks move.** Blocks are separated by blank lines, so a sentence
  is never severed from the paragraph that qualifies it, and the placeholder's own
  line travels with it (`Customer message: {{message}}` is one unit).
- **Nothing moves without a reason to.** No placeholder means the prompt already
  caches in full. Below the model's cacheable minimum the rearrangement buys
  nothing, and a diff that buys nothing is worse than no diff.

When it refuses, **the prompt comes back byte-identical** and the report says
which phrase stopped it:

```
Reordered for caching
  Nothing could safely move.
  Left 2 blocks where they were:
    refers back ("above"): Summarise the text above in one sentence.
    after a block that had to stay: Always answer in English.
```

That distinction is the point of reporting refusals at all: *"no saving here"* and
*"there was a saving and it was not safe to take"* are different answers, and only
the second one is actionable. The backward-reference list is deliberately
generous — a false positive costs a saving that was available, a false negative
silently changes what the prompt asks for. Every language's phrases are matched
against every prompt rather than detecting the language first: detection is one
more thing to get wrong, and the cost of checking a French prompt for German
phrases is a saving not taken, which is the direction this errs in anyway.

Redirect the output and stdout stays the prompt alone, as it does for every
command — but the move and the refusals go to **stderr** rather than vanishing. A
deletion is visible in the diff; a rearrangement you were never told about is not.

`--diff` compares against **what you wrote**, not against the rearrangement, so
the move is visible rather than hidden behind the deletions. With `--json` the
whole decision is in `reorder`, refusals included. `check` does not accept the
flag: it is a gate, and a gate does not rewrite.

### Prompts where they actually live

`check` reads `.txt`, `.md`, `.prompt` and `.tmpl`. Real prompts live in
TypeScript template literals and Python strings, so adopting Trazum used to mean
refactoring them out into files first — a change to your application as the price
of admission.

Mark one and it is governed where it sits:

```ts
// trazum:prompt support-system
export const SUPPORT = `You are a support agent for Acme.

Always answer in the customer's language.

Customer message: ${message}`;
```

```bash
trazum check src/ --max-tokens 2000
```

```
src/prompts.ts#support-system   43 / 2,000   OK
src/prompts.ts#classifier       23 / 2,000   OK
```

**It reads a marker, it does not guess.** Guessing which string in a file is a
prompt is a heuristic, and a heuristic inside a CI gate fails builds over log
messages. One line of comment buys never being wrong about what it picked up. The
marker works in `//`, `#`, `--` and `<!-- -->` comments, so TypeScript, Python,
SQL and YAML are all covered.

**`${x}` needs no special handling** — it is exactly the placeholder shape the
masking pass already protects, so an embedded prompt gets the same cache-prefix
analysis, the same protection from the rules and the same `--reorder` treatment
as a `{{x}}` template.

**Each prompt is budgeted on its own**, not summed into the file: a file holding
four prompts is four things to govern, and the code around them is not tokens the
model will ever see. The id is path-prefixed (`src/prompts.ts#support-system`, or
`src/prompts.ts:12` when the marker is bare) so existing `budgets` globs cover
embedded prompts without learning a new syntax — `src/**` matches, and so does the
full id if you want to budget one prompt tightly.

Source files are scanned automatically alongside prompt files; one with no marker
is skipped silently, because it was never something you asked to govern.

**The honest limit.** A prompt assembled by concatenation cannot be read this way:

```ts
// trazum:prompt assembled
const P = `You are ${role}.` + rules.join('
');
```

Its text does not exist until it runs. Trazum declines it, names the line, and
**fails the build** — you marked that prompt to have it governed, and it is not
being governed. A green build saying otherwise would be the same lie as "0
failures" from a run that measured nothing.

### Does the shorter prompt still work?

Every other number here is arithmetic. This one is not, so `trazum eval` runs
both versions over a set of inputs and compares the answers:

```bash
trazum eval prompts/system.txt --cases cases.txt --level aggressive
```

```
Agreement
  100%  the original prompt with itself  ← the yardstick
   64%  the optimised prompt with the original

  Diverges
    The model is consistent with itself and markedly less so with the rewrite,
    so the optimisation changed what the prompt asks for.
```

**The yardstick line is the whole point.** A model asked the same question
twice does not answer identically, so "diverged on 3 of 10 cases" means nothing
on its own — it might be better than the original manages against itself. So
the original runs twice per case first, and the rewrite is judged against the
model's own variance rather than a determinism it never had.

That costs three calls per case, and the count is printed before any of them
goes out. It exits 1 on `diverges`, so it can gate a pull request. When the
original cannot agree with itself often enough to judge anything against, it
says `inconclusive` rather than inventing a verdict.

Cases are one input per line (`#` comments ignored) or a JSON array.

#### Handing the run to your own harness

Agreement is the question Trazum is qualified to ask. It is not the question a
team needs answered before shipping — *theirs* is whether the classifier still
hits 94%, whether the JSON still parses, whether the refusal rate moved. Those
are assertions about your task, and Trazum has no business inventing them.

```bash
trazum eval prompts/system.txt --cases cases.txt --export promptfoo -o suite.json
```

That writes a [promptfoo](https://www.promptfoo.dev) suite in which **the only
variable is the prompt** — both versions, every case already wired to the right
template variable, the same provider on both sides — and leaves
`defaultTest.assert` for you.

It makes **no API call and needs no key**: the whole point is to hand the run
over. It also warns about the things that would quietly make the run
meaningless — a `${x}` placeholder promptfoo will not substitute, a prompt with
three placeholders and one value per case, a provider it had to guess an id for.

The one assertion it seeds is `is-json`, and only when the prompt shows a fenced
JSON block. That is not an opinion about your task: the prompt already demands
it.

It emits JSON rather than YAML, which promptfoo reads just as happily. This
package has no dependencies and is not acquiring a YAML emitter; a hand-rolled
one is a quoting bug waiting for the first prompt containing a colon, a tab, or
a line ending in a space.

### A whole repository of prompts

Point `check` at a directory and it governs all of them in one CI step, using
per-pattern budgets from `trazum.config.json`:

```bash
trazum check prompts/
```

```
prompts/ — 5 prompts

  OK      14 / 20   prompts/classify.txt
  OK      15 / 20   prompts/extract.txt
  OK       8 / 20   prompts/nested/notes.md
  OK       7 / 20   prompts/notes.md
  FAILED  30 / 15   prompts/system.txt
            Even optimised it does not fit (~20 tokens): content has to be cut by hand.

  1 of 5 over budget.
```

Two things it deliberately will not do quietly. **A file no pattern covers is
listed as `(no budget)`**, not skipped — otherwise a prompt can sit outside
every pattern for months while the report says everything is fine. And **a run
where nothing at all was budgeted is an error**, because "checked 40 files, 0
failures" from a run that measured nothing is the most misleading thing this
tool could tell you.

It does not follow symlinks, caps how deep and how wide it walks, and says so
when a cap stopped it early.

`--markdown-out <file>` writes the same report as GitHub-flavoured markdown, for
a step summary or a PR comment. `check`, `diff`, `rank` and `blame` all take it,
it is written before any exit code is set and independently of `--json`, and a
failure to write it is reported rather than turned into a failing build.

Every value that reaches a table cell is escaped by encoding `&`, `<`, `>` and
`|` as entities, so **there is no `|` character in the output at all** and a row
cannot split under any scanner. That matters most for `blame`: an author's name
and a commit subject are the least trusted strings Trazum renders — on a pull
request from a fork they are written by whoever opened it — and they land in a
table maintainers read. Paths and shas are `<code>`; names and subjects are not,
because a person's name typeset as a code span is a different kind of wrong.

### Charting it: `doctor --otlp-out`

```bash
trazum doctor --otlp-out metrics.json
curl -X POST -H 'content-type: application/json' \
     --data-binary @metrics.json "$OTLP_ENDPOINT/v1/metrics"
```

Five gauges — tokens per prompt, over-budget per prompt, the unbudgeted count, and
each advisory's monthly figure and prompt count — with the model and call volume as
resource attributes, because a dollar figure whose scenario is not stored beside it
is a number nobody can check three months later.

**Trazum writes the payload; it does not send it.** That is a decision. Pushing to a
collector means holding an endpoint and a credential, and this project has twice
shipped an SSRF where a URL reached `fetch` without being the URL that was checked.
A command that writes a file has no such failure mode, and the pipeline that already
holds your collector credential can post it in one line.

No `@opentelemetry/*` dependency either: the JSON encoding is a documented wire
format and this package has no runtime dependencies. Two rules in it fail silently
and are pinned by tests — **64-bit integers are JSON strings** (a collector reading
`timeUnixNano` as a double loses the last digits of every timestamp), and **money is
`asDouble`** (`asInt` would report `$4,912.40` as `4912`, and the chart would look
perfectly reasonable).

### A whole library, before and after: `diff --all`

```bash
trazum diff --all prompts-before/ prompts-after/ --calls 50000
```

```
old → new
3 prompts on both sides.

Every figure is after minus before, so positive means worse — the opposite of the rest of Trazum.

  +14  a.txt
    0  c.txt
  -11  b.txt

  only before  gone.txt
  only after   fresh.txt
  Not counted in the totals. A prompt that vanished is a question, not a saving.

+3 tokens across 3 prompts
+$0.7500/month at 50,000 calls with Claude Opus 5
```

Two decisions worth naming, because both are the kind that mislead quietly.

**A prompt on only one side is named, never counted.** A refactor that deletes a
prompt and one that renames it look identical from a token count. Folding the
deletion into the total would report a library getting cheaper when what actually
happened is that a file went missing and somebody has to say whether that was
deliberate.

**`--max-growth` applies per prompt, not to the total** — the same rule `check`
states about budgets. In the run above the total is `+3`, and `--max-growth 10`
still fails, because `a.txt` grew by 14 while `b.txt` shrank by 11. A gate on the
total would pass that and the prompt that doubled would ship unlooked-at.

### The whole workspace at once: `trazum doctor`

```bash
trazum doctor
```

```
. — 16 prompts
Priced on Claude Opus 5 at 50,000 calls a month.
Prices reviewed 2026-06-24.

Budgets
  ✗ 1 prompt is already over its budget — trazum check would fail on it
      prompts/big.txt  560 / 120  (prompts/**)
  ! 12 of 16 prompts have no budget, so nothing is watching them
      other/p1.txt
      ...
      and 4 more

What it would be worth fixing
  ~$4,912  This task may not need Claude Opus 5  16 prompts
  ~$3,070  If the work tolerates latency, use the Batch API  16 prompts
  ~$53.77  Move the stable instructions ahead of the first placeholder  1 prompt
           Below the cacheable minimum  16 prompts
           Your cost is in the output, not the prompt  16 prompts
```

**There is no score, and that is the whole design.** A health check invites one —
a number out of a hundred, a grade, a traffic light — and a number assembled from
weights nobody can reproduce gets quietly tuned until the output looks right.
`rank` refused it for the same reason.

So `doctor` invents nothing. **Every line is an advisory `trazum optimize` raises
on those prompts on its own, summed**, which means any figure here can be checked
against a single file — and there is a test that adds up the individual runs and
requires the total to match to the last float. "16 prompts only need a cheaper
model" is sixteen copies of one advisory, each with a file name you can go and
look at.

Two things it reports that no other command does: **which prompts no budget
pattern matches**, because an unwatched prompt is how the money got there in the
first place, and **which are already over budget** — before a red build tells you,
which is too late to think about it.

**It exits 0 even when it finds things.** `trazum check` is the gate. The model
recommendation is a keyword heuristic, and a build gated on a keyword heuristic
teaches people to re-run until it goes green, which costs more than the tool ever
saves.

It is offline and free, like the rules. Nothing here calls a model — which is why
it deliberately does *not* check prompts against their own `--suggest`
recommendations: that would be an LLM call per prompt, and `doctor` is the command
you run across forty files before deciding to spend anything.

### Project defaults: `trazum.config.json`

Every key is optional. Found by walking up from the working directory and
stopping at the repository root, so a subdirectory inherits the project's
settings.

```json
{
  "level": "safe",
  "usage": {
    "model": "claude-opus-5",
    "callsPerMonth": 50000,
    "avgOutputTokens": 300,
    "cacheHitRate": 0.9,
    "batchEligible": false
  },
  "budgets": {
    "prompts/**": 2000,
    "prompts/system.txt": 4000
  },
  "maxGrowth": 100,
  "extensions": [".txt", ".md"],
  "disable": ["intensifiers"],
  "locale": "en"
}
```

**Flags beat the config; the config beats the defaults.** A config that could
override an explicit flag would make every flag a suggestion. A boolean the
config switched on comes back off with `--no-batch`, so a setting written into
the repository is not one you have to edit the repository to escape.

Budgets resolve to the **most specific matching pattern**, and "specific" has a
stated definition rather than a felt one: most literal characters wins, longest
pattern breaks a tie. So `prompts/system.txt` beats `prompts/*.txt` beats
`prompts/**` beats `**`. The JSON report names the pattern each budget came
from — a file failing against a budget you cannot locate is a bug report, not a
fix. Pattern order in the file never matters.

**An invalid config is a hard error, including an unknown key:**

```
Error: trazum.config.json: unknown key "budgts" — did you mean "budgets"?
```

That is the whole design of the parser. A lenient one would restore defaults
silently, and for a budget the default is *no budget* — a green build for a
prompt nobody measured. Same reasoning as `--max-growh` being rejected rather
than ignored.

`maxGrowth` in the config arms the `diff` gate exactly as the flag does: a
repository that wrote the number down has opted in as deliberately as somebody
typing it. Absent both, growth alone still exits 0.

`--config <file>` skips the search. `locale` is the one setting the environment
outranks — see [Languages](#languages).

### Rewrites the rules cannot do: `--suggest`

`--llm` hands the model your whole prompt and takes the whole answer back. That
is all-or-nothing in both directions: when the result fails a safety check you
get **nothing**, and when it passes you get a wholesale rewrite you have to read
end to end before you can trust it.

`--suggest` asks a different question — *which exact phrases say something in
more words than they need?* — and the answer is a list you can judge on sight:

```bash
trazum optimize prompts/support.txt --suggest
```

```
Suggested rewrites
  3 phrases could say the same in ~24 fewer tokens:
    You should always make sure to → Always            ~6
    It is important to note that → (removed)           ~7 ×2
    in order to be able to → to                        ~5
  2 proposals did not survive checking against your prompt.
    the quoted phrase is not in the prompt — the model paraphrased what it was copying
  Nothing was changed. Add --apply-suggestions to take them.
```

Nothing is applied unless you ask. Eight surviving suggestions out of ten is a
useful result; a wholesale rewrite that fails one check is not.

**The model proposes; the prompt decides.** Every suggestion is checked against
your text before it is shown, and dropped rather than reconciled:

- **`before` must appear byte for byte.** A model asked to quote will sometimes
  tidy the punctuation as it goes, and the resulting suggestion is about text
  that does not exist.
- **It must not touch protected content.** Code, URLs, placeholders and tags are
  copied verbatim everywhere else in this project, and here too.
- **`after` must not introduce any.** A replacement that adds a `{{placeholder}}`
  is proposing new semantics, not shorter phrasing.
- **It must actually save tokens.** A rephrasing that costs the same is a change
  of style, and this is not a style guide.
- **Overlapping suggestions are dropped.** Applying two edits that share
  characters produces text neither of them described.

A phrase that occurs several times is rewritten everywhere it appears *outside*
protected content — the `×2` above — rather than the whole suggestion being
refused because one occurrence sits in a code block.

The model is asked about the **optimised** prompt, not the one you wrote:
re-finding what the deterministic rules already took would spend a call to be
told what Trazum knew for free.

`--apply-suggestions` takes them, and the headline figures move with the change.
On its own it is an error rather than a no-op, for the same reason a misspelled
flag is: a flag that runs silently and changes nothing is not an answer.

#### Not asking twice: `--cache-suggestions`

Running `--suggest` across a directory asks the same questions again on every
run, and most of the prompts have not changed since the last one.
`--cache-suggestions` answers those from disk:

```bash
trazum optimize prompts/support.txt --suggest --cache-suggestions
```

```
Suggestions: 1 from cache, 0 asked. Cached answers are what the model said
last time; --clear-suggestion-cache to start over.
```

On a re-run after editing two files out of forty, thirty-eight requests do not
happen. That notice goes to stderr, so it never lands in `--json`, and it is
always printed: a cache hit is a week-old answer from something that is not a
pure function, and it should never be silent.

Four decisions worth knowing about:

- **Off by default.** Every other model-touching feature here makes you ask
  twice. Answering from a stale response without being asked would be the one
  surprise in a tool built on not producing any.
- **The raw response is cached, not the checked result.** All five checks above
  run again on a hit, so an answer stored last week is judged by this week's
  rules rather than replaying an older version's verdict.
- **Seven days, then it is asked again.** Long enough for a working week, short
  enough that a model alias which started pointing somewhere new does not keep
  answering in the old model's words.
- **Mode 0600 in a 0700 directory** under `$XDG_CACHE_HOME/trazum/suggestions`
  (or `~/.cache`). The cache holds prompt text, which is the most sensitive
  thing this tool ever touches; a world-readable copy in a shared home would
  publish somebody's unreleased product behaviour to every account on the box.

`trazum --clear-suggestion-cache` empties it and says how much went. It needs no
command and reads no config — a cache you cannot empty because an unrelated
`trazum.config.json` fails to parse is a cache somebody deletes by hand,
guessing at the path.

**This is not the API's prompt caching, and that is not an oversight.** Marking
Trazum's suggest system prompt with `cache_control` would cache nothing: the
minimum cacheable prefix is 512 tokens on the most generous model and 4,096 on
others, that prompt is 291 tokens, and a prefix below the minimum is *silently*
not cached — no error, `cache_creation_input_tokens: 0`. Everything after the
system prompt is your text, which differs on every call, so there is no
placement of `cache_control` that helps. A test measures the prompt against the
published minima, so if that ever stops being true it stops loudly.

### Which prompt to fix first: `trazum rank`

Forty prompts in a repository, an afternoon to spend. Which one?

```bash
trazum rank prompts/ --calls 50000
```

```
4 prompts under prompts/, most recoverable first
Priced on Claude Opus 5 at 50,000 calls a month.

Recover  Tokens  Size  Tok/sen  Prompt
  $9.00      36   129     21.5  padded.txt
$0.2500       1   115     38.3  code-heavy.txt  — 83% is code or URLs, which cannot be trimmed
$0.2500       1   110      7.9  examples.txt  — 4 examples, ~90 tokens
$0.2500       1    35      7.0  dense.txt
```

**There is no complexity score, and that is deliberate.** A number out of a
hundred cannot be reproduced by hand, so it cannot be argued with — and the
weights that combine four measurements into one get tuned until the ranking
looks right, which is fitting the metric to the answer.

So the ordering is the one quantity that is not a matter of opinion: **what
optimising each prompt would actually recover**, obtained by running the
deterministic rules, not by evaluating a formula. The other columns explain that
position rather than producing it:

- **Tokens** — what comes back, printed beside the money on purpose. Three of
  the rows above recover a single token, which at 50,000 calls is twenty-five
  cents and no work worth doing. Rather than invent a cutoff nobody could check,
  the count sits next to the figure: `1` is self-evidently nothing.
- **Size** — the whole prompt.
- **Tok/sen** — tokens per sentence: verbosity independent of length, so a
  padded short prompt and a padded long one look alike. A sentence is a span
  ending in `.!?。！？` or a line that ends without punctuation, counted outside
  code and URLs.
- **Notes** — few-shot examples and what they cost, a restated output format,
  and the share of the prompt that is protected content. That last one matters:
  a prompt that is 83% code has far less headroom than its size suggests, and a
  ranking that hid it would send you to spend an afternoon on a file that cannot
  move.

Source files contribute their marked prompt, never the code around them. One
with no `// trazum:prompt` marker is skipped and counted, so a repository whose
prompts mostly live in code does not show a short list and look complete.

### Who made this prompt expensive: `trazum blame`

`diff` compares two versions you have in front of you. `blame` asks the question
a bill raises months later — **when did this get expensive, and what change did
it?**

```bash
trazum blame prompts/support.txt --calls 50000
```

```
prompts/support.txt — 12 revisions

Date        Tokens   Change  Author       Commit
2026-08-04   1,204     +310  Dana         9f2ac71  add escalation rules
2026-07-29     894      +47  Sam          31be0d0  clarify the tone
2026-07-11     847     +402  Dana         5c1d8e2  paste in the refund policy
2026-06-02     445    added  Sam          a0417bb  first pass

Net across this history: 445 → 1,204 tokens (+759, +171%).
That movement is +$1,138.50 a month on Claude Opus 5 at 50,000 calls.

Biggest single increase
  +402 tokens — Dana, "paste in the refund policy" (5c1d8e2)
```

Git already knows who changed a prompt and when. What it does not know is that
three lines added to a system prompt at 50,000 calls a month is a bill rather
than a diff. This puts both facts on the same line.

`--prompt <name>` tracks one marked prompt inside a source file, so refactoring
the imports around it is not counted as the prompt growing. Renames are
followed, because a cost history that restarts the day somebody tidied the
directory is telling you the wrong story. `--limit` walks further back (20 by
default, 500 at most — each revision is a `git show` and a token count).
`--json` gives the same history as data.

It reads history and nothing else: no writes, no network. Running git at all is
new for this project, so it happens in exactly one module,
[`git.ts`](packages/cli/src/git.ts), written as though it were the whole attack
surface — no shell, every path after a `--` separator so a file called
`--upload-pack=…` stays a filename, object names validated as 40 hex digits
before they are glued to anything, and a bounded timeout and buffer. Those rules
are asserted in `security.test.js` rather than promised in a comment.

Paths are taken literally after `--`, for the files whose names are the problem:

```bash
trazum blame -- --odd-name.txt
```

### Did this edit make it worse?

`optimize` answers "how much fat is in this prompt". `diff` answers the
question a pull request actually raises:

```bash
trazum diff prompts/system.txt prompts/system.new.txt --calls 50000
```

```
prompts/system.txt → prompts/system.new.txt

  20 → 57 tokens   +37 (+185%)
  +$9.25/month at 50,000 calls with Claude Opus 5

  New problems
    ! contradictory-instructions
```

**Read the signs carefully — they are the opposite of everywhere else here.**
Every other figure Trazum prints is a *saving*: before minus after, positive is
good. Every figure `diff` prints is a *delta*: after minus before, positive is
**bad**. That is deliberate, it is stated in the one place it applies, and the
negation happens exactly once in the code so the two conventions cannot leak
into each other.

It reports what the edit *broke*, not just what it cost — advisories that
appeared, rules that started firing — and the same in reverse when the edit
improved things.

It measures **the text as written**, not what the rules would leave. A pull
request changed the file on disk, so the file on disk is what you are being
asked about; optimising both sides first would hide a prompt that doubled in
length but happened to double in courtesy. `--optimized` switches the figures
to the post-rules text if you already run Trazum in your pipeline.

**The gate is opt-in.** Growth alone exits 0. `--max-growth 10` is what makes a
prompt that grew more than 10% exit 1:

```bash
trazum diff old.txt new.txt --max-growth 10
```

A tool that fails a build nobody armed gets removed from the pipeline rather
than fixed. And `--max-growh` is rejected with *"Did you mean --max-growth?"*
rather than ignored — a silently-swallowed gate flag means CI green while you
believe a limit is set.

### Web

```bash
npm run build:web
npm run dev:web        # http://localhost:3000
```

An interface for pasting a prompt, tuning the usage scenario, and reading the
word-by-word diff, the saving and the advisories. Includes optimisation history
stored only in the browser — nothing leaves your machine.

**Reordering for the cache is available here too**, behind a checkbox rather than
a level, with the same warning the CLI prints and the same refusals reported. It
is the largest saving Trazum can make, and it should not need a terminal to find.

**And there is a Compare tab.** Two versions of a prompt, and what the edit did:
the token delta, what it costs per month, and which advisories and rules it
introduced or resolved. Every figure is `after - before`, so **positive means
worse** — the opposite of the rest of Trazum — and the page says so above the
numbers rather than beside them, because a reader arriving from Optimise has the
opposite convention already loaded.

`Compare what the rules would leave` is off by default and the default is the
interesting half: your edit changed the text as written, so the text as written is
what you are being asked about. Trimming both sides first hides a prompt that
doubled in length and happened to double in courtesy.

The usage scenario is shared between the two tabs. Setting 50,000 calls on one and
reading 10,000 on the other would make their answers incomparable while looking
like they were about the same workload.

**So are phrase-level rewrites.** Two switches: one asks the model for
suggestions, the second takes them. They are listed above the saving, one line
each — `You should always make sure to → Always  ~4 ×2` — with a count of how
many the checks threw out, because "four did not survive" is the useful fact and
which four is noise unless you are debugging the model. Nothing is applied unless
the second switch is on, and turning the first one off clears it.

The HTTP API behind it is public and small:

```bash
# Metadata: models, and whether an LLM is configured on the server
curl https://your-deployment/api/optimize

# Optimise
curl -X POST https://your-deployment/api/optimize \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "Please, in order to help me, analyse {{x}}. Thanks!",
    "level": "safe",
    "locale": "en",
    "reorder": false,
    "suggest": false,
    "applySuggestions": false,
    "usage": { "model": "claude-opus-5", "callsPerMonth": 20000, "avgOutputTokens": 300 }
  }'
```

`reorder`, `suggest` and `applySuggestions` are honoured only on a literal `true`
— a string or a number is ignored, because the body is untrusted and a truthy
check would let `"false"` rearrange somebody's prompt or hand it to a model for
rewriting.

When `reorder` is set, the response carries a `reorder` object with what moved and
what was declined, and `original` stays the text you sent so a diff shows the move
rather than hiding it behind the deletions.

When `suggest` is set, the response carries a `suggestions` object — every
proposal that survived the checks, everything rejected and why, and `applied`
saying whether the text you are holding was rewritten. It is present even when the
model proposed nothing, so "nothing was found" is distinguishable from "you did
not ask". Needs an LLM configured, and runs its own call.

`applySuggestions` without `suggest` is a **`400`**, not a no-op. On its own it
would have returned a complete report and quietly applied nothing, which is the
same failure as a misspelled field being accepted — and the endpoint already
refuses those for `disableRules` and `usage.model`. The refusal comes before any
call to the model, so a malformed request never costs one.

```bash
# Compare two versions: what did this edit cost?
curl -X POST https://your-deployment/api/compare \
  -H 'content-type: application/json' \
  -d '{
    "before": "Classify {{x}}. Answer with the category only.",
    "after": "Please kindly classify {{x}}. Thank you!",
    "optimizeBoth": false,
    "usage": { "model": "claude-opus-5", "callsPerMonth": 50000 }
  }'
```

`POST /api/compare` answers a different question from `/api/optimize`, which is
why it is a different route. **Every figure it returns is `after - before`, so
positive means worse.** `tokenDelta`, `deltaPct`, `monthlyDeltaUsd` and
`perCallDeltaUsd` all follow that convention; `rules` come back with titles and
`advisories` as ids. `optimizeBoth` is honoured only on a literal `true`, and a
missing `before` and a missing `after` are told apart — one message for two fields
leaves the caller guessing.

Both endpoints are rate limited (30/min per IP), with a bucket each: sharing one
would let a burst of comparisons spend somebody else's optimise budget.

`/api/optimize` will not fetch an LLM endpoint
a caller names: a request may only **select** one from
`TRAZUM_ALLOWED_LLM_ENDPOINTS`, a comma-separated list the operator sets on the
server, and what gets fetched is the entry from that list. The list is empty by
default, so out of the box a deployment calls only the LLM its own environment
configured (`TRAZUM_LLM_BASE_URL`) — or none at all. `GET /api/optimize` returns
the list so the UI offers exactly what the server will accept.

That is stricter than filtering the URL, and deliberately so: the filter reads a
hostname, and a hostname an attacker registered can resolve wherever they like.
See [SECURITY.md](SECURITY.md) for the full reasoning.

### Signing in (optional)

Off by default, and a deployment that leaves it off is the tool this README has
been describing all along: paste a prompt, get an answer, nothing remembered.

Set three variables and the header grows a **Sign in** button:

```sh
TRAZUM_GITHUB_CLIENT_ID=Iv1.xxxx
TRAZUM_GITHUB_CLIENT_SECRET=xxxx
TRAZUM_PUBLIC_URL=https://trazum.example
```

A fourth, `TRAZUM_DATABASE_URL`, points it at any Postgres so the sign-in
survives a restart. Without it sessions live in memory, which works and says so:
the header renders "temporary session", because on a platform that runs more
than one instance the alternative is being signed out at random with no
explanation.

Trazum asks GitHub for `read:user` and nothing else, and **never stores the
access token** — it is exchanged, used once to read your login and avatar, and
dropped. Session cookies are opaque random tokens stored only as their SHA-256,
so a database dump is a list of hashes rather than a list of live logins.

Misconfigure any of it and sign-in simply stays off: no button, and
`/api/auth/*` answers 503 naming the variable to set.

Signed in, a **Library** tab appears: prompts you saved and every version of
each. History is append-only, saving unedited text saves nothing and says so,
and token counts are recomputed on read rather than stored — two versions priced
by two different estimators would make the trend line move when the prompts did
not.

On the Compare tab, **Create share link** publishes a comparison at `/c/<token>`
that anyone holding the URL can read without signing in — for showing a
colleague what a prompt edit cost. Links expire after thirty days by default,
can be revoked, are kept out of search engines two different ways, and say
plainly what they publish *before* the button rather than after.

Set `TRAZUM_ADMINS` and `/admin` shows what every prompt on the deployment adds
up to — input tokens, and how many of them the rules would remove, measured by
running them. Deliberately **not** a spend report: Trazum has never seen a bill,
so the page says so above the first number, shows no score, and shows prompt
names but never anybody's prompt text. Unset means the page does not exist.

Every share link doubles as a **README badge** at `/badge/<token>.svg` — the
token change, recomputed on every load rather than frozen the day it was made.
The image is inert: no script, no external font, nothing fetched, and no prompt
text ever reaches it.

[docs/accounts.md](docs/accounts.md) has the setup, the schema, every security
decision and why, the limits, and an explicit list of what is **not** covered.

### Deploying to Vercel

The repo is an npm workspaces monorepo; Vercel handles it with no special
configuration:

1. Import the repository in Vercel.
2. **Root Directory**: `apps/web`. The rest — installing from the workspace
   root, building `@trazum/core` via `prebuild` — is automatic.
3. Optional variables: `TRAZUM_LLM_*` to offer the LLM pass without users
   supplying keys, `NEXT_PUBLIC_POSTHOG_KEY` for analytics, `TRAZUM_GITHUB_*`
   and `TRAZUM_PUBLIC_URL` for sign-in.

Vercel runs more than one instance, so if you enable sign-in there, set
`TRAZUM_DATABASE_URL` as well. Without it each instance keeps its own sessions
in memory and a browser is signed in against one and signed out against the
next.

### Library

```ts
import { optimize, refineWithLlm, openAiCompatible } from '@trazum/core';

const result = optimize(prompt, {
  level: 'safe',
  locale: 'en',
  usage: {
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 500,
    cacheHitRate: 0.9,
    batchEligible: false,
  },
});

console.log(result.optimized);
console.log(result.savings.monthlySavingsUsd);
```

`reorderForCache` is the API behind `--reorder`. It returns the original text
unchanged when nothing can safely move, and always reports what it declined and
why — a saving Trazum chose not to take is one the caller cannot evaluate:

```ts
import { reorderForCache } from '@trazum/core';

const r = reorderForCache(prompt, { minPrefixTokens: 1024 });  // the model's minimum

r.text;                 // the rearrangement, or `prompt` byte-for-byte
r.tokensMoved;          // moved out of paid-every-call into the prefix
r.prefixTokensBefore;   // 14
r.prefixTokensAfter;    // 1174
r.declined;             // [{ reason: 'backward-reference', phrase: 'above', text }]
```

`minPrefixTokens` is a bar on the **resulting prefix**, not on the amount moved.
A prefix below the model's minimum caches nothing at all, so a rearrangement that
does not clear it buys nothing — but a head that already clears it gains from any
block that joins it, however small.

`comparePrompts` is the API behind `trazum diff`. Note the sign: everything it
returns is `after - before`, so **positive means worse** — the opposite of
`result.savings`, and the reason it lives in its own module.

```ts
import { comparePrompts, formatSignedUsd } from '@trazum/core';

const change = comparePrompts(oldPrompt, newPrompt, { usage });

change.tokenDelta;                      //  +37   (grew)
formatSignedUsd(change.monthlyDeltaUsd) //  "+$9.25"
change.advisories.appeared;             //  ['contradictory-instructions']
change.rules.noLongerFiring;            //  what the edit cleaned up
```

**Two entry points.** `@trazum/core` is browser-safe and imports no Node
builtins — that is enforced by a test that walks the import graph, not by
convention, because the web app bundles it and one `node:fs` import anywhere in
that graph fails the build. Anything that reads the filesystem lives on
`@trazum/core/node`:

```ts
import { loadConfig, walkPrompts } from '@trazum/core/node';

const { config, path } = await loadConfig();   // null path = none found
const { files, truncated } = await walkPrompts('prompts/');
```

`parseConfig` and `budgetFor` are pure functions of their arguments, so they sit
on both.

---

## Languages

Two things that sound like one and are not: **the language of the report**, and
**the language of the prompt**.

### The report

English by default, Spanish as a second locale.

**The locale changes the report, never the optimisation.** The same prompt in
any locale produces the same optimised prompt, the same token counts and the
same advisory ids — only the prose differs. That is enforced by tests.

### The prompt

The trimming dictionaries cover **English, Spanish, French, German, Portuguese,
Italian and Dutch**. `--reorder`'s backward-reference lists cover those plus
**Japanese and Chinese**, and refuse outright on Cyrillic, Arabic, Hebrew,
Hangul, Devanagari, Thai and Greek.

When no rule fires, the report says which languages it covers:

```
No rule found anything to trim.
The phrase dictionaries cover English, Spanish, French, German, Portuguese,
Italian and Dutch. A prompt in another language is not necessarily efficient —
it may just be one Trazum cannot read yet.
```

That line exists because for a long time it was missing, and a French prompt came
back with "No rule found anything to trim" — which reads as *your prompt is
already efficient* and meant *I do not speak your language*. Stated rather than
detected: guessing a prompt's language is one more thing to get wrong, and naming
the coverage cannot be.

**Adding a language is adding entries to
[`phrases.ts`](packages/core/src/phrases.ts)**, and one rule about doing it: a
dictionary translated word by word looks complete and changes meaning. Spanish
has `muy` and deliberately not `mucho`. The first pass at the other five lost that
distinction and shipped `muito`, `molto` and `heel` — each an intensifier *and* a
quantifier, so `Hai molto tempo per rispondere` became `Hai tempo per
rispondere`: "you have much time" turned into "you have time". A test keeps those
three out, and another counts entries per language per dictionary, because a
behavioural test passes on whatever the fixture happens to contain.

```bash
trazum optimize prompt.txt --locale es      # flag
TRAZUM_LOCALE=es trazum optimize prompt.txt # environment
```

The CLI resolves `--locale`, then `TRAZUM_LOCALE`, then `LC_ALL`/`LC_MESSAGES`/
`LANG`, and last `locale` in `trazum.config.json`. The web app negotiates
`Accept-Language` on the server and offers a switcher that remembers your
choice. The library takes `locale` directly.

**The config comes last on purpose**, and it is the one setting where it does. A
repository writing `"locale": "es"` is choosing the language its CI logs read
in, where `LANG` is usually unset or `C`. A contributor whose own machine says
otherwise should still get their own language. The project sets the floor; the
person at the keyboard wins.

Two things are deliberately not localised: **USD amounts** stay formatted as
`en-US`, because they come from a US price list and a report shared across a
team should show the same number to everyone; and **rule and advisory ids**,
which are stable across locales precisely so you can branch on them.

Adding a language is a message catalogue per package — see
[CONTRIBUTING.md](CONTRIBUTING.md). Note that
`packages/core/src/phrases.ts` is a separate matter: those dictionaries are the
vocabulary Trazum looks for *inside* prompts, and are unrelated to the language
of the report.

---

## Connecting your own LLM

The provider is pluggable. Configure it by environment:

```bash
TRAZUM_LLM_PROVIDER=openai               # openai (default) | anthropic | gemini
TRAZUM_LLM_BASE_URL=https://your-llm/v1  # without /chat/completions
TRAZUM_LLM_MODEL=model-name
TRAZUM_LLM_API_KEY=...
```

**`openai` is not "OpenAI", it is the wire format** — and that is why this list
is short while the coverage is not. Set a base URL and it works with anything
speaking that shape:

| Provider | `TRAZUM_LLM_BASE_URL` |
|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` |
| LiteLLM (your own proxy) | `http://localhost:4000/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together | `https://api.together.xyz/v1` |
| Fireworks | `https://api.fireworks.ai/inference/v1` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` |
| DeepSeek | `https://api.deepseek.com` |
| Mistral | `https://api.mistral.ai/v1` |
| Ollama, vLLM, LM Studio | whatever you are hosting |

**Bedrock and Vertex** are configured in code rather than by three environment
variables, because their credentials are not a bearer token:

```ts
import { bedrockProvider, vertexProvider } from '@trazum/core';

bedrockProvider({ model: 'anthropic.claude-v2:1', region: 'us-east-1', accessKeyId, secretAccessKey });
vertexProvider({ serviceAccount: JSON.parse(keyJson), project: 'p', location: 'us-central1' });
```

Bedrock goes through **Converse**, not `InvokeModel` — `InvokeModel` takes each
model family's own body shape, so supporting "Bedrock" through it means a 400 for
every model nobody thought about. Signed with SigV4 by hand; Vertex's
service-account JWT is signed by hand too. Both on WebCrypto, both because this
library has zero runtime dependencies and the AWS and Google SDKs are two
hundred packages between them to authenticate one request.

**Neither has been run against the real service.** The signer is tested against
the canonical strings and against an independent implementation of the key
chain; the first real call is what proves it.

`anthropic` and `gemini` are separate because their APIs are separate documents,
not because they are favoured. Gemini's needs its own handling for a reason
worth knowing: **a blocked prompt, a truncated answer and an empty candidate all
come back as HTTP 200**, so a client that checks only the status code treats a
half-written rewrite as a finished one. Trazum refuses all three.

Deploying the web app for other people to use? One more, and only if you want
visitors to be able to pick:

```bash
# Comma-separated. Empty by default, which means the server calls only the
# endpoint above. A request can select from this list; it can never name a host.
TRAZUM_ALLOWED_LLM_ENDPOINTS=https://api.openai.com/v1,https://api.deepseek.com
```

That is enough for `--llm` in the CLI and the checkbox in the web app. The
OpenAI-compatible format covers vLLM, Ollama, OpenRouter, LM Studio and most
internal gateways.

If your endpoint speaks neither format, `customProvider` lets you define the
request and the response by hand:

```ts
import { customProvider, refineWithLlm } from '@trazum/core';

const provider = customProvider({
  name: 'internal',
  model: 'my-model',
  request: ({ system, user }) => ({
    url: 'https://your-endpoint/generate',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.MY_KEY! },
      body: JSON.stringify({ instructions: system, input: user }),
    },
  }),
  extract: (body) => (body as { output: string }).output,
});

const withLlm = await refineWithLlm(result, provider);
console.log(withLlm.llm.applied, withLlm.llm.rejectedReason);
```

An LLM candidate is **rejected** when it is empty, alters code/URLs/
placeholders, is not shorter, or keeps under 25% of the tokens — that is a
summary, not a compression.

`--llm` also reviews your few-shot examples, in a second call, and only when
there are at least two. This is the one thing the deterministic detector
deliberately will not guess at: two examples teaching the same lesson in
different words score too close to two genuinely distinct ones to separate by
word overlap. The review reports; it never edits.

---

### Prices that are not a table somebody typed: `--pricing-live`

The bundled catalogue is stale the day after it is written, and it only covers
the providers whoever wrote it reached for. `--pricing-live` takes today's
figures from OpenRouter instead — hundreds of models across dozens of providers,
which covers OpenAI, Anthropic, Google, Mistral, Groq, Together, Fireworks,
DeepInfra, Cerebras, DeepSeek, xAI and the rest of the open-weight hosts in one
request.

```bash
trazum optimize prompts/support.txt --pricing-live --model deepseek/deepseek-chat
```

**Opt-in, because it is a network call.** The deterministic core never makes one:
the CLI fetches, and hands the library a value. A `--pricing` file wins over it,
because somebody who wrote prices down meant them.

**What that feed cannot tell you, Trazum does not claim.** It publishes price and
context window. It has no opinion on whether a model has prompt caching or the
minimum prefix it caches at — and that is the input to the largest saving here.
So models it adds get **no caching advice at all** rather than a guess, and
`trazum models` shows a dash instead of a number:

```
Model                        In    Out  Context  Cache min
deepseek/deepseek-chat     0.27   1.10     64K          —
```

The two available lies are symmetrical and both worse than silence. Claim caching
works and Trazum offers a saving that cannot be bought at any price; claim it
does not and Trazum hides the biggest saving there is.

## Every model you pay for by the token

Trazum prices Anthropic, OpenAI, Google, Moonshot, DeepSeek, xAI and Mistral:

**Every report says how old the prices are** — `Prices reviewed 2026-06-24 (46 days
ago)` — because every dollar figure descends from that list, and a date alone makes
you subtract against today to learn whether to trust it. There is deliberately no
"stale" threshold: that would be a number nobody could check, and the age is the
fact.

```bash
trazum optimize prompt.txt --model gpt-5 --calls 50000
trazum optimize prompt.txt --model kimi-k2
trazum models                      # the whole table, with each provider's terms
```

Everything that reads the prompt is provider-agnostic already — the rules, the
protection pass, `--reorder`, the contradiction and example detectors all operate
on text. What differs is the money, and **that is not one set of numbers**:

| | |
|---|---|
| Cache read | 10% of input on Anthropic, OpenAI and Moonshot; **25%** on Google and xAI |
| Cache write | 125% of input on Anthropic; 100% elsewhere |
| Cache minimum | 512 on Anthropic, 1,024 on OpenAI and Moonshot, 2,048 on Gemini Pro |
| How caching starts | You mark the prefix on Anthropic and Google; it is **automatic** on OpenAI, Moonshot and DeepSeek |
| Batch API | 50% on Anthropic, OpenAI, Google and Mistral; **none at all** on Moonshot, DeepSeek and xAI |
| Prompt caching | **None at all** on Mistral |

Those last two rows are why the multipliers had to move onto the model. As global
constants they offered a batch discount to providers that do not sell one and a
caching saving to a model that has no cache — invented savings, which is the one
thing this tool must not print. A provider with no batch API now gets no batch
advisory, and no discount even if you tick the box: `batchEligible` describes the
work, not what the provider sells.

**A cheaper model means a cheaper model, not a different supplier.** The downgrade
advisory only ever suggests models from the provider you are already on. Dropping
a tier is a one-line change; switching vendor is a migration, and this advisory is
a keyword heuristic — it has no business recommending that you change supplier.

**Not covered: Cursor, Claude Code, Codex and other subscriptions.** They do not
bill per token, so "saves $184/month" would be false for anyone inside their plan.
The honest saving there is context-window and rate-limit headroom, which is a
different report rather than a row in this table.

### Optimising a prompt that lives in code

```bash
trazum optimize src/prompts.ts --prompt support --diff
```

It reads the marked prompt and leaves the file alone. **Pointed at an unmarked
source file it refuses**, because optimising TypeScript as if it were prose does
not produce a worse prompt — it produces broken code, and `-o` would write that
back over your file. When a file holds several marked prompts it asks which one
rather than taking the first.

The model comes from the code too, so a file calling OpenAI is priced against
OpenAI. `--model` and `trazum.config.json` still win: flags beat config, config
beats detection, detection beats a built-in default that has no idea which
provider you use.

### Which provider is this prompt even going to?

Since Trazum prices seven providers, defaulting to Claude became a **wrong
number**: a file calling OpenAI was billed against Claude Opus 5 without comment.
`trazum where` reads what the code already says.

```bash
trazum where src/prompts.ts
```

```
Running inside
  Claude Code (CLAUDECODE)
  Claude Code bills by subscription, not by the token. A monthly saving below is
  arithmetic about tokens, not money you get back — what you gain is context
  window and rate-limit headroom.

Prompts in src/prompts.ts go to
  anthropic · Claude Sonnet 5
    line 2  model-literal: claude-sonnet-5
    line 1  sdk-import: @anthropic-ai/sdk

Priced as
  Claude Sonnet 5 (read from the source)
```

**Every answer names the line it came from.** A detection that cannot be checked
is a guess, and the dollar figure that follows from it would be a guess too.

Four kinds of evidence, strongest first: `model=` on a `trazum:prompt` marker,
a quoted model id, a base URL, an SDK import. A stronger kind overrides a weaker
one — **a base URL beats the SDK it was pointed at**, because Moonshot, DeepSeek,
xAI and Groq are all called through the OpenAI SDK with a different `base_url`,
and calling that a contradiction would refuse to price an ordinary client.

**It refuses when a file names two providers.** Two answers is not a weaker
version of one answer, and picking silently is how somebody budgets against the
wrong provider for a month. Both are named and nothing is assumed.

Detection sits between config and defaults in the usual layering: **a flag beats
config, config beats detection, detection beats the built-in default.** Reading
the code is better than assuming, and worse than being told.

With no file it reports only the host — useful because that is what decides
whether a monthly saving is money at all:

| Host | Bills |
|---|---|
| Claude Code, Codex, Cursor | subscription — the saving is context and rate-limit headroom, not cash |
| GitHub Actions, CI | per token |
| VS Code, plain terminal | unknown, and it says so rather than guessing |

### On a subscription, there is no bill to reduce

Inside Claude Code, Codex or Cursor you pay the same whatever your prompt costs.
A monthly figure there is arithmetic about tokens dressed as money, so Trazum
stops printing one and reports what is actually scarce:

```
What this buys on Claude Code
  Claude Code bills by subscription, so there is no bill to reduce and no
  monthly figure to print.

  1,001 tokens back, every call.
  Context window: 12.4% → 2.1% of Claude Opus 5's 1,000,000 tokens — room the
  conversation gets instead.
  Pass --cost if this prompt is bound for a metered API.
```

The context window is the real currency in an agent: every token the system
prompt holds is one the conversation cannot.

**Advisories whose only pitch is money go too.** "Use a cheaper model" is not
weaker advice on a flat plan — it is not advice. `model-downgrade`, `batch-api`,
`output-dominated` and `promo-pricing` are dropped; caching, context overflow,
contradictions and redundant examples stay, because latency, headroom and
correctness are still real.

**The escape hatch matters.** The host says where *Trazum* runs, not where your
prompt goes — somebody editing a production prompt inside Cursor wants the
dollars, and `--cost` gives them back without leaving the editor. `--tokens-only`
forces the other direction anywhere.

## Token counting

By default Trazum uses a **dependency-free heuristic estimator**: it classifies
by character type (words, numbers, punctuation, CJK, emoji). It targets ±15% on
ordinary prose, and it is built for comparing two versions of the same prompt,
which is what it is used for.

**The band is a Claude number.** The estimator is tuned against Claude's
tokenizer, and other families tokenize differently. When you price against a
non-Anthropic model the report says so instead of printing a band that was never
measured for it:

```
1,021 → 1,020   -0.1% (estimated — the counter is calibrated on Claude, not GPT-5)
```

Use `--exact-tokens` for figures you can budget from.

**And even for Claude, that band is a design target rather than a measurement.** It is printed on every
report and every dollar figure descends from it, and nothing in this repository
establishes that it holds — the estimator's only accuracy-adjacent tests were
zero-on-empty, monotonic growth, and not-`NaN`. It is also stated as one number
for all text, which is a second assumption: the estimator treats CJK, digits and
punctuation quite differently from words, and there is no reason those should
land on the same accuracy.

A corpus covering those types is committed, along with the harness that measures
it against the official counting endpoint:

```bash
ANTHROPIC_API_KEY=... npm run measure:tokens
```

`token-band.test.js` asserts the band per text type as soon as that ground truth
exists, and refuses to pass quietly until then. It also carries a digest of the
corpus, so numbers describing text that has since been edited fail rather than
mislead.

For exact numbers, the official counting endpoint does not charge tokens:

```bash
ANTHROPIC_API_KEY=... node packages/cli/dist/index.js optimize prompt.txt --exact-tokens
```

Or from the library:

```ts
import { countTokensAnthropic, withExactTokenCounts } from '@trazum/core';

const exact = await withExactTokenCounts(
  result,
  countTokensAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-5' }),
);
```

---

## Limitations, stated plainly

- **Savings are projections, not billing.** They are computed over the scenario
  you describe (calls/month, output tokens) using the table in
  `packages/core/src/pricing.ts`. Check that table before budgeting:
  `PRICING_LAST_REVIEWED` tells you when it was last updated.
- **Output tokens are held constant in the calculation.** A shorter prompt
  often produces somewhat shorter answers, but that depends on the task and
  cannot be promised. The saving shown comes from input only.
- **The model recommendation is a keyword heuristic**, not a judgement about
  answer quality. Measure the difference with your own evaluations before
  dropping a tier in production.
- **The aggressive level can change nuance.** It removes intensifiers, hedges
  and self-verification requests. Read the diff before applying it.
- **Amazon Bedrock and Vertex AI pricing is set by each partner** and is not
  the pricing in this table.

---

## Layout

```
packages/core/     dependency-free library (rules, tokens, pricing, LLM)
  src/segment.ts     isolation of code, URLs, templates and XML
  src/rules.ts       deterministic rules engine
  src/phrases.ts     phrase dictionaries (data, multilingual)
  src/pricing.ts     model and pricing catalogue
  src/structure.ts   contradictions and repeated few-shot examples
  src/similarity.ts  shared near-duplicate scoring
  src/advisories.ts  caching, batch, model and context advisories
  src/reorder.ts     moving blocks in front of the first placeholder
  src/compare.ts     comparePrompts — after minus before, positive is worse
  src/profile.ts     the measurements behind `rank`, and no score
  src/suggest.ts     phrase-level rewrites, and the checks each one passes
  src/promptfoo.ts   exporting a suite for somebody else's assertions
  src/extract.ts     prompts marked inside source files
  src/detect.ts      which provider a file actually calls
  src/llm.ts         pluggable providers and safety checks
  src/net.ts         endpoint validation, the allowlist, safe fetch defaults
  src/i18n/          message catalogues (report language)
packages/cli/      dependency-free CLI
  src/markdown.ts    the report as markdown, and the three escapers
  src/git.ts         the only module here that runs another program
apps/web/          Next.js (App Router) — Optimise and Compare
action/            the packaged GitHub Action that comments on pull requests
scripts/           release notes, and the token-band measurement harness
```

## Updating prices

`packages/core/src/pricing.ts` is the single source of truth. When you change
it, update `PRICING_LAST_REVIEWED` too. The test suite checks the table stays
coherent (output dearer than input, promotions with an expiry date, plausible
context windows).

## Analytics and privacy

**There are two configurations and they have different answers.** Both are stated
here because the short version was wrong: this section said prompts are never
stored on any server, without qualification, for several releases after the
prompt library shipped and made that conditional.

- **Signed out — the default.** Nothing about a prompt is written server-side.
  Optimisation is synchronous: the response carries the result, and history lives
  in the browser's localStorage. This is what a deployment does with no
  `TRAZUM_GITHUB_CLIENT_ID` configured, and signing in cannot be switched on by a
  visitor.
- **Signed in, with the prompt library.** Saving a prompt writes its text to
  Postgres — `trazum_prompt_versions.text`, one row per version, because a library
  that cannot show you yesterday's wording is not a library. Nothing is written
  until you save, and the database is the operator's rather than ours.
  [docs/accounts.md](docs/accounts.md) is the full account, including the row
  level security the schema turns on and why it uses `ENABLE` and not `FORCE`.
- Analytics (PostHog) is **off by default**. It only switches on if the
  operator sets `NEXT_PUBLIC_POSTHOG_KEY`, and even then it never sends prompt
  content — only aggregate metrics (reduction percentage, level, model,
  locale). Setting that key also adds the analytics host to `connect-src` in
  the Content-Security-Policy, because otherwise the browser blocks every
  request it makes and the page gives no sign of it. With no key the policy is
  unchanged: `connect-src 'self'`, one origin.
- `NEXT_PUBLIC_POSTHOG_HOST` overrides the destination, defaulting to
  `https://eu.i.posthog.com`. It must be `https` and only its origin reaches
  the policy — a value that does not parse widens nothing.
- LLM keys entered in the UI are used for that request and discarded; they are
  neither logged nor persisted.

## Roadmap and contributing

[ROADMAP.md](ROADMAP.md) covers what is planned and why.
[CONTRIBUTING.md](CONTRIBUTING.md) covers adding a rule or a language, and
[docs/authoring-rules.md](docs/authoring-rules.md) is the full walkthrough for a
rule.
[VERSIONING.md](VERSIONING.md) covers what counts as public API.
