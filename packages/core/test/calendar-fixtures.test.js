import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '../../..');

/**
 * A suite may not measure the calendar.
 *
 * ## What went wrong, and why the helper did not stop it
 *
 * `packages/cli/test/serve.test.js` builds its fixture on the first day of the
 * **current** UTC month, through a helper whose own docstring says why: a
 * fixture pinned to a literal date "would stop being measured the moment the
 * calendar moved past it — a test that passes for eleven months and then fails
 * for reasons nobody remembers".
 *
 * One assertion in that file then compared the window it got back against
 * `'2026-08-01T00:00:00.000Z'`, written out in full. It was correct in August
 * and it went red at midnight on the 1st of September, in CI, on a dependency
 * bump that had touched nothing near it. Nothing was wrong with the product.
 *
 * That is worse than having had no helper. A file carrying a helper *and* a
 * literal reads, to the next person, as a problem already dealt with — so the
 * literal is the one line nobody re-examines.
 *
 * ## The rule, and why it is this rule
 *
 * A file that builds an instant **relative to now** and also asserts an
 * **absolute instant** is making two claims about the same clock that cannot
 * both stay true. One of them moves each month and the other does not, and
 * which is which is not something a reader can see from the assertion.
 *
 * So: derived, not listed. Every test file in the repository is walked, the
 * two properties are read out of its source, and a file holding both fails
 * here with the literal quoted back. No file enumerates the offenders, because
 * a hand-written list of files that must not do a thing is the exact defect
 * this repository has now found in itself several times: nothing binds the
 * list to what it describes.
 *
 * ## What this does not claim, and the second failure it would not have caught
 *
 * A fixed date is fine on its own, and most of this repository's fixtures are
 * fixed dates — a pricing review, a release, a receipt whose span is the point.
 * Those files never ask what month it is, so they never disagree with the
 * clock. The failure needs both halves, and so does this guard.
 *
 * **The same midnight took a second test with it, and this rule reads that one
 * as clean.** `packages/mcp/test/position-tool.test.js` had every date fixed
 * in August and asserted `$40.00` on the month scope — no clock in its source
 * at all, because the clock is inside `positionReport`, which defaults to
 * `new Date()`. Source cannot see that, and a rule that tried would have to
 * know which exported functions read the clock, which is a hand-written list
 * and therefore the defect again.
 *
 * That file was fixed by making its fixture month-relative, which is what
 * brings it *into* this guard's reach: it reads the clock now, so the day
 * somebody writes an absolute instant back into it, this fails. The rule is
 * narrow on purpose — it has no false positives and it needs none — and the
 * gap is written here rather than left for the next September to demonstrate.
 */

/** Every `*.test.js` this repository ships, found rather than listed. */
function testFiles() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.test.js')) found.push(path);
    }
  };
  walk(ROOT);
  return found;
}

/**
 * The source with its comments removed.
 *
 * Without this the guard is defeated by its own bug report: the line that
 * explains the September failure quotes the literal it is about, and a scan
 * that could not tell prose from code would read the explanation as the
 * offence. It would also be defeated on purpose by anybody who moved a literal
 * into a comment, which is not a fix.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Does this file build an instant from the clock it is running on?
 *
 * `getUTCMonth` and `getUTCFullYear` are how a relative fixture is assembled
 * here — read off `new Date()` and fed back through `Date.UTC` — and either of
 * them is the tell. A file using neither cannot drift with the calendar,
 * whatever dates it holds.
 */
const readsTheClock = (source) => /getUTC(Month|FullYear)\s*\(/.test(source);

/** ISO-8601 instants written out in full, as they appear in an assertion. */
const absoluteInstants = (source) =>
  [...source.matchAll(/['"`](\d{4}-\d{2}-\d{2}T[\d:.]+Z?)['"`]/g)].map((match) => match[1]);

describe('a suite may not measure the calendar', () => {
  it('finds the test files to check, rather than being told them', () => {
    const files = testFiles();
    /*
      A floor rather than an exact count. The number moves with every release
      and an exact one would be a second thing to keep in step — but a walk
      that silently found nothing would make every assertion below pass, which
      is the failure mode of every derived guard and the one worth catching.
    */
    assert.ok(files.length >= 100, `only ${files.length} test files found; the walk is broken`);
    assert.ok(
      files.some((path) => path.endsWith(join('packages', 'cli', 'test', 'serve.test.js'))),
      'the walk no longer reaches the file this guard was written for',
    );
  });

  it('no file both reads the clock and asserts an absolute instant', () => {
    const offences = [];
    for (const path of testFiles()) {
      /*
        This file, and only this file, is exempt — because the two tests below
        prove the rule fires by *planting the violation in code*, which is the
        only way to know an empty result means "nothing offends" rather than
        "the regex stopped matching". A guard that skipped that proof would be
        the greener and more useless of the two.

        Exempt by resolving its own path rather than by an entry in a list.
        A hand-written list of exceptions is the defect this repository keeps
        finding in itself: nothing binds the list to what it names, and the
        second entry somebody adds is the one that hides a real offence.
      */
      if (path === SELF) continue;
      const source = withoutComments(readFileSync(path, 'utf8'));
      if (!readsTheClock(source)) continue;
      for (const instant of absoluteInstants(source)) {
        offences.push(`${relative(ROOT, path)} asserts ${instant} and also reads the clock`);
      }
    }
    assert.deepEqual(offences, []);
  });

  it('reads through a comment, so the bug report does not read as the bug', () => {
    /*
      Planted rather than asserted about in prose. Both halves are present in
      this string: it reads the clock and it quotes an instant — but only
      inside a comment, which is exactly the shape of the file that explains
      the September failure.
    */
    const source = [
      'const now = new Date().getUTCMonth();',
      "/* it once held '2026-08-01T00:00:00.000Z' and went red */",
      "// and '2027-01-01T00:00:00.000Z' too",
    ].join('\n');
    assert.ok(readsTheClock(source));
    assert.deepEqual(absoluteInstants(withoutComments(source)), []);
  });

  it('this check can fail: the violation it forbids is detected when planted', () => {
    const planted = [
      'const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);',
      "assert.equal(window, '2026-08-01T00:00:00.000Z');",
    ].join('\n');
    const source = withoutComments(planted);
    assert.ok(readsTheClock(source), 'the clock half of the rule stopped matching');
    assert.deepEqual(
      absoluteInstants(source),
      ['2026-08-01T00:00:00.000Z'],
      'the literal half of the rule stopped matching',
    );
  });
});
