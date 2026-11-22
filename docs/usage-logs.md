# Getting a usage log

[Documentation](README.md) / [Quick start](quick-start.md) · [Commands](commands.md#find-a-command) · [JSON contracts](json-output.md)

Recorded spend comes from usage data. Prompt-only cost figures are projections. The prompt
rules work without one — they count tokens — but "this label costs $340 a month
and two thirds of it is the cache" is a sentence only a log can produce.

This page is the answer to the one thing a first run says most often: *no usage
found*. Four shapes, with real records rather than a schema dump, because the
moment you need one of these is the moment you have a file open and want to
know whether it will work.

**The normalized usage-log format** is one JSON object per line — `.jsonl`, `.ndjson`, a `.log` file
of the same, and any of those gzipped. A `.json` file holding a single JSON
*array* is not read: convert it to one object per line first. Pass a file or a
directory; a directory is read as one log, which is what a month of rotated
files already is.

For provider and observability exports, `trazum bill <path>` detects supported
shapes automatically. The rules below describe normalized logs used by
`profile`, not every export accepted by `bill`.

## What every record needs

Two things, and nothing else is mandatory:

- **a model**, so the tokens can be priced;
- **token counts**, so there is something to price.

Everything else buys you a specific finding, and Trazum tells you which
findings are unavailable rather than reporting them as zero.

| Field | Buys you |
| --- | --- |
| `label` | Per-workload bills, budgets per label, the plan's ranking. Without it everything is one bucket. |
| `timestamp` | Days, drift, the watch, rates per month. Without it a total is still a total. |
| `session` | Conversation growth, per-session budgets, cache TTL fit. |
| `thread` | Only when one session runs several conversations at once, such as an agent and its subagents: which one the call belongs to. The turn-by-turn findings (growth, repeats, truncation retries, cache TTL fit, cache writes never read) follow each thread on its own; what a session costs, and the per-session budget, still count the whole session. Leave it out on the main conversation. `from-claude-code` and `bill` write it for you from a subagent's `agentId`. |
| `interactive` | Only on a call something waited on: a person in a conversation, or an agent whose next step needed the answer. Say `"interactive": true` and `plan` stops offering the Batch API for that call, which answers within a day. `from-claude-code`, `from-codex` and `from-gemini-cli` write it on every line. Leave it out and nothing changes: a log that marks none of its calls is read as it always was. |
| cache token fields | The cache verdict — whether caching is paying for itself or costing you. |
| `stop_reason` | Truncation-and-retry detection: work billed twice. |
| `requests` | Only on a row that sums calls, such as a usage report's hourly or daily bucket: how many it sums, or `null` when the report does not say. A per-call log leaves it out. It is what lets a model priced by prompt length be billed honestly: a call is billed on its own prompt, and a summed row at the dearer rate unless its whole prompt total is under the line, with the cheaper figure printed beside it. The `from-*` converters for usage reports write it for you. |
| `outcome` | **Cost per resolved outcome, the success rate, the quality gate, experiments on real traffic.** Without it this tool can say a workload got 40% cheaper and cannot say whether it stopped working. Record your own word for what happened — nothing is inferred from a stop reason, a latency or a retry — and declare the vocabulary under `outcomes` in the config. |

### The names it will accept

One concept, several spellings, because a log that already exists should not
have to be rewritten to be read. Each row is tried in order and the first
present value wins:

| Concept | Accepted keys |
| --- | --- |
| when the call happened | `ts`, `timestamp`, `created_at`, `created` |
| the conversation | `session`, `conversation_id` |
| what happened | `outcome`, `trazum_outcome` |
| why it stopped | `stop_reason`, `finish_reason`, `finishReason` |

`trazum_outcome` exists for the case where `outcome` already means something
else in your pipeline. The prefixed name is never required and never preferred
— it is there so a field collision is not a reason to go unmeasured.

**`trazum conform your-log.jsonl` reports which of these a log carries**, and
what each absent one would have unlocked, rather than guessing.

## Anthropic

The API returns usage on every response. Log the whole `usage` object as it
arrives — the field names below are Anthropic's own, and Trazum reads them
directly:

```jsonl
{"timestamp":"2026-08-01T09:14:22Z","model":"claude-opus-5","label":"support-rag","session":"conv-8814","stop_reason":"end_turn","usage":{"input_tokens":1840,"output_tokens":412,"cache_read_input_tokens":18600,"cache_creation_input_tokens":0}}
{"timestamp":"2026-08-01T09:14:51Z","model":"claude-opus-5","label":"support-rag","session":"conv-8814","stop_reason":"end_turn","usage":{"input_tokens":2210,"output_tokens":388,"cache_read_input_tokens":18600,"cache_creation_input_tokens":0}}
```

`cache_creation_input_tokens` and `cache_read_input_tokens` are what make the
cache verdict possible. A log without them is not a log with no caching — and
Trazum says so instead of reporting a hit rate of zero.

**Keep `speed`, `inference_geo` and `service_tier` inside `usage`.** The
response names all three, and each changes the bill. `"service_tier": "batch"`
is the Batch API, billed at half the standard price; `"standard"` and
`"priority"` are priced at the standard rate. `"speed": "fast"` is fast mode, which bills Opus 5.5
at $8/$40 against $4/$20 and Opus 5 and Opus 4.8 at $10/$50 against $5/$25.
`"inference_geo": "us"` is US-only inference, which bills every token category
at 1.1x on Claude 4.6 and later; `"global"` and `"not_available"` are the
standard price. A line without either is priced at the standard, global rate,
so a US-only workload logged without the field reads a tenth under its cost.
A record from any other source can say `"batch": true` at the top level, which
is what Trazum's own usage report converters write for a batch row. A call
marked that way is billed at the batch rate, and `plan` does not offer to
batch it a second time.

**Keep `server_tool_use` too.** `"server_tool_use": {"web_search_requests": 3}`
is three searches by Anthropic's web search tool, billed at $10 per 1,000 on
top of the tokens, at the same fee on the Batch API, in fast mode and on
US-only inference. A line without it is billed for no searches. The count is
all that crosses: what was searched for is in the content, which no usage log
needs.

Claude Code's own transcripts keep both:

```jsonl
{"timestamp":"2026-11-01T09:14:22Z","model":"claude-opus-4-6","label":"support-rag","usage":{"input_tokens":1840,"output_tokens":412,"cache_read_input_tokens":18600,"speed":"standard","inference_geo":"us"}}
```

**Without a log at all:** `trazum connect anthropic` pulls the Admin API's
usage report, which serves token sums per bucket. It carries no request count,
so every per-call finding is reported as unavailable rather than computed from
a call count nobody supplied. The key is an Admin API key with read access to
the usage report, given as `TRAZUM_ANTHROPIC_ADMIN_KEY` (or `ANTHROPIC_ADMIN_KEY`);
`trazum connect` names it, and what it needs, in its own refusal. The
[the command reference's `trazum connect` chapter](commands.md#your-bill-without-the-export-trazum-connect)
is the walkthrough.

## OpenAI

The response's `usage` object, same idea:

```jsonl
{"timestamp":"2026-08-01T09:14:22Z","model":"gpt-5","label":"classify","usage":{"prompt_tokens":3400,"completion_tokens":180,"prompt_tokens_details":{"cached_tokens":3072}}}
```

`prompt_tokens` includes the cached ones, so Trazum subtracts
`prompt_tokens_details.cached_tokens` before pricing — counting them twice
would report a bill higher than the invoice, and in the direction that
flatters the tool.

The Responses API spells the same thing `input_tokens` and
`input_tokens_details`, with the cached tokens likewise inside the total, and
Trazum reads either spelling:

```jsonl
{"timestamp":"2026-10-05T09:14:22Z","model":"gpt-6-sol","label":"agent","usage":{"input_tokens":120000,"output_tokens":900,"input_tokens_details":{"cached_tokens":100000,"cache_write_tokens":15000}}}
```

On GPT-5.6 and later, `cache_write_tokens` is also inside the total: the
tokens this request wrote to the cache, billed at 1.25x input. Trazum takes
them out with the cached ones and prices them as writes, against an entry
that lives at least 30 minutes, which is what the cache TTL verdict judges
your gaps against on those models.

**Keep `service_tier` beside `usage`.** The response names the tier that ran,
and OpenAI bills each from its own table: `"flex"` at about half the standard
price, `"priority"` or `"fast"` at up to twice, `"ultrafast"` at six times on
GPT-6 Astra and GPT-6.1 Sol. A line without it, or with `"default"`, is priced
at the standard rate, so a Flex workload logged without the field reads at
twice its cost:

```jsonl
{"timestamp":"2026-11-01T09:14:22Z","model":"gpt-6-sol","service_tier":"flex","usage":{"input_tokens":120000,"output_tokens":900,"input_tokens_details":{"cached_tokens":100000}}}
```

Moonshot's Kimi API reports usage in the same two shapes, `cache_write_tokens`
included, and Trazum reads them the same way. On Kimi K3 a write is billed by
its entry's lifetime, $3 for five minutes and $6 for an hour per million
tokens; the usage line does not say which, so Trazum prices Kimi's default of
five minutes and counts the call among those whose write TTL was assumed. Kimi's
Anthropic-compatible endpoint reports `cache_creation` split by TTL, which
needs no assumption.

**Without a log:** `trazum connect openai` reads the usage endpoint, which does
serve request counts.

## Vercel AI SDK

`onFinish` gives you the usage for the call. The SDK's names differ from both
providers above, so map them once at the edge:

```ts
const result = streamText({
  model: anthropic('claude-opus-5'),
  prompt,
  onFinish({ usage, finishReason }) {
    log.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      model: 'claude-opus-5',
      label: 'summarise',
      session: threadId,
      stop_reason: finishReason,
      usage: {
        input_tokens: usage.promptTokens,
        output_tokens: usage.completionTokens,
      },
    })}\n`);
  },
});
```

Write `finishReason` through. `length` on a call that then got retried is
work billed twice, and it is one of the cheapest findings in the tool to act
on.

## An OpenTelemetry collector

If your calls are already instrumented, the spans carry the counts — and
`trazum from-otel` reads them without your reshaping anything. Point it at the
OTLP/JSON any OpenTelemetry GenAI exporter produces (one document, or
newline-delimited spans) and it converts each LLM-call span — the model from
`gen_ai.request.model`/`gen_ai.response.model`, the timestamp from
`startTimeUnixNano`, a label from the span's `gen_ai.operation.name` or the
resource's `service.name`, and the `gen_ai.usage.*_tokens` counts:

```
trazum from-otel spans.otlp.json -o usage.jsonl
trazum profile usage.jsonl
```

Spans that are not LLM calls are counted and skipped, never priced, and the
stderr summary says how many were converted, skipped, and carried no cache
data. Nothing but the numbers crosses: prompt content, trace ids and every
other attribute stay in the span. OpenTelemetry has not standardised the
cache-write TTL split, so an OTel-sourced record carries no `cache_creation`
and its cache verdicts read *cannot tell* rather than a fabricated one.

You can also reshape the spans yourself — the field names are yours to map,
and Trazum reads a flat record as readily as a nested one:

```jsonl
{"timestamp":"2026-08-01T09:14:22Z","model":"claude-opus-5","label":"agent","input_tokens":92400,"output_tokens":1200}
```

Trazum writes OTLP as well: `trazum doctor --otlp-out metrics.json` produces
OTLP/HTTP JSON for your pipeline to send, and `trazum bill --otlp-out
bill-metrics.json` does the same for the bill, per closed day (see
[`bill`](commands.md#one-door-trazum-bill)). Trazum writes the file; it never
sends anything anywhere.

## Batch API results

You do not need to log a batch: the results file each provider returns is
already a log Trazum reads.

```bash
# Anthropic: the results of one message batch, streamed to a file.
curl "https://api.anthropic.com/v1/messages/batches/$BATCH_ID/results" \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" > results.jsonl
npx @trazum/cli bill results.jsonl

