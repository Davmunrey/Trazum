import { analyzeCachePrefix } from './cache.js';
import { getMessages } from './i18n/index.js';
import type { Locale } from './i18n/types.js';
import { COMPLEX_SIGNALS, SIMPLE_SIGNALS } from './phrases.js';
import { BUNDLED_CATALOGUE, effectivePricing, modelFrom, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import { formatUsd } from './savings.js';
import { analyzeExamples, findContradictions, findMovableSchema,
  findRestatedFormat } from './structure.js';
import { bandGoverns, estimateTokens } from './tokenizer.js';
import { bandFor } from './band.js';
import type { Advisory, ModelPricing, TokenCounter, UsageProfile } from './types.js';

function countSignals(haystack: string, signals: readonly string[]): number {
  let count = 0;
  for (const signal of signals) if (haystack.includes(signal)) count++;
  return count;
}

/** What `recommendTierDetailed` saw, not only what it concluded. */
export interface TierRecommendation {
  tier: ModelPricing['tier'];
  complexSignals: number;
  simpleSignals: number;
  /**
   * True when the prompt asks for depth and for brevity at once, and the
   * heuristic has no business preferring either.
   *
   * The score subtracts one side from the other, so three complex signals
   * against three simple ones cancels to zero and returns `sonnet` — the same
   * answer as a prompt with **no signals at all**. Those are opposite
   * situations reported identically: one is "nothing here suggests a tier", the
   * other is "this prompt contradicts itself about which tier it needs", and
   * only the second is worth telling somebody about.
   *
   * The threshold is a lead of one signal or fewer, and it comes from the
   * weights above rather than from taste: each signal moves the score by 2,
   * prompt size moves it by up to 2, so a one-signal lead is inside what
   * length alone contributes. A lead of two or more is a majority the size
   * term cannot manufacture.
   */
  conflicted: boolean;
}

/**
 * Estimates the capability tier the prompt needs, and says what it saw.
 *
 * This is a keyword-and-size heuristic, not a judgement about answer quality.
 * Treat it as a hypothesis to validate with your own evaluations before
 * moving down a tier in production.
 */
export function recommendTierDetailed(prompt: string, tokens: number): TierRecommendation {
  const haystack = prompt.toLowerCase();
  const complexSignals = countSignals(haystack, COMPLEX_SIGNALS);
  const simpleSignals = countSignals(haystack, SIMPLE_SIGNALS);
  let score = complexSignals * 2 - simpleSignals * 2;

  if (tokens > 4000) score += 2;
  else if (tokens > 1500) score += 1;
  else if (tokens < 300) score -= 1;

  if (/```|~~~/.test(prompt)) score += 1;

  const tier = score >= 3 ? 'opus' : score >= 0 ? 'sonnet' : 'haiku';
  return {
    tier,
    complexSignals,
    simpleSignals,
    conflicted:
      complexSignals > 0 && simpleSignals > 0 && Math.abs(complexSignals - simpleSignals) <= 1,
  };
}

/**
 * The tier alone, unchanged.
 *
 * Kept because it is public API and the 1.x line does not change shapes.
 * Callers that need to know whether the answer is trustworthy reach for
 * `recommendTierDetailed`.
 */
export function recommendTier(prompt: string, tokens: number): ModelPricing['tier'] {
  return recommendTierDetailed(prompt, tokens).tier;
}

const TIER_ORDER: Record<ModelPricing['tier'], number> = {
  /**
   * Below every real tier, so no tier is ever "less capable than unknown".
   *
   * The value carries the intent rather than the guard below carrying it alone.
   * Set the other way — above everything — the comparison
   * `TIER_ORDER[suggested] < TIER_ORDER['unknown']` is true for every prompt,
   * and the only thing left standing between that and a recommendation is an
   * unrelated provider filter. Mutation testing found exactly that: deleting
   * the guard changed no test result, because a second accident was covering
   * for it. Two accidents in a row is not a design.
   */
  unknown: Number.NEGATIVE_INFINITY,
  haiku: 0,
  sonnet: 1,
  opus: 2,
  frontier: 3,
};

/**
 * Cheapest model of a capability tier, using today's effective input price.
 *
 * **Within the same provider**, which is a product decision rather than an
 * implementation detail. Dropping from Opus to Sonnet is a one-line change;
 * moving to another vendor is a different API, different behaviour and a
 * migration. This advisory is already caveated as a keyword heuristic rather
 * than a judgement about answer quality, and a keyword heuristic has no business
 * recommending that somebody change supplier.
 *
 * A model with no provider recorded only matches others with none, so an overlay
 * that adds a bare model cannot pull a switch out of thin air.
 */
function cheapestInTier(
  tier: ModelPricing['tier'],
  on: Date,
  pricing: PricingCatalogue,
  provider: string | undefined,
): ModelPricing | undefined {
  const candidates = pricing.models.filter(
    (m) =>
      m.tier === tier &&
      m.provider === provider &&
      // Not generally available: recommending a model the reader cannot call is
      // worse than recommending nothing.
      m.recommendable !== false,
  );
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
  /** Prices to work from. Defaults to the catalogue bundled with this release. */
  pricing?: PricingCatalogue;
}

/** Builds the advisories that do not modify the prompt but do move the bill. */
export function buildAdvisories(
  optimizedPrompt: string,
  tokensAfter: number,
  usage: UsageProfile,
  options: AdvisoryOptions = {},
): Advisory[] {
  const { on = new Date(), count = estimateTokens, locale, pricing = BUNDLED_CATALOGUE } = options;
  const t = getMessages(locale);

  const advisories: Advisory[] = [];
  const model = modelFrom(pricing, usage.model);
  const { inputPerMTok, outputPerMTok, promoApplied } = effectivePricing(model, on);
  // Per model, not global. A cache read is ~10% of input on Anthropic and about
  // half on OpenAI; one constant for both overstates an OpenAI caching saving
  // fivefold, which is an invented saving rather than an imprecise one.
  const rates = multipliersFor(model);
  const batchFactor = usage.batchEligible ? (rates.batch ?? 1) : 1;

  const monthlyInputUsd =
    (tokensAfter / 1_000_000) * inputPerMTok * usage.callsPerMonth * batchFactor;
  const monthlyOutputUsd =
    (usage.avgOutputTokens / 1_000_000) * outputPerMTok * usage.callsPerMonth * batchFactor;

  /**
   * --- Context window ---
   *
   * The third place an estimate was compared against a hard threshold and the
   * answer stated as fact, after `cache-prefix-reorder` and `prompt-caching`. This
   * one has no dollar figure and is the most absolute of the three: **"The call
   * will fail."**
   *
   * With a ±10% band it fails in both directions. An estimated 1,050,000 tokens
   * against a 1,000,000 window can truly be 945,000 — the call succeeds and the
   * reader has been sent to split a prompt that fitted. And an estimated 990,000
   * can truly be 1,089,000, which does not fit, and nothing said anything at all.
   *
   * The silent direction is the worse one. A prompt over the window fails
   * outright rather than degrading, so there is no partial result to notice.
   */
  const estimated = count === estimateTokens;
  /**
   * The band of **this prompt**, not one number for all text.
   *
   * These three hedges — the context window, the cache minimum both ways — are
   * the places an estimate is compared against a hard threshold and the answer
   * stated as fact, so the width of the hedge decides whether the statement is
   * safe. A single 10% was measured on a corpus of thirteen prose files and one
   * each of code, numeric and punctuation, and the estimator is 25% out on a
   * SQL migration and 33% out on a CSV ledger. Hedging a code prompt by ten
   * points was hedging by a third of what it needed.
   */
  const band = bandFor(optimizedPrompt) / 100;

  /**
   * Whether that band describes **this** model's tokenizer.
   *
   * It was applied to every family, and the two consequences were not
   * symmetrical. The near-limit warning firing at the wrong threshold is a
   * heuristic being imprecise. The overflow advisory saying *"The call will
   * fail"* to somebody on GPT-5, on the strength of a number measured against
   * Claude over twenty-one samples, is a measurement stated as a fact outside
   * the domain it was measured in — which is the first thing this project's
   * doctrine forbids.
   */
  const bandApplies = bandGoverns(model.provider);

  if (tokensAfter > model.contextWindow) {
    advisories.push({
      id: 'context-overflow',
      severity: 'warning',
      ...t.advisories.contextOverflow({
        tokens: tokensAfter,
        modelName: model.displayName,
        contextWindow: model.contextWindow,
        /**
         * Only an estimate can be uncertain. A caller who counted exactly is
         * told the call fails, because it does.
         *
         * And an estimate on a family the band was never measured against is
         * **always** uncertain, however far over the line it looks: the margin
         * that would settle it is the unknown. Certainty here is not a
         * conclusion this input supports.
         */
        uncertain: estimated && (!bandApplies || tokensAfter * (1 - band) <= model.contextWindow),
        bandApplies,
      }),
      estimatedMonthlyUsd: null,
    });
  } else if (estimated && tokensAfter * (1 + band) > model.contextWindow) {
    advisories.push({
      id: 'context-near-limit',
      severity: 'warning',
      ...t.advisories.contextNearLimit({
        tokens: tokensAfter,
        modelName: model.displayName,
        contextWindow: model.contextWindow,
        bandApplies,
      }),
      estimatedMonthlyUsd: null,
    });
  }

  // --- Prompt caching ---
  // Caching is a prefix match: in a template with placeholders, only what
  // precedes the first placeholder is cached. Costing the whole prompt would
  // be a lie the moment {{x}} takes a different value between calls.
  const cache = analyzeCachePrefix(optimizedPrompt, count);
  // A provider with no prompt caching gets no caching advice. Without this the
  // zero minimum satisfies `0 >= 0` and Trazum offers a saving that cannot be
  // bought at any price — the exact failure that moving the multipliers onto the
  // model was meant to prevent, reintroduced one field along.
  /**
   * Three ways to have nothing useful to say about caching, and only one of
   * them used to be handled.
   *
   * `none` is a fact: the provider does not cache, so advice would be a saving
   * nobody can buy. `unknown` is the absence of a fact — a catalogue built from
   * a live price feed knows what a model costs and not how it caches — and it
   * has to decline for the opposite reason: not because the answer is no, but
   * because nobody asked anyone. Guessing either way is a number in somebody's
   * budget that came from nowhere.
   */
  const cachingKnown = model.caching !== 'none' && model.caching !== 'unknown' && model.cacheMinTokens !== null;

  if (usage.callsPerMonth > 1 && cachingKnown) {
    const prefixShare = tokensAfter > 0 ? cache.stablePrefixTokens / tokensAfter : 0;
    const monthlyPrefixUsd = monthlyInputUsd * Math.min(1, prefixShare);
    const hitRate = Math.min(Math.max(usage.cacheHitRate, 0), 1);
    const factor = (1 - hitRate) * rates.cacheWrite5m + hitRate * rates.cacheRead;

    const minTokens = model.cacheMinTokens ?? 0;

    if (cache.stablePrefixTokens >= minTokens) {
      const saving = monthlyPrefixUsd * (1 - factor);
      if (saving > 0) {
        advisories.push({
          id: 'prompt-caching',
          severity: 'opportunity',
          ...t.advisories.promptCaching({
            placeholder: cache.firstPlaceholder,
            prefixTokens: cache.stablePrefixTokens,
            totalTokens: tokensAfter,
            minTokens,
            modelName: model.displayName,
            hitRatePct: Math.round(hitRate * 100),
            readPct: Math.round(rates.cacheRead * 100),
            writePct: Math.round(rates.cacheWrite5m * 100),
            explicit: (model.caching ?? 'explicit') === 'explicit',
            /**
             * The mirror of `couldReachMinimum` on `below-cache-minimum`, and the
             * asymmetry between them was a real gap: that one hedged an estimate
             * landing just *under* the threshold, while this one promised money on
             * an estimate landing just *over* it. With a ±10% band an estimated
             * 528-token prefix can truly be 475, and then nothing caches at all.
             *
             * The cautionary direction is the one that needed it, because this is
             * the side with a dollar figure attached. Only when the number is an
             * estimate: a caller who supplied their own counter has an
             * authoritative prefix and hedging it would push them toward a check
             * they have already done.
             */
            nearMinimum:
              count === estimateTokens &&
              cache.stablePrefixTokens * (1 - band) < minTokens,
          }),
          estimatedMonthlyUsd: saving,
        });
      } else {
        /**
         * The threshold is derived from this model's own multipliers, not
         * quoted.
         *
         * Break-even is where a cached token costs exactly what an uncached one
         * does: `h*read + (1-h)*write = 1`, so `h = (1 - write) / (read -
         * write)`. At Anthropic's 1.25 and 0.1 that is 21.74%, and the sentence
         * this replaces said 28% for every model in the catalogue.
         *
         * A write multiplier of 1 has no such threshold. Writing then costs
         * exactly what not caching costs, so caching cannot lose money at any
         * hit rate, and `(1 - 1) / (r - 1)` is 0 rather than a small number.
         * Eight of the eighteen models are that shape, and the fixed sentence
         * advised all eight to consider turning caching off.
         */
        const write = rates.cacheWrite5m;
        advisories.push({
          id: 'prompt-caching-not-worth-it',
          severity: 'info',
          ...t.advisories.promptCachingNotWorthIt({
            readPct: Math.round(rates.cacheRead * 100),
            writePct: Math.round(write * 100),
            breakEvenPct:
              write <= 1 ? null : Math.round(((1 - write) / (rates.cacheRead - write)) * 1000) / 10,
          }),
          estimatedMonthlyUsd: null,
        });
      }
    } else {
      advisories.push({
        id: 'below-cache-minimum',
        severity: 'info',
        ...t.advisories.belowCacheMinimum({
          modelName: model.displayName,
          minTokens,
          placeholder: cache.firstPlaceholder,
          prefixTokens: cache.stablePrefixTokens,
          totalTokens: tokensAfter,
          mentionLowerMinimum: minTokens > 512,
          /**
           * Only when the number is an estimate and near the line.
           *
           * `count` defaults to `estimateTokens`; a caller who supplied their own
           * counter — `--exact-tokens`, or the official endpoint — gets an
           * authoritative number and no hedge, because hedging a measured figure
           * is its own kind of dishonesty.
           */
          couldReachMinimum:
            count === estimateTokens &&
            cache.stablePrefixTokens * (1 + band) >= minTokens,
        }),
        estimatedMonthlyUsd: null,
      });
    }

    /**
     * Stable content placed AFTER the first placeholder: never cached today, and
     * cacheable if it moves in front.
     *
     * **The prefix it would produce has to clear the minimum, and it did not used
     * to be checked.** That was a money figure in the flattering direction, which
     * is the one fault this file exists to avoid. On a 306-token support prompt
     * against Claude Opus 5's 512-token minimum, the best prefix a rearrangement
     * can build is 302 — so nothing caches, and the advisory offered $48.67 a
     * month that cannot be collected.
     *
     * Worse, it said so in the same report as `below-cache-minimum`, which was
     * telling the reader caching would not work here at all. Two advisories
     * contradicting each other, and the one with a dollar sign winning the
     * argument.
     *
     * `reorderForCache` already refused these prompts for exactly this reason, so
     * the tool's advice and its action disagreed: follow the advice, run
     * `--reorder`, and watch nothing happen.
     */
    /**
     * The best prefix any rearrangement could build, compared strictly.
     *
     * **No band hedge here, and that was tried first.** Widening the comparison by
     * ±10% — on the same reasoning that makes `below-cache-minimum` hedge near the
     * line — opened a window between 466 and 512 tokens where this advisory
     * offered a saving and `reorderForCache` refused to perform it. That is the
     * fault being fixed, reintroduced one layer up, and a test caught it.
     *
     * The near-the-line case is already handled and in the right place:
     * `below-cache-minimum` says the estimate is close to the threshold and names
     * `--exact-tokens`. Settle the number and both this advisory and the command
     * work from the same certainty. Two components disagreeing is worse than one
     * of them being briefly quiet.
     */
    const reorderedPrefix = cache.stablePrefixTokens + cache.staticTokensAfter;
    const reachableAfterReorder = reorderedPrefix >= minTokens;

    if (
      cache.firstPlaceholder &&
      cache.staticTokensAfter >= 200 &&
      cache.staticTokensAfter >= tokensAfter * 0.3 &&
      reachableAfterReorder
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
          /**
           * Trazum can do this, and until now it told you to do it by hand.
           * `reorderForCache` moves whole blocks, refuses any block carrying a
           * backward reference, and refuses everything after one — so the command
           * is the safe way to attempt what the prose was describing.
           */
          command: 'trazum optimize <file> --reorder',
        }),
        estimatedMonthlyUsd: saving > 0 ? saving : null,
      });
    }
  }

  // --- Batch API ---
  // `rates.batch === null` means the provider has no batch API at all, which is
  // different from not having said: advising a discount that cannot be bought
  // is worse than staying quiet.
  if (!usage.batchEligible && usage.callsPerMonth > 1 && rates.batch !== null) {
    const saving = (monthlyInputUsd + monthlyOutputUsd) * (1 - rates.batch);
    advisories.push({
      id: 'batch-api',
      severity: 'opportunity',
      ...t.advisories.batchApi(),
      estimatedMonthlyUsd: saving,
    });
  }

  // --- Recommended model ---
  const recommendation = recommendTierDetailed(optimizedPrompt, tokensAfter);
  const suggestedTier = recommendation.tier;

  /**
   * When the prompt argues with itself about which tier it needs, say so and
   * recommend nothing.
   *
   * The score subtracts one side from the other, so a prompt demanding depth
   * and brevity in equal measure cancels to zero and lands on `sonnet` — the
   * identical answer to a prompt with no signals at all. Reporting two opposite
   * situations with one number is the failure; the fix is not a better score,
   * it is declining to pretend there is one.
   *
   * This returns before the downgrade block rather than alongside it, because a
   * saving computed from a tier the heuristic cannot stand behind is a figure
   * with a dollar sign on it and nothing underneath.
   */
  if (recommendation.conflicted) {
    advisories.push({
      id: 'tier-signals-conflict',
      severity: 'info',
      ...t.advisories.tierSignalsConflict({
        complexSignals: recommendation.complexSignals,
        simpleSignals: recommendation.simpleSignals,
      }),
      estimatedMonthlyUsd: null,
    });
  }
  /**
   * A model whose capability nobody recorded is never told it is overpowered.
   *
   * Part of the condition rather than an early return, which is how the first
   * version of this was wrong: `return advisories` here skipped every advisory
   * *after* the model check — output-dominated, contradictory instructions —
   * none of which has anything to do with what tier the model is. An unknown
   * capability is a reason to say nothing about capability, not a reason to
   * stop reading the prompt.
   *
   * **Deliberately redundant**, and the one surviving mutant in this change.
   * `TIER_ORDER.unknown` is `-Infinity`, so the comparison is already false and
   * deleting this clause changes no behaviour and no test. It stays because the
   * two express the same rule in different places: an ordering that forgets it
   * and a condition that forgets it both have to happen before a model of
   * unrecorded capability is told it is overpowered.
   */
  if (!recommendation.conflicted && model.tier !== 'unknown' && TIER_ORDER[suggestedTier] < TIER_ORDER[model.tier]) {
    const candidate = cheapestInTier(suggestedTier, on, pricing, model.provider);
    if (candidate) {
      const candidatePricing = effectivePricing(candidate, on);
      /**
       * The candidate's own batch multiplier, not a constant.
       *
       * This line read `usage.batchEligible ? 0.5 : 1`, while the current
       * model's cost twenty lines above already used `rates.batch ?? 1` for
       * exactly the reason stated there: a discount that is not per model is an
       * invented saving rather than an imprecise one.
       *
       * Three models in the catalogue carry `batch: null` — kimi-k2,
       * deepseek-v3 and grok-4 — which means no batch API at all. Halving their
       * cost offered money that cannot be bought at any price, made the
       * downgrade look twice as good as it is, and could turn a saving that was
       * negative into one this advisory reports.
       */
      const candidateBatch = usage.batchEligible ? (multipliersFor(candidate).batch ?? 1) : 1;
      const candidateMonthly =
        ((tokensAfter / 1_000_000) * candidatePricing.inputPerMTok +
          (usage.avgOutputTokens / 1_000_000) * candidatePricing.outputPerMTok) *
        usage.callsPerMonth *
        candidateBatch;
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

  // --- Instructions that fight each other ---
  // Not a saving: a contradiction is a correctness problem that happens to
  // cost tokens, so it carries no dollar figure and sorts on severity instead.
  const contradictions = findContradictions(optimizedPrompt);
  const worst = contradictions[0];
  if (worst) {
    advisories.push({
      id: 'contradictory-instructions',
      severity: 'warning',
      ...t.advisories.contradictoryInstructions({
        axis: t.contradictionAxes[worst.axis],
        firstValue: t.contradictionValues[worst.a.value],
        firstSnippet: worst.a.snippet,
        secondValue: t.contradictionValues[worst.b.value],
        secondSnippet: worst.b.snippet,
        otherCount: contradictions.length - 1,
      }),
      estimatedMonthlyUsd: null,
    });
  }

  // --- Few-shot examples that repeat each other ---
  const examples = analyzeExamples(optimizedPrompt, count);
  if (examples.redundant.length > 0 && examples.redundantTokens > 0) {
    const saving =
      tokensAfter > 0
        ? monthlyInputUsd * Math.min(1, examples.redundantTokens / tokensAfter)
        : 0;
    const topSimilarity = Math.max(...examples.redundant.map((r) => r.similarity));
    advisories.push({
      id: 'redundant-examples',
      severity: 'opportunity',
      ...t.advisories.redundantExamples({
        redundantCount: examples.redundant.length,
        totalCount: examples.examples.length,
        redundantTokens: examples.redundantTokens,
        topSimilarityPct: Math.round(topSimilarity * 100),
      }),
      estimatedMonthlyUsd: saving > 0 ? saving : null,
    });
  }

  // --- Output format written out twice ---
  const restated = findRestatedFormat(optimizedPrompt, count);
  const movable = findMovableSchema(optimizedPrompt, count);
  if (movable) {
    /**
     * Priced from the tokens, which are real and reproducible, with the
     * uncertainty in the text rather than in the figure.
     *
     * What Trazum knows is how many tokens the block holds; what it cannot know
     * from here is whether the provider accepts a response schema. Withholding
     * the figure for that reason would be the wrong trade — the number is right
     * *if* the move is available, and the advisory says plainly that it does not
     * check. The same posture as `model-downgrade`, which carries a figure and
     * says out loud that it is a keyword heuristic.
     */
    const saving =
      tokensAfter > 0 ? monthlyInputUsd * Math.min(1, movable.tokens / tokensAfter) : 0;
    advisories.push({
      id: 'movable-output-schema',
      severity: 'opportunity',
      ...t.advisories.movableSchema({
        blocks: movable.blocks,
        tokens: movable.tokens,
        keyList: movable.keys.map((k) => `\`${k}\``).join(', '),
        cue: movable.cue,
      }),
      estimatedMonthlyUsd: saving > 0 ? saving : null,
    });
  }

  if (restated) {
    const saving =
      tokensAfter > 0
        ? monthlyInputUsd * Math.min(1, restated.restatedTokens / tokensAfter)
        : 0;
    advisories.push({
      id: 'restated-output-format',
      severity: 'opportunity',
      ...t.advisories.restatedOutputFormat({
        restatedCount: restated.restatedKeys.length,
        totalCount: restated.keys.length,
        restatedTokens: restated.restatedTokens,
        keyList: restated.restatedKeys.map((k) => `\`${k}\``).join(', '),
      }),
      estimatedMonthlyUsd: saving > 0 ? saving : null,
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

  // Warnings first, then by money. Sorting purely on the dollar figure buried
  // things that are wrong — an overflowing context window, two instructions
  // that contradict each other — underneath a saving of a few dollars, because
  // being wrong carries no price tag.
  const SEVERITY_ORDER: Record<Advisory['severity'], number> = {
    warning: 0,
    opportunity: 1,
    info: 2,
  };

  return advisories.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.estimatedMonthlyUsd ?? 0) - (a.estimatedMonthlyUsd ?? 0),
  );
}
