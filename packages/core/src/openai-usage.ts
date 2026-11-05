/**
 * OpenAI's own usage report, read as a usage log.
 *
 * The seventh converter, and the second one that reads a **provider** rather
 * than a tool sitting in front of one. `anthropic-usage.ts` argues why such a
 * converter takes a file and never a key, and every word of that argument
 * holds here: the Usage API needs an admin key, an admin key manages the
 * organisation, and this project holds no provider credential of any kind.
 * The operator runs one `curl`, in their own shell, and pipes the answer in.
 *
 * ## The format is derived, not guessed
 *
 * Every field below is from the published OpenAPI schema of
 * `GET /v1/organization/usage/completions`: a page of `bucket` objects with
 * `start_time` and `end_time` in **Unix seconds**, each holding `results[]`
 * of `organization.usage.completions.result`. The schema's own example is the
 * test fixture, field for field, because a converter tested against a shape
 * somebody remembered is a converter that mis-reads a real bill and passes
 * its own tests doing it.
 *
 * ## Why the record is the OpenAI shape and not the Anthropic one
 *
 * The schema says `input_tokens` is *"the aggregated number of input tokens
 * used, including cached and cache-write tokens"*. That is the Chat
 * Completions convention — `prompt_tokens` counts the cached half and
 * `prompt_tokens_details.cached_tokens` says how much of it was cached — and
 * `parseUsageLine` already subtracts through exactly that pair. So the record
 * is written in that shape: `prompt_tokens` from `input_tokens`,
 * `prompt_tokens_details.cached_tokens` from `input_cached_tokens`,
 * `completion_tokens` from `output_tokens`. Writing it as Anthropic's
 * `input_tokens` would double-charge the cached half, silently, on the
 * largest line of the bill; the test that parses a converted record back is
 * the one that proves the shape.
 *
 * The example in the schema is also an arithmetic check the converter relies
 * on: `input_tokens` = `input_uncached_tokens` + `input_cached_tokens` +
 * `input_cache_write_tokens`, and each of the uncached and cached totals is
 * the sum of its text, audio and image parts. Every figure below follows from
 * that identity and none is invented beside it.
 *
 * ## What it refuses to price, and counts instead
 *
 * **A result with no model.** `model` is `null` unless the caller passed
 * `group_by[]=model`. Nothing on such a row says what answered, so nothing
 * can price it: refused, counted, and the count names the missing parameter.
 *
 * **A batch row.** `batch` is `true` only with `group_by[]=batch`, and a batch
 * job is billed at a discount a catalogue rate knows nothing about. Priced
 * from that rate it would overstate the bill and look right doing it. Left
 * out and counted. When the report never names `batch` at all, the
 * conversion says the question was not asked, because the alternative is a
 * reader assuming it was answered.
 *
 * **A service tier with no table of its own.** OpenAI sells Flex, Fast
 * (Priority until 2026-07-30) and Ultrafast from tables of their own, and the
 * catalogue writes each model's row of each one out in `serviceTiers`. A row
 * at one of those tiers, on a model whose catalogue row has that tier's table,
 * is carried into the record as `service_tier` and priced from that table,
 * exactly as a logged response naming the same tier is: the published rate
 * for the tier that ran, not a multiple of another.
 *
 * Anything else is still left out, counted, and *named*: a tier the
 * catalogue has no table for on that model (GPT-4o has no Flex), and any
 * value `serviceTierOf` does not know, because the schema does not enumerate
 * the tiers and so this does not either. Pricing such a row at the standard
 * rate would put a Flex bill at twice its cost and look right doing it; the
 * operator sees `flex` or `scale` or whatever the report said, never a
 * number standing in for it.
 *
 * **Audio and image tokens.** `input_tokens` folds text, audio and image
 * tokens together, and a text rate is not the rate for the other two. A row
 * with any of them is reduced to its **text part** — `input_text_tokens`,
 * `input_cached_text_tokens`, `output_text_tokens` are the schema's own split
 * — and the audio and image tokens are counted as a named gap that no line
 * of the output claims. Cache-write tokens carry no modality in the schema,
 * so on such a row they are left out too, and counted, rather than guessed
 * text. A mixed row whose report lacks the split cannot be reduced and is
 * refused whole.
 *
 * **A truncated report.** `has_more: true` means one page of several, and a
 * bill built from it is understated by whatever was not fetched.
 *
 * ## What deliberately does not cross
 *
 * `user_id` and `api_key_id` are read by nothing here: one names a person,
 * the other a credential, and neither is a project name. `project_id` is
 * read only through a mapping the operator writes, exactly as
 * `--label-by-workspace` does for Anthropic, matched exactly because an
 * opaque id has no hierarchy to take a prefix of.
 *
 * Unlike Anthropic's `workspace_id`, a `null` here means one thing only:
 * the report was not grouped by project. Every OpenAI request belongs to a
 * project and every project has an id, so there is no default named by
 * absence and no second reading to derive.
 */

