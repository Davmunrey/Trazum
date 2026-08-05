import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectFromSource, listModels } from '../dist/index.js';
import { detectHost } from '../dist/node.js';

/**
 * Working out where a prompt is actually sent.
 *
 * Trazum priced one vendor, so defaulting to Claude cost nothing. Pricing seven
 * made that default a wrong number: a file calling OpenAI was billed against
 * Claude Opus 5 and said so with a straight face.
 *
 * The risk here is the same shape as `extract.ts` — this feeds a CI gate, so a
 * confident wrong answer is worse than no answer. Hence: evidence on every
 * result, and a refusal when the file genuinely points two ways.
 */

const models = listModels();
const detect = (source) => detectFromSource(source, { models });

describe('what it reads', () => {
  it('takes the provider from an SDK import', () => {
    const d = detect("import OpenAI from 'openai';\nconst client = new OpenAI();");
    assert.equal(d.provider, 'openai');
    assert.equal(d.model, null, 'an import names the provider, never the model');
    assert.equal(d.evidence[0].kind, 'sdk-import');
    assert.equal(d.evidence[0].line, 1);
  });

  it('takes the model from a quoted model id, and prefers it to the import', () => {
    const d = detect(
      "import Anthropic from '@anthropic-ai/sdk';\nawait c.messages.create({ model: 'claude-sonnet-5' });",
    );
    assert.equal(d.provider, 'anthropic');
    assert.equal(d.model, 'claude-sonnet-5');
    assert.equal(d.evidence[0].kind, 'model-literal');
  });

  it('lets the author settle it on the marker', () => {
    // `model=` is the author stating the answer. An import they wrote for
    // another reason cannot contradict it.
    const d = detect("import OpenAI from 'openai';\n// trazum:prompt p model=kimi-k2\nconst P = `hi`;");
    assert.equal(d.provider, 'moonshot');
    assert.equal(d.model, 'kimi-k2');
    assert.equal(d.conflicts.length, 0);
  });

  it('reads a base URL, and lets it beat the SDK it was pointed at', () => {
    // The case that matters most, and the one the first version got wrong.
    // Moonshot, DeepSeek, xAI, Groq and Together all ship an OpenAI-compatible
    // endpoint, so their documented usage *is* the OpenAI SDK with a different
    // base_url. Calling that a contradiction refuses to price a perfectly
    // ordinary client — and pricing it as OpenAI would be a wrong number for a
    // large slice of everyone using this.
    const d = detect('import openai\nclient = openai.OpenAI(base_url="https://api.deepseek.com")');
    assert.equal(d.provider, 'deepseek');
    assert.equal(d.conflicts.length, 0);
    assert.equal(d.evidence[0].kind, 'base-url');
  });

  it('recognises the Python and JavaScript spellings of the same SDK', () => {
    for (const [source, provider] of [
      ["import Anthropic from '@anthropic-ai/sdk';", 'anthropic'],
      ['from anthropic import Anthropic', 'anthropic'],
      ["const OpenAI = require('openai');", 'openai'],
      ['import openai', 'openai'],
      ["import { GoogleGenAI } from '@google/genai';", 'google'],
      ['import google.generativeai as genai', 'google'],
      ["import { Mistral } from '@mistralai/mistralai';", 'mistral'],
    ]) {
      assert.equal(detect(source).provider, provider, `wrong provider for: ${source}`);
    }
  });
});

describe('what it refuses', () => {
  it('declines when two imports of equal weight disagree', () => {
    // Two answers is not a weaker version of one answer. Picking silently is
    // how somebody budgets against the wrong provider for a month.
    const d = detect("import OpenAI from 'openai';\nimport Anthropic from '@anthropic-ai/sdk';");
    assert.equal(d.provider, null);
    assert.equal(d.model, null);
    assert.ok(d.conflicts.length > 0);
    assert.ok(d.evidence.length >= 2, 'the evidence is still reported so it can be judged');
  });

  it('is not fooled by a model named in the prompt text', () => {
    // A prompt that talks about models is not a prompt sent to them. Without
    // the quoting check, documentation about pricing would price itself.
    const d = detect('// trazum:prompt\nconst P = `Compare gpt-5 with claude-opus-5 for the reader.`;');
    assert.equal(d.provider, null);
    assert.equal(d.evidence.length, 0);
  });

  it('finds nothing in a file that says nothing', () => {
    const d = detect("export const greeting = 'hello';\nexport function noop() {}");
    assert.deepEqual(d, { provider: null, model: null, evidence: [], conflicts: [] });
  });

  it('ignores a model id that is not in the catalogue it was given', () => {
    // The catalogue is the caller's, so an overlay that removes a model removes
    // it from detection too. Recognising an id nobody can price is not a result.
    const d = detectFromSource("const m = 'gpt-5';", { models: [] });
    assert.equal(d.provider, null);
  });
});

