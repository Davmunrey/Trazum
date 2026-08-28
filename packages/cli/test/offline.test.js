import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * *The deterministic core stays free and offline.*
 *
 * The first of the two rules `ROADMAP.md` opens with, and the one a reader is
 * most likely to be checking when they open `SUPPORT.md`: **no feature may make
 * a network call a prerequisite for optimising a prompt.**
 *
 * `outbound-surfaces.test.js` already derives every module that *can* reach the
 * network and requires each to be named in the prose. That is a disclosure
 * rule and a good one. It is not this rule: a module can be disclosed, listed,
 * documented — and still be on the path of `trazum optimize`.
 *
 * So this proves the rule the only way it can honestly be proved, by removing
 * the network and running the command. `fetch` is replaced with a thrower
 * before the CLI loads, and the deterministic commands have to produce
 * **byte-identical output** to a run with the network intact.
 *
 * **The half that makes it mean anything** is the last test: a command that
 * genuinely needs the network has to fail under the same stub. Without it, a
 * stub that silently failed to install would leave every assertion above
 * passing and nothing proved.
 */

/** Installed with `--import`, so it is in place before any module is loaded. */
const STUB = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-offline-'));
  const path = join(dir, 'no-network.mjs');
  writeFileSync(
    path,
    "globalThis.fetch = () => { throw new Error('TRAZUM_TEST_NETWORK_USED'); };\n",
  );
  return path;
})();

const run = (args, { offline }) =>
  spawnSync(
    process.execPath,
    offline ? ['--import', STUB, CLI, ...args] : [CLI, ...args],
    { cwd: repoRoot, encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 },
  );

/** The prompt this repository ships, so the corpus is not invented here. */
const PROMPT = 'examples/sample-prompt.en.txt';

describe('optimising a prompt needs no network', () => {
  it('produces the same report with the network removed', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'trazum-offline-out-')), 'out.txt');
    const online = run(['optimize', PROMPT, '-o', out], { offline: false });
    const offline = run(['optimize', PROMPT, '-o', out], { offline: true });

    assert.equal(online.status, 0, `the ordinary run failed:\n${online.stdout}${online.stderr}`);
    assert.equal(
      offline.status,
      0,
      `optimising needed the network:\n${offline.stdout}${offline.stderr}`,
    );
    assert.equal(offline.stdout, online.stdout, 'the network changed the report');
    assert.doesNotMatch(`${offline.stdout}${offline.stderr}`, /TRAZUM_TEST_NETWORK_USED/);
  });

  it('gates a directory on tokens with the network removed', () => {
    // `check` is the command CI runs, on a runner that may have no egress at
    // all. A build that fails because the gate wanted the network would be this
    // rule broken where it costs the most.
    const result = run(['check', 'examples', '--max-tokens', '5000'], { offline: true });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /within budget/);
  });

  it('lists its rules with the network removed', () => {
    const result = run(['rules'], { offline: true });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /duplicate-blocks/);
  });

  it('and the stub bites, or none of the above proves anything', () => {
    /**
     * `--pricing-live` fetches a price list on purpose. Under the same stub it
     * has to fail, **and the failure has to carry the stub's own marker** — a
     * command that failed for some other reason would look identical from the
     * exit code alone.
     */
    const result = run(['optimize', PROMPT, '--pricing-live'], { offline: true });
    assert.notEqual(result.status, 0, 'a command that needs the network passed without it');
    assert.match(`${result.stdout}${result.stderr}`, /TRAZUM_TEST_NETWORK_USED/);
  });
});

/**
 * The same rule, over the whole command surface.
 *
 * The three tests above prove it for `optimize`, `check` and `rules` — three
 * commands of forty-five. They are the right three to have picked first and
 * they are seven percent of the product, and *"your prompts never leave your
 * machine"* is the sentence the README opens with and the reason a reader who
 * cannot use a hosted tool is reading at all. A promise that load-bearing is
 * worth proving everywhere it is made.
 *
 * So: every command in `COMMAND_FLAGS`, invoked with arguments that make it do
 * its actual work, run with `fetch` removed.
 *
 * ## Why a table of invocations rather than `--help`
 *
 * `trazum profile --help` proves nothing: it never reaches the code that could
 * fetch. Each command here gets a real log, a real prompt, a real plan, and its
 * output is checked for the stub's marker. Building the workspace is most of
 * this file's length and all of its value.
 *
 * ## Why the table is required to be complete
 *
 * A command with no entry fails the first check, so a forty-sixth cannot be
 * added without either an invocation or a documented reason to be out. That is
 * the difference between a guard that covers the surface and one that covers
 * whatever somebody remembered.
 */
const OUT_OF_SCOPE = {
  /* Declared network surfaces: `outbound-surfaces.test.js` holds the list. */
  connect: 'reaches a provider on purpose — a declared outbound surface',
  gateway: 'stands in front of a provider — a declared outbound surface',
  /* These three never return on their own, so they cannot be run to completion. */
  serve: 'starts a server and does not exit',
  write: 'waits on the reader and does not exit',
  bench: 'runs a measurement rather than reading a path',
};

