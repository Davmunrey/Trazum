#!/usr/bin/env node
/**
 * Measures the token estimator against the official counting endpoint.
 *
 * `±15%` is printed on every report Trazum produces, appears in both READMEs and
 * in the estimator's own doc comment, and every dollar figure the tool prints
 * descends from it. Until this script has been run, that number is a claim
 * rather than a measurement.
 *
 * Run it once, commit what it writes, and `token-band.test.js` starts asserting
 * the band instead of taking it on trust:
 *
 *     ANTHROPIC_API_KEY=sk-... node scripts/measure-token-band.mjs
 *
 * The counting endpoint is free and does not run the model, so this costs
 * nothing beyond the round trips. It writes
 * `packages/core/test/fixtures/token-ground-truth.json`.
 *
 * Re-run it whenever the corpus changes: the fixture carries a digest of the
 * corpus it was measured against, and the test fails if they have drifted apart.
 * Ground truth that quietly describes different text is worse than none.
 */
import { open, readdir, writeFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestOf, digestOfOne } from './corpus-digest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const corpusDir = join(repoRoot, 'packages/core/test/corpus');

/**
 * Which text type each corpus file represents.
 *
 * The types are the point: the estimator is calibrated per character class, so
 * "one band for all text" is an assumption rather than a finding. If Japanese is
 * 40% out while English prose is 5%, printing ±15% on a Japanese prompt is
 * telling somebody a number that is wrong about their prompt specifically.
 */
const TYPES = {
  'english-prose.txt': 'prose-latin',
  'spanish-prose.txt': 'prose-latin',
  'cjk-japanese.txt': 'cjk',
  'cjk-chinese.txt': 'cjk',
  'code-heavy.txt': 'code',
  'few-shot.txt': 'few-shot',
  'punctuation-heavy.txt': 'punctuation',
  'numeric-heavy.txt': 'numeric',
  /**
   * Three samples added to answer one question the corpus could not.
   *
   * Spanish prose measured 22.1% under while English measured 1.0% over, and the
   * cause is not accents — weighting them barely moves the figure. The candidate
   * explanation is merge-table coverage: text that is not English costs more
   * tokens per character whatever its diacritics.
   *
   * `spanish-unaccented.txt` is the falsification test. It is Spanish with zero
   * accented characters, so if accent *density* were a usable detector for "this
   * is not English", this sample would slip past it and stay underestimated. If it
   * lands where accented Spanish lands, the phenomenon is the language and
   * accents were a coincidence of the sample. French and German say whether other
   * Latin languages behave like Spanish or like English.
   */
  'spanish-unaccented.txt': 'prose-latin',
  'french-prose.txt': 'prose-latin',
  'german-prose.txt': 'prose-latin',
  /**
   * Held-out samples for the four languages whose divisors were calibrated on one
   * or two files each. Deliberately a different register — a code-review prompt
   * rather than a support prompt — so agreeing is evidence the divisor generalises
   * rather than evidence it memorised a template.
   */
  'english-technical.txt': 'prose-latin',
  'spanish-technical.txt': 'prose-latin',
  'german-technical.txt': 'prose-latin',
  'french-technical.txt': 'prose-latin',
  /** In the detector since it shipped, never measured, so never given a divisor. */
  'italian-prose.txt': 'prose-latin',
  'portuguese-prose.txt': 'prose-latin',
  'dutch-prose.txt': 'prose-latin',
};

/**
 * The model whose tokenizer is being measured.
 *
 * Recorded in the fixture rather than assumed: if Anthropic ships a new
 * tokenizer with a new model family, a band measured against the old one is a
 * historical fact rather than a current promise, and the file should say which.
 */
/**
 * Where ground truth comes from, per provider.
 *
 * **Two providers measure two different things, and conflating them would be
 * the whole mistake.** The published `±15%` is the estimator's accuracy against
 * *Claude's* tokenizer — the one it was calibrated on, and the one every claim
 * in the documentation refers to. A DeepSeek measurement is the error against
 * DeepSeek's tokenizer: a real and currently unanswered question, since Trazum
 * prices seven providers with an estimator tuned for one, but not the same
 * question and not a discharge of the band.
 *
 * So each provider writes its own fixture and only Anthropic's governs the
 * published band. `token-band.test.js` enforces that distinction rather than
 * trusting this comment.
 *
 * `free` is not a footnote. Anthropic's endpoint counts without running the
 * model and costs nothing. DeepSeek has no counting endpoint, so the number has
 * to come from `usage.prompt_tokens` on a real completion — pennies at
 * `max_tokens: 1`, and still somebody's money.
 */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-4-1',
    fixture: 'token-ground-truth.json',
    free: true,
    governsPublishedBand: true,
    async count(text, { apiKey, model }) {
      const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }] }),
      });
      if (!response.ok) {
        throw new Error('count_tokens returned ' + response.status + ': ' + (await response.text()));
      }
      return (await response.json()).input_tokens;
    },
  },

  deepseek: {
    label: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    fixture: 'token-ground-truth.deepseek.json',
    free: false,
    governsPublishedBand: false,
    async count(text, { apiKey, model }) {
      // No counting endpoint, so the count is a by-product of a completion.
      // `max_tokens: 1` holds the generated half to one token; the prompt half
      // is what is being measured, and is billed either way.
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
          max_tokens: 1,
          temperature: 0,
          stream: false,
        }),
      });
      if (!response.ok) {
        throw new Error('chat/completions returned ' + response.status + ': ' + (await response.text()));
      }
      const tokens = (await response.json())?.usage?.prompt_tokens;
      if (typeof tokens !== 'number') throw new Error('no usage.prompt_tokens in the response');
      return tokens;
    },
  },
};

