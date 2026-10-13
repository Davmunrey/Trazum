import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, chmodSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, after } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), 'trazum-filter-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
const noise = Buffer.from('Polling build queue; no state change yet.\n'.repeat(300));
const key = createHash('sha256').update(noise).digest('hex');
const run = (args, input) => spawnSync(process.execPath, [CLI, 'filter', ...args], { input, env: SPAWN_ENV, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
const store = (name) => join(root, name);

describe('trazum-filter display pipeline', () => {
  it('writes the original before returning a recoverable view and restores exact bytes', () => {
    const dir = store('roundtrip');
    const result = run(['compact', '--recovery-dir', dir], noise);
    assert.equal(result.status, 0);
    assert.match(result.stdout.toString(), /repeated 299 additional times/);
    assert.ok(result.stdout.length < noise.length);
    assert.deepEqual(readFileSync(join(dir, `${key}.log`)), noise);
    assert.deepEqual(run(['restore', key, '--recovery-dir', dir]).stdout, noise);
    assert.equal(run(['compact', '--recovery-dir', dir], noise).status, 0);
    assert.equal(readdirSync(dir).length, 1);
    if (process.platform !== 'win32') {
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      assert.equal(statSync(join(dir, `${key}.log`)).mode & 0o777, 0o600);
    }
  });
  it('passes short, binary and oversized input byte-for-byte', () => {
    for (const input of [Buffer.from('hello\n'), Buffer.from([0xff, 0xfe, 0x00]), Buffer.alloc(1200000, 65)]) {
      const result = run(['compact', '--recovery-dir', store('unused')], input);
      assert.equal(result.status, 0);
      assert.deepEqual(result.stdout, input);
    }
  });
  it('passes through if recovery cannot be saved', () => {
    const path = store('not-a-directory');
    writeFileSync(path, 'block');
    const result = run(['compact', '--recovery-dir', path], noise);
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout, noise);
    assert.match(result.stderr.toString(), /unchanged/);
  });
  it('refuses tampered originals and invalid identifiers without emitting content', () => {
    const dir = store('tampered');
    run(['compact', '--recovery-dir', dir], noise);
    writeFileSync(join(dir, `${key}.log`), 'tampered');
    for (const id of [key, '../secrets', 'g'.repeat(64)]) {
      const result = run(['restore', id, '--recovery-dir', dir]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout.length, 0);
    }
    assert.deepEqual(run(['compact', '--recovery-dir', dir], noise).stdout, noise);
  });
  it('rejects symlinks and an overly broad directory on POSIX', { skip: process.platform === 'win32' }, () => {
    const dir = store('permissions');
    run(['compact', '--recovery-dir', dir], noise);
    chmodSync(dir, 0o755);
    assert.deepEqual(run(['compact', '--recovery-dir', dir], noise).stdout, noise);
    assert.equal(run(['restore', key, '--recovery-dir', dir]).status, 1);
    chmodSync(dir, 0o700);
    const linked = store('linked');
    symlinkSync(dir, linked);
    assert.deepEqual(run(['compact', '--recovery-dir', linked], noise).stdout, noise);
    rmSync(join(dir, `${key}.log`));
    const target = store('target');
    writeFileSync(target, noise);
    symlinkSync(target, join(dir, `${key}.log`));
    assert.equal(run(['restore', key, '--recovery-dir', dir]).status, 1);
  });
  it('rejects FIFO recovery files without blocking restore or compact', { skip: process.platform === 'win32' }, () => {
    const dir = store('fifo');
    run(['compact', '--recovery-dir', dir], noise);
    const path = join(dir, `${key}.log`);
    rmSync(path);
    const created = spawnSync('mkfifo', [path], { env: SPAWN_ENV, timeout: 5000 });
    assert.equal(created.error, undefined);
    assert.equal(created.status, 0);
    const restore = run(['restore', key, '--recovery-dir', dir]);
    assert.equal(restore.error, undefined, 'restore must finish without its child-process timeout');
    assert.equal(restore.status, 1);
    assert.equal(restore.stdout.length, 0);
    assert.match(restore.stderr.toString(), /Invalid recovery file/);
    const compact = run(['compact', '--recovery-dir', dir, '--stats'], noise);
    assert.equal(compact.error, undefined, 'compact must finish without its child-process timeout');
    assert.equal(compact.status, 0);
    assert.deepEqual(compact.stdout, noise);
    const stats = JSON.parse(compact.stderr);
    assert.equal(stats.reason, 'storage-failed');
    assert.equal(stats.applied, false);
    assert.equal(stats.estimatedTokensSaved, 0);
  });
  it('preserves producer errors with pipefail and never merges stderr into the filter', { skip: process.platform === 'win32' }, () => {
    const result = spawnSync('bash', ['-o', 'pipefail', '-c',
      '(printf "ok\\n"; printf "ERROR original\\n" >&2; exit 7) | node packages/cli/dist/index.js filter compact --recovery-dir ./unused-recovery'],
    { cwd: new URL('../../../', import.meta.url), encoding: 'utf8', env: SPAWN_ENV, timeout: 10000 });
    assert.equal(result.status, 7);
    assert.equal(result.stdout, 'ok\n');
    assert.equal(result.stderr, 'ERROR original\n');
  });
  it('compacts with network access disabled', () => {
    const stub = store('no-network.mjs');
    writeFileSync(stub, "globalThis.fetch = () => { throw new Error('Unexpected network'); };\n");
    const result = spawnSync(process.execPath, ['--import', stub, CLI, 'filter', 'compact',
      '--recovery-dir', store('offline')], { input: noise, env: SPAWN_ENV, timeout: 10000 });
    assert.equal(result.status, 0);
    assert.match(result.stdout.toString(), /repeated 299 additional times/);
  });
  it('reports net estimated savings without changing stdout or exposing content and paths', () => {
    const dir = store('stats');
    const plain = run(['compact', '--recovery-dir', dir], noise);
    const result = run(['compact', '--recovery-dir', dir, '--stats'], noise);
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout, plain.stdout);
    const stats = JSON.parse(result.stderr);
    assert.equal(stats.schemaVersion, 1);
    assert.equal(stats.estimateOnly, true);
    assert.equal(stats.applied, true);
    assert.equal(stats.inputBytes, noise.length);
    assert.equal(stats.outputBytes, result.stdout.length);
    assert.equal(stats.estimatedTokensSaved, stats.estimatedTokensBefore - stats.estimatedTokensAfter);
    assert.ok(stats.estimatedTokensSaved >= 128);
    assert.ok(stats.estimatedReductionPercent >= 20);
    assert.equal(stats.repeatedLines, 299);
    assert.ok(!result.stderr.includes(dir));
    assert.ok(!result.stderr.includes('Polling'));
    assert.ok(!result.stderr.includes(key));
    assert.deepEqual(run(['compact', '--stats', '--recovery-dir', dir], noise).stdout, plain.stdout);
  });
  it('reports zero savings when persistence fails, even if compaction was worthwhile', () => {
    const path = store('stats-blocked');
    writeFileSync(path, 'block');
    const result = run(['compact', '--recovery-dir', path, '--stats'], noise);
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout, noise);
    const stats = JSON.parse(result.stderr);
    assert.equal(stats.reason, 'storage-failed');
    assert.equal(stats.applied, false);
    assert.equal(stats.estimatedTokensSaved, 0);
    assert.equal(stats.estimatedReductionPercent, 0);
    assert.equal(stats.repeatedLines, 0);
    assert.equal(stats.outputBytes, noise.length);
  });
  it('distinguishes unchanged text from unknown token counts for binary and oversized streams', () => {
    for (const input of [Buffer.from('hello\n'), Buffer.from([0xff, 0xfe]), Buffer.alloc(1200000, 65)]) {
      const result = run(['compact', '--recovery-dir', store('stats-unused'), '--stats'], input);
      assert.equal(result.status, 0);
      assert.deepEqual(result.stdout, input);
      const stats = JSON.parse(result.stderr);
      assert.equal(stats.applied, false);
      assert.equal(stats.inputBytes, input.length);
      assert.equal(stats.outputBytes, input.length);
      if (input.toString() === 'hello\n') {
        assert.equal(stats.reason, 'unchanged');
        assert.equal(stats.estimatedTokensSaved, 0);
      } else {
        assert.equal(stats.reason, input.length > 1000000 ? 'stream-limit' : 'invalid-utf8');
        assert.equal(stats.estimatedTokensBefore, null);
        assert.equal(stats.estimatedTokensAfter, null);
        assert.equal(stats.estimatedTokensSaved, null);
        assert.equal(stats.estimatedReductionPercent, null);
      }
    }
  });
  it('rejects invalid arguments and emits opt-in instructions without a store', () => {
    assert.equal(run(['compact'], noise).status, 1);
    assert.equal(run(['compact', '--recovery-dir', 'x', '--unknown'], noise).status, 1);
    assert.equal(run(['compact', '--recovery-dir', 'x', '--stats', '--stats'], noise).status, 1);
    assert.equal(run(['restore', key, '--recovery-dir', 'x', '--stats']).status, 1);
    const output = run(['instructions']);
    assert.equal(output.status, 0);
    assert.match(output.stdout.toString(), /correctness/);
  });
});