import { BUNDLED_CATALOGUE, multipliersFor, serviceTierOf } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

/** One project, and the label the operator gives it. Matched exactly. */
export interface ProjectLabel {
  project: string;
  label: string;
}

/** One converted record, in the shape `parseUsageLine` reads OpenAI usage. */
export interface OpenaiUsageRecord {
  model: string;
  ts: string;
  label?: string;
  /**
   * `num_model_requests` when the bucket sums more than one, `null` when the
   * row does not carry a usable count, and absent when it is exactly one
   * request, which is then a call like any other. See `UsageRecord.requests`.
   */
  requests?: number | null;
  /**
   * The report's own tier, as it spelled it, when it is one the catalogue
   * prices this model from: `parseUsageLine` reads it as a response's
   * `service_tier` and the call is priced from that tier's table. Absent for
   * the default tier.
   */
  service_tier?: string;
  /** True when the row ran on the Batch API: billed at the row's batch ratio. */
  batch?: true;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    /**
     * Both inside `prompt_tokens`, as OpenAI counts them, and both taken out of
     * it by `parseUsageLine`. `cache_write_tokens` is the 30-minute write
     * GPT-5.6 and later bill at 1.25x input.
     */
    prompt_tokens_details?: { cached_tokens: number; cache_write_tokens?: number };
  };
}

export interface OpenaiUsageConversion {
  records: OpenaiUsageRecord[];
  /** Time buckets in the report, including intervals with no usage. */
  buckets: number;
  /** Results that became records. */
  rows: number;
  /** `num_model_requests`, summed. Informative: a bucket is not a call. */
  requests: number;
  /** Results with `model: null`, which nothing can price. */
  unnamedModel: number;
  /** Results with `batch: true` on a model with no batch rate, left out. */
  batch: number;
  /** Results with `batch: true` that became records priced at the row's batch ratio. */
  batchRows: number;
  /** Whether any result said whether it was batch at all. */
  batchNamed: boolean;
  /**
   * Results at a service tier other than `default` that no table prices, left
   * out: a tier the model's catalogue row has no table for, or a value
   * `serviceTierOf` does not know.
   */
  nonDefaultTier: number;
  /** The tiers those results named, so the refusal has a name. */
  tiersRefused: string[];
  /** Results at Flex, Fast or Ultrafast that became records priced from that tier's own table. */
  serviceTierRows: number;
  /** The tiers those results named, as the report spelled them. */
  tiersPriced: string[];
  /** Whether any result named a tier at all. */
  tierNamed: boolean;
  /** Results that carried audio or image tokens and were reduced to text. */
  mixedRows: number;
  /** Audio and image tokens, input and output, that no line of the output prices. */
  nonTextTokens: number;
  /** Cache-write tokens on mixed rows, left out because the schema gives them no modality. */
  cacheWriteUnplaced: number;
  /**
   * Tokens written to the 12-hour cache. No price for that write is published
   * anywhere this table can read, so they stay in the prompt total and are
   * priced as plain input, a floor, and named rather than guessed at.
   */
  cacheWrite12hTokens: number;
  /** Mixed rows the report gave no text split for, refused whole. */
  unsplitRows: number;
  /** `has_more`: this is one page and the bill from it is understated. */
  truncated: boolean;
  /** Records whose label came from a project rule rather than `--label`. */
  labelledByProject: number;
  /** Results carrying a project no rule named. They keep `--label` or none. */
  unruledProject: number;
  /** Rules were given and no result carried a project id. */
  projectNotGrouped: boolean;
  /** The input was not the JSON this endpoint returns. */
  unparseable: number;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The modality fields that a text rate is not the rate for. */
const NON_TEXT = [
  'input_audio_tokens',
  'input_cached_audio_tokens',
  'output_audio_tokens',
  'input_image_tokens',
  'input_cached_image_tokens',
  'output_image_tokens',
] as const;

/**
 * @param label the project this usage belongs to, chosen by the operator.
 * @param labelByProject one label per project id, exact match, `--label` as fallback.
 */
export function openaiUsageRecords(
  text: string,
  options: {
    label?: string;
    labelByProject?: readonly ProjectLabel[];
    /**
     * Where a tier's table is looked for. The bundled catalogue unless a
     * caller prices with another; a row whose model this catalogue has no
     * table for at that tier is refused, never priced at the standard rate.
     */
    catalogue?: PricingCatalogue;
  } = {},
): OpenaiUsageConversion {
  const empty: OpenaiUsageConversion = {
    records: [],
    buckets: 0,
    rows: 0,
    requests: 0,
    unnamedModel: 0,
    batch: 0,
    batchRows: 0,
    batchNamed: false,
    nonDefaultTier: 0,
    tiersRefused: [],
    serviceTierRows: 0,
    tiersPriced: [],
    tierNamed: false,
    mixedRows: 0,
    nonTextTokens: 0,
    cacheWriteUnplaced: 0,
    cacheWrite12hTokens: 0,
    unsplitRows: 0,
    truncated: false,
    labelledByProject: 0,
    unruledProject: 0,
    projectNotGrouped: false,
    unparseable: 0,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: 1 };
  }
  const report = asObject(parsed);
  if (report === null || !Array.isArray(report.data)) return { ...empty, unparseable: 1 };

