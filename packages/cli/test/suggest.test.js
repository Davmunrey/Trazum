import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `optimize --suggest` end to end.
 *
 * `suggest.ts` is tested for what it accepts and refuses. These are about the
 * seam: that the model is asked about the *optimised* prompt rather than the
 * one as written, that listing changes nothing, that applying changes the
 * headline figures too, and that a flag which would do nothing says so.
 *
 * A real HTTP server rather than a stub provider, because the flag's whole job
 * is to reach one — and `providerFromEnv` is the piece in between that a unit
 * test would skip.
 */

/** An OpenAI-compatible endpoint returning a fixed suggestion list. */
let server;
let port;
let reply = [];
let lastPrompt = null;
let requests = 0;

before(async () => {
  server = createServer((req, res) => {
    requests += 1;
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        lastPrompt = parsed.messages?.find((m) => m.role === 'user')?.content ?? null;
      } catch {
        lastPrompt = null;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(reply) } }],
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(() => server?.close());

const PROMPT = `You should always make sure to answer in English.

Please kindly note that the catalogue is at https://api.example.com/v1/items.

\`\`\`python
def classify(text):
    return model.predict(text)
\`\`\`

Analyse {{query}}.
`;

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'trazum-suggest-'));
  await writeFile(join(root, 'p.txt'), PROMPT);
  return root;
}

/**
 * Runs the CLI, **asynchronously**, and that is not a style choice.
 *
 * The first version used `spawnSync`, which blocks this process's event loop —
 * so the fake server living in this process could never answer the child, and
 * the suite deadlocked until the timeout killed it. A fake server in the test
 * process only works if the test process is free to run.
 */
function run(args, cwd, env = {}) {
  return runRaw(['optimize', 'p.txt', ...args], cwd, env);
}

/** The same, without a command chosen for you. */
function runRaw(args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...SPAWN_ENV,
        TRAZUM_LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
        TRAZUM_LLM_MODEL: 'fake-1',
        TRAZUM_LLM_API_KEY: 'x',
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ out: `${stdout}${stderr}`, stdout, code }));
  });
}

describe('--suggest lists, and changes nothing', () => {
  it('offers the rewrites that survive, with what each saves', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    const { out, code } = await run(['--suggest', '-o', 'out.txt'], root);

    assert.equal(code, 0, out);
    assert.match(out, /Suggested rewrites/);
    assert.match(out, /You should always make sure to → Always/);
    assert.match(out, /~\d+/);
  });

  it('leaves the output file exactly as the rules produced it', async () => {
    // The whole safety argument. Listing is reading; nothing may change.
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();

    await run(['-o', 'plain.txt'], root);
    await run(['--suggest', '-o', 'suggested.txt'], root);

    const [plain, suggested] = await Promise.all([
      readFile(join(root, 'plain.txt'), 'utf8'),
      readFile(join(root, 'suggested.txt'), 'utf8'),
    ]);
    assert.equal(suggested, plain, '--suggest changed the prompt without being asked to');
    // And it is the un-rewritten text, not merely equal to another rewritten one.
    assert.match(suggested, /You should always make sure to/);
  });

  it('says how to take them, rather than leaving the reader to guess', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    assert.match((await run(['--suggest', '-o', '/dev/null'], root)).out, /--apply-suggestions/);
  });

  it('says so when the model found nothing, instead of printing an empty heading', async () => {
    reply = [];
    const root = await project();
    const { out } = await run(['--suggest', '-o', '/dev/null'], root);

    assert.match(out, /Suggested rewrites/);
    assert.match(out, /found nothing worth rewriting/);
  });

  it('asks about the optimised prompt, not the one as written', async () => {
    // Otherwise the call is spent rediscovering what the rules already took,
    // and every filler phrase comes back as a suggestion that no longer applies.
    reply = [];
    const root = await project();
    await run(['--suggest', '-o', '/dev/null'], root);

    assert.ok(lastPrompt !== null, 'the provider was never called');
    assert.equal(
      lastPrompt.includes('Please kindly note that'),
      false,
      'the model was handed the unoptimised prompt',
    );
  });

  it('reports proposals that did not survive, with the commonest reason', async () => {
    reply = [
      { before: 'You should always make sure to', after: 'Always' },
      { before: 'a phrase that is not in this prompt', after: 'x' },
      { before: 'another phrase that is not here either', after: 'y' },
    ];
    const root = await project();
    const { out } = await run(['--suggest', '-o', '/dev/null'], root);

    assert.match(out, /2 proposals did not survive/);
    assert.match(out, /paraphrased what it was copying/);
  });
});

