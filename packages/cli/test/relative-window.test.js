import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Relative windows — what a nightly job actually asks for.
 *
 * Measured against **this machine's clock**, not the log's, which is a real
 * difference on an exported log and is stated rather than assumed away. Every
 * fixture below is written relative to now, so the tests do not rot.
 */

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

const call = (isoTs, usd = 1) => ({
  model: 'claude-opus-5',
  ts: isoTs,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const run = async (records, argv) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-relwin-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('relative windows', () => {
  it('keeps the last N days and drops what came before', async () => {
    const result = await run([call(daysAgo(1)), call(daysAgo(30), 5)], ['--since', '7d']);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /\$1\.00/);
    assert.doesNotMatch(text, /\$5\.00/);
  });

  it('says the window is measured against this machine, not the log', async () => {
    const text = flat(await run([call(daysAgo(1))], ['--since', '7d']));
    assert.match(text, /relative to this machine's clock, not to the log's last record/);
  });

  it('takes hours too', async () => {
    const result = await run(
      [call(new Date(Date.now() - 3_600_000 * 2).toISOString()), call(daysAgo(3), 4)],
      ['--since', '24h'],
    );
    assert.match(flat(result), /\$1\.00/);
    assert.doesNotMatch(flat(result), /\$4\.00/);
  });

  it('gates over the relative window', async () => {
    const records = [call(daysAgo(1), 5), call(daysAgo(40), 100)];
    assert.equal((await run(records, ['--since', '7d', '--max-usd', '9'])).status, 0);
    assert.equal((await run(records, ['--max-usd', '9'])).status, 1);
  });

  it('names the clock difference when a relative window finds nothing', async () => {
    const result = await run([call(daysAgo(90))], ['--since', '7d']);
    assert.equal(result.status, 1);
    const text = flat(result);
    assert.match(text, /No record falls inside this window/);
    assert.match(text, /measured from this machine's clock/);
  });

  it('accepts "now" as the other bound', async () => {
    const result = await run([call(daysAgo(1))], ['--since', '7d', '--until', 'now']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /\$1\.00/);
  });

  it('still refuses a value it cannot read', async () => {
    const result = await run([call(daysAgo(1))], ['--since', '7 days']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /could not read "7 days"/);
  });

  it('speaks Spanish', async () => {
    const text = flat(await run([call(daysAgo(1))], ['--since', '7d', '--locale', 'es']));
    assert.match(text, /relativa al reloj de esta máquina/);
  });
});
