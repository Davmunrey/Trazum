import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * What re-sending the conversation costs.
 *
 * ## The line nothing was watching
 *
 * A chat or agent workload sends the whole conversation back on every turn. Turn
 * one is a system prompt and a question; turn twenty is a system prompt and
 * nineteen previous exchanges and a question. The input grows linearly with the
 * turn count, and on an agent bill that growth is routinely the largest single
 * line — larger than the prompt, larger than the answers.
 *
 * Nothing in this package could see it. A prompt file shows the system prompt and
 * not the history. A total shows the sum and not the shape. Even `profile` reported
 * "input is 71% of this bill" without being able to say that most of that input was
 * the same sentences, sent again.
 *
 * ## What it will and will not claim
 *
 * The honest figure is a **ceiling**, and it is exact: what this workload would
 * have cost if every turn had cost what its own first turn cost. Subtract that from
 * what was actually spent and you have the most that eliminating conversation
 * growth could ever be worth.
 *
 * It is a ceiling and not a saving because part of that growth is the user's own
 * new messages, which nobody can truncate away, and this module cannot tell those
 * apart from re-sent history — it sees counts, not content. Reporting the ceiling
 * as an opportunity would be the flattering direction; reporting nothing because
 * the exact split is unknowable would be worse. So it reports the bound and says
 * what it is.
 *
 * ## The session key never leaves this module
 *
 * A session identifier is somebody's conversation, and in a real log it is often an
 * account id, a ticket number or an email. It is used to group calls and count
 * turns; **no figure reported anywhere carries it**, and every result is aggregated
 * per label. The promise that a usage log handed to Trazum contains no content is
 * only worth something if nothing identifying comes back out either.
 */

/** How one label-and-model slice grows across a conversation. */
export interface ConversationGrowth {
  label: string;
  model: string;
  modelName: string;
  /** How many distinct conversations were seen. Never which ones. */
  sessions: number;
  calls: number;
  /** Mean input tokens on the opening turn of a conversation. */
  firstTurnTokens: number;
  /** Mean input tokens on the closing turn. */
  lastTurnTokens: number;
  /** Turns in the longest conversation seen. */
  longestSession: number;
  /** Input-side spend: plain input, cache reads and cache writes. */
  inputUsd: number;
  /** What that would have been if every turn had cost what its own first turn did. */
  flatUsd: number;
  /**
   * `inputUsd - flatUsd`. **A ceiling on what removing conversation growth could
   * be worth, not a saving** — part of it is the user's own new messages.
   */
  growthUsd: number;
  /** `growthUsd` as a fraction of the whole bill in the log. */
  shareOfBill: number;
}

export interface ConversationOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /**
   * Slices whose growth is below this share of the bill are dropped, and slices
   * shorter than `minTurns` never count as conversations at all.
   */
  minShare?: number;
  /**
   * Conversations shorter than this are ignored.
   *
   * Two turns is not a conversation, it is a retry — and a workload that never
   * exceeds two turns has no growth to measure, so including it would put a row on
   * screen whose figure is arithmetic noise. Default 3.
   */
  minTurns?: number;
}

/** Input-side cost of one call at its own model's rates. */
function inputCostOf(record: UsageRecord, catalogue: PricingCatalogue, on: Date): number | null {
  const model = catalogue.byId.get(record.model);
  if (!model) return null;
  const { inputPerMTok } = effectivePricing(model, on);
  const rates = multipliersFor(model);
  const per = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate;
  return (
    per(record.inputTokens, inputPerMTok) +
    per(record.cacheReadTokens, inputPerMTok * rates.cacheRead) +
    per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
    per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h)
  );
}

/** Every input-side token of one call, whatever rate it was billed at. */
const inputTokensOf = (r: UsageRecord): number =>
  r.inputTokens + r.cacheReadTokens + r.cacheWrite5mTokens + r.cacheWrite1hTokens;

interface Session {
  turns: number;
  firstCostUsd: number;
  firstTokens: number;
  lastTokens: number;
  totalUsd: number;
}

/**
 * Measures what conversation growth costs, from records that carry a session.
 *
 * Records without one are skipped rather than lumped together: calls from
 * different conversations pushed into a single bucket would report a turn count
 * that is really a call count, and a growth figure derived from it would be
 * arithmetic performed on a fiction.
 *
 * Takes records rather than a report because turn order is the whole measurement,
 * and a breakdown has already thrown it away.
 */
export interface ConversationTracker {
  /** Feed one parsed record. Records without a session are ignored. */
  add(record: UsageRecord): void;
  /** The finished measurement, once the whole bill is known. */
  finish(totalUsd: number): ConversationGrowth[];
}

