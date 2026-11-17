#!/usr/bin/env node
/**
 * Puts the labels on an issue or a pull request that nobody should have to
 * remember to put there.
 *
 *   node scripts/triage.mjs issue          one new issue: is it marked for triage?
 *   node scripts/triage.mjs pull-request   one pull request: which areas, which kind?
 *   node scripts/triage.mjs roadmap FILE   ROADMAP.md's table of open work, from a
 *                                          JSON list of issues; --check compares
 *
 * **Why it exists.** `CONTRIBUTING.md` says every new issue carries
 * `needs-triage` and triage replaces it with a state. On 2026-11-17 the
 * repository had eleven open issues and not one of them carried any label at
 * all. Nothing was broken: the forms apply their labels, and none of the
 * eleven had come through a form. They were opened through the API, and a
 * blank issue skips the forms the same way. A process that depends on the
 * door somebody came in by describes the forms, not the issues.
 *
 * So the state is applied here, to every issue, whatever opened it. The same
 * goes for a pull request: its area comes from the paths it changes and its
 * kind from the issue it closes, both of which are already written down.
 *
 * **It only ever adds.** A label a person put on, or took off, is a decision,
 * and nothing here undoes one. That also makes a second run harmless.
 *
 * The decisions are functions of plain values so they can be tested without a
 * network; `main` is the only part that talks to GitHub, through `gh`, with
 * the workflow's own token. An issue's title and body are never read: the
 * number and the label names are all this needs.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { linkedIssues } from './pr-readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The states triage moves an issue between. One of them means somebody has looked. */
export const TRIAGE_STATES = ['needs-triage', 'accepted', 'blocked', 'needs-info', 'wontfix', 'duplicate'];

/** What kind of work something is. A pull request takes these from the issue it closes. */
export const KINDS = ['bug', 'correctness', 'pricing', 'enhancement', 'documentation'];

/** Where a changed path lives. The first prefix that matches names the area. */
export const AREAS = [
  ['packages/core/', 'area:core'],
  ['packages/tokenizer-openai/', 'area:core'],
  ['packages/cli/', 'area:cli'],
  ['packages/mcp/', 'area:mcp'],
  ['apps/web/', 'area:web'],
  ['action/', 'area:action'],
  ['apps/vscode/', 'area:vscode'],
];

/** A path that is prose or a picture: nothing in it runs. */
const isDocument = (path) =>
  path.endsWith('.md') || path.startsWith('docs/') || path.startsWith('wiki/');

/** The labels to add to a new issue: `needs-triage`, unless it already has a state. */
export function intakeLabels(current) {
  return current.some((label) => TRIAGE_STATES.includes(label)) ? [] : ['needs-triage'];
}

/**
 * The labels to add to a pull request.
 *
 * `files` are the paths it changes and `issueLabels` the labels of the issues
 * its description closes. An area for each package it touches; `ci` when it
 * touches a workflow; `documentation` only when every file is a document,
 * because every pull request edits the changelog and that says nothing about
 * what kind of change it is. The kind otherwise comes from the issue, which is
 * where somebody decided it.
 */
export function pullRequestLabels({ files, issueLabels = [], current = [] }) {
  const wanted = new Set();
  for (const path of files) {
    const area = AREAS.find(([prefix]) => path.startsWith(prefix));
    if (area) wanted.add(area[1]);
    if (path.startsWith('.github/workflows/')) wanted.add('ci');
  }
  if (files.length > 0 && files.every(isDocument)) wanted.add('documentation');
  for (const label of issueLabels) if (KINDS.includes(label)) wanted.add(label);
  return [...wanted].filter((label) => !current.includes(label)).sort();
}

const START = '<!-- open-work:start -->';
const END = '<!-- open-work:end -->';

/** One issue's area labels as prose, or a dash. */
const areasOf = (labels) =>
  labels.filter((label) => label.startsWith('area:')).map((label) => label.slice(5)).join(', ') || '-';

const row = (issue) =>
  `| [#${issue.number}](https://github.com/Davmunrey/Trazum/issues/${issue.number}) | ${issue.title.replaceAll('|', '\\|')} | ${areasOf(issue.labels)} |`;

