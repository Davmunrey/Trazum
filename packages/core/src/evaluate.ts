import { segment } from './segment.js';
import { jaccard, normalizeForCompare } from './similarity.js';
import type { LlmProvider } from './types.js';

/**
 * Golden-set evaluation.
 *
 * Everything else Trazum reports is arithmetic: tokens, prices, multiplication.
 * This is the one question arithmetic cannot answer — does the shorter prompt
 * still do the job? — and the README has been answering it with a caveat
 * ("the aggressive level can change nuance; read the diff") because a rules
 * engine genuinely cannot know.
 *
 * The trap here is comparing the two prompts' outputs and calling the
 * difference a regression. A model asked the same question twice does not
 * answer identically, so "the optimised prompt diverged on 3 of 10 cases" is
 * meaningless on its own — it might be better than the original manages
 * against itself.
 *
 * So the original is run twice per case first, and that self-agreement is the
 * yardstick. The optimised prompt is judged against the model's own variance,
 * not against an imaginary determinism it never had. It costs a third call per
 * case and it is the only reason the number means anything.
 */

export interface EvalCase {
  /** The input this case feeds the prompt. */
  input: string;
  /** The original prompt's two answers, used to measure its own variance. */
  baseline: [string, string];
  /** The optimised prompt's answer. */
  optimized: string;
  /** How closely the original agreed with itself (0-1). */
  selfSimilarity: number;
  /** How closely the optimised answer matched the original's first (0-1). */
  crossSimilarity: number;
}

export type EvalVerdict = 'indistinguishable' | 'within-noise' | 'diverges' | 'inconclusive';

export interface EvalReport {
  provider: string;
  model: string;
  /**
   * The model the candidate answer came from.
   *
   * Equal to `model` on the ordinary comparison — same model, two prompts. It
   * differs when the question is the other one: **same prompt, two models**, which
   * is what a routing decision is. `profile` prices that route exactly and can say
   * nothing at all about whether the cheaper model still does the job; this is the
   * measurement that can.
   */
  candidateModel: string;
  cases: EvalCase[];
  /** Mean agreement of the original prompt with itself. The yardstick. */
  selfAgreement: number;
  /** Mean agreement between the original and the optimised prompt. */
  crossAgreement: number;
  verdict: EvalVerdict;
  /** Total provider calls made, so the cost is never a surprise. */
  callsMade: number;
}

export interface EvaluateOptions {
  /**
   * How many cases to run at once. Kept low by default: this hammers someone
   * else's endpoint, and a rate limit tripped halfway through wastes every
   * call already paid for.
   */
  concurrency?: number;
  /**
   * Where the candidate answer comes from. Defaults to `provider`.
   *
   * This is the whole routing axis, and it needed no new yardstick. The baseline
   * prompt is still run **twice on the original model** to measure that model's own
   * variance, and the candidate is still judged against it — so the question
   * becomes "does the cheaper model agree with the expensive one more closely than
   * the expensive one agrees with itself?", which is the honest form of "is this
   * route safe".
   *
   * A verdict built any other way would be a threshold somebody picked. This one is
   * the model's own noise floor, measured on the same cases in the same run.
   */
  candidateProvider?: LlmProvider;
}

/**
 * Builds the prompt for one case.
 *
 * A template gets its first placeholder filled; anything else gets the input
 * appended. Substituting is the honest reading of a prompt written with
 * `{{query}}` — appending would test a prompt nobody runs.
 */
export function fillPrompt(prompt: string, input: string): string {
  const placeholder = segment(prompt).find(
    (s) => s.kind === 'protected' && s.protection === 'placeholder',
  );
  if (!placeholder) return `${prompt.trimEnd()}\n\n${input}`;
  return prompt.replace(placeholder.text, input);
}

/** Agreement between two answers, 0-1. */
/**
 * How closely two answers agree, 0 to 1.
 *
 * Exported because `prune.ts` measures the same thing and must measure it the
 * same way. It was a private function here first, and the copy that appeared in
 * `prune.ts` was a bag-of-words F1 while this is Jaccard over normalised text —
 * two different numbers under one name, with a comment in the copy claiming they
 * were the same measure. Sharing the function is what makes that comment true.
 */
export function agreement(a: string, b: string): number {
  const left = normalizeForCompare(a);
  const right = normalizeForCompare(b);
  if (left === right) return 1;
  return jaccard(left, right);
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Turns the two agreement figures into a verdict.
 *
 * The comparison is always relative. An optimised prompt agreeing with the
 * original 0.85 of the time looks alarming until you see the original agrees
 * with itself 0.86 — at which point the optimisation changed nothing the model
 * was not already doing on its own.
 *
 * `inconclusive` exists because a model that is wildly inconsistent with itself
 * cannot be used to judge anything. Reporting a confident verdict off that
 * would be worse than admitting the test does not work here.
 */
export function verdictFor(selfAgreement: number, crossAgreement: number): EvalVerdict {
  if (crossAgreement >= 0.999) return 'indistinguishable';
  if (selfAgreement < 0.5) return 'inconclusive';
  // Within a small margin of the model's own noise floor, the difference is
  // not attributable to the prompt.
  if (crossAgreement >= selfAgreement - 0.05) return 'within-noise';
  return 'diverges';
}

/** Runs `tasks` with a bounded number in flight, preserving order. */
export async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]!();
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Runs both prompt versions over a set of inputs and reports whether the
 * optimisation changed the answers.
 *
 * Costs **three provider calls per case**: the original twice, the optimised
 * once. The doubled original is what makes the result interpretable, and
 * `callsMade` reports the total so the bill is never a surprise.
 */
export async function evaluate(
  originalPrompt: string,
  optimizedPrompt: string,
  inputs: readonly string[],
  provider: LlmProvider,
  options: EvaluateOptions = {},
): Promise<EvalReport> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const candidate = options.candidateProvider ?? provider;

  const run = (
    prompt: string,
    input: string,
    on: LlmProvider = provider,
  ): Promise<string> => on.complete({ system: fillPrompt(prompt, input), user: input });

  const cases = await pooled(
    inputs.map((input) => async (): Promise<EvalCase> => {
      // Sequential within a case: the two baseline runs exist to measure the
      // model's variance, and issuing them together invites a provider to
      // serve one from a cache and report a variance of zero.
      const baselineA = await run(originalPrompt, input);
      const baselineB = await run(originalPrompt, input);
      // On `candidate`, which is `provider` unless a route is being measured.
      const optimized = await run(optimizedPrompt, input, candidate);

      return {
        input,
        baseline: [baselineA, baselineB],
        optimized,
        selfSimilarity: agreement(baselineA, baselineB),
        crossSimilarity: agreement(baselineA, optimized),
      };
    }),
    concurrency,
  );

  const selfAgreement = mean(cases.map((c) => c.selfSimilarity));
  const crossAgreement = mean(cases.map((c) => c.crossSimilarity));

  return {
    provider: provider.name,
    model: provider.model,
    candidateModel: candidate.model,
    cases,
    selfAgreement,
    crossAgreement,
    verdict: verdictFor(selfAgreement, crossAgreement),
    callsMade: cases.length * 3,
  };
}
