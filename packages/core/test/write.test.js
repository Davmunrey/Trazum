import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { sectionOf } from '../../../test-utils/section.mjs';
import { OUTPUT_FORMATS, SECTIONS, SLOTS, SLOT_IDS, interview, isOpen, slot } from '../dist/index.js';

/**
 * The interview behind `trazum write`, held to the three rules it states.
 *
 * The catalogue is the product here: a question whose answer cannot change the
 * output is waste, and this tool charges people to find exactly that in their
 * prompts. So the rules are not comments — each one is run.
 */

const DOC = new URL('../../../docs/prompt-writer.md', import.meta.url).pathname;

/** Every required slot answered, with a prose output so nothing else opens. */
const REQUIRED = {
  task: 'Summarise a support ticket',
  role: 'A support engineer',
  inputs: 'The ticket body and its history',
  'output-shape': 'prose',
};

describe('the slot catalogue', () => {
  it('has slots, so nothing below can pass on an empty catalogue', () => {
    assert.ok(SLOTS.length >= 10, `only ${SLOTS.length} slots`);
    assert.equal(new Set(SLOT_IDS).size, SLOT_IDS.length, 'a slot id appears twice');
  });

  it('names a section that exists, or none at all', () => {
    for (const entry of SLOTS) {
      if (entry.section === null) continue;
      assert.ok(SECTIONS.includes(entry.section), `${entry.id} fills no section that exists`);
    }
  });

  it('puts every required slot before every optional one', () => {
    // Somebody who abandons the interview halfway should have answered the
    // things without which there is no prompt at all.
    const firstOptional = SLOTS.findIndex((entry) => !entry.required);
    const lastRequired = SLOTS.map((entry) => entry.required).lastIndexOf(true);
    assert.ok(lastRequired < firstOptional, 'a required slot is asked after an optional one');
  });
});

describe('rule 1 — a question is only asked when its answer can change the output', () => {
  it('opens and closes every gate, so no gate is decoration', () => {
    /**
     * A gate that is always true is a slot that should not have one; a gate
     * that is never true is a question nobody can be asked. Both are the same
     * defect this repository keeps finding — a check that cannot fire — so each
     * gate is handed an answer set that opens it and one that does not.
     */
    const gated = SLOTS.filter((entry) => entry.opensWhen !== undefined);
    assert.ok(gated.length > 0, 'no slot is gated, so this proves nothing');

    const worlds = [
      {},
      { ...REQUIRED },
      { ...REQUIRED, 'output-shape': 'json' },
      { ...REQUIRED, 'output-shape': 'table' },
      { ...REQUIRED, 'output-shape': 'list' },
      { ...REQUIRED, examples: 'Ticket 41 was summarised as ...' },
      { ...REQUIRED, examples: null },
    ];
    for (const entry of gated) {
      const opened = worlds.filter((answers) => isOpen(entry, answers));
      assert.ok(opened.length > 0, `${entry.id} is never open, so nobody can ever be asked it`);
      assert.ok(
        opened.length < worlds.length,
        `${entry.id} is open in every world, so its gate does nothing`,
      );
    }
  });

  it('does not ask for a schema when the answer is prose, and does when it is json', () => {
    assert.ok(!interview(REQUIRED).open.includes('output-schema'));
    assert.ok(interview({ ...REQUIRED, 'output-shape': 'json' }).open.includes('output-schema'));
  });

  it('treats a declined example as no reason to ask what produced it', () => {
    // The decline is an answer, and it closes the follow-up rather than
    // leaving it open the way an unasked question would.
    assert.ok(!interview({ ...REQUIRED, examples: null }).open.includes('example-inputs'));
    assert.ok(interview({ ...REQUIRED, examples: 'one' }).open.includes('example-inputs'));
  });
});

describe('rule 2 — the interview stops', () => {
  it('says it is done when every open slot has an answer or a decline', () => {
    let answers = { ...REQUIRED };
    // Decline everything else, which is an answer.
    for (let step = 0; step < SLOTS.length + 2; step += 1) {
      const state = interview(answers);
      if (state.done) break;
      assert.ok(state.next, 'not done and nothing to ask next');
      answers = { ...answers, [state.next]: null };
    }
    const state = interview(answers);
    assert.equal(state.done, true, `still asking ${state.next}`);
    assert.equal(state.next, null);
  });

  it('is not done while anything open is unasked', () => {
    // The opposite direction: `done` that is true on an empty interview would
    // be a stop rule that stops before it starts.
    assert.equal(interview({}).done, false);
    assert.equal(interview(REQUIRED).done, false);
  });
});

describe('rule 3 — a refusal never arrives bare', () => {
  it('names every required slot that is still unanswered', () => {
    const state = interview({});
    assert.deepEqual(state.missing, ['task', 'role', 'inputs', 'output-shape']);
  });

  it('adds a required slot that only a previous answer opened', () => {
    // `output-schema` is required *and* gated: it cannot be missing until the
    // answer that opens it arrives, and it must be missing the moment it does.
    assert.ok(!interview(REQUIRED).missing.includes('output-schema'));
    assert.deepEqual(interview({ ...REQUIRED, 'output-shape': 'json' }).missing, ['output-schema']);
  });

  it('is empty once the required slots are answered', () => {
    assert.deepEqual(interview(REQUIRED).missing, []);
  });

  it('does not count a declined optional slot as missing', () => {
    assert.deepEqual(interview({ ...REQUIRED, audience: null }).missing, []);
  });
});

describe('answered, declined and unanswered are three states', () => {
  it('keeps a decline apart from never having been asked', () => {
    const state = interview({ ...REQUIRED, audience: null });
    assert.ok(state.declined.includes('audience'));
    assert.ok(!state.answered.includes('audience'));
    assert.ok(!state.open.includes('nonexistent'));
    // And an unasked slot is in neither list, which is the third state.
    assert.ok(!state.declined.includes('constraints'));
    assert.ok(!state.answered.includes('constraints'));
    assert.ok(state.open.includes('constraints'));
  });
});

describe('the catalogue is documented and asked in both locales', () => {
  it('has a row in docs/prompt-writer.md for every slot, and no row for one that is gone', async () => {
    /**
     * Bounded to `## The slots`, and it has to be.
     *
     * The first version read every backticked first cell on the page. That was
     * correct until the page gained a second table — the three claims, whose
     * rows are `complete`, `cheap` and `clean` — and the harvest reported three
     * slots that do not exist. **[Bound an assertion by its subject, never by
     * its neighbour](../../../docs/doctrine.md#bound-an-assertion-by-its-subject-never-by-its-neighbour)**,
     * which this repository has a helper for and this test was not using.
     */
    const page = sectionOf(await readFile(DOC, 'utf8'), '## The slots');
    const rows = [...page.matchAll(/^\| `([a-z-]+)` \|/gm)].map((match) => match[1]);
    assert.ok(rows.length > 5, `only ${rows.length} slot rows parsed — has the table moved?`);
    assert.deepEqual(
      SLOT_IDS.filter((id) => !rows.includes(id)),
      [],
      'a slot the code has and the page does not',
    );
    assert.deepEqual(
      rows.filter((id) => !SLOT_IDS.includes(id)),
      [],
      'the page documents a slot that does not exist',
    );
  });

  it('offers only output formats the catalogue accepts', () => {
    assert.deepEqual([...OUTPUT_FORMATS], ['prose', 'json', 'list', 'table']);
  });

  it('finds a slot by id and nothing by a name that is not one', () => {
    assert.equal(slot('task')?.required, true);
    assert.equal(slot('no-such-slot'), undefined);
  });
});