const flag = process.argv.indexOf('--provider');
const providerName = flag === -1 ? 'anthropic' : process.argv[flag + 1];
const provider = PROVIDERS[providerName];

if (!provider) {
  console.error('Unknown provider "' + providerName + '".');
  console.error('Known: ' + Object.keys(PROVIDERS).join(', '));
  process.exit(1);
}

const MODEL = process.env.TRAZUM_COUNT_MODEL ?? provider.defaultModel;
const outPath = join(repoRoot, 'packages/core/test/fixtures', provider.fixture);

const apiKey = process.env[provider.envVar];
if (!apiKey) {
  console.error(provider.envVar + ' is not set. Nothing measured, nothing written.');
  if (provider.free) {
    console.error('The counting endpoint is free — this costs nothing but the round trips.');
  }
  process.exit(1);
}

if (!provider.free) {
  console.log(
    '\n' +
      provider.label +
      ' has no free counting endpoint. Every sample below is a real completion\n' +
      'with max_tokens: 1, so the prompt half is billed. Pennies for this corpus, and\n' +
      'still your money — said out loud because the Anthropic path is free and nobody\n' +
      'should discover the difference on an invoice.\n',
  );
}

if (!provider.governsPublishedBand) {
  console.log(
    'This measures the estimator against ' +
      provider.label +
      "'s tokenizer, which is NOT the\n" +
      'published ±15%. That band is Claude-calibrated and only the Anthropic run\n' +
      'discharges it. This answers a different and genuinely open question: how far\n' +
      'off the estimator is on a family it was never tuned for.\n',
  );
}



const countTokens = (text) => provider.count(text, { apiKey, model: MODEL });

/**
 * The endpoint counts a *message*, which carries a few tokens of envelope beyond
 * the text itself. Measuring the envelope once and subtracting it means the
 * figures describe the text, which is what the estimator is estimating.
 */
async function measureEnvelope() {
  const empty = await countTokens('x');
  const one = await countTokens('x'.repeat(1));
  return Math.max(0, Math.min(empty, one) - 1);
}

const names = (await readdir(corpusDir)).filter((n) => n.endsWith('.txt')).sort();
const missing = names.filter((n) => !(n in TYPES));
if (missing.length > 0) {
  console.error(`Corpus files with no declared type: ${missing.join(', ')}`);
  console.error('Add them to TYPES in this script — an unclassified sample measures nothing.');
  process.exit(1);
}

/**
 * Everything below leaves this machine.
 *
 * The script exists to send corpus text to a third party, so CodeQL flagging a
 * file-to-network flow is describing the job rather than a bug. What it made
 * worth checking is the *edge* of that job: `readdir` plus `readFile` follows a
 * symlink, and this directory is a test-fixture folder that people drop things
 * into. One named `secrets.txt -> ~/.aws/credentials` would have been posted to
 * an API without a word.
 *
 * `walkPrompts` in the core has skipped symlinks since it was written —
 * "a symlink is never followed, whatever it points at" — and this script simply
 * had not been held to the same rule.
 *
 * The file list is printed before anything is sent, too. The repository tells
 * people not to paste a private prompt into a public issue; the same reasoning
 * applies to posting one to an API, and consent needs to be informed to be
 * consent.
 */
const entries = [];
for (const name of names) {
  const path = join(corpusDir, name);

  // `O_NOFOLLOW` refuses a symlink in the open itself: one syscall, and the
  // handle is the file that was checked.
  //
  // The first version of this guard was `lstat` then `readFile`, which resolves
  // the name twice and is a time-of-check to time-of-use race — CodeQL opened a
  // high-severity alert on it within the hour. This repository had already been
  // caught by the identical pattern in the config reader and fixed it the same
  // way; I wrote it again anyway.
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error.code === 'ELOOP') {
      console.error(`Refusing to send ${name}: it is a symlink, and this posts file contents.`);
      process.exit(1);
    }
    throw error;
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) continue;
    entries.push([name, await handle.readFile('utf8')]);
  } finally {
    await handle.close();
  }
}

console.log(`These files will be sent to ${provider.label}:`);
for (const [name, text] of entries) console.log(`  ${name} (${text.length} chars)`);
console.log();

console.log(`Measuring ${entries.length} samples against ${MODEL} (${provider.label})…`);
const envelope = await measureEnvelope();
console.log(`Message envelope: ${envelope} tokens (subtracted from every figure)\n`);

const samples = [];
for (const [name, text] of entries) {
  const counted = (await countTokens(text)) - envelope;
  // The digest of *this* sample, so adding a ninth file does not retire the
  // measurements of the first eight — each of which costs an API call.
  samples.push({
    file: name,
    type: TYPES[name],
    chars: text.length,
    actualTokens: counted,
    digest: digestOfOne(name, text),
  });
  console.log(`  ${name.padEnd(24)} ${String(counted).padStart(6)} tokens`);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  `${JSON.stringify(
    {
      // Written by scripts/measure-token-band.mjs. Do not edit by hand: the
      // digest below is what stops the numbers describing text that has since
      // changed, and hand-editing is how it comes to lie.
      provider: providerName,
      governsPublishedBand: provider.governsPublishedBand,
      model: MODEL,
      measuredAt: new Date().toISOString().slice(0, 10),
      corpusDigest: digestOf(entries),
      envelopeTokens: envelope,
      samples,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`\nWritten to ${outPath.replace(`${repoRoot}/`, '')}`);
console.log('Now run `npm test -w @trazum/core` — the band assertions are live.');
