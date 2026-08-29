import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../../packages/cli/test/env.mjs';

register('./helpers/loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const CLI = join(repoRoot, 'packages/cli/dist/index.js');
const MCP = join(repoRoot, 'packages/mcp/dist/index.js');

/**
 * *"One core does the measuring; four surfaces carry it. They cannot disagree,
 * because they are the same functions."*
 *
 * That sentence is on the landing page in five languages. It is the product's
 * architectural claim and the reason a reader is expected to believe that the
 * figure in their terminal, the one their agent quotes, and the one on the page
 * are the same figure. Nothing checked it.
 *
 * "The same functions" is an argument, not a proof. Two surfaces call the same
 * core and still disagree if one of them rounds, filters, defaults or windows
 * differently on the way in or out — and each of these four does its own
 * argument handling, its own formatting and its own locale.
 *
 * So the same log and the same prompt go through all four, and the figures a
 * reader is shown have to match. Not the internals: what each surface actually
 * puts in front of a person.
 *
 * ## Why this lives in the web package
 *
 * It is the only one that can reach all four. The others cannot import the web
 * app's TypeScript, and the promise is about all of them together or it is
 * about nothing.
 *
 * ## The MCP server is spoken to, not called
 *
 * Over stdio, with real JSON-RPC framing, the way a client reaches it. A tool
 * registered under a name no client can reach is a tool that does not exist,
 * and calling its handler as a function would never notice. That is the
 * standard `packages/mcp/test/server.test.js` already sets, which is why the
 * small client below is worth its thirty lines.
 */

/** One log, built here, so no surface is measured against a different corpus. */
function corpus() {
  const day = (n) => new Date(Date.UTC(2026, 6, n, 9, 0, 0)).toISOString();
  const records = [];
  for (let i = 0; i < 30; i += 1) {
    records.push({
      model: 'claude-opus-5',
      timestamp: day(1 + (i % 6)),
      label: i % 4 === 0 ? 'writer' : 'support-rag',
      session: `s${i % 3}`,
      usage: {
        input_tokens: 9000,
        output_tokens: 300,
        cache_read_input_tokens: i % 3 === 0 ? 4000 : 0,
      },
    });
  }
  return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;
}

/** `$1.59` and `30 calls`, as any of these surfaces would show a reader. */
const moneyIn = (text) => text.match(/\$[\d,]+\.\d+/)?.[0] ?? null;
const callsIn = (text) => text.match(/([\d,]+) calls/)?.[1] ?? null;

/** A JSON-RPC client over stdio, because that is how the server is reached. */
function askMcp(tool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MCP], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: SPAWN_ENV,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('the MCP server did not answer'));
    }, 30000);
    let buffer = '';
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        const message = JSON.parse(line);
        if (message.id === 1) {
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
        }
        if (message.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve((message.result?.content ?? []).map((part) => part.text).join('\n'));
        }
      }
    });
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'parity', version: '1' } },
    });
  });
}

describe('the four surfaces answer with one number', () => {
  const log = corpus();

  it('has the surfaces it needs built', () => {
    for (const [what, path] of [['the CLI', CLI], ['the MCP server', MCP]]) {
      assert.ok(existsSync(path), `${what} is not built — run npm test from the repository root`);
    }
  });

  it('still makes the claim this exists to check', async () => {
    /*
      Read off the landing rather than quoted here. If the sentence ever goes,
      the guard for it should be reconsidered rather than left running against
      a promise nobody makes any more.
    */
    const { readFileSync } = await import('node:fs');
    const landing = readFileSync(join(here, '../app/landing/page.tsx'), 'utf8');
    assert.match(landing, /cannot disagree, because they are the same functions/);
  });

  it('prices the same log the same way, everywhere a reader can ask', async () => {
    const { profileUsage, BUNDLED_CATALOGUE, formatUsd } = await import('@trazum/core');

    /* The core is the measurement; the other three are asked what they show. */
    const core = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    assert.ok(core.total.calls > 0 && core.total.totalUsd > 0, 'the corpus measures nothing');
    const expected = { money: formatUsd(core.total.totalUsd), calls: String(core.total.calls) };

    const dir = mkdtempSync(join(tmpdir(), 'trazum-parity-'));
    const path = join(dir, 'usage.jsonl');
    writeFileSync(path, log);

    const cli = spawnSync(process.execPath, [CLI, 'profile', path, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 60000,
    });
    assert.equal(cli.status, 0, `the CLI failed:\n${cli.stdout}${cli.stderr}`);
    const fromCli = JSON.parse(cli.stdout);

    const mcp = await askMcp('profile_usage', { log });

    const { runPlayground, createPlaygroundFiles } = await import('../lib/playground.ts');
    const { getWebMessages } = await import('../lib/i18n/index.ts');
    const files = createPlaygroundFiles();
    files.set('parity.jsonl', log);
    const web = runPlayground('trazum profile parity.jsonl', files, getWebMessages('en'), 'en').lines.join('\n');

    const said = {
      'the CLI': { money: formatUsd(fromCli.total.totalUsd), calls: String(fromCli.total.calls) },
      'the MCP server': { money: moneyIn(mcp), calls: callsIn(mcp)?.replace(/,/g, '') },
      'the browser': { money: moneyIn(web), calls: callsIn(web)?.replace(/,/g, '') },
    };

    for (const [surface, answer] of Object.entries(said)) {
      assert.equal(
        answer.money,
        expected.money,
        `${surface} says ${answer.money} where the core says ${expected.money}`,
      );
      assert.equal(
        answer.calls,
        expected.calls,
        `${surface} counted ${answer.calls} calls where the core counted ${expected.calls}`,
      );
    }
  });

  it('shortens the same prompt the same way, everywhere a reader can ask', async () => {
    const { optimize } = await import('@trazum/core');
    const { readFileSync } = await import('node:fs');
    const prompt = readFileSync(join(repoRoot, 'examples/sample-prompt.en.txt'), 'utf8');

    const core = optimize(prompt, { level: 'safe' });
    assert.ok(core.tokensBefore > 0, 'the sample prompt measures nothing');

    const dir = mkdtempSync(join(tmpdir(), 'trazum-parity-prompt-'));
    const path = join(dir, 'prompt.txt');
    writeFileSync(path, prompt);
    const cli = spawnSync(process.execPath, [CLI, 'optimize', path, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 60000,
    });
    assert.equal(cli.status, 0, `the CLI failed:\n${cli.stdout}${cli.stderr}`);
    const fromCli = JSON.parse(cli.stdout);

    const mcp = await askMcp('optimize_prompt', { prompt, level: 'safe' });
    const mcpBefore = mcp.match(/([\d,]+)\s*→/)?.[1]?.replace(/,/g, '') ?? null;

    for (const [surface, before, after] of [
      ['the CLI', String(fromCli.tokensBefore), String(fromCli.tokensAfter)],
      ['the MCP server', mcpBefore, null],
    ]) {
      assert.equal(
        before,
        String(core.tokensBefore),
        `${surface} counted ${before} tokens where the core counted ${core.tokensBefore}`,
      );
      if (after !== null) {
        assert.equal(
          after,
          String(core.tokensAfter),
          `${surface} left ${after} tokens where the core left ${core.tokensAfter}`,
        );
      }
    }
  });
});