/** A workspace with something real for every command to read. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-offline-all-'));
  const at = (name) => join(dir, name);
  const write = (name, text) => writeFileSync(at(name), text);
  mkdirSync(at('prompts'));
  mkdirSync(at('reports'));

  const prompt = readFileSync(join(repoRoot, 'examples/sample-prompt.en.txt'), 'utf8');
  write('prompt.txt', prompt);
  writeFileSync(at('prompts/support.txt'), prompt);

  const day = (month, n) => new Date(Date.UTC(2026, month - 1, n, 9, 0, 0)).toISOString();
  const month = (m) => {
    const records = [];
    for (let i = 0; i < 40; i += 1) {
      records.push({
        model: 'claude-opus-5',
        timestamp: day(m, 1 + (i % 8)),
        label: i % 3 === 0 ? 'writer' : 'support-rag',
        session: `s${i % 4}`,
        usage: {
          input_tokens: 9000,
          output_tokens: 300,
          cache_read_input_tokens: i % 3 === 0 ? 4000 : 0,
        },
        outcome: i % 5 === 0 ? 'escalated' : 'resolved',
      });
    }
    for (let i = 0; i < 12; i += 1) {
      records.push({
        model: 'claude-haiku-4-5',
        timestamp: day(m, 2 + (i % 5)),
        label: 'batch-tag',
        session: 's9',
        usage: { input_tokens: 500, output_tokens: 80 },
      });
    }
    return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;
  };
  write('usage.jsonl', month(7));
  write('cases.jsonl', `${[1, 2, 3].map((i) => JSON.stringify({ input: `q${i}`, expect: `a${i}` })).join('\n')}\n`);
  write(
    'trazum.config.json',
    JSON.stringify(
      {
        usage: { model: 'claude-opus-5', callsPerMonth: 50000 },
        budgets: { 'prompts/**': 500 },
        spend: { maxUsd: 1000 },
      },
      null,
      2,
    ),
  );

  /* One export per converter, in each tool's own shape. */
  write(
    'langsmith.json',
    JSON.stringify([
      {
        id: 'r1',
        trace_id: 't1',
        run_type: 'llm',
        start_time: day(7, 1),
        prompt_tokens: 9000,
        completion_tokens: 300,
        extra: { metadata: { ls_model_name: 'claude-opus-5' } },
        tags: ['support'],
      },
    ]),
  );
  write(
    'helicone.json',
    JSON.stringify([
      {
        request_id: 'h1',
        request_created_at: day(7, 1),
        model: 'claude-opus-5',
        prompt_tokens: 9000,
        completion_tokens: 300,
      },
    ]),
  );
  write(
    'litellm.json',
    JSON.stringify([
      {
        request_id: 'l1',
        startTime: day(7, 1),
        model: 'claude-opus-5',
        prompt_tokens: 9000,
        completion_tokens: 300,
        spend: 0.06,
      },
    ]),
  );
  write(
    'spans.json',
    JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name: 'chat',
                  startTimeUnixNano: '1782032400000000000',
                  endTimeUnixNano: '1782032401000000000',
                  attributes: [
                    { key: 'gen_ai.request.model', value: { stringValue: 'claude-opus-5' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: '9000' } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: '300' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  write(
    'transcript.jsonl',
    `${JSON.stringify({
      type: 'assistant',
      timestamp: day(7, 1),
      message: { model: 'claude-opus-5', usage: { input_tokens: 9000, output_tokens: 300 } },
    })}\n`,
  );

  /* Two artefacts other commands read, made by the product rather than by hand. */
  const make = (args, into) => {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 60000,
    });
    assert.equal(result.status, 0, `building ${into} failed:\n${result.stdout}${result.stderr}`);
    write(into, result.stdout);
  };
  make(['plan', 'usage.jsonl', '--json'], 'plan.json');
  make(['profile', 'usage.jsonl', '--json'], 'report.json');
  for (const m of [7, 8, 9, 10]) {
    write(`m${m}.jsonl`, month(m));
    make(['profile', `m${m}.jsonl`, '--json'], `reports/2026-${String(m).padStart(2, '0')}.json`);
  }
  return dir;
}