/**
 * An accumulator, so a profile can measure this in the pass it already makes.
 *
 * The alternative was holding every record to hand to a pure function afterwards,
 * and a usage log is measured in megabytes — a profile that needs the whole file in
 * memory to answer one question is a profile that stops working on the logs most
 * worth reading. What this holds is bounded by the number of **conversations**, and
 * only ever four numbers each.
 */
export function createConversationTracker(options: ConversationOptions): ConversationTracker {
  const { catalogue, on = new Date(), minShare = 0.01, minTurns = 3 } = options;

  // Keyed on the pair, then on the session inside it. A newline cannot occur in a
  // model id, and both halves are trimmed strings.
  const slices = new Map<string, Map<string, Session>>();

  const add = (record: UsageRecord): void => {
    if (record.session === null) return;
    const cost = inputCostOf(record, catalogue, on);
    // An unpriced model contributes no dollars anywhere else either; including it
    // here would report growth of zero on a workload that grew.
    if (cost === null) return;

    const sliceKey = `${record.label ?? UNLABELLED}\n${record.model}`;
    let sessions = slices.get(sliceKey);
    if (!sessions) {
      sessions = new Map();
      slices.set(sliceKey, sessions);
    }

    const tokens = inputTokensOf(record);
    const existing = sessions.get(record.session);
    if (!existing) {
      sessions.set(record.session, {
        turns: 1,
        firstCostUsd: cost,
        firstTokens: tokens,
        lastTokens: tokens,
        totalUsd: cost,
      });
      return;
    }
    existing.turns += 1;
    existing.lastTokens = tokens;
    existing.totalUsd += cost;
  };

  const finish = (totalUsd: number): ConversationGrowth[] => {
  const out: ConversationGrowth[] = [];

  for (const [sliceKey, sessions] of slices) {
    const split = sliceKey.indexOf('\n');
    const label = sliceKey.slice(0, split);
    const modelId = sliceKey.slice(split + 1);
    const model = catalogue.byId.get(modelId);
    if (!model) continue;

    /**
     * Only conversations long enough to have grown. A two-turn session has one
     * step of growth and is as likely to be a retry, and averaging it in drags the
     * measured shape towards flat — understating the real thing, which is the
     * direction that flatters.
     */
    const long = [...sessions.values()].filter((s) => s.turns >= minTurns);
    if (long.length === 0) continue;

    let inputUsd = 0;
    let flatUsd = 0;
    let firstTokens = 0;
    let lastTokens = 0;
    let calls = 0;
    let longestSession = 0;

    for (const session of long) {
      inputUsd += session.totalUsd;
      // What every turn would have cost at this conversation's own opening price.
      flatUsd += session.firstCostUsd * session.turns;
      firstTokens += session.firstTokens;
      lastTokens += session.lastTokens;
      calls += session.turns;
      longestSession = Math.max(longestSession, session.turns);
    }

    const growthUsd = inputUsd - flatUsd;
    const shareOfBill = totalUsd > 0 ? growthUsd / totalUsd : 0;
    /**
     * Below the attention threshold — **and that covers shrinking conversations
     * too**, because a negative share is below any threshold at or above zero.
     *
     * There was a separate `growthUsd <= 0` check here. No mutation could break
     * it: every case it caught, this one caught first. A guard nothing can
     * distinguish is not defence in depth, it is a second place for the intent to
     * drift from the code, so the intent lives in this comment instead.
     *
     * The case it was written for is ordinary: an opening turn carrying an
     * attachment or a retrieved document is bigger than everything after it, and
     * reporting that as "conversation growth" would be a negative ceiling
     * presented as an opportunity.
     */
    if (shareOfBill < minShare) continue;

    out.push({
      label,
      model: modelId,
      modelName: model.displayName,
      sessions: long.length,
      calls,
      firstTurnTokens: firstTokens / long.length,
      lastTurnTokens: lastTokens / long.length,
      longestSession,
      inputUsd,
      flatUsd,
      growthUsd,
      shareOfBill,
    });
  }

    return out.sort((a, b) => b.growthUsd - a.growthUsd);
  };

  return { add, finish };
}

/**
 * The same measurement over a list of records, for a caller holding one already.
 *
 * `profileUsage` uses the tracker instead, so it never has to keep the log.
 */
export function conversationGrowth(
  records: readonly UsageRecord[],
  totalUsd: number,
  options: ConversationOptions,
): ConversationGrowth[] {
  const tracker = createConversationTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish(totalUsd);
}
