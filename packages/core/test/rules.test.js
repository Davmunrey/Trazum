import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { RULES, optimize } from '@trazum/core';

/**
 * The rule catalogue's order, and what it decides.
 *
 * A repeated stanza is a repeated *block* and also a set of repeated *lines*,
 * so three of the deletion rules can each find it and whichever runs first
 * takes it. The order is what picks which — and until `rules --measure` made
 * the overlap visible, the only reason written down for that order was that
 * removing blocks early leaves less text for the rest to walk.
 *
 * The consequence nobody had stated is the one users actually meet: the same
 * saving is reported either as **one repeated paragraph** or as **three
 * repeated lines**, and the first is a sentence somebody can act on.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPEATED = readFileSync(join(here, 'rules-corpus', 'duplicate-blocks.txt'), 'utf8');
const AGGRESSIVE = { level: 'aggressive' };

/** The deletion rules, coarsest first, as the catalogue is meant to hold them. */
const DELETION_ORDER = ['duplicate-blocks', 'near-duplicate-blocks', 'duplicate-lines'];

describe('the deletion rules run coarsest first', () => {
  it('keeps them in that order, and adjacent', () => {
    const ids = RULES.map((rule) => rule.id);
    const positions = DELETION_ORDER.map((id) => ids.indexOf(id));
    assert.ok(
      positions.every((position) => position >= 0),
      `a deletion rule is missing from the catalogue: ${JSON.stringify(positions)}`,
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
      `the deletion rules are out of coarsest-first order: ${ids.join(' > ')}`,
    );
    // Adjacent, so a phrase rule cannot land between them and see text a
    // block deletion was about to remove.
    assert.deepEqual(
      ids.slice(positions[0], positions[0] + DELETION_ORDER.length),
      DELETION_ORDER,
      `something was inserted between the deletion rules: ${ids.join(' > ')}`,
    );
  });

  it('credits a repeated stanza to exactly one rule', () => {
    const result = optimize(REPEATED, AGGRESSIVE);
    const fired = result.rules.filter((rule) => rule.hits > 0);
    assert.equal(
      fired.length,
      1,
      `a repeated stanza should be one finding, not ${fired.length}: ${fired.map((r) => r.id).join(', ')}`,
    );
    assert.equal(fired[0].id, 'duplicate-blocks');
    assert.equal(fired[0].hits, 1);
    assert.ok(fired[0].tokensSaved > 0);
  });

  it('and the other two would each have caught it alone, for the same saving', () => {
    /**
     * This is why the leave-one-out measurement reports all three as
     * redundant, and why that is not a claim that the applied run
     * double-counts. Same tokens, same total, three different sentences.
     */
    const whole = optimize(REPEATED, AGGRESSIVE);
    const withoutBlocks = optimize(REPEATED, { ...AGGRESSIVE, disableRules: ['duplicate-blocks'] });
    const linesOnly = optimize(REPEATED, {
      ...AGGRESSIVE,
      disableRules: ['duplicate-blocks', 'near-duplicate-blocks'],
    });

    assert.equal(withoutBlocks.tokensSaved, whole.tokensSaved);
    assert.equal(linesOnly.tokensSaved, whole.tokensSaved);

    // The saving is identical; the description is not, which is the whole
    // reason the order matters.
    assert.equal(withoutBlocks.rules.filter((r) => r.hits > 0)[0].id, 'near-duplicate-blocks');
    const lines = linesOnly.rules.filter((r) => r.hits > 0)[0];
    assert.equal(lines.id, 'duplicate-lines');
    assert.ok(lines.hits > 1, 'the line rule describes the same removal as several findings');
  });

  it('would notice a reorder that changed the attribution', () => {
    // The guards above only ever see the catalogue as it stands, so they
    // cannot fail on this repository. Handed the reordered list directly,
    // the ordering check must reject it.
    const reordered = ['duplicate-lines', 'duplicate-blocks', 'near-duplicate-blocks'];
    const positions = DELETION_ORDER.map((id) => reordered.indexOf(id));
    assert.notDeepEqual([...positions].sort((a, b) => a - b), positions);
  });
});
