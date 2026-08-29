import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { openaiCounter } from '@trazum/tokenizer-openai';

/**
 * The CLI declares the shape of the optional counter package instead of
 * importing its type, and this is the check that keeps the two honest.
 *
 * **Why the declaration exists.** `typeof import('@trazum/tokenizer-openai')`
 * is a *compile-time* dependency: `tsc` resolves the module while type-checking,
 * so the CLI could not be built unless the optional package had been built
 * first. CI caught it as `TS2307` on a clean checkout, and it was right to --
 * a package somebody chooses to install had quietly become one this repository
 * could not compile without, which is the opposite of what the word optional
 * promises.
 *
 * **What the declaration costs.** Two descriptions of one interface, which is
 * the shape that goes wrong silently: the package renames a field, the CLI goes
 * on compiling against its own copy, and the failure arrives at runtime as a
 * count that never happens. So the contract is asserted against the real
 * package here, in the workspace where both exist.
 */

describe('the optional counter package still provides what the CLI declares', () => {
  it('returns a counting function, an encoding and the model, on success', async () => {
    const result = await openaiCounter('gpt-5');
    assert.equal(result.ok, true);
    assert.equal(typeof result.count, 'function', 'the CLI calls `count(text)`');
    assert.equal(typeof result.count('hello world'), 'number');
    assert.equal(typeof result.encoding, 'string', 'the CLI puts `encoding` in the provenance');
    assert.equal(typeof result.model, 'string', 'the CLI puts `model` in the provenance');
  });

  it('returns ok false with a refusal, on a model it cannot count', async () => {
    const result = await openaiCounter('claude-sonnet-5');
    assert.equal(result.ok, false);
    assert.equal(typeof result.refusal.reason, 'string');
    assert.equal(typeof result.refusal.model, 'string');
    assert.ok(Array.isArray(result.refusal.known));
  });

  it('names every field the CLI declares, so a rename cannot pass silently', async () => {
    /**
     * Derived from the CLI's own declaration rather than from a list typed
     * here, so a field added to the contract is covered by the commit that
     * adds it. The failure this prevents: the package renames `encoding`, the
     * CLI keeps compiling against its private copy, and the provenance on
     * every exact count silently becomes `undefined`.
     */
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export interface OptionalCounterModule {');
    assert.ok(start > -1, 'the CLI no longer declares the contract — rewrite this check');
    const declared = source.slice(start, source.indexOf('\n}', start));

    const ok = await openaiCounter('gpt-5');
    for (const field of ['count', 'encoding', 'model']) {
      assert.ok(declared.includes(field), `the contract stopped naming ${field}`);
      assert.ok(field in ok, `the package no longer provides ${field}, which the CLI declares`);
    }
  });

  it('is not imported statically anywhere in the CLI', async () => {
    /**
     * The regression itself, rather than its symptom. A static `import ... from
     * '@trazum/tokenizer-openai'` — in a value position or a type one — makes
     * the optional package required to compile, which is exactly the failure
     * this file was written after.
     */
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    /*
     * Comments are stripped first. The first version of this check failed on
     * the doc comment that explains the fix -- a check that cannot tell code
     * from prose about code would force the explanation to be deleted to make
     * the test pass, which is the worst trade in this repository.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /*
     * One rule, not a list of forms, and the reason is a plant that got past
     * the list. The first version checked for a static `import ... from` and
     * for `typeof import(...)`. A plain `await import('@trazum/tokenizer-openai')`
     * with a literal specifier passed all of it and still broke the build:
     * `tsc` resolves a literal dynamic import too.
     *
     * So the invariant is the one that has no forms to enumerate -- **the
     * specifier never appears as a literal in code** -- which is why the loader
     * assembles it from fragments.
     */
    assert.doesNotMatch(
      code,
      /@trazum\/tokenizer-openai/,
      'the optional package is named literally in the CLI, so tsc resolves it at build time and '
        + 'the package can no longer be missing — build the specifier from fragments instead',
    );
    // And the check is not passing because it stripped everything.
    assert.ok(code.includes('localCounterFor'), 'comment stripping removed the code as well');
  });
});
