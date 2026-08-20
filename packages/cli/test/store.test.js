import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The store on disk: convergence across pulls, an inventory that says what it
 * holds, and a prune that refuses without a policy and says what went.
 *
 * $1.00 = 200k input tokens on Claude Opus 5, as everywhere in this suite.
 */

const payload = (days) => ({
  data: Array.from({ length: days }, (_, i) => ({
    starting_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    ending_at: `2026-08-${String(i + 2).padStart(2, '0')}T00:00:00Z`,
    results: [{ model: 'claude-opus-5', uncached_input_tokens: 200_000, output_tokens: 0 }],
  })),
});

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-store-'));
  await writeFile(join(dir, 'usage.json'), JSON.stringify(payload(4)));
  return dir;
};

const run = (dir, args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd: dir,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const fill = (dir) => run(dir, ['connect', 'anthropic', '--payload', 'usage.json', '--store']);

describe('the store on disk', () => {
  it('keeps what a pull measured, and says how much', async () => {
    const dir = await setup();
    const result = fill(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /Kept 4 measurements in \.trazum\/store/);

    const inventory = run(dir, ['store']);
    assert.equal(inventory.status, 0, inventory.stderr);
    const out = flat(inventory);
    // Four days at $1.00 each.
    assert.match(out, /The store: 4 measurements · \$4\.00/);
    assert.match(out, /anthropic 4 measurements/);
    // What it holds is stated, including what it never holds.
    assert.match(out, /Never prompt text, never completion text, never a credential/);
  });

  it('converges when the same window is pulled again, instead of doubling', async () => {
    const dir = await setup();
    fill(dir);
    fill(dir);
    fill(dir);
    const out = flat(run(dir, ['store']));
    // Three identical pulls are one fact restated three times.
    assert.match(out, /The store: 4 measurements · \$4\.00/);
  });

  it('refuses to prune without a retention policy, naming both ways to set one', async () => {
    const dir = await setup();
    fill(dir);
    const result = run(dir, ['store', '--prune']);
    assert.equal(result.status, 1);
    const out = flat(result);
    assert.match(out, /keepDays/);
    assert.match(out, /--keep 90d/);
    assert.match(out, /not a default you should get by accident/);
  });

  it('says what a prune would take before taking it, and takes nothing on --dry-run', async () => {
    const dir = await setup();
    fill(dir);
    const dry = run(dir, ['store', '--prune', '--keep', '1d', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    const out = flat(dry);
    assert.match(out, /would delete 4 measurements older than 1 days/);
    assert.match(out, /\$4\.00 of measured spend/);
    assert.match(out, /Nothing was deleted/);
    // And nothing did go.
    assert.match(flat(run(dir, ['store'])), /4 measurements/);
  });

  it('prunes with the span and the money it removed named', async () => {
    const dir = await setup();
    fill(dir);
    const result = run(dir, ['store', '--prune', '--keep', '1d']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Deleted 4 measurements older than 1 days/);
    assert.match(out, /2026-08-01 → 2026-08-05/);
    assert.match(out, /\$4\.00 of measured spend/);
    // The store is empty afterwards, and says so as a state rather than $0.
    assert.match(flat(run(dir, ['store'])), /is empty/);
  });

  it('reads a config retention policy when no flag is given', async () => {
    const dir = await setup();
    fill(dir);
    await writeFile(join(dir, 'trazum.config.json'), JSON.stringify({ store: { keepDays: 1 } }));
    const result = run(dir, ['store', '--prune', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /older than 1 days/);
  });

  it('keeps a broken line from costing the whole month', async () => {
    const dir = await setup();
    fill(dir);
    const file = join(dir, '.trazum/store/anthropic/2026-08.jsonl');
    const text = await readFile(file, 'utf8');
    await writeFile(file, `${text}not json at all\n`);
    const result = run(dir, ['store']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /4 measurements/, 'the readable records survive');
    assert.match(out, /would not parse/);
    assert.match(out, /one broken line must not lose a month/);
  });

  it('names records it cannot tell apart rather than merging them', async () => {
    const dir = await setup();
    await mkdir(join(dir, '.trazum/store/anthropic'), { recursive: true });
    const ambiguous = JSON.stringify({
      v: 1, provider: 'anthropic', fromMs: Date.UTC(2026, 7, 1), toMs: Date.UTC(2026, 7, 1),
      model: 'claude-opus-5', calls: null, input: 200_000, cacheRead: 0, write5m: 0, write1h: 0,
      ttlKnown: true, output: 0, group: {}, pulledAtMs: Date.UTC(2026, 7, 2),
    });
    await writeFile(join(dir, '.trazum/store/anthropic/2026-08.jsonl'), `${ambiguous}\n${ambiguous}\n`);
    const out = flat(run(dir, ['store']));
    assert.match(out, /2 records could not be told apart/);
    assert.match(out, /may count the same spend twice/);
  });

  it('is empty as a state, not as zero spend', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-store-'));
    const result = run(dir, ['store']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /is empty.*trazum connect/);
  });

  it('builds a series from the store, with the label series absent and said to be', async () => {
    const dir = await setup();
    await writeFile(join(dir, 'usage.json'), JSON.stringify(payload(5)));
    fill(dir);
    const result = run(dir, ['history', '--store']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /The long run: 5 periods/);
    // No request count in this source: no call count in the rows, and no zero.
    assert.doesNotMatch(out, /0 calls/);
    assert.match(out, /no label series here at all/);
    assert.match(out, /Absent, not empty/);
  });

  it('speaks Spanish', async () => {
    const dir = await setup();
    fill(dir);
    assert.match(flat(run(dir, ['store', '--locale', 'es'])), /El almacén: 4 mediciones/);
  });
});
