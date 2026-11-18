#!/usr/bin/env node
/**
 * Mutation testing for the core: changes the built code one small thing at a
 * time and says which changes no test noticed.
 *
 *   node scripts/mutate.mjs --acorn <dir>               every target, a report
 *   node scripts/mutate.mjs --acorn <dir> --check       fail on a survivor that is not on record
 *   node scripts/mutate.mjs --acorn <dir> --write       record this run, and its score in the docs
 *   node scripts/mutate.mjs --acorn <dir> --since <ref> only lines changed since a commit
 *   node scripts/mutate.mjs --acorn <dir> --only rules  only targets whose path contains a word
 *   node scripts/mutate.mjs --acorn <dir> --survivors   only the mutants on record, to see which a new test kills
 *   node scripts/mutate.mjs --acorn <dir> --without a.test.js,b.test.js
 *                                                       as if those test files did not exist: what do they hold?
 *   node scripts/mutate.mjs --acorn <dir> --audit 20    is the choice of tests right? see below
 *
 * What it decides is in `scripts/mutation.mjs`, as functions a test can hold.
 * This file is the part that runs things: it reads the built files, asks V8
 * which test runs which code, and starts the tests against each mutant.
 *
 * **It needs a parser and the repository has none.** `--acorn` is a directory
 * holding acorn, installed outside the workspace the way CI installs the
 * browser driver for the privacy probe:
 *
 *   npm install --prefix "$DIR" --no-save --ignore-scripts acorn@8.19.0
 *   node scripts/mutate.mjs --acorn "$DIR/node_modules/acorn"
 *
 * Nothing published, and nothing in the lockfile, depends on it.
 *
 * **How a mutant is run.** Not by editing `dist`: `mutant-loader.mjs` serves
 * the changed text to one process in place of the built file. Each mutant gets
 * only the test files whose coverage includes the place it changes, the ones
 * that have killed most first, and stops at the first failure. A mutant no
 * test file reaches is not run at all: it is reported as uncovered.
 *
 * **Why the two checks before it starts.** A loader that silently does nothing
 * would report every mutant as a survivor; one that breaks every import would
 * report every mutant as killed, and that second mistake reads as a perfect
 * score. So before any mutant, each target is served once unchanged, which
 * must pass, and once as a file that only throws, which must fail.
 *
 * **And the one check that cannot run every time.** A survivor is a mutant
 * that every test *given to it* passed. If coverage is read wrongly, a test
 * that would have killed it is never given it, and it is reported alive: the
 * first whole run did that to every `a ?? b` whose right side never ran.
 * `--audit n` takes n recorded survivors, spread across the record, and runs
 * each against every test file it was *not* given. One failure there means
 * the choice of tests is wrong, and no score from this tool should be read
 * until it is fixed. It costs a whole suite per mutant, so it is run when the
 * way tests are chosen changes, and its last result is in the docs.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  againstBaseline,
  applyMutant,
  changedLines,
  decodeMappings,
  isCovered,
  lineAt,
  mutantsOf,
  rangesOf,
  scoreTable,
  sourcePosition,
  summarise,
  withIds,
  withScoreTable,
} from './mutation.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'packages/core');
const BASELINE = join(ROOT, 'mutation.baseline.json');
const PAGE = join(ROOT, 'docs/mutation-testing.md');
const LOADER = pathToFileURL(join(ROOT, 'scripts/mutant-loader.mjs')).href;

/**
 * The source files mutated, by their TypeScript path.
 *
 * Chosen for what a wrong line in them costs: these turn a prompt into a
 * shorter prompt, and a call's token counts into money. The list grows a file
 * at a time; each addition is a run, a record and whatever tests it shows to
 * be missing.
 */
export const TARGETS = [
  'packages/core/src/optimize.ts',
  'packages/core/src/segment.ts',
  'packages/core/src/rules.ts',
  'packages/core/src/savings.ts',
  'packages/core/src/session-cost.ts',
];

