/**
 * One policy, judged once — the function every door calls.
 *
 * The `limits` block states the policy: per-day, per-session and per-label
 * USD ceilings. This module answers whether a proposed call fits it, and the
 * design constraint is the 1.62 arc's lesson: **two doors to the same value
 * agreeing by coincidence is a defect waiting for its input.** So the doors
 * — the gateway's 402, `serve`'s cost answer, `spend_guard` over MCP — do
 * not each read a slice of config and do their own arithmetic. They hand
 * this function the policy, the measured position and the call, and forward
 * its answer.
 *
 * Nothing here re-derives the single-ceiling semantics either. Each ceiling
 * is judged by `answerCost`, the function that has answered "does this call
 * fit this budget" for every door since 1.44 — including its refusals: a
 * negative token count is rejected before it can become money, an unpriced
 * model is a cannot-tell rather than a guess, and a verdict always names
 * whether it rests on a measurement alone or needed the estimate. A policy
 * judgement is those answers, one per applicable ceiling, under one verdict.
 *
 * Two refusals are this module's own, and both close the same loophole: a
 * policy with per-label ceilings judging a call that names no label, or a
 * per-session ceiling judging a call that names no session, is `cannot-tell`
 * — not "no ceiling applies". A call that omits its label does not slip past
 * the label's ceiling; it becomes unjudgeable, and the answer says why.
 */

import { answerCost } from './answer.js';
import type { CostAnswer } from './answer.js';
import type { PricingCatalogue } from './pricing.js';
import type { LimitsConfig } from './config-schema.js';

/** Which ceiling a judgement is about. */
export type LimitScope = 'day' | 'session' | 'label';

export type LimitVerdict = 'within' | 'over' | 'cannot-tell';

/** Why one ceiling could not be judged, when it could not. */
export type CannotJudgeReason =
  /** The scope's spend has not been measured, so the consumed half is unknown. */
  | 'nothing-measured'
  /** The model is not in the catalogue, so the call cannot be priced. */
  | 'model-unpriced'
  /** Per-label ceilings exist and the call names no label. */
  | 'no-label-on-call'
  /** A per-session ceiling exists and the call names no session. */
  | 'no-session-on-call';

/**
 * One ceiling, judged. The three figures a refusal must be auditable from
 * are all here: the limit, the measured spend, and the window the measured
 * figure covers — the denominator, not just the number.
 */
export interface LimitJudgement {
  scope: LimitScope;
  /** Which label, when the scope is `label`. Null otherwise. */
  label: string | null;
  limitUsd: number;
  verdict: LimitVerdict;
  /**
   * `measured` when the ceiling is already crossed without the estimate;
   * `measured+estimated` when it takes the described call to cross — or to
   * fit. Null when the verdict is `cannot-tell`.
   */
  restsOn: 'measured' | 'measured+estimated' | null;
  reason: CannotJudgeReason | null;
  /** Measured spend inside this scope's period. Null when not measured. */
  measuredUsd: number | null;
  /** The period the measured figure covers. Null when unknown. */
  window: { fromMs: number; toMs: number } | null;
  /** Where the scope would stand after this call. Null when unjudgeable. */
  afterCallUsd: number | null;
}

export interface PolicyJudgement {
  schemaVersion: 1;
  /**
   * The strictest verdict wins: one `over` makes the policy `over`, else one
   * `cannot-tell` makes it `cannot-tell`, else everything judged is `within`.
   * The order is the only safe one — a door that read "within" off a policy
   * with an unjudgeable ceiling would be approving a call nobody judged.
   */
  verdict: LimitVerdict;
  /** Set when the verdict is `cannot-tell` and no ceiling produced it. */
  reason: 'no-policy' | null;
  /** One entry per applicable ceiling, in policy order: day, session, label. */
  judgements: LimitJudgement[];
}

/**
 * The measured side: what the store has billed inside each scope's period.
 *
 * Every field is a measurement or `null`, never zero-for-absence — the rule
 * every document in this product holds. A scope the caller could not measure
 * (no clock on the log, a session nothing recorded) is `null`, and the
 * judgement for that ceiling is `cannot-tell` rather than "under".
 */
export interface MeasuredPosition {
  /** Measured spend in the current UTC day. */
  dayUsd: number | null;
  dayWindow?: { fromMs: number; toMs: number } | null;
  /** Measured spend in the call's session. */
  sessionUsd: number | null;
  sessionWindow?: { fromMs: number; toMs: number } | null;
  /** Measured spend under the call's label. */
  labelUsd: number | null;
  labelWindow?: { fromMs: number; toMs: number } | null;
}

