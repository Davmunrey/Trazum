import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--dry-run`: what the log could answer, and no bill. The question somebody
 * has before wiring CI, answered without making them read a report to
 * discover a missing field.
 */

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-dryrun-'));
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

describe('--dry-run', () => {
  it('states readiness per capability and produces no dollar figure at all', async () => {
    const log = await write([
      { model: 'claude-opus-5', label: 'chat', session: 'a', ts: '2026-08-01T09:00:00Z', usage: { input_tokens: 200_000, output_tokens: 0 } },
    ]);
    const result = run([log, '--dry-run']);
    assert.equal(result.status, 0);
    const out = flat(result);
    assert.match(out, /no bill was produced/);
    assert.match(out, /"label" on 100\.0% of records/);
    assert.match(out, /a session on 100\.0% of records/);
    assert.match(out, /a stop reason on 0\.0% of records/);
    // No dollars anywhere: nothing here can be mistaken for spend.
    assert.doesNotMatch(out, /\$\d/);
    // The session key never prints, dry run included.
    assert.ok(!out.includes('"a"'), 'a session key leaked');
  });

  it('names unpriced models — their tokens parse, their dollars need an overlay', async () => {
    // A Gemini-shaped record on a model the catalogue does not know: the
    // shape parses (that is this release's feature) and the pricing gap is
    // named, which is the dry run's whole job.
    const log = await write([
      { model: 'gemini-imaginary-9', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } },
    ]);
    const out = flat(run([log, '--dry-run']));
    assert.match(out, /price table does not know: gemini-imaginary-9/);
    assert.match(out, /need a --pricing overlay/);
  });

  it('distinguishes "no cache traffic" from a missing split', async () => {
    const none = flat(run([await write([{ model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 0 } }]), '--dry-run']));
    assert.match(none, /nothing wrote to the cache in this log/);

    const flatWrite = flat(run([await write([
      { model: 'claude-opus-5', usage: { input_tokens: 100, cache_creation_input_tokens: 5000, output_tokens: 0 } },
    ]), '--dry-run']));
    assert.match(flatWrite, /"cache_creation" split on 0 of 1 cache-writing records/);
  });

  it('refuses to run beside a gate, which would exit green having judged nothing', async () => {
    const log = await write([{ model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 0 } }]);
    const result = run([log, '--dry-run', '--max-usd', '5']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /Run the gates without --dry-run/);
  });

  it('fails when nothing parses, because an unreadable log is not a ready one', async () => {
    const log = await write([]);
    const dir = await mkdtemp(join(tmpdir(), 'trazum-dryrun-bad-'));
    const path = join(dir, 'usage.jsonl');
    await writeFile(path, 'not json\nnot json either\n');
    const result = run([path, '--dry-run']);
    assert.equal(result.status, 1);
  });

  it('speaks Spanish', async () => {
    const log = await write([{ model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 0 } }]);
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--dry-run', '--locale', 'es'], {
      encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
    });
    assert.match(flat(result), /no se ha producido factura/);
  });
});
