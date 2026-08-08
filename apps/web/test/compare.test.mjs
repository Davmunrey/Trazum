import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * `POST /api/compare`, called for real.
 *
 * The hazard this endpoint carries is not a missing field or an unescaped
 * string — it is a **sign**. Every other figure Trazum produces is a saving,
 * where positive is good. Every figure here is `after - before`, where positive
 * means the edit made things worse. Getting that backwards would not throw, would
 * not fail a typecheck, and would tell somebody their prompt got cheaper on the
 * commit that doubled its cost.
 *
 * So most of what follows asserts a direction rather than a value.
 */

register('./helpers/loader.mjs', import.meta.url);

/** Short, dense: nothing for the rules to take. */
const LEAN = 'Classify the ticket in {{t}}. Answer with the category only.';
/** The same instruction, padded. Longer, and the rules find things in it. */
const PADDED =
  'Please, in order to help, I would kindly ask you to carefully classify the ticket '
  + 'in {{t}}. It is very important that you always double-check. Answer with the '
  + 'category only. Thank you very much!';

let POST;

before(async () => {
  ({ POST } = await import('../app/api/compare/route.ts'));
});

async function post(body, headers = {}) {
  const response = await POST(
    new Request('http://localhost/api/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const usage = { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 300 };

describe('positive means worse, in every figure', () => {
  it('a prompt that grew reports positive tokens and positive money', async () => {
    const { status, body } = await post({ before: LEAN, after: PADDED, usage });

    assert.equal(status, 200);
    assert.ok(body.tokenDelta > 0, `grew but tokenDelta is ${body.tokenDelta}`);
    assert.ok(body.deltaPct > 0);
    assert.ok(body.monthlyDeltaUsd > 0, `grew but monthlyDeltaUsd is ${body.monthlyDeltaUsd}`);
    assert.ok(body.perCallDeltaUsd > 0);
    assert.equal(body.tokenDelta, body.tokensAfter - body.tokensBefore);
  });

  it('and the same pair swapped reports the exact negatives', async () => {
    // The half that a single-direction test cannot see: a route that returned
    // `Math.abs(delta)` would pass the test above and be wrong in the direction
    // that matters, because "your edit saved money" is the reading somebody acts
    // on.
    const grew = await post({ before: LEAN, after: PADDED, usage });
    const shrank = await post({ before: PADDED, after: LEAN, usage });

    assert.equal(shrank.body.tokenDelta, -grew.body.tokenDelta);
    assert.equal(shrank.body.monthlyDeltaUsd, -grew.body.monthlyDeltaUsd);
    assert.ok(shrank.body.deltaPct < 0);
  });

  it('an unchanged prompt reports zero, not a rounding artefact', async () => {
    const { body } = await post({ before: LEAN, after: LEAN, usage });

    assert.equal(body.tokenDelta, 0);
    assert.equal(body.deltaPct, 0);
    assert.equal(body.monthlyDeltaUsd, 0);
    // `-0` is arithmetically fine and renders as "-$0", a change that did not
    // happen shown with a direction.
    assert.equal(Object.is(body.monthlyDeltaUsd, -0), false, 'negative zero reached the response');
    assert.equal(Object.is(body.perCallDeltaUsd, -0), false);
  });
});

describe('what the response has to say about itself', () => {
  it('names the rules that started and stopped firing, with titles', async () => {
    const { body } = await post({ before: LEAN, after: PADDED, usage });

    assert.ok(body.rules.newlyFiring.length > 0, 'padding fired no new rule');
    for (const rule of body.rules.newlyFiring) {
      assert.equal(typeof rule.id, 'string');
      assert.ok(rule.title.length > 0, `rule ${rule.id} came back with no title`);
      // A title, not an id in disguise: ids are kebab-case, titles are prose.
      assert.notEqual(rule.title, rule.id);
    }
  });

  it('carries back which question it answered', async () => {
    // A reader who bookmarks a result should not have to remember whether the
    // switch was on, and the client must not have to infer it from its own
    // request.
    const plain = await post({ before: LEAN, after: PADDED, usage });
    const both = await post({ before: LEAN, after: PADDED, usage, optimizeBoth: true });

    assert.equal(plain.body.optimizeBoth, false);
    assert.equal(both.body.optimizeBoth, true);
    assert.equal(plain.body.level, 'safe');
  });

  it('measures less growth once both sides are trimmed', async () => {
    // The whole reason the switch exists: the padding is what the rules take, so
    // trimming both sides first shows a smaller edit than was actually made —
    // which is why it is off by default.
    const plain = await post({ before: LEAN, after: PADDED, usage });
    const both = await post({ before: LEAN, after: PADDED, usage, optimizeBoth: true });

    assert.ok(
      both.body.tokenDelta < plain.body.tokenDelta,
      `${both.body.tokenDelta} should be less than ${plain.body.tokenDelta}`,
    );
  });

  it('honours optimizeBoth only on a literal true', async () => {
    // The body is untrusted, and every boolean this API takes reads the same way.
    const { body } = await post({ before: LEAN, after: PADDED, usage, optimizeBoth: 'true' });
    assert.equal(body.optimizeBoth, false);
  });

  it('reports advisory ids the client can label', async () => {
    const { body } = await post({ before: LEAN, after: PADDED, usage });

    assert.ok(Array.isArray(body.advisories.appeared));
    assert.ok(Array.isArray(body.advisories.resolved));
    for (const id of [...body.advisories.appeared, ...body.advisories.resolved]) {
      assert.match(id, /^[a-z][a-z-]*$/, 'an advisory id is not in the form the labels are keyed by');
    }
  });
});

describe('refusals name the field, because there are two of them', () => {
  it('says which version is missing', async () => {
    const noBefore = await post({ after: PADDED });
    const noAfter = await post({ before: LEAN });

    assert.equal(noBefore.status, 400);
    assert.equal(noAfter.status, 400);
    assert.match(noBefore.body.error, /before/);
    assert.match(noAfter.body.error, /after/);
    assert.notEqual(
      noBefore.body.error,
      noAfter.body.error,
      'one message for two fields leaves the caller guessing',
    );
  });

  it('refuses whitespace as a version', async () => {
    const { status } = await post({ before: '   \n  ', after: PADDED });
    assert.equal(status, 400);
  });

  it('refuses an unknown model and an unknown rule', async () => {
    const model = await post({ before: LEAN, after: PADDED, usage: { model: 'gpt-9' } });
    const rule = await post({ before: LEAN, after: PADDED, disableRules: ['nope'] });

    assert.equal(model.status, 400);
    assert.match(model.body.error, /gpt-9/);
    assert.equal(rule.status, 400);
    assert.match(rule.body.error, /nope/);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      }),
    );
    assert.equal(response.status, 400);
  });

  it('answers in the language the caller asked in', async () => {
    const { body } = await post({ after: PADDED, locale: 'es' });
    assert.match(body.error, /Falta la versión/);
  });

  it('answers in the browser language when the body names none', async () => {
    const { body } = await post({ after: PADDED }, { 'accept-language': 'es-ES,es;q=0.9' });
    assert.match(body.error, /Falta la versión/);
  });
});
