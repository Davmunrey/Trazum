import { BACKWARD_REFERENCES } from './phrases.js';
import { segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { TokenCounter } from './types.js';

/**
 * Moving stable instructions in front of the first placeholder.
 *
 * This is the largest saving Trazum knows about and the only one it used to
 * report without acting on. Prompt caching is a byte-for-byte prefix match, so
 * everything after the first `{{placeholder}}` is re-read at full price on every
 * call. Measured on a 1,178-token support prompt: 14 tokens cacheable as written,
 * 1,174 after rearranging the *same content* — $227.65 a month at 50,000 calls.
 *
 * No rule can compete with that, because a rule deletes a few percent of tokens
 * while this changes the price of 98% of them.
 *
 * **It is also the most dangerous thing in this repository**, which is why it is
 * not a rule and not part of `aggressive`. Every other transformation removes
 * text whose absence is local. This one moves text, and order carries meaning:
 * "Summarise the text above" is correct where it sits and nonsense in front of
 * the text it points at. So the whole design here is about what to *refuse*.
 *
 * Three refusals, in order of how much they cost:
 *
 * 1. **A block containing a backward reference stays put** — and so does
 *    everything after it. Moving a later block past a pinned one changes their
 *    order relative to each other, which is the same class of harm.
 * 2. **Only whole blocks move.** Blocks are separated by blank lines, so a
 *    sentence is never severed from the paragraph that qualifies it.
 * 3. **Nothing moves if the prompt has no placeholder**, or if the resulting
 *    prefix would not clear the model's cacheable minimum anyway — a
 *    rearrangement that buys nothing is a diff for its own sake.
 */

export interface ReorderedBlock {
  text: string;
  tokens: number;
}

export interface DeclinedBlock {
  text: string;
  /**
   * Why it stayed. `backward-reference` names the phrase found; `after-pinned`
   * means an earlier block was pinned and moving this one would reorder the two.
   */
  reason: 'backward-reference' | 'after-pinned';
  /** The phrase that pinned it, for `backward-reference`. */
  phrase?: string;
}

export interface ReorderResult {
  /** The rearranged prompt, or the original when nothing could move. */
  text: string;
  /** Blocks moved ahead of the first placeholder, in their original order. */
  moved: ReorderedBlock[];
  /** Blocks left where they were, with the reason. */
  declined: DeclinedBlock[];
  /** Tokens that moved from unpriced-every-call into the cacheable prefix. */
  tokensMoved: number;
  /** Cacheable prefix before and after, so the gain is visible rather than claimed. */
  prefixTokensBefore: number;
  prefixTokensAfter: number;
}

/**
 * Finds the offset of the first template placeholder.
 *
 * Uses the same segmentation as everything else, so "placeholder" means exactly
 * what the protection pass means by it — there is no second definition to drift.
 */
function firstPlaceholderOffset(prompt: string): number | null {
  let offset = 0;
  for (const seg of segment(prompt)) {
    if (seg.kind === 'protected' && seg.protection === 'placeholder') return offset;
    offset += seg.text.length;
  }
  return null;
}

/** Blank-line separated blocks, with their original separators preserved. */
function toBlocks(text: string): string[] {
  // Splitting on a blank line and keeping the delimiter means rejoining cannot
  // silently normalise somebody's spacing.
  //
  // Written as a line scan rather than the `split(/(?<=\n)(?=\s*\n)/)` it
  // replaces. That regex reads better and is quadratic in the length of a run
  // of blank lines, because the lookahead re-consumes the whole run at every
  // position in it: 3.3 seconds on 60 KB of newlines, in a library reachable
  // over HTTP. Here every character is visited once.
  const blocks: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const nl = text.indexOf('\n', i);
    const end = nl === -1 ? text.length : nl + 1;
    // A blank line opens a block, and travels with the block it precedes.
    if (i > start && text.slice(i, end).trim() === '') {
      blocks.push(text.slice(start, i));
      start = i;
    }
    i = end;
  }
  if (start < text.length) blocks.push(text.slice(start));
  return blocks;
}

const hasPlaceholder = (text: string): boolean =>
  segment(text).some((s) => s.kind === 'protected' && s.protection === 'placeholder');

/**
 * The backward reference in a block, if any.
 *
 * Word-boundary matched so "aboveboard" does not pin a block, and lowercased on
 * both sides because a prompt written in title case is still a prompt.
 */
function backwardReference(text: string): string | undefined {
  const haystack = text.toLowerCase();
  for (const phrase of BACKWARD_REFERENCES) {
    const index = haystack.indexOf(phrase);
    if (index === -1) continue;
    const before = haystack[index - 1];
    const after = haystack[index + phrase.length];
    const boundary = (c: string | undefined): boolean => c === undefined || !/[\p{L}\p{N}]/u.test(c);
    if (boundary(before) && boundary(after)) return phrase;
  }
  return undefined;
}

