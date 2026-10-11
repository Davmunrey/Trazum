import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * A summed row on a model priced by prompt length, said as a range everywhere.
 *
 * Claude Haiku 5.5 is billed per request: $0.10/$0.50 for a prompt up to
 * 100,000 tokens, $0.50/$2.50 over it. A usage report's bucket sums requests
 * and gives no single prompt's length, so the core bills it at the dearer rate
 * and keeps what the same tokens cost at the cheaper one. A total that is
 * five times the cheaper figure and does not say so would be right and
 * useless; this holds every surface a person or a machine reads to printing
 * both ends.
 *
 * The row: 400,000 input and 50,000 output tokens, `requests: null`. Ceiling
 * $0.20 + $0.125 = $0.325; floor $0.04 + $0.025 = $0.065. Beside it one call
 * that says its own prompt, 30,000 input and 5,000 output, decided at $0.0055.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const LOG = [
  '{"ts":"2026-10-05T00:00:00Z","model":"claude-haiku-5-5","requests":null,"usage":{"input_tokens":400000,"output_tokens":50000}}',
  '{"ts":"2026-10-05T12:00:00Z","model":"claude-haiku-5-5","usage":{"input_tokens":30000,"output_tokens":5000}}',
].join('\n');

const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en' },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-ceiling-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, LOG);
  return { dir, path };
}

const flat = (text) => text.replace(/\s+/g, ' ');
const saysRange = (text, where) => {
  const said = flat(text);
  assert.match(said, /1 row on claude-haiku-5-5 sums requests/, `${where} does not name the summed row`);
  assert.match(said, /\$0\.3250 of this total/, `${where} does not give the ceiling`);
  assert.match(said, /come to \$0\.0650/, `${where} does not give the floor`);
};

describe('a ceiling, with its floor, wherever the bill is read', () => {
  it('profile prints it beside the total', async () => {
    const { path } = await scratch();
    const result = run(['profile', path]);
    assert.equal(result.status, 0, result.stderr);
    saysRange(result.stdout, 'profile');
  });

  it('bill prints it in the statement', async () => {
    const { path } = await scratch();
    const result = run(['bill', path, '--table']);
    assert.equal(result.status, 0, result.stderr);
    saysRange(result.stdout, 'the bill statement');
    assert.match(flat(result.stdout), /\$0\.3305 across 2 priced call\(s\)/, 'the total is not the ceiling plus the decided call');
  });

  it('the receipt carries it as a gap a machine can read, and says it on stderr', async () => {
    const { path } = await scratch();
    const result = run(['bill', path, '--receipt']);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    const gap = receipt.gaps.find((entry) => entry.kind === 'tier-ceiling');
    assert.ok(gap, 'the receipt has no tier-ceiling gap');
    assert.equal(gap.calls, 1);
    assert.deepEqual(gap.models, ['claude-haiku-5-5']);
    assert.ok(Math.abs(gap.ceilingUsd - 0.325) < 1e-9, `ceiling ${gap.ceilingUsd}`);
    assert.ok(Math.abs(gap.floorUsd - 0.065) < 1e-9, `floor ${gap.floorUsd}`);
    saysRange(result.stderr, 'the receipt summary');
  });

  it('the documents for whoever pays carry it among their caveats', async () => {
    const { dir, path } = await scratch();
    const html = join(dir, 'bill.html');
    const markdown = join(dir, 'bill.md');
    const result = run(['bill', path, '--receipt', '--html-out', html, '--markdown-out', markdown]);
    assert.equal(result.status, 0, result.stderr);
    saysRange((await readFile(html, 'utf8')).replace(/<[^>]+>/g, ' '), 'the HTML');
    saysRange(await readFile(markdown, 'utf8'), 'the Markdown');
  });

  it('and says nothing of the kind when every call gave its prompt', async () => {
    const { dir } = await scratch();
    const path = join(dir, 'calls.jsonl');
    await writeFile(path, LOG.split('\n')[1]);
    const result = run(['profile', path]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /sums requests/);
  });
});
