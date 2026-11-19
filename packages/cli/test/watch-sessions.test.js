import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const GEMINI_EXAMPLE = new URL('../../../examples/gemini-tmp', import.meta.url).pathname;
const NOTIFY_SOURCE = new URL('../src/watch-notify.ts', import.meta.url).pathname;
const GIT_SOURCE = new URL('../src/git.ts', import.meta.url).pathname;
const { notificationFor, notifierCall, sendNotification, NOTIFICATION_TITLE } = await import('../dist/watch-notify.js');

/**
 * `trazum watch --sessions` and `--notify` (#756).
 *
 * `watch` judged the store, which is empty until `connect --store` fills it,
 * while `bill` reads the sessions Claude Code keeps on disk with no setup. So
 * the command that needs no setup could not alert, and the one that alerts
 * needed the most. Here it reads the same sessions, judges the same budgets,
 * and can tell the person at the machine through what the platform already has.
 *
 * Everything below is made up: a home folder with one Claude Code project in it,
 * and a stand-in for the notifier that records what it was asked to show. No
 * test reaches the real home, a real session, or a real desktop.
 *
 * $1.00 = 200k input tokens on Claude Opus 5, so a session of 2,000,000 is $10.
 */

const SECRET = 'SYNTHETIC-PROMPT-TEXT-never-leaves-the-session';
const PROJECT = '-home-me-synthetic-secret-project';

const DAY_MS = 86_400_000;
const today = () => Math.floor(Date.now() / DAY_MS) * DAY_MS;
/**
 * A day still being measured, the way the rule judges one: nine tenths of it
 * has to have passed. Near the end of the UTC day, or in its first minute, the
 * clock makes this fixture mean something else, so the test that needs an open
 * day says so and stands down instead of passing or failing by the hour.
 */
const openDayIsOpen = () => {
  const into = Date.now() - today();
  return into > 60_000 && into < DAY_MS * 0.85;
};

const line = (iso, id, inputTokens) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: iso,
    sessionId: 'synthetic-session',
    requestId: id,
    message: {
      model: 'claude-opus-5',
      content: [{ type: 'text', text: SECRET }],
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  });

/** A project folder under a made-up home, with one session in it. */
const session = async (home, name, rows) => {
  const dir = join(home, '.claude', 'projects', PROJECT);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.jsonl`), `${rows.join('\n')}\n`);
};

const AUGUST = [
  line('2026-08-01T12:00:00Z', 'req-1', 2_000_000),
  line('2026-08-02T12:00:00Z', 'req-2', 2_000_000),
  line('2026-08-03T12:00:00Z', 'req-3', 6_000_000),
];

/** The stand-in: whichever notifier this platform would start, recording what it was asked. */
const standIn = async (dir) => {
  const bin = join(dir, 'bin');
  const log = join(dir, 'notifications.jsonl');
  await mkdir(bin, { recursive: true });
  const script = [
    '#!/usr/bin/env node',
    "const { appendFileSync } = require('node:fs');",
    `appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
  ].join('\n');
  for (const name of ['notify-send', 'osascript']) {
    await writeFile(join(bin, name), script);
    await chmod(join(bin, name), 0o755);
  }
  return { bin, log };
};

const notifierName = process.platform === 'darwin' ? 'osascript' : 'notify-send';

const workspace = async (spend = { maxUsd: 25, maxDayUsd: 15 }, rows = AUGUST) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-watch-sessions-'));
  const home = join(dir, 'home');
  const project = join(dir, 'project');
  await mkdir(project, { recursive: true });
  await session(home, 'one', rows);
  await writeFile(join(project, 'trazum.config.json'), JSON.stringify({ spend }));
  return { dir, home, project, ...(await standIn(dir)) };
};

const run = (w, args, { path = `${w.bin}:${process.env.PATH}` } = {}) =>
  spawnSync(process.execPath, [CLI, 'watch', ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, HOME: w.home, USERPROFILE: w.home, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '', PATH: path },
    timeout: 30000,
    cwd: w.project,
  });

