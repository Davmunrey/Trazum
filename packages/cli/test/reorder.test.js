import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `reorder.ts` is tested for what it moves and refuses. These tests are about
 * the wiring: whether the flag reaches it, whether the report tells the truth,
 * and — the one that actually matters — whether `--reorder` without the flag
 * leaves the prompt exactly as written.
 *
 * The binary is driven rather than the function, because every bug worth
 * catching here is a bug in the seam.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '' },
  });
  return { out: `${result.stdout}${result.stderr}`, code: result.status };
}

const RULES = Array.from(
  { length: 40 },
  (_, i) => `- Rule ${i + 1}: verify the order identifier before quoting any policy.`,
).join('\n');

/** A prompt whose 1,000 tokens of instructions sit after the placeholder. */
const STRANDED = `You are a support agent for Acme.

Customer message: {{message}}

${RULES}
`;

/** The same, with a block that points backwards at the message. */
const PINNED = `You are a support agent.

Customer message: {{message}}

Summarise the text above in one sentence.

Always answer in English.
`;

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-reorder-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(root, name), body);
  }
  return root;
}

describe('trazum optimize --reorder', () => {
  it('is off unless asked for', async () => {
    // The whole safety argument rests on this. Reordering must never happen to
    // somebody who ran `optimize` and got a rearranged prompt they did not ask
    // for, so the default is checked before anything else.
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '-o', 'out.txt'], root);

    assert.doesNotMatch(out, /Reordered for caching/);
    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.ok(
      written.indexOf('{{message}}') < written.indexOf('Rule 1'),
      'the prompt was reordered without the flag',
    );
  });

  it('is not part of aggressive', async () => {
    // `aggressive` promises "read the diff" for deletions. Moving text asks a
    // different question, so it cannot ride in on a level.
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '--level', 'aggressive', '-o', 'out.txt'], root);
    assert.doesNotMatch(out, /Reordered for caching/);
  });

  it('moves the instructions and reports the prefix it gained', async () => {
    const root = await project({ 'p.txt': STRANDED });
    const { out, code } = run(['optimize', 'p.txt', '--reorder', '-o', 'out.txt'], root);

    assert.equal(code, 0);
    assert.match(out, /Reordered for caching/);
    assert.match(out, /Moved 1 block \(~[\d,]+ tokens\)/);

    // Read the two figures out of the line rather than hardcoding them: the
    // fixture's exact token count is not the claim, the growth is.
    const prefix = out.match(/Cacheable prefix ([\d,]+) → ([\d,]+) tokens\./);
    assert.ok(prefix, 'the report did not state the prefix it gained');
    const [before, after] = prefix.slice(1).map((v) => Number(v.replaceAll(',', '')));
    assert.ok(before < 20, `the prefix was not small to begin with (${before})`);
    assert.ok(after > before * 50, `the prefix barely grew (${before} → ${after})`);

    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.ok(
      written.indexOf('Rule 1') < written.indexOf('{{message}}'),
      'the output file still has the instructions stranded after the placeholder',
    );
  });

  it('tells the reader to judge the order, not just read the diff', async () => {
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '-o', 'out.txt'], root);
    assert.match(out, /whether the order mattered/);
  });

  it('names the phrase that stopped it, and what stayed behind', async () => {
    const root = await project({ 'p.txt': PINNED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '-o', 'out.txt'], root);

    assert.match(out, /Nothing could safely move\./);
    assert.match(out, /refers back \("above"\)/);
    assert.match(out, /after a block that had to stay/);
  });

  it('writes the prompt back byte-identical when nothing could move', async () => {
    // A refusal must cost nothing. If the file comes back reflowed, the author
    // gets a diff for a change Trazum decided not to make.
    const root = await project({ 'p.txt': PINNED });
    run(['optimize', 'p.txt', '--reorder', '--level', 'safe', '-o', 'out.txt'], root);

    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.equal(written.trimEnd(), PINNED.trimEnd());
  });

  it('diffs against what the author wrote, not against the rearrangement', async () => {
    // Optimising the reordered text would make the diff show only the
    // deletions — hiding the one change the report just said to review.
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '--diff', '-o', 'out.txt'], root);

    assert.match(out, /Diff/);
    // The moved block appears as a removal from its old position.
    assert.match(out, /^\s*-.*Rule 1:/m, 'the diff does not show the move');
  });

  it('puts the rearrangement in --json, where a script can see it', async () => {
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '--json'], root);
    const report = JSON.parse(out);

    assert.equal(report.reorder.moved.length, 1);
    assert.ok(report.reorder.prefixTokensAfter > report.reorder.prefixTokensBefore);
    assert.equal(report.reorder.declined.length, 0);
  });

  it('reports refusals in --json too', async () => {
    const root = await project({ 'p.txt': PINNED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '--json'], root);
    const report = JSON.parse(out);

    assert.equal(report.reorder.moved.length, 0);
    assert.deepEqual(
      report.reorder.declined.map((d) => d.reason),
      ['backward-reference', 'after-pinned'],
    );
    assert.equal(report.reorder.declined[0].phrase, 'above');
  });

  it('omits reorder from --json when the flag was not passed', async () => {
    // Absent, not `null`: a consumer checking `if (report.reorder)` should not
    // have to distinguish "not asked for" from "asked for and nothing moved".
    const root = await project({ 'p.txt': STRANDED });
    const { out } = run(['optimize', 'p.txt', '--json'], root);
    assert.equal('reorder' in JSON.parse(out), false);
  });

  it('respects the model cache minimum before churning a small prompt', async () => {
    // Haiku's minimum is higher than Opus's. A prompt worth rearranging for one
    // is not necessarily worth it for the other, and the report must not claim
    // a saving the model would not give.
    const source = 'Agent.\n\nInput: {{x}}\n\nBe brief and polite.\n';
    const root = await project({ 'p.txt': source });
    const { out } = run(
      ['optimize', 'p.txt', '--reorder', '--model', 'claude-haiku-4-5', '-o', 'out.txt'],
      root,
    );

    // Asserted on the behaviour rather than on the words. This used to match
    // "Nothing could safely move." — a heading, a blank line and a shrug, which
    // the report no longer prints when there is neither a move nor a refusal to
    // report. A test pinned to a line that says nothing keeps that line alive.
    assert.doesNotMatch(out, /Reordered for caching/);
    const written = await readFile(join(root, 'out.txt'), 'utf8');
    assert.ok(
      written.indexOf('{{x}}') < written.indexOf('Be brief'),
      'the prompt was rearranged below the model cache minimum',
    );
  });

  it('stops the cache-prefix advisory from asking for what it already did', async () => {
    // Before this feature the advisory said "move these instructions" and no
    // command could. Having moved them, it must not still be asking.
    const root = await project({ 'p.txt': STRANDED });
    const before = run(['optimize', 'p.txt', '--calls', '50000', '-o', 'a.txt'], root);
    const after = run(['optimize', 'p.txt', '--reorder', '--calls', '50000', '-o', 'b.txt'], root);

    // The advisory's own heading, so the assertion cannot be satisfied by the
    // report block this feature added ("Reordered for caching" contains
    // "Reorder", which is exactly the false pass to avoid here).
    const ADVISORY = /Move the stable instructions ahead of the first placeholder/;
    assert.match(before.out, ADVISORY);
    assert.doesNotMatch(after.out, ADVISORY);
    // And the caching advisory now has something to offer, which it did not
    // before: this is the saving actually materialising.
    assert.match(after.out, /Turn on prompt caching/);
  });

  it('is rejected by check, which is a gate and must not rewrite', async () => {
    const root = await project({ 'p.txt': STRANDED });
    const { out, code } = run(['check', 'p.txt', '--reorder'], root);
    assert.notEqual(code, 0);
    assert.match(out, /Unknown option --reorder/);
  });

  it('does not go silent when the report is piped away', async () => {
    // The pipe contract is "the prompt and nothing else" on stdout, which for
    // every other transformation is right: they delete, and the diff shows it.
    // This one moves text. Piping it made both the move and the refusals
    // invisible, which is the one thing the module promises not to do.
    const root = await project({ 'p.txt': STRANDED });
    const result = spawnSync(process.execPath, [CLI, 'optimize', 'p.txt', '--reorder'], {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '' },
    });

    assert.match(result.stderr, /moved 1 block \(~[\d,]+ tokens\) into the cacheable prefix/);
    // stdout stays the prompt alone — the notice must not reach the pipe.
    assert.doesNotMatch(result.stdout, /trazum:/);
    assert.ok(
      result.stdout.indexOf('Rule 1') < result.stdout.indexOf('{{message}}'),
      'the piped prompt was not the reordered one',
    );
  });

  it('names the refusals on stderr too, not just the moves', async () => {
    const root = await project({ 'p.txt': PINNED });
    const result = spawnSync(process.execPath, [CLI, 'optimize', 'p.txt', '--reorder'], {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '' },
    });
    assert.match(result.stderr, /nothing could safely move; 2 blocks left in place/);
  });

  it('stays quiet on the pipe when --reorder was not asked for', async () => {
    const root = await project({ 'p.txt': STRANDED });
    const result = spawnSync(process.execPath, [CLI, 'optimize', 'p.txt'], {
      encoding: 'utf8',
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '' },
    });
    assert.equal(result.stderr, '', 'a plain piped run printed something to stderr');
  });

  it('says the same things in Spanish', async () => {
    const root = await project({ 'p.txt': PINNED });
    const { out } = run(['optimize', 'p.txt', '--reorder', '--locale', 'es', '-o', 'out.txt'], root);

    assert.match(out, /Reordenado para la caché/);
    assert.match(out, /No se ha podido mover nada con seguridad\./);
    assert.match(out, /hace referencia hacia atrás \("above"\)/);
  });
});
