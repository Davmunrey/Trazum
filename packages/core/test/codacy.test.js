import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sectionOf } from '../../../test-utils/section.mjs';

import {
  BATCH,
  FILE,
  KEYS,
  PATHS_FILE,
  REASONS,
  TOKEN_VARIABLE,
  compare,
  excludedPaths,
  globToRegExp,
  main,
  parseArgs,
  plan,
  problemsWithFile,
  readFindings,
  report,
  scrub,
} from '../../../scripts/codacy.mjs';

/**
 * Codacy's findings, held to the answer this repository writes for them.
 *
 * `.github/codacy.json` says which tools and patterns are switched off in
 * Codacy and why, and which findings are dismissed and why. `scripts/codacy.mjs`
 * reads Codacy's list and says what the file does not account for, and with
 * a token makes Codacy do what the file says. What can go wrong with a
 * comparison is that it agrees too easily: a new finding of a kind already
 * dismissed slipping through under the old reason, or a key nobody reads.
 * What can go wrong with the writing is the token: printed, put in an
 * address, or sent with no token at all. All of it is held here without a
 * network, against a stand-in for Codacy's API.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const stated = JSON.parse(read(FILE));
const excluded = excludedPaths(read(PATHS_FILE));
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim().split('\n');

const TOOL = '6792c561-236d-41b7-ba5e-9d6bee0d548b';
const row = (file, pattern, line = 1, tool = TOOL, toolName = 'Opengrep') => ({
  issueId: `${file}:${pattern}:${line}`.replace(/[^a-z0-9]/gi, ''),
  filePath: file,
  lineNumber: line,
  patternInfo: { id: pattern },
  toolInfo: { uuid: tool, name: toolName },
});
/** A small answer, with one of everything. */
const small = () => ({
  tools: [{ name: 'Agentlinter', uuid: '498c9a6e-5ff8-45de-9bd3-0fef69370617', why: 'a prompt linter' }],
  patterns: [{ id: 'Semgrep_codacy.yaml.security.hard-coded-tokens', tool: TOOL, why: 'token counts' }],
  dismissed: [{ pattern: 'P_dismissed', file: 'src/a.ts', count: 2, reason: 'FalsePositive', why: 'read it' }],
});

