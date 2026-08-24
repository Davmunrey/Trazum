---
name: trazum
description: Optimise a prompt to cost fewer tokens, or check one against a token budget. Use when asked to shorten, optimise, or cut the cost of a prompt or system prompt; when asked what a prompt costs per month; when asked whether a prompt fits a token budget; or when reviewing a change to a prompt file. Also use when asked to find contradictory instructions or redundant few-shot examples in a prompt.
---

# Trazum — prompt optimiser

Shortens a prompt without changing what it asks for, prices the saving, and
reports what would save more than shortening ever will.

The engine is deterministic: same input, same output, no API key, no network
call, nothing to pay. Do not reach for a model to do what the rules already do.

## Before anything else

Build once per session:

```bash
npm install && npm run build
```

Then `node packages/cli/dist/index.js` is the entry point. If Trazum is
installed globally the command is just `trazum`.

## Optimising a prompt

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

Useful flags:

| Flag | Use it when |
|---|---|
| `--level aggressive` | The user accepts nuance changes. **Always show the diff after using this.** |
| `--calls <n>` `--output-tokens <n>` | You know the real usage — the dollar figures are meaningless without it |
| `--model <id>` | Pricing against something other than Claude Opus 5 (`models` lists them) |
| `--diff` | Any time a human will read the result |
| `--json` | You need to parse the report |
| `-o <file>` | Writing the optimised prompt somewhere |
| `--locale es` | The user is working in Spanish |

Redirecting output writes **only** the optimised prompt, so it pipes cleanly:

```bash
cat prompt.md | node packages/cli/dist/index.js optimize - > prompt.optimised.md
```

## Checking a budget in CI

Exits 1 when the prompt busts the budget, and says whether optimising would be
enough:

