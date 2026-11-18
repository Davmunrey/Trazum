import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TARGETS, createGate, readsAClock } from '../../../scripts/mutate.mjs';
import {
  OPERATORS,
  againstBaseline,
  applyMutant,
  changedLines,
  decodeMappings,
  failureSummary,
  isCovered,
  lineAt,
  mutantsOf,
  rangesOf,
  scoreTable,
  sourcePosition,
  summarise,
  withIds,
  withScoreTable,
} from '../../../scripts/mutation.mjs';

/**
 * What mutation testing decides, held without running a mutant.
 *
 * `scripts/mutate.mjs` needs a parser, a build and several minutes, so it runs
 * in its own workflow. Every decision it takes is a function in
 * `scripts/mutation.mjs`, and each is held here against the mistake it would
 * make: a mutant in the wrong place, a line counted as run that was not, a
 * recorded survivor mistaken for a new one.
 *
 * The trees below are written by hand in the shape acorn produces. That the
 * real parser's trees are read the same way is `mutation-parser.test.mjs`,
 * which runs where the parser is installed.
 */

const ROOT = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

/** A tree for one expression statement over `text`, the expression built by `build`. */
const id = (text, name, from = 0) => {
  const start = text.indexOf(name, from);
  return { type: 'Identifier', name, start, end: start + name.length };
};
const program = (text, ...body) => ({ type: 'Program', start: 0, end: text.length, body });
const statement = (text, expression) => ({ type: 'ExpressionStatement', start: 0, end: text.length, expression });
const binary = (text, operator, type = 'BinaryExpression') =>
  program(text, statement(text, { type, operator, start: 0, end: text.length - 1, left: id(text, 'a'), right: id(text, 'b') }));
const texts = (text, tree) => mutantsOf(tree, text).map((mutant) => applyMutant(text, mutant));

