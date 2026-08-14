import { effectivePricing, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

/**
 * Where the money actually went, from calls that actually happened.
 *
 * ## Why this exists
 *
 * Everything else in this package reads a **prompt file** and reasons about what
 * it would cost. That is the smallest line item on most bills, and the gap is not
 * small enough to argue about: measured on an ordinary support prompt, the
 * deterministic rules recover about **1%** of the monthly figure, while output
 * tokens alone were **87%** of it. A tool that reads `prompts/*.txt` cannot see
 * retrieved context, conversation history, tool results or answers, and on a RAG
 * or agent workload those are nearly the whole invoice.
 *
 * So this reads the other direction: **what the provider actually charged**, per
 * call, and says where it went. The sentence it is built to produce is "63% of
 * your bill is retrieved context and nothing is watching it", which is a fact
 * about a system rather than an estimate about a file.
 *
 * ## It reads a file, and that is the design
 *
 * Not a proxy, not an SDK wrapper, not a callback. Trazum's whole security
 * position is that prompts do not leave the machine they are on — asserted by
 * tests, not promised — and a tool that sits in the request path trades that away
 * for convenience. A JSON Lines file is something you already have or can produce
 * in three lines, and it keeps the guarantee intact.
 *
 * ## The format is the one the API already gives you
 *
 * Nothing is invented here. Every Anthropic response carries a `usage` object
 * with exactly these fields, so recording a call is:
 *
 * ```ts
 * appendFileSync('usage.jsonl', JSON.stringify({
 *   model: response.model,
 *   ...response.usage,
 * }) + '\n');
 * ```
 *
 * OpenAI's `usage` maps onto the same shape with different names, and
 * `parseUsageLine` accepts both. Asking somebody to transform their logs into a
 * bespoke schema before a tool will read them is how a tool goes unused.
 *
 * ## What it refuses to do
 *
 * **It does not read prompt text and there is nowhere to put it.** The record
 * shape has no field for content, so a usage log handed to Trazum cannot contain
 * a prompt even by accident. That is a stronger promise than "we do not look at
 * it", and it is the reason this takes counts rather than calls.
 *
 * **It reports no saving.** Attributing "you could have saved X" to a call that
 * already happened means guessing what the call should have been, and this module
 * exists precisely because guessing is what the rest of the package has to do.
 * It reports what was spent, split by where it went. What to do about it is a
 * different question and belongs to the advisories.
 */

/** One recorded call, after parsing. All counts, no content. */
export interface UsageRecord {
  /** Model id as the provider reported it. */
  model: string;
  /** Uncached input tokens billed at the full rate. */
  inputTokens: number;
  /** Tokens billed at the cache-read rate. Zero when nothing was cached. */
  cacheReadTokens: number;
  /** Tokens billed at the cache-write rate, which costs more than input once. */
  cacheWriteTokens: number;
  outputTokens: number;
  /**
   * Optional label for grouping — an endpoint, a feature, a prompt name.
   *
   * The whole value of a profile is answering "which part of the product costs
   * this", and without a label every call looks alike. Unlabelled records are
   * grouped under a single bucket rather than dropped, because a profile that
   * refuses to read a log until it is annotated is a profile nobody runs.
   */
  label: string | null;
}

/** What a set of calls cost, split by where the money went. */
export interface UsageBreakdown {
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  inputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
}

export interface UsageProfileReport {
  /** Everything, combined. */
  total: UsageBreakdown;
  /** Per `label`, largest bill first — the order somebody would act in. */
  byLabel: Array<{ label: string; breakdown: UsageBreakdown }>;
  /** Per model, largest bill first. */
  byModel: Array<{ model: string; breakdown: UsageBreakdown }>;
  /**
   * Models in the log that the pricing catalogue does not know.
   *
   * Named rather than silently costed at zero. A profile that quietly omits a
   * model reports a total lower than the real bill, which is the flattering
   * direction and the one this repository refuses.
   */
  unpricedModels: string[];
  /**
   * What those models used, kept entirely out of `total`.
   *
   * The first version added their **tokens** to the totals and their **dollars**
   * to nothing, because pricing failed after the counts had been accumulated. So
   * `total.inputTokens` included them and `total.inputUsd` did not, and anybody
   * dividing one by the other got a cost per token that was wrong by however much
   * of the log was unpriced — silently, and low.
   *
   * They are separated now. `total` is what could be priced, tokens and dollars
   * describing the same calls. This is what could not, so the size of the gap is
   * visible instead of being folded into a number that looks complete.
   */
  unpriced: UsageBreakdown;
  /**
   * Lines that could not be read, with their 1-based position.
   *
   * Reported rather than thrown on. A log with three malformed lines out of forty
   * thousand should still produce a profile, and a parser that dies on the first
   * one makes the tool unusable on real data — but a parser that skips quietly
   * produces a total that is wrong by an unknown amount.
   */
  skippedLines: number[];
}

/** The share of the bill each part accounts for, as fractions of 1. */
export interface UsageShares {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

const EMPTY = (): UsageBreakdown => ({
  calls: 0,
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  inputUsd: 0,
  cacheReadUsd: 0,
  cacheWriteUsd: 0,
  outputUsd: 0,
  totalUsd: 0,
});

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/**
 * One line of a usage log, or `null` when it is not one.
 *
 * Accepts the Anthropic shape and the OpenAI one, because those are the two
 * things people actually have. The alternative — a Trazum-specific schema — asks
 * for a transformation step before the tool will read anything, and a tool with a
 * setup cost that exceeds its payoff does not get run twice.
 *
 * A record with no token counts at all is `null` rather than a zero-cost call:
 * counting it would inflate the call count while contributing nothing, which
 * silently lowers every per-call figure in the report.
 */
export function parseUsageLine(line: string): UsageRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  // Anthropic nests usage on a response; a hand-rolled log usually flattens it.
  const usage =
    typeof record.usage === 'object' && record.usage !== null
      ? (record.usage as Record<string, unknown>)
      : record;

  const model = typeof record.model === 'string' ? record.model : null;
  if (!model) return null;

  const inputTokens = numberOr(
    usage.input_tokens,
    numberOr(usage.inputTokens, numberOr(usage.prompt_tokens, -1)),
  );
  const outputTokens = numberOr(
    usage.output_tokens,
    numberOr(usage.outputTokens, numberOr(usage.completion_tokens, -1)),
  );
  if (inputTokens < 0 && outputTokens < 0) return null;

  /**
   * OpenAI reports cached tokens inside `prompt_tokens_details` **and counts them
   * in `prompt_tokens`**, while Anthropic reports them separately and does not.
   * Subtracting in one case and not the other is the difference between a correct
   * bill and one that charges the cached half twice.
   */
  const details =
    typeof usage.prompt_tokens_details === 'object' && usage.prompt_tokens_details !== null
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : null;
  const openAiCached = details ? numberOr(details.cached_tokens, 0) : 0;

  const cacheReadTokens = numberOr(
    usage.cache_read_input_tokens,
    numberOr(usage.cacheReadTokens, openAiCached),
  );
  const cacheWriteTokens = numberOr(
    usage.cache_creation_input_tokens,
    numberOr(usage.cacheWriteTokens, 0),
  );

  const billedInput = Math.max(0, inputTokens < 0 ? 0 : inputTokens - openAiCached);

  const label =
    typeof record.label === 'string' && record.label.trim() !== ''
      ? record.label.trim()
      : null;

  return {
    model,
    inputTokens: billedInput,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens: outputTokens < 0 ? 0 : outputTokens,
    label,
  };
}

/** The bucket unlabelled calls land in, named so a report can say so. */
export const UNLABELLED = 'unlabelled';

/** Token counts only. Used for both halves, because both need them. */
function countInto(into: UsageBreakdown, record: UsageRecord): void {
  into.calls += 1;
  into.inputTokens += record.inputTokens;
  into.cacheReadTokens += record.cacheReadTokens;
  into.cacheWriteTokens += record.cacheWriteTokens;
  into.outputTokens += record.outputTokens;
}

function add(into: UsageBreakdown, record: UsageRecord, catalogue: PricingCatalogue, on: Date): boolean {
  /**
   * Looked up directly rather than through `modelFrom`, which **throws** on an id
   * it does not know. A usage log is somebody's production traffic and will
   * contain models this catalogue has never heard of — a fine-tune, a preview, a
   * competitor. Throwing means one unfamiliar id destroys the whole profile;
   * naming it separately means the report is honest about what it could not price
   * and useful about everything else.
   *
   * **Priced first, counted second.** The other order was the bug: counts landed
   * before the lookup could fail, so an unpriced call contributed tokens to a
   * total whose dollars excluded it.
   */
  const model = catalogue.byId.get(record.model);
  if (!model) return false;

  countInto(into, record);
  const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
  const rates = multipliersFor(model);
  const per = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate;

  into.inputUsd += per(record.inputTokens, inputPerMTok);
  into.cacheReadUsd += per(record.cacheReadTokens, inputPerMTok * rates.cacheRead);
  into.cacheWriteUsd += per(record.cacheWriteTokens, inputPerMTok * rates.cacheWrite5m);
  into.outputUsd += per(record.outputTokens, outputPerMTok);
  into.totalUsd =
    into.inputUsd + into.cacheReadUsd + into.cacheWriteUsd + into.outputUsd;
  return true;
}

export interface UsageProfileOptions {
  catalogue: PricingCatalogue;
  /** Date the prices are read at, so a promotional rate resolves the same way. */
  on?: Date;
}

/**
 * Reads a usage log and says where the money went.
 *
 * Takes the whole text rather than a stream: a usage log is measured in megabytes
 * and this package imports no Node builtins, so streaming would mean an interface
 * the browser build cannot satisfy. `@trazum/core/node` is where file reading
 * lives, and it can chunk if it ever needs to.
 */
export function profileUsage(text: string, options: UsageProfileOptions): UsageProfileReport {
  const { catalogue, on = new Date() } = options;

  const total = EMPTY();
  const unpriced = EMPTY();
  const byLabel = new Map<string, UsageBreakdown>();
  const byModel = new Map<string, UsageBreakdown>();
  const unpricedModels = new Set<string>();
  const skippedLines: number[] = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const record = parseUsageLine(line);
    if (!record) {
      skippedLines.push(i + 1);
      continue;
    }

    if (!add(total, record, catalogue, on)) {
      unpricedModels.add(record.model);
      countInto(unpriced, record);
      // Still grouped by model, so the reader can see which unknown id is costing
      // them attention — but with zero dollars, which the grouping makes obvious.
      if (!byModel.has(record.model)) byModel.set(record.model, EMPTY());
      countInto(byModel.get(record.model)!, record);
      continue;
    }

    const labelKey = record.label ?? UNLABELLED;
    if (!byLabel.has(labelKey)) byLabel.set(labelKey, EMPTY());
    add(byLabel.get(labelKey)!, record, catalogue, on);

    if (!byModel.has(record.model)) byModel.set(record.model, EMPTY());
    add(byModel.get(record.model)!, record, catalogue, on);
  }

  const sorted = <K extends string>(
    map: Map<string, UsageBreakdown>,
    key: K,
  ): Array<Record<K, string> & { breakdown: UsageBreakdown }> =>
    [...map.entries()]
      .sort((a, b) => b[1].totalUsd - a[1].totalUsd || a[0].localeCompare(b[0]))
      .map(([name, breakdown]) => ({ [key]: name, breakdown }) as Record<K, string> & {
        breakdown: UsageBreakdown;
      });

  return {
    total,
    byLabel: sorted(byLabel, 'label'),
    byModel: sorted(byModel, 'model'),
    unpricedModels: [...unpricedModels].sort(),
    unpriced,
    skippedLines,
  };
}