/** What `trazum bill` says the same made-up home costs: the sum of the receipt's lines. */
const billTotal = (w) => {
  const bill = spawnSync(process.execPath, [CLI, 'bill', '--receipt'], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, HOME: w.home, USERPROFILE: w.home, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '' },
    timeout: 30000,
    cwd: w.project,
  });
  assert.equal(bill.status, 0, bill.stderr);
  return JSON.parse(bill.stdout).lines.reduce((sum, row) => sum + row.usd, 0);
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
const notifications = async (w) =>
  existsSync(w.log) ? (await readFile(w.log, 'utf8')).trim().split('\n').filter(Boolean).map((row) => JSON.parse(row)) : [];

const SENTENCES = [
  'CROSSED, Total spend is $50.00 against a limit of $25.00. Measured, not projected.',
  'CROSSED, Spend on 2026-08-03 is $30.00 against a limit of $15.00. Measured, not projected.',
];

describe('watch --sessions', () => {
  it('judges the sessions on disk against the budgets, with no store', async () => {
    const w = await workspace();
    const result = run(w, ['--sessions', '--once']);
    assert.equal(result.status, 1, `a crossing must fail the run: ${result.stderr}`);
    const out = flat(result);
    assert.match(out, /CROSSED, Total spend is \$50\.00 against a limit of \$25\.00\. Measured, not projected\./);
    assert.match(out, /CROSSED, Spend on 2026-08-03 is \$30\.00 against a limit of \$15\.00/);
    assert.doesNotMatch(out, /2026-08-01 is/, 'a day under its limit is not a crossing');
    assert.match(out, /Watching Claude Code's sessions in /, 'the folder read is named, nothing is read silently');
    assert.equal(existsSync(join(w.project, '.trazum', 'store')), false, 'no store was needed or made');
  });

  it('prices what `bill` prices for the same folders', async () => {
    const w = await workspace();
    const billed = billTotal(w);
    const watched = JSON.parse(run(w, ['--sessions', '--once', '--json']).stdout);
    const measured = watched.crossings.find((crossing) => crossing.gate === 'maxUsd').measuredUsd;
    assert.equal(measured, 50);
    assert.ok(Math.abs(billed - measured) < 1e-9, `bill says ${billed}, watch says ${measured}`);
  });

  it('reads all three agents, and prices what `bill` prices for the same folders', async () => {
    const w = await workspace({ maxUsd: 0.01 });
    const codexCount = { input_tokens: 100_000, cached_input_tokens: 40_000, output_tokens: 2_000, reasoning_output_tokens: 500, total_tokens: 102_000 };
    const rollout = [
      { type: 'session_meta', payload: { id: 'synthetic-codex', cwd: 'SYNTHETIC_PRIVATE_PATH' } },
      { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: SECRET } },
      { timestamp: '2026-08-04T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexCount, last_token_usage: codexCount } } },
    ].map((row) => JSON.stringify(row)).join('\n');
    const codexDay = join(w.home, '.codex', 'sessions', '2026', '08', '04');
    await mkdir(codexDay, { recursive: true });
    await writeFile(join(codexDay, 'rollout-2026-08-04T10-00-00-synthetic.jsonl'), rollout);
    await cp(GEMINI_EXAMPLE, join(w.home, '.gemini', 'tmp'), { recursive: true });

    const billed = billTotal(w);
    const watched = JSON.parse(run(w, ['--sessions', '--once', '--json']).stdout);
    const measured = watched.crossings.find((crossing) => crossing.gate === 'maxUsd').measuredUsd;
    assert.ok(billed > 50, `the fixture should hold more than the Claude Code sessions: ${billed}`);
    assert.ok(Math.abs(billed - measured) < 1e-9, `bill says ${billed}, watch says ${measured}`);
    const out = flat(run(w, ['--sessions', '--once']));
    for (const agent of ['Claude Code', 'Codex', 'Gemini CLI']) assert.ok(out.includes(`Watching ${agent}'s sessions in `), `${agent} was not read, or not named`);
  });

  it('refuses sessions that hold no usage, rather than calling nothing within budget', async () => {
    const w = await workspace();
    await rm(join(w.home, '.claude'), { recursive: true });
    const dir = join(w.home, '.claude', 'projects', PROJECT);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'notes.jsonl'), '{"hello":"world"}\n');
    const result = run(w, ['--sessions', '--once']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /hold no usage a price can be put on yet/);
    assert.doesNotMatch(flat(result), /Within every threshold/);
  });

  it('keeps a crossing from being reported twice, and does not call a blown budget clean', async () => {
    const w = await workspace();
    run(w, ['--sessions', '--once', '--notify']);
    const second = run(w, ['--sessions', '--once', '--notify']);
    assert.equal(second.status, 1, 'quiet is not clean: the budget is still over');
    const out = flat(second);
    assert.match(out, /STILL OVER, Total spend is \$50\.00/);
    assert.doesNotMatch(out, /CROSSED/);
    assert.doesNotMatch(out, /Within every threshold/);
    assert.equal((await notifications(w)).length, 1, 'the second cycle notified about what the first already said');
    const json = JSON.parse(run(w, ['--sessions', '--once', '--json']).stdout);
    assert.deepEqual(json.crossings, []);
    assert.equal(json.suppressed.length, 2);
  });

  it('still reports a day that crosses after the restart', async () => {
    const w = await workspace();
    run(w, ['--sessions', '--once']);
    await session(w.home, 'two', [line('2026-08-04T12:00:00Z', 'req-4', 8_000_000)]);
    const result = run(w, ['--sessions', '--once']);
    const out = flat(result);
    assert.match(out, /CROSSED, Spend on 2026-08-04 is \$40\.00 against a limit of \$15\.00/);
    assert.match(out, /STILL OVER, Spend on 2026-08-03/);
  });

  it('names the stretch nobody was watching when the sessions no longer reach back to it', async () => {
    const w = await workspace();
    run(w, ['--sessions', '--once']);
    const state = JSON.parse(await readFile(join(w.project, '.trazum', 'watch.json'), 'utf8'));
    assert.equal(state.source, 'sessions');
    assert.ok(state.lastCoveredToMs > 0);
    await rm(join(w.home, '.claude'), { recursive: true });
    await session(w.home, 'later', [line('2026-08-10T12:00:00Z', 'req-9', 1_000_000)]);
    const out = flat(run(w, ['--sessions', '--once']));
    assert.match(out, /Nothing was watching between 2026-08-03 and 2026-08-10/);
  });

  it('keeps its record apart from the store watch, in both directions', async () => {
    const w = await workspace();
    await writeFile(
      join(w.project, 'usage.json'),
      JSON.stringify({
        data: [1, 2, 3].map((d) => ({
          starting_at: `2026-08-0${d}T00:00:00Z`,
          ending_at: `2026-08-0${d + 1}T00:00:00Z`,
          results: [{ model: 'claude-opus-5', uncached_input_tokens: 2_000_000 * (d === 3 ? 3 : 1), output_tokens: 0 }],
        })),
      }),
    );
    // The store-backed state is what it always was: no new field.
    run(w, ['--once', '--payload', 'usage.json']);
    const store = JSON.parse(await readFile(join(w.project, '.trazum', 'watch.json'), 'utf8'));
    assert.equal('source' in store, false, 'the store watch wrote a field it never wrote before');
    // What the store watch reported says nothing about the sessions.
    const first = flat(run(w, ['--sessions', '--once']));
    assert.match(first, /CROSSED, Total spend is \$50\.00/);
    // And back: the sessions' record does not quiet the store's crossing.
    const back = flat(run(w, ['--once', '--payload', 'usage.json']));
    assert.match(back, /CROSSED, Total spend is \$50\.00/);
  });

  it('does not report a day still being measured as passed', async (t) => {
    if (!openDayIsOpen()) return t.skip('too near either end of the UTC day for an open day to be open');
    const iso = new Date(today() + 1000).toISOString();
    const w = await workspace({ maxDayUsd: 15 }, [line(iso, 'req-open', 2_000_000)]);
    const result = run(w, ['--sessions', '--once']);
    const out = flat(result);
    assert.match(out, /maxDayUsd cannot be judged yet/);
    assert.match(out, /Not a pass/);
    assert.doesNotMatch(out, /Within every threshold/);
    const doc = JSON.parse(run(w, ['--sessions', '--once', '--json']).stdout);
    assert.equal(doc.abstentions.length, 1);
    assert.equal(doc.abstentions[0].reason, 'window-too-short');
    assert.deepEqual(doc.crossings, []);
  });

  it('fires on an open day that is already over, whatever the hour', async (t) => {
    if (!openDayIsOpen()) return t.skip('too near either end of the UTC day for an open day to be open');
    const iso = new Date(today() + 1000).toISOString();
    const w = await workspace({ maxDayUsd: 15 }, [line(iso, 'req-open', 4_000_000)]);
    const result = run(w, ['--sessions', '--once']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /CROSSED, Spend on \d{4}-\d\d-\d\d is \$20\.00 against a limit of \$15\.00/);
  });

  it('says it is within the thresholds only when it is', async () => {
    const w = await workspace({ maxUsd: 1000, maxDayUsd: 1000 });
    const result = run(w, ['--sessions', '--once']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /Within every threshold: 2 gates evaluated against measured spend/);
  });

  it('never forecasts', async () => {
    const w = await workspace();
    const out = flat(run(w, ['--sessions', '--once', '--notify']));
    assert.doesNotMatch(out, /you will|will exceed|on track to|projected to|forecast/i);
    for (const [body] of (await notifications(w)).map((call) => call.slice(-1))) {
      assert.doesNotMatch(body, /you will|will exceed|on track to|projected to|forecast/i);
    }
  });

  it('refuses two sources, and a machine with no sessions, rather than watching nothing', async () => {
    const w = await workspace();
    const both = run(w, ['--sessions', '--once', '--payload', 'usage.json']);
    assert.equal(both.status, 1);
    assert.match(flat(both), /A cycle has one source/);

    const empty = await workspace();
    await rm(join(empty.home, '.claude'), { recursive: true });
    await mkdir(join(empty.home, 'elsewhere'), { recursive: true });
    const none = run(empty, ['--sessions', '--once']);
    assert.equal(none.status, 1);
    assert.match(flat(none), /found no Claude Code, Codex or Gemini CLI sessions at/);
  });

  it('is the store watch, unchanged, without the flag', async () => {
    const w = await workspace();
    const result = run(w, ['--once']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /the store at .* is empty/);
  });
});

