import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';
import {
  DESCRIPTION_MAX,
  END,
  FILE,
  KEYS,
  START,
  TITLE_MAX,
  USAGE,
  compare,
  describeAction,
  milestoneList,
  milestoneUrl,
  parseArgs,
  parsePages,
  plan,
  problemsWithFile,
  readIssues,
  readMilestones,
  report,
  withMilestones,
} from '../../../scripts/milestones.mjs';

/**
 * The milestones this repository states, and the comparison with the ones
 * GitHub holds.
 *
 * `.github/milestones.json` is the ordered plan. GitHub's milestones are a copy
 * of it, and ROADMAP.md draws the same order for a reader. A copy that nothing
 * compares drifts, which is what `scripts/ruleset.mjs` was written about, and
 * what can go wrong with a comparison is that it agrees too easily, and what
 * can go wrong with the workflow is that it learns to write where it should
 * only read. Both are held here without a network: the pure functions take
 * plain values, and the script runs against a stand-in `gh` first on the PATH.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const stated = JSON.parse(read(FILE));
const first = stated[0];

/** One milestone as GitHub reports it. */
const milestone = (entry, number, change = {}) => ({ number, title: entry.title, description: entry.description, dueOn: null, ...change });
/** One open issue as `readIssues` returns it. */
const issue = (number, change = {}) => ({ number, labels: [], milestone: null, pullRequest: false, ...change });
/** GitHub with exactly what the file states, and each listed issue open in its milestone. */
function inSync() {
  return {
    milestones: stated.map((entry, at) => milestone(entry, at + 1)),
    issues: stated.flatMap((entry) => entry.issues.map((number) => issue(number, { milestone: entry.title, labels: ['accepted'] }))),
  };
}
const live = (change = () => {}) => {
  const copy = inSync();
  change(copy);
  return copy;
};

describe('the file is a plan a person can read and a script can trust', () => {
  it('is an ordered array and passes the script’s own checks', () => {
    assert.ok(Array.isArray(stated) && stated.length > 0);
    assert.deepEqual(problemsWithFile(stated), []);
  });

  it('has unique, non-empty titles and non-empty descriptions', () => {
    for (const entry of stated) {
      assert.equal(typeof entry.title, 'string');
      assert.ok(entry.title.trim() !== '', 'a milestone has an empty title');
      assert.equal(typeof entry.description, 'string');
      assert.ok(entry.description.trim() !== '', `${entry.title} has no description`);
    }
    assert.equal(new Set(stated.map((entry) => entry.title)).size, stated.length);
  });

  it('keeps every title and description inside the limits the script sets', () => {
    for (const entry of stated) {
      assert.ok(entry.title.length <= TITLE_MAX, `${entry.title} is ${entry.title.length} characters`);
      assert.ok(entry.description.length <= DESCRIPTION_MAX, `${entry.title}'s description is ${entry.description.length} characters`);
    }
    assert.deepEqual([TITLE_MAX, DESCRIPTION_MAX].every((limit) => Number.isInteger(limit) && limit > 0), true);
  });

  it('puts no issue in two milestones', () => {
    const seen = new Map();
    for (const entry of stated) {
      for (const number of entry.issues) {
        assert.ok(!seen.has(number), `#${number} is in "${seen.get(number)}" and in "${entry.title}"`);
        seen.set(number, entry.title);
      }
    }
    assert.ok(seen.size > 0);
  });

  it('lists issues as positive whole numbers, and each milestone has at least one', () => {
    for (const entry of stated) {
      assert.ok(entry.issues.length > 0, `${entry.title} lists no issue`);
      for (const number of entry.issues) assert.ok(Number.isInteger(number) && number > 0, `${entry.title}: ${number}`);
    }
  });

  it('has no date field and no date in its words: the order is the commitment', () => {
    assert.deepEqual(KEYS, ['title', 'description', 'issues']);
    for (const entry of stated) {
      assert.deepEqual(Object.keys(entry).sort(), [...KEYS].sort());
      const words = `${entry.title} ${entry.description}`;
      assert.doesNotMatch(words, /\b(19|20)\d\d\b/, `${entry.title} carries a year`);
      assert.doesNotMatch(words, /\b(january|february|march|april|june|july|august|september|october|november|december)\b/i, `${entry.title} carries a month`);
      assert.doesNotMatch(words, /\b(deadline|by the end of|due)\b/i, `${entry.title} carries a deadline`);
    }
  });

  it('is plain prose: no em-dash in the file, the workflow or the generated list', () => {
    for (const text of [read(FILE), read('.github/workflows/milestones.yml'), milestoneList(stated)]) assert.ok(!text.includes('—'));
  });

  it('names a document that exists wherever a description points at one', () => {
    for (const entry of stated) {
      for (const [path] of entry.description.matchAll(/\bdocs\/[\w./-]+\.md\b/g)) assert.ok(existsSync(join(ROOT, path)), `${entry.title} points at ${path}`);
    }
  });
});

describe('problems with the file are named, one by one', () => {
  const good = () => structuredClone(stated);
  const problems = (change) => {
    const copy = good();
    change(copy);
    return problemsWithFile(copy);
  };

  it('finds a file that is not an array, and an entry that is not an object', () => {
    assert.equal(problemsWithFile({}).length, 1);
    // Counted from the file, so adding a milestone does not break this.
    const after = `Entry ${stated.length + 1} is not an object.`;
    assert.deepEqual(problems((copy) => copy.push('x')), [after]);
    assert.deepEqual(problems((copy) => copy.push(null)), [after]);
  });

  it('finds an empty or missing title, and a title used twice', () => {
    assert.match(problems((copy) => (copy[0].title = '  '))[0], /Entry 1 has no title/);
    assert.match(problems((copy) => delete copy[0].title)[0], /Entry 1 has no title/);
    assert.match(problems((copy) => (copy[1].title = copy[0].title))[0], /used twice/);
  });

  it('finds an empty or missing description', () => {
    assert.match(problems((copy) => (copy[2].description = ''))[0], /Entry 3 has no description/);
    assert.match(problems((copy) => delete copy[2].description)[0], /Entry 3 has no description/);
  });

  it('finds a title and a description that are too long', () => {
    assert.match(problems((copy) => (copy[0].title = 'x'.repeat(TITLE_MAX + 1)))[0], /title of 101 characters/);
    assert.deepEqual(problems((copy) => (copy[0].title = 'x'.repeat(TITLE_MAX))), []);
    assert.match(problems((copy) => (copy[0].description = 'x'.repeat(DESCRIPTION_MAX + 1)))[0], /description of 501 characters/);
    assert.deepEqual(problems((copy) => (copy[0].description = 'x'.repeat(DESCRIPTION_MAX))), []);
  });

  it('finds issues that are not positive whole numbers', () => {
    for (const bad of ['638', 0, -3, 1.5, null]) assert.match(problems((copy) => (copy[0].issues = [bad]))[0], /positive whole numbers/);
    assert.match(problems((copy) => delete copy[0].issues)[0], /positive whole numbers/);
  });

  it('refuses a date, or any other field', () => {
    for (const key of ['due_on', 'due', 'date', 'deadline', 'state']) {
      assert.match(problems((copy) => (copy[0][key] = '2027-01-01'))[0], new RegExp(`has a "${key}" field`));
    }
  });
});

