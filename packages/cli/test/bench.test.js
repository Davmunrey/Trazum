import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
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
  assert.ok(Number.isFinite(m.calibrationMs) && m.calibrationMs > 0, `${m.id}: calibrationMs ${m.calibrationMs}`);
  assert.ok(Number.isFinite(m.ratio) && m.ratio > 0, `${m.id}: ratio ${m.ratio}`);
  assert.ok(Math.abs(m.ratio - m.wallMs / m.calibrationMs) < 1e-9, `${m.id}: ratio is not wall over calibration`);
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

describe('the ratio gate', () => {
  /**
   * The gate is proved by breaking it: a baseline whose recorded ratio is
   * absurdly small makes any real run a regression, and the build goes red
   * with the workload named. The passing side uses a generous factor over a
   * genuinely recorded baseline, because two runs seconds apart on one machine
   * still wobble — asserting a tight factor here would be the flaky absolute
   * gate this chapter exists to avoid, one file early.
   */
  const baseline = (entries) => JSON.stringify({ schemaVersion: 1, workloads: entries });

  it('records a baseline the gate then holds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-bench-gate-'));
    const file = join(dir, 'trazum.bench.json');
    const recorded = run(['--workload', 'rollup-20k', '--record', file, '--json']);
    assert.equal(recorded.status, 0, recorded.stderr);
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(written.schemaVersion, 1);
    assert.deepEqual(written.workloads.map((w) => w.id), ['rollup-20k']);
    assert.ok(written.workloads[0].ratio > 0);
    // And the JSON on stdout is still the plain measurement — the gate flags
    // never change the document's shape.
    const emitted = JSON.parse(recorded.stdout);
    assert.equal(emitted.id, 'rollup-20k');

    const gated = run(['--workload', 'rollup-20k', '--against', file, '--max-ratio', '1000']);
    assert.equal(gated.status, 0, gated.stderr);
  });

  it('goes red past the stated factor, naming the workload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-bench-gate-'));
    const file = join(dir, 'tiny.json');
    await writeFile(file, baseline([{ id: 'rollup-20k', ratio: 1e-9 }]));
    const result = run(['--workload', 'rollup-20k', '--against', file, '--max-ratio', '1']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /rollup-20k/);
  });

  it('refuses to gate on a baseline it cannot vouch for', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-bench-gate-'));
    const unknown = join(dir, 'v9.json');
    await writeFile(unknown, JSON.stringify({ schemaVersion: 9, workloads: [] }));
    const versioned = run(['--workload', 'rollup-20k', '--against', unknown, '--max-ratio', '2']);
    assert.equal(versioned.status, 1);
    assert.match(versioned.stderr, /--record/);

    const missing = join(dir, 'other.json');
    await writeFile(missing, baseline([{ id: 'walk-10k', ratio: 1 }]));
    // Measured but never recorded is not a pass — a silent skip reads as coverage.
    const unrecorded = run(['--workload', 'rollup-20k', '--against', missing, '--max-ratio', '2']);
    assert.equal(unrecorded.status, 1);
    assert.match(unrecorded.stderr, /rollup-20k/);
  });

  it('holds the factor to being a stated policy', () => {
    const noFactor = run(['--workload', 'rollup-20k', '--against', 'x.json']);
    assert.equal(noFactor.status, 1);
    assert.match(noFactor.stderr, /--max-ratio/);

    const noBaseline = run(['--workload', 'rollup-20k', '--max-ratio', '2']);
    assert.equal(noBaseline.status, 1);
    assert.match(noBaseline.stderr, /--against/);

    const below = run(['--workload', 'rollup-20k', '--against', 'x.json', '--max-ratio', '0.5']);
    assert.equal(below.status, 1);

    const together = run(['--workload', 'rollup-20k', '--record', 'a.json', '--against', 'b.json', '--max-ratio', '2']);
    assert.equal(together.status, 1);
  });
});
