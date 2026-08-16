import { effectivePricing, multipliersFor } from './pricing.js';
import { createConversationTracker } from './conversation.js';
import { createOutputShapeTracker } from './output-shape.js';
import type { ConversationGrowth } from './conversation.js';
import type { OutputShape } from './output-shape.js';
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
 *
 * `cacheEconomics` is the one counterfactual here, and it is not an exception to
 * that rule — it is the line the rule draws. A saving requires imagining a prompt
 * nobody wrote; this requires imagining the **same tokens at a different rate**,
 * which is arithmetic. Caching does not change what is sent, only the multiplier
 * it is billed at, so "these tokens cost 1.25x instead of 1x" is as measured as
 * the total itself. Anything that would need a guess about content stays out.
 */

/** One recorded call, after parsing. All counts, no content. */
export interface UsageRecord {
  /** Model id as the provider reported it. */
  model: string;
  /** Uncached input tokens billed at the full rate. */
  inputTokens: number;
  /** Tokens billed at the cache-read rate. Zero when nothing was cached. */
  cacheReadTokens: number;
  /** Cache writes at the 5-minute rate — 1.25x input on Anthropic. */
  cacheWrite5mTokens: number;
  /** Cache writes at the 1-hour rate, which is **2x** input, not 1.25x. */
  cacheWrite1hTokens: number;
  /**
   * Whether the log said which TTL those writes used.
   *
   * `false` when only the flat `cache_creation_input_tokens` was present and it
   * was non-zero: the writes are then priced at the cheaper 5-minute rate because
   * one of the two has to be assumed, and the report says so. Choosing the cheaper
   * rate silently understates a 1-hour workload by 37.5% on its largest line.
   */
  writeTtlKnown: boolean;
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
  /**
   * Optional conversation identifier, for measuring what re-sent history costs.
   *
   * On a chat or agent workload the input grows with every turn, because the whole
   * conversation goes back up on each call. That is frequently the largest line on
   * the bill and nothing watches it — a prompt file cannot show it, and a total
   * cannot either.
   *
   * **Trazum never prints this value.** A session key is somebody's conversation
   * and could easily be an account id or an email; it is used to group calls and
   * to count turns, and every figure derived from it is reported per *label*. That
   * keeps the guarantee this module is built on: a usage log handed to Trazum
   * carries no content, and nothing identifying comes back out of it either.
   */
  session: string | null;
}

/** What a set of calls cost, split by where the money went. */
export interface UsageBreakdown {
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /**
   * Calls whose cache-write TTL the log did not state, so the cheaper rate was
   * assumed. Non-zero means this total is a floor on those calls, not a figure.
   */
  assumedWriteTtlCalls: number;
  inputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
  /**
   * What the cache-touched tokens would have cost as ordinary input.
   *
   * Reads plus writes, at each model's own full input rate, accumulated per call
   * because the rate is per model and a total loses that. Not part of `totalUsd`
   * and not a bill — it is the other half of `cacheEconomics`, kept here because
   * it can only be computed while the model is still in hand.
   */
  cachedTokensAtInputRateUsd: number;
  /**
   * `cacheWriteUsd` with every **unstated-TTL** write priced at the 1-hour rate.
   *
   * Equal to `cacheWriteUsd` when the log recorded which TTL each write used.
   * When it did not, the cheaper 5-minute rate is assumed for the headline figure
   * — and this is what the same calls cost if that assumption is wrong.
   *
   * It exists because the assumption reaches further than the total. It moves the
   * *verdict*: a workload reading back between 0.28 and 1.11 tokens per token
   * written is reported as paying for itself at 1.25x and as losing money at 2x,
   * and the log is silent about which. A verdict that cannot see the assumption
   * behind it states the flattering half as a fact.
   */
  cacheWriteUsdIfAssumed1h: number;
}

