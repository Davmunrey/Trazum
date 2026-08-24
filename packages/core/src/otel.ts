/**
 * OpenTelemetry GenAI spans, read as a usage log — the 1.71 arc's move.
 *
 * `from-claude-code` proved a pattern: a pure converter turns one tool's
 * export into Trazum's usage-log records, and every door prices it from
 * there. This generalises it to the standard the ecosystem is converging on
 * — OpenTelemetry's GenAI semantic conventions — so Trazum reads whatever
 * telemetry a team already emits rather than competing with the tool that
 * emits it.
 *
 * **What an LLM-call span carries** (OTLP/JSON, one `resourceSpans[]` →
 * `scopeSpans[]` → `spans[]`, each span an `attributes[]` of
 * `{ key, value: { stringValue | intValue | … } }`):
 * - `gen_ai.request.model` / `gen_ai.response.model` — the model.
 * - `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` — the counts.
 * - `gen_ai.operation.name`, or the resource's `service.name` — the label.
 * - the span's own `startTimeUnixNano` — the timestamp.
 *
 * **What it deliberately does not carry, and this does not invent.** OTel has
 * not standardised the cache-write TTL split, so an OTel-sourced record has
 * no `cache_creation` object and the cache verdicts read `cannot-tell` rather
 * than a fabricated one — the same refusal as inventing a price. Cache reads
 * are taken only where a `gen_ai.usage.cache_read_input_tokens`-shaped key is
 * actually present.
 *
 * **Nothing but the numbers crosses.** Prompt and completion content, trace
 * ids, and every other span attribute stay in the span; the record carries
 * model, timestamp, label and the token counts, held by a fixture that
 * plants a secret in a span attribute and greps the whole output for it.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface OtelRecord {
  model: string;
  ts: string;
  label?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}

export interface OtelConversion {
  records: OtelRecord[];
  /** Spans that were LLM calls and converted. */
  llmSpans: number;
  /** Spans that were not LLM calls (no gen_ai usage): counted, not converted. */
  otherSpans: number;
  /** Converted records that carried no cache-read data — the OTel norm today. */
  noCacheData: number;
  /** Lines/documents that did not parse as JSON at all. */
  unparseable: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Flatten an OTLP `attributes[]` into a plain map of key → primitive. */
function attrMap(attributes: unknown): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const raw of asArray(attributes)) {
    const attr = asObject(raw);
    if (attr === null || typeof attr.key !== 'string') continue;
    const value = asObject(attr.value);
    if (value === null) continue;
    if (typeof value.stringValue === 'string') map.set(attr.key, value.stringValue);
    else if (typeof value.intValue === 'number') map.set(attr.key, value.intValue);
    // OTLP encodes large ints as decimal strings — accept those as numbers.
    else if (typeof value.intValue === 'string' && /^-?\d+$/.test(value.intValue))
      map.set(attr.key, Number(value.intValue));
    else if (typeof value.doubleValue === 'number') map.set(attr.key, value.doubleValue);
  }
  return map;
}

const asCount = (value: string | number | undefined): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Convert an OTLP/JSON payload. Accepts a single document or newline-delimited
 * documents (one `{ resourceSpans: … }` per line), so both an exporter's file
 * dump and a streamed capture work. Pure over its input.
 */
export function otelRecords(text: string): OtelConversion {
  const out: OtelConversion = {
    records: [],
    llmSpans: 0,
    otherSpans: 0,
    noCacheData: 0,
    unparseable: 0,
  };

  // One JSON document, or NDJSON. Try the whole text first; on failure, split.
  const documents: unknown[] = [];
  const whole = tryParse(text);
  if (whole !== undefined) {
    documents.push(whole);
  } else {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      const parsed = tryParse(line);
      if (parsed === undefined) out.unparseable += 1;
      else documents.push(parsed);
    }
  }

  for (const doc of documents) {
    const root = asObject(doc);
    if (root === null) continue;
    for (const rs of asArray(root.resourceSpans)) {
      const resourceSpan = asObject(rs);
      if (resourceSpan === null) continue;
      const resource = asObject(resourceSpan.resource);
      const serviceName = resource ? attrMap(resource.attributes).get('service.name') : undefined;
      for (const ss of asArray(resourceSpan.scopeSpans)) {
        const scopeSpan = asObject(ss);
        if (scopeSpan === null) continue;
        for (const rawSpan of asArray(scopeSpan.spans)) {
          const span = asObject(rawSpan);
          if (span === null) continue;
          const attrs = attrMap(span.attributes);
          const input = asCount(attrs.get('gen_ai.usage.input_tokens'));
          const output = asCount(attrs.get('gen_ai.usage.output_tokens'));
          const model =
            attrs.get('gen_ai.response.model') ?? attrs.get('gen_ai.request.model');
          if (input === undefined || output === undefined || typeof model !== 'string') {
            out.otherSpans += 1;
            continue;
          }
          out.llmSpans += 1;
          const cacheRead = asCount(attrs.get('gen_ai.usage.cache_read_input_tokens'));
          if (cacheRead === undefined) out.noCacheData += 1;
          // startTimeUnixNano is nanoseconds since the epoch, as a decimal
          // string in OTLP/JSON. Milliseconds is what a timestamp needs.
          const startNano = span.startTimeUnixNano;
          const ms =
            typeof startNano === 'string' && /^\d+$/.test(startNano)
              ? Math.floor(Number(startNano) / 1_000_000)
              : typeof startNano === 'number'
                ? Math.floor(startNano / 1_000_000)
                : null;
          const label =
            (typeof attrs.get('gen_ai.operation.name') === 'string'
              ? (attrs.get('gen_ai.operation.name') as string)
              : undefined) ??
            (typeof serviceName === 'string' ? serviceName : undefined);
          out.records.push({
            model,
            ts: ms !== null ? new Date(ms).toISOString() : '',
            ...(label !== undefined && label !== '' ? { label } : {}),
            usage: {
              input_tokens: input,
              output_tokens: output,
              ...(cacheRead !== undefined ? { cache_read_input_tokens: cacheRead } : {}),
            },
          });
        }
      }
    }
  }
  return out;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Does this text look like an OpenTelemetry span export rather than a usage
 * log or a Claude Code transcript? The presence of `resourceSpans` (the OTLP
 * envelope) or a `gen_ai.` attribute key — a signature, not a filename, so
 * the web tab can route a dropped file with no help from the reader. Reads a
 * bounded prefix: an export announces itself early.
 */
export function looksLikeOtel(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  return head.includes('resourceSpans') || head.includes('gen_ai.');
}
