#!/usr/bin/env node
/**
 * Which lines do the tests run? One report for each published package.
 *
 *   npm run build
 *   npm run coverage                 every package
 *   npm run coverage -- --only core  one of them
 *
 * It writes `coverage/<package>.lcov` and prints, for each package, how many
 * source files its tests loaded and how many of their lines ran.
 *
 * How it measures. Node's test runner has coverage built in, so there is
 * nothing to install. The tests run against built JavaScript; the report is
 * mapped back through the source maps the build already writes, so every path
 * in it is a TypeScript file somebody edits. It runs from the repository's
 * root, which is what makes those paths `packages/core/src/…` and not a
 * `src/…` that three packages have.
 *
 * What the figure is and is not. A line that ran is a line a test reached,
 * not a line a test checked: mutation testing is the question after this one
 * (docs/mutation-testing.md). A file no test loads is not in the report at
 * all, so the percentage is over the files the tests touched, and it flatters
 * a package with files nothing imports. A process a test starts is measured
 * too, when it inherits the environment and exits by itself: that is how the
 * CLI's entry point is in the report. One that is killed writes nothing,
 * which is why the MCP server's entry point is not.
 *
 * It measures and does not judge. When a test fails under coverage it says
 * so and still writes the report, with exit code 0: whether the tests pass
 * is the required job's to say, and a second verdict from a slower run would
 * be noise on every pull request. It exits 1 only when it measured nothing,
 * which is its own way of being broken.
 *
 * It does name the test that failed, the line it is at and the first line of
 * its error. The first version said "a test failed" and no more, and on
 * 2026-11-18 two of five runs on a runner said it of the core, on commits
 * the required job had passed: a test that fails some of the time under a
 * slower clock, and nothing left behind to say which (#712). The runner's
 * own account of each run is kept beside the report, as
 * `coverage/<package>.tap`.
 *
 * The same run also writes `coverage/<package>.junit.xml`: each test's name,
 * how long it took and, when it failed, why. The workflow sends those to
 * Codecov's test analytics, which is what tells a test that fails now and
 * then from one that fails (#714). Nothing reads the file here.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the reports go. Ignored by git; the workflow uploads from here. */
export const OUT = 'coverage';

/**
 * The packages measured: the ones that are published, each with the tests
 * that are its own. `coverage.test.js` holds this list to `packages/`, so a
 * new package is measured or the test says it is not.
 */
export const SUITES = [
  { name: 'core', tests: 'packages/core/test/*.test.js' },
  { name: 'cli', tests: 'packages/cli/test/*.test.js' },
  { name: 'mcp', tests: 'packages/mcp/test/*.test.js' },
  { name: 'tokenizer-openai', tests: 'packages/tokenizer-openai/test/*.test.js' },
];

/**
 * What is not measured, each with why. The web app and the editor extension
 * have tests of their own; the first version of this does not report them.
 */
export const NOT_MEASURED = {
  'apps/web': 'Its tests load TypeScript through a loader of their own, and whether the runner\'s coverage maps that back to the sources has not been checked. Until it has, a figure for the web app would be a guess.',
  'apps/vscode': 'Its tests run against a stand-in for the editor\'s API, and the extension is not published yet (#640). Left for when it is.',
};

/** Where the test runner's own account of a run is kept, beside its report. */
export function tapOf(out) {
  return out.replace(/\.lcov$/, '.tap');
}

/** Where the test results are written for Codecov's test analytics. */
export function junitOf(out) {
  return out.replace(/\.lcov$/, '.junit.xml');
}

/** The arguments Node is given for one suite, with the report at `out`. */
export function nodeArgs(suite, out) {
  return [
    '--test',
    '--experimental-test-coverage',
    // The build writes source maps; with them the report names the .ts files.
    '--enable-source-maps',
    // Tests, their helpers and the scripts they call are not what is measured.
    "--test-coverage-exclude=**/test/**",
    "--test-coverage-exclude=**/test-utils/**",
    "--test-coverage-exclude=**/scripts/**",
    // Each reporter listens for the end of the run, and with three of them and
    // coverage Node counts eleven listeners where it warns at ten. Measured
    // on Node 22.23: the warning is about that count and nothing else, and
    // it would otherwise be the first line of every run's output.
    '--disable-warning=MaxListenersExceededWarning',
    '--test-reporter=lcov',
    `--test-reporter-destination=${out}`,
    // A second reporter, paired with its own destination in the order given:
    // what passed and what failed, which the lcov report does not carry.
    '--test-reporter=tap',
    `--test-reporter-destination=${tapOf(out)}`,
    // And a third, in the one format Codecov's test analytics reads.
    '--test-reporter=junit',
    `--test-reporter-destination=${junitOf(out)}`,
    suite.tests,
  ];
}