describe('the command line is one of three forms', () => {
  it('reads each form', () => {
    assert.deepEqual(parseArgs([]), { mode: 'compare', report: false, yes: false, check: false, repo: undefined });
    assert.equal(parseArgs(['--report']).report, true);
    assert.deepEqual(parseArgs(['apply']), { mode: 'apply', report: false, yes: false, check: false, repo: undefined });
    assert.equal(parseArgs(['apply', '--yes']).yes, true);
    assert.equal(parseArgs(['--yes', 'apply']).yes, true);
    assert.deepEqual(parseArgs(['roadmap', '--check']).check, true);
    assert.equal(parseArgs(['roadmap']).mode, 'roadmap');
    assert.equal(parseArgs(['--repo', 'o/r']).repo, 'o/r');
  });

  it('refuses what it does not know, and a flag that does not belong to the mode', () => {
    for (const bad of [['bogus'], ['--nope'], ['apply', 'roadmap'], ['apply', 'apply'], ['--yes'], ['--check'], ['roadmap', '--yes'], ['apply', '--report'], ['roadmap', '--report'], ['--repo'], ['--repo', '--yes'], ['apply', '--check']]) {
      assert.throws(() => parseArgs(bad), /./, JSON.stringify(bad));
    }
    assert.match(USAGE, /apply \[--yes\]/);
  });
});

describe('GitHub’s answers are read as they come', () => {
  it('reads pages printed one after another, and a bracket inside a title is not the end of a page', () => {
    const odd = { number: 3, title: 'odd "quoted" ][ title \\ and \\" more ][ ', description: 'x' };
    const text = `${JSON.stringify([{ number: 1 }, { number: 2 }])}${JSON.stringify([odd])}\n`;
    assert.deepEqual(parsePages(text), [{ number: 1 }, { number: 2 }, odd]);
    assert.deepEqual(parsePages('[]'), []);
    assert.deepEqual(parsePages(''), []);
    assert.deepEqual(parsePages('[][][{"a":1}]'), [{ a: 1 }]);
  });

  it('refuses an answer that stops in the middle', () => {
    assert.throws(() => parsePages('[{"number": 1}'), /middle of a page/);
    assert.throws(() => parsePages('[{"title": "abc'), /middle of a page/);
  });

  it('keeps what is compared: a missing description is empty, a label may be a name or an object, a pull request is marked', () => {
    assert.deepEqual(readMilestones([{ number: 4, title: 'T', description: null, due_on: '2027-01-01T00:00:00Z', open_issues: 2 }]), [{ number: 4, title: 'T', description: '', dueOn: '2027-01-01T00:00:00Z' }]);
    assert.deepEqual(readMilestones([{ number: 5, title: 'U', description: 'd' }])[0].dueOn, null);
    assert.deepEqual(
      readIssues([
        { number: 1, labels: [{ name: 'accepted' }, 'blocked'], milestone: { title: 'M', number: 1 } },
        { number: 2, labels: [], milestone: null, pull_request: { url: 'x' } },
        { number: 3 },
      ]),
      [
        { number: 1, labels: ['accepted', 'blocked'], milestone: 'M', pullRequest: false },
        { number: 2, labels: [], milestone: null, pullRequest: true },
        { number: 3, labels: [], milestone: null, pullRequest: false },
      ],
    );
  });
});

