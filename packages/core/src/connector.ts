/**
 * Your bill, read from the provider, without anybody exporting anything.
 *
 * Every command in this product reads a file somebody produced by hand, and
 * the export step is where adoption dies: the person who would benefit most
 * from a cost report is the person least likely to have a `usage.jsonl` lying
 * around. Every provider that bills by the token also serves that data over an
 * API, and this module turns those payloads into figures the rest of Trazum
 * already knows how to reason about.
 *
 * **Pure, and in the core, so it is testable without a network.** The fetch,
 * the credentials and the pagination live in the CLI — the same split
 * `openrouterOverlay` has had since 1.13. Everything here is a transformation
 * of a document the caller already holds.
 *
 * **The honest part is what the providers cannot tell you.** Usage APIs serve
 * *aggregates*: tokens per bucket per model, and — depending on the provider —
 * a request count or nothing at all. They do not serve per-call rows. That
 * makes a whole class of Trazum's findings impossible on this source: the
 * shape of the calls, the truncation retries, the conversations, the largest
 * call's context pressure. Those findings need per-call data and no amount of
 * arithmetic recovers them from a sum.
 *
 * So a connected report is a **restricted** report, and it is restricted out
 * loud. It carries its own shape rather than a `UsageProfileReport` with holes
 * in it, precisely so a per-call finding can never read a zero this module
 * wrote and report "nothing found" about something nobody measured. Not
 * recorded is not not-happened, at the level of the type system.
 */

import { effectivePricing, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

// --------------------------------------------------------------------------
// What a source can and cannot answer
// --------------------------------------------------------------------------

/**
 * `per-call` sources serve one row per request and unlock every finding in
 * the product. `bucketed` sources serve sums over a window.
 */
export type ConnectorGranularity = 'per-call' | 'bucketed';

/**
 * A finding this source cannot support, why, and what would unlock it.
 *
 * Carried into the report and printed there. A restricted report that only
 * omits things reads as a report that found nothing wrong.
 */
export interface UnavailableFinding {
  finding: string;
  because: string;
  unlockedBy: string;
}

/** Every finding that needs a row per call, named once. */
const PER_CALL_FINDINGS: readonly UnavailableFinding[] = [
  {
    finding: 'inputShapes',
    because: 'the provider serves sums over a window, and the spread of call sizes is not in a sum',
    unlockedBy: 'a per-call usage log, or the gateway',
  },
  {
    finding: 'truncationRetries',
    because: 'pairing a truncated answer with its retry needs both calls, their order and their stop reasons',
    unlockedBy: 'a per-call usage log recording stop_reason and session',
  },
  {
    finding: 'repeatedTurns',
    because: 'the same request sent twice is invisible once both are added together',
    unlockedBy: 'a per-call usage log recording session',
  },
  {
    finding: 'sessionCosts',
    because: 'conversations are not a dimension any usage API groups by',
    unlockedBy: 'a per-call usage log recording session',
  },
  {
    finding: 'contextPressure',
    because: 'it reads the largest single call, and a total has lost the maximum',
    unlockedBy: 'a per-call usage log, or the gateway',
  },
  {
    finding: 'duplicateLines',
    because: 'a doubled bill is caught by finding identical rows, and there are no rows here',
    unlockedBy: 'a per-call usage log',
  },
];

export interface ConnectorDescriptor {
  id: string;
  displayName: string;
  granularity: ConnectorGranularity;
  /**
   * Environment variables the CLI reads the credential from, in order.
   *
   * Named here so `trazum connect` can say exactly what it looked for when it
   * finds nothing. Trazum stores no secret: a key lives in the environment or
   * in a keychain the operating system owns, and never in this repository's
   * config, cache or output.
   */
  credentialEnv: readonly string[];
  /** The narrowest key that works, so nobody hands this tool a wider one. */
  keyKind: string;
  /** Whether the source serves a request count, or only token sums. */
  servesCallCounts: boolean;
  /** Findings impossible on this source. */
  unavailable: readonly UnavailableFinding[];
  docs: string;
}

/**
 * The two providers this release connects to, and the asymmetry between them
 * that a report must not paper over.
 *
 * OpenAI's usage endpoint serves a request count per bucket; Anthropic's
 * serves token sums without one. So a connected OpenAI report can say "$412
 * over 9,004 calls" and a connected Anthropic report can only say "$412", and
 * every per-call average is available on one and absent on the other. Printing
 * a call count of zero, or dividing by a denominator that does not exist,
 * would be this module inventing the number it is here to stop inventing.
 */
export const CONNECTORS: readonly ConnectorDescriptor[] = [
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    granularity: 'bucketed',
    credentialEnv: ['TRAZUM_ANTHROPIC_ADMIN_KEY', 'ANTHROPIC_ADMIN_KEY'],
    keyKind: 'an Admin API key (read access to the usage report)',
    servesCallCounts: false,
    unavailable: [
      ...PER_CALL_FINDINGS,
      {
        finding: 'calls',
        because: 'the usage report serves token sums per bucket and no request count',
        unlockedBy: 'a per-call usage log, or the gateway',
      },
    ],
    docs: 'https://docs.anthropic.com/en/api/admin-api/usage-cost/get-messages-usage-report',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    granularity: 'bucketed',
    credentialEnv: ['TRAZUM_OPENAI_ADMIN_KEY', 'OPENAI_ADMIN_KEY'],
    keyKind: 'an Admin key with the api.usage.read scope',
    servesCallCounts: true,
    unavailable: PER_CALL_FINDINGS,
    docs: 'https://platform.openai.com/docs/api-reference/usage',
  },
];

