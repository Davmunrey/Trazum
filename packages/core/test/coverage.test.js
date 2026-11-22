import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';
import { NOT_MEASURED, OUT, SUITES, clean, failures, junitOf, nodeArgs, strangers, summarise, tapOf, together, usable } from '../../../scripts/coverage.mjs';

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

  it('and keeps the runner\'s own account beside the report, each reporter next to its destination', () => {
    const args = nodeArgs({ name: 'core', tests: 'packages/core/test/*.test.js' }, 'coverage/core.lcov');
    // Reporters and destinations are paired by the order they are given in.
    // Two reporters and one destination, or the pairs crossed, and the lcov
    // file would be TAP: a report with no source, which fails the command.
    const paired = args.filter((arg) => arg.startsWith('--test-reporter'));
    assert.deepEqual(paired, [
      '--test-reporter=lcov', '--test-reporter-destination=coverage/core.lcov',
      '--test-reporter=tap', '--test-reporter-destination=coverage/core.tap',
      '--test-reporter=junit', '--test-reporter-destination=coverage/core.junit.xml',
    ]);
    assert.equal(tapOf('coverage/tokenizer-openai.lcov'), 'coverage/tokenizer-openai.tap');
    assert.equal(junitOf('coverage/tokenizer-openai.lcov'), 'coverage/tokenizer-openai.junit.xml');
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
    assert.ok(!required.some((name) => /coverage|codecov|codacy|deepsource/i.test(name)));
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
    assert.deepEqual(secrets.map((line) => line.trim()), [
      'CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}',
      'CODACY_PROJECT_TOKEN: ${{ secrets.CODACY_PROJECT_TOKEN }}',
    ]);
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

describe('Codacy is sent the same reports, and cannot stand in the way either', () => {
  const workflow = read('.github/workflows/coverage.yml');
  const from = workflow.indexOf('      - name: Send the same reports to Codacy');
  const step = workflow.slice(from);
  const body = step.slice(step.indexOf('        run: |\n'));

  it('is the last step, after Codecov has the record', () => {
    assert.ok(from !== -1, 'there is no Codacy step');
    assert.ok(workflow.indexOf('- name: Upload the reports to Codecov') < from);
    assert.equal(step.split('\n      - name: ').length, 1, 'a step follows it');
  });

  it('fetches the reporter at a pinned version, from its publisher, and never its install script', () => {
    const [, version] = workflow.match(/^ {6}CODACY_REPORTER_VERSION: (\d+\.\d+\.\d+)$/m) ?? [];
    const [, sum] = workflow.match(/^ {6}CODACY_REPORTER_SHA512: ([0-9a-f]{128})$/m) ?? [];
    assert.ok(version, 'the reporter has no exact version');
    assert.ok(sum, 'the reporter has no sha512');
    assert.ok(
      body.includes('"https://artifacts.codacy.com/bin/codacy-coverage-reporter/${CODACY_REPORTER_VERSION}/codacy-coverage-reporter-linux"'),
      'the reporter is fetched from its publisher, at the pinned version',
    );
    assert.equal(workflow.split('artifacts.codacy.com/').length - 1, 1, 'the reporter is fetched from one address');
    // As text: each is one exact string, and a literal needs no anchoring.
    for (const moving of ['codacy-coverage-reporter/latest', 'get.sh', 'bash <(']) {
      assert.ok(!body.includes(moving), `${moving}: what is fetched at run time has no fixed checksum`);
    }
    assert.doesNotMatch(workflow, /uses: codacy\//, 'the reporter is fetched and checked here, not taken as an action');
  });

  it('asks for a token first, then fetches, checks, and only then makes it runnable and runs it', () => {
    const order = [
      'if [ -z "$CODACY_PROJECT_TOKEN" ]; then',
      'curl -fsSL --retry 3 -o "$reporter"',
      'echo "${CODACY_REPORTER_SHA512}  $reporter" | sha512sum --check --strict -',
      'chmod +x "$reporter"',
      '"$reporter" report ',
    ].map((text) => body.indexOf(text));
    assert.ok(order.every((at) => at !== -1), `a step is missing: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'out of order');
  });

  it('a checksum that is not the pinned one stops the step: nothing softens that line', () => {
    const [line] = body.split('\n').filter((text) => text.includes('sha512sum --check'));
    assert.equal(line.trim(), 'echo "${CODACY_REPORTER_SHA512}  $reporter" | sha512sum --check --strict -');
    assert.doesNotMatch(body, /set \+e/);
  });

  it('cannot fail the job because of Codacy: no token, no download and a refusal each stop with a line in the log', () => {
    assert.doesNotMatch(body, /\bexit [1-9]/, 'the step exits with a failure of its own');
    assert.match(body, /if \[ -z "\$CODACY_PROJECT_TOKEN" \]; then\n\s+echo "No Codacy token here[^\n]*\n\s+exit 0\n/);
    assert.match(body, /if ! curl [^\n]+; then\n\s+echo "::warning::[^\n]+\n\s+exit 0\n/);
    assert.match(body, /if ! "\$reporter" report [^\n]+; then\n\s+echo "::warning::[^\n]+\n\s+fi\n$/);
  });

  it('gives the reporter its token through the environment, and the commit that was pushed', () => {
    assert.doesNotMatch(body, /--project-token|\s-t\s/, 'the token is read from the environment by name');
    assert.doesNotMatch(body, /echo[^\n]*\$\{?CODACY_PROJECT_TOKEN/, 'the token is never printed');
    assert.ok(step.includes('COMMIT: ${{ github.event.pull_request.head.sha || github.sha }}'), 'a pull request is measured at a merge commit Codacy has never seen');
    assert.ok(body.includes('--commit-uuid "$COMMIT"'));
  });

  it('sends every report the script wrote, read as what they are', () => {
    assert.ok(body.includes('for report in coverage/*.lcov; do'));
    assert.ok(body.includes('reports+=(-r "$report")'));
    assert.ok(body.includes('--force-coverage-parser lcov "${reports[@]}"'));
  });

  it('is explained where the workflow says the rest is', () => {
    const section = sectionOf(read('docs/coverage.md'), '## Codacy\n');
    assert.ok(section, 'docs/coverage.md has no section on Codacy');
    const [, version] = workflow.match(/CODACY_REPORTER_VERSION: (\S+)/);
    assert.ok(section.includes(version), `the document does not name the pinned version ${version}`);
    for (const said of ['CODACY_PROJECT_TOKEN', 'repository', 'cannot fail', 'checksum']) {
      assert.ok(section.includes(said), `the section does not say "${said}"`);
    }
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

describe('Codecov groups the files by package, and that is held to the packages measured', () => {
  // `codecov.yml` is read as text: nothing here parses YAML, and the part that
  // matters is regular. The block is from `component_management:` to the next
  // line that starts at the left margin and is not a comment.
  const config = read('codecov.yml');
  const lines = config.split('\n');
  const start = lines.indexOf('component_management:');
  let end = lines.findIndex((line, index) => index > start && /^[^\s#]/.test(line));
  if (end === -1) end = lines.length;
  const block = start === -1 ? '' : lines.slice(start, end).join('\n');
  const components = block.split(/^ {4}- /m).slice(1).map((entry) => ({
    id: entry.match(/^component_id: (\S+)$/m)?.[1],
    name: entry.match(/^ {6}name: (\S+)$/m)?.[1],
    paths: [...entry.matchAll(/^ {8}- (\S+)$/gm)].map((match) => match[1]),
    keys: [...entry.matchAll(/^(?:component_id|[ ]{6}\w+): ?/gm)].map((match) => match[0].trim().replace(/:$/, '')),
  }));

  it('is there, and every component is read whole', () => {
    assert.ok(block.length > 0, 'codecov.yml has no component_management');
    assert.match(block, /^ {2}individual_components:$/m);
    assert.equal(components.length, (block.match(/^ {4}- component_id:/gm) ?? []).length);
    for (const component of components) {
      assert.ok(component.id, 'a component has no component_id');
      assert.ok(component.name, `${component.id} has no name`);
      assert.ok(component.paths.length > 0, `${component.id} has no paths`);
    }
  });

  it('has one component for each package measured, and none for a package that is not', () => {
    assert.deepEqual(components.map((component) => component.name).sort(), SUITES.map((suite) => suite.name).sort());
    for (const suite of SUITES) {
      assert.equal(components.filter((component) => component.name === suite.name).length, 1, `${suite.name} is not one component`);
    }
  });

  it('gives each an id that is its package, unique, and made of letters, digits, hyphens and underscores', () => {
    const ids = components.map((component) => component.id);
    assert.equal(new Set(ids).size, ids.length, 'two components share an id');
    for (const component of components) {
      // Codecov's validator accepted any string as an id when this was written
      // (2026-11-18), so this is the repository's own rule, not Codecov's: an
      // id is a thing a link and a stored history are keyed by.
      assert.match(component.id, /^[a-z0-9][a-z0-9_-]*$/, component.id);
      assert.equal(component.id, component.name, 'the id and the name are one word, so renaming one is not a new history');
    }
  });

  it('points each at the sources of its own package, in a directory that exists', () => {
    for (const component of components) {
      assert.deepEqual(component.paths, [`packages/${component.id}/src/**`], component.id);
      const directory = component.paths[0].replace(/\/\*\*$/, '');
      assert.ok(existsSync(join(ROOT, directory)), `${directory} is not a directory here`);
      assert.ok(tracked.some((path) => path.startsWith(`${directory}/`) && path.endsWith('.ts')), `${directory} holds no TypeScript`);
    }
  });

  it('matches the paths the reports carry: relative to the root, under packages/<name>/src', () => {
    // A report's source files are all of this shape (`strangers` refuses the
    // rest), so a pattern that is not is one no file would ever match.
    for (const component of components) {
      for (const path of component.paths) assert.deepEqual(strangers([path.replace(/\*\*$/, 'a.ts')]), [], path);
    }
  });

  it('has no status of its own and none by default, because the plan does not show them', () => {
    assert.doesNotMatch(block, /statuses:/);
    assert.doesNotMatch(block, /default_rules:/);
    assert.doesNotMatch(block, /^\s*-?\s*type:\s*(?:project|patch)/m);
    for (const component of components) assert.deepEqual(component.keys, ['component_id', 'name', 'paths'], component.id);
  });

  it('is explained: the document names each, says they need nothing at upload, and says the plan', () => {
    const section = sectionOf(read('docs/coverage.md'), '## Components\n');
    for (const component of components) assert.ok(section.includes(`\`${component.id}\``), `the section does not name ${component.id}`);
    assert.ok(section.includes('`packages/core/src/**`'), 'the section gives no example of a path');
    assert.match(section, /need nothing at upload time/);
    assert.match(section, /There are no component statuses/);
    assert.match(section, /Components under "Available with Pro Plan"/);
    assert.match(section, /Codecov shows components only on its Pro plan, as read on that\s+screen on that date/);
    assert.match(section, /2026-11-18/);
  });

  it('the paid-plan section agrees: components are configured, and whether they show depends on the plan', () => {
    const section = sectionOf(read('docs/coverage.md'), "## What needs Codecov's paid plan\n");
    assert.match(section, /components/);
    assert.match(section, /\[components\]\(#components\)[\s\S]*configured/);
    assert.doesNotMatch(section, /None is relied on/);
    assert.match(section, /depends on the plan/);
  });
});

describe('the script\'s figure is not passed off as Codecov\'s', () => {
  // The script's comment said "This is the figure Codecov shows", written
  // before Codecov had taken an upload. The first one came out 902 lines
  // lower (#709). What each counts is in the document; what is held here is
  // that nothing says they are the same again.
  const script = read('scripts/coverage.mjs');
  const doc = read('docs/coverage.md');
  // A section that is gone throws. Caught here so that the file still loads
  // and the first test below is what says so.
  let section = '';
  try {
    section = sectionOf(doc, '## Two figures, and why they differ\n');
  } catch {
    section = '';
  }

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
    assert.ok(readme.includes('[![Coverage](https://codecov.io/gh/TrazumAPP/Trazum/graph/badge.svg)](https://app.codecov.io/gh/TrazumAPP/Trazum)'));
    assert.doesNotMatch(readme, /badge\.svg\?token=/);
  });
});

describe('a test that fails under coverage is named', () => {
  // The runner is asked, here, what it writes for a failure: a sample kept in
  // this file would describe the Node it was copied from. `NODE_TEST_CONTEXT`
  // is what tells a child it is a test inside this run; with it the child
  // reports to this process and writes no file.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'trazum-tap-')));
  after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'sample.test.js'), [
    "import assert from 'node:assert/strict';",
    "import { describe, it } from 'node:test';",
    "describe('a group', () => {",
    "  it('passes', () => {});",
    "  it('fails with a comparison', () => { assert.equal(1 + 1, 3, 'two is not three'); });",
    "  describe('an inner group', () => {",
    "    it('throws', () => { throw new Error('boom: first line\\nsecond line'); });",
    "    it('is skipped', { skip: true }, () => { assert.ok(false); });",
    "  });",
    "});",
    "it('at the top', () => { assert.ok(false); });",
    "it('not written yet', { todo: true }, () => { assert.ok(false); });",
    '',
  ].join('\n'));
  const env = { ...SPAWN_ENV };
  delete env.NODE_TEST_CONTEXT;
  const args = nodeArgs({ name: 'sample', tests: 'sample.test.js' }, 'sample.lcov');
  const run = spawnSync(process.execPath, args, { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
  const tap = existsSync(join(dir, 'sample.tap')) ? readFileSync(join(dir, 'sample.tap'), 'utf8') : '';
  const found = failures(tap, dir);

  it('the run fails, and all three reports are written by the arguments the script passes', () => {
    assert.equal(run.status, 1, run.stderr);
    assert.match(tap, /^TAP version 13$/m);
    assert.match(readFileSync(join(dir, 'sample.lcov'), 'utf8'), /^SF:/m);
    // What Codecov's test analytics is sent: a name, a time and a verdict for
    // each test, and for a failure its message.
    const junit = readFileSync(join(dir, 'sample.junit.xml'), 'utf8');
    assert.match(junit, /^<\?xml /);
    assert.match(junit, /<testcase name="passes" time="[\d.]+"/);
    assert.match(junit, /<testcase name="fails with a comparison"[^>]*>\s*<failure [^>]*message="two is not three/);
    assert.equal(run.stderr, '', 'the run warns about something on every run');
  });

  it('each failing test is listed with its file and line and the first line of its error', () => {
    assert.deepEqual(found.map((test) => [test.name, test.location]), [
      ['fails with a comparison', 'sample.test.js:5'],
      ['throws', 'sample.test.js:7'],
      ['at the top', 'sample.test.js:11'],
    ]);
    assert.equal(found[0].error, 'two is not three');
    assert.equal(found[1].error, 'boom: first line');
    assert.ok(found[2].error.length > 0, 'a failure with no word of why');
  });

  it('a group is not listed for the test inside it, nor a todo, nor a skip', () => {
    const names = found.map((test) => test.name);
    for (const name of ['a group', 'an inner group', 'is skipped', 'not written yet', 'passes']) assert.ok(!names.includes(name), name);
    // The runner does print the first, the second and the todo as `not ok`.
    for (const name of ['a group', 'an inner group', 'not written yet']) assert.match(tap, new RegExp(`^\\s*not ok \\d+ - ${name}`, 'm'));
  });

  it('a result with nothing under it is still listed, and does not borrow the next one\'s details', () => {
    const bare = ['not ok 1 - bare', 'not ok 2 - detailed', '  ---', "  location: '/x/y.test.js:9:1'", "  error: 'why'", '  ...', ''].join('\n');
    assert.deepEqual(failures(bare, '/x'), [
      { name: 'bare', location: null, error: null },
      { name: 'detailed', location: 'y.test.js:9', error: 'why' },
    ]);
  });

  it('nothing is listed when nothing failed', () => {
    assert.deepEqual(failures('TAP version 13\nok 1 - fine\n  ---\n  duration_ms: 1\n  ...\n1..1\n'), []);
  });

  it('the script prints them where it says a test failed, and says so when the runner named none', () => {
    const script = read('scripts/coverage.mjs');
    const said = script.indexOf('a test failed in this run (exit ${code})');
    assert.ok(said > 0);
    const after = script.slice(said, said + 700);
    assert.match(after, /for \(const test of failed\)/);
    assert.match(after, /test\.location/);
    assert.match(after, /test\.error/);
    assert.match(after, /the runner stopped without naming a test/);
  });

  it('the test results are uploaded as test results, from the same run, under the same rule for a refusal', () => {
    const workflow = read('.github/workflows/coverage.yml');
    const upload = workflow.slice(workflow.indexOf('refused=0'));
    assert.match(upload, /for results in coverage\/\*\.junit\.xml; do\n\s+flag="\$\(basename "\$results" \.junit\.xml\)"\n\s+"\$RUNNER_TEMP\/codecov" upload-process --disable-search --fail-on-error --report-type test_results -F "\$flag" -f "\$results" \|\| refused=1\n/);
    // Before the verdict, so that one rule covers both kinds of upload.
    assert.ok(upload.indexOf('--report-type test_results') < upload.indexOf('if [ "$refused" = "1" ] && [ "$EVENT" = "push" ]; then'));
    // And never a coverage report sent as test results, or the other way round.
    assert.doesNotMatch(upload, /--report-type test_results[^\n]*\$report\b/);
    assert.equal((upload.match(/--report-type/g) ?? []).length, 1);
  });

  it('the document says what of a test is sent, and that a failure here still fails nothing', () => {
    const doc = read('docs/coverage.md');
    const section = sectionOf(doc, '## Test results\n');
    assert.match(section, /What is sent: each test's name, how long it took, whether it passed/);
    assert.match(section, /host\s+name/);
    assert.match(section, /No source/);
    assert.match(section, /still does not fail the job/);
    assert.ok(section.includes('`coverage/<package>.junit.xml`'));
  });

  it('the account is kept out of git and out of the upload', () => {
    assert.match(read('.gitignore'), new RegExp(`^/${OUT}/$`, 'm'));
    const workflow = read('.github/workflows/coverage.yml');
    assert.match(workflow, /for report in coverage\/\*\.lcov; do/);
    assert.doesNotMatch(workflow, /\.tap/);
  });
});