describe('each way GitHub can differ from the file is found, and named', () => {
  const found = (change) => compare(stated, live(change)).differences;

  it('finds nothing when GitHub has what the file states', () => {
    assert.deepEqual(compare(stated, inSync()), { differences: [], leftAlone: [] });
  });

  it('finds a milestone in the file that GitHub lacks', () => {
    const [only, ...rest] = found((github) => {
      github.milestones = github.milestones.filter((m) => m.title !== first.title);
      github.issues = github.issues.filter((i) => !first.issues.includes(i.number));
    });
    assert.deepEqual(rest, []);
    assert.equal(only, `The milestone "${first.title}" is in the file and GitHub lacks it.`);
  });

  it('does not say it again for each issue of a milestone that is missing', () => {
    const lines = found((github) => {
      github.milestones = [];
      for (const i of github.issues) i.milestone = null;
    });
    assert.equal(lines.length, stated.length);
    assert.ok(lines.every((line) => line.endsWith('GitHub lacks it.')));
  });

  it('finds a description that differs, and says both', () => {
    const [only, ...rest] = found((github) => {
      github.milestones[1].description = 'Something somebody typed on the website.';
    });
    assert.deepEqual(rest, []);
    assert.match(only, new RegExp(`^The description of the milestone "${stated[1].title}" differs\\. File: "`));
    assert.ok(only.includes(stated[1].description) && only.includes('Something somebody typed on the website.'));
  });

  it('finds an issue the file puts in one milestone and GitHub has in another', () => {
    const [number] = stated[1].issues;
    const [only, ...rest] = found((github) => {
      github.issues.find((i) => i.number === number).milestone = stated[0].title;
    });
    assert.deepEqual(rest, []);
    assert.equal(only, `Issue #${number} is in the milestone "${stated[1].title}" in the file and in "${stated[0].title}" on GitHub.`);
  });

  it('finds an issue the file puts in a milestone and GitHub has in none', () => {
    const [number] = stated[2].issues;
    const [only, ...rest] = found((github) => {
      github.issues.find((i) => i.number === number).milestone = null;
    });
    assert.deepEqual(rest, []);
    assert.equal(only, `Issue #${number} is in the milestone "${stated[2].title}" in the file and in none on GitHub.`);
  });

  it('finds an open issue labelled accepted that the file puts in no milestone', () => {
    const [only, ...rest] = found((github) => {
      github.issues.push(issue(9001, { labels: ['bug', 'accepted'] }));
    });
    assert.deepEqual(rest, []);
    assert.equal(only, 'Issue #9001 is labelled accepted and the file puts it in no milestone.');
  });

  it('finds an open issue labelled blocked that the file puts in no milestone', () => {
    const [only, ...rest] = found((github) => {
      github.issues.push(issue(9002, { labels: ['blocked'], milestone: 'A milestone only on GitHub' }));
    });
    assert.deepEqual(rest, []);
    assert.equal(only, 'Issue #9002 is labelled blocked and the file puts it in no milestone.');
  });

  it('says both labels when an issue carries both', () => {
    const [only] = found((github) => {
      github.issues.push(issue(9003, { labels: ['blocked', 'accepted'] }));
    });
    assert.equal(only, 'Issue #9003 is labelled accepted and blocked and the file puts it in no milestone.');
  });

  it('does not mind an open issue with some other state, or none', () => {
    assert.deepEqual(
      found((github) => {
        github.issues.push(issue(9004, { labels: ['needs-triage'] }), issue(9005, { labels: ['wontfix'] }), issue(9006));
      }),
      [],
    );
  });

  it('finds an issue the file puts in two milestones, once, naming both', () => {
    const twice = structuredClone(stated);
    twice[1].issues.push(twice[0].issues[0]);
    const { differences } = compare(twice, inSync());
    assert.deepEqual(differences, [`Issue #${twice[0].issues[0]} is in 2 milestones in the file: "${twice[0].title}" and "${twice[1].title}".`]);
  });

  it('finds a milestone with a due date on GitHub, and the file allows none', () => {
    const [only, ...rest] = found((github) => {
      github.milestones[3].dueOn = '2027-03-01T08:00:00Z';
    });
    assert.deepEqual(rest, []);
    assert.equal(only, `The milestone "${stated[3].title}" has a due date on GitHub, 2027-03-01T08:00:00Z, and the file allows none.`);
  });

  it('prints a milestone only on GitHub, leaves it alone, and does not count it', () => {
    const answer = compare(
      stated,
      live((github) => {
        github.milestones.push({ number: 40, title: 'Made on the website', description: 'x', dueOn: '2027-01-01T00:00:00Z' });
      }),
    );
    assert.deepEqual(answer.differences, [], 'a due date on a milestone the file does not mention is not judged');
    assert.deepEqual(answer.leftAlone, ['The milestone "Made on the website" is only on GitHub, left alone.']);
    assert.match(report(answer).join('\n'), /only on GitHub, left alone\./);
  });

  it('lets a closed issue the file lists stay in its milestone as history', () => {
    // A closed issue is not in the list of open issues at all.
    assert.deepEqual(
      found((github) => {
        github.issues = github.issues.filter((i) => i.number !== first.issues[0]);
      }),
      [],
    );
  });

  it('does not read a pull request, whatever it is labelled or listed under', () => {
    assert.deepEqual(
      found((github) => {
        github.issues.push(issue(9010, { labels: ['accepted'], pullRequest: true }));
        github.issues.find((i) => i.number === first.issues[0]).pullRequest = true;
        github.issues.find((i) => i.number === first.issues[0]).milestone = null;
      }),
      [],
    );
  });

  it('judges the file’s issues by the milestone’s title, not its number', () => {
    assert.deepEqual(
      found((github) => {
        github.milestones.reverse();
        for (const [at, m] of github.milestones.entries()) m.number = 100 + at;
      }),
      [],
    );
  });

  it('finds every difference at once and does not stop at the first', () => {
    const lines = found((github) => {
      github.milestones[0].description = 'x';
      github.milestones[1].dueOn = '2027-01-01T00:00:00Z';
      github.issues.push(issue(9020, { labels: ['accepted'] }));
      github.issues.find((i) => i.number === stated[4].issues[0]).milestone = null;
    });
    assert.equal(lines.length, 4);
  });

  it('prints one sentence for each, and says so when there are none', () => {
    const none = report(compare(stated, inSync()));
    assert.deepEqual(none, [`GitHub has the milestones ${FILE} states.`]);
    const lines = report(compare(stated, live((github) => github.milestones.splice(0, 2)))).join('\n');
    assert.match(lines, new RegExp(`^GitHub does not have the milestones ${FILE.replaceAll('.', '\\.')} states\\. \\d+ difference\\(s\\):`));
  });
});

describe('what apply would do is the file’s changes and nothing else', () => {
  it('creates what is missing, corrects a description, and places each listed issue, in that order', () => {
    const github = live((copy) => {
      copy.milestones = copy.milestones.slice(0, 2);
      copy.milestones[1].description = 'old';
      copy.issues.find((i) => i.number === stated[0].issues[0]).milestone = null;
    });
    const actions = plan(stated, github);
    assert.deepEqual(
      actions.map((a) => a.kind),
      ['describe', ...stated.slice(2).map(() => 'create'), 'assign'],
    );
    assert.deepEqual(actions.at(-1), { kind: 'assign', issue: stated[0].issues[0], title: stated[0].title });
    assert.deepEqual(actions.find((a) => a.kind === 'describe'), { kind: 'describe', title: stated[1].title, number: 2, description: stated[1].description });
  });

  it('plans nothing when there is nothing to change', () => {
    assert.deepEqual(plan(stated, inSync()), []);
  });

  it('never plans a deletion, a due date, an unlisted issue, or a pull request', () => {
    const github = live((copy) => {
      copy.milestones.push({ number: 50, title: 'Only on GitHub', description: 'x', dueOn: '2027-01-01T00:00:00Z' });
      copy.milestones[0].dueOn = '2027-01-01T00:00:00Z';
      copy.issues.push(issue(9100, { milestone: 'Only on GitHub', labels: ['accepted'] }), issue(9101, { pullRequest: true }));
    });
    assert.deepEqual(plan(stated, github), []);
    assert.deepEqual([...new Set(plan(stated, { milestones: [], issues: [] }).map((a) => a.kind))], ['create']);
  });

  it('does not place a pull request, even one the file lists', () => {
    const [number] = stated[0].issues;
    const github = live((copy) => {
      const listed = copy.issues.find((i) => i.number === number);
      listed.pullRequest = true;
      listed.milestone = null;
    });
    assert.deepEqual(plan(stated, github), []);
  });

  it('does not place an issue the file lists in two milestones', () => {
    const twice = structuredClone(stated);
    twice[1].issues.push(twice[0].issues[0]);
    const github = live((copy) => {
      copy.issues.find((i) => i.number === twice[0].issues[0]).milestone = null;
    });
    assert.ok(!plan(twice, github).some((a) => a.kind === 'assign' && a.issue === twice[0].issues[0]));
  });

  it('puts an issue in the milestone the file says, taking it out of the one it was in', () => {
    const [number] = stated[1].issues;
    const github = live((copy) => {
      copy.issues.find((i) => i.number === number).milestone = 'Only on GitHub';
    });
    assert.deepEqual(plan(stated, github), [{ kind: 'assign', issue: number, title: stated[1].title }]);
  });

  it('says each action in a sentence', () => {
    assert.equal(describeAction({ kind: 'create', title: 'T' }), 'Create the milestone "T".');
    assert.equal(describeAction({ kind: 'describe', title: 'T' }), 'Correct the description of the milestone "T".');
    assert.equal(describeAction({ kind: 'assign', issue: 7, title: 'T' }), 'Put issue #7 in the milestone "T".');
  });
});