export function connectorFor(id: string): ConnectorDescriptor | null {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

// --------------------------------------------------------------------------
// What a pull returns
// --------------------------------------------------------------------------

/**
 * One provider bucket: a window, a model, and the tokens billed inside it.
 *
 * The cache-write TTL split is kept apart for the same reason `UsageBreakdown`
 * keeps it apart — the two are billed at different multipliers, and a total
 * that has lost the split cannot be repriced, only guessed at.
 */
export interface UsageBucket {
  fromMs: number;
  toMs: number;
  model: string;
  /** null when the provider serves no request count. Never zero for absent. */
  calls: number | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  /** False when the provider reported writes without saying which TTL. */
  writeTtlKnown: boolean;
  outputTokens: number;
  /** Whatever the provider grouped by beyond the model — workspace, key, tier. */
  group: Record<string, string>;
}

/**
 * Something the pull did not get.
 *
 * A bill quietly short by an unknown amount is the failure this repository
 * refuses everywhere it can occur, and a paginated API behind a rate limit is
 * exactly where it occurs. Every gap is carried to the report and printed.
 */
export interface PullGap {
  kind:
    | 'rate-limited'
    | 'retention-boundary'
    | 'cursor-expired'
    | 'page-limit'
    | 'unreadable-entry'
    | 'unreadable-field';
  detail: string;
}

export interface ConnectorPull {
  provider: string;
  granularity: ConnectorGranularity;
  buckets: UsageBucket[];
  /** The window the buckets actually cover, or null when none parsed. */
  window: { fromMs: number; toMs: number } | null;
  gaps: PullGap[];
  unavailable: readonly UnavailableFinding[];
}

// --------------------------------------------------------------------------
// Normalising provider payloads
// --------------------------------------------------------------------------

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const ms = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Merges buckets that share a window, model and grouping. */
function collect(buckets: UsageBucket[]): UsageBucket[] {
  const merged = new Map<string, UsageBucket>();
  for (const bucket of buckets) {
    const key = `${bucket.fromMs}\n${bucket.toMs}\n${bucket.model}\n${JSON.stringify(bucket.group)}`;
    const seen = merged.get(key);
    if (seen === undefined) {
      merged.set(key, { ...bucket });
      continue;
    }
    seen.inputTokens += bucket.inputTokens;
    seen.cacheReadTokens += bucket.cacheReadTokens;
    seen.cacheWrite5mTokens += bucket.cacheWrite5mTokens;
    seen.cacheWrite1hTokens += bucket.cacheWrite1hTokens;
    seen.outputTokens += bucket.outputTokens;
    seen.writeTtlKnown = seen.writeTtlKnown && bucket.writeTtlKnown;
    // A count merged with an absent count is still absent: adding a number to
    // "unknown" produces a number that describes only part of the traffic.
    seen.calls = seen.calls === null || bucket.calls === null ? null : seen.calls + bucket.calls;
  }
  return [...merged.values()].sort((a, b) => a.fromMs - b.fromMs || a.model.localeCompare(b.model));
}

function windowOf(buckets: UsageBucket[]): { fromMs: number; toMs: number } | null {
  if (buckets.length === 0) return null;
  return {
    fromMs: Math.min(...buckets.map((b) => b.fromMs)),
    toMs: Math.max(...buckets.map((b) => b.toMs)),
  };
}

/**
 * Anthropic's messages usage report.
 *
 * Shape: `{ data: [ { starting_at, ending_at, results: [ {...tokens, model} ] } ] }`.
 * The fields read are the documented ones; anything unreadable is reported as
 * a gap rather than defaulted to zero, because a zero here is a bill that is
 * quietly smaller than the real one.
 */
export function normalizeAnthropicUsage(payload: unknown): ConnectorPull {
  const descriptor = connectorFor('anthropic')!;
  const gaps: PullGap[] = [];
  const buckets: UsageBucket[] = [];

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new Error(
      'This payload has no "data" array — is it the response from the Anthropic usage report endpoint?',
    );
  }

  for (const [index, entry] of data.entries()) {
    const row = entry as { starting_at?: unknown; ending_at?: unknown; results?: unknown };
    const fromMs = ms(row.starting_at);
    const toMs = ms(row.ending_at) ?? (fromMs === null ? null : fromMs);
    if (fromMs === null || toMs === null) {
      gaps.push({
        kind: 'unreadable-entry',
        detail: `bucket ${index} has no readable time window, so its tokens are in no period and were left out`,
      });
      continue;
    }
    const results = Array.isArray(row.results) ? row.results : [];
    if (results.length === 0 && row.results !== undefined && !Array.isArray(row.results)) {
      gaps.push({ kind: 'unreadable-entry', detail: `bucket ${index} has an unreadable "results" field` });
      continue;
    }
    for (const result of results) {
      const r = result as Record<string, unknown>;
      const model = typeof r.model === 'string' ? r.model : null;
      if (model === null) {
        gaps.push({
          kind: 'unreadable-entry',
          detail: `a result in bucket ${index} names no model, so its tokens could not be priced and were left out`,
        });
        continue;
      }
      const creation = (r.cache_creation ?? {}) as Record<string, unknown>;
      const write5m = num(creation.ephemeral_5m_input_tokens) ?? 0;
      const write1h = num(creation.ephemeral_1h_input_tokens) ?? 0;
      const flatWrite = num(r.cache_creation_input_tokens) ?? 0;
      const ttlKnown = !(flatWrite > 0 && write5m === 0 && write1h === 0);
      buckets.push({
        fromMs,
        toMs,
        model,
        // Documented and deliberate: the usage report has no request count.
        calls: null,
        inputTokens: num(r.uncached_input_tokens) ?? num(r.input_tokens) ?? 0,
        cacheReadTokens: num(r.cache_read_input_tokens) ?? 0,
        cacheWrite5mTokens: ttlKnown ? write5m : flatWrite,
        cacheWrite1hTokens: ttlKnown ? write1h : 0,
        writeTtlKnown: ttlKnown,
        outputTokens: num(r.output_tokens) ?? 0,
        group: groupOf(r, ['workspace_id', 'api_key_id', 'service_tier', 'context_window']),
      });
    }
  }

  const merged = collect(buckets);
  return {
    provider: 'anthropic',
    granularity: 'bucketed',
    buckets: merged,
    window: windowOf(merged),
    gaps,
    unavailable: descriptor.unavailable,
  };
}

