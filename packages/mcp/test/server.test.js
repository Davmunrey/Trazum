import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const entry = join(packageRoot, 'dist/index.js');

/**
 * The server, spoken to over stdio the way a client speaks to it.
 *
 * Not "the handlers, called directly". A tool that returns the right object and is
 * registered under a name no client can reach is a tool that does not exist, and
 * calling the handler as a function would never notice. Every assertion below goes
 * through a real process, real JSON-RPC framing and the real SDK.
 */
class Client {
  #child;
  #pending = new Map();
  #buffer = '';
  #id = 0;

  constructor() {
    this.#child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk) => this.#onData(chunk));
    this.stderr = '';
    this.#child.stderr.setEncoding('utf8');
    this.#child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let index = this.#buffer.indexOf('\n');
    while (index !== -1) {
      const line = this.#buffer.slice(0, index).trim();
      this.#buffer = this.#buffer.slice(index + 1);
      if (line !== '') {
        const message = JSON.parse(line);
        const resolve = this.#pending.get(message.id);
        if (resolve) {
          this.#pending.delete(message.id);
          resolve(message);
        }
      }
      index = this.#buffer.indexOf('\n');
    }
  }

  send(method, params) {
    const id = ++this.#id;
    const promise = new Promise((resolve, reject) => {
      this.#pending.set(id, resolve);
      // A hung request must fail the test rather than the suite's timeout, so the
      // failure names the method that hung.
      setTimeout(() => reject(new Error(`${method} did not answer in 15s`)), 15_000).unref();
    });
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return promise;
  }

  notify(method, params) {
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async handshake() {
    const result = await this.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'trazum-test', version: '0' },
    });
    this.notify('notifications/initialized');
    return result;
  }

  async call(name, args) {
    const answer = await this.send('tools/call', { name, arguments: args });
    return answer;
  }

  close() {
    this.#child.kill();
  }
}

let client;

before(async () => {
  client = new Client();
  await client.handshake();
});

after(() => client?.close());

/** The text of a tool result, joined. */
const bodyOf = (answer) =>
  (answer.result?.content ?? []).map((part) => part.text).join('\n');

describe('the handshake', () => {
  it('announces itself and its tools', async () => {
    const fresh = new Client();
    const result = await fresh.handshake();
    assert.equal(result.result.serverInfo.name, 'trazum');
    assert.ok(result.result.capabilities.tools, 'no tool capability announced');
    fresh.close();
  });

  it('lists exactly the three tools, and no more', async () => {
    /**
     * Asserted as an exact set. This package's whole security argument is what it
     * *cannot* do — no paths, no network, no writes — and the way that argument
     * decays is a fourth tool arriving without anyone re-reading it.
     */
    const answer = await client.send('tools/list', {});
    const names = answer.result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['check_prompt', 'list_models', 'optimize_prompt']);
  });
});