describe('the ordered list is drawn from the file alone', () => {
  const list = milestoneList(stated);
  const lines = list.split('\n');

  it('is wrapped in its two markers and has a line for each milestone, in order', () => {
    assert.equal(lines[0], START);
    assert.equal(lines.at(-1), END);
    assert.equal(lines.length, stated.length + 2);
    for (const [at, entry] of stated.entries()) assert.ok(lines[at + 1].startsWith(`${at + 1}. **[${entry.title}](`), `line ${at + 1}`);
  });

  it('links each title to the live milestone, in bold, with the title encoded', () => {
    assert.equal(
      milestoneUrl('2.7.13: repeated-task evaluation'),
      'https://github.com/Davmunrey/Trazum/issues?q=is%3Aissue+milestone%3A%222.7.13%3A+repeated-task+evaluation%22',
    );
    for (const [at, entry] of stated.entries()) assert.ok(lines[at + 1].includes(`**[${entry.title}](${milestoneUrl(entry.title)})**`));
    for (const entry of stated) assert.match(milestoneUrl(entry.title), /^https:\/\/github\.com\/Davmunrey\/Trazum\/issues\?q=is%3Aissue\+milestone%3A%22[^"\s()]+%22$/);
  });

  it('encodes what would end a Markdown link early', () => {
    const url = milestoneUrl("It's (a) title! [x] *y* & z/é");
    assert.ok(!/[()'!*\s"[\]]/.test(url.slice(url.indexOf('%3A%22') + 6, -3)), url);
    assert.ok(url.includes('%27') && url.includes('%28') && url.includes('%29') && url.includes('%21') && url.includes('%2A'));
    assert.ok(url.includes('%26') && url.includes('%2F') && url.includes('%C3%A9'));
  });

  it('carries each description and each issue as a link, and nothing else', () => {
    stated.forEach((entry, at) => {
      assert.ok(lines[at + 1].includes(` ${entry.description} Issues: `));
      const linked = [...lines[at + 1].matchAll(/\[#(\d+)\]\(https:\/\/github\.com\/Davmunrey\/Trazum\/issues\/(\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.deepEqual(linked, entry.issues.map((number) => [number, number]));
    });
  });

  it('escapes a bracket in a title so the link holds', () => {
    const [, line] = milestoneList([{ title: 'A [b] c', description: 'd', issues: [1] }]).split('\n');
    assert.ok(line.startsWith('1. **[A \\[b\\] c]('));
  });

  it('is a function of the file: the same input twice is the same list, a change shows', () => {
    assert.equal(milestoneList(stated), list);
    assert.notEqual(milestoneList([...stated].reverse()), list);
    assert.notEqual(milestoneList(stated.map((entry, at) => (at === 0 ? { ...entry, issues: [...entry.issues, 1] } : entry))), list);
  });

  it('replaces only what is between the markers, and refuses a page that lost them', () => {
    const page = `before\n${START}\nold\n${END}\nafter\n`;
    const next = withMilestones(page, list);
    assert.ok(next.startsWith(`before\n${START}`) && next.endsWith(`${END}\nafter\n`));
    assert.ok(!next.includes('\nold\n'));
    assert.equal(withMilestones(next, list), next, 'writing the same list twice changed the page');
    assert.throws(() => withMilestones('no markers here', list), /markers/);
    assert.throws(() => withMilestones(`${START}\n`, list), /markers/);
    assert.throws(() => withMilestones(`${END}x${START}`, list), /markers/);
  });
});

/**
 * A stand-in for `gh`, first on the PATH. It keeps GitHub's milestones and
 * issues in two files next to it, answers the two reads from them (the
 * milestones as two pages printed one after the other, the way `--paginate`
 * prints them), writes down every call, and takes a write, refuses it (the file
 * `refuse`), accepts it and does nothing (`ignore`), or answers every call with
 * an error (`down`). So the whole of `apply` runs here, with nothing sent
 * anywhere.
 */
const STAND_IN = `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const at = (name) => join(__dirname, name);
const args = process.argv.slice(2);
const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
const path = args.find((arg) => arg.startsWith('repos/'));
const sent = method === 'GET' ? '' : readFileSync(0, 'utf8');
appendFileSync(at('calls.log'), JSON.stringify({ method, path, paginate: args.includes('--paginate'), sent: sent === '' ? null : JSON.parse(sent) }) + '\\n');
if (existsSync(at('down'))) {
  process.stderr.write('gh: HTTP 502 Bad Gateway\\n');
  process.exit(1);
}
if (method !== 'GET' && existsSync(at('refuse'))) {
  process.stderr.write('gh: Resource not accessible by integration (HTTP 403)\\n');
  process.exit(1);
}
const load = (name) => JSON.parse(readFileSync(at(name), 'utf8'));
const save = (name, value) => writeFileSync(at(name), JSON.stringify(value));
const pages = (list) => (list.length < 2 ? JSON.stringify(list) : JSON.stringify(list.slice(0, 1)) + JSON.stringify(list.slice(1)));
const ignore = existsSync(at('ignore'));
const body = sent === '' ? null : JSON.parse(sent);
if (method === 'GET' && path === 'repos/o/r/milestones?state=all&per_page=100') process.stdout.write(pages(load('milestones.json')));
else if (method === 'GET' && path === 'repos/o/r/issues?state=open&per_page=100') process.stdout.write(pages(load('issues.json')));
else if (method === 'POST' && path === 'repos/o/r/milestones') {
  const all = load('milestones.json');
  const made = { number: 1 + Math.max(0, ...all.map((m) => m.number)), title: body.title, description: body.description, due_on: null };
  if (!ignore) save('milestones.json', [...all, made]);
  process.stdout.write(JSON.stringify(made));
} else if (method === 'PATCH' && /^repos\\/o\\/r\\/milestones\\/\\d+$/.test(path)) {
  if (!ignore) save('milestones.json', load('milestones.json').map((m) => (String(m.number) === path.split('/').pop() ? { ...m, description: body.description } : m)));
} else if (method === 'PATCH' && /^repos\\/o\\/r\\/issues\\/\\d+$/.test(path)) {
  const target = load('milestones.json').find((m) => m.number === body.milestone);
  if (!ignore) save('issues.json', load('issues.json').map((i) => (String(i.number) === path.split('/').pop() ? { ...i, milestone: { number: target.number, title: target.title } } : i)));
} else {
  process.stderr.write('stand-in gh: unexpected ' + method + ' ' + path + '\\n');
  process.exit(1);
}
`;

describe('the command, against a stand-in for gh', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const apiMilestone = (entry, number, change = {}) => ({ number, title: entry.title, description: entry.description, due_on: null, ...change });
  const apiIssue = (number, milestoneEntry = null, labels = ['accepted']) => ({
    number,
    labels: labels.map((name) => ({ name })),
    milestone: milestoneEntry === null ? null : { title: milestoneEntry.title, number: 0 },
  });
  /**
   * A GitHub that has drifted: the first milestone with an old description, the
   * rest missing, a milestone made on the website that holds one of the file's
   * issues and one that is not, and every listed issue open.
   */
  const drifted = () => {
    const onlyHere = { title: 'Made on the website', description: 'Not in the file.' };
    return {
      milestones: [apiMilestone(first, 1, { description: 'An older description.' }), apiMilestone(onlyHere, 2), apiMilestone({ title: 'odd ][ title', description: 'brackets' }, 3)],
      issues: [
        ...stated.flatMap((entry) => entry.issues.map((number) => (number === stated[1].issues[0] ? apiIssue(number, onlyHere) : apiIssue(number)))),
        apiIssue(999, onlyHere, []),
        { ...apiIssue(1000, null, ['accepted']), pull_request: { url: 'x' } },
      ],
    };
  };

  /** A repository tree with the real script and file in a directory, and a GitHub beside it. */
  function sandbox({ github = drifted(), file = stated, roadmap = read('ROADMAP.md'), flags = [] } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-milestones-'));
    dirs.push(dir);
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(join(repo, '.github'), { recursive: true });
    for (const name of ['milestones.mjs', 'ruleset.mjs']) cpSync(join(ROOT, 'scripts', name), join(repo, 'scripts', name));
    cpSync(join(ROOT, 'package.json'), join(repo, 'package.json'));
    writeFileSync(join(repo, FILE), JSON.stringify(file));
    writeFileSync(join(repo, 'ROADMAP.md'), roadmap);
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), STAND_IN);
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(bin, 'milestones.json'), JSON.stringify(github.milestones));
    writeFileSync(join(bin, 'issues.json'), JSON.stringify(github.issues));
    for (const flag of flags) writeFileSync(join(bin, flag), '');
    const env = { ...SPAWN_ENV, PATH: `${bin}${delimiter}${SPAWN_ENV.PATH ?? process.env.PATH}`, GH_REPO: '', GITHUB_REPOSITORY: '' };
    return {
      repo,
      run: (...args) => spawnSync(process.execPath, [join(repo, 'scripts/milestones.mjs'), ...args, '--repo', 'o/r'], { cwd: repo, env, encoding: 'utf8', timeout: 20_000 }),
      runBare: (...args) => spawnSync(process.execPath, [join(repo, 'scripts/milestones.mjs'), ...args], { cwd: repo, env, encoding: 'utf8', timeout: 20_000 }),
      calls: () => (existsSync(join(bin, 'calls.log')) ? readFileSync(join(bin, 'calls.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []),
      state: () => ({ milestones: JSON.parse(readFileSync(join(bin, 'milestones.json'), 'utf8')), issues: JSON.parse(readFileSync(join(bin, 'issues.json'), 'utf8')) }),
      roadmap: () => readFileSync(join(repo, 'ROADMAP.md'), 'utf8'),
    };
  }
  const writes = (calls) => calls.filter((call) => call.method !== 'GET');

  it('reads the milestones and the open issues, prints each difference, and exits 1', () => {
    const hub = sandbox();
    const result = hub.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, new RegExp(`^GitHub does not have the milestones ${FILE.replaceAll('.', '\\.')} states\\. ${stated.length + 1} difference\\(s\\):$`, 'm'), 'every milestone but the first is missing, the first differs in its description, and its issue is in none');
    assert.ok(result.stdout.includes(`The milestone "${stated[1].title}" is in the file and GitHub lacks it.`));
    assert.ok(result.stdout.includes(`The description of the milestone "${first.title}" differs.`));
    assert.ok(result.stdout.includes(`Issue #${stated[1].issues[0]} is in the milestone "${stated[1].title}"`) === false, 'the issues of a missing milestone are not listed one by one');
    assert.ok(result.stdout.includes('The milestone "Made on the website" is only on GitHub, left alone.'));
    assert.ok(result.stdout.includes('The milestone "odd ][ title" is only on GitHub, left alone.'));
    assert.deepEqual(writes(hub.calls()), []);
    assert.deepEqual(hub.calls().map((call) => [call.method, call.path, call.paginate]), [
      ['GET', 'repos/o/r/milestones?state=all&per_page=100', true],
      ['GET', 'repos/o/r/issues?state=open&per_page=100', true],
    ]);
  });

  it('exits 0 and says so when GitHub has what the file states', () => {
    const hub = sandbox({
      github: {
        milestones: stated.map((entry, at) => apiMilestone(entry, at + 1)),
        issues: stated.flatMap((entry) => entry.issues.map((number) => apiIssue(number, entry))),
      },
    });
    const result = hub.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`^GitHub has the milestones ${FILE.replaceAll('.', '\\.')} states\\.$`, 'm'));
  });

  it('with --report prints the same and exits 0, which is what a pull request gets', () => {
    const hub = sandbox();
    const plain = hub.run();
    const result = hub.run('--report');
    assert.equal(result.status, 0);
    assert.equal(result.stdout, plain.stdout);
    assert.deepEqual(writes(hub.calls()), []);
  });

  it('an accepted issue the file places nowhere makes it exit 1, and a due date does too', () => {
    const settled = () => ({
      milestones: stated.map((entry, at) => apiMilestone(entry, at + 1)),
      issues: stated.flatMap((entry) => entry.issues.map((number) => apiIssue(number, entry))),
    });
    const unplanned = settled();
    unplanned.issues.push(apiIssue(9001, null, ['blocked']));
    const one = sandbox({ github: unplanned }).run();
    assert.equal(one.status, 1);
    assert.match(one.stdout, /Issue #9001 is labelled blocked and the file puts it in no milestone\./);
    const dated = settled();
    dated.milestones[0].due_on = '2027-02-01T08:00:00Z';
    const two = sandbox({ github: dated }).run();
    assert.equal(two.status, 1);
    assert.match(two.stdout, /has a due date on GitHub/);
  });

  it('apply without --yes says what it would change and writes nothing', () => {
    const hub = sandbox();
    const before = hub.state();
    const result = hub.run('apply');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Would change:\n {2}Correct the description of the milestone "/);
    assert.match(result.stdout, /Correct the description of the milestone "/);
    assert.match(result.stdout, /Put issue #\d+ in the milestone "/);
    assert.match(result.stdout, /Nothing was changed\. To change o\/r so that it has the milestones the file states: npm run milestones -- apply --yes/);
    assert.deepEqual(writes(hub.calls()), []);
    assert.deepEqual(hub.state(), before);
  });

  it('apply --yes creates, corrects and places, reads again, judges that, and exits 0', () => {
    const hub = sandbox();
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const sent = writes(hub.calls());
    const created = sent.filter((call) => call.method === 'POST');
    assert.deepEqual(created.map((call) => call.sent.title), stated.slice(1).map((entry) => entry.title));
    assert.ok(created.every((call) => call.path === 'repos/o/r/milestones' && Object.keys(call.sent).sort().join() === 'description,title'));
    const described = sent.filter((call) => call.path === 'repos/o/r/milestones/1');
    assert.deepEqual(described.map((call) => call.sent), [{ description: first.description }]);
    const placed = sent.filter((call) => /issues\/\d+$/.test(call.path));
    assert.deepEqual(
      placed.map((call) => Number(call.path.split('/').pop())).sort((a, b) => a - b),
      stated.flatMap((entry) => entry.issues).sort((a, b) => a - b),
    );
    // Every milestone exists before an issue is put in one.
    const order = sent.map((call) => (call.method === 'POST' ? 'create' : call.path.includes('/issues/') ? 'assign' : 'describe'));
    assert.ok(order.lastIndexOf('create') < order.indexOf('assign') && order.lastIndexOf('describe') < order.indexOf('assign'));
    const state = hub.state();
    assert.deepEqual(compare(stated, readStateAsLive(state)).differences, []);
    assert.match(result.stdout, /Read again, after the change:\n\nGitHub has the milestones /);
    assert.equal(hub.calls().filter((call) => call.method === 'GET').length, 4, 'GitHub was read twice, milestones and issues each time');
  });

  it('never deletes a milestone, and never touches what the file does not list', () => {
    const hub = sandbox();
    hub.run('apply', '--yes');
    const calls = hub.calls();
    assert.deepEqual(calls.filter((call) => call.method === 'DELETE'), []);
    for (const call of writes(calls)) {
      assert.ok(!['repos/o/r/milestones/2', 'repos/o/r/milestones/3', 'repos/o/r/issues/999', 'repos/o/r/issues/1000'].includes(call.path), `${call.method} ${call.path}`);
      assert.ok(!('due_on' in (call.sent ?? {})), 'a due date was sent');
    }
    const { milestones, issues } = hub.state();
    assert.ok(milestones.some((m) => m.title === 'Made on the website') && milestones.some((m) => m.title === 'odd ][ title'));
    assert.equal(issues.find((i) => i.number === 999).milestone.title, 'Made on the website');
  });

  it('writes nothing when there is nothing to change', () => {
    const hub = sandbox();
    hub.run('apply', '--yes');
    const before = hub.calls().length;
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 0);
    assert.deepEqual(writes(hub.calls().slice(before)), []);
  });

  it('a write GitHub accepted and did not make is found by reading again, and exits 1', () => {
    const hub = sandbox({ flags: ['ignore'] });
    const result = hub.run('apply', '--yes');
    assert.ok(writes(hub.calls()).length > 0);
    assert.match(result.stdout, /Read again, after the change:\n\nGitHub does not have the milestones /);
    assert.equal(result.status, 1);
  });

  it('a refused write changes nothing, says what is needed, and exits 1', () => {
    const hub = sandbox({ flags: ['refuse'] });
    const before = hub.state();
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GitHub refused a change/);
    assert.match(result.stderr, /HTTP 403/);
    assert.match(result.stderr, /issues: write on o\/r/);
    assert.deepEqual(hub.state(), before);
    assert.doesNotMatch(result.stdout, /Read again/);
  });

  it('a difference apply cannot fix is left for a person, and exits 1 with nothing written', () => {
    const github = {
      milestones: stated.map((entry, at) => apiMilestone(entry, at + 1, at === 0 ? { due_on: '2027-02-01T08:00:00Z' } : {})),
      issues: stated.flatMap((entry) => entry.issues.map((number) => apiIssue(number, entry))),
    };
    const hub = sandbox({ github });
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Nothing for apply to change: what is left is for a person to fix\./);
    assert.deepEqual(writes(hub.calls()), []);
  });

  it('refuses to apply a file that puts an issue in two milestones, and writes nothing', () => {
    const twice = structuredClone(stated);
    twice[1].issues.push(twice[0].issues[0]);
    const hub = sandbox({ file: twice });
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /puts an issue in two milestones; fix the file first/);
    assert.deepEqual(writes(hub.calls()), []);
  });

  it('exits 2, and says GitHub could not be read, when it cannot be: never 0', () => {
    for (const args of [[], ['--report'], ['apply'], ['apply', '--yes']]) {
      const hub = sandbox({ flags: ['down'] });
      const result = hub.run(...args);
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /^milestones: GitHub could not be read, so nothing was compared:/);
      assert.match(result.stderr, /HTTP 502/);
      assert.deepEqual(writes(hub.calls()), []);
    }
  });

  it('exits 2 when gh is not there at all', () => {
    const hub = sandbox();
    const empty = mkdtempSync(join(tmpdir(), 'trazum-nogh-'));
    dirs.push(empty);
    const result = spawnSync(process.execPath, [join(hub.repo, 'scripts/milestones.mjs'), '--repo', 'o/r'], { cwd: hub.repo, env: { ...SPAWN_ENV, PATH: empty }, encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /GitHub could not be read/);
  });

  it('exits 2 when no repository can be named', () => {
    const hub = sandbox();
    const result = hub.runBare();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^milestones: /);
  });

  it('exits 2 on an unknown argument, and prints the usage', () => {
    const hub = sandbox();
    for (const args of [['--bogus'], ['bogus'], ['--yes'], ['roadmap', '--yes']]) {
      const result = hub.run(...args);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /^milestones: /);
      assert.match(result.stderr, /usage: node scripts\/milestones\.mjs/);
    }
    assert.deepEqual(hub.calls(), [], 'it asked GitHub before it checked its own arguments');
  });

  it('exits 2 on a file it cannot trust, before it asks GitHub anything', () => {
    for (const file of [{}, [{ title: 'T', description: 'd', issues: [1], due_on: '2027-01-01' }], [{ title: '', description: 'd', issues: [] }]]) {
      const hub = sandbox({ file });
      const result = hub.run();
      assert.equal(result.status, 2);
      assert.match(result.stderr, /is not usable/);
      assert.deepEqual(hub.calls(), []);
    }
  });

  it('draws the roadmap list, checks it, and refuses a page that lost the markers', () => {
    const stale = read('ROADMAP.md').replace(/<!-- milestones:start -->[\s\S]*<!-- milestones:end -->/, `${START}\nold\n${END}`);
    const hub = sandbox({ roadmap: stale });
    const check = hub.runBare('roadmap', '--check');
    assert.equal(check.status, 1);
    assert.match(check.stderr, /not what \.github\/milestones\.json says/);
    assert.equal(hub.roadmap(), stale, '--check wrote');
    const wrote = hub.runBare('roadmap');
    assert.equal(wrote.status, 0);
    assert.equal(hub.roadmap(), read('ROADMAP.md'));
    assert.equal(hub.runBare('roadmap', '--check').status, 0);
    const lost = sandbox({ roadmap: stale.replace(START, '').replace(END, '') });
    const refused = lost.runBare('roadmap');
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /lost the milestone markers/);
    assert.deepEqual(lost.calls(), [], 'the roadmap never asks GitHub');
  });
});

