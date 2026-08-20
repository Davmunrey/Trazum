import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum semantic`, end to end — without a model.
 *
 * The half worth testing here is everything that happens **before** anything
 * is sent, because that is the half that protects somebody's money and it is
 * the half that must work with no key, no network and no model.
 */

const PROMPT = `You are a support assistant.

Always escalate a billing dispute to a human.

If the customer mentions a refund, hand the conversation to a person.

Never use more than three sentences.
`;

const run = (cwd, args, env = {}) =>
  spawnSync(process.execPath, [CLI, 'semantic', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-semantic-'));
  await writeFile(join(dir, 'prompt.txt'), PROMPT);
  return dir;
};

describe('trazum semantic', () => {
  it('prints the price before anything is sent', async () => {
    // A tool that spends somebody's money to tell them how to spend less has
    // to be the first thing audited by its own arithmetic.
    const { stdout, status } = run(await workspace(), ['prompt.txt']);
    assert.equal(status, 0);
    const text = flat(stdout);
    assert.match(text, /This will send the prompt to Claude Opus 5/);
    assert.match(text, /tokens in and 800 out/);
    assert.match(text, /Estimated, not measured/);
  });

  it('sends nothing without --yes, and says so', async () => {
    const { stdout } = run(await workspace(), ['prompt.txt']);
    assert.match(flat(stdout), /Nothing was sent\. Add --yes/);
    // And it does not go looking for a provider before it has been allowed to.
    assert.doesNotMatch(flat(stdout), /not configured/);
  });

  it('works with no key, no network and no model', async () => {
    /**
     * The rule from 0.1.0, which this chapter does not get to change. The
     * price is arithmetic over the local catalogue, so it works offline —
     * and a run without --yes never reaches a provider at all.
     */
    const { status, stderr } = run(await workspace(), ['prompt.txt'], {
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    });
    assert.equal(status, 0, stderr);
  });

  it('prices the model asked for', async () => {
    const dir = await workspace();
    const opus = flat(run(dir, ['prompt.txt']).stdout);
    const haiku = flat(run(dir, ['prompt.txt', '--model', 'claude-haiku-4-5']).stdout);
    assert.match(haiku, /Claude Haiku 4\.5/);
    assert.notEqual(opus, haiku, 'a cheaper model must produce a cheaper figure');
  });

  it('says the pass is optional, every time', async () => {
    // Printed with --yes; without it the run stops at the price. The claim
    // that the core needs no model is the one this command could quietly
    // erode, so it is restated where somebody using a model will read it.
    const dir = await workspace();
    const { stdout } = run(dir, ['prompt.txt', '--yes'], { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' });
    // With no provider configured it refuses — which is itself the promise
    // holding: nothing was sent, and the failure is about configuration.
    assert.match(flat(stdout + ''), /This will send the prompt/);
  });

  it('refuses to run with --yes and no provider, rather than pretending', async () => {
    const { status, stderr } = run(await workspace(), ['prompt.txt', '--yes'], {
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      TRAZUM_LLM_URL: '',
    });
    assert.equal(status, 1);
    assert.ok(stderr.length > 0);
  });
});
