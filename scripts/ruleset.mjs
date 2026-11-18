#!/usr/bin/env node
/**
 * Is the branch ruleset GitHub enforces the one this repository states?
 *
 *   npm run ruleset                    compare; exit 1 when they differ
 *   npm run ruleset -- --report        compare; exit 0 whatever it finds
 *   npm run ruleset -- apply           say what would change; change nothing
 *   npm run ruleset -- apply --yes     change it, then compare again
 *
 * `.github/rulesets/main-branch.json` is the policy. GitHub enforces a copy
 * that an admin imports, and until this script nothing compared the two: on
 * 2026-11-18 the copy lacked a required check the file had carried for weeks
 * and allowed a merge method the file did not.
 *
 * Reading goes through `gh api` and needs no more than a token that can read
 * the repository. Writing needs an admin's own token, in the admin's own
 * `gh`, and happens only with `apply --yes`. The scheduled workflow never
 * passes that flag and its token could not write if it did.
 *
 * Two things are compared.
 *
 * The ruleset, rule by rule. The file is held exactly for everything it
 * states. A parameter GitHub reports and the file does not state is printed
 * and left alone, on reading and on writing: GitHub adds parameters with
 * defaults of its own, and a file that had to restate each of them would fail
 * every time it did. A whole rule GitHub enforces and the file does not state
 * is a difference, because a rule is a decision somebody made.
 *
 * The repository's settings the ruleset or the documents lean on (`SETTINGS`,
 * each with why): the merge settings the ruleset needs, and `has_discussions`,
 * which three pages send questions to. GitHub does not show these to every
 * token, nor who may bypass the ruleset. A run that is not shown one says "not
 * read" for it. Not read is not fine, and it is not a failure either: a run
 * cannot fail on what it is not shown. Measured on 2026-11-18, the workflow's
 * token is shown the rules and `web_commit_signoff_required`, and is not shown
 * `bypass_actors` nor the four `allow_*` settings. Whether it is shown
 * `has_discussions` was not measured.
 *
 *   node scripts/ruleset.mjs --ruleset live.json --repository repo.json
 *
 * compares against files instead of asking GitHub, which is how the tests
 * run it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The policy, as a file a pull request can change and a reviewer can read. */
export const FILE = '.github/rulesets/main-branch.json';

/** What of a ruleset is compared besides its rules. */
export const TOP = ['name', 'target', 'enforcement', 'conditions', 'bypass_actors'];

/**
 * What GitHub leaves out of its answer for a token that does not administer
 * the repository. Measured on 2026-11-18: the workflow's token got a ruleset
 * with no `bypass_actors` at all, where an admin's got `[]`. Left out is not
 * read, which is different from empty, so it is not compared. Only what was
 * measured is here: any other field that goes missing is a difference.
 */
export const ADMIN_ONLY = ['bypass_actors'];

/**
 * The repository settings the ruleset leans on, each with the value it needs
 * and why. Nothing else on the settings page is this script's business.
 */
export const SETTINGS = [
  { key: 'allow_squash_merge', want: true, why: 'The ruleset allows squash merges and nothing else. With this off, nothing could merge.' },
  { key: 'allow_merge_commit', want: false, why: 'The ruleset requires linear history, so a merge commit is refused at the last step. Offering the button offers an error.' },
  { key: 'allow_rebase_merge', want: false, why: 'The ruleset allows squash merges and nothing else. A button the ruleset refuses is the same error.' },
  { key: 'allow_update_branch', want: true, why: 'The ruleset requires a branch to be current with main before it merges. This is the button that makes it current.' },
  { key: 'web_commit_signoff_required', want: true, why: 'Every commit must carry Signed-off-by, and the dco workflow checks it. A commit made in the browser carries it only with this on.' },
  { key: 'has_discussions', want: true, why: 'README.md, SUPPORT.md and the issue forms send questions to Discussions, and the three discussion forms live there. Switched off, those links point nowhere.' },
];

/** A value in one order, so two spellings of the same list compare equal. */
export function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const show = (value) => (value === undefined ? 'nothing' : JSON.stringify(canonical(value)));

/**
 * One difference. When both sides are lists it also says which entries only
 * one side has: six required checks against five is read as "this one is
 * missing", not by comparing two long lines by eye.
 */
