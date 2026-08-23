import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * `trazum bench`, run rather than read.
 *
 * The command's whole claim is that it measures — so the tests measure it: a
 * real workload in a real child process, its numbers checked for the shapes a
 * measurement cannot have (zero, negative, infinite), and the promise that it
 * writes nothing into the project proved by running it inside an empty
 * directory and looking.
 *
 * What is deliberately not asserted: any wall-clock value. A threshold here
 * would be the absolute-time gate the plan rules out for CI, one file early.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/**
 * The bench document's promised fields, harvested from its own table.
 *
 * First-column backticks only, so a field mentioned in an explanation does not
 * become a promise. `workloads[].x` rows and their `.y` shorthands land in the
 * per-workload set; everything else, `workloads[]` included, is top-level.
 */
const promisedFields = (page, heading) => {
  const section = sectionOf(page, heading);
  const top = new Set();
  const perWorkload = new Set();
  for (const row of section.split('\n')) {
    if (!row.startsWith('| `')) continue;
    const cell = row.split('|')[1];
    for (const [, name] of cell.matchAll(/`([^`]+)`/g)) {
      if (name.startsWith('workloads[].')) perWorkload.add(name.slice('workloads[].'.length));
      else if (name.startsWith('.')) perWorkload.add(name.slice(1));
      else top.add(name.replace('[]', ''));
    }
  }
  return { top, perWorkload };
};

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, 'bench', ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    cwd,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });

const WORKLOADS = [
  'optimize-1mb-safe',
  'optimize-1mb-aggressive',
  'profile-200k',
  'walk-10k',
  'rollup-20k',
];

const soundMeasurement = (m) => {
  assert.equal(typeof m.id, 'string');
  assert.ok(Number.isFinite(m.wallMs) && m.wallMs > 0, `${m.id}: wallMs ${m.wallMs}`);
  assert.ok(Number.isInteger(m.maxRssBytes) && m.maxRssBytes > 0, `${m.id}: maxRssBytes ${m.maxRssBytes}`);
  // Exactly one input size is stated, in the unit the workload is named by;
  // the others are null, never zero — a zero would claim a measured nothing.
  const sizes = [m.bytes, m.lines, m.files];
  assert.equal(sizes.filter((s) => s !== null).length, 1, `${m.id}: ${JSON.stringify(sizes)}`);
  for (const size of sizes) {
    if (size !== null) assert.ok(Number.isInteger(size) && size > 0, `${m.id}: size ${size}`);
  }
};

describe('one workload, measured for real', () => {
  it('profile-200k reports a positive wall, a positive peak, and its named size', () => {
    const result = run(['--workload', 'profile-200k', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const m = JSON.parse(result.stdout);
    soundMeasurement(m);
    assert.equal(m.id, 'profile-200k');
    assert.equal(m.lines, 200000);
    assert.equal(m.bytes, null);
    assert.equal(m.files, null);
  });

  it('prints a table, not JSON, when --json is absent', () => {
    const result = run(['--workload', 'rollup-20k']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.trimStart().startsWith('{'), 'the table path printed JSON');
    assert.match(result.stdout, /rollup-20k/);
  });
});

describe('the whole bench', () => {
  it('runs every workload in its own child and returns the document', async () => {
    // An empty working directory, so "never written to your project" is a
    // thing this test can see fail rather than a sentence in the help.
    const cwd = await mkdtemp(join(tmpdir(), 'trazum-bench-cwd-'));
    const result = run(['--json'], cwd);
    assert.equal(result.status, 0, result.stderr);

    const document = JSON.parse(result.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(typeof document.node, 'string');
    assert.ok(Number.isInteger(document.cpus) && document.cpus >= 1);
    assert.deepEqual(document.workloads.map((m) => m.id), WORKLOADS);
    for (const m of document.workloads) soundMeasurement(m);

    // Peaks are per-child facts: if all five ran in one process, each would
    // carry the high-water mark of whichever ran biggest before it and the
    // five values would be monotonically non-decreasing. Distinct smaller-
    // after-bigger values are the observable trace of process isolation.
    const peaks = document.workloads.map((m) => m.maxRssBytes);
    const sits = peaks.some((value, i) => i > 0 && value < peaks[i - 1]);
    assert.ok(sits, `no workload peaked below a predecessor — one shared process? ${peaks.join(', ')}`);

    assert.deepEqual(await readdir(cwd), [], 'bench wrote into the working directory');

    // The document against its own contract table, both directions: a field
    // emitted and undocumented fails, and so does one documented and gone.
    const page = await readFile(DOC, 'utf8');
    const { top, perWorkload } = promisedFields(page, '## The bench document');
    assert.deepEqual(Object.keys(document).sort(), [...top].sort());
    for (const m of document.workloads) {
      assert.deepEqual(Object.keys(m).sort(), [...perWorkload].sort(), m.id);
    }
  });
});

describe('and the harvest can see its own failure', () => {
  it('reads a made table the way it reads the real one', () => {
    const made = [
      '## The example document',
      '',
      '| Field | What it holds |',
      '| --- | --- |',
      '| `schemaVersion` | `1`. |',
      '| `workloads[]` | Rows, each with `hidden` mentioned in prose. |',
      '| `workloads[].id`, `workloads[].wallMs` | Which, and how long. |',
      '| `workloads[].bytes` / `.lines` | Sizes. |',
      '',
    ].join('\n');
    const { top, perWorkload } = promisedFields(made, '## The example document');
    assert.deepEqual([...top].sort(), ['schemaVersion', 'workloads']);
    // `hidden` sits in the second column, so it is prose rather than a promise.
    assert.deepEqual([...perWorkload].sort(), ['bytes', 'id', 'lines', 'wallMs']);
  });
});

describe('the refusal', () => {
  it('names every workload it knows, in both locales', () => {
    for (const locale of ['en', 'es']) {
      const result = run(['--workload', 'nope', '--locale', locale]);
      assert.equal(result.status, 1);
      for (const id of WORKLOADS) {
        assert.ok(result.stderr.includes(id), `${locale}: refusal does not name ${id}`);
      }
    }
  });
});