/**
 * What share of the bill each part is.
 *
 * The point of the whole module in one function: a caller can print "output is
 * 87% of this" without doing arithmetic that would drift from the arithmetic
 * here.
 *
 * All zeroes when nothing was spent, rather than `NaN`. A profile of an empty log
 * is a legitimate result — no calls yet — and a report full of `NaN%` is a bug
 * report from somebody who did nothing wrong.
 */
export function sharesOf(breakdown: UsageBreakdown): UsageShares {
  const { totalUsd } = breakdown;
  if (totalUsd <= 0) return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  return {
    input: breakdown.inputUsd / totalUsd,
    cacheRead: breakdown.cacheReadUsd / totalUsd,
    cacheWrite: breakdown.cacheWriteUsd / totalUsd,
    output: breakdown.outputUsd / totalUsd,
  };
}

/**
 * How much of the input that could have been cached was.
 *
 * `null` when nothing was cacheable-looking at all — no reads and no writes —
 * because a hit rate over zero attempts is not zero, it is undefined, and
 * printing "0% cache hit rate" for somebody who never turned caching on is a
 * finding about nothing.
 *
 * Reads against reads-plus-full-price-input, deliberately. Cache *writes* are
 * excluded from the denominator: a write is the cost of establishing an entry,
 * not a missed read, and counting it as a miss makes a healthy cache look broken
 * on the day it warms.
 */
export function cacheHitRate(breakdown: UsageBreakdown): number | null {
  const attempts = breakdown.cacheReadTokens + breakdown.inputTokens;
  if (breakdown.cacheReadTokens === 0 && breakdown.cacheWriteTokens === 0) return null;
  if (attempts === 0) return null;
  return breakdown.cacheReadTokens / attempts;
}
