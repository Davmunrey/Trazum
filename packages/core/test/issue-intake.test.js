import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sectionOf } from '../../../test-utils/section.mjs';

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
    // Read at the top, the issues write on the job alone (#873).
    assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m);
    assert.match(workflow, /\n {4}permissions:\n {6}contents: read\n {6}issues: write\n/);
  });
});

/**
 * How a question comes in, held in one place (#732).
 *
 * GitHub Discussions was switched on on 2026-11-18. `config.yml` already sent
 * "Question, or an idea you are not sure about" there, and nothing said what a
 * question should carry or held the address the pages send people to.
 *
 * - Each category a visitor writes in has a form in `.github/DISCUSSION_TEMPLATE/`,
 *   named for the category's slug. A file whose name is not a slug is ignored
 *   by GitHub without a message, so the names are held to the six default slugs.
 *   The slugs themselves could not be read when this was written (the REST
 *   answer for a repository does not list its categories), and each form says
 *   so at its top. A renamed category loses its form until the file is renamed.
 * - Every form opens by asking for no usage log, no private prompt and no key,
 *   because a discussion is a public page.
 * - Every page that sends somebody to Discussions uses one address.
 *
 * Whether GitHub accepts the forms was not tested: GitHub offers no way to try
 * one without opening a discussion, so this file holds the shape and no more.
 */

const DISCUSSIONS = 'https://github.com/TrazumAPP/Trazum/discussions';
const DEFAULT_SLUGS = ['announcements', 'general', 'ideas', 'polls', 'q-a', 'show-and-tell'];
const DISCUSSION_FORMS_DIR = '.github/DISCUSSION_TEMPLATE';
const discussionForms = readdirSync(join(ROOT, DISCUSSION_FORMS_DIR))
  .filter((name) => name.endsWith('.yml'))
  .sort();
const NO_PRIVATE_DATA = 'Do not paste a usage log, a prompt you would not publish, or a key.';
/** Every page that may send somebody to Discussions. */
const PAGES = [
  'README.md',
  'SUPPORT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  `${FORMS_DIR}/config.yml`,
  ...forms.map((name) => `${FORMS_DIR}/${name}`),
  ...discussionForms.map((name) => `${DISCUSSION_FORMS_DIR}/${name}`),
];
const readForm = (name) => read(`${DISCUSSION_FORMS_DIR}/${name}`);