/**
 * What an lcov report says in total: the files it names and, over them, the
 * lines it found and the lines that ran. Functions and branches are in the
 * file and are left to Codecov; a line is the unit a reader can point at.
 */
export function summarise(lcov) {
  const files = [];
  let found = 0;
  let hit = 0;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) files.push(line.slice(3).trim());
    else if (line.startsWith('LF:')) found += Number(line.slice(3));
    else if (line.startsWith('LH:')) hit += Number(line.slice(3));
  }
  // Rounded down: a figure that rounds up claims a line nobody ran.
  return { files, lines: { found, hit }, percent: found === 0 ? null : Math.floor((hit / found) * 1000) / 10 };
}

/** A source of one of the packages, as a report run from the root names it. */
const SOURCE = /^packages\/([a-z-]+)\/src\/.+\.ts$/;

/**
 * The paths in a report that are not this repository's sources. In a report
 * that has been through `clean` there are none; in one that has not, they are
 * what a skipped build or a run from the wrong directory looks like.
 */
export function strangers(files) {
  return files.filter((file) => !SOURCE.test(file));
}

/**
 * A report with only the records that are about a source. A test can load a
 * file it wrote to a temporary directory, and the runner reports that too,
 * under a path that climbs out of the repository; a file like that is nobody's
 * to cover. What was dropped is returned, so a report that was all strangers
 * says so and is not mistaken for an empty one.
 */
export function clean(lcov) {
  const kept = [];
  const dropped = [];
  for (const record of lcov.split('end_of_record\n')) {
    const file = /^SF:(.+)$/m.exec(record)?.[1].trim();
    if (file === undefined) continue;
    if (SOURCE.test(file)) kept.push(`${record}end_of_record\n`);
    else dropped.push(file);
  }
  return { lcov: kept.join(''), dropped };
}

/**
 * Every report together, by the package a source belongs to: a line ran if
 * any package's tests ran it. It is worked out here so that it can be read
 * without an account.
 *
 * It is not the figure Codecov shows for the same reports. This comment said
 * it was, before Codecov had taken an upload; the first one, on 2026-11-18,
 * came out at 93.3% against this function's 94.5%. This counts a line by its
 * line record. Codecov judges a line that carries a branch record by the
 * branch. docs/coverage.md has the two side by side and what is known about
 * the difference.
 */
export function together(reports) {
  const lines = new Map();
  for (const lcov of reports) {
    let file = null;
    for (const line of lcov.split('\n')) {
      if (line.startsWith('SF:')) file = line.slice(3).trim();
      else if (line.startsWith('DA:') && file !== null) {
        const [number, hits] = line.slice(3).split(',').map(Number);
        const seen = lines.get(file) ?? new Map();
        seen.set(number, (seen.get(number) ?? 0) + hits);
        lines.set(file, seen);
      }
    }
  }
  const packages = new Map();
  for (const [file, seen] of lines) {
    const name = SOURCE.exec(file)?.[1];
    if (name === undefined) continue;
    const total = packages.get(name) ?? { name, files: 0, found: 0, hit: 0 };
    total.files += 1;
    total.found += seen.size;
    total.hit += [...seen.values()].filter((hits) => hits > 0).length;
    packages.set(name, total);
  }
  const percent = ({ found, hit }) => (found === 0 ? null : Math.floor((hit / found) * 1000) / 10);
  const rows = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({ ...row, percent: percent(row) }));
  const all = rows.reduce((sum, row) => ({ files: sum.files + row.files, found: sum.found + row.found, hit: sum.hit + row.hit }), { files: 0, found: 0, hit: 0 });
  return { rows, all: { ...all, percent: percent(all) } };
}

/**
 * The tests that failed, from the runner's TAP output: each with its name,
 * where it is, and the first line of its error. A group that failed only
 * because a test inside it did is left out, and so are a test marked todo
 * and one that was skipped: the runner prints the first two as "not ok" as
 * well, and neither is a failure of its own.
 */
