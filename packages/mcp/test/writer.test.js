import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SLOTS, SLOT_IDS } from '@trazum/core';
import { TOOLS } from '../dist/tools.js';
import { SLOT_QUESTIONS } from '../dist/questions.js';

/**
 * `prompt_writer` — the interview, for something that is not a person.
 *
 * An agent asked to "write a prompt for X" has the same problem a person has:
 * it does not know what it has not been told. What this holds is that the tool
 * hands over the questions rather than the answers, stays stateless, and says
 * nothing about the prompt it cannot measure.
 */

const WRITER = TOOLS.find((tool) => tool.name === 'prompt_writer');

const run = (args) => JSON.parse(WRITER.run(args));

const REQUIRED = {
  task: 'Summarise a support ticket.',
  role: 'A support engineer.',
  inputs: 'The ticket body and its history.',
  'output-shape': 'prose',
};

describe('prompt_writer', () => {
  it('is registered, once', () => {
    assert.ok(WRITER, 'the tool is not in TOOLS');
    assert.equal(TOOLS.filter((tool) => tool.name === 'prompt_writer').length, 1);
  });

  it('asks the first question when handed nothing', () => {
    const out = run({ answers: {} });
    assert.equal(out.draft.prompt, null);
    assert.equal(out.next.id, 'task');
    assert.equal(out.next.required, true);
    // The wording travels with the id: an agent handed a bare id would either
    // invent the question or skip it.
    assert.ok(out.next.question.length > 0);
    assert.deepEqual(out.draft.missing, ['task', 'role', 'inputs', 'output-shape']);
  });

  it('assembles once the required answers are in, and keeps asking', () => {
    const out = run({ answers: REQUIRED, callsPerMonth: 1000 });
    assert.ok(out.draft.prompt.startsWith('Role\n'));
    assert.deepEqual(out.draft.missing, []);
    // `next` is not derivable from `missing`: that holds only the required
    // questions, and the interview carries on through the optional ones.
    assert.equal(out.done, false);
    assert.ok(out.next.id);
    assert.equal(out.next.required, false);
  });

  it('leaves nothing for the optimiser in what it wrote', () => {
    const out = run({ answers: REQUIRED });
    assert.deepEqual(out.draft.measured.clean.rules, []);
    assert.equal(out.draft.measured.clean.tokensRecoverable, 0);
  });

  it('keeps the estimate marked as one', () => {
    const out = run({ answers: { ...REQUIRED, model: 'claude-opus-5', budget: '20' }, callsPerMonth: 1000 });
    assert.equal(out.draft.measured.cheap.provenance, 'estimated');
    assert.equal(out.draft.measured.cheap.verdict, 'within');
  });

  it('is stateless: the same answers give the same answer, every time', () => {
    // A server that remembered would be a server that knows what somebody is
    // halfway through writing.
    const first = WRITER.run({ answers: REQUIRED });
    const second = WRITER.run({ answers: REQUIRED });
    assert.equal(first, second);
    // And an earlier call leaves no trace in a later one.
    run({ answers: { ...REQUIRED, audience: 'an engineer' } });
    assert.equal(WRITER.run({ answers: REQUIRED }), first);
  });

  it('treats a decline as an answer and never as a gap', () => {
    const out = run({ answers: { ...REQUIRED, audience: null } });
    assert.deepEqual(out.draft.missing, []);
    assert.ok(out.draft.declined.includes('audience'));
    assert.ok(!out.draft.prompt.includes('Audience:'));
  });

  it('refuses a question nobody asks, and names the nearest', () => {
    assert.throws(() => WRITER.run({ answers: { rol: 'x' } }), /Did you mean "role"/);
    assert.throws(() => WRITER.run({ answers: { nonsense: 'x' } }), /not one of the questions/);
  });

  it('refuses an answer that is not text, and one that is a corpus', () => {
    assert.throws(() => WRITER.run({ answers: { task: 42 } }), /must be text/);
    assert.throws(() => WRITER.run({ answers: { task: 'x'.repeat(20_001) } }), /over 20000/);
    assert.doesNotThrow(() => WRITER.run({ answers: { ...REQUIRED, task: 'x'.repeat(19_999) } }));
  });

  it('refuses answers that are not an object at all', () => {
    for (const answers of [null, 'task', ['task'], 7, undefined]) {
      assert.throws(() => WRITER.run({ answers }), /must be an object/, JSON.stringify(answers));
    }
  });

  it('writes no property a caller named, over the wire', () => {
    /**
     * In a JS object literal `__proto__` sets the prototype rather than a key,
     * so a test written that way proves nothing. Over MCP the arguments arrive
     * as JSON, where it is an ordinary own property — which is the case that
     * has to be refused, and the shape CodeQL named on the HTTP route.
     */
    const overTheWire = JSON.parse('{"__proto__": "x", "task": "t"}');
    assert.ok(Object.keys(overTheWire).includes('__proto__'));
    assert.throws(() => WRITER.run({ answers: overTheWire }), /not one of the questions/);
    assert.equal({}.polluted, undefined);
  });
});

describe('every question has wording, and nothing has wording that is not a question', () => {
  it('covers the catalogue in both directions', () => {
    assert.ok(SLOT_IDS.length >= 10, `only ${SLOT_IDS.length} questions`);
    for (const id of SLOT_IDS) {
      assert.ok(SLOT_QUESTIONS[id], `no wording for ${id}`);
      assert.ok(SLOT_QUESTIONS[id].trim().length > 0, `${id}'s wording is blank`);
    }
    assert.deepEqual(
      Object.keys(SLOT_QUESTIONS).filter((id) => !SLOT_IDS.includes(id)),
      [],
      'wording for a question that does not exist',
    );
  });

  it('says of a slot that fills no section that it changes the estimate, not the prompt', () => {
    // `model` and `budget` put no words in the prompt. An agent told only "which
    // model is this for?" would reasonably expect the answer to appear in it.
    for (const entry of SLOTS.filter((slot) => slot.section === null)) {
      assert.match(SLOT_QUESTIONS[entry.id], /never the prompt/, entry.id);
    }
  });
});
