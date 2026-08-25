import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeCachePrefix,
  estimateTokens,
  reorderForCache,
} from '../dist/index.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Straight from the module rather than the public entry point: the coverage
// table is an implementation detail, and these tests are about keeping it
// honest, not about promising it to anyone.
import { BACKWARD_REFERENCES_BY_LANGUAGE, UNCOVERED_SCRIPTS } from '../dist/phrases.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Reordering is the largest saving Trazum can make and the only transformation
 * that moves text rather than deleting it. Every other rule's mistake is local;
 * this one's changes what the prompt asks for.
 *
 * So the tests are weighted the way the risk is: a handful assert that it works,
 * and the rest assert that it **refuses**.
 */

const RULES = Array.from(
  { length: 40 },
  (_, i) => `- Rule ${i + 1}: verify the order identifier before quoting a policy.`,
).join('\n');

describe('what it moves', () => {
  it('puts stable instructions in front of the placeholder', () => {
    const before = `You are an agent.

Customer message: {{message}}

Always answer in the customer's language.

Never promise a delivery date.`;

    const r = reorderForCache(before);
    assert.equal(r.moved.length, 2);
    assert.ok(
      r.text.indexOf("Always answer") < r.text.indexOf('{{message}}'),
      'the instruction should now precede the placeholder',
    );
    assert.ok(
      r.text.indexOf('You are an agent') < r.text.indexOf('Always answer'),
      'the role statement should stay first',
    );
  });

  it('grows the cacheable prefix, measured rather than claimed', () => {
    // The point of the whole module. Same content, and the analyser agrees the
    // prefix got bigger — this is the number the saving is computed from.
    const stranded = `You are an agent.\n\nCustomer message: {{message}}\n\n${RULES}`;
    const r = reorderForCache(stranded);

    assert.ok(r.prefixTokensAfter > r.prefixTokensBefore * 50, 'the prefix barely moved');
    assert.equal(
      analyzeCachePrefix(r.text, estimateTokens).stablePrefixTokens,
      r.prefixTokensAfter,
      'the reported prefix disagrees with the analyser the advisories use',
    );
    // Not exactly 0: the prompt still ends with a newline after the placeholder,
    // which the estimator counts as a token. What matters is that the 1,000
    // tokens of instructions are no longer stranded there.
    assert.ok(
      analyzeCachePrefix(r.text, estimateTokens).staticTokensAfter <= 2,
      'stable content is still stranded after the placeholder',
    );
  });

  it('keeps the same content, only in a different order', () => {
    // The one invariant that makes this safe to offer at all: reordering must
    // not delete or invent anything. Compared on sorted words so the check is
    // about content rather than arrangement.
    const before = `You are an agent.\n\nInput: {{x}}\n\nRule one.\n\nRule two.`;
    const after = reorderForCache(before).text;

    const words = (t) => t.split(/\s+/).filter(Boolean).sort().join(' ');
    assert.equal(words(after), words(before), 'reordering changed the content');
  });

  it('leaves the placeholder line intact', () => {
    // "Customer message: {{message}}" is one unit; splitting it would strand
    // the label in the prefix and leave the value with no introduction.
    const r = reorderForCache(`Agent.\n\nCustomer message: {{message}}\n\nBe brief.`);
    assert.match(r.text, /Customer message: \{\{message\}\}/);
  });

  it('reports how much moved', () => {
    const r = reorderForCache(`Agent.\n\nInput: {{x}}\n\n${RULES}`);
    assert.ok(r.tokensMoved > 500);
    assert.equal(
      r.tokensMoved,
      r.moved.reduce((sum, b) => sum + b.tokens, 0),
      'tokensMoved disagrees with the blocks it says it moved',
    );
  });
});

