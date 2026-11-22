#!/usr/bin/env node
/**
 * Is every finding Codacy lists on `main` one this repository has answered?
 *
 *   npm run codacy                    compare; exit 1 when a finding is not accounted for
 *   npm run codacy -- apply           say what would change in Codacy; change nothing
 *   npm run codacy -- apply --yes     change it, then compare again
 *
 * `.github/codacy.json` is the answer, written where a pull request can change
 * it and a reviewer can read it, which is the lesson `scripts/ruleset.mjs` and
 * `scripts/milestones.mjs` were written from. A finding is accounted for in
 * one of four ways:
 *
 * - its file is one `.codacy.yaml` leaves out (the tests, and what a script
 *   writes): Codacy stops listing it the next time it reads the code;
 * - its tool is one the file switches off, with why;
 * - its pattern is one the file switches off, with why;
 * - it is dismissed in the file: by pattern and file, never by Codacy's id or
 *   a line number, which move with every edit, and with how many the file
 *   expects, a reason from Codacy's own list and a sentence a reader can check
 *   against the code.
 *
 * Anything else is printed and fails the comparison: it has to be read before
 * anybody answers it. So does a file holding more findings of a dismissed kind
 * than the file expects, because the newest of them was never read, and none
 * of that kind is dismissed until somebody has. Findings that were fixed are
 * not in the file at all: they are gone from the code.
 *
 * Reading needs no token: Codacy answers the findings and the tool list of a
 * public repository to anybody. Pattern settings are not shown without one,
 * so the comparison does not say whether a pattern the file switches off is
 * off; `apply` sends that setting every time. Writing needs an account token
 * of somebody who administers the repository in Codacy, in the environment
 * variable `CODACY_ACCOUNT_TOKEN`, and happens only with `apply --yes`. The
 * token is sent in a header, never in an address, and never printed: what
 * Codacy answers is printed with any copy of it taken out.
 *
 * The network and the clock are parameters of `main`, so the tests run the
 * whole script against a stand-in for Codacy.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The answer, as a file a pull request can change and a reviewer can read. */
export const FILE = '.github/codacy.json';
/** Where Codacy is told which paths to leave out. */
export const PATHS_FILE = '.codacy.yaml';
/** The environment variable `apply --yes` reads the token from. */
export const TOKEN_VARIABLE = 'CODACY_ACCOUNT_TOKEN';
/** Codacy's own reasons for dismissing a finding, as its API names them. */
export const REASONS = ['AcceptedUse', 'FalsePositive', 'NotExploitable', 'TestCode', 'ExternalCode'];
/** At most this many findings are dismissed in one request: Codacy's own limit. */
export const BATCH = 100;
/** Pages of findings read at most, a hundred each. A guard against a cursor that never ends, far above the 914 of 2026-11-18. */
export const MAX_PAGES = 200;

export const API = 'https://app.codacy.com/api/v3';
export const REPOSITORY = { provider: 'gh', organization: 'TrazumAPP', name: 'Trazum' };

/** The keys each part of the file may have. Anything else is refused: a key the script does not read is a decision nobody applies. */
export const KEYS = {
  top: ['tools', 'patterns', 'dismissed'],
  tool: ['name', 'uuid', 'why'],
  pattern: ['id', 'tool', 'why'],
  dismissed: ['pattern', 'file', 'count', 'reason', 'why'],
};

export const USAGE = [
  'usage: node scripts/codacy.mjs',
  '       node scripts/codacy.mjs apply [--yes]',
  `  apply --yes reads an account token from ${TOKEN_VARIABLE}.`,
].join('\n');

/** A command line that is not one of the forms above. */
export class UsageError extends Error {}

