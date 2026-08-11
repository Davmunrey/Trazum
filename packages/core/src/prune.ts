import { findExamples } from './structure.js';
import { estimateTokens } from './tokenizer.js';
import { agreement, pooled, verdictFor } from './evaluate.js';
import type { EvalVerdict } from './evaluate.js';
import type { LlmProvider, TokenCounter } from './types.js';

/**
 * Which few-shot examples earn their tokens, measured rather than guessed.
 *
 * The `redundant-examples` advisory answers a *textual* question: does this
 * example look like an earlier one? That catches the way few-shot blocks actually
 * grow — copy the last one, change two fields — and it is the cheapest useful
 * thing to say, because it costs nothing.
 *
 * This answers a different and much stronger question: **does removing this
 * example change any answer?** Two examples can be textually unalike and teach the
 * same thing, and a block nobody has measured is usually where the tokens are: a
 * few-shot section is routinely most of a prompt.
 *
 * The method is leave-one-out against the prompt's own noise floor. Ask the full
 * prompt twice to find out how much the model disagrees with *itself*, then remove
 * one example and ask again. If the answer moves no further than the model already
 * moves on its own, that example is not doing observable work.
 *
 * **It spends the caller's money and must never run by default.** The bill is
 * `2 + examples` calls per input, and `plannedCalls` exists so a caller can print
 * the figure before deciding rather than discovering it afterwards.
 *
 * **What it cannot tell you.** An example may exist for a case these inputs do not
 * contain — the boundary condition somebody hit in production last March and added
 * a demonstration for. Removing it would change nothing measurable here and break
 * that case. So this reports "no effect on these inputs", never "delete this", and
 * the wording is deliberate: the strength of the claim is bounded by the inputs
 * given, and only the caller knows whether those cover what matters.
 */

export interface ExampleContribution {
  /** Position in the prompt's example block, from zero. */
  index: number;
  /** The example itself, so a report can quote its first line. */
  text: string;
  tokens: number;
  /**
   * Mean agreement between the full prompt's answer and the answer with this
   * example removed, across every input.
   */
  agreementWithout: number;
  /**
   * `indistinguishable` and `within-noise` both mean the removal changed nothing
   * this measurement can see. `diverges` means it did. `inconclusive` means the
   * model disagreed with itself too much for any of this to mean anything.
   */
  verdict: EvalVerdict;
}

export interface PruneReport {
  provider: string;
  model: string;
  /** The model's agreement with itself, given the full prompt. The yardstick. */
  selfAgreement: number;
  contributions: ExampleContribution[];
  /** Tokens held by examples whose removal changed nothing observable. */
  recoverableTokens: number;
  /** Calls actually made, so the bill is never a surprise. */
  callsMade: number;
}

export interface PruneOptions {
  concurrency?: number;
  countTokens?: TokenCounter;
}

/**
 * What this will cost, before it costs it.
 *
 * Pure and exported so a CLI can print the number and let somebody say no. A
 * feature that spends money and only reports the total afterwards is a feature
 * people run once.
 */
export function plannedCalls(examples: number, inputs: number): number {
  if (examples < 2 || inputs < 1) return 0;
  // Two baseline runs per input to establish the noise floor, then one run per
  // example removed. The baselines are shared across every example, which is the
  // only reason this is affordable at all.
  return inputs * (2 + examples);
}

/**
 * The prompt with one example block removed, located by position rather than by
 * text.
 *
 * `prompt.replace(block.text, '')` would be shorter and wrong: two identical
 * example blocks — which is exactly what a copy-paste few-shot section contains —
 * would both match the first occurrence, so removing the second would silently
 * remove the first and the measurement would describe a prompt nobody asked about.
 * Scanning forward from the end of the previous block gives each block its true
 * offset.
 */
export function withoutExample(
  prompt: string,
  examples: readonly { text: string }[],
  index: number,
): string {
  let cursor = 0;
  for (let position = 0; position < examples.length; position++) {
    const text = examples[position]?.text ?? '';
    const at = prompt.indexOf(text, cursor);
    if (at === -1) break;
    if (position === index) {
      const before = prompt.slice(0, at);
      const after = prompt.slice(at + text.length);
      // Collapse the blank lines the removal leaves behind, so the resulting
      // prompt is one an author might have written rather than one with a hole.
      return `${before}${after}`.replace(/\n{3,}/g, '\n\n');
    }
    cursor = at + text.length;
  }
  return prompt;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Thrown rather than returned: there is nothing to report and a reason to say. */
export class NothingToPrune extends Error {}

export async function pruneExamples(
  prompt: string,
  inputs: readonly string[],
  provider: LlmProvider,
  options: PruneOptions = {},
): Promise<PruneReport> {
  const count = options.countTokens ?? estimateTokens;
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const examples = findExamples(prompt, count);

  if (examples.length < 2) {
    throw new NothingToPrune(
      'this prompt has fewer than two few-shot examples, so there is nothing to compare',
    );
  }
  if (inputs.length === 0) {
    throw new NothingToPrune('no inputs were given, and leave-one-out needs something to run on');
  }

  let callsMade = 0;
  const run = async (text: string, input: string): Promise<string> => {
    callsMade++;
    return provider.complete({ system: text.replaceAll('{{input}}', input), user: input });
  };

  /**
   * Baselines first, and sequentially within an input.
   *
   * The two runs exist to measure the model's own variance, and issuing them
   * together invites a provider to serve one from a cache and report a variance of
   * zero — which would make every example look load-bearing.
   */
  const baselines = await pooled(
    inputs.map((input) => async () => {
      const first = await run(prompt, input);
      const second = await run(prompt, input);
      return { input, first, selfSimilarity: agreement(first, second) };
    }),
    concurrency,
  );

  const selfAgreement = mean(baselines.map((baseline) => baseline.selfSimilarity));

  const contributions = await pooled(
    examples.map((example, index) => async (): Promise<ExampleContribution> => {
      const reduced = withoutExample(prompt, examples, index);
      const answers = await pooled(
        baselines.map((baseline) => () => run(reduced, baseline.input)),
        1,
      );
      const agreementWithout = mean(
        answers.map((answer, position) => agreement(baselines[position]!.first, answer)),
      );
      return {
        index,
        text: example.text,
        tokens: example.tokens,
        agreementWithout,
          // `verdictFor` and `agreement` both come from evaluate.ts rather than
        // being reimplemented. A repository where two features disagree about what
        // "within the noise" means is one where the answer depends on which
        // command you ran — and the first draft of this file did exactly that.
        verdict: verdictFor(selfAgreement, agreementWithout),
      };
    }),
    concurrency,
  );

  const recoverableTokens = contributions
    .filter(
      (contribution) =>
        contribution.verdict === 'indistinguishable' || contribution.verdict === 'within-noise',
    )
    .reduce((sum, contribution) => sum + contribution.tokens, 0);

  return {
    provider: provider.name,
    model: provider.model,
    selfAgreement,
    contributions,
    recoverableTokens,
    callsMade,
  };
}