export interface UsageProfileReport {
  /** Everything, combined. */
  total: UsageBreakdown;
  /** Per `label`, largest bill first — the order somebody would act in. */
  byLabel: Array<{ label: string; breakdown: UsageBreakdown }>;
  /** Per model, largest bill first. */
  byModel: Array<{ model: string; breakdown: UsageBreakdown }>;
  /**
   * Per label **and** model, largest bill first.
   *
   * The grouping a decision is actually made at. "Route `classify` to something
   * cheaper" is a question about the calls `classify` makes to one model, and a
   * label that spans two models has no single answer — pricing it against a
   * cheaper candidate would mean picking one of the two current prices and
   * applying it to tokens that were never billed at it.
   */
  byLabelAndModel: Array<{ label: string; model: string; breakdown: UsageBreakdown }>;
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
  /**
   * What re-sending the conversation costs, where the log carries a session.
   *
   * Empty when it does not, which is a different statement from zero growth — the
   * report says which, because "nothing to report" and "nothing recorded" are the
   * two answers a reader would act on differently.
   */
  conversations: ConversationGrowth[];
  /** Whether any record carried a session at all. */
  hasSessions: boolean;
  /**
   * Where the output spend concentrates, for slices whose output is a real share
   * of the bill. The actionable half of "output dominates": six per cent of calls
   * holding half the spend is a tail worth hunting, forty-five per cent is a task
   * whose answers are inherently long — and the total cannot tell them apart.
   */
  outputShapes: OutputShape[];
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
  assumedWriteTtlCalls: 0,
  inputUsd: 0,
  cacheReadUsd: 0,
  cacheWriteUsd: 0,
  outputUsd: 0,
  totalUsd: 0,
  cachedTokensAtInputRateUsd: 0,
  cacheWriteUsdIfAssumed1h: 0,
});

/**
 * A count, and whether the log actually said it.
 *
 * **Absent and corrupt are different, and conflating them cost the whole bill.**
 * The first version used one helper that returned a fallback for both, so a field
 * present as `"200000"` or `null` — a string count out of `jq`, a null out of a
 * Postgres JSON round-trip — became a clean zero indistinguishable from a real
 * one. The record survived, its token class vanished, and it was never added to
 * `skippedLines`, so nothing on screen said a number had been thrown away.
 *
 * Measured on a two-line log with a stringified `input_tokens`: the report came to
 * $0.0150 against a true $2.015, and the headline flipped to "output is 100% of
 * this bill, so shortening prompts has a low ceiling" — the opposite of the truth
 * on a workload that was almost entirely prompt.
 *
 * So: absent is a zero anybody may legitimately mean, and corrupt rejects the
 * line.
 */
type Count = { kind: 'ok'; value: number } | { kind: 'absent' } | { kind: 'corrupt' };

const OK = (value: number): Count => ({ kind: 'ok', value });