describe('a mutant is one small change, put exactly where the operator is', () => {
  it('moves a comparison to its boundary and to its opposite', () => {
    assert.deepEqual(texts('a < b;', binary('a < b;', '<')), ['a <= b;', 'a >= b;']);
    assert.deepEqual(texts('a >= b;', binary('a >= b;', '>=')), ['a < b;', 'a > b;']);
  });

  it('turns an equality into its negation and a conjunction into a disjunction', () => {
    assert.deepEqual(texts('a === b;', binary('a === b;', '===')), ['a !== b;']);
    assert.deepEqual(texts('a && b;', binary('a && b;', '&&', 'LogicalExpression')), ['a || b;']);
    assert.deepEqual(texts('a ?? b;', binary('a ?? b;', '??', 'LogicalExpression')), ['a && b;']);
  });

  it('swaps the arithmetic a price is made of', () => {
    assert.deepEqual(texts('a * b;', binary('a * b;', '*')), ['a / b;']);
    assert.deepEqual(texts('a - b;', binary('a - b;', '-')), ['a + b;']);
    assert.deepEqual(texts('a += b;', binary('a += b;', '+=', 'AssignmentExpression')), ['a -= b;']);
  });

  it('finds the operator past parentheses and a comment that contains it', () => {
    // acorn leaves the parentheses out of the operands, so they sit in the gap.
    const text = '(a) /* a < b */ < (b);';
    const tree = program(text, statement(text, {
      type: 'BinaryExpression', operator: '<', start: 0, end: 21, left: id(text, 'a'), right: id(text, 'b', 16),
    }));
    assert.deepEqual(texts(text, tree), ['(a) /* a < b */ <= (b);', '(a) /* a < b */ >= (b);']);
  });

  it('refuses a tree that does not match its text, rather than mutate the wrong place', () => {
    const text = 'a > b;';
    assert.throws(() => mutantsOf(binary(text, '<'), text), /the tree and the text disagree/);
  });

  it('leaves a sentence being put together alone: that plus is not a sum', () => {
    const text = "a + 'x';";
    const tree = program(text, statement(text, {
      type: 'BinaryExpression', operator: '+', start: 0, end: 7, left: id(text, 'a'),
      right: { type: 'Literal', value: 'x', raw: "'x'", start: 4, end: 7 },
    }));
    assert.deepEqual(mutantsOf(tree, text), []);
  });

  it('removes a negation, flips a boolean and moves a number by one', () => {
    const not = '!a;';
    assert.deepEqual(texts(not, program(not, statement(not, {
      type: 'UnaryExpression', operator: '!', prefix: true, start: 0, end: 2, argument: id(not, 'a'),
    }))), ['a;']);
    const literal = (text, value) => program(text, statement(text, { type: 'Literal', value, raw: text.slice(0, -1), start: 0, end: text.length - 1 }));
    assert.deepEqual(texts('true;', literal('true;', true)), ['false;']);
    assert.deepEqual(texts('400;', literal('400;', 400)), ['401;']);
    assert.deepEqual(texts('0.5;', literal('0.5;', 0.5)), ['1.5;']);
    // A number written any other way is left alone: 1e6 plus one is not a boundary anybody meant.
    assert.deepEqual(texts('1e6;', literal('1e6;', 1e6)), []);
  });

  it('forces a condition both ways, and a loop only to not run', () => {
    const text = 'if (a) b;';
    const branch = { type: 'ExpressionStatement', start: 7, end: 9, expression: id(text, 'b') };
    const tree = program(text, { type: 'IfStatement', start: 0, end: 9, test: id(text, 'a'), consequent: branch, alternate: null });
    assert.deepEqual(texts(text, tree), ['if (false) b;', 'if (true) b;']);

    const loop = 'while (a) b;';
    const body = { type: 'ExpressionStatement', start: 10, end: 12, expression: id(loop, 'b') };
    const whileTree = program(loop, { type: 'WhileStatement', start: 0, end: 12, test: id(loop, 'a'), body });
    assert.deepEqual(texts(loop, whileTree), ['while (false) b;'], 'while (true) is a hang, not a finding');
  });

  it('reverses a counter, except the one a for loop counts with', () => {
    const text = 'a++;';
    const update = { type: 'UpdateExpression', operator: '++', prefix: false, start: 0, end: 3, argument: id(text, 'a') };
    assert.deepEqual(texts(text, program(text, statement(text, update))), ['a--;']);

    const loop = 'for (;;a++) b;';
    const inLoop = { ...update, start: 7, end: 10, argument: id(loop, 'a') };
    const body = { type: 'ExpressionStatement', start: 12, end: 14, expression: id(loop, 'b') };
    const tree = program(loop, { type: 'ForStatement', start: 0, end: 14, init: null, test: null, update: inLoop, body });
    assert.deepEqual(mutantsOf(tree, loop), []);
  });

  it('takes a call out, and asks a method the opposite question', () => {
    const text = 'a.some(b);';
    const property = id(text, 'some');
    const call = {
      type: 'CallExpression', start: 0, end: 9, arguments: [id(text, 'b')],
      callee: { type: 'MemberExpression', computed: false, start: 0, end: 6, object: id(text, 'a'), property },
    };
    assert.deepEqual(texts(text, program(text, statement(text, call))), [';', 'a.every(b);']);
  });

  it('swaps min and max only on Math: somebody else\'s min is not the same question', () => {
    const text = 'a.min(b);';
    const call = {
      type: 'CallExpression', start: 0, end: 8, arguments: [id(text, 'b')],
      callee: { type: 'MemberExpression', computed: false, start: 0, end: 5, object: id(text, 'a'), property: id(text, 'min') },
    };
    assert.deepEqual(mutantsOf(program(text, statement(text, call)), text).map((mutant) => mutant.operator), ['call-removed']);
  });

  it('names the function a mutant is in, which is part of how it is remembered', () => {
    const text = 'function f() { a < b; }';
    const inner = { type: 'ExpressionStatement', start: 15, end: 21, expression: {
      type: 'BinaryExpression', operator: '<', start: 15, end: 20, left: id(text, 'a'), right: id(text, 'b'),
    } };
    const tree = program(text, {
      type: 'FunctionDeclaration', start: 0, end: 23, id: id(text, 'f'), params: [],
      body: { type: 'BlockStatement', start: 13, end: 23, body: [inner] },
    });
    assert.deepEqual(mutantsOf(tree, text).map((mutant) => mutant.fn), ['f', 'f']);
    assert.deepEqual(mutantsOf(binary('a < b;', '<'), 'a < b;').map((mutant) => mutant.fn), ['<module>', '<module>']);
  });

  it('only ever makes a change it has a name for', () => {
    const everything = [
      binary('a < b;', '<'), binary('a === b;', '==='), binary('a && b;', '&&', 'LogicalExpression'),
      binary('a * b;', '*'), binary('a += b;', '+=', 'AssignmentExpression'),
    ].flatMap((tree, index) => mutantsOf(tree, ['a < b;', 'a === b;', 'a && b;', 'a * b;', 'a += b;'][index]));
    for (const mutant of everything) assert.ok(OPERATORS.includes(mutant.operator), mutant.operator);
  });
});

