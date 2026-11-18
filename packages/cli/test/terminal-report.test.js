import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';

import { PALETTE, Report, colourDepth, columnsFor, painters, table, wrapText } from '../dist/style.js';
import { SPAWN_ENV } from './env.mjs';

/**
 * The terminal report, drawn by one module (#758).
 *
 * Four things the issue asked to be held, each against the repository's own
 * examples: the answer before the breakdown, the four colour depths, the width
 * of the window, and the figures, which no layout may change. The figures are
 * compared with `fixtures/terminal-figures.json`, every number the same
 * commands printed on a pipe at the commit before the module drew them, so a
 * change of layout that loses, adds or alters a figure fails here.
 *
 * That file is written from output, never by hand. A price change in the
 * catalogue moves figures on purpose, and is the one reason to rewrite it: run
 * the commands below on a pipe at the commit before the change and record what
 * they print.
 */

const ROOT = new URL('../../..', import.meta.url).pathname;
const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const ANSI = /\u001b\[[0-9;]*m/g;
const FIXTURE = JSON.parse(readFileSync(new URL('fixtures/terminal-figures.json', import.meta.url), 'utf8'));

const scratch = mkdtempSync(join(tmpdir(), 'trazum-terminal-'));
const usage = join(scratch, 'usage.jsonl');

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 60000,
  });

/** The commands most people meet, on files in this repository. */
const CASES = {
  bill: () => ['bill', 'examples/claude-projects', '--table', '--locale', 'en'],
  profile: () => ['profile', usage, '--locale', 'en'],
  plan: () => ['plan', usage, '--locale', 'en'],
  demo: () => ['optimize', 'examples/support-prompt.txt', '--calls', '50000', '--cost', '--locale', 'en', '-o', join(scratch, 'short.txt')],
  optimize: () => ['optimize', 'examples/support-prompt.txt', '--locale', 'en', '-o', join(scratch, 'short.txt')],
  check: () => ['check', 'examples/', '--locale', 'en'],
};

/** Every number a text states, as written: `$12.70` is `12.70`, `2026-09-01` one figure. */
const FIGURE = /\d+(?:[.,:/-]\d+)*/g;
const figures = (text) =>
  text
    .split('\n')
    // The line naming where `-o` wrote holds the scratch directory, not a figure of the report.
    .filter((line) => !line.includes(scratch))
    .flatMap((line) => line.match(FIGURE) ?? [])
    .sort();

const nonBlank = (text) => text.split('\n').filter((line) => line.trim() !== '');

before(() => {
  // The profile and the plan read a usage log; this is the one the examples make.
  const made = run(['from-claude-code', 'examples/claude-projects', '-o', usage]);
  assert.equal(made.status, 0, made.stderr);
});