function readCount(...candidates: unknown[]): Count {
  let sawCorrupt = false;
  for (const value of candidates) {
    if (value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return OK(value);
    // Present and unusable: a string, a null, a negative, a NaN.
    sawCorrupt = true;
  }
  return sawCorrupt ? { kind: 'corrupt' } : { kind: 'absent' };
}

/** Zero for an absent count. Callers reject corrupt ones before reaching this. */
const valueOf = (count: Count): number => (count.kind === 'ok' ? count.value : 0);

/**
 * One line of a usage log, or `null` when it is not one.
 *
 * Accepts the Anthropic shape and the OpenAI one, because those are the two
 * things people actually have. The alternative — a Trazum-specific schema — asks
 * for a transformation step before the tool will read anything, and a tool with a
 * setup cost that exceeds its payoff does not get run twice.
 *
 * `null` in three cases, and the third is the one that was wrong:
 *
 * 1. Not JSON, or not an object, or no `model`.
 * 2. **No** token counts at all — counting it would inflate the call count while
 *    contributing nothing, which lowers every per-call figure.
 * 3. **Any** count present but unreadable. A field that is there and unusable is
 *    corruption, and a corrupt line belongs in `skippedLines` where the report
 *    names it, not in the totals as a silent zero.
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
  const openAiCached = details ? readCount(details.cached_tokens) : ({ kind: 'absent' } as Count);

  /**
   * Anthropic splits cache writes by time-to-live, and the two cost different
   * amounts: 1.25x input for the 5-minute entry, **2x** for the 1-hour one.
   *
   * Reading only the flat `cache_creation_input_tokens` threw that distinction
   * away and then priced everything at the cheaper rate — a 1-hour workload
   * reported 37.5% under, silently, on its largest line. The split is in the log
   * whenever the recording recipe in the README is followed, because it is part of
   * the `usage` object the API returns.
   */
  const creation =
    typeof usage.cache_creation === 'object' && usage.cache_creation !== null
      ? (usage.cache_creation as Record<string, unknown>)
      : null;
  const write5m = creation ? readCount(creation.ephemeral_5m_input_tokens) : ({ kind: 'absent' } as Count);
  const write1h = creation ? readCount(creation.ephemeral_1h_input_tokens) : ({ kind: 'absent' } as Count);

  const counts: Record<string, Count> = {
    input: readCount(usage.input_tokens, usage.inputTokens, usage.prompt_tokens),
    output: readCount(usage.output_tokens, usage.outputTokens, usage.completion_tokens),
    cacheRead: readCount(usage.cache_read_input_tokens, usage.cacheReadTokens),
    cacheWrite: readCount(usage.cache_creation_input_tokens, usage.cacheWriteTokens),
    openAiCached,
    write5m,
    write1h,
  };

  // Any field present and unreadable rejects the line. See `readCount`.
  if (Object.values(counts).some((c) => c.kind === 'corrupt')) return null;
  // Nothing to count at all.
  if (Object.values(counts).every((c) => c.kind === 'absent')) return null;

  const cached = valueOf(counts.openAiCached!);
  const flatWrite = valueOf(counts.cacheWrite!);
  const split5m = valueOf(counts.write5m!);
  const split1h = valueOf(counts.write1h!);
  const hasSplit = counts.write5m!.kind === 'ok' || counts.write1h!.kind === 'ok';

  return {
    model,
    inputTokens: Math.max(0, valueOf(counts.input!) - cached),
    cacheReadTokens: counts.cacheRead!.kind === 'ok' ? counts.cacheRead!.value : cached,
    /**
     * The split when the log carries it, the flat number otherwise — and
     * `writeTtlKnown` says which, so the report can admit that a rate was assumed
     * rather than quietly choosing the cheaper one.
     */
    cacheWrite5mTokens: hasSplit ? split5m : flatWrite,
    cacheWrite1hTokens: hasSplit ? split1h : 0,
    writeTtlKnown: hasSplit || flatWrite === 0,
    outputTokens: valueOf(counts.output!),
    label:
      typeof record.label === 'string' && record.label.trim() !== ''
        ? record.label.trim()
        : null,
    /**
     * Read from either spelling, because both are what people already have:
     * `session` in a hand-rolled log, `conversation_id` in most chat schemas.
     * Refusing one of them would make the field's adoption a chore, and a field
     * nobody sets measures nothing.
     */
    session:
      typeof record.session === 'string' && record.session.trim() !== ''
        ? record.session.trim()
        : typeof record.conversation_id === 'string' && record.conversation_id.trim() !== ''
          ? record.conversation_id.trim()
          : null,
  };
}

/** The bucket unlabelled calls land in, named so a report can say so. */
export const UNLABELLED = 'unlabelled';

