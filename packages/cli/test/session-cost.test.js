import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What one conversation costs, rendered. $1.00 = 200k input tokens on Claude
 * Opus 5, as everywhere in this suite.
 */

const turn = (session, usd) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-sesscost-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** Nine $1.00 conversations and one $50.00 one — a tail, on purpose. */
const tailLog = () => {
  const records = [];
  for (let i = 0; i < 9; i += 1) records.push(turn(`s${i}`, 1));
  records.push(turn('spike', 50));
  return records;
};

describe('the cost of one conversation, on screen', () => {
  it('names the median, the p95 and the maximum', async () => {
    const log = await write(tailLog());
    const result = run([log]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /the median one costs \$1\.00 over 1 turns/);
    assert.match(text, /95% come in under \$50\.00/);
    assert.match(text, /the most expensive was \$50\.00/);
  });

  it('calls out a real tail, and only a real one', async () => {
    const tail = flat(run([await write(tailLog())]));
    assert.match(tail, /The 95th percentile is 50x the median/);

    // Ten conversations between $1.00 and $2.00: expensive, no tail.
    const flatRecords = [];
    for (let i = 0; i < 10; i += 1) flatRecords.push(turn(`s${i}`, 1 + i / 10));
    const even = flat(run([await write(flatRecords)]));
    assert.doesNotMatch(even, /95th percentile is/);
  });

  it('rides --json without the session key', async () => {
    const log = await write(tailLog());
    const result = run([log, '--json']);
    const report = JSON.parse(result.stdout);
    const [shape] = report.sessionCosts;
    assert.equal(shape.sessions, 10);
    assert.ok(Math.abs(shape.medianUsd - 1) < 1e-9);
    assert.ok(Math.abs(shape.p95Usd - 50) < 1e-9);
    assert.ok(!result.stdout.includes('"spike"'));
  });

  it('speaks Spanish', async () => {
    const log = await write(tailLog());
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--locale', 'es'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.match(flat(result), /la mediana cuesta \$1\.00/);
  });

  it('states the worst conversation when a small log refuses the percentiles', async () => {
    // Three conversations: under the five the percentiles require, so the
    // sessionCost section stays silent — but the maximum is a fact at any
    // count, and it is the figure --max-session-usd judges, so the report
    // says it rather than nothing. The session keys stay grouped, unprinted.
    const log = await write([turn('a', 1), turn('b', 2), turn('c', 8)]);
    const out = flat(run([log]));
    assert.doesNotMatch(out, /the median one costs/);
    assert.match(out, /3 conversations in this log; the most expensive cost \$8\.00/);
    assert.match(out, /--max-session-usd/);
    for (const key of ['"a"', '"b"', '"c"']) assert.ok(!out.includes(key), `session key ${key} leaked`);

    // With five or more, the percentiles speak and this line stands down.
    const bigger = await write([1, 2, 3, 4, 5].map((i) => turn(`s${i}`, i)));
    const spoken = flat(run([bigger]));
    assert.match(spoken, /the median one costs/);
    assert.doesNotMatch(spoken, /conversations in this log; the most expensive/);
  });
});
