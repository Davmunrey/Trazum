#!/usr/bin/env node
/**
 * Are the milestones on GitHub the ones this repository states?
 *
 *   npm run milestones                    compare; exit 1 when they differ
 *   npm run milestones -- --report        compare; exit 0 whatever it finds
 *   npm run milestones -- apply           say what would change; change nothing
 *   npm run milestones -- apply --yes     change it, then compare again
 *   npm run milestones -- roadmap         write the ordered list into ROADMAP.md
 *   npm run milestones -- roadmap --check fail when ROADMAP.md is not that list
 *
 * `.github/milestones.json` is the plan: an ordered array, the first entry is
 * what comes next, and each entry names the issues that belong to it. GitHub
 * holds a copy, because a milestone is where a visitor to the issue list sees
 * the plan. A copy nothing compares is a copy that drifts, which is the
 * lesson `scripts/ruleset.mjs` was written from, and this follows it: the file
 * is the policy, GitHub is read through `gh`, and `main` is the only part that
 * talks to GitHub.
 *
 * The file allows no date. The ordering is the commitment and the calendar is
 * not, so a milestone that has a due date on GitHub is a difference.
 *
 * What is compared, and what is left alone.
 *
 * A milestone in the file that GitHub lacks, and one whose description
 * differs, are differences. A milestone only on GitHub is printed and left
 * alone: somebody made it, and deleting it would take its issues out of it.
 * An open issue the file puts in a milestone must be in that milestone on
 * GitHub. An open issue labelled `accepted` or `blocked` must be in some
 * milestone of the file, which is how an accepted issue cannot go unplanned.
 * A closed issue the file lists is fine: it stays in its milestone as history.
 * Pull requests are not read.
 *
 * `apply --yes` creates what is missing, corrects descriptions and puts each
 * listed issue in its milestone. It never deletes a milestone, never takes an
 * issue out of a milestone the file does not mention, and never touches a due
 * date: a date is a person's to remove. It then reads GitHub again and judges
 * that reading, because an answer of 200 is not the change.
 *
 * Reading needs a token that can read the repository. Writing needs
 * `issues: write`, and the workflow gives it only to the job that applies.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryName } from './ruleset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The plan, as a file a pull request can change and a reviewer can read. */
export const FILE = '.github/milestones.json';

/**
 * The longest title and description this repository accepts in the file. These
 * are this repository's own limits, set well under what a milestone is likely
 * to hold: GitHub's own limits were not measured. A milestone has to be read
 * in a list and in a sidebar, and a description longer than this is prose that
 * belongs in an issue.
 */
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 500;

/** The keys an entry may have. No date field is among them, on purpose. */
export const KEYS = ['title', 'description', 'issues'];

export const START = '<!-- milestones:start -->';
export const END = '<!-- milestones:end -->';

const SITE = 'https://github.com/Davmunrey/Trazum';

export const USAGE = [
  'usage: node scripts/milestones.mjs [--report]',
  '       node scripts/milestones.mjs apply [--yes]',
  '       node scripts/milestones.mjs roadmap [--check]',
  '  Every form takes --repo owner/name; without it the repository comes from GH_REPO, GITHUB_REPOSITORY or package.json.',
].join('\n');

/** A command line that is not one of the forms above. */
export class UsageError extends Error {}

/** The command line as one of the three modes and its flags, or a UsageError. */
export function parseArgs(argv) {
  let mode = 'compare';
  let moded = false;
  const flags = { report: false, yes: false, check: false, repo: undefined };
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--report') flags.report = true;
    else if (arg === '--yes') flags.yes = true;
    else if (arg === '--check') flags.check = true;
    else if (arg === '--repo') {
      flags.repo = argv[at + 1];
      at += 1;
      if (flags.repo === undefined || flags.repo.startsWith('--')) throw new UsageError('--repo needs owner/name');
    } else if ((arg === 'apply' || arg === 'roadmap') && !moded) {
      mode = arg;
      moded = true;
    } else throw new UsageError(`unknown argument: ${arg}`);
  }
  if (flags.yes && mode !== 'apply') throw new UsageError('--yes belongs to apply');
  if (flags.check && mode !== 'roadmap') throw new UsageError('--check belongs to roadmap');
  if (flags.report && mode !== 'compare') throw new UsageError('--report belongs to the comparison');
  return { mode, ...flags };
}