```bash
node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

Given a **directory** it checks every prompt inside against the `budgets`
patterns in `trazum.config.json` — use this when the user asks about a folder of
prompts rather than running the command once per file:

```bash
node packages/cli/dist/index.js check prompts/
```

Rows marked `(no budget)` are real findings, not noise: that file is not covered
by any pattern, so nothing is watching it. Mention them. If the command errors
with *"No budget covers anything"*, the fix is a `budgets` entry or
`--max-tokens` — do not present that error as "the prompts are fine".

## Where the money actually went

When the user asks what their LLM bill is made of — rather than what one prompt
costs — this is the command, and it is the only one that reads real usage instead
of a file:

```bash
node packages/cli/dist/index.js profile usage.jsonl
```

The log is one JSON object per line, each with a `model` and the `usage` object
the API returned. If the user does not have one, tell them it is three lines to
record and that it never contains prompt text — the record shape has no field for
content. A directory of rotated logs works too, gzipped files included, read in
name order as one bill.

The drill-downs and gates, when the user's question calls for them:
`--label <name>` profiles one workload; `--since`/`--until` one period (a UTC
day, a full timestamp, or `7d`/`24h`); `--against <previous.jsonl>` names the
drivers of a change per label and per model; `--what-if <model>` prices these
exact calls at another rate card — quote its caveat with its figure, because it
is multiplication and knows nothing about whether the model could do the work.
For CI, `--max-usd`, `--max-day-usd` (the worst single UTC day — the gate a
total cannot arm), `--max-growth-usd` and `--max-cache-loss-usd` exit 1 over
budget, and `--json`, `--csv-out` and `--markdown-out` carry the same report
into pipelines.

**Lead with "What would actually move this bill".** It is the section the command
exists for, and the one that answers the fair complaint that Trazum saves 1%. The
rules recover about 1%; which model a call goes to moves 40% to 80% and the Batch
API moves 50% flat, and both are priced there from the user's own tokens. If you
summarise the report and leave that section out, you have handed the user the
smallest lever in the tool.

Four things to get right about those levers:

- **The options under a slice are combined, never added.** The headline figure
  already accounts for both — batching a routed call discounts the cheaper model.
  Adding "route $12.60" and "batch $10.50" gives $23.10 on a slice that spent
  $21.00, which is impossible. Quote the combined figure.
- **A route is worth testing, not worth doing.** The arithmetic is exact and says
  nothing about quality. Give the user the `trazum eval --model <candidate>`
  command the report prints; never present a route as a recommendation.
- **No figure is per month.** A usage log covers whatever period was recorded and
  the tool is not told which. Say "on this bill", not "/month".
- **The prompt ceiling is a ceiling.** "Shortening prompts can touch at most X%"
  counts retrieved context and conversation history, which no prompt file holds.
  The real figure is far below it — do not quote the ceiling as an opportunity.

Three things to get right when reporting on this:

- **It reports no saving, and neither should you.** It says what was spent and
  where. Attributing "you could have saved X" to a call that already happened
  means guessing what the call should have been.
- **If output dominates, say so plainly.** On many real bills output is over half,
  and then shortening prompts has a low ceiling — the controls that move it are
  shorter answers and `max_tokens`, not the rules engine.
- **Unpriced models are named and excluded from the totals.** If the report warns
  about one, the total is lower than the real bill by that amount. Do not quote
  the total without mentioning it.
- **If it says caching cost money, that outranks everything else on screen.** A
  cache write is 1.25x plain input on Anthropic and 2x at the one-hour TTL, so a
  prefix that changes faster than it is reused pays a premium for nothing — those
  calls are cheaper with caching off. It is the one finding that contradicts the
  advice the rest of Trazum gives, so report it plainly rather than softening it,
  and never quote the cache hit rate as reassurance against it: the hit rate reads
  97.8% on a log where a workload is bleeding.
- **The per-label line is the actionable one.** A profitable cache on one workload
  and a losing one on another net out to a comfortable total. If the report names
  a label under "the total hides a loss", that label is the thing to fix.
- **If it says the log cannot settle whether caching paid off, do not pick a
  side.** A cache write whose TTL the log did not record is priced at the cheaper
  of the two rates, and that assumption moves the verdict: the same calls can pay
  for themselves at 1.25x and lose money at 2x. The report prints both figures and
  refuses to choose; report it the same way, and tell the user the fix is
  recording the `cache_creation` object the API already returns.

## When the user has no usage log but uses Claude Code

They already have one — they just have not converted it. Claude Code writes a
transcript per session under `~/.claude/projects/`, and each assistant line
carries the API's own `usage` object, cache TTL split included:

```bash
node packages/cli/dist/index.js from-claude-code ~/.claude/projects -o usage.jsonl
node packages/cli/dist/index.js profile usage.jsonl
```

Three things to get right when offering this:

- **Only the numbers cross.** The conversion reads model, timestamp, session
  id and usage; message text, file paths and branch names never enter the
  log. Say this — it is the reason the user can accept the offer.
- **The stderr summary is part of the answer.** Collapsed lines (one API call
  is written as one line per content block; counting lines overbills by a
  third), streamed calls, and everything passed over are stated there. If
  the summary reports **disagreements**, surface that loudly — it is a
  finding about the transcript, not bookkeeping.
- **`--label-from-project` labels by project directory name**, which is
  path-shaped. Offer the config's `labels` block to map it to a workload
  name before quoting per-label figures from it.

## When the user already has OpenTelemetry spans

If their LLM calls are instrumented with OpenTelemetry's GenAI semantic
conventions, the spans already carry the counts — `trazum from-otel` reads the
OTLP/JSON any exporter produces without them reshaping anything:

```bash
node packages/cli/dist/index.js from-otel spans.otlp.json -o usage.jsonl
node packages/cli/dist/index.js profile usage.jsonl
```

Three things to get right when offering this:

- **Only the numbers cross.** The conversion reads the model
  (`gen_ai.request.model`/`gen_ai.response.model`), the timestamp
  (`startTimeUnixNano`), a label (the span's `gen_ai.operation.name` or the
  resource's `service.name`) and the `gen_ai.usage.*_tokens` counts; prompt
  content, trace ids and every other attribute never enter the log. Non-LLM
  spans are counted and skipped, never priced.
- **The cache verdicts will read "cannot tell", and that is correct.**
  OpenTelemetry has not standardised the cache-write TTL split, so an
  OTel-sourced record carries no `cache_creation`. Do not pick a side — the
  same refusal as the missing-TTL case above. If the user wants the caching
  verdict, the fix is emitting the `cache_creation` object, not guessing it.
- **`--label-from-service` labels by the resource's `service.name`**, so a
  per-service bill falls out by itself.

Other exporters' formats (LangSmith, Helicone, LiteLLM) are named as next but
not built: offer `from-otel` for OTLP, and for a vendor format, offer to add a
converter once the user can share a real export of it.

## When the log has no labels

If the report says **none of these calls carried a label**, do not quote the levers
as though they described one workload. Without a label every call looks alike, so a
classifier and a RAG pipeline merge into one row and a single route is offered for
both.

Tell the user to add `label` to the record. It is one line, and it is what turns
"up to $19.84 on unlabelled" into a figure somebody can act on.

The same caveat is louder in `trazum route`, which measures exactly one prompt: on
an unlabelled slice the money may cover calls the measurement never touched. Report
the verdict and the caveat together or neither.

## What re-sending the conversation costs

On a chat or agent bill this is routinely the largest single line, and it is
invisible to every other command: a prompt file shows the system prompt and not the
history. `profile` measures it when the log carries a `session` (or
`conversation_id`) field.

If the report says **no call carried a session**, that is not a clean bill of
health — it is the question going unasked. Tell the user to add the field; it is one
line, and Trazum never prints the value.

Three things to get right when reporting it:

- **It is a ceiling, not a saving.** "At most $26.40 of this bill is conversation
  growth" counts the user's own new messages, which nothing can truncate away.
  Never quote it as an opportunity or add it to other savings.
- **Never ask for the session key in a message, and never repeat it.** It is often
  an account id or an email. Trazum groups by it and prints nothing derived from it;
  do the same.
- **The control is the history you replay**, capped or summarised — not the prompt,
  and not the model.

## Is the cheaper model good enough?

When the profile names a route worth money, this is the command that settles it —
and it is the only way to settle it. `trazum eval --model <id>` does **not** test a
route: `eval` runs against whatever `TRAZUM_LLM_MODEL` says and `--model` only
prices the report.

```bash
node packages/cli/dist/index.js route usage.jsonl \
  --prompt-file prompts/support.txt --cases cases.txt --yes