describe('watch --notify', () => {
  it('is off unless asked for', async () => {
    const w = await workspace();
    run(w, ['--sessions', '--once']);
    assert.deepEqual(await notifications(w), []);
  });

  it('shows the sentence the terminal prints, and nothing else', async () => {
    const w = await workspace();
    const result = run(w, ['--sessions', '--once', '--notify']);
    assert.equal(result.status, 1);
    const calls = await notifications(w);
    assert.equal(calls.length, 1, 'one notification for the cycle');
    const [call] = calls;
    if (process.platform === 'darwin') {
      assert.deepEqual(call.slice(-2), [SENTENCES.join('\n'), NOTIFICATION_TITLE]);
    } else {
      assert.deepEqual(call, ['--app-name=Trazum', '--', NOTIFICATION_TITLE, SENTENCES.join('\n')]);
    }
    // Each sentence is a line the terminal printed, word for word.
    const printed = flat(result);
    for (const sentence of SENTENCES) assert.ok(printed.includes(sentence), `the terminal did not print: ${sentence}`);
  });

  it('carries no prompt text, no file path and no project name', async () => {
    const w = await workspace();
    run(w, ['--sessions', '--once', '--notify']);
    const everything = JSON.stringify(await notifications(w));
    for (const leaked of [SECRET, PROJECT, 'synthetic-secret-project', 'synthetic-session', 'req-', w.dir, w.home, w.project, '.jsonl', '.claude', '/']) {
      assert.ok(!everything.includes(leaked), `the notification carries ${leaked}`);
    }
  });

  it('says so when the machine has no notifier, and the other transports carry on', async () => {
    const w = await workspace();
    const nowhere = join(w.dir, 'empty-path');
    await mkdir(nowhere, { recursive: true });
    const result = run(w, ['--sessions', '--once', '--notify'], { path: nowhere });
    assert.equal(result.status, 1, 'the exit code still carries the crossing');
    const out = flat(result);
    assert.match(out, new RegExp(`this machine has no ${notifierName}, so none was sent`));
    assert.match(out, /CROSSED, Total spend is \$50\.00/);
  });

  it('says so when the notifier refuses, and does not lose the alert to it', async () => {
    const w = await workspace();
    for (const name of ['notify-send', 'osascript']) {
      await writeFile(join(w.bin, name), '#!/bin/sh\necho "no display" >&2\nexit 1\n');
    }
    const result = run(w, ['--sessions', '--once', '--notify']);
    assert.equal(result.status, 1);
    assert.match(flat(result), new RegExp(`${notifierName} would not show the notification \\(no display\\)`));
    assert.match(flat(result), /CROSSED, Total spend is \$50\.00/);
  });

  it('works for the store watch too', async () => {
    const w = await workspace();
    await writeFile(
      join(w.project, 'usage.json'),
      JSON.stringify({
        data: [{ starting_at: '2026-08-01T00:00:00Z', ending_at: '2026-08-02T00:00:00Z', results: [{ model: 'claude-opus-5', uncached_input_tokens: 10_000_000, output_tokens: 0 }] }],
      }),
    );
    const result = run(w, ['--once', '--payload', 'usage.json', '--notify']);
    assert.equal(result.status, 1);
    const [call] = await notifications(w);
    assert.ok(call.at(-1).includes('CROSSED, Total spend is $50.00 against a limit of $25.00'));
    const second = run(w, ['--once', '--payload', 'usage.json', '--notify']);
    assert.equal(second.status, 1);
    assert.equal((await notifications(w)).length, 1, 'reported twice');
  });
});