/**
 * What is wrong with the file itself, as sentences. The file is the policy, so
 * a malformed one is refused before anything is compared with it.
 */
export function problemsWithFile(stated) {
  const problems = [];
  if (!Array.isArray(stated)) return [`${FILE} must be an array of milestones, first is next.`];
  const titles = new Set();
  stated.forEach((entry, at) => {
    const where = `Entry ${at + 1}`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where} is not an object.`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!KEYS.includes(key)) problems.push(`${where} has a "${key}" field; a milestone has ${KEYS.join(', ')} and no date.`);
    }
    if (typeof entry.title !== 'string' || entry.title.trim() === '') problems.push(`${where} has no title.`);
    else {
      if (entry.title.length > TITLE_MAX) problems.push(`${where} has a title of ${entry.title.length} characters; the limit is ${TITLE_MAX}.`);
      if (titles.has(entry.title)) problems.push(`The title "${entry.title}" is used twice.`);
      titles.add(entry.title);
    }
    if (typeof entry.description !== 'string' || entry.description.trim() === '') problems.push(`${where} has no description.`);
    else if (entry.description.length > DESCRIPTION_MAX) {
      problems.push(`${where} has a description of ${entry.description.length} characters; the limit is ${DESCRIPTION_MAX}.`);
    }
    if (!Array.isArray(entry.issues) || !entry.issues.every((number) => Number.isInteger(number) && number > 0)) {
      problems.push(`${where} must list its issues as positive whole numbers.`);
    }
  });
  return problems;
}

/**
 * Every JSON value in text that `gh api --paginate` printed: one page after
 * another, each an array, with nothing between them. Read by scanning for the
 * end of each page and not by splitting on `][`, which a title may contain.
 */
export function parsePages(text) {
  const items = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"' && depth > 0) inString = true;
    else if (char === '[' || char === '{') {
      if (depth === 0) start = at;
      depth += 1;
    } else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        const value = JSON.parse(text.slice(start, at + 1));
        if (Array.isArray(value)) items.push(...value);
        else items.push(value);
      }
    }
  }
  if (depth !== 0 || inString) throw new Error('what GitHub answered ends in the middle of a page');
  return items;
}

/** The milestones GitHub reports, as far as this script reads them. */
export function readMilestones(answers) {
  return answers.map((m) => ({
    number: m.number,
    title: m.title,
    description: m.description ?? '',
    dueOn: m.due_on ?? null,
  }));
}

/** The issues GitHub reports: number, label names, milestone title, and whether it is a pull request. */
export function readIssues(answers) {
  return answers.map((i) => ({
    number: i.number,
    labels: (i.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
    milestone: i.milestone?.title ?? null,
    pullRequest: i.pull_request !== undefined && i.pull_request !== null,
  }));
}

const quote = (text) => `"${text}"`;

/**
 * Where GitHub is not what the file states, as sentences, and what is only on
 * GitHub. `live` is `{ milestones, issues }` as `readMilestones` and
 * `readIssues` return them.
 */
export function compare(stated, live) {
  const differences = [];
  const leftAlone = [];
  const onGitHub = new Map(live.milestones.map((m) => [m.title, m]));
  const open = new Map(live.issues.filter((issue) => !issue.pullRequest).map((issue) => [issue.number, issue]));

  const homes = new Map();
  for (const entry of stated) {
    for (const number of entry.issues) homes.set(number, [...(homes.get(number) ?? []), entry.title]);
  }
  for (const [number, titles] of [...homes].sort((a, b) => a[0] - b[0])) {
    if (titles.length > 1) differences.push(`Issue #${number} is in ${titles.length} milestones in the file: ${titles.map(quote).join(' and ')}.`);
  }

  for (const entry of stated) {
    const there = onGitHub.get(entry.title);
    if (there === undefined) {
      differences.push(`The milestone ${quote(entry.title)} is in the file and GitHub lacks it.`);
      continue;
    }
    if (there.description !== entry.description) {
      differences.push(`The description of the milestone ${quote(entry.title)} differs. File: ${quote(entry.description)} GitHub: ${quote(there.description)}`);
    }
    if (there.dueOn !== null) {
      differences.push(`The milestone ${quote(entry.title)} has a due date on GitHub, ${there.dueOn}, and the file allows none.`);
    }
  }

  // An issue cannot be in a milestone GitHub lacks, and saying so for each of
  // its issues would repeat the sentence above it once per issue.
  for (const entry of stated) {
    if (!onGitHub.has(entry.title)) continue;
    for (const number of entry.issues) {
      const issue = open.get(number);
      if (issue === undefined || issue.milestone === entry.title) continue;
      if (homes.get(number).length > 1) continue;
      const found = issue.milestone === null ? 'in none on GitHub' : `in ${quote(issue.milestone)} on GitHub`;
      differences.push(`Issue #${number} is in the milestone ${quote(entry.title)} in the file and ${found}.`);
    }
  }

  const planned = new Set(homes.keys());
  for (const issue of [...open.values()].sort((a, b) => a.number - b.number)) {
    const states = ['accepted', 'blocked'].filter((label) => issue.labels.includes(label));
    if (states.length > 0 && !planned.has(issue.number)) {
      differences.push(`Issue #${issue.number} is labelled ${states.join(' and ')} and the file puts it in no milestone.`);
    }
  }

  const stateTitles = new Set(stated.map((entry) => entry.title));
  for (const m of live.milestones) {
    if (!stateTitles.has(m.title)) leftAlone.push(`The milestone ${quote(m.title)} is only on GitHub, left alone.`);
  }
  return { differences, leftAlone };
}