export interface ReorderOptions {
  count?: TokenCounter;
  /**
   * Do not rearrange unless the prefix ends up at least this long. Defaults to
   * 0 — the caller knows the model's cacheable minimum and this module does not.
   *
   * The bar is on the **resulting prefix**, not on the amount moved. Those are
   * different questions, and asking the second one refuses a real saving: a
   * prompt whose head already clears the minimum gains from any block that joins
   * it, however small. Asking "did 200 tokens move?" answers "no" and reports
   * that nothing could move, which is not what happened.
   */
  minPrefixTokens?: number;
}

/**
 * Rearranges a prompt so its stable instructions sit in the cacheable prefix.
 *
 * Returns the original text unchanged when nothing can safely move, and always
 * reports what it declined and why — a saving Trazum silently chose not to take
 * is one the author cannot evaluate.
 */
export function reorderForCache(prompt: string, options: ReorderOptions = {}): ReorderResult {
  const count = options.count ?? estimateTokens;
  const minPrefixTokens = options.minPrefixTokens ?? 0;

  const unchanged = (): ReorderResult => {
    const prefix = firstPlaceholderOffset(prompt);
    const prefixTokens = prefix === null ? count(prompt) : count(prompt.slice(0, prefix));
    return {
      text: prompt,
      moved: [],
      declined: [],
      tokensMoved: 0,
      prefixTokensBefore: prefixTokens,
      prefixTokensAfter: prefixTokens,
    };
  };

  const offset = firstPlaceholderOffset(prompt);
  if (offset === null) return unchanged();

  // The placeholder's own line stays with the content after it: "Customer
  // message: {{message}}" is one unit, and splitting it would strand the label.
  const lineStart = prompt.lastIndexOf('\n', offset) + 1;
  const head = prompt.slice(0, lineStart);
  const rest = prompt.slice(lineStart);

  const blocks = toBlocks(rest);
  const prefixTokensBefore = count(head);

  const moved: ReorderedBlock[] = [];
  const declined: DeclinedBlock[] = [];
  const stay: string[] = [];
  let pinned = false;

  for (const [index, block] of blocks.entries()) {
    // The first block holds the placeholder itself; it can never move.
    if (index === 0 || hasPlaceholder(block)) {
      stay.push(block);
      continue;
    }
    if (pinned) {
      // Everything after a pinned block stays, because moving it would change
      // its order relative to the block that had to stay.
      stay.push(block);
      if (block.trim() !== '') declined.push({ text: block, reason: 'after-pinned' });
      continue;
    }

    const phrase = backwardReference(block);
    if (phrase !== undefined) {
      pinned = true;
      stay.push(block);
      declined.push({ text: block, reason: 'backward-reference', phrase });
      continue;
    }
    if (block.trim() === '') {
      stay.push(block);
      continue;
    }

    moved.push({ text: block, tokens: count(block) });
  }

  const tokensMoved = moved.reduce((sum, b) => sum + b.tokens, 0);
  // Against the prefix this would produce, not against the amount moved. A head
  // that already clears the minimum gains from any block that joins it.
  if (moved.length === 0 || prefixTokensBefore + tokensMoved < minPrefixTokens) {
    // Report the refusals even when nothing moved: "no saving here" and "there
    // was a saving and it was not safe to take" are different answers.
    return { ...unchanged(), declined };
  }

  // Normalise the seams rather than concatenating raw slices: a block carries the
  // blank line that preceded it, so joining head + block + rest naively leaves a
  // three-newline gap where two belong.
  //
  // In the author's own line ending, though. Rejoining a CRLF prompt with bare
  // newlines would rewrite every seam in a file nobody asked to reformat — and
  // where the whole point is a byte-for-byte cache prefix, a changed byte is a
  // changed price.
  const gap = prompt.includes('\r\n') ? '\r\n\r\n' : '\n\n';
  const movedText = moved
    // `^\s*\n+` drops the blank-line separator the block carries without taking
    // the first line's own indentation with it, which `trimStart` would. It is
    // anchored, so it is tried from one position and stays linear.
    .map((b) => b.text.replace(/^\s*\n+/, '').trimEnd())
    .join(gap);
  const before = head.trimEnd();
  const after = stay.join('').replace(/^\s*\n+/, '').trimEnd();
  // No leading gap when the placeholder was on the very first line: there is no
  // head for the moved blocks to sit after, and emitting one would open the
  // prompt with a blank line.
  const body = before === '' ? `${movedText}${gap}${after}` : `${before}${gap}${movedText}${gap}${after}`;
  // However the prompt ended, it still ends that way. A block carries the blank
  // line that followed it, so trimming the seams without restoring the original
  // ending either strands a newline at the end or drops the one that was there.
  // Collapsing runs of blank lines is the whitespace rule's job, not this one's.
  //
  // Via `trimEnd` rather than `/\s*$/`, which is quadratic on a prompt that
  // holds a long whitespace run and does not end in one: 31 seconds on 200 KB,
  // under the 400 KB the HTTP API accepts.
  const text = `${body}${prompt.slice(prompt.trimEnd().length)}`;

  return {
    text,
    moved,
    declined,
    tokensMoved,
    prefixTokensBefore,
    prefixTokensAfter: count(text.slice(0, firstPlaceholderOffset(text) ?? text.length)),
  };
}
