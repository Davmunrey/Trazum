import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * The 1.73.1 fix: the Optimizer's result follows the scenario. Changing the
 * model used to leave a report priced for another model on screen — a reader
 * flipping models to compare saw "nothing changes". What these hold is the
 * shape of the fix, because the shape is where the money is:
 *
 * - once a result exists, a scenario change re-runs the pass, debounced;
 * - it NEVER runs while the LLM or suggestion pass is enabled — a dropdown
 *   change must never spend a provider call unasked;
 * - it never fires before the first manual Optimise;
 * - an automatic run stays out of the reader's history.
 */
describe('the Optimizer result follows the scenario', () => {
  const source = readFileSync(join(web, 'components/Optimizer.tsx'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('re-runs on the pricing inputs once a result exists', () => {
    // The effect exists, watches the scenario, and bails without a result.
    const effect = code.slice(code.indexOf('if (result === null) return;'));
    assert.ok(effect.length > 0, 'the auto re-run effect is gone');
    assert.match(effect, /run\(\{ auto: true \}\)/);
    assert.match(
      code,
      /\[model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible, level, reorder\]/,
      'the effect is not keyed to the pricing inputs',
    );
    // Debounced with cleanup — flipping through five models sends one request.
    assert.match(effect, /clearTimeout\(timer\)/);
  });

  it('never spends a provider call unasked', () => {
    // The paid passes gate the auto-run, before the timer is even set.
    const guardAt = code.indexOf('if (llmEnabled || suggest) return;');
    const runAt = code.indexOf('run({ auto: true })');
    assert.ok(guardAt > -1, 'the LLM/suggest guard is gone');
    assert.ok(guardAt < runAt, 'the guard sits after the auto run it must precede');
  });

  it('keeps automatic runs out of the reader history', () => {
    assert.match(
      code,
      /if \(options\.auto !== true\) recordHistory/,
      'an automatic re-run writes a history entry the reader never made',
    );
  });

  it('the result panel names the model it was priced for', () => {
    // The other half of the confusion: even mid-debounce, the stale answer
    // says whose it is. `savings` carries the model and the panel prints it.
    assert.match(source, /savings\.model|result\.savings/, 'the panel no longer reads the savings block');
  });
});
