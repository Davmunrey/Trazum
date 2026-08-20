import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * One cycle of watching. $1.00 = 200k input tokens on Claude Opus 5, so the
 * fixture below is $10.00 a day and $30.00 on the third.
 */

const payload = () => ({
  data: [1, 2, 3].map((d) => ({
    starting_at: `2026-08-0${d}T00:00:00Z`,
    ending_at: `2026-08-0${d + 1}T00:00:00Z`,
    results: [
      { model: 'claude-opus-5', uncached_input_tokens: 2_000_000 * (d === 3 ? 3 : 1), output_tokens: 0 },
    ],
  })),
});

const setup = async (spend = { maxUsd: 25, maxDayUsd: 15 }) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-watch-'));
  await writeFile(join(dir, 'usage.json'), JSON.stringify(payload()));
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify({ spend }));
  return dir;
};

const run = (dir, args) =>
  spawnSync(process.execPath, [CLI, 'watch', '--once', '--payload', 'usage.json', ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd: dir,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('watch', () => {
  it('reports a measured crossing, names the day, and fails the run', async () => {
    const dir = await setup();
    const result = run(dir, []);
    assert.equal(result.status, 1, 'a crossing must fail the run');
    const out = flat(result);
    assert.match(out, /CROSSED — Total spend is \$50\.00 against a limit of \$25\.00/);
    assert.match(out, /CROSSED — Spend on 2026-08-03 is \$30\.00 against a limit of \$15\.00/);
    // The rule that makes an alert at 3am trustworthy, in the copy itself.
    assert.match(out, /Measured, not projected/);
  });

  it('does not re-alert after a restart — and does not call it clean either', async () => {
    const dir = await setup();
    run(dir, []);
    const second = run(dir, []);
    // Quiet is not clean: the budget is still blown, and the run still fails.
    assert.equal(second.status, 1);
    const out = flat(second);
    assert.match(out, /STILL OVER — Total spend is \$50\.00/);
    assert.match(out, /Quiet is not clean/);
    assert.doesNotMatch(out, /Within every threshold/);
  });

  it('says it is within the thresholds only when it actually is', async () => {
    const dir = await setup({ maxUsd: 1000, maxDayUsd: 1000 });
    const result = run(dir, []);
    assert.equal(result.status, 0);
    assert.match(flat(result), /Within every threshold: 2 gates evaluated against measured spend/);
  });

  it('remembers where it got to, and names the stretch nobody watched', async () => {
    const dir = await setup();
    run(dir, []);
    const state = JSON.parse(await readFile(join(dir, '.trazum/watch.json'), 'utf8'));
    assert.equal(state.v, 1);
    assert.ok(state.lastCoveredToMs > 0);
    assert.ok(Object.keys(state.fired).length >= 1, 'the crossing is on record');
  });

  it('refuses a webhook that would leak, before sending anything', async () => {
    const dir = await setup();
    const credentials = run(dir, ['--webhook', 'https://user:secret@alerts.example.com/h']);
    assert.equal(credentials.status, 1);
    assert.match(flat(credentials), /URLs end up in logs/);

    const plain = run(dir, ['--webhook', 'http://alerts.example.com/h']);
    assert.equal(plain.status, 1);
    assert.match(flat(plain), /must be https, except on loopback/);
  });

  it('refuses to watch with no threshold, and to loop too tightly', async () => {
    const bare = await setup({});
    const noGates = run(bare, []);
    assert.equal(noGates.status, 1);
    assert.match(flat(noGates), /a watcher with no threshold is a green light nobody earned/);

    const dir = await setup();
    const tight = spawnSync(
      process.execPath,
      [CLI, 'watch', '--interval', '1m', '--payload', 'usage.json'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000, cwd: dir },
    );
    assert.equal(tight.status, 1);
    assert.match(flat(tight), /at least 5m/);
  });

  it('emits the cycle as data, provenance included', async () => {
    const dir = await setup();
    const result = run(dir, ['--json']);
    const doc = JSON.parse(result.stdout);
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.crossings.length, 2);
    // A machine reader gets the provenance too.
    assert.ok(doc.crossings.every((crossing) => crossing.provenance === 'measured'));
    assert.deepEqual(doc.suppressed, []);
  });

  it('speaks Spanish', async () => {
    const dir = await setup();
    assert.match(flat(run(dir, ['--locale', 'es'])), /CRUZADO — El gasto total es \$50\.00/);
  });
});