/** Token counts only. Used for both halves, because both need them. */
function countInto(into: UsageBreakdown, record: UsageRecord): void {
  into.calls += 1;
  into.inputTokens += record.inputTokens;
  into.cacheReadTokens += record.cacheReadTokens;
  into.cacheWriteTokens += record.cacheWrite5mTokens + record.cacheWrite1hTokens;
  if (!record.writeTtlKnown) into.assumedWriteTtlCalls += 1;
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
  /**
   * Each TTL at its own rate. Anthropic charges 1.25x input for a 5-minute entry
   * and 2x for a 1-hour one, and the first version applied 1.25x to both — 37.5%
   * under on a 1-hour workload, on the largest line, with nothing on screen
   * saying a rate had been chosen.
   */
  into.cacheWriteUsd += per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m);
  into.cacheWriteUsd += per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h);
  /**
   * The same writes with the assumption taken the other way.
   *
   * A record whose TTL the log did not state has all of its writes in the
   * 5-minute bucket — `parseUsageLine` puts them there because one rate has to be
   * chosen — so this prices exactly those at the 1-hour rate instead. Accumulated
   * per call, and per model, because the ratio between the two rates is not a
   * constant: 2.0/1.25 on Anthropic, 1.0/1.0 where a write costs what input
   * costs. Scaling the total afterwards would invent a premium for providers that
   * have none.
   */
  const writeRateIfWrong = record.writeTtlKnown ? rates.cacheWrite5m : rates.cacheWrite1h;
  into.cacheWriteUsdIfAssumed1h += per(record.cacheWrite5mTokens, inputPerMTok * writeRateIfWrong);
  into.cacheWriteUsdIfAssumed1h += per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h);
  into.outputUsd += per(record.outputTokens, outputPerMTok);
  /**
   * The same cache-touched tokens at the plain input rate, banked here because
   * `inputPerMTok` is per model and is gone by the time anybody reads the total.
   */
  into.cachedTokensAtInputRateUsd += per(
    record.cacheReadTokens + record.cacheWrite5mTokens + record.cacheWrite1hTokens,
    inputPerMTok,
  );
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
  // Keyed on a pair, so the key carries a separator that cannot occur in either
  // half. A model id is `[A-Za-z0-9._-]`, so a newline is safe in both.
  const byPair = new Map<string, UsageBreakdown>();
  const unpricedModels = new Set<string>();
  const skippedLines: number[] = [];
  /**
   * Fed in the pass this function already makes, rather than by keeping the records
   * for a second one: a usage log is measured in megabytes, and what this holds is
   * bounded by the number of conversations instead.
   */
  const conversations = createConversationTracker({ catalogue, on });
  const output = createOutputShapeTracker({ catalogue, on });
  let hasSessions = false;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const record = parseUsageLine(line);
    if (!record) {
      skippedLines.push(i + 1);
      continue;
    }

    if (record.session !== null) hasSessions = true;
    conversations.add(record);
    output.add(record);

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

    const pairKey = `${labelKey}\n${record.model}`;
    if (!byPair.has(pairKey)) byPair.set(pairKey, EMPTY());
    add(byPair.get(pairKey)!, record, catalogue, on);
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
    byLabelAndModel: [...byPair.entries()]
      .sort((a, b) => b[1].totalUsd - a[1].totalUsd || a[0].localeCompare(b[0]))
      .map(([key, breakdown]) => {
        const split = key.indexOf('\n');
        return { label: key.slice(0, split), model: key.slice(split + 1), breakdown };
      }),
    unpricedModels: [...unpricedModels].sort(),
    unpriced,
    skippedLines,
    conversations: conversations.finish(total.totalUsd),
    hasSessions,
    outputShapes: output.finish(total.totalUsd),
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

/** What caching did to this bill, measured against the same tokens uncached. */
export interface CacheEconomics {
  /** What the cache-touched tokens actually cost: reads plus writes. */
  spentUsd: number;
  /** What those same tokens would have cost billed as ordinary input. */
  withoutCachingUsd: number;
  /**
   * `spentUsd - withoutCachingUsd`.
   *
   * **Positive means caching cost more than it saved** — the opposite of the sign
   * convention everywhere else in Trazum, and deliberately so, because this is the
   * number nobody expects to come out positive and the one worth interrupting for.
   */
  deltaUsd: number;
  /**
   * Read tokens per write token, or `null` when nothing was written.
   *
   * Context for the delta, not a verdict of its own: the delta already decides,
   * and it decides at the real per-model rates. This says *why* — a ratio near
   * zero on an Anthropic workload is a prefix being rebuilt faster than it is
   * reused, which is the shape of a cache that never gets to work.
   */
  readsPerWrite: number | null;
  verdict: CacheVerdict;
  /**
   * `deltaUsd` with every write whose TTL the log did not state priced at the
   * 1-hour rate instead of the assumed 5-minute one.
   *
   * Equal to `deltaUsd` when every TTL was recorded, and never smaller: the
   * 1-hour multiplier is at or above the 5-minute one on every model in the
   * catalogue, so this is a genuine worst case rather than the other end of a
   * range.
   */
  worstCaseDeltaUsd: number;
  /**
   * The verdict at that worst case.
   *
   * **When this differs from `verdict`, the log cannot settle the question** and
   * neither can any report built from it. That is not a rare shape: a workload
   * reading back between 0.28 and 1.11 tokens per token written flips between
   * `paid-off` and `lost-money` on the TTL alone, and a log carrying only the flat
   * `cache_creation_input_tokens` never says which. Measured on a million written
   * tokens against three hundred thousand read back, the difference was a $0.10
   * saving against a $3.65 loss — a $3.75 swing across the sign, and the assumed
   * half is the flattering one.
   */
  worstCaseVerdict: CacheVerdict;
}