describe('the file is an answer a person can read and the script can trust', () => {
  it('passes the script\'s own checks', () => {
    assert.deepEqual(problemsWithFile(stated), []);
  });

  it('names a file that is tracked for every dismissal, and gives every entry a reason a reader can check', () => {
    for (const entry of stated.dismissed) {
      assert.ok(tracked.includes(entry.file), `${entry.file} is not a tracked file`);
      assert.ok(entry.why.length >= 40, `the reason for ${entry.pattern} in ${entry.file} is too short to check`);
    }
    for (const entry of [...stated.tools, ...stated.patterns]) assert.ok(entry.why.length >= 40, `the reason for ${entry.name ?? entry.id} is too short to check`);
  });

  it('dismisses nothing in a path .codacy.yaml leaves out, which would be answered twice', () => {
    const leaveOut = excluded.map(globToRegExp);
    for (const entry of stated.dismissed) assert.ok(!leaveOut.some((pattern) => pattern.test(entry.file)), entry.file);
  });

  it('is plain prose: no em-dash', () => {
    assert.ok(!read(FILE).includes('—'));
  });

  it('refuses a key it does not read, at every level', () => {
    assert.match(problemsWithFile({ ...small(), extra: [] }).join(' '), /"extra" field/);
    const withTool = small();
    withTool.tools[0].enabled = false;
    assert.match(problemsWithFile(withTool).join(' '), /Tool 1 has a "enabled" field/);
    const withPattern = small();
    withPattern.patterns[0].level = 'High';
    assert.match(problemsWithFile(withPattern).join(' '), /Pattern 1 has a "level" field/);
    const withId = small();
    withId.dismissed[0].issueId = 'abc';
    assert.match(problemsWithFile(withId).join(' '), /Dismissal 1 has a "issueId" field/);
    const withLine = small();
    withLine.dismissed[0].line = 3;
    assert.match(problemsWithFile(withLine).join(' '), /Dismissal 1 has a "line" field/);
    assert.deepEqual(Object.keys(KEYS), ['top', 'tool', 'pattern', 'dismissed']);
  });

  it('refuses an entry with no reason, a reason Codacy does not have, no count, a pattern of files, or the same thing twice', () => {
    const cases = [
      [(f) => { f.dismissed[0].why = ' '; }, /does not say why/],
      [(f) => { f.dismissed[0].reason = 'Ugly'; }, /Codacy's reasons are/],
      [(f) => { delete f.dismissed[0].count; }, /how many findings it expects/],
      [(f) => { f.dismissed[0].count = 0; }, /how many findings it expects/],
      [(f) => { f.dismissed[0].file = 'src/**'; }, /one file, not a pattern/],
      [(f) => { f.dismissed.push({ ...f.dismissed[0] }); }, /a second time/],
      [(f) => { f.tools[0].uuid = 'agentlinter'; }, /uuid in Codacy's form/],
      [(f) => { f.patterns.push({ ...f.patterns[0] }); }, /a second time/],
      [(f) => { f.dismissed[0].pattern = f.patterns[0].id; }, /already switches off/],
      [(f) => { f.tools = {}; }, /must be a list/],
    ];
    for (const [change, said] of cases) {
      const file = small();
      change(file);
      assert.match(problemsWithFile(file).join(' '), said);
    }
    assert.deepEqual(REASONS, ['AcceptedUse', 'FalsePositive', 'NotExploitable', 'TestCode', 'ExternalCode']);
  });
});

describe('a finding is accounted for, or it is printed', () => {
  const findings = (rows) => readFindings(rows);

  it('accounts for a path left out, a tool off, a pattern off and a dismissal within its count', () => {
    const found = compare(small(), findings([
      row('packages/core/test/a.test.js', 'Anything'),
      row('SECURITY.md', 'Agentlinter_x', 1, '498c9a6e-5ff8-45de-9bd3-0fef69370617', 'Agentlinter'),
      row('src/b.ts', 'Semgrep_codacy.yaml.security.hard-coded-tokens'),
      row('src/a.ts', 'P_dismissed', 3),
      row('src/a.ts', 'P_dismissed', 9),
    ]), ['test/**', '**/test/**']);
    assert.deepEqual([found.leftOut.length, found.toolOff.length, found.patternOff.length, found.dismissed.length, found.over.length, found.unaccounted.length], [1, 1, 1, 2, 0, 0]);
  });

  it('prints a finding the file does not account for, and fails on it', async () => {
    const found = compare(small(), findings([row('src/c.ts', 'P_new', 12)]), []);
    assert.equal(found.unaccounted.length, 1);
    const text = report(found, { excluded: [], readOn: '2026-11-18' }).join('\n');
    assert.match(text, /Not accounted for/);
    assert.match(text, /src\/c\.ts:12 {2}P_new/);
  });

  it('does not dismiss a dismissed kind in a file the dismissal does not name', () => {
    const found = compare(small(), findings([row('src/other.ts', 'P_dismissed')]), []);
    assert.equal(found.unaccounted.length, 1);
  });

  it('reports a new finding of a dismissed kind, and dismisses none of that kind until it is read', () => {
    // Two were read and dismissed; a third appears in the same file. Which of
    // the three is new cannot be told from a line number, so all three wait.
    const answer = small();
    const found = compare(answer, findings([row('src/a.ts', 'P_dismissed', 3), row('src/a.ts', 'P_dismissed', 9), row('src/a.ts', 'P_dismissed', 40)]), []);
    assert.equal(found.dismissed.length, 0);
    assert.equal(found.over.length, 1);
    const text = report(found, { excluded: [], readOn: '2026-11-18' }).join('\n');
    assert.match(text, /3 open, the file expects 2/);
    assert.match(text, / {4}line 40/);
    assert.ok(!plan(answer, found).some((action) => action.kind === 'dismiss'));
  });

  it('says a tool the file switches off is still on, when the tool list says so', () => {
    const tools = [{ uuid: '498c9a6e-5ff8-45de-9bd3-0fef69370617', name: 'Agentlinter', settings: { isEnabled: true } }];
    const found = compare(small(), [], [], tools);
    assert.deepEqual(found.settings.map((setting) => setting.kind), ['tool-on']);
    assert.deepEqual(compare(small(), [], [], [{ ...tools[0], settings: { isEnabled: false } }]).settings, []);
  });

  it('reads a path pattern the way Codacy does: ** crosses directories, * does not', () => {
    assert.ok(globToRegExp('**/test/**').test('packages/core/test/a.js'));
    assert.ok(!globToRegExp('**/test/**').test('test/a.js'));
    assert.ok(globToRegExp('test/**').test('test/a.js'));
    assert.ok(!globToRegExp('packages/*/test/**').test('packages/a/b/test/c.js'));
    assert.ok(!globToRegExp('wiki/**').test('wikis/a.md'));
    assert.deepEqual(excludedPaths('---\n# x\nexclude_paths:\n  - "a/**"\n  # note\n  - "b/**"\nother: 1\n'), ['a/**', 'b/**']);
  });
});

describe('what apply sends', () => {
  it('switches the tools off, then the patterns, one request per tool, then the dismissals', () => {
    const found = compare(small(), readFindings([row('src/a.ts', 'P_dismissed', 3)]), []);
    const actions = plan(small(), found);
    assert.deepEqual(actions.map((action) => action.kind), ['tool', 'patterns', 'dismiss']);
    assert.deepEqual(actions[0].body, { enabled: false });
    assert.deepEqual(actions[1].body, { patterns: [{ id: 'Semgrep_codacy.yaml.security.hard-coded-tokens', enabled: false }] });
    assert.equal(actions[2].body.reason, 'FalsePositive');
    assert.match(actions[2].body.comment, /read it/);
  });

  it('dismisses a hundred at most in one request', () => {
    const answer = small();
    answer.dismissed[0].count = 250;
    const rows = Array.from({ length: 250 }, (_, at) => row('src/a.ts', 'P_dismissed', at + 1));
    const actions = plan(answer, compare(answer, readFindings(rows), [])).filter((action) => action.kind === 'dismiss');
    assert.equal(BATCH, 100);
    assert.deepEqual(actions.map((action) => action.body.issueIds.length), [100, 100, 50]);
    assert.equal(new Set(actions.flatMap((action) => action.body.issueIds)).size, 250);
  });
});

describe('the script, against a stand-in for Codacy', () => {
  const SECRET = 'tok-7f3a9c-never-printed';
  const work = mkdtempSync(join(tmpdir(), 'trazum-codacy-'));
  after(() => rmSync(work, { recursive: true, force: true }));

  /** A root with the two files, and a Codacy that answers from `rows`. */
  function setUp(answer, rows, { refuse = null, tools = [] } = {}) {
    const root = mkdtempSync(join(work, 'root-'));
    mkdirSync(join(root, '.github'));
    writeFileSync(join(root, FILE), JSON.stringify(answer));
    writeFileSync(join(root, PATHS_FILE), '---\nexclude_paths:\n  - "test/**"\n  - "**/test/**"\n');
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: { ...init.headers }, body: init.body === undefined ? undefined : JSON.parse(init.body) });
      const ok = (body, status = 200) => ({ ok: status < 300, status, text: async () => (body === null ? '' : JSON.stringify(body)) });
      if (refuse !== null && init.method !== 'GET' && init.method !== 'POST') return ok({ message: `bad token ${init.headers['api-token']}` }, refuse);
      if (refuse !== null && String(url).includes('bulk-ignore')) return ok({ message: `bad token ${init.headers['api-token']}` }, refuse);
      if (String(url).endsWith('/tools')) return ok({ data: tools });
      if (String(url).includes('/issues/search')) {
        const page = String(url).includes('cursor=two') ? 1 : 0;
        const slice = rows.slice(page * 100, page * 100 + 100);
        return ok({ data: slice, pagination: rows.length > 100 && page === 0 ? { cursor: 'two' } : {} });
      }
      return ok(null, 204);
    };
    const out = [];
    const run = (argv, env = {}) => main(argv, { fetch, env, now: () => new Date('2026-11-18T12:00:00Z'), log: (...lines) => out.push(...lines), error: (line) => out.push(line), root });
    return { run, calls, out };
  }

  it('reads every page with no token, compares, and exits 0 when everything is accounted for', async () => {
    const rows = [...Array.from({ length: 150 }, (_, at) => row('packages/x/test/a.test.js', 'Any', at + 1)), row('src/a.ts', 'P_dismissed')];
    const { run, calls, out } = setUp(small(), rows);
    assert.equal(await run([]), 0);
    assert.equal(calls.filter((call) => call.url.includes('/issues/search')).length, 2);
    assert.ok(calls.every((call) => call.headers['api-token'] === undefined), 'a token was sent to read');
    assert.ok(calls.every((call) => call.method === 'GET' || call.url.includes('/issues/search')), 'the comparison changed something');
    assert.match(out.join('\n'), /Codacy lists 151 open finding\(s\) on main, read on 2026-11-18/);
  });

  it('exits 1 on a finding the file does not account for', async () => {
    const { run, out } = setUp(small(), [row('src/new.ts', 'P_new', 4)]);
    assert.equal(await run([]), 1);
    assert.match(out.join('\n'), /src\/new\.ts:4/);
  });

  it('apply says what it would change and changes nothing', async () => {
    const { run, calls, out } = setUp(small(), [row('src/a.ts', 'P_dismissed')]);
    assert.equal(await run(['apply'], { [TOKEN_VARIABLE]: SECRET }), 0);
    assert.ok(calls.every((call) => call.method === 'GET' || call.url.includes('/issues/search')));
    assert.match(out.join('\n'), /Would change:/);
    assert.match(out.join('\n'), /Nothing was changed/);
  });

  it('apply --yes refuses to run without the token, and names the variable', async () => {
    const { run, calls, out } = setUp(small(), []);
    assert.equal(await run(['apply', '--yes'], {}), 2);
    assert.equal(calls.length, 0);
    assert.match(out.join('\n'), new RegExp(TOKEN_VARIABLE));
  });

  it('apply --yes sends the token in a header only, never prints it, and reads again', async () => {
    const { run, calls, out } = setUp(small(), [row('src/a.ts', 'P_dismissed')]);
    assert.equal(await run(['apply', '--yes'], { [TOKEN_VARIABLE]: SECRET }), 0);
    const writes = calls.filter((call) => call.method === 'PATCH' || call.url.includes('bulk-ignore'));
    assert.equal(writes.length, 3);
    for (const call of writes) assert.equal(call.headers['api-token'], SECRET);
    assert.ok(calls.every((call) => !call.url.includes(SECRET)), 'the token is in an address');
    assert.ok(!out.join('\n').includes(SECRET), 'the token was printed');
    assert.equal(calls.filter((call) => call.url.includes('/issues/search')).length, 2, 'it did not read again');
  });

  it('prints what Codacy said when it refuses, without the token even when Codacy repeats it', async () => {
    const { run, out } = setUp(small(), [row('src/a.ts', 'P_dismissed')], { refuse: 401 });
    assert.equal(await run(['apply', '--yes'], { [TOKEN_VARIABLE]: SECRET }), 1);
    const text = out.join('\n');
    assert.match(text, /Codacy answered 401/);
    assert.match(text, /bad token \[token\]/);
    assert.ok(!text.includes(SECRET), 'the token was printed');
    assert.equal(scrub(`a ${SECRET} b ${SECRET}`, SECRET), 'a [token] b [token]');
  });

  it('refuses an argument it does not know', () => {
    assert.throws(() => parseArgs(['--yes']), /belongs to apply/);
    assert.throws(() => parseArgs(['delete']), /unknown argument/);
    assert.deepEqual(parseArgs(['apply', '--yes']), { mode: 'apply', yes: true });
  });
});

describe('the record is written down where the next person looks', () => {
  it('docs/coverage.md says what is switched off, how to run the comparison, and that a new finding is read first', () => {
    const section = sectionOf(read('docs/coverage.md'), '## Codacy\n');
    for (const said of ['npm run codacy', FILE, TOKEN_VARIABLE, 'read before']) assert.ok(section.includes(said), `"Codacy" does not say: ${said}`);
    for (const tool of stated.tools) assert.ok(section.includes(tool.name), `"Codacy" does not name the tool ${tool.name}`);
  });

  it('the npm script runs it', () => {
    assert.equal(JSON.parse(read('package.json')).scripts.codacy, 'node scripts/codacy.mjs');
    assert.ok(existsSync(join(ROOT, 'scripts/codacy.mjs')));
  });

  it('the image runs as a numbered user, as the compliance page says', () => {
    // Hadolint's DL3066, fixed in #772: a name cannot be checked by a runtime
    // that refuses root before it starts the container.
    const users = [...read('Dockerfile').matchAll(/^USER (.+)$/gm)].map(([, user]) => user);
    assert.deepEqual(users, ['1000:1000']);
    assert.match(read('docs/compliance/asvs-l2.md'), /named by its number, 1000/);
  });
});
