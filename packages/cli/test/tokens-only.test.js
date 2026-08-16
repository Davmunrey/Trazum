import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The report with the money taken out.
 *
 * On a subscription there is no bill to reduce. Every figure Trazum normally
 * prints is arithmetic about tokens turned into dollars, and "$184/month" told
 * to somebody on a flat plan is wrong in the direction that matters most — it is
 * not a rounding error, it is money that does not exist.
 *
 * The invariant is blunt on purpose: **no dollar sign anywhere in the output**.
 * A softer test would have passed the first version, which suppressed the price
 * beside each advisory title and left "you would go from $843.00 to $337.20 per
 * month" in the sentence underneath.
 */
function run(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [CLI, 'optimize', ...args], {
    encoding: 'utf8',
    cwd,
    env: {
      ...SPAWN_ENV,
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

const PROMPT = `You are a support agent for Acme.

Please kindly note that you should always be brief.

${Array.from({ length: 40 }, (_, i) => `- Rule ${i + 1}: verify the order identifier first.`).join('\n')}

Customer message: {{message}}
`;

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'trazum-tokens-'));
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, 'p.txt'), PROMPT);
  return root;
}

describe('inside a subscription', () => {
  it('prints no money at all', async () => {
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.doesNotMatch(out, /\$/, `a dollar figure survived:\n${out}`);
  });

  it('says what the saving buys instead', async () => {
    // Tokens are the unit, and the context window is what they are worth here:
    // every token the system prompt holds is one the conversation cannot.
    const root = await project();
    const { out } = run(['p.txt', '-o', '/dev/null'], root, { CLAUDECODE: '1' });

    assert.match(out, /What this buys on Claude Code/);
    assert.match(out, /tokens back, every call/);
    /**
     * Either shape, because both say what the tokens bought. The share moves on a
     * prompt where the rules recover enough to shift a decimal, and where they do
     * not the honest line is that it did not move — which is what replaced the
     * `0.0% → 0.0%` this used to allow.
     */
    assert.match(out, /Context window: [\d.]+% → [\d.]+%|[\d.]+% of .*-token window, before and after/);
  });

  it('drops the advisories whose only pitch is money', async () => {
    // "Use a cheaper model" is not weaker advice on a flat plan — it is not
    // advice. Suppressing the price beside the title was not enough, because
    // the detail quotes dollars per month in prose.
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.doesNotMatch(out, /may not need/, 'the model-downgrade advisory survived');
    assert.doesNotMatch(out, /Batch API/, 'the batch advisory survived');
  });

  it('keeps the advisories that are not about money', async () => {
    // Caching still buys latency and rate-limit headroom, an overflowing
    // context window still fails the call, and a contradiction is still wrong.
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.match(out, /prompt caching/i);
  });

  it('still counts and still trims', async () => {
    // Hiding the money must not hide the work: the rules ran and the token
    // figures are the same ones the costed report would have used.
    const root = await project();
    const { out } = run(['p.txt', '-o', '/dev/null'], root, { CLAUDECODE: '1' });
    assert.match(out, /Input tokens/);
    assert.match(out, /Politeness formulas/);
  });
});

describe('the escape hatches', () => {
  it('--cost brings the money back inside a subscription', async () => {
    // The host says where *Trazum* runs, not where the prompt goes. Somebody
    // editing a production prompt inside Cursor wants the dollars, and should
    // not have to leave the editor to see them.
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '--cost', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.match(out, /Cost with Claude Opus 5/);
    assert.match(out, /\$/);
  });

  it('--tokens-only hides it where billing really is per token', async () => {
    const root = await project();
    const { out } = run(['p.txt', '--tokens-only', '-o', '/dev/null'], root, {
      GITHUB_ACTIONS: 'true',
    });
    assert.doesNotMatch(out, /\$/);
  });

  it('does not claim a metered host bills by subscription', async () => {
    // The first version said "GitHub Actions bills by subscription" when the
    // mode was forced with the flag, which is simply false.
    const root = await project();
    const { out } = run(['p.txt', '--tokens-only', '-o', '/dev/null'], root, {
      GITHUB_ACTIONS: 'true',
    });
    assert.doesNotMatch(out, /GitHub Actions bills by subscription/);
    assert.match(out, /because you asked for tokens only/);
  });

  it('--cost wins over --tokens-only, because the explicit price wins', async () => {
    const root = await project();
    const { out } = run(['p.txt', '--tokens-only', '--cost', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.match(out, /\$/);
  });
});

describe('a metered host is untouched', () => {
  it('prints the money as it always did', async () => {
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '-o', '/dev/null'], root, {
      GITHUB_ACTIONS: 'true',
    });
    assert.match(out, /Cost with/);
    assert.match(out, /saving \$/);
  });

  it('and so does a plain terminal, where billing is unknown', async () => {
    // `unknown` must not be treated as `subscription`. Guessing wrong here
    // would hide the product's main output from most of the people using it.
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '-o', '/dev/null'], root);
    assert.match(out, /Cost with/);
  });
});

describe('Spanish', () => {
  it('says it too, and with no dollars', async () => {
    const root = await project();
    const { out } = run(['p.txt', '--calls', '50000', '--locale', 'es', '-o', '/dev/null'], root, {
      CLAUDECODE: '1',
    });
    assert.match(out, /Qué ganas con esto en Claude Code/);
    // Either shape, as in the English case above: the share moves, or the line
    // says plainly that it did not.
    assert.match(out, /Ventana de contexto|de la ventana de .*, antes y después/);
    assert.doesNotMatch(out, /\$/);
  });
});
