import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The review skill, against the rules it points at.
 *
 * `.claude/skills/trazum-review/SKILL.md` tells an agent how to review a
 * change to this repository. It is built not to restate a rule: each entry
 * names one, and points at the document that states it and the test that
 * holds it. That makes every entry a set of pointers, and a pointer is the
 * thing that rots without anybody noticing. A test renamed, a heading
 * reworded, a sixth question added to the Review section: the skill would go
 * on sending a reviewer to a place that is not there.
 *
 * The other scan that checks named tests exist walks the tree and skips every
 * dotted directory, because the skills vendored under them are not this
 * project's to fix. This one file under a dotted directory is this project's,
 * so it is read here.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');

const SKILL = '.claude/skills/trazum-review/SKILL.md';
const skill = read(SKILL);
const contributing = read('CONTRIBUTING.md');

/** What a rule's entry may carry, and must. */
const FIELDS = ['Applies to', 'Stated in', 'Held by', 'Check'];

/** The entries under "## The rules": an id, a title, and the four fields. */
const rules = sectionOf(skill, '## The rules')
  .split('\n### ')
  .slice(1)
  .map((block) => {
    const [heading, ...lines] = block.split('\n');
    const [, id, title] = heading.match(/^`([a-z-]+)` · (.+)$/) ?? [];
    const fields = Object.fromEntries(
      lines.flatMap((line) => {
        const [, name, value] = line.match(/^- \*\*([A-Za-z ]+):\*\* (.+)$/) ?? [];
        return name === undefined ? [] : [[name, value]];
      }),
    );
    return { heading, id, title, fields, lines: lines.filter((line) => line.trim() !== '') };
  });

