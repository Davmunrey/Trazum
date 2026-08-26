import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--max-day-usd`: the gate a total cannot arm.
 *
 * A month under budget hides the afternoon a loop burned a quarter of it, and
 * `--max-usd` cannot see that shape at all. Hand arithmetic: 200k input tokens
 * on Claude Opus 5 are $1.00, so every day below is countable by eye.
 */

const call = (day, usd = 1, label = 'chat') => ({
  model: 'claude-opus-5',
  label,
  ts: `${day}T10:00:00Z`,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const run = async (records, argv) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-maxday-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('trazum profile --max-day-usd', () => {
  it('fails on the worst single day even when the total is under budget', async () => {
    // $12.00 over three days, but one of them is $10.00. --max-usd 20 would
    // pass this log; the day gate is the one that sees the shape.
    const result = await run(
      [call('2026-08-01'), call('2026-08-02', 10), call('2026-08-03')],
      ['--max-usd', '20', '--max-day-usd', '5'],
    );
    const out = flat(result);
    assert.equal(result.status, 1);
    assert.match(out, /FAILED, 2026-08-02 spent \$10\.00, over the --max-day-usd limit of \$5\.00/);
    // The total gate passed in the same run, which is the whole point.
    assert.match(out, /Bill within budget|within budget|\$12\.00/);
  });

  it('names the day’s biggest label, so the spike arrives with a suspect', async () => {
    const result = await run(
      [call('2026-08-01', 1, 'chat'), call('2026-08-01', 9, 'agent')],
      ['--max-day-usd', '5'],
    );
    assert.match(flat(result), /agent/);
  });

  it('passes when no day clears the limit, naming the worst one anyway', async () => {
    // A pass that does not say which day came closest is a pass nobody can act on.
    const result = await run([call('2026-08-01'), call('2026-08-02', 3)], ['--max-day-usd', '5']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /No single day over budget: the worst was 2026-08-02 at \$3\.00/);
  });

  it('fails a log with no clock at all — not measured is not under budget', async () => {
    const result = await run(
      [{ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } }],
      ['--max-day-usd', '5'],
    );
    assert.equal(result.status, 1);
    assert.match(flat(result), /no record in this log carries a timestamp, so there are no days to judge/);
    assert.match(flat(result), /That is not a pass/);
  });

  it('says the passing day is a floor when some calls carry no clock', async () => {
    const result = await run(
      [call('2026-08-01'), { model: 'claude-opus-5', usage: { input_tokens: 2_000_000, output_tokens: 0 } }],
      ['--max-day-usd', '5'],
    );
    assert.equal(result.status, 0);
    const out = flat(result);
    assert.match(out, /No single day over budget/);
    assert.match(out, /1 calls carry no timestamp, so they are in the bill and in none of the days/);
  });

  it('says nothing about days when the flag was not passed', async () => {
    const out = flat(await run([call('2026-08-01')], []));
    assert.doesNotMatch(out, /--max-day-usd/);
  });

  it('warns that the gated figure is a floor when lines could not be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-maxday-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, `${JSON.stringify(call('2026-08-01'))}\nnot json at all\n`);
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--max-day-usd', '5'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.match(flat(result), /could not be read|unreadable|1 line/i);
  });
});
