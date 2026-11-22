import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
/** Spelled by code, so this file does not contain the character it forbids. */
const EM_DASH = String.fromCharCode(0x2014);
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

const { parseArguments, plan, report } = await import(join(repoRoot, 'scripts', 'publish-wiki.mjs'));

/**
 * The wiki's publishing, held to what it promises.
 *
 * `wiki/` is generated and `wiki.test.js` holds it to the documents. The last
 * step was two commands the owner had to remember, so the published wiki was
 * only as current as the last time somebody did. `scripts/publish-wiki.mjs`
 * decides what to copy and `.github/workflows/wiki.yml` clones, commits and
 * pushes.
 *
 * Three things are worth more than the rest:
 *
 * - **A page only on the wiki is never deleted.** It may be somebody's text.
 *   It is reported, the way a label only on GitHub is left alone.
 * - **The one job that can write is the one that runs on `main`.** GitHub's
 *   wiki is pushed with the repository's token and needs `contents: write`.
 *   That permission is on exactly one job, which runs on a push to `main` and
 *   nothing else.
 * - **The token is never printed.** It reaches git through the environment of
 *   a step, never in a URL, an argument or a `run:` expression.
 *
 * What this cannot hold: the push to the wiki's repository. The session that
 * wrote the workflow could not reach it, so the first run on `main` is the
 * first real one, and the workflow says so.
 */

describe('plan: what to do about each page', () => {
  it('writes a page the wiki lacks, and says it is new', () => {
    const result = plan({ 'A.md': 'a' }, {});
    assert.deepEqual(result.write, ['A.md']);
    assert.deepEqual(result.added, ['A.md']);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.unchanged, []);
    assert.deepEqual(result.onlyPublished, []);
  });

  it('writes a page whose text differs', () => {
    const result = plan({ 'A.md': 'new' }, { 'A.md': 'old' });
    assert.deepEqual(result.write, ['A.md']);
    assert.deepEqual(result.changed, ['A.md']);
    assert.deepEqual(result.added, []);
  });

  it('leaves a page whose text is identical', () => {
    const result = plan({ 'A.md': 'same' }, { 'A.md': 'same' });
    assert.deepEqual(result.write, []);
    assert.deepEqual(result.unchanged, ['A.md']);
  });

  it('does not delete a page that is only on the wiki, and says so', () => {
    const result = plan({ 'A.md': 'a' }, { 'A.md': 'a', 'Notes.md': 'by hand' });
    assert.deepEqual(result.onlyPublished, ['Notes.md']);
    assert.deepEqual(result.write, []);
    assert.ok(!('delete' in result) && !('remove' in result), 'the plan has a way to ask for a deletion');
    for (const list of Object.values(result)) assert.ok(!list.includes('Notes.md') || list === result.onlyPublished);
  });

  it('judges every page separately, and sorts what it lists', () => {
    const result = plan(
      { 'C.md': 'c', 'A.md': 'a2', 'B.md': 'b', 'D.md': 'd' },
      { 'A.md': 'a1', 'B.md': 'b', 'Z.md': 'z', 'Y.md': 'y' },
    );
    assert.deepEqual(result.write, ['A.md', 'C.md', 'D.md']);
    assert.deepEqual(result.added, ['C.md', 'D.md']);
    assert.deepEqual(result.changed, ['A.md']);
    assert.deepEqual(result.unchanged, ['B.md']);
    assert.deepEqual(result.onlyPublished, ['Y.md', 'Z.md']);
  });

  it('compares text exactly: a trailing newline or a letter case is a difference', () => {
    assert.deepEqual(plan({ 'A.md': 'a\n' }, { 'A.md': 'a' }).write, ['A.md']);
    assert.deepEqual(plan({ 'A.md': 'a' }, { 'A.md': 'a\n' }).write, ['A.md']);
    assert.deepEqual(plan({ 'A.md': 'a' }, { 'A.md': 'A' }).write, ['A.md']);
    const renamed = plan({ 'Home.md': 'x' }, { 'home.md': 'x' });
    assert.deepEqual(renamed.write, ['Home.md']);
    assert.deepEqual(renamed.onlyPublished, ['home.md']);
  });

  it('treats an empty page as a page', () => {
    assert.deepEqual(plan({ 'A.md': '' }, {}).write, ['A.md']);
    assert.deepEqual(plan({ 'A.md': '' }, { 'A.md': '' }).unchanged, ['A.md']);
    assert.deepEqual(plan({ 'A.md': '' }, { 'A.md': 'x' }).write, ['A.md']);
  });

  it('has nothing to do for nothing, and reports the wiki as all its own for no local pages', () => {
    const none = plan({}, {});
    for (const list of Object.values(none)) assert.deepEqual(list, []);
    assert.deepEqual(plan({}, { 'A.md': 'a' }).onlyPublished, ['A.md']);
    assert.deepEqual(plan({}, { 'A.md': 'a' }).write, []);
  });

  it('takes a Map as well as an object, and changes neither', () => {
    const local = new Map([['A.md', 'a'], ['B.md', 'b']]);
    const published = new Map([['A.md', 'a']]);
    const result = plan(local, published);
    assert.deepEqual(result.write, ['B.md']);
    assert.deepEqual([...local.keys()], ['A.md', 'B.md']);
    assert.deepEqual([...published.keys()], ['A.md']);
    assert.deepEqual(plan({ 'A.md': 'a', 'B.md': 'b' }, { 'A.md': 'a' }), result);
  });

  it('is not fooled by a page named like an object property', () => {
    assert.deepEqual(plan({ 'constructor.md': 'x' }, {}).write, ['constructor.md']);
    assert.deepEqual(plan({ 'toString.md': 'x' }, { 'toString.md': 'x' }).unchanged, ['toString.md']);
  });
});

