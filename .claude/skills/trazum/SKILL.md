---
name: trazum
description: Price and budget a model call before making it, and cut what a prompt costs. Works from a shell, from MCP tools, or as a library, so any agent can reach it. Use before spending on a call when trazum.config.json sets a ceiling and you do not know whether the call fits; when asked to shorten, optimise or cut the cost of a prompt or system prompt; when asked what a prompt costs per month; when asked whether a prompt fits a token budget; when reviewing a change to a prompt file; or when asked where an LLM bill actually went. Also use when asked to find contradictory instructions or redundant few-shot examples in a prompt, or to convert an OpenTelemetry, LiteLLM, Helicone, LangSmith or Claude Code usage export into a priced bill.
---

# Trazum — price a model call before you make it

Shortens a prompt without changing what it asks for, prices the saving, and
reports what would save more than shortening ever will.

The engine is deterministic: same input, same output, no API key, no network
call, nothing to pay. Do not reach for a model to do what the rules already do.

## Which door you have

**Trazum is not one program, and this skill is not written for one agent.**
The same `@trazum/core` answers a shell command, an MCP tool call and a library
import, so pick the row that matches what you can actually do here. Every
command below this section is spelled `trazum <command>`; that row says how to
spell it for you.

| You can | Use | Spell `trazum` as |
|---|---|---|
| Run a shell, in a checkout of this repository | the CLI, built from source | `node packages/cli/dist/index.js` — after `npm install && npm run build` once per session |
| Run a shell, anywhere else | the CLI, straight from npm | `npx -y @trazum/cli` — no install, fetched on first use |
| Call MCP tools but not a shell | the MCP server | **[Through MCP](#through-mcp)** below — seven tools, no shell needed |
| Import a module | the library | **[From code](#from-code)** below — `@trazum/core`, zero dependencies, browser-safe |
| None of these | the web app | <https://trazum.vercel.app> — the pure subset runs in the page |

If more than one row fits, prefer the shell: it is the whole surface, and the
other doors are subsets of it. Prefer MCP over asking a human to run something
for you.

**No door needs a credential, a network call or a payment** for the
deterministic work, which is nearly all of it. The handful that do call a model
— `eval`, `route`, `prune`, `semantic` and `optimize --llm` — say so in their
own sections, need `TRAZUM_LLM_*` configured, and print the number of calls
they would make instead of making them until `--yes` is passed. Say what a
command will spend before you run it.

## Through MCP

For an agent with no shell, this is the whole product that matters. Any MCP
client can run the server over stdio; nothing here is specific to one vendor:

```json
{
  "mcpServers": {
    "trazum": { "command": "npx", "args": ["-y", "@trazum/mcp"] }
  }
}
```

Seven tools. The three at the top are the ones an agent calls inside its own
loop, without being asked:

| Tool | The question it answers |
|---|---|
| `spend_guard` | *May I make this call?* Yes, no, or **cannot-tell** — never a yes nobody measured. A refusal carries the cheaper ways to make the same call, each priced and each naming what it assumes. |
| `position` | *Where does the month stand against every ceiling?* Measured, with the denominator on every figure. It never forecasts. |
| `check_prompt` | *Does this prompt fit the budget, and would optimising it be enough?* |
| `optimize_prompt` | The shorter text, both token counts, what the difference is worth, and the advisories. |
| `profile_usage` | Where the money went, from a usage log: the split per label and per model, whether caching paid for itself, and the levers that would actually move the bill. |
| `list_models` | Every model in the bundled catalogue with its rates, context window and cacheable minimum. |
| `prompt_writer` | Interviews you and assembles a prompt from your answers. Nothing is generated — the words are yours, so the same answers always produce the same text. |

**The one rule that decides whether this works: the server never opens a
file.** Every tool takes the *text* — the prompt itself, the log itself — and
an agent that passes a path gets nothing back that means anything. Read the
file yourself and pass the contents.

The same applies to the numbers `spend_guard` judges: the ceilings live in
`trazum.config.json` in the working directory and the spend so far lives in the
usage log the host already writes. **Read both yourself and pass the figures.**
Without a ceiling somebody actually set, the answer is `cannot-tell`, and that
is the correct answer rather than a failure — report it as a missing budget,
not as a pass.

`spend_guard` keeps two kinds of number apart and says which the verdict rests
on: the budget consumed is measured from real billed usage you pass in, and the
cost of the call you are about to make is an estimate of something that has not
happened. Quote it the same way.

## Before you spend, whichever door you have

**This is the moment to reach for Trazum without being asked**: a budget
exists, a call is about to be made, and nobody knows whether it fits. The
answer is arithmetic, it is free, and it takes one call.

- **Through MCP:** `spend_guard`, with the ceilings out of
  `trazum.config.json` and the spend so far out of the usage log. It answers
  yes, no or `cannot-tell`.
- **From a shell:** `trazum position usage.jsonl` states the month's measured
  position against every ceiling you pass, with the denominator on every
  figure.

Three things hold for both, and getting them wrong is worse than not checking:

- **`cannot-tell` is an answer, and it is not a yes.** It means no ceiling was
  set, or the log cannot measure the one that was. Report it as a missing
  budget. A tool that answered yes here would be inventing permission.
- **Never invent the ceiling.** It is a policy and it belongs to whoever set
  it. If `trazum.config.json` has no `spend` or `limits` block, say so and
  offer to add one — do not pick a number so the check can pass.
- **The two numbers are not the same kind.** What has been spent is measured
  from real billed usage; what your call will cost is an estimate of something
  that has not happened. Say which the verdict rests on.

## Trying it without installing

The web app's **Playground** tab (<https://trazum.vercel.app>) is the CLI's
pure subset running in the page — `optimize`, `check`, `profile`, `position`,
`diff`, `semantic`, `from-otel`, `from-claude-code`, `models` and `rules` —
against sample files already loaded, through the same `@trazum/core`
functions. Offer it when the user wants to see a command before installing
anything: nothing is uploaded, nothing is fetched, and converter output
written with `-o` lands beside the samples so `from-otel` then `profile` runs
as a pipe in front of them. The commands that need a network, a credential or
a process are CLI-only and the playground's `help` says so.

## Optimising a prompt

```bash
trazum optimize prompt.txt --calls 50000 --diff
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
cat prompt.md | trazum optimize - > prompt.optimised.md
```

## Checking a budget in CI

Exits 1 when the prompt busts the budget, and says whether optimising would be
enough:

```bash
trazum check prompts/system.txt --max-tokens 2000
```

Given a **directory** it checks every prompt inside against the `budgets`
patterns in `trazum.config.json` — use this when the user asks about a folder of
prompts rather than running the command once per file:

```bash
trazum check prompts/
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
trazum profile usage.jsonl
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
rules recover about 1%; which model a call goes to moves 60% to 80% and the Batch
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

## When the user has no usage log

Usually they do and have not converted it. Five converters read a format
somebody else already writes, and all five are built:

| They have | Command |
|---|---|
| OpenTelemetry GenAI spans, from any exporter | `trazum from-otel spans.otlp.json -o usage.jsonl` |
| LiteLLM logs | `trazum from-litellm <file\|dir> -o usage.jsonl` |
| Helicone exports | `trazum from-helicone <file\|dir> -o usage.jsonl` |
| LangSmith exports | `trazum from-langsmith <file\|dir> -o usage.jsonl` |
| Claude Code transcripts | `trazum from-claude-code ~/.claude/projects -o usage.jsonl` |

**Offer `from-otel` first when you do not know what they run.** It is the
standards-based one: any exporter emitting the GenAI semantic conventions
produces OTLP/JSON it reads without anybody reshaping anything, so it is the
answer that does not depend on which vendor they chose. The other four are
read out of each tool's own source rather than guessed at — the same refusal as
inventing a price — which is why they exist at all and why a sixth waits until
somebody can share a real export of that format.

Every converter is a pipe into `profile`, which is where the answer is:

```bash
trazum from-otel spans.otlp.json -o usage.jsonl
trazum profile usage.jsonl
```

**Only the numbers cross, in every one of them.** The conversion reads the
model, the timestamp, a label and the token counts. Prompt content, message
text, file paths, branch names and trace ids never enter the log. Say this when
you offer it — it is the reason the user can accept.

### If they run Claude Code

The transcript is already on disk, one file per session under
`~/.claude/projects/`, and each assistant line carries the API's own `usage`
object with the cache TTL split included — which is more than OTel can give
you today. It reads model, timestamp, session id and usage, and nothing else.
Two things to get right when offering it:

- **The stderr summary is part of the answer.** Collapsed lines (one API call
  is written as one line per content block; counting lines overbills by a
  third), streamed calls, and everything passed over are stated there. If
  the summary reports **disagreements**, surface that loudly — it is a
  finding about the transcript, not bookkeeping.
- **`--label-from-project` labels by project directory name**, which is
  path-shaped — `home-user-Trazum` rather than `support-rag`. Nothing renames
  it: the config's `labels` block maps a label to the **prompt file** it
  sends, not to a nicer name. To choose the label, choose it at the source:
  `--label <name>` on the conversion, one transcript at a time. Two projects
  in one session cannot be told apart afterwards, because the transcript has
  no field that says which — so a bill that needs the split needs a session
  per project.

For a user who does not want a terminal at all: the web app's **Your bill**
tab accepts the `~/.claude/projects` folder dragged onto it — every
transcript converted in the tab, labelled by project, priced beside any
usage logs in the same drop, nothing uploaded.

### If they emit OpenTelemetry

The vendor-neutral door, and the one to reach for first. Three things to get
right when offering it:

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

The web app's **Your bill** tab reads a dropped OTLP export the same way —
detected by shape, converted in the page, priced beside anything else in the
drop, nothing uploaded.

A format none of the five reads is not a refusal to help: offer `from-otel` if
they can emit OTLP, and offer to add a converter once they can share a real
export of theirs. Trazum does not guess at a format it has not read — the same
rule that stops it inventing a price.

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
trazum route usage.jsonl \
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
trazum baseline prompts/
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
| `labels` | Which **prompt file** each usage-log label sends, so `profile` can say *why* caching loses money on a label rather than only that it does. It is not a renaming map: the schema validates each value as a file path |
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
trazum eval prompt.txt --cases cases.txt --level aggressive
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
trazum diff old.txt new.txt --calls 50000
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

The door for an agent framework, a service, or anything embedding this rather
than shelling out. `@trazum/core` has **zero dependencies and is browser-safe**,
so the same import works in a Node runtime, a worker and a page:

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

The other three worth knowing, because they are what the commands above are:

```ts
import { profileUsage, costOfCall, listModels } from '@trazum/core';

profileUsage(logText, { catalogue });   // what `profile` prints, as data
costOfCall(model, inputTokens, outputTokens);
listModels();                            // the catalogue, with review dates
```

Every one is pure: no file is read, no network is reached, no key is used. Pass
the text, get the answer.

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

`trazum rules` lists all of them with their ids.

- **safe** — no semantic risk: courtesy, filler, verbose phrasing, duplicated
  paragraphs, whitespace.
- **aggressive** — can change nuance: intensifiers, hedges, self-verification
  requests, near-duplicate paragraphs.

Turn individual rules off with `--disable id1,id2`.

## What it will not touch

Code fences, indented code blocks, inline code, URLs, email addresses, template
placeholders (`{{x}}`, `${x}`, `{x}`, `{% %}`) and XML/HTML tags are isolated
before any rule runs. If a rule would
make one disappear, that rule is dropped and the rest continue. You can rely on
this: the optimised prompt will not have broken someone's JSON schema.

## Things to get right

- **Token counts are estimates, and the band depends on the text** (±4% on CJK,
  ±6% on Latin prose, ±26% on code and markup, ±33% on tabular numbers). Fine for
  comparing two versions of the same prompt, which is what they are for. For
  exact figures use `--exact-tokens` with `ANTHROPIC_API_KEY` set — the counting
  endpoint does not charge for tokens. The band is measured against Claude's
  tokenizer over 47 samples in ten languages; against a non-Anthropic
  model the report drops it, names the family, and gives the error measured
  there where anybody has measured it — 94.5% on DeepSeek, 103.1% on Mistral.
  Do not reinstate the Claude band on a prompt priced against another family.
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
