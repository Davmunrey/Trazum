import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promptText } from '../dist/gateway-server.js';

/**
 * What the gateway counts before it judges a call against a budget (#899).
 *
 * Each case puts one marker in one field and asks that it reach the text the
 * estimate is taken from. A field the gateway stops reading drops its marker,
 * and the call it belongs to is judged as smaller than it is.
 */
const MARK = 'TRAZUM_ESTIMATE_MARKER';

describe('the gateway estimates every field the provider bills as input (#899)', () => {
  const cases = [
    ['Anthropic system as a string', { system: MARK }],
    ['Anthropic system as content blocks', { system: [{ type: 'text', text: MARK, cache_control: { type: 'ephemeral' } }] }],
    ['OpenAI Responses instructions', { instructions: MARK }],
    ['Gemini systemInstruction', { systemInstruction: { parts: [{ text: MARK }] } }],
    ['messages', { messages: [{ role: 'user', content: MARK }] }],
    ['Responses input as a list', { input: [{ role: 'user', content: MARK }] }],
    ['Responses input as a string', { input: MARK }],
    ['Gemini contents', { contents: [{ role: 'user', parts: [{ text: MARK }] }] }],
    ['Anthropic tools', { tools: [{ name: 'lookup', description: MARK, input_schema: { type: 'object' } }] }],
    ['OpenAI tools', { tools: [{ type: 'function', function: { name: 'lookup', description: MARK } }] }],
    ['Gemini tools', { tools: [{ functionDeclarations: [{ name: 'lookup', description: MARK }] }] }],
    ['Chat Completions functions', { functions: [{ name: 'lookup', description: MARK }] }],
  ];

  for (const [name, request] of cases) {
    it(`counts ${name}`, () => {
      assert.ok(promptText({ model: 'm', ...request }).includes(MARK), `${name} is not in the text the estimate is taken from`);
    });
  }

  it('counts every field of one request, not only the first it finds', () => {
    const text = promptText({
      model: 'm',
      system: [{ type: 'text', text: 'S1' }],
      messages: [{ role: 'user', content: 'M1' }],
      tools: [{ name: 'T1', input_schema: { type: 'object' } }],
    });
    for (const part of ['S1', 'M1', 'T1']) assert.ok(text.includes(part), `${part} was dropped`);
  });

  it('counts nothing for a request that carries no prompt, so no estimate is made up', () => {
    assert.equal(promptText({ model: 'm', max_tokens: 10, metadata: { trazum_label: 'x' } }), '');
  });

  it('does not count settings that are not sent to the model as text', () => {
    const text = promptText({ model: 'm', max_tokens: 10, temperature: 0.2, metadata: { user_id: MARK } });
    assert.ok(!text.includes(MARK), 'metadata was counted as prompt');
  });
});
