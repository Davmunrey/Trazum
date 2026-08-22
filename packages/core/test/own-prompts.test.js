import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import * as core from '../dist/index.js';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The tokens this project puts on somebody else's bill.
 *
 * `our-own-medicine.md` admits this project has no usage log of its own: it
 * optimises LLM spend and does not itself spend on LLMs in a way it measures.
 * That is still true and this does not change it.
 *
 * **What it had also never measured is the spend it causes.** Four system
 * prompts ship in `@trazum/core` and are sent to a model on every `--llm`,
 * `--suggest`, `--semantic` and examples-review run — on the user's key, on the
 * user's bill, before a single token of their own prompt is counted. A tool that
 * reports other people's prompt cost and has never counted its own is the
 * self-report problem in its most literal form.
 *
 * So the figures are measured here, by running the optimiser on them, and
 * published on the page. This test is what stops the published figures drifting
 * from the prompts.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const AGGRESSIVE = { level: 'aggressive' };

/**
 * The shipped prompts, derived from the package's own exports.
 *
 * Read off `index.ts` rather than listed here, so a fifth prompt exported
 * without being measured fails the build instead of quietly joining the bill.
 */
const exportedPromptNames = () => {
  const source = readFileSync(join(repoRoot, 'packages', 'core', 'src', 'index.ts'), 'utf8');
  return [...new Set([...source.matchAll(/\b([A-Z_]+_SYSTEM_PROMPT)\b/g)].map((m) => m[1]))].sort();
};

/** What each one is called on the page, and the export it names. */
const MEASURED = {
  suggest: 'SUGGEST_SYSTEM_PROMPT',
  semantic: 'SEMANTIC_SYSTEM_PROMPT',
  refiner: 'REFINER_SYSTEM_PROMPT',
  'example-review': 'EXAMPLE_REVIEW_SYSTEM_PROMPT',
};

const measure = (name) => core.optimize(core[MEASURED[name]], AGGRESSIVE);

describe('every prompt this project ships is measured', () => {
  it('measures each one the package exports, and no phantom', () => {
    assert.deepEqual(
      Object.values(MEASURED).sort(),
      exportedPromptNames(),
      'a system prompt ships unmeasured, or this test names one that does not exist',
    );
  });

  it('would notice a fifth prompt added without being measured', () => {
    // The check above only ever sees today's four. Handed a source that exports
    // a fifth, the comparison must reject it.
    const fabricated = 'export { JUDGE_SYSTEM_PROMPT } from "./judge.js";';
    const found = [...new Set([...fabricated.matchAll(/\b([A-Z_]+_SYSTEM_PROMPT)\b/g)].map((m) => m[1]))];
    assert.deepEqual(found, ['JUDGE_SYSTEM_PROMPT']);
    assert.notDeepEqual(found, Object.values(MEASURED).sort());
  });

  it('every measured export is a non-empty string', () => {
    for (const [name, exported] of Object.entries(MEASURED)) {
      assert.equal(typeof core[exported], 'string', `${name} is not exported as a string`);
      assert.ok(core[exported].length > 100, `${name} is suspiciously short`);
    }
  });
});

describe('what the optimiser recovers from them', () => {
  /**
   * The uncomfortable number, and the reason it is on the page rather than in a
   * comment. Recorded rather than asserted at a threshold: a bar would turn a
   * measurement into a target, and this is a fact about four prompts, not a
   * goal for them.
   */
  const page = () => readFileSync(join(repoRoot, 'docs', 'our-own-medicine.md'), 'utf8');
  const section = () => sectionOf(page(), '## The tokens this project puts on your bill');

  it('publishes the figure each prompt actually produces', () => {
    const text = section();
    const wrong = [];
    for (const name of Object.keys(MEASURED)) {
      const result = measure(name);
      const row = text.match(new RegExp(`^\\| \`${name}\` \\| (\\d+) \\| (\\d+) \\|`, 'm'));
      if (row === null) {
        wrong.push(`${name}: no row on the page`);
        continue;
      }
      if (Number(row[1]) !== result.tokensBefore) {
        wrong.push(`${name}: page says ${row[1]} tokens, optimiser counts ${result.tokensBefore}`);
      }
      if (Number(row[2]) !== result.tokensSaved) {
        wrong.push(`${name}: page says ${row[2]} recovered, optimiser recovers ${result.tokensSaved}`);
      }
    }
    assert.deepEqual(wrong, [], `the published measurement has drifted:\n  ${wrong.join('\n  ')}`);
  });

  it('publishes the total, and it is the sum of the rows', () => {
    const text = section();
    const before = Object.keys(MEASURED).reduce((sum, name) => sum + measure(name).tokensBefore, 0);
    const saved = Object.keys(MEASURED).reduce((sum, name) => sum + measure(name).tokensSaved, 0);
    assert.match(text, new RegExp(`\\*\\*${before} tokens\\*\\*`));
    assert.match(text, new RegExp(`\\b${saved} of them\\b`));
  });

  it('would notice a figure that had drifted from the prompt', () => {
    // Handed a row quoting a count nothing produces, the comparison must reject it.
    const row = '| `suggest` | 9999 | 0 |'.match(/^\| `suggest` \| (\d+) \| (\d+) \|/);
    assert.notEqual(Number(row[1]), measure('suggest').tokensBefore);
  });

  it('does not claim an admission fell that did not', () => {
    /**
     * The arc asks for an admission to stop being true *with a measurement*.
     * This chapter measures something adjacent — the cost this project imposes,
     * not the cost it incurs — and the page has to keep saying so, or it is
     * claiming more than was measured.
     */
    const whole = page();
    assert.match(whole, /no usage log of (its|this project's) own/);
    assert.match(section(), /does not make that admission false|still true/);
  });
});
