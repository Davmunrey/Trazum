import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, assemble, profileUsage, rollUp } from '../dist/index.js';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The promises `docs/json-output.md` opens with, run over what the package
 * builds.
 *
 * Five bullets sit under `## The promise`, and until now **one of them was
 * enforced**: absence is null and never zero, checked on five fields of one
 * document. The other four were prose. All four held when this was written —
 * measured, not assumed, over 414 dollar leaves and 296 token leaves across
 * three documents — which is exactly the state in which a promise quietly stops
 * being true, because nothing would say so.
 *
 * The section's own text is harvested first: deleting a promise from the page
 * fails here, so the guard cannot outlive the claim it enforces or the other
 * way round.
 *
 * Doctrine: [Not recorded is not not-happened](../../../docs/doctrine.md#not-recorded-is-not-not-happened)
 */

const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/** A log rich enough that every priced finding has something to say. */
const LOG = (() => {
  const models = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'no-such-model'];
  const labels = ['chat', 'batch', 'summarise'];
  const lines = [];
  for (let day = 1; day <= 8; day += 1) {
    for (let i = 0; i < 6; i += 1) {
      lines.push(
        JSON.stringify({
          model: models[(day + i) % models.length],
          label: labels[(day + i) % labels.length],
          session: `s${(day + i) % 4}`,
          ts: `2026-08-0${day}T${String((i * 3) % 24).padStart(2, '0')}:0${i}:00Z`,
          stop_reason: i % 5 === 0 ? 'max_tokens' : 'end_turn',
          outcome: i % 3 === 0 ? 'fail' : 'ok',
          max_tokens: 1024,
          usage: {
            input_tokens: 1000 + i * 777 + day * 13,
            output_tokens: 100 + i * 37,
            cache_read_input_tokens: i * 211,
            cache_creation_input_tokens: (i % 2) * 333,
          },
        }),
      );
    }
  }
  return `${lines.join('\n')}\n`;
})();

/** Every document this package can build from its own exports. */
const built = (log = LOG) => {
  const profile = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
  return {
    profile,
    'roll-up': rollUp([{ name: 'a', text: JSON.stringify(profile) }]),
    'prompt-draft': assemble(
      {
        role: 'A support engineer.',
        task: 'Summarise a ticket.',
        inputs: 'The ticket body.',
        'output-shape': 'prose',
        model: 'claude-opus-5',
        budget: '20',
      },
      { callsPerMonth: 1000 },
    ),
  };
};

/** Every leaf, with the dotted path that reached it. */
const leaves = (node, path, out = []) => {
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) leaves(value, `${path}.${key}`, out);
    return out;
  }
  out.push([path, node]);
  return out;
};

const nameOf = (path) => path.split('.').pop() ?? '';
const isMoney = (path) => nameOf(path).toLowerCase().endsWith('usd');
const isTokens = (path) => nameOf(path).toLowerCase().endsWith('tokens');

const everyLeaf = (documents) =>
  Object.entries(documents).flatMap(([name, document]) => leaves(document, name));

