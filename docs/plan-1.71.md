# The plan for 1.71 — the universal cost lens

One arc, following [1.70](plan-1.70.md). **The arc closes at 1.71.0.** The
ordering is a commitment; the calendar is not.

## The thesis

`from-claude-code` proved a pattern worth generalising: a **pure converter**
turns one tool's export into Trazum's usage log, and from there every door —
`profile`, `position`, the gates, the web tab — prices it without a second
computation. Claude Code was the first source because it was the one with
the largest unpriced bill and the transcripts already on disk. It was never
meant to be the only one.

The market position this reaches: Trazum stops competing with the
observability tools and starts **reading all of them**. LangSmith, Helicone,
LiteLLM and the rest each capture LLM calls with token counts; the emerging
industry standard, **OpenTelemetry's GenAI semantic conventions**, captures
them as spans with `gen_ai.usage.input_tokens` and friends. A converter for
each makes Trazum the cost lens over whatever telemetry a team already
emits — complementary to every tool, replacing none, and the natural home
for a **shared open format** the whole ecosystem can target.

The arc ships the standards-based one first, because it is the one that does
not go stale: **`from-otel`**, reading the OTLP/JSON that any OTel GenAI
exporter produces. The vendor-specific converters follow only for formats a
real export has been seen in — the same refusal as inventing a price: a
converter for a format guessed from documentation is an estimate wearing a
parser's clothes.

## What the format actually is, stated before parsing

OpenTelemetry's GenAI semantic conventions put, on each LLM-call span:
- `gen_ai.request.model` (and often `gen_ai.response.model`), a string.
- `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`, integers.
- `gen_ai.system` (the provider: `anthropic`, `openai`, …), a string.
- the span's own `startTimeUnixNano`, a timestamp.

OTLP/JSON wraps these as `resourceSpans[].scopeSpans[].spans[]`, each span
carrying `attributes[]` of `{ key, value: { stringValue | intValue | … } }`.
Cache-token attributes are **not** yet standardised across exporters, so the
converter reads them where a `gen_ai.usage.cache_read_input_tokens`-shaped
key is present and does not invent them where it is not — the TTL split is
absent from OTel today, and the converter says so rather than guessing.

## The chapters, in order

**1. The OTLP reader, in core.** `otelRecords(text)` parses OTLP/JSON — one
document, or newline-delimited spans — and returns usage-log records:
`model`, `ts` (from `startTimeUnixNano`), `label` (the span's service or
operation name when present, so a per-service bill falls out), and the
`usage` object with input/output and any cache tokens the span carried.
Spans that are not LLM calls (no `gen_ai.usage.*`) are counted and skipped,
never converted. Pure over its input, like every converter before it, and
its output feeds `parseUsageLine` — proven by the round-trip test.

**2. The detector and the command.** `looksLikeOtel(text)` routes a file the
way `looksLikeClaudeCodeTranscript` does — the presence of `resourceSpans`
or a `gen_ai.` attribute key, not a filename. `trazum from-otel <file|dir>`
is the **fortieth command**: OTLP in, usage-log JSONL out, a stderr summary
of how many spans were LLM calls, how many were skipped as non-LLM, and how
many carried no cache data. `--label-from-service` labels by the resource's
`service.name`.

**3. The web tab learns it too.** The Bill tab's folder drop already routes
transcripts and usage logs; it gains a third arm — a dropped OTLP file is
detected and converted in the page, so *drag your OpenTelemetry export onto
Trazum* joins *drag your ~/.claude/projects*. No fetch, same invariant.

**4. The guards, and the honest gaps.** Core: OTLP fixtures both directions,
a round-trip through `parseUsageLine`, a non-LLM span counted not converted,
and a fixture whose spans carry a planted trace-id and prompt attribute that
must not cross into the priced records — the same privacy proof the
transcript converter carries. A `from-otel` CLI suite for the walk and the
summary. And the documentation states plainly what OTel cannot yet give:
no cache TTL split, so the cache verdicts read `cannot-tell` on an
OTel-sourced log rather than a fabricated one.

## What this deliberately does not ship

- **Vendor converters for formats not seen.** LangSmith, Helicone and
  LiteLLM are named as next, not built now: a converter for a documented-but-
  unseen format is an estimate. Each ships when a real export of it does.
- **Fetching from a provider's usage API.** That needs a credential and
  breaks the browser's no-fetch invariant; it belongs to the CLI, with an
  explicit key, and is its own decision.
- **Inventing the cache TTL split OTel omits.** The largest single saving in
  this product depends on it, and a guessed value would move a verdict.
  Absent stays absent, and the report says why.