const builtPath = (target) => join(ROOT, target.replace('/src/', '/dist/').replace(/\.ts$/, '.js'));

function parseArgs(argv) {
  const options = {
    acorn: null, since: null, only: null, without: null, audit: null, check: false, write: false, survivors: false,
    json: null, jobs: null,
  };
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--check') options.check = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--survivors') options.survivors = true;
    else if (['--acorn', '--since', '--only', '--without', '--audit', '--json', '--jobs'].includes(arg)) {
      at += 1;
      if (argv[at] === undefined) throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = argv[at];
    } else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.acorn) {
    throw new Error(
      'mutate needs a parser: --acorn <directory holding acorn>.\n'
        + '  npm install --prefix "$DIR" --no-save --ignore-scripts acorn@8.19.0\n'
        + '  node scripts/mutate.mjs --acorn "$DIR/node_modules/acorn"',
    );
  }
  if (options.write && (options.since || options.only || options.survivors || options.without || options.audit)) {
    throw new Error(
      '--write records a whole run: it cannot be combined with --since, --only, --survivors, --without or --audit',
    );
  }
  if (options.audit !== null && !(Number.isInteger(Number(options.audit)) && Number(options.audit) > 0)) {
    throw new Error('--audit needs a number of survivors to check, above zero');
  }
  return options;
}

/** Runs one test file to the end, or to its time limit, and says how it went. */
function runTest(file, { env, timeout }) {
  return new Promise((done) => {
    const started = process.hrtime.bigint();
    // Its own process group, so a test that started children is stopped with them.
    const child = spawn(process.execPath, [file], { cwd: CORE, env, stdio: 'ignore', detached: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }, timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ passed: code === 0 && !timedOut, timedOut, ms: Number(process.hrtime.bigint() - started) / 1e6 });
    });
  });
}

/** Does `work` for every item, `jobs` at a time, in order of arrival. */
async function pool(items, jobs, work) {
  let next = 0;
  const workers = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index], index);
    }
  });
  await Promise.all(workers);
}

const cleanEnv = () => {
  const env = { ...process.env };
  delete env.NODE_V8_COVERAGE;
  delete env.TRAZUM_MUTANT_URL;
  delete env.TRAZUM_MUTANT_SOURCE;
  return env;
};

/** What git says is changed, so a run can tell what its tests left behind. */
const treeState = () => execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });

/**
 * Names the files the tests left changed.
 *
 * Some tests edit a tracked file and put it back. One stopped at its time
 * limit, or by the machine going away, does not get to: an interrupted run on
 * 2026-11-18 left two sentences appended to `wiki/Home.md`. Nothing here puts
 * a file back, because it cannot know what the file should say. It says which.
 */
function reportLeftBehind(before) {
  const was = new Set(before.split('\n'));
  const left = treeState().split('\n').filter((line) => line !== '' && !was.has(line));
  if (left.length === 0) return;
  console.log(
    `\nThe tests left these files changed. A test stopped at its time limit does not put back what it edited:\n`
      + left.map((line) => `  ${line}`).join('\n'),
  );
}

