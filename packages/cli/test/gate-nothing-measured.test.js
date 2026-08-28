import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * A spend gate over a report with nothing in it.
 *
 * The doctrine has a rule for this and names the date it was learned twice:
 * *a period, or a service, nobody measured is not one under budget. Name the
 * gap; never report the absence as a pass.* `$0 of $400` is the healthiest
 * budget a dead store can produce, and a pipeline that stopped writing looks
 * exactly like a quiet month.
 *
 * The product had applied that rule once. A `--since` matching no record
 * throws, and the comment above it says why in the same words: under
 * `--max-usd` it would pass a budget gate over a period the log does not
 * cover. Three other ways of measuring nothing reached the same gate and got
 * the opposite answer — a log whose every line was unreadable, a log with no
 * records, and a log whose models are all unpriced. Each exited **0** against
 * a budget, on the human path and under `--json`.
 *
 * The counterpart matters as much as the rule: this must not fire when no gate
 * is armed. A reader running `profile` on an empty log is asking a question,
 * not asserting a budget, and answering them with an error would be the same
 * mistake pointed the other way.
 */
const logOf = async (lines) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-gate-empty-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
  return path;
};

const run = (path, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', path, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

/** Every way this log can hold nothing the gate could judge. */
const NOTHING = [
  { name: 'a log with no records', lines: [] },
  { name: 'a log whose every line is unreadable', lines: ['not json', 'also not json', '{"broken":'] },
  {
    name: 'a log whose models are all unpriced',
    lines: [JSON.stringify({ model: 'no-such-model', usage: { input_tokens: 100, output_tokens: 10 } })],
  },
];

/** Every flag that arms a gate over the money. */
const GATES = [
  ['--max-usd', '0.01'],
  ['--max-day-usd', '0.01'],
  ['--max-session-usd', '0.01'],
  ['--max-cache-loss-usd', '0.01'],
];

describe('a spend gate is never passed by an absence', () => {
  for (const { name, lines } of NOTHING) {
    for (const gate of GATES) {
      for (const shape of [[], ['--json']]) {
        const how = shape.length === 0 ? 'the report' : '--json';
        it(`refuses ${gate[0]} over ${name}, in ${how}`, async () => {
          const result = run(await logOf(lines), [...gate, ...shape]);
          assert.equal(
            result.status,
            1,
            `exited ${result.status} with a gate armed and nothing measured:\n${result.stdout}${result.stderr}`,
          );
          const said = `${result.stdout}${result.stderr}`;
          assert.match(said, /nothing to judge/, 'the refusal does not say what happened');
          assert.match(said, /--allow-empty/, 'the refusal does not say what would settle it');
        });
      }
    }
  }

  it('names which of the three gaps it found, never a generic absence', async () => {
    const unreadable = run(await logOf(['not json', 'nor this']), ['--max-usd', '1']);
    assert.match(`${unreadable.stdout}${unreadable.stderr}`, /unreadable/);

    const unpriced = run(
      await logOf([JSON.stringify({ model: 'no-such-model', usage: { input_tokens: 5, output_tokens: 5 } })]),
      ['--max-usd', '1'],
    );
    assert.match(`${unpriced.stdout}${unpriced.stderr}`, /price table/);

    const empty = run(await logOf([]), ['--max-usd', '1']);
    assert.match(`${empty.stdout}${empty.stderr}`, /no records at all/);
  });

  it('lets a caller say a quiet period is the expected answer', async () => {
    const result = run(await logOf([]), ['--max-usd', '0.01', '--allow-empty']);
    assert.equal(result.status, 0, `--allow-empty did not opt out:\n${result.stderr}`);
  });

  it('says nothing when no gate is armed, because then nothing was asserted', async () => {
    for (const { name, lines } of NOTHING) {
      const result = run(await logOf(lines));
      assert.equal(result.status, 0, `${name} failed a run with no gate:\n${result.stderr}`);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /nothing to judge/, name);
    }
  });

  it('still passes a gate the log can actually answer', async () => {
    const call = JSON.stringify({
      model: 'claude-opus-5',
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
    const under = run(await logOf([call]), ['--max-usd', '100']);
    assert.equal(under.status, 0, `a real log under budget failed:\n${under.stderr}`);
    const over = run(await logOf([call]), ['--max-usd', '0.000001']);
    assert.equal(over.status, 1, 'a real log over budget passed');
  });
});
