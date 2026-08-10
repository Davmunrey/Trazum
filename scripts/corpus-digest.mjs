import { createHash } from 'node:crypto';

/**
 * The digest that ties a set of measurements to the text they measured.
 *
 * **One implementation, imported by both sides, because two agreeing by
 * inspection is exactly what failed here.** `measure-token-band.mjs` joined the
 * corpus with NUL separators and `token-band.test.js` joined it with spaces, so
 * the two digests could never match. The first real measurement would have
 * failed its freshness check with *"the corpus changed since it was measured —
 * re-run scripts/measure-token-band.mjs"*: advice that produces the same
 * failure however many times it is followed.
 *
 * Nobody found out, because running it needs a key nobody had spent. The one
 * workflow that discharges this project's central claim had never been executed
 * end to end, and the check guarding it was broken in a way that surfaces only
 * at the moment it first matters.
 *
 * NUL is the separator: the one byte that cannot appear in a file name and will
 * not appear in a text corpus, so no two files can be rearranged into the same
 * digest.
 */
export function digestOf(entries) {
  const hash = createHash('sha256');
  // Written as an escape and never as a typed byte. A raw control character in
  // a source file is how this repository once shipped three commits with no
  // reviewable diff, one of them a security fix — and it has now happened a
  // fourth time, in this very file, on the first attempt at writing this line.
  for (const [name, text] of entries) hash.update(name + '\0' + text + '\0');
  return hash.digest('hex').slice(0, 16);
}
