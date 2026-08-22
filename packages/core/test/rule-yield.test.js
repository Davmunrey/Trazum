import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { RULES, ruleYield } from '@trazum/core';

/**
 * Which rules actually recover anything.
 *
 * The fixtures below are written so the answer is known before the harness
 * runs: a prompt with a repeated stanza in it, a prompt with verbose phrases,
 * a prompt with neither. A measurement harness proved only against a corpus
 * whose answer nobody knows is a harness that agrees with itself.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const IDS = RULES.map((rule) => rule.id);
const AGGRESSIVE = { level: 'aggressive' };

const yieldOf = (prompts) => ruleYield(prompts, IDS, AGGRESSIVE);
const rule = (report, id) => report.rules.find((entry) => entry.id === id);

/** A stanza repeated verbatim — what `duplicate-blocks` is for. */
const REPEATED = `You are a support assistant for an online shop.

Always answer in the customer's own language and keep the tone calm.
Never promise a refund without checking the order status first.
Escalate to a human when the customer asks for one.

Always answer in the customer's own language and keep the tone calm.
Never promise a refund without checking the order status first.
Escalate to a human when the customer asks for one.
`;

/** Phrases the dictionary shortens, and nothing else. */
const WORDY = `You are a support assistant.

In order to help the customer, please take into consideration the fact that
the order may not have shipped yet. At this point in time, due to the fact
that carriers are slow, it is important to note that delivery estimates are
approximate. In the event that the customer asks, explain this.
`;

/** Neither: short, plain, already tight. */
const TIGHT = `Answer the customer's question. Use their language. Escalate on request.\n`;

describe('ruleYield: the floor is not the rules', () => {
  it('does not credit the rules with what the optimiser does anyway', () => {
    /**
     * The first version of this module reported `wholeSaved` as the rules'
     * work. Run over a corpus the rules do not touch it said the optimiser
     * saved twenty-one tokens and every rule was redundant — a sentence
     * assembled out of somebody else's arithmetic.
     */
    const report = yieldOf([TIGHT]);
    assert.equal(report.tokensSaved, 0, 'no rule fires on a tight prompt');
    // Whatever normalisation recovers is reported as the floor, separately.
    assert.ok(report.floor >= 0);
    assert.deepEqual(report.redundantHere, []);
    assert.equal(report.inertHere.length, IDS.length);
  });

  it('names every rule as inert on a corpus that exercises none of them', () => {
    const report = yieldOf([TIGHT, TIGHT]);
    // The claim the arithmetic supports is about the corpus, and the field is
    // named for it. A rule that finds nothing in two files has not been shown
    // to find nothing anywhere.
    assert.deepEqual([...report.inertHere].sort(), [...IDS].sort());
    assert.equal(report.sumOfAlone, 0);
  });
});

describe('ruleYield: attribution', () => {
  it('attributes a repeated stanza to the rules that look for one', () => {
    const report = yieldOf([REPEATED]);
    assert.ok(report.tokensSaved > 0, 'a repeated stanza must be recoverable');
    const blocks = rule(report, 'duplicate-blocks');
    assert.ok(blocks.alone > 0, `duplicate-blocks recovered ${blocks.alone} alone`);
    assert.ok(blocks.prompts >= 1);
    // And the rules that do not look for one recover nothing on it.
    assert.equal(rule(report, 'verbose-phrases').alone, 0);
  });

  it('attributes wordy phrasing to the dictionary rule and not to the block rules', () => {
    const report = yieldOf([WORDY]);
    assert.ok(rule(report, 'verbose-phrases').alone > 0);
    assert.equal(rule(report, 'duplicate-blocks').alone, 0);
    assert.equal(rule(report, 'duplicate-lines').alone, 0);
  });

  it('keeps alone and marginal apart where two rules find the same tokens', () => {
    /**
     * `duplicate-lines` and `duplicate-blocks` both see a repeated stanza. Each
     * has a real `alone`; removing either loses little or nothing, because the
     * other still finds it. Reporting one figure would be wrong in a different
     * direction depending which — and the gap between `sumOfAlone` and
     * `tokensSaved` *is* the overlap.
     */
    const report = yieldOf([REPEATED]);
    const lines = rule(report, 'duplicate-lines');
    const blocks = rule(report, 'duplicate-blocks');
    assert.ok(lines.alone > 0 && blocks.alone > 0);
    assert.ok(
      report.sumOfAlone > report.tokensSaved,
      `overlap must show: sumOfAlone ${report.sumOfAlone} vs tokensSaved ${report.tokensSaved}`,
    );
    // Named as redundant *here*, which is a statement about this fixture.
    assert.ok(report.redundantHere.length > 0);
  });

  it('sums a mixed corpus without letting one prompt hide another', () => {
    const report = yieldOf([REPEATED, WORDY, TIGHT]);
    assert.equal(report.prompts, 3);
    assert.ok(rule(report, 'duplicate-blocks').alone > 0);
    assert.ok(rule(report, 'verbose-phrases').alone > 0);
    assert.ok(report.tokensBefore > 0);
  });

  it('never reports a negative marginal', () => {
    // Removing a rule cannot make the set save more. A rounding artefact that
    // said it did would be a finding nobody could act on.
    for (const report of [yieldOf([REPEATED]), yieldOf([WORDY]), yieldOf([TIGHT])]) {
      for (const entry of report.rules) {
        assert.ok(entry.marginal >= 0, `${entry.id} reported ${entry.marginal}`);
        assert.ok(entry.alone >= 0);
      }
    }
  });

  it('carries the counter it used, because every figure inherits its band', () => {
    assert.equal(yieldOf([WORDY]).tokenSource, 'heuristic');
  });

  it('handles an empty corpus without inventing a verdict', () => {
    const report = yieldOf([]);
    assert.equal(report.prompts, 0);
    assert.equal(report.tokensBefore, 0);
    assert.equal(report.tokensSaved, 0);
    // Everything is inert on nothing, which is true and useless — and the
    // field name says it is about the corpus, so it stays true.
    assert.equal(report.inertHere.length, IDS.length);
  });
});

