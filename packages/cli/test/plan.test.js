import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum plan` — the report's findings as a ranked plan.
 *
 * Hand figures: Claude Opus 5 at $5/MTok input makes 400k input tokens $2.00
 * a call, as everywhere in this suite.
 */

const line = (record) => JSON.stringify(record);

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-plan-'));
  const rows = [];
  // A slice both routable and batchable.
  for (let i = 0; i < 3; i++) {
    rows.push(line({ model: 'claude-opus-5', label: 'support', ts: `2026-08-0${i + 1}T09:00:00Z`, usage: { input_tokens: 400_000, output_tokens: 0 } }));
  }
  // Two truncation-retry pairs: $2.00 wasted + $2.00 retried each.
  for (const [sess, minute] of [['s1', 0], ['s2', 10]]) {
    const at = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute), stop_reason: 'max_tokens', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute + 1), stop_reason: 'end_turn', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
  }
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, rows.join('\n') + '\n');
  return { dir, log };
};

const run = (args) =>
  spawnSync(process.execPath, [CLI, 'plan', ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('plan', () => {
  it('ranks actions by money and separates projected from already spent', async () => {
    const { log } = await setup();
    const result = run([log]);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /The plan: \d+ actions against a \$\d/);
    // Both columns named, never merged.
    assert.match(out, /projected savings/);
    assert.match(out, /already spent on problems this plan names, measured, not projected/);
    // The composition arrives combined, and says so.
    assert.match(out, /Route and batch support/);
    assert.match(out, /combined with batching where both apply, never summed/);
    // The stake action with its measured money: $8.00 of waste and retries.
    assert.match(out, /Fix the truncation retries on digest .* \$8\.00 already spent/);
    // Every action carries what the log cannot confirm.
    assert.match(out, /assumes .* can do this work/);
    assert.match(out, /the log sees shapes, not content/);
  });

  it('filters with --min-usd, counting what was left out and its worth', async () => {
    const { log } = await setup();
    const result = run([log, '--min-usd', '5']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /worth \$\d+\.\d\d together, left out by --min-usd/);
  });

  it('saves a dated, self-consistent document with --out and --json', async () => {
    const { dir, log } = await setup();
    const out = join(dir, 'plan.json');
    const result = run([log, '--min-usd', '5', '--out', out, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(result.stdout);
    const saved = JSON.parse(await readFile(out, 'utf8'));
    assert.deepEqual(doc, saved, 'stdout and the file are the same document');
    assert.equal(doc.schemaVersion, 1);
    assert.ok(doc.createdAt.startsWith('20'), 'dated, so verify can hold it to a moment');
    assert.equal(doc.pricingLastReviewed !== undefined, true);
    // The totals cover the actions the document holds — filtered ones are
    // out of the file entirely, so the file never contradicts itself.
    const projected = doc.actions.reduce((s, a) => s + (a.savingUsd ?? 0), 0);
    const staked = doc.actions.reduce((s, a) => s + (a.stakeUsd ?? 0), 0);
    assert.ok(Math.abs(doc.projectedSavingUsd - projected) < 1e-9);
    assert.ok(Math.abs(doc.measuredStakeUsd - staked) < 1e-9);
    // Assumptions are data, not prose: the CLI localizes them at render time.
    const kinds = doc.actions.flatMap((a) => a.assumes.map((x) => x.kind));
    assert.ok(kinds.includes('model-capability'));
  });

  it('writes the plan as Markdown for a CI summary', async () => {
    const { dir, log } = await setup();
    const md = join(dir, 'plan.md');
    const result = run([log, '--markdown-out', md, '-o', '/dev/null']);
    assert.equal(result.status, 0, result.stderr);
    const body = await readFile(md, 'utf8');
    assert.match(body, /^## The plan:/m);
    assert.match(body, /### Route and batch support/);
    assert.match(body, /- assumes/);
  });

  it('speaks Spanish', async () => {
    const { log } = await setup();
    const result = run([log, '--locale', 'es']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /El plan: \d+ acciones contra una factura/);
    assert.match(out, /ya gastados en problemas que este plan nombra/);
  });

  it('is a contract: the doc and the document promise each other every top-level field', async () => {
    const doc = await readFile(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    const section = sectionOf(doc, '## The plan document');
    const promised = new Set(
      [...section.matchAll(/^\| `([a-zA-Z]+)(?:\[\])?`/gm)].map((m) => m[1]),
    );
    const { log } = await setup();
    const result = run([log, '--json']);
    const emitted = Object.keys(JSON.parse(result.stdout));
    assert.deepEqual(
      emitted.filter((k) => !promised.has(k)),
      [],
      'fields emitted with no line in docs/json-output.md',
    );
    assert.deepEqual(
      [...promised].filter((k) => !emitted.includes(k)),
      [],
      'fields promised by docs/json-output.md and not emitted',
    );
  });

  /**
   * A coding agent's turns, and calls already on the Batch API, are left out
   * of the batch lever, and the plan says so with the money it left out. The
   * same log unmarked is told to "route and batch", which is what every
   * converted Claude Code session was told before a record could say that
   * something waited on its answer.
   */
  const agentLog = async (mark) => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-plan-'));
    // Three calls of 400k input on Opus 5: $2.00 each, $6.00, nothing else.
    const rows = [0, 1, 2].map((i) =>
      line({ model: 'claude-opus-5', label: 'agent', ts: `2026-08-0${i + 1}T09:00:00Z`, ...mark, usage: { input_tokens: 400_000, output_tokens: 0 } }));
    const log = join(dir, 'agent.jsonl');
    await writeFile(log, rows.join('\n') + '\n');
    return { dir, log };
  };

  it('routes a coding agent\'s turns without asking whether they can wait a day', async () => {
    const { log } = await agentLog({ interactive: true });
    const result = run([log]);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Route agent \(claude-opus-5\)/);
    assert.doesNotMatch(out, /Route and batch|Batch agent/);
    assert.doesNotMatch(out, /can wait for a batch window/);
    // Nothing is combined, so the route line does not say it is.
    assert.match(out, /to Claude Sonnet 5\.5 \? assumes/);
    assert.doesNotMatch(out, /combined with batching/);
    // What was left out, with its money: three calls of $2.00 input.
    assert.match(out, /No batch saving is projected on \$6\.00 of input and output/);
    assert.match(out, /something waited on their answer/);

    const unmarked = flat(run([(await agentLog({})).log]));
    assert.match(unmarked, /Route and batch agent/);
    assert.doesNotMatch(unmarked, /No batch saving is projected/);
  });

  it('does not offer the Batch API to calls that already ran on it', async () => {
    const { log } = await agentLog({ batch: true });
    const out = flat(run([log]));
    assert.doesNotMatch(out, /Route and batch|Batch agent/);
    // Billed at half, so the three calls are $1.00 each.
    assert.match(out, /No batch saving is projected on \$3\.00 of input and output/);
  });

  it('says what it left out in the document, in Markdown and in Spanish', async () => {
    const { dir, log } = await agentLog({ interactive: true });
    const document = JSON.parse(run([log, '--json']).stdout);
    assert.equal(document.batchExcludedUsd, 6);
    assert.deepEqual(document.actions.map((a) => a.kind), ['route']);
    assert.equal(JSON.parse(run([(await agentLog({})).log, '--json']).stdout).batchExcludedUsd, 0);

    const md = join(dir, 'plan.md');
    run([log, '--markdown-out', md, '-o', '/dev/null']);
    const body = await readFile(md, 'utf8');
    assert.match(body, /^### Route agent/m);
    assert.match(body, /^- to Claude Sonnet 5\.5$/m);
    assert.match(body, /^_No batch saving is projected on \$6\.00 of input and output/m);

    const es = flat(run([log, '--locale', 'es']));
    assert.match(es, /No se proyecta ahorro por batch sobre \$6\.00 de entrada y salida/);
    assert.match(es, /a Claude Sonnet 5\.5 \? supone/);
  });

  it('refuses a missing target and a log that priced nothing, naming the fix', async () => {
    const bare = run([]);
    assert.equal(bare.status, 1);
    assert.match(flat(bare), /trazum plan usage\.jsonl/);

    const dir = await mkdtemp(join(tmpdir(), 'trazum-plan-'));
    const log = join(dir, 'unpriced.jsonl');
    await writeFile(log, line({ model: 'mystery-model', usage: { input_tokens: 1000, output_tokens: 0 } }) + '\n');
    const unpriced = run([log]);
    assert.equal(unpriced.status, 1);
    assert.match(flat(unpriced), /priced nothing|no tasó nada/);
  });
});
