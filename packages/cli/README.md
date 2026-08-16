# @trazum/cli

Optimise prompts, enforce token budgets in CI, and price the saving — from your
terminal.

**Zero runtime dependencies**, asserted in CI. This tool reads your prompts;
every dependency would be someone else's code reading them too.

Part of [Trazum](https://github.com/Davmunrey/Trazum). For the library, see
[`@trazum/core`](https://www.npmjs.com/package/@trazum/core).

```bash
npm install -g @trazum/cli
```

## Commands

| | |
|---|---|
| `trazum optimize <file>` | shorten it, and price what that is worth |
| `trazum check <file\|dir>` | does it fit its budget, and has the repo drifted past its baseline — exits 1 when either fails |
| `trazum baseline [dir]` | what the prompts cost now, recorded to a file you commit |
| `trazum profile <log.jsonl>` | where the money actually went — reads a usage log, not a prompt |
| `trazum route <log.jsonl>` | is the cheaper model good enough? — measured, and it asks before spending |
| `trazum doctor [dir]` | the whole workspace: what nothing is watching, and what fixing would be worth |
| `trazum rank <dir>` | of these forty prompts, which is worth an afternoon |
| `trazum prune <file> --cases <file>` | which few-shot examples earn their tokens — measured, and it asks before spending |
| `trazum diff <before> <after>` | somebody edited this; did it get worse? |
| `trazum blame <file>` | who made this prompt expensive, and when |
| `trazum eval <file> --cases <file>` | does the shorter prompt still work |
| `trazum where [file]` | which prompts hide in my source files, and which model they call |
| `trazum models` · `trazum rules` | prices; what each rule does |

`trazum --help` documents every flag. Reports are available in English and
Spanish (`--locale es`); the locale changes the report, never the optimisation.

## Optimise

```bash
trazum optimize prompt.txt --calls 50000 --diff
```

```
Input tokens
  190 → 137   -27.9% (estimated, ±10%)

Cost with Claude Opus 5
  50,000 calls/month · 300 output tokens per call
  $422.50 → $409.25   saving $13.25/month (3.1%)

Beyond shortening the prompt
  → This task may not need Claude Opus 5 ~$327.40/month
  → If the work tolerates latency, use the Batch API ~$204.62/month
```

**Read the last block first.** Trimming is usually not where the money is.

Redirected output is only the optimised prompt, so it pipes cleanly:

```bash
cat prompt.md | trazum optimize - --level aggressive > prompt.optimised.md
```

## Budgets in CI

```bash
trazum check prompts/system.txt --max-tokens 2000
# FAILED 2,481 tokens busts the budget of 2,000.
#   Optimised with "trazum optimize --level safe" it would land at ~1,913 tokens and fit.
```

Point it at a **directory** to govern a whole repository in one step, using the
per-pattern budgets in `trazum.config.json`. A file no pattern covers is listed
as unbudgeted rather than skipped quietly, and a run where nothing at all was
budgeted is an error — "0 failures" from a check that measured nothing is the
most misleading thing this tool could tell you.

`--markdown-out <file>` writes the report as GitHub-flavoured markdown, for a
step summary or a pull request comment. There is also a
[packaged GitHub Action](https://github.com/Davmunrey/Trazum#cli).

## Where the money actually went

Every other command reads a prompt and reasons forward about what it *would* cost.
This one reads what the provider charged and reasons backward, because the forward
direction only sees the smallest line item — measured on an ordinary support
prompt, the rules recover about **1%** of the monthly figure while output alone was
**87%** of it.

```bash
trazum profile usage.jsonl
```

One JSON object per line, each with a `model` and the `usage` object the API
returned. Recording it is three lines and no transformer:

```ts
appendFileSync('usage.jsonl', JSON.stringify({
  model: response.model,
  label: 'support-rag',   // optional, and it is what makes the report useful
  ...response.usage,
}) + '\n');
```

OpenAI's shape works too, with the one real difference handled: it counts cached
tokens *inside* `prompt_tokens` while Anthropic reports them beside
`input_tokens`.

**It reads a file, not your traffic.** The record shape has no field for content,
so a usage log handed to Trazum cannot contain a prompt even by accident. And it
reports **no saving** — attributing "you could have saved X" to a call that already
happened means guessing what the call should have been.

A model the pricing catalogue does not know is named and kept **out** of the
totals, because a total that silently omits calls is wrong in the flattering
direction.

### What would actually move this bill

The rules recover about **1%** — measured. Which model a call goes to moves 40% to
80%, and the Batch API moves 50% flat. `profile` prices those from your log:

```
  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50

  For comparison: shortening the prompt text can touch $18.00 at the very most.
```

The options are **combined, never summed** — batching a routed call discounts the
cheaper model, so the pair is $16.80 and not $23.10 against $21.00 spent. A route
prints the `eval` command rather than a recommendation: the arithmetic is exact and
says nothing about quality. Nothing crosses a vendor, and no figure is ever "per
month" — a log covers whatever period you recorded.

### Is the cheaper model good enough? — `trazum route`

The section above prices a route and can say nothing about whether it works. This
runs the measurement:

```bash
trazum route usage.jsonl --prompt-file prompts/support.txt --cases cases.txt --yes
```

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).

  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.

  ✓ HOLDS — the difference is inside the original model's own noise.
```

**The yardstick is the expensive model's own variance**, measured on the same cases
in the same run, so the verdict is not a threshold somebody picked. Three provider
calls per case — two on the original, one on the candidate — and it prints the
count and stops unless you pass `--yes`.

It says *agreement is not correctness* on every verdict, including the good one.
This measures whether the answers moved, not whether they were ever right.

### Did the caching pay for itself?

The rest of Trazum tells you to cache. This is the one report that can say the
advice was wrong here — and the cache hit rate will not.

A cache write costs 1.25x plain input on Anthropic and **2x** at the one-hour TTL,
so a prefix that changes faster than it is reused pays that premium for nothing:

```
  Cache hit rate 97.8% of billable input.
  Caching took $0.2675 off this bill, against the same tokens uncached.
  ! The total above hides a loss: caching costs $0.1250 across rag.
```

Computed per label as well as overall — ranked by what caching cost each one, not
by the size of its bill, because the worst cache in an estate usually sits on a
small workload. Each side is priced per model, so a provider whose writes cost the
same as input is never accused of a loss it cannot have; a model added through a
`pricing` overlay can declare its own `multipliers` for the same reason.

**When the log cannot settle it, neither does the report.** A cache write whose
TTL was not recorded is priced at the cheaper of the two rates, and that moves the
verdict rather than only the total — so instead of a figure you get both, and what
to record to remove the doubt.

This is the only counterfactual here, and it is arithmetic rather than a guess:
caching changes the multiplier on a token, never the token. `--json` carries it as
`cache` and `cacheByLabel` — **positive `deltaUsd` means worse.**

## The ceiling is not the problem

A budget says nothing while a prompt climbs from 800 tokens to 1,900 under a
limit of 2,000, and that climb is what actually happens to a repository — nobody
adds a thousand tokens in one commit. A baseline records where you are now:

```bash
trazum baseline prompts/          # writes trazum.baseline.json — commit it
```

```json
{ "baseline": { "path": "trazum.baseline.json", "maxGrowthTokens": 500 } }
```

`trazum check` then gates on drift away from that record as well as on the
ceiling, and exits 1 when either fails. One of `maxGrowthTokens` or
`maxGrowthPct` is required, because a baseline with no threshold gates nothing.
`--no-baseline` skips it for a run.

**The gate is in tokens, not dollars.** Prices move on somebody else's schedule
and a price change is not a regression in your prompts. The file still records
the money it was written under and the report compares it — but only while the
scenario and the pricing date still match, and it says why not when they do not.

**Added files count**, or the gate would be defeated by adding a prompt rather
than editing one. And re-recording is how you accept growth: it is a commit, in
a diff, where a decision to spend five hundred more tokens belongs.

## Did this edit make it worse?

```bash
trazum diff old.txt new.txt --calls 50000 --max-growth 10
```

**Every figure is `after - before`, so positive means worse** — the opposite of
every other Trazum output. The gate is opt-in: growth alone exits 0, and
`--max-growth` is what makes it exit 1. A tool that fails a build nobody armed
gets removed from the pipeline rather than fixed.

## Configuration

`trazum.config.json`, found by walking up from the working directory:

```json
{
  "level": "safe",
  "usage": { "model": "claude-opus-5", "callsPerMonth": 50000 },
  "budgets": { "prompts/**": 2000, "prompts/system.txt": 4000 },
  "maxGrowth": 100,
  "baseline": { "path": "trazum.baseline.json", "maxGrowthTokens": 500 },
  "pricing": "./prices.json"
}
```

Flags beat the config; the config beats the defaults. A boolean the config
switched on comes back off with `--no-batch`.

**An invalid config is a hard error, including an unknown key.** A lenient parser
would restore defaults silently, and for a budget the default is *no budget* — a
green build for a prompt nobody measured.

`pricing` points at a local price overlay, so correcting a published price does
not require upgrading Trazum. Every report says when overlaid prices were used.

## Does the shorter prompt still work?

```bash
trazum eval prompt.txt --cases cases.txt --level aggressive
```

Everything else Trazum reports is arithmetic; this is not. It runs the original
**twice** per case to measure the model's own run-to-run variance, and judges the
rewrite against that rather than against a determinism it never had. Costs three
provider calls per case, prints the count before spending anything, and says
`inconclusive` rather than inventing a verdict when the baseline is too noisy.

Needs `TRAZUM_LLM_*` configured. Exits 1 on `diverges`.

MIT.
