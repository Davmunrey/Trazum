import { getMessages } from './i18n/index.js';
import type { Locale } from './i18n/types.js';
import { segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { LlmProvider, TokenCounter } from './types.js';

/**
 * Rewrites the rules cannot do, proposed one phrase at a time.
 *
 * The existing LLM pass (`refineWithLlm`) hands the model the whole prompt and
 * takes the whole answer back, which makes it all-or-nothing: when the result
 * fails a safety check the author gets *nothing*, and when it passes they get a
 * wholesale rewrite they have to read end to end to trust. Both halves of that
 * are worse than they need to be.
 *
 * This asks a different question. "Which exact phrases in this prompt say
 * something in more words than they need to?" — and the answer is a list of
 * `before → after` pairs, each one small enough to judge on sight:
 *
 *     You should always make sure to  →  Always
 *     It is important to note that    →  (removed)
 *
 * Nothing is applied unless the caller asks. Eight surviving suggestions out of
 * ten is a useful result; a wholesale rewrite that fails one check is not.
 *
 * ## What makes a suggestion survive
 *
 * The model is a source of proposals, not of truth, so every one is checked
 * against the prompt before it is shown:
 *
 * 1. **`before` must appear in the prompt, byte for byte.** A model that
 *    paraphrases what it is quoting has invented a suggestion about text that
 *    does not exist, and applying it would do nothing or, worse, match
 *    something else.
 * 2. **It must not touch protected content.** Code, URLs, placeholders and XML
 *    tags are copied verbatim by every other part of this project, and a
 *    suggestion that edits one is refused rather than negotiated.
 * 3. **`after` must not introduce protected content.** A replacement that adds
 *    a `{{placeholder}}` or a URL is proposing new semantics, not shorter
 *    phrasing.
 * 4. **It must actually save tokens.** A rephrasing that costs the same is a
 *    change of style, and this tool is not a style guide.
 * 5. **Overlapping suggestions are dropped, later ones first.** Applying two
 *    edits that share characters produces text neither of them described.
 */

export interface RewriteSuggestion {
  /** The exact text in the prompt, as it appears there. */
  before: string;
  /** What to put in its place. Empty means "delete this". */
  after: string;
  /** Character offsets in the prompt, one per surviving occurrence. */
  offsets: number[];
  /** Tokens saved if every occurrence is applied. */
  tokensSaved: number;
}

export interface SuggestResult {
  suggestions: RewriteSuggestion[];
  /** Suggestions the model returned that did not survive, with the reason. */
  rejected: Array<{ before: string; after: string; reason: RejectedReason }>;
  provider: string;
  model: string;
}

export type RejectedReason =
  /** `before` is not in the prompt. The model paraphrased what it quoted. */
  | 'not-found'
  /** It would edit a code block, URL, placeholder or tag. */
  | 'touches-protected'
  /** `after` introduces protected content that was not there. */
  | 'introduces-protected'
  /** No shorter than what it replaces. */
  | 'no-saving'
  /** It shares characters with a suggestion already accepted. */
  | 'overlaps';

export const SUGGEST_SYSTEM_PROMPT = `You find phrases in a prompt that say something in more words than they need.

Return ONLY a JSON array. Each element is {"before": "...", "after": "..."}.

Rules:
- "before" MUST be copied character for character from the prompt. Do not paraphrase it, do not fix its punctuation, do not change its capitalisation. If you cannot copy it exactly, leave it out.
- "after" says the same thing in fewer words. Use "" to delete the phrase entirely.
- Preserve meaning exactly. Never change what the prompt asks for, its constraints, its output format or its success criteria.
- Never touch code, URLs, template placeholders ({{x}}, \${x}, {x}) or XML/HTML tags — do not include them in "before" at all.
- Keep the original language of the prompt.
- Prefer a few high-value rewrites to many trivial ones. Return [] if there is nothing worth changing.

No explanation, no code fences, no commentary. The array alone.`;

export interface SuggestOptions {
  tokenCounter?: TokenCounter;
  locale?: Locale;
  /** Cap on how many survive, highest saving first. Defaults to 20. */
  max?: number;
}

/** Strips a code fence if the model wrapped its JSON despite being told not to. */
function unwrap(text: string): string {
  const trimmed = text.trim();
  const fenced = /^(?:```|~~~)[a-zA-Z]*\n([\s\S]*?)\n?(?:```|~~~)$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

/**
 * Character ranges that must not be edited.
 *
 * `segment` returns the pieces in order without offsets, so they are
 * accumulated here rather than recomputed per suggestion.
 */
function protectedRanges(prompt: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let at = 0;
  for (const piece of segment(prompt)) {
    if (piece.kind === 'protected') ranges.push([at, at + piece.text.length]);
    at += piece.text.length;
  }
  return ranges;
}

const overlaps = (a: [number, number], b: [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

/** Every offset at which `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number[] {
  if (needle === '') return [];
  const found: number[] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

/**
 * Asks the provider for rewrites and returns the ones that survive checking.
 *
 * A provider that returns something unparseable yields an empty result rather
 * than throwing: the deterministic rules have already run, and a malformed
 * answer from an optional pass should cost the caller nothing.
 */
export async function suggestRewrites(
  prompt: string,
  provider: LlmProvider,
  options: SuggestOptions = {},
): Promise<SuggestResult> {
  const count = options.tokenCounter ?? estimateTokens;
  const max = options.max ?? 20;

  const raw = await provider.complete({ system: SUGGEST_SYSTEM_PROMPT, user: prompt });

  let proposed: Array<{ before?: unknown; after?: unknown }>;
  try {
    const parsed: unknown = JSON.parse(unwrap(raw));
    proposed = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { suggestions: [], rejected: [], provider: provider.name, model: provider.model };
  }

  const guarded = protectedRanges(prompt);
  const suggestions: RewriteSuggestion[] = [];
  const rejected: SuggestResult['rejected'] = [];
  const taken: Array<[number, number]> = [];

  for (const item of proposed) {
    if (typeof item?.before !== 'string' || typeof item?.after !== 'string') continue;
    const before = item.before;
    const after = item.after;
    if (before.trim() === '') continue;

    const reject = (reason: RejectedReason) => rejected.push({ before, after, reason });

    const at = occurrences(prompt, before);
    if (at.length === 0) {
      reject('not-found');
      continue;
    }

    // Occurrences that sit clear of protected content. A phrase that appears
    // three times, once inside a code block, is still worth rewriting in the
    // other two — refusing the whole suggestion would be the easier answer and
    // the wrong one.
    const usable = at.filter(
      (start) => !guarded.some((range) => overlaps([start, start + before.length], range)),
    );
    if (usable.length === 0) {
      reject('touches-protected');
      continue;
    }

    // The replacement must not bring protected content in with it.
    if (after !== '' && segment(after).some((piece) => piece.kind === 'protected')) {
      reject('introduces-protected');
      continue;
    }

    const saved = (count(before) - count(after)) * usable.length;
    if (saved <= 0) {
      reject('no-saving');
      continue;
    }

    const free = usable.filter(
      (start) => !taken.some((range) => overlaps([start, start + before.length], range)),
    );
    if (free.length === 0) {
      reject('overlaps');
      continue;
    }

    for (const start of free) taken.push([start, start + before.length]);
    suggestions.push({
      before,
      after,
      offsets: free,
      tokensSaved: (count(before) - count(after)) * free.length,
    });
  }

  suggestions.sort((a, b) => b.tokensSaved - a.tokensSaved);
  return {
    suggestions: suggestions.slice(0, max),
    rejected,
    provider: provider.name,
    model: provider.model,
  };
}

/**
 * Applies suggestions to the prompt.
 *
 * Right to left, so an earlier edit cannot move the offsets of a later one —
 * the bug that makes every naive implementation of this corrupt long prompts,
 * and one that shows up only when two suggestions are far enough apart that a
 * short test never notices.
 */
export function applyRewrites(prompt: string, suggestions: readonly RewriteSuggestion[]): string {
  const edits = suggestions
    .flatMap((s) => s.offsets.map((start) => ({ start, end: start + s.before.length, after: s.after })))
    .sort((a, b) => b.start - a.start);

  let text = prompt;
  for (const edit of edits) {
    text = text.slice(0, edit.start) + edit.after + text.slice(edit.end);
  }
  return text;
}

/** A reason code turned into a sentence, for a report. */
export function rejectionText(reason: RejectedReason, locale: Locale): string {
  return getMessages(locale).suggest[reason]();
}
