/**
 * A small, bounded glob matcher.
 *
 * Trazum has zero runtime dependencies and that is a security property, not a
 * preference: a prompt optimiser reads your prompts, and every dependency is
 * someone else's code doing that too. So the config file's budget patterns are
 * matched here rather than by pulling in a glob library.
 *
 * **It is deliberately not a regex translation.** Turning `**` into
 * `(?:[^/]*\/)*` produces exactly the nested-quantifier shape that makes a
 * pattern take exponential time on the wrong input, and these patterns come
 * from a file in a repository — which on a pull request means from whoever
 * opened it. A segment-wise dynamic program has no such shape: it is O(pattern
 * segments x path segments), and each segment match is O(pattern chars x path
 * chars) with no backtracking beyond a single remembered star.
 *
 * Supported, and nothing else:
 *   `*`   any run of characters within one path segment
 *   `**`  any number of whole path segments, including none
 *   `?`   exactly one character within one path segment
 */

/**
 * Longest pattern and path this will consider.
 *
 * The matcher is quadratic in both, so a pattern nobody would write by hand is
 * declined rather than allowed to spend the CI runner's afternoon. Both limits
 * are far above any real prompt path.
 */
const MAX_PATTERN_LENGTH = 1024;
const MAX_PATH_LENGTH = 4096;

/** Normalises separators and strips the noise a hand-written path collects. */
function toSegments(value: string): string[] {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
}

/**
 * Matches one path segment against one pattern segment (`*` and `?` only).
 *
 * Linear-with-backtracking over a single remembered star, which is the classic
 * bounded algorithm: on a mismatch it retreats to the last star and advances
 * the input by one, so the work is O(pattern x input) and never exponential.
 */
function matchSegment(pattern: string, value: string): boolean {
  let p = 0;
  let v = 0;
  let star = -1;
  let mark = 0;

  while (v < value.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === value[v])) {
      p++;
      v++;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++;
      mark = v;
    } else if (star >= 0) {
      p = star + 1;
      v = ++mark;
    } else {
      return false;
    }
  }

  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

/**
 * True when `path` matches `pattern`.
 *
 * Both sides are treated as relative paths with `/` separators; a leading `./`
 * and duplicate separators are ignored, and backslashes are read as separators
 * so a Windows-shaped path still matches a pattern written with slashes.
 */
export function matchGlob(pattern: string, path: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH || path.length > MAX_PATH_LENGTH) return false;

  const p = toSegments(pattern);
  const s = toSegments(path);

  // reachable[j] === true means "the first j pattern segments can consume the
  // path segments seen so far". Walking the path once and updating this row is
  // the whole algorithm; `**` is the only segment that can stay put.
  let reachable = new Array<boolean>(p.length + 1).fill(false);
  reachable[0] = true;
  // Leading `**` segments match nothing at all, so they are reachable up front.
  for (let j = 0; j < p.length && p[j] === '**'; j++) reachable[j + 1] = true;

  for (const segment of s) {
    const next = new Array<boolean>(p.length + 1).fill(false);
    for (let j = 0; j < p.length; j++) {
      if (!reachable[j] && !(p[j] === '**' && next[j])) continue;
      if (p[j] === '**') {
        // Consume this segment and stay on the same `**`, or step past it.
        next[j] = true;
        next[j + 1] = true;
      } else if (matchSegment(p[j]!, segment)) {
        next[j + 1] = true;
      }
    }
    // A `**` that has just been stepped past may be followed by another one,
    // which can also match nothing. Propagate that before moving on.
    for (let j = 0; j < p.length; j++) {
      if (next[j] && p[j] === '**') next[j + 1] = true;
    }
    reachable = next;
  }

  return reachable[p.length] === true;
}

/**
 * How specific a pattern is, for deciding which of two matching patterns wins.
 *
 * "Most specific" needs a definition that is stated rather than felt, because
 * a budget silently resolved from the wrong pattern is a budget nobody can
 * debug. The rule: **more literal characters wins**, and a longer pattern
 * breaks a tie. So `prompts/system.txt` beats `prompts/*.txt`, which beats
 * `prompts/**`, which beats `**`.
 */
export function specificity(pattern: string): number {
  const literals = pattern.replace(/[*?]/g, '').length;
  return literals * 1000 + pattern.length;
}

/**
 * The most specific pattern in `patterns` that matches `path`, or null.
 *
 * Ties on specificity are broken by lexical order rather than by insertion
 * order: object key order is easy to reorder by accident, and a budget that
 * changes because two keys swapped places is the kind of bug that gets blamed
 * on the tool.
 */
export function mostSpecificMatch(
  patterns: readonly string[],
  path: string,
): string | null {
  let best: string | null = null;
  let bestScore = -1;

  for (const pattern of patterns) {
    if (!matchGlob(pattern, path)) continue;
    const score = specificity(pattern);
    if (score > bestScore || (score === bestScore && best !== null && pattern < best)) {
      best = pattern;
      bestScore = score;
    }
  }

  return best;
}
