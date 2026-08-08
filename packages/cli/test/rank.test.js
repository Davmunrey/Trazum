import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum rank <dir>` — which of these prompts to fix first.
 *
 * The design question this command had to answer was whether to invent a
 * complexity score. It does not: it sorts on what the deterministic rules
 * would actually recover, obtained by running them, and prints the structural
 * measurements beside it as the explanation. These tests hold that line as much
 * as they check the output.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, 'rank', ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '', CLAUDECODE: '' },
  });
  return { out: `${result.stdout}${result.stderr}`, stdout: result.stdout, code: result.status };
}

const PADDED = `You are an expert customer support assistant.

Please, in order to be able to help the user, I basically need you to kindly analyse the query that arrives in {{query}} and, if you don't mind, classify it into one of the categories that are available.

It is important to note that you should always make sure to be very careful when classifying.

Please double-check your answer before responding. Thank you very much!
`;

const DENSE = `Classify {{query}}.

Categories: billing, technical, account.
Answer in English.
Return JSON.
`;

const CODE_HEAVY = `Use this function as-is for {{input}}:

\`\`\`python
def classify(text):
    features = extract(text)
    weights = load_weights("model.bin")
    scores = [dot(features, w) for w in weights]
    return argmax(scores)
\`\`\`

Return the category name.
`;

const EXAMPLES = `Classify the message.

Example 1:
Input: My card was declined.
Output: billing

Example 2:
Input: The app crashes on launch.
Output: technical

Example 3:
Input: I want to change my email.
Output: account

Now classify: {{query}}
`;

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-rank-'));
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    if (name.includes('/')) await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body);
  }
  return root;
}

describe('it ranks by what optimising would recover', () => {
  it('puts the padded prompt first and the dense one last', async () => {
    const root = await project({
      'dense.txt': DENSE,
      'padded.txt': PADDED,
      'examples.txt': EXAMPLES,
    });
    const { stdout, code } = run(['.', '--calls', '50000', '--json'], root);

    assert.equal(code, 0);
    const report = JSON.parse(stdout);
    assert.equal(report.prompts[0].path, 'padded.txt');
    assert.ok(
      report.prompts[0].recoverableTokens > report.prompts[1].recoverableTokens,
      'the ranking is not ordered by what is recoverable',
    );
  });

  it('reports the tokens beside the money, so noise reads as noise', async () => {
    // Four prompts once showed "$0.25" and looked like four equivalent jobs.
    // Three of them recovered a single token, which is twenty-five cents at
    // 50,000 calls and no work worth doing. Rather than invent a cutoff, the
    // count sits next to the figure: "1" is self-evidently nothing.
    const root = await project({ 'dense.txt': DENSE, 'padded.txt': PADDED });
    const { out } = run(['.', '--calls', '50000'], root);

    const rows = out.split('\n').filter((line) => /\.txt/.test(line));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.match(row, /\$[\d.,]+\s+\d+\s+\d+/, `no token count beside the money: ${row}`);
    }
  });

  it('explains a position rather than leaving it asserted', async () => {
    const root = await project({ 'examples.txt': EXAMPLES, 'code.txt': CODE_HEAVY });
    const { out } = run(['.', '--calls', '50000'], root);

    assert.match(out, /examples/, 'the few-shot block is not mentioned');
    assert.match(out, /cannot be trimmed/, 'the protected share is not mentioned');
  });

  it('says what it priced against, since the order depends on it', async () => {
    const root = await project({ 'padded.txt': PADDED });
    const { out } = run(['.', '--calls', '50000', '--model', 'claude-haiku-4-5'], root);
    assert.match(out, /Claude Haiku 4\.5/);
    assert.match(out, /50,000 calls/);
  });

  it('says the numbers come from running the rules, not a formula', async () => {
    const root = await project({ 'padded.txt': PADDED });
    assert.match(run(['.'], root).out, /not by a formula/);
  });
});