describe('a mutant is given only the tests that ran the place it changes', () => {
  // A module of 100 characters, a function in it that was called, and a branch of that function that was not.
  const script = {
    functions: [
      { ranges: [{ startOffset: 0, endOffset: 100, count: 1 }] },
      { ranges: [{ startOffset: 20, endOffset: 60, count: 3 }, { startOffset: 30, endOffset: 40, count: 0 }] },
      { ranges: [{ startOffset: 70, endOffset: 90, count: 0 }] },
    ],
  };
  const ranges = rangesOf(script);

  it('reads the smallest range around an offset, whichever function listed it', () => {
    assert.equal(isCovered(ranges, 5), true, 'module level, run on import');
    assert.equal(isCovered(ranges, 25), true, 'inside the function that was called');
    assert.equal(isCovered(ranges, 35), false, 'the branch that was never taken, inside a function that ran');
    assert.equal(isCovered(ranges, 45), true, 'after that branch, still in the function');
    assert.equal(isCovered(ranges, 75), false, 'a function nobody called, inside a module everybody loaded');
  });

  it('is asked at the start of the expression, because the operator can sit in a range that never ran', () => {
    // `label ?? fallback`, evaluated with label always set. V8 lists the right
    // side as a range of its own, counted zero, starting right after `label`.
    const text = 'key = label ?? fallback;';
    const logical = {
      type: 'LogicalExpression', operator: '??', start: 6, end: 23, left: id(text, 'label'), right: id(text, 'fallback'),
    };
    const tree = program(text, statement(text, {
      type: 'AssignmentExpression', operator: '=', start: 0, end: 23, left: id(text, 'key'), right: logical,
    }));
    const [mutant] = mutantsOf(tree, text);
    assert.equal(applyMutant(text, mutant), 'key = label && fallback;');
    const ran = [{ start: 0, end: 24, count: 7 }, { start: 11, end: 23, count: 0 }];
    assert.equal(isCovered(ran, mutant.start), false, 'at the operator the answer is the right side\'s');
    assert.equal(isCovered(ran, mutant.probe), true, 'at the expression it is the truth');
    assert.equal(mutant.probe, 6);
  });

  it('asks about a method at the start of the call and a counter at the start of its expression', () => {
    const text = 'a.some(b);';
    const call = {
      type: 'CallExpression', start: 0, end: 9, arguments: [id(text, 'b')],
      callee: { type: 'MemberExpression', computed: false, start: 0, end: 6, object: id(text, 'a'), property: id(text, 'some') },
    };
    const method = mutantsOf(program(text, statement(text, call)), text).find((mutant) => mutant.operator === 'method');
    assert.equal(method.start, 2);
    assert.equal(method.probe, 0);

    const counter = 'total++;';
    const update = { type: 'UpdateExpression', operator: '++', prefix: false, start: 0, end: 7, argument: id(counter, 'total') };
    const [reversed] = mutantsOf(program(counter, statement(counter, update)), counter);
    assert.equal(reversed.start, 5);
    assert.equal(reversed.probe, 0);
  });

  it('treats a range as ending before its end offset, and nothing as covering what is outside', () => {
    assert.equal(isCovered(ranges, 40), true);
    assert.equal(isCovered(ranges, 39), false);
    assert.equal(isCovered(ranges, 100), false);
    assert.equal(isCovered([], 0), false);
  });
});

describe('a survivor is reported at the line of TypeScript it came from', () => {
  // Three generated lines. The second has two segments: column 0 from source
  // line 4 and column 8 from source line 6. The third maps nothing.
  // AAAA = [0,0,0,0]; AAIA = [0,0,4,0] and QAEA = [8,0,2,0] on the second line.
  const decoded = decodeMappings('AAAA;AAIA,QAEA;');

  it('decodes segments as running totals, the column starting over on each line', () => {
    assert.deepEqual(decoded[0], [{ column: 0, source: 0, line: 0, sourceColumn: 0 }]);
    assert.deepEqual(decoded[1], [
      { column: 0, source: 0, line: 4, sourceColumn: 0 },
      { column: 8, source: 0, line: 6, sourceColumn: 0 },
    ]);
    assert.deepEqual(decoded[2], []);
  });

  it('starts the column over on every generated line', () => {
    // QAAA is column 8 on the first line. The next line's AACA is column 0,
    // not 8: only the source position runs on from line to line.
    const two = decodeMappings('QAAA;AACA');
    assert.equal(two[0][0].column, 8);
    assert.equal(two[1][0].column, 0);
    assert.equal(two[1][0].line, 1);
  });

  it('answers with the last segment at or before the column, counted from one', () => {
    assert.deepEqual(sourcePosition(decoded, 1, 0), { source: 0, line: 5 });
    assert.deepEqual(sourcePosition(decoded, 1, 7), { source: 0, line: 5 });
    assert.deepEqual(sourcePosition(decoded, 1, 8), { source: 0, line: 7 });
    assert.deepEqual(sourcePosition(decoded, 1, 50), { source: 0, line: 7 });
  });

  it('says nothing about a line the map says nothing about', () => {
    assert.equal(sourcePosition(decoded, 2, 0), null);
    assert.equal(sourcePosition(decoded, 9, 0), null);
  });

  it('reads a negative step, which is how a map goes back up the source', () => {
    // AACA = +1 line, then AADA = -1 line.
    const back = decodeMappings('AACA;AADA');
    assert.equal(back[0][0].line, 1);
    assert.equal(back[1][0].line, 0);
  });

  it('refuses a character that is not a source-map digit', () => {
    assert.throws(() => decodeMappings('AA!A'), /not a source-map digit/);
  });

  it('finds an offset\'s line, column and text', () => {
    const text = 'one\n  two < 2\nthree';
    assert.deepEqual(lineAt(text, text.indexOf('<')), { line: 1, column: 6, text: '  two < 2' });
    assert.deepEqual(lineAt(text, 0), { line: 0, column: 0, text: 'one' });
    assert.deepEqual(lineAt(text, text.length - 1), { line: 2, column: 4, text: 'three' });
  });
});

