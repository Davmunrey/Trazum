import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * Cache writes made by conversations that never came back.
 *
 * ## The waste the aggregate hides
 *
 * A cache write is a bet: pay 1.25x input now (2x at the 1-hour TTL) so the
 * *next* call reads the prefix at 0.1x. A conversation that ends after its
 * first turn never places that next call — its write bought reuse that its own
 * conversation never made. On a workload with many short sessions this is a
 * steady leak, and it hides inside healthy-looking totals: the long sessions'
 * reads pay for the cache overall, so `cacheEconomics` reports `paid-off`
 * while every one-turn drive-by pays the premium for nothing.
 *
 * ## The caveat that keeps the figure honest
 *
 * The provider's cache is keyed by prefix content, not by conversation. A
 * one-turn session's write **can** be read back by a different session that
 * sends the same prefix within the TTL — a shared system prompt does exactly
 * that — and a usage log cannot see whose write a read hit. So the figure
 * reported here is a **ceiling, named as one**: these writes paid off only if
 * another conversation shared the prefix in time, and the log cannot say
 * whether one did.
 *
 * There is one case where the ceiling collapses into a fact, and the caller
 * can detect it from the slice it already has: when the slice recorded **zero
 * cache reads**, nothing read those writes — within the session, across
 * sessions, at all. The row deliberately does not decide this itself; the
 * breakdown holding the slice's reads belongs to the caller, and deriving it
 * twice is how two figures drift.
 *
 * Session keys group turns and never leave this module, like everywhere else
 * the field is touched.
 */

export interface SingleTurnCacheWrites {
  label: string;
  model: string;
  modelName: string;
  /** Conversations seen in this slice — with a session key, priced model. */
  sessions: number;
  /** Median turns per conversation, for scale: 1-turn sessions in a sea of 40-turn ones read differently than in a sea of 2s. */
  medianTurns: number;
  /** Conversations that ended after exactly one recorded turn. */
  singleTurnSessions: number;
  /** Cache-write tokens those one-turn conversations paid for. */
  singleTurnWriteTokens: number;
  /**
   * What those writes cost, at the same rates the bill used — the 5-minute
   * rate for writes whose TTL the log did not state, so like the bill it is
   * a floor when `assumedTtlTokens` is non-zero. A **ceiling on the waste**
   * (another conversation may have read the prefix; the log cannot see it)
   * built on a **floor of a price** — both directions named, neither guessed.
   */
  singleTurnWriteUsd: number;
  /** The part of `singleTurnWriteTokens` whose TTL the log did not record. */
  assumedTtlTokens: number;
}

export interface SessionLedgerOptions {
  catalogue: PricingCatalogue;
  /** Date the prices are read at, so a promotional rate resolves the same way. */
  on?: Date;
}

export interface SessionLedgerTracker {
  add(record: UsageRecord): void;
  finish(): SingleTurnCacheWrites[];
}

interface SessionTally {
  turns: number;
  write5mTokens: number;
  write1hTokens: number;
  assumedTokens: number;
}

const median = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * An accumulator, like the TTL-fit tracker and for the same reason: one pass
 * over a log measured in megabytes, holding one small tally per conversation.
 * No timestamp needed — "came back" is a fact about turn count, not the clock,
 * so this measures logs the TTL-fit cannot.
 */
export function createSessionLedgerTracker(options: SessionLedgerOptions): SessionLedgerTracker {
  const { catalogue, on = new Date() } = options;
  const slices = new Map<string, Map<string, SessionTally>>();

  const add = (record: UsageRecord): void => {
    // An unpriced model has no rate to price the waste at, and contributes no
    // dollars anywhere else either.
    if (record.session === null || !catalogue.byId.has(record.model)) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    let sessions = slices.get(key);
    if (!sessions) {
      sessions = new Map();
      slices.set(key, sessions);
    }
    let tally = sessions.get(record.session);
    if (!tally) {
      tally = { turns: 0, write5mTokens: 0, write1hTokens: 0, assumedTokens: 0 };
      sessions.set(record.session, tally);
    }
    tally.turns += 1;
    if (record.writeTtlKnown) {
      tally.write5mTokens += record.cacheWrite5mTokens;
      tally.write1hTokens += record.cacheWrite1hTokens;
    } else {
      // The flat count sits in the 5m bucket by pricing convention; kept
      // apart here so the row can say how much of its price is a floor.
      tally.assumedTokens += record.cacheWrite5mTokens;
    }
  };

  const finish = (): SingleTurnCacheWrites[] => {
    const out: SingleTurnCacheWrites[] = [];

    for (const [key, sessions] of slices) {
      let singleTurnSessions = 0;
      let write5m = 0;
      let write1h = 0;
      let assumed = 0;
      const turnCounts: number[] = [];
      for (const tally of sessions.values()) {
        turnCounts.push(tally.turns);
        if (tally.turns !== 1) continue;
        singleTurnSessions += 1;
        write5m += tally.write5mTokens;
        write1h += tally.write1hTokens;
        assumed += tally.assumedTokens;
      }
      const singleTurnWriteTokens = write5m + write1h + assumed;
      // One-turn conversations that wrote nothing wasted nothing; a row about
      // them would be a finding about the absence of a finding.
      if (singleTurnWriteTokens === 0) continue;

      const split = key.indexOf('\n');
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId)!;
      const { inputPerMTok } = effectivePricing(model, on);
      const rates = multipliersFor(model);
      const per = (tokens: number, rate: number): number =>
        (tokens / 1_000_000) * inputPerMTok * rate;
      // The bill's own convention: unstated TTLs at the cheaper rate, so this
      // is the same floor the totals already stand on — never a new guess.
      const singleTurnWriteUsd =
        per(write5m + assumed, rates.cacheWrite5m) + per(write1h, rates.cacheWrite1h);

      turnCounts.sort((a, b) => a - b);
      out.push({
        label: key.slice(0, split),
        model: modelId,
        modelName: model.displayName,
        sessions: sessions.size,
        medianTurns: median(turnCounts),
        singleTurnSessions,
        singleTurnWriteTokens,
        singleTurnWriteUsd,
        assumedTtlTokens: assumed,
      });
    }

    // The most money first — the order somebody would act in.
    return out.sort(
      (a, b) => b.singleTurnWriteUsd - a.singleTurnWriteUsd || a.label.localeCompare(b.label),
    );
  };

  return { add, finish };
}

/** The same measurement over a list, for a caller holding one already. */
export function singleTurnCacheWrites(
  records: readonly UsageRecord[],
  options: SessionLedgerOptions,
): SingleTurnCacheWrites[] {
  const tracker = createSessionLedgerTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish();
}