describe('--apply-suggestions takes them', () => {
  it('rewrites the prompt and moves the headline figures with it', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();

    const listed = JSON.parse((await run(['--suggest', '--json'], root)).stdout);
    const applied = JSON.parse((await run(['--suggest', '--apply-suggestions', '--json'], root)).stdout);

    assert.ok(
      applied.tokensAfter < listed.tokensAfter,
      'applying a rewrite did not reduce the token count',
    );
    // And the derived figures follow, rather than being left at the old value.
    assert.equal(applied.tokensSaved, applied.tokensBefore - applied.tokensAfter);
    assert.ok(applied.reductionPct > listed.reductionPct);
    assert.match(applied.optimized, /^Always answer in English\./);
  });

  it('refuses on its own, because it would silently do nothing', async () => {
    // The CLI already refuses a misspelled flag rather than ignoring it. A
    // real flag that is inert in isolation is the same failure wearing a
    // correct spelling.
    reply = [];
    const root = await project();
    const { out, code } = await run(['--apply-suggestions', '-o', '/dev/null'], root);

    assert.notEqual(code, 0);
    assert.match(out, /nothing to apply without --suggest/);
  });
});

describe('--json', () => {
  it('carries the suggestions and whether they were applied', async () => {
    reply = [
      { before: 'You should always make sure to', after: 'Always' },
      { before: 'return model.predict(text)', after: 'return m(text)' },
    ];
    const root = await project();
    const report = JSON.parse((await run(['--suggest', '--json'], root)).stdout);

    assert.equal(report.suggestions.applied, false);
    assert.equal(report.suggestions.suggestions.length, 1);
    assert.equal(report.suggestions.suggestions[0].after, 'Always');
    // The refusal is data too: a consumer debugging its own prompt wants to
    // know the model tried to edit a code block.
    assert.equal(report.suggestions.rejected[0].reason, 'touches-protected');
  });

  it('omits the key entirely when --suggest was not passed', async () => {
    // Absent, not empty: a consumer checking `if (report.suggestions)` should
    // not have to tell "not asked for" from "asked for and nothing found".
    const root = await project();
    const report = JSON.parse((await run(['--json'], root)).stdout);
    assert.equal('suggestions' in report, false);
  });
});

describe('--cache-suggestions', () => {
  /**
   * The seam, counted at the socket.
   *
   * `suggest-cache.test.js` covers the cache itself. What it cannot show is
   * whether the flag reaches it — a wrapper that is built and then dropped on
   * the floor passes every unit test the wrapper has. So these count HTTP
   * requests the fake server actually received, with `XDG_CACHE_HOME` pointed
   * at a directory this test owns.
   */
  const cacheEnv = async () => ({
    XDG_CACHE_HOME: await mkdtemp(join(tmpdir(), 'trazum-xdg-')),
  });

  it('does not ask twice about a prompt that has not changed', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    const env = await cacheEnv();

    requests = 0;
    const first = await run(['--suggest', '--cache-suggestions', '-o', 'a.txt'], root, env);
    const second = await run(['--suggest', '--cache-suggestions', '-o', 'b.txt'], root, env);

    assert.equal(first.code, 0, first.out);
    assert.equal(second.code, 0, second.out);
    assert.equal(requests, 1, 'the second run reached the network');
    // And the answer survived the trip through disk unchanged.
    assert.match(second.out, /You should always make sure to → Always/);
  });

  it('says when an answer came from disk, on stderr', async () => {
    // Never silent: a hit is a week-old answer, and stdout belongs to --json.
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    const env = await cacheEnv();

    await run(['--suggest', '--cache-suggestions', '-o', 'a.txt'], root, env);
    const { stdout, out } = await run(['--suggest', '--cache-suggestions', '--json'], root, env);

    assert.match(out, /cache/i);
    JSON.parse(stdout); // the notice did not land in the machine-readable output
  });

  it('asks again without the flag, so a cache hit is never the default', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    const env = await cacheEnv();

    await run(['--suggest', '--cache-suggestions', '-o', 'a.txt'], root, env);
    requests = 0;
    await run(['--suggest', '-o', 'b.txt'], root, env);

    assert.equal(requests, 1, 'a cached answer was used without being asked for');
  });

  it('empties the cache on request, and reports where it was', async () => {
    reply = [{ before: 'You should always make sure to', after: 'Always' }];
    const root = await project();
    const env = await cacheEnv();
    await run(['--suggest', '--cache-suggestions', '-o', 'a.txt'], root, env);

    const cleared = await runRaw(['--clear-suggestion-cache'], root, env);
    assert.equal(cleared.code, 0, cleared.out);
    assert.match(cleared.out, /1/);
    assert.match(cleared.out, /trazum[/\\]suggestions/);

    requests = 0;
    await run(['--suggest', '--cache-suggestions', '-o', 'b.txt'], root, env);
    assert.equal(requests, 1, 'the cleared entry answered anyway');
  });
});
