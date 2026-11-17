import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AREAS,
  KINDS,
  TRIAGE_STATES,
  intakeLabels,
  openWorkTable,
  pullRequestLabels,
  withOpenWork,
} from '../../../scripts/triage.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const labelNames = new Set(JSON.parse(read('.github/labels.json')).map((label) => label.name));
/** A third-level section: `sectionOf` runs to the next second-level heading, this stops at the next third. */
const subsection = (document, heading) => sectionOf(document, heading).split('\n### ')[0];

/**
 * The process, held to what happens.
 *
 * `issue-intake.test.js` holds the forms to the label list and the label list
 * to `CONTRIBUTING.md`, and all of that was true on 2026-11-17 while eleven
 * issues sat open without a single label between them: none had come through
 * a form. A process described for one door is not a description of the
 * issues. What applies the labels now is `scripts/triage.mjs`, run by the
 * `Triage` workflow on every issue and every pull request from this
 * repository, and this is what holds it: the decisions as plain functions, the
 * workflow's permissions, the roadmap's table, and the review bot's
 * configuration, which is allowed to review and nothing else.
 */
describe('a new issue starts with a state, whatever opened it', () => {
  it('adds needs-triage to an issue that has no label at all', () => {
    assert.deepEqual(intakeLabels([]), ['needs-triage']);
  });

  it('adds it to an issue that has a kind and no state', () => {
    assert.deepEqual(intakeLabels(['bug', 'area:cli']), ['needs-triage']);
  });

  it('leaves alone an issue somebody already triaged', () => {
    for (const state of TRIAGE_STATES) {
      assert.deepEqual(intakeLabels(['enhancement', state]), [], `${state} was not read as a state`);
    }
  });

  it('knows exactly the states CONTRIBUTING.md lists, and each is a real label', () => {
    const contributing = read('CONTRIBUTING.md');
    const triage = subsection(contributing, '### Triage');
    const listed = [...triage.matchAll(/^\| `([a-z-]+)` \|/gm)].map(([, name]) => name);
    assert.deepEqual([...listed, 'needs-triage'].sort(), [...TRIAGE_STATES].sort());
    for (const state of TRIAGE_STATES) assert.ok(labelNames.has(state), `${state} is not in .github/labels.json`);
  });
});

