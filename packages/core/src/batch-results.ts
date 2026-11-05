/**
 * A provider's Batch API results file, read as a usage log.
 *
 * Both providers return a batch's results as JSON Lines, one per request, and
 * bill every one that ran at half the standard price. Neither shape is a usage
 * line: the model and usage sit one or two objects down, so `parseUsageLine`
 * read a whole results file as nothing at all. This converter takes each line
 * that was billed, keeps its model, usage and end reason, marks it `batch`, and
 * drops everything else, the generated text first among it.
 *
 * ## The two shapes, each from its provider's own page
 *
 * **Anthropic** (platform.claude.com/docs/en/build-with-claude/batch-processing,
 * read 2026-11-05): `{"custom_id", "result": {"type", "message"}}`. `type` is
 * `succeeded`, `errored`, `canceled` or `expired`, and the page says of the
 * last three "You will not be billed for these requests". A succeeded result's
 * `message` is a Messages response, `usage` and all.
 *
 * **OpenAI** (developers.openai.com/api/docs/guides/batch, read 2026-11-05):
 * `{"id", "custom_id", "response": {"status_code", "request_id", "body"},
 * "error"}`. `body` is the endpoint's own response, a Responses or Chat
 * Completions object. An expired request is written with `"response": null`
 * and an `error`; the page says "You will be charged for tokens consumed from
 * any completed requests", so a line is billed only when it carries a 200 and
 * a body with usage.
 *
 * ## What it does not invent
 *
 * **No time.** An Anthropic result carries none; it is counted as undated, the
 * way `bill` already names an undated call, rather than stamped with the day
 * the file was read. An OpenAI body's `created` is Unix seconds and is kept.
 *
 * **No price.** The record says `batch: true` and the model; the batch ratio is
 * the catalogue's, applied where every other call is priced.
 *
 * **No content.** The message's `content`, the body's `output` and `choices`,
 * the `custom_id` (which a caller may have filled with anything) and every id
 * are dropped. A test plants a marker in each and greps the output.
 */

/** One converted record, in the shape `parseUsageLine` reads. */
export interface BatchResultRecord {
  model: string;
  ts?: string;
  label?: string;
  /** Always true: every line here ran on the Batch API. */
  batch: true;
  stop_reason?: string;
  usage: Record<string, unknown>;
}

export interface BatchResultConversion {
  records: BatchResultRecord[];
  /** Which provider's shape the file was, or null when no line was either. */
  provider: 'anthropic' | 'openai' | null;
  /** Non-blank lines read. */
  lines: number;
  /** Results the provider says it did not bill: errored, canceled, expired, or not a 200. */
  notBilled: number;
  /** Billed results with no model or usage to price them by. */
  unpriceable: number;
  /** Lines that were not JSON, or neither shape. */
  unparseable: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Usage as the response gave it, minus nothing it bills by and plus nothing. */
const usageOf = (value: unknown): Record<string, unknown> | null => asObject(value);

/**
 * @param label the project these results belong to, chosen by the operator.
 */
export function batchResultRecords(text: string, options: { label?: string } = {}): BatchResultConversion {
  const records: BatchResultRecord[] = [];
  let provider: BatchResultConversion['provider'] = null;
  let lines = 0;
  let notBilled = 0;
  let unpriceable = 0;
  let unparseable = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    lines += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      unparseable += 1;
      continue;
    }
    const line = asObject(parsed);
    if (line === null || typeof line.custom_id !== 'string') {
      unparseable += 1;
      continue;
    }

    const result = asObject(line.result);
    if (result !== null && typeof result.type === 'string') {
      provider ??= 'anthropic';
      if (result.type !== 'succeeded') {
        notBilled += 1;
        continue;
      }
      const message = asObject(result.message);
      const usage = usageOf(message?.usage);
      if (message === null || typeof message.model !== 'string' || usage === null) {
        unpriceable += 1;
        continue;
      }
      records.push({
        model: message.model,
        ...(options.label === undefined ? {} : { label: options.label }),
        batch: true,
        ...(typeof message.stop_reason === 'string' ? { stop_reason: message.stop_reason } : {}),
        usage,
      });
      continue;
    }

    if ('response' in line) {
      provider ??= 'openai';
      const response = asObject(line.response);
      if (response === null || response.status_code !== 200) {
        notBilled += 1;
        continue;
      }
      const body = asObject(response.body);
      const usage = usageOf(body?.usage);
      if (body === null || typeof body.model !== 'string' || usage === null) {
        unpriceable += 1;
        continue;
      }
      const created =
        typeof body.created_at === 'number' ? body.created_at : typeof body.created === 'number' ? body.created : null;
      records.push({
        model: body.model,
        ...(created !== null && Number.isFinite(created) ? { ts: new Date(created * 1000).toISOString() } : {}),
        ...(options.label === undefined ? {} : { label: options.label }),
        batch: true,
        usage,
      });
      continue;
    }

    unparseable += 1;
  }

  return { records, provider, lines, notBilled, unpriceable, unparseable };
}

/**
 * Whether this text is a Batch API results file.
 *
 * Every line carries a `custom_id`, which no other log here does, beside
 * either Anthropic's `result` with a `type` or OpenAI's `response` with a
 * `status_code`. The first line decides; one that is neither is not this.
 */
export function looksLikeBatchResults(text: string, prefixBytes = 8192): boolean {
  const first = text.slice(0, prefixBytes).split('\n').find((line) => line.trim() !== '');
  if (first === undefined || !first.includes('"custom_id"')) return false;
  try {
    const line = asObject(JSON.parse(first));
    if (line === null || typeof line.custom_id !== 'string') return false;
    const result = asObject(line.result);
    if (result !== null && typeof result.type === 'string') return true;
    return 'response' in line && ('error' in line || asObject(line.response)?.status_code !== undefined);
  } catch {
    return false;
  }
}
