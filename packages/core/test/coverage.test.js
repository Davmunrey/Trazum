import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NOT_MEASURED, OUT, SUITES, clean, nodeArgs, strangers, summarise, together, usable } from '../../../scripts/coverage.mjs';

/**
 * The coverage measurement, and the workflow that sends it away.
 *
 * `scripts/coverage.mjs` runs the published packages' tests with Node's own
 * coverage, and `.github/workflows/coverage.yml` uploads the reports to
 * Codecov. Two things about that arrangement can go wrong without anything
 * failing. The report can describe files nobody edits: built JavaScript, or a
 * `src/…` path that three packages share. And a workflow that fetches a
 * program and hands it a secret is exactly the place a pin gets loosened or a
 * token ends up on a command line. So both are held here.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');

describe('a report is read for what it says in total', () => {
  const lcov = [
    'TN:', 'SF:packages/core/src/a.ts', 'FNF:2', 'FNH:1', 'DA:1,1', 'DA:2,0', 'LF:10', 'LH:7', 'BRF:4', 'BRH:2', 'end_of_record',
    'TN:', 'SF:packages/core/src/i18n/en.ts', 'LF:30', 'LH:30', 'end_of_record', '',
  ].join('\n');

  it('counts the files it names and the lines that ran over the lines it found', () => {
    assert.deepEqual(summarise(lcov), {
      files: ['packages/core/src/a.ts', 'packages/core/src/i18n/en.ts'],
      lines: { found: 40, hit: 37 },
      percent: 92.5,
    });
  });

  it('has no percentage for a report that found no line, which is not 0% and not 100%', () => {
    assert.deepEqual(summarise(''), { files: [], lines: { found: 0, hit: 0 }, percent: null });
    assert.equal(usable(summarise('')), false);
  });

  it('refuses a path that is not a source of this repository', () => {
    assert.deepEqual(strangers(['packages/core/src/a.ts', 'packages/cli/src/i18n/es.ts']), []);
    // Each of these is what a report looks like when a step was skipped.
    for (const path of ['src/a.ts', 'packages/core/dist/a.js', 'packages/core/test/a.test.js', '/home/runner/work/packages/core/src/a.ts', 'packages/core/src/a.js']) {
      assert.deepEqual(strangers([path]), [path], path);
    }
    assert.equal(usable(summarise(lcov)), true);
    assert.equal(usable(summarise(lcov.replace('SF:packages/core/src/a.ts', 'SF:packages/core/dist/a.js'))), false);
  });
});

describe('a report keeps what is a source and says what it left out', () => {
  const record = (file, lines) => ['TN:', `SF:${file}`, ...lines.map(([number, hits]) => `DA:${number},${hits}`), `LF:${lines.length}`, `LH:${lines.filter(([, hits]) => hits > 0).length}`, 'end_of_record', ''].join('\n');

  it('drops a file a test wrote outside the repository, and nothing else', () => {
    const source = record('packages/cli/src/index.ts', [[1, 1], [2, 0]]);
    const temporary = record('../../../tmp/trazum-offline-1sw7yJ/no-network.mjs', [[1, 3]]);
    const cleaned = clean(source + temporary);
    assert.equal(cleaned.lcov, source);
    assert.deepEqual(cleaned.dropped, ['../../../tmp/trazum-offline-1sw7yJ/no-network.mjs']);
    assert.deepEqual(clean(source), { lcov: source, dropped: [] });
  });

  it('is left with nothing when the build was skipped, which is unusable and not empty-but-fine', () => {
    const built = record('packages/core/dist/a.js', [[1, 1]]) + record('packages/core/dist/b.js', [[1, 1]]);
    const cleaned = clean(built);
    assert.equal(cleaned.lcov, '');
    assert.equal(cleaned.dropped.length, 2);
    assert.equal(usable(summarise(cleaned.lcov)), false);
  });

  it('adds the packages\' reports up by the package a source belongs to: a line ran if any suite ran it', () => {
    const core = record('packages/core/src/a.ts', [[1, 1], [2, 0], [3, 0]]) + record('packages/cli/src/b.ts', [[1, 0], [2, 0]]);
    const cli = record('packages/core/src/a.ts', [[1, 0], [2, 4], [3, 0]]) + record('packages/cli/src/b.ts', [[1, 2], [2, 0]]);
    assert.deepEqual(together([core, cli]), {
      rows: [
        { name: 'cli', files: 1, found: 2, hit: 1, percent: 50 },
        { name: 'core', files: 1, found: 3, hit: 2, percent: 66.6 },
      ],
      all: { files: 2, found: 5, hit: 3, percent: 60 },
    });
  });

  it('rounds a percentage down, so it never claims a line nobody ran', () => {
    const almost = record('packages/core/src/a.ts', Array.from({ length: 2000 }, (_, index) => [index + 1, index === 0 ? 0 : 1]));
    assert.equal(summarise(almost).percent, 99.9);
    assert.equal(together([almost]).all.percent, 99.9);
  });
});

describe('the tests are run so that the report names the TypeScript', () => {
  it('with coverage on, source maps followed, the tests themselves left out, and an lcov report where it is asked for', () => {
    const args = nodeArgs({ name: 'core', tests: 'packages/core/test/*.test.js' }, 'coverage/core.lcov');
    assert.equal(args[0], '--test');
    for (const flag of ['--experimental-test-coverage', '--enable-source-maps', '--test-coverage-exclude=**/test/**', '--test-reporter=lcov', '--test-reporter-destination=coverage/core.lcov']) {
      assert.ok(args.includes(flag), `${flag} is not passed`);
    }
    assert.equal(args.at(-1), 'packages/core/test/*.test.js');
  });

  it('measures every published package that has tests, and says which trees it leaves out', () => {
    const published = readdirSync(join(ROOT, 'packages'))
      .filter((name) => existsSync(join(ROOT, 'packages', name, 'test')) && JSON.parse(read(`packages/${name}/package.json`)).private !== true)
      .sort();
    assert.ok(published.length >= 3, `only ${published.length} packages found`);
    assert.deepEqual(SUITES.map((suite) => suite.name).sort(), published, 'a package with tests is not measured, or one that is gone still is');
    for (const suite of SUITES) {
      assert.equal(suite.tests, `packages/${suite.name}/test/*.test.js`);
      assert.ok(tracked.some((path) => path.startsWith(`packages/${suite.name}/test/`) && path.endsWith('.test.js')), `${suite.name} has no test file`);
    }
    for (const [tree, why] of Object.entries(NOT_MEASURED)) {
      assert.ok(existsSync(join(ROOT, tree)), `${tree} is left out and is not there`);
      assert.ok(why.length >= 60, `${tree} is left out without a reason somebody could argue with`);
    }
  });

  it('writes its reports where git does not keep them', () => {
    assert.match(read('.gitignore'), new RegExp(`^/${OUT}/$`, 'm'));
    assert.ok(!tracked.some((path) => path.startsWith(`${OUT}/`)), 'a coverage report is tracked');
  });
});

describe('the workflow measures, and cannot stand between a pull request and main', () => {
  const workflow = read('.github/workflows/coverage.yml');
  const ruleset = JSON.parse(read('.github/rulesets/main-branch.json'));
  const required = ruleset.rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks.map((check) => check.context);

  it('is not a required check', () => {
    const [, job] = workflow.match(/^ {4}name: (.+)$/m) ?? [];
    assert.ok(job, 'the job has no name');
    assert.ok(!required.includes(job), `${job} is required: a measurement must not block a merge`);
    assert.ok(!required.some((name) => /coverage|codecov/i.test(name)));
  });

  it('builds before it measures, and measures with the command a person runs', () => {
    const build = workflow.indexOf('run: npm run build\n');
    const measure = workflow.indexOf('run: npm run coverage\n');
    const upload = workflow.indexOf('upload-process');
    assert.ok(build !== -1 && measure !== -1 && upload !== -1);
    assert.ok(build < measure && measure < upload, 'build, then measure, then upload');
    assert.ok(Object.keys(JSON.parse(read('package.json')).scripts).includes('coverage'));
  });

  it('fetches the uploader at a pinned version and refuses it unless its checksum is the one written here', () => {
    const [, version] = workflow.match(/^ {6}CODECOV_CLI_VERSION: (v\d+\.\d+\.\d+)$/m) ?? [];
    const [, sum] = workflow.match(/^ {6}CODECOV_CLI_SHA256: ([0-9a-f]{64})$/m) ?? [];
    assert.ok(version, 'the uploader has no exact version');
    assert.ok(sum, 'the uploader has no sha256');
    // Compared as text, not as patterns: the address is one exact string, and a
    // pattern over a host name is a thing to anchor, which a literal never needs.
    assert.ok(workflow.includes('"https://cli.codecov.io/${CODECOV_CLI_VERSION}/linux/codecov"'), 'the uploader is fetched from its publisher, at the pinned version');
    assert.ok(!workflow.includes('cli.codecov.io/latest'), 'a moving version cannot have a fixed checksum');
    assert.equal(workflow.split('cli.codecov.io/').length - 1, 1, 'the uploader is fetched from one address');
    const fetched = workflow.indexOf('curl -fsSL');
    const checked = workflow.indexOf('sha256sum --check --strict');
    const executable = workflow.indexOf('chmod +x');
    const ran = workflow.indexOf('"$RUNNER_TEMP/codecov" upload-process');
    assert.ok(fetched !== -1 && fetched < checked && checked < executable && executable < ran, 'fetch, check, and only then make it runnable and run it');
    assert.doesNotMatch(workflow, /uses: codecov\//, 'the uploader is fetched and checked here, not taken as an action');
  });

  it('gives the uploader its token through the environment, and never on a command line', () => {
    const secrets = workflow.split('\n').filter((line) => line.includes('secrets.'));
    assert.deepEqual(secrets.map((line) => line.trim()), ['CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}']);
    const runs = [...workflow.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)+)/gm)].map((match) => match[1]).join('\n');
    assert.ok(runs.includes('upload-process'));
    assert.doesNotMatch(runs, /\$\{\{/, 'no expression is interpolated into a run body');
    assert.doesNotMatch(runs, /(?:\s-t\s|--token)/, 'the token is read from the environment by name');
    assert.doesNotMatch(runs, /echo[^\n]*\$\{?CODECOV_TOKEN\}?(?!")[^\n]*\$CODECOV_TOKEN/, 'the token is never printed');
    assert.doesNotMatch(runs, /echo "\$CODECOV_TOKEN|echo \$CODECOV_TOKEN/);
  });

  it('lets a failed upload fail the job on main, where the record is kept, and nowhere else', () => {
    /*
      The first run of this workflow went red on a pull request: the uploader
      exits 1 when Codecov refuses to record the commit, whether or not it was
      asked to fail on an error. So the exit code is always asked for, caught,
      and what it does is decided in the script.
    */
    const upload = workflow.slice(workflow.indexOf('refused=0'));
    assert.match(upload, /upload-process --disable-search --fail-on-error -F "\$flag" -f "\$report" \|\| refused=1\n/);
    const onMain = upload.indexOf('if [ "$refused" = "1" ] && [ "$EVENT" = "push" ]; then');
    const anywhere = upload.indexOf('if [ "$refused" = "1" ]; then');
    assert.ok(onMain !== -1 && anywhere !== -1 && onMain < anywhere, 'main is judged first');
    assert.match(upload.slice(onMain, anywhere), /::error::[^\n]+\n\s+exit 1\n/);
    assert.equal((upload.match(/\bexit 1\b/g) ?? []).length, 1, 'the job fails in one case only');
    assert.match(upload.slice(anywhere), /::warning::/);
    assert.match(workflow, /push:\n {4}branches: \[main\]/);
    assert.doesNotMatch(workflow, /continue-on-error/);
    assert.doesNotMatch(workflow, /\|\| true/);
  });

  it('asks for nothing it does not need', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(workflow, /: write\b/);
    const checkouts = workflow.match(/uses: actions\/checkout@/g) ?? [];
    assert.equal(checkouts.length, 1);
    assert.match(workflow, /persist-credentials: false/);
  });
});

