import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  addedLines,
  changelogChanges,
  linkedIssues,
  readiness,
} from '../../../scripts/pr-readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The merge gate's decision: does a pull request name its issue, and does its
 * changelog line land under `## Unreleased`? scripts/pr-readiness.mjs explains
 * why each rule exists; this holds the decision, including the case that
 * prompted it (#666).
 */

/** A changelog in the shape the 2.7.10 release left `main` in. */
const RELEASED = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  'No changes yet.',
  '',
  '## 2.7.10 — 2026-11-17',
  '',
  '### Fixed',
  '',
  '- **`plan` offered the Batch API to calls that cannot take it.**',
  '',
  '## 2.7.9 — 2026-11-17',
  '',
  '### Added',
  '',
  "- **Google's Gemini 4 family and Gemini 3.5 Flash-Lite are priced.**",
  '',
].join('\n');

const ENTRY = "- **Google's prices were re-read, and `gemini-2.5-pro` bills at Gemini 3.8 Flash's rates.**";

/** The same file with `ENTRY` where it belongs: under Unreleased, replacing the placeholder. */
const WITH_ENTRY = RELEASED.replace('No changes yet.\n', `### Fixed\n\n${ENTRY}\n`);

const ready = (overrides = {}) =>
  readiness({
    body: 'Fixes #639',
    author: 'Davmunrey',
    labels: [],
    changelogBefore: RELEASED,
    changelogAfter: WITH_ENTRY,
    ...overrides,
  });

describe('a pull request names its issue', () => {
  it('reads every closing keyword GitHub reads, in order and without repeats', () => {
    const body = 'Fixes #12. Also resolves: other/repo#3, and closes #12 again.\nRefs #9.';
    assert.deepEqual(linkedIssues(body), ['#12', 'other/repo#3']);
    assert.deepEqual(linkedIssues('Closed #4, Fixed #5, resolved #6'), ['#4', '#5', '#6']);
  });

  it('a mention without a closing keyword links nothing', () => {
    assert.deepEqual(linkedIssues('See #12 and issue 14'), []);
    assert.deepEqual(linkedIssues(null), []);
  });

  it('a description with no linked issue is refused, with what to do', () => {
    const { problems } = ready({ body: 'Tidies the README.' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Fixes #<n>/);
  });

  it('Dependabot and a maintainer-labelled no-issue pull request are exempt', () => {
    assert.deepEqual(ready({ body: '', author: 'dependabot[bot]', changelogAfter: RELEASED }).problems, []);
    assert.deepEqual(ready({ body: '', labels: ['no-issue'] }).problems, []);
  });
});

describe('its changelog line lands under Unreleased', () => {
  it('a line under Unreleased is ready', () => {
    const changes = changelogChanges(RELEASED, WITH_ENTRY);
    assert.deepEqual(changes.misplaced, []);
    assert.deepEqual(changes.underUnreleased, ['### Fixed', ENTRY]);
    assert.deepEqual(ready().problems, []);
  });

  it('the 2.7.9 misplacement is refused: a line inside a released version', () => {
    const after = RELEASED.replace(
      '## 2.7.9 — 2026-11-17\n\n### Added\n\n',
      `## 2.7.9 — 2026-11-17\n\n### Added\n\n${ENTRY}\n\n`,
    );
    const { problems } = ready({ changelogAfter: after });
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.match(problems[0], /inside `## 2\.7\.9`, a released version/);
    assert.match(problems[1], /add a line under `## Unreleased`/);
  });

  it('a maintainer correcting a released entry labels it changelog-history', () => {
    const after = RELEASED.replace('Flash-Lite are priced.**', 'Flash-Lite are priced, at last.**');
    const corrected = ready({ changelogAfter: after, labels: ['changelog-history'] }).problems;
    assert.equal(corrected.length, 1, 'still needs its own line under Unreleased');
    assert.match(corrected[0], /add a line under `## Unreleased`/);
    assert.match(ready({ changelogAfter: after }).problems[0], /inside `## 2\.7\.9`/);
  });

  it('a pull request that adds no line at all is refused', () => {
    const { problems } = ready({ changelogAfter: RELEASED });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /add a line under `## Unreleased`/);
  });

  it('"No changes yet." is not a line the pull request added', () => {
    const before = RELEASED.replace('No changes yet.\n', '');
    assert.deepEqual(changelogChanges(before, RELEASED).underUnreleased, []);
  });

  it('a release pull request, which adds a version heading, is exempt', () => {
    const before = RELEASED.replace('No changes yet.', ENTRY);
    const after = RELEASED.replace('## 2.7.10', `## 2.7.11 — 2026-11-18\n\n### Fixed\n\n${ENTRY}\n\n## 2.7.10`);
    const changes = changelogChanges(before, after);
    assert.equal(changes.release, true);
    assert.deepEqual(ready({ changelogBefore: before, changelogAfter: after, labels: ['no-issue'] }).problems, []);
  });

  it('counts a repeated line once for each time it is added', () => {
    assert.deepEqual(addedLines(['- a', ''], ['- a', '- a', '']), ['- a']);
  });
});

describe('the workflow and the rules agree', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/pr-readiness.yml'), 'utf8');
  const ruleset = JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main-branch.json'), 'utf8'));
  const labels = JSON.parse(readFileSync(join(ROOT, '.github/labels.json'), 'utf8')).map((l) => l.name);

  it('the job is named as the ruleset requires it', () => {
    const required = ruleset.rules
      .find((rule) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map((check) => check.context);
    assert.ok(required.includes('PR readiness'));
    assert.match(workflow, /^ {4}name: PR readiness$/m);
  });

  it('the description reaches the script through the environment, never inline', () => {
    // A body interpolated into `run:` is a script injection; through `env:` it is data.
    assert.match(workflow, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    const runs = [...workflow.matchAll(/^\s+run: (.*)$/gm)].map((match) => match[1]);
    assert.deepEqual(runs, ['node scripts/pr-readiness.mjs'], 'one single-line run step, with no expression in it');
  });

  it('every exemption label exists', () => {
    for (const label of ['no-issue', 'changelog-history']) assert.ok(labels.includes(label), label);
  });

  it('squash is the only merge method, as linear history already forces', () => {
    const pr = ruleset.rules.find((rule) => rule.type === 'pull_request');
    assert.deepEqual(pr.parameters.allowed_merge_methods, ['squash']);
    assert.ok(ruleset.rules.some((rule) => rule.type === 'required_linear_history'));
  });
});
