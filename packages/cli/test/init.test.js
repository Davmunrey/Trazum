import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/**
 * The first five minutes, end to end.
 *
 * `proposeInit` is tested in the core against observations handed to it. This
 * is the other half: that the CLI *looks* in the right places, that a
 * credential is named by its variable and never by its value, and that the
 * three ways this command can end — nothing to write, refused to overwrite,
 * written — are three different outputs rather than one silence.
 */

const run = (cwd, args = [], env = {}) =>
  spawnSync(process.execPath, [CLI, 'init', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

/** A workspace with `days` days of Opus traffic and one prompt file. */
const workspace = async ({ days = 30, log = true, source = null } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-init-'));
  await mkdir(join(dir, 'prompts'));
  await writeFile(join(dir, 'prompts', 'system.txt'), 'You are a helpful assistant.\n');
  if (source !== null) {
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'src', 'app.ts'), source);
  }
  if (log) {
    const lines = [];
    for (let d = 0; d < days; d += 1) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString();
      for (let i = 0; i < 8; i += 1) {
        lines.push(
          JSON.stringify({
            model: 'claude-opus-5',
            label: 'classify',
            timestamp: day,
            usage: { input_tokens: 30_000, output_tokens: 400 },
          }),
        );
      }
    }
    await writeFile(join(dir, 'usage.jsonl'), `${lines.join('\n')}\n`);
  }
  return dir;
};

describe('trazum init', () => {
  it('finds the log, writes what it can justify, and names the finding', async () => {
    const dir = await workspace();
    const result = run(dir, []);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage log found: usage\.jsonl/);
    assert.match(result.stdout, /Written to/);

    const written = JSON.parse(await readFile(join(dir, 'trazum.config.json'), 'utf8'));
    assert.equal(written.usage.model, 'claude-opus-5');
    assert.equal(written.usage.callsPerMonth, 240);
    // A budget is never among them, however much was measured.
    assert.equal(written.spend, undefined);
    assert.equal(written.usage.batchEligible, undefined);
  });

  it('shows the arithmetic before the figure', async () => {
    // A tool that opens with a dollar amount nobody can check gets closed.
    const { stdout } = run(await workspace(), ['--dry-run']);
    const calls = stdout.indexOf('240 calls labelled');
    const money = stdout.indexOf('Together: $');
    assert.ok(calls > 0 && money > calls, 'the calls and the model come before the saving');
  });

  it('writes nothing on --dry-run, and prints what it would have written', async () => {
    const dir = await workspace();
    const { stdout } = run(dir, ['--dry-run']);
    assert.match(stdout, /Would write/);
    await assert.rejects(readFile(join(dir, 'trazum.config.json'), 'utf8'));
  });

  it('refuses to replace a config already there, and says how to override', async () => {
    const dir = await workspace();
    await writeFile(join(dir, 'trazum.config.json'), '{"level":"safe"}\n');
    const { stdout } = run(dir, []);
    assert.match(stdout, /already exists and was left alone/);
    // Untouched, byte for byte.
    assert.equal(await readFile(join(dir, 'trazum.config.json'), 'utf8'), '{"level":"safe"}\n');
  });

  it('refuses to write over a config it could not parse, rather than replacing it', async () => {
    // The dangerous case: unparseable means `existing` is null, and an `init`
    // that reasoned only about `existing` would happily overwrite somebody's
    // broken-but-tuned config with three keys.
    const dir = await workspace();
    await writeFile(join(dir, 'trazum.config.json'), '{ this is not json\n');
    const { stdout } = run(dir, ['--yes']);
    assert.match(stdout, /could not be parsed/);
    assert.equal(await readFile(join(dir, 'trazum.config.json'), 'utf8'), '{ this is not json\n');
  });

  it('says there is no usage rather than printing an empty report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-init-'));
    const { stdout, status } = run(dir, []);
    assert.equal(status, 0);
    assert.match(stdout, /No usage found/);
    assert.match(stdout, /nothing has been measured/i);
    assert.match(stdout, /No config written/);
  });

  it('refuses a monthly rate from a short window, and says how short', async () => {
    const { stdout } = run(await workspace({ days: 4 }), ['--dry-run']);
    assert.match(stdout, /4 days measured; 28 are needed/);
  });

  it('takes a model from the source when there is no log at all', async () => {
    const dir = await workspace({
      log: false,
      source: "import Anthropic from '@anthropic-ai/sdk';\nconst m = 'claude-haiku-4-5';\n",
    });
    const { stdout } = run(dir, ['--dry-run']);
    assert.match(stdout, /src\/app\.ts:2 names claude-haiku-4-5/);
  });

  it('names a credential by its variable and never prints the value', async () => {
    // The rule that has held since the connector shipped in 1.41. A first-run
    // summary is the single most likely output in this product to be pasted
    // into a chat window.
    const secret = 'sk-ant-admin-thisisnotarealkey0000000000';
    const { stdout } = run(await workspace({ log: false }), [], {
      TRAZUM_ANTHROPIC_ADMIN_KEY: secret,
    });
    assert.match(stdout, /TRAZUM_ANTHROPIC_ADMIN_KEY/);
    assert.ok(!stdout.includes(secret), 'the key itself must never reach the terminal');
  });
});

describe('trazum init --json', () => {
  const emitted = async () => {
    const result = run(await workspace(), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };

  /** Bounded to its own section, like every other contract harvest here. */
  const documented = async () => {
    const doc = await readFile(DOC, 'utf8');
    const start = doc.indexOf('## The first-run document');
    return new Set(
      [...doc.slice(start).matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map((match) => match[1]),
    );
  };

  it('documents every field it emits', async () => {
    const keys = Object.keys(await emitted());
    const promised = await documented();
    assert.deepEqual(
      keys.filter((key) => !promised.has(key)),
      [],
      'fields emitted with no line in docs/json-output.md',
    );
  });

  it('emits every field it documents', async () => {
    const keys = new Set(Object.keys(await emitted()));
    assert.deepEqual(
      [...(await documented())].filter((key) => !keys.has(key)),
      [],
      'fields promised by docs/json-output.md and not emitted',
    );
  });

  it('writes nothing when asked for the document', async () => {
    // `--json` is a read. A command that emits a report *and* mutates the
    // working directory cannot be run from a script that only wanted to look.
    const dir = await workspace();
    run(dir, ['--json']);
    await assert.rejects(readFile(join(dir, 'trazum.config.json'), 'utf8'));
  });
});
