/**
 * Anthropic's own usage report, read as a usage log.
 *
 * The fifth converter in the pattern `from-claude-code` started, and the first
 * one that reads a **provider** rather than a tool sitting in front of one.
 * Every other converter answers *what did the calls my proxy saw cost*; this
 * one answers *what does the provider say my organisation used*, which is the
 * question a finance team asks and the one no local log can answer, because a
 * log only knows the machines it was written on.
 *
 * ## Why this takes a file and not a key
 *
 * The Usage & Cost API needs an **admin** credential: an `sk-ant-admin01-…`
 * key, an `org:admin` OAuth token, or an unscoped personal or service account
 * key. Workspace keys do not work. That credential can read every workspace's
 * usage and manage the organisation's members and keys, which makes it exactly
 * the kind of secret this project has spent its whole design not holding.
 *
 * So this function takes the **response**, not the credential. The operator
 * runs one `curl` with their own key, in their own shell, and pipes the JSON
 * here. Trazum never sees the key, never makes the request, and stays a pure
 * function of text — which is also why this file can be tested without a
 * network and why the deterministic core is still deterministic.
 *
 * ## The format is derived, not guessed
 *
 * Every field below is from the published response schema of
 * `GET /v1/organizations/usage_report/messages`: `data[]` of time buckets with
 * `starting_at`, `ending_at` and `results[]`, and each result carrying
 * `uncached_input_tokens`, `cache_read_input_tokens`, `cache_creation`
 * (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`), `output_tokens`,
 * `model`, `service_tier` and `server_tool_use.web_search_requests`.
 *
 * The cache shape needs no translation at all: `parseUsageLine` already reads
 * `cache_creation.ephemeral_5m_input_tokens` and its 1-hour sibling, because
 * that is the shape the Messages API itself returns. The one rename is
 * `uncached_input_tokens` to `input_tokens`, and it is a rename rather than a
 * sum: this report reports cached reads **beside** the uncached input rather
 * than folded into it, which is the Anthropic shape and not the OpenAI one.
 *
 * ## What it refuses to price, and counts instead
 *
 * **A result with no model.** `model` is `null` unless the caller passed
 * `group_by[]=model`. Nothing on a row without it says what answered, so
 * nothing can price it. Refused, counted, and the count names the missing
 * parameter — a converter that quietly returned an empty log would send
 * somebody looking for a bug in their key.
 *
 * **A non-standard service tier.** Batch is billed at a discount and priority
 * is not billed like either; a catalogue rate is the standard rate. Pricing a
 * batch row from it would overstate a bill by half and look right doing it,
 * which is this product's one unforgivable failure. Those rows are left out
 * and counted, the same way an unpriceable line becomes a named gap rather
 * than a guess.
 *
 * **Web search requests.** `server_tool_use.web_search_requests` is billed per
 * request, not per token, so no token rate reaches it. Counted and named, so a
 * total that is missing them says so.
 *
 * **A truncated report.** `has_more: true` means the answer is one page of
 * several, and a bill built from one page is understated by however many pages
 * were not asked for. Said out loud rather than left for somebody to notice in
 * a figure.
 *
 * ## What deliberately does not cross
 *
 * `account_id`, `service_account_id`, `api_key_id` and `workspace_id` are read
 * by nothing here. The first two name people. The last two are the
 * organisation's own infrastructure, and a workspace id is not a project name:
 * mapping one to the other is a decision the operator makes with `--label`,
 * not an inference this file is entitled to. Grouping by workspace still
 * works and still totals correctly; the split is simply not carried into a
 * label nobody chose.
 *
 * ## The instant, and why it is the bucket's
 *
 * This report has no calls in it. A bucket is an interval and its usage is a
 * sum over that interval, so every record made from it carries the bucket's
 * `starting_at` — a day's usage at that day's start, an hour's at the hour's.
 * Anything finer would be a precision the source does not have, and
 * `bucket_width=1h` is there for an operator who wants it.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface AnthropicUsageRecord {
  model: string;
  ts: string;
  label?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens: number;
      ephemeral_1h_input_tokens: number;
    };
  };
}

export interface AnthropicUsageConversion {
  records: AnthropicUsageRecord[];
  /** Time buckets in the report, including intervals with no usage. */
  buckets: number;
  /** Results that became records. */
  rows: number;
  /** Results with `model: null`, which nothing can price. */
  unnamedModel: number;
  /** Results at a tier a standard rate would misprice. */
  nonStandardTier: number;
  /**
   * Whether any result named its tier at all.
   *
   * `false` means the report was not grouped by `service_tier`, so a batch row
   * and a standard row are indistinguishable here and the discount, if any,
   * is invisible. Not an error and not a refusal: most organisations run
   * standard only. It is said because the alternative is a reader assuming a
   * question was answered that was never asked.
   */
  tierNamed: boolean;
  /** Server-side tool calls billed per request, which no token rate prices. */
  webSearchRequests: number;
  /** `has_more`: this is one page and the bill from it is understated. */
  truncated: boolean;
  /** The input was not the JSON this endpoint returns. */
  unparseable: number;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * @param label the project this usage belongs to, chosen by the operator.
 *
 * Optional, and absent means the records carry none — the unattributed bucket
 * every other door already understands. The provider does not know this
 * organisation's project names and neither does this file.
 */