describe('a pull request gets its areas from its paths and its kind from its issue', () => {
  it('names the area of each package it touches', () => {
    assert.deepEqual(
      pullRequestLabels({ files: ['packages/core/src/rules.ts', 'packages/cli/src/index.ts', 'CHANGELOG.md'] }),
      ['area:cli', 'area:core'],
    );
    assert.deepEqual(pullRequestLabels({ files: ['apps/web/app/page.tsx'] }), ['area:web']);
    assert.deepEqual(pullRequestLabels({ files: ['action/index.mjs'] }), ['area:action']);
    assert.deepEqual(pullRequestLabels({ files: ['apps/vscode/src/extension.ts'] }), ['area:vscode']);
    assert.deepEqual(pullRequestLabels({ files: ['packages/mcp/src/tools.ts'] }), ['area:mcp']);
  });

  it('does not take a path that merely starts like a package for that package', () => {
    assert.deepEqual(pullRequestLabels({ files: ['actions-notes.txt', 'packages/core-notes.txt'] }), []);
  });

  it('marks ci for a workflow, and not for the rest of .github', () => {
    assert.deepEqual(pullRequestLabels({ files: ['.github/workflows/ci.yml'] }), ['ci']);
    assert.deepEqual(pullRequestLabels({ files: ['.github/labels.json'] }), []);
  });

  it('marks documentation only when every file is a document', () => {
    assert.deepEqual(pullRequestLabels({ files: ['docs/setup.md', 'README.md', 'docs/assets/demo.svg'] }), ['documentation']);
    // Every pull request edits the changelog; that says nothing about its kind.
    assert.deepEqual(pullRequestLabels({ files: ['CHANGELOG.md', 'scripts/triage.mjs'] }), []);
    assert.deepEqual(pullRequestLabels({ files: [] }), []);
  });

  it('takes the kind of the issue it closes, and none of that issue’s other labels', () => {
    assert.deepEqual(
      pullRequestLabels({
        files: ['packages/core/src/rules.ts'],
        issueLabels: ['bug', 'correctness', 'accepted', 'good first issue', 'area:web'],
      }),
      ['area:core', 'bug', 'correctness'],
    );
  });

  it('adds only what is missing, so a second run does nothing', () => {
    const first = pullRequestLabels({ files: ['packages/cli/src/index.ts'], issueLabels: ['pricing'] });
    assert.deepEqual(first, ['area:cli', 'pricing']);
    assert.deepEqual(pullRequestLabels({ files: ['packages/cli/src/index.ts'], issueLabels: ['pricing'], current: first }), []);
  });

  it('can only apply labels the repository has', () => {
    for (const label of [...KINDS, 'ci', 'documentation', ...AREAS.map(([, area]) => area)]) {
      assert.ok(labelNames.has(label), `${label} is applied by triage.mjs and missing from .github/labels.json`);
    }
  });

  it('has an area for every package, and no area for a directory that is gone', () => {
    const root = JSON.parse(read('package.json'));
    const workspaces = root.workspaces.flatMap((pattern) => {
      const parent = pattern.replace(/\/\*$/, '');
      return readdirSync(join(ROOT, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, parent, entry.name, 'package.json')))
        .map((entry) => `${parent}/${entry.name}/`);
    });
    assert.ok(workspaces.length >= 5, `only ${workspaces.length} workspaces found`);
    const prefixes = AREAS.map(([prefix]) => prefix);
    assert.deepEqual(workspaces.filter((dir) => !prefixes.includes(dir)), [], 'a package has no area label');
    for (const prefix of prefixes) assert.ok(existsSync(join(ROOT, prefix)), `${prefix} has an area and does not exist`);
    // Every area label is an area some path leads to.
    const reachable = new Set(AREAS.map(([, area]) => area));
    for (const name of labelNames) if (name.startsWith('area:')) assert.ok(reachable.has(name), `nothing is ever labelled ${name}`);
  });
});

