/**
 * What mutation testing decides here, as functions of plain values.
 *
 * A test suite that passes says the code does what the tests ask. It does not
 * say the tests ask enough. Mutation testing asks the second question: change
 * one small thing in the code, a `<` into a `<=`, a `true` into a `false`, a
 * call taken out, and run the tests. If they still pass, nothing was holding
 * that line to its meaning. Each such change is a mutant; a failing test kills
 * it, and one that lives names a line a bug could sit on unnoticed.
 *
 * This repository did that by hand: every pull request plants a few faults and
 * says which test caught each. Four in #689, forty in #685. That proves the
 * guards somebody thought to try. It says nothing about the ones nobody did.
 *
 * `scripts/mutate.mjs` runs it; this file is everything it decides, kept apart
 * so `mutation.test.js` can hold each decision without running a mutant:
 *
 *   mutantsOf        which changes one built file admits, from its syntax tree
 *   isCovered        whether a test ran the code a change sits in
 *   sourcePosition   which line of TypeScript a place in the built file came from
 *   withIds          a name for each change that survives unrelated edits
 *   summarise        the score
 *   againstBaseline  which survivors are new, and which recorded ones are gone
 *   changedLines     the lines a diff touches, for a run limited to them
 *   scoreTable       the record as the table the documentation prints
 *   failureSummary   what a failed test file said, short enough to read in a log
 *
 * **What is mutated is the built JavaScript**, not the TypeScript. The tests
 * import `dist`, the coverage V8 reports is in `dist`'s offsets, and a type is
 * not behaviour. The source map takes each survivor back to its `.ts` line.
 *
 * **What is not mutated**, so nobody reads the score as more than it is:
 * regular expressions, string contents, and what a `for` loop counts with,
 * whose only possible outcome is a hang. The optimiser's rules are mostly regular
 * expressions, and those are held by `courtesy.test.js` and its neighbours,
 * not by this.
 */

import { createHash } from 'node:crypto';

/** One operator into the operators that replace it, grouped by what kind of mistake each is. */
const BINARY = {
  '<': ['comparison', ['<=', '>=']],
  '<=': ['comparison', ['<', '>']],
  '>': ['comparison', ['>=', '<=']],
  '>=': ['comparison', ['>', '<']],
  '===': ['equality', ['!==']],
  '!==': ['equality', ['===']],
  '==': ['equality', ['!=']],
  '!=': ['equality', ['==']],
  '&&': ['logical', ['||']],
  '||': ['logical', ['&&']],
  '??': ['logical', ['&&']],
  '+': ['arithmetic', ['-']],
  '-': ['arithmetic', ['+']],
  '*': ['arithmetic', ['/']],
  '/': ['arithmetic', ['*']],
  '%': ['arithmetic', ['*']],
  '+=': ['assignment', ['-=']],
  '-=': ['assignment', ['+=']],
};

/** A method into the one that answers the opposite question. */
const METHODS = {
  some: 'every',
  every: 'some',
  startsWith: 'endsWith',
  endsWith: 'startsWith',
  min: 'max',
  max: 'min',
};

/** Every kind of change `mutantsOf` makes, in the order the report lists them. */
export const OPERATORS = [
  'comparison',
  'equality',
  'logical',
  'arithmetic',
  'assignment',
  'negation',
  'update',
  'boolean',
  'number',
  'condition',
  'method',
  'call-removed',
];

const isNode = (value) => value !== null && typeof value === 'object' && typeof value.type === 'string';
const isFunction = (node) =>
  isNode(node) && ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(node.type);
const isTextLiteral = (node) =>
  isNode(node) && (node.type === 'TemplateLiteral' || (node.type === 'Literal' && typeof node.value === 'string'));

/**
 * Where an operator sits between its two operands.
 *
 * A syntax tree gives the operands and the operator's spelling, not its
 * position, and what lies between the operands may hold parentheses and
 * comments as well. This walks past those and requires the operator to be the
 * next thing. A tree and a text that disagree throw: a mutant put in the wrong
 * place would be killed by its own syntax error and counted as a caught bug.
 */
function operatorStart(text, from, to, operator) {
  let at = from;
  while (at < to) {
    const two = text.slice(at, at + 2);
    if (two === '/*') at = text.indexOf('*/', at) + 2;
    else if (two === '//') at = text.indexOf('\n', at) + 1;
    else if (/[\s()]/.test(text[at])) at += 1;
    else break;
  }
  if (!text.startsWith(operator, at) || at + operator.length > to) {
    throw new Error(`no "${operator}" between offsets ${from} and ${to}: the tree and the text disagree`);
  }
  return at;
}

