import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `route` and `prune`, driven end to end.
 *
 * Both were listed in `interchange.test.js` as commands that need more than a
 * log, and both stayed undriven because reaching them costs provider calls and
 * a credential. So the one thing nobody checked was the thing that was wrong:
 * `route --json` wrote its human preamble to stdout **and then** the document,
 * so `route --json > verdict.json` produced a file no parser would read. Every
 * guard on the document was a guard on the builder, and the builder was fine.
 *
 * An OpenAI-compatible endpoint is a few lines of `node:http`, and both
 * commands speak it through the same `providerFromEnv` path a real provider
 * uses. Nothing here is mocked inside the process: the CLI is spawned, it
 * makes real HTTP calls, and what it prints is what a shell would capture.
 */

let server;
let port;
let seen = 0;

/**
 * Answers deterministically, and the candidate model disagrees on one case.
 *
 * A stub that always agreed would produce `indistinguishable` every time and
 * could not tell a working comparison from one that never ran.
 */
const start = () =>
  new Promise((resolve) => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        seen += 1;
        let content = 'other';
        let model = '';
        try {
          const parsed = JSON.parse(body);
          model = String(parsed.model ?? '');
          const last = [...(parsed.messages ?? [])].reverse().find((one) => one.role === 'user');
          const text = String(last?.content ?? '');
          if (text.includes('charged')) content = 'billing';
          else if (text.includes('crashes')) content = 'technical';
          else if (text.includes('email')) content = 'account';
          if (model !== 'stub-strong' && content === 'account') content = 'other';
        } catch {
          // A body this stub cannot read still gets an answer, so a parsing
          // slip here shows up as a wrong verdict rather than a hung command.
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `stub-${seen}`,
            choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 64, completion_tokens: 1, total_tokens: 65 },
          }),
        );
      });
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

before(start);
after(
  () =>
    new Promise((resolve) => {
      // `close` waits for keep-alive sockets, and the CLI's client leaves them
      // open, so without this the suite finishes and the process does not.
      server.closeAllConnections?.();
      server.close(resolve);
    }),
);

const PROMPT = [
  'You are a customer support triage assistant.',
  '',
  'IMPORTANT: You MUST always answer in English.',
  '',
  'Please, in order to help the user, I basically need you to analyse the query',
  'and classify it into exactly one of these categories: billing, technical,',
  'account, other.',
  '',
  'Here are some examples:',
  '',
  'Input: My card was charged twice.',
  'Output: billing',
  '',
  'Input: The app crashes on startup.',
  'Output: technical',
  '',
  'Input: I want a new email on my profile.',
  'Output: account',
  '',
  'Answer with the category word only, nothing else.',
  '',
].join('\n');

const CASES = ['My card was charged twice this month.', 'The app crashes when I open settings.', 'I want to change the email on my profile.', ''].join('\n');

/** Calls small enough that the cheaper model's context fits them. */
const LOG = [
  '{"model":"claude-opus-5","label":"triage","session":"s1","ts":"2026-08-01T10:00:00Z","usage":{"input_tokens":800000,"output_tokens":20000}}',
  '{"model":"claude-opus-5","label":"triage","session":"s2","ts":"2026-08-03T10:00:00Z","usage":{"input_tokens":700000,"output_tokens":18000}}',
  '{"model":"claude-opus-5","label":"triage","session":"s3","ts":"2026-08-05T10:00:00Z","usage":{"input_tokens":600000,"output_tokens":15000}}',
  '',
].join('\n');

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-measure-'));
  await writeFile(join(dir, 'prompt.txt'), PROMPT);
  await writeFile(join(dir, 'cases.txt'), CASES);
  await writeFile(join(dir, 'usage.jsonl'), LOG);
  return dir;
};

/**
 * Asynchronous on purpose, and this is the whole reason the first draft hung.
 *
 * The endpoint runs in this process, and `spawnSync` blocks the event loop —
 * so the CLI's request arrived at a server that could not answer until the
 * CLI exited, which it never would. Every call here goes through `spawn` and
 * an awaited close, so the server stays live while the child talks to it.
 */
