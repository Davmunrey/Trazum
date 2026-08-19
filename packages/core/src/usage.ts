import { effectivePricing, multipliersFor } from './pricing.js';
import { createConversationTracker } from './conversation.js';
import { createOutputShapeTracker } from './output-shape.js';
import { createInputShapeTracker } from './input-shape.js';
import { createRepeatsTracker } from './repeats.js';
import { createTruncationRetryTracker } from './truncation-retry.js';
import { createTtlFitTracker } from './ttl-fit.js';
import { createSessionLedgerTracker } from './session-ledger.js';
import { createSessionCostTracker } from './session-cost.js';
import type { SessionCostShape } from './session-cost.js';
import type { CacheTtlFit } from './ttl-fit.js';
import type { SingleTurnCacheWrites } from './session-ledger.js';
import type { ConversationGrowth } from './conversation.js';
import type { OutputShape } from './output-shape.js';
import type { InputShape } from './input-shape.js';
import type { RepeatedTurns } from './repeats.js';
import type { TruncationRetry } from './truncation-retry.js';
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
  /**
   * When the call happened, as epoch milliseconds, or `null` when the log does
   * not say.
   *
   * Read from `ts`, `timestamp`, `created_at` or OpenAI's `created`; ISO 8601
   * strings and epoch numbers both work, with seconds told from milliseconds by
   * magnitude. The clock unlocks the two findings counts alone cannot make:
   * what period this log actually covers, and whether the cache TTL fits how
   * fast the turns arrive — the single most common reason a cache loses money.
   */
  ts: number | null;
  /**
   * Whether the answer hit the output ceiling, when the log says.
   *
   * `true` for Anthropic's `stop_reason: "max_tokens"` and OpenAI's
   * `finish_reason: "length"`; `false` for any other recorded reason; `null`
   * when the log does not carry the field. Three states, because "no truncation
   * recorded" and "no truncation happened" are different answers — the report
   * must not congratulate a log that never measured.
   */
  truncated: boolean | null;
}

/** What a set of calls cost, split by where the money went. */
export interface UsageBreakdown {
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * The two write TTLs kept apart, because they are billed at different rates
   * — 1.25x input for a 5-minute entry and **2x** for a 1-hour one.
   *
   * `cacheWriteTokens` is their sum and stays the figure to read for volume.
   * These exist so the same tokens can be priced again at another model's
   * rates without the ratio between the two being invented: it is not a
   * constant across providers, so a total that has lost the split cannot be
   * repriced, only guessed at.
   *
   * Writes whose TTL the log did not state are in the 5-minute bucket, the
   * same assumption `cacheWriteUsdIfAssumed1h` measures the cost of.
   */
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  outputTokens: number;
  /**
   * Calls whose cache-write TTL the log did not state, so the cheaper rate was
   * assumed. Non-zero means this total is a floor on those calls, not a figure.
   */
  assumedWriteTtlCalls: number;
  /**
   * The largest single call's input, cache reads and writes included — the one
   * number that says whether these calls would fit somewhere else.
   *
   * A cheaper model with a smaller context window does not make this traffic
   * cheaper; it makes some of it impossible, and a price comparison that only
   * multiplies rates would call that a saving. The maximum is the right
   * statistic rather than the mean: one call over the ceiling is a failed
   * call, and an average hides it.
   */
  maxCallInputTokens: number;
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
  /**
   * Calls whose answer hit the output ceiling, and what their output cost.
   *
   * The one category of a bill that is waste without a counterpart: an answer
   * cut off mid-generation was paid for in full, is frequently retried — billed
   * again — and the truncated attempt bought nothing. Output is the largest
   * line on most bills, and this is the slice of it nobody sees.
   */
  truncatedCalls: number;
  truncatedOutputUsd: number;
  /** Calls that recorded a stop reason at all, truncated or not. */
  stopReasonCalls: number;
}

/**
 * How many parsed records carried each optional field.
 *
 * Named rather than inline because `coverageDrift` compares two of these: what
 * a comparison can no longer see is a property of the pair, and a shape only
 * one module can spell is a shape the other has to restate by hand.
 */
