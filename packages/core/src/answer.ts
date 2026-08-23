/**
 * "What will this call cost, and is there budget?" — answered before it is
 * sent.
 *
 * Everything Trazum knows sits behind a process launch, a config walk and a
 * log parse. That is fine for a report and useless for a decision being made
 * right now: by the time a report exists, the call has been paid for.
 *
 * **This is where the temptation to merge halves is strongest**, which is why
 * the shape below refuses to. The budget consumed is *measured* — it comes
 * from the provider's own billed counts. The cost of the call being asked
 * about is *estimated* — nobody has sent it yet, and the token count is a
 * heuristic. A single "you have $38 left after this" would be a number that is
 * neither, handed to a caller with no way to tell.
 *
 * So the answer carries both halves separately, and the composed figure — which
 * callers genuinely need — arrives with its two halves broken out beside it.
 * The verdict names what it rests on: `measured` when the budget is already
 * blown without help from any estimate, and `measured+estimated` when it takes
 * the described call to cross. A caller reading only the verdict still cannot
 * mistake one for the other.
 */

import { effectivePricing } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

export type AnswerVerdict = 'within' | 'over' | 'cannot-tell';

/** Why the question cannot be answered, when it cannot. */
export type CannotTellReasonAnswer =
  /** No budget is configured, so "is there budget left" has no subject. */
  | 'no-budget-configured'
  /** Nothing has been measured, so the consumed half is unknown. */
  | 'nothing-measured'
  /** The model is not in the catalogue, so the call cannot be priced. */
  | 'model-unpriced';

export interface CallEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  /** Always `estimated`: this call has not happened. */
  provenance: 'estimated';
  /**
   * What the estimate rests on, so a caller can weigh it.
   *
   * `token-count` means the caller handed over counts it had already made;
   * `heuristic` means Trazum counted the text itself, with the ±10% band the
   * estimator has published since 1.9.
   */
  basis: 'token-count' | 'heuristic';
}

export interface BudgetPosition {
  limitUsd: number;
  /** Spent so far, from the provider's own billed counts. */
  consumedUsd: number;
  remainingUsd: number;
  /** Always `measured`: this is a bill, not a projection. */
  provenance: 'measured';
  /** The period the consumed figure covers. */
  window: { fromMs: number; toMs: number } | null;
}

export interface CostAnswer {
  schemaVersion: 1;
  /** The call the caller described, priced. Null when none was described. */
  call: CallEstimate | null;
  /** Where the budget stands. Null when there is no budget or nothing measured. */
  budget: BudgetPosition | null;
  verdict: AnswerVerdict;
  /**
   * What the verdict rests on — the field that keeps this honest.
   *
   * `measured` means the budget is already past its limit and the estimate
   * played no part. `measured+estimated` means it takes the described call to
   * cross, so the verdict is only as good as the token count behind it. A
   * caller that reads nothing else can still tell those apart.
   */
  restsOn: 'measured' | 'measured+estimated' | null;
  reason: CannotTellReasonAnswer | null;
  /**
   * Where the budget would stand after this call — the figure callers actually
   * want, with its halves kept visible so the composition cannot be mistaken
   * for a measurement.
   */
  afterCall: {
    usd: number;
    halves: { measuredUsd: number; estimatedUsd: number };
  } | null;
}

export interface AnswerRequest {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Measured spend so far, when there is any. */
  consumedUsd?: number;
  limitUsd?: number;
  window?: { fromMs: number; toMs: number } | null;
  /** How the token counts were arrived at. */
  basis?: 'token-count' | 'heuristic';
}

/**
 * Answers the two questions, from figures the caller already holds.
 *
 * Pure and synchronous on purpose: the whole point of this release is an
 * answer in single-digit milliseconds, and a function that reads a file cannot
 * promise that. The server hands it a store total it read once and keeps.
 */