/** The name the code gives the function a node defines, if it gives one. */
function nameOf(node, parent) {
  if (node.type === 'FunctionDeclaration' && node.id) return node.id.name;
  if (!isFunction(node) || !parent) return null;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.key.type === 'Identifier') {
    return parent.key.name;
  }
  return null;
}

/**
 * Every change this file's syntax admits.
 *
 * `ast` is an ESTree program with `start` and `end` offsets on every node, as
 * acorn produces, and `text` the source it was parsed from. Each mutant is
 * `{ start, end, replacement, operator, fn, probe }`: put `replacement` over
 * `text.slice(start, end)`. `fn` is the nearest named function around it, or
 * `<module>`, and is part of what identifies the mutant later.
 *
 * **`probe` is where to ask whether a test ran this code, and it is not
 * always where the change is.** V8 reports the right-hand side of `a ?? b` as
 * its own range, counted zero when `a` was never null, and that range begins
 * straight after `a`: it contains the operator. Asked at the operator, a test
 * that evaluated the expression a thousand times with `a` set answers "never
 * ran", is not given the mutant, and the mutant is reported alive. The first
 * whole run did exactly that to `record.label ?? UNLABELLED`, which
 * `session-cost.test.js` kills. So the question is asked at the start of the
 * expression the change belongs to, which runs whenever any of it does.
 */
export function mutantsOf(ast, text) {
  const mutants = [];
  const add = (operator, start, end, replacement, fn, probe = start) =>
    mutants.push({ start, end, replacement, operator, fn, probe });

  const visit = (node, parent, key, fn, counting = false) => {
    const here = nameOf(node, parent) ?? fn;
    // What a `for` loop counts with, however it is written: `i++`, `i += 1`,
    // `i = i + 1`. Sent the other way it never reaches its bound, and the only
    // thing that can happen is a hang or an early exit that hides it.
    const inCounter = counting || (parent?.type === 'ForStatement' && key === 'update');
    if (inCounter) {
      for (const [childKey, value] of Object.entries(node)) {
        if (Array.isArray(value)) {
          for (const child of value) if (isNode(child)) visit(child, node, childKey, here, true);
        } else if (isNode(value)) {
          visit(value, node, childKey, here, true);
        }
      }
      return;
    }

    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression' || node.type === 'AssignmentExpression') {
      const entry = Object.hasOwn(BINARY, node.operator) ? BINARY[node.operator] : null;
      // `'a' + b` is a sentence being built, not a sum: turning it into a
      // subtraction tests whether anybody reads the sentence.
      const concatenation = node.operator === '+' && (isTextLiteral(node.left) || isTextLiteral(node.right));
      if (entry && !concatenation) {
        const at = operatorStart(text, node.left.end, node.right.start, node.operator);
        for (const replacement of entry[1]) {
          add(entry[0], at, at + node.operator.length, replacement, here, node.start);
        }
      }
    }

    if (node.type === 'UnaryExpression' && node.operator === '!' && text[node.start] === '!') {
      add('negation', node.start, node.start + 1, '', here);
    }

    if (node.type === 'UpdateExpression') {
      const at = node.prefix ? node.start : node.end - 2;
      if (text.slice(at, at + 2) !== node.operator) {
        throw new Error(`no "${node.operator}" at offset ${at}: the tree and the text disagree`);
      }
      add('update', at, at + 2, node.operator === '++' ? '--' : '++', here, node.start);
    }

    if (node.type === 'Literal' && typeof node.value === 'boolean') {
      add('boolean', node.start, node.end, String(!node.value), here);
    }

    if (node.type === 'Literal' && typeof node.value === 'number' && /^\d+(\.\d+)?$/.test(node.raw)) {
      add('number', node.start, node.end, String(node.value + 1), here);
    }

    if ((node.type === 'IfStatement' || node.type === 'ConditionalExpression') && node.test.type !== 'Literal') {
      add('condition', node.test.start, node.test.end, 'true', here);
      add('condition', node.test.start, node.test.end, 'false', here);
    }

    // `while (true)` is a hang, so a loop is only ever told not to run.
    const loop = ['WhileStatement', 'DoWhileStatement', 'ForStatement'].includes(node.type);
    if (loop && node.test && node.test.type !== 'Literal') {
      add('condition', node.test.start, node.test.end, 'false', here);
    }

    if (
      node.type === 'CallExpression'
      && node.callee.type === 'MemberExpression'
      && !node.callee.computed
      && Object.hasOwn(METHODS, node.callee.property.name)
    ) {
      const { property, object } = node.callee;
      const mathOnly = property.name === 'min' || property.name === 'max';
      if (!mathOnly || (object.type === 'Identifier' && object.name === 'Math')) {
        // From the call's start: after `a?.` the method's name is in a range of its own.
        add('method', property.start, property.end, METHODS[property.name], here, node.start);
      }
    }

    if (node.type === 'ExpressionStatement') {
      const call = node.expression.type === 'AwaitExpression' ? node.expression.argument : node.expression;
      if (call.type === 'CallExpression' && call.callee.type !== 'Super') {
        add('call-removed', node.start, node.end, ';', here);
      }
    }

    for (const [childKey, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child, node, childKey, here);
      } else if (isNode(value)) {
        visit(value, node, childKey, here);
      }
    }
  };

  visit(ast, null, null, '<module>');
  return mutants.sort((a, b) => a.start - b.start || a.end - b.end || a.replacement.localeCompare(b.replacement));
}