describe('the answer comes first', () => {
  /** Where the answer is, and where the breakdown starts, in each report. */
  const SHAPE = {
    bill: { answer: /\$[\d,.]+ across \d+ priced call/, breakdown: /^\s+project\s+calls\s+USD\s+share/ },
    profile: { answer: /\d+ calls · \$[\d,.]+/, breakdown: /[█░]{3}/ },
    plan: { answer: /\$[\d,.]+ projected savings/, breakdown: /^\s+→ / },
    demo: { answer: /\$[\d,.]+\/month/, breakdown: /^Input tokens/ },
    optimize: { answer: /\$[\d,.]+\/month/, breakdown: /^Input tokens/ },
    check: { answer: /within budget|over budget/, breakdown: /^\s+OK\s+\d/ },
  };

  for (const [name, { answer, breakdown }] of Object.entries(SHAPE)) {
    it(`${name}: the figure that answers is in the first three lines, above the breakdown`, () => {
      const result = run(CASES[name]());
      assert.equal(result.status, 0, result.stderr);
      const lines = nonBlank(result.stdout);
      const at = lines.findIndex((line) => answer.test(line));
      const rows = lines.findIndex((line) => breakdown.test(line));
      assert.ok(at !== -1, `${name} no longer states its answer`);
      assert.ok(rows !== -1, `${name} no longer has its breakdown`);
      assert.ok(at < 3, `${name} states its answer on line ${at + 1}, below the first three`);
      assert.ok(at < rows, `${name} prints its breakdown (line ${rows + 1}) before its answer (line ${at + 1})`);
    });
  }

  it('the bill writes what it read after the statement, on stderr, and loses none of it', () => {
    const result = run(CASES.bill());
    assert.match(result.stderr, /demo-etl\.jsonl: claude-code, 42 record\(s\)/);
    assert.match(result.stdout, /^\nYour bill /, 'the statement no longer opens the bill');
    // Both streams into one, as a terminal shows them: the order is only visible there.
    const screen = spawnSync('sh', ['-c', `"${process.execPath}" "${CLI}" ${CASES.bill().join(' ')} 2>&1`], {
      cwd: ROOT,
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 60000,
    }).stdout;
    const total = screen.indexOf('Your bill');
    const read = screen.indexOf('record(s)');
    assert.ok(total !== -1 && read !== -1, 'the bill or what it read is missing from the screen');
    assert.ok(total < read, 'what the bill read is printed above the statement');
  });

  it('those notes are dimmed on a terminal, below the statement’s own, and plain on a pipe', () => {
    const painted = run(CASES.bill(), { FORCE_COLOR: '1' }).stderr;
    assert.match(painted, /\u001b\[2m[^\n]*demo-etl\.jsonl: claude-code/, 'what the bill read is as loud as the statement');
    assert.equal(run(CASES.bill()).stderr.includes('\u001b['), false, 'a pipe got the dim');
  });
});

describe('the colour comes from the terminal', () => {
  it('true colour, 256, 16 and none, from what the terminal says', () => {
    assert.equal(colourDepth({ COLORTERM: 'truecolor', TERM: 'xterm-256color' }, true), 'truecolor');
    assert.equal(colourDepth({ COLORTERM: '24bit' }, true), 'truecolor');
    assert.equal(colourDepth({ TERM: 'xterm-256color' }, true), '256');
    assert.equal(colourDepth({ TERM: 'xterm' }, true), '16');
    assert.equal(colourDepth({}, true), '16');
    assert.equal(colourDepth({ TERM: 'dumb' }, true), 'none');
    assert.equal(colourDepth({ COLORTERM: 'truecolor', NO_COLOR: '1' }, true), 'none', 'NO_COLOR was not obeyed');
    assert.equal(colourDepth({ COLORTERM: 'truecolor' }, false), 'none', 'a pipe was painted');
  });

  it('FORCE_COLOR names a depth and outranks the rest, as other tools read it', () => {
    assert.equal(colourDepth({ FORCE_COLOR: '1', NO_COLOR: '1' }, false), '16');
    assert.equal(colourDepth({ FORCE_COLOR: '2' }, false), '256');
    assert.equal(colourDepth({ FORCE_COLOR: '3' }, false), 'truecolor');
    assert.equal(colourDepth({ FORCE_COLOR: '0', COLORTERM: 'truecolor' }, true), 'none');
  });

  it('the 256 colours are the nearest of the fixed cube and grey ramp to the brand’s', () => {
    // The xterm cube is six levels a channel, then 24 greys; 0 to 15 are the theme's own.
    const levels = [0, 95, 135, 175, 215, 255];
    const table256 = [];
    for (let i = 16; i < 232; i++) {
      const n = i - 16;
      table256.push([i, [levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]]]);
    }
    for (let i = 232; i < 256; i++) table256.push([i, [8 + 10 * (i - 232), 8 + 10 * (i - 232), 8 + 10 * (i - 232)]]);
    for (const [name, colour] of Object.entries(PALETTE)) {
      const want = [1, 3, 5].map((at) => Number.parseInt(colour.hex.slice(at, at + 2), 16));
      const distance = ([, rgb]) => rgb.reduce((sum, value, k) => sum + (value - want[k]) ** 2, 0);
      const nearest = table256.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best));
      assert.equal(colour.c256, nearest[0], `${name} ${colour.hex}: ${colour.c256} is not the nearest, ${nearest[0]} is`);
    }
  });

  it('the accent holds on a light ground and a dark one: 3.5:1 or more on each', () => {
    // WCAG 2 relative luminance and contrast ratio, worked here rather than trusted.
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex) => {
      const [r, g, b] = [1, 3, 5].map((at) => channel(Number.parseInt(hex.slice(at, at + 2), 16)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Paper, a white terminal, a common dark terminal, and the dark canvas.
    for (const ground of ['#f6f4ec', '#ffffff', '#1e1e1e', '#1c211b']) {
      const ratio = contrast(PALETTE.accent.hex, ground);
      assert.ok(ratio >= 3.5, `the accent ${PALETTE.accent.hex} is ${ratio.toFixed(2)}:1 on ${ground}`);
    }
    // The mark is ink on acid, whatever the ground: untouched by the accent.
    assert.equal(PALETTE.ink.hex, '#20231e');
    assert.equal(PALETTE.acid.hex, '#dce94d');
    assert.ok(contrast(PALETTE.ink.hex, PALETTE.acid.hex) >= 7, 'the mark no longer reads');
  });

  /** The SGR the mark and the accent are written in, at each depth. */
  const DEPTHS = {
    3: { mark: '1;38;2;32;35;30;48;2;220;233;77m', accent: '38;2;112;131;27m' },
    2: { mark: '1;38;5;234;48;5;185m', accent: '38;5;64m' },
    1: { mark: '1;30;43m', accent: '\u001b[36m' },
  };
  const plainBill = () => run(CASES.bill()).stdout;

  for (const [level, codes] of Object.entries(DEPTHS)) {
    it(`FORCE_COLOR=${level} paints the brand at that depth, and adds nothing a pipe lacks`, () => {
      const painted = run(CASES.bill(), { FORCE_COLOR: level }).stdout;
      assert.ok(painted.includes(`${codes.mark}$12.70`), `the total is not marked in ${codes.mark}`);
      assert.ok(painted.includes(codes.accent), `the bars are not in the accent ${codes.accent}`);
      assert.equal(painted.replace(ANSI, ''), plainBill(), 'colour carried something the plain bill does not');
    });
  }

  it('FORCE_COLOR=0 and a plain pipe carry no escape code at all', () => {
    assert.equal(run(CASES.bill(), { FORCE_COLOR: '0' }).stdout.includes('\u001b['), false);
    assert.equal(plainBill().includes('\u001b['), false);
  });

  for (const name of Object.keys(CASES)) {
    it(`${name}: the acid marks one thing, at most, per report`, () => {
      const painted = run(CASES[name](), { FORCE_COLOR: '3' }).stdout;
      const marks = painted.split('48;2;220;233;77m').length - 1;
      assert.ok(marks <= 1, `${name} carries the acid ${marks} times`);
      if (name !== 'check') assert.equal(marks, 1, `${name} marks no figure`);
    });
  }

  it('a state is a word or a mark before it is a colour', () => {
    const plain = new Report(76, painters('none'), true).note('caution', 'a caveat').note('question', 'an assumption').lines();
    assert.deepEqual(plain, ['  ! a caveat', '  ? an assumption']);
    const painted = new Report(76, painters('16'), true).note('caution', 'a caveat').lines();
    assert.equal(painted[0], '  \u001b[33m!\u001b[39m a caveat', 'the colour went somewhere other than the mark');
  });
});

