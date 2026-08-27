/**
 * LiteLLM's spend log, read as a usage log.
 *
 * `from-claude-code` proved the pattern and `from-otel` generalised it: a pure
 * converter turns one tool's export into Trazum's usage-log records, and every
 * door prices it from there. LiteLLM is the gateway a great many teams already
 * put in front of every provider, so its `LiteLLM_SpendLogs` table is the one
 * export most likely to already exist on somebody's disk.
 *
 * **The format is derived, not guessed.** Every field below is read off
 * `litellm/proxy/schema.prisma` in BerriAI/litellm, model `LiteLLM_SpendLogs`.
 * A converter written from memory of an API is a converter that silently
 * mis-reads somebody's bill, and this project has one rule above all others
 * about numbers it cannot justify.
 *
 * ## What maps
 *
 * | LiteLLM | Trazum |
 * | --- | --- |
 * | `model` | `model` |
 * | `prompt_tokens` | `usage.input_tokens` |
 * | `completion_tokens` | `usage.output_tokens` |
 * | `startTime` | `ts` |
 * | `session_id` | `session` |
 * | `request_tags[0]`, else `metadata.tags[0]`, else `model_group` | `label` |
 *
 * ## What deliberately does not cross
 *
 * The row carries `messages` and `response` — the prompt itself and the
 * completion — plus `api_key` (hashed, still credential-shaped),
 * `requester_ip_address`, `user` and `end_user`. **None of it is read.** The
 * converter names the fields it takes and takes nothing else, and a fixture
 * plants a marker in each of them and greps the whole output.
 *
 * ## What it refuses to invent
 *
 * `cache_hit` is a flag and `cache_key` an identifier; neither is a token
 * count. A converted record therefore carries no cache split at all, and the
 * caching questions come back `cannot-tell` rather than answered from a
 * guess — the same refusal as inventing a price. `cacheFlagged` counts the
 * rows that said "hit" so the operator can see the gap is real rather than
 * empty.
 *
 * `spend` is LiteLLM's own priced figure and is **never** merged into
 * Trazum's catalogue-priced total. It is a second measurement of the same
 * calls, kept apart the way the store's provider-billed standing is kept
 * apart from the log's, and returned on its own so a caller who wants to
 * compare the two can, deliberately.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface LiteLlmRecord {
  model: string;
  ts?: string;
  label?: string;
  session?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LiteLlmConversion {
  records: LiteLlmRecord[];
  /** Rows that were spend logs and converted. */
  rows: number;
  /** Rows naming no model: counted, never guessed at, never dropped silently. */
  unnamedModel: number;
  /** Rows carrying no token counts at all — a logged call nobody can price. */
  noTokens: number;
  /** Rows LiteLLM marked as a cache hit, with no token split to act on. */
  cacheFlagged: number;
  /**
   * LiteLLM's own total for the converted rows, in USD, or null when no row
   * carried one. **Never** added to anything Trazum computes: it is the
   * gateway's arithmetic over the gateway's price table, and merging two
   * price tables into one figure is how a report becomes quietly wrong.
   */
  reportedSpendUsd: number | null;
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

/**
 * The first tag LiteLLM carries for a row, from the two places it puts them.
 *
 * `request_tags` is the documented column and `metadata.tags` is where the
 * proxy writes them when the caller passes them in the request body. First
 * only: a workload has one name in a bill, and joining several tags into one
 * label would invent a workload that does not exist.
 */
function labelOf(row: Record<string, unknown>): string | undefined {
  const fromColumn = Array.isArray(row.request_tags) ? row.request_tags : null;
  if (fromColumn !== null && typeof fromColumn[0] === 'string' && fromColumn[0] !== '') {
    return fromColumn[0];
  }
  const metadata = asObject(row.metadata);
  const fromMetadata = metadata !== null && Array.isArray(metadata.tags) ? metadata.tags : null;
  if (fromMetadata !== null && typeof fromMetadata[0] === 'string' && fromMetadata[0] !== '') {
    return fromMetadata[0];
  }
  // The public model name a proxy route is known by. A weaker label than a
  // tag — it groups by route rather than by workload — and better than none.
  if (typeof row.model_group === 'string' && row.model_group !== '') return row.model_group;
  return undefined;
}

/** `startTime` as an ISO instant, or undefined when it is not a time. */
function timeOf(row: Record<string, unknown>): string | undefined {
  const raw = row.startTime ?? row.start_time;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Convert a LiteLLM spend-log export.
 *
 * Accepts a JSON array of rows, a single row, `{ data: [...] }` as the proxy's
 * own endpoints return it, or newline-delimited rows — so a `psql --json`
 * dump, an API response and a streamed capture all work. Pure over its input.
 */
export function litellmRecords(text: string): LiteLlmConversion {
  const out: LiteLlmConversion = {
    records: [],
    rows: 0,
    unnamedModel: 0,
    noTokens: 0,
    cacheFlagged: 0,
    reportedSpendUsd: null,
    unparseable: 0,
  };

  const rows: unknown[] = [];
  const whole = tryParse(text);
  if (whole !== undefined) {
    if (Array.isArray(whole)) rows.push(...whole);
    else {
      const doc = asObject(whole);
      // `{ data: [...] }` is what the proxy's spend endpoints return.
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

  let spend = 0;
  let sawSpend = false;

  for (const raw of rows) {
    const row = asObject(raw);
    if (row === null) continue;
    // A spend log row is one that carries at least one of the two token
    // columns. Anything else in the same file is not a call and is skipped
    // rather than converted into a record of zero.
    const input = asCount(row.prompt_tokens);
    const output = asCount(row.completion_tokens);
    if (input === undefined && output === undefined) continue;

    out.rows += 1;

    if (input === 0 && output === 0) out.noTokens += 1;
    if (row.cache_hit === true || row.cache_hit === 'true' || row.cache_hit === 'True') {
      out.cacheFlagged += 1;
    }

    const reported = asCount(row.spend);
    if (reported !== undefined) {
      spend += reported;
      sawSpend = true;
    }

    const model = typeof row.model === 'string' ? row.model.trim() : '';
    if (model === '') {
      // Counted, never guessed at. `model_group` is a route name, not a model,
      // and pricing a call by the route it took would be a figure attributed
      // to something it does not describe.
      out.unnamedModel += 1;
      continue;
    }

    const ts = timeOf(row);
    const label = labelOf(row);
    const session = typeof row.session_id === 'string' && row.session_id !== ''
      ? row.session_id
      : undefined;

    out.records.push({
      model,
      ...(ts !== undefined ? { ts } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(session !== undefined ? { session } : {}),
      usage: { input_tokens: input ?? 0, output_tokens: output ?? 0 },
    });
  }

  out.reportedSpendUsd = sawSpend ? spend : null;
  return out;
}

/**
 * Whether a file looks like a LiteLLM spend log, by shape.
 *
 * Deliberately narrow: `request_id` beside one of the two token columns, and
 * a field no other export in this project carries. A looser test would claim
 * an OpenAI usage response, whose rows also have `prompt_tokens`, and refuse
 * it in this file's words instead of letting the code that can read it try.
 */
export function looksLikeLiteLlm(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (!head.includes('prompt_tokens') && !head.includes('completion_tokens')) return false;
  return (
    head.includes('"request_id"') ||
    head.includes('"custom_llm_provider"') ||
    head.includes('"model_group"')
  );
}
