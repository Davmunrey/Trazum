/**
 * The measured side of the limits policy: what a usage log says each scope
 * has already spent.
 *
 * `judgeLimits` judges; this measures. The split is the product's oldest
 * rule — the judging function must be pure and instant, so whatever reads
 * and prices records happens once, here, and the doors keep the result.
 *
 * **Absence is `null`, never zero.** A log with no clock cannot say what
 * today has cost; a log that records no sessions cannot say what a session
 * has spent. Both come back `null`, and `judgeLimits` turns a `null` into
 * `cannot-tell` rather than an approval. The one deliberate asymmetry: a log
 * that *does* record sessions and has never seen this one answers `0` — the
 * history of a conversation that has not started is complete and empty,
 * which is a measurement, not an absence.
 *
 * **Session keys never leave this module.** The index groups by them — that
 * is the whole job — but the map lives in door memory, `positionAt` returns
 * only dollar figures, and nothing here is serialised. The guarantee the
 * usage module states (a session key is somebody's conversation and is never
 * printed) holds through this door too.
 */

import { costOf } from './session-cost.js';
import type { UsageRecord } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { MeasuredPosition } from './judgement.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything a door needs to answer `positionAt` in constant time, built
 * once from the log it was pointed at.
 */
export interface MeasuredIndex {
  /** Spend inside the current UTC day. Null when no record carries a clock. */
  dayUsd: number | null;
  /** The UTC day the figure covers. Null exactly when `dayUsd` is. */
  dayWindow: { fromMs: number; toMs: number } | null;
  /** Whether any record carried a label / a session at all. */
  labelsSeen: boolean;
  sessionsSeen: boolean;
  /** Priced spend per label. Keys are labels, which do print. */
  labels: ReadonlyMap<string, number>;
  /** Priced spend per session. Keys are session identifiers — never printed. */
  sessions: ReadonlyMap<string, number>;
  /** Whether the log held any records at all. */
  any: boolean;
  /** Records whose model the catalogue cannot price — money nobody can see. */
  unpriced: number;
}

/**
 * Prices and groups a parsed usage log, once.
 *
 * An unpriced record contributes nothing to any figure and is **counted**
 * instead of dropped silently: a door that reports "measured $3" over a log
 * with a thousand unpriced records is wrong by an amount nobody can see, in
 * the flattering direction, and `unpriced` is how the door says so.
 */
export function indexUsage(
  records: readonly UsageRecord[],
  options: { catalogue: PricingCatalogue; on?: Date },
): MeasuredIndex {
  const { catalogue, on = new Date() } = options;
  const dayFromMs = Math.floor(on.getTime() / DAY_MS) * DAY_MS;
  const dayToMs = dayFromMs + DAY_MS;

  const labels = new Map<string, number>();
  const sessions = new Map<string, number>();
  let labelsSeen = false;
  let sessionsSeen = false;
  let clocksSeen = false;
  let dayUsd = 0;
  let unpriced = 0;

  for (const record of records) {
    if (record.label !== null) labelsSeen = true;
    if (record.session !== null) sessionsSeen = true;
    if (record.ts !== null) clocksSeen = true;

    const usd = costOf(record, catalogue, on);
    if (usd === null) {
      unpriced += 1;
      continue;
    }
    if (record.label !== null) labels.set(record.label, (labels.get(record.label) ?? 0) + usd);
    if (record.session !== null) sessions.set(record.session, (sessions.get(record.session) ?? 0) + usd);
    if (record.ts !== null && record.ts >= dayFromMs && record.ts < dayToMs) dayUsd += usd;
  }

  return {
    dayUsd: clocksSeen ? dayUsd : null,
    dayWindow: clocksSeen ? { fromMs: dayFromMs, toMs: dayToMs } : null,
    labelsSeen,
    sessionsSeen,
    labels,
    sessions,
    any: records.length > 0,
    unpriced,
  };
}

/**
 * The measured position for one proposed call, from an index built once.
 *
 * A scope the log cannot see is `null`; a scope it can see and has nothing
 * recorded for is `0`. The difference is the difference between "unknown"
 * and "a conversation that has not started yet", and collapsing them is how
 * a dead log approves a live spend.
 */
export function positionAt(
  index: MeasuredIndex,
  call: { label?: string; session?: string },
): MeasuredPosition {
  if (!index.any) {
    return { dayUsd: null, sessionUsd: null, labelUsd: null };
  }
  return {
    dayUsd: index.dayUsd,
    dayWindow: index.dayWindow,
    sessionUsd:
      call.session !== undefined && index.sessionsSeen ? (index.sessions.get(call.session) ?? 0) : null,
    labelUsd: call.label !== undefined && index.labelsSeen ? (index.labels.get(call.label) ?? 0) : null,
  };
}
