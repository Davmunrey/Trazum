#!/usr/bin/env node
/**
 * Is this change done? Every criterion that can be checked before the push,
 * in order, each with a verdict and the reason when it is not "passed".
 *
 *   npm run done                       every criterion
 *   npm run done -- --list             what would be checked, and where each comes from
 *   npm run done -- --only lint,tests  some of them; never a verdict of "done"
 *   npm run done -- --body pr.md       read the pull request description from a file
 *   npm run done -- --base origin/main compare against another ref
 *
 * Why it exists. The pieces were all here: `npm run verify`, the required
 * checks, `PR readiness`. What made them a loop was one session's habit, and
 * a habit has holes. `publish.test.js` reads `git ls-files`, so a new test
 * file is invisible to it until it is staged, and a local run passed where CI
 * failed (#685). This runs the same things CI runs, in the tree you have, and
 * says "not done yet, and here is why".
 *
 * It adds no criterion of its own. Every entry in CRITERIA names where it
 * comes from: a step of the required CI job, another workflow, a section of
 * CONTRIBUTING.md or a test. Where the source is a one-line CI step, the
 * command is read out of ci.yml when this runs, so there is nothing here to
 * drift. `done.test.js` fails when a step of that job is neither a criterion
 * nor on the list of steps left out, each with its reason.
 *
 * It fixes nothing and skips nothing. Three verdicts per criterion:
 *
 *   passed    it was checked and it holds
 *   FAILED    it was checked and it does not; the reason follows
 *   not run   it could not be checked here; the reason says what is missing
 *
 * and one more, "n/a", for a criterion no changed file brings into play.
 * "not run" is not "passed": the exit code is 0 only when every criterion
 * that applies passed, 1 when one failed, and 2 when nothing failed and
 * something was not run. CI still runs what this machine could not.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { linkedIssues, readiness } from './pr-readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CI = '.github/workflows/ci.yml';
export const CI_JOB = 'test';
export const MUTATION = '.github/workflows/mutation.yml';

/**
 * The named steps of one job in a workflow file, in order, each with what it
 * runs. Read with string functions, not a YAML parser: the repository has no
 * dependency to parse YAML with, and the files it reads are its own.
 */
export function stepsOf(workflow, job) {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  if (start === -1) throw new Error(`no job named "${job}" in the workflow`);
  const rest = workflow.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[A-Za-z_-]+:\n/);
  const block = end === -1 ? rest : rest.slice(0, end + 1);
  const steps = [];
  for (const chunk of block.split(/\n {6}- /).slice(1)) {
    if (!chunk.startsWith('name: ')) continue;
    const name = chunk.slice('name: '.length, chunk.indexOf('\n') === -1 ? undefined : chunk.indexOf('\n'));
    const single = /\n {8}run: (?!\|)(.+)/.exec(chunk);
    const many = /\n {8}run: \|\n((?: {10}.*(?:\n|$)|\n)+)/.exec(chunk);
    const lines = single ? [single[1].trim()] : many ? many[1].split('\n').map((line) => line.trim()).filter(Boolean) : [];
    steps.push({ name, lines, command: single ? single[1].trim() : null });
  }
  return steps;
}

/** The `paths` a workflow's pull_request trigger is filtered by. */
export function pathsOf(workflow) {
  const block = /\n {2}pull_request:\n {4}paths:\n((?: {6}- .+\n)+)/.exec(workflow);
  if (block === null) throw new Error('the workflow has no pull_request paths');
  return block[1].trim().split('\n').map((line) => line.trim().slice(2).replace(/^'|'$/g, ''));
}

/**
 * Whether a path is one a workflow's filter names. Two shapes are understood,
 * a file and a directory with everything under it, because those are the two
 * the workflows use. Any other pattern throws: a shape this did not
 * understand would otherwise match nothing and read as "does not apply".
 */
export function matches(pattern, path) {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
  if (/[*?[\]{}]/.test(pattern)) throw new Error(`a path filter this cannot read: ${pattern}`);
  return path === pattern;
}

/** The last lines of a command's output, which is where it says what went wrong. */
export function tail(output, lines = 20) {
  const all = output.replace(/\s+$/, '').split('\n');
  return all.slice(-lines).join('\n');
}

