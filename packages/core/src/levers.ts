import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageBreakdown, UsageProfileReport } from './usage.js';
import type { Capability, ModelPricing } from './types.js';

/**
 * What would actually move this bill.
 *
 * ## The number this exists to answer
 *
 * Trazum's rules recover about **1%** of a bill. Measured, on an ordinary support
 * prompt: three tokens out of three hundred and six. On a company spending twenty
 * thousand a month that is two hundred, and nobody installs a tool for two
 * hundred. The complaint is correct and it is the most important thing anybody has
 * said about this product.
 *
 * The rest of the package reads a prompt file and shortens it. This reads what was
 * charged and prices the levers that are **not** the prompt, from the same log, at
 * the same arithmetic:
 *
 * | lever | what it moves |
 * |---|---|
 * | which model the call goes to | Opus 5 → Sonnet 5 is 60% off; → Haiku 4.5 is 80% |
 * | the Batch API | 50% flat, on input and output |
 * | prompt caching | 3–4x the rules |
 * | shortening the prompt | ~1% |
 *
 * So the honest headline is that **the money is in what you call, not in how long
 * the prompt is** — and the tool that only did the last row should say so, in the
 * reader's own figures, rather than reporting a 1% win as a success.
 *
 * ## Every figure here is arithmetic on tokens that were billed
 *
 * Nothing is modelled and nothing is extrapolated. A route lever is the same token
 * counts at another model's published rate. A batch lever is the same tokens at the
 * provider's batch multiplier. There is no assumed traffic, no assumed prompt, no
 * assumed anything — which is the whole reason this reads a usage log instead of a
 * directory.
 *
 * ## What it refuses to do
 *
 * **It never says a lever is safe to take.** Routing a workload to a cheaper model
 * is a quality question that arithmetic cannot answer, and this module has never
 * seen the prompt or a single answer. So a route carries its dollar figure *and*
 * the command that measures whether it holds, and it is described as worth testing
 * rather than worth doing. The same posture the `model-downgrade` advisory has
 * always had, for the same reason.
 *
 * **It never says "per month".** A usage log covers whatever period somebody
 * happened to record, and this module is not told which. Every figure is "on this
 * bill" — over exactly the calls in the file. Multiplying an unknown period into a
 * monthly headline is how a tool ends up quoting a saving four times the real one.
 *
 * **It never crosses a vendor.** A cheaper model at another provider is a
 * migration, not a routing change, and pricing one as though it were a switch you
 * could make on Tuesday is a saving nobody can take.
 */

/** What a lever is. */
export type LeverId =
  /** Send these calls to a cheaper model of the same family. */
  | 'route'
  /** Send these calls through the Batch API. */
  | 'batch';

/**
 * Everything available on one label-and-model slice, and what it comes to.
 *
 * **Grouped by slice rather than listed as separate levers, because the levers
 * are not additive and a list invites adding them.** The first version printed
 * "route support-rag: $12.60" and "batch support-rag: $10.50" as two rows against
 * a slice that had only spent $21.00 — a reader who added them got $23.10, a
 * saving larger than the bill it came from. Impossible, and in the flattering
 * direction.
 *
 * They do combine, just not by addition: batching a routed call saves half of the
 * *cheaper* model's price, not half of the one you left. `combinedUsd` is that
 * figure, computed rather than summed.
 */
export interface SliceLevers {
  /** The label these calls carry, or `UNLABELLED`. */
  label: string;
  /** The model they go to now. */
  model: string;
  modelName: string;
  /** Calls affected — the reader's own judgement of whether it is worth a day. */
  calls: number;
  /** What these exact calls cost. */
  spentUsd: number;
  /** A cheaper model one capability step down, if the catalogue has one. */
  route: { candidate: { id: string; displayName: string }; savingUsd: number } | null;
  /** The Batch API, where the provider sells one. */
  batch: { savingUsd: number } | null;
  /**
   * Both together, **computed and never summed**. Equal to the single available
   * lever when only one is.
   */
  combinedUsd: number;
  /** `combinedUsd` as a fraction of the whole bill in the log, not of this slice. */
  shareOfBill: number;
}