describe('what it refuses to move', () => {
  it('pins a block that refers backwards, and says which phrase did it', () => {
    // "Summarise the text above" is correct where it sits and nonsense in front
    // of the text it points at.
    const prompt = `Agent.

Customer message: {{message}}

Summarise the text above in one sentence.`;

    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0);
    assert.equal(r.text, prompt, 'the prompt must come back byte-identical');
    assert.equal(r.declined[0].reason, 'backward-reference');
    assert.equal(r.declined[0].phrase, 'above');
  });

  it('pins everything after a pinned block', () => {
    // Moving a later block past one that had to stay changes their order
    // relative to each other, which is the same class of harm.
    const prompt = `Agent.

Input: {{x}}

Summarise the text above.

Always answer in English.

Never invent a price.`;

    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0, 'a block after a pinned one moved anyway');
    assert.equal(r.text, prompt);
    assert.deepEqual(
      r.declined.map((d) => d.reason),
      ['backward-reference', 'after-pinned', 'after-pinned'],
    );
  });

  it('recognises a backward reference in Spanish too', () => {
    // Real prompts mix languages, and the dictionaries cover both on purpose.
    const prompt = `Agente.\n\nMensaje: {{mensaje}}\n\nResume el texto anterior.`;
    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0);
    assert.equal(r.declined[0].phrase, 'anterior');
  });

  it('is not fooled by a word that merely contains a reference', () => {
    // "aboveboard" is not "above". A false positive here costs a real saving.
    const prompt = `Agent.\n\nInput: {{x}}\n\nKeep everything aboveboard and honest.`;
    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 1, 'a lookalike word pinned the block');
  });

  it('does nothing without a placeholder', () => {
    // No placeholder means the whole prompt already caches. There is nothing to
    // gain and a diff for its own sake is worse than no diff.
    const prompt = 'A plain prompt with no template variables.';
    const r = reorderForCache(prompt);
    assert.equal(r.text, prompt);
    assert.equal(r.moved.length, 0);
  });

  it('never moves a block containing a placeholder of its own', () => {
    const prompt = `Agent.\n\nFirst: {{a}}\n\nBe brief.\n\nSecond: {{b}}`;
    const r = reorderForCache(prompt);
    for (const block of r.moved) {
      assert.doesNotMatch(block.text, /\{\{/, 'a block with a placeholder was moved');
    }
  });

  it('declines when the prefix still would not reach the cacheable minimum', () => {
    // A prefix below the model's minimum caches nothing at all, so a
    // rearrangement that does not clear it buys nothing and the prompt comes
    // back untouched rather than churned for a diff worth zero.
    const prompt = `Agent.\n\nInput: {{x}}\n\nBe brief.`;
    const r = reorderForCache(prompt, { minPrefixTokens: 500 });
    assert.equal(r.text, prompt);
    assert.equal(r.moved.length, 0);
  });

  it('does not refuse a small move onto a prefix that already caches', () => {
    // The bar is the resulting prefix, not the amount moved. A head that
    // already clears the minimum gains from any block that joins it, and
    // checking the wrong quantity refuses a real saving while reporting that
    // nothing could move — which is not what happened.
    const head = Array.from(
      { length: 60 },
      (_, i) => `- Policy ${i + 1}: confirm the order identifier before quoting anything.`,
    ).join('\n');
    const prompt = `${head}\n\nCustomer message: {{message}}\n\n- Never promise a delivery date.`;

    const r = reorderForCache(prompt, { minPrefixTokens: 512 });
    assert.ok(r.prefixTokensBefore > 512, 'the fixture no longer starts above the minimum');
    assert.equal(r.moved.length, 1, 'a block that would have joined a caching prefix was refused');
    assert.ok(r.prefixTokensAfter > r.prefixTokensBefore);
  });

  it('reports refusals even when nothing moved', () => {
    // "No saving here" and "there was a saving and it was not safe to take" are
    // different answers, and the author can only act on the second one.
    const r = reorderForCache(`Agent.\n\nInput: {{x}}\n\nUse the text above.`);
    assert.equal(r.moved.length, 0);
    assert.ok(r.declined.length > 0, 'a refusal happened and was not reported');
  });
});

describe('the seams it rebuilds', () => {
  it('does not open the prompt with a blank line when the placeholder was first', () => {
    // With no head, the moved blocks become the start of the prompt. Emitting the
    // usual leading gap would put a blank line at byte zero — which changes the
    // cache prefix for no reason at all.
    const r = reorderForCache('Input: {{x}}\n\nBe brief.\n\nBe kind.');
    assert.equal(r.moved.length, 2);
    assert.doesNotMatch(r.text, /^\s/, 'the rearranged prompt starts with whitespace');
    assert.equal(r.text, 'Be brief.\n\nBe kind.\n\nInput: {{x}}');
  });

  it('keeps CRLF line endings when that is what the prompt used', () => {
    // A prompt written on Windows must not come back with every seam converted.
    // Nobody asked for a reformat, and where the product is a byte-for-byte
    // prefix match, a changed byte is a changed price.
    const before = 'You are an agent.\r\n\r\nInput: {{x}}\r\n\r\nBe brief.\r\n';
    const r = reorderForCache(before);

    assert.equal(r.moved.length, 1);
    assert.ok(r.text.includes('\r\n'), 'the CRLF endings were dropped');
    assert.doesNotMatch(
      r.text,
      /(?<!\r)\n/,
      'the output mixes bare newlines into a CRLF prompt',
    );
  });

  it('does not introduce CRLF into a prompt that had none', () => {
    const r = reorderForCache('Agent.\n\nInput: {{x}}\n\nBe brief.');
    assert.doesNotMatch(r.text, /\r/, 'a carriage return appeared out of nowhere');
  });

  it('ends the prompt however the author ended it', () => {
    // A block carries the blank line that followed it, so trimming the seams
    // without restoring the original ending silently adds or drops a newline.
    for (const ending of ['', '\n', '\n\n\n']) {
      const prompt = `Agent.\n\nInput: {{x}}\n\nBe brief.${ending}`;
      const r = reorderForCache(prompt);
      assert.equal(r.moved.length, 1);
      assert.equal(
        /\s*$/.exec(r.text)[0],
        ending,
        `the ending changed for ${JSON.stringify(ending)}`,
      );
    }
  });

  it('leaves exactly one blank line between blocks', () => {
    const r = reorderForCache('Agent.\n\nInput: {{x}}\n\nBe brief.\n\nBe kind.\n\nBe honest.');
    assert.equal(r.moved.length, 3);
    assert.doesNotMatch(r.text, /\n{3}/, 'the rejoin left a three-newline gap');
  });
});

