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

/**
 * Where the text after the money column starts, on every line of a block.
 *
 * **The first version of this compared the wrong thing and passed by luck.** It
 * took the `~ ` prefix off the first money line and asserted every transcript
 * line used the same one — but that space is *right-alignment padding*, not
 * format. A live run prints `~ $10.59`, `~  $8.82` and `~$0.5300` in the same
 * column, because `$0.5300` is two characters wider than `$8.82`. The guard
 * therefore agreed or disagreed depending on how wide this repository's own
 * figures happened to be, and it broke the day a config changed them.
 *
 * What the column actually promises is that **the text starts at the same offset
 * on every row, priced or not**, which is the thing a reader notices and the
 * thing a transcript can get wrong. That is measured here, on both sides.
 */
const textOffsets = (block) => {
  const offsets = [];
  for (const line of block.split('\n')) {
    // A priced row: indent, the tilde, alignment padding, the figure, the gap.
    const priced = /^(\s*~\s*\$[\d,.]+\s+)\S/.exec(line);
    if (priced) {
      offsets.push(priced[1].length);
      continue;
    }
    // An unpriced row in the same block: indent only, and it has to line up.
    const unpriced = /^(\s{6,})\S/.exec(line);
    if (unpriced) offsets.push(unpriced[1].length);
  }
  return offsets;
};

/** The block `doctor` really prints, so the shape is taken from the command. */
const realBlock = (() => {
  const start = real.indexOf('What it would be worth fixing');
  assert.ok(start >= 0, `doctor printed no advisory block to compare against:\n${real.slice(0, 400)}`);
  const rest = real.slice(start);
  const end = rest.indexOf('\n\n');
  return end === -1 ? rest : rest.slice(0, end);
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

  /** The transcript's own advisory block, bounded the same way the live one is. */
  const transcriptBlock = () => {
    const start = transcript.indexOf('What it would be worth fixing');
    assert.ok(start >= 0, 'the transcript has no advisory block');
    const rest = transcript.slice(start);
    const end = rest.indexOf('\n\n');
    return end === -1 ? rest : rest.slice(0, end);
  };

  it('starts the text at one offset, the way the command does', () => {
    /**
     * Both sides measured rather than one side described. The command's own
     * block is the yardstick; the transcript's figures are different and its
     * column must still be a column.
     */
    const live = new Set(textOffsets(realBlock));
    assert.equal(live.size, 1, `doctor's own column is ragged: ${[...live].join(', ')}`);

    const shown = textOffsets(transcriptBlock());
    assert.ok(shown.length >= 4, `the transcript has only ${shown.length} rows to compare`);
    const ragged = new Set(shown);
    assert.equal(
      ragged.size,
      1,
      `the transcript's column is ragged at offsets ${[...ragged].sort((a, b) => a - b).join(', ')} — `
        + 'the unpriced rows have to line up with the priced ones',
    );
    assert.equal(
      [...ragged][0],
      [...live][0],
      `doctor starts the text at column ${[...live][0]} and the transcript at ${[...ragged][0]}`,
    );
  });

  it('would notice a row that had drifted out of the column', () => {
    /**
     * The check above only ever sees a transcript that lines up, so on this
     * repository it cannot fail. Handed the shape it was written for — an
     * unpriced row one space short, which is exactly what the README carried
     * until this was measured — it must reject it.
     */
    const drifted = [
      '  ~ $53.77  Move the stable instructions ahead  1 prompt',
      '           Below the cacheable minimum  16 prompts',
    ].join('\n');
    assert.equal(new Set(textOffsets(drifted)).size, 2);
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
