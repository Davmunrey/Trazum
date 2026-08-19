import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Rotated logs are gzipped, and that is the normal case rather than an exotic
 * one: logrotate, Docker's json-file driver and every cloud log export
 * compress yesterday's file. A month's directory is one plain file and
 * twenty-nine `.gz` ones, so reading only the plain one would report a
 * month's bill from a day of it — in the flattering direction.
 *
 * Hand arithmetic: 200k input tokens on Claude Opus 5 are $1.00.
 */

const record = (usd) =>
  JSON.stringify({
    model: 'claude-opus-5',
    label: 'chat',
    usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  });

const run = (path, argv = []) =>
  spawnSync(process.execPath, [CLI, 'profile', path, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('gzipped usage logs', () => {
  it('reads a single .jsonl.gz file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    const log = join(dir, 'usage.jsonl.gz');
    await writeFile(log, gzipSync(`${record(2)}\n`));
    const result = run(log);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /1 call · \$2\.00/);
  });

  it('reads a directory mixing plain and gzipped days as one bill', async () => {
    // Today's file is plain, yesterday's is compressed — exactly what a
    // rotation leaves behind. $1.00 + $2.00 = $3.00, and reading only the
    // plain one would have reported a third of the bill.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    await writeFile(join(dir, '2026-08-02.jsonl'), `${record(1)}\n`);
    await writeFile(join(dir, '2026-08-01.jsonl.gz'), gzipSync(`${record(2)}\n`));
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /2 calls · \$3\.00/);
    assert.match(out, /Read 2 log files/);
  });

  it('joins a gzipped file with no trailing newline to the next one cleanly', async () => {
    // The same trap the plain reader had: without the newline the last record
    // of one file glues to the first of the next and both are unreadable.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    await writeFile(join(dir, 'a.jsonl.gz'), gzipSync(record(1)));
    await writeFile(join(dir, 'b.jsonl.gz'), gzipSync(record(1)));
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /2 calls · \$2\.00/);
  });

  it('stops on a .gz that will not decompress, naming the file', async () => {
    // Skipping it would report a bill missing whatever that file held, and
    // say nothing — the flattering silence this repository refuses.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    await writeFile(join(dir, 'good.jsonl'), `${record(1)}\n`);
    await writeFile(join(dir, 'broken.jsonl.gz'), Buffer.from('this is not gzip at all'));
    const result = run(dir);
    assert.notEqual(result.status, 0);
    const out = flat(result);
    assert.match(out, /broken\.jsonl\.gz is gzipped and would not decompress/);
    assert.match(out, /would report a bill missing whatever that file held/);
  });

  it('does not decompress a file that merely starts with gzip bytes', async () => {
    // Decided by extension, not by sniffing: a .jsonl whose contents start
    // with 0x1f8b is far more likely a corrupt log than a mislabelled
    // archive, and treating it as an archive hides a diagnosable error.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from(`\n${record(1)}\n`)]));
    const result = run(log);
    // The bad first line is reported as unreadable, and the good one is billed.
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /1 call · \$1\.00/);
  });

  it('names the gzipped extensions when a directory holds nothing readable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-gz-'));
    await writeFile(join(dir, 'notes.txt'), 'nothing to profile here\n');
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.match(flat(result), /\.jsonl\.gz/);
  });
});
