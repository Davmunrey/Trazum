import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { TARGETS, functionsOf, pathOf } from '../scripts/mutate.mjs';
import { OPERATORS, applyMutant, functionRanges, mutantsOf, withIds, withinFunctions } from '../scripts/mutation.mjs';

/**
 * The mutation tool against the real parser.
 *
 * `packages/core/test/mutation.test.js` holds every decision on trees written
 * by hand. This holds the one thing those cannot: that acorn's trees are read
 * the way the hand-written ones are, on code shaped like the code the build
 * emits. It runs where the parser is installed, which is the Mutation workflow
 * and anybody's machine after
 *
 *   npm install --prefix "$DIR" --no-save --ignore-scripts acorn@8.19.0
 *   TRAZUM_ACORN="$DIR/node_modules/acorn" npm run test:mutation
 *
 * Without `TRAZUM_ACORN` it fails and says so. A file that skipped itself
 * would report a pass for a check that never ran.
 */

if (!process.env.TRAZUM_ACORN) {
  throw new Error('mutation-parser.test.mjs needs TRAZUM_ACORN: the directory acorn is installed in');
}
const { parse } = await import(pathToFileURL(join(resolve(process.env.TRAZUM_ACORN), 'dist/acorn.mjs')).href);
const tree = (text) => parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
const mutated = (text) => mutantsOf(tree(text), text).map((mutant) => applyMutant(text, mutant));
const kinds = (text) => mutantsOf(tree(text), text).map((mutant) => mutant.operator);

describe('acorn\'s trees are mutated where the operators really are', () => {
  it('finds an operator between parenthesised operands and past a comment', () => {
    assert.deepEqual(mutated('x = (a) /* a < b */ < (b);'), ['x = (a) /* a < b */ <= (b);', 'x = (a) /* a < b */ >= (b);']);
    assert.deepEqual(mutated('x = (a + b) * (c);').sort(), ['x = (a + b) / (c);', 'x = (a - b) * (c);']);
  });

  it('does not mistake a longer operator for a shorter one', () => {
    assert.deepEqual(mutated('x = a <= b;'), ['x = a < b;', 'x = a > b;']);
    assert.deepEqual(mutated('x = a !== b;'), ['x = a === b;']);
    // A shift, an exponent and a plain assignment have no mutant: only what is listed does.
    assert.deepEqual(mutated('x = a << b; y = a ** b; z = a;'), []);
  });

  it('removes only the negation in front of a parenthesised condition', () => {
    assert.deepEqual(mutated('x = !(a);'), ['x = (a);']);
    assert.deepEqual(mutated('x = !!a;'), ['x = !a;', 'x = !a;']);
  });

  it('leaves a sentence alone and still mutates a sum', () => {
    assert.deepEqual(kinds("x = 'a' + b; y = `a${b}` + c; z = a + b;"), ['arithmetic']);
  });

  it('forces an if both ways, a ternary both ways, and a loop only off', () => {
    const forced = (text) => mutated(text).filter((changed) => /true|false/.test(changed));
    assert.deepEqual(forced('if (a) b();'), ['if (false) b();', 'if (true) b();']);
    assert.deepEqual(forced('x = a ? 1 : 2;'), ['x = false ? 1 : 2;', 'x = true ? 1 : 2;']);
    assert.deepEqual(forced('while (a) b();'), ['while (false) b();']);
    assert.deepEqual(forced('do { b(); } while (a);'), ['do { b(); } while (false);']);
    assert.deepEqual(forced('for (; a; ) b();'), ['for (; false; ) b();']);
  });

  it('never touches a for loop\'s counter, and does reverse any other', () => {
    const loop = 'for (let i = 0; i < n; i++) { total++; }';
    const all = mutated(loop);
    assert.ok(all.includes('for (let i = 0; i < n; i++) { total--; }'));
    assert.equal(all.some((text) => text.includes('i--')), false);
  });

  it('leaves the counter alone however it is written, and still moves the start and the bound', () => {
    const loop = 'for (let pass = 0; pass < LIMIT; pass += 1) { run(); }';
    const all = mutated(loop);
    assert.equal(all.some((text) => /pass -= 1|pass \+= 2/.test(text)), false);
    assert.ok(all.includes('for (let pass = 1; pass < LIMIT; pass += 1) { run(); }'));
    assert.ok(all.includes('for (let pass = 0; pass <= LIMIT; pass += 1) { run(); }'));
    assert.deepEqual(mutated('for (;; i = i + 1) {}'), []);
  });

  it('takes out a call that stands as a statement, awaited or not, and never a super call', () => {
    assert.deepEqual(kinds('list.push(a);'), ['call-removed']);
    assert.deepEqual(kinds('async function f() { await save(a); }'), ['call-removed']);
    assert.deepEqual(kinds('class A extends B { constructor() { super(); } }'), []);
    // A call whose value is used is not a statement to remove.
    assert.deepEqual(kinds('const x = f(a);'), []);
  });

  it('swaps a method for its opposite, and min for max only on Math', () => {
    assert.deepEqual(mutated('x = a.some(f);'), ['x = a.every(f);']);
    assert.deepEqual(mutated('x = a.startsWith(f);'), ['x = a.endsWith(f);']);
    assert.deepEqual(mutated('x = Math.min(a, b);'), ['x = Math.max(a, b);']);
    assert.deepEqual(mutated('x = other.min(a, b);'), []);
    assert.deepEqual(mutated("x = a['some'](f);"), []);
  });

  it('leaves regular expressions, strings and templates as they are', () => {
    assert.deepEqual(mutated('x = /a<b|c>=d/u; y = "a < b"; z = `a && ${q}`;'), []);
  });

  it('names the function around a mutant however the function is written', () => {
    const text = [
      'function plain() { return a < b; }',
      'const arrow = () => a < b;',
      'const object = { method() { return a < b; }, key: () => a < b };',
      'class K { member() { return a < b; } }',
      'export const top = a < b;',
    ].join('\n');
    const names = [...new Set(mutantsOf(tree(text), text).map((mutant) => mutant.fn))];
    assert.deepEqual(names, ['plain', 'arrow', 'method', 'key', 'member', '<module>']);
  });
});

