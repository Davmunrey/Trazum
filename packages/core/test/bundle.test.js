import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';
import { ANALYZER, BUILD, NAME, built, options, summary } from '../../../scripts/bundle-report.mjs';

/**
 * The web app's bundle size, and the workflow that sends it to Codecov.
 *
 * `scripts/bundle-report.mjs` hands a directory of built files to a program
 * this repository does not ship, and the workflow gives that step a secret.
 * What can go wrong is what goes wrong with any such step: the program at a
 * version nobody chose, the token somewhere it can be read, a measurement
 * that learns to block a merge. And one thing of its own: an empty directory
 * measured as a very small bundle. All of it is held here without the
 * program: a stand-in is installed where the script is told to look.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('what the analyzer is told', () => {
  it('the bundle has one name, the fork path is open, and the package reports nothing home', () => {
    const told = options({ token: 'abc', dryRun: false });
    assert.equal(told.bundleName, NAME);
    assert.equal(told.enableBundleAnalysis, true);
    assert.equal(told.gitService, 'github', 'without it a pull request from a fork cannot upload');
    assert.equal(told.telemetry, false, "the analyzer's own telemetry is on unless it is switched off");
    assert.equal(told.uploadToken, 'abc');
    assert.equal(told.dryRun, false);
  });

  it('no token is no option at all, not an empty one', () => {
    for (const token of [undefined, '']) assert.ok(!('uploadToken' in options({ token, dryRun: false })), JSON.stringify(token));
  });

  it('a dry run is passed on as one', () => {
    assert.equal(options({ token: undefined, dryRun: true }).dryRun, true);
  });
});

describe('what a report says in total', () => {
  const report = { assets: [{ name: 'a.js', size: 100, gzipSize: 40 }, { name: 'b.js', size: 3000, gzipSize: 900 }, { name: 'c.css', size: 20 }] };

  it('adds the sizes, counts the files and puts the largest first', () => {
    const said = summary(report);
    assert.equal(said.files, 3);
    assert.equal(said.bytes, 3120);
    assert.equal(said.gzip, 940, 'a file with no compressed size counts as none, not as NaN');
    assert.deepEqual(said.largest.map((asset) => asset.name), ['b.js', 'a.js', 'c.css']);
  });

  it('names at most five files', () => {
    const many = { assets: Array.from({ length: 9 }, (_, index) => ({ name: `${index}.js`, size: index, gzipSize: index })) };
    assert.deepEqual(summary(many).largest.map((asset) => asset.name), ['8.js', '7.js', '6.js', '5.js', '4.js']);
  });
});

describe('the command, with a stand-in where the analyzer would be', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
  /**
   * A package with the analyzer's name that writes down the options it was
   * given, with the token replaced by whether there was one, and answers
   * with a report of one file. `fail` makes it reject, as an upload Codecov
   * refuses does.
   */
  function standIn({ version = ANALYZER.version, name = ANALYZER.name, fail = false } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-analyzer-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs' }));
    writeFileSync(join(dir, 'index.cjs'), `
      const { writeFileSync } = require('node:fs');
      const { join } = require('node:path');
      exports.createAndUploadReport = async (dirs, core, extra) => {
        writeFileSync(join(__dirname, 'called.json'), JSON.stringify({ dirs, core: { ...core, uploadToken: 'uploadToken' in core ? 'given:' + core.uploadToken.length : 'absent' }, extra, argv: process.argv.slice(2) }));
        if (${fail}) throw new Error('Failed to upload stats, bad response. Response: 401 - Unauthorized');
        return JSON.stringify({ assets: [{ name: 'chunks/one.js', size: 2048, gzipSize: 1024 }] });
      };
    `);
    return {
      dir,
      called: () => JSON.parse(readFileSync(join(dir, 'called.json'), 'utf8')),
    };
  }
  const run = (args, env = {}) => spawnSync(process.execPath, [join(ROOT, 'scripts/bundle-report.mjs'), ...args], { cwd: ROOT, env: { ...SPAWN_ENV, CODECOV_TOKEN: '', ...env }, encoding: 'utf8', timeout: 30_000 });
  // A build of one chunk, so that none of this waits for the web app's: the
  // required job runs the tests before it builds the web app.
  const build = mkdtempSync(join(tmpdir(), 'trazum-static-'));
  dirs.push(build);
  mkdirSync(join(build, 'chunks'));
  writeFileSync(join(build, 'chunks', 'one.js'), 'x');

  it('says where the analyzer must be, when it is not told', () => {
    const result = run([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--analyzer/);
  });

  it('refuses an analyzer at another version, or another package under that path', () => {
    for (const other of [standIn({ version: '2.0.2' }), standIn({ version: '1.9.9' }), standIn({ name: '@codecov/bundle-analyser' })]) {
      const result = run(['--analyzer', other.dir, '--dry-run']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`written against ${ANALYZER.name.replace('/', '\\/')}@${ANALYZER.version.replaceAll('.', '\\.')}`));
      assert.throws(() => other.called(), 'the wrong program was run all the same');
    }
  });

  it('a directory with no script in it is not a build', () => {
    const empty = mkdtempSync(join(tmpdir(), 'trazum-static-'));
    dirs.push(empty);
    assert.equal(built(empty), false);
    assert.equal(built(join(empty, 'missing')), false);
    mkdirSync(join(empty, 'media'));
    writeFileSync(join(empty, 'media', 'font.woff2'), 'x');
    assert.equal(built(empty), false, 'a font alone is not a built app');
    mkdirSync(join(empty, 'chunks'));
    writeFileSync(join(empty, 'chunks', 'a.js'), 'x');
    assert.equal(built(empty), true);
  });

  it('measures the web app\'s build unless told otherwise, and refuses one that is not there', () => {
    const analyzer = standIn();
    const missing = run(['--analyzer', analyzer.dir, '--dry-run', '--build', join(build, 'nothing-here')]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /has no built script in it\. Run `npm run build:web` first\./);
    assert.throws(() => analyzer.called(), 'an empty directory was measured');
    const script = read('scripts/bundle-report.mjs');
    assert.ok(script.includes("const dir = resolve(ROOT, flag('--build') ?? BUILD);"));
    assert.equal(BUILD, 'apps/web/.next/static');
  });

  it('hands the analyzer the build, the options and the token from the environment, and prints the total', () => {
    const analyzer = standIn();
    const secret = 'not-a-real-token-0123456789';
    const result = run(['--analyzer', analyzer.dir, '--build', build], { CODECOV_TOKEN: secret });
    assert.equal(result.status, 0, result.stderr);
    const called = analyzer.called();
    assert.deepEqual(called.dirs, [build]);
    assert.equal(called.core.uploadToken, `given:${secret.length}`);
    assert.equal(called.core.dryRun, false);
    assert.equal(called.core.telemetry, false);
    assert.deepEqual(called.extra, { ignorePatterns: ['*.map'] });
    assert.deepEqual(called.argv, ['--analyzer', analyzer.dir, '--build', build], 'the token reached the program some other way than the environment');
    assert.match(result.stdout, /^An upload token is set\.$/m);
    assert.match(result.stdout, new RegExp(`^${NAME}: 1 files, 2\\.0 kB, 1\\.0 kB compressed {2}\\(2,048 and 1,024 bytes\\)$`, 'm'));
    assert.match(result.stdout, /^Sent to Codecov\.$/m);
    assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret), 'the token was printed');
  });

  it('with no token says so and still tries, which is the path a fork takes', () => {
    const analyzer = standIn();
    const result = run(['--analyzer', analyzer.dir, '--build', build]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(analyzer.called().core.uploadToken, 'absent');
    assert.match(result.stdout, /^No upload token here\. /m);
  });

  it('a dry run sends nothing and says so, and a refused upload exits 1 with the reason', () => {
    const dry = standIn();
    const result = run(['--analyzer', dry.dir, '--dry-run', '--build', build], { CODECOV_TOKEN: 'x' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(dry.called().core.dryRun, true);
    assert.match(result.stdout, /^A dry run: measured, and sent nowhere\.$/m);
    assert.doesNotMatch(result.stdout, /Sent to Codecov/);

    const refusing = standIn({ fail: true });
    const refused = run(['--analyzer', refusing.dir, '--build', build], { CODECOV_TOKEN: 'x' });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /bundle-report: Failed to upload stats, bad response\. Response: 401/);
    assert.doesNotMatch(refused.stdout, /Sent to Codecov/);
  });
});