describe('a mutant keeps its name when the file around it changes', () => {
  const tree = (text) => {
    const start = text.indexOf('a < b');
    return program(text, { type: 'ExpressionStatement', start, end: start + 6, expression: {
      type: 'BinaryExpression', operator: '<', start, end: start + 5, left: id(text, 'a', start), right: id(text, 'b', start),
    } });
  };
  const named = (text, file = 'x.ts') => withIds(mutantsOf(tree(text), text), text, file);

  it('shows the line without and with the change', () => {
    const [boundary] = named('  a < b;');
    assert.equal(boundary.before, 'a < b;');
    assert.equal(boundary.after, 'a <= b;');
    assert.match(boundary.id, /^[0-9a-f]{12}$/);
  });

  it('does not change a name because lines were added above or the indentation moved', () => {
    const before = named('a < b;').map((mutant) => mutant.id);
    const after = named('// a new comment\n\n      a < b;').map((mutant) => mutant.id);
    assert.deepEqual(after, before);
  });

  it('gives a different name to a different change, a different file and a different function', () => {
    const [boundary, opposite] = named('a < b;');
    assert.notEqual(boundary.id, opposite.id);
    assert.notEqual(named('a < b;', 'y.ts')[0].id, boundary.id);
  });

  it('tells apart the same change made twice on identical lines of one function', () => {
    const text = 'a < b;\na < b;';
    const second = text.lastIndexOf('a < b');
    const two = program(text,
      tree(text).body[0],
      { type: 'ExpressionStatement', start: second, end: second + 6, expression: {
        type: 'BinaryExpression', operator: '<', start: second, end: second + 5,
        left: id(text, 'a', second), right: id(text, 'b', second),
      } },
    );
    const ids = withIds(mutantsOf(two, text), text, 'x.ts').map((mutant) => mutant.id);
    assert.equal(new Set(ids).size, 4);
  });
});

describe('the score counts what was caught, out of everything that could be changed', () => {
  const result = (status, id = status) => ({ status, id });

  it('counts a hang as caught and an unreached mutant as not', () => {
    const summary = summarise([result('killed'), result('killed'), result('timeout'), result('survived'), result('uncovered')]);
    assert.deepEqual(summary, { mutants: 5, killed: 2, timeout: 1, survived: 1, uncovered: 1, score: 60 });
  });

  it('rounds to one decimal', () => {
    assert.equal(summarise([result('killed'), result('killed'), result('survived')]).score, 66.7);
  });

  it('has no score for nothing, which is not a perfect one', () => {
    assert.equal(summarise([]).score, null);
  });
});

describe('a run is held against the record, not against perfection', () => {
  const recorded = [{ id: 'old-1' }, { id: 'old-2' }];
  const result = (id, status) => ({ id, status });

  it('passes a survivor that is on record and names one that is not', () => {
    const { fresh } = againstBaseline(recorded, [result('old-1', 'survived'), result('new-1', 'survived'), result('k', 'killed')]);
    assert.deepEqual(fresh.map((mutant) => mutant.id), ['new-1']);
  });

  it('counts a mutant no test reaches as alive: that is a survivor too', () => {
    const { fresh } = againstBaseline(recorded, [result('new-2', 'uncovered')]);
    assert.deepEqual(fresh.map((mutant) => mutant.id), ['new-2']);
  });

  it('says which recorded survivors are gone, so the record can be written again', () => {
    const { recovered } = againstBaseline(recorded, [result('old-1', 'killed'), result('old-2', 'survived')]);
    assert.deepEqual(recovered.map((mutant) => mutant.id), ['old-1']);
  });

  it('does not call a survivor gone because a partial run never looked at it', () => {
    const results = [result('old-1', 'killed')];
    const { recovered } = againstBaseline(recorded, results, new Set(['old-1']));
    assert.deepEqual(recovered.map((mutant) => mutant.id), ['old-1'], 'old-2 was not looked at and is not reported');
  });
});

