import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum owners`, end to end.
 *
 * The assertion that matters is that the unallocated line stays out of every
 * owner's figure — everything else in this command is a table.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'owners', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const calls = (label, n) =>
  Array.from({ length: n }, () => ({
    model: 'claude-opus-5',
    label,
    usage: { input_tokens: 200_000, output_tokens: 0 },
  }));

const OWNERS = {
  patterns: { payments: ['billing-*', 'invoice-*'], support: ['support-*'], platform: ['infra-*'] },
  shared: { search: { payments: 0.6, support: 0.4 } },
  budgets: { payments: 80, support: 20, platform: 10 },
};

const workspace = async (records, owners = OWNERS) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-owners-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  await writeFile(join(dir, 'trazum.config.json'), `${JSON.stringify({ owners })}\n`);
  return dir;
};

describe('trazum owners', () => {
  it('keeps the unallocated out of every owner and names its labels', async () => {
    const dir = await workspace([
      ...calls('billing-run', 40),
      ...calls('support-chat', 30),
      ...calls('internal-eval', 15),
    ]);
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    const text = flat(stdout);
    // $1.00 a call: 40 and 30 land, 15 do not.
    assert.match(text, /payments \$40\.00/);
    assert.match(text, /support \$30\.00/);
    assert.match(text, /Unallocated: \$15\.00 \(17\.6% of the bill\), from internal-eval/);
    assert.match(text, /never will be/);
  });

  it('says why it will never be spread', async () => {
    const dir = await workspace([...calls('billing-run', 10), ...calls('mystery', 10)]);
    const text = flat(run(dir, ['usage.jsonl']).stdout);
    assert.match(text, /most common lie in cost reporting/);
    assert.match(text, /hardest on whoever instruments best/);
  });

  it('prints the shared rule beside the report', async () => {
    // The argument is then about the rule, not about the number.
    const dir = await workspace(calls('search', 20));
    const text = flat(run(dir, ['usage.jsonl']).stdout);
    assert.match(text, /Shared, by a rule somebody wrote/);
    assert.match(text, /search: payments 60\.0%, support 40\.0%/);
  });

  it('says not measured, never within, for an owner with no calls', async () => {
    const dir = await workspace(calls('billing-run', 10));
    const text = flat(run(dir, ['usage.jsonl']).stdout);
    assert.match(text, /platform .* not measured/);
    assert.match(text, /passes every budget it has, forever/);
  });

  it('fails on a split that does not sum to one, and leaves the workload whole', async () => {
    const dir = await workspace(calls('search', 20), {
      ...OWNERS,
      shared: { search: { payments: 0.6, support: 0.3 } },
    });
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 1);
    const text = flat(stdout);
    assert.match(text, /loses money or invents it, silently/);
    // The whole $20 sits in unallocated rather than 90% of it being applied.
    assert.match(text, /Unallocated: \$20\.00/);
  });

  it('names a split pointing at an owner that does not exist', async () => {
    const dir = await workspace(calls('search', 10), {
      ...OWNERS,
      shared: { search: { payments: 0.5, ghost: 0.5 } },
    });
    const text = flat(run(dir, ['usage.jsonl']).stdout);
    assert.match(text, /names an owner that "owners\.patterns" does not declare/);
  });

  it('says what owners are for when none are configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-owners-'));
    await writeFile(join(dir, 'usage.jsonl'), `${JSON.stringify(calls('x', 1)[0])}\n`);
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    assert.match(flat(stdout), /No owners configured/);
  });

  it('says so plainly when everything has an owner', async () => {
    const dir = await workspace([...calls('billing-run', 5), ...calls('support-chat', 5)]);
    assert.match(flat(run(dir, ['usage.jsonl']).stdout), /Every workload in this log has an owner/);
  });
});
