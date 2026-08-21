import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { formatUsd } from '@trazum/core';
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

describe('every money figure in a transcript is spelled the way the tool spells it', () => {
  /**
   * The other half of the same defect, found by running the README rather than
   * reading it.
   *
   * `profile`'s conversation-shape line wrote a median of `$0.02`. It
   * interpolates `formatUsd(shape.medianUsd)`, and `formatUsd` gives four
   * decimals under a dollar and five under a cent — precisely so a figure that
   * rounds to nothing at two decimals does not print as `$0.00` beside a
   * column of real money. `$0.02` is a string the tool cannot produce, so a
   * reader checking the page against their own run finds a number that never
   * appears.
   *
   * The rule is taken from `formatUsd` itself, never from a list of formats
   * typed beside it: whatever that function decides today is what a transcript
   * must say. Prose is left alone — only fenced blocks, which are the pages'
   * claim to be transcripts.
   */
  const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');

  /** Every dollar amount inside a fenced block, with its line number. */
  const amountsInBlocks = (page) => {
    const out = [];
    let inside = false;
    page.split('\n').forEach((line, index) => {
      if (line.startsWith('```')) {
        inside = !inside;
        return;
      }
      if (!inside) return;
      for (const match of line.matchAll(/\$(\d[\d,]*)(?:\.(\d+))?/g)) {
        out.push({ line: index + 1, text: match[0], whole: match[1], decimals: match[2] ?? '' });
      }
    });
    return out;
  };

  /** What `formatUsd` would print for the same value. */
  const canonical = (found) => formatUsd(Number(`${found.whole.replaceAll(',', '')}.${found.decimals || 0}`));

  it('reads amounts out of fenced blocks and not out of the prose around them', () => {
    // Otherwise the guard silently checks nothing, or checks the whole page and
    // fails every sentence that mentions a round number of dollars.
    const sample = ['a sentence saying $1.5 million', '```', '  saved $9.00', '```', 'and $2 more'];
    assert.deepEqual(
      amountsInBlocks(sample.join('\n')).map((a) => a.text),
      ['$9.00'],
    );
  });

  it('refuses the spellings formatUsd cannot produce', () => {
    // Prove it by breaking it. Each of these was, or could be, in a transcript.
    for (const bad of ['$0.02', '$0.5', '$1.234', '$1,138.50']) {
      const [found] = amountsInBlocks(['```', `  ${bad}`, '```'].join('\n'));
      assert.notEqual(found.text, canonical(found), `the guard accepts ${bad}, which the tool never prints`);
    }
  });

  it('and accepts the ones it does', () => {
    for (const good of ['$0.00123', '$0.0200', '$9.00', '$189.75', '$46.10', '$5,000']) {
      const [found] = amountsInBlocks(['```', `  ${good}`, '```'].join('\n'));
      assert.equal(found.text, canonical(found), `the guard refuses ${good}, which the tool does print`);
    }
  });

  it('every amount in every README transcript', () => {
    const wrong = amountsInBlocks(readme)
      .filter((found) => found.text !== canonical(found))
      .map((found) => `README.md:${found.line} says ${found.text}, formatUsd prints ${canonical(found)}`);
    assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}\n`);
  });
});
