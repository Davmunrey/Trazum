import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * How an issue comes in, held in one place.
 *
 * ## The labels were a list nobody kept
 *
 * Until #665 the issue forms applied `bug` and `correctness`, `dependabot.yml`
 * applied `dependencies` and `ci`, and the only list of labels was GitHub's
 * settings page. Nothing said what a label meant, and no issue, open or closed,
 * carried one. A label a form names and GitHub lacks is silently dropped from
 * the new issue, so a typo in a form shows up nowhere.
 *
 * `.github/labels.json` is now the list, the `Labels` workflow makes GitHub's
 * list match it, and this file holds every place that names a label to it.
 *
 * ## What it holds
 *
 * - The file is well formed: a colour GitHub accepts, a description within
 *   GitHub's 100 characters, no name twice.
 * - Every form starts its issue as `needs-triage`, and every label a form or
 *   `dependabot.yml` applies is in the file.
 * - Every label in the file is explained in CONTRIBUTING.md's `Issues` section,
 *   so the list cannot grow a label nobody has defined.
 * - Every form is linked from SUPPORT.md, and every page a form links to exists.
 *   The price form nearly shipped linking `docs/pricing.md`, which does not.
 * - The workflow syncs from this file and never deletes: deleting a label
 *   strips it from every issue that carries it.
 */

const FORMS_DIR = '.github/ISSUE_TEMPLATE';
const forms = readdirSync(join(ROOT, FORMS_DIR)).filter(
  (name) => name.endsWith('.yml') && name !== 'config.yml',
);
const labels = JSON.parse(read('.github/labels.json'));
const labelNames = new Set(labels.map((label) => label.name));

/** The inline `labels: [a, b]` list a form or a dependabot entry declares. */
function inlineLabels(source) {
  return [...source.matchAll(/^\s*labels:\s*\[(.*)\]\s*$/gm)].flatMap((match) =>
    match[1]
      .split(',')
      .map((label) => label.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  );
}

/** The text of a `## Heading` section, up to the next heading of that level. */
function section(markdown, heading) {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end === -1 ? undefined : end);
}

describe('issue intake', () => {
  it('finds the forms it is meant to hold', () => {
    // A guard that finds nothing passes; it must establish that it could run.
    assert.ok(forms.length >= 5, `expected at least five issue forms, found ${forms.join(', ')}`);
    assert.ok(labels.length >= 10, `expected the label list, found ${labels.length} entries`);
  });

  it('every label has a name GitHub accepts, a colour and a description', () => {
    const seen = new Set();
    for (const label of labels) {
      assert.deepEqual(Object.keys(label).sort(), ['color', 'description', 'name'], JSON.stringify(label));
      assert.ok(label.name.length > 0 && label.name.length <= 50, `name length: ${label.name}`);
      assert.match(label.color, /^[0-9a-f]{6}$/, `colour of ${label.name}`);
      assert.ok(
        label.description.length > 0 && label.description.length <= 100,
        `${label.name}: GitHub refuses a description over 100 characters (${label.description.length})`,
      );
      const key = label.name.toLowerCase();
      assert.ok(!seen.has(key), `${label.name} is listed twice`);
      seen.add(key);
    }
  });

  it('every form starts its issue as needs-triage, with labels that exist', () => {
    for (const form of forms) {
      const applied = inlineLabels(read(`${FORMS_DIR}/${form}`));
      assert.ok(applied.includes('needs-triage'), `${form} does not apply needs-triage`);
      for (const label of applied) {
        assert.ok(labelNames.has(label), `${form} applies "${label}", which .github/labels.json does not list`);
      }
    }
  });

  it('every label dependabot applies exists', () => {
    const applied = inlineLabels(read('.github/dependabot.yml'));
    assert.ok(applied.length > 0, 'dependabot.yml applies no labels; the parser found nothing');
    for (const label of applied) {
      assert.ok(labelNames.has(label), `dependabot.yml applies "${label}", which .github/labels.json does not list`);
    }
  });

  it('every label is explained in CONTRIBUTING.md, under Issues', () => {
    const issues = section(read('CONTRIBUTING.md'), 'Issues');
    for (const { name } of labels) {
      assert.ok(issues.includes(`\`${name}\``), `CONTRIBUTING.md's Issues section never names \`${name}\``);
    }
  });

  it('every form is linked from SUPPORT.md', () => {
    const support = read('SUPPORT.md');
    for (const form of forms) {
      assert.ok(support.includes(`template=${form}`), `SUPPORT.md does not link ${form}`);
    }
  });

  it('every page a form links to exists', () => {
    for (const form of forms) {
      const source = read(`${FORMS_DIR}/${form}`);
      for (const [, target] of source.matchAll(/\]\(\.\.\/blob\/main\/([^)#\s]+)/g)) {
        assert.ok(existsSync(join(ROOT, target)), `${form} links ${target}, which does not exist`);
      }
    }
  });

  it('the workflow syncs from the file and never deletes a label', () => {
    const workflow = read('.github/workflows/labels.yml');
    assert.match(workflow, /\.github\/labels\.json/);
    assert.match(workflow, /gh label create "\$name" --color "\$color" --description "\$description" --force/);
    assert.doesNotMatch(workflow, /gh label delete/);
    assert.match(workflow, /^permissions:\n {2}contents: read\n {2}issues: write$/m);
  });
});
