import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

/**
 * Nothing this repository has built is listed as a thing it might build.
 *
 * `ROADMAP.md` ends with **Under consideration**, whose one job is to say
 * *"not scheduled, and here is the reasoning"*. Two of its five entries were
 * shipped products. The editor extension went out as `trazum-vscode` in 1.86.0
 * and the per-model-family tokenizer as `@trazum/tokenizer-openai` in 1.85.0,
 * and the same file recorded both as **released** two hundred lines above,
 * while the section below went on describing them as ideas — one of them with
 * the words *"still unscheduled"*.
 *
 * The moment something is built is exactly the moment nobody remembers to move
 * it, which is why this is a test rather than a habit. The sibling repository
 * has held the same property since its README existed: *"the moment something
 * is built it has to move out of the 'not built' table, and that move is the
 * one people forget."* This repository, which is the one strangers read, did
 * not.
 *
 * **Derived from the workspaces, not from a list of products to check.**
 * `package.json` says what this repository builds, so a workspace added later
 * arrives here without being invited and fails until somebody says how the
 * roadmap would name it. A guard carrying its own hand-written list of products
 * would go stale in exactly the way the section it guards did.
 *
 * **Bounded to each entry's title, not its body.** The first draft read the
 * whole section and flagged three things, two of them wrongly: the paragraph
 * that explains why the stale entries were removed names both of them, and
 * `Cost alerting` mentions the CLI while proposing something else entirely. An
 * entry *offers to build* what its title names; a mention in the reasoning is
 * how these entries argue, and a guard that cannot tell the two apart makes the
 * section unwritable.
 */

/** What this repository builds, from the manifest that builds it. */
function workspaces() {
  const globs = JSON.parse(read('package.json')).workspaces ?? [];
  assert.ok(globs.length > 0, 'package.json declares no workspaces');
  const found = [];
  for (const pattern of globs) {
    const [base, star] = pattern.split('/');
    assert.equal(star, '*', `this walk only understands "dir/*", not ${pattern}`);
    for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(ROOT, base, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      found.push({
        path: `${base}/${entry.name}`,
        name: JSON.parse(readFileSync(manifest, 'utf8')).name,
      });
    }
  }
  assert.ok(found.length >= 4, `only ${found.length} workspaces found — the walk is wrong`);
  return found;
}

/**
 * How an entry's title would name each thing this repository builds.
 *
 * Prose, because that is what the section is written in: nobody titles an entry
 * `trazum-vscode` when arguing about whether to build it. A workspace with no
 * phrase fails below rather than being skipped — the two entries that went
 * stale were both things nobody thought to look for.
 */
const TITLED_AS = {
  'packages/core': [/\bcore library\b/i],
  'packages/cli': [/^the CLI\b/i],
  'packages/mcp': [/\bMCP server\b/i],
  'packages/tokenizer-openai': [/\btokenizer\b/i],
  'apps/web': [/\b(web app|landing page)\b/i],
  'apps/vscode': [/\beditor extension\b/i],
};

/** Every entry under the heading whose whole meaning is "not built". */
function entries() {
  const roadmap = read('ROADMAP.md');
  const from = roadmap.indexOf('\n## Under consideration');
  assert.notEqual(from, -1, 'ROADMAP.md no longer has an "Under consideration" section');
  const next = roadmap.indexOf('\n## ', from + 1);
  const section = roadmap.slice(from, next === -1 ? roadmap.length : next);

  /*
    Split rather than matched. The first attempt used `$` under the `m` flag,
    where it means end of *line*, so every body stopped at the first newline and
    two entries were reported as naming no blocker while naming one on line two.
    A parser that reads less than it claims to fails loudly here; the version to
    fear reads less and passes.
  */
  const found = section
    .split('\n- **')
    .slice(1)
    .map((chunk) => {
      const close = chunk.indexOf('**');
      assert.notEqual(close, -1, `an entry has no bolded title: ${chunk.slice(0, 40)}`);
      return {
        title: chunk.slice(0, close).replace(/[.:]$/, '').trim(),
        body: chunk.slice(close + 2),
      };
    });
  assert.ok(found.length >= 2, `only ${found.length} entries parsed — the parse is wrong`);
  return found;
}

describe('the roadmap does not offer to build what it has built', () => {
  it('has a phrase for every workspace, so a new package cannot arrive unwatched', () => {
    const missing = workspaces()
      .map(({ path }) => path)
      .filter((path) => !(path in TITLED_AS));
    assert.deepEqual(
      missing,
      [],
      'these workspaces exist and this guard has no phrase for how the roadmap would '
        + `title them, so it cannot tell whether they are offered as ideas: ${missing.join(', ')}`,
    );
  });

  it('never titles an entry after a workspace that ships', () => {
    const titles = entries().map(({ title }) => title);
    const offered = [];
    for (const { path, name } of workspaces()) {
      for (const phrase of TITLED_AS[path] ?? []) {
        const hit = titles.find((title) => phrase.test(title));
        if (hit !== undefined) offered.push(`"${hit}" is ${name}, which ships`);
      }
    }
    assert.deepEqual(
      offered,
      [],
      `built and published, and still listed as something to consider: ${offered.join('; ')}`,
    );
  });

  it('and every entry left there says what is blocking it', () => {
    /*
      The other half of the heading's meaning. An entry with no blocker is not
      "not scheduled", it is a to-do nobody costed, and the doctrine's rule is
      that a refusal names what is missing.
    */
    const silent = entries()
      .filter(({ body }) => !/unscheduled|not scheduled|blocked|needs|would need|until|nobody/i.test(body))
      .map(({ title }) => title);
    assert.deepEqual(silent, [], `these say nothing about what blocks them: ${silent.join(', ')}`);
  });
});
