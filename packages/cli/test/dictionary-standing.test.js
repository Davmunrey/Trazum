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

/**
 * Long enough for the detector to answer, and it fires the Dutch filler
 * entries. Both halves matter: a prompt that fires nothing lands in the other
 * branch, and a three-line prompt comes back `null` from the detector.
 */
const DUTCH = `Je bent een assistent voor de klantenservice van een webwinkel.

Het is belangrijk om op te merken dat je altijd in de taal van de klant
antwoordt. Zoals je weet wordt een bestelling niet meteen verzonden, dus
eigenlijk zijn de bezorgdatums met opzet een schatting. In principe geef je
deze informatie aan de klant voor je iets belooft.
`;

/** English, wordy, and every entry it fires was written by somebody who reads it. */
const ENGLISH = `You are a support assistant for an online shop.

In order to help the customer, please take into consideration the fact that the
order may not have shipped yet. At this point in time, due to the fact that
carriers are slow, it is important to note that delivery estimates are
approximate. In the event that the customer asks, explain this.
`;

describe('when the rules did change the prompt, whose judgement changed it', () => {
  it('says so on a prompt in a language nobody here reads', async () => {
    const text = await run(DUTCH, ['--level', 'aggressive']);
    assert.match(text, /Rules applied/);
    assert.match(text, /These changes came from the Dutch dictionary, which nobody here reads/);
    assert.match(text, /Read the diff before trusting it/);
  });

  it('stays quiet on a prompt in a language somebody here reads', async () => {
    /**
     * The English dictionary was written by somebody reading it, so there is
     * nothing to admit. A line printed here would be the footer this refuses to
     * become.
     */
    const text = await run(ENGLISH, ['--level', 'aggressive']);
    assert.match(text, /Rules applied/);
    assert.doesNotMatch(text, /nobody here reads/);
  });

  it('says it in the reader language, not the prompt language', async () => {
    const text = await run(DUTCH, ['--level', 'aggressive', '--locale', 'es']);
    assert.match(text, /Estos cambios vienen del diccionario de neerlandés/);
    assert.match(text, /nadie aquí lee/);
  });

  it('stays quiet when the prompt is too short to place, and that is deliberate', async () => {
    /**
     * `detectTextLanguage` answers null on a prompt it cannot place, and this
     * warning is gated on a positive answer. Not-detected is not
     * not-unreviewed — but guessing a language in order to warn about it is the
     * overreach the detector exists to refuse, and a wrong guess would put a
     * Dutch warning on a Portuguese prompt.
     */
    const text = await run('Eigenlijk, antwoord kort.\n', ['--level', 'aggressive']);
    assert.doesNotMatch(text, /nobody here reads/);
  });
});