const mutantEnv = (url, source) => ({
  ...cleanEnv(),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${LOADER}`.trim(),
  TRAZUM_MUTANT_URL: url,
  TRAZUM_MUTANT_SOURCE: source,
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const jobs = options.jobs ? Number(options.jobs) : availableParallelism();
  const { parse } = await import(pathToFileURL(join(resolve(options.acorn), 'dist/acorn.mjs')).href);
  const parseModule = (text) => parse(text, { ecmaVersion: 'latest', sourceType: 'module' });

  const chosen = TARGETS.filter((target) => !options.only || target.includes(options.only));
  if (chosen.length === 0) throw new Error(`no target matches --only ${options.only}`);

  let changed = null;
  if (options.since) {
    const diff = execFileSync('git', ['diff', '-U0', options.since, '--', ...chosen], { cwd: ROOT, encoding: 'utf8' });
    changed = changedLines(diff);
  }

  const onRecord = options.survivors || options.audit
    ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).survivors.map((survivor) => survivor.id))
    : null;

  // 1. Every mutant of every target, with the source line it came from.
  const targets = [];
  for (const target of chosen) {
    const built = builtPath(target);
    if (!existsSync(built)) throw new Error(`${relative(ROOT, built)} is not built: run npm run build first`);
    const text = readFileSync(built, 'utf8');
    const decoded = decodeMappings(JSON.parse(readFileSync(`${built}.map`, 'utf8')).mappings);
    let mutants = withIds(mutantsOf(parseModule(text), text), text, target).map((mutant) => {
      const at = lineAt(text, mutant.start);
      return { ...mutant, file: target, line: sourcePosition(decoded, at.line, at.column)?.line ?? null };
    });
    for (const mutant of mutants) {
      try {
        parseModule(applyMutant(text, mutant));
      } catch (error) {
        throw new Error(`${target}: the ${mutant.operator} mutant "${mutant.after}" does not parse (${error.message})`);
      }
    }
    if (changed) {
      const lines = changed.get(target) ?? new Set();
      mutants = mutants.filter((mutant) => mutant.line !== null && lines.has(mutant.line));
    }
    if (onRecord) mutants = mutants.filter((mutant) => onRecord.has(mutant.id));
    targets.push({ target, built, url: pathToFileURL(built).href, text, mutants });
  }

  const total = targets.reduce((sum, target) => sum + target.mutants.length, 0);
  console.log(
    `${total} mutants in ${targets.length} files`
      + (options.since ? `, on the lines changed since ${options.since}` : '')
      + (options.survivors || options.audit ? ', the ones on record as survivors' : '')
      + `, ${jobs} at a time.`,
  );
  if (total === 0) {
    console.log('Nothing to mutate.');
    return;
  }

  const work = mkdtempSync(join(tmpdir(), 'trazum-mutate-'));
  const treeBefore = treeState();
  try {
    // 2. Which test file runs which code, and how long each takes on its own.
    const without = new Set((options.without ?? '').split(',').filter(Boolean));
    const present = readdirSync(join(CORE, 'test')).filter((name) => name.endsWith('.test.js'));
    for (const name of without) {
      if (!present.includes(name)) throw new Error(`--without names ${name}, which is not a test file of the core`);
    }
    const tests = present
      .filter((name) => !without.has(name))
      .sort()
      .map((name) => ({ name, file: join(CORE, 'test', name), ms: 0, kills: 0, ranges: new Map() }));
    const urls = new Map(targets.map((target) => [target.url, target]));
    const broken = [];
    await pool(tests, jobs, async (test, index) => {
      const coverage = join(work, `coverage-${index}`);
      mkdirSync(coverage);
      const run = await runTest(test.file, { env: { ...cleanEnv(), NODE_V8_COVERAGE: coverage }, timeout: 300_000 });
      if (!run.passed) broken.push(test.name);
      test.ms = run.ms;
      for (const name of readdirSync(coverage)) {
        const report = JSON.parse(readFileSync(join(coverage, name), 'utf8'));
        for (const script of report.result ?? []) {
          if (!urls.has(script.url)) continue;
          test.ranges.set(script.url, [...(test.ranges.get(script.url) ?? []), rangesOf(script)]);
        }
      }
      rmSync(coverage, { recursive: true, force: true });
    });
    if (broken.length > 0) {
      throw new Error(`these test files fail before anything is mutated: ${broken.sort().join(', ')}`);
    }
    // A test file may have run the target in more than one process: a mutant
    // is reached if any of them ran the place it changes.
    const reaches = (test, target, offset) =>
      (test.ranges.get(target.url) ?? []).some((ranges) => isCovered(ranges, offset));

    // 3. The loader does what it says, for every target, before it is trusted.
    for (const target of targets) {
      const witness = tests
        .filter((test) => target.mutants.some((mutant) => reaches(test, target, mutant.probe)))
        .sort((a, b) => a.ms - b.ms)[0];
      if (!witness) continue;
      const same = join(work, 'unchanged.js');
      writeFileSync(same, target.text);
      const unchanged = await runTest(witness.file, { env: mutantEnv(target.url, same), timeout: 300_000 });
      const thrower = join(work, 'thrower.js');
      writeFileSync(thrower, "throw new Error('served by the mutant loader');\n");
      const thrown = await runTest(witness.file, { env: mutantEnv(target.url, thrower), timeout: 300_000 });
      if (!unchanged.passed || thrown.passed) {
        throw new Error(
          `${target.target}: the loader cannot be trusted with ${witness.name}: `
            + `served unchanged it ${unchanged.passed ? 'passed' : 'failed'}, `
            + `served a file that throws it ${thrown.passed ? 'passed' : 'failed'}`,
        );
      }
    }

    const everyMutant = targets.flatMap((target) => target.mutants.map((mutant) => ({ target, mutant })));

    // The audit: recorded survivors against the tests they were *not* given.
    if (options.audit) {
      const wanted = Math.min(Number(options.audit), everyMutant.length);
      const sample = Array.from({ length: wanted }, (_, at) => everyMutant[Math.floor((at * everyMutant.length) / wanted)]);
      const wrong = [];
      let done = 0;
      await pool(sample, jobs, async ({ target, mutant }, index) => {
        const source = join(work, `audit-${index}.js`);
        writeFileSync(source, applyMutant(target.text, mutant));
        const env = mutantEnv(target.url, source);
        for (const test of tests.filter((candidate) => !reaches(candidate, target, mutant.probe))) {
          const run = await runTest(test.file, { env, timeout: 10_000 + 4 * test.ms });
          if (run.passed) continue;
          wrong.push({ mutant, by: test.name });
          break;
        }
        rmSync(source, { force: true });
        done += 1;
        console.log(`  ${done}/${sample.length}`);
      });
      if (wrong.length > 0) {
        console.log(`\n${wrong.length} of ${sample.length} recorded survivors are killed by a test they were never given:`);
        for (const { mutant, by } of wrong) {
          console.log(`  ${mutant.file}:${mutant.line ?? '?'}  ${mutant.operator}  killed by ${by}\n      + ${mutant.after}`);
        }
        console.log('\nThe choice of tests is wrong. No score from this tool should be read until it is fixed.');
        process.exitCode = 1;
      } else {
        console.log(`\n${sample.length} recorded survivors, each run against every test file it was not given: none was killed.`);
      }
      reportLeftBehind(treeBefore);
      return;
    }

    // 4. Each mutant against the tests that reach it.
    const results = [];
    const queue = everyMutant;
    let finished = 0;
    await pool(queue, jobs, async ({ target, mutant }, index) => {
      const covering = tests.filter((test) => reaches(test, target, mutant.probe));
      let status = covering.length === 0 ? 'uncovered' : 'survived';
      let by = null;
      if (covering.length > 0) {
        const source = join(work, `mutant-${index}.js`);
        writeFileSync(source, applyMutant(target.text, mutant));
        const env = mutantEnv(target.url, source);
        // Read the order afresh: a test that has just killed a neighbour is the best first guess.
        for (const test of covering.sort((a, b) => b.kills - a.kills || a.ms - b.ms)) {
          const run = await runTest(test.file, { env, timeout: 10_000 + 4 * test.ms });
          if (run.passed) continue;
          status = run.timedOut ? 'timeout' : 'killed';
          by = test.name;
          test.kills += 1;
          break;
        }
        rmSync(source, { force: true });
      }
      results.push({ ...mutant, status, by, reachedBy: covering.length });
      finished += 1;
      if (finished % 50 === 0 || finished === queue.length) console.log(`  ${finished}/${queue.length}`);
    });
    results.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start || a.after.localeCompare(b.after));

    // 5. What the tests left behind, then what the run found (which writes files of its own).
    reportLeftBehind(treeBefore);
    report(targets, results, options);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const describe = (result) => ({
  id: result.id,
  file: result.file,
  line: result.line,
  function: result.fn,
  operator: result.operator,
  status: result.status,
  before: result.before,
  after: result.after,
});

function report(targets, results, options) {
  const pad = (value, width) => String(value).padStart(width);
  console.log('\n  score  mutants  killed  timeout  survived  uncovered  file');
  const perFile = {};
  for (const { target } of targets) {
    const summary = summarise(results.filter((result) => result.file === target));
    perFile[target] = summary;
    console.log(
      `  ${pad(summary.score === null ? '-' : `${summary.score.toFixed(1)}%`, 6)}${pad(summary.mutants, 8)}`
        + `${pad(summary.killed, 8)}${pad(summary.timeout, 9)}${pad(summary.survived, 10)}${pad(summary.uncovered, 11)}  ${target}`,
    );
  }
  const all = summarise(results);
  console.log(
    `  ${pad(all.score === null ? '-' : `${all.score.toFixed(1)}%`, 6)}${pad(all.mutants, 8)}`
      + `${pad(all.killed, 8)}${pad(all.timeout, 9)}${pad(all.survived, 10)}${pad(all.uncovered, 11)}  all`,
  );

  const alive = results.filter((result) => result.status === 'survived' || result.status === 'uncovered');
  const show = (result) =>
    console.log(
      `  ${result.file}:${result.line ?? '?'}  ${result.operator}${result.status === 'uncovered' ? '  (no test runs it)' : ''}\n`
        + `      - ${result.before}\n      + ${result.after}`,
    );

  if (options.json) {
    writeFileSync(resolve(options.json), `${JSON.stringify({ total: all, files: perFile, results: results.map((r) => ({ ...describe(r), by: r.by })) }, null, 2)}\n`);
  }

  if (options.write) {
    const record = {
      about:
        'What mutation testing found the last time it was recorded: the score of each file, and every mutant no test '
        + 'killed. Written by `node scripts/mutate.mjs --write`; `--check` fails on a survivor that is not listed here. '
        + 'A survivor is a line a test should hold and does not yet, or a change that makes no difference; '
        + 'docs/mutation-testing.md says how to tell.',
      recorded: new Date().toISOString().slice(0, 10),
      total: all,
      files: perFile,
      survivors: alive.map(describe),
    };
    writeFileSync(BASELINE, `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(PAGE, withScoreTable(readFileSync(PAGE, 'utf8'), scoreTable(record)));
    console.log(`\nRecorded ${alive.length} survivors in mutation.baseline.json, and the score in docs/mutation-testing.md.`);
    return;
  }

  const recorded = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).survivors : [];
  const { fresh, recovered } = againstBaseline(recorded, results, new Set(results.map((result) => result.id)));

  if (!options.check) {
    console.log(`\n${alive.length} mutants lived${alive.length > 0 ? ':' : '.'}`);
    for (const result of alive) show(result);
    return;
  }

  if (recovered.length > 0) {
    console.log(
      `\n${recovered.length} recorded survivors are killed now. Record the run again so they cannot come back unnoticed:\n`
        + '  node scripts/mutate.mjs --acorn <dir> --write',
    );
  }
  if (fresh.length > 0) {
    console.log(`\n${fresh.length} mutants lived that are not on record. No test notices these changes:`);
    for (const result of fresh) show(result);
    console.log(
      '\nWrite the test that fails on each, or, for a change that truly makes no difference, record the run with --write '
        + 'and say why in the pull request.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nNo mutant lived that is not already on record.');
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
