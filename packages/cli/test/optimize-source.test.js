import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `optimize` pointed at a source file.
 *
 * This existed before and was the worst behaviour in the repository. Handed
 * `src/prompts.ts` it optimised the **whole file** — imports and all — counted
 * the code as tokens the model would pay for, priced it against Claude Opus 5
 * on a file that plainly imports `openai`, and rewrote the source: the
 * capitalisation rule turned `import OpenAI` into `Import OpenAI`, which does
 * not compile. With `-o` that went back over the file.
 *
 * Every test here is about not doing that again.
 */
function run(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [CLI, 'optimize', ...args], {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      NO_COLOR: '1',
      LANG: '',
      LC_ALL: '',
      TRAZUM_LOCALE: '',
      CLAUDECODE: '',
      ...env,
    },
  });
  return { out: `${result.stdout}${result.stderr}`, code: result.status };
}

const MARKED = `import OpenAI from 'openai';
const client = new OpenAI();

// trazum:prompt support
export const SUPPORT = \`You are a support agent for Acme.

Please kindly note that you should always answer in the customer's language.

Customer message: \${message}\`;
`;

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-optsrc-'));
  await mkdir(join(root, '.git'), { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(join(root, name), body);
  return root;
}

describe('it optimises the prompt, not the file around it', () => {
  it('never writes source code to the output', async () => {
    // The bug in one assertion. `-o` used to receive the whole TypeScript file
    // with `Import OpenAI` at the top of it.
    const root = await project({ 'a.ts': MARKED });
    run(['a.ts', '--cost', '-o', 'out.txt'], root);

    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.doesNotMatch(written, /import/i, 'source code reached the output file');
    assert.doesNotMatch(written, /const client/);
    assert.match(written, /^You are a support agent/);
  });

  it('counts the prompt, not the imports', async () => {
    const root = await project({ 'a.ts': MARKED });
    const { out } = run(['a.ts', '-o', '/dev/null'], root);

    const tokens = Number(/Input tokens\s*\n\s*(\d+)/.exec(out)?.[1]);
    assert.ok(tokens > 0 && tokens < 60, `counted ${tokens} tokens — the code is still included`);
  });

  it('prices against the provider the file actually calls', async () => {
    // An import names who, never which, so the provider's stand-in is used and
    // `trazum where` explains the choice. What must not happen is Claude.
    const root = await project({ 'a.ts': MARKED });
    const { out } = run(['a.ts', '--cost', '-o', '/dev/null'], root);

    assert.match(out, /Cost with GPT-5/);
    assert.doesNotMatch(out, /Cost with Claude/, 'an OpenAI file was priced against Claude');
  });

  it('lets an explicit --model win, as everywhere else', async () => {
    // Flags beat config beats detection beats the default. Reading the code is
    // better than assuming and worse than being told.
    const root = await project({ 'a.ts': MARKED });
    const { out } = run(['a.ts', '--model', 'claude-haiku-4-5', '--cost', '-o', '/dev/null'], root);
    assert.match(out, /Cost with Claude Haiku 4\.5/);
  });

  it('lets config beat detection too', async () => {
    const root = await project({
      'a.ts': MARKED,
      'trazum.config.json': JSON.stringify({ usage: { model: 'gemini-2.5-flash' } }),
    });
    const { out } = run(['a.ts', '--cost', '-o', '/dev/null'], root);
    assert.match(out, /Cost with Gemini 2\.5 Flash/);
  });
});

describe('it refuses rather than guessing', () => {
  it('will not optimise a source file with no marker', async () => {
    // Optimising TypeScript as prose does not produce a worse prompt, it
    // produces broken code. A refusal costs the reader one comment.
    const root = await project({
      'plain.ts': "import OpenAI from 'openai';\nexport const greeting = `hello world`;\n",
    });
    const { out, code } = run(['plain.ts', '-o', 'out.txt'], root);

    assert.notEqual(code, 0);
    assert.match(out, /looks like source, not a prompt/);
    assert.match(out, /would rewrite your code/);
    assert.match(out, /trazum:prompt/, 'the refusal does not say how to fix it');
  });

  it('asks which one when a file holds several', async () => {
    // Optimising "the first one" silently is how the wrong prompt gets
    // rewritten.
    const root = await project({
      'two.ts': '// trazum:prompt alpha\nconst A = `Please be brief.`;\n' +
        '// trazum:prompt beta\nconst B = `Kindly answer in English.`;\n',
    });
    const { out, code } = run(['two.ts', '-o', '/dev/null'], root);

    assert.notEqual(code, 0);
    assert.match(out, /holds 2 marked prompts/);
    assert.match(out, /two\.ts#alpha/);
    assert.match(out, /two\.ts#beta/);
  });

  it('takes the one named with --prompt', async () => {
    const root = await project({
      'two.ts': '// trazum:prompt alpha\nconst A = `Please be brief.`;\n' +
        '// trazum:prompt beta\nconst B = `Kindly answer in English.`;\n',
    });
    const { code } = run(['two.ts', '--prompt', 'beta', '-o', 'out.txt'], root);

    assert.equal(code, 0);
    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.match(written, /Answer in English/);
    assert.doesNotMatch(written, /brief/);
  });

  it('says so when the name does not exist, and lists what does', async () => {
    const root = await project({ 'a.ts': MARKED });
    const { out, code } = run(['a.ts', '--prompt', 'nope', '-o', '/dev/null'], root);

    assert.notEqual(code, 0);
    assert.match(out, /no marked prompt called "nope"/);
    assert.match(out, /a\.ts#support/);
  });

  it('names the line when a marker cannot be read', async () => {
    const root = await project({
      'bad.ts': '// trazum:prompt\nconst P = `You are ${role}.` + rules.join("\\n");\n',
    });
    const { out, code } = run(['bad.ts', '-o', '/dev/null'], root);

    assert.notEqual(code, 0);
    assert.match(out, /line 1/);
    assert.match(out, /concatenation/);
  });
});

describe('a prompt file is untouched by any of this', () => {
  it('goes through exactly as before', async () => {
    const root = await project({ 'p.txt': 'Please kindly be brief.\n\nInput: {{x}}\n' });
    const { out, code } = run(['p.txt', '--cost', '-o', 'out.txt'], root);

    assert.equal(code, 0);
    assert.match(out, /Cost with Claude Opus 5/, 'the default model moved for a plain prompt');
    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.match(written, /Input: \{\{x\}\}/);
  });

  it('and so does stdin', async () => {
    const root = await project({});
    const result = spawnSync(process.execPath, [CLI, 'optimize', '-'], {
      encoding: 'utf8',
      cwd: root,
      input: 'Please kindly be brief.',
      env: { ...process.env, NO_COLOR: '1', TRAZUM_LOCALE: '', CLAUDECODE: '' },
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Be brief\./);
  });
});