describe('the promises docs/json-output.md opens with', () => {
  it('still states all five, so this file cannot outlive them', async () => {
    const promise = sectionOf(await readFile(DOC, 'utf8'), '## The promise');
    const bullets = [...promise.matchAll(/^- \*\*/gm)].length;
    assert.equal(bullets, 5, `the promise section has ${bullets} bullets`);
    assert.match(promise, /Dollars are numbers, not strings/);
    assert.match(promise, /never rounded for display/);
    assert.match(promise, /Token counts are integers/);
    assert.match(promise, /carries a session key or prompt text/);
    assert.match(promise, /Absence is `null` or an empty array, never zero/);
  });

  it('has documents to check, so nothing below passes on an empty set', () => {
    const all = everyLeaf(built());
    assert.ok(all.filter(([path]) => isMoney(path)).length > 100, 'too few dollar figures');
    assert.ok(all.filter(([path]) => isTokens(path)).length > 100, 'too few token counts');
  });

  it('writes every dollar as a number, never a string', () => {
    const wrong = everyLeaf(built())
      .filter(([path]) => isMoney(path))
      .filter(([, value]) => value !== null && typeof value !== 'number');
    assert.deepEqual(wrong.map(([path]) => path), [], 'a dollar figure is not a number');
  });

  it('rounds nothing for display — the terminal rounds, the JSON does not', () => {
    /**
     * Absence of rounding cannot be proved from one document, so this proves
     * the opposite of the failure: a document whose dollars had been through
     * `toFixed(2)` would carry **none** with more than two decimals. Requiring
     * a real share of them is the check that fails the day somebody rounds on
     * the way out.
     */
    const money = everyLeaf(built())
      .filter(([path]) => isMoney(path))
      .map(([, value]) => value)
      .filter((value) => typeof value === 'number' && value !== 0);
    const deep = money.filter((value) => {
      const decimals = String(value).split('.')[1];
      return decimals !== undefined && decimals.length > 2;
    });
    assert.ok(
      deep.length > money.length / 2,
      `only ${deep.length} of ${money.length} dollar figures carry more than two decimals — has something rounded on the way out?`,
    );
  });

  it('counts every token as an integer', () => {
    const wrong = everyLeaf(built())
      .filter(([path]) => isTokens(path))
      .filter(([, value]) => value !== null && !Number.isInteger(value));
    assert.deepEqual(wrong.map(([path]) => path), [], 'a token count is not an integer');
  });

  it('carries no session key and no prompt text out of a log that has both', () => {
    // The log format lets a record carry anything. What comes back must carry
    // none of it — and the session must still be *seen*, or the check would
    // pass on a build that dropped the record entirely.
    const marked = `${JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      session: 'SESSIONKEY-42',
      ts: '2026-08-01T10:00:00Z',
      prompt: 'PROMPTTEXT',
      system: 'SYSTEMTEXT',
      completion: 'COMPLETIONTEXT',
      content: 'CONTENTTEXT',
      messages: [{ role: 'user', content: 'MESSAGETEXT' }],
      usage: { input_tokens: 200_000, output_tokens: 10 },
    })}\n`;
    const documents = built(marked);
    const text = JSON.stringify(documents);
    for (const marker of [
      'SESSIONKEY-42',
      'PROMPTTEXT',
      'SYSTEMTEXT',
      'COMPLETIONTEXT',
      'CONTENTTEXT',
      'MESSAGETEXT',
    ]) {
      assert.ok(!text.includes(marker), `${marker} reached the output`);
    }
    assert.equal(documents.profile.hasSessions, true, 'the record was dropped, not redacted');
  });
});

describe('and the walk can see each failure, on documents written for the purpose', () => {
  /**
   * Every check above passes on this repository today, which is the state a
   * guard is least able to prove itself in. Each one is handed the shape it
   * exists to refuse.
   */
  const money = (document) =>
    leaves(document, 'made')
      .filter(([path]) => isMoney(path))
      .map(([, value]) => value);

  it('sees a dollar written as a string', () => {
    const wrong = leaves({ totalUsd: '10.59' }, 'made')
      .filter(([path]) => isMoney(path))
      .filter(([, value]) => typeof value !== 'number');
    assert.equal(wrong.length, 1);
  });

  it('sees a document whose dollars have all been rounded', () => {
    const rounded = { a: { totalUsd: 10.59 }, b: { spentUsd: 8.82 }, c: { savingUsd: 0.53 } };
    const values = money(rounded).filter((value) => value !== 0);
    const deep = values.filter((value) => (String(value).split('.')[1] ?? '').length > 2);
    assert.equal(deep.length, 0, 'the rounded document looked unrounded');
    assert.ok(!(deep.length > values.length / 2), 'the check would have passed a rounded document');
  });

  it('sees a token count with a fraction in it', () => {
    const wrong = leaves({ inputTokens: 1200.5 }, 'made')
      .filter(([path]) => isTokens(path))
      .filter(([, value]) => !Number.isInteger(value));
    assert.equal(wrong.length, 1);
  });

  it('sees text buried deep in a document rather than only at the top', () => {
    // The leak this would actually be: a marker three levels down, inside an
    // array, in a field nobody thought about.
    const leaked = { byLabel: [{ label: 'chat', detail: { note: 'PROMPTTEXT' } }] };
    assert.ok(JSON.stringify(leaked).includes('PROMPTTEXT'));
  });
});