export function parseArgs(argv) {
  let mode = 'compare';
  let yes = false;
  for (const arg of argv) {
    if (arg === 'apply' && mode === 'compare') mode = 'apply';
    else if (arg === '--yes') yes = true;
    else throw new UsageError(`unknown argument: ${arg}`);
  }
  if (yes && mode !== 'apply') throw new UsageError('--yes belongs to apply');
  return { mode, yes };
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What is wrong with the file itself, as sentences. A malformed answer is refused before anything is compared with it. */
export function problemsWithFile(stated) {
  const problems = [];
  if (stated === null || typeof stated !== 'object' || Array.isArray(stated)) return [`${FILE} must be an object with ${KEYS.top.join(', ')}.`];
  const unknown = (where, entry, keys) => {
    for (const key of Object.keys(entry)) if (!keys.includes(key)) problems.push(`${where} has a "${key}" field, which this script does not read; it has ${keys.join(', ')}.`);
  };
  unknown('The file', stated, KEYS.top);
  for (const key of KEYS.top) if (!Array.isArray(stated[key])) problems.push(`"${key}" must be a list.`);
  if (problems.length > 0) return problems;
  const entries = (list, label, keys, check) =>
    list.forEach((entry, at) => {
      const where = `${label} ${at + 1}`;
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        problems.push(`${where} is not an object.`);
        return;
      }
      unknown(where, entry, keys);
      if (!isText(entry.why)) problems.push(`${where} does not say why.`);
      check(entry, where);
    });
  const toolNames = new Set();
  entries(stated.tools, 'Tool', KEYS.tool, (entry, where) => {
    if (!isText(entry.name)) problems.push(`${where} has no name.`);
    if (typeof entry.uuid !== 'string' || !UUID.test(entry.uuid)) problems.push(`${where} has no uuid in Codacy's form.`);
    if (toolNames.has(entry.uuid)) problems.push(`${where} is the tool ${entry.name} a second time.`);
    toolNames.add(entry.uuid);
  });
  const patternIds = new Set();
  entries(stated.patterns, 'Pattern', KEYS.pattern, (entry, where) => {
    if (!isText(entry.id)) problems.push(`${where} has no id.`);
    if (typeof entry.tool !== 'string' || !UUID.test(entry.tool)) problems.push(`${where} does not name its tool's uuid.`);
    if (patternIds.has(entry.id)) problems.push(`${where} is the pattern ${entry.id} a second time.`);
    patternIds.add(entry.id);
  });
  const dismissals = new Set();
  entries(stated.dismissed, 'Dismissal', KEYS.dismissed, (entry, where) => {
    if (!isText(entry.pattern)) problems.push(`${where} has no pattern.`);
    if (!isText(entry.file) || entry.file.includes('*')) problems.push(`${where} must name one file, not a pattern of them.`);
    if (!Number.isInteger(entry.count) || entry.count < 1) problems.push(`${where} must say how many findings it expects, a whole number from 1.`);
    if (!REASONS.includes(entry.reason)) problems.push(`${where} has the reason "${entry.reason}"; Codacy's reasons are ${REASONS.join(', ')}.`);
    if (patternIds.has(entry.pattern)) problems.push(`${where} dismisses a pattern the file already switches off.`);
    const key = `${entry.pattern}\n${entry.file}`;
    if (dismissals.has(key)) problems.push(`${where} is the pattern ${entry.pattern} in ${entry.file} a second time.`);
    dismissals.add(key);
  });
  return problems;
}

/** The quoted paths under `exclude_paths:` in `.codacy.yaml`, which is all of it this script reads. */
export function excludedPaths(yaml) {
  const at = yaml.search(/^exclude_paths:\s*$/m);
  if (at === -1) return [];
  const paths = [];
  for (const line of yaml.slice(at).split('\n').slice(1)) {
    const found = /^\s+-\s+"([^"]+)"\s*$/.exec(line);
    if (found !== null) paths.push(found[1]);
    else if (line.trim() !== '' && !line.trim().startsWith('#')) break;
  }
  return paths;
}