```

**Costs three provider calls per case** — two on the original model, one on the
candidate — so never run it without saying so first. Without `--yes` it prints the
count and calls nothing.

Three things to get right when reporting the result:

- **The yardstick is the original model's own variance, not 100%.** A 94% match is
  a pass when the original self-agrees 91%, and alarming when it self-agrees 100%.
  Quote both figures or neither.
- **`INCONCLUSIVE` is an answer.** It means the original was too inconsistent on
  these cases to judge anything against. Report it as it stands and suggest more
  cases; do not round it to the nearest verdict.
- **Agreement is not correctness.** This measures whether the answers moved, not
  whether they were ever right. Say so even when the verdict is good — especially
  then.

## Stopping the estate drifting upwards

A budget is a ceiling. It says nothing while a prompt climbs from 800 tokens to
1,900 under a limit of 2,000, and that climb is what actually happens to a
repository — nobody adds a thousand tokens in one commit.

`trazum baseline` records what the prompts cost **now**, into a file the user
commits:

```bash
node packages/cli/dist/index.js baseline prompts/
```

Then `check` gates on drift away from that record as well as on the ceiling, when
`trazum.config.json` declares one:

```json
{ "baseline": { "path": "trazum.baseline.json", "maxGrowthTokens": 500 } }
```

Either `maxGrowthTokens` or `maxGrowthPct` is required — a baseline with no
threshold gates nothing. `--no-baseline` skips the gate for one run.

Three things to get right when reporting on this:

- **The gate is in tokens, not dollars.** Prices move on somebody else's schedule
  and a price change is not a regression in the prompts. The baseline carries the
  money it was recorded under, and the report shows the comparison only when the
  scenario and the pricing date still match — otherwise it says why not. Do not
  present a dollar delta the tool declined to make.
- **Added files count.** A new prompt is real growth; a baseline that ignored it
  would be gamed by adding files instead of editing them.
- **Re-recording is how you accept growth**, and it should be a visible commit.
  If the user's answer to a breach is to re-record, say that the diff is the
  record of the decision.

## Reporting into a pull request

`--markdown-out <file>` on `check` or `diff` writes the same report as
GitHub-flavoured markdown. Use it when the user wants the numbers somewhere other
than a terminal.

The packaged Action writes that file to the run summary on every run, and posts
it as a PR comment with `comment: true` plus `github-token` and
`pull-requests: write` on the caller's workflow. **The Action cannot grant itself
that permission** — if the user's comment is not appearing, check their
`permissions:` block first.

On a pull request from a fork the token is read-only and the comment will not
post. That is expected. **Never suggest `pull_request_target` as the fix** — it
runs a writable token against code the contributor controls. The run summary is
the answer.

## The config file

`trazum.config.json`, found by walking up from the working directory. Seventeen
keys, and an unknown one is a hard error rather than a silent no-op:

| Key | What it settles |
|---|---|
| `level` `locale` `disable` | Which rules run, in which language |
| `usage` | The scenario every dollar figure is projected over |
| `budgets` | Per-pattern token ceilings for `check` on a directory |
| `labels` | How a raw label maps to a workload name |
| `spend` | The dollar gates: `maxUsd`, `monthlyUsd`, `maxDayUsd`, `maxSessionUsd`, `maxCacheLossUsd`, `byLabel`, `bySource`, `substitute` |
| `limits` | The enforcement policy every door reads before a call: `dayUsd`, `sessionUsd`, `byLabel` — positive USD ceilings, judged identically at the gateway, `serve` and `spend_guard` |
| `sources` | Where `--by-source` finds each fleet member's log |
| `store` | `keepDays` for the rolling record |
| `waive` | A named gate, a reason and an expiry — every use is recorded |
| `maxGrowth` `baseline` | Drift away from a committed record, not just the ceiling |
| `extensions` | Which file types count as prompts |
| `ignore` | Which paths are not prompts — test fixtures and corpora share the extension |
| `pricing` | An overlay adding or overriding models |
| **`outcomes`** | **`values` and `success` — the vocabulary that makes cost per outcome, the quality gate and experiments possible. Nothing is inferred; if this is absent those commands refuse rather than guess.** |
| `ladders` | `tiers` and `escalateOn` for the escalation ladder |
| `owners` | Whose budget a label belongs to |

**`outcomes` is the one to suggest first when a user asks whether a change made
things worse.** Without it Trazum can say a workload got 40% cheaper and cannot
say whether it stopped working.

Flags beat the config; the config beats the defaults. When suggesting a setting a
project will reuse, put it in the config rather than repeating flags in every CI
step. A boolean the config turned on comes off with `--no-batch`.

An unknown key is a hard error with a suggestion — if the user hits one, the fix
is the spelling, not a workaround. Do not advise deleting the config to get past
it.

## Checking the shorter prompt still works

```bash
node packages/cli/dist/index.js eval prompt.txt --cases cases.txt --level aggressive
```

Runs both versions over a set of inputs. **Costs three provider calls per
case** and needs `TRAZUM_LLM_*` configured, so never run it without saying so
first.

Read the verdict, not the raw percentage. The original is run twice per case to
measure the model's own variance, and that self-agreement is the yardstick — a
64% match with the original is fine if the original only self-agrees 66%, and
alarming if it self-agrees 100%. `inconclusive` means the baseline was too
noisy to judge anything; report that honestly rather than picking the nearest
verdict.

Exits 1 on `diverges`.

## Reviewing an edit to a prompt

When someone has changed a prompt and wants to know whether the change is fine
— a pull request, a "does this look right?", a before/after in the
conversation — this is the command, not `optimize`:

```bash
node packages/cli/dist/index.js diff old.txt new.txt --calls 50000
```

**Every number it prints is `after - before`, so positive means worse.** That
is the opposite of every other Trazum output, where positive is a saving. Do
not describe a `+37` token delta as a saving of 37 tokens.

It reports what the edit broke, not only what it cost: advisories that appeared
and rules that started firing, and the same in reverse when the edit improved
things. Lead with a new `contradictory-instructions` over any token figure — a
correctness regression matters more than the cost of it.

It measures the text **as written**, which is what a reviewer is being asked
about. Pass `--optimized` only if the user already runs Trazum in their
pipeline and cares about what actually reaches the model.

Exits 0 on growth alone. It exits 1 only when `--max-growth <pct>` was given
and exceeded, so suggest that flag when the user wants CI to block a regression
— without it, nothing fails.

## From code

```ts
import { optimize } from '@trazum/core';