/**
 * The verdict over every criterion's result. `asked` is how many criteria
 * there are in all: when fewer were run than exist, the answer is never
 * "done", whatever the ones that ran said.
 */
export function verdict(results, asked = results.length) {
  const count = (state) => results.filter((result) => result.state === state).length;
  const failed = count('failed');
  const notRun = count('not run');
  const left = asked - results.length;
  const parts = [`${count('passed')} passed`, `${failed} failed`, `${notRun} not run`];
  if (count('n/a') > 0) parts.push(`${count('n/a')} did not apply`);
  if (left > 0) parts.push(`${left} not asked for`);
  if (failed > 0) return { code: 1, line: `Not done: ${parts.join(', ')}.` };
  if (notRun > 0 || left > 0) return { code: 2, line: `Not done: ${parts.join(', ')}. Nothing failed; CI runs what was not run here.` };
  return { code: 0, line: `Done: ${parts.join(', ')}.` };
}

const passed = (reason = '') => ({ state: 'passed', reason });
const failed = (reason) => ({ state: 'failed', reason });
const notRun = (reason) => ({ state: 'not run', reason });
const notApplicable = (reason) => ({ state: 'n/a', reason });

/** A criterion that is one line of the required CI job, run as CI runs it. */
const ciStep = (id, step, what, needs = []) => ({
  id,
  what,
  source: { ci: step },
  needs,
  async check(tools) {
    return tools.command(tools.ciCommand(step));
  },
});

const BROWSER = 'needs a browser: set CHROME_PATH to a Chrome or Chromium and PLAYWRIGHT_CORE_PATH to a playwright-core directory (docs/end-to-end-tests.md has the two lines that install one)';

/**
 * The criteria, in the order to check them: what costs a second first, then
 * what CI's required job runs, in the order it runs it, then the one workflow
 * that only some changes bring into play.
 */
