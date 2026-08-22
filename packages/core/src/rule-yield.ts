/**
 * Which rules actually recover anything, and how much.
 *
 * The README says plainly that the deterministic rules recover about one per
 * cent, and that is the fair complaint about this tool. It is also an
 * **aggregate**, and an aggregate is where a distribution goes to hide: seven
 * rules recovering one per cent between them could be seven rules each doing a
 * seventh of the work, or two rules doing all of it beside five that have never
 * changed a byte of anybody's prompt.
 *
 * Nobody here had measured which. That is the wrong place to start an arc
 * about raising the ceiling — what to add on the model's side of the line is a
 * question about what the dictionary side already covers, and "about one per
 * cent" does not answer it.
 *
 * **Two numbers per rule, and they are not the same number.**
 *
 * - **Alone** is what the rule saves when it is the only one running.
 * - **Marginal** is what the whole set loses when the rule is removed.
 *
 * They diverge exactly where rules overlap, which is most of the interesting
 * cases: `duplicate-lines` and `duplicate-blocks` both find a repeated stanza,
 * so each has a real `alone` and a `marginal` near zero. Reporting either
 * figure by itself would be wrong in a different direction — `alone` alone
 * makes an overlapping rule look load-bearing, and `marginal` alone makes it
 * look inert. The report carries both and **never reconciles them into one**,
 * for the same reason a measurement and a projection are never added here.
 *
 * **Inert is a fact about the corpus, never about the rule.** A rule that finds
 * nothing across twenty-one files has not been shown to be useless; it has been
 * shown that these twenty-one files do not contain what it looks for. The
 * distinction is the whole difference between "delete this rule" and "measure
 * it on something else", and this module refuses to make the first claim.
 *
 * Browser-safe: prompts in, arithmetic out, no filesystem.
 */

import { optimize } from './optimize.js';
import type { OptimizeOptions, RuleId } from './types.js';

export interface RuleYield {
  id: RuleId;
  /** Tokens saved when this rule is the only one running, across every prompt. */
  alone: number;
  /**
   * Tokens the full set loses when this rule is removed.
   *
   * Zero with a non-zero `alone` means every token it finds is found by
   * something else too — an overlap, not a defect, and not a reason to delete
   * anything without knowing which rule is the better one to keep.
   */
  marginal: number;
  /** How many prompts it changed at all, running alone. */
  prompts: number;
}

export interface RuleYieldReport {
  schemaVersion: 1;
  /** Prompts measured. */
  prompts: number;
  /** Tokens across every prompt before any rule ran. */
  tokensBefore: number;
  /**
   * Tokens **the rules** save across every prompt.
   *
   * The whole run's saving minus the floor below, because they are not the
   * same thing and the first version of this module reported the difference as
   * if it were the rules' work. Run over a corpus the rules do not touch, that
   * version said the optimiser saved twenty-one tokens and every rule was
   * redundant — a sentence assembled out of somebody else's arithmetic.
   */
  tokensSaved: number;
  /**
   * Tokens the optimiser saves with **every rule disabled**.
   *
   * Normalisation the optimiser does regardless of the rule set. Named rather
   * than folded in: it is a real saving and it is not a rule's, and a report
   * that credited it to the rules would be flattering exactly the thing this
   * measurement exists to be honest about.
   */
  floor: number;
  /** Per rule, largest `marginal` first, then largest `alone`. */
  rules: RuleYield[];
  /**
   * `alone` summed over every rule.
   *
   * Stated beside `tokensSaved` and deliberately not reconciled with it: the
   * gap between them **is** the overlap, and a single "total" would be the one
   * number that cannot be true. Larger than `tokensSaved` means rules are
   * finding the same tokens; equal means they are disjoint on this corpus.
   */
  sumOfAlone: number;
  /**
   * Rules that save something alone and nothing at the margin — every token
   * they find, another rule finds too. On **this corpus**.
   */
  redundantHere: RuleId[];
  /**
   * Rules that changed nothing at all — they never fired. On **this corpus**,
   * which is the only claim the arithmetic supports: a rule that finds nothing
   * in these files has not been shown to find nothing anywhere.
   */
  inertHere: RuleId[];
  /**
   * Rules that **fired and recovered nothing**: they changed the prompt and
   * the token count did not move.
   *
   * Kept apart from `inertHere`, because the two look identical in a saving
   * column and mean opposite things. A rule that never fires has not been
   * exercised; a rule that fires and saves nothing has been exercised and is
   * altering somebody's prompt for no measured benefit — which is a finding
   * about the rule rather than about the corpus, and the one this measurement
   * was least likely to produce and most worth producing.
   *
   * `emphasis` lands here on a prompt whose shouted words it lowercases: same
   * words, same count, different instruction.
   */
  firedWithoutSavingHere: RuleId[];
  /**
   * How the tokens were counted, so the reader knows the margin.
   *
   * `heuristic` carries the estimator's documented band, and every figure here
   * inherits it — a rule whose marginal yield is a handful of tokens is inside
   * the noise, and the report says which counter it used rather than leaving
   * somebody to assume an exact one.
   */
  tokenSource: 'heuristic' | 'external';
}