describe('protected content survives', () => {
  it('does not move a code fence into the prefix and break it', () => {
    const prompt = `Agent.

Input: {{x}}

\`\`\`json
{ "ok": true }
\`\`\``;
    const r = reorderForCache(prompt);
    assert.match(r.text, /```json\n\{ "ok": true \}\n```/, 'the fence was damaged');
  });

  it('leaves a URL untouched', () => {
    const prompt = `Agent.\n\nInput: {{x}}\n\nSee https://example.com/a?b=c&d=e for the catalogue.`;
    const r = reorderForCache(prompt);
    assert.match(r.text, /https:\/\/example\.com\/a\?b=c&d=e/);
  });
});

describe('the refusals apply to every language, not just the two', () => {
  /**
   * The hole this suite was blind to for its whole existence.
   *
   * `BACKWARD_REFERENCES` held English and Spanish and was applied to every
   * prompt, so a French, German, Portuguese, Italian, Dutch, Japanese or
   * Chinese author ran `--reorder` with none of the protection this module is
   * built out of. Every test above passed. They only ever asked the question in
   * two languages.
   *
   * Each fixture below is the same shape: an instruction that points backwards,
   * sitting after the placeholder, where moving it would produce nonsense.
   */
  const PINNED = {
    fr: 'Vous êtes un agent.\n\nMessage : {{message}}\n\nRésumez le texte ci-dessus en une phrase.\n',
    de: 'Du bist ein Agent.\n\nNachricht: {{message}}\n\nFasse den Text oben in einem Satz zusammen.\n',
    pt: 'Você é um agente.\n\nMensagem: {{message}}\n\nResuma o texto acima numa frase.\n',
    it: 'Sei un agente.\n\nMessaggio: {{message}}\n\nRiassumi il testo sopra in una frase.\n',
    nl: 'Je bent een agent.\n\nBericht: {{message}}\n\nVat de tekst hierboven samen in één zin.\n',
    ja: 'あなたはエージェントです。\n\nメッセージ: {{message}}\n\n上記のテキストを一文で要約してください。\n',
    zh: '你是一个客服。\n\n消息：{{message}}\n\n请用一句话总结上述文本。\n',
  };

  for (const [language, prompt] of Object.entries(PINNED)) {
    it(`will not hoist a backward reference written in ${language}`, () => {
      const result = reorderForCache(prompt);

      assert.equal(result.moved.length, 0, `a ${language} backward reference was moved`);
      assert.equal(result.text, prompt, 'the prompt came back changed');
      assert.equal(result.declined[0]?.reason, 'backward-reference');
      assert.ok(result.declined[0]?.phrase, 'the refusal does not name the phrase it found');
    });
  }

  it('still moves what is genuinely safe in those languages', () => {
    // The other half. A guard that refuses everything is not a guard, it is an
    // off switch, and these tests would pass just as well with one.
    const safe =
      'Vous êtes un agent du service client.\n\nMessage : {{message}}\n\n' +
      'Répondez toujours en français.\n\nGardez un ton formel.\n';
    const result = reorderForCache(safe);

    assert.equal(result.moved.length, 2, 'nothing moved in a French prompt with no reference');
    assert.ok(result.text.indexOf('Répondez toujours') < result.text.indexOf('{{message}}'));
  });

  it('matches CJK without word boundaries, which would never fire', () => {
    // 上記 sits between two kanji. The boundary test asks whether the
    // neighbouring character is a letter, and in Japanese it always is — so a
    // boundary-matched CJK list reads like cover and provides none.
    const result = reorderForCache(PINNED.ja);
    assert.equal(result.declined[0]?.phrase, '上記');
  });

  it('does not let a Latin phrase match inside a longer word', () => {
    // The other direction, still true: word boundaries stay on for languages
    // that have them.
    const prompt = 'Agent.\n\nInput: {{x}}\n\nKeep everything aboveboard and be brief.\n';
    const result = reorderForCache(prompt);
    assert.equal(result.moved.length, 1, '"aboveboard" pinned a block');
  });
});