const result = optimize(prompt, {
  level: 'safe',
  usage: { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 500,
           cacheHitRate: 0.9, batchEligible: false },
});

result.optimized;                    // the shortened prompt
result.savings.monthlySavingsUsd;    // projected saving
result.advisories;                   // everything below
```

## How to read the report

The token reduction is usually **not** where the money is. Read the advisories
first — they are sorted warnings-first, then by monthly saving.

- `contradictory-instructions` — **a correctness bug, not a saving.** Two
  instructions disagree about the response language, output format, length, or
  whether to show reasoning. Surface this to the user before anything else; the
  model picks one, and which one can change between calls.
- `cache-prefix-reorder` — stable instructions sitting *after* the first
  `{{placeholder}}` never cache. Moving them in front is often the single
  largest saving available.
- `prompt-caching` / `below-cache-minimum` — caching is a byte-for-byte prefix
  match, so a template only caches up to its first placeholder.
- `model-downgrade` — a keyword heuristic, not a quality judgement. Present it
  as something to validate with evaluations, never as a recommendation to apply.
- `output-dominated` — the prompt is not the problem; the answer length is.
  Shortening the prompt has a low ceiling here, and saying so is more useful
  than reporting a 2% win.
- `redundant-examples` — few-shot examples that are near-copies of an earlier
  one. Read them before deleting: one may be a boundary case on purpose.

## Rules

`node packages/cli/dist/index.js rules` lists all of them with their ids.

- **safe** — no semantic risk: courtesy, filler, verbose phrasing, duplicated
  paragraphs, whitespace.
- **aggressive** — can change nuance: intensifiers, hedges, self-verification
  requests, near-duplicate paragraphs.

Turn individual rules off with `--disable id1,id2`.

## What it will not touch

Code fences, inline code, URLs, template placeholders (`{{x}}`, `${x}`, `{x}`,
`{% %}`) and XML/HTML tags are isolated before any rule runs. If a rule would
make one disappear, that rule is dropped and the rest continue. You can rely on
this: the optimised prompt will not have broken someone's JSON schema.

## Things to get right

- **Token counts are estimates (±10%).** Fine for comparing two versions of the
  same prompt, which is what they are for. For exact figures use
  `--exact-tokens` with `ANTHROPIC_API_KEY` set — the counting endpoint does not
  charge for tokens. The band is measured against Claude's tokenizer over
  twenty-one samples; against a non-Anthropic model the report drops it and says
  so, and you should not reinstate it.
- **A percentage is more trustworthy than a total.** The estimator's error is
  largely a per-language constant, so it mostly cancels in a before/after ratio:
  `-27.9%` survives an error that moves both totals. Lead with the percentage
  when the numbers are estimated, and reach for `--exact-tokens` before quoting
  an absolute figure somebody will budget from.
- **Savings are projections over the scenario given**, not billing. Pass real
  `--calls` and `--output-tokens` or say the numbers are illustrative.
- **Output tokens are held constant** in the calculation. The reported saving
  comes from input only.
- **Never present aggressive-level output without the diff.**
- Prices come from `packages/core/src/pricing.ts`; `PRICING_LAST_REVIEWED` says
  when they were checked. Mention it if the user is budgeting.

## The optional LLM pass

`--llm` adds semantic compression the rules cannot do. It costs one call, needs
`TRAZUM_LLM_*` configured, and is **not** needed for ordinary use — the
deterministic pass is free and does most of the work. The candidate is only
accepted if it is shorter and leaves protected content byte-identical;
otherwise the deterministic version stands.

It also reviews few-shot examples, in a second call, and only when the prompt
has at least two. That review reports examples the model thinks teach the same
thing — the paraphrase case word overlap cannot separate from two genuinely
different examples. **Surface it as a suggestion, never apply it silently:** an
example that looks redundant may be a boundary case someone added on purpose.
