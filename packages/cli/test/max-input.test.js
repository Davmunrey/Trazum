import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { MAX_INPUT_CHARS } from '../../core/dist/index.js';

/**
 * The refusal ceiling, at the doors.
 *
 * Above `MAX_INPUT_CHARS` a prompt door refuses with the size and the limit
 * named, rather than grinding; `--max-input` raises it deliberately; and the
 * inputs that are *not* prompts — a usage log on stdin — are never held to a
 * prompt's ceiling, because a 200,000-line export is the exact input `profile`
 * exists to read.
 *
 * The oversized file is one atom repeated just past the line, so the refusal
 * is provoked rather than assumed, and the raised run proves the same file is
 * fine when the person says so.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const run = (args, options = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });

const oversized = 'word '.repeat(MAX_INPUT_CHARS / 5 + 40);

describe('a prompt past the ceiling is refused, named', () => {
  it('names the size and the limit, in both locales, and exits 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-ceiling-'));
    const file = join(dir, 'big.txt');
    await writeFile(file, oversized);

    for (const locale of ['en', 'es']) {
      const result = run(['optimize', file, '--locale', locale]);
      assert.equal(result.status, 1, result.stderr);
      // The size and the limit, grouped for a reader, in the locale's digits.
      const limit = MAX_INPUT_CHARS.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
      assert.ok(result.stderr.includes(limit), `${locale}: the refusal does not name the limit`);
      assert.match(result.stderr, /--max-input/);
    }
  });

  it('is raised deliberately by --max-input, and the same file passes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-ceiling-'));
    const file = join(dir, 'big.txt');
    await writeFile(file, oversized);

    const raised = run(['optimize', file, '--max-input', String(oversized.length + 1)]);
    assert.equal(raised.status, 0, raised.stderr);

    // And lowered: a CI job that knows its prompts are small can gate tighter.
    const lowered = run(['optimize', file, '--max-input', '100'], { input: '' });
    assert.equal(lowered.status, 1);
  });

  it('refuses a --max-input that is not a positive number', () => {
    for (const bad of ['0', '-5', 'lots']) {
      const result = run(['optimize', 'anything.txt', '--max-input', bad]);
      assert.equal(result.status, 1, `--max-input ${bad} was accepted`);
      assert.match(result.stderr, /--max-input/);
    }
  });

  it('holds stdin to the same ceiling', () => {
    const result = run(['optimize', '-'], { input: oversized });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--max-input/);
  });

  it('holds the files a directory walk feeds to the same ceiling, naming the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-ceiling-'));
    await mkdir(join(dir, 'prompts'));
    await writeFile(join(dir, 'prompts', 'fine.txt'), 'Summarise the report.\n');
    await writeFile(join(dir, 'prompts', 'huge.txt'), oversized);
    const result = run(['check', join(dir, 'prompts'), '--max-tokens', '999999']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /huge\.txt/);
  });
});

describe('and what is not a prompt is not held to it', () => {
  it('reads a log bigger than the ceiling through conform without complaint', () => {
    const line = '{"model":"claude-opus-5","usage":{"input_tokens":100,"output_tokens":10}}\n';
    const log = line.repeat(Math.ceil((MAX_INPUT_CHARS * 1.5) / line.length));
    assert.ok(log.length > MAX_INPUT_CHARS, 'the probe log is not past the ceiling');
    const result = run(['conform', '-'], { input: log });
    assert.equal(result.status, 0, result.stderr.slice(0, 300));
  });
});
