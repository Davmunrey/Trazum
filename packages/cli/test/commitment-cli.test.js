import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum commitment`, end to end.
 *
 * The assertion that matters is that a net-positive deal still shows what its
 * bad month cost. Netting the two is the vendor's slide, and it is the reason
 * this command exists.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'commitment', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A whole month of daily calls summing to `usd` on Opus at $5/MTok input. */
const wholeMonth = (year, month, usd) => {
  const days = daysIn(year, month);
  const perDay = usd / days;
  return Array.from({ length: days }, (_, i) => ({
    model: 'claude-opus-5',
    label: 'app',
    timestamp: `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    usage: { input_tokens: Math.round((perDay / 5) * 1_000_000), output_tokens: 0 },
  }));
};

const workspace = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-commitment-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return dir;
};

describe('trazum commitment', () => {
  it('shows what the bad month cost even when the deal wins overall', async () => {
    /**
     * The whole command in one assertion. Net positive, and one month cost
     * $2,520 — netted together that disappears, and the disappearing is what
     * a vendor's slide relies on.
     */
    const dir = await workspace([
      ...wholeMonth(2026, 1, 5000),
      ...wholeMonth(2026, 2, 5000),
      ...wholeMonth(2026, 3, 600),
      ...wholeMonth(2026, 4, 4000),
    ]);
    const { stdout, status } = run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']);
    assert.equal(status, 0);
    const text = flat(stdout);
    assert.match(text, /Net over 4 measured months: \$4\d\d\.\d\d/);
    assert.match(text, /1 of them fell short/);
    assert.match(text, /capacity nobody used comes to \$2,5\d\d/);
    assert.match(text, /the disappearing is what a vendor’s slide relies on/);
  });

  it('says it is a measurement of the past, before any figure', async () => {
    const dir = await workspace([...wholeMonth(2026, 1, 5000), ...wholeMonth(2026, 2, 5000), ...wholeMonth(2026, 3, 5000)]);
    const { stdout } = run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']);
    const caveat = stdout.indexOf('measurement of the past');
    const table = stdout.indexOf('would pay');
    assert.ok(caveat > 0 && table > caveat, 'the caveat comes before the table');
    assert.match(flat(stdout), /Nothing here is annualised, extrapolated or fitted to a trend/);
  });

  it('reads a discount written either way a contract writes it', async () => {
    const dir = await workspace([...wholeMonth(2026, 1, 5000), ...wholeMonth(2026, 2, 5000), ...wholeMonth(2026, 3, 5000)]);
    const asPct = flat(run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']).stdout);
    const asFraction = flat(run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '0.2']).stdout);
    assert.equal(asPct, asFraction);
  });

  it('refuses fewer than three whole months and says how many more', async () => {
    const dir = await workspace(wholeMonth(2026, 1, 5000));
    const text = flat(run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']).stdout);
    assert.match(text, /2 more whole month\(s\) would settle it/);
    assert.match(text, /a year-long decision made on a fortnight of evidence/);
    // The break-even is a fact about the deal, so it is stated anyway.
    assert.match(text, /Break-even is \$3,000/);
  });

  it('marks a history shorter than the term rather than refusing it', async () => {
    // Six months against a twelve-month deal is a real answer about six.
    const dir = await workspace([1, 2, 3, 4, 5, 6].flatMap((m) => wholeMonth(2026, m, 5000)));
    const text = flat(run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']).stdout);
    assert.match(text, /replays 6 months against a 12-month commitment/);
    assert.match(text, /a real answer about 6 months and not about 12/);
  });

  it('drops a partial month rather than scaling it', async () => {
    /**
     * A fortnight replayed against a monthly floor is a shortfall the traffic
     * never had — the deal judged against half a month of usage and a whole
     * month of commitment.
     */
    const partial = wholeMonth(2026, 4, 4000).slice(0, 10);
    const dir = await workspace([
      ...wholeMonth(2026, 1, 5000),
      ...wholeMonth(2026, 2, 5000),
      ...wholeMonth(2026, 3, 5000),
      ...partial,
    ]);
    const text = flat(run(dir, ['usage.jsonl', '--floor', '3000', '--discount', '20']).stdout);
    assert.match(text, /Net over 3 measured months/);
    assert.doesNotMatch(text, /2026-04/);
  });

  it('requires the terms rather than inventing them', async () => {
    const dir = await workspace(wholeMonth(2026, 1, 5000));
    const { stderr, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 1);
    assert.match(flat(stderr), /--floor and --discount are required/);
    assert.match(flat(stderr), /Take them from the contract/);
  });
});