export const CRITERIA = [
  {
    id: 'staged',
    what: 'every new file is tracked, so CI and the tests that read the file list can see it',
    source: { test: 'publish.test.js' },
    needs: [],
    async check({ git }) {
      const untracked = git('ls-files', '--others', '--exclude-standard').trim().split('\n').filter(Boolean);
      if (untracked.length === 0) return passed();
      return failed(`${untracked.length} file(s) are not tracked: ${untracked.slice(0, 8).join(', ')}${untracked.length > 8 ? ', …' : ''}. CI will not have them, and a test that reads \`git ls-files\` cannot see them here either. Stage them and run this again.`);
    },
  },
  {
    id: 'signed-off',
    what: 'every commit on the branch carries a Signed-off-by line',
    source: { workflow: '.github/workflows/dco.yml', contributing: 'Signing off' },
    needs: [],
    async check({ commits }) {
      if (commits === null) return notRun('there is no base to compare with: fetch it, or name one with --base');
      if (commits.length === 0) return passed('no commit ahead of the base yet');
      const unsigned = commits.filter((commit) => !/^Signed-off-by: .+ <.+>$/m.test(commit.message));
      if (unsigned.length === 0) return passed();
      return failed(`${unsigned.length} commit(s) have no Signed-off-by line: ${unsigned.map((commit) => commit.sha.slice(0, 7)).join(', ')}. Commit with -s.`);
    },
  },
  {
    id: 'changelog',
    what: 'the change adds its changelog entry as a file in changes/, and edits no entry in CHANGELOG.md',
    source: { workflow: '.github/workflows/pr-readiness.yml', contributing: 'Pull requests' },
    needs: [],
    async check({ changelog }) {
      if (changelog === null) return notRun('there is no base to compare with: fetch it, or name one with --base');
      // Excused from the issue rules, the way a `no-issue` pull request is, so
      // the only problems left are the changelog's, in CI's own words.
      const { problems, release } = readiness({ body: '', author: '', labels: ['no-issue'], changelogBefore: changelog.before, changelogAfter: changelog.after, added: changelog.added });
      if (problems.length > 0) return failed(problems.join(' '));
      return passed(release ? 'a release: it adds a version heading' : '');
    },
  },
  {
    id: 'issue',
    what: 'the pull request names the issue it resolves',
    source: { workflow: '.github/workflows/pr-readiness.yml', contributing: 'Issue first' },
    needs: [],
    async check({ body, commits }) {
      const text = body ?? (commits ?? []).map((commit) => commit.message).join('\n');
      if (text.trim() === '') return notRun('there is nothing to read yet: no commit ahead of the base and no --body file. The description must say `Fixes #<n>`.');
      const linked = linkedIssues(text);
      if (linked.length > 0) return passed(`${linked.join(', ')}, read from ${body === null ? 'the commit messages' : 'the --body file'}`);
      return failed(`no closing keyword in ${body === null ? 'any commit message on the branch' : 'the --body file'}. Put \`Fixes #<n>\` in the description, and open the issue first if there is none.`);
    },
  },
  ciStep('lint', 'Lint', 'the linter finds nothing'),
  ciStep('build', 'Build core, CLI, MCP server, the OpenAI tokenizer and the editor extension', 'every package builds'),
  ciStep('tests', 'Tests (core, CLI, MCP, tokenizer, editor extension, web, Action)', 'every test passes', ['build']),
  {
    id: 'postgres',
    what: 'the web store keeps its contract on a real PostgreSQL',
    source: { ci: 'Web store contract on PostgreSQL' },
    needs: ['build'],
    command: 'node --test apps/web/test/store-contract.test.mjs',
    async check({ env, command }) {
      if (!env.TRAZUM_TEST_DATABASE_URL) return notRun('needs a PostgreSQL database: set TRAZUM_TEST_DATABASE_URL to an empty one');
      return command(this.command, { TRAZUM_REQUIRE_POSTGRES: '1' });
    },
  },
  ciStep('baseline', 'Our own baseline gate', "the repository passes its own prompt gate", ['build']),
  ciStep('performance', 'Performance ratio gate', 'no workload is three times slower than recorded', ['build']),
  ciStep('typecheck-web', 'Typecheck the web app', 'the web app type-checks', ['build']),
  ciStep('build-web', 'Build the web app', 'the web app builds', ['build']),
  {
    id: 'privacy',
    what: 'a pasted log never leaves the browser',
    source: { ci: 'Privacy probe (a pasted log never leaves the browser)' },
    needs: ['build-web'],
    command: 'node scripts/privacy-probe.mjs',
    async check({ env, served }) {
      if (!env.CHROME_PATH || !env.PLAYWRIGHT_CORE_PATH) return notRun(BROWSER);
      return served((url) => `${this.command} --url ${url} --chrome "$CHROME_PATH" --playwright "$PLAYWRIGHT_CORE_PATH" --cpu-throttle 6`);
    },
  },
  {
    id: 'e2e',
    what: 'the web app does what a visitor does, in a browser',
    source: { ci: 'End-to-end tests (the page, in a browser)' },
    needs: ['build-web'],
    command: 'node scripts/e2e.mjs',
    async check({ env, served }) {
      if (!env.CHROME_PATH || !env.PLAYWRIGHT_CORE_PATH) return notRun(BROWSER);
      return served((url) => `${this.command} --url ${url} --chrome "$CHROME_PATH" --playwright "$PLAYWRIGHT_CORE_PATH"`);
    },
  },
  ciStep('packed', 'Stress the packed release in an isolated installation', 'the packages work when packed and installed', ['build']),
  {
    id: 'mutation',
    what: 'no mutant lives on a changed line that is not on record',
    source: { workflow: MUTATION, contributing: 'Mutation testing, beside both' },
    needs: ['build'],
    async check({ env, changed, base, read, command }) {
      const workflow = read(MUTATION);
      const touched = changed.filter((path) => pathsOf(workflow).some((pattern) => matches(pattern, path)));
      if (touched.length === 0) return notApplicable('no changed file is one the Mutation testing workflow runs on');
      if (base === null) return notRun('there is no base to compare with: fetch it, or name one with --base');
      if (!env.TRAZUM_ACORN) return notRun('needs a parser: set TRAZUM_ACORN to an acorn directory (docs/mutation-testing.md has the two lines that install one)');
      const tool = await command('npm run test:mutation');
      if (tool.state !== 'passed') return tool;
      const lines = await command(`node scripts/mutate.mjs --acorn "$TRAZUM_ACORN" --since ${base} --check`);
      if (lines.state !== 'passed') return lines;
      // The workflow's own list of what counts as "the tool changed", read from the step that uses it.
      const own = /git diff --name-only "\$BASE_SHA" -- (.+?) \| grep -q \./.exec(workflow)?.[1].split(' ') ?? [];
      if (!changed.some((path) => own.includes(path))) return passed();
      return command('node scripts/mutate.mjs --acorn "$TRAZUM_ACORN" --only savings --check');
    },
  },
];

