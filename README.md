<div align="center">

# Trazum

### Most of your LLM bill is not the prompt. Trazum finds where it is.

**A deterministic cost analyser for prompts and usage logs.** Offline, free,
same answer every time. It reports fifteen findings priced in dollars per
month: caching you are not getting, a model tier you may not need, a schema you
pay to describe on every call. Shortening the prompt is one of them, and it is
rarely the biggest.

[![CI](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/security.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-3c873a.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2f855a.svg)](#layout)

</div>

## Your agents spend money in a loop. This prices the call before it happens.

One agent costs what it costs. A fleet of them spends in a loop nobody is
watching per iteration, and the bill arrives a month later as one number with
no per-decision detail inside it.

Trazum installs into that loop. The MCP server's first tool is `spend_guard`,
and it is the only one here whose trigger is not a sentence somebody types:

```
"May I spend this?"  ->  yes, no, or cannot-tell.
```

A refusal carries the cheaper ways to make the same call, each priced for that
call and each naming what it assumes. The ceilings come from your
`trazum.config.json`; the spend so far comes from the usage log your host
already writes. Nothing is called and nothing is spent to answer.

```bash
claude plugin marketplace add Davmunrey/Trazum
claude plugin install trazum@trazum
```

That one line brings the skill and the MCP server. For any other MCP client,
`npx -y @trazum/mcp` over stdio does the same.

**[Or run it right now, without installing anything: the Playground](https://trazum.vercel.app/?tab=playground)**

That link opens the CLI's pure subset running in the page, against sample files
already loaded, through the same `@trazum/core` functions the terminal runs.
Nothing you paste leaves your browser.

## The argument, in one screenshot

<div align="center">

<img src="docs/assets/demo.svg" alt="trazum optimize on a wordy support prompt: 238 tokens down to 142 (-40.3%), $24.00/month saved by the rules, and an advisory pointing at $528.40/month, 22 times more" width="760">

*Real output, transcribed. Read the last two lines: the rules recovered $24.00
a month, and the advisory above them is worth $528.40, **22 times more**. That
gap is the entire argument for this tool.*

</div>

**The prompt is the part everyone looks at, and usually the cheap part.** In the
run above, forty percent of the text came out and it moved 3.5% of the bill.
What moved the rest was a question nobody was asking: does this task need the
model it is running on?

**Every figure has a receipt.** Fifteen advisories, each priced per month and
reproducible on a single file: caching you are not getting, work that could go
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
 42 commands       MCP server      Next.js     comments on pull requests
                 for your agents
```

## Contents

- [What it actually does](#what-it-actually-does) — the five things, and what it refuses to touch
- [The forty-four commands](#the-forty-four-commands): the whole surface, one line each
- [Getting started](#getting-started) — CLI, web, the GitHub Action, pre-commit
- [The first five minutes](#the-first-five-minutes-trazum-init) — `init`, and the four things it refuses to write
- [Building on the format](docs/commands.md#building-on-the-format-trazum-conform) — the contracts, the guarantees, and the doctrine
- [More than one machine](docs/commands.md#more-than-one-machine-trazum-rollup) — several people's documents, one bill, every gap preserved
- [Did anything stop running](docs/commands.md#did-anything-stop-running-trazum-pulse) — the outside view of a scheduled job
- [Which few-shot examples earn their tokens](docs/commands.md#which-few-shot-examples-earn-their-tokens-trazum-prune) — measured, and it asks before spending
- [An MCP server for your agents](docs/commands.md#an-mcp-server-so-an-agent-can-budget-its-own-prompts) — budget a prompt before sending it
- [Languages](#languages) — what the dictionaries cover, and what they deliberately do not
- [Connecting your own LLM](#connecting-your-own-llm) — one wire format, four native providers, and the SSRF rules
- [Every model you pay for by the token](#every-model-you-pay-for-by-the-token) — pricing across seven providers, live via OpenRouter
- [Token counting](#token-counting) — the estimator, and the error band it prints
- [Limitations, stated plainly](#limitations-stated-plainly) — read this one
- [Running it on a schedule](docs/running.md) — cron, systemd, Actions, and where the answer runs out
- [Everything else](docs/README.md) — the documentation index, arranged by whether you are
  choosing this, using it, extending it or maintaining it
- [Layout](#layout) · [Updating prices](#updating-prices) · [Privacy](#analytics-and-privacy) · [Roadmap](#roadmap-and-contributing)

---

## What it actually does

**1. Tells you where the money actually is.** This is the part worth reading
first, because it is where the numbers are. Every advisory is priced per month
against your own call volume, and none of them is about making the text shorter:

| Advisory | Why it matters |
|---|---|
| Prompt caching | Reading from cache costs 10% of input. The saving is computed over the **real stable prefix**: in a template with `{{placeholders}}`, only what precedes the first one is cached — not the whole prompt. |
| Reorder the template | Stable instructions sitting *after* the first variable placeholder never cache today. Trazum prices moving them in front — and with `--reorder`, [does it](docs/commands.md#reordering-for-the-cache---reorder). |
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
is the smallest thing here. `optimize` is one of forty-four commands — [the table
above](#the-forty-four-commands) names what each answers — because knowing a prompt
is wasteful is not the same as knowing *which* prompt, *whose* change made it so,
or whether the shorter version still works.

`check`, `diff`, `rank` and `blame` all take `--markdown-out`, so the answer can
land in a pull request comment rather than a terminal nobody is looking at.

**It gates in whatever CI you already run.** One binary, two exit codes, and
[worked recipes for GitLab CI, Jenkins, CircleCI and a pre-commit hook](docs/ci.md)
— no vendor plugin, because each one would be a second code path that drifts
from the exit codes it is supposed to relay.

---

## The forty-four commands

| Command | What it answers |
|---|---|
| [`trazum init`](#the-first-five-minutes-trazum-init) | What is in this repository, and what is the one thing worth fixing? *The first command to run.* |
| [`trazum optimize`](#cli) | What can come out of this prompt, and what is that worth a month? |
| [`trazum check`](#cli) | Does this prompt fit its token budget, and has the repository drifted past its recorded baseline? *Exits 1 when either fails — this is the CI gate.* |
| [`trazum baseline`](docs/commands.md#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate) | What does this repository's prompts cost right now? *Records it, to commit.* |
| [`trazum diff`](docs/commands.md#did-this-edit-make-it-worse) | What did this edit cost? |
| [`trazum rank`](docs/commands.md#which-prompt-to-fix-first-trazum-rank) | Of these forty prompts, which is worth an afternoon? |
| [`trazum doctor`](docs/commands.md#the-whole-workspace-at-once-trazum-doctor) | What is wrong across the whole workspace? |
| [`trazum prune`](docs/commands.md#which-few-shot-examples-earn-their-tokens-trazum-prune) | Which few-shot examples earn their tokens? Measured, and it asks before spending. |
| [`trazum blame`](docs/commands.md#who-made-this-prompt-expensive-trazum-blame) | Who made this prompt expensive, and when? |
| [`trazum eval`](docs/commands.md#does-the-shorter-prompt-still-work) | Does the shorter prompt still do the job? |
| [`trazum where`](docs/commands.md#prompts-where-they-actually-live) | Which prompts are hiding inside my source files? |
| [`trazum models`](#every-model-you-pay-for-by-the-token) | What does each model cost, and what is its cache minimum? |
| [`trazum profile`](#where-the-money-actually-went-trazum-profile) | Where did the money actually go? *Reads a usage log, not a prompt.* |
| [`trazum route`](docs/commands.md#is-the-cheaper-model-good-enough-trazum-route) | Is the cheaper model good enough? *Measured, and it asks before spending.* |
| [`trazum plan`](docs/commands.md#the-plan-trazum-plan) | Of everything the log shows, what do I do first, and what is each move worth? |
| [`trazum verify`](docs/commands.md#did-it-work-trazum-verify) | Did the plan's savings actually arrive? *Three outcomes, never two.* |
| [`trazum history`](docs/commands.md#the-long-run-trazum-history) | What have twenty reports been saying that no two of them could? *Shapes, never forecasts.* |
| [`trazum connect`](docs/commands.md#your-bill-without-the-export-trazum-connect) | What did the provider actually bill me? *Read from their API, nothing exported by hand.* |
| [`trazum store`](docs/commands.md#keeping-it-trazum-store) | What have I measured and kept? *Aggregates only — no prompt text, ever.* |
| [`trazum watch`](docs/commands.md#the-afternoon-it-happened-trazum-watch) | Has anything crossed a budget? *Measured crossings only — never a forecast.* |
| [`trazum serve`](docs/commands.md#before-the-call-is-sent-trazum-serve) | What will this call cost, and is there budget? *Answered in milliseconds, halves kept apart.* |
| [`trazum gateway`](docs/commands.md#in-the-path-of-the-call-trazum-gateway) | Can it stop the call instead of advising against it? *Refuses; never substitutes.* |
| [`trazum ladder`](docs/commands.md#is-the-ladder-saving-money-or-is-it-a-bill-trazum-ladder) | Is cheap-first-escalate-on-failure saving money, or costing it? *Break-even rate, stated.* |
| [`trazum experiment`](docs/commands.md#two-arms-on-real-traffic-trazum-experiment) | Which of two arms is better on real traffic? *A winner only when there is one.* |
| [`trazum quality`](docs/commands.md#the-gate-that-fails-a-build-for-quality-trazum-quality) | Did that prompt change quietly make the product worse? *Refuses to blame what it cannot attribute.* |
| [`trazum semantic`](docs/commands.md#the-findings-a-dictionary-cannot-see-trazum-semantic) | Does this prompt say the same thing twice, or contradict itself? *The model proposes; the checker disposes.* |
| [`trazum owners`](docs/commands.md#whose-money-trazum-owners) | Whose budget does this land on? *The unallocated is never spread.* |
| [`trazum commitment`](docs/commands.md#should-you-sign-that-commitment-trazum-commitment) | What would that committed-use deal have been worth? *On measured months, both directions priced.* |
| [`trazum report`](docs/commands.md#the-year-from-what-was-already-written-down-trazum-report) | What did the year actually look like? *No new data, and it lists its own blind spots.* |
| [`trazum schema`](docs/commands.md#building-on-the-format-trazum-conform) | Which fields must a document of this format carry? *A JSON Schema, for validators that are not Trazum.* |
| [`trazum conform`](docs/commands.md#building-on-the-format-trazum-conform) | Does the document my tool emits conform, and what will it not be able to answer? |
| [`trazum rollup`](docs/commands.md#more-than-one-machine-trazum-rollup) | Four of us measured four things — what is the total, and what did merging lose? *A format and a merge, not a service.* |
| [`trazum pulse`](docs/commands.md#did-anything-stop-running-trazum-pulse) | Did the things that are supposed to run, run? *Runs nothing itself — your CI is the thing that notices.* |
| [`trazum position`](docs/commands.md#where-the-month-stands-trazum-position) | Where does the month stand against every ceiling? *Measured, denominators attached, no forecast anywhere.* |
| [`trazum from-claude-code`](docs/commands.md#the-agents-own-bill-trazum-from-claude-code) | What did my Claude Code sessions cost? *Reads the transcripts already on disk — the numbers only, never the words.* |
| [`trazum from-otel`](docs/commands.md#the-universal-cost-lens-trazum-from-otel) | What did the LLM calls in my OpenTelemetry export cost? *Reads the GenAI spans any exporter already emits — the counts only, never the prompts.* |
| [`trazum from-litellm`](docs/commands.md#the-gateway-everybody-already-runs-trazum-from-litellm) | What did the calls my LiteLLM proxy logged cost? *Reads the spend log the gateway already writes — the counts only, never the prompts, keys or addresses on the same row.* |
| [`trazum from-helicone`](docs/commands.md#the-proxy-that-kept-every-request-trazum-from-helicone) | What did the requests my Helicone proxy kept cost? *Prices the model that answered, not the one that was asked for, and counts the substitutions.* |
| [`trazum switch`](docs/commands.md#when-does-the-switch-pay-trazum-switch) | Should we move this traffic, and when does moving pay? *Measured delta, declared migration cost, break-even as division on the past — and the required evaluation itself priced.* |
| [`trazum ownrate`](docs/commands.md#the-model-you-run-yourself-trazum-ownrate) | What does my self-hosted model cost per million tokens? *Your GPU rate over your measured throughput — derived from your declaration, never guessed.* |
| [`trazum bench`](docs/commands.md#this-machine-measured-trazum-bench) | How fast is Trazum here, and on what? *One shot per workload, no judgement — run it before and after a change.* |
| [`trazum write`](docs/commands.md#you-describe-it-it-asks-trazum-write) | What should this prompt say, and what will it cost before I ever send it? *Asks; nothing is generated.* |
| [`trazum rules`](#what-it-actually-does) | Which rules exist, and what does each one do? |
| [`trazum feedback`](docs/commands.md#telling-us-something-trazum-feedback) | Where do I report this, and what will you ask me for? *Sends nothing.* |

## Getting started

```bash
npx @trazum/cli init
```

No install, no key, no network. It reads what is already here — your prompts,
which provider your code calls, a usage log if one is lying around — writes a
config out of what it can actually justify, and prints the single most valuable
thing it found. See [the first five minutes](#the-first-five-minutes-trazum-init).

Or start from one file:

```bash
npx @trazum/cli optimize your-prompt.txt --cost
```

Either way, keep it around:

```bash
npm install -g @trazum/cli     # the terminal
npm install @trazum/core       # the library
npm install @trazum/mcp        # the MCP server, for an agent
```

Or hand the whole thing to Claude Code as a plugin — the `trazum` skill plus
the MCP server, installed together, nothing else to configure:

```bash
claude plugin marketplace add Davmunrey/Trazum
claude plugin install trazum@trazum
```

The plugin's skill is [the same document](plugin/skills/trazum/SKILL.md) this
repository's own agents work from, derived by
`scripts/build-plugin-skill.mjs` with only the invocation changed — a test
fails the build if the two drift apart in any other way.

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

### The first five minutes: `trazum init`

```bash
npx @trazum/cli init
```

```
What is here

  Running inside a terminal.
  1 prompt file found.
  Usage log found: usage.jsonl.

What the config would say
  + usage.model  100% of the measured bill went to claude-opus-5
  + usage.callsPerMonth  240 calls over 30 days, stated as 240 a month
  + usage.avgOutputTokens  96000 output tokens over 240 calls averages 400
  · usage.cacheHitRate  this log has no cache columns at all, which is not the same as a hit rate of zero
  · usage.batchEligible  whether the work can wait for a batch window is a product decision, and no log records it
  · labels  1 label in the log, and nothing here proves which prompt file sends which
  · spend.maxUsd  a budget is a policy, so it is yours to set — the measured figure is $38.40 over 30 days

The most valuable thing found
  240 calls labelled "classify" went to Claude Opus 5 over 30 days.
  They cost $38.40.
  The same work fits Claude Sonnet 5, which is cheaper per token.
  The Batch API halves both halves of the bill, for work that can wait.
  Together: $30.72 over the same 30 days.
```

It is a **detection, not a wizard**. Nothing is asked. Each line above is
something that was found — a prompt, a provider named in your code, a log —
or a key it declined **with what would settle it**. `--dry-run` prints the
config and writes nothing; `--yes` replaces one that is already there;
without it an existing config is left alone.

**Every key it writes carries the arithmetic that justified it.** A generated
config full of guessed thresholds is one nobody trusts and everybody deletes,
and it is worse than an empty one, because six weeks later it reads as a
decision somebody made.

Four things it refuses to write, and they are the interesting four:

- **A budget.** A log says what your traffic *was*; a budget says what it *may
  cost*, which no log can answer. "The measured month plus twenty per cent"
  would be this tool inventing a threshold and then grading you against it. So
  the measured figure is handed over and the limit stays yours.
- **A monthly rate from a short window.** Twenty-eight days minimum, so every
  weekday appears the same number of times. Four days multiplied by seven is a
  forecast wearing a measurement's clothes.
- **A cache hit rate from a log with no cache columns.** Not recorded is not
  not-happened. Writing `0` there would tell every later caching advisory that
  caching is doing nothing — a finding invented out of a missing field.
- **`batchEligible`, in either direction.** Whether the work tolerates a batch
  window is a product decision, and no log records it. `false` would quietly
  delete the batch lever from every report; `true` would sell a saving on
  latency nobody agreed to give up.

It also declines a model when your code names a *provider* and no model. `where`
prints a provider's default because a reader can see it is a guess; a config
file cannot.

No usage anywhere? It says so, and points at
[docs/usage-logs.md](docs/usage-logs.md) — Anthropic, OpenAI, the Vercel AI SDK
and an OTel collector, with records you can copy.

`trazum init --json` is the same proposal as data, including every declined key
and its reason — [contracted in docs/json-output.md](docs/json-output.md#the-first-run-document).
It writes nothing.

### CLI

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

```
Input tokens
  190 → 137   -27.9% (estimated, ±6%)

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

The other forty-three commands, each with its own chapter in [the command
reference](docs/commands.md):

```bash
trazum doctor                        # survey the whole workspace
trazum plan usage.jsonl              # the findings as a ranked plan
trazum verify plan.json --against new.jsonl   # did it work?
trazum history reports/              # the long run, from stored reports
trazum connect anthropic             # your bill, read from the provider
trazum store                         # what is kept, and what a prune takes
trazum watch --once                  # did anything cross, this afternoon
trazum serve                         # answer before the call is sent
trazum rollup a.json b.json          # several people's bills, one roll-up
trazum profile usage.jsonl --html-out report.html   # the report somebody forwards
trazum pulse --max-stale-hours 36    # did anything stop running?
trazum bench                         # how fast is Trazum on this machine
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
- uses: Davmunrey/Trazum@6a28e556fa688f615b65d5c6c1d1f622f1baab81  # 1.81.0
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
  - uses: Davmunrey/Trazum@6a28e556fa688f615b65d5c6c1d1f622f1baab81  # 1.81.0
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
- uses: Davmunrey/Trazum@6a28e556fa688f615b65d5c6c1d1f622f1baab81  # 1.81.0
  with:
    usage-log: logs/yesterday.jsonl
    max-usd: '50'            # exit 1 over budget — no period assumed
    # against: logs/day-before.jsonl
    # max-growth-usd: '10'
    # label: chat            # one workload's budget
    # since: '2026-08-11'    # one period's — until includes its whole day
    # until: '2026-08-17'
```

The profile report lands in the run summary either way, and a failing gate
still writes it — a red build with no report is a mystery, and mysteries get
deleted from pipelines.

**The report leaves the terminal in three shapes.** `--markdown-out` for a CI
summary or a PR comment, `--csv-out` for whoever signs off the bill (one row
per workload and model, no total row, empty cells where dollars are unknown),
and `--json` for anything built on top — documented field by field in
[docs/json-output.md](docs/json-output.md), with a `schemaVersion` and a test
that fails if the two ever disagree. Point `profile` at a **directory** and a
month of rotated logs is read in name order as one bill.

Or by hand, if you already have the repo checked out:

```yaml
- run: npm ci && npm run build
- run: node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

### The rest of the commands, in their own book

`optimize`, `check` and `init` above are the front door. Every other
command has its own chapter — same prose, same worked examples, one page —
in **[the command reference](docs/commands.md)**: the
measured multiplication (`--from-log`), the cache reorder, the CI baseline,
the fleet, the plan and its verification, the provider pull, the gateway,
the evaluations that spend money and say so first, and everything else the
[table above](#the-forty-four-commands) links to.

`trazum --version` prints the version on its own, and works when your config is
broken — which is exactly when somebody is asking.

### Web

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/web-dark.png">
    <img src="docs/assets/web-light.png" alt="The Trazum web app: the grouped rail on the left with direct GitHub, npm and documentation links; a wordy support prompt in the middle; and on the right a result panel reading minus 29.8 percent, 258 to 181 input tokens, and $3.85 a month saved." width="820">
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

The drop zone reads more than logs. A **Claude Code project folder** —
`~/.claude/projects` as it sits on disk — prices every transcript in the page,
labelled by project, with the counts crossing and never the words. An
**OpenTelemetry export** prices its GenAI spans the same way. And a **price
card** — an OpenRouter `/models` response, or the same overlay JSON a
`--pricing` file holds — widens the catalogue every figure in the tab prices
with, so a model the bundled snapshot has never met (your Qwen, your
self-hosted rate from [`trazum ownrate`](docs/commands.md#the-model-you-run-yourself-trazum-ownrate))
gets the same exact arithmetic, still without a single request leaving the page.

**Under the report, the rest of the loop.** The ranked plan — each action with
its money as a projection *or* a measured stake and never both, the typed
assumption it rests on, and the command that would check that assumption — and
below it, *Did it work?*. **Save plan.json** writes byte-for-byte what
`trazum plan -o` writes, so a plan made in a tab can be committed, gated on in
CI, and opened back here later. Opening a saved plan turns the log in the tab
into the check on it: three outcomes, never two, with the three cannot-tell
reasons kept distinct. Saved as a file rather than offered as a link, because a
link would mean this page storing somebody's bill somewhere — an access-control
question nobody has designed. [The plan format is documented](docs/plan-format.md).

**A guided tour walks the public tabs** — Optimise, Write, Compare, Bill and
the Playground — ringing each panel in place with a sentence on what it
answers. It never auto-plays: a first visit is offered it once, and the compass
in the rail starts it any time after. The **Playground** tab is the CLI itself
in the page — ten commands that spend nothing and touch no network, over
sample files already loaded, through the same `@trazum/core` functions the
terminal runs, so `trazum profile usage.jsonl` can be tried before anything is
installed, against data that never existed outside the browser.

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

Set three variables and the sidebar grows a **Sign in** button at its foot:

```sh
TRAZUM_GITHUB_CLIENT_ID=Iv1.xxxx
TRAZUM_GITHUB_CLIENT_SECRET=xxxx
TRAZUM_PUBLIC_URL=https://trazum.example
```

A fourth, `TRAZUM_DATABASE_URL`, points it at any Postgres so sign-in survives a
restart; without it sessions live in memory and the account menu says
"temporary session". Trazum asks GitHub for `read:user` and nothing else, **never stores
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

Reports are available in **English and Spanish** (`--locale es`, or the
browser's language on the web). A locale changes the report, never the
optimisation: same optimised text, same token counts, same advisory ids in
either language. The full story — what is translated, what is deliberately
not, and how the report and the prompt each pick their language — is in
[the command reference](docs/commands.md#languages).

## Connecting your own LLM

The optional LLM pass (`--suggest`, `eval`, `route`) speaks to whichever
OpenAI-compatible or native endpoint you configure by environment — vLLM,
Ollama, OpenRouter, Anthropic, Gemini, Bedrock and Vertex included, keys
never stored. Configuration, refusals and the `--pricing-live` overlay are
in [the command reference](docs/commands.md#connecting-your-own-llm).
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
| Cache read | 10% of input on Anthropic, OpenAI, Moonshot and DeepSeek; **25%** on Google and xAI |
| Cache write | 125% of input on Anthropic; 100% elsewhere |
| Cache minimum | **Per model, not per provider.** Anthropic alone spans 512 to 4,096; 1,024 on OpenAI, Moonshot, DeepSeek and xAI; 2,048 on Gemini Pro and 1,024 on Flash |
| How caching starts | You mark the prefix on Anthropic and Google; it is **automatic** on OpenAI, Moonshot, DeepSeek and xAI |
| Batch API | 50% on Anthropic, OpenAI, Google and Mistral; **none at all** on Moonshot, DeepSeek and xAI |
| Prompt caching | **None at all** on Mistral |

**The cache minimum is the row to read twice, and it used to be wrong here.** This
table said *"512 on Anthropic"* flatly. Anthropic's floor is a property of the
model: 512 on Fable 5, Mythos 5 and Opus 5; 1,024 on Opus 4.8, Sonnet 5 and
Sonnet 4.6; 2,048 on Opus 4.7; **4,096 on Opus 4.6 and Haiku 4.5**. A reader on
Haiku who trusted "512" would have built a prefix eight times too short and been
told caching would save money that could never arrive — the one direction this
tool must never be wrong in. `trazum models` prints the real figure per model,
and every cache advisory has always used it; only this table was wrong.

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

The command the rest of the product orbits: hand it a usage log (or a
directory of rotated ones) and it reads what the provider actually charged —
the spend split, whether caching paid for itself, conversation growth, the
answers cut off mid-generation, and the levers that would genuinely move
the bill, priced from your own calls. It reads counts, never content; a
session key groups and is never printed; a model it cannot price is named
and kept out of the totals rather than silently absorbed.

The full chapter — the record format, `--against`, `--what-if`, the cache
post-mortem, the conversation ceiling, every gate — is in
[the command reference](docs/commands.md#where-the-money-actually-went-trazum-profile).

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

A dependency-free estimator with a **band measured per kind of text** — ±4% on
CJK, ±6% on Latin prose, ±26% on code and markup, ±33% on tabular numbers —
measured over 47 samples in ten languages, where the worst error in each bucket
is 3.2%, 5.6%, 25.1% and 32.5%. Language-aware because one English divisor was
37% wrong on German. `--exact-tokens` settles any doubt
against the provider's free counting endpoint. The measurement story is in
[the command reference](docs/commands.md#token-counting).
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
packages/mcp/      dependency-free MCP server — five tools over stdio
  src/rpc.ts         JSON-RPC 2.0 by hand; the invariant beat the SDK
  src/tools.ts       the whole surface an agent can reach, in one file
apps/web/          Next.js (App Router) — Optimise, Compare, Your bill, Library
action/            the packaged GitHub Action that comments on pull requests
scripts/           release notes, the token-band harness, rollback recovery
```

## Updating prices

`packages/core/src/pricing.ts` is the single source of truth, reviewed on a
stated date; overlays (`--pricing`) and the live OpenRouter feed
(`--pricing-live`) correct it without an upgrade. The recipe and its guards
are in [the command reference](docs/commands.md#updating-prices).
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

## The rest of the documentation

This README is one of four documents, and it is the only one written for
somebody who has not decided yet. **[docs/README.md](docs/README.md) is the
index**, arranged by what you came here to do rather than by what the files are
called: choosing the tool, using it, extending it, maintaining it, or reporting
a problem.

The four you are most likely to want directly:

- **[docs/doctrine.md](docs/doctrine.md)** — the rules this product refuses to
  break, each one discovered by getting it wrong first. It is the argument for
  why a figure printed here is worth reading.
- **[docs/our-own-medicine.md](docs/our-own-medicine.md)** — the same standard
  turned on this project: what it refused to ship, what it got wrong and for how
  long, and what it cannot say about itself.
- **[docs/usage-logs.md](docs/usage-logs.md)** — what Trazum can read from your
  logs, and what each optional field unlocks if you start writing it.
- **[docs/json-output.md](docs/json-output.md)** — every machine-readable
  document, field by field, with the provenance each one carries.

## Roadmap and contributing

[ROADMAP.md](ROADMAP.md) covers what is planned and why, and the history that
got here, oldest first.
[CONTRIBUTING.md](CONTRIBUTING.md) covers adding a rule or a language, and
[docs/authoring-rules.md](docs/authoring-rules.md) is the full walkthrough for a
rule.
[VERSIONING.md](VERSIONING.md) covers what counts as public API.
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers what is expected of everyone
taking part, and is honest about what a single-maintainer project can promise.
[SUPPORT.md](SUPPORT.md) covers what gets answered and how fast;
[SECURITY.md](SECURITY.md) covers reporting a vulnerability privately.