function difference(where, stated, live, why) {
  const found = { where, stated: show(stated), live: show(live) };
  if (Array.isArray(stated) && Array.isArray(live)) {
    const texts = (list) => list.map((entry) => JSON.stringify(canonical(entry)));
    const [mine, theirs] = [texts(stated), texts(live)];
    found.onlyStated = mine.filter((entry) => !theirs.includes(entry)).sort();
    found.onlyLive = theirs.filter((entry) => !mine.includes(entry)).sort();
  }
  if (why !== undefined) found.why = why;
  return found;
}

/**
 * Where the live ruleset is not what the file states, what the file is
 * silent about, and what this token was not shown. `live` is null when GitHub
 * has no ruleset of that name.
 */
export function compare(stated, live) {
  const differences = [];
  const unstated = [];
  const notRead = [];
  if (live === null || live === undefined) {
    differences.push({ where: 'the ruleset', stated: `a ruleset named "${stated.name}"`, live: 'none of that name' });
    return { differences, unstated, notRead };
  }
  for (const key of TOP) {
    if (ADMIN_ONLY.includes(key) && !(key in live)) notRead.push(key);
    else if (!same(stated[key], live[key])) differences.push(difference(key, stated[key], live[key]));
  }
  const liveRules = new Map((live.rules ?? []).map((rule) => [rule.type, rule]));
  const statedTypes = new Set(stated.rules.map((rule) => rule.type));
  for (const rule of stated.rules) {
    const other = liveRules.get(rule.type);
    if (other === undefined) {
      differences.push({ where: `rule ${rule.type}`, stated: 'enforced', live: 'not enforced' });
      continue;
    }
    const mine = rule.parameters ?? {};
    const theirs = other.parameters ?? {};
    for (const key of Object.keys(mine)) {
      if (!same(mine[key], theirs[key])) differences.push(difference(`rule ${rule.type}, ${key}`, mine[key], theirs[key]));
    }
    for (const key of Object.keys(theirs)) {
      if (!(key in mine)) unstated.push({ where: `rule ${rule.type}, ${key}`, live: show(theirs[key]) });
    }
  }
  for (const type of liveRules.keys()) {
    if (!statedTypes.has(type)) differences.push({ where: `rule ${type}`, stated: 'not stated', live: 'enforced' });
  }
  return { differences, unstated, notRead };
}

/**
 * The settings that are not what the ruleset needs, and the ones this token
 * was not shown. `repository` is what `GET /repos/{owner}/{repo}` answered.
 */
export function compareSettings(repository) {
  const differences = [];
  const notRead = [];
  for (const setting of SETTINGS) {
    if (!(setting.key in repository)) notRead.push(setting.key);
    else if (repository[setting.key] !== setting.want) {
      differences.push(difference(`setting ${setting.key}`, setting.want, repository[setting.key], setting.why));
    }
  }
  return { differences, notRead };
}

/**
 * What is sent to GitHub to make the live ruleset the stated one: everything
 * the file states, and for each rule the parameters the file is silent about
 * as GitHub has them now. So applying changes what the file states and
 * nothing else.
 */
export function body(stated, live) {
  const liveRules = new Map((live?.rules ?? []).map((rule) => [rule.type, rule]));
  const rules = stated.rules.map((rule) => {
    const theirs = liveRules.get(rule.type)?.parameters;
    if (rule.parameters === undefined) return { type: rule.type };
    return { type: rule.type, parameters: { ...(theirs ?? {}), ...rule.parameters } };
  });
  return { ...Object.fromEntries(TOP.map((key) => [key, stated[key]])), rules };
}

/** The settings to send: only the ones that are wrong. */
export function settingsBody(repository) {
  return Object.fromEntries(SETTINGS.filter((setting) => setting.key in repository && repository[setting.key] !== setting.want).map((setting) => [setting.key, setting.want]));
}