export interface BillLevers {
  /** Ranked by what the whole slice could save, largest first. */
  slices: SliceLevers[];
  /**
   * The most that shortening prompt text could ever be worth on this bill.
   *
   * Everything that is not output: plain input, cache reads, cache writes. It is a
   * **ceiling and not an estimate** — deliberately generous, because it counts
   * retrieved context, conversation history and tool results, none of which live in
   * a prompt file and none of which a rules pass can touch. The real figure is
   * below it, usually far below.
   *
   * It is here so the levers above have something to be compared against. A tool
   * that reports a 1% win without saying 1% of what is not being useful.
   */
  promptCeilingUsd: number;
  promptCeilingShare: number;
  /** The bill the shares are taken against. */
  totalUsd: number;
}

/**
 * Weakest first. A step *down* this ladder is what a route offers.
 *
 * `unknown` is absent on purpose rather than placed at one end: a model whose
 * capability nobody recorded cannot be ranked against one whose capability is
 * known, and guessing puts a real workload on a model chosen by a default value.
 */
const CAPABILITY_LADDER: Capability[] = ['small', 'mid', 'large', 'frontier'];

/**
 * The next step down, or `null` at the bottom and for `unknown`.
 *
 * One step, not the cheapest available. Frontier to small is an 80% saving and a
 * different product, and offering it as the headline would be the arithmetic
 * leading the advice — exactly the failure this file is written against. The
 * reader who wants the bigger jump can ask for it once the first one holds.
 */
function stepDown(capability: Capability): Capability | null {
  const at = CAPABILITY_LADDER.indexOf(capability);
  return at <= 0 ? null : CAPABILITY_LADDER[at - 1]!;
}

/** What a breakdown's tokens would cost at a model's rates, split so batch can apply. */
function repriceAt(
  breakdown: UsageBreakdown,
  model: ModelPricing,
  on: Date,
): { inputUsd: number; outputUsd: number; cacheUsd: number; totalUsd: number } {
  const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
  const rates = multipliersFor(model);
  const per = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate;

  const inputUsd = per(breakdown.inputTokens, inputPerMTok);
  const outputUsd = per(breakdown.outputTokens, outputPerMTok);
  /**
   * Cache writes at the 5-minute rate. The breakdown does not carry the recorded
   * TTL split per class, so one has to be chosen — and the same choice sits on
   * both sides of every subtraction here, so it cancels out of the saving. Worth
   * stating rather than papering over: it would not cancel if the two models had
   * different write multipliers, which is why a route never crosses a vendor.
   */
  const cacheUsd =
    per(breakdown.cacheReadTokens, inputPerMTok * rates.cacheRead) +
    per(breakdown.cacheWriteTokens, inputPerMTok * rates.cacheWrite5m);

  return { inputUsd, outputUsd, cacheUsd, totalUsd: inputUsd + outputUsd + cacheUsd };
}

/**
 * The cheapest recommendable model one capability step below, same provider.
 *
 * Same provider because switching vendor is a migration rather than a routing
 * change, and the context window has to hold what these calls already sent — a
 * cheaper model that cannot fit the prompt is not cheaper, it is broken.
 */
function candidateFor(
  model: ModelPricing,
  breakdown: UsageBreakdown,
  catalogue: PricingCatalogue,
  on: Date,
): ModelPricing | null {
  const target = stepDown(model.capability);
  if (target === null) return null;

  /**
   * The largest single call cannot be recovered from a total, so this uses the
   * **average** input per call and refuses any candidate that could not hold it.
   * An average understates the peak, so this is the permissive direction — stated
   * rather than hidden, because the reader will check the window properly when
   * they run the evaluation this points them at.
   */
  const avgInput =
    breakdown.calls === 0
      ? 0
      : (breakdown.inputTokens + breakdown.cacheReadTokens + breakdown.cacheWriteTokens) /
        breakdown.calls;

  const candidates = catalogue.models.filter(
    (m) =>
      m.id !== model.id &&
      m.capability === target &&
      m.provider === model.provider &&
      m.recommendable !== false &&
      m.contextWindow >= avgInput,
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, m) =>
    repriceAt(breakdown, m, on).totalUsd < repriceAt(breakdown, best, on).totalUsd ? m : best,
  );
}