describe('it prints no score', () => {
  it('offers nothing a reader could cite as a grade', async () => {
    // A number out of a hundred cannot be argued with and cannot be reproduced
    // by hand. If one ever appears, it should have to argue with this.
    const root = await project({ 'padded.txt': PADDED, 'dense.txt': DENSE });
    const { stdout } = run(['.', '--json'], root);
    const report = JSON.parse(stdout);

    for (const prompt of report.prompts) {
      for (const key of Object.keys(prompt)) {
        assert.equal(
          /score|rating|grade|complexity/i.test(key),
          false,
          `the ranking grew a "${key}" field`,
        );
      }
    }
  });
});

describe('what it measures, and what it skips', () => {
  it('ranks the marked prompt in a source file, not the file', async () => {
    // Ranking src/prompts.ts by the size of its imports would put the wrong
    // file at the top of a list whose entire job is to point somewhere.
    const source =
      "import OpenAI from 'openai';\nimport { z } from 'zod';\n" +
      'const schema = z.object({ a: z.string(), b: z.number() });\n\n' +
      '// trazum:prompt support\nexport const S = `Please kindly be brief.`;\n';
    const root = await project({ 'a.ts': source, 'padded.txt': PADDED });
    const { stdout } = run(['.', '--json'], root);
    const report = JSON.parse(stdout);

    const entry = report.prompts.find((p) => p.path === 'a.ts');
    assert.ok(entry, 'the source file was dropped entirely');
    assert.ok(entry.tokens < 20, `counted ${entry.tokens} tokens — the imports are included`);
  });

  it('skips a source file with no marker instead of ranking its code', async () => {
    const root = await project({
      'plain.ts': "import OpenAI from 'openai';\nexport const x = 1;\n",
      'padded.txt': PADDED,
    });
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    assert.equal(report.prompts.some((p) => p.path === 'plain.ts'), false);
    assert.equal(report.prompts.length, 1);
    // And it says so. A repository where most prompts live in code would
    // otherwise show a short list and look complete.
    assert.equal(report.skippedSourceFiles, 1);
  });

  it('refuses an empty directory rather than printing an empty table', async () => {
    const root = await project({});
    const { out, code } = run(['.'], root);
    assert.notEqual(code, 0);
    assert.match(out, /No prompt files under/);
  });

  it('defaults to the current directory', async () => {
    const root = await project({ 'padded.txt': PADDED });
    assert.equal(run([], root).code, 0);
  });
});

describe('rank --markdown-out', () => {
  /**
   * The flag existed on `check` and `diff` and not here, which meant the one
   * command that answers "which of these forty prompts is worth an afternoon"
   * could not put its answer where the afternoon gets decided.
   */
  it('writes a table a pull request can render', async () => {
    const root = await project({ 'padded.txt': PADDED, 'dense.txt': DENSE });
    const out = join(root, 'report.md');
    assert.equal(run(['.', '--markdown-out', out], root).code, 0);

    const md = await readFile(out, 'utf8');
    assert.match(md, /^### Trazum — what to fix first/m);
    assert.match(md, /\| Recover \| Tokens \|/);
    assert.match(md, /padded\.txt/);
    // The claim the terminal report makes, carried over rather than dropped.
    assert.match(md, /There is no score/);
  });

  it('writes it even with --json, because the file is a separate destination', async () => {
    // Matches `check`: the report's whole job is to survive the run, and one
    // that only appears when the output format happened to be human is not that.
    const root = await project({ 'padded.txt': PADDED });
    const out = join(root, 'report.md');
    const result = run(['.', '--json', '--markdown-out', out], root);

    assert.equal(result.code, 0);
    JSON.parse(result.stdout);
    assert.match(await readFile(out, 'utf8'), /Trazum/);
  });

  it('does not fail the run when the file cannot be written', async () => {
    // A full disk on a CI runner must not turn a working command into a broken
    // one. The path below is inside a file, so the write cannot succeed.
    const root = await project({ 'padded.txt': PADDED });
    const result = run(['.', '--markdown-out', join(root, 'padded.txt', 'nope.md')], root);

    assert.equal(result.code, 0);
    assert.match(result.out, /Could not write/);
  });
});
