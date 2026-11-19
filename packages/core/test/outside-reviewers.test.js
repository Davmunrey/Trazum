import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Codacy and DeepSource, held to what the repository says about them.
 *
 * Both were installed from outside and read everything they are not told to
 * leave. Their configuration is two small files, and a small file nobody runs
 * is the kind that goes stale: a directory is renamed and the path that left
 * it out now leaves out nothing, or one file gains a path the other never
 * hears of. So the paths are checked against the tree, the two lists against
 * each other, and both against the two statements made elsewhere: that the
 * left-out directories are generated, and that neither service can stand
 * between a pull request and `main`.
 *
 * The first draft also left out `.claude/skills/synced/`, which AGENTS.md says
 * belongs to somebody else. The check that a path names tracked files failed
 * on it: that directory is not in the repository at all, so neither service
 * ever sees it, and a path for it would have been a line that does nothing.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim().split('\n');

/** The quoted strings of one list in a YAML or TOML file, by the key that opens it. */
const listOf = (text, opening) => {
  const start = text.indexOf(opening);
  assert.ok(start !== -1, `no ${opening}`);
  const lines = text.slice(start + opening.length).split('\n');
  const out = [];
  for (const line of lines.slice(1)) {
    const found = line.match(/^\s*-?\s*"([^"]+)",?\s*$/);
    if (found) out.push(found[1]);
    else if (line.trim() !== '' && !line.trim().startsWith('#')) break;
  }
  return out;
};

