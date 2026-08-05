import { findExamples } from './structure.js';
import { estimateTokens } from './tokenizer.js';
import type { LlmProvider, TokenCounter } from './types.js';

/**
 * Semantic review of few-shot examples.
 *
 * The deterministic detector in `structure.ts` finds near-copies and stops
 * there, on purpose: a paraphrase — the same lesson in different words —
 * scores around 0.54 on word overlap, close enough to two genuinely distinct
 * examples (~0.20) that catching it would mean flagging examples that teach
 * different things.
 *
 * Deciding that "arrived quickly" and "arrived fast" demonstrate the same
 * pattern needs a model. So this lives behind the optional LLM layer, costs a
 * call, and is never on the path of an ordinary `optimize()`.
 *
 * It only ever reports. Nothing here edits a prompt, which is what lets it be
 * relaxed about a model that answers badly: the worst outcome is a suggestion
 * you ignore.
 */

export const EXAMPLE_REVIEW_SYSTEM_PROMPT = `You judge whether few-shot examples in a prompt teach the same thing.

You are given numbered examples. Group together any that demonstrate the same pattern — the same kind of input mapping to the same kind of output — even when they are worded completely differently. Examples that differ only in surface detail (names, numbers, dates) teach the same thing.

Do NOT group examples that look similar but demonstrate different behaviour, and do NOT group an example that exists to show a boundary or edge case. When in doubt, leave an example on its own: a false grouping costs the reader more than a missed one.

Return ONLY a JSON array, no prose and no code fences. Each element is a group of two or more examples that teach the same thing:

[{"keep": 0, "redundant": [2], "reason": "both classify a missing delivery as shipping"}]

"keep" is the example worth keeping (usually the earliest), "redundant" lists the others, and "reason" is one short clause. Return [] when every example teaches something distinct.`;

export interface ExampleRedundancy {
  /** Index of the example worth keeping. */
  keep: number;
  /** Indices the model considers redundant with it. */
  redundant: number[];
  /** The model's one-clause justification, for the reader to judge. */
  reason: string;
  /** Tokens held by the redundant examples. */
  tokens: number;
}

export interface ExampleReview {
  provider: string;
  model: string;
  /** Examples found in the prompt, in order. */
  exampleCount: number;
  groups: ExampleRedundancy[];
  /** Tokens across every example marked redundant. */
  redundantTokens: number;
  /** Set when the model answered but nothing usable came back. */
  unusableResponse?: string;
}

export interface ReviewExamplesOptions {
  tokenCounter?: TokenCounter;
}

/** Pulls the first JSON array out of a response, fences and prose included. */
function extractJsonArray(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /^(?:```|~~~)[a-zA-Z]*\n([\s\S]*?)\n?(?:```|~~~)$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;

  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validates one group against the examples that actually exist.
 *
 * Everything the model returns is treated as a suggestion from an untrusted
 * source: indices are range-checked, self-references dropped, duplicates
 * collapsed, and the reason truncated. A model that answers with nonsense
 * produces an empty review, not a crash and not a bogus saving.
 */
function parseGroup(value: unknown, exampleCount: number): Omit<ExampleRedundancy, 'tokens'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const keep = record.keep;
  if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 0 || keep >= exampleCount) {
    return null;
  }

  const rawRedundant = Array.isArray(record.redundant) ? record.redundant : [];
  const redundant = [
    ...new Set(
      rawRedundant.filter(
        (index): index is number =>
          typeof index === 'number' &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < exampleCount &&
          index !== keep,
      ),
    ),
  ].sort((a, b) => a - b);

  if (redundant.length === 0) return null;

  const reason = typeof record.reason === 'string' ? record.reason.trim().slice(0, 160) : '';
  return { keep, redundant, reason };
}

/**
 * Asks the configured model which examples teach the same thing.
 *
 * Returns `null` when there is nothing to review — fewer than two examples —
 * so the caller can skip the call rather than pay for a certain answer.
 *
 * Never throws on a bad answer. A provider that errors will still throw,
 * because that is a configuration problem the caller should see.
 */
export async function reviewExamples(
  prompt: string,
  provider: LlmProvider,
  options: ReviewExamplesOptions = {},
): Promise<ExampleReview | null> {
  const count = options.tokenCounter ?? estimateTokens;
  const examples = findExamples(prompt, count);
  if (examples.length < 2) return null;

  const numbered = examples
    .map((example, index) => `--- Example ${index} ---\n${example.text}`)
    .join('\n\n');

  const raw = await provider.complete({
    system: EXAMPLE_REVIEW_SYSTEM_PROMPT,
    user: numbered,
  });

  const base = {
    provider: provider.name,
    model: provider.model,
    exampleCount: examples.length,
  };

  const parsed = extractJsonArray(raw);
  if (!Array.isArray(parsed)) {
    return { ...base, groups: [], redundantTokens: 0, unusableResponse: raw.trim().slice(0, 200) };
  }

  // An example can only be claimed once. Without this a model that returns
  // overlapping groups would have the same tokens counted twice, and the
  // saving would read higher than the prompt could possibly deliver.
  const claimed = new Set<number>();
  const groups: ExampleRedundancy[] = [];

  for (const entry of parsed) {
    const group = parseGroup(entry, examples.length);
    if (!group) continue;

    const fresh = group.redundant.filter((index) => !claimed.has(index) && index !== group.keep);
    if (fresh.length === 0) continue;
    fresh.forEach((index) => claimed.add(index));

    groups.push({
      ...group,
      redundant: fresh,
      tokens: fresh.reduce((sum, index) => sum + examples[index]!.tokens, 0),
    });
  }

  return {
    ...base,
    groups,
    redundantTokens: groups.reduce((sum, group) => sum + group.tokens, 0),
  };
}
