import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, answerCost, assemble, conform, guardSpend, optimize, profileUsage, rollUp } from '../dist/index.js';

/**
 * Hostile input, permanently.
 *
 * A stress session found six defects in an afternoon, all one shape: an input
 * nobody had tried, taken quietly. This file is that session as a fixture --
 * seeded and deterministic, so the same seed gives the same verdict on any
 * machine, and bounded, so it is a test and not a job.
 *
 * Three properties over the prompt fuzzer, and they are the product's own
 * promises: `optimize` never throws, never grows tokens, and is idempotent --
 * running it on its own output changes nothing. The third failed when this
 * was written (1 input in 4,000): `emphasis` stripped `IMPORTANT:` and left
 * two lines equal but for a space that `whitespace` had already stopped
 * looking at, so `duplicate-lines` missed the pair a second run caught.
 *
 * Every defect the session found is pinned below as its own case, because a
 * fuzzer's seed schedule shifts the moment an atom is added -- the named cases
 * are the part that cannot rotate away.
 */

/** Deterministic LCG: same seed, same corpus, any machine. */
const generator = (seed) => {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const ATOMS = [
  'Please kindly note that ', 'in order to ', 'you should always ', 'IMPORTANT: ',
  '```js\nconst x = 1;\n```', '`inline code`', 'https://example.com/a?b=c&d=e',
  'l\u00ednea en espa\u00f1ol con acent\u00f3s', '\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3067\u3059\u3002',
  '\u0646\u0635 \u0639\u0631\u0628\u064a \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646',
  '\ud83c\udf89\ud83d\ude80 emoji run \ud83d\udd25', 'word '.repeat(50), '\t\ttabs\t\t', '   ', '\r\n\r\nCRLF\r\n',
  '- list item\n- list item\n- list item\n', '| a | b |\n|---|---|\n| 1 | 2 |\n',
  'Very very very important. ', 'REPEAT-BLOCK\nline one\nline two\n\nREPEAT-BLOCK\nline one\nline two\n',
  '\u0000null-byte', '\u200bzero-width\u200b', 'e\u0301 combining', '\ud835\udd66nicode math',
  'a'.repeat(3000), '\n\n\n\n\n\n', '<html><b>tags</b></html>', '{"json": true, "n": 1.5}',
  '-----BEGIN FAKE-----\nAAAA\n-----END FAKE-----', '\ud83d',
  // Bait: text a rule would rewrite, deliberately inside protected spans.
  // Without these the mask property can never fail -- the corpus would hold
  // no code a rule wants to touch, and a zero that cannot be non-zero proves
  // nothing. Removing the inline-code mask fails the property through these.
  '`in order to  keep  these  spaces`', '```\nPlease kindly note that   \nIMPORTANT: inside\n```',
  'https://example.com/in%20order%20to?keep=very%20very',
  // The bait that was missing, and the omission was not the corpus's fault:
  // there was no email mask for it to test. Five of ten realistic addresses
  // came out corrupted -- `please@example.com` became `@example.com` -- because
  // the politeness, filler and intensifier rules read a local part as prose.
  'Write to please.note@example.com and basically@example.com for help.',
  // The same bait for indented code. Four spaces after a blank line is a code
  // block by the CommonMark rule, and every word in it is one a rule removes.
  'Run this:\n\n    const label = "please keep";\n    // basically the identity\n',
];

const prompts = (seed, iterations) => {
  const rnd = generator(seed);
  const out = [];
  for (let i = 0; i < iterations; i += 1) {
    const n = 1 + Math.floor(rnd() * 8);
    let text = '';
    for (let j = 0; j < n; j += 1) text += ATOMS[Math.floor(rnd() * ATOMS.length)] + (rnd() < 0.5 ? '\n' : ' ');
    out.push({ text, level: rnd() < 0.5 ? 'safe' : 'aggressive' });
  }
  return out;
};

describe('optimize over the hostile corpus', () => {
  const CORPUS = prompts(42, 1500);

  it('has a corpus worth the name', () => {
    assert.equal(CORPUS.length, 1500);
    // Short combinations collide (a one-atom text repeats), so the bar is
    // 'not degenerate' rather than 'all distinct'.
    assert.ok(new Set(CORPUS.map((entry) => entry.text)).size > 1200, 'the generator is producing repeats');
  });

  it('never throws, never grows tokens, and reaches its own fixed point', () => {
    const failures = [];
    for (const { text, level } of CORPUS) {
      let first;
      try {
        first = optimize(text, { level });
      } catch (error) {
        failures.push({ kind: 'threw', level, error: String(error.message).slice(0, 120) });
        continue;
      }
      if (first.tokensAfter > first.tokensBefore) {
        failures.push({ kind: 'grew', level, before: first.tokensBefore, after: first.tokensAfter });
        continue;
      }
      const second = optimize(first.optimized, { level });
      if (second.optimized !== first.optimized) {
        failures.push({ kind: 'not-idempotent', level, sample: JSON.stringify(text.slice(0, 80)) });
      }
    }
    assert.deepEqual(failures.slice(0, 5), [], `${failures.length} of ${CORPUS.length} inputs broke a property`);
  });

  it('still converges on the cascade the fuzzer found', () => {
    // The named case, pinned outside the seed schedule: emphasis strips the
    // prefix, whitespace has to run again for duplicate-lines to see the pair.
    const run = 'word '.repeat(48).trim();
    const text = `IMPORTANT:  ${run}\n${run}\n`;
    const first = optimize(text, { level: 'aggressive' });
    assert.equal(optimize(first.optimized, { level: 'aggressive' }).optimized, first.optimized);
    assert.ok(first.rules.some((rule) => rule.id === 'duplicate-lines'), 'the cascade was not caught in one call');
  });
});

describe('malformed logs are read, never thrown at', () => {
  const LINES = [
    '{"model":"claude-opus-5","usage":{"input_tokens":100,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":-100,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":1e309,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":"100","output_tokens":10}}',
    '{"model":123,"usage":{"input_tokens":100,"output_tokens":10}}',
    '{"model":"claude-opus-5","ts":"2026-13-45T99:99:99Z","usage":{"input_tokens":1,"output_tokens":1}}',
    '{"model":"claude-opus-5","session":42,"usage":{"input_tokens":1,"output_tokens":1}}',
    'not json at all', '[]', 'null', 'true', '42', '{"usage":{}}',
    '{"__proto__":{"polluted":1},"model":"claude-opus-5","usage":{"input_tokens":1,"output_tokens":1}}',
  ];

  it('profiles every mixture with finite, non-negative money', () => {
    const rnd = generator(7);
    for (let i = 0; i < 300; i += 1) {
      const n = 1 + Math.floor(rnd() * 12);
      const parts = [];
      for (let j = 0; j < n; j += 1) parts.push(LINES[Math.floor(rnd() * LINES.length)]);
      const report = profileUsage(parts.join('\n'), { catalogue: BUNDLED_CATALOGUE });
      assert.ok(Number.isFinite(report.total.totalUsd), 'a total went non-finite');
      assert.ok(report.total.totalUsd >= 0, 'a total went negative');
    }
    assert.equal({}.polluted, undefined, 'a log line reached Object.prototype');
  });

  it('names every line it could not read, rather than reading past it', () => {
    /**
     * Total over strings is only half the property. The other half is that a
     * refusal never disappears: a line the parser could not read lands in
     * `skippedLines` with its 1-based position, because "the fuzzer did not
     * crash" and "the unreadable third of your log is accounted for" are
     * different statements.
     */
    const log = [
      '{"model":"claude-opus-5","usage":{"input_tokens":100,"output_tokens":10}}',
      'not json at all',
      '{"model":"claude-opus-5","usage":{"input_tokens":200,"output_tokens":20}}',
      '{broken',
    ].join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    assert.deepEqual(report.skippedLines, [2, 4]);
    assert.equal(report.total.calls, 2, 'a skipped line changed the arithmetic of the readable ones');
  });

  it('conforms and rolls up hostile documents without throwing', () => {
    for (const doc of ['{}', '[]', 'null', '"str"', 'not json', '{"schemaVersion":"1"}']) {
      for (const contract of ['profile', 'prompt-draft', 'roll-up', undefined]) {
        conform(doc, contract === undefined ? {} : { contract });
      }
    }
    for (const contributors of [[], [{ name: 'a', text: 'not json' }], [{ name: 'a', text: '{}' }]]) {
      const merged = rollUp(contributors);
      assert.ok(Number.isFinite(merged.total.totalUsd));
    }
  });
});

describe('money is never negative, whatever the input', () => {
  it('refuses the token counts that priced a call below zero', () => {
    /**
     * The worst of the six: `spend_guard` took `outputTokens: -500`, priced
     * the call at -$0.0075, and said **yes** -- a negative estimate lowers the
     * projected spend, so an agent that lies about its output tokens buys
     * itself an approval. Refused in `answerCost`, where every door routes.
     */
    for (const request of [
      { model: 'claude-opus-5', inputTokens: 1000, outputTokens: -500 },
      { model: 'claude-opus-5', inputTokens: -1 },
      { model: 'claude-opus-5', inputTokens: Number.POSITIVE_INFINITY },
      { model: 'claude-opus-5', inputTokens: Number.NaN },
    ]) {
      assert.throws(() => answerCost(request, { catalogue: BUNDLED_CATALOGUE }), /non-negative finite/);
      assert.throws(() => guardSpend(request, { catalogue: BUNDLED_CATALOGUE }), /non-negative finite/);
    }
  });

  it('and still answers the honest ones', () => {
    const answer = guardSpend(
      { model: 'claude-opus-5', inputTokens: 1000, outputTokens: 500, consumedUsd: 5, limitUsd: 10 },
      { catalogue: BUNDLED_CATALOGUE },
    );
    assert.equal(answer.verdict, 'yes');
    assert.ok(answer.cost.call.estimatedUsd > 0);
  });

  it('treats a budget that is not a positive number as no budget', () => {
    // `-5` used to produce the verdict `over` -- a judgement against a limit
    // that cannot exist. `-5`, `Infinity` and `NaN` now land where they
    // belong: nothing to check against, said with its reason.
    const REQUIRED = { role: 'r', task: 't', inputs: 'i', 'output-shape': 'prose', model: 'claude-opus-5' };
    for (const budget of ['-5', '0', 'Infinity', 'NaN', 'banana']) {
      const { measured } = assemble({ ...REQUIRED, budget }, { callsPerMonth: 1000 });
      assert.equal(measured.cheap.verdict, 'cannot-tell', `budget ${budget} was judged`);
      assert.equal(measured.cheap.reason, 'no-budget');
    }
    const real = assemble({ ...REQUIRED, budget: '20' }, { callsPerMonth: 1000 });
    assert.equal(real.measured.cheap.verdict, 'within');
  });

  it('treats a volume that is not positive as not stated', () => {
    // `callsPerMonth: -100` priced a prompt at -$1.26 a month -- a number no
    // bill ever had.
    const REQUIRED = { role: 'r', task: 't', inputs: 'i', 'output-shape': 'prose', model: 'claude-opus-5' };
    for (const callsPerMonth of [-100, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { measured } = assemble(REQUIRED, { callsPerMonth });
      assert.ok(measured.cheap.monthlyUsd === null || measured.cheap.monthlyUsd >= 0, `callsPerMonth ${callsPerMonth} went negative`);
    }
  });
});

describe('indented code is code, and the rules were rewriting it', () => {
  /**
   * **This module used to say indented blocks were left to the rules because
   * they are *"ambiguous in markdown"*.** The ambiguity is real. What it cost
   * was not proportionate to it — three separate corruptions at once, all
   * measured:
   *
   * - the indentation goes, which by itself makes Python a syntax error;
   * - keywords are sentence-capitalised — `const` becomes `Const`, `def`
   *   becomes `Def` — which makes the rest of them syntax errors;
   * - and **string literals are edited**, so `WHERE note = 'please refund'`
   *   became `= ' refund'` and a payload's `"reason"` changed value.
   *
   * The report said tokens were saved for all of it.
   *
   * The blank line is what makes this a rule rather than a guess: CommonMark
   * says an indented code block cannot interrupt a paragraph, so a run of
   * indented lines after a blank line is code by the specification.
   */
  const BLOCKS = [
    ['a js string literal', 'Run this:\n\n    const label = "please keep";\n\nThen continue.'],
    ['python, where indentation is syntax', 'Use:\n\n    def run(x):\n        return x  # basically the identity\n\nDone.'],
    ['sql with a literal that must not change', "Query:\n\n    SELECT id FROM orders WHERE note = 'please refund';\n\nDone."],
    ['a json payload', 'Send:\n\n    {"reason": "please cancel", "urgent": true}\n\nDone.'],
    ['a tab-indented block', 'Run:\n\n\tconst x = "please keep";\n\nDone.'],
  ];

  for (const level of ['safe', 'aggressive']) {
    it(`leaves an indented block byte for byte at the ${level} level`, () => {
      const broken = BLOCKS.filter(([, text]) => {
        const body = text.split('\n\n')[1];
        return !optimize(text, { level }).optimized.includes(body);
      }).map(([name]) => name);
      assert.deepEqual(broken, [], `${broken.length} blocks rewritten: ${broken.join(', ')}`);
    });
  }

  it('and still trims prose that merely happens to be indented', () => {
    /*
      The cost of the mask, checked rather than assumed. Without the blank-line
      requirement this would swallow a wrapped paragraph line and turn the
      optimiser off in the middle of ordinary prose.
    */
    const inParagraph = 'Please note the value.\n    It is important to note that this continues.\nBasically, done.';
    const trimmed = optimize(inParagraph, { level: 'aggressive' }).optimized;
    assert.ok(trimmed.length < inParagraph.length, 'an indented paragraph line stopped being trimmed');
    assert.doesNotMatch(trimmed, /It is important to note/, 'filler inside a paragraph survived');

    /*
      Three spaces after a blank line, which markdown reads as a paragraph and
      not as code. Added because a plant went silent: loosening the mask to
      three spaces broke nothing here, so nothing was holding the boundary that
      separates an indented block from ordinary wrapped prose.
    */
    const nearlyIndented = 'Text.\n\n   It is important to note that this is prose.\n';
    assert.doesNotMatch(
      optimize(nearlyIndented, { level: 'aggressive' }).optimized,
      /It is important to note/,
      'three spaces was read as a code block',
    );
  });

  it('but cannot re-protect a document reduced to nothing but the block', () => {
    /**
     * **A limit, pinned so that changing the bait did not bury it.** The mask
     * needs real content before the blank line. At the aggressive level a rule
     * can delete that content — `IMPORTANT:` is one — and `optimize` then trims
     * the leading blank lines, so the second pass sees a document that opens
     * with indented text and nothing before it. That is genuinely ambiguous:
     * a first line starting with a tab is not necessarily code, and claiming it
     * was tried and made things worse, breaking thirty-two protected spans
     * elsewhere in this corpus.
     *
     * So the first pass keeps the code and a second pass would not. It surfaced
     * because the bait atom happened to start with a blank line; the atom is a
     * realistic prompt now, which is a better bait, and this is here so the
     * limit is a decision on the record rather than a thing the fixture stopped
     * showing.
     */
    const reducible = 'IMPORTANT:\n\n    const label = "please keep";\n';
    const once = optimize(reducible, { level: 'aggressive' }).optimized;
    assert.match(once, /const label = "please keep";/, 'the first pass must still keep the code');

    const twice = optimize(once, { level: 'aggressive' }).optimized;
    assert.notEqual(
      twice,
      once,
      'the limit above is gone — good, but delete this test deliberately rather than by accident',
    );
  });

  it('and protects a deeply indented list continuation, which is the known cost', () => {
    /**
     * Stated as a test rather than left for somebody to find. Content indented
     * four spaces inside a list is continuation, not code, and this protects
     * it — unsaved tokens in a rare shape. The alternative is a broken prompt
     * in a common one, and those are not the same kind of wrong.
     */
    const list = '- First item\n\n    please keep this continuation\n\n- Second item';
    assert.ok(
      optimize(list, { level: 'aggressive' }).optimized.includes('please keep this continuation'),
      'the known cost has changed shape — re-read the trade-off before editing this',
    );
  });
});

describe('an address is not prose, however much it reads like it', () => {
  /**
   * **Five of ten realistic addresses came out corrupted**, and what was left
   * was not a wrong address — it was not an address. `please@example.com`
   * became `@example.com`; so did `thanks@`, `basically@`, `essentially.ops@`
   * and `very.important@`. The politeness, filler and intensifier rules read
   * the local part as ordinary prose and cut it out, and the report said
   * tokens had been saved.
   *
   * That is the exact failure `segment.ts` opens by naming: *"compressing a
   * code block, a URL or a template placeholder would break the prompt, and
   * that is exactly the failure that makes a prompt optimiser useless."* Code,
   * URLs and placeholders were on the list. The thing every support prompt in
   * the world carries was not.
   *
   * **`support@` and `no-reply@` survived, which is what hid it.** So did
   * `por.favor@ejemplo.es`, and only because the Spanish politeness entry is
   * written with a space rather than a dot. Luck, spread across the half of
   * the corpus that happened not to spell a stripped word.
   */
  const ADDRESSES = [
    'support@example.com',
    'no-reply@example.com',
    'please@example.com',
    'basically@example.com',
    'essentially.ops@example.com',
    'thanks@example.com',
    'very.important@example.com',
    'i.think@example.com',
    'contacto@ejemplo.es',
    'por.favor@ejemplo.es',
  ];

  for (const level of ['safe', 'aggressive']) {
    it(`survives an address byte for byte at the ${level} level`, () => {
      const broken = ADDRESSES.filter(
        (address) =>
          !optimize(`Escalate the ticket.\n\nSend it to ${address} and wait.`, { level })
            .optimized.includes(address),
      );
      assert.deepEqual(broken, [], `${broken.length} addresses corrupted: ${broken.join(', ')}`);
    });
  }

  it('and the sentence around it is still trimmed', () => {
    /*
      The other half. A mask that swallowed the punctuation or the prose beside
      it would pass every assertion above while quietly turning the optimiser
      off wherever an address appears — protecting too much is how a fix for
      this becomes a regression nobody measures.
    */
    assert.equal(
      optimize('Please write to ops@example.com.').optimized.trim(),
      'Write to ops@example.com.',
    );
    assert.equal(
      optimize('Send it to ops@example.com, please.').optimized.trim(),
      'Send it to ops@example.com.',
    );
  });

  it('and claims nothing that merely contains an @', () => {
    /*
      A handle, a decorator and an arithmetic expression are not addresses, and
      each of these is checked by watching the prose beside it still get cut.

      **A plant for over-claiming could not be built, and that is worth saying
      rather than leaving as an untested corner.** Widening the pattern to
      `\S*@\S*` changes no output here: it cannot cross whitespace, and a word
      a rule strips is its own whitespace-delimited token, so anything the
      broad form over-claims contains nothing to strip. The three plants that
      do fire are the ones that matter — the mask removed, the mask swallowing
      the sentence's punctuation, and the mask narrowed until a one-word local
      part goes unprotected.
    */
    for (const text of ['Basically, ping @oncall.', 'Basically, @Component is required.', 'Basically, 5@2 units.']) {
      const { optimized } = optimize(text);
      assert.doesNotMatch(optimized, /^Basically/, `the prose around ${JSON.stringify(text)} was not trimmed`);
    }
  });
});

describe('what a mask promises, over the whole corpus', () => {
  /**
   * Code blocks, inline code and URLs must survive `optimize` byte-for-byte.
   *
   * Three fixtures could hold that; the corpus is where the hard cases live —
   * the lone surrogate *inside* a code span, the URL against an RTL run, the
   * fence that never closes. Extracted from the input by the same shapes the
   * masker protects, and looked for verbatim in the output.
   */
  const protectedSpans = (text) => {
    const spans = [];
    for (const match of text.matchAll(/```[\s\S]*?```/g)) spans.push(match[0]);
    const noFences = text.replace(/```[\s\S]*?```/g, '');
    for (const match of noFences.matchAll(/`[^`\n]+`/g)) spans.push(match[0]);
    for (const match of noFences.matchAll(/https?:\/\/[^\s)]+/g)) spans.push(match[0]);
    /*
      Emails, added with the mask itself and worth a sentence about why they
      were not here before. This extractor was written from the same list as
      the masker, so a protection the masker did not have was one this could
      not miss. Two lists agreeing with each other is the shape of every fault
      found tonight; here it kept a real corruption invisible across a fuzzed
      corpus specifically built to catch exactly this.
    */
    for (const match of noFences.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
      spans.push(match[0]);
    }
    /*
      Indented code, added with its mask rather than after the fact. The email
      hole survived precisely because this extractor and the masker were written
      from one list at different times; adding the protection without teaching
      the corpus about it would repeat that in the same file that documents it.
    */
    /*
      From `text`, not `noFences`, and the difference matters: removing a fence
      changes what precedes a line, so a lookbehind can match here and not in
      the masker. Anything inside a fence is protected as fenced code anyway, so
      claiming it twice costs nothing and asserting on the real string costs a
      false failure less.
    */
    for (const match of text.matchAll(/(?<=\S[ \t]*\n[ \t]*\n)(?:(?: {4,}|\t)[^\n]*(?:\n|$))+/g)) {
      spans.push(match[0]);
    }
    return spans;
  };

  it('keeps every protected span, byte for byte', () => {
    const CORPUS = prompts(97, 800);
    const lost = [];
    let seen = 0;
    for (const { text, level } of CORPUS) {
      const spans = protectedSpans(text);
      if (spans.length === 0) continue;
      seen += spans.length;
      const { optimized } = optimize(text, { level });
      for (const span of spans) {
        if (!optimized.includes(span)) {
          lost.push({ level, span: JSON.stringify(span.slice(0, 60)), input: JSON.stringify(text.slice(0, 80)) });
        }
      }
    }
    assert.ok(seen > 300, `only ${seen} protected spans in the corpus — the atoms have drifted`);
    assert.deepEqual(lost.slice(0, 5), [], `${lost.length} of ${seen} protected spans did not survive`);
  });

  it('and the extractor can see a loss, on a case written for it', () => {
    // The property above passes on this repository, which is the state a
    // guard is least able to prove itself in: hand the checker an output that
    // really did lose the span.
    const text = 'Keep `this span` safe.';
    const spans = protectedSpans(text);
    assert.deepEqual(spans, ['`this span`']);
    assert.ok(!'Keep  safe.'.includes(spans[0]));
  });
});