describe('the prompts this repository actually ships', () => {
  /**
   * Recorded rather than asserted at a figure. The README says the
   * deterministic rules recover about one per cent, and on the two sample
   * prompts in this repository they recover **nothing at all** — every rule
   * lands in `inertHere`.
   *
   * That is not a defect in the rules and not a defect in the samples. It is
   * the reason this measurement exists: an aggregate quoted from somewhere
   * else is not a measurement of what is here, and the arc that means to raise
   * the ceiling cannot start from a number nobody can reproduce.
   */
  it('recovers nothing on examples/, and the report says so as a fact about them', () => {
    const samples = ['examples/sample-prompt.en.txt', 'examples/sample-prompt.es.txt'].map((path) =>
      readFileSync(join(repoRoot, path), 'utf8'),
    );
    const report = yieldOf(samples);
    assert.equal(report.prompts, 2);
    assert.equal(report.tokensSaved, 0);
    assert.deepEqual([...report.inertHere].sort(), [...IDS].sort());
  });
});

describe('the rule corpus: every rule has something that exercises it', () => {
  /**
   * `rules --measure` could only ever answer "inert here", because nothing in
   * this repository contained what most rules look for. Twelve fixtures, one
   * per rule, each a short prompt carrying exactly what that rule is written
   * to find — so "inert" becomes a signal instead of the only answer
   * available.
   *
   * The guard is derived from the rule catalogue, so a rule added without a
   * fixture fails the build rather than joining a list nobody notices.
   */
  const corpusDir = join(here, 'rules-corpus');
  const fixtures = () =>
    readdirSync(corpusDir)
      .filter((name) => name.endsWith('.txt'))
      .sort();

  it('has one fixture per rule, named for it, and no orphans', () => {
    const named = fixtures().map((name) => name.replace(/\.txt$/, ''));
    const missing = IDS.filter((id) => !named.includes(id));
    assert.deepEqual(missing, [], `rules with no fixture: ${missing.join(', ')}`);
    const orphans = named.filter((name) => !IDS.includes(name));
    assert.deepEqual(orphans, [], `fixtures naming no rule: ${orphans.join(', ')}`);
  });

  it('every fixture makes its own rule fire', () => {
    /**
     * "Fires" and "saves tokens" are deliberately different bars. `emphasis`
     * lowercases shouted words: same words, same count, different instruction.
     * Asserting a saving would have marked a working rule as broken.
     */
    const notFiring = [];
    for (const file of fixtures()) {
      const id = file.replace(/\.txt$/, '');
      const text = readFileSync(join(corpusDir, file), 'utf8');
      const own = rule(yieldOf([text]), id);
      if (own === undefined || own.prompts === 0) notFiring.push(id);
    }
    assert.deepEqual(
      notFiring,
      [],
      `these fixtures do not make their own rule fire: ${notFiring.join(', ')}`,
    );
  });

  it('separates a rule that never fired from one that fired and saved nothing', () => {
    /**
     * The two look identical in a saving column and mean opposite things. A
     * rule that never fires has not been exercised; one that fires and saves
     * nothing is altering somebody's prompt for no measured benefit.
     */
    const emphasis = readFileSync(join(corpusDir, 'emphasis.txt'), 'utf8');
    const report = yieldOf([emphasis]);
    assert.ok(
      report.firedWithoutSavingHere.includes('emphasis'),
      `emphasis should have fired without saving: ${JSON.stringify(report.firedWithoutSavingHere)}`,
    );
    assert.ok(!report.inertHere.includes('emphasis'), 'emphasis fired, so it is not inert');
    // And a rule that genuinely did not fire on this fixture is inert, not the other.
    assert.ok(report.inertHere.includes('self-check'));
  });

  it('measures the whole corpus with no rule left inert', () => {
    const texts = fixtures().map((file) => readFileSync(join(corpusDir, file), 'utf8'));
    const report = yieldOf(texts);
    assert.equal(report.prompts, IDS.length);
    assert.deepEqual(
      report.inertHere,
      [],
      `the corpus exists so that nothing is inert on it: ${report.inertHere.join(', ')}`,
    );
    assert.ok(report.tokensSaved > 0);
    // The overlap is real and stated, never resolved into a total.
    assert.ok(report.sumOfAlone > report.tokensSaved);
  });
});
