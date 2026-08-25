import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum from-claude-code`, run rather than read: the records land on
 * stdout (or `-o`) shaped for `parseUsageLine`, the summary lands on
 * stderr, nothing private crosses, and the output feeds `profile` — the
 * one pipe the command exists for.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000, cwd });

const SECRET = 'my-secret-question-3a7e';

const assistantLine = (requestId, output, session = 'sess-1') =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-10T10:00:00.000Z',
    sessionId: session,
    requestId,
    cwd: '/home/private/place',
    gitBranch: 'secret-branch',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: SECRET }],
      usage: {
        input_tokens: 100,
        output_tokens: output,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 25,
        cache_creation: { ephemeral_5m_input_tokens: 25, ephemeral_1h_input_tokens: 0 },
      },
    },
  });

/** A projects tree: two project dirs, one transcript each. */
const tree = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-cc-'));
  await mkdir(join(dir, 'projects', '-home-me-webapp'), { recursive: true });
  await mkdir(join(dir, 'projects', '-home-me-etl'), { recursive: true });
  await writeFile(
    join(dir, 'projects', '-home-me-webapp', 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', message: { content: SECRET } }),
      assistantLine('req-1', 1),
      assistantLine('req-1', 200), // the same call, finished streaming
      assistantLine('req-2', 30),
    ].join('\n') + '\n',
  );
  await writeFile(
    join(dir, 'projects', '-home-me-etl', 'b.jsonl'),
    `${assistantLine('req-3', 40, 'sess-2')}\n`,
  );
  return dir;
};

describe('from-claude-code, run', () => {
  it('refuses with the invocation when no path is given', () => {
    const out = run(['from-claude-code']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /trazum from-claude-code/);
  });

  it('names a path that does not exist', () => {
    const out = run(['from-claude-code', '/no/such/place']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /not found/);
  });

  it('a directory with no transcripts is an error, not an empty success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-cc-empty-'));
    const out = run(['from-claude-code', dir]);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /no \.jsonl transcripts/);
  });

  it('walks a tree, dedupes by request, and the records parse downstream', async () => {
    const dir = await tree();
    const out = run(['from-claude-code', join(dir, 'projects')]);
    assert.equal(out.status, 0, out.stderr);
    const records = out.stdout.trim().split('\n').map((line) => JSON.parse(line));
    // Four assistant lines, but req-1 was one call written twice.
    assert.equal(records.length, 3);
    const req1 = records.find((r) => r.usage.output_tokens === 200);
    assert.ok(req1, 'the streamed call did not keep its final counts');
    // The summary is on stderr: transcripts, priced calls, what streamed.
    assert.match(out.stderr, /2 transcript\(s\), 3 priced call\(s\)/);
    assert.match(out.stderr, /1 call\(s\) were written while still streaming/);
  });

  it('lets nothing private cross — grepped, not trusted', async () => {
    const dir = await tree();
    const out = run(['from-claude-code', join(dir, 'projects')]);
    for (const planted of [SECRET, '/home/private/place', 'secret-branch', 'req-1']) {
      assert.ok(!out.stdout.includes(planted), `${planted} crossed into the log`);
      assert.ok(!out.stderr.includes(planted), `${planted} crossed into the summary`);
    }
  });

  it('stamps one label, or the project directory name, never both', async () => {
    const dir = await tree();
    const labelled = run(['from-claude-code', join(dir, 'projects'), '--label', 'agents']);
    assert.ok(labelled.stdout.trim().split('\n').every((l) => JSON.parse(l).label === 'agents'));
    const byProject = run(['from-claude-code', join(dir, 'projects'), '--label-from-project']);
    const labels = new Set(byProject.stdout.trim().split('\n').map((l) => JSON.parse(l).label));
    /**
     * The expected value changed in 1.77, and the intent did not.
     *
     * This used to read the raw folder name, `-home-me-etl`. Claude Code
     * encodes the project's absolute path with `/` as `-`, so that string
     * is a path wearing a costume; the last segment of it is the project's
     * own directory name, which is the word a person would have chosen and
     * the word the report then puts beside the money. What this guard
     * holds is unchanged: one label, or the project's name, never both.
     */
    assert.deepEqual([...labels].sort(), ['etl', 'webapp']);
  });

  it('-o writes the log and the pipe into profile works', async () => {
    const dir = await tree();
    const log = join(dir, 'usage.jsonl');
    const converted = run(['from-claude-code', join(dir, 'projects'), '-o', log]);
    assert.equal(converted.status, 0, converted.stderr);
    assert.equal(converted.stdout, '', 'with -o, stdout stays clean');
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 3);
    const profiled = run(['profile', log]);
    assert.equal(profiled.status, 0, profiled.stderr);
    assert.match(profiled.stdout, /3 calls/);
  });
});

/**
 * The 1.77 default: a folder of projects is a folder of workloads.
 *
 * The flag existed and nobody found it, so a real forty-day run produced a
 * label on 0 of 10,393 records and the report could only ever describe a
 * mixture. These hold the new default, its opt-out, and the fact that a
 * single file is still nobody's workload unless the caller says so.
 */
describe('a folder of projects labels itself', () => {
  const tree = async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-projects-'));
    // Claude Code encodes the project's absolute path, `/` becoming `-`.
    for (const folder of ['-Users-mac-Trazum', '-Users-mac-other-app']) {
      await mkdir(join(root, folder), { recursive: true });
      await writeFile(join(root, folder, 'session.jsonl'), assistantLine('req-1', 20));
    }
    return root;
  };

  const labelsOf = (stdout) =>
    stdout
      .trim()
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line).label);

  it('labels by project folder without being asked, decoding the encoded path', () => {
    return tree().then((root) => {
      const out = run(['from-claude-code', root]);
      assert.equal(out.status, 0, out.stderr);
      // The last segment of the encoding is the project's own directory
      // name, which is the word a person would have chosen.
      assert.deepEqual(labelsOf(out.stdout).sort(), ['Trazum', 'app']);
      // And it says so, rather than relabelling somebody's log in silence.
      assert.match(out.stderr, /--no-label-from-project/);
    });
  });

  it('declines when told to, and an explicit label still wins', () => {
    return tree().then((root) => {
      const off = run(['from-claude-code', root, '--no-label-from-project']);
      assert.equal(off.status, 0, off.stderr);
      assert.deepEqual(labelsOf(off.stdout), [undefined, undefined]);

      const explicit = run(['from-claude-code', root, '--label', 'everything']);
      assert.equal(explicit.status, 0, explicit.stderr);
      assert.deepEqual(labelsOf(explicit.stdout), ['everything', 'everything']);
    });
  });

  it('a single file is nobody\'s workload unless the caller says so', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-one-'));
    const file = join(root, 'session.jsonl');
    await writeFile(file, assistantLine('req-1', 20));
    const out = run(['from-claude-code', file]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(labelsOf(out.stdout), [undefined]);
  });
});