/** The stand-in's files, in the shape the script reads them into. */
function readStateAsLive({ milestones, issues }) {
  return { milestones: readMilestones(milestones), issues: readIssues(issues) };
}

describe('writing happens in one place, behind one flag', () => {
  const script = read('scripts/milestones.mjs');

  it('every write to GitHub is made by execute, which only apply --yes reaches', () => {
    const gate = script.indexOf("if (!args.yes) {");
    assert.ok(gate > 0, 'the --yes gate is gone');
    assert.match(script.slice(gate, gate + 400), /Nothing was changed[^\n]+\n\s+return 1;/);
    assert.deepEqual([...script.matchAll(/send\('(POST|PATCH|PUT|DELETE)'/g)].map((match) => match[1]), ['POST', 'PATCH', 'PATCH']);
    const calls = [...script.matchAll(/^\s+execute\(name, actions, live\);$/gm)];
    assert.equal(calls.length, 1);
    assert.ok(calls[0].index > gate, 'execute is reachable without --yes');
    assert.doesNotMatch(script, /'--method', '(DELETE|PUT)'/);
    assert.doesNotMatch(script, /--method', 'DELETE/);
  });

  it('reads GitHub again after writing, and judges that', () => {
    assert.match(script, /Read again, after the change/);
    assert.ok(script.indexOf('compare(stated, readGitHub(name))') > script.indexOf('execute(name, actions, live);'));
  });

  it('asks GitHub through gh with arguments, never through a shell', () => {
    assert.match(script, /execFileSync\('gh', args,/);
    assert.doesNotMatch(script, /\bexecSync\(|shell: true/);
  });

  it('runs only when it is the command, so importing it does nothing', () => {
    assert.match(script, /if \(process\.argv\[1\] !== undefined && fileURLToPath\(import\.meta\.url\) === process\.argv\[1\]\) \{/);
  });
});

describe('the workflow writes in one job and reads in the others', () => {
  const workflow = read('.github/workflows/milestones.yml');
  const code = workflow.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    assert.notEqual(start, -1, `no ${name} job`);
    const rest = workflow.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };
  const jobs = ['apply', 'report', 'compare'];
  const paths = ['.github/milestones.json', 'scripts/milestones.mjs', '.github/workflows/milestones.yml'];

  it('is named Milestones and has exactly three jobs', () => {
    assert.match(workflow, /^name: Milestones$/m);
    assert.deepEqual([...workflow.matchAll(/^ {2}([a-z-]+):\n {4}name: /gm)].map((match) => match[1]), jobs);
  });

  it('runs on a push to main, a pull request, a schedule and by hand, for these three paths', () => {
    const on = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\npermissions:'));
    const block = (event) => {
      const at = on.indexOf(`\n  ${event}:`);
      assert.notEqual(at, -1, `no ${event} trigger`);
      return on.slice(at + 1).split(/\n {2}[a-z_]+:/)[0];
    };
    for (const event of ['push', 'pull_request']) {
      const listed = [...block(event).matchAll(/^ {6}- (\S+)$/gm)].map((match) => match[1]);
      assert.deepEqual(listed, paths, `${event} paths`);
    }
    assert.match(block('push'), /branches: \[main\]/);
    assert.match(on, /^ {2}schedule:$/m);
    assert.match(on, /^ {2}workflow_dispatch:$/m);
    assert.doesNotMatch(code, /pull_request_target/);
    assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]), ['push', 'pull_request', 'schedule', 'workflow_dispatch']);
  });

  it('is on a Monday at a minute no other weekly workflow uses, and not on the hour', () => {
    const [, minute, hour] = workflow.match(/^ {4}- cron: '(\d+) (\d+) \* \* 1'$/m) ?? [];
    assert.ok(minute !== undefined, 'no weekly cron');
    assert.ok(Number(minute) !== 0 && Number(minute) !== 30, `minute ${minute} is a busy one`);
    assert.ok(Number(hour) >= 0 && Number(hour) < 24);
    const used = [];
    for (const name of readdirSync(join(ROOT, '.github/workflows'))) {
      if (name === 'milestones.yml') continue;
      for (const [, other] of read(`.github/workflows/${name}`).matchAll(/^\s*- cron: '(\d+) /gm)) used.push(`${other} (${name})`);
    }
    assert.ok(used.length >= 5, 'no other cron found: is this looking in the right place?');
    assert.ok(!used.map((entry) => entry.split(' ')[0]).includes(minute), `minute ${minute} is also used by ${used.join(', ')}`);
    assert.ok(/at \d\d:31\./.test(workflow) && workflow.includes('minute 31'), 'the comment says a different minute from the one chosen');
  });

  it('defaults to read-only, and states each job’s permissions: write is in apply only', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.match(job('apply'), /permissions:\n {6}contents: read\n {6}issues: write\n {4}steps:/);
    assert.match(job('report'), /permissions:\n {6}contents: read\n {6}issues: read\n {4}steps:/);
    assert.match(job('compare'), /permissions:\n {6}contents: read\n {6}issues: read\n {4}steps:/);
    assert.deepEqual([...code.matchAll(/^\s+([a-z-]+): write$/gm)].map((match) => match[1]), ['issues']);
    assert.equal((code.match(/: write$/gm) ?? []).length, 1);
    assert.ok(!/: write/.test(job('report')) && !/: write/.test(job('compare')));
  });

  it('each job runs on the event it is for, and apply writes only from main', () => {
    assert.match(job('apply'), /if: >-\n\s+github\.event_name == 'push'\n\s+\|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
    assert.match(job('report'), /if: github\.event_name == 'pull_request'/);
    assert.match(job('compare'), /if: github\.event_name == 'schedule'/);
  });

  it('applies, reports and compares with the command each is for, and applies nowhere else', () => {
    assert.match(job('apply'), /run: node scripts\/milestones\.mjs apply --yes\s*$/);
    assert.match(job('report'), /run: node scripts\/milestones\.mjs --report\s*$/);
    assert.match(job('compare'), /run: node scripts\/milestones\.mjs\s*$/);
    assert.equal((code.match(/--yes/g) ?? []).length, 1);
    assert.equal((code.match(/\bapply\b/g) ?? []).length, 2, 'the word apply is the job’s key and the command only');
    assert.ok(!/apply|--yes/.test(job('report').replace(/name: .*/g, '')));
    assert.ok(!/apply|--yes/.test(job('compare').replace(/name: .*/g, '')));
  });

  it('a pull request reports and does not fail, and the weekly run fails', () => {
    assert.ok(job('report').includes('--report'));
    assert.ok(!job('compare').includes('--report'));
  });

  it('pins every action by commit, with its version, and keeps credentials out of every checkout', () => {
    const uses = [...code.matchAll(/^\s*- uses: (\S+)(.*)$/gm)];
    assert.equal(uses.length, jobs.length);
    for (const [, ref, rest] of uses) {
      assert.match(ref, /^actions\/checkout@[0-9a-f]{40}$/);
      assert.match(rest, /^ # v\d+$/);
    }
    assert.equal((code.match(/persist-credentials: false/g) ?? []).length, uses.length);
  });

  it('never reads a stranger’s text into a script, and holds no secret', () => {
    for (const block of workflow.split(/\n\s+run: /).slice(1)) {
      const script = block.split('\n')[0];
      assert.doesNotMatch(script, /\$\{\{/, `an expression is interpolated into a run script: ${script}`);
    }
    assert.doesNotMatch(workflow, /github\.event\.(issue|pull_request)\.(title|body)|head_ref|head\.ref/);
    assert.doesNotMatch(workflow, /secrets\./);
    assert.equal((workflow.match(/GH_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, jobs.length);
    assert.equal((workflow.match(/GH_REPO: \$\{\{ github\.repository \}\}/g) ?? []).length, jobs.length);
  });

  it('lets a run in progress finish, so a write is never cut off', () => {
    assert.match(workflow, /^concurrency:\n {2}group: milestones-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: false$/m);
  });

  it('checks out the files the script reads, and the file the script imports', () => {
    const script = read('scripts/milestones.mjs');
    const imported = [...script.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)].map((match) => `scripts/${match[1]}`);
    assert.deepEqual(imported, ['scripts/ruleset.mjs']);
    for (const name of jobs) {
      for (const path of ['scripts/milestones.mjs', ...imported, FILE, 'package.json']) assert.ok(job(name).includes(`            ${path}\n`), `${name} does not check out ${path}`);
    }
  });

  it('is not a required check: it judges GitHub, not a pull request', () => {
    const ruleset = JSON.parse(read('.github/rulesets/main-branch.json'));
    const required = ruleset.rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks.map((check) => check.context);
    for (const [, name] of workflow.matchAll(/^ {4}name: (.+)$/gm)) assert.ok(!required.includes(name), name);
  });
});

describe('ROADMAP.md carries the list, and every accepted issue in it is planned', () => {
  const roadmap = read('ROADMAP.md');
  const next = sectionOf(roadmap, '\n## Next\n');

  it('has the generated list under Next, above the open-work paragraph, equal to what the script draws', () => {
    const start = next.indexOf(START);
    const end = next.indexOf(END);
    assert.ok(start !== -1 && end > start, 'the ordered list is not in the Next section');
    assert.equal(next.slice(start, end + END.length), milestoneList(stated));
    assert.equal(roadmap.split(START).length, 2, 'the list is in ROADMAP.md more than once');
    const heading = next.indexOf('\n### In order\n');
    assert.ok(heading !== -1 && heading < start, 'no "In order" subsection above the list');
    assert.ok(end < next.indexOf('\n### Open work, as issues\n'), 'the list is not above the open-work paragraph');
    assert.ok(next.indexOf('\n**Target: 2.7.13') < heading, 'In order is not after the target paragraph');
  });

  it('says in its own words that the order is the commitment, that there are no dates, and where the list comes from', () => {
    const intro = next.slice(next.indexOf('\n### In order\n'), next.indexOf(START));
    assert.match(intro, /order[\s\S]*commitment/);
    assert.match(intro, /no dates/);
    assert.ok(intro.includes('.github/milestones.json') && intro.includes('node scripts/milestones.mjs roadmap'));
    assert.match(intro, /links the live\s+milestone/);
    assert.ok(!intro.includes('—'));
    assert.doesNotMatch(intro, /\b(19|20)\d\d\b/);
    assert.match(roadmap.slice(0, 600), /the ordering is a\s+commitment, the calendar is not/);
  });

  it('keeps the open-work table and its markers as they were', () => {
    assert.equal(next.split('<!-- open-work:start -->').length, 2);
    assert.equal(next.split('<!-- open-work:end -->').length, 2);
    assert.ok(next.indexOf('<!-- open-work:start -->') > next.indexOf(END));
  });

  it('puts every issue of the open-work table in exactly one milestone of the file', () => {
    const table = next.slice(next.indexOf('<!-- open-work:start -->'), next.indexOf('<!-- open-work:end -->'));
    const rows = [...table.matchAll(/^\| \[#(\d+)\]/gm)].map((match) => Number(match[1]));
    assert.ok(rows.length > 0, 'the open-work table has no rows');
    for (const number of rows) {
      const homes = stated.filter((entry) => entry.issues.includes(number));
      assert.equal(homes.length, 1, `#${number} is in ${homes.length} milestones of ${FILE}`);
    }
  });

  it('links every issue of the list to this repository’s own issue', () => {
    for (const [, number, linked] of milestoneList(stated).matchAll(/\[#(\d+)\]\(https:\/\/github\.com\/Davmunrey\/Trazum\/issues\/(\d+)\)/g)) assert.equal(number, linked);
  });
});

describe('the wiki has the roadmap, generated from the same section', () => {
  const page = read('wiki/Roadmap.md');

  it('is a page, listed on the sidebar and on Home, and says where it came from', () => {
    assert.match(page, /^> Generated from \[`ROADMAP\.md`\]\(https:\/\/github\.com\/Davmunrey\/Trazum\/blob\/main\/ROADMAP\.md\) by `scripts\/build-wiki\.mjs`\./);
    for (const name of ['_Sidebar.md', 'Home.md']) assert.ok(read(`wiki/${name}`).includes('(https://github.com/Davmunrey/Trazum/wiki/Roadmap)'), `${name} does not list the Roadmap page`);
    assert.match(read('scripts/build-wiki.mjs'), /name: 'Roadmap',\n {4}title: '[^']+',\n {4}source: 'ROADMAP\.md',\n {4}heading: '## Next',/);
  });

  it('carries the ordered list exactly as the repository draws it', () => {
    assert.ok(page.includes(milestoneList(stated)));
    assert.ok(page.includes('\n## Next\n'));
  });

  it('does not carry anything from beyond the Next section', () => {
    assert.ok(!page.includes('\n## Under consideration'));
    assert.ok(!page.includes('\n## How versions are decided'));
  });
});

describe('the documents say what the command does', () => {
  it('package.json has the command', () => {
    assert.equal(JSON.parse(read('package.json')).scripts.milestones, 'node scripts/milestones.mjs');
  });

  it('CONTRIBUTING.md says, under Triage, that an accepted issue is put in a milestone and what checks it', () => {
    const triage = sectionOf(read('CONTRIBUTING.md'), '### Triage').split('\n### ')[0];
    const bullet = triage.slice(triage.indexOf('- **An accepted issue is put in a milestone.**'));
    assert.ok(bullet.length > 50, 'the bullet is gone');
    const text = bullet.split('\n\n')[0];
    for (const word of ['.github/milestones.json', '`accepted`', '`blocked`', 'npm run milestones', 'exits 1', '`Milestones`', 'milestones.test.js', 'node scripts/milestones.mjs roadmap', 'no date']) {
      assert.ok(text.includes(word), `the bullet does not say ${word}`);
    }
    assert.ok(!text.includes('—'));
  });

  it('the changelog says it under Unreleased and ends with the issue', () => {
    const unreleased = sectionOf(read('CHANGELOG.md'), '## Unreleased');
    const entry = unreleased.split('\n- **').find((text) => text.startsWith('The roadmap’s order') || text.startsWith("The roadmap's order"));
    assert.ok(entry !== undefined, 'no entry about the roadmap’s order under Unreleased');
    assert.match(entry.trimEnd().split('\n\n')[0], /\(#720\)\.?$/);
    assert.ok(entry.includes('npm run milestones') && entry.includes('.github/milestones.json'));
  });
});
