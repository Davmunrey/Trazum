import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * `bill --receipt --send <url>`: the receipt goes to the endpoint, and only
 * the receipt.
 *
 * The claim worth holding is byte for byte: what a local server receives is
 * what `--receipt` writes for the same run. Around it, the four faults a send
 * can have, each planted in the source while this suite was written and seen
 * to fail here:
 *
 * - a prompt reaching the request (the log carries a sentinel prompt; it is
 *   looked for in the body, the headers and the path);
 * - the key printed (stdout or stderr, on success, and on a failure whose
 *   response body quotes the key back);
 * - a redirect followed (a second server must see nothing);
 * - plain http to a host that is not loopback accepted (the server listens on
 *   127.0.0.2, which is loopback by address and not by the names the check
 *   allows, so a send that is wrongly accepted arrives and is counted).
 *
 * Servers are on 127.0.0.x and the CLI runs as a child, asynchronously: a
 * synchronous spawn would block the event loop the server answers from.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const KEY = 'hunter2-receipt-key';
const SHORT_KEY = 'abc123';
const PROMPT = 'SENTINEL-PROMPT-do-not-leave-this-machine-5521';

const run = (args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...SPAWN_ENV, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '', ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('the CLI did not finish in 60 seconds'));
    }, 60000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

const servers = [];

/** A server on `host` that records every request whole and answers with `respond`. */
function listen(respond, host = '127.0.0.1') {
  const seen = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      respond(req, res);
    });
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, host, () => resolve({ seen, port: server.address().port, host }));
  });
}

const ok = (_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('stored');
};

after(() => {
  for (const server of servers) server.close();
});

const record = (model, ts, label, usage, extra = {}) =>
  JSON.stringify({ model, ts, label, usage, ...extra });

/**
 * One closed day: claude-opus-5 at $5 in and $25 out per million, so
 * 1,000 in + 200 out is $0.005 + $0.005 = $0.01. The first record also holds
 * a prompt, which no document of this tool may carry.
 */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-send-'));
  const log = join(dir, 'usage.jsonl');
  writeFileSync(
    log,
    `${[
      record('claude-opus-5', '2026-09-01T10:00:00Z', 'api', { input_tokens: 1000, output_tokens: 200 }, { prompt: PROMPT, messages: [{ role: 'user', content: PROMPT }] }),
      record('claude-opus-5', '2026-09-01T11:00:00Z', 'api', { input_tokens: 500, output_tokens: 100 }),
    ].join('\n')}\n`,
  );
  return { dir, log, out: join(dir, 'receipt.json') };
}

const everything = (request) =>
  JSON.stringify({ url: request.url, headers: request.headers }) + request.body.toString('utf8');