/**
 * The steps of the required job that are not criteria, each with the reason.
 * A step that is in neither list fails `done.test.js`: somebody decides, when
 * a step is added to CI, whether the loop runs it.
 */
export const LEFT_OUT = {
  'Install dependencies': 'The loop checks the tree you have, with what is installed in it. Installing is how a tree is made, not a thing a change can fail.',
  'Freshness (fails only on the weekly schedule)': 'It reports on every run and fails only on the weekly schedule, so an overdue review never blocks a pull request. A change cannot fail it.',
  "Price drift against the providers' pages (fails only on the weekly schedule)": 'It reads the providers\' pages over the network and fails only on the weekly schedule. A change cannot fail it, and the loop makes no network call.',
  "Cross-check against LiteLLM's model list (fails only on the weekly schedule)": 'It reads a third party\'s public file over the network and fails only on the weekly schedule. A change cannot fail it, and the loop makes no network call.',
};

/**
 * What only CI can say. Not criteria, because nothing here can check them;
 * named so that "Done" is not read as more than it is. The loop's document
 * lists them, and `done.test.js` holds the two lists to each other.
 */
export const ONLY_CI = ['CodeQL', 'npm audit', 'Dependency review', 'GitHub Action self-test', 'GitHub Action spend gate', 'GitHub Action directory mode'];

/**
 * Runs the criteria asked for, in order, and returns each one's result. A
 * criterion whose `needs` did not pass is not run, and says which one it was
 * waiting for: tests against a build that failed say nothing about the tests.
 */
export async function execute(criteria, tools, { only = null, report = () => {} } = {}) {
  const results = [];
  for (const criterion of criteria) {
    if (only !== null && !only.includes(criterion.id)) continue;
    const blocker = criterion.needs.map((id) => results.find((result) => result.id === id)).find((result) => result !== undefined && result.state !== 'passed');
    const started = Date.now();
    let outcome;
    if (blocker !== undefined) {
      outcome = notRun(`"${blocker.id}" did not pass, and this needs it`);
    } else {
      try {
        outcome = await criterion.check(tools);
      } catch (error) {
        outcome = failed(`could not be checked: ${error.message}`);
      }
    }
    const result = { id: criterion.id, what: criterion.what, ...outcome, ms: Date.now() - started };
    results.push(result);
    report(result);
  }
  return results;
}

