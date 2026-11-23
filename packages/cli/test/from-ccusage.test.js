import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum from-ccusage`, and `bill` handed a ccusage report (#786).
 *
 * The reports are ccusage 20.0.51's own output on synthetic sessions, in
 * `packages/core/test/fixtures/ccusage/` with the commands that wrote them.
 * The arithmetic is held in `packages/core/test/ccusage.test.js`; what is
 * held here is what reaches a person: the bill is the catalogue's figure and
 * not ccusage's, a row is printed as a row and never as a call, ccusage's
 * figure is set beside the catalogue's with both named, no project folder is
 * printed, and nothing is run but this CLI.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const FIXTURES = new URL('../../core/test/fixtures/ccusage/', import.meta.url).pathname;
const REPORTS = readdirSync(FIXTURES).filter((name) => name.endsWith('.json')).sort();
const DAILY = join(FIXTURES, 'claude-daily.json');
const SESSIONS = join(FIXTURES, 'sessions', 'projects');
const PATHS = ['-home-dana-acme-payroll', '-home-dana-side-project', 'acme-payroll', 'side-project', 'home-dana', '/home/dana'];

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...SPAWN_ENV, ...env }, timeout: 60000 });
const scratch = () => mkdtempSync(join(tmpdir(), 'trazum-ccusage-'));
const flat = (text) => text.replace(/\s+/g, ' ');
/** The fixture's folder is named in a path argument; a leak is a project folder anywhere else. */
const withoutFixturePaths = (text) => text.replaceAll(FIXTURES, '<fixtures>/');

describe('from-ccusage writes the counts and sets the two figures side by side', () => {
  it('writes one record per model per row, every one a sum of requests', () => {
    const out = join(scratch(), 'usage.jsonl');
    const result = run(['from-ccusage', DAILY, '-o', out]);
    assert.equal(result.status, 0, result.stderr);
    const records = readFileSync(out, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(records.length, 8);
    assert.ok(records.every((record) => record.requests === null), 'a row was written as one call');
    /* The log is read as any other: it says what that does to its rows, and where to bill them as rows instead. */
    const note = flat(result.stderr);
    assert.ok(note.includes('counted as calls'), result.stderr);
    assert.ok(/--timezone, --since, --until or --by/.test(note) && note.includes('cut it at a window'), 'the note does not say a zone or a window can move or cut a row of the log');
    assert.ok(note.includes('trazum bill on the ccusage file itself'), result.stderr);
  });

  it('bills what it wrote at the figure worked out by hand, not at ccusage figure', () => {
    // 1.28275, worked out line by line in packages/core/test/ccusage.test.js;
    // ccusage's own total for the same rows is 1.38625.
    const out = join(scratch(), 'usage.jsonl');
    assert.equal(run(['from-ccusage', DAILY, '-o', out]).status, 0);
    const receipt = JSON.parse(run(['bill', out, '--receipt']).stdout);
    assert.ok(Math.abs(receipt.total.usd - 1.28275) < 1e-9, `billed ${receipt.total.usd}`);
  });

  it('prints ccusage figure, the catalogue figure with its date, and the difference, per model', () => {
    const result = run(['from-ccusage', DAILY]);
    assert.equal(result.status, 0, result.stderr);
    const line = (model) => result.stderr.split('\n').find((text) => text.trim().startsWith(`${model} `));
    // ccusage $0.915 (past 200,000 tokens at a long-context rate), catalogue 250,000 x $3 + 1,000 x $15.
    assert.match(line('claude-sonnet-4-20250514'), /\$0\.9150\s+\$0\.7650\s+-\$0\.1500$/);
    // ccusage request by request; the catalogue at the dearer rate a row has to take.
    assert.match(line('claude-haiku-5-5'), /\$0\.0128\s+\$0\.0638\s+\+\$0\.0510$/);
    // Priced by ccusage, not by the catalogue, and not borrowed from ccusage either.
    assert.match(line('claude-3-7-sonnet-20250219'), /\$0\.00450\s+\S/);
    assert.doesNotMatch(line('claude-3-7-sonnet-20250219'), /\$0\.00450\s+\$/);
    assert.match(result.stderr, /2026-11-16/, 'the date the catalogue was read is not named');
  });

  it('prints nothing on stdout but records, and profile reads them as a usage log', () => {
    const result = run(['from-ccusage', DAILY]);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 8);
    for (const line of lines) assert.ok(JSON.parse(line).model.startsWith('claude-'));
    const log = join(scratch(), 'usage.jsonl');
    writeFileSync(log, result.stdout);
    const profiled = run(['profile', log, '--json']);
    assert.equal(profiled.status, 0, profiled.stderr);
    assert.ok(Math.abs(JSON.parse(profiled.stdout).total.totalUsd - 1.28275) < 1e-9);
  });

  it('labels by project only through a mapping the person wrote', () => {
    const dir = scratch();
    const rules = join(dir, 'rules.json');
    writeFileSync(rules, JSON.stringify([{ project: '-home-dana-acme-payroll', label: 'payroll' }]));
    const result = run(['from-ccusage', join(FIXTURES, 'claude-daily-instances.json'), '--label-by-project', rules]);
    assert.equal(result.status, 0, result.stderr);
    const labels = result.stdout.trim().split('\n').map((line) => JSON.parse(line).label);
    assert.deepEqual([...new Set(labels)].sort(), ['payroll', undefined].sort());
    for (const path of PATHS) assert.ok(!result.stdout.includes(path) && !result.stderr.includes(path), `leaked ${path}`);
  });

  it('refuses a mapping it cannot read, rather than narrow nothing', () => {
    const dir = scratch();
    for (const [name, body] of [['empty.json', '[]'], ['bad.json', '[{"project": ""}]'], ['broken.json', '{']]) {
      writeFileSync(join(dir, name), body);
      const result = run(['from-ccusage', DAILY, '--label-by-project', join(dir, name)]);
      assert.equal(result.status, 1, name);
    }
  });

  it('refuses a file that is not a ccusage report, and a missing one', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'other.json'), '{"data": []}');
    assert.equal(run(['from-ccusage', join(dir, 'other.json')]).status, 1);
    assert.equal(run(['from-ccusage', join(dir, 'absent.json')]).status, 1);
    assert.equal(run(['from-ccusage']).status, 1);
  });
});

describe('bill reads a ccusage report as it is', () => {
  it('prices it at the figure worked out by hand and names the gap a row leaves', () => {
    const result = run(['bill', DAILY, '--receipt']);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.ok(Math.abs(receipt.total.usd - 1.28275) < 1e-9, `billed ${receipt.total.usd}`);
    const ceiling = receipt.gaps.find((gap) => gap.kind === 'tier-ceiling');
    assert.ok(ceiling !== undefined && Math.abs(ceiling.floorUsd - 0.01275) < 1e-9, 'the Haiku 5.5 day was priced as one call');
    assert.deepEqual(receipt.gaps.find((gap) => gap.kind === 'unpriced').models, ['claude-3-7-sonnet-20250219']);
  });

  it('counts rows, and never prints a row as a call', () => {
    const result = run(['bill', DAILY, '--table']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\$1\.28 across 7 priced row\(s\)/);
    assert.match(result.stdout, /model\s+rows\s+USD\s+share/);
    assert.match(result.stdout, /month\s+rows\s+USD\s+share/);
    assert.doesNotMatch(result.stdout, /\bcalls\b|call\(s\)/, 'a row of the report was printed as a call');
    assert.doesNotMatch(result.stderr, /call\(s\)/, 'a row of the report was printed as a call on stderr');
    /* The side files are refused on a ccusage report, so the statement does not point at one. */
    assert.match(flat(result.stdout), /The receipt as data: --receipt, or -o receipt\.json\./);
    assert.doesNotMatch(result.stdout, /--pdf-out/, 'the statement suggests a file it refuses for a ccusage report');
  });

  it('says records, not calls, when calls and rows are billed together', () => {
    const result = run(['bill', SESSIONS, join(FIXTURES, 'claude-monthly.json'), '--table']);
    assert.equal(result.status, 0, result.stderr);
    // 10 calls of the sessions (one unpriced), 7 priced rows of the report.
    assert.match(flat(result.stdout), /across 17 priced record\(s\)/);
    assert.match(result.stdout, /model\s+records\s+USD\s+share/);
  });

  it('sets ccusage figure beside the bill only where the two differ', () => {
    const result = run(['bill', DAILY, '--receipt']);
    const modelLines = result.stderr.split('\n').filter((text) => /^\s+claude-/.test(text));
    assert.deepEqual(
      modelLines.map((text) => text.trim().split(/\s+/)[0]),
      ['claude-sonnet-4-20250514', 'claude-haiku-5-5', 'claude-3-7-sonnet-20250219'],
    );
  });

  it('does not set the whole report beside a bill for part of it', () => {
    const result = run(['bill', DAILY, '--since', '2026-11-01', '--receipt']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /\$0\.9150/, "ccusage's figure for the whole file was set beside a windowed bill");
  });

  it('is what profile points at for a ccusage report', () => {
    const result = run(['profile', DAILY]);
    assert.equal(result.status, 1);
    assert.ok(flat(result.stderr).includes(`trazum from-ccusage ${DAILY} -o usage.jsonl`), result.stderr);
  });
});

/*
  A row is the total of a whole day, week, month or session and does not say
  how it was spread across it. Billed by an instant, a zone, a window edge or a
  split inside one would put all of it on one side: November's $1.13 in
  October, or a month on its first day. And the files that count calls would
  print it as one. So each of those is refused with its reason, and nothing is
  written first.
*/
describe('bill never cuts a row, and never writes one where it would be a call', () => {
  const MONTHLY = join(FIXTURES, 'claude-monthly.json');
  const refused = (args, pattern) => {
    const result = run(['bill', ...args, '--table']);
    assert.equal(result.status, 1, `billed: ${result.stdout}`);
    assert.equal(result.stdout, '', 'a statement was printed before the refusal');
    assert.match(flat(result.stderr), pattern);
    return result;
  };

  it('refuses --timezone, which would move a whole row to another day', () => {
    refused([MONTHLY, '--timezone', 'America/Los_Angeles'], /--timezone .* a row of a ccusage report is already the total of a whole day, week, month or session/);
    refused([DAILY, '--by', 'day', '--timezone', 'America/New_York'], /Run ccusage with its own --timezone/);
  });

  it('refuses a window edge inside a row, and bills a window on the rows edges', () => {
    refused([MONTHLY, '--since', '2026-11-01', '--until', '2026-11-05'], /--since\/--until falls inside 1 row\(s\) of this ccusage monthly report/);
    refused([MONTHLY, '--since', '2026-11-10', '--until', '2026-11-15'], /falls inside 1 row\(s\)/);
    const november = run(['bill', MONTHLY, '--since', '2026-11-01', '--until', '2026-11-30', '--table']);
    assert.equal(november.status, 0, november.stderr);
    // November's rows: 1.28275 less October's 0.156.
    assert.match(november.stdout, /\$1\.13 across 6 priced row\(s\)/);
    assert.match(flat(november.stdout), /This log covers 2026-11-01 → 2026-11-30 \(30\.0 days\)/);
  });

  it('refuses any edge at or before a session whose start the report does not name', () => {
    refused([join(FIXTURES, 'session.json'), '--since', '2026-11-01'], /2 of them are sessions whose report names only their last activity/);
    refused([join(FIXTURES, 'claude-session.json'), '--since', '2026-11-03'], /falls inside 1 row\(s\) of this ccusage session report/);
  });

  it('says rows, not calls, when a window holds none', () => {
    const result = refused([join(FIXTURES, 'claude-session.json'), '--since', '2026-11-04'], /No row of the ccusage report falls inside this period\. What was read covers 2026-10-31 → 2026-11-03\./);
    assert.doesNotMatch(result.stderr, /No call/);
  });

  it('refuses a --by a row does not fit inside, and bills one it does', () => {
    refused([MONTHLY, '--by', 'day'], /--by day would split 2 row\(s\) of this ccusage monthly report across days/);
    // ccusage claude weekly starts its weeks on Sunday; the bill's ISO weeks start on Monday.
    refused([join(FIXTURES, 'claude-weekly.json'), '--by', 'week'], /--by week would split 2 row\(s\) of this ccusage weekly report/);
    refused([join(FIXTURES, 'weekly.json'), '--by', 'month'], /--by month would split 1 row\(s\)/);
    const weeks = run(['bill', join(FIXTURES, 'weekly.json'), '--by', 'week', '--table']);
    assert.equal(weeks.status, 0, weeks.stderr);
    assert.match(weeks.stdout, /2026-W44\s+1\s+\$0\.1560/);
    assert.match(weeks.stdout, /2026-W45\s+6\s+\$1\.13/);
  });

  it('leaves out the by-month table where a row runs across a month, and says why', () => {
    const result = run(['bill', join(FIXTURES, 'weekly.json'), '--table']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /month\s+rows\s+USD/);
    assert.match(flat(result.stdout), /Not split by month: 1 row\(s\) of the ccusage report run across a month's edge/);
    // The Sunday weeks of the focused report fall inside October and November.
    assert.match(run(['bill', join(FIXTURES, 'claude-weekly.json'), '--table']).stdout, /month\s+rows\s+USD/);
  });

  it('says what the rows cover, start to end, not the instants they are dated at', () => {
    const result = run(['bill', MONTHLY, '--table']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result.stdout), /This log covers 2026-10-01 → 2026-11-30 \(61\.0 days\)/);
  });

  for (const flag of ['--markdown-out', '--html-out', '--pdf-out', '--csv-out', '--otlp-out', '--prom-out']) {
    it(`refuses ${flag}, which counts calls and splits by day, and writes nothing`, () => {
      const out = join(scratch(), 'side-file');
      refused([DAILY, flag, out], new RegExp(`${flag} counts what it bills as calls and splits it by day`));
      assert.equal(existsSync(out), false, `${flag} was written`);
    });
  }

  it('leaves a ccusage report to bill alone with --agent, so nothing of it is refused or counted', () => {
    const result = run(['bill', SESSIONS, MONTHLY, '--agent', 'claude-code', '--markdown-out', join(scratch(), 'bill.md'), '--table']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\$1\.23 across 10 priced call\(s\)/);
  });

  it('weekly refuses a ccusage report, which it would cut at --until and count as calls', () => {
    const result = run(['weekly', DAILY, '--until', '2026-11-04']);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout, '');
    assert.match(flat(result.stderr), /So weekly does not read a ccusage report\. trazum bill on the file bills it\./);
  });

  it('says that the log it writes is counted as calls by what reads it', () => {
    const result = run(['from-ccusage', DAILY]);
    assert.match(flat(result.stderr), /The log written here is read by every command as any other usage log: .* counted as calls/);
  });
});

describe('no project folder reaches anything printed or written', () => {
  for (const name of REPORTS) {
    it(`${name}: from-ccusage and bill`, () => {
      const file = join(FIXTURES, name);
      const out = join(scratch(), 'usage.jsonl');
      const converted = run(['from-ccusage', file, '-o', out]);
      const billed = run(['bill', file, '--receipt']);
      const statement = run(['bill', file, '--table']);
      for (const result of [converted, billed, statement]) assert.equal(result.status, 0, result.stderr);
      const everything = withoutFixturePaths(
        [readFileSync(out, 'utf8'), converted.stderr, billed.stdout, billed.stderr, statement.stdout, statement.stderr].join('\n'),
      );
      for (const path of PATHS) assert.ok(!everything.includes(path), `${name} leaked ${path}`);
    });
  }
});

describe('ccusage is read, never run', () => {
  it('starts no ccusage, npx or bunx, even with them on the PATH', () => {
    const dir = scratch();
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const tool of ['ccusage', 'npx', 'bunx', 'pnpm', 'npm']) {
      const script = join(bin, tool);
      writeFileSync(script, `#!/bin/sh\ntouch "${join(dir, `ran-${tool}`)}"\n`);
      chmodSync(script, 0o755);
    }
    const env = { PATH: `${bin}:${process.env.PATH ?? ''}` };
    assert.equal(run(['from-ccusage', DAILY], env).status, 0);
    assert.equal(run(['bill', DAILY, '--receipt'], env).status, 0);
    for (const tool of ['ccusage', 'npx', 'bunx', 'pnpm', 'npm']) {
      assert.equal(existsSync(join(dir, `ran-${tool}`)), false, `${tool} was started`);
    }
  });
});