export interface BillLeverOptions {
  catalogue: PricingCatalogue;
  /** Date the prices are read at, so a promotional rate resolves the same way. */
  on?: Date;
  /**
   * Slices worth less than this share of the bill are dropped.
   *
   * Not a judgement about small money — a judgement about attention. Thirty rows
   * worth a tenth of a percent each bury the two worth twenty, and a report nobody
   * finishes reading is a report that changed nothing. Default 1%.
   */
  minShare?: number;
}

/**
 * Prices the levers that are not the prompt, from a profile of real calls.
 *
 * Returns them ranked by money, with the ceiling on prompt shortening beside them
 * so the comparison is unavoidable. Empty when nothing clears `minShare`, which is
 * a legitimate answer: a bill already on the cheapest model of its family, with no
 * batch API to reach for, has no lever here, and saying so is more useful than
 * manufacturing one.
 */
export function billLevers(
  report: UsageProfileReport,
  options: BillLeverOptions,
): BillLevers {
  const { catalogue, on = new Date(), minShare = 0.01 } = options;
  const totalUsd = report.total.totalUsd;

  const promptCeilingUsd =
    report.total.inputUsd + report.total.cacheReadUsd + report.total.cacheWriteUsd;

  if (totalUsd <= 0) {
    return { slices: [], promptCeilingUsd, promptCeilingShare: 0, totalUsd };
  }

  const slices: SliceLevers[] = [];

  for (const { label, model: modelId, breakdown } of report.byLabelAndModel) {
    const model = catalogue.byId.get(modelId);
    // An unpriced model never reaches this list with dollars on it, and a lever
    // computed from a zero bill is a saving invented out of nothing.
    if (!model || breakdown.totalUsd <= 0) continue;

    const candidate = candidateFor(model, breakdown, catalogue, on);
    const routed = candidate ? repriceAt(breakdown, candidate, on) : null;
    const route =
      candidate && routed && breakdown.totalUsd - routed.totalUsd > 0
        ? {
            candidate: { id: candidate.id, displayName: candidate.displayName },
            savingUsd: breakdown.totalUsd - routed.totalUsd,
          }
        : null;

    /**
     * `null` means the provider has no batch API, which is different from an
     * unstated one — offering a discount nobody sells is worse than staying quiet.
     *
     * Applied to input and output only. The published discount covers those two
     * lines; whether it also reaches cache reads and writes is not something this
     * catalogue records, so they stay at full price. That understates the saving,
     * which is the direction to be wrong in.
     */
    const batchRate = multipliersFor(model).batch;
    const batchable = batchRate !== null && batchRate < 1;
    const batch = batchable
      ? { savingUsd: (breakdown.inputUsd + breakdown.outputUsd) * (1 - batchRate!) }
      : null;

    /**
     * Both together — **computed, never summed.**
     *
     * Batching a routed call discounts the cheaper model's price, not the one you
     * left behind. Adding the two figures produced a saving larger than the slice
     * had ever cost: $12.60 and $10.50 against $21.00 spent.
     */
    const afterBoth = routed ?? {
      inputUsd: breakdown.inputUsd,
      outputUsd: breakdown.outputUsd,
      cacheUsd: breakdown.cacheReadUsd + breakdown.cacheWriteUsd,
      totalUsd: breakdown.totalUsd,
    };
    const combinedCost = batchable
      ? afterBoth.totalUsd - (afterBoth.inputUsd + afterBoth.outputUsd) * (1 - batchRate!)
      : afterBoth.totalUsd;
    const combinedUsd = breakdown.totalUsd - combinedCost;

    if (combinedUsd <= 0) continue;
    const shareOfBill = combinedUsd / totalUsd;
    if (shareOfBill < minShare) continue;

    slices.push({
      label,
      model: modelId,
      modelName: model.displayName,
      calls: breakdown.calls,
      spentUsd: breakdown.totalUsd,
      route,
      batch,
      combinedUsd,
      shareOfBill,
    });
  }

  return {
    slices: slices.sort((a, b) => b.combinedUsd - a.combinedUsd),
    promptCeilingUsd,
    promptCeilingShare: promptCeilingUsd / totalUsd,
    totalUsd,
  };
}

/** Named so a report can say "unlabelled" in the reader's language. */
export { UNLABELLED };
