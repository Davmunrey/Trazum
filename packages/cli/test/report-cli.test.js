import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum report --year`, end to end.
 *
 * The tests are about what an annual report usually gets away with: a total
 * over a year it only partly covers, three outcomes collapsed into two, and a
 * confident figure for something nobody measured.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'report', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const calls = (day, n, outcome) =>
  Array.from({ length: n }, () => ({
    model: 'claude-opus-5',
    label: 'app',
    timestamp: `${day}T10:00:00Z`,
    ...(outcome === undefined ? {} : { outcome }),
    usage: { input_tokens: 200_000, output_tokens: 0 },
  }));

const workspace = async (records, config) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-report-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  if (config !== undefined) {
    await writeFile(join(dir, 'trazum.config.json'), `${JSON.stringify(config)}\n`);
  }
  return dir;
};

describe('trazum report --year', () => {
  it('names the months it does not have rather than printing a bare total', async () => {
    const dir = await workspace([...calls('2026-01-15', 10), ...calls('2026-02-15', 10)]);
    const { stdout, status } = run(dir, ['usage.jsonl', '--year', '2026']);
    assert.equal(status, 0);
    const text = flat(stdout);
    assert.match(text, /over 2 recorded months/);
    assert.match(text, /No record at all for 2026-03/);
    assert.match(text, /wrong by the rest and says nothing about it/);
  });

  it('keeps three outcomes for promises, never two', async () => {
    const dir = await workspace(calls('2026-01-15', 10));
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /arrived, .* did not, and .* could not be judged/);
    assert.match(text, /Three outcomes, never two/);
  });

  it('reports no outcomes as an absence, never a rate of zero', async () => {
    // An uninstrumented year and a failing year are different sentences.
    const dir = await workspace(calls('2026-01-15', 10));
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /not a success rate of zero/);
    assert.match(text, /an uninstrumented year and a failing year are different sentences/i);
  });

  it('lists what it cannot say', async () => {
    /**
     * The section an annual report is usually missing, and the reason this one
     * is worth trusting: a document that lists its own blind spots is a
     * document somebody can act on the rest of.
     */
    const dir = await workspace(calls('2026-01-15', 10));
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /What this record cannot say/);
    assert.match(text, /what happened in the months with no record/);
    assert.match(text, /because no plan was made/);
  });

  it('says every figure came from a document that already exists', async () => {
    const dir = await workspace(calls('2026-01-15', 10));
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /comes from the store and the plans you already keep/);
    assert.match(text, /quoted out of the room it was written in/);
  });

  it('counts outcomes for the year when they were recorded', async () => {
    const dir = await workspace(
      [...calls('2026-01-15', 6, 'resolved'), ...calls('2026-01-16', 4)],
      { outcomes: { values: ['resolved'], success: ['resolved'] } },
    );
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /6 of 10 calls recorded an outcome/);
  });

  it('ignores months from another year', async () => {
    const dir = await workspace([...calls('2025-12-15', 50), ...calls('2026-01-15', 10)]);
    const text = flat(run(dir, ['usage.jsonl', '--year', '2026']).stdout);
    assert.match(text, /across 10 calls/);
  });

  it('emits the record as JSON on request, and it conforms', async () => {
    const dir = await workspace(calls('2026-01-15', 10));
    const { stdout } = run(dir, ['usage.jsonl', '--year', '2026', '--json']);
    // Parsed whole, not from the first `{`. Slicing to the first brace was how
    // this assertion passed while the command printed the human report in front
    // of the document — a step no consumer can take, hiding the fact that
    // `| jq` and `| trazum conform -` both failed on it.
    const record = JSON.parse(stdout);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.year, '2026');
    assert.ok(Array.isArray(record.cannotSay));
    // The figure the document refuses to produce is absent, not zero.
    assert.equal(record.promises.arrivedUsd, undefined);
  });

  it('requires a four-digit year', async () => {
    const dir = await workspace(calls('2026-01-15', 10));
    assert.equal(run(dir, ['usage.jsonl']).status, 1);
    assert.equal(run(dir, ['usage.jsonl', '--year', '26']).status, 1);
    assert.match(flat(run(dir, ['usage.jsonl']).stderr), /--year is required/);
  });
});