/** Every address in a page that names the discussions path, however it is spelled. */
function discussionLinks(source) {
  return [...source.matchAll(/(?:https?:\/\/)?(?:[\w.-]+\/)+discussions\b[^\s)>\]"'`]*/gi)].map((match) => match[0]);
}

/** The items of a form's `body:` list: their type, and their id, label and required when they have them. */
function items(source) {
  return source
    .slice(source.indexOf('\nbody:\n'))
    .split(/\n {2}- type: /)
    .slice(1)
    .map((chunk) => ({
      type: chunk.split('\n')[0].trim(),
      id: /^ {4}id: (.+)$/m.exec(chunk)?.[1].trim(),
      label: /^ {6}label: (.+)$/m.exec(chunk)?.[1].trim(),
      required: /^ {6}required: (true|false)$/m.exec(chunk)?.[1],
      text: chunk,
    }));
}

/** The top-level keys of a form: its column-zero `key:` lines. */
const topKeys = (source) => [...source.matchAll(/^([a-z_]+):/gm)].map((match) => match[1]);

describe('discussion forms', () => {
  it('finds the forms it is meant to hold, one for each category a visitor writes in', () => {
    assert.deepEqual(discussionForms, ['ideas.yml', 'q-a.yml', 'show-and-tell.yml']);
  });

  it('every file is named for one of the six default slugs, and none is for a category nobody writes in', () => {
    for (const form of discussionForms) {
      const slug = form.replace(/\.yml$/, '');
      assert.ok(DEFAULT_SLUGS.includes(slug), `${form} is not named for a default category slug (${DEFAULT_SLUGS.join(', ')})`);
      assert.ok(!['announcements', 'polls'].includes(slug), `${form}: only the maintainer posts announcements, and polls take no form`);
    }
  });

  it('every form says its slug is the default, and that the slugs could not be read', () => {
    for (const form of discussionForms) {
      const source = readForm(form);
      const top = source.slice(0, source.indexOf('\nbody:'));
      assert.ok(top.split('\n').every((line) => line.startsWith('#')), `${form}: what comes before body: is not a comment`);
      const text = top.replace(/\s*\n#\s*/g, ' ');
      assert.ok(text.includes(`whose slug is "${form.replace(/\.yml$/, '')}"`), `${form}: the comment does not name its own slug`);
      assert.ok(text.includes(DEFAULT_SLUGS.join(', ').replace('q-a, show', 'q-a and show')), `${form}: the comment does not list the default slugs`);
      assert.match(text, /not renamed any as far as is known/, `${form}: the comment does not say what is known`);
      assert.match(text, /could not be read/, `${form}: the comment does not say the slugs could not be read`);
    }
  });

  it('every form has a body and only the keys a discussion form takes, and the forms agree about a title', () => {
    const titles = new Set();
    for (const form of discussionForms) {
      const source = readForm(form);
      const keys = topKeys(source);
      assert.ok(keys.includes('body'), `${form} has no body`);
      for (const key of keys) assert.ok(['title', 'labels', 'body'].includes(key), `${form}: "${key}" is an issue form's key, not a discussion form's`);
      assert.equal(new Set(keys).size, keys.length, `${form} repeats a top-level key`);
      titles.add(/^title:\s*(.*)$/m.exec(source)?.[1].replace(/^['"]|['"]$/g, '') ?? '(none)');
      // A label GitHub does not have is dropped without a message.
      for (const label of inlineLabels(source)) assert.ok(labelNames.has(label), `${form} applies "${label}", which .github/labels.json does not list`);
    }
    assert.equal(titles.size, 1, `the forms disagree about a title prefix: ${[...titles].join(' | ')}`);
  });

  it('every form opens with a markdown block that says what not to paste', () => {
    for (const form of discussionForms) {
      const [first] = items(readForm(form));
      assert.equal(first?.type, 'markdown', `${form} does not open with a markdown block`);
      const text = first.text.replace(/\s+/g, ' ');
      assert.ok(text.includes(NO_PRIVATE_DATA), `${form} does not say: ${NO_PRIVATE_DATA}`);
      assert.ok(text.includes('"a slice with 40k input tokens and no cache reads"'), `${form} gives no example of a shape`);
    }
  });

  it('every field has a type GitHub knows, an id nobody else in the form has, and a label', () => {
    for (const form of discussionForms) {
      const found = items(readForm(form));
      assert.ok(found.length >= 3, `${form} has ${found.length} items; the parser found too few`);
      const fields = found.filter((item) => item.type !== 'markdown');
      for (const item of found) assert.ok(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes'].includes(item.type), `${form}: unknown type ${item.type}`);
      for (const item of fields) {
        assert.ok(item.id, `${form}: a ${item.type} has no id`);
        assert.match(item.id, /^[a-z][a-z0-9-]*$/, `${form}: id ${item.id}`);
        assert.ok(item.label, `${form}: ${item.id} has no label`);
        assert.ok(item.required !== undefined, `${form}: ${item.id} does not say whether it is required`);
      }
      const ids = fields.map((item) => item.id);
      assert.equal(new Set(ids).size, ids.length, `${form} repeats an id: ${ids.join(', ')}`);
      assert.ok(fields.some((item) => item.required === 'true'), `${form} requires nothing`);
    }
  });

  it('the forms ask for what an answer needs', () => {
    const fieldsOf = (form) => items(readForm(form)).filter((item) => item.id);
    const qa = fieldsOf('q-a.yml');
    assert.deepEqual(qa.map((item) => item.id), ['goal', 'command', 'result', 'version', 'install']);
    assert.ok(qa.every((item) => item.required === 'true'), 'a question asks for less than it needs');
    const ideas = fieldsOf('ideas.yml');
    assert.deepEqual(ideas.map((item) => item.id), ['problem', 'today', 'idea']);
    assert.equal(ideas[0].required, 'true', 'an idea has to start with the problem');
    const show = fieldsOf('show-and-tell.yml');
    assert.deepEqual(show.map((item) => item.id), ['built', 'repeat', 'version']);
    assert.ok(show.every((item) => item.required === 'true'), 'show and tell has to say how to repeat it');
  });

  it('the forms about a run ask for the version, and say how to read it', () => {
    for (const form of ['q-a.yml', 'show-and-tell.yml']) {
      const version = items(readForm(form)).find((item) => item.id === 'version');
      assert.ok(version, `${form} does not ask for the version`);
      assert.equal(version.type, 'input');
      assert.equal(version.required, 'true');
      assert.ok(version.text.includes('`trazum --version`'), `${form} does not say how to read the version`);
    }
  });

  it('the idea form sends a clear thing to do to the feature request form, which exists', () => {
    const ideas = readForm('ideas.yml').replace(/\s+/g, ' ');
    assert.ok(ideas.includes('belongs in a [feature request](https://github.com/TrazumAPP/Trazum/issues/new?template=feature_request.yml)'));
    assert.ok(forms.includes('feature_request.yml'));
  });

  it('every form sends a bug to an issue form that exists', () => {
    for (const form of discussionForms) {
      const targets = [...readForm(form).matchAll(/github\.com\/TrazumAPP\/Trazum\/issues\/new\/?([^)\s]*)/g)].map((match) => match[1]);
      assert.ok(targets.length > 0, `${form} does not point anything at an issue`);
      for (const target of targets) {
        const template = /^\?template=(.+)$/.exec(target)?.[1];
        assert.ok(target === 'choose' || (template !== undefined && forms.includes(template)), `${form} links an issue form that does not exist: ${target}`);
      }
    }
    assert.match(readForm('q-a.yml'), /A bug, or a wrong price, is not a question\./);
  });
});

describe('the one address of Discussions', () => {
  it('finds the links it is meant to hold', () => {
    const found = PAGES.flatMap((page) => discussionLinks(read(page)));
    assert.ok(found.length >= 3, `expected at least three links, found ${found.length}`);
  });

  it('every page that sends somebody to Discussions uses exactly the one address, or a path under it', () => {
    for (const page of PAGES) {
      for (const link of discussionLinks(read(page))) {
        const ok = link === DISCUSSIONS || ['/', '?', '#'].some((next) => link.startsWith(`${DISCUSSIONS}${next}`));
        assert.ok(ok, `${page} spells Discussions as ${link}, not ${DISCUSSIONS}`);
      }
    }
  });

  it('config.yml, SUPPORT.md and README.md each carry the address', () => {
    for (const page of [`${FORMS_DIR}/config.yml`, 'SUPPORT.md', 'README.md']) {
      // A set of whole link targets, compared whole: the address is never
      // looked for inside a longer string, where another host could hold it.
      assert.ok(new Set(discussionLinks(read(page))).has(DISCUSSIONS), `${page} does not carry ${DISCUSSIONS}`);
    }
  });

  it('README.md says a question goes to Discussions and a bug to an issue, in one place', () => {
    const paragraph = read('README.md')
      .split('\n\n')
      .find((block) => block.includes(`(${DISCUSSIONS})`));
    assert.ok(paragraph, 'README.md has no paragraph that sends a question to Discussions');
    assert.ok(
      paragraph
        .replace(/\s+/g, ' ')
        .includes(`A question goes to [Discussions](${DISCUSSIONS}) and a bug goes to an [issue](https://github.com/TrazumAPP/Trazum/issues/new/choose), through its form.`),
    );
  });

  it('CONTRIBUTING.md, under Issues, links Discussions and says where the forms are', () => {
    const issues = sectionOf(read('CONTRIBUTING.md'), '## Issues');
    assert.ok(issues.includes(`[Discussions](${DISCUSSIONS})`), 'the Issues section does not link Discussions');
    assert.ok(issues.includes(`${DISCUSSION_FORMS_DIR}/`), 'the Issues section does not say where the discussion forms are');
  });

  it('the settings check holds that Discussions is on', async () => {
    const { SETTINGS } = await import('../../../scripts/ruleset.mjs');
    const setting = SETTINGS.find((entry) => entry.key === 'has_discussions');
    assert.ok(setting, 'scripts/ruleset.mjs does not check has_discussions');
    assert.equal(setting.want, true);
  });
});