/**
 * OpenAI's completions usage endpoint.
 *
 * Shape: `{ data: [ { start_time, end_time, results: [ { input_tokens,
 * output_tokens, input_cached_tokens, num_model_requests, model } ] } ] }`.
 *
 * This one serves a request count, so every per-call average is available on
 * it — and the report says so, rather than making both providers look alike.
 */
export function normalizeOpenAIUsage(payload: unknown): ConnectorPull {
  const descriptor = connectorFor('openai')!;
  const gaps: PullGap[] = [];
  const buckets: UsageBucket[] = [];

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new Error(
      'This payload has no "data" array — is it the response from the OpenAI usage endpoint?',
    );
  }

  for (const [index, entry] of data.entries()) {
    const row = entry as { start_time?: unknown; end_time?: unknown; results?: unknown };
    const fromMs = ms(row.start_time);
    const toMs = ms(row.end_time) ?? (fromMs === null ? null : fromMs);
    if (fromMs === null || toMs === null) {
      gaps.push({
        kind: 'unreadable-entry',
        detail: `bucket ${index} has no readable time window, so its tokens are in no period and were left out`,
      });
      continue;
    }
    const results = Array.isArray(row.results) ? row.results : [];
    for (const result of results) {
      const r = result as Record<string, unknown>;
      const model = typeof r.model === 'string' ? r.model : null;
      if (model === null) {
        gaps.push({
          kind: 'unreadable-entry',
          detail: `a result in bucket ${index} names no model, so its tokens could not be priced and were left out`,
        });
        continue;
      }
      const cached = num(r.input_cached_tokens) ?? 0;
      const input = num(r.input_tokens) ?? 0;
      buckets.push({
        fromMs,
        toMs,
        model,
        calls: num(r.num_model_requests),
        // OpenAI reports cached tokens *inside* the input total, so the
        // uncached half is the subtraction. Reporting both at face value
        // would bill the cached tokens twice, at the dearer rate.
        inputTokens: Math.max(0, input - cached),
        cacheReadTokens: cached,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        // Nothing was assumed: this API reports no cache writes at all, and an
        // absent field is not an assumed TTL.
        writeTtlKnown: true,
        outputTokens: num(r.output_tokens) ?? 0,
        group: groupOf(r, ['project_id', 'api_key_id', 'batch']),
      });
    }
  }

  const merged = collect(buckets);
  return {
    provider: 'openai',
    granularity: 'bucketed',
    buckets: merged,
    window: windowOf(merged),
    gaps,
    unavailable: descriptor.unavailable,
  };
}