export function failures(tap, root = ROOT) {
  const found = [];
  const lines = tap.split('\n');
  for (let at = 0; at < lines.length; at += 1) {
    const result = /^(\s*)not ok \d+ - (.*)$/.exec(lines[at]);
    if (result === null) continue;
    const [, indent, title] = result;
    if (/ # (?:TODO|SKIP)\b/.test(title)) continue;
    // The block of details under a result is indented two further and runs
    // from `---` to `...`.
    const inside = `${indent}  `;
    // A result with no block under it is still a failure; it only has nothing
    // more to say, and the next test's block is not read as its own.
    const detailed = lines[at + 1] === `${inside}---`;
    const field = (name) => new RegExp(`^${inside}${name}: (.*)$`);
    let location = null;
    let error = null;
    let group = false;
    for (let next = at + 2; detailed && next < lines.length && lines[next] !== `${inside}...`; next += 1) {
      const line = lines[next];
      const where = field('location').exec(line);
      const why = field('error').exec(line);
      if (where !== null) location = where[1].replace(/^'|'$/g, '');
      else if (field('failureType').exec(line)?.[1] === "'subtestsFailed'") group = true;
      else if (why !== null) {
        // Either on the same line in quotes, or a block whose first line that
        // is not empty is the message.
        if (why[1].startsWith('|')) {
          let text = next + 1;
          while (text < lines.length && lines[text].trim() === '') text += 1;
          error = (lines[text] ?? '').trim();
        } else error = why[1].replace(/^'|'$/g, '');
      }
    }
    if (group) continue;
    // `/abs/path/file.js:12:3` as the runner writes it; the column is noise
    // and the path is given from the repository's root.
    const place = location === null ? null : location.replace(/:\d+$/, '').replace(`${root}/`, '');
    found.push({ name: title, location: place, error });
  }
  return found;
}

/** Whether a report is worth uploading: it names sources, and nothing but sources. */
export function usable(report) {
  return report.files.length > 0 && report.percent !== null && strangers(report.files).length === 0;
}

function run(suite, out) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, nodeArgs(suite, out), { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('close', (code) => resolve(code));
  });
}

async function main(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const suites = SUITES.filter((suite) => only === null || suite.name === only);
  if (suites.length === 0) throw new Error(`no package named ${only}; there are ${SUITES.map((suite) => suite.name).join(', ')}`);

  rmSync(join(ROOT, OUT), { recursive: true, force: true });
  mkdirSync(join(ROOT, OUT), { recursive: true });

  let empty = 0;
  const kept = [];
  console.log('What each package\'s own tests ran, over the sources they loaded:\n');
  for (const suite of suites) {
    const out = join(OUT, `${suite.name}.lcov`);
    const started = Date.now();
    const code = await run(suite, out);
    let cleaned = { lcov: '', dropped: [] };
    try {
      cleaned = clean(readFileSync(join(ROOT, out), 'utf8'));
      writeFileSync(join(ROOT, out), cleaned.lcov);
    } catch {
      // No report at all: counted below as having measured nothing.
    }
    const report = summarise(cleaned.lcov);
    if (!usable(report)) empty += 1;
    else kept.push(cleaned.lcov);
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
      `${suite.name.padEnd(18)}${report.percent === null ? 'nothing measured' : `${report.percent.toFixed(1)}% of lines`}`
        + `  (${report.lines.hit.toLocaleString('en-US')} of ${report.lines.found.toLocaleString('en-US')}, in ${report.files.length} files, ${seconds} s)  ${out}`,
    );
    if (cleaned.dropped.length > 0) console.log(`  left out, not a source of this repository: ${cleaned.dropped.length} file(s), the first ${cleaned.dropped[0]}`);
    if (code !== 0) {
      let failed = [];
      try {
        failed = failures(readFileSync(join(ROOT, tapOf(out)), 'utf8'));
      } catch {
        // The runner left no account of the run: said below.
      }
      console.log(`  a test failed in this run (exit ${code}). The report is still written; whether the tests pass is the required job's to say.`);
      for (const test of failed) {
        console.log(`    ${test.name}${test.location === null ? '' : `  (${test.location})`}`);
        if (test.error !== null && test.error !== '') console.log(`      ${test.error}`);
      }
      if (failed.length === 0) console.log(`    which one is not in ${tapOf(out)}: the runner stopped without naming a test.`);
    }
  }
  if (empty > 0) {
    console.error(`\n${empty} package(s) measured no source. Run \`npm run build\` first: the report is mapped through the build's source maps, and without them it names built files, which are left out.`);
    return 1;
  }
  if (only === null) {
    const { rows, all } = together(kept);
    console.log('\nEvery package\'s tests together, by the package a source belongs to:\n');
    for (const row of [...rows, { name: 'all', ...all }]) {
      console.log(`${row.name.padEnd(18)}${row.percent.toFixed(1)}% of lines  (${row.hit.toLocaleString('en-US')} of ${row.found.toLocaleString('en-US')}, in ${row.files} files)`);
    }
  }
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`coverage: ${error.message}`);
      process.exit(1);
    },
  );
}