describe('bill --receipt --send', () => {
  it('delivers exactly the bytes --receipt writes, and only that', async () => {
    const target = await listen(ok);
    const w = workspace();
    const result = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/receipts`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal(target.seen.length, 1, 'one request: no retry, no second send');
    const [request] = target.seen;
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/receipts');
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(request.headers.authorization, `Bearer ${KEY}`);
    assert.ok(Buffer.compare(request.body, readFileSync(w.out)) === 0, 'the body is the file --receipt wrote, byte for byte');
    // And it is the document the run prints on stdout, not a different render of it.
    const piped = await run(['bill', w.log, '--receipt']);
    assert.equal(piped.code, 0, piped.stderr);
    assert.equal(request.body.toString('utf8'), piped.stdout);
    // The server's answer is acknowledged, and the host named, not the path.
    assert.match(result.stderr, new RegExp(`127\\.0\\.0\\.1:${target.port}`));
    assert.doesNotMatch(result.stderr, /\/receipts/);
  });

  it('sends the receipt on stdout runs too, and sends no authorization header without a key', async () => {
    const target = await listen(ok);
    const w = workspace();
    const result = await run(['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/r`]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(target.seen.length, 1);
    assert.equal(target.seen[0].headers.authorization, undefined);
    assert.equal(target.seen[0].body.toString('utf8'), result.stdout);
  });

  it('never puts a prompt from the log into the request', async () => {
    const target = await listen(ok);
    const w = workspace();
    const result = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/r`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal(target.seen.length, 1);
    assert.ok(!everything(target.seen[0]).includes(PROMPT), 'a prompt reached the request');
    assert.ok(!everything(target.seen[0]).includes('SENTINEL'), 'part of a prompt reached the request');
    // The receipt itself is the whole of the body: it parses, and holds the figures.
    const body = JSON.parse(target.seen[0].body.toString('utf8'));
    assert.equal(body.lines.length, 1);
    assert.equal(Object.keys(body).includes('prompt'), false);
  });

  it('never prints the key, on success or when the endpoint quotes it back', async () => {
    const good = await listen(ok);
    const w = workspace();
    const sent = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${good.port}/r`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(sent.code, 0, sent.stderr);
    assert.ok(!(sent.stdout + sent.stderr).includes(KEY), 'the key was printed on a successful send');
    assert.ok(!readFileSync(w.out, 'utf8').includes(KEY), 'the key reached the receipt');

    // An endpoint that refuses and says why, quoting the Authorization header it was given.
    for (const key of [KEY, SHORT_KEY]) {
      const echo = await listen((req, res) => {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end(`unknown credential ${req.headers.authorization} (${key})`);
      });
      const refused = await run(
        ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${echo.port}/r`, '-o', w.out],
        { TRAZUM_RECEIPT_KEY: key },
      );
      assert.equal(refused.code, 3, refused.stderr);
      assert.match(refused.stderr, /unknown credential/, 'the response body is printed');
      assert.ok(!(refused.stdout + refused.stderr).includes(key), `the key ${key.length} characters long was printed`);
    }

    // On stdout runs the key has no way in either.
    const piped = await run(['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${good.port}/r`], { TRAZUM_RECEIPT_KEY: KEY });
    assert.ok(!(piped.stdout + piped.stderr).includes(KEY));
  });

  it('does not accept the key on the command line', async () => {
    const target = await listen(ok);
    const w = workspace();
    for (const flag of ['--key', '--send-key', '--token', '--api-key']) {
      const result = await run(['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/r`, flag, KEY]);
      assert.equal(result.code, 1, `${flag} was accepted`);
      assert.ok(!(result.stdout + result.stderr).includes(KEY), `${flag}'s value was printed`);
    }
    assert.equal(target.seen.length, 0);
  });

  it('refuses a key that is not a bearer token, without showing it', async () => {
    const target = await listen(ok);
    const w = workspace();
    const bad = 'has a space\tand a tab';
    const result = await run(['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/r`], { TRAZUM_RECEIPT_KEY: bad });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /TRAZUM_RECEIPT_KEY/);
    assert.ok(!(result.stdout + result.stderr).includes('has a space'));
    assert.equal(target.seen.length, 0);
  });

  it('refuses a redirect and follows it nowhere', async () => {
    const elsewhere = await listen(ok);
    const redirector = await listen((_req, res) => {
      res.writeHead(307, { location: `http://127.0.0.1:${elsewhere.port}/taken` });
      res.end();
    });
    const w = workspace();
    const result = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${redirector.port}/r`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(redirector.seen.length, 1);
    assert.equal(elsewhere.seen.length, 0, 'the receipt followed a redirect to another host');
    assert.equal(result.code, 3, result.stderr);
    assert.ok(existsSync(w.out), 'the receipt is still written locally');
    assert.ok(!(result.stdout + result.stderr).includes(KEY));
  });

  it('refuses plain http to a host that is not loopback, before reading anything', async () => {
    // 127.0.0.2 is loopback by address and not by name: the check allows
    // localhost, 127.0.0.1 and ::1, so an http URL here is a remote one.
    const target = await listen(ok, '127.0.0.2');
    const w = workspace();
    const result = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.2:${target.port}/r`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(result.code, 1, result.stderr);
    assert.equal(target.seen.length, 0, 'plain http to a non-loopback host was sent');
    assert.ok(!existsSync(w.out), 'a refused URL must cost nothing: no log read, no receipt');
    assert.match(result.stderr, /https/);

    const named = await run(['bill', w.log, '--receipt', '--send', 'http://collector.example.com/r']);
    assert.equal(named.code, 1);
  });

  it('refuses credentials in the URL and a URL that does not parse', async () => {
    const target = await listen(ok);
    const w = workspace();
    const withCredentials = await run(['bill', w.log, '--receipt', '--send', `http://user:pw-9931@127.0.0.1:${target.port}/r`, '-o', w.out]);
    assert.equal(withCredentials.code, 1);
    assert.ok(!(withCredentials.stdout + withCredentials.stderr).includes('pw-9931'), 'the URL password was echoed');
    const notAUrl = await run(['bill', w.log, '--receipt', '--send', 'not a url', '-o', w.out]);
    assert.equal(notAUrl.code, 1);
    assert.equal(target.seen.length, 0);
    assert.ok(!existsSync(w.out));
  });

  it('refuses --send without --receipt, by name, and sends nothing', async () => {
    const target = await listen(ok);
    const w = workspace();
    const result = await run(['bill', w.log, '--send', `http://127.0.0.1:${target.port}/r`, '-o', w.out]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--send/);
    assert.match(result.stderr, /--receipt/);
    assert.equal(target.seen.length, 0);
    assert.ok(!existsSync(w.out));
    const negated = await run(['bill', w.log, '--no-receipt', '--send', `http://127.0.0.1:${target.port}/r`]);
    assert.equal(negated.code, 1);
    assert.equal(target.seen.length, 0);
  });

  it('on a refusal writes the receipt anyway, exits 3, and prints the response body but no request header', async () => {
    const target = await listen((_req, res) => {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('collector is down for maintenance');
    });
    const w = workspace();
    const result = await run(
      ['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${target.port}/r`, '-o', w.out],
      { TRAZUM_RECEIPT_KEY: KEY },
    );
    assert.equal(result.code, 3, result.stderr);
    assert.equal(target.seen.length, 1, 'a failed send is not retried');
    assert.ok(Buffer.compare(readFileSync(w.out), target.seen[0].body) === 0);
    assert.match(result.stderr, /collector is down for maintenance/);
    assert.match(result.stderr, /503/);
    assert.doesNotMatch(result.stderr, /authorization|content-type/i);
  });

  it('on an error writes the receipt to stdout anyway and exits 3', async () => {
    const closed = await listen(ok);
    const { port } = closed;
    await new Promise((resolve) => servers.find((s) => s.address()?.port === port).close(resolve));
    const w = workspace();
    const result = await run(['bill', w.log, '--receipt', '--send', `http://127.0.0.1:${port}/r`], { TRAZUM_RECEIPT_KEY: KEY });
    assert.equal(result.code, 3, result.stderr);
    assert.equal(JSON.parse(result.stdout).lines.length, 1, 'the receipt is on stdout');
    assert.ok(!(result.stdout + result.stderr).includes(KEY));
  });

  it('reuses watch --webhook\'s URL check rather than carrying a second copy', () => {
    const source = readFileSync(new URL('../src/receipt-send.ts', import.meta.url), 'utf8');
    assert.match(source, /import \{[^}]*\bcheckWebhook\b[^}]*\} from '\.\/watch-run\.js'/);
    assert.doesNotMatch(source, /new URL\(/);
    assert.doesNotMatch(source, /\bconsole\s*\./, 'the module that holds the key cannot print');
    assert.match(source, /SAFE_FETCH_INIT/);
  });

  it('declares --send where the flag tables can see it', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(source, /VALUE_FLAGS = new Set\(\[[^\]]*'send'/s);
    assert.match(source, /\n  bill: \[[^\]]*'send'/);
  });
});
