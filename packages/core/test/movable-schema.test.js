import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OUTPUT_CUES_BY_LANGUAGE,
  PHRASE_LANGUAGES,
  estimateTokens,
  findMovableSchema,
  optimize,
} from '../dist/index.js';

/**
 * A schema in the prompt that the request could carry instead.
 *
 * The interesting half of this file is the refusals. A fenced JSON block is one
 * of two completely different things — an output contract, which moves for free,
 * or data a few-shot example needs, which breaks the prompt if you move it — and
 * everything here exists to make sure the second kind is never named.
 */

const SCHEMA = [
  '```json',
  '{',
  '  "category": "payment | shipping",',
  '  "reply": "text for the customer",',
  '  "escalate_to_human": false',
  '}',
  '```',
].join('\n');

const find = (prompt) => findMovableSchema(prompt, estimateTokens);

describe('what it finds', () => {
  it('a schema introduced as the output format', () => {
    const found = find(`You are an agent.\n\nOutput format:\n\n${SCHEMA}\n\nQuery: {{q}}`);
    assert.ok(found);
    assert.equal(found.blocks, 1);
    assert.deepEqual(found.keys.sort(), ['category', 'escalate_to_human', 'reply']);
    assert.ok(found.tokens > 0);
  });

  it('counts the fences too, because all of it leaves the prompt', () => {
    const found = find(`Output format:\n\n${SCHEMA}\n\nQuery: {{q}}`);
    // The block including its ``` lines, not just the JSON inside.
    assert.equal(found.tokens, estimateTokens(SCHEMA));
  });

  it('a cue in any covered language', () => {
    const cues = {
      en: 'Output format:',
      es: 'Formato de salida:',
      fr: 'Format de sortie :',
      de: 'Ausgabeformat:',
      pt: 'Formato de saída:',
      it: 'Formato di output:',
      nl: 'Uitvoerformaat:',
    };
    for (const [code, cue] of Object.entries(cues)) {
      assert.ok(find(`${cue}\n\n${SCHEMA}\n\nx: {{q}}`), `${code} cue did not match`);
    }
  });

  it('a cue however it is capitalised, accented or punctuated', () => {
    // Normalised the way every other comparison in this package normalises. A
    // dictionary that only matched `Formato de salida:` would cover Spanish on
    // paper and miss most real prompts.
    for (const lead of ['FORMATO DE SALIDA —', 'formato de salida...', 'Formato De Salida']) {
      assert.ok(find(`${lead}\n\n${SCHEMA}\n\nx: {{q}}`), lead);
    }
  });

  it('several schema blocks, summed', () => {
    const found = find(
      `Output format:\n\n${SCHEMA}\n\nOn error, respond with:\n\n${SCHEMA}\n\nQuery: {{q}}`,
    );
    assert.equal(found.blocks, 2);
    assert.ok(found.tokens > estimateTokens(SCHEMA));
  });
});

describe('what it refuses to find', () => {
  it('a few-shot example whose JSON is input data', () => {
    /**
     * The one that matters. Moving this block into a response schema would
     * delete data the prompt needs and leave a prompt that no longer works —
     * the only way this analysis could actively harm somebody.
     */
    assert.equal(find(`Example input:\n\n${SCHEMA}\n\nNow classify: {{q}}`), null);
    assert.equal(find(`Here is the record to summarise:\n\n${SCHEMA}\n\nSummary:`), null);
  });

  it('a schema with no cue at all', () => {
    // "Probably an output format" is not good enough when being wrong costs
    // somebody a working prompt.
    assert.equal(find(`You are an agent.\n\n${SCHEMA}\n\nQuery: {{q}}`), null);
  });

  it('a cue that comes after the block rather than before it', () => {
    // Order carries the meaning: the phrase introduces the block below it. A
    // window that looked both ways would match the wrong block in
    // "Input: {...}\n\nOutput format: ...".
    assert.equal(find(`${SCHEMA}\n\nThat was the output format.\n\nQuery: {{q}}`), null);
  });

  it('a block labelled as something other than JSON', () => {
    const python = '```python\nd = {"category": 1, "reply": 2, "escalate_to_human": 3}\n```';
    assert.equal(find(`Output format:\n\n${python}\n\nQuery: {{q}}`), null);
  });

  it('a shape with fewer than three keys', () => {
    // An illustration, not a contract worth moving. Same threshold as the
    // restated-format advisory, for the same reason.
    const small = '```json\n{\n  "a_field": 1,\n  "b_field": 2\n}\n```';
    assert.equal(find(`Output format:\n\n${small}\n\nQuery: {{q}}`), null);
  });

  it('a prompt in a language the cue dictionaries do not cover', () => {
    /**
     * A false negative, and it states itself as one rather than being papered
     * over. The alternative is matching an English cue inside Japanese prose and
     * calling the result a saving — this repository already shipped one
     * dictionary bug of that shape and does not want a second.
     */
    assert.equal(find(`あなたはエージェントです。\n\n出力形式:\n\n${SCHEMA}\n\n質問: {{q}}`), null);
  });

  it('nothing at all, on prompts with no fenced block', () => {
    assert.equal(find('Output format: a JSON object with three fields.\n\nQuery: {{q}}'), null);
    assert.equal(find(''), null);
  });
});

