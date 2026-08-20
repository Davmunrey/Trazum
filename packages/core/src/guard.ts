/**
 * The thing spending the money can finally ask, and be told no.
 *
 * 1.44 gave an endpoint that *answers*. An agent may consult it and ignore it,
 * which is fine — advice an implementation can skip is still advice worth
 * having. What was missing is the shape of a refusal an agent can act on.
 *
 * **A guard that only says no teaches a caller to stop asking.** A model told
 * "denied" with no alternative has exactly two moves: send it anyway, or fail
 * the user's request. Both are worse than the call it wanted to make. So every
 * refusal here arrives with the levers that exist — this work routes to a
 * cheaper model that still fits, a batch window would halve it — each with
 * what it is worth *for this call*, and the assumption it rests on.
 *
 * **The guard never spends to answer.** No provider call, no LLM pass, no
 * pull. The answer comes from the store and the catalogue, or it says it
 * cannot tell. A cost guard that costs money to consult is a joke with a bill
 * attached.
 *
 * **An alternative the prompt does not fit in is not an alternative.** A
 * cheaper model with a smaller context window does not make this call cheaper;
 * it makes it impossible. Those are filtered out here rather than offered and
 * blamed later.
 */

import { answerCost } from './answer.js';
import type { AnswerRequest, CostAnswer } from './answer.js';
import { effectivePricing, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import type { ModelPricing } from './types.js';
import type { PlanAssumption } from './plan.js';

export type GuardVerdict = 'yes' | 'no' | 'cannot-tell';

export interface GuardAlternative {
  kind: 'route' | 'batch' | 'route+batch';
  /** The model this moves to, when it moves. */
  model: { id: string; displayName: string } | null;
  /**
   * What this alternative saves **on this call** — not per month.
   *
   * The caller is deciding one call, right now. A monthly figure would be the
   * right number at the wrong moment, and an agent has no way to act on it.
   */
  savingUsd: number;
  /** What the log cannot confirm, typed as everywhere since 1.38. */
  assumes: PlanAssumption[];
  /**
   * Whether the described call fits this alternative's context window.
   *
   * Only `true` ever reaches a caller — the false ones are dropped before
   * they are offered. The field exists so the rule is visible in the type
   * rather than buried in a filter nobody reads.
   */
  fits: true;
}

export interface GuardAnswer {
  schemaVersion: 1;
  verdict: GuardVerdict;
  /** The full cost answer, halves and provenance intact. */
  cost: CostAnswer;
  /**
   * What to do instead, dearest saving first. Present on a refusal, and on a
   * yes as well: an agent that can spend less while still being allowed to
   * spend should be told so.
   */
  alternatives: GuardAlternative[];
  /**
   * A one-line reason a human will read in a log. The fields above are what a
   * machine acts on; this is never the only place a fact appears.
   */
  because: string;
}

/** Models cheaper than this one, in the same family, that the prompt fits in. */
function cheaperThan(
  model: ModelPricing,
  catalogue: PricingCatalogue,
  inputTokens: number,
  on: Date,
): ModelPricing[] {
  const here = effectivePricing(model, on);
  return [...catalogue.byId.values()]
    .filter((candidate) => {
      if (candidate.id === model.id) return false;
      if (candidate.provider !== model.provider) return false;
      const there = effectivePricing(candidate, on);
      if (there.inputPerMTok >= here.inputPerMTok) return false;
      // A model the prompt does not fit in is not a cheaper way to make this
      // call; it is a way not to make it.
      return candidate.contextWindow >= inputTokens;
    })
    .sort((a, b) => effectivePricing(b, on).inputPerMTok - effectivePricing(a, on).inputPerMTok);
}

export interface GuardRequest extends AnswerRequest {
  /** Whether the caller says this work can wait for a batch window. */
  batchEligible?: boolean;
}

export function guardSpend(
  request: GuardRequest,
  options: { catalogue: PricingCatalogue; on?: Date },
): GuardAnswer {
  const { catalogue, on = new Date() } = options;
  const cost = answerCost(request, { catalogue, on });

  const alternatives: GuardAlternative[] = [];
  const model = request.model === undefined ? undefined : catalogue.byId.get(request.model);

  if (model !== undefined && cost.call !== null) {
    const inputTokens = cost.call.inputTokens;
    const outputTokens = cost.call.outputTokens;
    const here = effectivePricing(model, on);
    const priceOf = (candidate: ModelPricing): number => {
      const rates = effectivePricing(candidate, on);
      return (inputTokens / 1_000_000) * rates.inputPerMTok + (outputTokens / 1_000_000) * rates.outputPerMTok;
    };
    const mine = (inputTokens / 1_000_000) * here.inputPerMTok + (outputTokens / 1_000_000) * here.outputPerMTok;
    const batchRate = multipliersFor(model).batch;

    for (const candidate of cheaperThan(model, catalogue, inputTokens, on)) {
      const routed = priceOf(candidate);
      const candidateBatch = multipliersFor(candidate).batch;
      const both = candidateBatch === null ? null : routed * candidateBatch;
      /**
       * Route and batch on the same call combine the way `billLevers` has
       * combined them since 1.23: the batch discount applies to the *cheaper*
       * model's price, never as a second subtraction from this one. Adding the
       * two savings is the arithmetic `plan` exists to kill.
       */
      if (request.batchEligible === true && both !== null) {
        alternatives.push({
          kind: 'route+batch',
          model: { id: candidate.id, displayName: candidate.displayName },
          savingUsd: mine - both,
          assumes: [
            { kind: 'model-capability', model: candidate.displayName },
            { kind: 'batch-window' },
          ],
          fits: true,
        });
      }
      alternatives.push({
        kind: 'route',
        model: { id: candidate.id, displayName: candidate.displayName },
        savingUsd: mine - routed,
        assumes: [{ kind: 'model-capability', model: candidate.displayName }],
        fits: true,
      });
    }

    if (request.batchEligible === true && batchRate !== null) {
      alternatives.push({
        kind: 'batch',
        model: null,
        savingUsd: mine - mine * batchRate,
        assumes: [{ kind: 'batch-window' }],
        fits: true,
      });
    }
  }

  alternatives.sort((a, b) => b.savingUsd - a.savingUsd);

  /**
   * The verdict maps the cost answer's three outcomes onto the three an agent
   * can act on. `cannot-tell` stays `cannot-tell` rather than defaulting to
   * yes: a guard that permits whatever it cannot judge is a guard that permits
   * everything the moment its inputs go missing.
   */
  const verdict: GuardVerdict =
    cost.verdict === 'cannot-tell' ? 'cannot-tell' : cost.verdict === 'over' ? 'no' : 'yes';

  return {
    schemaVersion: 1,
    verdict,
    cost,
    alternatives,
    because: reasonFor(verdict, cost, alternatives),
  };
}

function reasonFor(verdict: GuardVerdict, cost: CostAnswer, alternatives: GuardAlternative[]): string {
  if (verdict === 'cannot-tell') {
    return cost.reason === 'no-budget-configured'
      ? 'No budget is configured, so there is nothing to judge this against.'
      : cost.reason === 'nothing-measured'
        ? 'Nothing has been measured yet, so how much of the budget is gone is unknown.'
        : 'This model is not in the price catalogue, so the call cannot be priced.';
  }
  if (verdict === 'no') {
    const lead = cost.restsOn === 'measured'
      ? 'The budget is already spent, measured.'
      : 'This call would take the budget past its limit, on an estimate of the call.';
    return alternatives.length === 0
      ? `${lead} No cheaper way to make this call exists in the catalogue.`
      : `${lead} The cheapest alternative below saves the most.`;
  }
  return alternatives.length === 0
    ? 'Within budget, and no cheaper way to make this call exists in the catalogue.'
    : 'Within budget — and there is still a cheaper way to make this call.';
}