describe('every answer carries its evidence', () => {
  it('names the line, so a wrong answer is arguable rather than mysterious', () => {
    const source = ['// header', '// more', "import OpenAI from 'openai';"].join('\n');
    const d = detect(source);
    assert.equal(d.evidence[0].line, 3);
    assert.match(d.evidence[0].detail, /openai/);
  });

  it('orders the evidence strongest first', () => {
    const d = detect(
      "import OpenAI from 'openai';\nconst r = await c.create({ model: 'gpt-5-mini' });",
    );
    assert.equal(d.evidence[0].kind, 'model-literal');
    assert.equal(d.evidence[d.evidence.length - 1].kind, 'sdk-import');
  });
});

describe('it does not fall over on hostile input', () => {
  const BUDGET_MS = 5000;
  const cases = [
    ['huge file, no signal', 'const x = 1;\n'.repeat(60_000)],
    ['model id repeated', "'gpt-5' ".repeat(50_000)],
    ['quote storm', "'".repeat(200_000)],
    ['import storm', "import OpenAI from 'openai';\n".repeat(20_000)],
    ['marker storm', '// trazum:prompt model=gpt-5\n'.repeat(20_000)],
    ['url run', `https://${'api.deepseek.com/'.repeat(20_000)}`],
  ];

  for (const [name, source] of cases) {
    it(`survives ${name}`, () => {
      const started = Date.now();
      detect(source);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < BUDGET_MS, `took ${elapsed}ms on ${source.length} chars`);
    });
  }
});

describe('where Trazum itself is running', () => {
  it('recognises a host by the variable it sets', () => {
    for (const [env, id] of [
      [{ CLAUDECODE: '1' }, 'claude-code'],
      [{ CODEX_SANDBOX: 'seatbelt' }, 'codex'],
      [{ CURSOR_TRACE_ID: 'abc' }, 'cursor'],
      [{ GITHUB_ACTIONS: 'true' }, 'github-actions'],
      [{ CI: 'true' }, 'ci'],
      [{ TERM_PROGRAM: 'vscode' }, 'vscode'],
      [{}, 'terminal'],
    ]) {
      assert.equal(detectHost(env).id, id, `wrong host for ${JSON.stringify(env)}`);
    }
  });

  it('picks Cursor over VS Code, which it also looks like', () => {
    // Cursor is a VS Code fork and sets TERM_PROGRAM=vscode too. A VS Code row
    // above it in the table would swallow every Cursor session.
    assert.equal(detectHost({ CURSOR_TRACE_ID: 'x', TERM_PROGRAM: 'vscode' }).id, 'cursor');
  });

  it('says how the host bills, because that is what changes the report', () => {
    // The point of knowing. Inside a subscription the per-call saving is real
    // arithmetic about tokens and not money anybody gets back.
    assert.equal(detectHost({ CLAUDECODE: '1' }).billing, 'subscription');
    assert.equal(detectHost({ CURSOR_TRACE_ID: 'x' }).billing, 'subscription');
    assert.equal(detectHost({ GITHUB_ACTIONS: 'true' }).billing, 'per-token');
    // Not a guess either way: a VS Code terminal says nothing about whether the
    // prompts written in it go to a metered API or a flat plan.
    assert.equal(detectHost({ TERM_PROGRAM: 'vscode' }).billing, 'unknown');
  });

  it('always names the variable it decided on', () => {
    assert.equal(detectHost({ CLAUDECODE: '1' }).evidence, 'CLAUDECODE');
    assert.equal(detectHost({}).evidence, null);
  });
});