describe('a target that is part of a file is found in acorn\'s tree', () => {
  const text = [
    'export function chosen(a, b) { const inner = () => a < b; return inner() && a > 0; }',
    'function other(a, b) { return a < b; }',
    'export const arrow = (a, b) => a * b;',
    'const helpers = { add(a, b) { return a + b; } };',
    'export const RATES = [1.25, 2, 0.1];',
  ].join('\n');
  const parsed = tree(text);
  const chosen = (names) => withinFunctions(mutantsOf(parsed, text), functionRanges(parsed, names));

  it('takes everything inside an exported function, its inner functions included, and nothing outside', () => {
    const mutants = chosen(['chosen']);
    assert.deepEqual([...new Set(mutants.map((mutant) => mutant.fn))].sort(), ['chosen', 'inner']);
    for (const mutant of mutants) assert.ok(mutant.end <= text.indexOf('\n'), mutant.replacement);
  });

  it('finds a function written as an exported arrow, and leaves the numbers of the data alone', () => {
    const mutants = chosen(['arrow', 'other']);
    assert.deepEqual(mutants.map((mutant) => applyMutant(text, mutant).split('\n').find((line, at) => line !== text.split('\n')[at])), [
      'function other(a, b) { return a <= b; }',
      'function other(a, b) { return a >= b; }',
      'export const arrow = (a, b) => a / b;',
    ]);
  });

  it('does not take a method of an object for a top-level function of the same name', () => {
    assert.throws(() => chosen(['add']), /no top-level function named add/);
  });
});

describe('every mutant of every target is real code with a name of its own', () => {
  const root = new URL('../', import.meta.url);
  for (const entry of TARGETS) {
    const target = pathOf(entry);
    it(`${target}: each mutant parses, differs from the original and is named once`, () => {
      const built = new URL(target.replace('/src/', '/dist/').replace(/\.ts$/, '.js'), root);
      const text = readFileSync(built, 'utf8');
      const parsed = tree(text);
      const functions = functionsOf(entry);
      // Part of a file: every listed function is found, and each has something in it to change.
      const found = functions === null
        ? mutantsOf(parsed, text)
        : withinFunctions(mutantsOf(parsed, text), functionRanges(parsed, functions));
      const mutants = withIds(found, text, target);
      assert.ok(mutants.length > 0, 'nothing to mutate in a target');
      for (const mutant of mutants) {
        assert.ok(OPERATORS.includes(mutant.operator), mutant.operator);
        const changed = applyMutant(text, mutant);
        assert.notEqual(changed, text, mutant.after);
        assert.doesNotThrow(() => tree(changed), `${mutant.operator}: ${mutant.after}`);
      }
      assert.equal(new Set(mutants.map((mutant) => mutant.id)).size, mutants.length, 'two mutants share a name');
    });
  }
});