/**
 * - `paid-off` — caching took money off the bill.
 * - `lost-money` — caching added to it. Possible on Anthropic, where a write
 *   costs 1.25x input (5-minute) or 2x (1-hour); a prefix that never gets read
 *   back is billed at a premium for nothing.
 * - `no-difference` — the multipliers cancelled out. This is where automatic
 *   caching with a 1x write rate lands when nothing was ever read.
 * - `not-attempted` — no cache tokens at all, in either direction.
 * - `unpriced` — cache tokens with no prices behind them, so there is no
 *   comparison to make. Saying nothing is the only honest answer.
 */
export type CacheVerdict =
  | 'paid-off'
  | 'lost-money'
  | 'no-difference'
  | 'not-attempted'
  | 'unpriced';

/**
 * Floating-point noise, not a judgement threshold.
 *
 * Summing a million per-call doubles around a $100 bill accumulates roughly
 * `n · eps · magnitude` ≈ $2e-8 of drift, and a verdict that flipped on that would
 * be reporting arithmetic error as a finding. A millionth of a dollar is orders of
 * magnitude below anything this tool prints, so nothing real is being rounded away
 * — deliberately not a "too small to care about" cutoff, which would be a
 * judgement and would belong somewhere a reader can see it.
 */
const CACHE_DELTA_NOISE_USD = 1e-6;

/**
 * Did caching pay for itself?
 *
 * The question nothing else in this package can answer, and the one that decides
 * whether the advice the rest of it gives was right. Trazum tells people to cache;
 * on Anthropic a cache **write** costs 1.25x plain input at the 5-minute TTL and
 * **2x** at the 1-hour one, so a prefix that changes faster than it is reused is
 * billed at a premium and returns nothing. That workload would be cheaper with
 * caching switched off, and no other report in this repository would ever say so.
 *
 * The counterfactual is exact, which is why this is allowed to exist here at all:
 * caching changes the multiplier on a token, never the token. Had `cache_control`
 * not been set, the identical prefix would have gone up as ordinary input at 1x.
 * So `withoutCachingUsd` is not an estimate of a different call — it is the same
 * call, arithmetic away.
 *
 * Worth running per label as well as over the whole log. A profitable cache on one
 * workload and a bleeding one on another net out to a comfortable-looking total,
 * and the aggregate is exactly where a loss hides.
 */
export function cacheEconomics(breakdown: UsageBreakdown): CacheEconomics {
  const touchedTokens = breakdown.cacheReadTokens + breakdown.cacheWriteTokens;
  const spentUsd = breakdown.cacheReadUsd + breakdown.cacheWriteUsd;
  const withoutCachingUsd = breakdown.cachedTokensAtInputRateUsd;

  const none = (verdict: CacheVerdict): CacheEconomics => ({
    spentUsd,
    withoutCachingUsd,
    deltaUsd: 0,
    readsPerWrite: null,
    verdict,
    worstCaseDeltaUsd: 0,
    worstCaseVerdict: verdict,
  });

  if (touchedTokens === 0) return none('not-attempted');
  /**
   * Tokens went through the cache and no money is attached to either side, so
   * there is nothing to compare. This is what an unpriced model looks like: the
   * counts accumulate through `countInto` and the dollars never do. Without this
   * guard the delta is `0 - 0` and the verdict comes out `no-difference` — a
   * confident claim about a bill that was never computed.
   */
  if (spentUsd === 0 && withoutCachingUsd === 0) return none('unpriced');

  const deltaUsd = spentUsd - withoutCachingUsd;
  const worstCaseDeltaUsd =
    breakdown.cacheReadUsd + breakdown.cacheWriteUsdIfAssumed1h - withoutCachingUsd;
  const readsPerWrite =
    breakdown.cacheWriteTokens === 0
      ? null
      : breakdown.cacheReadTokens / breakdown.cacheWriteTokens;

  const decide = (delta: number): CacheVerdict =>
    Math.abs(delta) < CACHE_DELTA_NOISE_USD ? 'no-difference' : delta > 0 ? 'lost-money' : 'paid-off';

  return {
    spentUsd,
    withoutCachingUsd,
    deltaUsd,
    readsPerWrite,
    verdict: decide(deltaUsd),
    worstCaseDeltaUsd,
    worstCaseVerdict: decide(worstCaseDeltaUsd),
  };
}