describe('a pull request can be asked about only the lines it changes', () => {
  const diff = [
    'diff --git a/packages/core/src/rules.ts b/packages/core/src/rules.ts',
    '--- a/packages/core/src/rules.ts',
    '+++ b/packages/core/src/rules.ts',
    '@@ -10,2 +10,3 @@ export function a() {',
    '+one',
    '@@ -40 +41 @@',
    '+two',
    '@@ -60,3 +60,0 @@',
    '-gone',
    'diff --git a/packages/core/src/old.ts b/packages/core/src/old.ts',
    '--- a/packages/core/src/old.ts',
    '+++ /dev/null',
    '@@ -1,5 +0,0 @@',
  ].join('\n');
  const lines = changedLines(diff);

  it('reads each hunk\'s new lines', () => {
    const rules = lines.get('packages/core/src/rules.ts');
    for (const line of [10, 11, 12, 41]) assert.ok(rules.has(line), `line ${line}`);
    assert.equal(rules.has(13), false);
    assert.equal(rules.has(40), false);
  });

  it('marks both sides of a cut: what was removed changed what is next to it', () => {
    const rules = lines.get('packages/core/src/rules.ts');
    assert.ok(rules.has(60));
    assert.ok(rules.has(61));
  });

  it('has nothing to say about a file that was deleted', () => {
    assert.deepEqual([...lines.keys()], ['packages/core/src/rules.ts']);
  });
});