/** The call being asked about — the same fields every door already takes. */
export interface ProposedCall {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  basis?: 'token-count' | 'heuristic';
  label?: string;
  session?: string;
}

const judgementOf = (
  scope: LimitScope,
  label: string | null,
  limitUsd: number,
  answer: CostAnswer,
): LimitJudgement => ({
  scope,
  label,
  limitUsd,
  verdict: answer.verdict,
  restsOn: answer.restsOn,
  // The single-ceiling reasons map one-to-one; the two call-shape refusals
  // (`no-label-on-call`, `no-session-on-call`) never reach answerCost.
  reason:
    answer.reason === null ? null : answer.reason === 'model-unpriced' ? 'model-unpriced' : 'nothing-measured',
  measuredUsd: answer.budget?.consumedUsd ?? null,
  window: answer.budget?.window ?? null,
  afterCallUsd: answer.afterCall?.usd ?? null,
});

const unjudgeable = (
  scope: LimitScope,
  label: string | null,
  limitUsd: number,
  reason: CannotJudgeReason,
): LimitJudgement => ({
  scope,
  label,
  limitUsd,
  verdict: 'cannot-tell',
  restsOn: null,
  reason,
  measuredUsd: null,
  window: null,
  afterCallUsd: null,
});

/**
 * Judges a proposed call against the whole `limits` policy.
 *
 * Pure and synchronous for the same reason `answerCost` is: this runs inside
 * a request that has not been sent yet, and a function that reads a file
 * cannot promise single-digit milliseconds. The caller measures; this judges.
 */
export function judgeLimits(
  policy: LimitsConfig | undefined,
  position: MeasuredPosition,
  call: ProposedCall,
  options: { catalogue: PricingCatalogue; on?: Date },
): PolicyJudgement {
  const judgements: LimitJudgement[] = [];

  const judge = (consumedUsd: number | null, limitUsd: number, window: { fromMs: number; toMs: number } | null) =>
    answerCost(
      {
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        basis: call.basis,
        limitUsd,
        consumedUsd: consumedUsd ?? undefined,
        window,
      },
      options,
    );

  if (policy?.dayUsd !== undefined) {
    judgements.push(
      judgementOf('day', null, policy.dayUsd, judge(position.dayUsd, policy.dayUsd, position.dayWindow ?? null)),
    );
  }

  if (policy?.sessionUsd !== undefined) {
    judgements.push(
      call.session === undefined
        ? unjudgeable('session', null, policy.sessionUsd, 'no-session-on-call')
        : judgementOf(
            'session',
            null,
            policy.sessionUsd,
            judge(position.sessionUsd, policy.sessionUsd, position.sessionWindow ?? null),
          ),
    );
  }

  if (policy?.byLabel !== undefined && Object.keys(policy.byLabel).length > 0) {
    if (call.label === undefined) {
      /*
        The loophole this closes: per-label ceilings with an unlabelled call.
        Skipping the scope would mean the ceiling only binds calls polite
        enough to name themselves — the same defect as the negative token
        count, worn as an omission. One judgement, no label, cannot-tell.
        The ceiling reported is the smallest, because that is the one the
        call might be dodging.
      */
      const smallest = Math.min(...Object.values(policy.byLabel));
      judgements.push(unjudgeable('label', null, smallest, 'no-label-on-call'));
    } else if (policy.byLabel[call.label] !== undefined) {
      const limitUsd = policy.byLabel[call.label]!;
      judgements.push(
        judgementOf(
          'label',
          call.label,
          limitUsd,
          judge(position.labelUsd, limitUsd, position.labelWindow ?? null),
        ),
      );
    }
    // A labelled call whose label has no ceiling is judged by the other
    // scopes alone: the policy said nothing about this label, and inventing
    // a ceiling for it would be enforcing config nobody wrote.
  }

  if (judgements.length === 0) {
    return { schemaVersion: 1, verdict: 'cannot-tell', reason: 'no-policy', judgements: [] };
  }

  const verdict: LimitVerdict = judgements.some((entry) => entry.verdict === 'over')
    ? 'over'
    : judgements.some((entry) => entry.verdict === 'cannot-tell')
      ? 'cannot-tell'
      : 'within';

  return { schemaVersion: 1, verdict, reason: null, judgements };
}