/** The report a person reads, as lines. */
export function report({ differences, leftAlone }) {
  const lines = [];
  if (differences.length === 0) lines.push(`GitHub has the milestones ${FILE} states.`);
  else {
    lines.push(`GitHub does not have the milestones ${FILE} states. ${differences.length} difference(s):`, '');
    for (const sentence of differences) lines.push(`  ${sentence}`);
  }
  if (leftAlone.length > 0) lines.push('', ...leftAlone.map((sentence) => `  ${sentence}`));
  return lines;
}

/**
 * What `apply --yes` would do, in the order it does it: the milestones first,
 * so an issue can be put in one that did not exist a moment before. An issue
 * the file puts in two milestones is not placed in either.
 */
export function plan(stated, live) {
  const actions = [];
  const onGitHub = new Map(live.milestones.map((m) => [m.title, m]));
  const open = new Map(live.issues.filter((issue) => !issue.pullRequest).map((issue) => [issue.number, issue]));
  const count = new Map();
  for (const entry of stated) for (const number of entry.issues) count.set(number, (count.get(number) ?? 0) + 1);
  for (const entry of stated) {
    const there = onGitHub.get(entry.title);
    if (there === undefined) actions.push({ kind: 'create', title: entry.title, description: entry.description });
    else if (there.description !== entry.description) {
      actions.push({ kind: 'describe', title: entry.title, number: there.number, description: entry.description });
    }
  }
  for (const entry of stated) {
    for (const number of entry.issues) {
      const issue = open.get(number);
      if (issue !== undefined && issue.milestone !== entry.title && count.get(number) === 1) {
        actions.push({ kind: 'assign', issue: number, title: entry.title });
      }
    }
  }
  return actions;
}

/** One action as a sentence. */
export function describeAction(action) {
  if (action.kind === 'create') return `Create the milestone ${quote(action.title)}.`;
  if (action.kind === 'describe') return `Correct the description of the milestone ${quote(action.title)}.`;
  return `Put issue #${action.issue} in the milestone ${quote(action.title)}.`;
}

/** The address of the issue list narrowed to one milestone. */
export function milestoneUrl(title) {
  // encodeURIComponent leaves these alone, and a parenthesis would end a
  // Markdown link early.
  const encoded = encodeURIComponent(title)
    .replaceAll(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll('%20', '+');
  return `${SITE}/issues?q=is%3Aissue+milestone%3A%22${encoded}%22`;
}

/**
 * The ordered list ROADMAP.md carries, from the file alone and with no
 * network: each milestone's position, its title linking the live milestone, its
 * description, and its issues as links.
 */
export function milestoneList(stated) {
  const items = stated.map((entry, at) => {
    const title = entry.title.replaceAll(/[\\[\]]/g, (char) => `\\${char}`);
    const issues = entry.issues.map((number) => `[#${number}](${SITE}/issues/${number})`).join(', ');
    return `${at + 1}. **[${title}](${milestoneUrl(entry.title)})**. ${entry.description} Issues: ${issues}.`;
  });
  return [START, ...items, END].join('\n');
}

/** `markdown` with the list between its two markers replaced. Throws when a marker is missing. */
export function withMilestones(markdown, list) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('ROADMAP.md has lost the milestone markers this list is written between');
  }
  return markdown.slice(0, start) + list + markdown.slice(end + END.length);
}

