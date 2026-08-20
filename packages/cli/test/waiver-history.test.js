import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The waiver record, end to end.
 *
 * 1.40 wanted to say "this finding has been waived three times in a row" and
 * refused to, because the only material available was the config as it stands.
 * The material exists now, and the whole point is that it is a **record**: a
 * use is written when a gate is actually silenced, never derived from a
 * waiver's existence.
 */

const FUTURE = '2099-01-01';

/** A repository whose bill always fails a $1 budget, so only the waiver decides. */
const workspace = async (config) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-waiver-'));
  await writeFile(
    join(dir, 'usage.jsonl'),
    `${JSON.stringify({
      model: 'claude-opus-5',
      label: 'rag',
      usage: { input_tokens: 2_000_000, output_tokens: 0 },
    })}\n`,
  );
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify(config, null, 2));
  return dir;
};

const profile = (dir, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', 'usage.jsonl', ...extra], {
    cwd: dir,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const readLog = async (dir) => {
  const raw = await readFile(join(dir, '.trazum/waivers.jsonl'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
};

const WAIVED = {
  spend: { maxUsd: 1 },
  waive: [{ gate: 'maxUsd', reason: 'the migration lands in March', until: FUTURE }],
};

describe('recording a waiver use', () => {
  it('writes one line when a waiver actually silences a gate', async () => {
    const dir = await workspace(WAIVED);
    const result = profile(dir);
    assert.equal(result.status, 0, 'the waiver silences the gate, so the run passes');

    const [use] = await readLog(dir);
    assert.equal(use.schemaVersion, 1);
    assert.equal(use.gate, 'maxUsd');
    assert.equal(use.reason, 'the migration lands in March');
    assert.equal(use.until, FUTURE);
    // Checkable rather than asserted: the figures the gate actually judged.
    assert.equal(use.limitUsd, 1);
    assert.ok(use.measuredUsd > 1);
    assert.match(use.day, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('writes nothing when the gate passes', async () => {
    // The record is of waivers *used*. A waiver sitting in a config over a
    // gate that never fires is dead config, and counting it as a use would
    // manufacture exactly the habit this is meant to detect.
    const dir = await workspace({
      spend: { maxUsd: 10_000 },
      waive: [{ gate: 'maxUsd', reason: 'unused', until: FUTURE }],
    });
    assert.equal(profile(dir).status, 0);
    await assert.rejects(readFile(join(dir, '.trazum/waivers.jsonl'), 'utf8'));
  });

  it('writes nothing when the waiver has expired', async () => {
    // An expired waiver does not silence anything, so nothing was waived.
    const dir = await workspace({
      spend: { maxUsd: 1 },
      waive: [{ gate: 'maxUsd', reason: 'stale', until: '2020-01-01' }],
    });
    assert.equal(profile(dir).status, 1, 'an expired waiver lets the gate fail');
    await assert.rejects(readFile(join(dir, '.trazum/waivers.jsonl'), 'utf8'));
  });

  it('appends rather than replacing, so the record accumulates', async () => {
    const dir = await workspace(WAIVED);
    profile(dir);
    profile(dir);
    profile(dir);
    assert.equal((await readLog(dir)).length, 3);
  });

  it('records the reason in force at the time, not the one in force later', async () => {
    // The mistake the record exists to avoid, one layer down: reading today's
    // reason back onto last quarter's decision.
    const dir = await workspace(WAIVED);
    profile(dir);
    await writeFile(
      join(dir, 'trazum.config.json'),
      JSON.stringify({
        spend: { maxUsd: 1 },
        waive: [{ gate: 'maxUsd', reason: 'the migration slipped to June', until: FUTURE }],
      }),
    );
    profile(dir);

    const uses = await readLog(dir);
    assert.equal(uses[0].reason, 'the migration lands in March');
    assert.equal(uses[1].reason, 'the migration slipped to June');
  });

  it('never fails the build when the record cannot be written', async () => {
    /**
     * The gate's job is the exit code. A read-only checkout or a full disk
     * must not turn a passing build red on account of bookkeeping.
     *
     * Made unwritable by putting a *file* where the directory has to go, which
     * works the same for every user including root — a read-only mode bit does
     * not stop root, so a permissions-based probe would pass this test on CI
     * for the wrong reason and prove nothing.
     */
    const dir = await workspace(WAIVED);
    await mkdir(join(dir, '.trazum'), { recursive: true });
    await writeFile(join(dir, '.trazum/waivers.jsonl'), 'not a directory\n');
    await writeFile(join(dir, 'block'), '');

    const blocked = await workspace(WAIVED);
    await writeFile(join(blocked, '.trazum'), 'this is a file, not a directory\n');
    const result = profile(blocked);
    assert.equal(result.status, 0, 'the waiver still silences the gate');
    assert.match(result.stderr, /not written to/i, 'and the failure is reported rather than swallowed');
  });
});

describe('trazum history reads the record back', () => {
  /**
   * Three stored reports, the minimum for a series, plus a waiver log.
   *
   * `history` reads the JSON documents `profile --json` writes, not raw usage
   * logs — so they are produced by running the real command rather than
   * hand-shaped, which also means this test fails if that document's shape
   * ever stops being readable by the command that consumes it.
   */
  const storedReports = async (dir) => {
    const reports = join(dir, 'reports');
    await mkdir(reports, { recursive: true });
    for (let i = 0; i < 3; i += 1) {
      const day = `2026-0${i + 1}-01`;
      const log = join(dir, `${day}.jsonl`);
      await writeFile(
        log,
        `${JSON.stringify({
          model: 'claude-opus-5',
          label: 'rag',
          timestamp: `${day}T00:00:00Z`,
          usage: { input_tokens: 200_000 * (i + 1), output_tokens: 0 },
        })}\n`,
      );
      const built = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
        cwd: dir,
        encoding: 'utf8',
        env: SPAWN_ENV,
        timeout: 30000,
      });
      assert.equal(built.status, 0, built.stderr);
      await writeFile(join(reports, `${day}.json`), built.stdout);
    }
    return reports;
  };

  const withReports = async (uses) => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-waiver-history-'));
    const reports = await storedReports(dir);
    await mkdir(join(dir, '.trazum'), { recursive: true });
    await writeFile(
      join(dir, '.trazum/waivers.jsonl'),
      `${uses.map((u) => JSON.stringify(u)).join('\n')}\n`,
    );
    return { dir, reports };
  };

  const use = (over = {}) => ({
    schemaVersion: 1,
    day: '2026-01-01',
    gate: 'maxUsd',
    reason: 'the migration lands in March',
    until: '2026-04-01',
    commit: null,
    measuredUsd: 12,
    limitUsd: 8,
    ...over,
  });

  /**
   * The output with its terminal wrapping collapsed.
   *
   * `wrap()` breaks prose at 76 columns with a hanging indent, so a sentence
   * asserted on here would match or not depending on where the line happened
   * to break — a test that fails when somebody rewords a neighbouring string.
   */
  const history = (dir, reports) => {
    const result = spawnSync(process.execPath, [CLI, 'history', reports], {
      cwd: dir,
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    return { ...result, stdout: result.stdout.replace(/\s+/g, ' ') };
  };

  it('names the day the record starts, and says nothing exists before it', async () => {
    const { dir, reports } = await withReports([use({ day: '2026-01-09' })]);
    const { stdout, status } = history(dir, reports);
    assert.equal(status, 0, stdout);
    assert.match(stdout, /2026-01-09/);
    assert.match(stdout, /no past was reconstructed/i);
  });

  it('names an expiry pushed forward under an unchanged reason', async () => {
    const { dir, reports } = await withReports([
      use({ day: '2026-01-01', until: '2026-02-01' }),
      use({ day: '2026-02-02', until: '2026-03-01' }),
      use({ day: '2026-03-02', until: '2026-04-01' }),
    ]);
    const { stdout } = history(dir, reports);
    assert.match(stdout, /nobody is revisiting/i);
    assert.match(stdout, /2026-02-01/);
    assert.match(stdout, /2026-04-01/);
  });

  it('is silent about waivers on a repository that has never recorded one', async () => {
    // A heading over "0 uses" teaches a reader to skip the section, and this
    // is the one they should not learn to skip.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-waiver-history-'));
    const reports = await storedReports(dir);
    const { stdout } = history(dir, reports);
    assert.doesNotMatch(stdout, /living with/i);
  });

  it('counts unreadable lines rather than dropping them quietly', async () => {
    const { dir, reports } = await withReports([use()]);
    await writeFile(join(dir, '.trazum/waivers.jsonl'), `${JSON.stringify(use())}\nnot json\n`, {
      flag: 'w',
    });
    const { stdout } = history(dir, reports);
    assert.match(stdout, /could not be read/i);
  });
});
