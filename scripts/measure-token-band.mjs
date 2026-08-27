#!/usr/bin/env node
/**
 * Measures the token estimator against the official counting endpoint.
 *
 * A band is printed on every report Trazum produces, appears in every README and
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
 * 40% out while English prose is 5%, printing one band on a Japanese prompt is
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
  /** Second sample each, so no language rests on a single point. */
  'italian-technical.txt': 'prose-latin',
  'portuguese-technical.txt': 'prose-latin',
  'dutch-technical.txt': 'prose-latin',
  /**
   * Seven samples added where the corpus was thinnest, and it was thinnest
   * exactly where the error is worst.
   *
   * The first cross-provider measurement put DeepSeek at 94.5% on CJK and
   * Mistral at 102.1%, with few-shot at 41.8% and code at 32.4% — and those
   * three classes had one or two files each against thirteen for Latin prose.
   * Any per-family calibration resting on that shape would be fitted to two
   * samples of the class it is worst at, which is fitting the metric to the
   * answer. Korean joins Japanese and Chinese so "CJK" is not two scripts
   * wearing a third's name.
   */
  'code-sql.txt': 'code',
  'code-shell.txt': 'code',
  'few-shot-extraction.txt': 'few-shot',
  'few-shot-classification.txt': 'few-shot',
  'cjk-korean.txt': 'cjk',
  'numeric-tabular.txt': 'numeric',
  'punctuation-markup.txt': 'punctuation',
  /**
   * Fifteen more, and this batch is designed rather than collected.
   *
   * The first extension proved the band was a fit; the spread it exposed showed
   * where the corpus still could not answer. Latin prose had seventeen samples
   * with a 1.2-point standard deviation — converged, and the eighteenth would
   * move nothing. `numeric` had **two**, twenty-seven points apart, so its band
   * rested on one sample and the next CSV could have made it a lie again.
   *
   * The six numeric samples vary deliberately in the one dimension suspected of
   * driving the error: the length of a digit run. Versions and schedules are
   * one and two digits, ports and years three and four, amounts and epoch
   * milliseconds five to thirteen. If run length is what the estimator gets
   * wrong, this is the shape that shows it — and a shape can be fixed, where a
   * constant fitted to two samples can only choose which one to be wrong about.
   */
  'numeric-versions.txt': 'numeric',
  'numeric-identifiers.txt': 'numeric',
  'numeric-metrics.txt': 'numeric',
  'numeric-coordinates.txt': 'numeric',
  'numeric-financial.txt': 'numeric',
  'numeric-schedule.txt': 'numeric',
  'code-typescript.txt': 'code',
  'code-yaml.txt': 'code',
  'code-regex.txt': 'code',
  'code-diff.txt': 'code',
  'punctuation-csvquoting.txt': 'punctuation',
  'punctuation-shell-quoting.txt': 'punctuation',
  'cjk-japanese-technical.txt': 'cjk',
  'cjk-chinese-technical.txt': 'cjk',
  'cjk-korean-technical.txt': 'cjk',
  /**
   * Four written to land in the bucket, after four failed to.
   *
   * The first numeric batch was designed for digit-run length and half of it
   * ended up in `symbolic`: versions, metrics, identifiers and financial rows
   * carry more punctuation than digits, so `bucketFor` put them where their
   * composition says they belong. That is the bucketing working, and it left
   * the ±33% band resting on one sample again.
   *
   * These four are digits with almost nothing else: a meter reading, a
   * confusion matrix, OHLC rows and a line-item checksum. No prose framing
   * beyond the instruction, no markup, no quoting.
   */
  'numeric-readings.txt': 'numeric',
  'numeric-matrix.txt': 'numeric',
  'numeric-timeseries.txt': 'numeric',
  'numeric-checksums.txt': 'numeric',
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
 * the whole mistake.** The published band is the estimator's accuracy against
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
    // The model the committed fixture was measured against. The default said
    // claude-opus-4-1 long after it was retired, so the one script that
    // discharges this project's central claim failed with a 404 the moment
    // somebody finally had a key to run it.
    defaultModel: 'claude-opus-5',
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

  /**
   * OpenAI and Google are here because 1.53 made their endpoints facts of this
   * repository rather than things somebody remembered. The gateway forwards a
   * user's credential to `https://api.openai.com/v1/chat/completions` and to
   * `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
   * and `packages/cli/test/trusted-hosts.test.js` fails the build if this file
   * ever reaches a host the gateway's own allowlist has not reviewed.
   *
   * **Neither has been run against the real service from this environment.**
   * Nothing here has a key. What is committed is the shape, on endpoints this
   * repository already trusts; the numbers arrive when somebody with a key runs
   * it, and until then `token-band.test.js` reports the family as unmeasured by
   * name rather than quoting Claude's band for it.
   */
  openai: {
    label: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5',
    fixture: 'token-ground-truth.openai.json',
    free: false,
    governsPublishedBand: false,
    async count(text, { apiKey, model }) {
      // Same shape as DeepSeek: no counting endpoint, so the prompt count is a
      // by-product of a completion held to one generated token. The prompt half
      // is billed either way, which is why `free` is false and the warning
      // below prints before a single request goes out.
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: text }],
          // The name this repository commits for the OpenAI wire format. The
          // gateway reads `max_completion_tokens ?? max_tokens` when it
          // describes a call, so both are known here and this is the one that
          // belongs to this provider.
          max_completion_tokens: 1,
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

  google: {
    label: 'Google',
    envVar: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    fixture: 'token-ground-truth.google.json',
    free: false,
    governsPublishedBand: false,
    async count(text, { apiKey, model }) {
      /**
       * `:generateContent` with one output token, not `:countTokens`.
       *
       * A free counting endpoint may well exist; this repository has never
       * called one, and an endpoint nobody here has sent a key to is exactly
       * the kind of fact 1.53 spent an arc refusing to compile in from memory.
       * `:generateContent` and `usageMetadata.promptTokenCount` are both
       * already load-bearing here — in `packages/core/src/llm.ts` and
       * `packages/core/src/usage.ts` — so this measures with what is known and
       * pays for it, rather than guessing and saving pennies.
       *
       * The key goes in a header. Google's own examples put it in `?key=`,
       * which puts a credential in every proxy log between here and there —
       * the same decision `llm.ts` made when it added Gemini.
       */
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { maxOutputTokens: 1, temperature: 0 },
          }),
        },
      );
      if (!response.ok) {
        throw new Error('generateContent returned ' + response.status + ': ' + (await response.text()));
      }
      const tokens = (await response.json())?.usageMetadata?.promptTokenCount;
      if (typeof tokens !== 'number') {
        throw new Error('no usageMetadata.promptTokenCount in the response');
      }
      return tokens;
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

  mistral: {
    label: 'Mistral',
    envVar: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    fixture: 'token-ground-truth.mistral.json',
    free: false,
    governsPublishedBand: false,
    async count(text, { apiKey, model }) {
      // Same shape as DeepSeek: no counting endpoint, so the prompt count is a
      // by-product of a completion held to one generated token.
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
      'published band. That band is Claude-calibrated and only the Anthropic run\n' +
      'discharges it. This answers a different and genuinely open question: how far\n' +
      'off the estimator is on a family it was never tuned for.\n',
  );
}