function gh(args, input) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** What GitHub has now: every milestone, and every open issue. */
function readGitHub(name) {
  try {
    const milestones = readMilestones(parsePages(gh(['api', '--paginate', `repos/${name}/milestones?state=all&per_page=100`])));
    const issues = readIssues(parsePages(gh(['api', '--paginate', `repos/${name}/issues?state=open&per_page=100`])));
    return { milestones, issues };
  } catch (error) {
    throw new Error(`GitHub could not be read, so nothing was compared:\n  ${String(error.stderr ?? error.message).trim()}`);
  }
}

function loadFile() {
  const stated = JSON.parse(readFileSync(join(ROOT, FILE), 'utf8'));
  const problems = problemsWithFile(stated);
  if (problems.length > 0) throw new Error(`${FILE} is not usable:\n  ${problems.join('\n  ')}`);
  return stated;
}

/** Makes each change, in order. Returns what GitHub said about a created milestone. */
function execute(name, actions, live) {
  const numbers = new Map(live.milestones.map((m) => [m.title, m.number]));
  const send = (method, path, body) => gh(['api', '--method', method, `repos/${name}/${path}`, '--input', '-'], JSON.stringify(body));
  for (const action of actions) {
    if (action.kind === 'create') {
      const made = JSON.parse(send('POST', 'milestones', { title: action.title, description: action.description }));
      numbers.set(action.title, made.number);
    } else if (action.kind === 'describe') {
      send('PATCH', `milestones/${action.number}`, { description: action.description });
    } else {
      send('PATCH', `issues/${action.issue}`, { milestone: numbers.get(action.title) });
    }
    console.log(`  done: ${describeAction(action)}`);
  }
}

function roadmap(args) {
  const path = join(ROOT, 'ROADMAP.md');
  const current = readFileSync(path, 'utf8');
  const next = withMilestones(current, milestoneList(loadFile()));
  if (args.check) {
    if (next !== current) {
      console.error(`ROADMAP.md's ordered list is not what ${FILE} says.\n\nRun: node scripts/milestones.mjs roadmap`);
      return 1;
    }
    console.log(`ROADMAP.md lists the milestones ${FILE} states.`);
    return 0;
  }
  writeFileSync(path, next);
  console.log('wrote the ordered list into ROADMAP.md');
  return 0;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.mode === 'roadmap') return roadmap(args);

  const stated = loadFile();
  const name = repositoryName(args.repo === undefined ? [] : ['--repo', args.repo]);
  const live = readGitHub(name);
  const found = compare(stated, live);
  for (const line of report(found)) console.log(line);
  const differing = found.differences.length;

  if (args.mode === 'compare') return differing > 0 && !args.report ? 1 : 0;

  const actions = plan(stated, live);
  if (actions.length === 0) {
    if (differing > 0) console.log('\nNothing for apply to change: what is left is for a person to fix.');
    return differing > 0 ? 1 : 0;
  }
  if (stated.flatMap((entry) => entry.issues).length !== new Set(stated.flatMap((entry) => entry.issues)).size) {
    console.log('\nNothing was changed. The file puts an issue in two milestones; fix the file first.');
    return 1;
  }
  console.log('\nWould change:');
  for (const action of actions) console.log(`  ${describeAction(action)}`);
  if (!args.yes) {
    console.log(`\nNothing was changed. To change ${name} so that it has the milestones the file states: npm run milestones -- apply --yes`);
    return 1;
  }
  try {
    console.log('\nChanging:');
    execute(name, actions, live);
  } catch (error) {
    const said = String(error.stderr ?? error.message).trim();
    console.error(`\nGitHub refused a change, and some before it may have been made:\n  ${said}\nWriting milestones needs a token with issues: write on ${name}. Run apply --yes again to finish.`);
    return 1;
  }
  console.log('\nRead again, after the change:\n');
  const after = compare(stated, readGitHub(name));
  for (const line of report(after)) console.log(line);
  return after.differences.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`milestones: ${error.message}\n${USAGE}`);
      process.exit(2);
    }
    console.error(`milestones: ${String(error.stderr ?? error.message).trim()}`);
    process.exit(2);
  }
}
