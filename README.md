<div align="center">

# Trazum

### Most of your LLM bill is not the prompt. Trazum finds where it is.

**A deterministic cost analyser for prompts** — offline, free, same answer every
time. It reports fourteen findings priced in dollars per month: caching you are
not getting, a model tier you may not need, a schema you pay to describe on
every call. Shortening the prompt is one of them, and it is rarely the biggest.

[![CI](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-3c873a.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2f855a.svg)](#layout)

<img src="docs/assets/demo.svg" alt="trazum optimize on a wordy support prompt: 238 tokens down to 142 (-40.3%), $24.00/month saved by the rules — and an advisory pointing at $528.40/month, 22× more" width="760">

*Real output, transcribed. Read the last two lines: the rules recovered $24.00
a month, and the advisory above them is worth $528.40 — **22× more**. That gap
is the entire argument for this tool.*

</div>

**The prompt is the part everyone looks at, and usually the cheap part.** In the
run above, forty percent of the text came out and it moved 3.5% of the bill.
What moved the rest was a question nobody was asking: does this task need the
model it is running on?

**Every figure has a receipt.** Thirteen advisories, each priced per month and
reproducible on a single file — caching you are not getting, work that could go
through the Batch API, a schema costing tokens on every call to describe a shape
the request could carry as a parameter. Underneath them, twelve deterministic
rules that shorten the text itself: same input, same output, free, offline, and
never touching code, URLs or placeholders. On top, an **optional LLM pass** for
the compression rules cannot do, through whichever provider you configure, which
never runs unless you ask.

```
                      ┌──────────────┐
                      │ @trazum/core │   the library: rules, tokens, pricing
                      └──────┬───────┘   zero dependencies, browser-safe
         ┌─────────────┬─────┴────────┬──────────────┐
   @trazum/cli    @trazum/mcp    @trazum/web       action/
 fourteen commands MCP server      Next.js     comments on pull requests
                 for your agents
```

## The fourteen commands

| Command | What it answers |
|---|---|
| [`trazum optimize`](#cli) | What can come out of this prompt, and what is that worth a month? |
| [`trazum check`](#cli) | Does this prompt fit its token budget, and has the repository drifted past its recorded baseline? *Exits 1 when either fails — this is the CI gate.* |
| [`trazum baseline`](#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate) | What does this repository's prompts cost right now? *Records it, to commit.* |
| [`trazum diff`](#did-this-edit-make-it-worse) | What did this edit cost? |
| [`trazum rank`](#which-prompt-to-fix-first-trazum-rank) | Of these forty prompts, which is worth an afternoon? |
| [`trazum doctor`](#the-whole-workspace-at-once-trazum-doctor) | What is wrong across the whole workspace? |
| [`trazum prune`](#which-few-shot-examples-earn-their-tokens-trazum-prune) | Which few-shot examples earn their tokens? Measured, and it asks before spending. |
| [`trazum blame`](#who-made-this-prompt-expensive-trazum-blame) | Who made this prompt expensive, and when? |
| [`trazum eval`](#does-the-shorter-prompt-still-work) | Does the shorter prompt still do the job? |
| [`trazum where`](#prompts-where-they-actually-live) | Which prompts are hiding inside my source files? |
| [`trazum models`](#every-model-you-pay-for-by-the-token) | What does each model cost, and what is its cache minimum? |
| [`trazum profile`](#where-the-money-actually-went-trazum-profile) | Where did the money actually go? *Reads a usage log, not a prompt.* |
| [`trazum route`](#is-the-cheaper-model-good-enough-trazum-route) | Is the cheaper model good enough? *Measured, and it asks before spending.* |
| [`trazum rules`](#what-it-actually-does) | Which rules exist, and what does each one do? |

## Contents

- [What it actually does](#what-it-actually-does) — the five things, and what it refuses to touch
- [Getting started](#getting-started) — CLI, web, the GitHub Action, pre-commit
- [Which few-shot examples earn their tokens](#which-few-shot-examples-earn-their-tokens-trazum-prune) — measured, and it asks before spending
- [An MCP server for your agents](#an-mcp-server-so-an-agent-can-budget-its-own-prompts) — budget a prompt before sending it
- [Languages](#languages) — what the dictionaries cover, and what they deliberately do not
- [Connecting your own LLM](#connecting-your-own-llm) — one wire format, four native providers, and the SSRF rules
- [Every model you pay for by the token](#every-model-you-pay-for-by-the-token) — pricing across seven providers, live via OpenRouter
- [Token counting](#token-counting) — the estimator, and the error band it prints
- [Limitations, stated plainly](#limitations-stated-plainly) — read this one
- [Layout](#layout) · [Updating prices](#updating-prices) · [Privacy](#analytics-and-privacy) · [Roadmap](#roadmap-and-contributing)

---

## What it actually does

**1. Tells you where the money actually is.** This is the part worth reading
first, because it is where the numbers are. Every advisory is priced per month
against your own call volume, and none of them is about making the text shorter:

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
| Schema the request could carry | A schema block introduced by "Output format:" is paid for in input tokens on every call. Every major API now takes a response schema as a *parameter* — and moving it there is both cheaper and stricter. See below. |

The last four are **advisory only**. A contradiction has a right answer that only
the author knows, and an example that looks redundant may be demonstrating a
boundary case on purpose. Trazum points; it does not cut.

#### The one finding that is not a trade-off

Most of what Trazum reports is a choice: shorter against clearer, cheaper against
more capable. Moving an output schema out of the prompt is neither.

```
→ The output schema could travel in the request instead of the prompt
  A schema block introduced by "output format" defines `category`, `reply`,
  `escalate_to_human`, `confidence`, costing about 62 tokens on every call.
```

Those tokens are paid on **every call** to have the model read a shape and be
asked, politely, to match it. `output_config.format`, `response_format`,
`responseSchema` — whatever your provider calls it — takes the same shape as a
request parameter, where the decoder is constrained rather than persuaded. Cheaper
*and* stricter.

**Trazum reports it and never does it**, because it is not a change to the prompt:
it is a change to the code that sends the prompt. A rule that deleted the schema
would leave a prompt asking for a shape it no longer describes, sent by a client
nobody updated — strictly worse than what it started from.

**The one way this could do harm, and what stops it.** `Output format: {...}` is
a contract and moving it is free; `Input: {...}` inside a few-shot example is
*data the prompt needs*, and moving it breaks the prompt. So nothing is guessed:
a block counts only when a phrase from the output-cue dictionary appears
immediately before it, in one of the seven languages the rules cover. No phrase,
no finding — a false negative, which is the right direction to be wrong in.

The example detector finds near-copies — the way few-shot blocks actually grow.
It deliberately does not flag *paraphrases*: that case needs a model, and is on
the roadmap for the LLM pass.

**2. Then it trims the prompt itself.** Twelve deterministic rules: courtesy,
filler, verbose phrasing, duplicated paragraphs, decorative separators, shouting
in capitals. Two levels — `safe` (no semantic risk) and `aggressive` (read the
diff). This is the smallest number on the page more often than not, and it is
reported that way rather than dressed up.

**3. And never touches what would break the prompt.** Code fences, inline code,
URLs, template placeholders (`{{x}}`, `${x}`, `{x}`, `{% %}`) and XML/HTML tags
are isolated before any rule runs. If a rule ever did make one of those
disappear, that rule is discarded and the rest carry on.

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
is the smallest thing here. `optimize` is one of fourteen commands — [the table
above](#the-fourteen-commands) names what each answers — because knowing a prompt
is wasteful is not the same as knowing *which* prompt, *whose* change made it so,
or whether the shorter version still works.

`check`, `diff`, `rank` and `blame` all take `--markdown-out`, so the answer can
land in a pull request comment rather than a terminal nobody is looking at.

---

## Getting started

```bash
npx @trazum/cli optimize your-prompt.txt --cost
```

No install, no key, no network. Or keep it around:

```bash
npm install -g @trazum/cli     # the terminal
npm install @trazum/core       # the library
npm install @trazum/mcp        # the MCP server, for an agent
```

<details>
<summary>From source, if you are working on Trazum itself</summary>

```bash
npm install
npm run build      # core + cli
npm test           # every suite: core, CLI, web, Action
npm run verify     # the above plus typecheck and the web build
```

</details>

<sub>The test count used to be written here as a number. It said 580 while the real
figure had reached 798, because nothing checked it — so it now says what the command
covers instead. A number nobody maintains is worse than no number.</sub>

### CLI

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

```
Input tokens
  190 → 137   -27.9% (estimated, ±10%)

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

The other thirteen commands, each with its own section below:

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

**It blocks only on prompts your commit actually touches.** A hook that refuses a
commit over a *different* prompt somebody else committed last month is one people
learn to pass `--no-verify` to — and then it is worse than no hook at all.
`TRAZUM_HOOK=0` disables it; nothing staged, no Trazum installed, no prompts or an
unreadable config each say so once and exit 0. One real limitation: it reads the
working tree, not the staged blobs, so it judges a prompt's newest edit even when
an older version is what is staged.

In GitHub Actions, use the packaged action — nothing to install:

```yaml
- uses: actions/checkout@v7
- uses: Davmunrey/Trazum@80dc285be275613b95b946bef60f2abb3fc65be9  # 1.10.0
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

**A suggestion, not a commit, and that is deliberate.** Committing the fix would
need `contents: write`; a suggestion lands in the same place with the same one
click on the `pull-requests: write` the comment mode already uses, and you stay
the one who commits. Two limits, both real: it uses the **safe** level only — a
one-click apply is not the moment for a diff that wants reading — and a
suggestion can only anchor to lines in the pull request's diff, so a PR that
edits three lines of a forty-line prompt gets a notice explaining why there is
no suggestion rather than a partial rewrite.

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
  - uses: Davmunrey/Trazum@80dc285be275613b95b946bef60f2abb3fc65be9  # 1.10.0
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

**The spend gate, packaged.** The same action gates the bill itself when handed
a usage log instead of prompts — mutually exclusive with `target`, because one
run gates tokens before the money is spent or the spend itself, and saying
which is the caller's job:

```yaml
- uses: Davmunrey/Trazum@80dc285be275613b95b946bef60f2abb3fc65be9  # 1.10.0
  with:
    usage-log: logs/yesterday.jsonl
    max-usd: '50'            # exit 1 over budget — no period assumed
    # against: logs/day-before.jsonl
    # max-growth-usd: '10'
```

The profile report lands in the run summary either way, and a failing gate
still writes it — a red build with no report is a mystery, and mysteries get
deleted from pipelines.

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
the second is actionable. The backward-reference list is deliberately generous,
and every language's phrases are matched against every prompt rather than
detecting the language first — the cost of checking a French prompt for German
phrases is a saving not taken, which is the direction this errs in anyway.

`--diff` compares against **what you wrote**, so the move is visible rather than
hidden behind deletions; redirected, stdout stays the prompt alone and the move
and refusals go to **stderr**. With `--json` the whole decision is in `reorder`.
`check` does not accept the flag: it is a gate, and a gate does not rewrite.

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

**It reads a marker, it does not guess.** A heuristic inside a CI gate fails
builds over log messages; one line of comment buys never being wrong about what
it picked up. The marker works in `//`, `#`, `--` and `<!-- -->` comments, so
TypeScript, Python, SQL and YAML are covered, and `${x}` gets the same
protection, cache-prefix analysis and `--reorder` treatment as a `{{x}}`
template. **Each prompt is budgeted on its own**, with a path-prefixed id
(`src/prompts.ts#support-system`) that existing `budgets` globs already match. A
source file with no marker is skipped silently — it was never something you
asked to govern.

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
over. It warns about what would quietly make the run meaningless — a `${x}`
placeholder promptfoo will not substitute, a provider it had to guess an id for —
and the one assertion it seeds is `is-json`, only when the prompt already shows a
fenced JSON block. It emits JSON rather than YAML: this package has no
dependencies, and a hand-rolled YAML emitter is a quoting bug waiting for its
first colon.

### The CI gate: a budget is a ceiling, a baseline is a gate

`budgets` answers **"does this file fit"**. That is a ceiling, and a ceiling has
a blind spot: a repository sitting at 95% of every budget passes forever while a
pull request quietly adds four hundred tokens across a dozen files. Nothing
busted, bill up.

A baseline answers the other question — **"did this get worse than the commit we
agreed on"**:

```bash
trazum baseline prompts/          # record what it costs now
git add trazum.baseline.json      # commit it; the gate compares the tree against this
```

```json
{
  "usage": { "model": "claude-opus-5", "callsPerMonth": 10000 },
  "baseline": { "maxGrowthTokens": 0, "maxGrowthPct": 5 }
}
```

With that in `trazum.config.json`, `trazum check prompts/` reads the baseline and
gates on it. **No flag** — a gate you have to remember to pass an argument to is
a gate that runs in the author's terminal and not in CI. `--no-baseline` skips it
for one run.

```
  All 2 within budget.

  Against the baseline
  grew by 64 tokens (+67.4%) to 159
    New since the baseline (1)
      prompts/triage.md  0 → 64  (+64)
  Monthly cost $129.75 → $132.95 (+$3.20)
  growth of 64 tokens is over the limit of 0
  growth of +67.4% is over the limit of 5%
```

Read those two blocks together, because that is the whole point: **every budget
passed, and the run exited 1.** Nobody edited an existing prompt — somebody added
a file. A comparison over only the paths present in both documents would have let
it through, so a file that is new is counted, and there is a test whose name says
that is what the gate turns on.

**Both thresholds are optional and at least one is required.** Either default is
silently wrong: zero tolerance turns every honest addition into a failed build
and gets the block deleted inside a week, and a generous default is a gate
passing things nobody agreed to. Whichever is exceeded fails, so the output names
the limit that was actually crossed.

#### Why the threshold is in tokens when the point is money

A dollar figure moves when a model is repriced, and a baseline holding dollars
would call a price change a regression — **a gate that cries wolf is a gate
somebody deletes**. So the threshold is in tokens, which depend on the text and
nothing else; the monthly figure is recomputed beside it, and when it is not
comparable Trazum says so instead of subtracting two different measurements.
**A missing or corrupt baseline fails the run** — a gate the config asked for
and could not execute is not a pass, or deleting one file would silently switch
CI off.

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
a step summary or a PR comment. `check`, `diff`, `rank`, `blame` and `profile`
all take it, and a failure to write it is reported rather than turned into a
failing build. Every value that reaches a table cell is entity-escaped — there is
no `|` character in the output at all — which matters most for `blame`: an
author's name and a commit subject are the least trusted strings Trazum renders,
and they land in a table maintainers read.

### Charting it: `doctor --otlp-out`

```bash
trazum doctor --otlp-out metrics.json
curl -X POST -H 'content-type: application/json' \
     --data-binary @metrics.json "$OTLP_ENDPOINT/v1/metrics"
```

Five gauges — tokens per prompt, over-budget per prompt, the unbudgeted count, and
each advisory's monthly figure and prompt count — with the model and call volume
as resource attributes, because a dollar figure whose scenario is not stored
beside it is a number nobody can check three months later.

**Trazum writes the payload; it does not send it.** Pushing to a collector means
holding an endpoint and a credential, and this project has twice shipped an SSRF;
a command that writes a file has no such failure mode. No `@opentelemetry/*`
dependency either — the JSON encoding is a documented wire format, and the two
rules in it that fail silently are pinned by tests: 64-bit integers are JSON
strings, and money is `asDouble`.

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

Two decisions worth naming. **A prompt on only one side is named, never
counted** — folding a vanished file into the total would report a library
getting cheaper when somebody has to say whether the deletion was deliberate.
And **`--max-growth` applies per prompt, not to the total**: above, the total is
`+3` and `--max-growth 10` still fails, because `a.txt` grew by 14 while `b.txt`
shrank by 11 — a gate on the total would ship the doubled prompt unlooked-at.

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

**There is no score, and that is the whole design.** A number assembled from
weights nobody can reproduce gets quietly tuned until the output looks right, so
`doctor` invents nothing: **every line is an advisory `trazum optimize` raises on
those prompts on its own, summed** — a test adds up the individual runs and
requires the total to match to the last float. Two things it reports that no
other command does: which prompts no budget pattern matches, and which are
already over budget — before a red build tells you.

#### Preambles that could share a cache entry and do not

The one section here that is *not* a rolled-up advisory, because it is the one
question you cannot ask of a single file.

```
Preambles that could share a cache entry and do not
  ! 3 prompts open with the same 1,398-token preamble, differing only in whitespace
      orders.txt
      refunds.txt
      support.txt
      A formatter fixes this: the text already agrees, only the spacing does not.
```

Prompt caching is a byte-for-byte prefix match, so twelve prompts assembled from
the same preamble — identical but for a trailing tab or an `E-Commerce` against
`e-commerce` — occupy **twelve cache entries and share nothing**. Each file is
individually fine, which is why no per-prompt analysis finds it. `drift` says
which kind of work fixes it: `whitespace` means a formatter, `wording` means
somebody has to pick one. Gated on the model's own cacheable minimum, and
deliberately carrying **no dollar figure**: pricing it would mean inventing how
your calls are spread across the group, which is the one thing only you know.

**It exits 0 even when it finds things** — `trazum check` is the gate, and a
build gated on a keyword heuristic teaches people to re-run until it goes green.
Offline and free, like the rules: nothing here calls a model.

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
your text before it is shown, and dropped rather than reconciled: `before` must
appear byte for byte, it must not touch protected content, `after` must not
introduce any, it must actually save tokens, and overlapping suggestions are
dropped. A phrase that occurs several times is rewritten everywhere it appears
*outside* protected content — the `×2` above. The model is asked about the
**optimised** prompt, not the one you wrote. `--apply-suggestions` takes them; on
its own it is an error rather than a no-op.

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

Four decisions worth knowing about: **off by default** — answering from a stale
response without being asked would be the one surprise in a tool built on not
producing any; **the raw response is cached, not the checked result**, so an
answer stored last week is judged by this week's checks; **seven days, then it
is asked again**; and **mode 0600 in a 0700 directory** under
`$XDG_CACHE_HOME/trazum/suggestions` (or `~/.cache`), because the cache holds
prompt text — the most sensitive thing this tool touches.

`trazum --clear-suggestion-cache` empties it and says how much went. It needs no
command and reads no config, so an unparseable `trazum.config.json` cannot stop
you emptying it.

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

It reads history and nothing else: no writes, no network. Running git happens in
exactly one module, [`git.ts`](packages/cli/src/git.ts), written as though it
were the whole attack surface — no shell, every path after a `--` separator so a
file called `--upload-pack=…` stays a filename, object names validated as 40 hex
digits, a bounded timeout and buffer — and those rules are asserted in
`security.test.js` rather than promised in a comment.

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

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/web-dark.png">
    <img src="docs/assets/web-light.png" alt="The Trazum web app: a wordy support prompt on the left, and on the right a result panel reading minus 43.7 percent, 158 to 89 input tokens, and a saving of $3.45 a month." width="820">
  </picture>
</div>

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

**And a "Your bill" tab**, which is [`trazum profile`](#where-the-money-actually-went-trazum-profile)
in the browser: drop or paste a usage log and read where the money went — the
spend split, whether caching paid for itself, the levers that would actually
move the bill, conversation growth, and the answers that were cut off
mid-generation. The log is parsed entirely in the page against the bundled
pricing catalogue. **Nothing is uploaded**: there is no fetch in that
component, a test fails if one appears, and the only analytics event carries
two booleans. A usage log names your workloads, spend and conversation counts —
exactly the file nobody should have to hand to a server to see a report on it.

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
— the body is untrusted, and a truthy check would let `"false"` rearrange
somebody's prompt. With `reorder`, the response carries what moved and what was
declined, and `original` stays the text you sent so a diff shows the move. With
`suggest`, it carries every proposal that survived the checks and everything
rejected and why — present even when the model proposed nothing, so "nothing was
found" is distinguishable from "you did not ask". `applySuggestions` without
`suggest` is a **`400`**, not a no-op, refused before any call to the model.

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

`POST /api/compare` returns every figure as `after - before`, so **positive
means worse**. Both endpoints are rate limited (30/min per IP), with a bucket
each. And `/api/optimize` will not fetch an LLM endpoint a caller names: a
request may only **select** one from `TRAZUM_ALLOWED_LLM_ENDPOINTS`, empty by
default — stricter than filtering the URL, because a hostname an attacker
registered can resolve wherever they like. See [SECURITY.md](SECURITY.md).

### Signing in (optional)

Off by default, and a deployment that leaves it off is the tool this README has
been describing all along: paste a prompt, get an answer, nothing remembered.

Set three variables and the header grows a **Sign in** button:

```sh
TRAZUM_GITHUB_CLIENT_ID=Iv1.xxxx
TRAZUM_GITHUB_CLIENT_SECRET=xxxx
TRAZUM_PUBLIC_URL=https://trazum.example
```

A fourth, `TRAZUM_DATABASE_URL`, points it at any Postgres so sign-in survives a
restart; without it sessions live in memory and the header says "temporary
session". Trazum asks GitHub for `read:user` and nothing else, **never stores
the access token**, and stores session cookies only as their SHA-256.
Misconfigure any of it and sign-in simply stays off, with `/api/auth/*`
answering 503 naming the variable to set.

Signed in, a **Library** tab appears: prompts you saved and every version of
each, append-only, token counts recomputed on read rather than stored. On the
Compare tab, **Create share link** publishes a comparison at `/c/<token>` for
anyone holding the URL — expiring after thirty days by default, revocable, kept
out of search engines, and saying what it publishes *before* the button. Every
share link doubles as a **README badge** at `/badge/<token>.svg`, recomputed on
every load, with no script and no prompt text. Set `TRAZUM_ADMINS` and `/admin`
totals what every prompt on the deployment adds up to — names and token counts,
never anybody's prompt text, and deliberately not a spend report.

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
has `muy` and deliberately not `mucho` — words that are an intensifier *and* a
quantifier (`muito`, `molto`, `heel`) turn "you have much time" into "you have
time", and a test keeps them out.

```bash
trazum optimize prompt.txt --locale es      # flag
TRAZUM_LOCALE=es trazum optimize prompt.txt # environment
```

The CLI resolves `--locale`, then `TRAZUM_LOCALE`, then `LC_ALL`/`LC_MESSAGES`/
`LANG`, and last `locale` in `trazum.config.json` — **the config comes last on
purpose**, the one setting where it does: the project sets the floor, the person
at the keyboard wins. Two things are deliberately not localised: **USD amounts**
stay `en-US`, so a report shared across a team shows the same number to
everyone, and **rule and advisory ids** are stable across locales precisely so
you can branch on them. Adding a report language is a message catalogue per
package — see [CONTRIBUTING.md](CONTRIBUTING.md).

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

Bedrock goes through **Converse**, not `InvokeModel`, and both signatures —
SigV4 and Vertex's service-account JWT — are written by hand on WebCrypto,
because this library has zero runtime dependencies and the AWS and Google SDKs
are two hundred packages between them to authenticate one request. **Neither has
been run against the real service**: the signers are tested against canonical
strings, and the first real call is what proves them. Gemini needs its own
handling for a reason worth knowing — **a blocked prompt, a truncated answer and
an empty candidate all come back as HTTP 200** — and Trazum refuses all three.

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

**Every answer names the line it came from.** Four kinds of evidence, strongest
first: `model=` on a `trazum:prompt` marker, a quoted model id, a base URL, an
SDK import — and **a base URL beats the SDK it was pointed at**, because
Moonshot, DeepSeek, xAI and Groq are all called through the OpenAI SDK with a
different `base_url`. **It refuses when a file names two providers**: picking
silently is how somebody budgets against the wrong provider for a month.
Detection sits in the usual layering — a flag beats config, config beats
detection, detection beats the built-in default.

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

## Where the money actually went: `trazum profile`

Every other command reads a prompt and reasons forward about what it *would* cost.
This one reads what the provider actually charged and reasons backward — because
the forward direction can only see the smallest line item.

Measured on an ordinary support prompt: the deterministic rules recover about
**1%** of the monthly figure, while output tokens alone were **87%** of it. A tool
that reads `prompts/*.txt` cannot see retrieved context, conversation history, tool
results or answers, and on a RAG or agent workload those are nearly the whole
invoice.

```bash
trazum profile usage.jsonl
```

The same report renders in the web app's **Your bill** tab, parsed entirely in
the browser — nothing is uploaded.

```
Where the money went
  2,650 calls · $27.04

  Input              $8.05  29.8%   2,807,222 tokens
  Cache reads        $2.28   8.4%   4,562,593 tokens
  Cache writes          $0   0.0%   0 tokens
  Output            $16.71  61.8%   700,203 tokens

  Output is 61.8% of this bill, so shortening prompts has a low ceiling here.
  What moves it is asking for shorter answers and capping max_tokens.
  Cache hit rate 61.9% of billable input.

By label
       $15.62  57.8%   chat  (250 calls)
        $9.72  36.0%   support-rag  (400 calls)
        $1.70   6.3%   classify  (2,000 calls)
```

**The format is the one the API already returns.** One JSON object per line, each
with a `model` and the `usage` object from the response. Recording it is a few
lines and no transformer:

```ts
appendFileSync('usage.jsonl', JSON.stringify({
  model: response.model,
  label: 'support-rag',       // which workload — without it every call looks alike
  session: conversationId,    // which conversation — grouped by, never printed
  ts: new Date().toISOString(), // when — unlocks the span and the TTL check below
  ...response.usage,
}) + '\n');
```

OpenAI's shape works too, with the one real difference handled: it counts cached
tokens *inside* `prompt_tokens` while Anthropic reports them beside
`input_tokens`, so treating them alike would bill the cached half twice.

**It reads a file, and that is the design.** Not a proxy, not an SDK wrapper.
Trazum's position is that prompts do not leave the machine they are on — asserted
by tests rather than promised — and sitting in the request path trades that away
for convenience. The record shape has **no field for content**, so a usage log
handed to Trazum cannot contain a prompt even by accident.

**It reports no saving**, deliberately. Attributing "you could have saved X" to a
call that already happened means guessing what the call should have been, which is
what this exists to stop doing. It says what was spent and where; what to do about
it is the advisories' job.

A model the pricing catalogue does not know is **named and kept out of the
totals** rather than costed at zero — a total that silently omits calls is wrong in
the flattering direction.

### What would actually move this bill

**The rules recover about 1%.** Measured: three tokens out of three hundred and six
on an ordinary support prompt. On a company spending €20,000 a month that is €200,
and nobody installs a tool for €200. The complaint is correct, and the answer is
not that the number is wrong — it is that shortening the prompt was never where the
money was.

| lever | what it moves |
|---|---|
| **which model the call goes to** | Opus 5 → Sonnet 5 is **40%** off; → Haiku 4.5 is **80%** |
| **the Batch API** | **50%** flat, on input and output |
| prompt caching | 3–4× the rules |
| shortening the prompt | **~1%** |

So `profile` prices the other rows, from the log you already have:

```
What would actually move this bill

  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50
    Whether that holds is an evaluation question, not an arithmetic one, and
    nothing here has seen a single answer. Measure it: trazum eval <prompt>
    --cases <cases> --model claude-sonnet-5

  For comparison: shortening the prompt text can touch $18.00 at the very
  most — 85.7% of this bill, and only if you deleted every input token.
```

**Every figure is arithmetic on tokens that were billed.** The same counts at
another model's published rate; the same tokens at the provider's batch multiplier.
Nothing is modelled, nothing extrapolated, no assumed traffic.

Four things it refuses to do, and each one is a bug it had:

- **It never adds the options.** Batching a routed call discounts the *cheaper*
  model, so route + batch is $16.80 and not $23.10 — a figure larger than the
  $21.00 that slice had ever cost.
- **It never says a route is safe.** That is a quality question arithmetic cannot
  answer, and nothing here has seen a prompt or an answer. So it prints the
  `eval` command instead of a recommendation.
- **It never says "per month".** A log covers whatever period somebody recorded.
  Every figure is over exactly the calls in the file.
- **It never crosses a vendor.** A cheaper model at another provider is a
  migration, not a routing change.

And it prints the ceiling on prompt shortening underneath, on purpose. A 1% win
reported without saying 1% of *what* is not information.

### What re-sending the conversation costs

A chat or agent workload sends the whole conversation back on every turn. Turn one
is a system prompt and a question; turn twenty is a system prompt, nineteen previous
exchanges and a question. **On an agent bill that growth is routinely the largest
single line, and nothing in this tool could see it** — a prompt file shows the
system prompt and not the history, and a total shows the sum and not the shape.

Add one field to the log:

```ts
appendFileSync('usage.jsonl', JSON.stringify({
  model: response.model,
  label: 'agent',
  session: conversationId,   // or conversation_id — either is read
  ts: new Date().toISOString(),
  ...response.usage,
}) + '\n');
```

```
What re-sending the conversation costs

  agent on Claude Opus 5: input ranges from 600 tokens on the smallest turn
  to 5,000 on the largest, over conversations of up to 12 turns.
  If every turn had been the size of its smallest one, that input would have
  cost $7.20 instead of $33.60 — so at most $26.40 of this bill is
  conversation growth (57.9%).
```

**It is a ceiling, and it says so.** Part of that growth is the user's own new
messages, which nothing can truncate away, and this reads counts rather than content
so it cannot separate the two. The bound is exact; the split is not knowable from a
usage log, and inventing one would be the flattering direction.

**Trazum never prints the session key.** In a real log it is often an account id, a
ticket number or an email address — so it is used to group calls and count turns,
every figure is reported per *label*, and a test asserts the value appears nowhere
in the report or in `--json`. A log that carries no content is only half the promise
if something identifying comes back out.

A log without the field says so rather than staying silent: *"nothing recorded"* and
*"nothing to report"* are answers a reader would act on differently.

### Is the cheaper model good enough: `trazum route`

Pricing a route is arithmetic. Whether the cheaper model still does the job is not,
and the levers section could only hand you homework — which does not get done.

```bash
trazum route usage.jsonl --prompt-file prompts/support.txt --cases cases.txt --yes
```

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).

  This will make 9 provider calls: two per case on claude-opus-5 to measure its
  own variance, one per case on claude-sonnet-5.

  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.

  ✓ HOLDS — the difference is inside the original model's own noise. On this
    bill that route is worth $12.60.
```

**The yardstick is the expensive model's own run-to-run variance**, measured on the
same cases in the same run. That is the whole design: a route is safe when the
cheaper model agrees with the original *more closely than the original agrees with
itself*, and any other bar would be a number somebody chose.

Three provider calls per case, and it prints the count and stops unless you pass
`--yes`. It reports `INCONCLUSIVE` rather than inventing a verdict when the
original was too inconsistent to judge anything against — and it says **agreement
is not correctness** on every verdict, including the good one.

### Did the caching actually pay for itself?

The rest of Trazum tells you to cache. This is the one report that can tell you
the advice was wrong for a given workload — and a healthy-looking cache hit rate
will not.

A cache **write** costs 1.25x plain input on Anthropic, and **2x** at the one-hour
TTL. So a prefix that changes faster than it is reused pays that premium and gets
nothing back: those calls would be cheaper with caching switched off, and no other
figure on the report would ever say so.

```
  Cache hit rate 97.8% of billable input.
  Caching took $0.2675 off this bill, against the same tokens uncached.
  ! The total above hides a loss: caching costs $0.1250 across rag.
```

That is the case worth having the check for. The hit rate reads 97.8%, the total
is comfortably ahead, and one of the two workloads is still burning money — the
aggregate is exactly where a loss like that hides, so the verdict is computed per
label as well as over the whole log.

**This is the one counterfactual in `profile`, and it is not an exception to the
no-savings rule — it is the line that rule draws.** A saving requires imagining a
prompt nobody wrote. This requires imagining the *same tokens at a different
rate*, which is arithmetic: caching changes the multiplier on a token, never the
token. Each side is priced per model, so a provider whose writes cost the same as
input (OpenAI, Gemini) is never accused of a loss it cannot have — or turn off.
A model you add through a `pricing` overlay can declare its own `multipliers` for
exactly this reason; without them it would inherit Anthropic's rates and be
charged a premium its provider never billed.

**When the log cannot settle it, neither does the report.** A cache write whose
TTL was not recorded is priced at the cheaper of the two rates, and that
assumption moves the *verdict*, not only the total: between 0.28 and 1.11 read
tokens per written token the same calls pay for themselves at 1.25x and lose
money at 2x. So the confident sentence does not print at all —

```
  ! This log cannot say whether caching paid for itself. 1 call did not record
    which cache-write TTL was used: at the 5-minute rate caching took $0.1000
    off this bill, and at the 1-hour rate the same calls added $3.65 to it.
```

Recording the `cache_creation` object the API returns settles it, and the
warning disappears.

`--json` carries the verdict as `cache` and `cacheByLabel` rather than leaving it
to be re-derived. **Positive `deltaUsd` means worse**, the opposite of every other
figure Trazum emits, which is why the verdict is a word and not just a number.

### Does the TTL fit how fast the turns come?

Add `ts` to the record — ISO 8601, or epoch seconds or milliseconds; OpenAI's
`created` is read too — and two findings unlock that no count can make.

**The span.** The report states what period the log covers — `This log covers
2026-08-01 → 2026-08-14 (13.0 days)` — and deliberately stops there: the span
makes your own monthly arithmetic valid, while a per-month figure printed from a
partial month would be Trazum doing the guessing it exists to end. When only some
calls carry a clock, it says how many, so a span over a slice of the log is never
presented as the log's period.

**The TTL check.** A cache entry lives 5 minutes, or an hour at 2x the write
price — and whether either fits depends on one number the bill never shows: how
long this workload waits between turns. Measured as the **median gap between
consecutive turns of the same conversation**, sorted by the recorded clock so the
answer is independent of the order of the log:

```
  ! chat on Claude Opus 5: turns arrive a median of 9m apart and the 5-minute
    entry is gone by then — writes expire before the next turn reads them,
    which from the bill is a cache that only writes.
```

Four verdicts, and each one is a different instruction. **Expires before
reuse**: the mechanism behind the lost-money verdict above, with both honest
ways out named — the 1-hour TTL, or caching switched off. **Overlong TTL**: the
quiet mistake visible nowhere else — turns seconds apart paying 2x for an hour
of endurance they never use, priced exactly, the same tokens at the other
published rate. **Unsettled**: a gap between the two lifetimes on writes whose
TTL the log did not record — neither half is asserted. **Fits**: said out loud,
because silence would be indistinguishable from unmeasured. Writes with no
clock or no session get the fifth sentence — *could not be measured* — rather
than nothing.

**The clock also names the most expensive day.** A steady $3 a day and a quiet
week broken by one $40 spike sum to the same total and call for opposite
responses, so the report says which shape this bill has — `The most expensive
day in this log was 2026-08-12: $9.40, 3.1x the median day. Most of it was chat
($7.10).` — against the median rather than a mean the spike would inflate, and
per label, never per session. The full series rides `--json` as `spendByDay`.

### The bill as a CI gate

`check` gates tokens before the money is spent. These gate the spend itself,
from the provider's own billed counts:

```bash
trazum profile yesterday.jsonl --max-usd 50                       # exit 1 over budget
trazum profile this-week.jsonl --against last-week.jsonl --max-growth-usd 100
```

**No period is assumed, and that is what makes the budget honest**: `--max-usd`
applies to exactly the log handed in, so a nightly job that profiles
yesterday's log has a daily budget without Trazum ever guessing what a day is.
`--max-growth-usd` needs `--against` — alone it is an error, not a flag that
silently gates nothing — and both fire under `--json` too, because CI reads the
exit code there.


## Where this fits, said at the front door

Every `optimize` run closes with the same sentence, because it is the truth about
what the command just did:

```
  Shortening a prompt is the smallest lever there is: measured on an ordinary
  support prompt, the rules recover about 1% of a monthly bill. On a metered
  API the things that move 40% to 80% are which model the call goes to, the
  Batch API, prompt caching, and what re-sending the conversation costs — and
  "trazum profile <usage.jsonl>" prices all four from what the provider
  actually charged.
```

A tool whose first command reports 1% and says nothing about the other 99% has
not told you what it knows.

## Token counting

By default Trazum uses a **dependency-free heuristic estimator**: it classifies
by character type (words, numbers, punctuation, CJK, emoji). It targets ±10% on
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

**That band is measured, and it was false when it was not.** For eight releases
`±10%` was a design target nobody had checked; the first run against the official
counting endpoint found two of eight samples outside it, both underestimating —
the direction that under-reports cost. The corpus is now 21 samples across seven
languages and six text types, the harness is committed
(`ANTHROPIC_API_KEY=... npm run measure:tokens` — the endpoint is free), and
`token-band.test.js` asserts the band per text type against that ground truth: a
sample edited since it was measured **fails**, and one never measured **skips out
loud**.

| what | worst error |
|---|---|
| the whole corpus | **6.4%** (`code-heavy`, fitted to nothing) |
| the samples nothing was fitted to | 6.4% — they are what sets the band |
| every language divisor, on a held-out sample in another register | 3.8% |
| samples outside `±10%` | 0 of 21 |

**The published band is 10 and the worst measurement is 6.4**, deliberately:
twenty-one samples across six text types cannot bound a seventh — no Korean, no
Cyrillic prose, no mixed-script document — and overstating the uncertainty is the
safe direction for a tool that reports money. One caveat stated rather than
buried: the Latin-language divisors were calibrated on the samples they are
measured against, so the band rests on the samples nothing was fitted to.

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
  src/shared-prefix.ts  preambles that could share a cache entry and do not
  src/usage.ts       the usage-log profiler: where the money actually went
  src/levers.ts      what would move the bill, priced from tokens that were billed
  src/conversation.ts   what re-sending the conversation costs, a ceiling
  src/output-shape.ts   where the output spend concentrates: tail or task
  src/prune.ts       leave-one-out over few-shot examples, against the noise floor
  src/aws-sigv4.ts   Bedrock's signature, by hand, on WebCrypto
  src/gcp-auth.ts    Vertex's service-account JWT, same reasoning
  src/openrouter.ts  live prices, with the unknowns marked unknown
packages/cli/      dependency-free CLI
  src/markdown.ts    the report as markdown, and the three escapers
  src/git.ts         the only module here that runs another program
packages/mcp/      dependency-free MCP server — four tools over stdio
  src/rpc.ts         JSON-RPC 2.0 by hand; the invariant beat the SDK
  src/tools.ts       the whole surface an agent can reach, in one file
apps/web/          Next.js (App Router) — Optimise, Compare, Your bill, Library
action/            the packaged GitHub Action that comments on pull requests
scripts/           release notes, the token-band harness, rollback recovery
```

## Updating prices

`packages/core/src/pricing.ts` is the single source of truth. When you change
it, update `PRICING_LAST_REVIEWED` too. The test suite checks the table stays
coherent (output dearer than input, promotions with an expiry date, plausible
context windows).

### Which few-shot examples earn their tokens: `trazum prune`

The `redundant-examples` advisory asks a *textual* question: does this example look
like an earlier one? It is free and it catches the way few-shot blocks actually grow
— copy the last one, change two fields.

`prune` asks a stronger one: **does removing this example change any answer?** Two
examples can be textually unalike and teach the same thing, and the few-shot section
is routinely most of a prompt.

```bash
trazum prune prompt.txt --cases cases.txt          # prints the bill, calls nothing
trazum prune prompt.txt --cases cases.txt --yes    # spends it
```

```
4 examples × 3 cases: 18 provider calls (2 baselines per case, then one per
example removed).

What each example is doing, measured on claude-opus-5
  The prompt agrees with itself 94% of the time. That is the yardstick.

  → example 1 — 18 tokens, 93% agreement without it  no effect on these inputs
      Input: my card was declined
  · example 3 — 19 tokens, 41% agreement without it  needed here
      Input: I want my money back
```

**Leave-one-out against the prompt's own noise floor.** Ask the full prompt twice
to find how much the model disagrees with *itself*, then remove one example and
ask again — a removal that moves the answer less than the model already moves on
its own did not do observable work. The bill is `(2 + examples) × cases`, printed
before any call goes out, and without `--yes` it stops there. And it reports
**"no effect on these inputs" and never "delete this"**: an example may exist for
the boundary case your inputs do not contain, and only you know whether they
cover what matters.

### An MCP server, so an agent can budget its own prompts

`@trazum/mcp` exposes four tools over stdio — `optimize_prompt`, `check_prompt`,
`profile_usage` and `list_models`. Every other surface here answers "what does
this prompt cost" for a human after the fact; this answers it for the thing
composing the prompts — before it sends one, and over the bill its calls already
ran up.

```jsonc
{ "mcpServers": { "trazum": { "command": "npx", "args": ["-y", "@trazum/mcp"] } } }
```

**It runs on the caller's machine and costs nothing to host** — one process, spawned
by the client, exactly like the CLI. No service, no prompt leaving the machine.

`check_prompt` is the one worth wiring up, and it has three outcomes rather than
two:

```
OVER BUDGET — 2,140 tokens against 2,000, but the safe rules bring it to 1,870,
which fits. Optimise rather than cut.
```

"Over budget" and "over budget but the rules would fix it" are different
instructions. A boolean throws away the actionable half.

`profile_usage` is `trazum profile` for an agent: it takes a usage log **as
text**, and answers with the spend split, the per-label and per-model tables, the
cache verdict — including the unsettled one, when the log cannot say — the levers,
conversation growth, and the gaps. The one tool here whose figures are exact
rather than ±10%: they are the provider's own billed counts. The session key is
grouped by and never echoed, and a test feeds one through to prove it.

**What it cannot do is the design.** No paths — every tool takes text, and the
package imports only the browser-safe entry point, so it cannot read a file even if
somebody adds a parameter for one; the agent reads the log in its own sandbox,
where its own permissions apply. No network: `--suggest` and `eval` are
deliberately not exposed, because a tool an agent can invoke in a loop must not be
able to spend money. No writes.

**Zero runtime dependencies, which is why the JSON-RPC layer is hand-written**
rather than taken from the official SDK. It was written with the SDK first and
`publish.test.js` refused it: every publishable package here carries no runtime
dependencies, and the stated reason — every dependency is somebody else's code
reading your prompts — applies to an MCP server with *more* force than anywhere
else, not less. [packages/mcp/README.md](packages/mcp/README.md) states what the
protocol implementation covers and what it does not.

### The pre-commit framework

`scripts/pre-commit` is a plain git hook and stays the recommended way to do this.
`.pre-commit-hooks.yaml` exists for teams who manage hooks with
[pre-commit](https://pre-commit.com) — mostly Python shops, whose prompts live in
`.py` string literals that `check` reads through a marker comment.

```yaml
repos:
  - repo: https://github.com/Davmunrey/Trazum
    rev: <a commit SHA>          # not a tag: a tag can be moved after you review it
    hooks:
      - id: trazum-check
        args: [--max-tokens, '2000']
```

`trazum-check` is a gate and fails the commit. `trazum-doctor` never does, because
`doctor` exits 0 by design — a hook that blocks on somebody else's prompt is one
people learn to bypass.

**The executable comes from `additional_dependencies`** — `@trazum/cli` on npm —
not from installing this repository, whose root is a private workspace with no
`bin`: pre-commit installs hook repos with `npm install -g`, and npm answers
`Workspaces not supported for global packages`. That was tried rather than
reasoned about. The mechanism is verified with packed tarballs standing in for the
registry: the gate fails a prompt over budget, passes one inside it, and the
survey hook exits 0.

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
- Analytics (PostHog) is **off by default** and never sends prompt content —
  only aggregate metrics (reduction percentage, level, model, locale). It
  switches on only when the operator sets `NEXT_PUBLIC_POSTHOG_KEY`, which also
  adds the analytics origin to the Content-Security-Policy; with no key the
  policy stays `connect-src 'self'`.
- LLM keys entered in the UI are used for that request and discarded; they are
  neither logged nor persisted.

## Roadmap and contributing

[ROADMAP.md](ROADMAP.md) covers what is planned and why.
[CONTRIBUTING.md](CONTRIBUTING.md) covers adding a rule or a language, and
[docs/authoring-rules.md](docs/authoring-rules.md) is the full walkthrough for a
rule.
[VERSIONING.md](VERSIONING.md) covers what counts as public API.
