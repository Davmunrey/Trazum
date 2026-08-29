import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * A comment that names a guard has to name one that exists.
 *
 * This repository cross-references its own tests constantly, and the reference
 * is load-bearing prose: *"`security.test.js` permits `fetch` only in the two
 * modules that exist to make calls"* is how a reader learns the rule is held
 * rather than intended. A reference to a file that is not there is worse than
 * no reference — it reports a guard where there is none, and the reader stops
 * looking.
 *
 * **Four were wrong when this was written, and each was a different fault.**
 * `extension.ts` and `reading.test.js` both pointed at `shim.test.js`, and
 * `vscode.d.ts` at `contract.test.js`: files promised in a shipped release and
 * never written, so the extension's wire had no behavioural test at all and the
 * comments said otherwise. `memory.ts` pointed at a postgres suite under a
 * name it does not have, a rename that took the file and left the sentence. And
 * `draw-icon.mjs` pointed at an icon suite that has never existed under any
 * name, for a claim (*"the palette is the product's own, taken from
 * `docs/assets/demo.svg`"*) that turned out to be two thirds true: the guard
 * that was supposed to hold it held a hardcoded copy of the colours instead,
 * and the third colour was in no other surface of the product.
 *
 * That is the shape of this fault. It is never only a broken link; it is a
 * claim nobody could check, standing where a check was supposed to be.
 *
 * **Bounded to the bare basename in backticks**, which is how these references
 * are actually written. The path-qualified form is deliberately out of scope:
 * `doctrine-ledger.test.js` builds fixture markdown containing
 * `packages/core/test/one.test.js`, a path that must *not* exist for that test
 * to mean anything, and a scan that could not tell a fixture from a claim would
 * either fail on it or need an exemption — and an exemption list is how a guard
 * starts describing itself instead of the tree.
 *
 * **This file names none of those dead references in backticks**, and neither
 * does its plant. The backticked form is exactly what it forbids, so writing
 * one here would fail the scan — the first version of this file did, on its own
 * comment. A guard that has to exempt itself is a guard with a hole shaped like
 * itself; describing the names instead costs a sentence and leaves none.
 */

const repoRoot = new URL('../../../', import.meta.url).pathname;

/** Directories with nothing of this repository's own prose in them. */
const SKIP = new Set(['node_modules', 'dist', '.next', 'coverage', 'out']);

/** Where prose lives: source, tests and documents. */
const READ = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md']);

const everyFile = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    /*
      Dotted directories are skipped whole. `.agents` and `.claude` carry
      vendored skills this repository does not write and must not edit, and a
      guard that failed on somebody else's cross-reference would be unfixable
      here — the same convention `derived-counts.test.js` uses.
    */
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...everyFile(path));
    else found.push(path);
  }
  return found;
};

const files = everyFile(repoRoot);

/** Every test file in the tree, by basename — the form the references use. */
const guards = new Set(
  files.map((path) => basename(path)).filter((name) => /\.test\.(?:js|mjs|ts)$/.test(name)),
);

describe('a comment that names a guard names one that exists', () => {
  it('found the tree it is about to check', () => {
    /*
      Both halves, because either one being empty passes every assertion below.
      A walk that returned nothing would find no references to check, and a walk
      that found references but no tests would fail on all of them.
    */
    assert.ok(files.length > 500, `only ${files.length} files walked — has the layout moved?`);
    assert.ok(guards.size > 200, `only ${guards.size} test files found — is the walk skipping them?`);
  });

  it('and every reference in the repository lands on one', () => {
    const dangling = [];
    for (const path of files) {
      if (!READ.has(extname(path))) continue;
      const source = readFileSync(path, 'utf8');
      for (const [, named] of source.matchAll(/`([a-zA-Z0-9._-]+\.test\.(?:js|mjs|ts))`/g)) {
        if (!guards.has(named)) dangling.push(`${relative(repoRoot, path)} names ${named}`);
      }
    }
    assert.deepEqual(
      dangling,
      [],
      `a comment promises a guard that is not in the tree:\n  ${dangling.join('\n  ')}`,
    );
  });

  it('would notice a name that is not a file, which is the whole point', () => {
    /*
      The detector, run against the text it is meant to catch. Assembled from
      pieces rather than written out, because a backtick around a name in this
      file is the violation — see above.
    */
    const tick = String.fromCharCode(96);
    const absent = 'a-guard-no-one-wrote.test.js';
    const planted = `held by ${tick}${absent}${tick} and nothing else`;
    const found = [...planted.matchAll(/`([a-zA-Z0-9._-]+\.test\.(?:js|mjs|ts))`/g)].map(([, name]) => name);
    assert.deepEqual(found, [absent], 'the detector cannot see the thing it forbids');
    assert.ok(!guards.has(absent), 'the planted name is a real file — pick another');
  });
});
