import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum conform`, end to end.
 *
 * The command that turns the contracts into something a third party can build
 * against. Its whole design is one distinction, and every case here is about
 * it: **problems gate, gaps do not.** A usage log with no `session` is
 * perfectly conformant and simply has no conversation growth in it, and a
 * check that failed on that would be Trazum telling somebody what to record.
 */

const run = async (body, args = [], name = 'input.jsonl') => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-conform-'));
  const path = join(dir, name);
  await writeFile(path, body);
  return spawnSync(process.execPath, [CLI, 'conform', path, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const record = (over = {}) =>
  JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 100 }, ...over });

describe('trazum conform', () => {
  it('exits 0 on a conforming log and names the contract', async () => {
    const result = await run(`${record()}\n${record()}\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /reads as a usage-log: 2 records/);
    assert.match(result.stdout, /It conforms/);
  });

  it('exits 1 on a problem, naming the line and the reason', async () => {
    const result = await run(`${record()}\nnot json\n`);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /line 2/);
    assert.match(result.stdout, /unreadable/);
  });

  it('exits 0 when the only findings are gaps', async () => {
    /**
     * The distinction the command exists for. A minimal log conforms and buys
     * itself out of most of the product; the exit code must not confuse "you
     * did something wrong" with "you decided not to record something".
     */
    const result = await run(`${record()}\n`);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /What this cannot answer/);
    assert.match(result.stdout, /None of those failed anything/);
  });

  it('names the field that would unlock each gap', async () => {
    // A gap named without its fix is a complaint. Every entry ends in what to
    // add, so somebody can act on it without opening the documentation.
    const { stdout } = await run(`${record()}\n`);
    assert.match(stdout, /Add a "label"/);
    assert.match(stdout, /Add cache_read_input_tokens/);
  });

  it('stops naming a gap once a record fills it', async () => {
    const full = record({
      label: 'classify',
      timestamp: '2026-08-01T00:00:00Z',
      session: 'c1',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      },
    });
    const { stdout, status } = await run(`${full}\n`);
    assert.equal(status, 0);
    assert.doesNotMatch(stdout, /What this cannot answer/);
  });

  it('refuses an unrecognised document with what each contract looks like', async () => {
    // Never a bare "invalid": that sends somebody to read the source. A list
    // of distinguishing fields sends them to their own file.
    const result = await run(JSON.stringify({ schemaVersion: 1, hello: 'world' }), [], 'thing.json');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /does not match any contract/);
    assert.match(result.stdout, /byLabelAndModel/);
  });

  it('checks against a named contract when told which', async () => {
    const result = await run(`${record()}`, ['--contract', 'usage-log'], 'one.json');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /usage-log: 1 record/);
  });

  it('refuses a contract name nobody wrote, listing the ones that exist', async () => {
    const result = await run(`${record()}\n`, ['--contract', 'nonsense']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not a contract/);
    assert.match(result.stderr, /usage-log/);
  });

  it('reads a real profile document back', async () => {
    /**
     * The round trip that matters most: the checker must accept what this
     * repository's own commands emit, or the contract it describes is not the
     * contract in force.
     */
    const dir = await mkdtemp(join(tmpdir(), 'trazum-conform-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, `${record({ label: 'classify' })}\n`);
    const profiled = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(profiled.status, 0, profiled.stderr);

    const doc = join(dir, 'report.json');
    await writeFile(doc, profiled.stdout);
    const checked = spawnSync(process.execPath, [CLI, 'conform', doc], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.match(checked.stdout, /reads as a profile document/);
  });

  it('emits the report as data, and still gates', async () => {
    const bad = await run(`not json\n`, ['--json']);
    assert.equal(bad.status, 1);
    const report = JSON.parse(bad.stdout);
    assert.equal(report.conforms, false);
    assert.equal(report.schemaVersion, 1);

    const good = await run(`${record()}\n`, ['--json']);
    assert.equal(good.status, 0);
    assert.equal(JSON.parse(good.stdout).conforms, true);
  });

  it('asks for a file rather than assuming one', async () => {
    const result = spawnSync(process.execPath, [CLI, 'conform'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass a file/);
  });
});
