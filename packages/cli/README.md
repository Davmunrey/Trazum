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
  190 → 137   -27.9% (estimated, ±15%)

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