/** The report a person reads, as lines. */
export function report({ ruleset, settings }) {
  const lines = [];
  const all = [...ruleset.differences, ...settings.differences];
  if (all.length === 0) lines.push(`GitHub enforces what ${FILE} states.`);
  else {
    lines.push(`GitHub does not enforce what ${FILE} states. ${all.length} difference(s):`, '');
    for (const entry of all) {
      lines.push(`  ${entry.where}`);
      lines.push(`    stated:  ${entry.stated}`);
      lines.push(`    GitHub:  ${entry.live}`);
      for (const only of entry.onlyStated ?? []) lines.push(`    only in the file:  ${only}`);
      for (const only of entry.onlyLive ?? []) lines.push(`    only on GitHub:    ${only}`);
      if (entry.why !== undefined) lines.push(`    why:     ${entry.why}`);
    }
  }
  if (ruleset.unstated.length > 0) {
    lines.push('', 'Set on GitHub and not stated in the file. Printed, not judged, and left as they are:');
    for (const silent of ruleset.unstated) lines.push(`  ${silent.where}: ${silent.live}`);
  }
  const notRead = [...ruleset.notRead, ...settings.notRead];
  if (notRead.length > 0) {
    lines.push('', `Not read: ${notRead.join(', ')}. GitHub did not show them to the token this ran with. Not read is not fine: an admin reads them with \`npm run ruleset\`.`);
  }
  return lines;
}

function gh(args, input) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

/** The repository asked about: the flag, then the runner's, then package.json's. */
export function repositoryName(argv) {
  const flag = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : undefined;
  // Parsed as a URL and compared as a host: a pattern that finds "github.com"
  // somewhere in a string also finds it in "github.com.example.org".
  const url = new URL(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).repository.url.replace(/^git\+/, ''));
  const fromPackage = url.hostname === 'github.com' ? url.pathname.replace(/^\//, '').replace(/\.git$/, '') : undefined;
  const name = flag ?? process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? fromPackage;
  if (name === undefined || !/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error(`no repository to ask about: pass --repo owner/name (got ${name})`);
  return name;
}

function read(argv, stated) {
  const file = (flag) => (argv.includes(flag) ? JSON.parse(readFileSync(argv[argv.indexOf(flag) + 1], 'utf8')) : undefined);
  const fromFiles = { live: file('--ruleset'), repository: file('--repository') };
  if (fromFiles.live !== undefined || fromFiles.repository !== undefined) {
    return { name: null, live: fromFiles.live ?? null, repository: fromFiles.repository ?? {} };
  }
  const name = repositoryName(argv);
  const listed = JSON.parse(gh(['api', `repos/${name}/rulesets`])).find((entry) => entry.name === stated.name);
  const live = listed === undefined ? null : JSON.parse(gh(['api', `repos/${name}/rulesets/${listed.id}`]));
  const repository = JSON.parse(gh(['api', `repos/${name}`]));
  return { name, live, repository };
}

function main(argv) {
  const stated = JSON.parse(readFileSync(join(ROOT, FILE), 'utf8'));
  const apply = argv[0] === 'apply';
  const { name, live, repository } = read(argv, stated);
  const found = { ruleset: compare(stated, live), settings: compareSettings(repository) };
  for (const line of report(found)) console.log(line);
  const differing = found.ruleset.differences.length + found.settings.differences.length;

  if (!apply) return differing > 0 && !argv.includes('--report') ? 1 : 0;
  if (differing === 0) return 0;
  if (name === null) throw new Error('apply talks to GitHub: it cannot be given --ruleset or --repository files');
  if (!argv.includes('--yes')) {
    console.log(`\nNothing was changed. To change ${name} so that it enforces the file: npm run ruleset -- apply --yes`);
    return 1;
  }
  try {
    if (found.ruleset.differences.length > 0) {
      const send = JSON.stringify(body(stated, live));
      if (live === null) gh(['api', '--method', 'POST', `repos/${name}/rulesets`, '--input', '-'], send);
      else gh(['api', '--method', 'PUT', `repos/${name}/rulesets/${live.id}`, '--input', '-'], send);
      console.log(`\nRuleset "${stated.name}" written.`);
    }
    if (found.settings.differences.length > 0) {
      gh(['api', '--method', 'PATCH', `repos/${name}`, '--input', '-'], JSON.stringify(settingsBody(repository)));
      console.log('Repository settings written.');
    }
  } catch (error) {
    const said = String(error.stderr ?? error.message).trim();
    console.error(`\nGitHub refused the change, and what it refused is unchanged:\n  ${said}\nWriting a ruleset needs an admin of ${name}, signed in to gh with their own token: gh auth status`);
    return 1;
  }
  console.log('\nRead again, after the change:\n');
  const again = read(argv, stated);
  const after = { ruleset: compare(stated, again.live), settings: compareSettings(again.repository) };
  for (const line of report(after)) console.log(line);
  return after.ruleset.differences.length + after.settings.differences.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`ruleset: ${String(error.stderr ?? error.message).trim()}`);
    process.exit(2);
  }
}
