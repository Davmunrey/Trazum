import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * "The same request, sent again" on screen.
 *
 * The measurement is tested against hand arithmetic in the core suite. What
 * matters here is that the section stays hedged — it reads counts and cannot
 * see content — and that it never fires on an ordinary growing conversation,
 * which is what every healthy chat log looks like.
 */

const turn = (seconds, inputTokens = 200_000, over = {}) => ({
  model: 'claude-opus-5',
  label: 'agent',
  session: 's1',
  ts: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-repeats-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the same request sent again, on screen', () => {
  it('names the count, the window and the money', async () => {
    const out = flat(await run([turn(0), turn(5), turn(10)]));
    assert.match(out, /The same request, sent again/);
    assert.match(out, /agent on Claude Opus 5: 2 of 3 calls re-sent the previous call's exact input size within 60 seconds/);
    assert.match(out, /costing \$2\.00/);
  });

  it('states the pattern and refuses the cause', async () => {
    const out = flat(await run([turn(0), turn(5), turn(10)]));
    assert.match(out, /usually a retry after a timeout, an agent step repeating, or a loop/);
    assert.match(out, /cannot see content, so it names the pattern and stops/);
  });

  it('stays silent on an ordinary growing conversation', async () => {
    // Every healthy chat log looks like this, and a section that fired here
    // would be noise on every bill.
    const out = flat(
      await run([turn(0, 100_000), turn(5, 200_000), turn(10, 300_000), turn(15, 400_000)]),
    );
    assert.doesNotMatch(out, /The same request, sent again/);
  });

  it('never prints the session key it grouped by', async () => {
    const out = flat(await run([turn(0), turn(5), turn(10)]));
    // "s1" would be somebody's conversation id, and the promise is that it
    // groups by it and never shows it.
    assert.doesNotMatch(out, /\bs1\b/);
  });

  it('carries the rows into --json', async () => {
    const result = await run([turn(0), turn(5), turn(10)], ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { repeatedTurns } = JSON.parse(result.stdout);
    assert.equal(repeatedTurns.length, 1);
    assert.equal(repeatedTurns[0].repeats, 2);
    assert.equal(repeatedTurns[0].withinMs, 60_000);
  });
});
