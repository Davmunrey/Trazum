import { COST_MULTIPLIERS, effectivePricing, getModel } from './pricing.js';
import type { CostBreakdown, SavingsReport, UsageProfile } from './types.js';

/** Coste de una llamada suelta. */
export function costOfCall(
  inputTokens: number,
  outputTokens: number,
  inputPerMTok: number,
  outputPerMTok: number,
  batch: boolean,
): CostBreakdown {
  const discount = batch ? COST_MULTIPLIERS.batch : 1;
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
 * Compara el coste antes y después de optimizar.
 *
 * Importante: los tokens de salida se mantienen constantes en el cálculo. Un
 * prompt más corto suele producir respuestas algo más cortas, pero eso depende
 * de la tarea y no se puede prometer, así que el ahorro que ves aquí viene
 * exclusivamente de los tokens de entrada.
 */
export function computeSavings(
  tokensBefore: number,
  tokensAfter: number,
  usage: UsageProfile,
  on: Date = new Date(),
): SavingsReport {
  const model = getModel(usage.model);
  const { inputPerMTok, outputPerMTok, promoApplied } = effectivePricing(model, on);

  const before = costOfCall(
    tokensBefore,
    usage.avgOutputTokens,
    inputPerMTok,
    outputPerMTok,
    usage.batchEligible,
  );
  const after = costOfCall(
    tokensAfter,
    usage.avgOutputTokens,
    inputPerMTok,
    outputPerMTok,
    usage.batchEligible,
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

/** Formatea un importe en USD con la precisión adecuada a su magnitud. */
export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toFixed(5)}`;
  if (abs < 1) return `$${value.toFixed(4)}`;
  if (abs < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