  const rules = options.labelByProject;
  const records: OpenaiUsageRecord[] = [];
  const catalogue = options.catalogue ?? BUNDLED_CATALOGUE;
  const tiersRefused = new Set<string>();
  const tiersPriced = new Set<string>();
  let buckets = 0;
  let rows = 0;
  let requests = 0;
  let unnamedModel = 0;
  let batch = 0;
  let batchNamed = false;
  let batchRows = 0;
  let nonDefaultTier = 0;
  let serviceTierRows = 0;
  let tierNamed = false;
  let mixedRows = 0;
  let nonTextTokens = 0;
  let cacheWriteUnplaced = 0;
  let cacheWrite12hTokens = 0;
  let unsplitRows = 0;
  let labelledByProject = 0;
  let unruledProject = 0;
  let anyProject = false;

  for (const entry of report.data) {
    const bucket = asObject(entry);
    if (bucket === null || typeof bucket.start_time !== 'number' || !Number.isFinite(bucket.start_time)) {
      continue;
    }
    buckets += 1;
    /* Unix seconds, per the schema, and the bucket's start is the only
       instant a summed interval has. */
    const ts = new Date(bucket.start_time * 1000).toISOString();
    if (!Array.isArray(bucket.results)) continue;

    for (const found of bucket.results) {
      const result = asObject(found);
      if (result === null) continue;
      requests += count(result.num_model_requests);

      /*
        A batch job is billed at the row's batch ratio, half the standard rate,
        which the pricing page publishes as its own table and `price-drift.mjs`
        checks weekly. A batch row on a model with no batch rate is left out.
      */
      let batchRow = false;
      if (typeof result.batch === 'boolean') {
        batchNamed = true;
        if (result.batch) {
          const row = typeof result.model === 'string' ? catalogue.byId.get(result.model) : undefined;
          if (row === undefined || multipliersFor(row).batch === null) {
            batch += 1;
            continue;
          }
          batchRow = true;
        }
      }

      let serviceTier: string | undefined;
      if (typeof result.service_tier === 'string') {
        tierNamed = true;
        if (result.service_tier !== 'default' && !(batchRow && result.service_tier === 'batch')) {
          /*
            Priced only from a table that exists for this model at this tier.
            The response path falls back to the standard rate for a tier with
            no table, because a response is one call the provider really ran;
            a report row is the sum of many, and a Flex row priced at the
            standard rate is twice its cost.
          */
          const named = serviceTierOf(result.service_tier);
          const row = typeof result.model === 'string' ? catalogue.byId.get(result.model) : undefined;
          if (named === undefined || row?.serviceTiers?.[named] === undefined) {
            nonDefaultTier += 1;
            tiersRefused.add(result.service_tier);
            continue;
          }
          serviceTier = result.service_tier;
        }
      }

      if (typeof result.model !== 'string' || result.model === '') {
        unnamedModel += 1;
        continue;
      }

      let label = options.label;
      if (rules !== undefined) {
        const project = typeof result.project_id === 'string' ? result.project_id : null;
        if (project !== null) {
          anyProject = true;
          const named = rules.find((rule) => rule.project === project);
          if (named !== undefined) {
            label = named.label;
            labelledByProject += 1;
          } else {
            unruledProject += 1;
          }
        }
      }

      /*
        The whole row is priced only when every token on it is text. Otherwise
        the schema's own split is used and what is not text is counted where
        the reader can see it, never folded into a text rate.
      */
      const nonText = NON_TEXT.reduce((sum, field) => sum + count(result[field]), 0);
      let prompt: number;
      let cached: number;
      let written = 0;
      let completion: number;
      if (nonText === 0) {
        prompt = count(result.input_tokens);
        cached = count(result.input_cached_tokens);
        /*
          `input_tokens` is uncached + cached + both writes, by the schema's own
          example. The 30-minute write has a price and goes where the parser
          prices it; the 12-hour write has none here and stays in the total.
        */
        written = count(result.input_cache_write_tokens);
        cacheWrite12hTokens += count(result.input_cache_write_12h_tokens);
        completion = count(result.output_tokens);
      } else {
        const split =
          typeof result.input_text_tokens === 'number'
          && typeof result.input_cached_text_tokens === 'number'
          && typeof result.output_text_tokens === 'number';
        if (!split) {
          unsplitRows += 1;
          nonTextTokens += nonText;
          continue;
        }
        mixedRows += 1;
        nonTextTokens += nonText;
        cacheWriteUnplaced += count(result.input_cache_write_tokens);
        cached = count(result.input_cached_text_tokens);
        prompt = count(result.input_text_tokens) + cached;
        completion = count(result.output_text_tokens);
      }

      records.push({
        model: result.model,
        ts,
        ...(label === undefined ? {} : { label }),
        ...requestsField(result.num_model_requests),
        ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        ...(batchRow ? { batch: true as const } : {}),
        usage: {
          prompt_tokens: prompt,
          completion_tokens: completion,
          ...(cached > 0 || written > 0
            ? {
                prompt_tokens_details: {
                  cached_tokens: cached,
                  ...(written > 0 ? { cache_write_tokens: written } : {}),
                },
              }
            : {}),
        },
      });
      rows += 1;
      if (batchRow) batchRows += 1;
      if (serviceTier !== undefined) {
        serviceTierRows += 1;
        tiersPriced.add(serviceTier);
      }
    }
  }

  return {
    records,
    buckets,
    rows,
    requests,
    unnamedModel,
    batch,
    batchNamed,
    batchRows,
    nonDefaultTier,
    tiersRefused: [...tiersRefused],
    serviceTierRows,
    tiersPriced: [...tiersPriced],
    tierNamed,
    mixedRows,
    nonTextTokens,
    cacheWriteUnplaced,
    cacheWrite12hTokens,
    unsplitRows,
    truncated: report.has_more === true,
    labelledByProject,
    unruledProject,
    projectNotGrouped: rules !== undefined && !anyProject,
    unparseable: 0,
  };
}

/**
 * Whether this text is an OpenAI completions usage report.
 *
 * The result object carries its own type name, which no other document does;
 * failing that, `num_model_requests` beside a numeric `start_time` is this
 * endpoint's shape and not a saved response's.
 */
export function looksLikeOpenaiUsage(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (head.includes('"organization.usage.completions.result"')) return true;
  return head.includes('"num_model_requests"') && head.includes('"start_time"');
}

/** A bucket's request count as `UsageRecord.requests` reads it: one is a call. */
function requestsField(value: unknown): { requests?: number | null } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return { requests: null };
  return value === 1 ? {} : { requests: value };
}
