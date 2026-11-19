import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { decide, guardCommand, parseGuardCommand, parseThresholds, viewGuard } from '../dist/session-guard.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum session-guard`: a hook that warns, then stops, at two dollar figures.
 *
 * Every test builds its own home, cache directory and transcript under the
 * temporary directory and points `HOME` and `TRAZUM_STATUSLINE_CACHE` at them,
 * so none of them can reach the real settings file. The last test hashes the
 * real one before and after the file ran.
 *
 * **The money is worked out by hand.** The made-up transcripts use Claude
 * Opus 5 and output tokens only. Its output price in the bundled catalogue is
 * $25 per million tokens, so a call that outputs 100,000 tokens costs
 * 100,000 / 1,000,000 x $25 = $2.50, and n such calls cost n x $2.50:
 *
 *   1 call  =  $2.50    under   --warn 5
 *   3 calls =  $7.50    between --warn 5 and --stop 15
 *   6 calls = $15.00    exactly at --stop 15
 *   7 calls = $17.50    over    --stop 15
 */

const REAL_HOME = homedir();
const REAL_SETTINGS = join(REAL_HOME, '.claude', 'settings.json');
const hashOf = (path) => {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const realBefore = hashOf(REAL_SETTINGS);

const THRESHOLDS = ['--warn', '5', '--stop', '15', '--on-cannot-tell', 'fail-open'];
const CLOSED = ['--warn', '5', '--stop', '15', '--on-cannot-tell', 'fail-closed'];

const call = (n, model = 'claude-opus-5', output = 100_000) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-19T10:00:00.000Z',
    sessionId: 'made-up-session',
    requestId: `req-${model}-${n}`,
    message: { model, content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 0, output_tokens: output } },
  });

