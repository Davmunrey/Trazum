/**
 * The findings the rules engine has deferred since 0.1.0, and the layer that
 * throws most of them away.
 *
 * A dictionary cannot see meaning. Two few-shot examples teaching the same
 * boundary in different words, an instruction restated four paragraphs later, a
 * policy contradicted by a clarification — none of them are findable by
 * pattern, and the near-copy detector deliberately does not flag them because
 * flagging them would mean flagging everything.
 *
 * A model can see them. A model can also **invent** them, fluently, and a
 * hallucinated finding is worse than a missed one: a missed finding costs
 * somebody nothing, and an invented one costs them an afternoon and the next
 * finding's credibility.
 *
 * ## The model proposes; this disposes
 *
 * The discipline `--suggest` has had since 1.6, applied to a harder claim. A
 * rewrite suggestion is checkable by construction — the replacement is either
 * shorter or it is not. A *semantic* finding is a claim about meaning, and the
 * only part of it this layer can check is the **evidence**.
 *
 * So it checks the evidence, ruthlessly:
 *
 * 1. **Every quoted span must appear in the prompt character for character.**
 *    The single strongest signal available. A model reporting on a prompt
 *    while paraphrasing what it quotes has stopped reading and started
 *    writing, and everything else it said in that response is suspect.
 * 2. **The spans must be distinct and must not overlap.** A "pair" that is one
 *    span quoted twice is not a finding about redundancy; it is a finding
 *    about nothing.
 * 3. **The near-copy detector must not already catch it.** A model paid to
 *    re-report a finding the deterministic layer produces for free is a model
 *    being paid for nothing, and the reader sees the same thing twice with two
 *    different confidences attached.
 * 4. **Nothing the model says about size is believed.** Tokens are counted
 *    here, from the spans, with the same counter everything else uses.
 *
 * ## It never becomes a prerequisite
 *
 * The deterministic core keeps working with no key, no network and no model.
 * This is a pass *on top*, and the rule from 0.1.0 stands unchanged — which is
 * why the verification lives here, in the package that has no network, and the
 * call lives in the CLI.
 */

import { normalizeForCompare, jaccard } from './similarity.js';
import { estimateTokens } from './tokenizer.js';
import type { TokenCounter } from './types.js';

export type SemanticKind =
  /** Two spans teaching the same boundary in different words. */
  | 'paraphrase-pair'
  /** An instruction repeated in a distant part of the prompt. */
  | 'restated-instruction'
  /** A policy and a later clarification that disagree. */
  | 'contradiction';

/** What the model returns, before anything has been checked. */
export interface SemanticProposal {
  kind: SemanticKind;
  /** Two spans, quoted from the prompt. */
  spans: [string, string];
  /** One sentence saying what the relation is. Never used to decide anything. */
  because: string;
}

export type SemanticRejection =
  /** A span is not in the prompt. The model paraphrased its own evidence. */
  | 'span-not-found'
  /** The two spans are the same text. */
  | 'spans-identical'
  /** The two spans overlap in the prompt. */
  | 'spans-overlap'
  /** Near-identical: the deterministic detector already reports this for free. */
  | 'already-detected'
  /**
   * A contradiction whose spans are near-identical.
   *
   * Two spans that say the same thing cannot contradict each other, and a
   * model that labels a near-copy a contradiction has mislabelled it — which
   * makes every other label in the same response worth less.
   */
  | 'contradiction-of-a-copy'
  /** A duplicate of a finding already accepted. */
  | 'duplicate';

export interface SemanticFinding {
  kind: SemanticKind;
  spans: [string, string];
  because: string;
  /** Where each span sits, so a reader can go and look. */
  offsets: [number, number];
  /**
   * Tokens the shorter span holds — a **ceiling** on what resolving this could
   * save, and named as one.
   *
   * Not a saving. Resolving a paraphrase pair means rewriting both spans into
   * one, and how much that recovers depends on what the merged version says,
   * which nobody knows yet. The ceiling is the honest figure: it cannot save
   * more than deleting the smaller half.
   */
  ceilingTokens: number;
}

export interface SemanticResult {
  findings: SemanticFinding[];
  rejected: Array<{ proposal: SemanticProposal; reason: SemanticRejection }>;
}

/**
 * How similar two spans may be before the deterministic detector owns them.
 *
 * **0.92, read off `rules.ts` rather than chosen.** The duplicate-example rule
 * drops a few-shot example when its Jaccard similarity to a kept one is at
 * least 0.92, so that is exactly the line above which a model is being paid to
 * re-report something the rules engine produces for free.
 *
 * The first version of this file said 0.8 and claimed in a comment that it
 * matched the deterministic pass. It did not, and the error ran the dangerous
 * way: everything between 0.8 and 0.92 is a pair the rules engine does **not**
 * catch, and this layer was silently throwing those away — discarding exactly
 * the findings the chapter exists to surface, while a comment asserted the
 * opposite.
 */
export const ALREADY_DETECTED_SIMILARITY = 0.92;