/** A path pattern as Codacy reads one: `**` crosses directories, `*` and `?` do not. */
export function globToRegExp(glob) {
  let source = '';
  for (let at = 0; at < glob.length; at += 1) {
    const char = glob[at];
    if (char === '*' && glob[at + 1] === '*') {
      source += '.*';
      at += 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** The findings as Codacy lists them, as far as this script reads them. */
export function readFindings(rows) {
  return rows.map((row) => ({
    id: row.issueId,
    file: row.filePath,
    line: row.lineNumber,
    pattern: row.patternInfo?.id,
    tool: row.toolInfo?.uuid,
    toolName: row.toolInfo?.name,
  }));
}

/**
 * Each finding sorted into how the file accounts for it. `excluded` is the
 * list of `.codacy.yaml` paths; `tools` is what Codacy says of each tool, or
 * null when it was not read.
 */
export function compare(stated, findings, excluded, tools = null) {
  const leaveOut = excluded.map(globToRegExp);
  const toolsOff = new Map(stated.tools.map((tool) => [tool.uuid, tool]));
  const patternsOff = new Map(stated.patterns.map((pattern) => [pattern.id, pattern]));
  const byDismissal = new Map(stated.dismissed.map((entry) => [`${entry.pattern}\n${entry.file}`, { entry, found: [] }]));
  const sorted = { leftOut: [], toolOff: [], patternOff: [], dismissed: [], over: [], unaccounted: [] };
  for (const finding of findings) {
    if (leaveOut.some((pattern) => pattern.test(finding.file))) sorted.leftOut.push(finding);
    else if (toolsOff.has(finding.tool)) sorted.toolOff.push(finding);
    else if (patternsOff.has(finding.pattern)) sorted.patternOff.push(finding);
    else if (byDismissal.has(`${finding.pattern}\n${finding.file}`)) byDismissal.get(`${finding.pattern}\n${finding.file}`).found.push(finding);
    else sorted.unaccounted.push(finding);
  }
  for (const { entry, found } of byDismissal.values()) {
    if (found.length > entry.count) sorted.over.push({ entry, found });
    else sorted.dismissed.push(...found.map((finding) => ({ finding, entry })));
  }
  const settings = [];
  if (tools !== null) {
    for (const tool of stated.tools) {
      const live = tools.find((entry) => entry.uuid === tool.uuid);
      if (live === undefined) settings.push({ kind: 'tool-missing', tool });
      else if (live.settings?.isEnabled !== false) settings.push({ kind: 'tool-on', tool });
    }
  }
  return { ...sorted, settings, total: findings.length };
}

const count = (list, key) => {
  const counts = new Map();
  for (const item of list) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => `${name} ${n}`).join(', ');
};
const where = (finding) => `${finding.file}:${finding.line}  ${finding.pattern}`;

/** The report a person reads, as lines. */
export function report(found, { excluded, readOn }) {
  const lines = [`Codacy lists ${found.total} open finding(s) on main, read on ${readOn}.`, ''];
  lines.push(`  ${String(found.leftOut.length).padStart(4)}  in a path ${PATHS_FILE} leaves out (${excluded.join(', ')}); Codacy stops listing them when it next reads the code`);
  lines.push(`  ${String(found.toolOff.length).padStart(4)}  from a tool ${FILE} switches off${found.toolOff.length > 0 ? `: ${count(found.toolOff, (f) => f.toolName)}` : ''}`);
  lines.push(`  ${String(found.patternOff.length).padStart(4)}  from a pattern ${FILE} switches off${found.patternOff.length > 0 ? `: ${count(found.patternOff, (f) => f.pattern)}` : ''}`);
  lines.push(`  ${String(found.dismissed.length).padStart(4)}  dismissed in ${FILE}, by pattern and file, each with its reason`);
  const over = found.over.reduce((sum, { found: list }) => sum + list.length, 0);
  lines.push(`  ${String(found.unaccounted.length + over).padStart(4)}  not accounted for`);
  if (found.over.length > 0) {
    lines.push('', 'More findings of a dismissed kind than the file expects. The newest was never read, so none of these is dismissed until somebody has read them all:');
    for (const { entry, found: list } of found.over) {
      lines.push(`  ${entry.pattern} in ${entry.file}: ${list.length} open, the file expects ${entry.count}`);
      for (const finding of list) lines.push(`    line ${finding.line}`);
    }
  }
  if (found.unaccounted.length > 0) {
    lines.push('', 'Not accounted for. Read each in the code; then fix it, or add why to the file:');
    for (const finding of found.unaccounted) lines.push(`  ${where(finding)}`);
  }
  if (found.settings.length > 0) {
    lines.push('', `Settings in Codacy that are not what ${FILE} says. apply changes them:`);
    for (const setting of found.settings) {
      lines.push(setting.kind === 'tool-on' ? `  ${setting.tool.name} is on, and the file switches it off` : `  ${setting.tool.name} is not among the tools Codacy lists for the repository`);
    }
  }
  if (found.unaccounted.length + over === 0) lines.push('', `Every finding Codacy lists is accounted for by ${PATHS_FILE} or ${FILE}.`);
  return lines;
}

/**
 * What `apply --yes` would send, in order: the tools, then the patterns, one
 * request per tool, then the dismissals, a hundred at most to a request and
 * one reason and one comment to each. A kind with more findings than the file
 * expects is not dismissed at all.
 */
export function plan(stated, found) {
  const actions = [];
  for (const tool of stated.tools) actions.push({ kind: 'tool', uuid: tool.uuid, name: tool.name, body: { enabled: false } });
  const byTool = new Map();
  for (const pattern of stated.patterns) byTool.set(pattern.tool, [...(byTool.get(pattern.tool) ?? []), pattern.id]);
  for (const [uuid, ids] of byTool) actions.push({ kind: 'patterns', uuid, ids, body: { patterns: ids.map((id) => ({ id, enabled: false })) } });
  const groups = new Map();
  for (const { finding, entry } of found.dismissed) {
    const key = `${entry.pattern}\n${entry.file}`;
    const group = groups.get(key) ?? { entry, ids: [] };
    group.ids.push(finding.id);
    groups.set(key, group);
  }
  for (const { entry, ids } of groups.values()) {
    for (let at = 0; at < ids.length; at += BATCH) {
      actions.push({
        kind: 'dismiss',
        pattern: entry.pattern,
        file: entry.file,
        body: { issueIds: ids.slice(at, at + BATCH), reason: entry.reason, comment: `${entry.why} (${FILE})` },
      });
    }
  }
  return actions;
}

/** One action as a sentence. */
export function describeAction(action) {
  if (action.kind === 'tool') return `Switch off the tool ${action.name}.`;
  if (action.kind === 'patterns') return `Switch off ${action.ids.length} pattern(s) of the tool ${action.uuid}: ${action.ids.join(', ')}.`;
  return `Dismiss ${action.body.issueIds.length} finding(s) of ${action.pattern} in ${action.file} as ${action.body.reason}.`;
}

const base = () => `${API}/analysis/organizations/${REPOSITORY.provider}/${REPOSITORY.organization}/repositories/${REPOSITORY.name}`;

/** `text` with every copy of the token taken out, so nothing Codacy echoes can print it. */
export function scrub(text, token) {
  const said = String(text);
  return token === undefined || token === '' ? said : said.split(token).join('[token]');
}

/** One request to Codacy. The token, when there is one, goes in the `api-token` header and nowhere else. */
async function ask(fetch, method, path, { body, token } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token !== undefined) headers['api-token'] = token;
  const response = await fetch(`${base()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Codacy answered ${response.status} to ${method} ${path}: ${scrub(text.slice(0, 500), token)}`);
  return text === '' ? null : JSON.parse(text);
}

/** Every open finding, a page at a time. */
export async function readAll(fetch) {
  const rows = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = `?limit=100${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
    const answer = await ask(fetch, 'POST', `/issues/search${query}`, { body: {} });
    rows.push(...(answer?.data ?? []));
    cursor = answer?.pagination?.cursor;
    if (typeof cursor !== 'string' || cursor === '') return readFindings(rows);
  }
  throw new Error(`Codacy was still answering after ${MAX_PAGES} pages, so nothing was compared`);
}

function loadFiles(root) {
  const stated = JSON.parse(readFileSync(join(root, FILE), 'utf8'));
  const problems = problemsWithFile(stated);
  if (problems.length > 0) throw new Error(`${FILE} is not usable:\n  ${problems.join('\n  ')}`);
  return { stated, excluded: excludedPaths(readFileSync(join(root, PATHS_FILE), 'utf8')) };
}

/** The whole script. Returns its exit code; `fetch`, `env`, `now` and `log` are what it would otherwise take from the process. */
export async function main(argv, { fetch = globalThis.fetch, env = process.env, now = () => new Date(), log = console.log, error = console.error, root = ROOT } = {}) {
  const args = parseArgs(argv);
  const { stated, excluded } = loadFiles(root);
  const token = env[TOKEN_VARIABLE];
  if (args.yes && (token === undefined || token === '')) {
    error(`apply --yes changes Codacy and needs an account token in ${TOKEN_VARIABLE}. Nothing was read and nothing was changed.`);
    return 2;
  }
  const readOn = now().toISOString().slice(0, 10);
  const compareNow = async () => {
    const [findings, tools] = await Promise.all([readAll(fetch), ask(fetch, 'GET', '/tools')]);
    return compare(stated, findings, excluded, tools?.data ?? []);
  };
  let found;
  try {
    found = await compareNow();
  } catch (failure) {
    error(`Codacy could not be read, so nothing was compared:\n  ${scrub(failure.message, token)}`);
    return 2;
  }
  for (const line of report(found, { excluded, readOn })) log(line);
  const open = found.unaccounted.length + found.over.length;
  if (args.mode === 'compare') return open > 0 ? 1 : 0;

  const actions = plan(stated, found);
  log('', 'Would change:');
  for (const action of actions) log(`  ${describeAction(action)}`);
  if (!args.yes) {
    log('', `Nothing was changed. To change Codacy so that it does what ${FILE} says: npm run codacy -- apply --yes, with an account token in ${TOKEN_VARIABLE}.`);
    return open > 0 ? 1 : 0;
  }
  log('', 'Changing:');
  try {
    for (const action of actions) {
      if (action.kind === 'dismiss') await ask(fetch, 'POST', '/issues/bulk-ignore', { body: action.body, token });
      else await ask(fetch, 'PATCH', `/tools/${action.uuid}`, { body: action.body, token });
      log(`  done: ${describeAction(action)}`);
    }
  } catch (failure) {
    error(`\nCodacy refused a change, and some before it may have been made:\n  ${scrub(failure.message, token)}\nRun apply --yes again to finish.`);
    return 1;
  }
  log('', 'Read again, after the change:', '');
  try {
    found = await compareNow();
  } catch (failure) {
    error(`Codacy could not be read again:\n  ${scrub(failure.message, token)}`);
    return 2;
  }
  for (const line of report(found, { excluded, readOn: now().toISOString().slice(0, 10) })) log(line);
  return found.unaccounted.length + found.over.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (failure) => {
      if (failure instanceof UsageError) console.error(`codacy: ${failure.message}\n${USAGE}`);
      else console.error(`codacy: ${scrub(failure.message, process.env[TOKEN_VARIABLE])}`);
      process.exit(2);
    },
  );
}