describe('no figure changed', () => {
  for (const name of Object.keys(CASES)) {
    it(`${name} on a pipe prints every figure it printed before the module, and no other`, () => {
      const result = run(CASES[name]());
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(figures(result.stdout), FIXTURE[name]);
    });
  }
});

describe('the report fits its window', () => {
  for (const columns of [60, 80, 120]) {
    const room = Math.min(columns, 76);
    for (const name of Object.keys(CASES)) {
      it(`${name} at ${columns} columns: no line wider than ${room}, and no figure lost or moved off its row`, () => {
        const result = run(CASES[name](), { COLUMNS: String(columns) });
        assert.equal(result.status, 0, result.stderr);
        for (const line of result.stdout.split('\n')) {
          if (line.includes(scratch)) continue;
          // A word is never split: a single word longer than the window is the one line allowed past it.
          const oneWord = !/\s/.test(line.trim());
          assert.ok([...line].length <= room || oneWord, `${[...line].length} columns: ${line}`);
        }
        assert.deepEqual(figures(result.stdout), FIXTURE[name]);
      });
    }
  }

  it('a narrow window keeps every bill row whole: name, calls, dollars and share on one line', () => {
    const lines = run(CASES.bill(), { COLUMNS: '60' }).stdout.split('\n');
    const rows = lines.filter((line) => /^ {2}(home-me|claude-)/.test(line));
    assert.equal(rows.length, 6);
    for (const row of rows) assert.match(row, /^ {2}\S+\s+\d+\s+\$[\d.,]+\s+(?:[█░]+\s+)?\d+\.\d%$/);
  });

  it('the width is the window’s, between 60 and 76, and a pipe keeps the layout it had', () => {
    assert.deepEqual(columnsFor({}, 100), { columns: 76, window: true });
    assert.deepEqual(columnsFor({}, 40), { columns: 60, window: true });
    assert.deepEqual(columnsFor({ COLUMNS: '66' }, undefined), { columns: 66, window: true });
    assert.deepEqual(columnsFor({}, undefined), { columns: 76, window: false });
  });

  it('a table narrows its bars, then cuts its name, and never cuts a figure', () => {
    const paint = painters('none');
    const columns = [
      { header: 'model', align: 'left' },
      { header: 'USD', align: 'right' },
      { header: 'share', align: 'left' },
      { header: '', align: 'right' },
    ];
    const rows = [['a-model-with-a-rather-long-name', '$1,234.56', { bar: 0.5 }, '50.0%']];
    assert.match(table(columns, rows, '  ', 80, paint)[1], /█████░░░░░/, 'a table that fits lost its bar');
    assert.match(table(columns, rows, '  ', 60, paint)[1], /███░░ /, 'the bar did not narrow first');
    const cut = table(columns, rows, '  ', 40, paint);
    for (const line of cut) assert.ok(line.length <= 40, `${line.length}: ${line}`);
    assert.match(cut[1], /…/, 'the name was not cut');
    assert.match(cut[1], /\$1,234\.56/);
    assert.match(cut[1], /50\.0%$/);
  });

  it('a paragraph never ends a line on a figure without the word after it', () => {
    // 20 columns: "the bill was $12.70" fits exactly, and "the bill was $12.70 in" does not.
    const lines = wrapText('the bill was $12.70 in total', 20);
    for (const line of lines) assert.doesNotMatch(line, /\$12\.70$/, `the figure was left at the end of "${line}"`);
    assert.deepEqual(lines, ['the bill was', '$12.70 in total']);
  });

  it('with no window a table cuts nothing, however long the name', () => {
    const name = 'a-workload-whose-name-is-longer-than-any-window';
    const lines = new Report(30, painters('none'), false)
      .table([{ header: 'project', align: 'left' }, { header: 'USD', align: 'right' }], [[name, '$1.00']])
      .lines();
    assert.ok(lines[1].includes(name), `a pipe lost part of the name: ${lines[1]}`);
  });
});