/**
 * Measures each rule's yield over a set of prompts.
 *
 * `rules` is the full set to measure — the caller passes it rather than this
 * module reaching for the catalogue, so a subset can be measured and so the
 * list has one home. Every run uses the same options, so the level and the
 * token counter are the caller's and not this module's assumption.
 */
export function ruleYield(
  prompts: string[],
  rules: readonly RuleId[],
  options: OptimizeOptions = {},
): RuleYieldReport {
  const run = (disableRules: RuleId[]) =>
    prompts.map((prompt) => optimize(prompt, { ...options, disableRules }));

  const whole = run([]);
  const tokensBefore = whole.reduce((sum, result) => sum + result.tokensBefore, 0);
  const wholeSaved = whole.reduce((sum, result) => sum + result.tokensSaved, 0);

  /**
   * What the optimiser saves with every rule off.
   *
   * Whitespace normalisation and the like happen either way, and crediting
   * them to the rules is how "the rules recover about one per cent" survives
   * on a corpus where the rules recover nothing.
   */
  const floorResults = run([...rules]);
  const floor = floorResults.reduce((sum, result) => sum + result.tokensSaved, 0);
  const tokensSaved = Math.max(0, wholeSaved - floor);

  const measured: RuleYield[] = rules.map((id) => {
    // Alone: everything else off.
    const only = run(rules.filter((other) => other !== id));
    const alone = Math.max(0, only.reduce((sum, result) => sum + result.tokensSaved, 0) - floor);
    // Changed against the floor's own output, not against the original: the
    // normalisation changes every prompt, and counting that as this rule
    // having fired is how every rule came back as touching every file.
    const changed = only.filter(
      (result, index) => result.optimized !== floorResults[index]?.optimized,
    ).length;

    // Marginal: everything on but this one.
    const without = run([id]);
    const withoutSaved = without.reduce((sum, result) => sum + result.tokensSaved, 0);

    return {
      id,
      alone,
      // Never negative: removing a rule cannot make the set save more, and a
      // rounding artefact that said it did would be a finding nobody could act
      // on. Clamped rather than reported, because the clamp is the honest
      // reading of a difference inside the counter's own noise.
      marginal: Math.max(0, wholeSaved - withoutSaved),
      prompts: changed,
    };
  });

  measured.sort((a, b) => b.marginal - a.marginal || b.alone - a.alone);

  return {
    schemaVersion: 1,
    prompts: prompts.length,
    tokensBefore,
    tokensSaved,
    floor,
    rules: measured,
    sumOfAlone: measured.reduce((sum, rule) => sum + rule.alone, 0),
    redundantHere: measured.filter((rule) => rule.alone > 0 && rule.marginal === 0).map((rule) => rule.id),
    inertHere: measured.filter((rule) => rule.prompts === 0).map((rule) => rule.id),
    firedWithoutSavingHere: measured
      .filter((rule) => rule.prompts > 0 && rule.alone === 0)
      .map((rule) => rule.id),
    tokenSource: whole[0]?.tokenSource ?? 'heuristic',
  };
}
