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
import { judgeLimits, limitSentence, unjudgedSentence } from './judgement.js';
import type { MeasuredPosition, PolicyJudgement } from './judgement.js';
import type { LimitsConfig, WaiveEntry } from './config-schema.js';
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
  /**
   * The `limits` policy, judged for this call by `judgeLimits` — the same
   * function the gateway and `serve` call, which is what "one policy, three
   * doors" means in code. Always present: with no policy it says `no-policy`
   * rather than being absent, because a missing field and a judged absence
   * are different answers.
   */
  policy: PolicyJudgement;
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
  /** The `limits` block, when the caller holds one. Judged, never re-derived. */
  limits?: LimitsConfig;
  /** Measured spend per scope, from the caller's own log — never a guess. */
  position?: MeasuredPosition;
  /** The workload this call belongs to, for the per-label ceiling. */
  label?: string;
  /** The conversation, for the per-session ceiling. Never echoed back. */
  session?: string;
  /** The config's `waive` list — a silenced limit answers yes, on the record. */
  waive?: readonly WaiveEntry[];
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
   * The limits policy, judged by the same function the gateway and `serve`
   * call. A caller that passes no policy gets `no-policy` and an answer
   * byte-identical to what this returned before the field existed.
   */
  const policy = judgeLimits(
    request.limits,
    request.position ?? { dayUsd: null, sessionUsd: null, labelUsd: null },
    {
      model: request.model,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      basis: request.basis,
      label: request.label,
      session: request.session,
    },
    { catalogue, on, ...(request.waive === undefined ? {} : { waivers: request.waive }) },
  );

  /**
   * The verdict maps the cost answer's three outcomes onto the three an agent
   * can act on. `cannot-tell` stays `cannot-tell` rather than defaulting to
   * yes: a guard that permits whatever it cannot judge is a guard that permits
   * everything the moment its inputs go missing.
   *
   * A judged limits policy folds in at the same precedence the policy itself
   * uses — no beats cannot-tell beats yes — because a guard whose headline
   * said "yes" over a crossed session ceiling would be two doors in one
   * answer. `no-policy` folds as nothing: the caller asked only the budget
   * question, and gets only that answer.
   */
  const fromCost: GuardVerdict =
    cost.verdict === 'cannot-tell' ? 'cannot-tell' : cost.verdict === 'over' ? 'no' : 'yes';
  const verdict: GuardVerdict =
    policy.verdict === 'over'
      ? 'no'
      : policy.verdict === 'cannot-tell' && policy.reason !== 'no-policy' && fromCost === 'yes'
        ? 'cannot-tell'
        : fromCost;

  return {
    schemaVersion: 1,
    verdict,
    cost,
    alternatives,
    because: reasonFor(verdict, cost, alternatives, policy),
    policy,
  };
}

function reasonFor(
  verdict: GuardVerdict,
  cost: CostAnswer,
  alternatives: GuardAlternative[],
  policy: PolicyJudgement,
): string {
  // A refusal that came from the limits policy speaks the shared sentence —
  // the limit, the measured position and the period, same words at every door.
  const overLimit = policy.judgements.find((entry) => entry.verdict === 'over' && entry.waived === null);
  if (verdict === 'no' && overLimit !== undefined) {
    const lead = limitSentence(overLimit);
    return alternatives.length === 0
      ? `${lead} No cheaper way to make this call exists in the catalogue.`
      : `${lead} The cheapest alternative below saves the most.`;
  }
  if (verdict === 'cannot-tell' && cost.verdict !== 'cannot-tell') {
    return unjudgedSentence(policy);
  }
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
