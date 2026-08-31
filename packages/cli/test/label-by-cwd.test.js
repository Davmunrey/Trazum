import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum from-claude-code --label-by-cwd`: two projects in one session, told
 * apart at the source.
 *
 * `--label-from-project` labels by the transcript's own folder, which is right
 * when one folder is one project and useless when it is not. A person who
 * moved between two repositories without starting a new session has one
 * transcript, one folder, and no field in it that says which work was which.
 *
 * It has a `cwd`, per line, and this converter has never emitted one. Reading
 * it to **choose** a label the operator wrote is a different act from emitting
 * it, and the last test here is the one that keeps the two apart.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

const SECRET_PATH = '/home/somebody/very-private-client-work';

const assistant = (cwd, requestId) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-10T10:00:00.000Z',
    sessionId: 'sess-1',
    requestId,
    cwd,
    gitBranch: 'feature/unreleased',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'something the user said' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    },
  });

const bench = (cwds, rules) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-cwd-'));
  const transcript = join(dir, 'session.jsonl');
  const rulesFile = join(dir, 'rules.json');
  writeFileSync(transcript, cwds.map((cwd, at) => assistant(cwd, `req-${at}`)).join('\n') + '\n');
  writeFileSync(rulesFile, typeof rules === 'string' ? rules : JSON.stringify(rules));
  return { dir, transcript, rulesFile };
};

const labelsOf = (stdout) =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).label);

describe('one session, two projects, split by working directory', () => {
  it('gives each line the label its directory selects', () => {
    const b = bench(
      ['/work/trazum/packages/core', '/work/trazum-pro/src'],
      [
        { prefix: '/work/trazum', label: 'trazum' },
        { prefix: '/work/trazum-pro', label: 'trazum-pro' },
      ],
    );
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(labelsOf(out.stdout), ['trazum', 'trazum-pro']);
    /* Said on stderr, because a run whose labels changed and said nothing is a
       run somebody reconciles against the wrong bill. */
    assert.match(out.stderr, /Labelled by working directory, 2 rule\(s\)/);
  });

  it('leaves a directory no rule covers unattributed, rather than guessing', () => {
    /* A guessed label puts one project's money on another's bill, in the one
       direction nobody checks. `projectLabelFor` refuses to decode a folder
       name for the same reason. */
    const b = bench(['/somewhere/else'], [{ prefix: '/work/trazum', label: 'trazum' }]);
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(labelsOf(out.stdout), [undefined]);
  });

  it('and takes --label as the fallback for everything outside the rules', () => {
    const b = bench(
      ['/work/trazum/src', '/somewhere/else'],
      [{ prefix: '/work/trazum', label: 'trazum' }],
    );
    const out = run([
      'from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile, '--label', 'other',
    ]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(labelsOf(out.stdout), ['trazum', 'other']);
  });

  it('refuses a rules file that is not a list of rules', () => {
    const b = bench(['/work/trazum'], '{"prefix": "/work/trazum", "label": "trazum"}');
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /JSON file holding a list/);
  });

  it('refuses one bad entry by name, rather than skipping it', () => {
    /*
      The failure a skip would produce is silent and expensive: a rule that
      quietly labelled nothing puts a project's spend on another project's
      bill, and nothing on the page would say so.
    */
    const b = bench(
      ['/work/trazum'],
      [{ prefix: '/work/trazum', label: 'trazum' }, { prefix: '/work/other' }],
    );
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /entry 1 needs/);
  });

  it('refuses an empty rules file rather than doing nothing quietly', () => {
    const b = bench(['/work/trazum'], []);
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /no rules in it/);
  });

  it('reads the path and never writes it, which is why this is allowed at all', () => {
    /**
     * The contract. `cwd` is a file path and a file path says something about
     * somebody's machine that a bill does not need, which is why the converter
     * has never emitted one. This feature makes it *read* one for the first
     * time, so the plant is pointed there: a secret in `cwd`, and the whole
     * output searched for it and for the branch name and the message text that
     * were already held.
     */
    const b = bench([SECRET_PATH + '/api'], [{ prefix: SECRET_PATH, label: 'billing' }]);
    const out = run(['from-claude-code', b.transcript, '--label-by-cwd', b.rulesFile]);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(labelsOf(out.stdout), ['billing']);

    assert.equal(out.stdout.includes(SECRET_PATH), false, 'the working directory reached stdout');
    assert.equal(out.stdout.includes('somebody'), false, 'part of the path reached stdout');
    assert.equal(out.stdout.includes('feature/unreleased'), false, 'the branch reached stdout');
    assert.equal(out.stdout.includes('something the user said'), false, 'the text reached stdout');
    /* The summary on stderr is read by a person and pasted into issues. */
    assert.equal(out.stderr.includes(SECRET_PATH), false, 'the working directory reached stderr');
  });
});
