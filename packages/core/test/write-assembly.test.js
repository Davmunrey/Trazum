import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  CONTRACT_NAMES,
  LOCALES,
  RULE_LEVELS,
  SECTIONS,
  assemble,
  conform,
  optimize,
} from '../dist/index.js';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The assembly, and the claim the whole arc is judged on.
 *
 * A writer whose output `trazum optimize` still improves would be selling the
 * cure for a disease it had just caused, and the number proving it would be
 * printed by this tool. So the acceptance test for the templates is the
 * product's own rules engine, run over a draft the templates produced.
 */

const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/** Clean answers: whatever the rules find here, the templates put there. */
const ANSWERS = {
  role: 'A support engineer at a payments company.',
  audience: 'the agent who picks the ticket up next',
  task: 'Summarise a support ticket for the next agent.',
  inputs: 'The ticket body, its history, and the customer tier.',
  'output-shape': 'json',
  'output-schema': 'id, summary, severity, nextStep, all always present',
  constraints: 'Never invent a ticket id or a severity that is not in the input.',
  refusal: 'say so and name the field that is missing',
  examples: 'Ticket 41 came back as a two-line summary with severity low.',
  'example-inputs': 'the body of ticket 41 and its three replies',
  'failure-modes': 'It has invented severities that were never in the ticket.',
  model: 'claude-opus-5',
  budget: '20',
};

const REQUIRED_ONLY = {
  role: 'A support engineer.',
  task: 'Summarise a ticket.',
  inputs: 'The ticket body.',
  'output-shape': 'prose',
};

describe('the assembly is what it claims to be', () => {
  it('leaves nothing for the optimiser to recover, at every level', () => {
    /**
     * The levels come from `RULE_LEVELS` rather than a list written here.
     *
     * The first version of this test iterated `safe`, `balanced` and
     * `aggressive` and said "all three levels" in its own name. There are two.
     * `balanced` is not a level this product has ever had — the library took
     * any string and ran `safe`, so the sweep measured `safe` twice and called
     * it three. The zero survived the correction; the sentence did not.
     */
    assert.ok(RULE_LEVELS.length >= 2, `only ${RULE_LEVELS.length} level`);
    const draft = assemble(ANSWERS);
    assert.ok(draft.prompt, 'nothing was assembled');
    for (const level of RULE_LEVELS) {
      const report = optimize(draft.prompt, { level });
      const fired = report.rules.filter((entry) => entry.hits > 0).map((entry) => entry.id);
      assert.deepEqual(
        fired,
        [],
        `${level}: the writer's own output still fires ${fired.join(', ')}`,
      );
      assert.equal(report.tokensSaved, 0, `${level} recovered ${report.tokensSaved} tokens`);
    }
  });

  it('and the rules can fire on this kind of text, so the zero is not vacuous', () => {
    /**
     * The check above is the one that matters and the one most easily faked: a
     * rules engine that found nothing in anything would satisfy it forever.
     * The same draft with a verbose phrase pushed into a section body has to
     * come back non-zero.
     */
    const draft = assemble(ANSWERS);
    const spoiled = draft.prompt.replace(
      'Summarise a support ticket',
      'In order to summarise a support ticket',
    );
    const report = optimize(spoiled, { level: 'safe' });
    assert.ok(
      report.rules.some((entry) => entry.hits > 0),
      'no rule fires even on a planted redundancy, so the zero above proves nothing',
    );
  });

  it('produces the same bytes from the same answers, in every locale', () => {
    // The prompt is not a rendering. A heading that moved with TRAZUM_LOCALE
    // would make the assembled text a function of the machine that ran the
    // interview, which is the one thing the locale rule forbids.
    const first = assemble(ANSWERS);
    for (const locale of LOCALES) {
      process.env.TRAZUM_LOCALE = locale;
      assert.equal(assemble(ANSWERS).prompt, first.prompt, `${locale} assembled different bytes`);
    }
    delete process.env.TRAZUM_LOCALE;
    assert.deepEqual(assemble(ANSWERS), first);
  });

  it('writes the sections in the order the format states', () => {
    const draft = assemble(ANSWERS);
    const written = draft.sections.map((entry) => entry.section);
    assert.deepEqual(written, SECTIONS.filter((section) => written.includes(section)));
    // And the stable part is first: the cacheable prefix is as long as the
    // prompt allows only if the varying half sits at the end.
    assert.equal(draft.sections[0].section, 'role');
  });

  it('omits a section nobody answered rather than writing an empty one', () => {
    const draft = assemble(REQUIRED_ONLY);
    const written = draft.sections.map((entry) => entry.section);
    assert.ok(!written.includes('examples'));
    assert.ok(!written.includes('failure-modes'));
    assert.ok(!draft.prompt.includes('Examples'));
  });

  it('puts no words in the prompt for a slot that fills no section', () => {
    // `model` and `budget` change the report and never the prompt.
    const withThem = assemble({ ...REQUIRED_ONLY, model: 'claude-opus-5', budget: '20' });
    assert.equal(withThem.prompt, assemble(REQUIRED_ONLY).prompt);
    assert.ok(withThem.answered.includes('model'));
  });
});

describe('the refusal and the output are the same fact', () => {
  it('returns null and names what is missing, never an empty prompt', () => {
    const draft = assemble({});
    assert.equal(draft.prompt, null);
    assert.notEqual(draft.prompt, '');
    assert.deepEqual(draft.missing, ['task', 'role', 'inputs', 'output-shape']);
  });

  it('has an empty `missing` exactly when `prompt` is a string', () => {
    for (const answers of [{}, REQUIRED_ONLY, ANSWERS, { role: 'r' }]) {
      const draft = assemble(answers);
      assert.equal(
        draft.missing.length === 0,
        typeof draft.prompt === 'string',
        `the refusal and the output disagree for ${JSON.stringify(Object.keys(answers))}`,
      );
    }
  });

  it('keeps a decline out of `missing` and in its own list', () => {
    const draft = assemble({ ...REQUIRED_ONLY, audience: null });
    assert.deepEqual(draft.missing, []);
    assert.ok(draft.declined.includes('audience'));
    assert.ok(!draft.answered.includes('audience'));
  });
});