export interface FieldCoverage {
  /** Records with a usable `label`. */
  label: number;
  /** Records with a usable `session` or `conversation_id`. */
  session: number;
  /** Records with a readable timestamp. */
  ts: number;
  /** Records with a `stop_reason` or `finish_reason`. */
  stopReason: number;
  /** Records whose cache writes stated which TTL they used. */
  cacheTtl: number;
  /** Records that wrote to the cache at all — the denominator for `cacheTtl`. */
  cacheWrites: number;
  /** Every record that parsed, priced or not — the denominator for the rest. */
  parsed: number;
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
  /**
   * How big a call's input is, and how uneven that is across a slice — the
   * half of the bill a total could only name. "Input is 63% of this bill" is
   * unactionable; whether the p95 call carries twelve times the median call's
   * input decides between capping something and rewriting a prompt.
   *
   * Every figure is a bucket ceiling rather than an interpolated percentile,
   * and slices with too few calls for a percentile to mean anything are left
   * out entirely rather than reported at a precision they do not have.
   */
  inputShapes: InputShape[];
  /**
   * Calls that re-sent the previous call's exact input size, in the same
   * conversation, seconds later — the shape of a retry or a loop.
   *
   * A conversation's input grows with every turn, so two consecutive calls
   * carrying the same size a moment apart is a thing going wrong rather than
   * a thing working. Needs both a session and a clock; empty when the log
   * carries neither, which is a different statement from "none happened".
   */
  repeatedTurns: RepeatedTurns[];
  /**
   * Truncated answers followed within two minutes by another call in the
   * same conversation — the "frequently retried, billed again" half of the
   * truncation finding, measured instead of asserted. The wasted attempt's
   * full price and the follow-up's travel together, with the checkable
   * denominator. Needs a session, a clock and a stop reason; a pattern,
   * never a certainty — the log cannot see content.
   */
  truncationRetries: TruncationRetry[];
  /**
   * The period the log covers, when its records carry a clock, over every
   * parsed record — priced and unpriced alike, because when a call happened is
   * a fact about the log rather than about the catalogue.
   *
   * `calls` is how many records carried a timestamp; compared against the
   * parsed total it says whether the span describes the whole log or a slice
   * of it, and the report states which. **The span is stated, never
   * extrapolated**: "this log covers 13 days" makes the reader's own monthly
   * arithmetic valid, while a per-month figure printed from a partial month
   * would be this module doing the guessing it exists to end.
   */
  span: { fromMs: number; toMs: number; calls: number } | null;
  /**
   * Spend per UTC day, oldest first, over priced records that carry a clock.
   *
   * The shape of a bill over time is the finding the total hides: a steady $3 a
   * day and a quiet week broken by one $40 spike sum to the same number and
   * call for opposite responses. Each day carries its most expensive label so a
   * spike arrives with a suspect attached — per *label*, never per session.
   *
   * UTC deliberately: the log's timestamps carry no zone once parsed, and
   * bucketing by the reader's local midnight would make the same log answer
   * differently in two offices.
   */
  spendByDay: Array<{
    /** `YYYY-MM-DD`, UTC. */
    day: string;
    usd: number;
    calls: number;
    /** The label that spent the most this day, or null when nothing had one. */
    topLabel: string | null;
    topLabelUsd: number;
    /**
     * The day's spend per model, largest first — the series `modelMixDrift`
     * summarises, exposed whole so a spreadsheet or a chart can draw the
     * migration day by day instead of in two halves.
     */
    byModel: Array<{ model: string; usd: number; calls: number }>;
  }>;
  /**
   * Lines that are exact duplicates of an earlier line, and what they added
   * to the total.
   *
   * Reading a directory of rotated logs — or catting them together by hand —
   * makes double-counting easy: a log exported twice, an overlapping export,
   * a copy left in the folder. The bill then reads high, and nothing else in
   * this report can see it, because two identical calls are indistinguishable
   * from one call recorded twice *unless* the record carries a clock.
   *
   * So this counts only records with a `ts`: identical token counts, identical
   * label and session, and the same millisecond. Two real calls colliding on
   * all of that is possible and vanishingly unlikely; without a clock it is
   * ordinary, which is why clockless records are excluded rather than guessed
   * at. The report states the count and the money and stops — whether it is a
   * double export or a busy millisecond is the reader's to know.
   *
   * The comparison is over the **raw line**, not a hash of it: a hash
   * collision would report a duplicate that is not one, and this figure exists
   * to make somebody distrust a total.
   */
  duplicateLines: { count: number; usd: number };
  /**
   * How many parsed records carried each optional field.
   *
   * Every finding this module makes beyond the totals needs a field the log
   * format does not require, and a reader who never adds them sees a report
   * quietly missing half of itself. Counting them turns "Trazum did not tell
   * me about conversation growth" into "none of your 40,000 records carry a
   * session", which is a fact somebody can act on in an afternoon.
   *
   * Counted over records that **parsed**, priced or not: whether a field is
   * present is a property of the log, not of the price catalogue. Partial
   * coverage is the interesting case and is why these are counts rather than
   * booleans — 12 records out of 40,000 carrying a label is not "labelled",
   * and a boolean would call it that.
   */
  fieldCoverage: FieldCoverage;
  /**
   * Spend per hour of the UTC day, 0–23, over priced records that carry a
   * clock — and only the hours that saw traffic.
   *
   * The shape a day has says what kind of workload this is. Spend packed into
   * the hours a country is awake is interactive traffic somebody is waiting
   * on; spend spread evenly across all twenty-four is background work, and
   * background work is exactly what the Batch API halves the price of. The
   * total cannot tell those apart, and neither can the per-day series.
   *
   * UTC deliberately, like `spendByDay`: bucketing by the reader's local hour
   * would make the same log answer differently in two offices, and the log's
   * timestamps carry no zone once parsed. A reader who knows their traffic is
   * in one region can shift the hours themselves; Trazum inventing an offset
   * would be guessing.
   */
  spendByHour: Array<{ hour: number; usd: number; calls: number }>;
  /**
   * How the model mix moved across this log's own span — the drift `--against`
   * can only see with a second log.
   *
   * A bill can grow with no workload growing: traffic quietly migrating from
   * the cheap model to the expensive one, a deploy that flipped a default, a
   * fallback that became the main path. Day totals cannot show it (both
   * models land in the same number) and per-model totals cannot either (a
   * total has no direction). So this splits the log's days into two halves,
   * chronologically, and states each model's **share of the priced spend** in
   * each half, exactly.
   *
   * `null` — not empty — when the log has fewer than four days with priced,
   * dated spend: two points per half is the least a "half" can honestly
   * claim, and a drift computed over one day against one day would be
   * weather presented as climate. The renderings decide what counts as
   * "moved"; the data states the shares and stops. No forecast: where the
   * mix goes next is not in the log.
   */
  modelMixDrift: {
    /** Days in each half. `firstDays + lastDays` = every day with priced spend. */
    firstDays: number;
    lastDays: number;
    /** Priced spend in each half, so a share can be turned back into money. */
    firstUsd: number;
    lastUsd: number;
    /** Per model, every model either half saw. Shares are of that half's spend. */
    models: Array<{ model: string; firstShare: number; lastShare: number; firstUsd: number; lastUsd: number }>;
  } | null;
  /**
   * Whether each slice's cache TTL fits how fast its turns arrive — the
   * mechanism behind a losing cache verdict, and the one place an overlong TTL
   * (2x writes surviving gaps measured in seconds) is ever visible. Needs
   * `session` and a timestamp on the records; empty otherwise, which the
   * report distinguishes from "measured and fine".
   */
  cacheTtlFit: CacheTtlFit[];
  /**
   * The time filter this report was computed under, or `null` when there was
   * none — so a rendering can say "this is a window, not the log" instead of
   * presenting a slice as the whole.
   *
   * `undatedExcluded` is the honesty cost of filtering by a clock some records
   * do not carry: calls that passed every other filter but could not be
   * placed in or out of the window. Non-zero means the window's figures are a
   * floor on the period, and every rendering says so out loud.
   */
  timeWindow: { sinceMs: number | null; untilMs: number | null; undatedExcluded: number } | null;
  /**
   * Cache writes made by conversations that ended after one turn — reuse paid
   * for that their own conversation never made. A ceiling named as one: the
   * provider's cache is keyed by prefix, so another session sharing the
   * prefix within the TTL could have read these writes, and the log cannot
   * see whose write a read hit. When the slice's `cacheReadTokens` is zero
   * the ceiling collapses into a fact — nothing read those writes at all —
   * and the renderings say which of the two they are stating.
   */
  singleTurnCacheWrites: SingleTurnCacheWrites[];
  /**
   * What one conversation costs — median, p95 and maximum per slice, exact
   * and billed. The question a total cannot answer: whether $4,000 is forty
   * thousand cheap conversations or four hundred expensive ones, which is
   * what a per-seat price or a quota is set from. Empty when the log carries
   * no session, or when no slice has enough conversations for a median to
   * mean anything.
   */
  sessionCosts: SessionCostShape[];
  /**
   * The whole log's conversations, summarised to the two numbers a
   * per-conversation budget needs: how many there were, and what the single
   * most expensive one cost. Unlike `sessionCosts` this has no minimum —
   * a maximum is a fact at any count — and like everywhere the field is
   * touched, the session key itself never appears. `null` when no record
   * carried a session: "no conversations to judge" is a different answer
   * from "the worst conversation cost nothing".
   */
  sessionSpend: { sessions: number; maxUsd: number } | null;
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
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  outputTokens: 0,
  assumedWriteTtlCalls: 0,
  maxCallInputTokens: 0,
  inputUsd: 0,
  cacheReadUsd: 0,
  cacheWriteUsd: 0,
  outputUsd: 0,
  totalUsd: 0,
  cachedTokensAtInputRateUsd: 0,
  cacheWriteUsdIfAssumed1h: 0,
  truncatedCalls: 0,
  truncatedOutputUsd: 0,
  stopReasonCalls: 0,
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
/**
 * A moment, from whatever a real log holds, in epoch milliseconds.
 *
 * The same three-state discipline as the counts: absent is fine (`null`),
 * present-and-unreadable is corruption and rejects the line. A timestamp of
 * `null` out of a Postgres round-trip, or `"yesterday"`, silently dropped would
 * mis-measure every gap that record participates in — and unlike a wrong total,
 * a wrong gap has nothing downstream to disagree with it.
 *
 * Numbers are epoch seconds or milliseconds, told apart by magnitude: anything
 * from 1e12 up is milliseconds (September 2001 onward), anything from 1e8 up is
 * seconds (March 1973 onward), and anything smaller names no real moment a
 * usage log could contain. Strings go through `Date.parse`, which reads ISO
 * 8601 — the format both `new Date().toISOString()` and every structured
 * logger emit.
 */
type Moment = { kind: 'ok'; ms: number } | { kind: 'absent' } | { kind: 'corrupt' };

function readMoment(...candidates: unknown[]): Moment {
  let sawCorrupt = false;
  for (const value of candidates) {
    if (value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value >= 1e12) return { kind: 'ok', ms: value };
      if (value >= 1e8) return { kind: 'ok', ms: value * 1000 };
      sawCorrupt = true;
      continue;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return { kind: 'ok', ms: parsed };
    }
    sawCorrupt = true;
  }
  return sawCorrupt ? { kind: 'corrupt' } : { kind: 'absent' };
}

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

  /**
   * Gemini's shape, recognised because it is unambiguous: `usageMetadata`
   * appears in no other provider's response, and its field names collide with
   * nothing above. `promptTokenCount` **includes** `cachedContentTokenCount`,
   * the same double-charge trap OpenAI's `prompt_tokens` sets — so the cached
   * half is subtracted through the same one mechanism rather than a parallel
   * one that could drift from it.
   */
  const geminiMeta =
    typeof usage.usageMetadata === 'object' && usage.usageMetadata !== null
      ? (usage.usageMetadata as Record<string, unknown>)
      : null;
  const geminiCached = geminiMeta
    ? readCount(geminiMeta.cachedContentTokenCount)
    : ({ kind: 'absent' } as Count);

  const counts: Record<string, Count> = {
    input: readCount(
      usage.input_tokens,
      usage.inputTokens,
      usage.prompt_tokens,
      geminiMeta?.promptTokenCount,
    ),
    output: readCount(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      geminiMeta?.candidatesTokenCount,
    ),
    cacheRead: readCount(usage.cache_read_input_tokens, usage.cacheReadTokens),
    cacheWrite: readCount(usage.cache_creation_input_tokens, usage.cacheWriteTokens),
    openAiCached,
    geminiCached,
    write5m,
    write1h,
  };

  // Any field present and unreadable rejects the line. See `readCount`.
  if (Object.values(counts).some((c) => c.kind === 'corrupt')) return null;
  // Nothing to count at all.
  if (Object.values(counts).every((c) => c.kind === 'absent')) return null;

  /**
   * The clock, under the same rule as the counts: a timestamp that is present
   * and unreadable rejects the line rather than becoming a silent absence.
   * `created` is where OpenAI responses carry it (epoch seconds), so a log
   * written by spreading the response already has one.
   */
  const moment = readMoment(record.ts, record.timestamp, record.created_at, record.created);
  if (moment.kind === 'corrupt') return null;

  // Both providers that fold cached tokens into the prompt count, one
  // subtraction. They cannot coexist on a record: the shapes share no field.
  const cached = valueOf(counts.openAiCached!) + valueOf(counts.geminiCached!);
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
    /**
     * Trimmed and internally normalised: any whitespace run becomes one space.
     * A label is a workload name, and it is also used as half of structured keys
     * that split on `\n` — `byLabelAndModel`, the conversation tracker, the
     * output-shape tracker. A label carrying a newline would corrupt that split
     * and mis-file every figure under a truncated name; normalising at the one
     * boundary where labels enter keeps every consumer honest at once.
     */
    label: nameOf(record.label),
    /**
     * Read from either spelling, because both are what people already have:
     * `session` in a hand-rolled log, `conversation_id` in most chat schemas.
     * Refusing one of them would make the field's adoption a chore, and a field
     * nobody sets measures nothing.
     */
    session: nameOf(record.session) ?? nameOf(record.conversation_id),
    ts: moment.kind === 'ok' ? moment.ms : null,
    /**
     * Anthropic spells it `stop_reason: "max_tokens"`, OpenAI
     * `finish_reason: "length"`. Any other recorded reason is a completed
     * answer; an absent field is `null`, which is "not measured" and not "did
     * not happen" — the report treats those differently on purpose.
     */
    truncated: (() => {
      // Gemini spells it `finishReason: "MAX_TOKENS"`, at the record level in
      // any log written by spreading the candidate. Same three-way contract.
      const reason = record.stop_reason ?? record.finish_reason ?? record.finishReason;
      if (typeof reason !== 'string') return null;
      return reason === 'max_tokens' || reason === 'length' || reason === 'MAX_TOKENS';
    })(),
  };
}

