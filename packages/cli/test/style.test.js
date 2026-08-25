import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * The 1.75 chapter-four guard: colour adds nothing, and hides nothing.
 *
 * The same command runs twice over the same fixture — once painted
 * (FORCE_COLOR=1), once plain (NO_COLOR under a pipe). Stripping the ANSI
 * codes from the painted run must leave the plain run, byte for byte.
 * Decoration that survives the strip is content (the rules and the bars are,
 * on purpose — they print for a pipe too); content that appears only when
 * painted would be information hiding in a channel a pipe cannot see. One
 * assertion, both defects.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const ANSI = /\u001b\[[0-9;]*m/g;

const run = (args, env) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

const LOG = [
  { ts: '2026-08-01T10:00:00Z', model: 'claude-opus-5', label: 'support', usage: { input_tokens: 40000, output_tokens: 2000 } },
  { ts: '2026-08-05T10:00:00Z', model: 'claude-sonnet-5', label: 'etl', usage: { input_tokens: 9000, output_tokens: 400, cache_read_input_tokens: 30000 } },
  { ts: '2026-08-10T10:00:00Z', model: 'claude-opus-5', label: 'support', usage: { input_tokens: 41000, output_tokens: 1900 } },
]
  .map((line) => JSON.stringify(line))
  .join('\n');

describe('colour adds nothing', () => {
  it('a painted profile, stripped, is the plain profile byte for byte', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-style-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(file, LOG);

    const painted = run(['profile', file], { FORCE_COLOR: '1' });
    const plain = run(['profile', file], { NO_COLOR: '1' });
    assert.equal(painted.status, 0, painted.stderr);
    assert.equal(plain.status, 0, plain.stderr);

    // The painted run actually painted — otherwise this guard guards nothing.
    assert.notEqual(painted.stdout, plain.stdout, 'FORCE_COLOR produced no colour');
    assert.match(painted.stdout, ANSI);
    assert.equal(painted.stdout.replace(ANSI, ''), plain.stdout);
  });

  it('models and switch hold the same contract', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-style-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(file, LOG);

    for (const args of [['models'], ['switch', file, '--to', 'claude-haiku-4-5']]) {
      const painted = run(args, { FORCE_COLOR: '1' });
      const plain = run(args, { NO_COLOR: '1' });
      assert.equal(painted.status, 0, painted.stderr);
      assert.equal(
        painted.stdout.replace(ANSI, ''),
        plain.stdout,
        `${args[0]}: stripped colour output differs from plain output`,
      );
    }
  });

  it('a pipe stays plain: no ANSI reaches a non-TTY without FORCE_COLOR', async () => {
    // Every `trazum ... | grep` in somebody's script is owed the bytes their
    // script was written against. The tests themselves run under a pipe, so
    // this is also the guard on every other test's regexes.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-style-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(file, LOG);
    const out = run(['profile', file], {});
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout.includes('\u001b['), false, 'ANSI escaped into piped output');
  });

  it('the section rule and the proportion bar are content, not paint', async () => {
    // The heading rule and the bar survive the strip by design: they carry
    // layout a pipe reader also deserves. Their glyphs must appear in the
    // plain run — a rule that exists only when painted would fail the parity
    // above, but a rule that quietly disappeared everywhere would pass it.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-style-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(file, LOG);
    const plain = run(['profile', file], { NO_COLOR: '1' });
    assert.match(plain.stdout, /─{3,}/, 'no section rule in the plain profile');
    assert.match(plain.stdout, /[█░]{10}/, 'no proportion bar in the plain profile');
  });
});