describe('the cue dictionaries', () => {
  it('cover every language the rules cover', () => {
    /**
     * Counted on the exported object rather than scraped out of the source, and
     * asserted per language: the behavioural test above passes on whatever its
     * fixture happens to contain, which is exactly how this repository's original
     * two-language hole survived a whole suite.
     */
    const thin = PHRASE_LANGUAGES.filter(
      (code) => (OUTPUT_CUES_BY_LANGUAGE[code] ?? []).length < 8,
    );
    assert.deepEqual(thin, [], `these languages have too few output cues: ${thin.join(', ')}`);
  });

  it('lists no language the rules do not cover', () => {
    // A cue for a language whose rules never run is a claim of coverage that
    // does not exist.
    const extra = Object.keys(OUTPUT_CUES_BY_LANGUAGE).filter(
      (code) => !PHRASE_LANGUAGES.includes(code),
    );
    assert.deepEqual(extra, []);
  });
});

describe('the advisory it raises', () => {
  const prompt = `You are a support agent.\n\nOutput format:\n\n${SCHEMA}\n\nQuery: {{q}}`;

  it('appears with a figure and names the cue', () => {
    const { advisories } = optimize(prompt, { usage: { callsPerMonth: 50_000 } });
    const found = advisories.find((a) => a.id === 'movable-output-schema');
    assert.ok(found, 'the advisory was not raised');
    assert.equal(found.severity, 'opportunity');
    assert.ok(found.estimatedMonthlyUsd > 0, 'no figure attached');
    assert.match(found.detail, /output format/i, 'the cue is not quoted');
  });

  it('says out loud that it does not check the provider', () => {
    /**
     * The uncertainty belongs in the text, not in a withheld figure. Trazum knows
     * how many tokens the block holds — that is reproducible — and cannot know
     * from here whether the provider accepts a response schema. Saying so is what
     * keeps the number honest.
     */
    const { advisories } = optimize(prompt);
    const found = advisories.find((a) => a.id === 'movable-output-schema');
    assert.match(found.detail, /does not check whether your provider/i);
  });

  it('is not raised on a prompt whose JSON is input data', () => {
    const { advisories } = optimize(`Example input:\n\n${SCHEMA}\n\nNow classify: {{q}}`);
    assert.equal(
      advisories.some((a) => a.id === 'movable-output-schema'),
      false,
    );
  });

  it('never edits the prompt, because it cannot make this change', () => {
    /**
     * It changes the call, not the text. A rule that deleted the schema would
     * leave a prompt asking for a shape it no longer describes, sent to a client
     * nobody updated — strictly worse than the prompt it started from.
     */
    const { optimized } = optimize(prompt, { level: 'aggressive' });
    assert.ok(optimized.includes('escalate_to_human'), 'the schema was edited out');
    assert.ok(optimized.includes('```json'), 'the fence was edited out');
  });
});

describe('short field names still count', () => {
  it('a schema whose fields are called id, ok and n', () => {
    /**
     * The first draft filtered keys shorter than three characters, copied from
     * the restated-format detector where it stops a two-letter key matching a
     * word in prose. Nothing is matched against prose here, so all that filter
     * did was undercount real schemas. A mutation run found it by deleting it and
     * changing no test — which is what a line with no reason looks like.
     */
    const short = '```json\n{\n  "id": 1,\n  "ok": true,\n  "n": 2\n}\n```';
    const found = find(`Output format:\n\n${short}\n\nQuery: {{q}}`);
    assert.ok(found, 'a three-field schema with short names was ignored');
    assert.deepEqual(found.keys.sort(), ['id', 'n', 'ok']);
  });
});
