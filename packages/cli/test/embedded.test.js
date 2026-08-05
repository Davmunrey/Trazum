import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `check` over prompts embedded in source files.
 *
 * `extract.test.js` covers what the extractor reads and refuses. These are about
 * the seam: whether a marked prompt is budgeted as a prompt rather than as the
 * file around it, whether an unmarked source file stays out of the way, and
 * whether a marker Trazum could not read fails the build instead of quietly
 * dropping out of the count.
 *
 * That last one is the whole reason this is a gate: the author marked a prompt to
 * have it governed, and "not governed" must never come back green.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '' },
  });
  return { out: `${result.stdout}${result.stderr}`, stdout: result.stdout, code: result.status };
}

const SOURCE = `import { client } from './client';

// trazum:prompt support-system
export const SUPPORT = \`You are a support agent for Acme.

Please kindly note that you should always answer in the customer's language.

Customer message: \${message}\`;

// trazum:prompt classifier
export const CLASSIFY = \`Classify the message into: payment, delivery, returns.

Message: \${text}\`;
`;

const UNMARKED = `export const greeting = \`hello world\`;
export function noop() { return null; }
`;

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-embedded-'));
  await mkdir(join(root, '.git'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, body);
  }
  return root;
}

describe('check on a source file', () => {
  it('budgets each marked prompt, not the file around them', async () => {
    // Summing them would fail a build because somebody added a fifth short
    // prompt, and would count the imports and the export keywords as tokens
    // the model will never see.
    const root = await project({ 'prompts.ts': SOURCE });
    const { out } = run(['check', 'prompts.ts', '--max-tokens', '40'], root);

    assert.match(out, /2 marked prompts/);
    assert.match(out, /prompts\.ts#support-system/);
    assert.match(out, /prompts\.ts#classifier/);
    assert.doesNotMatch(out, /import \{ client \}/, 'the surrounding code was measured');
  });

  it('fails only the prompt that busts the budget', async () => {
    const root = await project({ 'prompts.ts': SOURCE });
    const { out, code } = run(['check', 'prompts.ts', '--max-tokens', '40'], root);

    assert.equal(code, 1);
    assert.match(out, /FAILED prompts\.ts#support-system/);
    assert.match(out, /OK prompts\.ts#classifier/);
  });

  it('passes when every marked prompt fits', async () => {
    const root = await project({ 'prompts.ts': SOURCE });
    const { code } = run(['check', 'prompts.ts', '--max-tokens', '500'], root);
    assert.equal(code, 0);
  });

  it('fails the build on a marker it could not read', async () => {
    // The author asked for this prompt to be governed. It is not being
    // governed, and a green build saying otherwise is the same lie as
    // "0 failures" from a run that measured nothing.
    const root = await project({
      'prompts.ts': `// trazum:prompt assembled\nconst P = \`You are \${role}.\` + rules.join('\\n');\n`,
    });
    const { out, code } = run(['check', 'prompts.ts', '--max-tokens', '5000'], root);

    assert.equal(code, 1, 'an unreadable marker came back green');
    assert.match(out, /could not be read/);
    assert.match(out, /built by concatenation/);
    assert.match(out, /line 1/);
  });

  it('treats a source file with no marker as an ordinary file', async () => {
    // Not as an empty extraction. Somebody checking a single .ts file by name
    // asked about that file, and answering "0 prompts" would be a shrug.
    const root = await project({ 'util.ts': UNMARKED });
    const { out } = run(['check', 'util.ts', '--max-tokens', '500'], root);
    assert.doesNotMatch(out, /marked prompts/);
    assert.match(out, /OK/);
  });

  it('reports the whole decision in --json', async () => {
    const root = await project({ 'prompts.ts': SOURCE });
    const { stdout } = run(['check', 'prompts.ts', '--max-tokens', '40', '--json'], root);
    const report = JSON.parse(stdout);

    assert.equal(report.embedded, true);
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.prompts.map((p) => p.id),
      ['prompts.ts#support-system', 'prompts.ts#classifier'],
    );
    assert.equal(report.declined.length, 0);
  });
});

describe('check over a directory', () => {
  it('finds embedded prompts without being told to look', async () => {
    // Requiring config to discover a marker somebody just wrote is how `eval`
    // came to be fully implemented and completely undiscoverable.
    const root = await project({ 'src/prompts.ts': SOURCE });
    const { out } = run(['check', '.', '--max-tokens', '500'], root);
    assert.match(out, /src\/prompts\.ts#support-system/);
  });

  it('skips unmarked source files silently rather than listing them unbudgeted', async () => {
    // An unbudgeted listing is for a prompt file nobody covered. A .ts file with
    // no marker was never something to govern, and listing it would bury the
    // files that are.
    const root = await project({ 'src/prompts.ts': SOURCE, 'src/util.ts': UNMARKED });
    const { out } = run(['check', '.', '--max-tokens', '500'], root);

    assert.doesNotMatch(out, /util\.ts/, 'an unmarked source file was reported');
    assert.match(out, /prompts\.ts#classifier/);
  });

  it('reports embedded and standalone prompts side by side', async () => {
    const root = await project({
      'src/prompts.ts': SOURCE,
      'prompts/system.txt': 'You are a helpful assistant. Be brief and accurate.\n',
    });
    const { out } = run(['check', '.', '--max-tokens', '500'], root);

    assert.match(out, /prompts\/system\.txt/);
    assert.match(out, /src\/prompts\.ts#support-system/);
  });

  it('fails the directory run on an unreadable marker', async () => {
    const root = await project({
      'src/ok.ts': SOURCE,
      'src/broken.ts': `// trazum:prompt\nconst P = \`Hi \${x}.\` + more;\n`,
    });
    const { out, code } = run(['check', '.', '--max-tokens', '500'], root);

    assert.equal(code, 1);
    assert.match(out, /src\/broken\.ts line 1/);
  });

  it('lets a config budget target one embedded prompt by name', async () => {
    // The id is path-prefixed on purpose, so the existing glob patterns cover
    // embedded prompts without the config learning a new syntax.
    const root = await project({
      'src/prompts.ts': SOURCE,
      'trazum.config.json': JSON.stringify({
        budgets: { 'src/**': 500, 'src/prompts.ts#support-system': 10 },
      }),
    });
    const { out, code } = run(['check', '.'], root);

    assert.equal(code, 1);
    assert.match(out, /FAILED\s+\d+ \/ 10\s+src\/prompts\.ts#support-system/);
    assert.match(out, /OK\s+\d+ \/ 500\s+src\/prompts\.ts#classifier/);
  });

  it('says it in Spanish too', async () => {
    const root = await project({
      'src/broken.ts': `// trazum:prompt\nconst P = \`Hola \${x}.\` + mas;\n`,
      'src/ok.ts': SOURCE,
    });
    const { out } = run(['check', '.', '--max-tokens', '500', '--locale', 'es'], root);
    assert.match(out, /No se ha podido leer 1 marcador/);
    assert.match(out, /línea 1/);
  });
});