/** `text` with one mutant in it. */
export function applyMutant(text, mutant) {
  return text.slice(0, mutant.start) + mutant.replacement + text.slice(mutant.end);
}

/**
 * One script's coverage as a flat list of ranges.
 *
 * V8 reports a script as functions, each a list of ranges: the function
 * itself, then the blocks inside it whose count differs. Ranges nest and never
 * cross, so the count that applies to an offset is the smallest range holding
 * it, whichever function listed it.
 */
export function rangesOf(script) {
  return script.functions.flatMap((fn) =>
    fn.ranges.map((range) => ({ start: range.startOffset, end: range.endOffset, count: range.count })),
  );
}

/** Whether the code at `offset` ran: the smallest range that holds it has a count above zero. */
export function isCovered(ranges, offset) {
  let best = null;
  for (const range of ranges) {
    if (range.start <= offset && offset < range.end && (!best || range.end - range.start < best.end - best.start)) {
      best = range;
    }
  }
  return best !== null && best.count > 0;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One source-map segment's numbers. */
function vlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    if (digit === -1) throw new Error(`"${char}" is not a source-map digit`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/**
 * A source map's `mappings`, decoded: for each generated line, its segments as
 * `{ column, source, line, sourceColumn }`, all counted from zero as the
 * format counts them.
 */
export function decodeMappings(mappings) {
  let source = 0;
  let line = 0;
  let sourceColumn = 0;
  return mappings.split(';').map((generated) => {
    let column = 0;
    const segments = [];
    for (const segment of generated.split(',')) {
      if (segment === '') continue;
      const values = vlq(segment);
      column += values[0];
      if (values.length < 4) continue;
      source += values[1];
      line += values[2];
      sourceColumn += values[3];
      segments.push({ column, source, line, sourceColumn });
    }
    return segments;
  });
}

/**
 * The line of source, counted from one, that a place in the built file came
 * from: the last segment at or before the column, or the line's first when the
 * column is before every segment. `null` for a line the map says nothing about.
 */
export function sourcePosition(decoded, line, column) {
  const segments = decoded[line];
  if (!segments || segments.length === 0) return null;
  let best = segments[0];
  for (const segment of segments) if (segment.column <= column) best = segment;
  return { source: best.source, line: best.line + 1 };
}

/** Where an offset falls in a text: its line and column from zero, and the line's text. */
export function lineAt(text, offset) {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const end = text.indexOf('\n', offset);
  return {
    line: text.slice(0, start).split('\n').length - 1,
    column: offset - start,
    text: text.slice(start, end === -1 ? text.length : end),
  };
}

const squeeze = (line) => line.trim().replace(/\s+/g, ' ');

/**
 * Each mutant with what a person needs to read it and a name to remember it by.
 *
 * `before` and `after` are the line it sits on, without and with the change.
 * `id` is a digest of the file, the function, the kind of change and those two
 * lines, plus a count when the same change appears twice in one function. A
 * line number is not part of it: adding a comment above a recorded survivor
 * must not make it look like a new one.
 */
export function withIds(mutants, text, file) {
  const seen = new Map();
  return mutants.map((mutant) => {
    const before = squeeze(lineAt(text, mutant.start).text);
    const after = squeeze(lineAt(applyMutant(text, mutant), mutant.start).text);
    const key = JSON.stringify([file, mutant.fn, mutant.operator, before, after]);
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    const id = createHash('sha256').update(`${key}#${nth}`).digest('hex').slice(0, 12);
    return { ...mutant, id, before, after };
  });
}

/**
 * The score of a list of results, each with a `status` of `killed`,
 * `timeout`, `survived` or `uncovered`.
 *
 * A mutant that makes the tests hang is caught: something noticed. One no test
 * even runs is not, and counts against the score exactly as a survivor does.
 * The score is a percentage to one decimal, and `null` when there was nothing
 * to mutate, which is not the same as 100.
 */
export function summarise(results) {
  const count = (status) => results.filter((result) => result.status === status).length;
  const totals = {
    mutants: results.length,
    killed: count('killed'),
    timeout: count('timeout'),
    survived: count('survived'),
    uncovered: count('uncovered'),
  };
  const caught = totals.killed + totals.timeout;
  return { ...totals, score: results.length === 0 ? null : Math.round((caught / results.length) * 1000) / 10 };
}

/**
 * A run held against the recorded one.
 *
 * `fresh` are mutants that lived and are not on the record: lines somebody
 * changed or added without a test that holds them. `recovered` are recorded
 * survivors this run killed or no longer found: good news, and a record that
 * should be written again so they cannot quietly come back.
 *
 * `considered` limits the second question to the mutants this run looked at,
 * so a run over a pull request's changed lines does not report every survivor
 * elsewhere as gone.
 */
export function againstBaseline(recorded, results, considered = null) {
  const known = new Set(recorded.map((survivor) => survivor.id));
  const alive = results.filter((result) => result.status === 'survived' || result.status === 'uncovered');
  const aliveIds = new Set(alive.map((result) => result.id));
  return {
    fresh: alive.filter((result) => !known.has(result.id)),
    recovered: recorded.filter(
      (survivor) => !aliveIds.has(survivor.id) && (considered === null || considered.has(survivor.id)),
    ),
  };
}

/**
 * The lines a unified diff adds or changes, by file.
 *
 * Read from `git diff -U0`: every `@@ -a,b +c,d @@` names `d` lines from `c`
 * in the new file. A hunk that only deletes has no new line to point at, and
 * what it removed changed the meaning of what is around it, so it marks the
 * line before and the line after the cut.
 */
export function changedLines(diff) {
  const files = new Map();
  let current = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      current = path === '/dev/null' ? null : path.replace(/^b\//, '');
      if (current !== null && !files.has(current)) files.set(current, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || current === null) continue;
    const start = Number(hunk[1]);
    const length = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const lines = files.get(current);
    if (length === 0) {
      lines.add(Math.max(1, start));
      lines.add(start + 1);
    } else {
      for (let at = start; at < start + length; at += 1) lines.add(at);
    }
  }
  return files;
}

const TABLE_START = '<!-- mutation-score:start -->';
const TABLE_END = '<!-- mutation-score:end -->';

const percent = (score) => (score === null ? '-' : `${score.toFixed(1)}%`);

/**
 * The record as the documentation prints it: the date, the total, and a row
 * for each file. Written by the same run that writes the record, so the page
 * cannot say a score nobody measured.
 */
export function scoreTable(record) {
  const row = (name, counts) =>
    `| ${name} | ${counts.mutants} | ${counts.killed + counts.timeout} | ${counts.survived + counts.uncovered} | ${percent(counts.score)} |`;
  return [
    TABLE_START,
    `Recorded on ${record.recorded}: **${percent(record.total.score)}** of ${record.total.mutants} mutants caught.`,
    '',
    '| File | Mutants | Caught | Alive | Score |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(record.files).map(([file, counts]) => row(`\`${file.split('/').pop()}\``, counts)),
    row('**All**', record.total),
    TABLE_END,
  ].join('\n');
}

/** `markdown` with the table between its two markers replaced. Throws when a marker is missing. */
export function withScoreTable(markdown, table) {
  const start = markdown.indexOf(TABLE_START);
  const end = markdown.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('docs/mutation-testing.md has lost the markers the score table is written between');
  }
  return markdown.slice(0, start) + table + markdown.slice(end + TABLE_END.length);
}

/**
 * What a failed test file said, short enough to read in a CI log.
 *
 * The first whole run on a runner printed the names of four test files that
 * failed and nothing else, and the cause of one of them stayed a guess
 * (#698). This keeps each `not ok` line with the first `error:` under it, up
 * to `limit` failures, and falls back to the end of the output for a file
 * that died without getting as far as a test.
 */
export function failureSummary(output, limit = 8) {
  const lines = output.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (!/^\s*not ok \d+ - /.test(line)) return;
    const next = lines.slice(index + 1, index + 12).find((candidate) => /^\s*error: /.test(candidate));
    // A suite's own line only repeats that something under it failed.
    if (next && /error: '?\d+ subtests? failed/.test(next)) return;
    const detail = next && !/error: \|-?\s*$/.test(next) ? next.trim() : (lines[index + 8] ?? '').trim();
    found.push(`  ${line.trim()}${detail ? `\n      ${detail.slice(0, 300)}` : ''}`);
  });
  if (found.length === 0) {
    const tail = lines.filter((line) => line.trim() !== '').slice(-12);
    return tail.length === 0 ? '  (it printed nothing)' : tail.map((line) => `  ${line.slice(0, 300)}`).join('\n');
  }
  const shown = found.slice(0, limit);
  if (found.length > limit) shown.push(`  and ${found.length - limit} more`);
  return shown.join('\n');
}
