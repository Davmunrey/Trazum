import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { RULES, verdictFor } from '../dist/index.js';

/**
 * `safe` was a promise. This is the half that holds it to something.
 *
 * `docs/authoring-rules.md` states the strongest claim this product makes:
 * **"`safe` means 'this cannot change what the prompt asks for'. Not 'unlikely
 * to', not 'I could not think of a case'. It is the level people run unattended
 * in CI, so a false positive there is a silently altered prompt in
 * production."** Every other load-bearing number here is measured. That one was
 * held by the judgement of whoever wrote each rule and by nothing else.
 *
 * `scripts/measure-rule-safety.mjs` applies each rule alone to the corpus
 * sample written for it, answers both prompts several times against a real
 * model, and asks that model whether the two sets of answers would satisfy the
 * same reader — with the noise floor measured in the same run, because a model
 * asked one question twice does not answer it twice the same way. This file is
 * the judgement over that evidence, and it runs offline like everything else.
 *
 * ## What it will not do
 *
 * Fail an `aggressive` rule for diverging. That level exists for changes that
 * *may* alter tone or emphasis, the document says so, and a guard that treated
 * a divergence there as a defect would push every useful rule down to `safe`,
 * which is the opposite of the point.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const RECORD = join(ROOT, 'packages/core/test/fixtures/rule-safety.json');

const record = () => JSON.parse(readFileSync(RECORD, 'utf8'));

/**
 * The margin `verdictFor` calls a real difference, and the reason the sample
 * count is not a matter of taste.
 */
const MARGIN = 0.05;

describe('a rule called safe was measured being safe', () => {
  it('has a record naming what produced it', () => {
    const found = record();
    assert.match(found.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(found.model, 'the record does not say which model judged this');
    assert.ok(found.samples >= 2, 'the record does not say how many samples it rests on');
    assert.ok(
      found.measured.length + found.unmeasured.length > 0,
      'an empty record would pass every check below',
    );
  });

  it('accounts for every rule, as measured or as not', () => {
    // The failure this exists to stop is a rule added later and never measured,
    // sitting green because it is absent from a file nobody re-reads.
    const found = record();
    const seen = new Set([
      ...found.measured.map((entry) => entry.id),
      ...found.unmeasured.map((entry) => entry.id),
    ]);
    const missing = RULES.map((rule) => rule.id).filter((id) => !seen.has(id));
    assert.deepEqual(missing, [], 're-run scripts/measure-rule-safety.mjs: a rule is in neither list');
  });

  it('rests on enough samples to resolve its own margin', () => {
    /**
     * Not a style preference. The cross figure is a share of `n * n` judged
     * pairs, so one flipped judgement moves it by `1 / n²`; if that step is
     * larger than the 0.05 margin, a single dissenting vote reads as a
     * divergence and the measurement has no resolution at all.
     *
     * That is not hypothetical. The first run used three samples, and two rules
     * came back `diverges` on 8 of 9 cross pairs — one vote.
     */
    const { samples } = record();
    assert.ok(
      1 / (samples * samples) < MARGIN,
      `${samples} samples give a step of ${(1 / (samples * samples)).toFixed(3)}, `
        + `which is coarser than the ${MARGIN} margin the verdict uses`,
    );
  });

  it('records only verdicts its own numbers support', () => {
    /**
     * What stops this fixture from being a wish. Every verdict is recomputed
     * from the two figures beside it with the same function the product uses,
     * so a hand-edited `diverges` turned into `within-noise` fails here rather
     * than quietly becoming the record.
     */
    for (const entry of record().measured) {
      if (entry.judgedSelfAgreement === null || entry.judgedCrossAgreement === null) {
        assert.equal(entry.verdict, 'inconclusive', `${entry.id} has no figures and a verdict`);
        continue;
      }
      assert.equal(
        entry.verdict,
        verdictFor(entry.judgedSelfAgreement, entry.judgedCrossAgreement),
        `${entry.id} records a verdict its own agreement figures do not produce`,
      );
    }
  });

  it('has no safe rule that changed the answer', () => {
    /**
     * The whole point. A `safe` rule that diverges from the original beyond the
     * model's own noise is a rule running unattended in somebody's CI and
     * quietly altering what their prompt asks for.
     *
     * `inconclusive` is deliberately not a failure here: it means the model
     * disagreed with itself too much for this corpus sample to decide anything,
     * which is a fact about the sample. It is reported by the check below
     * rather than counted as a pass.
     */
    const diverged = record()
      .measured.filter((entry) => entry.level === 'safe' && entry.verdict === 'diverges')
      .map((entry) => `${entry.id} (self ${entry.judgedSelfAgreement}, cross ${entry.judgedCrossAgreement})`);
    assert.deepEqual(diverged, [], 'a rule marked safe changed what the prompt asks for');
  });

  it('says which rules it could not judge, rather than counting silence', () => {
    /**
     * Three outcomes, never two. A rule with no sample, no case, or a sample
     * that does not make it fire is a rule nobody has evidence about, and a
     * record that listed only the measured would read as a clean bill across a
     * corpus it had covered part of.
     */
    const found = record();
    for (const entry of found.unmeasured) {
      assert.ok(entry.because && entry.because.length > 5, `${entry.id} is unmeasured for no reason`);
    }
    const undecided = found.measured.filter((entry) => entry.verdict === 'inconclusive');
    // Reported, and bounded: if most of the corpus stops being decidable the
    // measurement has become decoration and this should say so out loud.
    assert.ok(
      undecided.length <= Math.floor(found.measured.length / 2),
      `${undecided.length} of ${found.measured.length} rules could not be judged: `
        + `${undecided.map((entry) => entry.id).join(', ')}`,
    );
  });

  it('agrees with the levels the code actually declares', () => {
    // A rule moved from aggressive to safe without being re-measured would
    // otherwise inherit a verdict that was never applied to it at that level.
    const levels = new Map(RULES.map((rule) => [rule.id, rule.level]));
    for (const entry of record().measured) {
      assert.equal(
        entry.level,
        levels.get(entry.id),
        `${entry.id} was measured as ${entry.level} and the code now calls it ${levels.get(entry.id)}`,
      );
    }
  });
});
