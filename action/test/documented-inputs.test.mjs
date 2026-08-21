import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = new URL('../../', import.meta.url).pathname;

/**
 * Every `with:` key shown in the documentation is an input the Action declares.
 *
 * `docs/ci.md` opened its GitHub Actions section with:
 *
 *     with:
 *       path: prompts/
 *       max-tokens: '900'
 *
 * There is no `path` input and there never has been — `git log -S` on
 * `action.yml` finds it in no revision. The page shipped at 1.48.0 and has said
 * it since the release that introduced it, so **the first example on the page a
 * reader lands on to set up CI has never worked**.
 *
 * What saves it from being worse is the Action's own refusal: with no `target`
 * and no `usage-log` it stops with *"Set the 'target' input…"*. So a reader
 * copying it got a red build naming the right input, not a green build gating
 * nothing. That distinction is the difference between a wasted afternoon and a
 * budget everyone believed in — and it is the reason a refusal is worth writing
 * even where nobody expects to need it.
 *
 * Derived from `action.yml`, across every markdown file, because the README
 * carries three of these examples and they were right the whole time.
 */

const inputsOf = () => {
  const yaml = readFileSync(join(repoRoot, 'action.yml'), 'utf8');
  const block = yaml.slice(yaml.indexOf('\ninputs:'), yaml.indexOf('\nruns:'));
  const names = [...block.matchAll(/^ {2}([a-z][a-z-]*):$/gm)].map((m) => m[1]);
  assert.ok(names.length > 10, `only ${names.length} inputs parsed from action.yml — has it moved?`);
  return new Set(names);
};

/** Every `with:` block following a `uses:` line that names this Action. */
const examplesIn = (text) => {
  const found = [];
  for (const match of text.matchAll(/uses: Davmunrey\/Trazum@[^\n]*\n([\s\S]*?)(?=\n```|\n\n)/g)) {
    const body = match[1];
    const withAt = body.indexOf('with:');
    if (withAt === -1) continue;
    // Keys indented under `with:`, stopping at the first line indented less.
    const lines = body.slice(withAt).split('\n').slice(1);
    const indent = lines[0]?.match(/^(\s*)/)?.[1].length ?? 0;
    for (const line of lines) {
      if (line.trim() === '') continue;
      if ((line.match(/^(\s*)/)?.[1].length ?? 0) < indent) break;
      const key = line.match(/^\s*([a-z][a-z-]*):/);
      if (key) found.push(key[1]);
    }
  }
  return found;
};

describe('the documented Action inputs are inputs the Action has', () => {
  const declared = inputsOf();
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('.agents/'));

  it('finds the examples at all', () => {
    const total = files.reduce((n, f) => n + examplesIn(readFileSync(join(repoRoot, f), 'utf8')).length, 0);
    assert.ok(total >= 4, `only ${total} documented Action inputs found — has the example shape changed?`);
  });

  for (const file of ['README.md', 'docs/ci.md']) {
    it(`${file} shows only inputs that exist`, () => {
      const used = examplesIn(readFileSync(join(repoRoot, file), 'utf8'));
      const unknown = [...new Set(used)].filter((key) => !declared.has(key));
      assert.deepEqual(
        unknown,
        [],
        `${file} shows these under "with:" and action.yml declares no such input: ${unknown.join(', ')}`,
      );
    });
  }
});