export interface VerifyOptions {
  tokenCounter?: TokenCounter;
  /** Cap on findings, largest ceiling first. Defaults to 20. */
  max?: number;
}

export function verifySemanticProposals(
  prompt: string,
  proposals: readonly SemanticProposal[],
  options: VerifyOptions = {},
): SemanticResult {
  const { tokenCounter = estimateTokens, max = 20 } = options;
  const findings: SemanticFinding[] = [];
  const rejected: SemanticResult['rejected'] = [];
  const claimed: Array<[number, number]> = [];

  for (const proposal of proposals) {
    const [first, second] = proposal.spans;

    const a = prompt.indexOf(first);
    const b = prompt.indexOf(second);
    if (a === -1 || b === -1) {
      // The strongest check there is. A model that paraphrases what it quotes
      // has stopped reading the prompt and started writing about it.
      rejected.push({ proposal, reason: 'span-not-found' });
      continue;
    }
    if (first === second) {
      rejected.push({ proposal, reason: 'spans-identical' });
      continue;
    }
    const aEnd = a + first.length;
    const bEnd = b + second.length;
    if (a < bEnd && b < aEnd) {
      rejected.push({ proposal, reason: 'spans-overlap' });
      continue;
    }

    const similarity = jaccard(normalizeForCompare(first), normalizeForCompare(second));
    if (proposal.kind === 'contradiction' && similarity >= ALREADY_DETECTED_SIMILARITY) {
      rejected.push({ proposal, reason: 'contradiction-of-a-copy' });
      continue;
    }
    if (proposal.kind !== 'contradiction' && similarity >= ALREADY_DETECTED_SIMILARITY) {
      rejected.push({ proposal, reason: 'already-detected' });
      continue;
    }

    /**
     * A finding covering ground an accepted one already covers.
     *
     * Overlap against what has been *accepted*, not against every proposal —
     * so a rejected finding never blocks a good one that touches the same
     * paragraph.
     */
    const overlapsAccepted = claimed.some(
      ([start, end]) => (a < end && start < aEnd) || (b < end && start < bEnd),
    );
    if (overlapsAccepted) {
      rejected.push({ proposal, reason: 'duplicate' });
      continue;
    }

    claimed.push([a, aEnd], [b, bEnd]);
    findings.push({
      kind: proposal.kind,
      spans: proposal.spans,
      because: proposal.because,
      offsets: [a, b],
      // Counted here, from the spans. Nothing the model said about size is
      // believed, and a contradiction saves nothing by being resolved — the
      // point of finding one is that the prompt is wrong, not that it is long.
      ceilingTokens:
        proposal.kind === 'contradiction'
          ? 0
          : Math.min(tokenCounter(first), tokenCounter(second)),
    });
  }

  findings.sort((x, y) => y.ceilingTokens - x.ceilingTokens);
  return { findings: findings.slice(0, max), rejected };
}

/**
 * What running the pass costs, computed before it runs.
 *
 * A tool that spends somebody's money to tell them how to spend less must be
 * the first thing audited by its own arithmetic. The figure is an estimate of
 * one call — the prompt in, a small structured answer out — and it says which
 * half is which by having only one half.
 */
export function semanticPassCost(
  prompt: string,
  rates: { inputPerMTok: number; outputPerMTok: number },
  options: { tokenCounter?: TokenCounter; expectedOutputTokens?: number } = {},
): { inputTokens: number; outputTokens: number; usd: number; provenance: 'estimated' } {
  const { tokenCounter = estimateTokens, expectedOutputTokens = 800 } = options;
  const inputTokens = tokenCounter(prompt) + tokenCounter(SEMANTIC_SYSTEM_PROMPT);
  return {
    inputTokens,
    outputTokens: expectedOutputTokens,
    usd:
      (inputTokens / 1_000_000) * rates.inputPerMTok +
      (expectedOutputTokens / 1_000_000) * rates.outputPerMTok,
    provenance: 'estimated',
  };
}

export const SEMANTIC_SYSTEM_PROMPT = `You find places where a prompt says the same thing twice in different words, or contradicts itself.

Return ONLY a JSON array. Each element is {"kind": "...", "spans": ["...", "..."], "because": "..."}.

"kind" is one of:
- "paraphrase-pair": two passages teaching the same rule or boundary in different words.
- "restated-instruction": an instruction given once and then given again elsewhere.
- "contradiction": two passages that cannot both be followed.

Rules:
- Both strings in "spans" MUST be copied character for character from the prompt. Do not paraphrase them, do not fix their punctuation, do not trim them differently. If you cannot copy a passage exactly, leave the finding out.
- The two spans must be different passages in different places. Never quote the same passage twice.
- Do not report passages that are near-identical wordings of each other — those are already found without you. Report only pairs whose WORDS differ while their MEANING is the same.
- "because" is one sentence naming the relation, for a human to read.
- Prefer a few certain findings to many possible ones. Return [] if there is nothing you are sure of.

No explanation, no code fences, no commentary. The array alone.`;
