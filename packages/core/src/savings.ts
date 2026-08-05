import {
  BUNDLED_CATALOGUE,
  COST_MULTIPLIERS,
  effectivePricing,
  modelFrom,
  multipliersFor,
} from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import type { CostBreakdown, SavingsReport, UsageProfile } from './types.js';

/**
 * Cost of a single call.
 *
 * `batchDiscount` defaults to Anthropic's 50% rather than being read from the
 * model, because this function takes prices rather than a model. Callers that
 * have the model — which is all of them inside this package — pass its own,
 * and a provider with no batch API passes 1.
 */
export function costOfCall(
  inputTokens: number,
  outputTokens: number,
  inputPerMTok: number,
  outputPerMTok: number,
  batch: boolean,
  batchDiscount: number = COST_MULTIPLIERS.batch,
): CostBreakdown {
  const discount = batch ? batchDiscount : 1;
  const inputUsd = (inputTokens / 1_000_000) * inputPerMTok * discount;
  const outputUsd = (outputTokens / 1_000_000) * outputPerMTok * discount;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

function scale(cost: CostBreakdown, factor: number): CostBreakdown {
  return {
    inputUsd: cost.inputUsd * factor,
    outputUsd: cost.outputUsd * factor,
    totalUsd: cost.totalUsd * factor,
  };
}

/**
 * Compares cost before and after optimising.
 *
 * Important: output tokens are held constant. A shorter prompt often produces
 * somewhat shorter answers, but that depends on the task and cannot be
 * promised, so the saving reported here comes exclusively from input tokens.
 */
export function computeSavings(
  tokensBefore: number,
  tokensAfter: number,
  usage: UsageProfile,
  on: Date = new Date(),
  pricing: PricingCatalogue = BUNDLED_CATALOGUE,
): SavingsReport {
  const model = modelFrom(pricing, usage.model);
  const { inputPerMTok, outputPerMTok, promoApplied } = effectivePricing(model, on);
  // A provider with no batch API gets no discount even when the caller ticked
  // the box: `batchEligible` describes the work, not what the provider sells.
  const batchDiscount = multipliersFor(model).batch ?? 1;

  const before = costOfCall(
    tokensBefore,
    usage.avgOutputTokens,
    inputPerMTok,
    outputPerMTok,
    usage.batchEligible,
    batchDiscount,
  );
  const after = costOfCall(
    tokensAfter,
    usage.avgOutputTokens,
    inputPerMTok,
    outputPerMTok,
    usage.batchEligible,
    batchDiscount,
  );

  const monthBefore = scale(before, usage.callsPerMonth);
  const monthAfter = scale(after, usage.callsPerMonth);
  const monthlySavingsUsd = monthBefore.totalUsd - monthAfter.totalUsd;

  return {
    model: model.id,
    modelDisplayName: model.displayName,
    promoApplied,
    perCall: { before, after },
    perMonth: { before: monthBefore, after: monthAfter },
    monthlySavingsUsd,
    monthlySavingsPct:
      monthBefore.totalUsd > 0 ? (monthlySavingsUsd / monthBefore.totalUsd) * 100 : 0,
  };
}

/**
 * Formats a USD amount with precision suited to its magnitude.
 * Currency formatting stays in `en-US` on purpose: these are US dollar prices
 * from a US price list, and showing them the same way everywhere avoids
 * confusion when a report is shared across locales.
 */
export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toFixed(5)}`;
  if (abs < 1) return `$${value.toFixed(4)}`;
  if (abs < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Formats a USD amount that can legitimately be negative, with an explicit
 * sign.
 *
 * `formatUsd` renders a negative as `$-30.80`, which reads as a typo. In a
 * comparison every cost line can go either way and the sign carries the whole
 * meaning, so it goes in front of the currency where a reader expects it.
 */
export function formatSignedUsd(value: number): string {
  if (value === 0) return '$0';
  const rendered = formatUsd(Math.abs(value));
  return value > 0 ? `+${rendered}` : `-${rendered}`;
}