/** Every backticked span in a field. */
const coded = (text) => [...text.matchAll(/`([^`]+)`/g)].map(([, span]) => span);
const isTest = (span) => /\.test\.(?:js|mjs|ts)$/.test(span);
const headings = new Set([...contributing.matchAll(/^#{2,3} (.+)$/gm)].map(([, heading]) => heading));

describe('the review skill is a skill, and only reviews', () => {
  it('has the name of its directory and says when to use it', () => {
    const [, name] = skill.match(/^---\nname: ([a-z-]+)\n/) ?? [];
    assert.equal(name, basename(dirname(SKILL)));
    const [, description] = skill.match(/\ndescription: (.+)\n---\n/) ?? [];
    assert.ok(description && description.length > 80, 'the description is what decides whether the skill is loaded');
    assert.match(description, /does not fix, approve, merge or push/);
  });

  it('carries no command that changes the repository or a pull request', () => {
    for (const command of ['git push', 'git commit', 'git merge', 'git rebase', 'git reset', 'gh pr', '--fix', '--write']) {
      assert.ok(!skill.includes(command), `the skill names "${command}", and it only reviews`);
    }
    assert.match(skill, /It does not edit a file, approve a pull request, merge one or push a commit\./);
  });

  it('is not one of the vendored skills, and is not shipped in the plugin', () => {
    assert.ok(!SKILL.includes('/synced/'));
    assert.ok(tracked.includes(SKILL), `${SKILL} is not tracked`);
    assert.ok(!tracked.some((path) => path.startsWith('plugin/skills/trazum-review/')), 'the plugin is for users of the product; this skill is for this repository');
  });
});

describe('every rule in the skill is a set of pointers that land', () => {
  it('found the rules it is about to check', () => {
    assert.ok(rules.length >= 12, `only ${rules.length} rules parsed: has the heading form changed?`);
    for (const rule of rules) assert.ok(rule.id && rule.title, `cannot read the heading "${rule.heading}"`);
    assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length, 'two rules share an id');
  });

  it('has the four fields and nothing else: a rule is named and pointed at, never restated', () => {
    for (const rule of rules) {
      assert.deepEqual(Object.keys(rule.fields), FIELDS, `${rule.id} must carry exactly ${FIELDS.join(', ')}, in that order`);
      assert.equal(rule.lines.length, FIELDS.length, `${rule.id} has a line that is not one of its four fields`);
      assert.ok(rule.title.length <= 80, `${rule.id}: a title names the rule, in ${rule.title.length} characters`);
    }
  });

  it('applies to paths that exist, or says it applies to every change', () => {
    for (const rule of rules) {
      const applies = rule.fields['Applies to'];
      if (applies === 'every change') continue;
      const paths = coded(applies);
      assert.ok(paths.length > 0, `${rule.id} applies to nothing`);
      for (const path of paths) assert.ok(existsSync(join(ROOT, path)), `${rule.id} applies to ${path}, which does not exist`);
    }
    const everywhere = rules.filter((rule) => rule.fields['Applies to'] === 'every change').length;
    assert.match(skill, new RegExp(`plus the ${['zero', 'one', 'two', 'three', 'four', 'five'][everywhere]} marked \\*every change\\*`));
  });

  it('is stated in a document that exists, under a heading that exists', () => {
    for (const rule of rules) {
      const stated = rule.fields['Stated in'];
      const documents = coded(stated);
      assert.ok(documents.length > 0, `${rule.id} is stated nowhere`);
      for (const document of documents) assert.ok(tracked.includes(document), `${rule.id} is stated in ${document}, which is not a tracked file`);
      const quoted = [...stated.matchAll(/"([^"]+)"/g)].map(([, heading]) => heading);
      if (documents.includes('CONTRIBUTING.md')) assert.ok(quoted.length > 0, `${rule.id} names CONTRIBUTING.md and no section of it`);
      for (const heading of quoted) assert.ok(headings.has(heading), `${rule.id} points at "${heading}", which is not a heading in CONTRIBUTING.md`);
    }
  });

  it('is held by a test that exists, a file that exists, or a person, and says which', () => {
    const tests = new Set(tracked.filter(isTest).map((path) => basename(path)));
    for (const rule of rules) {
      const held = rule.fields['Held by'];
      const named = coded(held);
      assert.ok(named.some((span) => isTest(span) || span.startsWith('.github/')) || /\ba person\b/.test(held), `${rule.id} is held by nothing it names`);
      for (const span of named) {
        if (isTest(span)) assert.ok(tests.has(span), `${rule.id} is held by ${span}, and no test file has that name`);
        else if (span.includes('/')) assert.ok(tracked.includes(span), `${rule.id} is held by ${span}, which is not a tracked file`);
      }
    }
  });

  it('checks with commands this repository has', () => {
    const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
    let commands = 0;
    for (const rule of rules) {
      for (const [, script] of rule.fields.Check.matchAll(/`npm run ([a-z:]+)`/g)) {
        commands += 1;
        assert.ok(scripts.includes(script), `${rule.id} says to run npm run ${script}, which is not a script`);
      }
    }
    assert.ok(commands >= 3, `only ${commands} npm scripts named in the checks: is the pattern still matching?`);
    assert.ok(existsSync(join(ROOT, 'packages/cli/src/index.ts')), 'the CLI the safe-meaning check runs has moved');
  });
});

describe('the skill and the two other reviewers ask the same questions', () => {
  const review = sectionOf(contributing, '## Pull requests').split('\n### Review\n')[1]?.split('\n### ')[0] ?? '';
  const questions = [...review.matchAll(/^(\d+)\. \*\*/gm)].map(([, number]) => Number(number));

  it('found the questions CONTRIBUTING.md asks of a review', () => {
    assert.ok(review.length > 500, 'CONTRIBUTING.md has no Review section under Pull requests');
    assert.ok(questions.length >= 5, `only ${questions.length} numbered questions found`);
  });

  it('every question a person is asked has a rule here that points at it', () => {
    const pointed = new Set(
      rules.flatMap((rule) => [...rule.fields['Stated in'].matchAll(/"Review", question (\d+)/g)].map(([, number]) => Number(number))),
    );
    assert.deepEqual(questions.filter((number) => !pointed.has(number)), [], 'a question in CONTRIBUTING.md, "Review", has no rule in the skill');
    assert.deepEqual([...pointed].filter((number) => !questions.includes(number)), [], 'the skill points at a question the Review section does not have');
  });

  it('every path the review bot is given an instruction for is a path a rule here applies to', () => {
    const bot = [...read('.coderabbit.yaml').matchAll(/^ {4}- path: '([^']+)'/gm)].map(([, path]) => path.split(/[*{]/)[0]);
    const applied = rules.flatMap((rule) => coded(rule.fields['Applies to']));
    assert.ok(bot.length >= 5, `only ${bot.length} path instructions read from .coderabbit.yaml`);
    for (const path of bot) {
      // '' is the bot's "**/test/**" and "**/*.md": tests and documents anywhere, which the rules name directory by directory.
      if (path === '') continue;
      assert.ok(applied.some((mine) => mine.startsWith(path) || path.startsWith(mine)), `the bot is told about ${path}, and no rule in the skill applies there`);
    }
  });

  it('leaves out what the bot leaves out', () => {
    const filters = [...read('.coderabbit.yaml').matchAll(/^ {4}- '!([^']+)'/gm)].map(([, path]) => path.split('*')[0]);
    for (const path of ['.claude/skills/synced/', 'wiki/', 'plugin/skills/', 'docs/assets/', 'package-lock.json']) {
      assert.ok(filters.includes(path), `.coderabbit.yaml no longer excludes ${path}`);
      assert.ok(skill.includes(`\`${path}\``), `the skill does not say it leaves ${path} alone`);
    }
  });

  it('and CONTRIBUTING.md says the skill is there', () => {
    assert.ok(review.includes(SKILL), 'the Review section does not name the skill');
  });
});

describe('a test bounds a prose section by its own heading', () => {
  /*
    The rule the skill calls section-bounded was stated in a comment in
    test-utils/section.mjs and held by nothing. Bounding a section by the
    heading that follows it is right until somebody inserts a section between
    the two, and then the test reads the newcomer as well, in silence.
  */
  const neighbour = /indexOf\(\s*(['"`])#{2,3} /;

  it('no test file looks for a heading with indexOf', () => {
    const suites = tracked.filter((path) => isTest(path) && !path.startsWith('.claude/'));
    assert.ok(suites.length > 200, `only ${suites.length} test files tracked`);
    const offenders = suites.filter((path) => neighbour.test(read(path)));
    assert.deepEqual(offenders, [], 'take the section with sectionOf() from test-utils/section.mjs');
  });

  it('would notice one', () => {
    // Assembled from pieces: written out, this line would be the violation.
    const planted = ['const end = doc.', 'indexOf', "('", '## ', "The next section');"].join('');
    assert.ok(neighbour.test(planted));
    assert.ok(!neighbour.test("const section = sectionOf(doc, '## This section');"));
  });
});
