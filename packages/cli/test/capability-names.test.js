import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The CLI quotes the capability `recommendTier` answered, in the words a model's
 * own `capability` has: `small`, `mid` and `large`. It said `haiku`, `sonnet` or
 * `opus` until 3.0.0, in the text of `trazum optimize` and in the `detail` of the
 * `model-downgrade` advisory its `--json` carries. The core holds the answer;
 * this holds what reaches a person at a terminal and a script reading the JSON.
 */

const OLD_NAME_QUOTED = /["“\\](haiku|sonnet|opus)["”\\]/i;

const SMALL = 'Translate this sentence into English.\n';

async function optimize(args) {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-capability-'));
  await writeFile(join(dir, 'p.txt'), SMALL);
  const done = spawnSync(
    process.execPath,
    [CLI, 'optimize', 'p.txt', '--calls', '50000', '--model', 'claude-opus-5', '-o', '/dev/null', ...args],
    { encoding: 'utf8', cwd: dir, env: { ...SPAWN_ENV, CI: '', GITHUB_ACTIONS: '' } },
  );
  assert.equal(done.status, 0, done.stderr);
  return done;
}

describe('trazum optimize names the capability it recommends', () => {
  it('in --json, in the detail of the model-downgrade advisory', async () => {
    const { stdout } = await optimize(['--json']);
    const downgrade = JSON.parse(stdout).advisories.find((a) => a.id === 'model-downgrade');
    assert.ok(downgrade, 'a plain translation was not offered a cheaper model');
    assert.ok(downgrade.detail.includes('"small"'), `the advisory does not quote "small": ${downgrade.detail}`);
    assert.doesNotMatch(stdout, OLD_NAME_QUOTED, 'an old name is still in the JSON');
  });

  it('in the text a person reads', async () => {
    const { stdout, stderr } = await optimize([]);
    const text = `${stdout}${stderr}`;
    assert.match(text, /"small"/, 'the report does not quote "small"');
    assert.doesNotMatch(text, OLD_NAME_QUOTED, 'an old name is still in the report');
  });

  it('in Spanish, with the same word', async () => {
    const { stdout, stderr } = await optimize(['--locale', 'es']);
    // The report wraps its prose, so the sentence is read with its breaks collapsed.
    const text = `${stdout}${stderr}`.replace(/\s+/g, ' ');
    assert.match(text, /complejidad "small"/, 'the Spanish report does not quote "small"');
    assert.doesNotMatch(text, OLD_NAME_QUOTED, 'an old name is still in the Spanish report');
  });
});