# OpenAI: the batch's output file.
curl "https://api.openai.com/v1/files/$OUTPUT_FILE_ID/content" \
  -H "Authorization: Bearer $OPENAI_API_KEY" > output.jsonl
npx @trazum/cli bill output.jsonl
```

Every billed line is priced at the model's batch rate, half the standard one.
Results the provider says it did not bill (Anthropic's `errored`, `canceled`
and `expired`, an OpenAI line without a 200) are counted and left out. Nothing
but the model, the usage and the end reason crosses: the generated text and
your `custom_id` stay in your file.

## ccusage

If you already run [ccusage](https://github.com/ccusage/ccusage), the JSON it
writes is a log Trazum reads. Nothing runs ccusage for you, and nothing looks
for its output: you pass the file.

```bash
ccusage daily --json > ccusage.json
npx @trazum/cli bill ccusage.json
npx @trazum/cli from-ccusage ccusage.json -o usage.jsonl
```

What is read, from ccusage 20.0.51's own source and output:

| ccusage writes | Trazum reads it as |
| --- | --- |
| `daily`, `weekly`, `monthly`, `session` or `sessions` rows, or `projects` (from `claude daily --instances`) | one row each. A file holding several (`--sections`) is read for the first of daily, weekly, monthly and session, and the others are named and not added: they are the same usage cut another way |
| `date`, `week`, `month` or `period` | the record's time, at the start of that day, week or month in UTC. ccusage cut its days in the zone it ran in, which its JSON does not say, so the day is taken as ccusage named it |
| a session's `lastActivity` | the record's time, so a session that crossed midnight is placed on its last day |
| a session's `firstActivity` | where the session began, so a bill knows which days it covers. The report across every agent does not carry it |
| each of `modelBreakdowns` | one record: `modelName` as the model |
| `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens` | the four token counts |
| `cacheCreation1hTokens` | the 1-hour part of the cache writes, the rest at 5 minutes; without it the lifetime is unknown and the bill says the 5-minute rate was assumed |
| a model named `claude-…-fast` | fast mode on that model, priced from its fast rate |
| `cost`, `totalCost`, `missingPricing` | nothing that is priced: set beside the catalogue's figure, model by model, and never added to it |
| `project`, `projectPath` | nothing, unless `from-ccusage --label-by-project` names it: then the label you wrote. `bill` takes `--label` only |

Every record is written with `"requests": null`. A row is a day's, week's,
month's or session's total, and ccusage does not say how many requests it
sums, so nothing counts it as a call: the bill's statement counts rows, and a
model priced by prompt length is billed at the dearer rate with the cheaper
one beside it. The receipt's `calls` fields count records, so for a ccusage
report they are its rows by model.

A row is never cut, because it does not say how its total was spread across
its day, week, month or session. So `bill` on a ccusage report refuses, and
says why:

- `--timezone`. A row moved to another zone would land whole on another day.
  Run ccusage with its own `--timezone` instead.
- A `--since` or `--until` that falls inside a row: `--since 2026-11-10` on a
  monthly report, or on a session that began on 2026-11-09. A session in the
  report across every agent names only its last activity, so any edge at or
  before it is refused; `ccusage claude session --json` names both ends.
- A `--by` that would split a row: `--by day` on a monthly report, or `--by
  week` on `ccusage claude weekly`, whose weeks start on Sunday where the
  bill's ISO weeks start on Monday. Where the by-month table would split one,
  it is left out and the statement says so.
- The files that count calls and split the bill by day: `--markdown-out`,
  `--html-out`, `--pdf-out`, `--csv-out`, `--otlp-out` and `--prom-out`. The
  statement and the receipt bill the rows.

`weekly` does not read a ccusage report at all: it cuts at `--until` and
counts calls. The statement's "This log covers" line runs from the first row's
start to the last row's end.

The usage log `from-ccusage` writes is read by every command as any other
log. Its records say `"requests": null`, so they are priced as rows that sum
requests, and they are counted as calls, the way the rows of Anthropic's usage
report are. Nothing refuses `--timezone`, `--since`, `--until` or `--by` on
that log either, so they can move a row to another day or cut it at a
window's edge. `bill` on the ccusage file itself counts them as rows and
refuses what would move or cut one: bill the file rather than the log. Counting
such a record as a row everywhere is #961.

What the report never carried is not in the bill: US-only inference
(`inference_geo`) and web searches (`server_tool_use`), both in Claude Code's
own transcripts and both billed by Anthropic. `trazum bill` on the sessions
themselves has them.

## Checking a log before you trust it

```
trazum profile your-log.jsonl
```

It reports what it could not read — malformed lines by position, models it
could not price, duplicate lines and what they added — rather than skipping
them quietly. A total that is quietly wrong by an unknown amount is worse than
an error.

`trazum init` finds a log named `usage.jsonl`, `usage.ndjson`, `usage.log`,
`logs/usage.jsonl` or a `logs/` directory without being told. Anywhere else,
name it.

## Very large files

A file larger than 256 MiB is read line by line instead of whole. JavaScript
cannot hold a string much past 512 MiB, and an agent session that read large
files or ran chatty commands can grow past that: Claude Code writes every tool
result into its transcript.

In that mode each line longer than 4,096 characters is parsed, and every
string in it longer than 4,096 characters is replaced by a short marker before
it is kept. Those strings are prompts, replies, thinking, tool arguments and
tool results; nothing is billed by its text here. What a converter reads (the
type, model, ids, timestamp, session, working directory and token counts) is
kept exactly, so the bill is the same as a whole read would give. The tests
check that byte for byte, with every file forced down this path. A line that
is not JSON, such as a CSV row, is never rewritten.

The web app's Bill tab does the same in the browser, with the same function
(`slimUsageLine` in `@trazum/core`), so a large session dropped there is read
without leaving the page either.

The run says which files were read this way, on stderr. A file whose lines
are too many to hold even after that is refused with its name and size, never
the runtime's "Invalid string length": split it (for example
`split -l 500000`) and pass the pieces.