export function anthropicUsageRecords(
  text: string,
  options: { label?: string } = {},
): AnthropicUsageConversion {
  const empty: AnthropicUsageConversion = {
    records: [],
    buckets: 0,
    rows: 0,
    unnamedModel: 0,
    nonStandardTier: 0,
    tierNamed: false,
    webSearchRequests: 0,
    truncated: false,
    unparseable: 0,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: 1 };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...empty, unparseable: 1 };

  const report = parsed as { data?: unknown; has_more?: unknown };
  if (!Array.isArray(report.data)) return { ...empty, unparseable: 1 };

  const records: AnthropicUsageRecord[] = [];
  let buckets = 0;
  let rows = 0;
  let unnamedModel = 0;
  let nonStandardTier = 0;
  let tierNamed = false;
  let webSearchRequests = 0;

  for (const entry of report.data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const bucket = entry as { starting_at?: unknown; results?: unknown };
    if (typeof bucket.starting_at !== 'string') continue;
    buckets += 1;
    if (!Array.isArray(bucket.results)) continue;

    for (const found of bucket.results) {
      if (typeof found !== 'object' || found === null) continue;
      const result = found as {
        model?: unknown;
        service_tier?: unknown;
        uncached_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
        cache_creation?: unknown;
        output_tokens?: unknown;
        server_tool_use?: unknown;
      };

      const tool = result.server_tool_use as { web_search_requests?: unknown } | undefined;
      webSearchRequests += count(tool?.web_search_requests);

      if (typeof result.service_tier === 'string') {
        tierNamed = true;
        /* Standard is the tier a catalogue rate is the rate for. Everything
           else is billed on other terms and is left out rather than mispriced. */
        if (result.service_tier !== 'standard') {
          nonStandardTier += 1;
          continue;
        }
      }

      if (typeof result.model !== 'string' || result.model === '') {
        unnamedModel += 1;
        continue;
      }

      const creation = result.cache_creation as
        | { ephemeral_5m_input_tokens?: unknown; ephemeral_1h_input_tokens?: unknown }
        | undefined;
      const write5m = count(creation?.ephemeral_5m_input_tokens);
      const write1h = count(creation?.ephemeral_1h_input_tokens);
      const cacheRead = count(result.cache_read_input_tokens);

      records.push({
        model: result.model,
        ts: bucket.starting_at,
        ...(options.label === undefined ? {} : { label: options.label }),
        usage: {
          input_tokens: count(result.uncached_input_tokens),
          output_tokens: count(result.output_tokens),
          ...(cacheRead > 0 ? { cache_read_input_tokens: cacheRead } : {}),
          ...(write5m > 0 || write1h > 0
            ? {
                cache_creation: {
                  ephemeral_5m_input_tokens: write5m,
                  ephemeral_1h_input_tokens: write1h,
                },
              }
            : {}),
        },
      });
      rows += 1;
    }
  }

  return {
    records,
    buckets,
    rows,
    unnamedModel,
    nonStandardTier,
    tierNamed,
    webSearchRequests,
    truncated: report.has_more === true,
    unparseable: 0,
  };
}

/**
 * Whether this text is an Anthropic usage report rather than some other JSON.
 *
 * Three fields together, because each alone is too common to decide on:
 * `uncached_input_tokens` is this endpoint's own name for a count every other
 * shape calls something else, and a report always carries buckets with a
 * `starting_at`. A sniffer that matched on `output_tokens` alone would claim
 * every Messages response ever saved to a file.
 */
export function looksLikeAnthropicUsage(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (!head.includes('"uncached_input_tokens"')) return false;
  return head.includes('"starting_at"') || head.includes('"has_more"');
}
