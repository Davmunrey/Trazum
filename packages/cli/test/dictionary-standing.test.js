import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What the report says about dictionaries nobody here reads.
 *
 * The coverage line was added because an empty result in French reads as *your
 * prompt is already efficient* when it means *I do not speak your language*.
 * It then named all seven languages in one sentence, which reads as seven
 * dictionaries of equal standing — and five of them had never been agreed by
 * anybody who reads them.
 */

const run = async (text, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-standing-'));
  const prompt = join(dir, 'prompt.txt');
  // Written to a file rather than piped, and `-o` given, because the report
  // only prints when the optimised text is not itself going to stdout.
  await writeFile(prompt, text);
  const result = spawnSync(
    process.execPath,
    [CLI, 'optimize', prompt, '-o', join(dir, 'out.txt'), ...argv],
    { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
  );
  return `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
};

/** Short, plain, and in no dictionary's crosshairs — so no rule fires. */
const TIGHT = 'Answer the question. Use their language.\n';

describe('the report separates the dictionaries somebody read from the rest', () => {
  it('names the unreviewed five where an empty result would otherwise reassure', async () => {
    const text = await run(TIGHT);
    assert.match(text, /No rule found anything to trim/);
    assert.match(text, /The phrase dictionaries cover English, Spanish, French/);
    assert.match(text, /Of those, French, German, Portuguese, Italian and Dutch/);
    assert.match(text, /nobody here reads/);
  });

  it('does not claim a speaker agreed to them', async () => {
    const text = await run(TIGHT);
    assert.match(text, /never agreed by a speaker of the language/);
  });

  it('says it in the reader language, not only in English', async () => {
    const text = await run(TIGHT, ['--locale', 'es']);
    assert.match(text, /Ninguna regla ha encontrado nada que recortar/);
    assert.match(text, /nadie aquí lee/);
    assert.match(text, /nunca aprobadas por alguien que hable el idioma/);
  });

  it('stays out of the way when a rule did fire', async () => {
    /**
     * The admission belongs to the branch where silence misleads. Printing it
     * under a report that already found something would be a footer, and a
     * footer is what people learn to skip.
     */
    const text = await run('In order to help, please take into consideration the order status.\n');
    assert.doesNotMatch(text, /nobody here reads/);
  });
});