/** A port nothing is listening on, asked of the operating system. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function main(argv) {
  const flag = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? null : argv[at + 1];
  };
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');
  const steps = stepsOf(read(CI), CI_JOB);

  if (argv.includes('--list')) {
    for (const criterion of CRITERIA) {
      const from = Object.entries(criterion.source).map(([kind, where]) => (kind === 'ci' ? `CI step "${where}"` : kind === 'contributing' ? `CONTRIBUTING.md, "${where}"` : where)).join('; ');
      console.log(`${criterion.id.padEnd(14)}${criterion.what}\n${''.padEnd(14)}from ${from}`);
    }
    return 0;
  }

  const only = flag('only')?.split(',').map((id) => id.trim()) ?? null;
  const unknown = (only ?? []).filter((id) => !CRITERIA.some((criterion) => criterion.id === id));
  if (unknown.length > 0) throw new Error(`no criterion named ${unknown.join(', ')}; --list has them`);

  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const ref = flag('base') ?? 'origin/main';
  let base = null;
  try {
    base = git('merge-base', ref, 'HEAD').trim();
  } catch {
    // No such ref here. Every criterion that needs it says so, by name.
  }
  const commits = base === null
    ? null
    : git('log', '--no-merges', '--format=%H%x00%B%x01', `${base}..HEAD`).split('\x01').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
        const [sha, message] = entry.split('\x00');
        return { sha, message };
      });
  let changelog = null;
  if (base !== null) {
    let before = '';
    try {
      before = git('show', `${base}:CHANGELOG.md`);
    } catch {
      // The base has no changelog: everything in it is new.
    }
    // What the branch adds, committed or not: a change file not yet committed still counts.
    const added = [
      ...git('diff', '--name-only', '--diff-filter=A', base).trim().split('\n'),
      ...git('ls-files', '--others', '--exclude-standard').trim().split('\n'),
    ].filter(Boolean);
    changelog = { before, after: read('CHANGELOG.md'), added };
  }
  const changed = [
    ...(base === null ? [] : git('diff', '--name-only', base).trim().split('\n')),
    ...git('ls-files', '--others', '--exclude-standard').trim().split('\n'),
  ].filter(Boolean);
  const bodyFile = flag('body');
  const body = bodyFile === null ? null : readFileSync(bodyFile, 'utf8');

  const logs = mkdtempSync(join(tmpdir(), 'trazum-done-'));
  let current = 'setup';
  /** One command, its output kept in a file; the verdict is its exit code. */
  const command = (line, extra = {}) =>
    new Promise((resolve) => {
      const log = join(logs, `${current}.log`);
      let output = '';
      const child = spawn(line, { cwd: ROOT, shell: true, env: { ...process.env, ...extra } });
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('error', (error) => resolve(failed(`\`${line}\` could not start: ${error.message}`)));
      child.on('close', (code) => {
        writeFileSync(log, output);
        resolve(code === 0 ? passed() : failed(`\`${line}\` exited ${code}. Its last lines:\n${tail(output)}\n(all of it: ${log})`));
      });
    });
  /** The built web app on a port of its own, for one command, then stopped. */
  const served = async (lineFor) => {
    const standalone = join(ROOT, 'apps/web/.next/standalone/apps/web');
    if (!existsSync(join(standalone, 'server.js'))) return failed('the web build left no standalone server at apps/web/.next/standalone');
    rmSync(join(standalone, '.next/static'), { recursive: true, force: true });
    cpSync(join(ROOT, 'apps/web/.next/static'), join(standalone, '.next/static'), { recursive: true });
    // The standalone server serves no file from public/ unless it is beside it, as the image's runtime stage has it: the brand page's downloads are there.
    rmSync(join(standalone, 'public'), { recursive: true, force: true });
    cpSync(join(ROOT, 'apps/web/public'), join(standalone, 'public'), { recursive: true });
    const port = await freePort();
    const server = spawn(process.execPath, [join(standalone, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' }, stdio: 'ignore' });
    try {
      return await command(lineFor(`http://127.0.0.1:${port}`));
    } finally {
      server.kill();
    }
  };
  const tools = {
    env: process.env,
    git,
    read,
    base,
    commits,
    changelog,
    changed,
    body,
    command,
    served,
    ciCommand(step) {
      const found = steps.find((candidate) => candidate.name === step);
      if (found === undefined || found.command === null) throw new Error(`${CI} has no one-line step named "${step}"`);
      return found.command;
    },
  };

  const results = await execute(
    CRITERIA.map((criterion) => ({
      ...criterion,
      check: (given) => {
        current = criterion.id;
        return criterion.check(given);
      },
    })),
    tools,
    {
      only,
      report(result) {
        const label = { passed: 'passed ', failed: 'FAILED ', 'not run': 'not run', 'n/a': 'n/a    ' }[result.state];
        const seconds = result.ms >= 1000 ? `  (${Math.round(result.ms / 1000)} s)` : '';
        console.log(`${label}  ${result.id.padEnd(14)}${result.what}${seconds}`);
        if (result.reason !== '') console.log(result.reason.split('\n').map((line) => `         ${line}`).join('\n'));
      },
    },
  );
  const { code, line } = verdict(results, CRITERIA.length);
  console.log(`\n${line}`);
  if (ONLY_CI.length > 0 && code === 0) console.log(`Only CI can say: ${ONLY_CI.join(', ')}.`);
  return code;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`done: ${error.message}`);
      process.exit(1);
    },
  );
}
