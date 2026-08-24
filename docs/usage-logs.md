# Getting a usage log

Every figure Trazum prints as **money** comes from a usage log. The prompt
rules work without one — they count tokens — but "this label costs $340 a month
and two thirds of it is the cache" is a sentence only a log can produce.

This page is the answer to the one thing a first run says most often: *no usage
found*. Four shapes, with real records rather than a schema dump, because the
moment you need one of these is the moment you have a file open and want to
know whether it will work.

Trazum reads **one JSON object per line** — `.jsonl`, `.ndjson`, a `.log` file
of the same, and any of those gzipped. A `.json` file holding a single JSON
*array* is not read: convert it to one object per line first. Pass a file or a
directory; a directory is read as one log, which is what a month of rotated
files already is.

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
| cache token fields | The cache verdict — whether caching is paying for itself or costing you. |
| `stop_reason` | Truncation-and-retry detection: work billed twice. |
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

**Without a log at all:** `trazum connect anthropic` pulls the Admin API's
usage report, which serves token sums per bucket. It carries no request count,
so every per-call finding is reported as unavailable rather than computed from
a call count nobody supplied. The key is an Admin API key with read access to
the usage report, given as `TRAZUM_ANTHROPIC_ADMIN_KEY` (or `ANTHROPIC_ADMIN_KEY`);
`trazum connect` names it, and what it needs, in its own refusal. The
[README's `trazum connect` section](../README.md#your-bill-without-the-export-trazum-connect)
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
OTLP/HTTP JSON for your pipeline to send. Trazum writes the file; it never
sends anything anywhere.

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