const run = (dir, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: dir,
      env: {
        ...SPAWN_ENV,
        TRAZUM_LLM_PROVIDER: 'openai',
        TRAZUM_LLM_BASE_URL: `http://127.0.0.1:${port}`,
        TRAZUM_LLM_MODEL: 'stub-strong',
        TRAZUM_LLM_NAME: 'stub',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`trazum ${args.join(' ')} did not finish in 60s`));
    }, 60000);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });

describe('route and prune, run against a real endpoint', () => {
  it('route --json puts one JSON document on stdout and nothing else', async () => {
    const dir = await workspace();
    const result = await run(dir, ['route', 'usage.jsonl', '--prompt-file', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const document = JSON.parse(result.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.deepEqual(Object.keys(document).sort(), ['evaluation', 'schemaVersion', 'slice']);
    // The human lines are not gone, only moved: a reader in a terminal still
    // has to see which slice was picked and what it costs before it costs it.
    assert.match(result.stderr, /triage/);
  });

  it('measures a real disagreement rather than agreeing with everything', async () => {
    const dir = await workspace();
    const result = await run(dir, ['route', 'usage.jsonl', '--prompt-file', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json']);
    const { evaluation } = JSON.parse(result.stdout);
    assert.equal(evaluation.selfAgreement, 1, 'the yardstick should be perfect against a deterministic endpoint');
    assert.ok(evaluation.crossAgreement < 1, 'the candidate disagreed on one case and the report says it agreed on all');
    assert.equal(evaluation.verdict, 'diverges');
    assert.equal(evaluation.cases.length, 3);
    assert.ok(evaluation.callsMade > 0);
  });

  it('carries no prompt text, no case text and no answer out of a real run', async () => {
    const dir = await workspace();
    const result = await run(dir, ['route', 'usage.jsonl', '--prompt-file', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json']);
    for (const leak of ['triage assistant', 'charged twice', 'billing', 'technical']) {
      assert.ok(
        !result.stdout.includes(leak),
        `route --json carried "${leak}" out of the prompt, the cases or the answers`,
      );
    }
  });

  it('prune --json puts one JSON document on stdout and nothing else', async () => {
    const dir = await workspace();
    const result = await run(dir, ['prune', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const document = JSON.parse(result.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.ok(Array.isArray(document.contributions), 'no per-example contributions');
    assert.match(result.stderr, /\d/, 'the estimate a reader must see before spending is gone entirely');
  });

  it('prune --json carries no example text, which is prompt text by any reading', async () => {
    const dir = await workspace();
    const result = await run(dir, ['prune', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json']);
    for (const leak of ['charged twice', 'crashes on startup', 'Output:']) {
      assert.ok(!result.stdout.includes(leak), `prune --json carried "${leak}" out of the examples`);
    }
  });

  it('both documents pass conform without being told which contract they are', async () => {
    /**
     * The other half of the defect this file was written for. Both contracts
     * had rules, a schema, a table and a parity test, and neither had a
     * branch in the shape inference — so `trazum conform verdict.json` read a
     * routing measurement as a usage log and answered with advice about
     * `stop_reason`. A contract nothing can recognise is reachable only by
     * somebody who already knows its name.
     */
    const dir = await workspace();
    for (const [args, name] of [
      [['route', 'usage.jsonl', '--prompt-file', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json'], 'routing-measurement'],
      [['prune', 'prompt.txt', '--cases', 'cases.txt', '--yes', '--json'], 'example-pruning'],
    ]) {
      const produced = await run(dir, args);
      assert.equal(produced.status, 0, produced.stderr);
      const checked = spawnSync(process.execPath, [CLI, 'conform', '-'], {
        cwd: dir,
        encoding: 'utf8',
        env: SPAWN_ENV,
        input: produced.stdout,
        timeout: 60000,
      });
      assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`);
      assert.match(checked.stdout, new RegExp(`reads as an? ${name} document`));
    }
  });
});
