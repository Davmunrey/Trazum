import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * `POST /api/write`, called for real.
 *
 * The interview on the surface that has a network by definition. What this
 * holds is that having one changes nothing: no model is called, the same
 * answers come back as the same bytes, and the route is stateless — the
 * browser holds the answers and sends all of them every time, because a
 * session would mean this endpoint knowing what somebody is halfway through
 * writing.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
let POST;

const post = (body, headers = {}) =>
  POST(
    new Request(`${ORIGIN}/api/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

const REQUIRED = {
  role: 'A support engineer.',
  task: 'Summarise a ticket.',
  inputs: 'The ticket body.',
  'output-shape': 'prose',
};

before(async () => {
  ({ POST } = await import('../app/api/write/route.ts'));
});

describe('POST /api/write', () => {
  it('asks the first question when it has been told nothing', async () => {
    const body = await (await post({ answers: {} })).json();
    assert.equal(body.draft.prompt, null, 'a prompt was assembled from no answers');
    assert.equal(body.done, false);
    assert.equal(body.next, 'task');
    assert.deepEqual(body.draft.missing, ['task', 'role', 'inputs', 'output-shape']);
  });

  it('assembles once the required answers are in, and measures it', async () => {
    const body = await (await post({ answers: REQUIRED, callsPerMonth: 1000 })).json();
    assert.ok(body.draft.prompt.startsWith('Role\n'));
    assert.deepEqual(body.draft.missing, []);
    assert.equal(body.draft.measured.cheap.provenance, 'estimated');
    assert.deepEqual(body.draft.measured.clean.rules, [], 'the writer left work for the optimiser');
  });

  it('carries on asking after the required answers, and says so separately', async () => {
    /**
     * `next` is not derivable from `draft.missing`, and treating it as if it
     * were is how a form starts skipping questions: `missing` holds only the
     * **required** slots, and the interview carries on through the optional
     * ones. Two lists that look alike and mean different things.
     */
    const body = await (await post({ answers: REQUIRED })).json();
    assert.deepEqual(body.draft.missing, []);
    assert.equal(body.done, false, 'the interview stopped at the required half');
    assert.ok(typeof body.next === 'string');
    assert.ok(!body.draft.missing.includes(body.next));
  });

  it('opens a follow-up only when the answer that opens it arrives', async () => {
    const prose = await (await post({ answers: REQUIRED })).json();
    assert.ok(!prose.open.includes('output-schema'));
    const json = await (await post({ answers: { ...REQUIRED, 'output-shape': 'json' } })).json();
    assert.ok(json.open.includes('output-schema'));
    assert.deepEqual(json.draft.missing, ['output-schema'], 'a gated required slot went unnoticed');
  });

  it('refuses a question nobody asks rather than assembling without it', async () => {
    // Ignoring it would hand back a draft with no way to tell an unknown slot
    // from an answer the assembly had no use for.
    const response = await post({ answers: { ...REQUIRED, 'not-a-slot': 'x' } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not-a-slot/);
  });

  it('refuses an answer that is not text, and one that is a pasted corpus', async () => {
    const wrongType = await post({ answers: { task: 42 } });
    assert.equal(wrongType.status, 400);
    const huge = await post({ answers: { task: 'x'.repeat(20_001) } });
    assert.equal(huge.status, 400);
    // And accepts one just inside the cap, so the limit is a limit and not a ban.
    const fine = await post({ answers: { ...REQUIRED, task: 'x'.repeat(19_999) } });
    assert.equal(fine.status, 200);
  });

  it('refuses answers that are not an object at all', async () => {
    for (const answers of [null, 'task', ['task'], 7]) {
      assert.equal((await post({ answers })).status, 400, JSON.stringify(answers));
    }
  });

  it('takes a decline and never calls it missing', async () => {
    const body = await (await post({ answers: { ...REQUIRED, audience: null } })).json();
    assert.deepEqual(body.draft.missing, []);
    assert.ok(body.draft.declined.includes('audience'));
    assert.ok(!body.draft.prompt.includes('Audience:'));
  });

  it('assembles the same bytes whatever locale asked', async () => {
    const en = await (await post({ answers: REQUIRED, locale: 'en' })).json();
    const es = await (await post({ answers: REQUIRED, locale: 'es' })).json();
    assert.equal(en.draft.prompt, es.draft.prompt, 'a locale changed the prompt');
  });

  it('answers an unpriced model with a verdict rather than an error', async () => {
    // An unpriced model is one of the three answers this format gives. A 400
    // would turn a measurement into a failure the caller has to handle.
    const response = await post({ answers: { ...REQUIRED, model: 'no-such-model', budget: '20' } });
    assert.equal(response.status, 200);
    const { draft } = await response.json();
    assert.equal(draft.measured.cheap.verdict, 'cannot-tell');
    assert.equal(draft.measured.cheap.reason, 'model-unpriced');
    assert.equal(draft.measured.cheap.monthlyUsd, null);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await POST(
      new Request(`${ORIGIN}/api/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    assert.equal(response.status, 400);
  });
});
