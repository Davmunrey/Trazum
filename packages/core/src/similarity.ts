/**
 * Text-similarity helpers shared by the duplicate rules and the structural
 * analysis.
 *
 * Both need to answer "are these two chunks saying the same thing?", and both
 * need to answer it the same way — a rule that removes a near-duplicate and an
 * advisory that reports one should never disagree about what "near" means.
 */

/** Normalises a line or paragraph for duplicate comparison. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Jaccard similarity over word sets. */
export function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