describe('Codecov reports and does not judge', () => {
  const config = read('codecov.yml');

  it('both statuses are informational, and there is no target to write tests towards', () => {
    assert.match(config, /project:\n {6}default:\n {8}informational: true/);
    assert.match(config, /patch:\n {6}default:\n {8}informational: true/);
    assert.doesNotMatch(config, /^\s*(?:target|threshold):/m);
  });

  it('leaves no comment on a pull request', () => {
    assert.match(config, /^comment: false$/m);
  });

  it('is explained where the workflow says it is', () => {
    assert.ok(tracked.includes('docs/coverage.md'));
    const doc = read('docs/coverage.md');
    for (const suite of SUITES) assert.ok(doc.includes(`\`${suite.name}\``), `docs/coverage.md does not name ${suite.name}`);
    for (const tree of Object.keys(NOT_MEASURED)) assert.ok(doc.includes(tree), `docs/coverage.md does not say ${tree} is left out`);
    assert.match(doc, /not a required check/);
  });
});

describe('the script\'s figure is not passed off as Codecov\'s', () => {
  // The script's comment said "This is the figure Codecov shows", written
  // before Codecov had taken an upload. The first one came out 902 lines
  // lower (#709). What each counts is in the document; what is held here is
  // that nothing says they are the same again.
  const script = read('scripts/coverage.mjs');
  const doc = read('docs/coverage.md');
  const start = doc.indexOf('\n## Two figures, and why they differ\n');
  const section = start < 0 ? '' : doc.slice(start, doc.indexOf('\n## ', start + 4));

  it('the script says its figure is not the one Codecov shows', () => {
    assert.doesNotMatch(script, /This is the figure Codecov shows/);
    assert.match(script, /It is not the figure Codecov shows for the same reports/);
  });

  it('the document gives both, from one run, and says what each counts', () => {
    assert.ok(section.length > 0, 'the section on the two figures is gone');
    assert.doesNotMatch(doc, /Codecov has the current ones/);
    const rows = section.split('\n').filter((line) => line.startsWith('| `npm run coverage` |') || line.startsWith('| Codecov |'));
    assert.equal(rows.length, 2, 'the table no longer has a row for each');
    const [lines, other] = rows.map((row) => row.split('|')[2].trim());
    assert.equal(lines, other, 'the two rows are not over the same lines, so they are not one run');
    // What is known is bounded by its own heading and the next one: "branch
    // record" is also in the list of what is not known, and a search of the
    // whole section would be satisfied by that.
    const known = section.slice(section.indexOf('\nWhat is known:\n'), section.indexOf('\nWhat is not known:\n'));
    assert.match(known, /The script counts a line by its line record/);
    assert.match(known, /Codecov judges a line that carries a branch record by the branch/);
    // The link targets, each compared whole. Looking for the address somewhere
    // in the text would also accept it as part of another address.
    const targets = new Set([...section.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]));
    assert.ok(targets.has('https://docs.codecov.com/docs/about-code-coverage'), 'the formula has no source');
  });

  it('the document says what is not known, and does not explain it anyway', () => {
    assert.match(section, /\nWhat is not known:\n/);
    assert.match(section, /was not tested/);
    assert.match(section, /neither figure is the true one/);
  });

  it('the percentages in the table are the ones its counts give, rounded down', () => {
    for (const row of section.split('\n').filter((line) => line.startsWith('| `npm run coverage` |') || line.startsWith('| Codecov |'))) {
      const cells = row.split('|').map((cell) => cell.trim());
      const [total, hit] = [cells[2], cells[3]].map((cell) => Number(cell.replaceAll(',', '')));
      assert.equal(cells[6], `${(Math.floor((hit / total) * 1000) / 10).toFixed(1)}%`, row);
    }
  });

  it('the README shows Codecov\'s badge, with no token in its address', () => {
    const readme = read('README.md');
    assert.ok(readme.includes('[![Coverage](https://codecov.io/gh/Davmunrey/Trazum/graph/badge.svg)](https://app.codecov.io/gh/Davmunrey/Trazum)'));
    assert.doesNotMatch(readme, /badge\.svg\?token=/);
  });
});
