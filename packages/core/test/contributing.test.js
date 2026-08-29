import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * What CONTRIBUTING.md says each command runs, against what it runs.
 *
 * `npm run build      # core + cli` and `npm test # core + cli test suites`
 * were both written before `@trazum/mcp` existed. By the time this was checked,
 * `build` covered three workspaces and `test` covered five — core, the CLI,
 * MCP, the web app and the Action — and nothing said so. The two CI step names
 * describing the same commands had drifted the same way and for the same
 * reason, so the MCP package's tests ran on every pull request under a label
 * that did not mention them.
 *
 * Nothing was broken by it: the suites ran, and `verify` is still a superset of
 * what CI runs. What was wrong is what a stranger reads to decide whether their
 * change is covered — someone adding an MCP tool could reasonably have believed
 * `npm test` did not reach it.
 *
 * The comment is checked for **membership**, not wording: the sentence may be
 * phrased however reads best, as long as every workspace the script actually
 * drives is named in it. A count would have gone wrong the same way the prose
 * did.
 */

const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;

/** How prose is allowed to name each workspace. Any one of them counts. */
const NAMES = {
  '@trazum/core': ['core'],
  '@trazum/cli': ['CLI', 'cli'],
  '@trazum/mcp': ['MCP', 'mcp'],
  '@trazum/web': ['web'],
  '@trazum/tokenizer-openai': ['tokenizer', 'tokeniser'],
};

/** Workspaces a script drives, plus the Action when it runs that suite. */
const coverageOf = (name) => {
  const body = scripts[name];
  assert.ok(body, `package.json has no "${name}" script any more`);
  // `[a-z-]`, not `[a-z]`. The pattern silently skipped
  // `@trazum/tokenizer-openai` when it was added, so a script that ran it went
  // on being described by a comment that did not mention it -- this file's own
  // failure mode, arriving through its derivation rather than its prose.
  const packages = [...body.matchAll(/-w (@trazum\/[a-z-]+)/g)].map((m) => m[1]);
  const nested = [...body.matchAll(/npm run ([a-z:]+)\b(?! -w)/g)]
    .map((m) => m[1])
    .filter((s) => s !== name && scripts[s]);
  const all = new Set(packages);
  for (const child of nested) for (const w of coverageOf(child)) all.add(w);
  if (/test:action/.test(body) || name === 'test:action') all.add('action');
  return all;
};

describe('CONTRIBUTING describes the commands it prints', () => {
  const contributing = readFileSync(join(repoRoot, 'CONTRIBUTING.md'), 'utf8');

  for (const script of ['build', 'test', 'typecheck']) {
    it(`the comment beside "npm ${script}" names every workspace it runs`, () => {
      const command = script === 'test' ? 'npm test' : `npm run ${script}`;
      const line = contributing
        .split('\n')
        .find((l) => l.startsWith(`${command} `) && l.includes('#'));
      assert.ok(line, `CONTRIBUTING.md no longer prints "${command}" with a comment`);
      const comment = line.slice(line.indexOf('#'));

      const missing = [...coverageOf(script)].filter((w) => {
        if (w === 'action') return !/Action/i.test(comment);
        // "all five workspaces" is a true statement about every workspace.
        if (/all five workspaces/.test(comment)) return false;
        return !NAMES[w].some((n) => comment.includes(n));
      });
      assert.deepEqual(
        missing,
        [],
        `"${command}" runs these and its comment does not name them: ${missing.join(', ')}`,
      );
    });
  }

  it('the CI step names describe the same commands honestly', () => {
    /**
     * The same drift, in the place a contributor looks when a check fails.
     * Read from the workflow rather than kept in step with it by hand.
     */
    const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    const steps = [...ci.matchAll(/- name: (.+)\n\s+run: (npm (?:run )?[a-z:]+)\s*\n/g)];
    assert.ok(steps.length > 2, 'no named npm steps found in ci.yml — has it moved?');

    const wrong = [];
    for (const [, label, command] of steps) {
      const script = command.replace(/^npm (run )?/, '').trim();
      if (!['build', 'test'].includes(script)) continue;
      for (const w of coverageOf(script)) {
        if (w === 'action') {
          if (!/Action/i.test(label)) wrong.push(`${script}: "${label}" omits the Action`);
        } else if (!NAMES[w].some((n) => label.includes(n))) {
          wrong.push(`${script}: "${label}" omits ${w}`);
        }
      }
    }
    assert.deepEqual(wrong, [], `CI step names that hide what they run:\n  ${wrong.join('\n  ')}`);
  });
});
