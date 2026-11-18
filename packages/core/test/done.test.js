import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CI, CI_JOB, CRITERIA, LEFT_OUT, MUTATION, ONLY_CI, execute, matches, pathsOf, stepsOf, tail, verdict } from '../../../scripts/done.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';
import { SPAWN_ENV } from '../../cli/test/env.mjs';

/**
 * The loop's command, against the things it says it runs.
 *
 * `scripts/done.mjs` answers "is this change done?" with every criterion that
 * can be checked before the push. Its promise is that it adds none of its
 * own: each one is a step of the required CI job, another workflow, a section
 * of CONTRIBUTING.md or a test. A promise like that is kept by a list, and a
 * list goes stale the day somebody adds a step to CI and nobody thinks of the
 * loop. So the lists are held to each other here, in both directions.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
const ci = read(CI);
const steps = stepsOf(ci, CI_JOB);
const contributing = read('CONTRIBUTING.md');
const headings = new Set([...contributing.matchAll(/^#{2,3} (.+)$/gm)].map(([, heading]) => heading));

describe('the loop reads the required job as it is written', () => {
  it('finds its steps, with what each runs', () => {
    assert.ok(steps.length >= 12, `only ${steps.length} named steps read from ${CI}`);
    assert.equal(steps.find((step) => step.name === 'Lint').command, 'npm run lint');
    const probe = steps.find((step) => step.name.startsWith('Privacy probe'));
    assert.equal(probe.command, null, 'a step of several lines has no one command');
    assert.ok(probe.lines.some((line) => line.startsWith('node scripts/privacy-probe.mjs')));
  });

  it('reads a small workflow the same way, and refuses a job that is not there', () => {
    const workflow = [
      'jobs:', '  first:', '    steps:', '      - uses: actions/checkout@abc # v1', '      # A comment between steps.',
      '      - name: One line', '        run: npm run one', '      - name: Two lines', '        env:', '          A: b',
      '        run: |', '          echo one', '          echo two', '  second:', '    steps:', '      - name: Not ours', '        run: npm run other', '',
    ].join('\n');
    assert.deepEqual(stepsOf(workflow, 'first'), [
      { name: 'One line', lines: ['npm run one'], command: 'npm run one' },
      { name: 'Two lines', lines: ['echo one', 'echo two'], command: null },
    ]);
    assert.throws(() => stepsOf(workflow, 'third'), /no job named "third"/);
  });

  it('reads the paths a workflow is filtered by, and refuses a pattern it cannot read', () => {
    const paths = pathsOf(read(MUTATION));
    assert.ok(paths.includes('packages/core/src/**') && paths.includes('mutation.baseline.json'));
    assert.equal(matches('packages/core/src/**', 'packages/core/src/i18n/en.ts'), true);
    assert.equal(matches('packages/core/src/**', 'packages/core/test/a.test.js'), false);
    assert.equal(matches('mutation.baseline.json', 'mutation.baseline.json'), true);
    assert.equal(matches('mutation.baseline.json', 'docs/mutation.baseline.json'), false);
    // A shape it does not understand must not read as "does not apply".
    assert.throws(() => matches('scripts/*.mjs', 'scripts/mutate.mjs'), /cannot read/);
    for (const pattern of paths) matches(pattern, 'README.md');
  });
});

describe('the loop adds no criterion of its own', () => {
  it('every criterion names where it comes from, and the place exists', () => {
    assert.ok(CRITERIA.length >= 14, `only ${CRITERIA.length} criteria`);
    assert.equal(new Set(CRITERIA.map((criterion) => criterion.id)).size, CRITERIA.length, 'two criteria share an id');
    const tests = new Set(tracked.filter((path) => /\.test\.(?:js|mjs)$/.test(path)).map((path) => basename(path)));
    for (const { id, source } of CRITERIA) {
      const kinds = Object.keys(source);
      assert.ok(kinds.length > 0, `${id} comes from nowhere`);
      for (const kind of kinds) {
        if (kind === 'ci') assert.ok(steps.some((step) => step.name === source.ci), `${id} names the CI step "${source.ci}", which ${CI} does not have`);
        else if (kind === 'workflow') assert.ok(tracked.includes(source.workflow), `${id} names ${source.workflow}, which is not a tracked file`);
        else if (kind === 'contributing') assert.ok(headings.has(source.contributing), `${id} names "${source.contributing}", which is not a heading in CONTRIBUTING.md`);
        else if (kind === 'test') assert.ok(tests.has(source.test), `${id} names ${source.test}, and no test file has that name`);
        else assert.fail(`${id} has a source of a kind nobody checks: ${kind}`);
      }
    }
  });

  it('every step of the required job is a criterion or is left out for a stated reason', () => {
    const claimed = new Set(CRITERIA.map((criterion) => criterion.source.ci).filter(Boolean));
    const unclaimed = steps.map((step) => step.name).filter((name) => !claimed.has(name) && !(name in LEFT_OUT));
    assert.deepEqual(unclaimed, [], `${CI} has steps the loop neither runs nor leaves out: decide which, in scripts/done.mjs`);
    for (const [name, reason] of Object.entries(LEFT_OUT)) {
      assert.ok(steps.some((step) => step.name === name), `"${name}" is left out and is not a step of ${CI}`);
      assert.ok(!claimed.has(name), `"${name}" is both run and left out`);
      assert.ok(reason.length >= 60, `"${name}" is left out without a reason somebody could argue with`);
    }
  });

  it('runs the criteria in the order the job runs its steps', () => {
    const order = CRITERIA.map((criterion) => criterion.source.ci).filter(Boolean).map((name) => steps.findIndex((step) => step.name === name));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it('a one-line step is run as CI writes it, and a longer one keeps the line that matters', () => {
    for (const criterion of CRITERIA.filter((candidate) => candidate.source.ci)) {
      const step = steps.find((candidate) => candidate.name === criterion.source.ci);
      if (criterion.command === undefined) {
        assert.notEqual(step.command, null, `${criterion.id} reads its command from ${CI}, and "${step.name}" is not one line`);
      } else {
        assert.ok(step.lines.some((line) => line.startsWith(criterion.command)), `${criterion.id} runs \`${criterion.command}\`, which "${step.name}" does not`);
      }
    }
    const source = read('scripts/done.mjs');
    const probe = steps.find((step) => step.name.startsWith('Privacy probe')).lines.join('\n');
    assert.match(probe, /--cpu-throttle 6/);
    assert.match(source, /--cpu-throttle 6/, 'the probe runs here at the slowdown CI runs it at');
  });

  it('a criterion that needs another names one that comes before it', () => {
    const ids = CRITERIA.map((criterion) => criterion.id);
    for (const criterion of CRITERIA) {
      for (const needed of criterion.needs) assert.ok(ids.indexOf(needed) !== -1 && ids.indexOf(needed) < ids.indexOf(criterion.id), `${criterion.id} needs ${needed}, which does not run before it`);
    }
  });

  it('fixes nothing: no command in it writes to the tree or to the remote', () => {
    const source = read('scripts/done.mjs');
    for (const command of ["'add'", "'commit'", "'push'", "'stash'", "'checkout'", "'reset'", 'git add', 'git commit', 'git push', 'lint --write', '--fix', 'npm install', 'npm ci']) {
      assert.ok(!source.includes(command), `scripts/done.mjs contains ${command}: it reports, and somebody else fixes`);
    }
  });
});

describe('the verdict is "done" only when everything that applies passed', () => {
  const result = (state) => ({ id: state, state, reason: '' });

  it('zero when every criterion passed or did not apply', () => {
    assert.deepEqual(verdict([result('passed'), result('n/a')]), { code: 0, line: 'Done: 1 passed, 0 failed, 0 not run, 1 did not apply.' });
  });

  it('one when anything failed, whatever else happened', () => {
    assert.equal(verdict([result('passed'), result('failed'), result('not run')]).code, 1);
  });

  it('two when nothing failed and something was not run: not run is not passed', () => {
    const { code, line } = verdict([result('passed'), result('not run')]);
    assert.equal(code, 2);
    assert.match(line, /^Not done: 1 passed, 0 failed, 1 not run\./);
  });

  it('and never zero for part of the list, however well that part went', () => {
    const { code, line } = verdict([result('passed'), result('passed')], 5);
    assert.equal(code, 2);
    assert.match(line, /3 not asked for/);
  });
});

describe('the criteria run in order, and one that cannot say anything says so', () => {
  const criterion = (id, outcome, needs = []) => ({ id, what: id, source: {}, needs, check: async () => (typeof outcome === 'function' ? outcome() : outcome) });
  const ok = { state: 'passed', reason: '' };

  it('a criterion is not run when what it needs did not pass, and names it', async () => {
    const ran = [];
    const results = await execute(
      [
        criterion('build', { state: 'failed', reason: 'tsc exited 2' }),
        criterion('tests', () => { ran.push('tests'); return ok; }, ['build']),
        criterion('lint', () => { ran.push('lint'); return ok; }),
      ],
      {},
    );
    assert.deepEqual(results.map((entry) => [entry.id, entry.state]), [['build', 'failed'], ['tests', 'not run'], ['lint', 'passed']]);
    assert.equal(results[1].reason, '"build" did not pass, and this needs it');
    assert.deepEqual(ran, ['lint'], 'the tests ran against a build that failed');
  });

  it('a check that throws is a failure with the error, not a crash and not a pass', async () => {
    const [only] = await execute([criterion('broken', () => { throw new Error('no such step'); })], {});
    assert.equal(only.state, 'failed');
    assert.equal(only.reason, 'could not be checked: no such step');
  });

  it('--only runs what it names and nothing else', async () => {
    const results = await execute([criterion('a', ok), criterion('b', ok), criterion('c', ok)], {}, { only: ['a', 'c'] });
    assert.deepEqual(results.map((entry) => entry.id), ['a', 'c']);
  });

  it('keeps the end of a long output, where a command says what went wrong', () => {
    const output = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`).join('\n');
    assert.equal(tail(`${output}\n\n`, 3), 'line 48\nline 49\nline 50');
  });
});

describe('the criteria that read the branch say what they read', () => {
  const byId = (id) => CRITERIA.find((criterion) => criterion.id === id);
  const unreleased = (line) => `# Changelog\n\n## Unreleased\n\n### Added\n\n${line}## 1.0.0\n\n- First.\n`;

  it('staged: an untracked file fails it, by name', async () => {
    assert.equal((await byId('staged').check({ git: () => '\n' })).state, 'passed');
    const dirty = await byId('staged').check({ git: () => 'scripts/new.mjs\npackages/core/test/new.test.js\n' });
    assert.equal(dirty.state, 'failed');
    assert.match(dirty.reason, /^2 file\(s\) are not tracked: scripts\/new\.mjs, packages\/core\/test\/new\.test\.js\./);
  });

  it('signed-off: a commit without the line fails it, by its hash', async () => {
    const signed = { sha: 'a'.repeat(40), message: 'One\n\nSigned-off-by: A Person <a@example.org>' };
    const unsigned = { sha: 'b'.repeat(40), message: 'Two\n\nReviewed-by: A Person <a@example.org>' };
    assert.equal((await byId('signed-off').check({ commits: [signed] })).state, 'passed');
    const result = await byId('signed-off').check({ commits: [signed, unsigned] });
    assert.equal(result.state, 'failed');
    assert.match(result.reason, /^1 commit\(s\) have no Signed-off-by line: bbbbbbb\./);
    assert.equal((await byId('signed-off').check({ commits: null })).state, 'not run');
  });

  it('changelog: no new line under Unreleased fails it, in the words CI uses', async () => {
    const before = unreleased('');
    assert.equal((await byId('changelog').check({ changelog: { before, after: unreleased('- A new thing.\n\n') } })).state, 'passed');
    const none = await byId('changelog').check({ changelog: { before, after: before } });
    assert.equal(none.state, 'failed');
    assert.match(none.reason, /^CHANGELOG\.md: add a line under `## Unreleased`\./);
    const misplaced = await byId('changelog').check({ changelog: { before, after: before.replace('- First.', '- First.\n- Slipped in.') } });
    assert.match(misplaced.reason, /added inside `## 1\.0\.0`, a released version/);
  });

  it('issue: reads the description when given one, the commit messages when not, and says which', async () => {
    const commits = [{ sha: 'c'.repeat(40), message: 'A change\n\nFixes #694' }];
    assert.match((await byId('issue').check({ body: null, commits })).reason, /^#694, read from the commit messages$/);
    assert.match((await byId('issue').check({ body: 'Fixes #12\n\nWhy.', commits })).reason, /^#12, read from the --body file$/);
    assert.equal((await byId('issue').check({ body: 'No keyword here.', commits })).state, 'failed');
    assert.equal((await byId('issue').check({ body: null, commits: [] })).state, 'not run');
  });

  it('a criterion that needs a browser, a database or a parser is "not run" without one, never "passed"', async () => {
    const refuse = () => assert.fail('ran a command it had nothing to run with');
    for (const id of ['privacy', 'e2e', 'postgres']) {
      const result = await byId(id).check({ env: {}, command: refuse, served: refuse });
      assert.equal(result.state, 'not run', id);
      assert.match(result.reason, /^needs a /, id);
    }
    const tools = { env: {}, base: 'abc', read, command: refuse };
    assert.equal((await byId('mutation').check({ ...tools, changed: ['packages/core/src/rules.ts'] })).state, 'not run');
    assert.equal((await byId('mutation').check({ ...tools, changed: ['README.md'] })).state, 'n/a');
  });

  it('mutation: a changed tool also runs one whole target, as the workflow does', async () => {
    const ran = [];
    const command = async (line) => {
      ran.push(line);
      return { state: 'passed', reason: '' };
    };
    const tools = { env: { TRAZUM_ACORN: '/acorn' }, base: 'abc', read, command };
    await byId('mutation').check({ ...tools, changed: ['packages/core/src/rules.ts'] });
    assert.deepEqual(ran, ['npm run test:mutation', 'node scripts/mutate.mjs --acorn "$TRAZUM_ACORN" --since abc --check']);
    ran.length = 0;
    await byId('mutation').check({ ...tools, changed: ['scripts/mutate.mjs'] });
    assert.equal(ran.at(-1), 'node scripts/mutate.mjs --acorn "$TRAZUM_ACORN" --only savings --check');
    assert.match(read(MUTATION), /--only savings --check/);
  });
});

describe('the command itself', () => {
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/done.mjs'), ...args], { cwd: ROOT, env: SPAWN_ENV, encoding: 'utf8', timeout: 20_000 });

  it('lists every criterion and where it comes from, running none', () => {
    const listed = run('--list');
    assert.equal(listed.status, 0, listed.stderr);
    for (const { id } of CRITERIA) assert.match(listed.stdout, new RegExp(`^${id} `, 'm'));
    assert.match(listed.stdout, /from CI step "Lint"/);
  });

  it('refuses a criterion that does not exist, where running nothing would look like a pass', () => {
    const none = run('--only', 'a-criterion-no-one-wrote');
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no criterion named a-criterion-no-one-wrote/);
  });
});

describe('the loop is written down where a person and an agent will read it', () => {
  const doc = read('docs/done.md');
  const agents = read('AGENTS.md');

  it('the document lists every criterion, in order, with what it checks', () => {
    const rows = [...sectionOf(doc, '## The criteria').matchAll(/^\| `([a-z0-9-]+)` \| (.+?) \|/gm)].map(([, id, what]) => ({ id, what }));
    assert.deepEqual(rows.map((row) => row.id), CRITERIA.map((criterion) => criterion.id));
    for (const row of rows) assert.equal(row.what, CRITERIA.find((criterion) => criterion.id === row.id).what, `${row.id} is described differently in docs/done.md`);
  });

  it('and every step left out, and everything only CI can say', () => {
    // One line, because prose wraps and a step's name does not know where.
    const left = sectionOf(doc, '## What it does not run').replace(/\s+/g, ' ');
    for (const name of Object.keys(LEFT_OUT)) assert.ok(left.includes(name), `docs/done.md does not say that "${name}" is left out`);
    for (const name of ONLY_CI) assert.ok(left.includes(name), `docs/done.md does not say that only CI can say "${name}"`);
    const workflows = tracked.filter((path) => path.startsWith('.github/workflows/')).map((path) => read(path)).join('\n');
    for (const name of ONLY_CI) assert.ok(workflows.includes(`name: ${name}`), `"${name}" is said to be a check and no workflow has a job of that name`);
  });

  it('says what each verdict and each exit code means', () => {
    const verdicts = sectionOf(doc, '## Reading the answer');
    for (const word of ['passed', 'FAILED', 'not run', 'n/a']) assert.ok(verdicts.includes(`\`${word}\``), `docs/done.md does not explain ${word}`);
    for (const code of [0, 1, 2]) assert.match(verdicts, new RegExp(`\\| ${code} \\|`));
  });

  it('the agent instructions point at the command, the document and the review skill, and at nothing that is not there', () => {
    assert.ok(tracked.includes('AGENTS.md'), 'AGENTS.md is not tracked');
    for (const pointer of ['npm run done', 'docs/done.md', '.claude/skills/trazum-review/SKILL.md', 'CONTRIBUTING.md']) {
      assert.ok(agents.includes(pointer), `AGENTS.md does not point at ${pointer}`);
    }
    const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
    for (const [, script] of agents.matchAll(/`npm run ([a-z:]+)[` ]/g)) assert.ok(scripts.includes(script), `AGENTS.md says npm run ${script}, which is not a script`);
    for (const [, path] of agents.matchAll(/\]\(([^)#:]+)\)/g)) assert.ok(tracked.includes(path), `AGENTS.md links to ${path}, which is not a tracked file`);
  });
});
