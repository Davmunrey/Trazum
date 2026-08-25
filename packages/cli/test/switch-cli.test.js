import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum switch` and `trazum ownrate`, run rather than read: the decision
 * priced with its refusals said, the quality question always deferred to
 * route, and the self-hosted rate derived only from declared numbers.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });

const LOG = [
  { ts: '2026-08-01T10:00:00Z', model: 'claude-opus-5', label: 'support', usage: { input_tokens: 40000, output_tokens: 2000 } },
  { ts: '2026-08-10T10:00:00Z', model: 'claude-opus-5', label: 'support', usage: { input_tokens: 41000, output_tokens: 1900 } },
]
  .map((line) => JSON.stringify(line))
  .join('\n');

const logFile = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-switch-'));
  const file = join(dir, 'usage.jsonl');
  await writeFile(file, LOG);
  return file;
};

describe('switch, run', () => {
  it('refuses without a log, and without a candidate', async () => {
    assert.equal(run(['switch']).status, 1);
    const file = await logFile();
    const noTarget = run(['switch', file]);
    assert.equal(noTarget.status, 1);
    assert.match(noTarget.stderr, /--to/);
  });

  it('an unknown candidate names the fix, never a zero price', async () => {
    const file = await logFile();
    const out = run(['switch', file, '--to', 'qwen-imaginary-99']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /no price for "qwen-imaginary-99"/);
    assert.match(out.stderr, /trazum models/);
  });

  it('prices the decision, the break-even and the evaluation, and defers quality to route', async () => {
    const file = await logFile();
    const out = run(['switch', file, '--to', 'claude-haiku-4-5', '--migration-usd', '10', '--cases', '20']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /less, on[\s\S]{0,20}the same tokens/);
    assert.match(out.stdout, /recovered after ~\d+ day/);
    // The denominator travels with the division.
    assert.match(out.stdout, /measured over 9 day/);
    assert.match(out.stdout, /20 case\(s\)/);
    assert.match(out.stdout, /one on the candidate/);
    // The refusal every rendering ends on.
    assert.match(out.stdout, /evaluation, not arithmetic: trazum route/);
  });

  it('a switch that loses money says so and refuses the break-even by name', async () => {
    const file = await logFile();
    const out = run(['switch', file, '--to', 'claude-fable-5', '--migration-usd', '10']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /MORE\./);
    assert.match(out.stdout, /saves nothing/);
  });

  it('speaks Spanish when asked', async () => {
    const file = await logFile();
    const out = run(['switch', file, '--to', 'claude-haiku-4-5', '--locale', 'es']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /menos,[\s\S]{0,20}sobre los mismos tokens/);
    assert.match(out.stdout, /evaluación, no aritmética/);
  });
});

describe('ownrate, run', () => {
  it('derives the rate and prints the paste-ready overlay snippet', () => {
    const out = run(['ownrate', '--gpu-usd-hour', '2.5', '--tokens-per-second', '250', '--utilization', '0.7']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /per million tokens/);
    assert.match(out.stdout, /Derived from your declaration/);
    const snippet = out.stdout.slice(out.stdout.indexOf('{'));
    const parsed = JSON.parse(snippet);
    const model = parsed.models['my-self-hosted-model'];
    // $2.50/h over 250 tok/s at 70%: 630,000 tokens/hour → $3.9683/MTok.
    assert.ok(Math.abs(model.inputPerMTok - 3.9683) < 1e-4);
    assert.equal(model.inputPerMTok, model.outputPerMTok);
  });

  it('refuses missing and out-of-range declarations', () => {
    assert.equal(run(['ownrate']).status, 1);
    const zero = run(['ownrate', '--gpu-usd-hour', '0', '--tokens-per-second', '250']);
    assert.equal(zero.status, 1);
    assert.match(zero.stderr, /gpu-usd-hour/);
    const util = run(['ownrate', '--gpu-usd-hour', '2', '--tokens-per-second', '250', '--utilization', '1.5']);
    assert.equal(util.status, 1);
    assert.match(util.stderr, /utilization/);
  });
});