/** A made-up machine: a home with a `.claude` folder, a cache directory, and a transcript of `calls` calls. */
async function machine({ calls = 0, extra = [], settings } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-session-guard-'));
  const home = join(root, 'home');
  const cache = join(root, 'cache');
  await mkdir(join(home, '.claude'), { recursive: true });
  const transcript = join(root, 'transcript.jsonl');
  const lines = [...Array.from({ length: calls }, (_, i) => call(i)), ...extra];
  await writeFile(transcript, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
  if (settings !== undefined) await writeFile(join(home, '.claude', 'settings.json'), settings);
  return { root, home, cache, transcript, settings: join(home, '.claude', 'settings.json') };
}

const env = (m, more = {}) => ({ ...SPAWN_ENV, HOME: m.home, USERPROFILE: m.home, TRAZUM_STATUSLINE_CACHE: m.cache, TMPDIR: m.root, ...more });

/** One call of the hook, as Claude Code makes it: JSON on stdin. */
const hook = (m, flags, input, more = {}, args = []) =>
  spawnSync(process.execPath, [CLI, ...args, 'session-guard', 'check', ...flags], {
    encoding: 'utf8',
    env: env(m, more),
    input: JSON.stringify(input),
    timeout: 30000,
  });
const prompt = (m, session = 'session-a') => ({ session_id: session, transcript_path: m.transcript, hook_event_name: 'UserPromptSubmit' });

const guard = (m, args, more = {}) =>
  spawnSync(process.execPath, [CLI, 'session-guard', ...args], { encoding: 'utf8', env: env(m, more), timeout: 30000 });

describe('the hook, against a made-up transcript', () => {
  it('is silent under the warning figure', async () => {
    const m = await machine({ calls: 1 });
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });

  it('warns between the figures, as the JSON field the hooks page documents, and does not stop', async () => {
    const m = await machine({ calls: 3 });
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 0, r.stderr);
    // `systemMessage` on stdout at exit 0 is the documented way to show the user a warning;
    // plain stdout on UserPromptSubmit would be handed to the model.
    const body = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(body), ['systemMessage']);
    assert.match(body.systemMessage, /API-equivalent/);
    assert.ok(body.systemMessage.includes('$7.50'), 'the figure is the hand-worked $7.50');
  });

  it('warns at exactly the warning figure', async () => {
    const m = await machine({ calls: 2 }); // $5.00
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 0);
    assert.ok(JSON.parse(r.stdout).systemMessage.includes('$5.00'));
  });

  it('gives the warning once per session, and again for another session', async () => {
    const m = await machine({ calls: 3 });
    const first = hook(m, THRESHOLDS, prompt(m, 'session-a'));
    const second = hook(m, THRESHOLDS, prompt(m, 'session-a'));
    const other = hook(m, THRESHOLDS, prompt(m, 'session-b'));
    assert.notEqual(first.stdout, '');
    assert.equal(second.stdout, '', 'the same session is not told twice');
    assert.equal(second.status, 0);
    assert.notEqual(other.stdout, '', 'another session is told');
    // The memory is a file in the status line's cache directory, and nowhere else.
    const names = readdirSync(m.cache);
    assert.equal(names.length, 2);
    assert.ok(names.every((name) => /^guard-[0-9a-f]{32}\.warned$/.test(name)), names.join(','));
    assert.deepEqual(readdirSync(m.home), ['.claude']);
    assert.deepEqual(readdirSync(join(m.home, '.claude')), []);
  });

  it('blocks at exactly the stop figure with exit code 2 and the reason on stderr', async () => {
    const m = await machine({ calls: 6 }); // $15.00
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.ok(r.stderr.includes('$15.00'));
    assert.match(r.stderr, /API-equivalent/);
  });

  it('blocks over the stop figure, and keeps blocking after the warning was given', async () => {
    const m = await machine({ calls: 3 });
    assert.equal(hook(m, THRESHOLDS, prompt(m)).status, 0); // warned
    await writeFile(m.transcript, `${Array.from({ length: 7 }, (_, i) => call(i)).join('\n')}\n`); // $17.50
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('$17.50'));
    assert.equal(hook(m, THRESHOLDS, prompt(m)).status, 2, 'a stop is never given once and then dropped');
  });

  it('does not block just under the stop figure', async () => {
    const m = await machine({ calls: 5 }); // $12.50, over the warning and under the stop
    assert.equal(hook(m, THRESHOLDS, prompt(m)).status, 0);
  });

  it('counts the subagents of the session, which are in the folder named after it', async () => {
    const m = await machine({ calls: 1 }); // $2.50 in the main transcript
    const folder = join(m.root, 'transcript', 'subagents');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'agent-1.jsonl'), `${Array.from({ length: 5 }, (_, i) => call(`sub${i}`)).join('\n')}\n`); // $12.50
    // $2.50 + $12.50 = $15.00, which is the stop figure. The main transcript alone would be silent.
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('$15.00'));
  });

  it('speaks Spanish when asked, and says the same thing differently', async () => {
    const m = await machine({ calls: 6 });
    const en = hook(m, THRESHOLDS, prompt(m), {}, ['--locale', 'en']);
    const es = hook(m, THRESHOLDS, prompt(m), {}, ['--locale', 'es']);
    assert.equal(en.status, 2);
    assert.equal(es.status, 2);
    assert.notEqual(en.stderr, es.stderr);
    assert.match(es.stderr, /equivalente en API/);
  });
});

