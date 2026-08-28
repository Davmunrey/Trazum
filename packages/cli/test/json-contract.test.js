import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/**
 * The machine-readable report is a contract, and this is what makes it one.
 *
 * Enforced in **both** directions: a documented field that vanishes fails, and
 * a field added without a line in the doc fails too. A dashboard built on this
 * output cannot tell "old Trazum" from "no data", so the shape has to be
 * something the repository is held to rather than something it happens to
 * emit today.
 *
 * Doctrine: [A machine reader gets the provenance too](../../../docs/doctrine.md#a-machine-reader-gets-the-provenance-too)
 */

const report = async (extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
  const log = join(dir, 'usage.jsonl');
  const previous = join(dir, 'previous.jsonl');
  const record = (usd) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      session: 's1',
      ts: '2026-08-01T10:00:00Z',
      stop_reason: 'end_turn',
      usage: { input_tokens: usd * 200_000, output_tokens: 100 },
    });
  await writeFile(log, `${record(1)}\n`);
  await writeFile(previous, `${record(2)}\n`);
  const result = spawnSync(
    process.execPath,
    [CLI, 'profile', log, '--json', ...extra.map((flag) => (flag === '<previous>' ? previous : flag))],
    { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

/**
 * The field names the doc promises for the *profile* document.
 *
 * The file now documents three contracts — the profile report, the fleet
 * document and the plan document — so the harvest stops at the first heading
 * after the top-level table: the fleet's and the plan's fields belong to
 * their own shapes, and holding `profile --json` to `createdAt` would be
 * enforcing the wrong contract on the right command.
 */
/** Every row of the table, whatever the field is called. */
const ROW = /^\| `([^`]+)` \|/gm;
/** The rows this harvest can actually read a field name out of. */
const NAME = /^\| `([A-Za-z0-9]+)` \|/gm;

const documented = async () => {
  const doc = await readFile(DOC, 'utf8');
  const scope = sectionOf(doc, '## Top-level fields');

  /*
    The harvest must read EVERY row, not the rows it happens to understand.
    
    This pattern was `[a-zA-Z]+`. No field is spelled with a digit today, so it
    read all thirty-five rows and nothing was wrong — but the day somebody adds
    `p95Usd` and documents it, the name would stop being harvested, the "emits
    every field it documents" check would stop covering it, and nothing would
    say so. A guard that quietly narrows is the failure this repository keeps
    finding; counting the rows is what makes the narrowing loud.
  */
  const rows = [...scope.matchAll(ROW)].map((match) => match[1]);
  const names = [...scope.matchAll(NAME)].map((match) => match[1]);
  assert.deepEqual(
    rows.filter((row) => !names.includes(row)),
    [],
    'a documented field is spelled in a way this harvest cannot read, so it would be silently unguarded',
  );
  return new Set(names);
};

describe('the --json contract', () => {
  it('emits a schema version to branch on', async () => {
    assert.equal((await report()).schemaVersion, 1);
  });

  it('documents every field it emits', async () => {
    const emitted = Object.keys(await report(['--against', '<previous>', '--what-if', 'claude-haiku-4-5']));
    const promised = await documented();
    const undocumented = emitted.filter((key) => !promised.has(key));
    assert.deepEqual(undocumented, [], `fields emitted with no line in docs/json-output.md`);
  });

  it('emits every field it documents', async () => {
    const emitted = new Set(
      Object.keys(await report(['--against', '<previous>', '--what-if', 'claude-haiku-4-5'])),
    );
    const missing = [...(await documented())].filter((key) => !emitted.has(key));
    assert.deepEqual(missing, [], 'fields promised by docs/json-output.md and not emitted');
  });

  it('keeps absence distinguishable from zero', async () => {
    // A log with no clock: the period is null and the series empty, never a
    // zero that would read as "measured, and it was nothing".
    const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      `${JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } })}\n`,
    );
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.span, null);
    assert.deepEqual(parsed.spendByDay, []);
    assert.deepEqual(parsed.spendByHour, []);
    assert.equal(parsed.timeWindow, null);
    assert.equal(parsed.hasSessions, false);
  });

  it('carries no session key anywhere in the document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      `${JSON.stringify({ model: 'claude-opus-5', session: 'user-42@corp.example', usage: { input_tokens: 200_000, output_tokens: 0 } })}\n`,
    );
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.ok(!result.stdout.includes('user-42@corp.example'));
    // And the field that says a session was seen is still true: grouped by,
    // never shown.
    assert.equal(JSON.parse(result.stdout).hasSessions, true);
  });
});

describe('the harvest cannot quietly stop reading the table', () => {
  /**
   * Proving the guard above by breaking it.
   *
   * The check inside `documented()` runs against the real document, where every
   * row is readable — an assertion that only ever sees today's good values, and
   * this repository has been caught by that shape more than a dozen times. So
   * the pattern is handed the rows it would have to refuse.
   */
  const namesIn = (section) => [...section.matchAll(/^\| `([A-Za-z0-9]+)` \|/gm)].map((m) => m[1]);
  const rowsIn = (section) => [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);

  it('reads a field spelled with a digit, which the old pattern dropped', () => {
    const table = '| `p95Usd` | the ninety-fifth percentile |';
    assert.deepEqual(rowsIn(table), ['p95Usd']);
    assert.deepEqual(namesIn(table), ['p95Usd'], 'a digit in a field name is not exotic and must not be skipped');
  });

  it('and notices a row it genuinely cannot read', () => {
    // A nested path is not a top-level field, and whatever it is, the harvest
    // must say it could not read it rather than shrink by one in silence.
    const table = '| `total.inputUsd` | dollars on input |';
    assert.deepEqual(rowsIn(table), ['total.inputUsd']);
    assert.deepEqual(namesIn(table), [], 'the strict pattern must not pretend to have read this');
  });

  it('so the two disagree exactly when something would be unguarded', () => {
    const fine = '| `schemaVersion` | the contract version |\n| `p95Usd` | a percentile |';
    const broken = `${fine}\n| \`total.inputUsd\` | dollars on input |`;
    assert.deepEqual(rowsIn(fine).filter((r) => !namesIn(fine).includes(r)), []);
    assert.deepEqual(rowsIn(broken).filter((r) => !namesIn(broken).includes(r)), ['total.inputUsd']);
  });
});