describe('the roadmap’s open work is the accepted issues', () => {
  const issues = [
    { number: 9, title: 'Later, ready', labels: [{ name: 'accepted' }, { name: 'area:cli' }] },
    { number: 3, title: 'Waits on a key', labels: ['blocked', 'area:core', 'pricing'] },
    { number: 5, title: 'A | in the title', labels: ['accepted'] },
    { number: 7, title: 'Not triaged', labels: ['needs-triage', 'bug'] },
    { number: 8, title: 'Declined', labels: ['wontfix'] },
  ];
  const table = openWorkTable(issues);

  it('lists accepted and blocked issues, and nothing else', () => {
    assert.ok(table.includes('issues/9)') && table.includes('issues/5)') && table.includes('issues/3)'));
    assert.ok(!table.includes('issues/7)') && !table.includes('issues/8)'), 'an issue nobody accepted is on the roadmap');
  });

  it('puts what can be started before what cannot, each oldest first, and counts them', () => {
    assert.ok(table.indexOf('issues/5)') < table.indexOf('issues/9)'));
    assert.ok(table.indexOf('issues/9)') < table.indexOf('issues/3)'));
    assert.match(table, /\*\*Ready to be picked up \(2\)\.\*\*/);
    assert.match(table, /\*\*Waiting on something outside the repository \(1\)\.\*\*/);
  });

  it('shows the area, reads labels in either shape, and keeps a pipe from breaking the row', () => {
    assert.match(table, /\| Later, ready \| cli \|/);
    assert.match(table, /\| Waits on a key \| core \|/);
    assert.match(table, /A \\\| in the title \| - \|/);
  });

  it('says None rather than drawing an empty table', () => {
    const empty = openWorkTable([]);
    assert.equal(empty.match(/^None\.$/gm).length, 2);
    assert.ok(!empty.includes('| Issue |'));
  });

  it('replaces only what is between the markers, and refuses a page that lost them', () => {
    const page = 'before\n<!-- open-work:start -->\nold\n<!-- open-work:end -->\nafter\n';
    const next = withOpenWork(page, table);
    assert.ok(next.startsWith('before\n<!-- open-work:start -->') && next.endsWith('<!-- open-work:end -->\nafter\n'));
    assert.ok(!next.includes('\nold\n'));
    assert.equal(withOpenWork(next, table), next, 'writing the same table twice changed the page');
    assert.throws(() => withOpenWork('no markers here', table), /markers/);
    assert.throws(() => withOpenWork('<!-- open-work:end -->x<!-- open-work:start -->', table), /markers/);
  });

  it('ROADMAP.md carries the table, well formed, under Next', () => {
    const roadmap = read('ROADMAP.md');
    const next = sectionOf(roadmap, '\n## Next\n');
    const start = next.indexOf('<!-- open-work:start -->');
    const end = next.indexOf('<!-- open-work:end -->');
    assert.ok(start !== -1 && end > start, 'the open-work table is not in the Next section');
    const body = next.slice(start, end);
    const rows = [...body.matchAll(/^\| \[#(\d+)\]\(https:\/\/github\.com\/Davmunrey\/Trazum\/issues\/(\d+)\) \| .+ \| .+ \|$/gm)];
    assert.ok(rows.length > 0, 'the table has no rows: was it emptied?');
    for (const [, shown, linked] of rows) assert.equal(shown, linked, `#${shown} links to issue ${linked}`);
    const counted = [...body.matchAll(/\((\d+)\)\.\*\*/g)].reduce((sum, [, n]) => sum + Number(n), 0);
    assert.equal(counted, rows.length, 'the two counts do not add up to the rows drawn');
    // The numbers ascend within each group: it was generated, not typed.
    const [ready, blocked] = body.split('**Waiting on');
    for (const group of [ready, blocked]) {
      const numbers = [...group.matchAll(/^\| \[#(\d+)\]/gm)].map(([, n]) => Number(n));
      assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
    }
    for (const filter of ['label%3Aaccepted', 'label%3Ablocked', 'label%3A%22good+first+issue%22']) {
      assert.ok(next.includes(filter), `the section does not link the live list for ${filter}`);
    }
  });
});

describe('the workflow runs it with no more than it needs', () => {
  const workflow = read('.github/workflows/triage.yml');
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    assert.notEqual(start, -1, `no ${name} job`);
    const rest = workflow.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  it('defaults to read-only, and each job states its own permissions', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.match(job('intake'), /permissions:\n {6}contents: read\n {6}issues: write\n/);
    assert.match(job('labels'), /permissions:\n {6}contents: read\n {6}issues: read\n {6}pull-requests: write\n/);
    assert.match(job('roadmap'), /permissions:\n {6}contents: read\n {6}issues: read\n/);
  });

  it('never reads a stranger’s title or body into a script', () => {
    /*
      The body of a pull request reaches the script through `env`, where it
      is data. Inside `run:` an expression is pasted into the shell before it
      runs, and a title is whatever somebody typed.
    */
    for (const block of workflow.split(/\n\s+run: /).slice(1)) {
      const script = block.split(/\n {2}[a-z]|\n\n/)[0];
      assert.doesNotMatch(script, /\$\{\{/, `an expression is interpolated into a run script: ${script.slice(0, 80)}`);
    }
    assert.doesNotMatch(workflow, /github\.event\.issue\.(title|body)/);
    assert.doesNotMatch(workflow, /github\.event\.pull_request\.title/);
  });

  it('runs the base commit’s script on a pull request, not the one it proposes', () => {
    assert.match(job('labels'), /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.match(job('labels'), /head\.repo\.full_name == github\.repository/);
    assert.match(job('labels'), /user\.login != 'dependabot\[bot\]'/);
  });

  it('checks the roadmap on a schedule, where a failure reaches the owner', () => {
    assert.match(workflow, /schedule:\n(?:\s+#.*\n)*\s+- cron: '\d+ \d+ \* \* 1'/);
    assert.match(job('roadmap'), /node scripts\/triage\.mjs roadmap "\$RUNNER_TEMP\/issues\.json" --check/);
  });

  it('keeps credentials out of every checkout', () => {
    const checkouts = workflow.match(/uses: actions\/checkout@/g) ?? [];
    assert.equal(checkouts.length, 3);
    assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, checkouts.length);
  });
});

/**
 * The review bot's configuration, read as text because this package takes no
 * YAML parser. It may review. Everything that would write to the repository
 * is a line that says `enabled: false`, and a line somebody deletes turns the
 * feature back on at the vendor's default, which is on.
 */
describe('the review bot reviews, and does nothing else', () => {
  const config = read('.coderabbit.yaml');
  const block = (key, indent) => {
    const start = config.indexOf(`\n${' '.repeat(indent)}${key}:\n`);
    assert.notEqual(start, -1, `.coderabbit.yaml has no ${key}`);
    const rest = config.slice(start + 1);
    const end = rest.slice(1).search(new RegExp(`\\n {0,${indent}}[a-z_#]`));
    return end === -1 ? rest : rest.slice(0, end + 1);
  };

  it('switches off every feature that writes', () => {
    const touches = block('finishing_touches', 2);
    for (const feature of ['unit_tests', 'simplify', 'autofix', 'fix_ci', 'resolve_merge_conflict']) {
      assert.match(touches, new RegExp(`${feature}:\\n\\s+enabled: false`), `${feature} is not switched off`);
    }
    assert.doesNotMatch(touches, /enabled: true/);
    assert.doesNotMatch(config, /auto_approvals|request_changes_workflow: true/, 'the bot may not approve or block');
    assert.match(config, /auto_apply_labels: false/);
    assert.match(config, /fail_commit_status: false/);
  });

  it('reviews drafts, because that is the state a pull request is reviewed in here', () => {
    assert.match(block('auto_review', 2), /enabled: true\n(?:\s+#.*\n)*\s+drafts: true/);
  });

  it('skips what is generated and what is not this project’s', () => {
    const filters = block('path_filters', 2);
    for (const path of ['wiki/**', 'plugin/skills/**', 'docs/assets/**', '.claude/skills/synced/**', 'package-lock.json']) {
      assert.ok(filters.includes(`'!${path}'`), `${path} is not excluded from review`);
    }
  });

  it('is told about paths that exist, and guided by files that exist', () => {
    const paths = [...config.matchAll(/^ {4}- path: '([^']+)'/gm)].map(([, path]) => path);
    assert.ok(paths.length >= 5, `only ${paths.length} path instructions`);
    for (const path of paths) {
      const literal = path.split(/[*{]/)[0];
      if (literal !== '') assert.ok(existsSync(join(ROOT, literal)), `an instruction is written for ${path}, which matches nothing`);
    }
    const guidelines = [...block('filePatterns', 4).matchAll(/- '([^']+)'/g)].map(([, file]) => file);
    assert.ok(guidelines.length >= 3);
    for (const file of guidelines) assert.ok(existsSync(join(ROOT, file)), `the bot is pointed at ${file}, which does not exist`);
  });

  it('keeps its tone instruction inside the limit the vendor sets', () => {
    const folded = config.match(/^tone_instructions: >-\n((?: {2}.*\n)+)/m);
    assert.ok(folded !== null, '.coderabbit.yaml has no tone_instructions');
    const tone = folded[1].split('\n').map((line) => line.trim()).join(' ').trim();
    assert.ok(tone.length > 40 && tone.length <= 250, `tone_instructions is ${tone.length} characters; the limit is 250`);
  });

  it('is described where a contributor reads how review works', () => {
    const contributing = read('CONTRIBUTING.md');
    const review = subsection(contributing, '### Review');
    assert.ok(review.length > 500, 'CONTRIBUTING.md has no Review section');
    assert.ok(review.includes('.coderabbit.yaml'));
    assert.match(review, /resolved by a\s+person/);
    assert.match(review, /pushes\s+no commit/);
  });
});
