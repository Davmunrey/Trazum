import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, posix } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

/**
 * A job that checks out only some files runs only if those files are every
 * file its scripts load.
 *
 * #848 made `scripts/pr-readiness.mjs` import `scripts/changes.mjs`. The
 * triage workflow checks out `triage.mjs` and `pr-readiness.mjs` alone, so on
 * the next pull request it stopped at `ERR_MODULE_NOT_FOUND` before it labelled
 * anything (#851). Every check on #848 passed, because none of them runs a
 * workflow's sparse checkout. This follows, for each job with a sparse
 * checkout, the relative imports of every `node scripts/<name>.mjs` it runs,
 * and fails on a file the checkout leaves out.
 */

/** Each job of a workflow: its name, the paths its checkout keeps (null when it is not sparse), and the scripts it runs. */
function jobs(text) {
  const out = [];
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  for (const block of body.split(/\n(?= {2}[A-Za-z0-9_-]+:\n)/)) {
    const name = /^ {2}([A-Za-z0-9_-]+):/.exec(block)?.[1];
    if (name === undefined) continue;
    const list = /sparse-checkout: \|\n((?: {12}.+\n)+)/.exec(`${block}\n`)?.[1]
      ?? /sparse-checkout: ([^\n|]+)\n/.exec(`${block}\n`)?.[1];
    const sparse = list === undefined ? null : list.split('\n').map((line) => line.trim()).filter(Boolean);
    // Options may come before the script (`node --no-warnings scripts/x.mjs`).
    const scripts = [...new Set([...block.matchAll(/\bnode(?:[ \t]+-\S+)*[ \t]+(scripts\/[A-Za-z0-9_.-]+\.mjs)/g)].map((m) => m[1]))];
    out.push({ name, sparse, scripts });
  }
  return out;
}

/** Every repository file a script loads through relative imports, itself included. */
function loads(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const text = readFileSync(join(ROOT, entry), 'utf8');
  for (const [, spec] of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = posix.normalize(posix.join(posix.dirname(entry), spec));
    if (existsSync(join(ROOT, normalize(target)))) loads(target, seen);
    else seen.add(target);
  }
  return seen;
}

/**
 * Whether a path is kept by a sparse list in non-cone mode: the path itself or
 * a directory above it.
 *
 * Only literal paths are read. Git's non-cone patterns also take globs and
 * `!` exclusions, matched in order, and reading those by hand is where a guard
 * would start answering wrongly, so a list that uses one is refused below
 * rather than guessed at.
 */
const kept = (path, sparse) => sparse.some((entry) => {
  const clean = entry.replace(/^\/+|\/+$/g, '');
  return path === clean || path.startsWith(`${clean}/`);
});

describe('a sparse checkout holds every file the scripts it runs load', () => {
  const workflows = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
  const sparseJobs = workflows.flatMap((file) =>
    jobs(readFileSync(join(WORKFLOWS, file), 'utf8')).filter((job) => job.sparse !== null).map((job) => ({ file, ...job })));

  it('finds the sparse jobs it is meant to watch', () => {
    // A parser that found none would pass everything below.
    assert.ok(sparseJobs.length >= 8, `only ${sparseJobs.length} sparse job(s) found`);
    assert.ok(sparseJobs.some((job) => job.file === 'triage.yml' && job.scripts.includes('scripts/triage.mjs')));
  });

  for (const job of sparseJobs) {
    it(`${job.file} › ${job.name}`, () => {
      const unread = job.sparse.filter((entry) => /[!*?[\\]/.test(entry));
      assert.deepEqual(unread, [], `${job.file} › ${job.name} has sparse patterns this test does not read: ${unread.join(', ')}. List literal paths, or teach kept() Git's pattern rules first.`);
      const missing = job.scripts
        .flatMap((script) => [...loads(script)])
        .filter((path, i, all) => all.indexOf(path) === i && !kept(path, job.sparse));
      assert.deepEqual(missing, [], `${job.file} › ${job.name} runs a script that loads files its checkout leaves out: ${missing.join(', ')}`);
    });
  }

  it('finds a script run with options before its path', () => {
    const [job] = jobs('on: push\njobs:\n  one:\n    steps:\n      - run: node --no-warnings --max-old-space-size=512 scripts/triage.mjs issue\n');
    assert.deepEqual(job.scripts, ['scripts/triage.mjs']);
  });

  it('reads an import the way node resolves it, and a directory entry as keeping what is under it', () => {
    assert.ok(loads('scripts/triage.mjs').has('scripts/pr-readiness.mjs'));
    assert.ok(loads('scripts/pr-readiness.mjs').has('scripts/changes.mjs'));
    assert.equal(kept('scripts/changes.mjs', ['scripts/']), true);
    assert.equal(kept('scripts/changes.mjs', ['scripts/triage.mjs']), false);
    assert.equal(kept('scripts/changes.mjs', ['scripts/changes.mjs.bak']), false);
  });
});
