import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum history` — series from stored reports, shapes named, no forecasts.
 * The fixtures are real profile documents, produced by the CLI itself, so
 * this test also proves the stored JSON round-trips into a series.
 */

const line = (record) => JSON.stringify(record);

/** One weekly log: support climbing, cache share decaying. */
const weeklyLog = (week) => {
  const rows = [];
  for (let i = 0; i < 4 + week * 2; i++) {
    rows.push(line({
      model: 'claude-opus-5',
      label: 'support',
      ts: i === 0 ? `2026-07-${week * 7 + 1}T09:00:00Z`.replace(/-(\d)T/, '-0$1T') : `2026-07-${String(week * 7 + 6).padStart(2, '0')}T09:00:00Z`,
      usage: { input_tokens: 400_000, output_tokens: 0, cache_read_input_tokens: Math.max(0, 200_000 - week * 60_000) },
    }));
  }
  return rows.join('\n') + '\n';
};

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-history-'));
  for (let week = 0; week < 4; week++) {
    const log = join(dir, `w${week}.jsonl`);
    await writeFile(log, weeklyLog(week));
    const report = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
    });
    assert.equal(report.status, 0, report.stderr);
    await writeFile(join(dir, `w${week}.report.json`), report.stdout);
  }
  // The same plan twice: a decision nobody is executing.
  for (const week of [2, 3]) {
    const planned = spawnSync(
      process.execPath,
      [CLI, 'plan', join(dir, `w${week}.jsonl`), '-o', join(dir, `w${week}.plan.json`)],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.equal(planned.status, 0, planned.stderr);
  }
  await writeFile(join(dir, 'notes.json'), '{"hello": 1}');
  return dir;
};

const run = (args) =>
  spawnSync(process.execPath, [CLI, 'history', ...args], {
    encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('history', () => {
  it('builds the series and names the shapes no pairwise comparison finds', async () => {
    const dir = await setup();
    const result = run([dir]);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /The long run: 4 periods/);
    // The climb, since a named report — a shape, never a forecast.
    assert.match(out, /support has climbed for 3 consecutive periods since .*w0\.report\.json/);
    assert.match(out, /cache share has decayed for 3 consecutive periods/);
    // The plan planned twice with nobody executing it.
    assert.match(out, /has been planned 2 times .* still in the newest plan/);
    // The file that is neither a report nor a plan is named, never absorbed.
    assert.match(out, /notes\.json is neither a stored report nor a saved plan/);
    // The refusal of forecasting is in the copy itself.
    assert.match(out, /shapes, not futures/);
  });

  it('refuses a series of two: profile --against already does that better', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-history-'));
    for (const name of ['a', 'b']) {
      const log = join(dir, `${name}.jsonl`);
      await writeFile(log, line({ model: 'claude-opus-5', label: 'x', ts: '2026-07-01T09:00:00Z', usage: { input_tokens: 200_000, output_tokens: 0 } }) + '\n');
      const report = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
        encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
      });
      await writeFile(join(dir, `${name}.report.json`), report.stdout);
    }
    const result = run([dir]);
    assert.equal(result.status, 1);
    assert.match(flat(result), /at least three dated reports.*--against/);
  });

  it('emits the history as data, unrecognized files included', async () => {
    const dir = await setup();
    const result = run([dir, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(result.stdout);
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.periods.length, 4);
    assert.ok(doc.runs.some((r) => r.kind === 'label-spend-climbing' && r.subject === 'support'));
    assert.ok(doc.repeatedPlanActions.length >= 1);
    assert.equal(doc.repeatedPlanActions[0].appearances, 2);
    assert.deepEqual(doc.unrecognizedFiles, [join(dir, 'notes.json')]);
  });

  it('writes the series as Markdown for a CI summary', async () => {
    const dir = await setup();
    const md = join(dir, 'history.md');
    const result = run([dir, '--markdown-out', md]);
    assert.equal(result.status, 0, result.stderr);
    const body = await readFile(md, 'utf8');
    assert.match(body, /^## The long run:/m);
    assert.match(body, /- support has climbed/);
  });

  it('speaks Spanish', async () => {
    const dir = await setup();
    const result = run([dir, '--locale', 'es']);
    assert.match(flat(result), /La larga distancia: 4 períodos/);
    assert.match(flat(result), /formas, no futuros/);
  });

  it('is a contract: the doc and the document promise each other every top-level field', async () => {
    const doc = await readFile(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    const start = doc.indexOf('## The history document');
    assert.ok(start !== -1, 'docs/json-output.md documents the history document');
    const section = doc.slice(start);
    const promised = new Set(
      [...section.matchAll(/^\| `([a-zA-Z]+)(?:\[\])?`/gm)].map((m) => m[1]),
    );
    const dir = await setup();
    const result = run([dir, '--json']);
    const emitted = Object.keys(JSON.parse(result.stdout));
    assert.deepEqual(emitted.filter((k) => !promised.has(k)), [], 'fields emitted with no line in docs/json-output.md');
    assert.deepEqual([...promised].filter((k) => !emitted.includes(k)), [], 'fields promised by docs/json-output.md and not emitted');
  });
});