describe('what the hook cannot tell', () => {
  it('never prices a model with no price at zero: fail-closed stops, fail-open says so, once', async () => {
    const m = await machine({ extra: [call(1, 'claude-made-up-9')] });
    const closed = hook(m, CLOSED, prompt(m));
    assert.equal(closed.status, 2, 'a $0 guess would have let it through');
    assert.ok(closed.stderr.includes('claude-made-up-9'));
    const open = hook(m, THRESHOLDS, prompt(m));
    assert.equal(open.status, 0);
    assert.ok(JSON.parse(open.stdout).systemMessage.includes('claude-made-up-9'), 'a $0 guess would have been silent');
    assert.equal(hook(m, THRESHOLDS, prompt(m)).stdout, '', 'said once per session');
  });

  it('counts what was priced as a floor: an unpriced model cannot hide a stop', async () => {
    const m = await machine({ calls: 7, extra: [call(99, 'claude-made-up-9')] }); // the priced calls are $17.50
    const r = hook(m, THRESHOLDS, prompt(m));
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('$17.50'));
  });

  it('follows --on-cannot-tell for a transcript that cannot be read', async () => {
    const m = await machine({ calls: 7 });
    const gone = { session_id: 's', transcript_path: join(m.root, 'not-there.jsonl') };
    assert.equal(hook(m, CLOSED, gone).status, 2);
    const open = hook(m, THRESHOLDS, gone);
    assert.equal(open.status, 0);
    assert.notEqual(open.stdout, '');
  });

  it('follows --on-cannot-tell for no transcript at all, and for input that is not JSON', async () => {
    const m = await machine({ calls: 7 });
    assert.equal(hook(m, CLOSED, { session_id: 's' }).status, 2);
    const garbage = spawnSync(process.execPath, [CLI, 'session-guard', 'check', ...CLOSED], { encoding: 'utf8', env: env(m), input: '{not json', timeout: 30000 });
    assert.equal(garbage.status, 2);
    assert.equal(hook(m, THRESHOLDS, { session_id: 's' }).status, 0);
  });

  it('does not read a transcript of lines that are not usage as a session that cost nothing', async () => {
    const m = await machine();
    await writeFile(m.transcript, 'this is not json\nnor is this\n');
    assert.equal(hook(m, CLOSED, prompt(m)).status, 2);
  });

  it('reads a transcript with no calls yet as a session that has cost nothing', async () => {
    const m = await machine();
    const r = hook(m, CLOSED, prompt(m));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

describe('nothing has a default', () => {
  it('refuses, naming each flag that is missing, on check and on install', async () => {
    const m = await machine();
    for (const args of [['check'], ['install', '--yes']]) {
      const r = guard(m, args);
      assert.equal(r.status, 1, args.join(' '));
      for (const flag of ['--warn', '--stop', '--on-cannot-tell']) assert.ok(r.stderr.includes(flag), `${args[0]} did not name ${flag}`);
    }
    const some = guard(m, ['check', '--warn', '5']);
    assert.ok(some.stderr.includes('--stop') && some.stderr.includes('--on-cannot-tell'));
    assert.ok(!some.stderr.includes('Not set: --warn'));
    assert.equal(existsSync(m.settings), false);
  });

  it('refuses amounts that are not amounts, a warning that is not below the stop, and a policy it does not know', async () => {
    const m = await machine();
    for (const flags of [
      ['--warn', 'five', '--stop', '15', '--on-cannot-tell', 'fail-open'],
      ['--warn', '0', '--stop', '15', '--on-cannot-tell', 'fail-open'],
      ['--warn', '5', '--stop', '-1', '--on-cannot-tell', 'fail-open'],
      ['--warn', '15', '--stop', '15', '--on-cannot-tell', 'fail-open'],
      ['--warn', '20', '--stop', '15', '--on-cannot-tell', 'fail-open'],
      ['--warn', '5', '--stop', '15', '--on-cannot-tell', 'whatever'],
    ]) {
      assert.equal(guard(m, ['check', ...flags]).status, 1, flags.join(' '));
      assert.equal(guard(m, ['install', '--yes', ...flags]).status, 1, flags.join(' '));
    }
    assert.equal(existsSync(m.settings), false);
  });

  it('accepts no pricing overlay and no live pricing: it reads only what is on the machine', async () => {
    const m = await machine();
    assert.equal(guard(m, ['check', ...THRESHOLDS, '--pricing-live']).status, 1);
    assert.equal(guard(m, ['check', ...THRESHOLDS, '--pricing', 'x.json']).status, 1);
  });

  it('pure parts: the same refusals, and the policy table', () => {
    assert.equal(parseThresholds({ warn: '5', stop: '15', policy: 'fail-open' }).ok, true);
    assert.equal(parseThresholds({ warn: undefined, stop: undefined, policy: undefined }).ok, false);
    const cost = { kind: 'cannot-tell', cause: 'unreadable' };
    const th = { warnUsd: 5, stopUsd: 15, policy: 'fail-open' };
    assert.equal(decide(cost, th).action, 'allow-cannot-tell');
    assert.equal(decide(cost, { ...th, policy: 'fail-closed' }).action, 'block-cannot-tell');
    assert.equal(decide({ kind: 'measured', usd: 0 }, th).action, 'allow');
    assert.equal(decide({ kind: 'measured', usd: 5 }, th).action, 'warn');
    assert.equal(decide({ kind: 'measured', usd: 15 }, th).action, 'block');
    assert.equal(decide({ kind: 'floor', usd: 0, unpricedModels: ['m'] }, th).action, 'allow-cannot-tell');
  });
});

describe('install and uninstall, into a temporary settings file', () => {
  const foreign = (command) => ({ type: 'command', command });
  const original = {
    statusLine: { type: 'command', command: '/somebody/elses-status.sh' },
    permissions: { allow: ['Bash(ls)'] },
    hooks: {
      Stop: [{ matcher: '*', hooks: [foreign('/somebody/stop.sh')] }],
      UserPromptSubmit: [{ hooks: [foreign('/somebody/prompt.sh'), foreign("echo session-guard check --warn 1 --stop 2 --on-cannot-tell fail-open")] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [foreign('/somebody/bash-check.sh')] }],
    },
  };
  const settingsText = `${JSON.stringify(original, null, 2)}\n`;

  it('writes nothing without a yes when it is not a terminal, and says so', async () => {
    const m = await machine({ settings: settingsText });
    const r = guard(m, ['install', ...THRESHOLDS]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(await readFile(m.settings, 'utf8'), settingsText);
    assert.equal(existsSync(join(m.home, '.trazum')), false);
    assert.ok(r.stdout.includes('session-guard check'), 'it shows the line it would write');
  });

  it('adds the hook to both events and touches no other hook, then removes exactly that', async () => {
    const m = await machine({ settings: settingsText });
    const r = guard(m, ['install', ...THRESHOLDS, '--yes']);
    assert.equal(r.status, 0, r.stderr);
    const after = JSON.parse(await readFile(m.settings, 'utf8'));

    // Everything that was there is still there, in its place.
    assert.deepEqual(after.statusLine, original.statusLine);
    assert.deepEqual(after.permissions, original.permissions);
    assert.deepEqual(after.hooks.Stop, original.hooks.Stop);
    assert.deepEqual(after.hooks.UserPromptSubmit[0], original.hooks.UserPromptSubmit[0]);
    assert.deepEqual(after.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);

    // And one entry more on each of the two events, naming the thresholds.
    assert.equal(after.hooks.UserPromptSubmit.length, 2);
    assert.equal(after.hooks.PreToolUse.length, 2);
    const ours = [after.hooks.UserPromptSubmit[1], after.hooks.PreToolUse[1]];
    assert.equal(ours[0].matcher, undefined);
    assert.equal(ours[1].matcher, '*');
    for (const entry of ours) {
      assert.equal(entry.hooks.length, 1);
      const parsed = parseGuardCommand(entry.hooks[0].command);
      assert.deepEqual(parsed?.thresholds, { warnUsd: 5, stopUsd: 15, policy: 'fail-open' });
    }
    assert.equal(await readFile(`${m.settings}.trazum-backup`, 'utf8'), settingsText, 'the first change keeps a copy of what was there');

    const status = guard(m, ['status']);
    assert.ok(status.stdout.includes('$5.00') && status.stdout.includes('$15.00'));

    const off = guard(m, ['uninstall', '--yes']);
    assert.equal(off.status, 0, off.stderr);
    assert.deepEqual(JSON.parse(await readFile(m.settings, 'utf8')), original);
    assert.equal(existsSync(join(m.home, '.trazum')), false, 'the record it made goes when nothing is left to record');
    assert.equal(guard(m, ['uninstall', '--yes']).status, 0);
    assert.deepEqual(JSON.parse(await readFile(m.settings, 'utf8')), original);
  });

  it('installs again with other figures by rewriting its own line, not by adding a second', async () => {
    const m = await machine({ settings: settingsText });
    guard(m, ['install', ...THRESHOLDS, '--yes']);
    const second = guard(m, ['install', '--warn', '2.5', '--stop', '9', '--on-cannot-tell', 'fail-closed', '--yes']);
    assert.equal(second.status, 0, second.stderr);
    const after = JSON.parse(await readFile(m.settings, 'utf8'));
    assert.equal(after.hooks.UserPromptSubmit.length, 2);
    assert.equal(after.hooks.PreToolUse.length, 2);
    assert.deepEqual(parseGuardCommand(after.hooks.PreToolUse[1].hooks[0].command)?.thresholds, { warnUsd: 2.5, stopUsd: 9, policy: 'fail-closed' });
    const same = guard(m, ['install', '--warn', '2.5', '--stop', '9', '--on-cannot-tell', 'fail-closed', '--yes']);
    assert.equal(same.status, 0);
    assert.deepEqual(JSON.parse(await readFile(m.settings, 'utf8')), after, 'the same figures change nothing');
    guard(m, ['uninstall', '--yes']);
    assert.deepEqual(JSON.parse(await readFile(m.settings, 'utf8')), original);
  });

  it('removes a settings file it created, and the containers it made, and nothing else', async () => {
    const m = await machine();
    assert.equal(guard(m, ['install', ...THRESHOLDS, '--yes']).status, 0);
    assert.equal(existsSync(m.settings), true);
    assert.equal(existsSync(`${m.settings}.trazum-backup`), false, 'a file it made has no earlier text to keep');
    assert.equal(guard(m, ['uninstall', '--yes']).status, 0);
    assert.equal(existsSync(m.settings), false);
    assert.equal(existsSync(join(m.home, '.trazum')), false);

    const partial = await machine({ settings: '{"model":"opus"}\n' });
    guard(partial, ['install', ...THRESHOLDS, '--yes']);
    guard(partial, ['uninstall', '--yes']);
    assert.deepEqual(JSON.parse(await readFile(partial.settings, 'utf8')), { model: 'opus' });
  });

  it('leaves a settings file it cannot read as data, and a machine with no Claude Code, alone', async () => {
    const broken = await machine({ settings: '{ not json' });
    const r = guard(broken, ['install', ...THRESHOLDS, '--yes']);
    assert.equal(r.status, 1);
    assert.equal(await readFile(broken.settings, 'utf8'), '{ not json');

    const odd = await machine({ settings: '{"hooks":{"PreToolUse":{"not":"a list"}}}\n' });
    assert.equal(guard(odd, ['install', ...THRESHOLDS, '--yes']).status, 1);
    assert.equal(await readFile(odd.settings, 'utf8'), '{"hooks":{"PreToolUse":{"not":"a list"}}}\n');

    const none = await machine();
    await import('node:fs/promises').then((fs) => fs.rm(join(none.home, '.claude'), { recursive: true }));
    assert.equal(guard(none, ['install', ...THRESHOLDS, '--yes']).status, 1);
    assert.equal(existsSync(join(none.home, '.claude')), false);
  });

  it('does not take a hook of the person that merely mentions it for its own', () => {
    assert.equal(parseGuardCommand('echo session-guard check --warn 1 --stop 2 --on-cannot-tell fail-open'), null);
    const own = guardCommand('/n/node', '/c/index.js', { warnUsd: 5, stopUsd: 15, policy: 'fail-open' });
    assert.ok(parseGuardCommand(own) !== null);
    assert.equal(parseGuardCommand(`${own} && rm -rf x`), null);
    assert.deepEqual(viewGuard({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo session-guard' }] }] } }).found, {});
  });

  it('`proactive off` leaves the guard where it is', async () => {
    const m = await machine({ settings: settingsText });
    guard(m, ['install', ...THRESHOLDS, '--yes']);
    const before = await readFile(m.settings, 'utf8');
    const r = spawnSync(process.execPath, [CLI, 'proactive', 'off', '--only', 'statusline', '--yes'], { encoding: 'utf8', env: env(m), cwd: m.home, timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(await readFile(m.settings, 'utf8'), before);
  });
});

describe('the real home', () => {
  it('was not touched by any of this', () => {
    assert.equal(hashOf(REAL_SETTINGS), realBefore);
  });
});