export function answerCost(
  request: AnswerRequest,
  options: { catalogue: PricingCatalogue; on?: Date },
): CostAnswer {
  const { catalogue, on = new Date() } = options;

  /*
    A token count below zero, or not a number at all, is refused before it can
    become money.

    `spend_guard` took `outputTokens: -500`, priced the call at −$0.0075, and
    said **yes** — a negative estimate lowers the projected spend, so an agent
    that lies about its output tokens buys itself an approval. The refusal
    lives here rather than in the MCP wrapper because every door — serve's
    `POST /cost`, the gateway, the guard — routes through this function, and a
    fix in one wrapper is a hole left in the other three.
  */
  for (const [name, value] of [
    ['inputTokens', request.inputTokens],
    ['outputTokens', request.outputTokens],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative finite number (received: ${String(value)})`);
    }
  }

  let call: CallEstimate | null = null;
  let unpriced = false;
  if (request.model !== undefined) {
    const model = catalogue.byId.get(request.model);
    if (model === undefined) {
      unpriced = true;
    } else {
      const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
      const inputTokens = request.inputTokens ?? 0;
      const outputTokens = request.outputTokens ?? 0;
      call = {
        model: request.model,
        inputTokens,
        outputTokens,
        estimatedUsd:
          (inputTokens / 1_000_000) * inputPerMTok + (outputTokens / 1_000_000) * outputPerMTok,
        provenance: 'estimated',
        basis: request.basis ?? 'token-count',
      };
    }
  }

  const hasBudget = request.limitUsd !== undefined;
  const hasMeasurement = request.consumedUsd !== undefined;

  let budget: BudgetPosition | null = null;
  if (hasBudget && hasMeasurement) {
    budget = {
      limitUsd: request.limitUsd!,
      consumedUsd: request.consumedUsd!,
      remainingUsd: request.limitUsd! - request.consumedUsd!,
      provenance: 'measured',
      window: request.window ?? null,
    };
  }

  /**
   * The order of these refusals matters. A missing budget and a missing
   * measurement are different problems with different fixes — configure a
   * limit, or connect a source — and collapsing them into one message sends
   * half the readers to the wrong place.
   */
  if (budget === null) {
    return {
      schemaVersion: 1,
      call,
      budget: null,
      verdict: 'cannot-tell',
      restsOn: null,
      reason: !hasBudget ? 'no-budget-configured' : 'nothing-measured',
      afterCall: null,
    };
  }

  if (unpriced) {
    // The budget half is known and the call half is not. Answering "within"
    // would be answering a question nobody asked: whether the *current* spend
    // fits, rather than whether this call does.
    return {
      schemaVersion: 1,
      call: null,
      budget,
      verdict: 'cannot-tell',
      restsOn: null,
      reason: 'model-unpriced',
      afterCall: null,
    };
  }

  const estimatedUsd = call?.estimatedUsd ?? 0;
  const afterUsd = budget.consumedUsd + estimatedUsd;

  /**
   * Already over without any help from the estimate: the verdict is a
   * measurement, and saying so lets a caller act on it with full confidence
   * rather than wondering how good the token count was.
   */
  if (budget.consumedUsd > budget.limitUsd) {
    return {
      schemaVersion: 1,
      call,
      budget,
      verdict: 'over',
      restsOn: 'measured',
      reason: null,
      afterCall: {
        usd: afterUsd,
        halves: { measuredUsd: budget.consumedUsd, estimatedUsd },
      },
    };
  }

  return {
    schemaVersion: 1,
    call,
    budget,
    verdict: afterUsd > budget.limitUsd ? 'over' : 'within',
    // It takes the described call to cross, so the verdict is only as good as
    // the token count behind it — and it says so rather than implying a
    // measurement.
    restsOn: 'measured+estimated',
    reason: null,
    afterCall: {
      usd: afterUsd,
      halves: { measuredUsd: budget.consumedUsd, estimatedUsd },
    },
  };
}