/**
 * One count, retried on the failures that are the provider's weather.
 *
 * The first draft sent one request per sample with no pacing and no retry, so a
 * single transient answer threw away the whole run — and Mistral's free tier
 * threw three in a row, 503 then 503 then 429, on a corpus of forty-three. The
 * measurement is free on Anthropic and pennies elsewhere; the thing that is
 * expensive is a run that gets forty samples in and dies.
 *
 * Only 429 and 5xx are retried. A 401 or a 404 is an answer, not weather, and
 * retrying it would turn a clear message about a wrong key or a retired model
 * into a slow one.
 */
const RETRYABLE = /returned (429|5\d\d):/;

const countTokens = async (text) => {
  let wait = 2000;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await provider.count(text, { apiKey, model: MODEL });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 4 || !RETRYABLE.test(message)) throw error;
      console.error(`  retrying in ${wait / 1000}s: ${message.slice(0, 80)}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait *= 2;
    }
  }
};

/**
 * Pause between samples, for providers that meter rather than count.
 *
 * Anthropic's counting endpoint is free and unthrottled, so it waits for
 * nothing. The completion-based providers are measured one call at a time with
 * a gap, which is slower and is the difference between a run that finishes and
 * a run that gets rate-limited at sample thirty.
 */
const PACE_MS = provider.free ? 0 : 700;

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
  if (PACE_MS > 0) await new Promise((resolve) => setTimeout(resolve, PACE_MS));
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
