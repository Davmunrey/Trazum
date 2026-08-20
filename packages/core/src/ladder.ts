/**
 * Cheap first, escalate on measured failure — and the number that says whether
 * that is a saving or a bill.
 *
 * "Route it to the cheaper model" has been a recommendation with a quality
 * question attached since 1.23. Outcomes answered the quality question. This
 * answers the one nobody asks out loud: **an escalation pays twice**, so a
 * ladder is only a saving below a specific escalation rate, and above it the
 * ladder costs more than never having built it.
 *
 * ## The arithmetic, stated rather than assumed
 *
 * Without a ladder, every call costs `dear`. With one, every call costs
 * `cheap`, and the escalated share pays `dear` **on top** — the cheap attempt
 * is not refunded.
 *
 *     with a ladder:  cheap + rate x dear
 *     without one:    dear
 *
 * Those are equal at `rate = (dear - cheap) / dear`. Below it the ladder saves;
 * above it the ladder is a more expensive way to get the same answers. A ladder
 * sold as a saving without that number is the same head-arithmetic error `plan`
 * was built to kill — and it is worse here, because the mistake compounds with
 * traffic and nobody notices until a quarter is over.
 *
 * ## The escalation signal is the caller's
 *
 * Never inferred from length, latency, refusal text, a stop reason or a retry.
 * The same refusal `outcome` makes, for a sharper reason: this is a **control
 * loop**, not a report. A report built on a guess prints a wrong number; a
 * control loop built on a guess sends real traffic to a more expensive model on
 * the strength of that guess, forever, and bills for it.
 *
 * No signal, no ladder.
 *
 * ## What this module does not do
 *
 * It does not execute anything. A ladder escalates *after* a failure is known,
 * which is after the answer came back and usually after something downstream
 * judged it — so the retry belongs to the caller's own loop, not to a proxy
 * sitting on one request. What lives here is the policy and the arithmetic that
 * says whether the policy is worth running, measured against what actually
 * happened.
 */

import { judgeOutcome } from './outcome.js';
import type { OutcomeTally, OutcomeVocabulary } from './outcome.js';
import { effectivePricing } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

/** One workload's ladder, as the config declares it. */
export interface LadderPolicy {
  /**
   * Model ids, cheapest first. Two is the normal case; more is allowed and
   * priced pairwise, because a three-rung ladder that escalates twice pays
   * three times and the arithmetic has to say so.
   */
  tiers: string[];
  /**
   * The recorded outcome values that send the work up a tier.
   *
   * Declared, like the vocabulary itself. A value here that the vocabulary
   * never declared is a configuration error rather than a silent no-op, and
   * `validateLadder` says so.
   */
  escalateOn: string[];
}

export type LadderVerdict =
  /** Measured escalation is below break-even: the ladder saves money. */
  | 'saving'
  /** Measured escalation is above it: the ladder costs money. */
  | 'costing'
  /** Within a hair of break-even, where the sign is not a claim worth making. */
  | 'at-break-even'
  /** Not enough was measured to say. */
  | 'cannot-tell';

export type LadderUnknown =
  | 'no-outcomes-recorded'
  | 'no-escalation-values-declared'
  | 'tier-unpriced'
  | 'too-few-calls';

/**
 * Calls a workload needs before its escalation rate is treated as a rate.
 *
 * The same floor `per-outcome` uses for successes, and for the same reason: a
 * rate over fewer than ten observations moves more from one more observation
 * than from anything a team could do about it. A control loop switched on
 * because of nine calls is a control loop switched on for no reason.
 */
export const MIN_CALLS_FOR_LADDER = 10;

/**
 * How close to break-even counts as break-even.
 *
 * Two percentage points. Inside that band the ladder's sign flips on ordinary
 * week-to-week variation, and reporting "saving" on Monday and "costing" on
 * Thursday from the same policy would teach a reader to ignore the figure.
 */
export const BREAK_EVEN_BAND = 0.02;

export interface LadderArithmetic {
  /** What one call costs on the cheap tier. */
  cheapUsd: number;
  /** What one call costs on the dear tier. */
  dearUsd: number;
  /**
   * The escalation rate at which the ladder stops saving, 0-1.
   *
   * `(dear - cheap) / dear`. Null when either tier could not be priced — never
   * a zero, which would read as "any escalation at all loses money" and is a
   * completely different and much more alarming claim.
   */
  breakEvenRate: number | null;
}

export interface LadderPosition {
  arithmetic: LadderArithmetic;
  /** The measured share of calls that escalated, 0-1, or null. */
  measuredRate: number | null;
  verdict: LadderVerdict;
  /** Why, when the verdict is `cannot-tell`. A refusal never arrives bare. */
  unknown: LadderUnknown | null;
  /** Calls behind the measured rate. */
  calls: number;
  /** Calls whose recorded outcome was an escalation trigger. */
  escalations: number;
  /**
   * What the ladder cost against what one tier alone would have, per call, or
   * null when it cannot be computed. Negative means the ladder is cheaper.
   */
  deltaUsdPerCall: number | null;
}

/**
 * The cost of one call on a model, for a described shape of work.
 *
 * Deliberately takes the token shape rather than reading it from a log: the
 * break-even rate is a property of the *models and the work*, and somebody
 * should be able to compute it before running a single call through a ladder.
 */