describe('parseArguments', () => {
  it('reads --into, and --check beside it in either order', () => {
    assert.deepEqual(parseArguments(['--into', 'dir']), { check: false, into: 'dir' });
    assert.deepEqual(parseArguments(['--check', '--into', 'dir']), { check: true, into: 'dir' });
    assert.deepEqual(parseArguments(['--into', 'dir', '--check']), { check: true, into: 'dir' });
  });

  it('refuses a missing --into, whether it is absent or has no value', () => {
    assert.ok(parseArguments([]).error);
    assert.ok(parseArguments(['--check']).error);
    assert.ok(parseArguments(['--into']).error);
    assert.ok(parseArguments(['--into', '--check']).error);
  });

  it('refuses an argument it does not know, and --into twice', () => {
    assert.match(parseArguments(['--into', 'dir', '--force']).error, /--force/);
    assert.match(parseArguments(['--into', 'dir', 'extra']).error, /extra/);
    assert.match(parseArguments(['--delete', '--into', 'dir']).error, /--delete/);
    assert.ok(parseArguments(['--into', 'a', '--into', 'b']).error);
  });
});

describe('report: what is printed', () => {
  const result = plan({ 'New.md': 'n', 'Changed.md': 'c2', 'Same.md': 's' }, { 'Changed.md': 'c1', 'Same.md': 's', 'Theirs.md': 't' });

  it('names the pages written, unchanged and left alone when publishing', () => {
    const lines = report(result, { check: false });
    assert.ok(lines.includes('wrote: New.md (new)'));
    assert.ok(lines.includes('wrote: Changed.md'));
    assert.ok(lines.includes('unchanged: Same.md'));
    assert.ok(lines.includes('only on the wiki, left alone: Theirs.md'));
    assert.match(lines.at(-1), /Wrote 2 pages, left 1 unchanged and 1 alone/);
    assert.match(lines.at(-1), /Nothing was committed or pushed/);
  });

  it('says nothing was done when nothing was', () => {
    const lines = report(plan({ 'A.md': 'a' }, { 'A.md': 'a' }), { check: false });
    assert.ok(!lines.some((line) => line.startsWith('wrote')));
    assert.match(lines.at(-1), /^Nothing to do/);
  });

  it('names what differs and what is missing when checking, and never says it wrote', () => {
    const lines = report(result, { check: true });
    assert.ok(lines.includes('missing on the wiki: New.md'));
    assert.ok(lines.includes('differs from the wiki: Changed.md'));
    assert.ok(lines.includes('only on the wiki, left alone: Theirs.md'));
    assert.ok(!lines.some((line) => line.startsWith('wrote')));
    assert.match(lines.at(-1), /^2 pages of wiki\/ differ/);
  });

  it('says they agree when they do, and a page only on the wiki does not stop that', () => {
    const lines = report(plan({ 'A.md': 'a' }, { 'A.md': 'a', 'Theirs.md': 't' }), { check: true });
    assert.match(lines.at(-1), /^The published wiki agrees with wiki\/: 1 page\./);
  });
});

/**
 * The script, end to end, against a throwaway repository standing in for the
 * wiki's checkout.
 *
 * It runs from a copy of the files it needs, not from this repository, because
 * `wiki.test.js` plants a fault in the real `wiki/` and a second test doing the
 * same would race it. The copy is the files the workflow's sparse checkout
 * names, which is also what proves that list is enough.
 */