/**
 * A label or session identifier, from whatever a real log holds.
 *
 * **Numbers are identifiers too.** A conversation id is an auto-incremented
 * integer in half the databases in existence, and the string-only version
 * dropped `session: 12345` silently and then printed "No call in this log
 * carried a session" — a false claim about a log that carried one on every
 * line. A finite number is taken by its decimal form; booleans, objects and
 * non-finite numbers stay out, because `session: true` names nothing.
 *
 * Strings are trimmed and internally normalised — any whitespace run becomes
 * one space — because labels are half of structured keys that split on a
 * newline, and a label carrying one would mis-file every figure it touches.
 */
function nameOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

/**
 * The bucket unlabelled calls land in.
 *
 * The empty string, because it is the one value a parsed label can never be —
 * `parseUsageLine` trims and rejects empty. The first version used the literal
 * string `'unlabelled'`, and a workload somebody had actually named `unlabelled`
 * merged silently into the missing-label bucket: 200 labelled calls and 200
 * unlabelled ones reported as one row of 400, and the "none of these calls
 * carried a label" warning fired over a log where half of them had.
 *
 * Presentation stays in the CLI, which translates this sentinel through the
 * message catalogue; data consumers can tell `''` from any real label.
 */
export const UNLABELLED = '';

/** Token counts only. Used for both halves, because both need them. */
function countInto(into: UsageBreakdown, record: UsageRecord): void {
  into.calls += 1;
  into.inputTokens += record.inputTokens;
  into.cacheReadTokens += record.cacheReadTokens;
  into.cacheWriteTokens += record.cacheWrite5mTokens + record.cacheWrite1hTokens;
  into.cacheWrite5mTokens += record.cacheWrite5mTokens;
  into.cacheWrite1hTokens += record.cacheWrite1hTokens;
  if (!record.writeTtlKnown) into.assumedWriteTtlCalls += 1;
  into.outputTokens += record.outputTokens;
  into.maxCallInputTokens = Math.max(
    into.maxCallInputTokens,
    record.inputTokens + record.cacheReadTokens + record.cacheWrite5mTokens + record.cacheWrite1hTokens,
  );
  if (record.truncated !== null) {
    into.stopReasonCalls += 1;
    if (record.truncated) into.truncatedCalls += 1;
  }
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
  if (record.truncated === true) {
    into.truncatedOutputUsd += per(record.outputTokens, outputPerMTok);
  }
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
  /**
   * Profile only the records carrying this label — the drill-down, once the
   * full report has named a suspect. `UNLABELLED` (the empty string) selects
   * the records with no label at all. Unreadable lines still land in
   * `skippedLines` whatever they might have been labelled: a filter must not
   * make corruption disappear.
   */
  label?: string;
  /**
   * Profile only the records whose clock falls in `[sinceMs, untilMs)` — the
   * drill-down in time, once the peak day or the span has named a period.
   *
   * Epoch milliseconds, half-open on the right so two adjacent windows share
   * no record. Either bound alone works. **A record with no clock cannot be
   * placed inside or outside a window**, so under a time filter it is
   * excluded and counted in `timeWindow.undatedExcluded` — excluded, because
   * including it would put unknown-time spend inside a window it may not
   * belong to; counted, because dropping it silently would understate the
   * period's bill by an invisible amount, which is the flattering direction.
   */
  sinceMs?: number;
  untilMs?: number;
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
  const { catalogue, on = new Date(), label: onlyLabel, sinceMs, untilMs } = options;
  const windowed = sinceMs !== undefined || untilMs !== undefined;
  let undatedExcluded = 0;

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
  const input = createInputShapeTracker({ catalogue, on });
  const repeats = createRepeatsTracker({ catalogue, on });
  const truncRetries = createTruncationRetryTracker({ catalogue, on });
  const ttlFit = createTtlFitTracker({ catalogue, on });
  const ledger = createSessionLedgerTracker({ catalogue, on });
  const sessionCosts = createSessionCostTracker({ catalogue, on });
  let hasSessions = false;
  const coverage = { label: 0, session: 0, ts: 0, stopReason: 0, cacheTtl: 0, cacheWrites: 0, parsed: 0 };
  /**
   * Raw lines already seen, for the duplicate check. Bounded by the number of
   * *timestamped* lines — the price of catching a doubled bill, paid only on
   * logs that carry a clock.
   */
  const seenLines = new Set<string>();
  /**
   * Priced spend per conversation, for the report-level summary the gates
   * need. `sessionCosts` refuses slices with too few conversations for a
   * percentile; a *maximum* has no such need — the single most expensive
   * conversation in the log is a fact at any count, and it is exactly what a
   * per-conversation budget has to judge. Keys never leave this function.
   */
  const sessionUsd = new Map<string, number>();
  const duplicates = { count: 0, usd: 0 };
  let spanFrom = Infinity;
  let spanTo = -Infinity;
  let spanCalls = 0;
  /** Per UTC day: spend, calls, and spend per label. Bounded by days × labels. */
  const days = new Map<string, { usd: number; calls: number; byLabel: Map<string, number>; byModel: Map<string, { usd: number; calls: number }> }>();
  /** Per hour of the UTC day. Bounded by twenty-four entries, whatever the log. */
  const hours = new Map<number, { usd: number; calls: number }>();

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const record = parseUsageLine(line);
    if (!record) {
      skippedLines.push(i + 1);
      continue;
    }

    // The drill-down: after the skip accounting, so a corrupt line is reported
    // whatever it might have been labelled.
    if (onlyLabel !== undefined && (record.label ?? UNLABELLED) !== onlyLabel) continue;

    /**
     * The time window, after the label filter so `undatedExcluded` counts only
     * the selected workload's clockless calls — a count polluted by every other
     * label's records would overstate how much of *this* answer is missing.
     * Records outside the window are simply not the question; records with no
     * clock are the question left unanswerable, so they are counted.
     */
    if (windowed) {
      if (record.ts === null) {
        undatedExcluded += 1;
        continue;
      }
      if (sinceMs !== undefined && record.ts < sinceMs) continue;
      if (untilMs !== undefined && record.ts >= untilMs) continue;
    }

    /**
     * Coverage is counted before pricing: whether a field is present is a
     * property of the log, and a record on an unknown model still says
     * whether somebody set `label`.
     */
    coverage.parsed += 1;
    if (record.label !== null) coverage.label += 1;
    if (record.session !== null) coverage.session += 1;
    if (record.ts !== null) coverage.ts += 1;
    if (record.truncated !== null) coverage.stopReason += 1;
    if (record.cacheWrite5mTokens + record.cacheWrite1hTokens > 0) {
      coverage.cacheWrites += 1;
      if (record.writeTtlKnown) coverage.cacheTtl += 1;
    }

    if (record.session !== null) hasSessions = true;
    if (record.ts !== null) {
      spanFrom = Math.min(spanFrom, record.ts);
      spanTo = Math.max(spanTo, record.ts);
      spanCalls += 1;
    }
    conversations.add(record);
    output.add(record);
    input.add(record);
    repeats.add(record);
    truncRetries.add(record);
    ttlFit.add(record);
    ledger.add(record);
    sessionCosts.add(record);

    const usdBefore = total.totalUsd;
    if (!add(total, record, catalogue, on)) {
      unpricedModels.add(record.model);
      countInto(unpriced, record);
      // Still grouped by model, so the reader can see which unknown id is costing
      // them attention — but with zero dollars, which the grouping makes obvious.
      if (!byModel.has(record.model)) byModel.set(record.model, EMPTY());
      countInto(byModel.get(record.model)!, record);
      continue;
    }

    /**
     * A line identical to one already read, with a clock to make the claim
     * safe. Counted after pricing so the money is the exact delta this line
     * added, which is what a doubled bill is overstated by.
     */
    if (record.ts !== null) {
      if (seenLines.has(line)) {
        duplicates.count += 1;
        duplicates.usd += total.totalUsd - usdBefore;
      } else {
        seenLines.add(line);
      }
    }

    /**
     * The day's spend, as the exact delta this record just added to the total —
     * the one place the per-record dollar exists without re-deriving the rate
     * arithmetic a second time, where the two could drift apart.
     */
    if (record.session !== null) {
      sessionUsd.set(record.session, (sessionUsd.get(record.session) ?? 0) + (total.totalUsd - usdBefore));
    }
    if (record.ts !== null) {
      const day = new Date(record.ts).toISOString().slice(0, 10);
      const usd = total.totalUsd - usdBefore;
      let entry = days.get(day);
      if (!entry) {
        entry = { usd: 0, calls: 0, byLabel: new Map(), byModel: new Map() };
        days.set(day, entry);
      }
      entry.usd += usd;
      entry.calls += 1;
      const labelKey = record.label ?? UNLABELLED;
      entry.byLabel.set(labelKey, (entry.byLabel.get(labelKey) ?? 0) + usd);
      const modelCell = entry.byModel.get(record.model) ?? { usd: 0, calls: 0 };
      modelCell.usd += usd;
      modelCell.calls += 1;
      entry.byModel.set(record.model, modelCell);

      // The same exact per-record dollar, bucketed by hour of the UTC day.
      const hour = new Date(record.ts).getUTCHours();
      const hourEntry = hours.get(hour);
      if (hourEntry) {
        hourEntry.usd += usd;
        hourEntry.calls += 1;
      } else {
        hours.set(hour, { usd, calls: 1 });
      }
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
    inputShapes: input.finish(total.totalUsd),
    repeatedTurns: repeats.finish(),
    truncationRetries: truncRetries.finish(),
    span: spanCalls > 0 ? { fromMs: spanFrom, toMs: spanTo, calls: spanCalls } : null,
    spendByDay: [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, entry]) => {
        let topLabel: string | null = null;
        let topLabelUsd = 0;
        for (const [label, usd] of entry.byLabel) {
          if (usd > topLabelUsd) {
            topLabel = label;
            topLabelUsd = usd;
          }
        }
        return {
          day,
          usd: entry.usd,
          calls: entry.calls,
          topLabel,
          topLabelUsd,
          byModel: [...entry.byModel.entries()]
            .map(([model, cell]) => ({ model, usd: cell.usd, calls: cell.calls }))
            .sort((a, b) => b.usd - a.usd),
        };
      }),
    duplicateLines: duplicates,
    fieldCoverage: coverage,
    modelMixDrift: (() => {
      const ordered = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      if (ordered.length < 4) return null;
      const mid = Math.floor(ordered.length / 2);
      const halves = [ordered.slice(0, mid), ordered.slice(mid)] as const;
      const totals = halves.map((half) => half.reduce((sum, [, e]) => sum + e.usd, 0));
      // A half with no priced spend has no shares to state — division by zero
      // is not a drift, and neither is a mix over zero dollars.
      if (totals[0]! <= 0 || totals[1]! <= 0) return null;
      const perModel = new Map<string, { first: number; last: number }>();
      halves.forEach((half, index) => {
        for (const [, entry] of half) {
          for (const [model, dayCell] of entry.byModel) {
            const cell = perModel.get(model) ?? { first: 0, last: 0 };
            if (index === 0) cell.first += dayCell.usd;
            else cell.last += dayCell.usd;
            perModel.set(model, cell);
          }
        }
      });
      return {
        firstDays: halves[0].length,
        lastDays: halves[1].length,
        firstUsd: totals[0]!,
        lastUsd: totals[1]!,
        models: [...perModel.entries()]
          .map(([model, cell]) => ({
            model,
            firstShare: cell.first / totals[0]!,
            lastShare: cell.last / totals[1]!,
            firstUsd: cell.first,
            lastUsd: cell.last,
          }))
          // The biggest movement first — the order a reader would act in.
          .sort((a, b) => Math.abs(b.lastShare - b.firstShare) - Math.abs(a.lastShare - a.firstShare)),
      };
    })(),
    spendByHour: [...hours.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, entry]) => ({ hour, usd: entry.usd, calls: entry.calls })),
    cacheTtlFit: ttlFit.finish(),
    timeWindow: windowed
      ? { sinceMs: sinceMs ?? null, untilMs: untilMs ?? null, undatedExcluded }
      : null,
    singleTurnCacheWrites: ledger.finish(),
    sessionCosts: sessionCosts.finish(),
    sessionSpend:
      sessionUsd.size > 0
        ? { sessions: sessionUsd.size, maxUsd: Math.max(...sessionUsd.values()) }
        : null,
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
