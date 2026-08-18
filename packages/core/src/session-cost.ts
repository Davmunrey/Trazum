import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * What one conversation costs.
 *
 * ## The question a total cannot answer
 *
 * "Support cost $4,000 last month" does not say whether that is forty thousand
 * cheap conversations or four hundred expensive ones, and every decision made
 * on top of it needs the answer: what to charge per seat, where to put a quota,
 * whether one runaway agent loop is eating the budget. The bill has the data —
 * the log groups by `session` already — and nothing was reporting it.
 *
 * ## Median and p95, not mean
 *
 * A mean conversation cost is the total divided by the session count, which is
 * the total again wearing a hat: one 400-turn agent loop drags it up and hides
 * the ordinary case. The **median** is the conversation in the middle — what a
 * typical one costs — and the **p95** is the one a quota has to survive. The
 * gap between them is the finding: `$0.02 median, $1.80 p95` is a workload with
 * a tail worth hunting; `$0.40 median, $0.55 p95` is a workload that is simply
 * expensive, and no amount of tail-hunting will fix it.
 *
 * Every figure is **exact** — the provider's own billed counts, summed per
 * conversation at each model's published rates. No counterfactual, no estimate.
 *
 * ## What it refuses to claim
 *
 * A conversation that started before this log or continues after it is counted
 * only for the turns recorded here, so its cost is a floor. That is stated
 * rather than corrected: guessing at unseen turns would be exactly the kind of
 * invention this package exists to end. Session keys group turns and never
 * leave this module, as everywhere the field is touched.
 */

export interface SessionCostShape {
  label: string;
  model: string;
  modelName: string;
  /** Conversations measured. Never which ones. */
  sessions: number;
  calls: number;
  /** What those conversations cost in total — exact, billed. */
  totalUsd: number;
  /** The conversation in the middle. */
  medianUsd: number;
  /** The conversation a quota has to survive: 95th percentile, by nearest rank. */
  p95Usd: number;
  /** The single most expensive conversation in the slice. */
  maxUsd: number;
  /** Turns in the median conversation, for scale. */
  medianTurns: number;
}

export interface SessionCostOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /**
   * Slices with fewer conversations than this are dropped: a median over three
   * sessions is not a median, it is one of the three, and a p95 over them is
   * the maximum wearing a percentile's name. Default 5.
   */
  minSessions?: number;
}

export interface SessionCostTracker {
  add(record: UsageRecord): void;
  finish(): SessionCostShape[];
}

/** Every billed dollar of one call, at its own model's rates. */
function costOf(record: UsageRecord, catalogue: PricingCatalogue, on: Date): number | null {
  const model = catalogue.byId.get(record.model);
  if (!model) return null;
  const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
  const rates = multipliersFor(model);
  const per = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate;
  return (
    per(record.inputTokens, inputPerMTok) +
    per(record.cacheReadTokens, inputPerMTok * rates.cacheRead) +
    per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
    per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h) +
    per(record.outputTokens, outputPerMTok)
  );
}

const median = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The 95th percentile by **nearest rank**: the smallest value at or above which
 * 95% of the conversations sit. Interpolating between two conversations would
 * report a cost no conversation had, and this figure exists to be compared
 * against a real quota.
 */
const p95 = (sorted: number[]): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;

export function createSessionCostTracker(options: SessionCostOptions): SessionCostTracker {
  const { catalogue, on = new Date(), minSessions = 5 } = options;
  const slices = new Map<string, Map<string, { usd: number; turns: number }>>();

  const add = (record: UsageRecord): void => {
    if (record.session === null) return;
    const cost = costOf(record, catalogue, on);
    // An unpriced model contributes no dollars anywhere else either.
    if (cost === null) return;

    const sliceKey = `${record.label ?? UNLABELLED}\n${record.model}`;
    let sessions = slices.get(sliceKey);
    if (!sessions) {
      sessions = new Map();
      slices.set(sliceKey, sessions);
    }
    const existing = sessions.get(record.session);
    if (existing) {
      existing.usd += cost;
      existing.turns += 1;
    } else {
      sessions.set(record.session, { usd: cost, turns: 1 });
    }
  };

  const finish = (): SessionCostShape[] => {
    const out: SessionCostShape[] = [];

    for (const [sliceKey, sessions] of slices) {
      if (sessions.size < minSessions) continue;
      const split = sliceKey.indexOf('\n');
      const modelId = sliceKey.slice(split + 1);
      const model = catalogue.byId.get(modelId);
      if (!model) continue;

      const costs = [...sessions.values()].map((s) => s.usd).sort((a, b) => a - b);
      const turns = [...sessions.values()].map((s) => s.turns).sort((a, b) => a - b);
      out.push({
        label: sliceKey.slice(0, split),
        model: modelId,
        modelName: model.displayName,
        sessions: sessions.size,
        calls: turns.reduce((sum, t) => sum + t, 0),
        totalUsd: costs.reduce((sum, c) => sum + c, 0),
        medianUsd: median(costs),
        p95Usd: p95(costs),
        maxUsd: costs[costs.length - 1]!,
        medianTurns: median(turns),
      });
    }

    // The most money first — the order somebody would act in.
    return out.sort((a, b) => b.totalUsd - a.totalUsd || a.label.localeCompare(b.label));
  };

  return { add, finish };
}

/** The same measurement over a list, for a caller holding one already. */
export function sessionCostShapes(
  records: readonly UsageRecord[],
  options: SessionCostOptions,
): SessionCostShape[] {
  const tracker = createSessionCostTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish();
}
