import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--markdown-summary`: the short form for a reader who is not in the
 * terminal. A view over the same report, never a different set of figures.
 */

const call = (label, usd) => ({
  model: 'claude-opus-5',
  label,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const write = async (records, name = 'usage.jsonl') => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-mdsum-'));
  const path = join(dir, name);
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const render = async (argv) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-mdsum-out-'));
  const out = join(dir, 'report.md');
  const result = spawnSync(process.execPath, [CLI, 'profile', ...argv, '--markdown-out', out], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  return { result, md: await readFile(out, 'utf8') };
};

describe('--markdown-summary', () => {
  it('states what changed, the largest lever, and stops', async () => {
    const now = await write([call('rag', 10), call('chat', 2)]);
    const before = await write([call('chat', 2)], 'prev.jsonl');
    const { md } = await render([now, '--against', before, '--markdown-summary']);

    assert.match(md, /\*\*2 calls · \$12\.00\*\*/);
    assert.match(md, /\$2\.00 → \$12\.00/);
    assert.match(md, /rag/);
    assert.match(md, /The short form: what changed and the largest lever/);
    // Short by construction: none of the full report's sections appear.
    for (const section of ['By label', 'What this log cannot answer', 'Approaching the context window']) {
      assert.ok(!md.includes(section), `the summary carried the full report's "${section}"`);
    }
  });

  it('carries the same figures as the full report, never its own', async () => {
    const log = await write([call('rag', 10), call('chat', 2)]);
    const { md: full } = await render([log]);
    const { md: short } = await render([log, '--markdown-summary']);
    // The bill is one number on both, and the summary is the shorter document.
    assert.match(full, /\*\*2 calls · \$12\.00\*\*/);
    assert.match(short, /\*\*2 calls · \$12\.00\*\*/);
    assert.ok(short.length < full.length / 3, 'the summary is not meaningfully shorter');
  });

  it('says nothing about stability when there is nothing to compare against', async () => {
    // A summary with no previous log must not read as "the bill held steady".
    const { md } = await render([await write([call('rag', 10)]), '--markdown-summary']);
    assert.match(md, /No previous log was given/);
    assert.doesNotMatch(md, /→/);
  });

  it('leads with the gate verdict, as the full form does', async () => {
    const { result, md } = await render([
      await write([call('rag', 10), call('chat', 2)]),
      '--markdown-summary',
      '--max-usd',
      '8',
    ]);
    assert.equal(result.status, 1);
    assert.match(md, /> ❌ \*\*FAILED — this log spent \$12\.00/);
    // One mark here too: the summary states the verdict, not its explanation.
    assert.equal((md.match(/❌/g) ?? []).length, 1);
  });

  it('speaks Spanish', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-mdsum-es-'));
    const out = join(dir, 'report.md');
    spawnSync(
      process.execPath,
      [CLI, 'profile', await write([call('rag', 10)]), '--markdown-summary', '--markdown-out', out, '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.match(await readFile(out, 'utf8'), /La forma corta: qué cambió y la mayor palanca/);
  });
});