describe('the notifier call', () => {
  const HOSTILE = [
    `O'Brien "quoted" \`tick\` $(touch /tmp/pwned) \${HOME}`,
    "'; display dialog \"pwned\"; '",
    '"; Remove-Item -Recurse C:\\; "',
    'line one\nline two\r\n-- --app-name=evil',
    '-- starts with a dash',
    '<b>markup</b> & more',
  ];

  it('hands macOS the text as arguments of a fixed script, never as part of the script', () => {
    const scripts = new Set();
    for (const text of HOSTILE) {
      const call = notifierCall('darwin', notificationFor([text]));
      assert.equal(call.command, 'osascript');
      const flags = call.args.slice(0, -2);
      assert.deepEqual(call.args.slice(-2), [text, NOTIFICATION_TITLE], 'the text is the first argument, whole');
      assert.ok(flags.every((arg, at) => (at % 2 === 0 ? arg === '-e' : true)), 'only -e statements precede the arguments');
      scripts.add(JSON.stringify(flags));
      for (const arg of flags) assert.ok(!arg.includes(text), 'the text is inside the script');
    }
    assert.equal(scripts.size, 1, 'the script changed with the text');
  });

  it('hands Windows the text in the environment, and runs a script that does not change', () => {
    const scripts = new Set();
    for (const text of HOSTILE) {
      const call = notifierCall('win32', notificationFor([text]));
      assert.equal(call.command, 'powershell.exe');
      assert.deepEqual(call.env, { TRAZUM_NOTIFY_TITLE: NOTIFICATION_TITLE, TRAZUM_NOTIFY_BODY: text });
      assert.equal(call.args.includes('-EncodedCommand'), true);
      assert.ok(!call.args.some((arg) => arg.includes(text)), 'the text is on the command line');
      scripts.add(call.args.at(-1));
    }
    assert.equal(scripts.size, 1, 'the script changed with the text');
    const script = Buffer.from([...scripts][0], 'base64').toString('utf16le');
    assert.match(script, /InnerText = \$env:TRAZUM_NOTIFY_BODY/, 'the toast is built with InnerText, which escapes');
    for (const text of HOSTILE) assert.ok(!script.includes(text));
  });

  it('puts the text after `--` on Linux, so a dash cannot make it an option', () => {
    for (const text of HOSTILE) {
      const call = notifierCall('linux', notificationFor([text]));
      assert.equal(call.command, 'notify-send');
      assert.deepEqual(call.args, ['--app-name=Trazum', '--', NOTIFICATION_TITLE, text]);
    }
  });

  it('builds the notification from sentences and nothing else', () => {
    assert.deepEqual(notificationFor(['a', 'b']), { title: 'Trazum', body: 'a\nb' });
    assert.equal(notificationFor.length, 1, 'it takes the sentences and no second argument to put a path in');
  });

  it('starts the program without a shell, through the one module that runs programs', async () => {
    const seen = [];
    const run = (command, args, env) => {
      seen.push({ command, args, env });
      return { status: 0, stderr: '', errorCode: null };
    };
    const outcome = sendNotification(notificationFor(['x']), { platform: 'linux', run, env: { PATH: '/x' } });
    assert.deepEqual(outcome, { outcome: 'sent', command: 'notify-send' });
    assert.equal(seen[0].command, 'notify-send');
    assert.ok(Array.isArray(seen[0].args));

    const notify = await readFile(NOTIFY_SOURCE, 'utf8');
    assert.doesNotMatch(notify, /child_process/, 'the spawn belongs in git.ts, which the security suite holds to the rules');
    const spawner = await readFile(GIT_SOURCE, 'utf8');
    const block = spawner.slice(spawner.indexOf('export function runNotifier('));
    const body = block.slice(0, block.indexOf('\n}\n'));
    assert.match(body, /shell:\s*false/);
    assert.doesNotMatch(body, /shell:\s*true/);
    assert.match(body, /timeout:\s*TIMEOUT_MS/, 'a notifier that hangs must not hang the watcher');
    assert.match(body, /spawnSync\(command, \[\.\.\.args\]/, 'an argument array, not a command line');
  });

  it('tells a missing program from one that refused', () => {
    const missing = () => ({ status: null, stderr: '', errorCode: 'ENOENT' });
    assert.deepEqual(sendNotification(notificationFor(['x']), { platform: 'linux', run: missing }), {
      outcome: 'unavailable',
      command: 'notify-send',
    });
    const refused = () => ({ status: 1, stderr: 'no session bus\nmore', errorCode: null });
    assert.deepEqual(sendNotification(notificationFor(['x']), { platform: 'darwin', run: refused }), {
      outcome: 'failed',
      command: 'osascript',
      error: 'no session bus',
    });
    const silent = () => ({ status: 3, stderr: '', errorCode: null });
    assert.deepEqual(sendNotification(notificationFor(['x']), { platform: 'win32', run: silent }), {
      outcome: 'failed',
      command: 'powershell.exe',
      error: 'exited with 3',
    });
  });

  it('puts the Windows text in the environment of the child it starts', () => {
    let env;
    const run = (_command, _args, given) => {
      env = given;
      return { status: 0, stderr: '', errorCode: null };
    };
    sendNotification(notificationFor(['O"Brien']), { platform: 'win32', run, env: { PATH: '/x' } });
    assert.equal(env.TRAZUM_NOTIFY_BODY, 'O"Brien');
    assert.equal(env.PATH, '/x');
  });
});