const codacy = read('.codacy.yaml');
const deepsource = read('.deepsource.toml');
const leftOutByCodacy = listOf(codacy, 'exclude_paths:');
const leftOutByDeepSource = listOf(deepsource, 'exclude_patterns = [');
const tests = listOf(deepsource, 'test_patterns = [');
/** The paths Codacy leaves out because a script writes them, and the ones it leaves out because they are tests. */
const generatedByCodacy = leftOutByCodacy.filter((path) => !tests.includes(path));
const testsByCodacy = leftOutByCodacy.filter((path) => tests.includes(path));
/** A path pattern as Codacy reads one: `**` crosses directories, `*` does not. `scripts/codacy.mjs` reads it the same way. */
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*|\*/g, (star) => (star === '**' ? '.*' : '[^/]*'))}$`);
const leftOut = (file) => leftOutByCodacy.some((path) => glob(path).test(file));

describe('what the outside reviewers leave out', () => {
  it('Codacy\'s file is one it will read: it opens with the document marker', () => {
    assert.ok(codacy.startsWith('---\n'), 'Codacy ignores a configuration file that does not start with ---');
  });

  it('leaves out the same generated paths in both files, and in Codacy the tests DeepSource calls tests', () => {
    assert.equal(leftOutByCodacy.length, 4, `read ${leftOutByCodacy.length} paths from .codacy.yaml`);
    assert.deepEqual(generatedByCodacy, leftOutByDeepSource);
    assert.deepEqual(testsByCodacy, tests);
  });

  it('names directories that are there, whole', () => {
    for (const path of generatedByCodacy) {
      assert.ok(path.endsWith('/**'), `${path} is not a whole directory`);
      const dir = path.slice(0, -3);
      assert.ok(existsSync(join(ROOT, dir)), `${dir} does not exist: this path leaves out nothing`);
      assert.ok(tracked.some((file) => file.startsWith(`${dir}/`)), `${dir} holds no tracked file`);
    }
    for (const path of testsByCodacy) assert.ok(tracked.some((file) => glob(path).test(file)), `${path} leaves out no tracked file`);
  });

  it('leaves out only what AGENTS.md says is generated, and the tests', () => {
    const agents = read('AGENTS.md');
    assert.ok(agents.includes('`wiki/` and `plugin/skills/` are generated'), 'AGENTS.md no longer says these two are generated');
    assert.deepEqual([...generatedByCodacy].sort(), ['plugin/skills/**', 'wiki/**']);
  });

  it('leaves no code of this repository out with the generated paths', () => {
    for (const path of generatedByCodacy) {
      const dir = path.slice(0, -3);
      const inside = tracked.filter((file) => file.startsWith(`${dir}/`));
      const code = inside.filter((file) => /\.(?:ts|tsx|mjs|js|sh)$/.test(file));
      assert.deepEqual(code, [], `${dir} holds code of this repository that nobody would review`);
    }
  });

  it('leaves out every test file, wherever it lives', () => {
    const named = tracked.filter((file) => /\.test\.[a-z]+$/.test(file));
    assert.ok(named.length > 100, `only ${named.length} test files`);
    assert.deepEqual(named.filter((file) => !leftOut(file)), [], 'a test file Codacy would still read');
    for (const file of ['test/task-stress.test.mjs', 'packages/core/test/security.test.js', 'apps/web/test/helpers/x.mjs']) assert.ok(leftOut(file), file);
  });

  it('leaves out no shipped source: a security scanner still reads every file that runs', () => {
    // What runs: each package's src/, the web app's pages, libraries and
    // components, the Action and the scripts. A test directory among them is
    // tests, and the only thing under these paths that is left out.
    const shipped = tracked.filter((file) => /^(?:packages\/[^/]+\/src|apps\/web\/(?:app|lib|components)|action|scripts)\//.test(file) && !/(?:^|\/)test\//.test(file));
    assert.ok(shipped.length > 300, `only ${shipped.length} shipped files`);
    assert.deepEqual(shipped.filter(leftOut), [], 'shipped source Codacy would no longer read');
    for (const file of ['packages/core/src/rules.ts', 'apps/web/lib/auth/session.ts', 'action/post-comment.mjs', 'scripts/codacy.mjs', 'packages/core/src/test.ts', 'apps/web/app/tests/page.tsx']) {
      assert.ok(!leftOut(file), `${file} is left out`);
    }
  });
});

describe('what DeepSource is told about the code', () => {
  it('is version 1, the only one there is', () => {
    assert.match(deepsource, /^version = 1$/m);
  });

  it('reads the TypeScript as ES modules for Node, with React, and the shell scripts', () => {
    const names = [...deepsource.matchAll(/^name = "([^"]+)"$/gm)].map(([, name]) => name);
    assert.deepEqual(names, ['javascript', 'shell']);
    assert.match(deepsource, /^ {2}plugins = \["react"\]$/m);
    assert.match(deepsource, /^ {2}dialect = "typescript"$/m);
    assert.match(deepsource, /^ {2}module_system = "es-modules"$/m);
    // Not the browser: a command-line tool that prints is not a page that logs.
    assert.match(deepsource, /^ {2}environment = \["nodejs"\]$/m);
    const packages = JSON.parse(read('package.json')).workspaces;
    assert.ok(Array.isArray(packages) && packages.length > 0);
    for (const manifest of tracked.filter((file) => /^(?:packages|apps)\/[^/]+\/package\.json$/.test(file))) {
      assert.equal(JSON.parse(read(manifest)).type, 'module', `${manifest} is not an ES module package`);
    }
    assert.ok(tracked.some((file) => file.endsWith('.sh')), 'there is no shell script left to read');
    assert.ok(tracked.some((file) => file.endsWith('.tsx')), 'there is no React left to read');
  });

  it('opens no pull request and pushes no commit: no formatter is configured', () => {
    const settings = deepsource.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
    assert.doesNotMatch(settings, /code_formatters|transformers/);
  });

  it('calls a test a test: every file in a directory named test, and nothing else', () => {
    assert.deepEqual(tests, ['test/**', '**/test/**']);
    const inTest = tracked.filter((file) => /(?:^|\/)test\//.test(file));
    assert.ok(inTest.length > 100, `only ${inTest.length} files under a test directory`);
    const named = tracked.filter((file) => /\.test\.[a-z]+$/.test(file));
    const outside = named.filter((file) => !/(?:^|\/)test\//.test(file));
    assert.deepEqual(outside, [], 'a test file lives outside a directory named test, where these patterns do not reach');
  });
});

describe('neither is in the way, and both are written down', () => {
  it('is not a required check', () => {
    const ruleset = JSON.parse(read('.github/rulesets/main-branch.json'));
    const required = ruleset.rules.find((rule) => rule.type === 'required_status_checks').parameters.required_status_checks.map((check) => check.context);
    assert.ok(required.length > 0);
    assert.deepEqual(required.filter((name) => /codacy|deepsource/i.test(name)), []);
  });

  it('the contribution guide names both files, and says a wrong finding is not quieted in the code', () => {
    const guide = read('CONTRIBUTING.md');
    const at = guide.indexOf('**The machines.**');
    assert.ok(at !== -1);
    const machines = guide.slice(at, guide.indexOf('**An agent.**', at));
    for (const said of ['[`.codacy.yaml`](.codacy.yaml)', '[`.deepsource.toml`](.deepsource.toml)', 'Neither is a required check', 'not quieted by changing code']) {
      assert.ok(machines.includes(said), `"The machines" does not say: ${said}`);
    }
  });

  it('each file says who installed it, that it reviews and writes nothing, and where its findings are handled', () => {
    for (const [name, text] of [['.codacy.yaml', codacy], ['.deepsource.toml', deepsource]]) {
      for (const said of ['installed by the repository\'s owner', 'not a required check', 'CONTRIBUTING.md']) {
        assert.ok(text.includes(said), `${name} does not say: ${said}`);
      }
    }
  });
});