export function ladderArithmetic(
  policy: LadderPolicy,
  shape: { inputTokens: number; outputTokens: number },
  catalogue: PricingCatalogue,
  on: Date = new Date(),
): LadderArithmetic {
  const priceOf = (id: string | undefined): number | null => {
    if (id === undefined) return null;
    const model = catalogue.byId.get(id);
    if (model === undefined) return null;
    const rates = effectivePricing(model, on);
    return (
      (shape.inputTokens / 1_000_000) * rates.inputPerMTok +
      (shape.outputTokens / 1_000_000) * rates.outputPerMTok
    );
  };

  const cheap = priceOf(policy.tiers[0]);
  /**
   * The **last** tier, not the second.
   *
   * A three-rung ladder's alternative is the model it would have used without
   * one, which is the top rung. Comparing against the middle would report a
   * saving against a model nobody was going to use.
   */
  const dear = priceOf(policy.tiers[policy.tiers.length - 1]);

  return {
    cheapUsd: cheap ?? 0,
    dearUsd: dear ?? 0,
    breakEvenRate: cheap === null || dear === null || dear <= 0 ? null : (dear - cheap) / dear,
  };
}

export function ladderPosition(
  policy: LadderPolicy,
  tally: OutcomeTally,
  shape: { inputTokens: number; outputTokens: number },
  vocabulary: OutcomeVocabulary | null,
  catalogue: PricingCatalogue,
  on: Date = new Date(),
): LadderPosition {
  const arithmetic = ladderArithmetic(policy, shape, catalogue, on);
  const bare = (unknown: LadderUnknown): LadderPosition => ({
    arithmetic,
    measuredRate: null,
    verdict: 'cannot-tell',
    unknown,
    calls: 0,
    escalations: 0,
    deltaUsdPerCall: null,
  });

  if (arithmetic.breakEvenRate === null) return bare('tier-unpriced');
  if (policy.escalateOn.length === 0) return bare('no-escalation-values-declared');

  const declared = vocabulary ?? { values: [], success: [] };
  let calls = 0;
  let escalations = 0;
  for (const entry of tally.byValue) {
    // Undeclared values are out of the denominator as well as the numerator —
    // a typo in an exporter must not move a control loop's break-even.
    if (judgeOutcome(entry.value, declared) === 'undeclared') continue;
    calls += entry.calls;
    if (policy.escalateOn.includes(entry.value)) escalations += entry.calls;
  }

  if (calls === 0) return bare('no-outcomes-recorded');
  if (calls < MIN_CALLS_FOR_LADDER) {
    return {
      arithmetic,
      measuredRate: null,
      verdict: 'cannot-tell',
      unknown: 'too-few-calls',
      calls,
      escalations,
      deltaUsdPerCall: null,
    };
  }

  const measuredRate = escalations / calls;
  const withLadder = arithmetic.cheapUsd + measuredRate * arithmetic.dearUsd;
  const deltaUsdPerCall = withLadder - arithmetic.dearUsd;

  const distance = measuredRate - arithmetic.breakEvenRate;
  const verdict: LadderVerdict =
    Math.abs(distance) <= BREAK_EVEN_BAND ? 'at-break-even' : distance < 0 ? 'saving' : 'costing';

  return { arithmetic, measuredRate, verdict, unknown: null, calls, escalations, deltaUsdPerCall };
}

export type LadderProblem =
  | { kind: 'too-few-tiers'; tiers: number }
  | { kind: 'unknown-model'; model: string }
  | { kind: 'duplicate-tier'; model: string }
  | { kind: 'tiers-not-cheapest-first'; model: string; after: string }
  | { kind: 'escalate-on-undeclared'; value: string }
  | { kind: 'escalate-on-a-success'; value: string };

/**
 * Everything wrong with a ladder before it is ever run.
 *
 * Returned rather than thrown, so a caller can report all of it at once — a
 * config that has to be fixed one error per run is a config people give up on.
 *
 * The last two are the interesting ones. Escalating on a value the vocabulary
 * never declared is a ladder that silently never fires; escalating on a value
 * declared as a **success** is a ladder that pays twice for work that already
 * worked, which is the most expensive possible typo in this file.
 */
export function validateLadder(
  policy: LadderPolicy,
  vocabulary: OutcomeVocabulary | null,
  catalogue: PricingCatalogue,
  on: Date = new Date(),
): LadderProblem[] {
  const problems: LadderProblem[] = [];
  if (policy.tiers.length < 2) {
    problems.push({ kind: 'too-few-tiers', tiers: policy.tiers.length });
  }

  const seen = new Set<string>();
  let previous: { id: string; price: number } | null = null;
  for (const id of policy.tiers) {
    if (seen.has(id)) problems.push({ kind: 'duplicate-tier', model: id });
    seen.add(id);
    const model = catalogue.byId.get(id);
    if (model === undefined) {
      problems.push({ kind: 'unknown-model', model: id });
      continue;
    }
    const price = effectivePricing(model, on).inputPerMTok;
    if (previous !== null && price < previous.price) {
      // A ladder whose rungs go down is not a ladder; it is a routing rule
      // that escalates to something cheaper and then reports a saving for it.
      problems.push({ kind: 'tiers-not-cheapest-first', model: id, after: previous.id });
    }
    previous = { id, price };
  }

  if (vocabulary !== null) {
    for (const value of policy.escalateOn) {
      if (!vocabulary.values.includes(value)) {
        problems.push({ kind: 'escalate-on-undeclared', value });
      } else if (vocabulary.success.includes(value)) {
        problems.push({ kind: 'escalate-on-a-success', value });
      }
    }
  }

  return problems;
}