/**
 * ROADMAP.md's table of open work: every open issue triage accepted, the ones
 * that can be picked up first and the ones waiting on something outside the
 * repository after them, each group oldest first.
 *
 * An issue is on the roadmap because it is accepted, not because somebody
 * remembered to add a line: the table is this function of the issue list, and
 * the weekly run fails when the file is not that.
 */
export function openWorkTable(issues) {
  const labelsOf = (issue) => issue.labels.map((label) => (typeof label === 'string' ? label : label.name));
  const accepted = issues
    .map((issue) => ({ number: issue.number, title: issue.title, labels: labelsOf(issue) }))
    .filter((issue) => issue.labels.includes('accepted') || issue.labels.includes('blocked'))
    .sort((a, b) => a.number - b.number);
  const ready = accepted.filter((issue) => !issue.labels.includes('blocked'));
  const blocked = accepted.filter((issue) => issue.labels.includes('blocked'));
  const table = (rows) =>
    rows.length === 0
      ? ['None.']
      : ['| Issue | What | Area |', '| --- | --- | --- |', ...rows.map(row)];
  return [
    START,
    `**Ready to be picked up (${ready.length}).**`,
    '',
    ...table(ready),
    '',
    `**Waiting on something outside the repository (${blocked.length}).** Each issue says what.`,
    '',
    ...table(blocked),
    END,
  ].join('\n');
}

/** `markdown` with the table between its two markers replaced. Throws when a marker is missing. */
export function withOpenWork(markdown, table) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('ROADMAP.md has lost the open-work markers this table is written between');
  }
  return markdown.slice(0, start) + table + markdown.slice(end + END.length);
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function main([mode, ...rest]) {
  if (mode === 'issue') {
    const number = process.env.ISSUE_NUMBER;
    const add = intakeLabels(JSON.parse(process.env.ISSUE_LABELS ?? '[]'));
    if (add.length === 0) return console.log(`#${number} already carries a triage state.`);
    gh('issue', 'edit', number, '--add-label', add.join(','));
    return console.log(`#${number}: added ${add.join(', ')}.`);
  }

  if (mode === 'pull-request') {
    const number = process.env.PR_NUMBER;
    const current = JSON.parse(process.env.PR_LABELS ?? '[]');
    const files = gh('api', '--paginate', `repos/{owner}/{repo}/pulls/${number}/files`, '--jq', '.[].filename')
      .split('\n')
      .filter(Boolean);
    // Issues in this repository only: a label on somebody else's issue is not ours to copy.
    const closes = linkedIssues(process.env.PR_BODY ?? '').filter((ref) => ref.startsWith('#'));
    const issueLabels = closes.flatMap((ref) => {
      try {
        return gh('issue', 'view', ref.slice(1), '--json', 'labels', '--jq', '.labels[].name').split('\n').filter(Boolean);
      } catch {
        return []; // An issue that cannot be read gives no labels; it does not fail the pull request.
      }
    });
    const add = pullRequestLabels({ files, issueLabels, current });
    if (add.length === 0) return console.log(`#${number} needs no label it does not have.`);
    gh('pr', 'edit', number, '--add-label', add.join(','));
    return console.log(`#${number}: added ${add.join(', ')}.`);
  }

  if (mode === 'roadmap') {
    const file = rest.find((arg) => !arg.startsWith('--'));
    if (!file) throw new Error('roadmap needs a JSON file of issues: gh issue list --state open --json number,title,labels');
    const path = join(ROOT, 'ROADMAP.md');
    const current = readFileSync(path, 'utf8');
    const next = withOpenWork(current, openWorkTable(JSON.parse(readFileSync(file, 'utf8'))));
    if (rest.includes('--check')) {
      if (next !== current) {
        console.error(
          'ROADMAP.md\'s table of open work is not what the open issues say.\n\n'
            + 'Run: gh issue list --state open --limit 200 --json number,title,labels > issues.json\n'
            + '     node scripts/triage.mjs roadmap issues.json',
        );
        process.exit(1);
      }
      return console.log('ROADMAP.md lists the open work the issues describe.');
    }
    writeFileSync(path, next);
    return console.log('wrote the open-work table into ROADMAP.md');
  }

  throw new Error('usage: node scripts/triage.mjs issue | pull-request | roadmap <issues.json> [--check]');
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