describe('what is mutated, and how it is served', () => {
  it('targets files that exist', () => {
    assert.ok(TARGETS.length > 0);
    for (const target of TARGETS) assert.ok(existsSync(new URL(target, ROOT)), target);
  });

  it('serves a mutant to one process and leaves the built file alone', () => {
    const loader = read('scripts/mutant-loader.mjs');
    assert.match(loader, /if \(candidate !== url\) return nextLoad\(candidate, context\)/);
    assert.doesNotMatch(loader, /writeFileSync|renameSync|copyFileSync/);
    const runner = read('scripts/mutate.mjs');
    assert.doesNotMatch(runner, /writeFileSync\((?:built|target\.built)/, 'the runner writes into dist');
  });

  it('checks the loader both ways before trusting a single result', () => {
    const runner = read('scripts/mutate.mjs');
    assert.match(runner, /if \(!unchanged\.passed \|\| thrown\.passed\)/);
    assert.ok(runner.indexOf('!unchanged.passed || thrown.passed') < runner.indexOf('// 4. Each mutant'));
  });

  it('says which files the tests left changed, before it writes any of its own', () => {
    const runner = read('scripts/mutate.mjs');
    assert.match(runner, /const treeBefore = treeState\(\);\n {2}try \{/);
    const told = runner.indexOf('reportLeftBehind(treeBefore);\n    report(targets, results, options);');
    assert.notEqual(told, -1, 'the run no longer compares the tree before its own record is written');
    assert.match(runner, /reportLeftBehind\(treeBefore\);\n {6}return;/, 'the audit does not say what it left');
  });

  it('checks that every mutant parses, so a syntax error is never counted as a kill', () => {
    const runner = read('scripts/mutate.mjs');
    assert.match(runner, /parseModule\(applyMutant\(text, mutant\)\)/);
  });
});

describe('the workflow asks a pull request about its own lines and the week about all of them', () => {
  const workflow = read('.github/workflows/mutation.yml');
  const step = (name) => {
    const start = workflow.indexOf(`- name: ${name}`);
    assert.notEqual(start, -1, `no step named "${name}"`);
    const next = workflow.indexOf('\n      - name:', start + 1);
    return workflow.slice(start, next === -1 ? workflow.length : next);
  };

  it('limits a pull request to the lines changed since its base, and fails on a new survivor', () => {
    const pull = step('Mutants on the lines this pull request changes');
    assert.match(pull, /if: github\.event_name == 'pull_request'/);
    assert.match(pull, /--since "\$BASE_SHA" --check/);
    // The base commit reaches the shell as a variable, never as text pasted into the script.
    assert.match(pull, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.doesNotMatch(pull.slice(pull.indexOf('run:')), /\$\{\{/);
  });

  it('runs every target on the schedule, with nothing that narrows the run', () => {
    const whole = step('Every mutant of every target');
    assert.match(whole, /if: github\.event_name != 'pull_request'/);
    assert.match(whole, /mutate\.mjs --acorn \S+ --check\n/);
    assert.doesNotMatch(whole, /--since|--only|--survivors/);
    assert.match(workflow, /schedule:\n(?:\s+#.*\n)*\s+- cron: '\d+ \d+ \* \* 1'/);
  });

  it('holds the tool against the real parser before it trusts the tool', () => {
    const held = step('The tool reads the real parser\'s trees the way its tests assume');
    assert.match(held, /^ {8}run: npm run test:mutation$/m);
    assert.match(held, /TRAZUM_ACORN: \$\{\{ runner\.temp \}\}\/parser\/node_modules\/acorn/);
    assert.ok(workflow.indexOf(held) < workflow.indexOf('scripts/mutate.mjs --acorn'));
    assert.match(read('package.json'), /"test:mutation": "node --test test\/mutation-parser\.test\.mjs"/);
  });

  it('installs one parser version, outside the workspace, and names the same one everywhere', () => {
    const install = step('Install the parser');
    assert.match(install, /--prefix "\$RUNNER_TEMP\/parser" --no-save --ignore-scripts/);
    const pinned = /acorn@(\d+\.\d+\.\d+)/.exec(install)?.[1];
    assert.ok(pinned, 'the workflow does not pin the parser to an exact version');
    for (const path of ['scripts/mutate.mjs', 'test/mutation-parser.test.mjs', 'docs/mutation-testing.md']) {
      const versions = [...read(path).matchAll(/acorn@([\w.-]+\d)/g)].map((match) => match[1]);
      assert.ok(versions.length > 0, `${path} does not say which parser`);
      for (const version of versions) assert.equal(version, pinned, path);
    }
    // Not a dependency of anything: the lockfile and every manifest stay as they were.
    assert.doesNotMatch(read('package-lock.json'), /"node_modules\/acorn"/);
  });

  it('has the history and the builds the tests need, which the first run on a runner did not', () => {
    // #698: with one commit and only the core built, four test files failed
    // before a single mutant, and the run could not start.
    assert.match(workflow, /persist-credentials: false\n(?:\s+#.*\n)*\s+fetch-depth: 0\n/);
    assert.match(step('Build'), /^ {8}run: npm run build$/m);
    assert.doesNotMatch(workflow, /npm run build -w/);
    // A shallow fetch into a full clone would cut the history back off.
    assert.doesNotMatch(workflow, /--depth/);
  });

  it('runs one whole target on a pull request that changes the tool, its record or the workflow', () => {
    // A pull request that changes no target returns before running a test,
    // which is how a workflow that could not run merged green in #695.
    const whole = step('One whole target, when the tool itself changed');
    assert.match(whole, /if: github\.event_name == 'pull_request'/);
    for (const path of [
      'scripts/mutate.mjs', 'scripts/mutation.mjs', 'scripts/mutant-loader.mjs', 'mutation.baseline.json',
      '.github/workflows/mutation.yml',
    ]) {
      assert.ok(whole.includes(` ${path}`), `a change to ${path} does not start a whole run`);
    }
    assert.match(whole, /mutate\.mjs --acorn \S+ --only \w+ --check\n/);
    assert.match(whole, /git diff --name-only "\$BASE_SHA" -- /);
    assert.doesNotMatch(whole.slice(whole.indexOf('run:')), /\$\{\{/);
  });

  it('reads the repository and nothing else', () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(workflow, /: write/);
    assert.match(workflow, /persist-credentials: false/);
  });
});

describe('the record is what the last whole run found', () => {
  const record = JSON.parse(read('mutation.baseline.json'));

  it('has a score for every target and for no other file', () => {
    assert.deepEqual(Object.keys(record.files).sort(), [...TARGETS].sort());
  });

  it('adds up: per file, in total, and against the list of survivors', () => {
    const sum = (key) => Object.values(record.files).reduce((total, file) => total + file[key], 0);
    for (const key of ['mutants', 'killed', 'timeout', 'survived', 'uncovered']) {
      assert.equal(record.total[key], sum(key), key);
    }
    for (const [file, counts] of Object.entries(record.files)) {
      assert.equal(counts.killed + counts.timeout + counts.survived + counts.uncovered, counts.mutants, file);
      const listed = record.survivors.filter((survivor) => survivor.file === file);
      assert.equal(listed.length, counts.survived + counts.uncovered, file);
    }
    assert.deepEqual(summarise([
      ...Array.from({ length: record.total.killed }, () => ({ status: 'killed' })),
      ...Array.from({ length: record.total.timeout }, () => ({ status: 'timeout' })),
      ...Array.from({ length: record.total.survived }, () => ({ status: 'survived' })),
      ...Array.from({ length: record.total.uncovered }, () => ({ status: 'uncovered' })),
    ]), record.total);
  });

  it('names every survivor once, with the line it is on and the change that lived', () => {
    assert.equal(new Set(record.survivors.map((survivor) => survivor.id)).size, record.survivors.length);
    for (const survivor of record.survivors) {
      assert.ok(TARGETS.includes(survivor.file), survivor.file);
      assert.ok(OPERATORS.includes(survivor.operator), survivor.operator);
      assert.ok(['survived', 'uncovered'].includes(survivor.status), survivor.status);
      assert.notEqual(survivor.before, survivor.after);
      assert.ok(Number.isInteger(survivor.line) && survivor.line > 0, `${survivor.file}: ${survivor.before}`);
    }
  });

  it('is the figure the documentation prints, written by the run that measured it', () => {
    const doc = read('docs/mutation-testing.md');
    assert.ok(doc.includes(scoreTable(record)), 'docs/mutation-testing.md does not print the recorded scores');
    assert.equal(withScoreTable(doc, scoreTable(record)), doc);
    assert.match(read('scripts/mutate.mjs'), /writeFileSync\(PAGE, withScoreTable\(readFileSync\(PAGE, 'utf8'\), scoreTable\(record\)\)\)/);
  });

  it('is the number of survivors the documentation accounts for, group by group', () => {
    // The page says what each recorded survivor is. When the record changes,
    // that reading is out of date, and this is what says so.
    const doc = read('docs/mutation-testing.md');
    const stated = /^Of the (\d+) on record, as read on (\d{4}-\d{2}-\d{2})\./m.exec(doc);
    assert.ok(stated, 'the page no longer says how many survivors are on record');
    assert.equal(Number(stated[1]), record.survivors.length);
    const groups = [...doc.matchAll(/^- \*\*(\d+) (?:are|guard)/gm)].map((match) => Number(match[1]));
    assert.equal(groups.length, 4);
    assert.equal(groups.reduce((sum, count) => sum + count, 0), record.survivors.length);
  });

  it('states no other count of survivors on record than the one the record has', () => {
    // The audit paragraph once said "over all 38 recorded survivors" while the
    // table and the reading above it said 35. A count of what is on record
    // now is held to the record; a count of what was on record on the day of a
    // run is a dated measurement and says so, in the words "that were on record".
    const doc = read('docs/mutation-testing.md');
    const mentions = [...doc.matchAll(/\b(\d+) recorded survivors\b|\brecord holds (\d+) now\b/g)];
    assert.ok(mentions.length >= 1, 'the page no longer states a count of the survivors on record');
    for (const mention of mentions) {
      assert.equal(Number(mention[1] ?? mention[2]), record.survivors.length, mention[0]);
    }
  });

  it('prints caught and alive, a total row, and a dash where there is no score', () => {
    const table = scoreTable({
      recorded: '2026-01-02',
      total: { mutants: 5, killed: 2, timeout: 1, survived: 1, uncovered: 1, score: 60 },
      files: {
        'packages/core/src/a.ts': { mutants: 5, killed: 2, timeout: 1, survived: 1, uncovered: 1, score: 60 },
        'packages/core/src/b.ts': { mutants: 0, killed: 0, timeout: 0, survived: 0, uncovered: 0, score: null },
      },
    });
    assert.match(table, /Recorded on 2026-01-02: \*\*60\.0%\*\* of 5 mutants caught\./);
    assert.ok(table.includes('| `a.ts` | 5 | 3 | 2 | 60.0% |'));
    assert.ok(table.includes('| `b.ts` | 0 | 0 | 0 | - |'));
    assert.ok(table.includes('| **All** | 5 | 3 | 2 | 60.0% |'));
  });

  it('refuses to write a table into a page that has lost its markers', () => {
    assert.throws(() => withScoreTable('# no markers here', 'table'), /lost the markers/);
  });
});

describe('a failed test file says why, in a few lines', () => {
  const output = [
    'TAP version 13',
    '# Subtest: every merge is in the changelog',
    '    # Subtest: Unreleased is not empty while commits sit on top of the newest tag',
    '    not ok 2 - Unreleased is not empty while commits sit on top of the newest tag',
    '      ---',
    '      duration_ms: 3.1',
    "      error: 'no tag is reachable from HEAD'",
    '      code: ERR_ASSERTION',
    '      ...',
    'not ok 1 - every merge is in the changelog',
    '  ---',
    "  error: '1 subtest failed'",
    '  ...',
  ].join('\n');

  it('keeps the test that failed with its error, and drops the suite that only repeats it', () => {
    assert.equal(
      failureSummary(output),
      "  not ok 2 - Unreleased is not empty while commits sit on top of the newest tag\n      error: 'no tag is reachable from HEAD'",
    );
  });

  it('stops at a number of failures and says how many more there were', () => {
    const many = Array.from({ length: 5 }, (_, i) => `not ok ${i + 1} - test ${i + 1}\n  error: 'boom ${i + 1}'`).join('\n');
    const summary = failureSummary(many, 2);
    assert.ok(summary.includes('not ok 1 - test 1'));
    assert.ok(summary.includes('not ok 2 - test 2'));
    assert.equal(summary.includes('not ok 3'), false);
    assert.ok(summary.endsWith('  and 3 more'));
  });

  it('shows the end of the output for a file that died before running a test', () => {
    const crash = "node:internal/modules/esm/resolve:1\n\nError: Cannot find module 'x'\n    at y";
    assert.equal(failureSummary(crash), "  node:internal/modules/esm/resolve:1\n  Error: Cannot find module 'x'\n      at y");
    assert.equal(failureSummary(''), '  (it printed nothing)');
  });

  it('is what the run prints when a test fails before anything is mutated', () => {
    const runner = read('scripts/mutate.mjs');
    assert.match(runner, /failureSummary\(readFileSync\(output, 'utf8'\)\)/);
    assert.match(runner, /NODE_V8_COVERAGE: coverage \}, timeout: 300_000, output,/);
  });
});

describe('a test that reads a clock is believed only when it fails twice', () => {
  it('knows a test file that measures time from one that does not', () => {
    assert.equal(readsAClock('const started = performance.now();'), true);
    assert.equal(readsAClock('const started = process.hrtime.bigint();'), true);
    assert.equal(readsAClock('assert.ok(Date.now() - started < 2000);'), true);
    assert.equal(readsAClock("assert.equal(optimize('x').optimized, 'x');"), false);
    // A file that only asks what day it is matches too. That costs a second look, never a wrong kill.
    assert.equal(readsAClock('promotionProblem(model, Date.now())'), true);
    assert.equal(readsAClock(read('packages/core/test/courtesy.test.js')), true);
    assert.equal(readsAClock(read('packages/core/test/savings-edges.test.js')), false);
  });

  it('runs an exclusive thing only when everything shared has finished, and holds back what comes after', async () => {
    const gate = createGate();
    const events = [];
    let release;
    const slow = gate.shared(() => new Promise((resolve) => {
      events.push('shared starts');
      release = () => {
        events.push('shared ends');
        resolve();
      };
    }));
    const alone = gate.exclusive(async () => {
      events.push('exclusive runs');
    });
    const later = gate.shared(async () => {
      events.push('later shared runs');
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ['shared starts'], 'the exclusive thing ran beside a shared one, or a new one slipped in');
    release();
    await Promise.all([slow, alone, later]);
    assert.deepEqual(events, ['shared starts', 'shared ends', 'exclusive runs', 'later shared runs']);
  });

  it('opens again after an exclusive thing throws', async () => {
    const gate = createGate();
    await assert.rejects(gate.exclusive(async () => {
      throw new Error('boom');
    }), /boom/);
    assert.equal(await gate.shared(async () => 'ran'), 'ran');
  });

  it('lets shared things overlap', async () => {
    const gate = createGate();
    let together = 0;
    let most = 0;
    const one = () => gate.shared(async () => {
      together += 1;
      most = Math.max(most, together);
      await new Promise((resolve) => setImmediate(resolve));
      together -= 1;
    });
    await Promise.all([one(), one(), one()]);
    assert.equal(most, 3);
  });

  it('is how every test is run against a mutant, and in the audit', () => {
    const runner = read('scripts/mutate.mjs');
    assert.equal([...runner.matchAll(/await fails\(test, env\)/g)].length, 2);
    assert.match(runner, /if \(!test\.timed\) return first;/);
    assert.match(runner, /const alone = await gate\.exclusive\(\(\) => runTest\(test\.file, limits\)\);/);
    // Tests that read a clock go last, so a kill rarely needs the second look.
    assert.match(runner, /covering\.sort\(\(a, b\) => a\.timed - b\.timed \|\| /);
  });

  it('gives a clock-reading test one more try, alone and without coverage, before refusing to start', () => {
    const runner = read('scripts/mutate.mjs');
    assert.match(runner, /if \(test\.timed\) \{\n\s+const alone = await runTest\(test\.file, \{ env: cleanEnv\(\), timeout: 300_000, output \}\);/);
  });
});
