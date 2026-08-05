/**
 * Suggesting what somebody probably meant.
 *
 * Used for an unrecognised CLI flag and an unrecognised config key. Both are
 * the same failure: a name that looks right, is silently not the name the tool
 * reads, and leaves a limit unenforced while the author believes it is set.
 */

/**
 * Edit distance, with an early exit.
 *
 * Bounded by construction: the table is two rows of `b.length + 1`, and pairs
 * whose lengths differ by more than `MAX_DISTANCE` return immediately without
 * building anything. Only ever used to rank candidates, so a large distance
 * needs no precision — `SENTINEL` is simply "further than we care about".
 */
const MAX_DISTANCE = 3;
const SENTINEL = 99;

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_DISTANCE) return SENTINEL;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The closest candidate, or null when nothing is close enough to name.
 *
 * **The tolerance scales with the length of what was typed**, and that is the
 * whole reason this function exists rather than a fixed threshold. Three edits
 * is a plausible typo on `max-tokens` and a completely different word on
 * `llm` — which is how a fixed budget of three came to answer "did you mean
 * --help?" for `--llm`. A wrong guess is worse than no guess: it sends the
 * reader off to check something that was never the answer.
 */
export function nearestName(typed: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = editDistance(typed, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  const tolerance = Math.min(MAX_DISTANCE, Math.max(1, Math.floor(typed.length / 3)));
  return best !== null && bestDistance <= tolerance ? best : null;
}
