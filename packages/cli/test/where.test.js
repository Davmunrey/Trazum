import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum where` — which provider a prompt is actually sent to.
 *
 * `detect.test.js` covers the reading. These are about the answer being
 * *coherent*: the first version of this command detected `openai` and then
 * priced the file as Claude Opus 5 three lines further down, which is the wrong
 * number it exists to catch, produced by the command itself.
 */
function run(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [CLI, 'where', ...args], {
    encoding: 'utf8',
    cwd,
    env: {
      ...SPAWN_ENV,
      // Cleared so the host line is decided by this test rather than by
      // whatever is running it — the suite runs inside Claude Code.
      CLAUDECODE: '',
      CODEX_SANDBOX: '',
      CURSOR_TRACE_ID: '',
      GITHUB_ACTIONS: '',
      CI: '',
      TERM_PROGRAM: '',
      ...env,
    },
  });
  return { out: `${result.stdout}${result.stderr}`, code: result.status };
}

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-where-'));
  await mkdir(join(root, '.git'), { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(join(root, name), body);
  return root;
}

describe('the answer is coherent with itself', () => {
  it('does not price an OpenAI file as Claude', async () => {
    // The bug this command was written to find, found in this command.
    const root = await project({ 'app.ts': "import OpenAI from 'openai';\nconst c = new OpenAI();" });
    const { out } = run(['app.ts'], root);

    assert.match(out, /go to\s*\n\s*openai/);
    assert.doesNotMatch(out, /Priced as[\s\S]*Claude/, 'an OpenAI file was priced as Claude');
    assert.match(out, /GPT-5/);
  });

  it('uses the exact model when the code names one', async () => {
    const root = await project({
      'a.ts': "import Anthropic from '@anthropic-ai/sdk';\nc.messages.create({ model: 'claude-sonnet-5' });",
    });
    const { out } = run(['a.ts'], root);
    assert.match(out, /Claude Sonnet 5 \(read from the source\)/);
  });

  it('says the model is the provider’s, not the code’s, when only the provider was found', async () => {
    // A guess about which of their models is a different thing from a guess
    // about whose, and the reader has to be able to tell them apart.
    const root = await project({ 'a.py': 'import openai\nclient = openai.OpenAI()' });
    const { out } = run(['a.py'], root);
    assert.match(out, /nothing named a model, so this is theirs/);
  });
});

describe('what it reads and refuses', () => {
  it('lets a base URL beat the SDK it was pointed at', async () => {
    // DeepSeek, Moonshot, xAI and Groq are all called through the OpenAI SDK
    // with a different base_url. Pricing those as OpenAI would be wrong for a
    // large slice of everyone using this.
    const root = await project({
      'ds.py': 'import openai\nclient = openai.OpenAI(base_url="https://api.deepseek.com")',
    });
    const { out } = run(['ds.py'], root);
    assert.match(out, /go to\s*\n\s*deepseek/);

    /**
     * Not by name, and the reason is worth a line.
     *
     * This asserted `DeepSeek V3` while V3 was the only DeepSeek model in the
     * catalogue, so the test was pinned to *which* model happened to exist
     * rather than to the thing it is about, which is that a base URL beats the
     * SDK import. When V3 was refused by its provider and V4 arrived, the
     * assertion failed on a change that made the product more correct: a
     * DeepSeek call with no model named is now priced as a model somebody can
     * actually call.
     *
     * Bounded by the subject: any DeepSeek model, and the sentence saying the
     * provider was read from the source while the model was not.
     */
    assert.match(out, /Priced as\s*\n\s*DeepSeek /);
    assert.match(out, /deepseek was read from the source/);
    assert.doesNotMatch(out, /Claude|GPT|Gemini/, 'a DeepSeek call was priced as somebody else');
  });

  it('refuses when the file names two providers, and assumes nothing', async () => {
    const root = await project({
      'both.ts': "import OpenAI from 'openai';\nimport Anthropic from '@anthropic-ai/sdk';",
    });
    const { out } = run(['both.ts'], root);

    assert.match(out, /names more than one provider/);
    assert.match(out, /Nothing was assumed/);
    // Both are still named, so the reader can go and settle it.
    assert.match(out, /openai/);
    assert.match(out, /anthropic-ai\/sdk/);
  });

  it('names the line for every piece of evidence', async () => {
    const root = await project({ 'a.ts': "// header\n\nimport OpenAI from 'openai';" });
    const { out } = run(['a.ts'], root);
    assert.match(out, /line 3\s+sdk-import/);
  });

  it('says so plainly when the file gives nothing away', async () => {
    const root = await project({ 'plain.ts': 'export const greeting = `hello`;' });
    const { out } = run(['plain.ts'], root);
    assert.match(out, /Nothing in this file says which provider/);
    assert.match(out, /built-in default/);
  });
});

describe('config still beats what the code says', () => {
  it('prefers an explicit usage.model to the detection', async () => {
    // The layering the rest of the CLI uses: a flag beats config, config beats
    // detection, detection beats the default. Reading the code is better than
    // assuming and worse than being told.
    const root = await project({
      'a.ts': "import OpenAI from 'openai';",
      'trazum.config.json': JSON.stringify({ usage: { model: 'claude-haiku-4-5' } }),
    });
    const { out } = run(['a.ts'], root);
    assert.match(out, /Claude Haiku 4\.5 \(from trazum\.config\.json\)/);
    // The detection is still reported: the reader should see the disagreement.
    assert.match(out, /go to\s*\n\s*openai/);
  });
});

describe('where Trazum itself is running', () => {
  it('names the host and the variable that gave it away', async () => {
    const root = await project({});
    assert.match(run([], root, { CLAUDECODE: '1' }).out, /Claude Code \(CLAUDECODE\)/);
    assert.match(run([], root, { CODEX_SANDBOX: 'seatbelt' }).out, /Codex \(CODEX_SANDBOX\)/);
    assert.match(run([], root, { GITHUB_ACTIONS: 'true' }).out, /GitHub Actions/);
  });

  it('warns that a monthly saving is not money on a subscription', async () => {
    // The reason this half of the command exists. Quoting "$184/month" to
    // somebody inside a flat plan is wrong in the direction that matters most.
    const root = await project({});
    const { out } = run([], root, { CLAUDECODE: '1' });
    assert.match(out, /bills by subscription/);
    assert.match(out, /not money you get back/);
  });

  it('does not warn where the billing really is per token', async () => {
    const root = await project({});
    assert.doesNotMatch(run([], root, { GITHUB_ACTIONS: 'true' }).out, /subscription/);
  });

  it('says nothing either way in a plain terminal', async () => {
    // `unknown` is honest rather than lazy: a bare terminal says nothing about
    // whether the prompts written in it go to a metered API or a flat plan.
    const root = await project({});
    const { out } = run([], root);
    assert.match(out, /terminal/);
    assert.doesNotMatch(out, /subscription/);
  });

  it('says it in Spanish too', async () => {
    const root = await project({ 'a.ts': "import OpenAI from 'openai';" });
    const { out } = run(['a.ts', '--locale', 'es'], root, { CLAUDECODE: '1' });
    assert.match(out, /Ejecutándose dentro de/);
    assert.match(out, /cobra por suscripción/);
    assert.match(out, /Se cobra como/);
  });
});
