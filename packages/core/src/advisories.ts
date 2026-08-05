import { analyzeCachePrefix } from './cache.js';
import { getMessages } from './i18n/index.js';
import type { Locale } from './i18n/types.js';
import { COMPLEX_SIGNALS, SIMPLE_SIGNALS } from './phrases.js';
import { COST_MULTIPLIERS, MODELS, effectivePricing, getModel } from './pricing.js';
import { formatUsd } from './savings.js';
import { estimateTokens } from './tokenizer.js';
import type { Advisory, ModelPricing, TokenCounter, UsageProfile } from './types.js';

function countSignals(haystack: string, signals: readonly string[]): number {
  let count = 0;
  for (const signal of signals) if (haystack.includes(signal)) count++;
  return count;
}

/**
 * Estimates the capability tier the prompt needs.
 *
 * This is a keyword-and-size heuristic, not a judgement about answer quality.
 * Treat it as a hypothesis to validate with your own evaluations before
 * moving down a tier in production.
 */
export function recommendTier(prompt: string, tokens: number): ModelPricing['tier'] {
  const haystack = prompt.toLowerCase();
  let score =
    countSignals(haystack, COMPLEX_SIGNALS) * 2 - countSignals(haystack, SIMPLE_SIGNALS) * 2;

  if (tokens > 4000) score += 2;
  else if (tokens > 1500) score += 1;
  else if (tokens < 300) score -= 1;

  if (/```|~~~/.test(prompt)) score += 1;

  if (score >= 3) return 'opus';
  if (score >= 0) return 'sonnet';
  return 'haiku';
}

const TIER_ORDER: Record<ModelPricing['tier'], number> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
  frontier: 3,
};

/** Cheapest model of a tier, using today's effective input price. */
function cheapestInTier(tier: ModelPricing['tier'], on: Date): ModelPricing | undefined {
  const candidates = MODELS.filter((m) => m.tier === tier && m.id !== 'claude-mythos-5');
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, m) =>
    effectivePricing(m, on).inputPerMTok < effectivePricing(best, on).inputPerMTok ? m : best,
  );
}

export interface AdvisoryOptions {
  /** Reference date, used to decide whether a promotional price is live. */
  on?: Date;
  /** Token counter, so the cache-prefix analysis matches the caller's. */
  count?: TokenCounter;
  locale?: Locale;
}

/** Builds the advisories that do not modify the prompt but do move the bill. */
export function buildAdvisories(
  optimizedPrompt: string,
  tokensAfter: number,
  usage: UsageProfile,
  options: AdvisoryOptions = {},
): Advisory[] {
  const { on = new Date(), count = estimateTokens, locale } = options;
  const t = getMessages(locale);

  const advisories: Advisory[] = [];
  const model = getModel(usage.model);
  const { inputPerMTok, outputPerMTok, promoApplied } = effectivePricing(model, on);

  const monthlyInputUsd =
    (tokensAfter / 1_000_000) * inputPerMTok * usage.callsPerMonth * (usage.batchEligible ? 0.5 : 1);
  const monthlyOutputUsd =
    (usage.avgOutputTokens / 1_000_000) *
    outputPerMTok *
    usage.callsPerMonth *
    (usage.batchEligible ? 0.5 : 1);

  // --- Context window ---
  if (tokensAfter > model.contextWindow) {
    advisories.push({
      id: 'context-overflow',
      severity: 'warning',
      ...t.advisories.contextOverflow({
        tokens: tokensAfter,
        modelName: model.displayName,
        contextWindow: model.contextWindow,
      }),
      estimatedMonthlyUsd: null,
    });
  }

  // --- Prompt caching ---
  // Caching is a prefix match: in a template with placeholders, only what
  // precedes the first placeholder is cached. Costing the whole prompt would
  // be a lie the moment {{x}} takes a different value between calls.
  const cache = analyzeCachePrefix(optimizedPrompt, count);
  if (usage.callsPerMonth > 1) {
    const prefixShare = tokensAfter > 0 ? cache.stablePrefixTokens / tokensAfter : 0;
    const monthlyPrefixUsd = monthlyInputUsd * Math.min(1, prefixShare);
    const hitRate = Math.min(Math.max(usage.cacheHitRate, 0), 1);
    const factor =
      (1 - hitRate) * COST_MULTIPLIERS.cacheWrite5m + hitRate * COST_MULTIPLIERS.cacheRead;

    if (cache.stablePrefixTokens >= model.cacheMinTokens) {
      const saving = monthlyPrefixUsd * (1 - factor);
      if (saving > 0) {
        advisories.push({
          id: 'prompt-caching',
          severity: 'opportunity',
          ...t.advisories.promptCaching({
            placeholder: cache.firstPlaceholder,
            prefixTokens: cache.stablePrefixTokens,
            totalTokens: tokensAfter,
            minTokens: model.cacheMinTokens,
            modelName: model.displayName,
            hitRatePct: Math.round(hitRate * 100),
          }),
          estimatedMonthlyUsd: saving,
        });
      } else {
        advisories.push({
          id: 'prompt-caching-not-worth-it',
          severity: 'info',
          ...t.advisories.promptCachingNotWorthIt(),
          estimatedMonthlyUsd: null,
        });
      }
    } else {
      advisories.push({
        id: 'below-cache-minimum',
        severity: 'info',
        ...t.advisories.belowCacheMinimum({
          modelName: model.displayName,
          minTokens: model.cacheMinTokens,
          placeholder: cache.firstPlaceholder,
          prefixTokens: cache.stablePrefixTokens,
          totalTokens: tokensAfter,
          mentionLowerMinimum: model.cacheMinTokens > 512,
        }),
        estimatedMonthlyUsd: null,
      });
    }

    // Stable content placed AFTER the first placeholder: never cached today,
    // but moving it in front would make it cacheable.
    if (
      cache.firstPlaceholder &&
      cache.staticTokensAfter >= 200 &&
      cache.staticTokensAfter >= tokensAfter * 0.3
    ) {
      const movableShare = tokensAfter > 0 ? cache.staticTokensAfter / tokensAfter : 0;
      const saving = monthlyInputUsd * movableShare * Math.max(0, 1 - factor);
      advisories.push({
        id: 'cache-prefix-reorder',
        severity: 'opportunity',
        ...t.advisories.cachePrefixReorder({
          staticTokensAfter: cache.staticTokensAfter,
          sharePct: Math.round(movableShare * 100),
          placeholder: cache.firstPlaceholder,
        }),
        estimatedMonthlyUsd: saving > 0 ? saving : null,
      });
    }
  }

  // --- Batch API ---
  if (!usage.batchEligible && usage.callsPerMonth > 1) {
    const saving = (monthlyInputUsd + monthlyOutputUsd) * COST_MULTIPLIERS.batch;
    advisories.push({
      id: 'batch-api',
      severity: 'opportunity',
      ...t.advisories.batchApi(),
      estimatedMonthlyUsd: saving,
    });
  }

  // --- Recommended model ---
  const suggestedTier = recommendTier(optimizedPrompt, tokensAfter);
  if (TIER_ORDER[suggestedTier] < TIER_ORDER[model.tier]) {
    const candidate = cheapestInTier(suggestedTier, on);
    if (candidate) {
      const candidatePricing = effectivePricing(candidate, on);
      const candidateMonthly =
        ((tokensAfter / 1_000_000) * candidatePricing.inputPerMTok +
          (usage.avgOutputTokens / 1_000_000) * candidatePricing.outputPerMTok) *
        usage.callsPerMonth *
        (usage.batchEligible ? 0.5 : 1);
      const saving = monthlyInputUsd + monthlyOutputUsd - candidateMonthly;
      if (saving > 0) {
        advisories.push({
          id: 'model-downgrade',
          severity: 'opportunity',
          ...t.advisories.modelDowngrade({
            modelName: model.displayName,
            tier: suggestedTier,
            candidateName: candidate.displayName,
            currentUsd: formatUsd(monthlyInputUsd + monthlyOutputUsd),
            candidateUsd: formatUsd(candidateMonthly),
          }),
          estimatedMonthlyUsd: saving,
        });
      }
    }
  }

  // --- Where the money actually is ---
  if (monthlyOutputUsd > monthlyInputUsd * 2 && usage.avgOutputTokens > 0) {
    advisories.push({
      id: 'output-dominated',
      severity: 'info',
      ...t.advisories.outputDominated({
        outputUsd: formatUsd(monthlyOutputUsd),
        inputUsd: formatUsd(monthlyInputUsd),
      }),
      estimatedMonthlyUsd: null,
    });
  }

  if (promoApplied && model.promo) {
    advisories.push({
      id: 'promo-pricing',
      severity: 'warning',
      ...t.advisories.promoPricing({
        modelName: model.displayName,
        promoInput: model.promo.inputPerMTok,
        promoOutput: model.promo.outputPerMTok,
        until: model.promo.until,
        listInput: model.inputPerMTok,
        listOutput: model.outputPerMTok,
      }),
      estimatedMonthlyUsd: null,
    });
  }

  return advisories.sort((a, b) => (b.estimatedMonthlyUsd ?? 0) - (a.estimatedMonthlyUsd ?? 0));
}
