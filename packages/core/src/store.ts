/**
 * A year of measured spend on disk, and not one prompt inside it.
 *
 * A connector that re-downloads a month every time it runs is a connector
 * nobody leaves on, and `history` needs stored reports — which until now meant
 * a human curating a directory of `--json` files. The store is where pulled
 * usage lands so neither is true any more.
 *
 * **Pure, and in the core.** This module decides what a record *is*, when two
 * records are the same record, and what a set of them adds up to. The
 * filesystem lives in the CLI, the same split every other browser-safe module
 * here keeps.
 *
 * **Convergence, not accumulation.** Re-pulling an overlapping window must not
 * double the bill. Two records covering the same window, from the same
 * provider, for the same model and grouping, are the *same fact restated* —
 * the later pull wins, because a window pulled again is at worst as complete
 * as it was. That makes overlapping pulls idempotent, which is what lets a
 * scheduled job run every hour over a rolling day without inventing money.
 *
 * **Deduplication that cannot lie.** Two records the store cannot tell apart —
 * a source that served no window, or no model — are kept as *two* and reported
 * as possibly-double. Merging them on a guess makes a bill quietly smaller,
 * and quietly smaller is the flattering direction this repository refuses
 * everywhere it can occur.
 */

import type { UsageBucket } from './connector.js';

/** Bump when the meaning of a field changes. Readers keep what they cannot read. */
export const STORE_SCHEMA_VERSION = 1;

/**
 * One stored measurement.
 *
 * Short keys because a year of these is a file somebody has to keep, and the
 * shape is documented rather than inferred from its own verbosity.
 */
export interface StoreRecord {
  /** Schema version of this line, so an old reader keeps what it cannot parse. */
  v: number;
  provider: string;
  fromMs: number;
  toMs: number;
  model: string;
  /** null when the source serves no request count. Never zero for absent. */
  calls: number | null;
  input: number;
  cacheRead: number;
  write5m: number;
  write1h: number;
  /** False when the source reported writes without saying which TTL. */
  ttlKnown: boolean;
  output: number;
  /**
   * The account's own opaque identifiers — workspace, key, tier — as the
   * provider served them.
   *
   * These are identifiers, not secrets: they name a workspace, not a way into
   * it, and per-owner attribution needs them. Prompt text, completion text and
   * credentials are never here, and the documentation says exactly what a
   * store holds rather than leaving somebody to guess about their own file.
   */
  group: Record<string, string>;
  /** When this record was pulled, which is how the later restatement wins. */
  pulledAtMs: number;
}

/** What makes two records the same record. See the module note. */
export function identityOf(record: StoreRecord): string {
  return [
    record.provider,
    record.fromMs,
    record.toMs,
    record.model,
    JSON.stringify(record.group),
  ].join('\n');
}

/**
 * A record whose identity is not trustworthy enough to converge on.
 *
 * A window of zero length, or a record with no model, cannot be told apart
 * from another like it. Those are kept whole and counted separately.
 */
function identifiable(record: StoreRecord): boolean {
  return record.model !== '' && record.toMs > record.fromMs;
}

export interface ResolvedStore {
  /** One record per identity, newest pull winning. */
  records: StoreRecord[];
  /**
   * Records the store could not tell apart, kept in full rather than merged.
   *
   * Reported so a total built on them can be read for what it is: possibly
   * counting the same spend twice, and saying so beats a smaller number
   * nobody can check.
   */
  possiblyDouble: StoreRecord[];
  /** Lines from a schema version this binary does not know, kept and counted. */
  unknownVersion: number;
}

/**
 * Collapses an append-only log into the current truth.
 *
 * Append-only on disk and last-wins at read time, rather than rewriting a file
 * in place: a crash during a rewrite can lose a year, and a crash during an
 * append loses the tail of one line.
 */
export function resolveStore(records: readonly StoreRecord[]): ResolvedStore {
  const byIdentity = new Map<string, StoreRecord>();
  const possiblyDouble: StoreRecord[] = [];
  let unknownVersion = 0;

  for (const record of records) {
    if (record.v > STORE_SCHEMA_VERSION) {
      unknownVersion += 1;
      continue;
    }
    if (!identifiable(record)) {
      possiblyDouble.push(record);
      continue;
    }
    const key = identityOf(record);
    const seen = byIdentity.get(key);
    if (seen === undefined || record.pulledAtMs >= seen.pulledAtMs) {
      byIdentity.set(key, record);
    }
  }

  return {
    records: [...byIdentity.values()].sort(
      (a, b) => a.fromMs - b.fromMs || a.model.localeCompare(b.model),
    ),
    possiblyDouble,
    unknownVersion,
  };
}