describe('a script with no phrase list is refused, not guessed at', () => {
  /**
   * The fourth refusal. Adding seven languages does not cover Russian, Arabic,
   * Hebrew, Korean, Hindi, Thai or Greek — and the previous behaviour for those
   * was to rearrange freely and report a saving, because there was nothing to
   * recognise a backward reference with. Refusing is the honest answer until
   * somebody adds the array.
   */
  const RUSSIAN =
    'Вы агент поддержки.\n\nСообщение: {{message}}\n\nВсегда отвечайте по-русски.\n';

  it('moves nothing and says which script stopped it', () => {
    const result = reorderForCache(RUSSIAN);

    assert.equal(result.moved.length, 0);
    assert.equal(result.text, RUSSIAN, 'the prompt was rearranged anyway');
    assert.equal(result.declined[0]?.reason, 'uncovered-script');
    assert.equal(result.declined[0]?.script, 'Cyrillic');
  });

  it('refuses on a single foreign instruction inside an English prompt', () => {
    // The dangerous case rather than the obvious one: a prompt that is mostly
    // English with one instruction Trazum cannot read is exactly where a missed
    // reference does damage.
    const mixed =
      'You are a support agent.\n\nMessage: {{message}}\n\nAlways answer in English.\n\n' +
      'Подведите итог текста выше.\n';
    const result = reorderForCache(mixed);

    assert.equal(result.moved.length, 0);
    assert.equal(result.declined[0]?.reason, 'uncovered-script');
  });

  it('leaves covered prompts alone', () => {
    // The negative control. If the script check were too eager — matching, say,
    // an accented Latin character — it would switch reordering off for most of
    // Europe and every test above would still pass.
    const french =
      'Vous êtes un agent.\n\nMessage : {{message}}\n\nRépondez toujours en français.\n';
    const result = reorderForCache(french);
    assert.equal(
      result.declined.find((d) => d.reason === 'uncovered-script'),
      undefined,
      'French was treated as an uncovered script',
    );
    assert.equal(result.moved.length, 1);
  });
});

describe('the documented coverage is the actual coverage', () => {
  it('README names every language the phrase table has, and no others', () => {
    // The claim in the README is a promise to somebody deciding whether Trazum
    // is safe for their prompts. A language added to the table and not to the
    // documentation is a capability nobody finds; one documented and not added
    // is the exact failure this whole change is about, restated in prose.
    const names = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      it: 'Italian',
      nl: 'Dutch',
      ja: 'Japanese',
      zh: 'Chinese',
    };
    // The chapter moved with the rest of the deep documentation in the
    // README split; the promise and this guard moved with it.
    const readme = readFileSync(join(repoRoot, 'docs/commands.md'), 'utf8');
    const documented = readme.slice(
      readme.indexOf('A block that refers backwards stays put'),
      readme.indexOf('Only whole blocks move'),
    );
    assert.ok(documented.length > 0, 'the refusal list has moved out of docs/commands.md');

    for (const code of Object.keys(BACKWARD_REFERENCES_BY_LANGUAGE)) {
      const name = names[code];
      assert.ok(name, `phrases.ts has a language "${code}" this test does not know about`);
      assert.ok(documented.includes(name), `${name} is in phrases.ts but not in the README`);
    }
    for (const [code, name] of Object.entries(names)) {
      if (documented.includes(name)) {
        assert.ok(
          BACKWARD_REFERENCES_BY_LANGUAGE[code],
          `the README promises ${name} and phrases.ts has no list for it`,
        );
      }
    }
  });

  it('every phrase list is lowercase, since matching lowercases the prompt', () => {
    // A capitalised entry can never match. It would sit in the list looking like
    // coverage and provide none, which is the failure mode this file exists to
    // stop being possible.
    const wrong = [];
    for (const [code, set] of Object.entries(BACKWARD_REFERENCES_BY_LANGUAGE)) {
      for (const phrase of set.phrases) {
        if (phrase !== phrase.toLowerCase()) wrong.push(`${code}: ${phrase}`);
      }
    }
    assert.deepEqual(wrong, [], `these phrases can never match:\n  ${wrong.join('\n  ')}`);
  });

  it('no uncovered script overlaps a language that is covered', () => {
    // If a covered language's phrases used a script on the uncovered list, that
    // language would be refused outright and its phrases would be dead code.
    const offenders = [];
    for (const [code, set] of Object.entries(BACKWARD_REFERENCES_BY_LANGUAGE)) {
      for (const phrase of set.phrases) {
        const hit = UNCOVERED_SCRIPTS.find((s) => s.pattern.test(phrase));
        if (hit) offenders.push(`${code}: "${phrase}" is ${hit.name}`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join('; '));
  });
});