function groupOf(row: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
  const group: Record<string, string> = {};
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value !== '') group[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) group[key] = String(value);
    else if (typeof value === 'boolean') group[key] = String(value);
  }
  return group;
}

// --------------------------------------------------------------------------
// The restricted report
// --------------------------------------------------------------------------

export interface BucketedSlice {
  model: string;
  /** null when the source serves no request count. */
  calls: number | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  inputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
  /** What the cache-touched tokens would have cost as ordinary input. */
  cachedTokensAtInputRateUsd: number;
  /** Writes priced at the 1-hour rate, when the source did not state the TTL. */
  cacheWriteUsdIfAssumed1h: number;
  writeTtlKnown: boolean;
}

export interface BucketedReport {
  schemaVersion: 1;
  provider: string;
  granularity: ConnectorGranularity;
  span: { fromMs: number; toMs: number } | null;
  total: {
    totalUsd: number;
    /** null when unknown — never zero, which would read as "no traffic". */
    calls: number | null;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
  };
  byModel: BucketedSlice[];
  /** Spend per UTC day, oldest first — the shape a total hides. */
  byDay: { day: string; usd: number; calls: number | null }[];
  /** Models the catalogue could not price: named, with their tokens kept. */
  unpricedModels: { model: string; inputTokens: number; outputTokens: number }[];
  gaps: PullGap[];
  unavailable: readonly UnavailableFinding[];
}

/**
 * Prices the buckets a connector pulled.
 *
 * Every figure here is the provider's own billed token count at the
 * catalogue's rates — the same arithmetic `profile` does, over sums instead of
 * rows. What it deliberately does not do is synthesise the per-call findings:
 * they are listed as unavailable and left absent, so nothing downstream can
 * read a zero this function wrote.
 */