describe('the workflow measures, and cannot stand between a pull request and main', () => {
  const workflow = read('.github/workflows/bundle.yml');
  const runs = [...workflow.matchAll(/^ {8}run: (?:\|\n((?: {10}.*\n|\n)+)|(.*)\n)/gm)].map((match) => match[1] ?? match[2]).join('\n');

  it('is not a required check', () => {
    const [, job] = workflow.match(/^ {4}name: (.+)$/m) ?? [];
    assert.ok(job, 'the job has no name');
    const required = JSON.parse(read('.github/rulesets/main-branch.json')).rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks.map((check) => check.context);
    assert.ok(!required.includes(job), `${job} is required: a measurement must not block a merge`);
  });

  it('installs the one version the script accepts, from a lockfile, outside the workspace, with install scripts off', () => {
    // From a manifest and lockfile of its own since #874, so `npm ci` checks
    // the hashes; the exact version is the manifest's and the lockfile's.
    const tool = JSON.parse(read('tools/bundle-analyzer/package.json'));
    assert.equal(tool.dependencies[ANALYZER.name], ANALYZER.version, 'the workflow installs a version the script refuses');
    const lock = JSON.parse(read('tools/bundle-analyzer/package-lock.json'));
    assert.equal(lock.packages[`node_modules/${ANALYZER.name}`]?.version, ANALYZER.version, 'the lockfile resolves another version');
    assert.ok(runs.includes('npm ci --prefix tools/bundle-analyzer --ignore-scripts --no-audit --no-fund'));
    assert.ok(runs.includes(`--analyzer tools/bundle-analyzer/node_modules/${ANALYZER.name}`));
    assert.doesNotMatch(runs, /npx /, 'npx would fetch whatever is newest and run its install scripts');
    assert.doesNotMatch(runs, /npm install/, 'an install that no lockfile checks');
    // And no package gained it: it is not in any manifest or in the lockfile.
    for (const manifest of ['package.json', 'apps/web/package.json', 'package-lock.json']) assert.ok(!read(manifest).includes('@codecov/'), `${manifest} depends on it`);
  });

  it('builds the web app before it measures it, with the command a person runs', () => {
    const order = ['npm ci --ignore-scripts', 'npm run build\n', 'npm run build:web', 'npm ci --prefix', 'node scripts/bundle-report.mjs'].map((step) => runs.indexOf(step));
    assert.ok(order.every((at) => at !== -1), `a step is missing: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'install, build, build the web app, fetch the analyzer, measure');
  });

  it('gives the script its token through the environment, and never on a command line', () => {
    const secrets = workflow.split('\n').filter((line) => line.includes('secrets.'));
    assert.deepEqual(secrets.map((line) => line.trim()), ['CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}']);
    assert.doesNotMatch(runs, /\$\{\{/, 'no expression is interpolated into a run body');
    assert.doesNotMatch(runs, /CODECOV_TOKEN/, 'the script reads the token by name; the workflow never spells it in a command');
    assert.doesNotMatch(runs, /--upload-token|--token/);
    assert.doesNotMatch(read('scripts/bundle-report.mjs'), /console\.(?:log|error)\([^\n]*\btoken\b(?!\s*===|\s*!==| is| here)/, 'the script prints the token');
  });

  it('lets a report that was not taken fail the job on main, and nowhere else', () => {
    assert.match(runs, /node scripts\/bundle-report\.mjs --analyzer tools\/bundle-analyzer\/node_modules\/@codecov\/bundle-analyzer \|\| refused=1\n/);
    const onMain = runs.indexOf('if [ "$refused" = "1" ] && [ "$EVENT" = "push" ]; then');
    const anywhere = runs.indexOf('if [ "$refused" = "1" ]; then');
    assert.ok(onMain !== -1 && anywhere !== -1 && onMain < anywhere, 'main is judged first');
    assert.match(runs.slice(onMain, anywhere), /::error::[^\n]+\n\s+exit 1\n/);
    assert.equal((runs.match(/\bexit 1\b/g) ?? []).length, 1, 'the job fails in one case only');
    assert.match(runs.slice(anywhere), /::warning::/);
    assert.doesNotMatch(runs, /--dry-run/, 'a dry run in CI records nothing and looks like success');
    assert.doesNotMatch(runs, /--build/, 'the workflow measures the web app and nothing else');
    assert.match(workflow, /push:\n {4}branches: \[main\]/);
    assert.doesNotMatch(workflow, /continue-on-error/);
    assert.doesNotMatch(workflow, /\|\| true/);
  });

  it('asks for nothing it does not need', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(workflow, /: write\b/);
    assert.match(workflow, /persist-credentials: false/);
  });
});

describe('Codecov reports the bundle and does not judge it', () => {
  it('the status is informational', () => {
    assert.match(read('codecov.yml'), /^bundle_analysis:\n {2}warning_threshold: "\d+%"\n {2}status: "informational"$/m);
  });
});

describe('the document says what is measured and what is sent', () => {
  const doc = read('docs/coverage.md');
  // Taken inside each test: a section that is gone throws, and that should
  // fail a test with its message, not stop the file from loading.
  const bundle = () => sectionOf(doc, "## The web app's bundle\n");

  it('names the directory, the bundle and the version, as the script has them', () => {
    const section = bundle();
    assert.ok(section.includes(`\`${BUILD}\``));
    assert.ok(section.includes(`${ANALYZER.name}@${ANALYZER.version}`));
    assert.ok(section.includes(`${NAME}: `));
  });

  it('says to read the total and why, that nothing fails, and what leaves the machine', () => {
    const section = bundle();
    assert.match(section, /Read the total, not the per-file difference/);
    assert.match(section, /Nothing fails/);
    assert.match(section, /What is sent: file names, sizes and compressed sizes/);
    assert.match(section, /No source/);
    assert.match(section, /telemetry off/);
  });

  it('no longer says the bundle is not measured', () => {
    assert.doesNotMatch(doc, /## What Codecov is not used for/);
    assert.doesNotMatch(doc, /Neither is set up/);
  });

  it('every secret the workflow reads has its rotation written for this workflow too', () => {
    // The token's own subsection, whatever comes after it.
    const procedure = read('docs/compliance/secret-rotation.md').split('\n### ').find((part) => part.startsWith('`CODECOV_TOKEN`\n'));
    assert.ok(procedure, 'CODECOV_TOKEN has no rotation procedure');
    assert.ok(procedure.includes('.github/workflows/bundle.yml'));
  });
});