/** Turns a connector's buckets into records ready to append. */
export function recordsFromBuckets(
  provider: string,
  buckets: readonly UsageBucket[],
  pulledAtMs: number,
): StoreRecord[] {
  return buckets.map((bucket) => ({
    v: STORE_SCHEMA_VERSION,
    provider,
    fromMs: bucket.fromMs,
    toMs: bucket.toMs,
    model: bucket.model,
    calls: bucket.calls,
    input: bucket.inputTokens,
    cacheRead: bucket.cacheReadTokens,
    write5m: bucket.cacheWrite5mTokens,
    write1h: bucket.cacheWrite1hTokens,
    ttlKnown: bucket.writeTtlKnown,
    output: bucket.outputTokens,
    group: bucket.group,
    pulledAtMs,
  }));
}

/** The reverse, so a stored month prices exactly as a fresh pull does. */
export function bucketsFromRecords(records: readonly StoreRecord[]): UsageBucket[] {
  return records.map((record) => ({
    fromMs: record.fromMs,
    toMs: record.toMs,
    model: record.model,
    calls: record.calls,
    inputTokens: record.input,
    cacheReadTokens: record.cacheRead,
    cacheWrite5mTokens: record.write5m,
    cacheWrite1hTokens: record.write1h,
    writeTtlKnown: record.ttlKnown,
    outputTokens: record.output,
    group: record.group,
  }));
}

// --------------------------------------------------------------------------
// What is in the store
// --------------------------------------------------------------------------

export interface StoreInventory {
  schemaVersion: 1;
  /** Per provider, oldest first by the span it covers. */
  providers: {
    provider: string;
    records: number;
    span: { fromMs: number; toMs: number } | null;
    /** null when no provider in the set serves request counts. */
    calls: number | null;
    models: string[];
  }[];
  totalRecords: number;
  span: { fromMs: number; toMs: number } | null;
  possiblyDouble: number;
  unknownVersion: number;
}

export function storeInventory(resolved: ResolvedStore): StoreInventory {
  const byProvider = new Map<string, StoreRecord[]>();
  for (const record of resolved.records) {
    const list = byProvider.get(record.provider) ?? [];
    list.push(record);
    byProvider.set(record.provider, list);
  }

  const providers = [...byProvider.entries()]
    .map(([provider, records]) => {
      const anyUnknown = records.some((r) => r.calls === null);
      return {
        provider,
        records: records.length,
        span: {
          fromMs: Math.min(...records.map((r) => r.fromMs)),
          toMs: Math.max(...records.map((r) => r.toMs)),
        },
        calls: anyUnknown ? null : records.reduce((sum, r) => sum + (r.calls ?? 0), 0),
        models: [...new Set(records.map((r) => r.model))].sort(),
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider));

  const all = resolved.records;
  return {
    schemaVersion: 1,
    providers,
    totalRecords: all.length,
    span:
      all.length === 0
        ? null
        : {
            fromMs: Math.min(...all.map((r) => r.fromMs)),
            toMs: Math.max(...all.map((r) => r.toMs)),
          },
    possiblyDouble: resolved.possiblyDouble.length,
    unknownVersion: resolved.unknownVersion,
  };
}

// --------------------------------------------------------------------------
// Retention
// --------------------------------------------------------------------------

export interface PruneResult {
  kept: StoreRecord[];
  dropped: StoreRecord[];
  /** The span the dropped records covered — what a reader loses by pruning. */
  droppedSpan: { fromMs: number; toMs: number } | null;
}

/**
 * Drops records whose window ended before the cutoff.
 *
 * Judged on `toMs`: a bucket that *ends* inside the retained period is
 * retained whole, because half a bucket is a measurement of nothing. What goes
 * is returned rather than counted, so the caller can say what went — silence
 * about deleted measurements is the one thing a store must not do.
 */
export function pruneRecords(records: readonly StoreRecord[], cutoffMs: number): PruneResult {
  const kept: StoreRecord[] = [];
  const dropped: StoreRecord[] = [];
  for (const record of records) {
    (record.toMs < cutoffMs ? dropped : kept).push(record);
  }
  return {
    kept,
    dropped,
    droppedSpan:
      dropped.length === 0
        ? null
        : {
            fromMs: Math.min(...dropped.map((r) => r.fromMs)),
            toMs: Math.max(...dropped.map((r) => r.toMs)),
          },
  };
}
