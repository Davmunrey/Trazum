import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { LOCALES } from '../../core/dist/index.js';

/**
 * `trazum write` on a terminal, run rather than read.
 *
 * Two ways in and one document out: an ordered list of answers on stdin, or a
 * JSON object through `--answers`. What the tests hold is the split between
 * the streams and the three states — answered, declined, and input that simply
 * ran out, which is **not** a decline.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const ANSWERS = {
  role: 'A support engineer at a payments company.',
  task: 'Summarise a support ticket for the next agent.',
  inputs: 'The ticket body, its history, and the customer tier.',
  'output-shape': 'json',
  'output-schema': 'id, summary, severity, nextStep, all always present',
  constraints: 'Never invent a ticket id or a severity that is not in the input.',
  refusal: 'say so and name the field that is missing',
  audience: null,
  examples: null,
  'failure-modes': null,
  model: 'claude-opus-5',
  budget: '20',
};

const run = (args, input = '') =>
  spawnSync(process.execPath, [CLI, 'write', ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    input,
    timeout: 30000,
  });

const withAnswers = async (answers) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-write-'));
  const path = join(dir, 'answers.json');
  await writeFile(path, JSON.stringify(answers));
  return { dir, path };
};

describe('trazum write', () => {
  it('puts the prompt on stdout and everything else on stderr', async () => {
    const { path } = await withAnswers(ANSWERS);
    const result = run(['--answers', path, '--calls', '1000']);
    assert.equal(result.status, 0, result.stderr);
    // `trazum write --answers a.json > prompt.txt` has to be a file with a
    // prompt in it, not a file with an interview in it.
    assert.ok(result.stdout.startsWith('Role\n'), result.stdout.slice(0, 80));
    assert.ok(!result.stdout.includes('tokens'));
    assert.ok(result.stderr.includes('tokens'));
    assert.ok(result.stderr.includes('per month'));
  });

  it('writes the prompt to a file with -o and keeps stdout clean', async () => {
    const { dir, path } = await withAnswers(ANSWERS);
    const out = join(dir, 'prompt.txt');
    const result = run(['--answers', path, '-o', out]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.ok((await readFile(out, 'utf8')).startsWith('Role\n'));
  });

  it('refuses with the missing slots named, and what each unlocks', async () => {
    const { path } = await withAnswers({ role: 'A support engineer.' });
    const result = run(['--answers', path]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '', 'a refusal must not put half a prompt on stdout');
    for (const slot of ['task', 'inputs', 'output-shape']) {
      assert.ok(result.stderr.includes(slot), `${slot} is not named`);
    }
    // A refusal never arrives bare: the reason travels with the name.
    assert.ok(result.stderr.includes('without it there is nothing to write'));
  });

  it('names the nearest slot when one is misspelled', async () => {
    const { path } = await withAnswers({ rol: 'A support engineer.' });
    const result = run(['--answers', path]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /"rol" is not a slot.*"role"/s);
  });

  it('emits the contract with --json, and exits 1 when there is no prompt', async () => {
    const { path } = await withAnswers(ANSWERS);
    const ok = run(['--answers', path, '--json']);
    assert.equal(ok.status, 0, ok.stderr);
    const draft = JSON.parse(ok.stdout);
    assert.equal(draft.schemaVersion, 1);
    assert.ok(draft.prompt.startsWith('Role\n'));
    assert.deepEqual(draft.declined, ['audience', 'examples', 'failure-modes']);
    assert.equal(draft.measured.cheap.verdict, 'within');

    const { path: short } = await withAnswers({ role: 'r' });
    const refused = run(['--answers', short, '--json']);
    assert.equal(refused.status, 1);
    // Still a document, and still readable — the refusal is data too.
    assert.equal(JSON.parse(refused.stdout).prompt, null);
  });
});

describe('the interview on stdin', () => {
  it('takes an ordered list of answers, and an empty line as a decline', () => {
    const result = run([], 'Summarise a ticket.\nA support engineer.\nThe ticket body.\nprose\n\n\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('Task\nSummarise a ticket.'));
    // Declining `audience` leaves it out of the Role section entirely.
    assert.ok(!result.stdout.includes('Audience:'));
    assert.ok(result.stderr.includes('Declined'));
  });

  it('treats input running out as unanswered, never as declined', () => {
    /**
     * The defect this was written for: `readline` on a piped stream closes
     * when the buffer drains, and a question asked after that never settles.
     * The process left with **status 0 and nothing printed** — an interview
     * that stopped halfway and reported success.
     */
    const result = run([], 'Summarise a ticket.\n');
    assert.equal(result.status, 1, 'input running out reported success');
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('role'));
    assert.ok(!result.stderr.includes('Declined'), 'a truncated interview is not a set of declines');
  });

  it('asks every question in the locale it was given', () => {
    const seen = LOCALES.map((locale) => {
      const result = spawnSync(process.execPath, [CLI, 'write'], {
        encoding: 'utf8',
        env: { ...SPAWN_ENV, TRAZUM_LOCALE: locale },
        input: 'Summarise a ticket.\n',
        timeout: 30000,
      });
      return result.stderr;
    });
    assert.ok(seen.every((text) => text.length > 0));
    // Different words in different locales, or it is one locale twice.
    assert.equal(new Set(seen).size, seen.length, 'two locales asked in identical words');
  });

  it('assembles the same prompt in every locale', () => {
    const prompts = LOCALES.map(
      (locale) =>
        spawnSync(process.execPath, [CLI, 'write'], {
          encoding: 'utf8',
          env: { ...SPAWN_ENV, TRAZUM_LOCALE: locale },
          input: 'Summarise a ticket.\nA support engineer.\nThe ticket body.\nprose\n\n\n\n\n\n\n\n\n',
          timeout: 30000,
        }).stdout,
    );
    assert.equal(new Set(prompts).size, 1, 'a locale changed the prompt, not just the report');
    assert.ok(prompts[0].includes('Role'));
  });
});
