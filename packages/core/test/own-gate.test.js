import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { estimateTokens } from '../dist/index.js';

/**
 * This repository takes its own gate.
 *
 * `trazum init`, `trazum.config.json` and `trazum baseline` have shipped for
 * arcs, and until now the repository that ships them had **no config and no
 * baseline of its own**. The loop this product sells was complete and inert
 * here, which is the same sentence the 1.41–1.50 arc was written to fix in
 * somebody else's repository.
 *
 * The config and the baseline are committed now and CI runs the gate. These
 * guards are what stop that quietly becoming decoration: a baseline that has
 * drifted from the tree, or a workflow step somebody dropped, both leave a green
 * build that is checking nothing.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8');

const config = () => JSON.parse(read('trazum.config.json'));
const baseline = () => JSON.parse(read('trazum.baseline.json'));

describe('the repository configures itself', () => {
  it('has a config, which it had not for the first fifty-nine minors', () => {
    const parsed = config();
    assert.equal(parsed.usage.model, 'claude-opus-5');
    assert.deepEqual(parsed.extensions, ['.txt']);
  });

  it('declares a baseline block, without which the gate is a silent no-op', () => {
    /**
     * Found by running it: `check --baseline` against a config with no
     * `baseline` block prints nothing and exits 0. The flag is read as
     * `config.baseline !== undefined && boolFlag(...)`, so the absent block
     * disables the gate rather than failing the run — a gate that quietly stops
     * guarding, which is the thing the doctrine names.
     */
    const parsed = config();
    assert.ok(parsed.baseline, 'no baseline block: the gate would pass while checking nothing');
    assert.equal(parsed.baseline.path, 'trazum.baseline.json');
    assert.ok(parsed.baseline.maxGrowthTokens > 0, 'a threshold of zero would gate on nothing');
  });
});

describe('the baseline still describes the tree', () => {
  it('records every prompt the config scopes, and no phantom', () => {
    const recorded = Object.keys(baseline().files).sort();
    assert.deepEqual(recorded, [
      'examples/sample-prompt.en.txt',
      'examples/sample-prompt.es.txt',
    ]);
  });

  it('records the count each file actually has', () => {
    const wrong = [];
    for (const [path, tokens] of Object.entries(baseline().files)) {
      const actual = estimateTokens(read(path));
      if (actual !== tokens) wrong.push(`${path}: baseline ${tokens}, tree ${actual}`);
    }
    assert.deepEqual(
      wrong,
      [],
      `the committed baseline no longer describes the tree — re-record it:\n  ${wrong.join('\n  ')}`,
    );
  });

  it('totals what the entries add up to', () => {
    const sum = Object.values(baseline().files).reduce((a, b) => a + b, 0);
    assert.equal(baseline().totals.tokens, sum);
  });

  it('would notice a baseline that had drifted from the tree', () => {
    // Handed an entry no file produces, the comparison must reject it.
    const actual = estimateTokens(read('examples/sample-prompt.en.txt'));
    assert.notEqual(actual, 9999);
  });
});

describe('CI actually runs the gate', () => {
  /**
   * The committed baseline is worth exactly as much as the step that reads it.
   * A workflow edit that drops the step leaves every guard above passing and
   * nothing gating a pull request.
   */
  it('has a step that runs check against the tree', () => {
    const workflow = read('.github', 'workflows', 'ci.yml');
    assert.match(workflow, /node packages\/cli\/dist\/index\.js check \./);
  });

  it('and the gate exits non-zero when the prompts grow past the limit', () => {
    /**
     * Proved by breaking it rather than by reading the flag. The growth handed
     * in is larger than `maxGrowthTokens`, and the run happens in a scratch copy
     * so the tree this suite is checking is never modified.
     */
    const cli = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
    const limit = config().baseline.maxGrowthTokens;
    const filler = ' certainly'.repeat(limit * 2);
    // No `set -e`: the command under test is *expected* to exit non-zero, and
    // the shell would abort before the exit code could be reported.
    const script = [
      'work=$(mktemp -d) || exit 1',
      `cp "${join(repoRoot, 'trazum.config.json')}" "$work/"`,
      `cp "${join(repoRoot, 'trazum.baseline.json')}" "$work/"`,
      'mkdir -p "$work/examples"',
      `cp "${join(repoRoot, 'examples')}"/*.txt "$work/examples/"`,
      `printf '%s\\n' "${filler}" >> "$work/examples/sample-prompt.en.txt"`,
      `cd "$work" && node "${cli}" check . > out.txt 2>&1; echo "EXIT=$?"; cat out.txt`,
      'rm -rf "$work"',
    ].join('\n');
    // `SPAWN_ENV` and not the ambient environment: the assertion below reads
    // the gate's own sentence, and the gate answers in the machine's language.
    // Without this the test passes on a CI runner, where `LANG` is unset, and
    // fails on any contributor's laptop that has a locale set.
    const output = execFileSync('sh', ['-c', script], { encoding: 'utf8', env: SPAWN_ENV });
    assert.match(output, /EXIT=1/, `the gate did not fail on real growth:\n${output}`);
    assert.match(output, /over the limit/);
  });
});
