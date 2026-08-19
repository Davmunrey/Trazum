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

  it('lists exactly the four tools, and no more', async () => {
    /**
     * Asserted as an exact set. This package's whole security argument is what it
     * *cannot* do — no paths, no network, no writes — and the way that argument
     * decays is a tool arriving without anyone re-reading it. profile_usage was
     * added under exactly that review: it takes log *text*, never a path, and the
     * import test below still refuses the Node entry point that could read one.
     */
    const answer = await client.send('tools/list', {});
    const names = answer.result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['check_prompt', 'list_models', 'optimize_prompt', 'profile_usage']);
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
    assert.match(bodyOf(answer), /estimates \(±10%/);
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

describe('profile_usage', () => {
  const line = (record) => JSON.stringify(record);

  it('prices a log and says the figures are exact, not estimates', async () => {
    const log = [
      line({ model: 'claude-opus-5', label: 'support', usage: { input_tokens: 10_000, output_tokens: 500 }, stop_reason: 'end_turn' }),
      line({ model: 'claude-opus-5', label: 'support', usage: { input_tokens: 12_000, output_tokens: 700 }, stop_reason: 'max_tokens' }),
    ].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /2 calls · \$/);
    assert.match(body, /exact billed token counts/);
    // Hand arithmetic, not a snapshot: 22,000 input at $5/MTok + 1,200 output
    // at $25/MTok = $0.14 exactly.
    assert.match(body, /\$0\.1400/);
    assert.match(body, /support/);
    // One of the two calls hit the ceiling, and its output was 700 of 1,200
    // output tokens: 700 × $25/MTok = $0.0175.
    assert.match(body, /1 call hit the max_tokens ceiling/);
    assert.match(body, /\$0\.0175/);
    // No period in the log, no "per month" in the answer.
    assert.ok(!/per month|\/month/.test(body), 'a monthly figure appeared from a period-less log');
  });

  it('never echoes a session key, which is the product guarantee', async () => {
    const secret = 'sess-8f3e-CUSTOMER-ALPHA';
    const log = [1, 2, 3]
      .map((turn) =>
        line({
          model: 'claude-opus-5',
          label: 'chat',
          session: secret,
          usage: { input_tokens: 8_000 * turn, output_tokens: 200 },
        }),
      )
      .join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.ok(!body.includes(secret), 'the session key was printed');
    assert.ok(!body.includes('CUSTOMER'), 'part of the session key was printed');
    // The sessions were used, though: conversation growth is reported.
    assert.match(body, /conversation growth/);
  });

  it('reports an unsettled cache verdict as unsettled, never the flattering half', async () => {
    // Reads per write inside the band where the TTL flips the verdict:
    // paid-off at the assumed 5-minute rate, lost-money at 1 hour.
    const log = line({
      model: 'claude-opus-5',
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 600_000,
        cache_creation_input_tokens: 1_000_000,
        output_tokens: 10,
      },
    });
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /cannot say whether caching paid for itself/);
    assert.ok(!/Caching took .* off this bill, against/.test(body), 'the flattering half was stated');
  });

  it('names what it could not read or price, out loud', async () => {
    const log = [
      line({ model: 'some-internal-model', usage: { input_tokens: 500, output_tokens: 50 } }),
      'not json at all',
    ].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /some-internal-model/);
    assert.match(body, /1 line could not be read and was left out \(line 2\)/);
  });

  it('refuses a log past the size cap rather than working through it', async () => {
    const answer = await client.call('profile_usage', { log: 'a'.repeat(2_000_001) });
    assert.ok(answer.result?.isError || answer.error, 'an oversized log was accepted');
  });

  it('takes text only — the schema has no path-shaped property', async () => {
    const answer = await client.send('tools/list', {});
    const tool = answer.result.tools.find((t) => t.name === 'profile_usage');
    assert.deepEqual(Object.keys(tool.inputSchema.properties), ['log', 'label', 'since', 'until', 'previous_log', 'what_if']);
    assert.match(tool.inputSchema.properties.previous_log.description, /never a file path/);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.inputSchema.properties.log.description, /Never a file path/);
  });

  it('drills down to one label, and refuses one that matches nothing by name', async () => {
    const log = [
      line({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
      line({ model: 'claude-opus-5', label: 'rag', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ].join('\n');

    const filtered = bodyOf(await client.call('profile_usage', { log, label: 'rag' }));
    // $1.00: 200k input tokens at $5/MTok, and none of chat's $5.00. ("chat"
    // the word appears in fixed prose, so the leak check is the money.)
    assert.match(filtered, /1 call · \$1\.00/);
    assert.ok(!filtered.includes('$5.00'), 'the sibling workload leaked into the drill-down');

    const missing = await client.call('profile_usage', { log, label: 'ragg' });
    assert.ok(missing.result?.isError || missing.error, 'a label matching nothing was accepted');
    const text = missing.result?.content?.map((p) => p.text).join('\n') ?? JSON.stringify(missing);
    assert.match(text, /labels here are/);
    assert.match(text, /chat/);
  });

  it('drills down to a time window, and refuses one the log does not cover', async () => {
    const log = [
      line({ model: 'claude-opus-5', ts: '2026-08-01T10:00:00Z', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
      line({ model: 'claude-opus-5', ts: '2026-08-02T10:00:00Z', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ].join('\n');

    // $1.00: day 2 alone, and none of day 1's $5.00. A bare until date
    // includes that whole UTC day.
    const windowed = bodyOf(
      await client.call('profile_usage', { log, since: '2026-08-02', until: '2026-08-02' }),
    );
    assert.match(windowed, /1 call · \$1\.00/);
    assert.ok(!windowed.includes('$5.00'), 'the other day leaked into the window');
    assert.match(windowed, /window, not the whole log/);

    const empty = await client.call('profile_usage', { log, since: '2026-09-01' });
    assert.ok(empty.result?.isError || empty.error, 'a window matching nothing was accepted');
    const text = empty.result?.content?.map((p) => p.text).join('\n') ?? JSON.stringify(empty);
    assert.match(text, /log covers 2026-08-01 → 2026-08-02/);
  });

  it('counts clockless calls left outside a window, out loud', async () => {
    const log = [
      line({ model: 'claude-opus-5', ts: '2026-08-01T10:00:00Z', usage: { input_tokens: 200_000, output_tokens: 0 } }),
      line({ model: 'claude-opus-5', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
    ].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log, since: '2026-08-01' }));
    assert.match(body, /1 call carry no timestamp|1 call carries no timestamp|1 call carry no/);
    assert.match(body, /floor on the period/);
    assert.match(body, /\$1\.00/);
  });

  it('compares against a previous log, mix move named, per-workload filters shared', async () => {
    const previous = line({ model: 'claude-haiku-4-5', label: 'chat', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    const now = line({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 1_000_000, output_tokens: 0 } });

    // $1.00 → $5.00: +$4.00 on the label, and the model split says why.
    const body = bodyOf(await client.call('profile_usage', { log: now, previous_log: previous }));
    assert.match(body, /Positive means the bill grew\. \$1\.00 → \$5\.00: \+\$4\.00 \(\+400\.0%\)/);
    assert.match(body, /\+\$4\.00 chat \(\$1\.00 → \$5\.00\)/);
    assert.match(body, /The same change, by model/);
    assert.match(body, /\+\$5\.00 claude-opus-5 \(new since the previous log\)/);
    assert.match(body, /-\$1\.00 claude-haiku-4-5 \(gone since the previous log\)/);

    // The label filter reaches both sides: a drill-down that filtered only
    // one log would call every sibling workload a vanished saving.
    const twoWorkloads = [
      line({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
      line({ model: 'claude-opus-5', label: 'batch', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
    ].join('\n');
    const drilled = bodyOf(
      await client.call('profile_usage', { log: twoWorkloads, previous_log: twoWorkloads, label: 'chat' }),
    );
    // The leak check is the money, not the word: "Batch API" appears in the
    // levers prose, so the sibling would betray itself as the $10.00 total.
    assert.match(drilled, /\$5\.00 → \$5\.00/);
    assert.ok(!drilled.includes('$10.00'), 'the sibling workload leaked into the drilled comparison');

    // Nothing priced in the previous log is its own answer, not zero growth.
    const empty = bodyOf(
      await client.call('profile_usage', { log: now, previous_log: line({ model: 'ft:unknown', usage: { input_tokens: 5 } }) }),
    );
    assert.match(empty, /no comparison to make — a different answer from zero growth/);
  });

  it('names a mix that moved, and never where it goes next', async () => {
    const on = (day, model) =>
      line({ model, label: 'chat', ts: `2026-08-0${day}T10:00:00Z`, usage: { input_tokens: 200_000, output_tokens: 0 } });
    const log = [on(1, 'claude-haiku-4-5'), on(2, 'claude-haiku-4-5'), on(3, 'claude-opus-5'), on(4, 'claude-opus-5')].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /The mix moved inside this log/);
    assert.match(body, /claude-opus-5 went from 0% of the spend in the first 2 days to 100% in the last 2/);
    assert.match(body, /Where the mix goes next is not in this log/);

    // A stable mix says nothing: the section firing on every log is noise.
    const stable = [on(1, 'claude-opus-5'), on(2, 'claude-opus-5'), on(3, 'claude-opus-5'), on(4, 'claude-opus-5')].join('\n');
    assert.ok(!bodyOf(await client.call('profile_usage', { log: stable })).includes('The mix moved'));
  });

  it('says how close the largest call is to the window, and refuses the date', async () => {
    // 190k input tokens against Claude Haiku 4.5's 200k window: 95%.
    const log = line({
      model: 'claude-haiku-4-5',
      label: 'chat',
      usage: { input_tokens: 190_000, output_tokens: 0 },
    });
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /Approaching the context window/);
    assert.match(body, /the largest call carried 190,000 input tokens against a 200,000-token window — 95% of the ceiling/);
    assert.match(body, /When it crosses is not predicted here/);

    // 90k is under half the window and must not produce the section at all.
    const calm = line({ model: 'claude-haiku-4-5', label: 'chat', usage: { input_tokens: 90_000, output_tokens: 0 } });
    assert.ok(!bodyOf(await client.call('profile_usage', { log: calm })).includes('Approaching the context window'));
  });

  it('names a request sent again, as a pattern and not a cause', async () => {
    const turn = (seconds) =>
      line({
        model: 'claude-opus-5',
        label: 'agent',
        session: 's1',
        ts: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
        usage: { input_tokens: 200_000, output_tokens: 0 },
      });
    const body = bodyOf(await client.call('profile_usage', { log: [turn(0), turn(5), turn(10)].join('\n') }));
    assert.match(body, /The same request, sent again/);
    assert.match(body, /2 of 3 calls re-sent the previous call's exact input size within 60 seconds/);
    assert.match(body, /the pattern is the claim and not the cause/);
    // The session key groups the turns and never appears.
    assert.ok(!body.includes('s1'), 'a session key reached the output');
  });

  it('describes how big the calls are, and points at the matching fix', async () => {
    // Forty calls of 1,000 input tokens and five of 100,000: the ordinary
    // call is unremarkable and the tail is two orders of magnitude bigger.
    const small = line({ model: 'claude-opus-5', label: 'rag', usage: { input_tokens: 1_000, output_tokens: 0 } });
    const large = line({ model: 'claude-opus-5', label: 'rag', usage: { input_tokens: 100_000, output_tokens: 0 } });
    const log = [
      ...Array.from({ length: 40 }, () => small),
      ...Array.from({ length: 5 }, () => large),
    ].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    assert.match(body, /How big these calls are/);
    assert.match(body, /half its calls fit within 1,024 input tokens and 95% within 106,496/);
    assert.match(body, /The fix is a limit on the large calls, not a rewrite/);

    // Nineteen calls cannot carry a p95, and the section stays silent rather
    // than naming the largest of nineteen as a percentile.
    const thin = Array.from({ length: 19 }, () => large).join('\n');
    assert.ok(!bodyOf(await client.call('profile_usage', { log: thin })).includes('How big these calls are'));
  });

  it('prices the same calls on another model, with the refusals attached', async () => {
    // Five 200k-token calls: $5.00 on Claude Opus 5, $1.00 on Claude Haiku 4.5.
    // Five calls rather than one of 1M tokens because a single 1M-token call
    // does not fit Haiku's 200k window — the ceiling is judged per call.
    const log = Array.from({ length: 5 }, () =>
      line({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ).join('\n');
    const body = bodyOf(
      await client.call('profile_usage', { log, what_if: 'claude-haiku-4-5' }),
    );
    assert.match(body, /These exact calls on Claude Haiku 4\.5/);
    assert.match(body, /multiplication, not advice/);
    assert.match(body, /\$5\.00 of movable spend would have been \$1\.00 — \$4\.00 less/);

    // A call larger than the target's window would fail, not cost less — and
    // an agent handed a saving for a failed call would act on it.
    const huge = line({
      model: 'claude-opus-5',
      label: 'huge',
      usage: { input_tokens: 250_000, output_tokens: 0 },
    });
    const refused = bodyOf(await client.call('profile_usage', { log: huge, what_if: 'claude-haiku-4-5' }));
    assert.match(refused, /huge cannot move/);
    assert.match(refused, /Those calls would fail, not cost less/);
    assert.ok(!refused.includes('of movable spend'), 'an impossible move was priced as a saving');

    // An id with no price is an error, never a section that quietly says nothing.
    const unknown = await client.call('profile_usage', { log, what_if: 'gpt-imaginary' });
    assert.ok(unknown.result?.isError || unknown.error, 'an unpriced what_if model was accepted');
    const text = unknown.result?.content?.map((p) => p.text).join('\n') ?? JSON.stringify(unknown);
    assert.match(text, /cannot price: "gpt-imaginary"/);
  });

  it('names the fields the log is missing, with counts an agent can act on', async () => {
    const bare = line({ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 100 } });
    const body = bodyOf(await client.call('profile_usage', { log: [bare, bare].join('\n') }));
    assert.match(body, /what this log cannot answer yet/);
    assert.match(body, /"label" on 0\/2 records/);
    assert.match(body, /"session" on 0\/2 records/);
    assert.match(body, /"ts" on 0\/2 records/);

    // A complete log gets no section: an agent reading a list of things that
    // are fine learns to skip the list.
    const complete = line({
      model: 'claude-opus-5',
      label: 'chat',
      session: 's1',
      ts: '2026-08-01T10:00:00Z',
      stop_reason: 'end_turn',
      usage: { input_tokens: 200_000, output_tokens: 100 },
    });
    const quiet = bodyOf(await client.call('profile_usage', { log: [complete, complete].join('\n') }));
    assert.ok(!quiet.includes('cannot answer yet'));
  });

  it('names which workload pays for truncated answers, over measured calls', async () => {
    const log = [
      line({ model: 'claude-opus-5', label: 'chat', stop_reason: 'max_tokens', usage: { input_tokens: 100, output_tokens: 40_000 } }),
      line({ model: 'claude-opus-5', label: 'chat', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40_000 } }),
      line({ model: 'claude-opus-5', label: 'batch', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40_000 } }),
    ].join('\n');
    const body = bodyOf(await client.call('profile_usage', { log }));
    // One of chat's two measured calls: 50%, $1.00 of output at $25/MTok.
    assert.match(body, /chat: 1 of 2 calls that recorded a stop reason were cut off \(50%\), \$1\.00/);
    assert.match(body, /denominator is the calls that measured/);
  });

  it('reports what one conversation costs, median against p95', async () => {
    // Nine $1.00 conversations and one $50.00: the median describes the
    // ordinary case, the mean ($5.90) would describe none of them.
    const turns = [];
    for (let i = 0; i < 9; i += 1) {
      turns.push(line({ model: 'claude-opus-5', session: `s${i}`, usage: { input_tokens: 200_000, output_tokens: 0 } }));
    }
    turns.push(line({ model: 'claude-opus-5', session: 'spike', usage: { input_tokens: 10_000_000, output_tokens: 0 } }));
    const body = bodyOf(await client.call('profile_usage', { log: turns.join('\n') }));
    assert.match(body, /the median costs \$1\.00 over 1 turns/);
    assert.match(body, /95% come in under \$50\.00/);
    assert.match(body, /50x the median/);
    assert.ok(!body.includes('spike'), 'a session key reached the output');
  });

  it('names the conversations that never came back, as fact or as ceiling', async () => {
    const driveBy = (session, extra = {}) =>
      line({
        model: 'claude-opus-5',
        session,
        usage: {
          input_tokens: 1_000,
          output_tokens: 0,
          cache_creation_input_tokens: 1_000_000,
          cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 },
        },
        ...extra,
      });

    // Zero reads anywhere in the slice: the ceiling collapses into a fact.
    const fact = bodyOf(await client.call('profile_usage', { log: driveBy('s1') }));
    // $6.25 exactly: 1M 5-minute write tokens at $5/MTok × 1.25.
    assert.match(fact, /\$6\.25/);
    assert.match(fact, /bought nothing/);

    // With reads in the slice, the same tokens are a ceiling, named as one.
    const withReads = [
      driveBy('s1'),
      line({ model: 'claude-opus-5', session: 's2', usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 400_000 } }),
      line({ model: 'claude-opus-5', session: 's2', usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 400_000 } }),
    ].join('\n');
    const ceiling = bodyOf(await client.call('profile_usage', { log: withReads }));
    assert.match(ceiling, /ceiling on the waste, not a bill/);
    assert.ok(!/bought nothing/.test(ceiling));
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
