/**
 * Per-rule change extraction.
 *
 * The report says a rule fired four times and saved nineteen tokens. That is
 * enough to trust the `safe` level and nowhere near enough to review the
 * `aggressive` one, where the honest advice has always been "read the diff" —
 * and the diff was one undifferentiated block for every rule at once.
 *
 * This turns each rule into its own short list of "this became that", so an
 * aggressive run can be judged rule by rule and a single bad rule disabled
 * with `--disable`, instead of the whole level.
 */

export interface RuleChange {
  /** The text the rule removed or replaced. */
  before: string;
  /** What it became. Empty when the text was simply deleted. */
  after: string;
}

/**
 * Longest run of text either side will be diffed word by word.
 *
 * Everything here runs on attacker-controlled input, so the cost has to be
 * bounded by construction rather than by hoping prompts are small. The common
 * prefix and suffix are trimmed first, which is linear and usually leaves very
 * little, but a rule that edits in a hundred scattered places leaves a middle
 * as long as the prompt. Past this size the extraction is skipped: a list of
 * changes that long is not something anyone reads anyway, and the hit count
 * already says how much happened.
 */
const MAX_DIFF_CHARS = 4000;

/** Changes reported per rule. The hit count carries the true total. */
export const DEFAULT_CHANGE_LIMIT = 5;

function splitWords(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Length of the common prefix, in characters. */
function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/** Length of the common suffix, in characters, not overlapping `start`. */
function commonSuffix(a: string, b: string, start: number): number {
  const max = Math.min(a.length, b.length) - start;
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** Walks a prefix length back to the start of the word it lands inside. */
function toWordStart(text: string, length: number): number {
  let i = length;
  while (i > 0 && !/\s/.test(text[i - 1]!)) i--;
  return i;
}

/**
 * Shrinks a suffix until it begins at a word boundary.
 *
 * Shrinking rather than growing is the whole point: the common suffix is only
 * common up to the length `commonSuffix` found, so extending it past that
 * would claim two different strings match. Pulling it back instead keeps the
 * guarantee and hands the partial word to the diff, where it belongs.
 */
function toWordEnd(before: string, length: number): number {
  let i = length;
  while (i > 0 && !/\s/.test(before[before.length - i]!)) i--;
  return i;
}

/**
 * Extracts what a rule changed, as a short list of before/after pairs.
 *
 * Returns an empty list rather than a partial one when the change is too large
 * to summarise usefully — an empty list reads as "nothing to show here", which
 * is honest, where a truncated one would read as "this is all that happened".
 */
export function extractChanges(
  before: string,
  after: string,
  limit: number = DEFAULT_CHANGE_LIMIT,
): RuleChange[] {
  if (before === after) return [];

  // Rules make local edits, so trimming the shared ends first usually leaves a
  // middle small enough to diff properly — and does it in linear time.
  //
  // The trim is by character but the diff is by word, so both boundaries are
  // pushed back out to whitespace. Without that the middle starts mid-word and
  // the change reads as gibberish: removing "quite" from "be quite accurate"
  // reported itself as `be quit → b`, which is accurate, useless, and worse
  // than showing nothing.
  const start = toWordStart(before, commonPrefix(before, after));
  const end = toWordEnd(before, commonSuffix(before, after, start));
  const beforeMiddle = before.slice(start, before.length - end);
  const afterMiddle = after.slice(start, after.length - end);

  if (beforeMiddle.length > MAX_DIFF_CHARS || afterMiddle.length > MAX_DIFF_CHARS) {
    return [];
  }

  const a = splitWords(beforeMiddle);
  const b = splitWords(afterMiddle);

  // Longest common subsequence over words, to align the two sides.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Int32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + (j + 1)]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + (j + 1)]!);
    }
  }

  const changes: RuleChange[] = [];
  let removed = '';
  let added = '';

  const flush = (): void => {
    if (!removed && !added) return;
    // Whitespace-only churn is not a change anyone needs to review; the
    // whitespace rule's hit count already reports it.
    if (removed.trim() || added.trim()) {
      changes.push({ before: removed.trim(), after: added.trim() });
    }
    removed = '';
    added = '';
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + (j + 1)]!) {
      removed += a[i++];
    } else {
      added += b[j++];
    }
  }
  while (i < a.length) removed += a[i++];
  while (j < b.length) added += b[j++];
  flush();

  return changes.slice(0, limit);
}
