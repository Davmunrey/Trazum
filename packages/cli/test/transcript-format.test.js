import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * A transcript in the README is a claim about what the tool prints.
 *
 * `trazum doctor`'s transcript wrote its money column as `~$4,912`. The command
 * prints `~ $4,912` — tilde, space, dollar. The transcript was taken before the
 * column was spaced and never re-taken, so a page headed *"Real output,
 * transcribed"* had stopped being either.
 *
 * **Two surfaces, two formats, and a naive rule would have broken the correct
 * one.** `optimize`'s advisory suffix is `perMonthSuffix: (amount) => ` ~${amount}/month``
 * — no space, deliberately, because it trails a sentence rather than heading a
 * column. A guard banning `~$` across the documentation would have failed
 * `~$327.40/month` in two READMEs, which is exactly what the tool prints. The
 * subject here is the doctor transcript, not the character sequence.
 *
 * So the shape is taken from the command, on this repository, at test time.
 * The numbers differ — the transcript is from a sample project with sixteen
 * prompts — but the shape of the column is the same wherever it runs.
 */

describe("the doctor transcript matches what doctor prints", () => {
  const real = spawnSync(process.execPath, [CLI, 'doctor'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 60000,
  }).stdout;

  /** How the command really writes a money figure in that column. */
  const realPrefix = (() => {
    const line = real.split('\n').find((l) => /^\s+~\s*\$[\d,]/.test(l));
    assert.ok(line, `doctor printed no money column to compare against:\n${real.slice(0, 400)}`);
    return /^\s+(~\s*)\$/.exec(line)[1];
  })();

  const transcript = (() => {
    const readme = readFileSync(new URL('../../../README.md', import.meta.url).pathname, 'utf8');
    const section = sectionOf(readme, '### The whole workspace at once: `trazum doctor`');
    return section;
  })();

  it('found a transcript with a money column', () => {
    assert.match(transcript, /What it would be worth fixing/);
    assert.match(transcript, /~\s*\$[\d,]/);
  });

  it('writes the column the way the command writes it', () => {
    const wrong = transcript
      .split('\n')
      .filter((l) => /^\s+~\s*\$[\d,]/.test(l))
      .filter((l) => /^\s+(~\s*)\$/.exec(l)[1] !== realPrefix);
    assert.deepEqual(
      wrong,
      [],
      `doctor prints "${realPrefix}$" and the transcript writes something else:\n  ${wrong.join('\n  ')}`,
    );
  });

  it('leaves the sentence-trailing form alone, which is a different thing', () => {
    /**
     * `~$327.40/month` trails a sentence and has no space by design. Both
     * READMEs show it and both are right. Asserted here so a future tidy-up
     * that "makes the tildes consistent" fails instead of quietly making one
     * of the two surfaces wrong.
     */
    const source = readFileSync(
      new URL('../src/i18n/en.ts', import.meta.url).pathname,
      'utf8',
    );
    assert.match(source, /perMonthSuffix: \(amount\) => ` ~\$\{amount\}\/month`/);

    for (const page of ['README.md', 'packages/cli/README.md']) {
      const text = readFileSync(new URL(`../../../${page}`, import.meta.url).pathname, 'utf8');
      assert.match(
        text,
        /~\$[\d,.]+\/month/,
        `${page} no longer shows the sentence-trailing form the tool actually prints`,
      );
    }
  });
});
