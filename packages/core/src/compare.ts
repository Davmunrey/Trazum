import { optimize } from './optimize.js';
import { computeSavings } from './savings.js';
import type { AdvisoryId, RuleId } from './types.js';
import type { OptimizeOptions, UsageProfile } from './types.js';

/**
 * Comparing two versions of a prompt.
 *
 * `optimize()` answers "how much fat is in this prompt". This answers a
 * different question, and the one a pull request actually raises: "somebody
 * edited this — did it get worse?"
 *
 * Sign convention, stated once and held everywhere: **every number here is a
 * delta, `after - before`, and positive means the change made things worse.**
 * That is deliberately the opposite of the rest of the codebase, where every
 * figure is a saving. Mixing the two conventions in one report is the single
 * easiest way to make a cost tool lie, so nothing in this module is called a
 * saving and nothing reuses that name.
 */

export interface RuleDelta {
  /** Rules that fire on the new version but did not on the old one. */
  newlyFiring: RuleId[];
  /** Rules that fired on the old version and no longer do. */
  noLongerFiring: RuleId[];
}

export interface AdvisoryDelta {
  /** Advisories the new version raises that the old one did not. */
  appeared: AdvisoryId[];
  /** Advisories the old version raised that the new one has resolved. */
  resolved: AdvisoryId[];
}

export interface PromptComparison {
  tokensBefore: number;
  tokensAfter: number;
  /** `after - before`. Positive means the prompt grew. */
  tokenDelta: number;
  /** The delta as a percentage of the old size. 0 when the old size was 0. */
  deltaPct: number;
  /** Monthly cost change in USD. Positive means it now costs more. */
  monthlyDeltaUsd: number;
  /** Per-call cost change in USD. Positive means it now costs more. */
  perCallDeltaUsd: number;
  rules: RuleDelta;
  advisories: AdvisoryDelta;
  usage: UsageProfile;
}

export interface CompareOptions extends OptimizeOptions {
  /**
   * Compare what the rules would leave, rather than what was written.
   *
   * Off by default, and that default matters: a pull request changed the file
   * on disk, so the file on disk is what the reviewer is being asked about.
   * Optimising both sides first would hide a prompt that doubled in length but
   * happened to double in courtesy, which is exactly the change worth seeing.
   */
  optimizeBoth?: boolean;
}

const difference = <T>(a: readonly T[], b: readonly T[]): T[] => {
  const inB = new Set(b);
  return a.filter((item) => !inB.has(item));
};

/**
 * Collapses negative zero.
 *
 * Negating a saving of zero produces `-0`, which is arithmetically fine and
 * renders as `-$0` in a cost report — a change that did not happen, shown with
 * a direction.
 */
const noNegativeZero = (value: number): number => (value === 0 ? 0 : value);

/**
 * Compares two prompt versions.
 *
 * Both sides go through `optimize()` regardless, because that is what produces
 * the rule and advisory findings — but by default the *token and cost figures*
 * come from the text as written. `optimizeBoth` switches the figures to the
 * optimised text, for a team that runs Trazum in their pipeline and cares
 * about what actually reaches the model.
 */
export function comparePrompts(
  before: string,
  after: string,
  options: CompareOptions = {},
): PromptComparison {
  const { optimizeBoth = false, ...optimizeOptions } = options;

  const beforeResult = optimize(before, optimizeOptions);
  const afterResult = optimize(after, optimizeOptions);

  const tokensBefore = optimizeBoth ? beforeResult.tokensAfter : beforeResult.tokensBefore;
  const tokensAfter = optimizeBoth ? afterResult.tokensAfter : afterResult.tokensBefore;

  const tokenDelta = tokensAfter - tokensBefore;
  const usage = afterResult.usage;

  // computeSavings is before-minus-after, so its "saving" is our delta with
  // the sign flipped. Negating once, here, is what keeps the convention above
  // true everywhere else.
  const savings = computeSavings(tokensBefore, tokensAfter, usage);

  const beforeRules = beforeResult.rules.map((r) => r.id);
  const afterRules = afterResult.rules.map((r) => r.id);
  const beforeAdvisories = beforeResult.advisories.map((a) => a.id);
  const afterAdvisories = afterResult.advisories.map((a) => a.id);

  return {
    tokensBefore,
    tokensAfter,
    tokenDelta,
    deltaPct: tokensBefore > 0 ? (tokenDelta / tokensBefore) * 100 : 0,
    monthlyDeltaUsd: noNegativeZero(-savings.monthlySavingsUsd),
    perCallDeltaUsd: noNegativeZero(
      savings.perCall.after.totalUsd - savings.perCall.before.totalUsd,
    ),
    rules: {
      newlyFiring: difference(afterRules, beforeRules),
      noLongerFiring: difference(beforeRules, afterRules),
    },
    advisories: {
      appeared: difference(afterAdvisories, beforeAdvisories),
      resolved: difference(beforeAdvisories, afterAdvisories),
    },
    usage,
  };
}
