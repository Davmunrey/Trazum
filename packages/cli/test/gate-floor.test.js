import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Three claims a gate must make about its own reach.
 *
 * A gate can only judge the money it can see: unreadable lines, unpriced
 * models and clockless calls under a window all hide spend from it. Passing
 * on a floor is fine; passing on a floor *silently* is the flattering
 * omission this repository refuses. $5.00 = 1M input tokens on Claude Opus 5.
 *
 * Doctrine: [A floor can prove "over" and can never prove "under"](../../../docs/doctrine.md#a-floor-can-prove-over-and-can-never-prove-under)
 */

const write = async (dir, name, lines) => {
  const path = join(dir, name);
  await writeFile(path, lines.join('\n') + '\n');
  return path;
};

const scratch = () => mkdtemp(join(tmpdir(), 'trazum-floor-'));

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const priced = (over = {}) =>
  JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 1_000_000, output_tokens: 0 }, ...over });

describe('a gate says when its figure is a floor', () => {
  it('names unreadable lines beside a passing verdict', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [priced(), 'not json at all']);
    const result = run([log, '--max-usd', '9']);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /the gated figure is a floor, not the bill/);
    assert.match(text, /1 line was unreadable and left out/);
    // The pass still prints: the floor note qualifies it, never replaces it.
    assert.match(text, /Within budget/);
  });

  it('names unpriced models', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [
      priced(),
      JSON.stringify({ model: 'ft:acme-internal', usage: { input_tokens: 900_000, output_tokens: 0 } }),
    ]);
    const result = run([log, '--max-usd', '9']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /1 call is on models the price table does not know/);
  });

  it('names clockless calls dropped by a window', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [
      priced({ ts: '2026-08-01T10:00:00Z' }),
      priced(),
    ]);
    const result = run([log, '--since', '2026-08-01', '--max-usd', '9']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /1 call carries no timestamp and fell outside the window/);
  });

  it('stays quiet when the gate can see the whole bill', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [priced()]);
    const result = run([log, '--max-usd', '9']);
    assert.equal(result.status, 0);
    assert.doesNotMatch(flat(result), /is a floor/);
  });

  it('says nothing about floors when no gate was asked for', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [priced(), 'not json at all']);
    const result = run([log]);
    assert.equal(result.status, 0);
    // The skipped-line note still prints in the report; the gate sentence
    // does not, because there is no gate to qualify.
    assert.doesNotMatch(flat(result), /the gated figure is a floor/);
  });

  it('speaks Spanish', async () => {
    const dir = await scratch();
    const log = await write(dir, 'usage.jsonl', [priced(), 'not json at all']);
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', log, '--max-usd', '9', '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.match(flat(result), /la cifra vigilada es un suelo, no la factura/);
  });
});

describe('two logs that cover the same days', () => {
  const day = (d, model = 'claude-opus-5') =>
    JSON.stringify({ model, ts: `${d}T10:00:00Z`, usage: { input_tokens: 1_000_000, output_tokens: 0 } });

  it('warns when the spans intersect, between the figure and the drivers', async () => {
    const dir = await scratch();
    const previous = await write(dir, 'previous.jsonl', [day('2026-08-01'), day('2026-08-03')]);
    const now = await write(dir, 'now.jsonl', [day('2026-08-03'), day('2026-08-05')]);
    const result = run([now, '--against', previous]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /both cover 2026-08-03 → 2026-08-03/);
    assert.match(text, /same money counted twice/);
  });

  it('stays quiet on disjoint periods', async () => {
    const dir = await scratch();
    const previous = await write(dir, 'previous.jsonl', [day('2026-08-01')]);
    const now = await write(dir, 'now.jsonl', [day('2026-08-05')]);
    assert.doesNotMatch(flat(run([now, '--against', previous])), /counted twice/);
  });

  it('stays quiet when a log has no clock — unknown is not clear', async () => {
    const dir = await scratch();
    const previous = await write(dir, 'previous.jsonl', [priced()]);
    const now = await write(dir, 'now.jsonl', [day('2026-08-05')]);
    assert.doesNotMatch(flat(run([now, '--against', previous])), /counted twice/);
  });
});

describe('the comparison reaches the markdown', () => {
  const day = (d) =>
    JSON.stringify({ model: 'claude-opus-5', label: 'chat', ts: `${d}T10:00:00Z`, usage: { input_tokens: 1_000_000, output_tokens: 0 } });

  it('renders totals, drivers and the overlap warning', async () => {
    const dir = await scratch();
    const previous = await write(dir, 'previous.jsonl', [day('2026-08-01'), day('2026-08-03')]);
    const now = await write(dir, 'now.jsonl', [day('2026-08-03')]);
    const out = join(dir, 'report.md');
    const result = run([now, '--against', previous, '--markdown-out', out]);
    assert.equal(result.status, 0);
    const markdown = await readFile(out, 'utf8');
    // $10.00 → $5.00 is a halving, and the label driver carries it.
    assert.match(markdown, /\$10\.00 → \$5\.00/);
    assert.match(markdown, /-\$5\.00 {2}chat/);
    assert.match(markdown, /> ⚠️ .*both cover 2026-08-03/);
  });

  it('reports a previous log with nothing priced as its own answer', async () => {
    const dir = await scratch();
    const previous = await write(dir, 'previous.jsonl', [
      JSON.stringify({ model: 'ft:unknown', usage: { input_tokens: 10 } }),
    ]);
    const now = await write(dir, 'now.jsonl', [day('2026-08-05')]);
    const out = join(dir, 'report.md');
    run([now, '--against', previous, '--markdown-out', out]);
    const markdown = await readFile(out, 'utf8');
    assert.match(markdown, /nothing the pricing catalogue knows|nothing this pricing catalogue knows/);
    assert.doesNotMatch(markdown, /\$0\.00 →/);
  });
});
