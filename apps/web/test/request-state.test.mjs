import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { it } from 'node:test';

const read = (name) => readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf8');

it('automatic Optimise payloads disable paid passes while manual requests retain them', () => {
  const source = read('Optimizer');
  const payload = source.match(/body: JSON\.stringify\((\{[^]*?\n        \})\)/)?.[1];
  assert.ok(payload, 'request payload must be located in the real handler');
  const context = {
    promptUsed: 'synthetic prompt', level: 'safe', locale: 'en', reorder: false,
    suggest: true, applySuggestions: true, model: 'synthetic-model', callsPerMonth: 1,
    avgOutputTokens: 1, cacheHitRate: 0, batchEligible: false,
    llmEnabled: true, llmProvider: 'openai', llmBaseUrl: '', llmModel: '', llmApiKey: 'synthetic-key',
  };
  const request = new Function(...Object.keys(context), 'options', `return (${payload});`);
  const auto = request(...Object.values(context), { auto: true });
  assert.equal(auto.suggest, false);
  assert.equal(auto.applySuggestions, false);
  assert.deepEqual(auto.llm, { enabled: false });
  assert.ok(!JSON.stringify(auto).includes('synthetic-key'));
  const manual = request(...Object.values(context), {});
  assert.equal(manual.suggest, true);
  assert.equal(manual.applySuggestions, true);
  assert.equal(manual.llm.enabled, true);
});

function writerHarness(fetchImpl) {
  const source = read('Writer');
  const send = source.match(/    async \(next: Answers\)[^]*?\n    },\n    \[locale, t\]/)?.[0]
    .replace(/,\n    \[locale, t\]$/, '');
  const answer = source.match(/  const answer = async[^]*?\n  };/)?.[0];
  assert.ok(send && answer, 'exercise actual Writer request and answer handlers');
  const observed = { answers: {}, typed: 'keep this answer', error: null, loading: false, tracks: 0 };
  const context = {
    fetch: fetchImpl, inFlight: { current: false }, locale: 'en',
    t: { errors: { requestFailed: 'request failed', unreachable: 'unreachable' } },
    state: { next: 'goal' }, answers: {},
    setLoading: (value) => { observed.loading = value; },
    setError: (value) => { observed.error = value; },
    setState: (value) => { observed.state = value; },
    setAnswers: (value) => { observed.answers = value; },
    setTyped: (value) => { observed.typed = value; },
    setCopied: () => {}, track: () => { observed.tracks++; },
  };
  const code = stripTypeScriptTypes(`const send = ${send};\n${answer}`) + '\nreturn { send, answer };';
  const handlers = new Function(...Object.keys(context), code)(...Object.values(context));
  return { ...handlers, observed };
}

it('Writer preserves typed input and committed answers when the request fails', async () => {
  const writer = writerHarness(async () => { throw new Error('synthetic offline'); });
  await writer.answer('keep this answer');
  assert.equal(writer.observed.typed, 'keep this answer');
  assert.deepEqual(writer.observed.answers, {});
  assert.equal(writer.observed.error, 'unreachable');
  assert.equal(writer.observed.loading, false);
  assert.equal(writer.observed.tracks, 0);
});

it('Writer shows a fallback for unsuccessful responses with no error text', async () => {
  const writer = writerHarness(async () => ({ ok: false, json: async () => ({}) }));
  await writer.answer('keep this answer');
  assert.equal(writer.observed.error, 'request failed');
  assert.equal(writer.observed.typed, 'keep this answer');
});

it('Writer accepts only one pending answer and commits it after success', async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const writer = writerHarness(async () => {
    calls++;
    await pending;
    return { ok: true, json: async () => ({ next: 'audience' }) };
  });
  const first = writer.answer('keep this answer');
  await writer.answer(null);
  assert.equal(calls, 1);
  assert.equal(writer.observed.typed, 'keep this answer');
  assert.equal(writer.observed.loading, true);
  release();
  await first;
  assert.deepEqual(writer.observed.answers, { goal: 'keep this answer' });
  assert.equal(writer.observed.typed, '');
  assert.equal(writer.observed.loading, false);
  assert.equal(writer.observed.tracks, 1);
});