describe('optimize_prompt', () => {
  it('shortens a wordy prompt and prices the difference', async () => {
    const answer = await client.call('optimize_prompt', {
      prompt:
        'Please could you kindly summarise the following text for me. '
        + 'It is very important to note that you should basically be concise. '
        + 'Please could you kindly summarise the following text for me.',
      callsPerMonth: 50_000,
    });
    const body = bodyOf(answer);
    assert.match(body, /tokens: \d+ → \d+/);
    assert.match(body, /monthly saving/);
    assert.match(body, /--- optimised prompt ---/);
    // The politeness rule at minimum should have fired.
    assert.ok(!/kindly/i.test(body.split('--- optimised prompt ---')[1]), 'nothing was cut');
  });

  it('states the error band, so a figure quoted onward carries its uncertainty', async () => {
    const answer = await client.call('optimize_prompt', { prompt: 'Please be brief.' });
    assert.match(bodyOf(answer), /estimates \(±15%/);
  });

  it('refuses a prompt past the size cap rather than working through it', async () => {
    const answer = await client.call('optimize_prompt', { prompt: 'a'.repeat(400_001) });
    assert.ok(answer.result?.isError || answer.error, 'an oversized prompt was accepted');
  });

  it('refuses an empty prompt', async () => {
    const answer = await client.call('optimize_prompt', { prompt: '' });
    assert.ok(answer.result?.isError || answer.error, 'an empty prompt was accepted');
  });
});

describe('check_prompt', () => {
  const wordy =
    'Please could you kindly summarise the following text for me, thank you very much. '
    + 'It is very important to note that you should basically be concise about it.';

  it('passes a prompt inside its budget', async () => {
    const answer = await client.call('check_prompt', { prompt: wordy, maxTokens: 10_000 });
    assert.match(bodyOf(answer), /^PASS/);
  });

  it('distinguishes "cut content" from "run the rules"', async () => {
    /**
     * The third outcome is why this tool exists. A boolean would collapse two
     * different instructions — optimise, or cut — into one unhelpful "no".
     */
    const optimisable = await client.call('check_prompt', { prompt: wordy, maxTokens: 34 });
    assert.match(bodyOf(optimisable), /Optimise rather than cut/);

    const hopeless = await client.call('check_prompt', { prompt: wordy, maxTokens: 3 });
    assert.match(bodyOf(hopeless), /content has to be cut/);
  });

  it('requires a maximum, because a check without one is not a check', async () => {
    const answer = await client.call('check_prompt', { prompt: wordy });
    assert.ok(answer.result?.isError || answer.error, 'a check with no budget was accepted');
  });
});

describe('list_models', () => {
  it('reports the catalogue with the date it was reviewed', async () => {
    const answer = await client.call('list_models', {});
    const body = bodyOf(answer);
    assert.match(body, /prices reviewed \d{4}-\d{2}-\d{2}/);
    assert.match(body, /claude-opus-5/);
    assert.match(body, /verify before budgeting/);
  });
});

describe('what this package cannot do, which is the point', () => {
  const sources = readdirSync(join(packageRoot, 'src'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(packageRoot, 'src', name), 'utf8')]);

  /** Comments stripped: this repository has been caught matching its own prose. */
  const codeOf = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('never imports the Node entry point, so it cannot read a file', () => {
    /**
     * The structural half of "no paths". A tool that took a filename would be a
     * file-read primitive reachable by whatever the model decided to ask for, and
     * a code review is not a durable defence against one being added. Importing
     * only the browser-safe entry point means the capability is absent rather than
     * unused.
     */
    assert.ok(sources.length > 0, 'no sources found — has the layout changed?');
    for (const [name, source] of sources) {
      const code = codeOf(source);
      assert.ok(!code.includes('@trazum/core/node'), `${name} imports the Node entry point`);
      assert.ok(!/from 'node:fs/.test(code), `${name} imports node:fs`);
      assert.ok(!/from 'node:child_process/.test(code), `${name} spawns processes`);
    }
  });

  it('never reaches the network', () => {
    for (const [name, source] of sources) {
      const code = codeOf(source);
      assert.ok(!/\bfetch\s*\(/.test(code), `${name} calls fetch`);
      assert.ok(!/refineWithLlm|suggestRewrites|evaluate\b/.test(code), `${name} calls a model`);
    }
  });

  it('declares every dependency it imports', () => {
    // A transitive dependency that happens to be installed is not a dependency.
    // `zod` arrives with the SDK and is imported directly here, which is exactly
    // the case that breaks the day the SDK drops it.
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    const declared = new Set(Object.keys(manifest.dependencies ?? {}));
    const imported = new Set();
    for (const [, source] of sources) {
      for (const [, spec] of codeOf(source).matchAll(/from '([^'.][^']*)'/g)) {
        if (spec.startsWith('node:')) continue;
        imported.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
      }
    }
    const undeclared = [...imported].filter((name) => !declared.has(name));
    assert.deepEqual(undeclared, [], `imported but not declared: ${undeclared.join(', ')}`);
  });
});