const scratch = mkdtempSync(join(tmpdir(), 'trazum-wiki-publish-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const fresh = (name) => {
  counter += 1;
  const dir = join(scratch, `${counter}-${name}`);
  mkdirSync(dir);
  return dir;
};

/** git without anything the machine it runs on has configured. */
const gitEnv = { ...SPAWN_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
for (const name of Object.keys(gitEnv)) if (name.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'].includes(name)) delete gitEnv[name];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] });

/** A checkout standing in for the wiki's repository, with these pages already in it, uncommitted. */
function wikiCheckout(pages = {}) {
  const dir = fresh('wiki-checkout');
  git(dir, 'init', '--quiet');
  for (const [name, body] of Object.entries(pages)) writeFileSync(join(dir, name), body);
  return dir;
}

/**
 * The files the scripts read, copied somewhere they can run from, with `wiki/`
 * built there by the build script rather than copied from this repository:
 * `wiki.test.js` plants a fault in the real `wiki/` while this runs, and a
 * copy taken at that moment would carry it.
 */
/**
 * The documents the build script copies its pages from, read out of the script
 * itself. The first version of this file named README.md alone, and so did the
 * workflow's checkout; the wiki had gained a page drawn from ROADMAP.md in the
 * meantime, and on main the publish job would have refused to run for want of
 * a file it never checked out.
 */
const SOURCES = [...new Set([...readFileSync(join(repoRoot, 'scripts', 'build-wiki.mjs'), 'utf8').matchAll(/^\s+source: '([^']+)',$/gm)].map((match) => match[1]))];
// build-wiki.mjs imports wiki-tags.mjs: a checkout without it cannot build a page.
const SCRIPTS = ['scripts/build-wiki.mjs', 'scripts/wiki-tags.mjs', 'scripts/publish-wiki.mjs'];

function repository(files = [...SCRIPTS, ...SOURCES]) {
  const dir = fresh('repository');
  for (const path of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    cpSync(join(repoRoot, path), join(dir, path), { recursive: true });
  }
  const built = spawnSync(process.execPath, [join(dir, 'scripts', 'build-wiki.mjs')], { cwd: dir, encoding: 'utf8', env: gitEnv });
  assert.equal(built.status, 0, built.stderr);
  return dir;
}

const run = (root, ...args) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'publish-wiki.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv,
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
};

const pagesOf = (dir) => readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
const localPages = pagesOf(join(repoRoot, 'wiki'));

describe('publish-wiki.mjs, end to end', () => {
  it('has real pages to publish', () => {
    assert.ok(localPages.length >= 5, `only ${localPages.length} pages in wiki/`);
  });

  it('copies every page into an empty checkout, says so, and commits nothing', () => {
    const root = repository();
    const wiki = wikiCheckout();
    const { status, out, err } = run(root, '--into', wiki);
    assert.equal(status, 0, err);
    assert.deepEqual(pagesOf(wiki), localPages);
    for (const name of localPages) {
      assert.equal(readFileSync(join(wiki, name), 'utf8'), readFileSync(join(root, 'wiki', name), 'utf8'), `${name} is not what wiki/ holds`);
      assert.ok(out.includes(`wrote: ${name} (new)`), `${name} was not reported`);
    }
    assert.match(out, new RegExp(`Wrote ${localPages.length} pages, left 0 unchanged and 0 alone`));
    assert.equal(git(wiki, 'rev-list', '--all', '--count').trim(), '0', 'the script made a commit');
    assert.equal(git(wiki, 'remote').trim(), '', 'the script added a remote');
  });

  it('on a second run reports nothing to do and touches nothing', () => {
    const root = repository();
    const wiki = wikiCheckout();
    assert.equal(run(root, '--into', wiki).status, 0);
    const before = git(wiki, 'status', '--porcelain');
    const again = run(root, '--into', wiki);
    assert.equal(again.status, 0, again.err);
    assert.match(again.out, /^Nothing to do/m);
    assert.ok(!/^wrote:/m.test(again.out), 'a second run wrote a page');
    for (const name of localPages) assert.ok(again.out.includes(`unchanged: ${name}`), `${name} was not reported unchanged`);
    assert.equal(git(wiki, 'status', '--porcelain'), before);
  });

  it('rewrites only the page that differs, and restores one edited on the wiki', () => {
    const root = repository();
    const wiki = wikiCheckout();
    run(root, '--into', wiki);
    writeFileSync(join(wiki, 'Home.md'), 'edited in the wiki editor\n');
    const again = run(root, '--into', wiki);
    assert.equal(again.status, 0, again.err);
    assert.ok(again.out.includes('wrote: Home.md\n'), 'the edited page was not rewritten');
    assert.ok(!again.out.includes('wrote: Commands.md'), 'a page that did not differ was rewritten');
    assert.equal(readFileSync(join(wiki, 'Home.md'), 'utf8'), readFileSync(join(root, 'wiki', 'Home.md'), 'utf8'));
  });

  it('--check exits 1 on an empty checkout, names what is missing, and writes nothing', () => {
    const root = repository();
    const wiki = wikiCheckout();
    const { status, out } = run(root, '--check', '--into', wiki);
    assert.equal(status, 1);
    for (const name of localPages) assert.ok(out.includes(`missing on the wiki: ${name}`), name);
    assert.deepEqual(readdirSync(wiki), ['.git'], '--check wrote into the checkout');
  });

  it('--check exits 1 for a page that differs and then 0 once it is published', () => {
    const root = repository();
    const wiki = wikiCheckout();
    run(root, '--into', wiki);
    writeFileSync(join(wiki, 'Limitations.md'), 'edited\n');
    const differing = run(root, '--check', '--into', wiki);
    assert.equal(differing.status, 1);
    assert.ok(differing.out.includes('differs from the wiki: Limitations.md'));
    assert.equal(readFileSync(join(wiki, 'Limitations.md'), 'utf8'), 'edited\n', '--check rewrote the page');

    assert.equal(run(root, '--into', wiki).status, 0);
    const agreeing = run(root, '--check', '--into', wiki);
    assert.equal(agreeing.status, 0, agreeing.err);
    assert.match(agreeing.out, /The published wiki agrees with wiki\//);
  });

  it('leaves a page that is only on the wiki alone, and reports it, in both modes', () => {
    const root = repository();
    const wiki = wikiCheckout({ 'Notes-by-hand.md': 'somebody wrote this\n', 'Diagram.png': 'not a page' });
    const published = run(root, '--into', wiki);
    assert.equal(published.status, 0, published.err);
    assert.ok(published.out.includes('only on the wiki, left alone: Notes-by-hand.md'));
    assert.equal(readFileSync(join(wiki, 'Notes-by-hand.md'), 'utf8'), 'somebody wrote this\n');
    assert.equal(readFileSync(join(wiki, 'Diagram.png'), 'utf8'), 'not a page');
    assert.ok(!published.out.includes('Diagram.png'), 'a file that is not a page was reported');

    // With everything else in agreement, the page only on the wiki is not a difference.
    const checked = run(root, '--check', '--into', wiki);
    assert.equal(checked.status, 0, checked.err);
    assert.ok(checked.out.includes('only on the wiki, left alone: Notes-by-hand.md'));
    assert.equal(readFileSync(join(wiki, 'Notes-by-hand.md'), 'utf8'), 'somebody wrote this\n');
  });

  it('a second run after a page was left alone still has nothing to do', () => {
    const root = repository();
    const wiki = wikiCheckout({ 'Notes-by-hand.md': 'x\n' });
    run(root, '--into', wiki);
    assert.match(run(root, '--into', wiki).out, /^Nothing to do/m);
  });

  describe('refuses with exit 2, and a sentence, and changes nothing', () => {
    const refused = (result, mention) => {
      assert.equal(result.status, 2, `exit ${result.status}: ${result.out}${result.err}`);
      assert.equal(result.out, '', 'a refusal printed on stdout as though it had done something');
      assert.ok(result.err.trim().length > 0, 'a refusal with no sentence');
      if (mention !== undefined) assert.ok(result.err.includes(mention), `the sentence does not say ${mention}: ${result.err}`);
    };

    it('when --into is missing, with or without --check', () => {
      const root = repository();
      refused(run(root), '--into');
      refused(run(root, '--check'), '--into');
      refused(run(root, '--into'), '--into');
    });

    it('on an argument it does not know', () => {
      const root = repository();
      const wiki = wikiCheckout();
      refused(run(root, '--into', wiki, '--delete'), '--delete');
      refused(run(root, '--force', '--into', wiki), '--force');
      assert.deepEqual(readdirSync(wiki), ['.git']);
    });

    it('when --into is not a git checkout', () => {
      const root = repository();
      const plain = fresh('plain-directory');
      refused(run(root, '--into', plain), 'not a git checkout');
      refused(run(root, '--check', '--into', plain), 'not a git checkout');
      refused(run(root, '--into', join(scratch, 'does-not-exist')), 'not a git checkout');
      assert.deepEqual(readdirSync(plain), [], 'pages were written into a directory that is not a checkout');
    });

    it('when --into is a folder inside a checkout and not the checkout itself', () => {
      const root = repository();
      const wiki = wikiCheckout();
      const inside = join(wiki, 'sub');
      mkdirSync(inside);
      refused(run(root, '--into', inside), 'not a git checkout');
      assert.deepEqual(readdirSync(inside), []);
    });

    it('when a page in wiki/ was edited by hand, and does not write the others either', () => {
      const root = repository();
      const wiki = wikiCheckout();
      const page = join(root, 'wiki', 'Home.md');
      writeFileSync(page, `${readFileSync(page, 'utf8')}\nA sentence nobody generated.\n`);
      refused(run(root, '--into', wiki), 'build-wiki');
      refused(run(root, '--check', '--into', wiki), 'build-wiki');
      assert.deepEqual(readdirSync(wiki), ['.git'], 'a page was written from a wiki/ that is not generated');
    });

    it('when wiki/ has a page the build script does not write', () => {
      const root = repository();
      const wiki = wikiCheckout();
      writeFileSync(join(root, 'wiki', 'Stray.md'), 'not generated\n');
      refused(run(root, '--into', wiki), 'build-wiki');
      assert.deepEqual(readdirSync(wiki), ['.git']);
    });

    it('when a page of wiki/ is missing', () => {
      const root = repository();
      const wiki = wikiCheckout();
      rmSync(join(root, 'wiki', 'Privacy.md'));
      refused(run(root, '--check', '--into', wiki), 'build-wiki');
    });
  });
});

describe('the script holds no credential and makes no network call', () => {
  const script = read('scripts/publish-wiki.mjs');
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('imports only what Node ships with, and no module that reaches a network', () => {
    const imported = [...code.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    assert.deepEqual(imported.sort(), ['node:child_process', 'node:fs', 'node:path', 'node:url']);
    assert.doesNotMatch(code, /\bimport\(|\brequire\(/);
    assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|WebSocket|node:https?|node:net|node:dns|node:tls/);
  });

  it('reads no environment variable and names no token', () => {
    assert.doesNotMatch(code, /process\.env/);
    assert.doesNotMatch(code, /GH_TOKEN|GITHUB_TOKEN|x-access-token|Authorization|extraheader|secrets\./i);
  });

  it('runs two programs, git to ask what a directory is and node to ask the build script, and never a git command that changes anything', () => {
    const spawned = [...code.matchAll(/execFileSync\(([^,]+),\s*\[([^\]]*)\]/g)].map((match) => [match[1].trim(), match[2].replace(/\s+/g, ' ').trim()]);
    assert.equal(spawned.length, 2, `the script runs ${spawned.length} programs`);
    assert.deepEqual(spawned.map(([program]) => program).sort(), ["'git'", 'process.execPath']);
    const gitArguments = spawned.find(([program]) => program === "'git'")[1];
    assert.equal(gitArguments, "'-C', directory, 'rev-parse', '--show-toplevel'");
    assert.doesNotMatch(code, /\bexecSync\(|\bspawn(?:Sync)?\(|shell:\s*true/);
    assert.doesNotMatch(code, /'(?:push|commit|clone|fetch|pull|add|remote|config|reset|rm)'/);
  });

  it('deletes nothing', () => {
    assert.doesNotMatch(code, /\b(?:unlinkSync|rmSync|rmdirSync|unlink|rm)\(|rimraf/);
    assert.doesNotMatch(code, /\.(?:git|\.)\b.*writeFileSync/);
  });

  it('writes in exactly one place, a page of the checkout', () => {
    const writes = [...code.matchAll(/writeFileSync\(([^;]+)\);/g)].map((match) => match[1].replace(/\s+/g, ' '));
    assert.deepEqual(writes, ['join(parsed.into, name), local.get(name)']);
    assert.match(code, /if \(!parsed\.check\) for \(const name of result\.write\) writeFileSync/);
  });
});

describe('the build script still never pushes, and says a merge publishes', () => {
  it('holds no credential and runs nothing that talks to a network', () => {
    const code = read('scripts/build-wiki.mjs').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /process\.env|GH_TOKEN|GITHUB_TOKEN|execFileSync|execSync|\bspawn|\bfetch\(|node:https?/);
    assert.match(read('scripts/build-wiki.mjs'), /\*\*It never pushes\.\*\*/);
  });

  it('prints that a merge to main publishes, and keeps the two commands as the fallback', () => {
    const root = repository();
    const built = spawnSync(process.execPath, [join(root, 'scripts', 'build-wiki.mjs')], { cwd: root, encoding: 'utf8', env: gitEnv });
    assert.equal(built.status, 0, built.stderr);
    assert.match(built.stderr, /A merge to main that changes wiki\/ publishes it \(the Wiki workflow\)/);
    assert.match(built.stderr, /git clone https:\/\/github\.com\/TrazumAPP\/Trazum\.wiki\.git/);
    assert.match(built.stderr, /git add -A && git commit -m "Rebuild from the repository" && git push/);
    assert.match(built.stderr, /A wiki that has never had a page cannot be cloned/);
    assert.ok(existsSync(join(root, 'wiki', 'Home.md')));
  });
});

/**
 * The workflow, read as text because this package takes no YAML parser.
 */
describe('the Wiki workflow', () => {
  const workflow = read('.github/workflows/wiki.yml');
  /** Without the comment lines, which are prose; a trailing version comment stays, as a pin is asserted with it. */
  const code = workflow.replace(/^[ \t]*#.*\n/gm, '');
  /** The comments alone, joined into sentences. */
  const prose = workflow.replace(/\n\s*#\s?/g, ' ');

  /** A job's text, from its key to the next job's. */
  const job = (name) => {
    const jobs = code.slice(code.indexOf('\njobs:\n') + 1).split(/^ {2}(?=[a-z][a-z-]*:$)/m);
    const found = jobs.find((text) => text.startsWith(`${name}:`));
    assert.ok(found, `no ${name} job`);
    return found;
  };
  const publish = job('publish');
  const compare = job('compare');
  const steps = (text) => text.split(/^ {6}- /m).slice(1);
  const runs = (text) => [...text.matchAll(/^\s+run: (.*)$/gm)].map((match) => match[1]).concat([...text.matchAll(/^\s+run: \|\n((?: {10,}.*\n?)+)/gm)].map((match) => match[1]));

  it('is named Wiki, and has exactly the two jobs', () => {
    assert.match(workflow, /^name: Wiki$/m);
    assert.deepEqual([...code.slice(code.indexOf('\njobs:\n')).matchAll(/^ {2}([a-z][a-z-]*):$/gm)].map((match) => match[1]), ['publish', 'compare']);
  });

  it('runs on a push to main that touches the pages, the script or itself, a schedule, and a manual run', () => {
    const on = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    assert.match(on, /^ {2}push:\n {4}branches: \[main\]\n {4}paths:\n {6}- wiki\/\*\*\n {6}- scripts\/publish-wiki\.mjs\n {6}- \.github\/workflows\/wiki\.yml\n/m);
    assert.match(on, /^ {2}schedule:\n {4}- cron: '/m);
    assert.match(on, /^ {2}workflow_dispatch:$/m);
    assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]), ['push', 'schedule', 'workflow_dispatch']);
  });

  it('has no pull request trigger of either kind, and does not spell the banned one even in a comment', () => {
    assert.doesNotMatch(code, /pull_request/);
    assert.doesNotMatch(code, /\bissue_comment\b|\bworkflow_run\b|\bissues:/);
    // The ban that applies to every workflow but one, applied here to the raw text, comments included.
    assert.ok(!workflow.includes('pull_request_target'), 'the workflow spells the event security.test.js bans');
  });

  it('is read-only by default, and the write permission is on the publish job and nowhere else', () => {
    assert.match(code, /^permissions:\n {2}contents: read\n\n/m);
    assert.equal((workflow.match(/: write\b/g) ?? []).length, 1, 'more than one write permission, or one in a comment');
    assert.equal((code.match(/contents: write/g) ?? []).length, 1);
    assert.match(publish, /^ {4}permissions:\n {6}contents: write\n {4}steps:/m);
    assert.doesNotMatch(compare, /: write\b/);
    assert.match(compare, /^ {4}permissions:\n {6}contents: read\n {4}steps:/m);
    assert.doesNotMatch(code.slice(0, code.indexOf('\njobs:\n')), /: write\b/, 'a write permission above the jobs');
  });

  it('says why the write permission is needed, next to it', () => {
    const at = workflow.indexOf('contents: write');
    const before = workflow.slice(workflow.lastIndexOf('permissions:', at), at);
    assert.match(before, /wiki is pushed with the repository's own token/);
    assert.match(before.replace(/\n\s*#\s?/g, ' '), /needs write on contents/);
  });

  it('publishes only on a push to main, and a manual or weekly run never does', () => {
    assert.match(publish, /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m);
    assert.match(compare, /^ {4}if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'$/m);
    assert.doesNotMatch(compare, /github\.event_name == 'push'|refs\/heads\/main/);
    assert.doesNotMatch(publish, /workflow_dispatch|schedule/);
    // Nothing that can write outside the publish job.
    for (const step of steps(compare)) assert.doesNotMatch(step, /git (?:-c [^ ]+ [^ ]+ )*(?:push|commit|add)\b|publish-wiki\.mjs --into/, `the compare job can write: ${step.split('\n')[0]}`);
    assert.deepEqual(runs(compare).filter((line) => line.includes('publish-wiki.mjs')), ['node scripts/publish-wiki.mjs --check --into "$RUNNER_TEMP/wiki"']);
    assert.deepEqual(runs(publish).filter((line) => line.includes('publish-wiki.mjs')), ['node scripts/publish-wiki.mjs --into "$RUNNER_TEMP/wiki"']);
  });

  it('every job has a timeout, its own permissions, and the workflow is serialised without cancelling a publish', () => {
    for (const text of [publish, compare]) {
      assert.match(text, /^ {4}timeout-minutes: \d+$/m);
      assert.match(text, /^ {4}permissions:\n/m);
      assert.match(text, /^ {4}runs-on: ubuntu-latest$/m);
    }
    assert.match(code, /^concurrency:\n {2}group: wiki\n {2}cancel-in-progress: false$/m);
    assert.doesNotMatch(code, /cancel-in-progress: true/);
  });

  it('checks out without keeping a credential, sparsely, and only the files the scripts read', () => {
    for (const text of [publish, compare]) {
      const checkouts = text.match(/uses: actions\/checkout@/g) ?? [];
      assert.equal(checkouts.length, 1);
      const [, head, list] = text.match(/uses: actions\/checkout@([0-9a-f]{40}) # v\d+\n {8}with:\n {10}persist-credentials: false\n {10}sparse-checkout: \|\n((?: {12}.+\n)+) {10}sparse-checkout-cone-mode: false\n/) ?? [];
      assert.ok(head, 'the checkout is not pinned, keeps its credential, or is not sparse');
      // The two scripts, every document the build script reads, and wiki/: no more and no less.
      assert.deepEqual(list.split('\n').map((line) => line.trim()).filter(Boolean), [...SCRIPTS, ...SOURCES, '/wiki/']);
    }
    assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
    assert.doesNotMatch(code, /persist-credentials: true|fetch-depth|\bref:|^\s+token:/m);
  });

  it('every action is pinned by a full commit and says which version', () => {
    const uses = [...workflow.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)];
    assert.ok(uses.length >= 2);
    for (const [, ref, rest] of uses) {
      assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is not pinned to a commit`);
      assert.match(rest, /#\s*v\d/, `${ref} does not say its version`);
    }
  });

  it('never puts an expression in a run: line, so nothing a stranger wrote can reach a shell', () => {
    const lines = runs(publish).concat(runs(compare));
    assert.ok(lines.length >= 6, 'run lines were not found, so this is inspecting nothing');
    for (const line of lines) assert.doesNotMatch(line, /\$\{\{/, `an expression in a run: ${line}`);
    // Nor in a name or a condition that a title or a body could reach: only these contexts appear at all.
    const contexts = new Set([...code.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1]));
    assert.deepEqual([...contexts].sort(), ['github.repository', 'github.sha', 'github.token']);
    assert.doesNotMatch(code, /github\.event\.(?:issue|pull_request|comment|head_commit)|github\.head_ref|inputs\./);
  });

  it('gives the token to a step through env, and uses it for nothing but the header', () => {
    assert.doesNotMatch(code, /secrets\./);
    const tokenSteps = steps(publish).concat(steps(compare)).filter((step) => /github\.token/.test(step));
    assert.equal(tokenSteps.length, 3, 'the token reaches three steps: two clones and one push');
    for (const step of tokenSteps) {
      assert.match(step, /^ {8}env:\n(?: {10}[A-Z_]+: .+\n)*? {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/m);
      assert.equal((step.match(/github\.token/g) ?? []).length, 1);
    }
    // The only lines that name the variable, and what each may do with it.
    for (const text of [publish, compare]) {
      const mentions = text.split('\n').filter((line) => /\$GH_TOKEN|\$\{GH_TOKEN/.test(line));
      for (const line of mentions) {
        assert.equal(line.trim(), `credential="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"`, `the token is used another way: ${line.trim()}`);
      }
    }
  });

  it('hands git the header in the environment, never in a URL, a flag or the config', () => {
    for (const text of [publish, compare]) {
      const lines = text.split('\n').map((line) => line.trim());
      for (const line of lines.filter((line) => /\$credential|\$\{credential/.test(line))) {
        assert.ok(
          line === 'export GIT_CONFIG_VALUE_0="Authorization: basic $credential"' || line === 'echo "::add-mask::$credential"',
          `the credential is used another way: ${line}`,
        );
      }
    }
    assert.equal((code.match(/export GIT_CONFIG_COUNT=1/g) ?? []).length, 3);
    assert.equal((code.match(/export GIT_CONFIG_KEY_0='http\.https:\/\/github\.com\/\.extraheader'/g) ?? []).length, 3);
    assert.equal((code.match(/::add-mask::\$credential/g) ?? []).length, 3, 'a derived credential is not masked');
    assert.equal((code.match(/base64 -w0/g) ?? []).length, 3);
    // No URL carries a credential, the header is not a flag, and nothing is written into a config file.
    assert.doesNotMatch(code, /x-access-token:[^%]|https:\/\/[^\s"']*@|:\/\/\$|@github\.com/);
    assert.doesNotMatch(code, /git -c http|--config|git config|credential\.helper|\.git-credentials|http\.extraheader/);
    assert.doesNotMatch(code, /\bgh auth\b|\bgh api\b/);
  });

  it('cannot print the token: no tracing, no verbose git, no echo of it', () => {
    assert.doesNotMatch(code, /set -[a-z]*x|set [^\n]*xtrace|\bbash -x\b|\bsh -x\b/);
    assert.doesNotMatch(code, /GIT_TRACE|GIT_CURL_VERBOSE|--verbose|\bgit [^\n]*\s-v\b|ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/);
    for (const line of code.split('\n')) {
      if (!/\becho\b|\bprintf\b|\bcat\b|\benv\b|\bprintenv\b|\bdeclare -p\b|\bexport -p\b/.test(line)) continue;
      // The two shapes that name it on purpose: the mask command, and the encoding that feeds the header.
      if (line.trim() === 'echo "::add-mask::$credential"' || line.trim() === `credential="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"`) continue;
      assert.doesNotMatch(line, /GH_TOKEN|GIT_CONFIG_VALUE|credential(?!:)/ , `a line that prints may print the token: ${line.trim()}`);
    }
    // The one use of printf is the one that feeds base64, and the only echo of the credential is the mask command.
    assert.equal((code.match(/\bprintf\b/g) ?? []).length, 3);
    assert.equal((code.match(/\becho "::add-mask::\$credential"/g) ?? []).length, 3);
    for (const text of [publish, compare]) assert.match(text, /set -euo pipefail/);
    assert.doesNotMatch(code, /\bcurl\b|\bwget\b/);
  });

  it('clones the repository\'s own wiki, once for each job, and says how to fix a wiki that has no page', () => {
    assert.equal((code.match(/WIKI_URL: https:\/\/github\.com\/\$\{\{ github\.repository \}\}\.wiki\.git/g) ?? []).length, 2);
    assert.equal((code.match(/git clone --quiet "\$WIKI_URL" "\$RUNNER_TEMP\/wiki"/g) ?? []).length, 2);
    assert.equal((code.match(/\bgit clone\b/g) ?? []).length, 2);
    for (const text of [publish, compare]) {
      assert.match(text, /if ! git clone --quiet "\$WIKI_URL" "\$RUNNER_TEMP\/wiki"; then\n {12}echo "::error::[^"\n]*save one page in the web UI first[^"\n]*"\n {12}exit 1\n {10}fi/);
      assert.match(text, /GIT_TERMINAL_PROMPT=0/);
    }
  });

  it('commits as github-actions[bot] naming the commit of main, only when something changed, then pushes without force', () => {
    const [step] = steps(publish).filter((text) => text.includes('git push'));
    assert.ok(step, 'no step pushes');
    assert.match(step, /^name: Commit and push, if anything changed$/m);
    assert.match(step, /SOURCE_SHA: \$\{\{ github\.sha \}\}/);
    const guard = step.indexOf('git status --porcelain');
    const commit = step.indexOf('git -c user.name=');
    const push = step.indexOf('git push');
    assert.ok(guard !== -1 && commit !== -1 && push !== -1, 'a step is missing');
    assert.ok(guard < commit && commit < push, 'the steps are out of order');
    assert.match(step, /if \[ -z "\$\(git status --porcelain\)" \]; then\n\s+echo "[^"\n]*nothing to commit[^"\n]*"\n\s+exit 0\n\s+fi/);
    assert.match(step, /git -c user\.name='github-actions\[bot\]' -c user\.email='41898282\+github-actions\[bot\]@users\.noreply\.github\.com' commit --quiet -m "Rebuild the wiki from main at \$SOURCE_SHA"/);
    assert.match(step, /git push --quiet origin HEAD\n/);
    assert.doesNotMatch(code, /--force|--force-with-lease|push -f|\+HEAD|--delete|\bgit rm\b|\bgit reset\b|--amend/);
    assert.equal((code.match(/\bgit push\b/g) ?? []).length, 1);
    assert.equal((code.match(/\bgit commit\b|commit --quiet/g) ?? []).length, 1);
    // The only place the job-level user could be anything else is a git config, which nothing writes.
    assert.doesNotMatch(compare, /\bcommit\b|\bpush\b|user\.name/);
  });

  it('copies the pages between cloning and committing', () => {
    const order = ['Clone the wiki', 'Copy the pages that differ', 'Commit and push, if anything changed'].map((name) => publish.indexOf(`name: ${name}\n`));
    assert.ok(order.every((at) => at !== -1), 'a publish step is missing');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(publish.indexOf('actions/checkout') < order[0]);
  });

  it('runs weekly, on a minute no other workflow uses and that is not on the hour or the half', () => {
    const crons = [];
    for (const name of readdirSync(join(repoRoot, '.github', 'workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = read(`.github/workflows/${name}`).replace(/^\s*#.*$/gm, '');
      for (const [, minute, hour, rest] of source.matchAll(/^\s*- cron: '(\d+) (\d+) (\S+ \S+ \S+)'$/gm)) crons.push({ name, minute: Number(minute), hour: Number(hour), rest });
    }
    const mine = crons.filter((entry) => entry.name === 'wiki.yml');
    assert.equal(mine.length, 1, 'wiki.yml has one schedule');
    assert.equal(mine[0].rest, '* * 1', 'the schedule is not weekly, on a Monday');
    assert.notEqual(mine[0].minute, 0);
    assert.notEqual(mine[0].minute, 30);
    const others = crons.filter((entry) => entry.name !== 'wiki.yml');
    assert.ok(others.length >= 5, `only ${others.length} other schedules found, so uniqueness is not being checked`);
    assert.ok(!others.some((entry) => entry.minute === mine[0].minute), `another workflow runs at minute ${mine[0].minute}`);
    assert.ok(!others.some((entry) => entry.hour === mine[0].hour && entry.rest === mine[0].rest && entry.minute === mine[0].minute));
    assert.deepEqual([mine[0].hour, mine[0].minute], [10, 13]);
    assert.match(prose, /Mondays at 10:13\./);
  });

  it('says plainly that the push has not been run, and that the first run on main is the first real one', () => {
    assert.match(prose, /NOT TESTED FROM WHERE IT WAS WRITTEN/);
    assert.match(prose, /could not reach the wiki's repository/);
    assert.match(prose, /The first run of the publish job on main is the first real one/);
    assert.match(prose, /the clone, the push and the way the token reaches git here have never run/);
  });

  it('checks out every file the scripts read, and no more: the sparse list is enough to run both jobs', () => {
    const listed = [...workflow.matchAll(/sparse-checkout: \|\n((?: {12}.+\n)+)/g)].map((match) => match[1].split('\n').map((line) => line.trim()).filter(Boolean));
    assert.equal(listed.length, 2);
    assert.deepEqual(listed[0], listed[1]);
    for (const tag of ['publish', 'compare']) {
      // wiki/ is checked out too, and is built here for the reason repository() gives.
      const files = listed[0].filter((entry) => entry !== '/wiki/').map((entry) => entry.replace(/^\//, ''));
      assert.ok(listed[0].includes('/wiki/'), 'wiki/ is not checked out');
      const root = repository(files);
      const wiki = wikiCheckout();
      assert.equal(run(root, '--into', wiki).status, 0, `${tag}: the files checked out are not enough to publish`);
      assert.equal(run(root, '--check', '--into', wiki).status, 0, `${tag}: the files checked out are not enough to compare`);
    }
  });
});

describe('the documents say what the workflow does', () => {
  const security = read('SECURITY.md');
  const contributing = read('CONTRIBUTING.md');
  const changelog = read('CHANGELOG.md');

  it('SECURITY.md says what the workflow may write, why, and what limits it', () => {
    const [, section] = security.match(/\*\*The `Wiki` workflow can push, and what limits it\.\*\*([\s\S]*?)\n### /) ?? [];
    assert.ok(section, 'SECURITY.md has no paragraph on the Wiki workflow');
    assert.match(section, /`contents: write`/);
    assert.match(section, /`\.github\/workflows\/wiki\.yml`/);
    assert.match(section, /one job, `publish`/);
    assert.match(section, /on a push to `main` only/);
    assert.match(section, /never from a\s+pull request/);
    assert.match(section, /a\s+manual run from any branch only compares/);
    assert.match(section, /`scripts\/build-wiki\.mjs --check`/);
    assert.match(section, /makes no network call, reads no environment variable and holds no\s+credential/);
    assert.match(section, /in no URL, in no `\.git\/config` and in no\s+command's arguments/);
    assert.match(section, /deletes nothing/i);
    assert.match(section, /`wiki-publish\.test\.js`/);
    assert.match(section, /the push itself\s+has never run/);
    assert.match(section, /first run of the `publish` job on `main` is the first\s+real one/);
  });

  it('SECURITY.md lists the workflow among what is committed, and in the table of controls', () => {
    assert.match(security, /^\| The wiki workflow's write permission reaching a pull request's code, or another job \|.*wiki\.yml`.*`wiki-publish\.test\.js` \|$/m);
    assert.match(security, /^- `\.github\/workflows\/wiki\.yml` and `scripts\/publish-wiki\.mjs`:/m);
  });

  it('CONTRIBUTING.md says the wiki is generated, that a merge publishes it, and what to do by hand', () => {
    const [, section] = contributing.match(/### The wiki is generated, and a merge publishes it\n([\s\S]*?)\n## /) ?? [];
    assert.ok(section, 'CONTRIBUTING.md has no section on the wiki');
    assert.match(section, /`node scripts\/build-wiki\.mjs`/);
    assert.match(section, /do not edit one in GitHub's wiki editor|do not edit one in GitHub's wiki\s+editor/i);
    assert.match(section, /`Wiki` workflow/);
    assert.match(section, /`scripts\/publish-wiki\.mjs`/);
    assert.match(section, /only on the wiki is reported and left alone/);
    assert.match(section, /one page saved in GitHub's web UI/);
    assert.match(section, /fallback/);
    assert.match(section, /`wiki-publish\.test\.js`/);
  });

  it('CHANGELOG.md has an entry that ends with the issue, and admits what was not run', () => {
    // Read from the whole file: the entry sits under Unreleased until a release
    // turns that heading into a version, and under the version after it.
    const entries = changelog.split(/\n(?=- \*\*)/).filter((text) => /\*\*Merging to `main` publishes the wiki\.\*\*/.test(text));
    assert.equal(entries.length, 1, 'no entry for the wiki workflow in the changelog, or more than one');
    const [entry] = entries;
    assert.match(entry.trimEnd(), /\(#726\)$/);
    assert.match(entry, /\*\*Merging to `main` publishes the wiki\.\*\*/);
    const flat = entry.replace(/\s+/g, ' ');
    assert.match(flat, /not run from the session that wrote it/);
    assert.match(flat, /first run on `main` is the first real one/);
  });

  it('the README names the script beside the one that builds the wiki', () => {
    assert.match(read('README.md'), /^ {2}publish-wiki\.mjs {3}copies wiki\/ into a checkout of the wiki's repository; the Wiki workflow runs it$/m);
  });

  it('none of the new prose carries an em-dash', () => {
    for (const path of ['scripts/publish-wiki.mjs', '.github/workflows/wiki.yml', 'packages/core/test/wiki-publish.test.js']) assert.ok(!read(path).includes(EM_DASH), `${path} has an em-dash`);
    const [, section] = security.match(/\*\*The `Wiki` workflow can push, and what limits it\.\*\*([\s\S]*?)\n### /) ?? [];
    assert.ok(!section.includes(EM_DASH));
    assert.ok(!security.match(/^- `\.github\/workflows\/wiki\.yml`[\s\S]*?\n- `\.github\/dependabot/m)[0].includes(EM_DASH));
    const [, wikiSection] = contributing.match(/### The wiki is generated, and a merge publishes it\n([\s\S]*?)\n## /);
    assert.ok(!wikiSection.includes(EM_DASH));
  });
});