describe('the prompt-draft contract', () => {
  it('conforms, exactly as the library builds it', () => {
    for (const answers of [ANSWERS, REQUIRED_ONLY, {}]) {
      const report = conform(JSON.stringify(assemble(answers)), { contract: 'prompt-draft' });
      assert.deepEqual(report.problems, [], JSON.stringify(report.problems));
    }
  });

  it('refuses a draft whose prompt came back as an empty string', () => {
    // The specific defect the contract exists to stop: `''` reads as a prompt
    // that came out blank, and this format never spells absence that way.
    const draft = { ...assemble(ANSWERS), prompt: 0 };
    const report = conform(JSON.stringify(draft), { contract: 'prompt-draft' });
    assert.ok(report.problems.some((problem) => problem.at === 'prompt'));
  });

  it('is named by --contract and documented, both ways', async () => {
    assert.ok(CONTRACT_NAMES.includes('prompt-draft'));
    const page = await readFile(DOC, 'utf8');
    const scope = sectionOf(page, '## The prompt-draft document');
    const documented = new Set([...scope.matchAll(/^\| `([A-Za-z]+)` \|/gm)].map((m) => m[1]));
    const emitted = Object.keys(assemble(ANSWERS));
    assert.deepEqual(
      emitted.filter((key) => !documented.has(key)),
      [],
      'fields emitted with no line under ## The prompt-draft document',
    );
    assert.deepEqual(
      [...documented].filter((key) => !emitted.includes(key)),
      [],
      'fields promised by the page and not emitted',
    );
  });
});

describe('the three claims are measured, not asserted', () => {
  it('refuses a level this product does not have, rather than running safe in silence', () => {
    /**
     * Found by running: `optimize` skipped aggressive rules unless the level
     * *was* `aggressive`, so every other string produced safe-level results
     * and said nothing. The CLI has always refused `--level balanced` by name;
     * a library caller got the quiet downgrade instead.
     */
    assert.throws(() => optimize('anything', { level: 'balanced' }), /safe, aggressive/);
    assert.throws(() => optimize('anything', { level: 'Safe' }), /received/);
    // And it still accepts the ones that exist, so the guard is not a wall.
    for (const level of RULE_LEVELS) assert.ok(optimize('anything', { level }));
  });

  it('measures nothing when there is no prompt, rather than measuring zeros', () => {
    // A draft that was never assembled has not been measured as costing
    // nothing. Null, not an object of zeros.
    assert.equal(assemble({}).measured, null);
    assert.notEqual(assemble(ANSWERS).measured, null);
  });

  it('keeps the estimate inside an object that says it is one', () => {
    const { cheap } = assemble(ANSWERS, { callsPerMonth: 1000, avgOutputTokens: 300 }).measured;
    assert.equal(cheap.provenance, 'estimated');
    assert.ok(cheap.tokens > 0);
    assert.equal(typeof cheap.tokenSource, 'string');
  });

  it('answers the budget three ways, and never bare', () => {
    const priced = { ...ANSWERS, model: 'claude-opus-5' };
    const within = assemble({ ...priced, budget: '1000' }, { callsPerMonth: 1000 }).measured.cheap;
    assert.equal(within.verdict, 'within');
    assert.equal(within.reason, null);

    const over = assemble({ ...priced, budget: '0.01' }, { callsPerMonth: 1000 }).measured.cheap;
    assert.equal(over.verdict, 'over');
    assert.equal(over.reason, null);

    // Three, never two — and each refusal names which of the three it is.
    const noBudget = assemble({ ...priced, budget: null }).measured.cheap;
    assert.equal(noBudget.verdict, 'cannot-tell');
    assert.equal(noBudget.reason, 'no-budget');

    const noModel = assemble({ ...ANSWERS, model: null, budget: '20' }).measured.cheap;
    assert.equal(noModel.verdict, 'cannot-tell');
    assert.equal(noModel.reason, 'no-model');

    const unpriced = assemble({ ...ANSWERS, model: 'no-such-model', budget: '20' }).measured.cheap;
    assert.equal(unpriced.verdict, 'cannot-tell');
    assert.equal(unpriced.reason, 'model-unpriced');
    assert.equal(unpriced.monthlyUsd, null, 'an unpriced model costs null, never 0');
  });

  it('counts the checklist without scoring it', () => {
    const { complete } = assemble({ ...REQUIRED_ONLY, audience: null }).measured;
    assert.equal(complete.required, 4);
    assert.deepEqual(complete.missing, []);
    assert.deepEqual(complete.declined, ['audience']);
    // No score, no percentage, no grade: the gaps are named instead.
    assert.deepEqual(Object.keys(complete).sort(), ['answered', 'declined', 'missing', 'required']);
  });

  it('reports the rules it still finds, and finds none in its own output', () => {
    const { clean } = assemble(ANSWERS).measured;
    assert.deepEqual(clean.rules, []);
    assert.equal(clean.tokensRecoverable, 0);
  });

  it('and reports them when they are there, so the empty list is not the only answer it gives', () => {
    const spoiled = assemble({ ...ANSWERS, task: 'In order to summarise a ticket.' }).measured;
    assert.ok(spoiled.clean.rules.length > 0, 'a planted redundancy in an answer is not reported');
    assert.ok(spoiled.clean.tokensRecoverable > 0);
  });
});
