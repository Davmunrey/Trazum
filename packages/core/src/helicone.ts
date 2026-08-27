/**
 * Helicone's request export, read as a usage log.
 *
 * The third converter in the pattern `from-claude-code` started: a pure
 * function turns one tool's export into Trazum's usage-log records, and every
 * door prices it from there. Helicone sits as a proxy in front of the provider
 * and keeps every request it saw, so a team using it already has the export.
 *
 * **The format is derived, not guessed.** The columns below are the SELECT
 * that builds Helicone's own request table — `web/lib/api/request/request.ts`
 * in Helicone/helicone — and the response shape its `POST /v1/request/query`
 * endpoint documents. A converter written from memory of an API is a converter
 * that silently mis-reads somebody's bill.
 *
 * ## The model, and why it takes three columns to answer
 *
 * Helicone carries `request_model`, `model_override` and `response_model`, and
 * they can disagree: the override exists precisely because a proxy can send a
 * different model than the caller asked for, and the response says what
 * actually answered. **The response wins**, then the override, then the
 * request — the bill is about what was billed, not what was intended — and
 * `modelDisagreements` counts the rows where they differed so a reader can see
 * the substitution happened rather than discover it in a total.
 *
 * ## What deliberately does not cross
 *
 * A Helicone row carries the request body and the response body — the prompt
 * and the completion — and `request_user_id`, which is an email address in
 * Helicone's own documented example. **None of it is read.** The converter
 * names the fields it takes and takes nothing else, and a fixture plants a
 * marker in each and greps the whole output.
 *
 * ## What it refuses to invent
 *
 * There is no cache-token split anywhere on the row: `cache_enabled` is a flag
 * on the analytics table. A converted record therefore carries no cache fields
 * and the caching questions come back `cannot-tell` rather than answered from
 * a guess — the same refusal `from-otel` and `from-litellm` make.
 *
 * There is no conversation identity either. `request_id` is one call, so the
 * records carry no `session` and the conversation-shaped findings stay
 * unavailable. A custom property can carry one, and then it is there because
 * the operator put it there — never because this file inferred it.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface HeliconeRecord {
  model: string;
  ts?: string;
  label?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface HeliconeConversion {
  records: HeliconeRecord[];
  /** Rows that were requests and converted. */
  rows: number;
  /** Rows naming no model in any of the three columns: counted, never guessed. */
  unnamedModel: number;
  /**
   * Rows where the model that answered was not the model that was asked for.
   *
   * The response's model is what the bill rests on, and a proxy substituting
   * one model for another is a fact worth seeing rather than a difference
   * that only shows up as an unexplained total.
   */
  modelDisagreements: number;
  /** Rows carrying no token counts at all — a logged request nobody can price. */
  noTokens: number;
  /** Rows Helicone served from its cache, with no token split behind the flag. */
  cacheFlagged: number;
  /** Lines or documents that did not parse as JSON at all. */
  unparseable: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const asCount = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

const asName = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * The label, from Helicone's custom properties.
 *
 * `request_properties` is the documented place for whatever a team tags its
 * calls with, and the keys are theirs. Trazum looks for the ones a workload
 * would plausibly be named by, in order, and takes the first — never joins
 * several, because a workload has one name in a bill.
 */
function labelOf(row: Record<string, unknown>): string | undefined {
  const properties = asObject(row.request_properties) ?? asObject(row.properties);
  if (properties === null) return undefined;
  for (const key of ['Helicone-Property-Label', 'label', 'workload', 'app', 'environment']) {
    const found = asName(properties[key]);
    if (found !== null) return found;
  }
  return undefined;
}

/** The request's creation time as an ISO instant, or undefined. */
function timeOf(row: Record<string, unknown>): string | undefined {
  const raw = row.request_created_at ?? row.created_at ?? row.response_created_at;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Convert a Helicone request export.
 *
 * Accepts a JSON array of rows, a single row, `{ data: [...] }` as the query
 * endpoint returns it, or newline-delimited rows. Pure over its input.
 */
export function heliconeRecords(text: string): HeliconeConversion {
  const out: HeliconeConversion = {
    records: [],
    rows: 0,
    unnamedModel: 0,
    modelDisagreements: 0,
    noTokens: 0,
    cacheFlagged: 0,
    unparseable: 0,
  };

  const rows: unknown[] = [];
  const whole = tryParse(text);
  if (whole !== undefined) {
    if (Array.isArray(whole)) rows.push(...whole);
    else {
      const doc = asObject(whole);
      if (doc !== null && Array.isArray(doc.data)) rows.push(...doc.data);
      else if (doc !== null) rows.push(doc);
    }
  } else {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      const parsed = tryParse(line);
      if (parsed === undefined) out.unparseable += 1;
      else if (Array.isArray(parsed)) rows.push(...parsed);
      else rows.push(parsed);
    }
  }

  for (const raw of rows) {
    const row = asObject(raw);
    if (row === null) continue;
    const input = asCount(row.prompt_tokens);
    const output = asCount(row.completion_tokens);
    // A request row is one carrying at least one token column. Anything else
    // in the same file is not a call and is skipped rather than recorded as a
    // zero, which would be a call nobody made.
    if (input === undefined && output === undefined) continue;

    out.rows += 1;
    if (input === 0 && output === 0) out.noTokens += 1;
    if (row.cache_enabled === true || row.cache_enabled === 1 || row.cache_enabled === '1') {
      out.cacheFlagged += 1;
    }

    /*
      The response first, and this order is the whole point of counting the
      disagreement. A proxy that substituted a model billed for the model that
      answered, so that is what a bill has to price; taking the requested one
      would report the intention and call it the cost.
    */
    const answered = asName(row.response_model);
    const overridden = asName(row.model_override);
    const requested = asName(row.request_model);
    const model = answered ?? overridden ?? requested;
    if (model === null) {
      out.unnamedModel += 1;
      continue;
    }
    if (requested !== null && answered !== null && requested !== answered) {
      out.modelDisagreements += 1;
    }

    const ts = timeOf(row);
    const label = labelOf(row);
    out.records.push({
      model,
      ...(ts !== undefined ? { ts } : {}),
      ...(label !== undefined ? { label } : {}),
      usage: { input_tokens: input ?? 0, output_tokens: output ?? 0 },
    });
  }

  return out;
}

/**
 * Whether a file looks like a Helicone request export, by shape.
 *
 * Deliberately narrow: a token column beside one of the names only Helicone's
 * own SELECT produces. A looser test would claim an OpenAI usage response or a
 * LiteLLM spend log — both of which also carry `prompt_tokens` — and refuse it
 * in this file's words instead of letting the code that can read it try.
 */
export function looksLikeHelicone(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (!head.includes('prompt_tokens') && !head.includes('completion_tokens')) return false;
  return (
    head.includes('"request_created_at"') ||
    head.includes('"request_model"') ||
    head.includes('"response_model"') ||
    head.includes('"request_properties"')
  );
}
