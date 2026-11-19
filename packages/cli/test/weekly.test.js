import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum weekly` (#757): the week in Markdown, against two made-up weeks.
 *
 * The log and the arithmetic are the ones `packages/core/test/weekly.test.js`
 * works out by hand: the week of 2026-11-13 to 2026-11-19 cost $12.00 over six
 * calls, the week before it $6.00 over three, the bill moved +$6.00 (+100.0%),
 * and the two changes are projected at $8.75 and $1.75. The expected figures
 * below are those, written here and never read back from the output.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SRC = new URL('../src/', import.meta.url);

const call = (ts, label, input, output = 0) =>
  JSON.stringify({ ts, model: 'claude-sonnet-5-5', label, usage: { input_tokens: input, output_tokens: output } });
const LOG = [
  call('2026-11-06T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-09T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-12T23:59:59Z', 'draft', 500_000, 100_000),
  call('2026-11-13T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-14T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-15T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-16T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-19T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-17T09:00:00Z', 'draft', 500_000, 100_000),
];

/** Every dollar amount that is in the two weeks' bills, by hand. */
const IN_THE_BILL = new Set(['$12.00', '$6.00', '$10.00', '$2.00', '$8.75', '$1.75']);

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', ...env },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });

async function scratch(lines = LOG) {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-weekly-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, `${lines.join('\n')}\n`);
  return { dir, path };
}

describe('trazum weekly, against two made-up weeks', () => {
  it('writes the bill, what moved and the ranked changes, each as the hand arithmetic has it', async () => {
    const { path } = await scratch();
    const result = run(['weekly', path, '--until', '2026-11-19']);
    assert.equal(result.status, 0, result.stderr);
    const text = result.stdout;
    assert.match(text, /week of 2026-11-13 to 2026-11-19/);
    assert.match(text, /\*\*\$12\.00\*\* over 6 calls/);
    assert.match(text, /\+\$6\.00 \(\+100\.0%\)/);
    assert.match(text, /\$12\.00 now, \$6\.00 then/);
    assert.match(text, /1\. \*\*Route and batch `classify`[^\n]*\$8\.75 projected/);
    assert.match(text, /2\. \*\*Route and batch `draft`[^\n]*\$1\.75 projected/);
    assert.match(text, /classify[\s\S]*\$10\.00 over 5 calls/, 'the measured figure beside the first change');
    assert.ok(text.trimEnd().endsWith('<!-- trazum-weekly:2026-11-19 -->'), 'the marker is the last line');
  });

  it('prints no dollar amount that is not in the bill', async () => {
    const { path } = await scratch();
    const text = run(['weekly', path, '--until', '2026-11-19']).stdout;
    const amounts = [...text.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0]);
    assert.ok(amounts.length >= 8, `only ${amounts.length} amounts found: is the summary empty?`);
    const stray = amounts.filter((amount) => !IN_THE_BILL.has(amount));
    assert.deepEqual(stray, [], 'a figure in the summary is not in the bill');
  });

  it('calls a projection projected and never describes it as measured', async () => {
    const { path } = await scratch();
    const text = run(['weekly', path, '--until', '2026-11-19']).stdout;
    for (const line of text.split('\n').filter((l) => /^\d\. /.test(l))) {
      assert.match(line, /Projected, not measured/, `a change line does not say it is a projection: ${line}`);
      assert.doesNotMatch(line, /already spent|saved \$/, line);
    }
    assert.match(text, /trazum verify plan\.json/);
  });

  it('writes the same text to a file as to stdout, and says so on stderr only', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'week.md');
    const toFile = run(['weekly', path, '--until', '2026-11-19', '-o', out]);
    assert.equal(toFile.status, 0, toFile.stderr);
    assert.equal(toFile.stdout, '');
    const direct = run(['weekly', path, '--until', '2026-11-19']);
    assert.equal(await readFile(out, 'utf8'), direct.stdout);
  });

  it('prints no percentage and no comparison when the week before holds no call', async () => {
    const { path } = await scratch(LOG.slice(3));
    const text = run(['weekly', path, '--until', '2026-11-19']).stdout;
    assert.match(text, /\*\*\$12\.00\*\*/);
    assert.doesNotMatch(text, /\d%/, 'a percentage against nothing');
    assert.doesNotMatch(text, /The bill moved/);
  });

  it('says a quiet week is quiet, and states no bill for it', async () => {
    const { path } = await scratch();
    const result = run(['weekly', path, '--until', '2026-12-31']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /\$\d/, 'a quiet week was given a dollar figure');
    assert.match(result.stdout, /trazum-weekly:2026-12-31/);
  });

  it('reads in the reader\'s language without changing a figure', async () => {
    const { path } = await scratch();
    const en = run(['weekly', path, '--until', '2026-11-19']).stdout;
    const es = run(['weekly', path, '--until', '2026-11-19', '--locale', 'es']).stdout;
    assert.notEqual(es, en);
    const figures = (text) => [...text.matchAll(/\$\d[\d,]*(?:\.\d+)?|\d+\.\d%/g)].map((m) => m[0]);
    assert.deepEqual(figures(es), figures(en));
  });

  it('refuses a flag it does not take, and a bad --until', async () => {
    const { path } = await scratch();
    assert.notEqual(run(['weekly', path, '--since', '2026-11-01']).status, 0);
    assert.notEqual(run(['weekly', path, '--until', 'last tuesday']).status, 0);
  });

  it('shows one line of figures as a notification, only when asked, and through what the platform has', async (t) => {
    if (process.platform !== 'linux') return t.skip('the stand-in notifier is notify-send');
    const { dir, path } = await scratch();
    const bin = join(dir, 'bin');
    const log = join(dir, 'notified.txt');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(bin);
    await writeFile(join(bin, 'notify-send'), `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\n`);
    await chmod(join(bin, 'notify-send'), 0o755);
    const env = { PATH: `${bin}:${process.env.PATH}` };

    const quiet = run(['weekly', path, '--until', '2026-11-19'], env);
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.throws(() => readFileSync(log), /ENOENT/, 'a notification was shown without --notify');

    const asked = run(['weekly', path, '--until', '2026-11-19', '--notify', '-o', join(dir, 'w.md')], env);
    assert.equal(asked.status, 0, asked.stderr);
    const shown = readFileSync(log, 'utf8');
    assert.match(shown, /\$12\.00 over 6 calls, \+\$6\.00 \(\+100\.0%\) against the week before/);
    assert.doesNotMatch(shown, /classify|draft|usage\.jsonl|\/tmp/, 'a name or a path reached the notification');
  });

  it('says where there is no notifier and still writes the summary', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'w.md');
    // A PATH with nothing on it: no notify-send, and no osascript either.
    const result = run(['weekly', path, '--until', '2026-11-19', '--notify', '-o', out], { PATH: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(out, 'utf8'), /\$12\.00/);
    assert.match(result.stderr, /notif/i);
  });
});

describe('a figure that is not in the bill', () => {
  it('stops the summary being written, naming the figure', async () => {
    const { BUNDLED_CATALOGUE, billFigures, billLevers, buildPlan, buildWeeklySummary, profileUsage, weekWindows } = await import('@trazum/core');
    const { checkedWeekly } = await import('../dist/weekly.js');
    const { getCliMessages } = await import('../dist/i18n/index.js');
    const t = getCliMessages('en');
    const windows = weekWindows(Date.parse('2026-11-20T00:00:00Z'));
    const text = LOG.join('\n');
    const at = (w) => profileUsage(text, { catalogue: BUNDLED_CATALOGUE, sinceMs: w.sinceMs, untilMs: w.untilMs });
    const [current, previous] = [at(windows.current), at(windows.previous)];
    const plan = buildPlan(current, billLevers(current, { catalogue: BUNDLED_CATALOGUE }), '2026-11-19');
    const figures = billFigures(current, previous, plan);
    const summary = buildWeeklySummary(current, previous, plan, windows);

    assert.match(checkedWeekly(summary, figures, t).markdown, /\$12\.00/, 'the honest summary was refused');
    // The planted fault: a summary whose total is not the bill's.
    assert.throws(() => checkedWeekly({ ...summary, totalUsd: 13.2 }, figures, t), /\$13\.20/);
    // And a percentage the bills do not hold.
    assert.throws(() => checkedWeekly({ ...summary, comparison: { ...summary.comparison, deltaPct: 250 } }, figures, t), /250\.0%/);
  });
});

describe('what trazum weekly can reach', () => {
  it('holds no token and makes no request: the Action posts, the CLI writes', () => {
    const own = readFileSync(new URL('weekly.ts', SRC), 'utf8');
    const index = readFileSync(new URL('index.ts', SRC), 'utf8');
    const start = index.indexOf('async function commandWeekly');
    const command = index.slice(start, index.indexOf('\n}\n', start));
    assert.ok(command.length > 500, 'could not find commandWeekly');
    for (const [name, source] of [['weekly.ts', own], ['commandWeekly', command]]) {
      assert.doesNotMatch(source, /TOKEN|GITHUB_|fetch\(|api\.github|https?:\/\//, `${name} reaches for a token or a network`);
    }
  });
});

describe('the page that quotes it', () => {
  it('quotes output that was produced', async () => {
    const reference = readFileSync(new URL('../../../docs/commands.md', import.meta.url), 'utf8');
    const start = reference.indexOf('*Real output of `trazum weekly');
    assert.ok(start > 0, 'the sample is gone from docs/commands.md');
    const fence = reference.indexOf('```markdown\n', start) + '```markdown\n'.length;
    const quoted = reference.slice(fence, reference.indexOf('\n```', fence));
    const { path } = await scratch();
    const result = run(['weekly', path, '--until', '2026-11-19']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(`${quoted}\n`, result.stdout, 'docs/commands.md quotes output this command no longer prints');
  });
});