/** What each command needs to do its work, against that workspace. */
const INVOCATION = {
  init: ['.', '--dry-run'],
  optimize: ['prompt.txt'],
  check: ['prompts', '--max-tokens', '5000'],
  baseline: ['.'],
  eval: ['prompt.txt', '--cases', 'cases.jsonl'],
  route: ['usage.jsonl', '--prompt-file', 'prompt.txt', '--cases', 'cases.jsonl', '--yes'],
  plan: ['usage.jsonl'],
  verify: ['plan.json', '--against', 'usage.jsonl'],
  profile: ['usage.jsonl'],
  history: ['reports'],
  store: [],
  watch: ['--once'],
  diff: ['prompt.txt', 'prompts/support.txt'],
  rank: ['prompts'],
  doctor: ['.'],
  blame: ['prompt.txt'],
  prune: ['prompt.txt', '--cases', 'cases.jsonl', '--yes'],
  where: ['prompt.txt'],
  conform: ['usage.jsonl'],
  schema: ['usage-log'],
  rollup: ['report.json'],
  position: ['usage.jsonl'],
  receipt: ['usage.jsonl'],
  'from-claude-code': ['transcript.jsonl', '-o', 'c1.jsonl'],
  'from-otel': ['spans.json', '-o', 'c2.jsonl'],
  'from-litellm': ['litellm.json', '-o', 'c3.jsonl'],
  'from-helicone': ['helicone.json', '-o', 'c4.jsonl'],
  'from-langsmith': ['langsmith.json', '-o', 'c5.jsonl'],
  switch: ['usage.jsonl', '--to', 'claude-haiku-4-5'],
  ownrate: ['--gpu-usd-hour', '3', '--tokens-per-second', '900'],
  pulse: [],
  models: [],
  rules: [],
  experiment: ['usage.jsonl', '--a', 'support-rag', '--b', 'writer', '--min-outcomes', '2'],
  quality: ['usage.jsonl', '--label', 'support-rag', '--at', '2026-07-04T00:00:00Z'],
  semantic: ['prompt.txt', '--yes'],
  commitment: ['usage.jsonl', '--floor', '100', '--discount', '10'],
  report: ['usage.jsonl', '--year', '2026'],
  owners: ['usage.jsonl'],
  ladder: ['usage.jsonl'],
  feedback: [],
};

/** The dispatch table, so the list cannot be a list somebody maintains. */
function everyCommand() {
  const source = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
  const start = source.indexOf('const COMMAND_FLAGS');
  assert.notEqual(start, -1, 'COMMAND_FLAGS is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf('\n};', start));
  const names = [...new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 40, `only ${names.length} commands parsed out of COMMAND_FLAGS`);
  return names;
}

describe('every command works with the network removed', () => {
  const commands = everyCommand();

  it('has an invocation, or a reason, for every command there is', () => {
    const uncovered = commands.filter((c) => !(c in INVOCATION) && !(c in OUT_OF_SCOPE));
    assert.deepEqual(
      uncovered,
      [],
      'these commands are neither exercised offline nor excused: add an invocation to '
        + 'INVOCATION, or a reason to OUT_OF_SCOPE',
    );
    const stale = Object.keys(INVOCATION).filter((c) => !commands.includes(c));
    assert.deepEqual(stale, [], 'these invocations name a command that no longer exists');
  });

  it('runs all of them, and answers the same as it does with the network', async () => {
    /*
      Two runs each, compared.

      Checking only for the stub's marker would pass a command that failed
      before it reached anything: an early error touches no network either, and
      forty commands quietly erroring would look exactly like forty commands
      working offline. So each is run twice, once with the network and once
      without, and the two have to say the same thing — which is the standard
      the three tests above already hold `optimize` to.

      Each run gets its own copy of the workspace, because several of these
      write files and one run must not read another's leavings. Copied rather
      than rebuilt: building it runs the product six times to make the plan and
      the reports, and doing that eighty times took a hundred seconds for
      nothing — the bytes are the same either way.
    */
    const base = workspace();
    const copy = () => {
      const dir = mkdtempSync(join(tmpdir(), 'trazum-offline-run-'));
      cpSync(base, dir, { recursive: true });
      return dir;
    };
    const runnable = commands.filter((c) => c in INVOCATION);
    assert.ok(runnable.length >= 38, `only ${runnable.length} commands are exercised`);

    const one = (command, offline, dir) =>
      new Promise((resolve) => {
        execFile(
          process.execPath,
          offline
            ? ['--import', STUB, CLI, command, ...INVOCATION[command]]
            : [CLI, command, ...INVOCATION[command]],
          { cwd: dir, encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 },
          (_error, stdout, stderr) => resolve({ stdout, both: `${stdout}${stderr}` }),
        );
      });

    const pair = async (command) => {
      const online = await one(command, false, copy());
      const offline = await one(command, true, copy());
      return { command, online, offline };
    };

    /* Eight at a time: eighty spawns in series is a guard that gets deleted. */
    const results = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let i = next++; i < runnable.length; i = next++) results[i] = await pair(runnable[i]);
      }),
    );

    const reached = results
      .filter(({ offline }) => /TRAZUM_TEST_NETWORK_USED/.test(offline.both))
      .map(({ command, offline }) => `${command}: ${offline.both.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    assert.deepEqual(reached, [], 'these commands reached for the network');

    const silent = results
      .filter(({ offline }) => offline.both.trim().length < 40)
      .map(({ command, offline }) => `${command}: ${JSON.stringify(offline.both.trim())}`);
    assert.deepEqual(silent, [], 'these said almost nothing, so the run proves almost nothing');

    const differed = results
      .filter(({ online, offline }) => offline.stdout !== online.stdout)
      .map(({ command }) => command);
    assert.deepEqual(differed, [], 'the network changed what these commands answered');
  });
});
