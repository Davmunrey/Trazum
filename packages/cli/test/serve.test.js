import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, after } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The endpoint. $1.00 = 200k input tokens on Claude Opus 5, so the fixture
 * below is $40.00 measured against a $50.00 budget.
 */

const started = [];
after(() => {
  for (const child of started) child.kill();
});

const setup = async (spend = { maxUsd: 50 }) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-serve-'));
  await writeFile(
    join(dir, 'usage.json'),
    JSON.stringify({
      data: [
        {
          starting_at: '2026-08-01T00:00:00Z',
          ending_at: '2026-08-02T00:00:00Z',
          results: [{ model: 'claude-opus-5', uncached_input_tokens: 8_000_000, output_tokens: 0 }],
        },
      ],
    }),
  );
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify({ spend }));
  return dir;
};

const fill = (dir) =>
  spawnSync(process.execPath, [CLI, 'connect', 'anthropic', '--payload', 'usage.json', '--store'], {
    encoding: 'utf8', env: SPAWN_ENV, timeout: 30000, cwd: dir,
  });

/** Starts the server on an ephemeral port and waits for its first line. */
const serve = async (dir, args = []) => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0', ...args], {
    env: SPAWN_ENV,
    cwd: dir,
  });
  started.push(child);
  const where = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${buffer}`)), 20000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const match = /127\.0\.0\.1:(\d+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on('data', (chunk) => { buffer += chunk; });
  });
  return { child, where };
};

const post = async (where, body) => {
  const response = await fetch(`${where}/cost`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

describe('serve', () => {
  it('answers with the measured half and the estimated half kept apart', async () => {
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);

    const health = await fetch(`${where}/health`);
    assert.equal(health.status, 200);

    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 200_000 });
    assert.equal(body.call.provenance, 'estimated');
    assert.equal(body.budget.provenance, 'measured');
    assert.ok(Math.abs(body.call.estimatedUsd - 1) < 1e-9);
    assert.ok(Math.abs(body.budget.consumedUsd - 40) < 1e-9);
    assert.equal(body.verdict, 'within');
    // The verdict names what it rests on, so a caller reading only that line
    // cannot mistake an estimate for a measurement.
    assert.equal(body.restsOn, 'measured+estimated');
    // The composed figure never travels without its halves.
    assert.ok(Math.abs(body.afterCall.usd - 41) < 1e-9);
    assert.equal(body.afterCall.halves.measuredUsd, body.budget.consumedUsd);
  });

  it('carries the window its measurement covers, so staleness is visible', async () => {
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);
    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 1000 });
    assert.ok(body.budget.window !== null, 'a null window would let last month read as current');
    assert.equal(new Date(body.budget.window.fromMs).toISOString(), '2026-08-01T00:00:00.000Z');
  });

  it('says a call would cross rather than saying it already has', async () => {
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);
    // $40 measured of $50, and a call worth $15.00.
    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 3_000_000 });
    assert.equal(body.verdict, 'over');
    assert.equal(body.restsOn, 'measured+estimated');
  });

  it('degrades to the deterministic half with nothing measured', async () => {
    const dir = await setup();
    const { where } = await serve(dir);
    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 200_000 });
    // Offline is a mode, not a failure: the call still prices.
    assert.ok(Math.abs(body.call.estimatedUsd - 1) < 1e-9);
    assert.equal(body.verdict, 'cannot-tell');
    assert.equal(body.reason, 'nothing-measured');
  });

  it('tells a missing budget from a missing measurement', async () => {
    const dir = await setup({});
    fill(dir);
    const { where } = await serve(dir);
    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 1000 });
    assert.equal(body.reason, 'no-budget-configured');
  });

  it('refuses a model it cannot price instead of answering another question', async () => {
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);
    const { body } = await post(where, { model: 'nobody-prices-this', inputTokens: 1000 });
    assert.equal(body.verdict, 'cannot-tell');
    assert.equal(body.reason, 'model-unpriced');
  });

  it('404s anything it does not document, and refuses a body that is not JSON', async () => {
    const dir = await setup();
    const { where } = await serve(dir);
    const missing = await fetch(`${where}/anything-else`);
    assert.equal(missing.status, 404);

    const bad = await fetch(`${where}/cost`, { method: 'POST', body: 'not json' });
    assert.equal(bad.status, 400);
  });

  it('is a contract: the doc and the answer promise each other every field', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = await readFile(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    const start = doc.indexOf('## The cost answer document');
    const end = doc.indexOf('## The spend-guard document');
    const section = doc.slice(start, end === -1 ? undefined : end);
    const promised = new Set([...section.matchAll(/^\| `([a-zA-Z]+)`/gm)].map((m) => m[1]));
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);
    const { body } = await post(where, { model: 'claude-opus-5', inputTokens: 1000 });
    const emitted = Object.keys(body);
    assert.deepEqual(emitted.filter((k) => !promised.has(k)), [], 'fields emitted with no line in the doc');
    assert.deepEqual([...promised].filter((k) => !emitted.includes(k)), [], 'fields promised and not emitted');
  });

  it('answers in single-digit milliseconds', async () => {
    const dir = await setup();
    fill(dir);
    const { where } = await serve(dir);
    await post(where, { model: 'claude-opus-5', inputTokens: 1000 });
    const start = performance.now();
    for (let i = 0; i < 20; i++) await post(where, { model: 'claude-opus-5', inputTokens: 200_000 });
    const each = (performance.now() - start) / 20;
    // The whole promise of this release. Generous ceiling for a loaded CI box,
    // and still an order of magnitude under a process launch.
    assert.ok(each < 50, `each answer took ${each.toFixed(1)}ms`);
  });
});