export function bucketedProfile(
  pull: ConnectorPull,
  options: { catalogue: PricingCatalogue; on?: Date },
): BucketedReport {
  const { catalogue, on = new Date() } = options;

  const slices = new Map<string, BucketedSlice>();
  const days = new Map<string, { usd: number; calls: number | null }>();
  const unpriced = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const bucket of pull.buckets) {
    const model = catalogue.byId.get(bucket.model);
    if (model === undefined) {
      const seen = unpriced.get(bucket.model) ?? { inputTokens: 0, outputTokens: 0 };
      seen.inputTokens += bucket.inputTokens + bucket.cacheReadTokens;
      seen.outputTokens += bucket.outputTokens;
      unpriced.set(bucket.model, seen);
      continue;
    }

    const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
    const rates = multipliersFor(model);
    const per = (count: number, rate: number): number => (count / 1_000_000) * rate;

    const inputUsd = per(bucket.inputTokens, inputPerMTok);
    const cacheReadUsd = per(bucket.cacheReadTokens, inputPerMTok * rates.cacheRead);
    const cacheWriteUsd =
      per(bucket.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
      per(bucket.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h);
    const outputUsd = per(bucket.outputTokens, outputPerMTok);
    const writeTokens = bucket.cacheWrite5mTokens + bucket.cacheWrite1hTokens;
    const atInputRate = per(bucket.cacheReadTokens + writeTokens, inputPerMTok);
    const ifAssumed1h = bucket.writeTtlKnown
      ? cacheWriteUsd
      : per(writeTokens, inputPerMTok * rates.cacheWrite1h);

    const slice = slices.get(bucket.model) ?? {
      model: bucket.model,
      calls: bucket.calls === null ? null : 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      inputUsd: 0,
      cacheReadUsd: 0,
      cacheWriteUsd: 0,
      outputUsd: 0,
      totalUsd: 0,
      cachedTokensAtInputRateUsd: 0,
      cacheWriteUsdIfAssumed1h: 0,
      writeTtlKnown: true,
    };
    slice.calls = slice.calls === null || bucket.calls === null ? null : slice.calls + bucket.calls;
    slice.inputTokens += bucket.inputTokens;
    slice.cacheReadTokens += bucket.cacheReadTokens;
    slice.cacheWriteTokens += writeTokens;
    slice.outputTokens += bucket.outputTokens;
    slice.inputUsd += inputUsd;
    slice.cacheReadUsd += cacheReadUsd;
    slice.cacheWriteUsd += cacheWriteUsd;
    slice.outputUsd += outputUsd;
    slice.totalUsd += inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd;
    slice.cachedTokensAtInputRateUsd += atInputRate;
    slice.cacheWriteUsdIfAssumed1h += ifAssumed1h;
    slice.writeTtlKnown = slice.writeTtlKnown && bucket.writeTtlKnown;
    slices.set(bucket.model, slice);

    const day = new Date(bucket.fromMs).toISOString().slice(0, 10);
    const entry = days.get(day) ?? { usd: 0, calls: bucket.calls === null ? null : 0 };
    entry.usd += inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd;
    entry.calls = entry.calls === null || bucket.calls === null ? null : entry.calls + bucket.calls;
    days.set(day, entry);
  }

  const byModel = [...slices.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  const anyCallsUnknown = byModel.some((s) => s.calls === null) || byModel.length === 0;

  return {
    schemaVersion: 1,
    provider: pull.provider,
    granularity: pull.granularity,
    span: pull.window,
    total: {
      totalUsd: byModel.reduce((sum, s) => sum + s.totalUsd, 0),
      calls: anyCallsUnknown ? null : byModel.reduce((sum, s) => sum + (s.calls ?? 0), 0),
      inputTokens: byModel.reduce((sum, s) => sum + s.inputTokens, 0),
      cacheReadTokens: byModel.reduce((sum, s) => sum + s.cacheReadTokens, 0),
      cacheWriteTokens: byModel.reduce((sum, s) => sum + s.cacheWriteTokens, 0),
      outputTokens: byModel.reduce((sum, s) => sum + s.outputTokens, 0),
    },
    byModel,
    byDay: [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, entry]) => ({ day, usd: entry.usd, calls: entry.calls })),
    unpricedModels: [...unpriced.entries()]
      .map(([model, tokens]) => ({ model, ...tokens }))
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    gaps: pull.gaps,
    unavailable: pull.unavailable,
  };
}

/**
 * The cache verdict over a connected report.
 *
 * Same counterfactual `cacheEconomics` runs on a per-call report: what the
 * cache-touched tokens cost, against what they would have cost as ordinary
 * input. The worst case is carried separately for the same reason it is
 * there — when the source did not state the write TTL, the cheaper rate was
 * assumed for the headline and the verdict can move under the other one.
 */
export function bucketedCacheEconomics(report: BucketedReport): {
  spentUsd: number;
  withoutCachingUsd: number;
  deltaUsd: number;
  verdict: 'paid-off' | 'lost-money' | 'no-cache';
  worstCaseVerdict: 'paid-off' | 'lost-money' | 'no-cache';
} {
  const spent = report.byModel.reduce((sum, s) => sum + s.cacheReadUsd + s.cacheWriteUsd, 0);
  const without = report.byModel.reduce((sum, s) => sum + s.cachedTokensAtInputRateUsd, 0);
  const worst = report.byModel.reduce((sum, s) => sum + s.cacheReadUsd + s.cacheWriteUsdIfAssumed1h, 0);
  const touched = report.byModel.reduce((sum, s) => sum + s.cacheReadTokens + s.cacheWriteTokens, 0);

  const verdictOf = (paid: number): 'paid-off' | 'lost-money' | 'no-cache' => {
    if (touched === 0) return 'no-cache';
    return paid <= without ? 'paid-off' : 'lost-money';
  };

  return {
    spentUsd: spent,
    withoutCachingUsd: without,
    deltaUsd: spent - without,
    verdict: verdictOf(spent),
    worstCaseVerdict: verdictOf(worst),
  };
}
